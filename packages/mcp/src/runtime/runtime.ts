import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  LATEST_PROJECT_VERSION,
  getOrCreateTrack,
  insertKeyframe,
  migrateProjectDataToLatest,
  moveKeyframes,
  normalizeClip,
  removeKeyframes,
  type Clip,
  type Interpolation,
  type KeyframeRef,
  type TrackProperty,
  validateProjectDataDetailed,
} from "@motionforge/engine";
import { strToU8, zipSync } from "fflate";
import { createRuntimeEventLog, type RuntimeEvent } from "./events.js";
import { RuntimeError } from "./errors.js";

const TRACK_PROPERTIES: readonly TrackProperty[] = [
  "position.x",
  "position.y",
  "position.z",
  "rotation.x",
  "rotation.y",
  "rotation.z",
  "scale.x",
  "scale.y",
  "scale.z",
] as const;

const INTERPOLATIONS = new Set<Interpolation>(["linear", "step", "easeIn", "easeOut", "easeInOut"]);

const DEFAULT_MAX_IMPORT_JSON_BYTES = 25 * 1024 * 1024;

export interface RuntimeObject {
  id: string;
  name: string;
  bindPath?: string;
  geometryType: "box" | "sphere" | "cone";
  color: number;
  metallic?: number;
  roughness?: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface RuntimeAsset {
  id: string;
  name: string;
  type: "gltf";
  source: { mode: "embedded"; data: string; fileName: string } | { mode: "external"; path: string };
  size: number;
}

export interface RuntimeModelInstance {
  id: string;
  name: string;
  bindPath?: string;
  assetId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  materialOverrides?: Array<{
    nodePath: string;
    color: number;
    metallic: number;
    roughness: number;
  }>;
}

export interface RuntimeProjectData {
  version: number;
  objects: RuntimeObject[];
  assets?: RuntimeAsset[];
  modelInstances?: RuntimeModelInstance[];
  camera?: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  };
  animation?: Clip;
}

interface RuntimeState {
  data: RuntimeProjectData;
  selectedObjectId: string | null;
  dirty: boolean;
  hierarchy: Record<string, string | null>;
}

interface CommandContext {
  state: RuntimeState;
  emit: (type: RuntimeEvent["type"], payload: Record<string, unknown>) => RuntimeEvent;
}

interface CommandEnableResult {
  ok: boolean;
  code?: string;
  message?: string;
}

export interface RuntimeCommandResult {
  result: Record<string, unknown> | null;
  events: RuntimeEvent[];
}

type CommandHandler = (ctx: CommandContext, input: unknown) => RuntimeCommandResult;

interface RuntimeCommand {
  id: string;
  isEnabled?: (ctx: CommandContext, input: unknown) => CommandEnableResult;
  run: CommandHandler;
}

interface UndoEntry {
  label: string;
  before: RuntimeState;
  after: RuntimeState;
}

export interface LoadProjectOptions {
  staged?: boolean;
}

export interface LoadProjectResult {
  projectId: string;
  summary: {
    version: number;
    objects: number;
    assets: number;
    tracks: number;
    keyframes: number;
    durationSeconds: number;
    payloadBytes: number;
  };
}

export interface RuntimeSnapshot {
  scene: {
    selectedObjectId: string | null;
    objects: Array<{
      id: string;
      name: string;
      geometryType: string;
      parentId?: string | null;
    }>;
    modelInstances: Array<{
      id: string;
      name: string;
      assetId: string;
      parentId?: string | null;
    }>;
  };
  selection: {
    objectId: string | null;
  };
  assets: {
    count: number;
    items: Array<{
      id: string;
      name: string;
      type: string;
      sourceMode: string;
      size: number;
    }>;
  };
  animation: {
    durationSeconds: number;
    trackCount: number;
    keyframeCount: number;
    takesCount: number;
  };
  dirty: boolean;
  version: number;
}

export interface RuntimeExecuteResult {
  result: Record<string, unknown> | null;
  events: RuntimeEvent[];
}

export interface RuntimeExportResult {
  ok: boolean;
  path: string;
  bytes: number;
  warnings: string[];
  mode?: "video" | "fallback";
  error?: {
    code: string;
    message: string;
  };
}

export interface RuntimeUnityPackageOptions {
  scale?: number;
  yUp?: boolean;
  includeProjectJson?: boolean;
}

export interface RuntimeInstance {
  getCapabilities(): { actions: string[] };
  loadProjectJson(json: string, options?: LoadProjectOptions): LoadProjectResult;
  commitStagedLoad(): { ok: true };
  discardStagedLoad(): { ok: true };
  snapshot(): RuntimeSnapshot;
  execute(action: string, input: unknown): RuntimeExecuteResult;
  clone(): RuntimeInstance;
  captureRestorePoint(): RuntimeRestorePoint;
  restoreRestorePoint(restorePoint: RuntimeRestorePoint): void;
  exportBundle(outDir: string): Promise<RuntimeExportResult>;
  exportUnityPackage(outDir: string, options: RuntimeUnityPackageOptions): Promise<RuntimeExportResult>;
  exportVideo(outDir: string, settings: Record<string, unknown>): Promise<RuntimeExportResult>;
  exportProjectJson(): string;
}

export interface RuntimeOptions {
  maxJsonBytes?: number;
}

export interface RuntimeRestorePoint {
  current: RuntimeState;
  staged: RuntimeState | null;
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableSortObjects(objects: RuntimeObject[]): RuntimeObject[] {
  return [...objects].sort((a, b) => a.id.localeCompare(b.id));
}

function stableSortModelInstances(instances: RuntimeModelInstance[]): RuntimeModelInstance[] {
  return [...instances].sort((a, b) => a.id.localeCompare(b.id));
}

function stableSortAssets(assets: RuntimeAsset[]): RuntimeAsset[] {
  return [...assets].sort((a, b) => a.id.localeCompare(b.id));
}

function stableTrackSort(clip: Clip): Clip {
  const tracks = [...clip.tracks]
    .map((track) => ({
      ...track,
      keyframes: [...track.keyframes].sort((a, b) => a.time - b.time),
    }))
    .sort((a, b) => {
      const objectCompare = a.objectId.localeCompare(b.objectId);
      if (objectCompare !== 0) return objectCompare;
      return a.property.localeCompare(b.property);
    });
  const sorted: Clip = {
    durationSeconds: clip.durationSeconds,
    tracks,
  };
  if (clip.takes) {
    sorted.takes = [...clip.takes].sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
  }
  return sorted;
}

function resolveBindPathForObject(state: RuntimeState, objectId: string): string {
  const fromObject = state.data.objects.find((item) => item.id === objectId);
  if (fromObject) {
    return (
      (typeof fromObject.bindPath === "string" && fromObject.bindPath.length > 0 ? fromObject.bindPath : null) ??
      (fromObject.name.length > 0 ? fromObject.name : objectId)
    );
  }
  const fromModel = state.data.modelInstances?.find((item) => item.id === objectId);
  if (fromModel) {
    return (
      (typeof fromModel.bindPath === "string" && fromModel.bindPath.length > 0 ? fromModel.bindPath : null) ??
      (fromModel.name.length > 0 ? fromModel.name : objectId)
    );
  }
  return objectId;
}

function normalizeProjectData(data: RuntimeProjectData): RuntimeProjectData {
  const normalized: RuntimeProjectData = {
    version: data.version,
    objects: stableSortObjects(data.objects),
  };
  if (data.assets?.length) {
    normalized.assets = stableSortAssets(data.assets);
  }
  if (data.modelInstances?.length) {
    normalized.modelInstances = stableSortModelInstances(data.modelInstances);
  }
  if (data.camera) {
    normalized.camera = data.camera;
  }
  if (data.animation) {
    normalized.animation = stableTrackSort(data.animation);
  }
  return normalized;
}

function toStableJsonValue(input: unknown): unknown {
  if (input === null || typeof input !== "object") return input;
  if (Array.isArray(input)) {
    return input.map((item) => toStableJsonValue(item));
  }
  const record = input as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort((a, b) => a.localeCompare(b));
  const result: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    result[key] = toStableJsonValue(record[key]);
  }
  return result;
}

function stableStringify(input: unknown): string {
  return JSON.stringify(toStableJsonValue(input), null, 2);
}

function stateFingerprint(state: RuntimeState): string {
  return stableStringify(state);
}

function countKeyframes(clip: Clip | undefined): number {
  if (!clip) return 0;
  return clip.tracks.reduce((total, track) => total + track.keyframes.length, 0);
}

function summarizeProject(data: RuntimeProjectData): LoadProjectResult["summary"] {
  const clip = data.animation;
  const payloadBytes = Buffer.byteLength(stableStringify(data), "utf8");
  return {
    version: data.version,
    objects: data.objects.length + (data.modelInstances?.length ?? 0),
    assets: data.assets?.length ?? 0,
    tracks: clip?.tracks.length ?? 0,
    keyframes: countKeyframes(clip),
    durationSeconds: clip?.durationSeconds ?? 0,
    payloadBytes,
  };
}

function sanitizeBundleFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getBundleAssetFileName(asset: RuntimeAsset): string {
  const sourceName = asset.source.mode === "embedded" ? asset.source.fileName : asset.name;
  const baseName = sanitizeBundleFileName(sourceName);
  return `${sanitizeBundleFileName(asset.id)}-${baseName || "asset.bin"}`;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = Buffer.from(base64, "base64");
  return new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength);
}

function createUnityReadme(options: RuntimeUnityPackageOptions, warnings: string[]): string {
  const lines = [
    "MotionForge Unity Interchange Package",
    "",
    "Contents:",
    "- project.json: MotionForge project data",
    "- assets/: embedded source assets from project",
    "",
    "Import workflow:",
    "1. Unzip package in your Unity project workspace.",
    "2. Inspect project.json and assets to map objects into your importer pipeline.",
    "3. Convert transforms/keyframes using your Unity-side import script.",
    "",
    `Options: scale=${options.scale ?? 1}, yUp=${options.yUp ?? true}, includeProjectJson=${options.includeProjectJson ?? true}`,
    "",
    "Known limitations:",
    "- glTF animation export is not implemented in headless MCP runtime.",
    "- Use project.json + assets as interchange source for now.",
  ];
  if (warnings.length > 0) {
    lines.push("", "Warnings:");
    lines.push(...warnings.map((warning) => `- ${warning}`));
  }
  return lines.join("\n");
}

function parseTrackProperty(value: unknown): TrackProperty {
  if (typeof value !== "string" || !TRACK_PROPERTIES.includes(value as TrackProperty)) {
    throw new RuntimeError("MF_ERR_INVALID_INPUT", `Unsupported propertyPath "${String(value)}".`);
  }
  return value as TrackProperty;
}

function parseInterpolation(value: unknown): Interpolation {
  if (typeof value !== "string") return "linear";
  if (INTERPOLATIONS.has(value as Interpolation)) return value as Interpolation;
  return "linear";
}

function markDirty(ctx: CommandContext, events: RuntimeEvent[]) {
  if (!ctx.state.dirty) {
    ctx.state.dirty = true;
    events.push(ctx.emit("project.dirtyChanged", { dirty: true }));
  }
}

class RuntimeCommandBus {
  private readonly commands = new Map<string, RuntimeCommand>();

  register(command: RuntimeCommand) {
    this.commands.set(command.id, command);
  }

  list() {
    return Array.from(this.commands.values()).map((item) => item.id).sort((a, b) => a.localeCompare(b));
  }

  execute(ctx: CommandContext, action: string, input: unknown): RuntimeCommandResult {
    const command = this.commands.get(action);
    if (!command) {
      throw new RuntimeError("MF_ERR_UNKNOWN_ACTION", `Unknown action "${action}".`);
    }
    if (command.isEnabled) {
      const status = command.isEnabled(ctx, input);
      if (!status.ok) {
        throw new RuntimeError(
          status.code ?? "MF_ERR_ACTION_DISABLED",
          status.message ?? `Action "${action}" is disabled.`,
        );
      }
    }
    return command.run(ctx, input);
  }
}

function createEmptyState(): RuntimeState {
  return {
    data: {
      version: LATEST_PROJECT_VERSION,
      objects: [],
      animation: {
        durationSeconds: 5,
        tracks: [],
      },
    },
    selectedObjectId: null,
    dirty: false,
    hierarchy: {},
  };
}

function buildHierarchyFromData(data: RuntimeProjectData): Record<string, string | null> {
  const hierarchy: Record<string, string | null> = {};
  for (const object of data.objects) {
    hierarchy[object.id] = null;
  }
  for (const instance of data.modelInstances ?? []) {
    hierarchy[instance.id] = null;
  }
  return hierarchy;
}

function objectExists(state: RuntimeState, objectId: string): boolean {
  return state.data.objects.some((item) => item.id === objectId) || (state.data.modelInstances ?? []).some((item) => item.id === objectId);
}

function findObjectById(state: RuntimeState, objectId: string): RuntimeObject | RuntimeModelInstance | null {
  const primitive = state.data.objects.find((item) => item.id === objectId);
  if (primitive) return primitive;
  return (state.data.modelInstances ?? []).find((item) => item.id === objectId) ?? null;
}

function parseTuple3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) return fallback;
  if (!value.every((item) => typeof item === "number" && Number.isFinite(item))) return fallback;
  return [value[0], value[1], value[2]];
}

function parsePrimitiveType(value: unknown): RuntimeObject["geometryType"] {
  if (value === "box" || value === "sphere" || value === "cone") return value;
  throw new RuntimeError("MF_ERR_INVALID_INPUT", "scene.addPrimitive type must be one of box|sphere|cone.");
}

function primitiveBaseName(type: RuntimeObject["geometryType"]): string {
  if (type === "box") return "Cube";
  if (type === "sphere") return "Sphere";
  return "Cone";
}

function nextObjectId(state: RuntimeState): string {
  const used = new Set(state.data.objects.map((item) => item.id));
  let max = 0;
  for (const id of used) {
    const match = /^obj_(\d+)$/.exec(id);
    if (!match) continue;
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed)) {
      max = Math.max(max, parsed);
    }
  }
  let candidate = max + 1;
  while (used.has(`obj_${candidate}`)) {
    candidate += 1;
  }
  return `obj_${candidate}`;
}

function uniqueName(state: RuntimeState, baseName: string): string {
  const names = state.data.objects.map((item) => item.name).concat((state.data.modelInstances ?? []).map((item) => item.name));
  const exact = names.filter((name) => name === baseName).length;
  if (exact === 0) return baseName;
  let index = 2;
  while (names.includes(`${baseName} ${index}`)) {
    index += 1;
  }
  return `${baseName} ${index}`;
}

function isHierarchyCycle(hierarchy: Record<string, string | null>, childId: string, parentId: string): boolean {
  let cursor: string | null = parentId;
  while (cursor) {
    if (cursor === childId) return true;
    cursor = hierarchy[cursor] ?? null;
  }
  return false;
}

function removeTracksForObjectIds(clip: Clip | undefined, removedIds: Set<string>): Clip {
  const source = clip ? deepClone(clip) : { durationSeconds: 5, tracks: [] };
  source.tracks = source.tracks.filter((track) => !removedIds.has(track.objectId));
  normalizeClip(source);
  return stableTrackSort(source);
}

function duplicateTracks(clip: Clip | undefined, sourceId: string, targetId: string): Clip {
  const source = clip ? deepClone(clip) : { durationSeconds: 5, tracks: [] };
  const copies = source.tracks
    .filter((track) => track.objectId === sourceId)
    .map((track) => ({
      ...deepClone(track),
      objectId: targetId,
      bindPath: track.bindPath ? track.bindPath.replace(sourceId, targetId) : track.bindPath,
    }));
  source.tracks.push(...copies);
  normalizeClip(source);
  return stableTrackSort(source);
}

function parseProject(json: string, maxJsonBytes: number): RuntimeProjectData {
  if (Buffer.byteLength(json, "utf8") > maxJsonBytes) {
    throw new RuntimeError("MF_ERR_MAX_JSON_BYTES", "Project JSON exceeds max import size.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new RuntimeError("MF_ERR_INVALID_JSON", "Input is not valid JSON.");
  }
  const migrated = migrateProjectDataToLatest(parsed);
  const validation = validateProjectDataDetailed(migrated.data);
  if (!validation.valid) {
    throw new RuntimeError("MF_ERR_INVALID_PROJECT", validation.error ?? "Project validation failed.");
  }
  return normalizeProjectData(migrated.data as unknown as RuntimeProjectData);
}

function computeProjectId(data: RuntimeProjectData): string {
  const json = stableStringify(data);
  let hash = 2166136261;
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `mf_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createRuntime(options: RuntimeOptions = {}): RuntimeInstance {
  const maxJsonBytes = options.maxJsonBytes ?? DEFAULT_MAX_IMPORT_JSON_BYTES;
  let current = createEmptyState();
  let staged: RuntimeState | null = null;
  const eventLog = createRuntimeEventLog(0);
  const undoStack: UndoEntry[] = [];
  const redoStack: UndoEntry[] = [];
  const commandBus = new RuntimeCommandBus();

  const emit = (type: RuntimeEvent["type"], payload: Record<string, unknown>) => eventLog.next(type, payload);

  const pushUndo = (label: string, before: RuntimeState, after: RuntimeState) => {
    undoStack.push({
      label,
      before: deepClone(before),
      after: deepClone(after),
    });
    redoStack.length = 0;
  };

  const clearHistory = () => {
    undoStack.length = 0;
    redoStack.length = 0;
  };

  commandBus.register({
    id: "selection.set",
    run(ctx, input) {
      const objectId = (input as { objectId?: unknown })?.objectId;
      if (objectId !== null && typeof objectId !== "string") {
        throw new RuntimeError("MF_ERR_INVALID_INPUT", "objectId must be string or null.");
      }
      const nextObjectId = (objectId as string | null) ?? null;
      if (ctx.state.selectedObjectId === nextObjectId) {
        return {
          result: { selectedObjectId: ctx.state.selectedObjectId },
          events: [],
        };
      }
      ctx.state.selectedObjectId = nextObjectId;
      return {
        result: { selectedObjectId: ctx.state.selectedObjectId },
        events: [ctx.emit("selection.changed", { objectId: ctx.state.selectedObjectId })],
      };
    },
  });

  commandBus.register({
    id: "scene.selectById",
    run(ctx, input) {
      const id = (input as { id?: unknown })?.id;
      if (typeof id !== "string" || id.length === 0) {
        throw new RuntimeError("MF_ERR_INVALID_INPUT", "scene.selectById requires id.");
      }
      if (!objectExists(ctx.state, id)) {
        throw new RuntimeError("MF_ERR_NOT_FOUND", `Object "${id}" was not found.`);
      }
      if (ctx.state.selectedObjectId === id) {
        return { result: { objectId: id }, events: [] };
      }
      ctx.state.selectedObjectId = id;
      return {
        result: { objectId: id },
        events: [ctx.emit("selection.changed", { objectId: id })],
      };
    },
  });

  commandBus.register({
    id: "scene.selectByName",
    run(ctx, input) {
      const name = (input as { name?: unknown })?.name;
      if (typeof name !== "string" || name.trim().length === 0) {
        throw new RuntimeError("MF_ERR_INVALID_INPUT", "scene.selectByName requires name.");
      }
      const all = [...ctx.state.data.objects, ...(ctx.state.data.modelInstances ?? [])];
      const exact = all.filter((item) => item.name === name.trim());
      const matches = exact.length > 0 ? exact : all.filter((item) => item.name.toLowerCase() === name.trim().toLowerCase());
      if (matches.length === 0) {
        throw new RuntimeError("MF_ERR_NOT_FOUND", `Object name "${name}" was not found.`);
      }
      if (matches.length > 1) {
        throw new RuntimeError(
          "MF_ERR_AMBIGUOUS_NAME",
          `Multiple objects match "${name}": ${matches.map((item) => item.id).join(", ")}`,
        );
      }
      const [target] = matches;
      if (ctx.state.selectedObjectId === target.id) {
        return { result: { objectId: target.id }, events: [] };
      }
      ctx.state.selectedObjectId = target.id;
      return {
        result: { objectId: target.id },
        events: [ctx.emit("selection.changed", { objectId: target.id })],
      };
    },
  });

  commandBus.register({
    id: "scene.addPrimitive",
    run(ctx, input) {
      const payload = (input as {
        type?: unknown;
        name?: unknown;
        at?: { position?: unknown; rotation?: unknown; scale?: unknown };
        material?: { color?: unknown; metallic?: unknown; roughness?: unknown };
      }) ?? {};
      const type = parsePrimitiveType(payload.type);
      const index = ctx.state.data.objects.length;
      const column = index % 6;
      const row = Math.floor(index / 6);
      const defaultPosition: [number, number, number] = [(column - 2.5) * 0.6, 0.5, row * 0.6];
      const objectId = nextObjectId(ctx.state);
      const object: RuntimeObject = {
        id: objectId,
        name: uniqueName(
          ctx.state,
          typeof payload.name === "string" && payload.name.trim().length > 0 ? payload.name.trim() : primitiveBaseName(type),
        ),
        geometryType: type,
        color: Math.max(
          0,
          Math.min(
            0xffffff,
            Math.round(typeof payload.material?.color === "number" ? payload.material.color : type === "box" ? 0x4488ff : type === "sphere" ? 0x44cc66 : 0xcc6644),
          ),
        ),
        metallic: typeof payload.material?.metallic === "number" ? Math.max(0, Math.min(1, payload.material.metallic)) : 0,
        roughness: typeof payload.material?.roughness === "number" ? Math.max(0, Math.min(1, payload.material.roughness)) : 1,
        position: parseTuple3(payload.at?.position, defaultPosition),
        rotation: parseTuple3(payload.at?.rotation, [0, 0, 0]),
        scale: parseTuple3(payload.at?.scale, [1, 1, 1]),
      };

      ctx.state.data.objects = stableSortObjects([...ctx.state.data.objects, object]);
      ctx.state.hierarchy[objectId] = null;
      const events: RuntimeEvent[] = [ctx.emit("scene.objectAdded", { objectId, kind: "mesh", geometryType: object.geometryType })];
      if (ctx.state.selectedObjectId !== objectId) {
        ctx.state.selectedObjectId = objectId;
        events.push(ctx.emit("selection.changed", { objectId }));
      }
      markDirty(ctx, events);
      return { result: { objectId }, events };
    },
  });

  commandBus.register({
    id: "scene.duplicateSelected",
    run(ctx, input) {
      const selectedId = ctx.state.selectedObjectId;
      if (!selectedId) {
        throw new RuntimeError("MF_ERR_NO_SELECTION", "scene.duplicateSelected requires a selected object.");
      }
      const source = findObjectById(ctx.state, selectedId);
      if (!source) {
        throw new RuntimeError("MF_ERR_NOT_FOUND", `Selected object "${selectedId}" was not found.`);
      }
      const offset = parseTuple3((input as { offset?: unknown })?.offset, [0.6, 0, 0.6]);
      const objectId = nextObjectId(ctx.state);

      if ("geometryType" in source) {
        const duplicate: RuntimeObject = {
          ...deepClone(source),
          id: objectId,
          name: uniqueName(ctx.state, source.name),
          position: [
            source.position[0] + offset[0],
            source.position[1] + offset[1],
            source.position[2] + offset[2],
          ],
        };
        ctx.state.data.objects = stableSortObjects([...ctx.state.data.objects, duplicate]);
      } else {
        const duplicate: RuntimeModelInstance = {
          ...deepClone(source),
          id: objectId,
          name: uniqueName(ctx.state, source.name),
          position: [
            source.position[0] + offset[0],
            source.position[1] + offset[1],
            source.position[2] + offset[2],
          ],
        };
        const instances = [...(ctx.state.data.modelInstances ?? []), duplicate];
        ctx.state.data.modelInstances = stableSortModelInstances(instances);
      }

      ctx.state.hierarchy[objectId] = ctx.state.hierarchy[selectedId] ?? null;
      ctx.state.data.animation = duplicateTracks(ctx.state.data.animation, selectedId, objectId);

      const events: RuntimeEvent[] = [ctx.emit("scene.objectAdded", { objectId, sourceObjectId: selectedId })];
      if (ctx.state.selectedObjectId !== objectId) {
        ctx.state.selectedObjectId = objectId;
        events.push(ctx.emit("selection.changed", { objectId }));
      }
      markDirty(ctx, events);
      return { result: { objectId }, events };
    },
  });

  commandBus.register({
    id: "scene.deleteSelected",
    run(ctx, input) {
      const payload = (input as { objectId?: unknown; confirm?: unknown }) ?? {};
      if (payload.confirm !== true) {
        throw new RuntimeError("MF_ERR_CONFIRM_REQUIRED", "scene.deleteSelected requires confirm=true.");
      }
      const targetId = typeof payload.objectId === "string" ? payload.objectId : ctx.state.selectedObjectId;
      if (!targetId) {
        throw new RuntimeError("MF_ERR_NO_SELECTION", "scene.deleteSelected requires a selected object.");
      }
      if (!objectExists(ctx.state, targetId)) {
        throw new RuntimeError("MF_ERR_NOT_FOUND", `Object "${targetId}" was not found.`);
      }

      const removedIds = new Set<string>([targetId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const [childId, parentId] of Object.entries(ctx.state.hierarchy)) {
          if (!parentId) continue;
          if (removedIds.has(parentId) && !removedIds.has(childId)) {
            removedIds.add(childId);
            changed = true;
          }
        }
      }

      ctx.state.data.objects = stableSortObjects(ctx.state.data.objects.filter((item) => !removedIds.has(item.id)));
      ctx.state.data.modelInstances = stableSortModelInstances((ctx.state.data.modelInstances ?? []).filter((item) => !removedIds.has(item.id)));
      ctx.state.data.animation = removeTracksForObjectIds(ctx.state.data.animation, removedIds);
      for (const removedId of removedIds) {
        delete ctx.state.hierarchy[removedId];
      }
      for (const [id, parentId] of Object.entries(ctx.state.hierarchy)) {
        if (parentId && removedIds.has(parentId)) {
          ctx.state.hierarchy[id] = null;
        }
      }

      const events: RuntimeEvent[] = [ctx.emit("scene.objectDeleted", { objectIds: [...removedIds].sort() })];
      if (ctx.state.selectedObjectId && removedIds.has(ctx.state.selectedObjectId)) {
        ctx.state.selectedObjectId = null;
        events.push(ctx.emit("selection.changed", { objectId: null }));
      }
      markDirty(ctx, events);
      return { result: { removedIds: [...removedIds].sort() }, events };
    },
  });

  commandBus.register({
    id: "scene.clearUserObjects",
    run(ctx, input) {
      if ((input as { confirm?: unknown })?.confirm !== true) {
        throw new RuntimeError("MF_ERR_CONFIRM_REQUIRED", "scene.clearUserObjects requires confirm=true.");
      }
      const removedIds = [
        ...ctx.state.data.objects.map((item) => item.id),
        ...(ctx.state.data.modelInstances ?? []).map((item) => item.id),
      ];
      ctx.state.data.objects = [];
      ctx.state.data.modelInstances = [];
      ctx.state.data.animation = removeTracksForObjectIds(ctx.state.data.animation, new Set(removedIds));
      ctx.state.hierarchy = {};

      const events: RuntimeEvent[] = [ctx.emit("scene.objectsCleared", { removedCount: removedIds.length })];
      if (ctx.state.selectedObjectId !== null) {
        ctx.state.selectedObjectId = null;
        events.push(ctx.emit("selection.changed", { objectId: null }));
      }
      markDirty(ctx, events);
      return { result: { removedCount: removedIds.length }, events };
    },
  });

  commandBus.register({
    id: "scene.parent",
    run(ctx, input) {
      const payload = input as { childId?: unknown; parentId?: unknown };
      if (typeof payload?.childId !== "string" || typeof payload.parentId !== "string") {
        throw new RuntimeError("MF_ERR_INVALID_INPUT", "scene.parent requires childId and parentId.");
      }
      if (!objectExists(ctx.state, payload.childId) || !objectExists(ctx.state, payload.parentId)) {
        throw new RuntimeError("MF_ERR_NOT_FOUND", "scene.parent childId/parentId must exist.");
      }
      if (payload.childId === payload.parentId) {
        throw new RuntimeError("MF_ERR_INVALID_INPUT", "scene.parent childId cannot equal parentId.");
      }
      if (isHierarchyCycle(ctx.state.hierarchy, payload.childId, payload.parentId)) {
        throw new RuntimeError("MF_ERR_INVALID_INPUT", "scene.parent would create a hierarchy cycle.");
      }
      if (ctx.state.hierarchy[payload.childId] === payload.parentId) {
        return { result: { childId: payload.childId, parentId: payload.parentId }, events: [] };
      }
      ctx.state.hierarchy[payload.childId] = payload.parentId;
      const events: RuntimeEvent[] = [ctx.emit("scene.parentChanged", { childId: payload.childId, parentId: payload.parentId })];
      markDirty(ctx, events);
      return { result: { childId: payload.childId, parentId: payload.parentId }, events };
    },
  });

  commandBus.register({
    id: "scene.unparent",
    run(ctx, input) {
      const payload = input as { childId?: unknown };
      if (typeof payload?.childId !== "string") {
        throw new RuntimeError("MF_ERR_INVALID_INPUT", "scene.unparent requires childId.");
      }
      if (!objectExists(ctx.state, payload.childId)) {
        throw new RuntimeError("MF_ERR_NOT_FOUND", `Object "${payload.childId}" was not found.`);
      }
      if ((ctx.state.hierarchy[payload.childId] ?? null) === null) {
        return { result: { childId: payload.childId, parentId: null }, events: [] };
      }
      ctx.state.hierarchy[payload.childId] = null;
      const events: RuntimeEvent[] = [ctx.emit("scene.parentChanged", { childId: payload.childId, parentId: null })];
      markDirty(ctx, events);
      return { result: { childId: payload.childId, parentId: null }, events };
    },
  });

  commandBus.register({
    id: "scene.group",
    run() {
      throw new RuntimeError("MF_ERR_NOT_IMPLEMENTED", "scene.group requires project format v5 support.");
    },
  });

  commandBus.register({
    id: "scene.ungroup",
    run() {
      throw new RuntimeError("MF_ERR_NOT_IMPLEMENTED", "scene.ungroup requires project format v5 support.");
    },
  });

  commandBus.register({
    id: "scene.addCamera",
    run() {
      throw new RuntimeError("MF_ERR_NOT_IMPLEMENTED", "scene.addCamera requires project format v5 support.");
    },
  });

  commandBus.register({
    id: "scene.addLight",
    run() {
      throw new RuntimeError("MF_ERR_NOT_IMPLEMENTED", "scene.addLight requires project format v5 support.");
    },
  });

  commandBus.register({
    id: "hierarchy.renameMany",
    run(ctx, input) {
      const changes = (input as { changes?: unknown })?.changes;
      if (!Array.isArray(changes)) {
        throw new RuntimeError("MF_ERR_INVALID_INPUT", "changes must be an array.");
      }
      const byId = new Map(ctx.state.data.objects.map((item) => [item.id, item]));
      let renamed = 0;
      const events: RuntimeEvent[] = [];
      for (const item of changes) {
        if (typeof item !== "object" || item === null) continue;
        const row = item as { objectId?: unknown; name?: unknown };
        if (typeof row.objectId !== "string" || typeof row.name !== "string") continue;
        const target = byId.get(row.objectId);
        if (!target || target.name === row.name) continue;
        target.name = row.name;
        renamed += 1;
        events.push(ctx.emit("object.renamed", { objectId: target.id, name: target.name }));
      }
      if (renamed > 0) {
        markDirty(ctx, events);
      }
      return {
        result: { renamed },
        events,
      };
    },
  });

  commandBus.register({
    id: "material.set",
    isEnabled(ctx, input) {
      const objectId = (input as { objectId?: unknown })?.objectId;
      if (typeof objectId !== "string") {
        return {
          ok: false,
          code: "MF_ERR_NO_SELECTION",
          message: "material.set requires an objectId.",
        };
      }
      const found = ctx.state.data.objects.some((item) => item.id === objectId);
      if (!found) {
        return {
          ok: false,
          code: "MF_ERR_NO_SELECTION",
          message: `Object "${objectId}" was not found.`,
        };
      }
      return { ok: true };
    },
    run(ctx, input) {
      const data = input as {
        objectId: string;
        baseColor?: unknown;
        metallic?: unknown;
        roughness?: unknown;
      };
      const object = ctx.state.data.objects.find((item) => item.id === data.objectId);
      if (!object) {
        throw new RuntimeError("MF_ERR_NO_SELECTION", `Object "${data.objectId}" was not found.`);
      }

      const changes: Record<string, unknown> = {};
      if (typeof data.baseColor === "number" && Number.isFinite(data.baseColor)) {
        object.color = Math.max(0, Math.min(0xffffff, Math.round(data.baseColor)));
        changes.baseColor = object.color;
      }
      if (typeof data.metallic === "number" && Number.isFinite(data.metallic)) {
        object.metallic = Math.max(0, Math.min(1, data.metallic));
        changes.metallic = object.metallic;
      }
      if (typeof data.roughness === "number" && Number.isFinite(data.roughness)) {
        object.roughness = Math.max(0, Math.min(1, data.roughness));
        changes.roughness = object.roughness;
      }

      const events: RuntimeEvent[] = [];
      if (Object.keys(changes).length > 0) {
        events.push(ctx.emit("object.materialChanged", { objectId: object.id, ...changes }));
        markDirty(ctx, events);
      }
      return {
        result: { objectId: object.id, ...changes },
        events,
      };
    },
  });

  commandBus.register({
    id: "animation.insertRecords",
    run(ctx, input) {
      const records = (input as { records?: unknown })?.records;
      if (!Array.isArray(records)) {
        throw new RuntimeError("MF_ERR_INVALID_INPUT", "records must be an array.");
      }
      const clip = ctx.state.data.animation ?? { durationSeconds: 5, tracks: [] };
      const events: RuntimeEvent[] = [];
      let insertedCount = 0;
      for (const row of records) {
        if (typeof row !== "object" || row === null) continue;
        const value = row as {
          objectId?: unknown;
          propertyPath?: unknown;
          time?: unknown;
          value?: unknown;
          interpolation?: unknown;
        };
        if (typeof value.objectId !== "string") continue;
        if (typeof value.time !== "number" || !Number.isFinite(value.time)) continue;
        if (typeof value.value !== "number" || !Number.isFinite(value.value)) continue;
        const property = parseTrackProperty(value.propertyPath);
        const track = getOrCreateTrack(clip, value.objectId, property);
        if (!track.bindPath || track.bindPath.length === 0) {
          track.bindPath = resolveBindPathForObject(ctx.state, value.objectId);
        }
        insertKeyframe(track, {
          time: value.time,
          value: value.value,
          interpolation: parseInterpolation(value.interpolation),
        });
        insertedCount += 1;
        events.push(ctx.emit("keyframe.added", { objectId: value.objectId, propertyPath: property, time: value.time }));
      }
      normalizeClip(clip);
      ctx.state.data.animation = stableTrackSort(clip);
      if (insertedCount > 0) {
        markDirty(ctx, events);
      }
      return {
        result: { insertedCount },
        events,
      };
    },
  });

  commandBus.register({
    id: "animation.removeKeys",
    run(ctx, input) {
      const keys = (input as { keys?: unknown })?.keys;
      if (!Array.isArray(keys)) {
        throw new RuntimeError("MF_ERR_INVALID_INPUT", "keys must be an array.");
      }
      const refs: KeyframeRef[] = [];
      for (const key of keys) {
        if (typeof key !== "object" || key === null) continue;
        const row = key as { objectId?: unknown; propertyPath?: unknown; time?: unknown };
        if (typeof row.objectId !== "string") continue;
        if (typeof row.time !== "number" || !Number.isFinite(row.time)) continue;
        refs.push({
          objectId: row.objectId,
          property: parseTrackProperty(row.propertyPath),
          time: row.time,
        });
      }
      const clip = ctx.state.data.animation ?? { durationSeconds: 5, tracks: [] };
      removeKeyframes(clip, refs);
      normalizeClip(clip);
      ctx.state.data.animation = stableTrackSort(clip);

      const events = refs.map((ref) =>
        ctx.emit("keyframe.deleted", {
          objectId: ref.objectId,
          propertyPath: ref.property,
          time: ref.time,
        }),
      );
      if (events.length > 0) {
        markDirty(ctx, events);
      }
      return {
        result: { removedCount: refs.length },
        events,
      };
    },
  });

  commandBus.register({
    id: "animation.moveKeys",
    run(ctx, input) {
      const payload = input as { keys?: unknown; deltaTime?: unknown };
      if (!Array.isArray(payload.keys) || typeof payload.deltaTime !== "number" || !Number.isFinite(payload.deltaTime)) {
        throw new RuntimeError("MF_ERR_INVALID_INPUT", "keys[] and finite deltaTime are required.");
      }
      const refs: KeyframeRef[] = [];
      for (const key of payload.keys) {
        if (typeof key !== "object" || key === null) continue;
        const row = key as { objectId?: unknown; propertyPath?: unknown; time?: unknown };
        if (typeof row.objectId !== "string") continue;
        if (typeof row.time !== "number" || !Number.isFinite(row.time)) continue;
        refs.push({
          objectId: row.objectId,
          property: parseTrackProperty(row.propertyPath),
          time: row.time,
        });
      }
      const clip = ctx.state.data.animation ?? { durationSeconds: 5, tracks: [] };
      const moved = moveKeyframes(clip, refs, payload.deltaTime);
      normalizeClip(clip);
      ctx.state.data.animation = stableTrackSort(clip);

      const events = moved.map((ref) =>
        ctx.emit("keyframe.moved", {
          objectId: ref.objectId,
          propertyPath: ref.property,
          time: ref.time,
        }),
      );
      if (events.length > 0) {
        markDirty(ctx, events);
      }
      return {
        result: { movedCount: moved.length },
        events,
      };
    },
  });

  commandBus.register({
    id: "animation.setDuration",
    run(ctx, input) {
      const durationSeconds = (input as { durationSeconds?: unknown })?.durationSeconds;
      if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        throw new RuntimeError("MF_ERR_INVALID_INPUT", "durationSeconds must be a finite number > 0.");
      }
      const clip = ctx.state.data.animation ?? { durationSeconds, tracks: [] };
      clip.durationSeconds = durationSeconds;
      normalizeClip(clip);
      ctx.state.data.animation = stableTrackSort(clip);

      const events = [ctx.emit("animation.durationChanged", { durationSeconds })];
      markDirty(ctx, events);
      return {
        result: { durationSeconds },
        events,
      };
    },
  });

  commandBus.register({
    id: "animation.setTakes",
    run(ctx, input) {
      const takesInput = (input as { takes?: unknown })?.takes;
      if (!Array.isArray(takesInput)) {
        throw new RuntimeError("MF_ERR_INVALID_INPUT", "takes must be an array.");
      }
      const clip = ctx.state.data.animation ?? { durationSeconds: 5, tracks: [] };
      const takes: NonNullable<Clip["takes"]> = [];
      const seen = new Set<string>();

      for (const take of takesInput) {
        if (typeof take !== "object" || take === null) continue;
        const row = take as { id?: unknown; name?: unknown; startTime?: unknown; endTime?: unknown };
        if (typeof row.id !== "string" || row.id.length === 0) continue;
        if (seen.has(row.id)) continue;
        if (typeof row.name !== "string" || row.name.length === 0) continue;
        if (typeof row.startTime !== "number" || !Number.isFinite(row.startTime)) continue;
        if (typeof row.endTime !== "number" || !Number.isFinite(row.endTime)) continue;
        if (row.startTime < 0 || row.endTime > clip.durationSeconds || row.endTime <= row.startTime) continue;
        seen.add(row.id);
        takes.push({
          id: row.id,
          name: row.name,
          startTime: row.startTime,
          endTime: row.endTime,
        });
      }

      clip.takes = takes.sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
      normalizeClip(clip);
      ctx.state.data.animation = stableTrackSort(clip);

      const events = [ctx.emit("animation.takesChanged", { takesCount: clip.takes?.length ?? 0 })];
      markDirty(ctx, events);
      return {
        result: { takes: clip.takes ?? [] },
        events,
      };
    },
  });

  const applyCommandMutation = (action: string, input: unknown): RuntimeExecuteResult => {
    if (action === "history.undo") {
      const entry = undoStack.pop();
      if (!entry) {
        throw new RuntimeError("MF_ERR_NOTHING_TO_UNDO", "Undo stack is empty.");
      }
      current = deepClone(entry.before);
      redoStack.push({
        label: entry.label,
        before: deepClone(entry.before),
        after: deepClone(entry.after),
      });
      return {
        result: { label: entry.label },
        events: [emit("history.undo", { label: entry.label })],
      };
    }

    if (action === "history.redo") {
      const entry = redoStack.pop();
      if (!entry) {
        throw new RuntimeError("MF_ERR_NOTHING_TO_REDO", "Redo stack is empty.");
      }
      current = deepClone(entry.after);
      undoStack.push({
        label: entry.label,
        before: deepClone(entry.before),
        after: deepClone(entry.after),
      });
      return {
        result: { label: entry.label },
        events: [emit("history.redo", { label: entry.label })],
      };
    }

    const before = deepClone(current);
    const beforeFingerprint = stateFingerprint(before);
    const out = commandBus.execute(
      {
        state: current,
        emit,
      },
      action,
      input,
    );
    const after = deepClone(current);
    const afterFingerprint = stateFingerprint(after);
    if (beforeFingerprint !== afterFingerprint) {
      pushUndo(action, before, after);
    }
    return out;
  };

  return {
    getCapabilities() {
      return {
        actions: [...commandBus.list(), "history.undo", "history.redo"],
      };
    },

    loadProjectJson(json: string, options: LoadProjectOptions = {}) {
      const data = parseProject(json, maxJsonBytes);
      const runtimeState: RuntimeState = {
        data,
        selectedObjectId: null,
        dirty: false,
        hierarchy: buildHierarchyFromData(data),
      };
      if (options.staged !== false) {
        staged = deepClone(runtimeState);
      } else {
        current = deepClone(runtimeState);
        staged = null;
        clearHistory();
      }
      return {
        projectId: computeProjectId(data),
        summary: summarizeProject(data),
      };
    },

    commitStagedLoad() {
      if (!staged) {
        throw new RuntimeError("MF_ERR_NO_STAGED_PROJECT", "No staged project is available to commit.");
      }
      current = deepClone(staged);
      staged = null;
      clearHistory();
      return { ok: true as const };
    },

    discardStagedLoad() {
      staged = null;
      return { ok: true as const };
    },

    snapshot() {
      const data = current.data;
      const clip = data.animation;
      return {
        scene: {
          selectedObjectId: current.selectedObjectId,
          objects: stableSortObjects(data.objects).map((object) => ({
            id: object.id,
            name: object.name,
            geometryType: object.geometryType,
            parentId: current.hierarchy[object.id] ?? null,
          })),
          modelInstances: stableSortModelInstances(data.modelInstances ?? []).map((instance) => ({
            id: instance.id,
            name: instance.name,
            assetId: instance.assetId,
            parentId: current.hierarchy[instance.id] ?? null,
          })),
        },
        selection: {
          objectId: current.selectedObjectId,
        },
        assets: {
          count: data.assets?.length ?? 0,
          items: stableSortAssets(data.assets ?? []).map((asset) => ({
            id: asset.id,
            name: asset.name,
            type: asset.type,
            sourceMode: asset.source.mode,
            size: asset.size,
          })),
        },
        animation: {
          durationSeconds: clip?.durationSeconds ?? 0,
          trackCount: clip?.tracks.length ?? 0,
          keyframeCount: countKeyframes(clip),
          takesCount: clip?.takes?.length ?? 0,
        },
        dirty: current.dirty,
        version: data.version,
      };
    },

    execute(action: string, input: unknown) {
      return applyCommandMutation(action, input);
    },

    clone() {
      const runtimeClone = createRuntime({ maxJsonBytes });
      runtimeClone.loadProjectJson(stableStringify(current.data), { staged: false });
      if (current.selectedObjectId) {
        runtimeClone.execute("selection.set", { objectId: current.selectedObjectId });
      }
      if (!current.dirty) {
        const restorePoint = runtimeClone.captureRestorePoint();
        restorePoint.current.dirty = false;
        runtimeClone.restoreRestorePoint(restorePoint);
      }
      return runtimeClone;
    },

    captureRestorePoint() {
      return {
        current: deepClone(current),
        staged: staged ? deepClone(staged) : null,
        undoStack: deepClone(undoStack),
        redoStack: deepClone(redoStack),
      };
    },

    restoreRestorePoint(restorePoint: RuntimeRestorePoint) {
      current = deepClone(restorePoint.current);
      staged = restorePoint.staged ? deepClone(restorePoint.staged) : null;
      undoStack.length = 0;
      redoStack.length = 0;
      undoStack.push(...deepClone(restorePoint.undoStack));
      redoStack.push(...deepClone(restorePoint.redoStack));
    },

    async exportBundle(outDir: string) {
      if (typeof outDir !== "string" || outDir.length === 0) {
        throw new RuntimeError("MF_ERR_INVALID_INPUT", "outDir is required.");
      }
      const data = current.data;
      const files: Record<string, Uint8Array> = {};
      const warnings: string[] = [];
      files["project.json"] = strToU8(stableStringify(data));
      const primaryModelAssetId =
        data.modelInstances && data.modelInstances.length > 0
          ? [...data.modelInstances].sort((a, b) => a.id.localeCompare(b.id))[0]?.assetId ?? null
          : null;
      const clipDuration = data.animation?.durationSeconds ?? 0;
      const takes = data.animation?.takes && data.animation.takes.length > 0
        ? [...data.animation.takes].sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id))
        : clipDuration > 0
          ? [{ id: "take_main", name: "Main", startTime: 0, endTime: clipDuration }]
          : [];
      files["motionforge-manifest.json"] = strToU8(
        stableStringify({
          version: 1,
          exportedAt: new Date().toISOString(),
          projectVersion: data.version,
          primaryModelAssetId,
          takes,
          clipNaming: {
            pattern: "<ProjectName>_<TakeName>",
            fallbackTakeName: "Main",
          },
        }),
      );

      for (const asset of stableSortAssets(data.assets ?? [])) {
        const name = getBundleAssetFileName(asset);
        if (asset.source.mode === "embedded") {
          files[`assets/${name}`] = base64ToBytes(asset.source.data);
        } else {
          warnings.push(`Asset "${asset.id}" is external and referenced by path.`);
          files[`assets/${name}.external.txt`] = strToU8(`External asset reference: ${asset.source.path}`);
        }
      }

      const zip = zipSync(files, { level: 6 });
      const bytes = new Uint8Array(zip.byteLength);
      bytes.set(zip);
      await mkdir(outDir, { recursive: true });
      const path = join(outDir, "motionforge-bundle.zip");
      await writeFile(path, bytes);
      return {
        ok: true,
        path,
        bytes: bytes.byteLength,
        warnings,
      };
    },

    async exportUnityPackage(outDir: string, options: RuntimeUnityPackageOptions) {
      if (typeof outDir !== "string" || outDir.length === 0) {
        throw new RuntimeError("MF_ERR_INVALID_INPUT", "outDir is required.");
      }
      const normalizedOptions: RuntimeUnityPackageOptions = {
        scale: options.scale ?? 1,
        yUp: options.yUp ?? true,
        includeProjectJson: options.includeProjectJson ?? true,
      };
      const data = current.data;
      const files: Record<string, Uint8Array> = {};
      const warnings: string[] = [];
      if (normalizedOptions.includeProjectJson !== false) {
        files["project.json"] = strToU8(stableStringify(data));
      }

      for (const asset of stableSortAssets(data.assets ?? [])) {
        const name = getBundleAssetFileName(asset);
        if (asset.source.mode === "embedded") {
          files[`assets/${name}`] = base64ToBytes(asset.source.data);
        } else {
          warnings.push(`Asset "${asset.id}" is external and referenced by path.`);
          files[`assets/${name}.external.txt`] = strToU8(`External asset reference: ${asset.source.path}`);
        }
      }

      warnings.push("glTF animation export is not implemented yet; using project.json + assets interchange package.");
      files["README_UNITY.txt"] = strToU8(createUnityReadme(normalizedOptions, warnings));

      const zip = zipSync(files, { level: 6 });
      const bytes = new Uint8Array(zip.byteLength);
      bytes.set(zip);
      await mkdir(outDir, { recursive: true });
      const path = join(outDir, "motionforge-unity-package.zip");
      await writeFile(path, bytes);
      return {
        ok: true,
        path,
        bytes: bytes.byteLength,
        warnings,
      };
    },

    async exportVideo(outDir: string, settings: Record<string, unknown>) {
      void outDir;
      void settings;
      return {
        ok: false,
        path: "",
        bytes: 0,
        warnings: [
          "Headless runtime cannot render viewport frames. Use web UI export or bundle export for deterministic output.",
        ],
        mode: "fallback" as const,
        error: {
          code: "MF_ERR_HEADLESS_VIDEO_UNSUPPORTED",
          message: "Video export requires WebGL viewport rendering and is unavailable in MCP headless mode.",
        },
      };
    },

    exportProjectJson() {
      return stableStringify(current.data);
    },
  };
}
