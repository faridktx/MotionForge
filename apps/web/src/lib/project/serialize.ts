import { sceneStore } from "../../state/sceneStore.js";
import { animationStore } from "../../state/animationStore.js";
import { assetStore, type AssetRecord, type MaterialOverrideRecord } from "../../state/assetStore.js";
import type { Clip } from "@motionforge/engine";
import { validateProjectDataDetailed } from "@motionforge/engine";
import { collectMaterialOverrides, base64ToArrayBuffer } from "../three/importGltf.js";
import { strToU8, zipSync } from "fflate";

export const PROJECT_VERSION = 3;
const STORAGE_KEY = "motionforge_project";

export interface ProjectObjectData {
  id: string;
  name: string;
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
  assetId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  materialOverrides?: MaterialOverrideRecord[];
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

function detectGeometryType(obj: THREE.Mesh): "box" | "sphere" | "cone" | null {
  const geo = obj.geometry;
  if (!geo) return null;
  const geoType = geo.type;
  if (geoType === "BoxGeometry") return "box";
  if (geoType === "SphereGeometry") return "sphere";
  if (geoType === "ConeGeometry") return "cone";
  return null;
}

import type * as THREE from "three";

export function serializeProject(): ProjectData {
  const objects: ProjectObjectData[] = [];
  const modelInstances: ProjectModelInstanceData[] = [];

  for (const obj of sceneStore.getAllUserObjects()) {
    const assetId = typeof obj.userData.__assetId === "string" ? obj.userData.__assetId as string : null;
    if (assetId && obj.userData.__isModelRoot) {
      const id = sceneStore.getIdForObject(obj);
      if (!id) continue;
      const materialOverrides = collectMaterialOverrides(obj);
      modelInstances.push({
        id,
        name: obj.name,
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
    data.animation = clip;
  }

  return data;
}

export function saveToLocalStorage(): boolean {
  try {
    const data = serializeProject();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function saveProject(): boolean {
  const saved = saveToLocalStorage();
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
    const validation = validateProjectDataDetailed(data);
    if (!validation.valid) {
      return { data: null, error: validation.error ?? "Project format is invalid." };
    }
    return { data: data as ProjectData, error: null };
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

export function downloadProjectBundle(): void {
  const data = serializeProject();
  const bundleFiles: Record<string, Uint8Array> = {};

  bundleFiles["project.json"] = strToU8(JSON.stringify(data, null, 2));

  if (data.assets) {
    for (const asset of data.assets) {
      if (asset.source.mode === "embedded") {
        const fileName = sanitizeBundleFileName(asset.source.fileName || asset.name || `${asset.id}.bin`);
        bundleFiles[`assets/${fileName}`] = new Uint8Array(base64ToArrayBuffer(asset.source.data));
      } else {
        const manifestName = sanitizeBundleFileName(asset.name || `${asset.id}.txt`);
        bundleFiles[`assets/${manifestName}.external.txt`] = strToU8(
          `External asset reference: ${asset.source.path}`,
        );
      }
    }
  }

  const zipped = zipSync(bundleFiles, { level: 6 });
  const zipBytes = new Uint8Array(zipped.byteLength);
  zipBytes.set(zipped);
  const blob = new Blob([zipBytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "motionforge-bundle.zip";
  a.click();
  URL.revokeObjectURL(url);
}
