import * as THREE from "three";
import { sceneStore } from "../../state/sceneStore.js";
import { animationStore } from "../../state/animationStore.js";
import { undoStore } from "../../state/undoStore.js";
import { assetStore } from "../../state/assetStore.js";
import { timelineStore } from "../../state/timelineStore.js";
import { disposeObject } from "../three/disposeObject.js";
import {
  annotateImportedHierarchy,
  applyMaterialOverrides,
  base64ToArrayBuffer,
  parseGltfFromArrayBuffer,
} from "../three/importGltf.js";
import type { Clip } from "@motionforge/engine";
import type { ProjectAssetData, ProjectData, ProjectObjectData, ProjectModelInstanceData } from "./serialize.js";

function createGeometry(type: ProjectObjectData["geometryType"]): THREE.BufferGeometry {
  switch (type) {
    case "box":
      return new THREE.BoxGeometry(1, 1, 1);
    case "sphere":
      return new THREE.SphereGeometry(0.5, 32, 32);
    case "cone":
      return new THREE.ConeGeometry(0.5, 1, 32);
  }
}

/**
 * Remove all user objects from the scene, dispose them, and clear the registry.
 * Keeps helpers and lights intact.
 */
export function clearUserObjects(): void {
  const scene = sceneStore.getScene();
  if (!scene) return;

  const registered = new Set(sceneStore.getAllUserObjects().map((obj) => sceneStore.getIdForObject(obj)));
  const toRemove: THREE.Object3D[] = [];
  for (const obj of sceneStore.getAllUserObjects()) {
    const parentId = obj.parent ? sceneStore.getIdForObject(obj.parent) : null;
    if (parentId && registered.has(parentId)) continue;
    toRemove.push(obj);
  }

  for (const obj of toRemove) {
    scene.remove(obj);
    disposeObject(obj);
  }

  sceneStore.clearRegistry();
}

function applyPrimitiveMaterial(mesh: THREE.Mesh, objData: ProjectObjectData): void {
  const material = mesh.material;
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  if (typeof objData.metallic === "number") {
    material.metalness = Math.max(0, Math.min(1, objData.metallic));
  }
  if (typeof objData.roughness === "number") {
    material.roughness = Math.max(0, Math.min(1, objData.roughness));
  }
}

async function loadModelInstance(
  assetsById: Map<string, ProjectAssetData>,
  instance: ProjectModelInstanceData,
): Promise<THREE.Object3D> {
  const asset = assetsById.get(instance.assetId);
  if (!asset) {
    throw new Error(`Model instance "${instance.name}" references missing asset "${instance.assetId}".`);
  }
  if (asset.type !== "gltf") {
    throw new Error(`Asset "${asset.id}" has unsupported type "${asset.type}".`);
  }
  if (asset.source.mode !== "embedded") {
    throw new Error(`Asset "${asset.id}" must be embedded for web import.`);
  }

  const arrayBuffer = base64ToArrayBuffer(asset.source.data);
  const root = await parseGltfFromArrayBuffer(arrayBuffer);

  annotateImportedHierarchy(root, asset.id, asset.name);
  root.name = instance.name;
  root.position.set(...instance.position);
  root.rotation.set(...instance.rotation);
  root.scale.set(...instance.scale);
  if (instance.materialOverrides && instance.materialOverrides.length > 0) {
    applyMaterialOverrides(root, instance.materialOverrides);
  }

  return root;
}

interface StagedObject {
  id: string;
  object: THREE.Object3D;
  isModelRoot: boolean;
}

interface StagedProjectLoad {
  objects: StagedObject[];
  assets: ProjectAssetData[];
  animation: Clip | null;
  camera: ProjectData["camera"];
}

function disposeStagedObjects(staged: StagedObject[]): void {
  for (const entry of staged) {
    disposeObject(entry.object);
  }
}

async function dryRunDeserializeProject(data: ProjectData): Promise<StagedProjectLoad> {
  const stagedObjects: StagedObject[] = [];
  const stagedAssets = structuredClone(data.assets ?? []);
  const stagedAnimation = data.animation ? structuredClone(data.animation) : null;
  const stagedCamera = data.camera ? structuredClone(data.camera) : undefined;

  try {
    for (const objData of data.objects) {
      const geo = createGeometry(objData.geometryType);
      const mat = new THREE.MeshStandardMaterial({ color: objData.color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = objData.name;
      mesh.position.set(...objData.position);
      mesh.rotation.set(...objData.rotation);
      mesh.scale.set(...objData.scale);
      applyPrimitiveMaterial(mesh, objData);

      stagedObjects.push({
        id: objData.id,
        object: mesh,
        isModelRoot: false,
      });
    }

    if (data.modelInstances && data.modelInstances.length > 0) {
      const assetsById = new Map(stagedAssets.map((asset) => [asset.id, asset]));
      for (const instance of data.modelInstances) {
        const root = await loadModelInstance(assetsById, instance);
        stagedObjects.push({
          id: instance.id,
          object: root,
          isModelRoot: true,
        });
      }
    }

    return {
      objects: stagedObjects,
      assets: stagedAssets,
      animation: stagedAnimation,
      camera: stagedCamera,
    };
  } catch (error) {
    disposeStagedObjects(stagedObjects);
    throw error;
  }
}

function commitStagedProjectLoad(staged: StagedProjectLoad): THREE.Object3D[] {
  const scene = sceneStore.getScene();
  if (!scene) {
    disposeStagedObjects(staged.objects);
    return [];
  }

  clearUserObjects();
  assetStore.replaceAssets(staged.assets);

  const created: THREE.Object3D[] = [];
  for (const entry of staged.objects) {
    scene.add(entry.object);
    if (entry.isModelRoot) {
      sceneStore.registerHierarchy(entry.object, { rootId: entry.id });
    } else {
      sceneStore.registerObject(entry.object, entry.id);
    }
    created.push(entry.object);
  }

  if (staged.camera) {
    const cam = sceneStore.getCamera();
    const target = sceneStore.getControlsTarget();
    if (cam) {
      cam.position.set(...staged.camera.position);
      cam.fov = staged.camera.fov;
      cam.updateProjectionMatrix();
    }
    if (target) {
      target.set(...staged.camera.target);
    }
  }

  if (staged.animation) {
    animationStore.setClip(staged.animation);
  } else {
    animationStore.reset();
  }

  undoStore.clear();
  timelineStore.clearAllUiState();
  sceneStore.clearDirty();
  return created;
}

/**
 * Build default scene objects (cube, sphere, cone).
 */
export function createDefaultObjects(): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];

  const cubeMat = new THREE.MeshStandardMaterial({ color: 0x4488ff });
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), cubeMat);
  cube.name = "Cube";
  cube.position.set(0, 0.5, 0);
  meshes.push(cube);

  const sphereMat = new THREE.MeshStandardMaterial({ color: 0x44cc66 });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 32), sphereMat);
  sphere.name = "Sphere";
  sphere.position.set(2, 0.5, 0);
  meshes.push(sphere);

  const coneMat = new THREE.MeshStandardMaterial({ color: 0xcc6644 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 32), coneMat);
  cone.name = "Cone";
  cone.position.set(-2, 0.5, 0);
  meshes.push(cone);

  return meshes;
}

/**
 * Deserialize a project: clear existing user objects, then recreate from data.
 * Supports v1 (no animation) and v2 (with animation) formats.
 */
export async function deserializeProject(data: ProjectData): Promise<THREE.Object3D[]> {
  const staged = await dryRunDeserializeProject(data);
  return commitStagedProjectLoad(staged);
}

/**
 * Reset to a new project with default objects.
 */
export function newProject(): THREE.Mesh[] {
  const scene = sceneStore.getScene();
  if (!scene) return [];

  clearUserObjects();
  assetStore.clearAssets();

  const meshes = createDefaultObjects();
  for (const mesh of meshes) {
    scene.add(mesh);
    sceneStore.registerObject(mesh);
  }

  // Reset camera
  const cam = sceneStore.getCamera();
  const target = sceneStore.getControlsTarget();
  if (cam) {
    cam.position.set(4, 3, 4);
    cam.lookAt(0, 0, 0);
  }
  if (target) {
    target.set(0, 0, 0);
  }

  animationStore.reset();
  undoStore.clear();
  timelineStore.clearAllUiState();
  sceneStore.clearDirty();
  return meshes;
}
