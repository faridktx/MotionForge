import { sceneStore } from "../../state/sceneStore.js";
import { animationStore } from "../../state/animationStore.js";
import type { Clip } from "@motionforge/engine";

export const PROJECT_VERSION = 2;
const STORAGE_KEY = "motionforge_project";

export interface ProjectObjectData {
  id: string;
  name: string;
  geometryType: "box" | "sphere" | "cone";
  color: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface ProjectData {
  version: number;
  objects: ProjectObjectData[];
  camera?: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  };
  animation?: Clip;
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

  for (const obj of sceneStore.getAllUserObjects()) {
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
      position: [obj.position.x, obj.position.y, obj.position.z],
      rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
      scale: [obj.scale.x, obj.scale.y, obj.scale.z],
    });
  }

  const data: ProjectData = {
    version: PROJECT_VERSION,
    objects,
  };

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

export function loadFromLocalStorage(): ProjectData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ProjectData;
  } catch {
    return null;
  }
}

export function parseProjectJSON(json: string): ProjectData | null {
  try {
    const data = JSON.parse(json) as ProjectData;
    if (!data.version || !Array.isArray(data.objects)) return null;
    return data;
  } catch {
    return null;
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
