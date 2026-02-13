import { beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { addTransformKeyframes, createEmptyClip } from "@motionforge/engine";
import { animationStore } from "../../state/animationStore.js";
import { sceneStore } from "../../state/sceneStore.js";
import { undoStore } from "../../state/undoStore.js";
import { DirectDragSession } from "./directDragSession.js";

function setupSelectedObject() {
  const obj = new THREE.Object3D();
  obj.name = "Cube";
  obj.position.set(0, 1, 0);
  sceneStore.registerObject(obj, "cube");
  sceneStore.setSelectedId("cube");
  return obj;
}

describe("DirectDragSession", () => {
  beforeEach(() => {
    animationStore.reset();
    undoStore.clear();
    sceneStore.clearRegistry();
    sceneStore.clearDirty();
  });

  it("commits a drag as one undoable command and preserves selection", () => {
    const obj = setupSelectedObject();
    const session = new DirectDragSession({
      object: obj,
      label: "Direct Drag",
      startGroundHit: new THREE.Vector3(0, 1, 0),
      startCameraHit: new THREE.Vector3(0, 1, 0),
      snapStep: 0.1,
    });

    const changed = session.update({
      mode: "ground",
      currentHit: new THREE.Vector3(1.27, 1, -0.33),
      snapEnabled: true,
    });

    expect(changed).toBe(true);
    expect(obj.position.x).toBeCloseTo(1.3, 6);
    expect(obj.position.y).toBeCloseTo(1, 6);
    expect(obj.position.z).toBeCloseTo(-0.3, 6);

    const committed = session.commit();
    expect(committed).toBe(true);
    expect(sceneStore.getSelectedId()).toBe("cube");
    expect(sceneStore.isDirty()).toBe(true);
    expect(undoStore.canUndo()).toBe(true);

    undoStore.undo();
    expect(obj.position).toEqual(new THREE.Vector3(0, 1, 0));
    expect(undoStore.canUndo()).toBe(false);
    expect(undoStore.canRedo()).toBe(true);

    undoStore.redo();
    expect(obj.position.x).toBeCloseTo(1.3, 6);
    expect(obj.position.y).toBeCloseTo(1, 6);
    expect(obj.position.z).toBeCloseTo(-0.3, 6);
  });

  it("cancels drag without dirty state or undo command", () => {
    const obj = setupSelectedObject();
    const session = new DirectDragSession({
      object: obj,
      label: "Direct Drag",
      startGroundHit: new THREE.Vector3(0, 1, 0),
      startCameraHit: new THREE.Vector3(0, 1, 0),
    });

    session.update({
      mode: "ground",
      currentHit: new THREE.Vector3(2, 1, 0),
      snapEnabled: false,
    });
    session.cancel();

    expect(obj.position).toEqual(new THREE.Vector3(0, 1, 0));
    expect(sceneStore.isDirty()).toBe(false);
    expect(undoStore.canUndo()).toBe(false);
  });

  it("applies world-space drag delta correctly for child objects", () => {
    const parent = new THREE.Group();
    parent.position.set(3, 0, -2);
    parent.rotation.y = Math.PI / 2;

    const child = new THREE.Object3D();
    child.position.set(1, 1, 0);
    parent.add(child);
    parent.updateWorldMatrix(true, true);

    sceneStore.registerObject(child, "child");
    sceneStore.setSelectedId("child");

    const startWorld = child.getWorldPosition(new THREE.Vector3());
    const session = new DirectDragSession({
      object: child,
      label: "Direct Drag",
      startGroundHit: startWorld.clone(),
      startCameraHit: startWorld.clone(),
    });

    session.update({
      mode: "ground",
      currentHit: startWorld.clone().add(new THREE.Vector3(1, 0, 0)),
      snapEnabled: false,
    });

    const nextWorld = child.getWorldPosition(new THREE.Vector3());
    expect(nextWorld.x).toBeCloseTo(startWorld.x + 1, 6);
    expect(nextWorld.y).toBeCloseTo(startWorld.y, 6);
    expect(nextWorld.z).toBeCloseTo(startWorld.z, 6);
  });

  it("does not mutate animation keyframes while dragging", () => {
    const obj = setupSelectedObject();
    const clip = createEmptyClip(3);
    addTransformKeyframes(clip, "cube", "position", 0.5, { x: 0, y: 1, z: 0 });
    animationStore.setClip(clip, { markDirty: false });

    const before = animationStore.getClip();
    const session = new DirectDragSession({
      object: obj,
      label: "Direct Drag",
      startGroundHit: new THREE.Vector3(0, 1, 0),
      startCameraHit: new THREE.Vector3(0, 1, 0),
    });

    session.update({
      mode: "ground",
      currentHit: new THREE.Vector3(1, 1, 0),
      snapEnabled: false,
    });
    session.commit();

    expect(animationStore.getClip()).toEqual(before);
  });
});
