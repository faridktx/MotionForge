import { addTransformKeyframes, createEmptyClip } from "@motionforge/engine";
import { beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { animationStore } from "../../state/animationStore.js";
import { sceneStore } from "../../state/sceneStore.js";
import { undoStore } from "../../state/undoStore.js";
import {
  addPrimitiveObject,
  deleteSelectedObject,
  duplicateSelectedObject,
  parentObject,
  selectObjectByName,
  unparentObject,
} from "./objectCommands.js";
import { deserializeProject } from "../project/deserialize.js";
import { serializeProject } from "../project/serialize.js";

function setupScene() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  const target = new THREE.Vector3();
  sceneStore.setScene(scene, camera, target);
  sceneStore.clearRegistry();
  sceneStore.setSelectedId(null);
  sceneStore.clearDirty();
  animationStore.reset();
  undoStore.clear();
  return scene;
}

function addCube(scene: THREE.Scene, id: string, name = "Cube") {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x4488ff }),
  );
  mesh.name = name;
  mesh.position.set(1, 0.5, 2);
  scene.add(mesh);
  sceneStore.registerObject(mesh, id);
  return mesh;
}

describe("objectCommands", () => {
  beforeEach(() => {
    setupScene();
  });

  it("addPrimitiveObject registers object, selects it, and marks dirty", () => {
    const scene = sceneStore.getScene();
    expect(scene).toBeTruthy();
    addCube(scene!, "cube_1", "Cube");
    sceneStore.clearDirty();

    const objectId = addPrimitiveObject("box");

    const created = objectId ? sceneStore.getObjectById(objectId) : null;
    expect(created).toBeTruthy();
    expect(created?.name).toBe("Cube 2");
    expect(sceneStore.getSelectedId()).toBe(objectId);
    expect(sceneStore.isDirty()).toBe(true);
  });

  it("undo add removes object and redo restores it", () => {
    const objectId = addPrimitiveObject("sphere");
    expect(objectId).toBeTruthy();
    expect(sceneStore.getObjectById(objectId!)).toBeTruthy();

    undoStore.undo();
    expect(sceneStore.getObjectById(objectId!)).toBeUndefined();

    undoStore.redo();
    expect(sceneStore.getObjectById(objectId!)).toBeTruthy();
  });

  it("deleteSelectedObject removes selected object and undo restores object and tracks", () => {
    const scene = sceneStore.getScene();
    expect(scene).toBeTruthy();

    const cube = addCube(scene!, "cube_1", "Cube");
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x44cc66 }),
    );
    sphere.name = "Sphere";
    scene!.add(sphere);
    sceneStore.registerObject(sphere, "sphere_1");

    const clip = createEmptyClip(3);
    addTransformKeyframes(clip, "cube_1", "position", 0, { x: 1, y: 0.5, z: 2 });
    addTransformKeyframes(clip, "sphere_1", "position", 0, { x: 0, y: 0.5, z: 0 });
    animationStore.setClip(clip, { markDirty: false });

    sceneStore.setSelectedId("cube_1");

    const removedId = deleteSelectedObject();
    expect(removedId).toBe("cube_1");
    expect(sceneStore.getObjectById("cube_1")).toBeUndefined();
    expect(animationStore.getClip().tracks.some((track) => track.objectId === "cube_1")).toBe(false);

    undoStore.undo();

    const restored = sceneStore.getObjectById("cube_1") as THREE.Mesh | undefined;
    expect(restored).toBeTruthy();
    expect(restored?.name).toBe("Cube");
    expect(restored?.position.x).toBeCloseTo(cube.position.x);
    expect(restored?.position.y).toBeCloseTo(cube.position.y);
    expect(restored?.position.z).toBeCloseTo(cube.position.z);
    expect((restored?.material as THREE.MeshStandardMaterial).color.getHex()).toBe(
      (cube.material as THREE.MeshStandardMaterial).color.getHex(),
    );
    expect(animationStore.getClip().tracks.some((track) => track.objectId === "cube_1")).toBe(true);
  });

  it("duplicateSelectedObject creates a new id, preserves fields, and selects the duplicate", () => {
    const scene = sceneStore.getScene();
    expect(scene).toBeTruthy();

    const cube = addCube(scene!, "cube_1", "Cube");
    cube.rotation.set(0.1, 0.2, 0.3);
    cube.scale.set(1.2, 0.9, 1.4);

    const clip = createEmptyClip(2);
    addTransformKeyframes(clip, "cube_1", "position", 0.5, { x: 1, y: 2, z: 3 });
    animationStore.setClip(clip, { markDirty: false });

    sceneStore.setSelectedId("cube_1");
    const duplicateId = duplicateSelectedObject();

    expect(duplicateId).toBeTruthy();
    expect(duplicateId).not.toBe("cube_1");
    expect(sceneStore.getSelectedId()).toBe(duplicateId);

    const duplicate = sceneStore.getObjectById(duplicateId!) as THREE.Mesh | undefined;
    expect(duplicate).toBeTruthy();
    expect(duplicate?.geometry.type).toBe(cube.geometry.type);
    expect((duplicate?.material as THREE.MeshStandardMaterial).color.getHex()).toBe(
      (cube.material as THREE.MeshStandardMaterial).color.getHex(),
    );
    expect(duplicate?.position).toEqual(cube.position);
    expect(duplicate?.rotation.x).toBeCloseTo(cube.rotation.x);
    expect(duplicate?.rotation.y).toBeCloseTo(cube.rotation.y);
    expect(duplicate?.rotation.z).toBeCloseTo(cube.rotation.z);
    expect(duplicate?.scale).toEqual(cube.scale);

    const duplicateTracks = animationStore.getClip().tracks.filter((track) => track.objectId === duplicateId);
    expect(duplicateTracks).toHaveLength(3);
    expect(duplicateTracks.map((track) => track.property).sort()).toEqual([
      "position.x",
      "position.y",
      "position.z",
    ]);
  });

  it("serializes and deserializes added primitives", async () => {
    const createdId = addPrimitiveObject("cone");
    expect(createdId).toBeTruthy();

    const exported = serializeProject();
    expect(exported.objects.some((item) => item.id === createdId)).toBe(true);

    await deserializeProject(exported);

    const restored = sceneStore.getObjectById(createdId!);
    expect(restored).toBeTruthy();
    expect(restored?.name).toContain("Cone");
  });

  it("returns ambiguous candidates when selecting by duplicate name", () => {
    const scene = sceneStore.getScene();
    expect(scene).toBeTruthy();
    addCube(scene!, "cube_1", "Cube");
    addCube(scene!, "cube_2", "Cube");

    const result = selectObjectByName("Cube");
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidates).toEqual(["cube_1", "cube_2"]);
    }
  });

  it("parents and unparents objects with undo/redo symmetry", () => {
    const scene = sceneStore.getScene();
    expect(scene).toBeTruthy();
    const parent = addCube(scene!, "cube_parent", "Parent");
    const child = addCube(scene!, "cube_child", "Child");

    const parented = parentObject("cube_child", "cube_parent");
    expect(parented).toBe(true);
    expect(child.parent).toBe(parent);

    undoStore.undo();
    expect(child.parent).toBe(scene);

    undoStore.redo();
    expect(child.parent).toBe(parent);

    const unparented = unparentObject("cube_child");
    expect(unparented).toBe(true);
    expect(child.parent).toBe(scene);
  });
});
