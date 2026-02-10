import { sceneStore } from "../../state/sceneStore.js";
import { animationStore } from "../../state/animationStore.js";
import { assetStore, type AssetRecord, type MaterialOverrideRecord } from "../../state/assetStore.js";
import type { Clip } from "@motionforge/engine";
import { migrateProjectDataToLatest, validateProjectDataDetailed } from "@motionforge/engine";
import { collectMaterialOverrides, base64ToArrayBuffer } from "../three/importGltf.js";
import { strToU8, zipSync } from "fflate";
import {
  AUTOSAVE_SLOT_ID,
  deletePayloadFromIndexedDb,
  loadPayloadFromIndexedDb,
  savePayloadToIndexedDb,
} from "./projectPayloadStore.js";

export const PROJECT_VERSION = 4;
const STORAGE_KEY = "motionforge_project";
const RECENT_INDEX_KEY = "motionforge_recent_projects_v1";
const RECENT_ITEM_PREFIX = "motionforge_recent_item_"; // legacy payload prefix (localStorage)
const MAX_RECENT_PROJECTS = 5;

export interface ProjectObjectData {
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

export type ProjectAssetData = AssetRecord;

export interface ProjectModelInstanceData {
  id: string;
  name: string;
  bindPath?: string;
  assetId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  materialOverrides?: MaterialOverrideRecord[];
}

export interface BundleManifestData {
  version: 1;
  exportedAt: string;
  projectVersion: number;
  primaryModelAssetId: string | null;
  takes: Array<{
    id: string;
    name: string;
    startTime: number;
    endTime: number;
  }>;
  clipNaming: {
    pattern: "<ProjectName>_<TakeName>";
    fallbackTakeName: "Main";
  };
}

export interface ProjectData {
  version: number;
  objects: ProjectObjectData[];
  assets?: ProjectAssetData[];
  modelInstances?: ProjectModelInstanceData[];
  camera?: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  };
  animation?: Clip;
}

export interface ParseProjectResult {
  data: ProjectData | null;
  error: string | null;
}

export interface ProjectBundleArtifact {
  fileName: string;
  bytes: Uint8Array;
  sizeBytes: number;
  assetCount: number;
}

export interface RecentProjectEntry {
  id: string;
  name: string;
  updatedAt: string;
  size: number;
  version: number;
  legacyStorageKey?: string;
}

function detectGeometryType(obj: THREE.Mesh): "box" | "sphere" | "cone" | null {
  const geo = obj.geometry;
  if (!geo) return null;
  const geoType = geo.type;
  if (geoType === "BoxGeometry") return "box";
  if (geoType === "SphereGeometry") return "sphere";
  if (geoType === "ConeGeometry") return "cone";
  return null;
}

function sanitizeBindPathSegment(value: string): string {
  const cleaned = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/\//g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned : "Object";
}

function withUniqueBindPath(basePath: string, used: Set<string>): string {
  if (!used.has(basePath)) {
    used.add(basePath);
    return basePath;
  }
  let index = 2;
  let next = `${basePath}_${index}`;
  while (used.has(next)) {
    index += 1;
    next = `${basePath}_${index}`;
  }
  used.add(next);
  return next;
}

function computeBindPathMap(): Map<string, string> {
  const objects = sceneStore.getAllUserObjects();
  const items = objects
    .map((object) => {
      const id = sceneStore.getIdForObject(object);
      if (!id) return null;
      const segments: string[] = [];
      let cursor: THREE.Object3D | null = object;
      while (cursor) {
        const cursorId = sceneStore.getIdForObject(cursor);
        if (!cursorId) break;
        const part = sanitizeBindPathSegment(cursor.name || cursorId);
        segments.unshift(part);
        const parent: THREE.Object3D | null = cursor.parent;
        if (!parent || !sceneStore.getIdForObject(parent)) break;
        cursor = parent;
      }
      const basePath = segments.length > 0 ? segments.join("/") : sanitizeBindPathSegment(object.name || id);
      return { id, basePath };
    })
    .filter((item): item is { id: string; basePath: string } => Boolean(item))
    .sort((a, b) => a.id.localeCompare(b.id));

  const used = new Set<string>();
  const map = new Map<string, string>();
  for (const item of items) {
    map.set(item.id, withUniqueBindPath(item.basePath, used));
  }
  return map;
}

function buildBundleManifest(data: ProjectData, exportedAt: string): BundleManifestData {
  const primaryModelAssetId =
    data.modelInstances && data.modelInstances.length > 0
      ? [...data.modelInstances].sort((a, b) => a.id.localeCompare(b.id))[0]?.assetId ?? null
      : null;
  const duration = data.animation?.durationSeconds ?? 0;
  const takes = Array.isArray((data.animation as { takes?: unknown[] } | undefined)?.takes)
    ? ((data.animation as { takes?: Array<{ id: string; name: string; startTime: number; endTime: number }> }).takes ?? [])
    : [];
  const manifestTakes = takes.length > 0
    ? takes
        .map((take) => ({
          id: String(take.id),
          name: String(take.name),
          startTime: Number(take.startTime),
          endTime: Number(take.endTime),
        }))
        .sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id))
    : duration > 0
      ? [{ id: "take_main", name: "Main", startTime: 0, endTime: duration }]
      : [];
  return {
    version: 1,
    exportedAt,
    projectVersion: data.version,
    primaryModelAssetId,
    takes: manifestTakes,
    clipNaming: {
      pattern: "<ProjectName>_<TakeName>",
      fallbackTakeName: "Main",
    },
  };
}

import type * as THREE from "three";

export function serializeProject(): ProjectData {
  const objects: ProjectObjectData[] = [];
  const modelInstances: ProjectModelInstanceData[] = [];
  const bindPathById = computeBindPathMap();

  for (const obj of sceneStore.getAllUserObjects()) {
    const assetId = typeof obj.userData.__assetId === "string" ? obj.userData.__assetId as string : null;
    if (assetId && obj.userData.__isModelRoot) {
      const id = sceneStore.getIdForObject(obj);
      if (!id) continue;
      const materialOverrides = collectMaterialOverrides(obj);
      modelInstances.push({
        id,
        name: obj.name,
        bindPath: bindPathById.get(id) ?? sanitizeBindPathSegment(obj.name || id),
        assetId,
        position: [obj.position.x, obj.position.y, obj.position.z],
        rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
        scale: [obj.scale.x, obj.scale.y, obj.scale.z],
        materialOverrides: materialOverrides.length > 0 ? materialOverrides : undefined,
      });
      continue;
    }

    if (assetId) continue;
    if (!(obj as THREE.Mesh).isMesh) continue;
    const mesh = obj as THREE.Mesh;
    const geoType = detectGeometryType(mesh);
    if (!geoType) continue;

    const mat = mesh.material as THREE.MeshStandardMaterial;
    const id = sceneStore.getIdForObject(obj)!;

    objects.push({
      id,
      name: obj.name,
      bindPath: bindPathById.get(id) ?? sanitizeBindPathSegment(obj.name || id),
      geometryType: geoType,
      color: mat.color.getHex(),
      metallic: Number.isFinite(mat.metalness) ? mat.metalness : undefined,
      roughness: Number.isFinite(mat.roughness) ? mat.roughness : undefined,
      position: [obj.position.x, obj.position.y, obj.position.z],
      rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
      scale: [obj.scale.x, obj.scale.y, obj.scale.z],
    });
  }

  const data: ProjectData = {
    version: PROJECT_VERSION,
    objects,
  };

  const assets = assetStore.getAssets();
  if (assets.length > 0) {
    data.assets = assets;
  }
  if (modelInstances.length > 0) {
    data.modelInstances = modelInstances;
  }

  const cam = sceneStore.getCamera();
  const target = sceneStore.getControlsTarget();
  if (cam && target) {
    data.camera = {
      position: [cam.position.x, cam.position.y, cam.position.z],
      target: [target.x, target.y, target.z],
      fov: cam.fov,
    };
  }

  // Serialize animation clip
  const clip = animationStore.getClip();
  if (clip.tracks.length > 0) {
    data.animation = {
      ...clip,
      tracks: clip.tracks.map((track) => ({
        ...track,
        bindPath: bindPathById.get(track.objectId),
      })),
    } as unknown as Clip;
  }

  return data;
}

function summarizeProjectName(data: ProjectData): string {
  if (data.objects.length > 0) {
    return data.objects[0].name || "Untitled Project";
  }
  if (data.modelInstances && data.modelInstances.length > 0) {
    return data.modelInstances[0].name || "Untitled Project";
  }
  return "Untitled Project";
}

function parseRecentIndex(raw: string | null): RecentProjectEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const entries: RecentProjectEntry[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;
      const record = item as Record<string, unknown>;
      const legacyStorageKey = typeof record.storageKey === "string" ? record.storageKey : undefined;
      const id = typeof record.id === "string"
        ? record.id
        : legacyStorageKey
          ? legacyStorageKey.replace(RECENT_ITEM_PREFIX, "")
          : null;
      const name = typeof record.name === "string" ? record.name : null;
      const updatedAt = typeof record.updatedAt === "string"
        ? record.updatedAt
        : typeof record.timestamp === "string"
          ? record.timestamp
          : null;
      const size = typeof record.size === "number" ? record.size : null;
      const version = typeof record.version === "number" ? record.version : null;
      if (!id || !name || !updatedAt || size === null || version === null) continue;
      entries.push({
        id,
        name,
        updatedAt,
        size,
        version,
        legacyStorageKey,
      });
    }
    return entries;
  } catch {
    return [];
  }
}

export function getRecentProjects(): RecentProjectEntry[] {
  return parseRecentIndex(localStorage.getItem(RECENT_INDEX_KEY)).sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}

function setRecentProjects(items: RecentProjectEntry[]) {
  localStorage.setItem(RECENT_INDEX_KEY, JSON.stringify(items));
}

export function recordRecentProject(data: ProjectData, json: string, customName?: string): void {
  void persistRecentProject(data, json, customName);
}

export async function saveAutosaveSnapshot(customJson?: string): Promise<boolean> {
  try {
    const json = customJson ?? JSON.stringify(serializeProject());
    await savePayloadToIndexedDb(AUTOSAVE_SLOT_ID, json);
    return true;
  } catch {
    return false;
  }
}

export async function loadAutosaveSnapshot(): Promise<ParseProjectResult> {
  try {
    const json = await loadPayloadFromIndexedDb(AUTOSAVE_SLOT_ID);
    if (!json) {
      return { data: null, error: "No autosave snapshot available." };
    }
    return parseProjectJSONResult(json);
  } catch {
    return { data: null, error: "Failed to read autosave snapshot." };
  }
}

export async function persistRecentProject(data: ProjectData, json: string, customName?: string): Promise<void> {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await savePayloadToIndexedDb(id, json);

  const entry: RecentProjectEntry = {
    id,
    name: customName ?? summarizeProjectName(data),
    updatedAt: new Date().toISOString(),
    size: json.length,
    version: data.version,
  };

  const current = getRecentProjects();
  const next = [entry, ...current].slice(0, MAX_RECENT_PROJECTS);
  const nextIds = new Set(next.map((item) => item.id));
  for (const prev of current) {
    if (!nextIds.has(prev.id)) {
      await deletePayloadFromIndexedDb(prev.id);
      if (prev.legacyStorageKey) {
        localStorage.removeItem(prev.legacyStorageKey);
      }
    }
  }
  setRecentProjects(next);
}

export async function loadRecentProject(id: string): Promise<ParseProjectResult> {
  const entry = getRecentProjects().find((item) => item.id === id);
  if (!entry) {
    return { data: null, error: "Recent project entry is not available." };
  }

  const fromIndexedDb = await loadPayloadFromIndexedDb(id);
  if (fromIndexedDb) {
    return parseProjectJSONResult(fromIndexedDb);
  }

  if (entry.legacyStorageKey) {
    const legacy = localStorage.getItem(entry.legacyStorageKey);
    if (legacy) {
      return parseProjectJSONResult(legacy);
    }
  }

  return { data: null, error: "Recent project payload is no longer available." };
}

export async function migrateLegacyRecentPayloads(): Promise<number> {
  const entries = getRecentProjects();
  if (entries.length === 0) return 0;

  let migrated = 0;
  const normalized: RecentProjectEntry[] = [];
  for (const entry of entries) {
    if (!entry.legacyStorageKey) {
      normalized.push(entry);
      continue;
    }

    const legacyJson = localStorage.getItem(entry.legacyStorageKey);
    if (!legacyJson) {
      normalized.push({ ...entry, legacyStorageKey: undefined });
      continue;
    }

    const parsed = parseProjectJSONResult(legacyJson);
    if (!parsed.data) {
      localStorage.removeItem(entry.legacyStorageKey);
      continue;
    }

    await savePayloadToIndexedDb(entry.id, legacyJson);
    localStorage.removeItem(entry.legacyStorageKey);
    normalized.push({
      ...entry,
      version: parsed.data.version,
      size: legacyJson.length,
      legacyStorageKey: undefined,
    });
    migrated += 1;
  }

  setRecentProjects(normalized.slice(0, MAX_RECENT_PROJECTS));
  return migrated;
}

export async function saveToLocalStorage(): Promise<boolean> {
  try {
    const data = serializeProject();
    const json = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, json);
    await persistRecentProject(data, json);
    return true;
  } catch {
    return false;
  }
}

export async function saveProject(): Promise<boolean> {
  const saved = await saveToLocalStorage();
  if (saved) {
    sceneStore.clearDirty();
  }
  return saved;
}

export function loadFromLocalStorage(): ProjectData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = parseProjectJSONResult(raw);
    return parsed.data;
  } catch {
    return null;
  }
}

export function parseProjectJSON(json: string): ProjectData | null {
  return parseProjectJSONResult(json).data;
}

export function parseProjectJSONResult(json: string): ParseProjectResult {
  try {
    const data = JSON.parse(json) as unknown;
    const migrated = migrateProjectDataToLatest(data);
    const validation = validateProjectDataDetailed(migrated.data);
    if (!validation.valid) {
      return { data: null, error: validation.error ?? "Project format is invalid." };
    }
    return { data: migrated.data as unknown as ProjectData, error: null };
  } catch {
    return { data: null, error: "File is not valid JSON." };
  }
}

export function downloadProjectJSON(): void {
  const data = serializeProject();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "motionforge-project.json";
  a.click();
  URL.revokeObjectURL(url);
}

function sanitizeBundleFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function getBundleAssetFileName(asset: ProjectAssetData): string {
  const baseName = sanitizeBundleFileName(asset.source.mode === "embedded" ? asset.source.fileName : asset.name);
  return `${sanitizeBundleFileName(asset.id)}-${baseName || "asset.bin"}`;
}

export function buildProjectBundleArtifact(data: ProjectData = serializeProject()): ProjectBundleArtifact {
  const bundleFiles: Record<string, Uint8Array> = {};
  const exportedAt = new Date().toISOString();
  const manifest = buildBundleManifest(data, exportedAt);

  bundleFiles["project.json"] = strToU8(JSON.stringify(data, null, 2));
  bundleFiles["motionforge-manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));

  if (data.assets) {
    const sortedAssets = [...data.assets].sort((a, b) => a.id.localeCompare(b.id));
    for (const asset of sortedAssets) {
      const deterministicName = getBundleAssetFileName(asset);
      if (asset.source.mode === "embedded") {
        bundleFiles[`assets/${deterministicName}`] = new Uint8Array(base64ToArrayBuffer(asset.source.data));
      } else {
        bundleFiles[`assets/${deterministicName}.external.txt`] = strToU8(
          `External asset reference: ${asset.source.path}`,
        );
      }
    }
  }

  const zipped = zipSync(bundleFiles, { level: 6 });
  const zipBytes = new Uint8Array(zipped.byteLength);
  zipBytes.set(zipped);
  return {
    fileName: "motionforge-bundle.zip",
    bytes: zipBytes,
    sizeBytes: zipBytes.byteLength,
    assetCount: data.assets?.length ?? 0,
  };
}

export function downloadProjectBundle(): void {
  const artifact = buildProjectBundleArtifact();
  const blobBytes = artifact.bytes.buffer.slice(
    artifact.bytes.byteOffset,
    artifact.bytes.byteOffset + artifact.bytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([blobBytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = artifact.fileName;
  a.click();
  URL.revokeObjectURL(url);
}
