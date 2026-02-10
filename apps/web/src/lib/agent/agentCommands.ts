import * as THREE from "three";
import type { Interpolation } from "@motionforge/engine";
import { animationStore, type KeyframeRecord } from "../../state/animationStore.js";
import { assetStore } from "../../state/assetStore.js";
import { sceneStore } from "../../state/sceneStore.js";
import { undoStore } from "../../state/undoStore.js";
import { commandBus } from "../commands/commandBus.js";
import { estimateVideoExportSeconds, normalizeVideoExportSettings, validateVideoExportSettings } from "../export/videoExport.js";
import { buildProjectBundleArtifact } from "../project/serialize.js";
import {
  annotateImportedHierarchy,
  arrayBufferToBase64,
  parseGltfFromArrayBuffer,
  summarizeImportedScene,
  toEmbeddedAssetRecord,
  validateImportBudget,
} from "../three/importGltf.js";

const DEV_TOOLS_KEY = "motionforge_dev_tools_enabled_v1";
let registered = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function parseColorValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(0xffffff, Math.round(value)));
  }
  if (typeof value === "string") {
    const normalized = value.trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
    return Number.parseInt(normalized, 16);
  }
  return null;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hashText(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
}

function parseRenamePayload(payload: unknown): Array<{ objectId: string; name: string }> {
  if (!isRecord(payload) || !Array.isArray(payload.changes)) {
    throw new Error("Invalid rename payload");
  }
  const changes: Array<{ objectId: string; name: string }> = [];
  for (const item of payload.changes) {
    if (!isRecord(item)) continue;
    if (typeof item.objectId !== "string" || typeof item.name !== "string") continue;
    if (item.name.trim().length === 0) continue;
    changes.push({ objectId: item.objectId, name: item.name.trim() });
  }
  return changes;
}

function parseMaterialPayload(payload: unknown): {
  objectId: string;
  baseColor?: number;
  metallic?: number;
  roughness?: number;
} {
  if (!isRecord(payload) || typeof payload.objectId !== "string") {
    throw new Error("Invalid material payload");
  }
  const baseColor = payload.baseColor !== undefined ? parseColorValue(payload.baseColor) : undefined;
  if (payload.baseColor !== undefined && baseColor === null) {
    throw new Error("baseColor must be hex string (#RRGGBB) or finite number.");
  }
  const metallic = typeof payload.metallic === "number" ? clampUnit(payload.metallic) : undefined;
  const roughness = typeof payload.roughness === "number" ? clampUnit(payload.roughness) : undefined;

  return {
    objectId: payload.objectId,
    baseColor: baseColor ?? undefined,
    metallic,
    roughness,
  };
}

function parseInterpolation(value: unknown): Interpolation {
  if (value === "step" || value === "easeIn" || value === "easeOut" || value === "easeInOut") {
    return value;
  }
  return "linear";
}

function parseInsertKeyframesPayload(payload: unknown): { records: KeyframeRecord[]; label?: string } {
  if (!isRecord(payload) || !Array.isArray(payload.records)) {
    throw new Error("Invalid keyframe insert payload");
  }

  const records: KeyframeRecord[] = [];
  for (const item of payload.records) {
    if (!isRecord(item)) continue;
    if (typeof item.objectId !== "string") continue;
    if (typeof item.propertyPath !== "string") continue;
    if (typeof item.time !== "number" || !Number.isFinite(item.time)) continue;
    if (typeof item.value !== "number" || !Number.isFinite(item.value)) continue;
    records.push({
      objectId: item.objectId,
      propertyPath: item.propertyPath as KeyframeRecord["propertyPath"],
      time: item.time,
      value: item.value,
      interpolation: parseInterpolation(item.interpolation),
    });
  }

  return {
    records,
    label: typeof payload.label === "string" ? payload.label : undefined,
  };
}

function parseVideoPreviewPayload(payload: unknown) {
  if (!isRecord(payload)) {
    throw new Error("Invalid export video payload");
  }
  const settings = {
    format: payload.format === "gif" ? "gif" : "mp4",
    width: typeof payload.width === "number" ? payload.width : 1280,
    height: typeof payload.height === "number" ? payload.height : 720,
    fps: typeof payload.fps === "number" ? payload.fps : 30,
    durationSeconds: typeof payload.durationSeconds === "number" ? payload.durationSeconds : 2,
    transparentBackground: !!payload.transparentBackground,
  } as const;
  const errors = validateVideoExportSettings(settings);
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }
  const normalized = normalizeVideoExportSettings(settings);
  return {
    settings: normalized,
    estimatedSeconds: estimateVideoExportSeconds(normalized),
  };
}

function parseImportModelPayload(payload: unknown): { url: string } {
  if (!isRecord(payload) || typeof payload.url !== "string" || payload.url.trim().length === 0) {
    throw new Error("Invalid model import URL payload");
  }
  return { url: payload.url.trim() };
}

export function ensureAgentCommandsRegistered(): void {
  if (registered) return;
  registered = true;

  commandBus.register({
    id: "agent.selection.setObject",
    title: "Agent: Set Object Selection",
    category: "Agent",
    run(payload) {
      if (!isRecord(payload) || (payload.objectId !== null && typeof payload.objectId !== "string")) {
        throw new Error("Invalid selection payload");
      }
      sceneStore.setSelectedId((payload.objectId as string | null) ?? null);
      return { selectedObjectId: sceneStore.getSelectedId() };
    },
  });

  commandBus.register({
    id: "agent.hierarchy.renameMany",
    title: "Agent: Rename Hierarchy Nodes",
    category: "Agent",
    run(payload) {
      const changes = parseRenamePayload(payload);
      if (changes.length === 0) {
        return { changed: 0 };
      }

      const before = changes
        .map((change) => {
          const object = sceneStore.getObjectById(change.objectId);
          if (!object) return null;
          return {
            objectId: change.objectId,
            beforeName: object.name,
            afterName: change.name,
          };
        })
        .filter((item): item is { objectId: string; beforeName: string; afterName: string } => item !== null);

      if (before.length === 0) {
        return { changed: 0 };
      }

      undoStore.push({
        label: "Agent Rename Hierarchy",
        do() {
          for (const item of before) {
            sceneStore.renameObject(item.objectId, item.afterName);
          }
        },
        undo() {
          for (const item of before) {
            sceneStore.renameObject(item.objectId, item.beforeName);
          }
        },
      });

      return {
        changed: before.length,
      };
    },
  });

  commandBus.register({
    id: "agent.material.set",
    title: "Agent: Set Material",
    category: "Agent",
    run(payload) {
      const parsed = parseMaterialPayload(payload);
      const object = sceneStore.getObjectById(parsed.objectId);
      if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) {
        throw new Error(`Object "${parsed.objectId}" is not a MeshStandardMaterial target.`);
      }

      const material = object.material;
      const before = {
        color: material.color.getHex(),
        metallic: material.metalness,
        roughness: material.roughness,
      };
      const after = {
        color: parsed.baseColor ?? before.color,
        metallic: parsed.metallic ?? before.metallic,
        roughness: parsed.roughness ?? before.roughness,
      };

      undoStore.push({
        label: "Agent Set Material",
        do() {
          material.color.setHex(after.color);
          material.metalness = after.metallic;
          material.roughness = after.roughness;
          material.needsUpdate = true;
          sceneStore.notifyObjectsChanged();
        },
        undo() {
          material.color.setHex(before.color);
          material.metalness = before.metallic;
          material.roughness = before.roughness;
          material.needsUpdate = true;
          sceneStore.notifyObjectsChanged();
        },
      });

      return {
        objectId: parsed.objectId,
        material: after,
      };
    },
  });

  commandBus.register({
    id: "agent.animation.insertRecords",
    title: "Agent: Insert Keyframes",
    category: "Agent",
    run(payload) {
      const parsed = parseInsertKeyframesPayload(payload);
      const inserted = animationStore.insertKeyframes(parsed.records, {
        label: parsed.label ?? "Agent Insert Keyframes",
        source: "agent",
      });
      return {
        insertedCount: inserted.length,
      };
    },
  });

  commandBus.register({
    id: "agent.project.exportBundle",
    title: "Agent: Export Bundle",
    category: "Agent",
    run(payload) {
      const includeData = isRecord(payload) ? payload.includeData !== false : true;
      const artifact = buildProjectBundleArtifact();
      return {
        fileName: artifact.fileName,
        sizeBytes: artifact.sizeBytes,
        assetCount: artifact.assetCount,
        base64Data: includeData ? bytesToBase64(artifact.bytes) : undefined,
      };
    },
  });

  commandBus.register({
    id: "agent.project.exportVideoPreview",
    title: "Agent: Export Video Preview",
    category: "Agent",
    run(payload) {
      const parsed = parseVideoPreviewPayload(payload);
      return {
        mode: "preview-only",
        settings: parsed.settings,
        estimatedSeconds: parsed.estimatedSeconds,
      };
    },
  });

  commandBus.register({
    id: "agent.project.importModelFromUrl",
    title: "Agent: Import Model From URL",
    category: "Agent",
    run: async (payload) => {
      const parsed = parseImportModelPayload(payload);
      if (localStorage.getItem(DEV_TOOLS_KEY) !== "1") {
        throw new Error("Model import from URL requires Dev Tools mode.");
      }

      const scene = sceneStore.getScene();
      if (!scene) {
        throw new Error("Scene is not ready.");
      }

      const response = await fetch(parsed.url);
      if (!response.ok) {
        throw new Error(`Unable to download model (${response.status}).`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const root = await parseGltfFromArrayBuffer(arrayBuffer);
      const summary = summarizeImportedScene(root);
      const budgetError = validateImportBudget(summary);
      if (budgetError) {
        throw new Error(budgetError);
      }

      const fileName = (() => {
        try {
          const url = new URL(parsed.url, window.location.href);
          const part = url.pathname.split("/").pop();
          return part && part.length > 0 ? part : "imported-model.glb";
        } catch {
          return "imported-model.glb";
        }
      })();

      const assetId = `asset_url_${hashText(parsed.url)}`;
      annotateImportedHierarchy(root, assetId, fileName);
      scene.add(root);
      const ids = sceneStore.registerHierarchy(root, { markDirty: true });
      const rootId = ids[0] ?? null;
      if (rootId) {
        sceneStore.setSelectedId(rootId);
      }

      const file = new File([arrayBuffer], fileName, { type: "model/gltf-binary" });
      const asset = toEmbeddedAssetRecord(file, assetId, arrayBufferToBase64(arrayBuffer));
      assetStore.addAsset(asset);

      return {
        assetId,
        objectId: rootId,
        summary,
      };
    },
  });
}
