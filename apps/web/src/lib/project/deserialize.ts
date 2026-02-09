import * as THREE from "three";
import { sceneStore } from "../../state/sceneStore.js";
import { animationStore } from "../../state/animationStore.js";
import { undoStore } from "../../state/undoStore.js";
import { disposeObject } from "../three/disposeObject.js";
import type { ProjectData, ProjectObjectData } from "./serialize.js";

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

  const toRemove: THREE.Object3D[] = [];
  for (const obj of sceneStore.getAllUserObjects()) {
    toRemove.push(obj);
  }

  for (const obj of toRemove) {
    scene.remove(obj);
    disposeObject(obj);
  }

  sceneStore.clearRegistry();
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
export function deserializeProject(data: ProjectData): THREE.Mesh[] {
  const scene = sceneStore.getScene();
  if (!scene) return [];

  clearUserObjects();

  const meshes: THREE.Mesh[] = [];

  for (const objData of data.objects) {
    const geo = createGeometry(objData.geometryType);
    const mat = new THREE.MeshStandardMaterial({ color: objData.color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = objData.name;
    mesh.position.set(...objData.position);
    mesh.rotation.set(...objData.rotation);
    mesh.scale.set(...objData.scale);

    scene.add(mesh);
    sceneStore.registerObject(mesh, objData.id);
    meshes.push(mesh);
  }

  // Restore camera if present
  if (data.camera) {
    const cam = sceneStore.getCamera();
    const target = sceneStore.getControlsTarget();
    if (cam) {
      cam.position.set(...data.camera.position);
      cam.fov = data.camera.fov;
      cam.updateProjectionMatrix();
    }
    if (target) {
      target.set(...data.camera.target);
    }
  }

  // Restore animation (v2) or reset (v1)
  if (data.animation) {
    animationStore.setClip(data.animation);
  } else {
    animationStore.reset();
  }

  undoStore.clear();
  sceneStore.clearDirty();
  return meshes;
}

/**
 * Reset to a new project with default objects.
 */
export function newProject(): THREE.Mesh[] {
  const scene = sceneStore.getScene();
  if (!scene) return [];

  clearUserObjects();

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
  sceneStore.clearDirty();
  return meshes;
}
