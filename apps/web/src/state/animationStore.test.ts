import "fake-indexeddb/auto";
import { addTransformKeyframes, createEmptyClip } from "@motionforge/engine";
import { beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { saveAutosaveSnapshot, saveProject } from "../lib/project/serialize.js";
import { animationStore } from "./animationStore.js";
import { sceneStore } from "./sceneStore.js";
import { undoStore } from "./undoStore.js";
import type { SelectedKeyframeRef } from "./animationStore.js";

const ALL_PROPS = [
  "position.x",
  "position.y",
  "position.z",
  "rotation.x",
  "rotation.y",
  "rotation.z",
  "scale.x",
  "scale.y",
  "scale.z",
];

function setupSelectedObject(): THREE.Object3D {
  const obj = new THREE.Object3D();
  obj.name = "Cube";
  obj.position.set(1, 2, 3);
  obj.rotation.set(0.1, 0.2, 0.3);
  obj.scale.set(1.1, 1.2, 1.3);

  sceneStore.registerObject(obj, "cube");
  sceneStore.setSelectedId("cube");
  return obj;
}

function timesFor(propertyPath: "position.x" | "position.y" | "position.z"): number[] {
  return animationStore
    .getKeyframesForObject("cube", [propertyPath])
    .map((keyframe) => keyframe.time);
}

describe("animationStore undo and dirty behavior", () => {
  beforeEach(() => {
    undoStore.clear();
    animationStore.reset();
    sceneStore.clearRegistry();
    sceneStore.clearDirty();
    sceneStore.setSelectedId(null);
    localStorage.clear();
    setupSelectedObject();
  });

  it("moves selected keyframes with one undoable command and exact undo restore", () => {
    const clip = createEmptyClip(3);
    addTransformKeyframes(clip, "cube", "position", 0.5, { x: 1, y: 2, z: 3 });
    addTransformKeyframes(clip, "cube", "position", 1.5, { x: 4, y: 5, z: 6 });
    animationStore.setClip(clip, { markDirty: false });
    undoStore.clear();
    sceneStore.clearDirty();

    const refs: SelectedKeyframeRef[] = [
      { objectId: "cube", propertyPath: "position.x", time: 0.5 },
      { objectId: "cube", propertyPath: "position.x", time: 1.5 },
    ];
    const beforeTimes = timesFor("position.x");

    animationStore.moveKeyframes(refs, 0.4, { source: "timeline", label: "Move Keyframes" });
    expect(timesFor("position.x")).toEqual([0.9, 1.9]);
    expect(undoStore.canUndo()).toBe(true);

    undoStore.undo();
    expect(timesFor("position.x")).toEqual(beforeTimes);
    expect(undoStore.canUndo()).toBe(false);
    expect(undoStore.canRedo()).toBe(true);

    undoStore.redo();
    expect(timesFor("position.x")).toEqual([0.9, 1.9]);
  });

  it("restores identical keyframe metadata after delete undo", () => {
    const clip = createEmptyClip(5);
    addTransformKeyframes(clip, "cube", "position", 0.2, { x: 10, y: 11, z: 12 }, "step");
    addTransformKeyframes(clip, "cube", "position", 1.2, { x: 20, y: 21, z: 22 }, "linear");
    addTransformKeyframes(clip, "cube", "rotation", 1.2, { x: 1, y: 2, z: 3 }, "linear");
    animationStore.setClip(clip, { markDirty: false });
    undoStore.clear();
    sceneStore.clearDirty();

    const before = animationStore.getKeyframesForObject("cube");
    const deleted: SelectedKeyframeRef[] = [
      { objectId: "cube", propertyPath: "position.x", time: 1.2 },
      { objectId: "cube", propertyPath: "position.y", time: 1.2 },
      { objectId: "cube", propertyPath: "rotation.x", time: 1.2 },
      { objectId: "cube", propertyPath: "rotation.z", time: 1.2 },
    ];

    const removed = animationStore.removeKeyframes(deleted, { source: "timeline", label: "Delete Keyframes" });
    expect(removed).toBe(true);
    expect(animationStore.getKeyframesForObject("cube").length).toBe(before.length - 4);

    undoStore.undo();
    const restored = animationStore.getKeyframesForObject("cube");
    expect(restored).toEqual(before);
    expect(undoStore.canUndo()).toBe(false);
  });

  it("adds transform keys atomically and undoes in one step", () => {
    animationStore.scrubTo(0.75);
    undoStore.clear();
    sceneStore.clearDirty();

    const created = animationStore.addAllKeyframesForSelected({ source: "shortcut", label: "Keyframe Transform" });
    expect(created).toHaveLength(9);

    const keyframes = animationStore.getKeyframesForObject("cube");
    expect(keyframes).toHaveLength(9);
    expect(new Set(keyframes.map((item) => item.propertyPath))).toEqual(new Set(ALL_PROPS));
    expect(new Set(keyframes.map((item) => item.time))).toEqual(new Set([0.75]));

    undoStore.undo();
    expect(animationStore.getKeyframesForObject("cube")).toEqual([]);
    expect(undoStore.canUndo()).toBe(false);

    undoStore.redo();
    expect(animationStore.getKeyframesForObject("cube")).toHaveLength(9);
  });

  it("marks dirty on keyframe CRUD and clears dirty after save", async () => {
    sceneStore.clearDirty();
    expect(sceneStore.isDirty()).toBe(false);

    animationStore.addAllKeyframesForSelected({ source: "shortcut", label: "Keyframe Transform" });
    expect(sceneStore.isDirty()).toBe(true);

    sceneStore.clearDirty();
    const first = animationStore.getKeyframesForObject("cube")[0];
    const [moved] = animationStore.moveKeyframes(
      [{ objectId: first.objectId, propertyPath: first.propertyPath, time: first.time }],
      0.2,
      { source: "timeline", label: "Move Keyframes" },
    );
    expect(sceneStore.isDirty()).toBe(true);

    sceneStore.clearDirty();
    animationStore.setKeyframeValue(moved, 123, { source: "timeline", label: "Keyframe Value" });
    expect(sceneStore.isDirty()).toBe(true);

    sceneStore.clearDirty();
    animationStore.removeKeyframes([moved], { source: "timeline", label: "Delete Keyframes" });
    expect(sceneStore.isDirty()).toBe(true);

    const saved = await saveProject();
    expect(saved).toBe(true);
    expect(sceneStore.isDirty()).toBe(false);
  });

  it("inserts keyframes in a single undoable batch command", () => {
    const inserted = animationStore.insertKeyframes(
      [
        { objectId: "cube", propertyPath: "position.x", time: 1.5, value: 5, interpolation: "linear" },
        { objectId: "cube", propertyPath: "position.y", time: 1.8, value: 6, interpolation: "step" },
      ],
      { source: "timeline", label: "Paste Keyframes" },
    );

    expect(inserted).toHaveLength(2);
    expect(animationStore.getKeyframesForObject("cube", ["position.x"])[0].time).toBe(1.5);
    expect(animationStore.getKeyframesForObject("cube", ["position.y"])[0].time).toBe(1.8);
    expect(undoStore.canUndo()).toBe(true);

    undoStore.undo();
    expect(animationStore.getKeyframesForObject("cube")).toEqual([]);
  });

  it("applies nudge-style movement and restores on undo", () => {
    animationStore.insertKeyframes(
      [{ objectId: "cube", propertyPath: "scale.z", time: 1, value: 2, interpolation: "linear" }],
      { source: "timeline", label: "Insert Keyframes" },
    );
    undoStore.clear();

    const moved = animationStore.moveKeyframes(
      [{ objectId: "cube", propertyPath: "scale.z", time: 1 }],
      0.05,
      { source: "timeline", label: "Nudge Keyframes" },
    );
    expect(moved[0].time).toBe(1.05);

    undoStore.undo();
    const restored = animationStore.getKeyframesForObject("cube", ["scale.z"]);
    expect(restored[0].time).toBe(1);
  });

  it("updates interpolation to easing mode and restores on undo", () => {
    animationStore.insertKeyframes(
      [{ objectId: "cube", propertyPath: "position.x", time: 0.5, value: 3, interpolation: "linear" }],
      { source: "timeline", label: "Insert Keyframes" },
    );
    undoStore.clear();

    const updated = animationStore.setKeyframeInterpolation(
      { objectId: "cube", propertyPath: "position.x", time: 0.5 },
      "easeInOut",
      { source: "timeline", label: "Keyframe Interpolation" },
    );
    expect(updated).toEqual({ objectId: "cube", propertyPath: "position.x", time: 0.5 });

    const after = animationStore.getKeyframesForObject("cube", ["position.x"]);
    expect(after[0].interpolation).toBe("easeInOut");

    undoStore.undo();
    const restored = animationStore.getKeyframesForObject("cube", ["position.x"]);
    expect(restored[0].interpolation).toBe("linear");
  });

  it("autosave persists snapshot without clearing dirty flag", async () => {
    sceneStore.clearDirty();
    animationStore.addAllKeyframesForSelected({ source: "shortcut", label: "Keyframe Transform" });
    expect(sceneStore.isDirty()).toBe(true);

    const autosaved = await saveAutosaveSnapshot();
    expect(autosaved).toBe(true);
    expect(sceneStore.isDirty()).toBe(true);
  });

  it("moves only selected lane keys when dragging lane-scoped selection", () => {
    const clip = createEmptyClip(5);
    addTransformKeyframes(clip, "cube", "position", 1, { x: 2, y: 4, z: 6 });
    addTransformKeyframes(clip, "cube", "position", 2, { x: 3, y: 5, z: 7 });
    animationStore.setClip(clip, { markDirty: false });
    undoStore.clear();

    const moved = animationStore.moveKeyframes(
      [
        { objectId: "cube", propertyPath: "position.x", time: 1 },
        { objectId: "cube", propertyPath: "position.x", time: 2 },
      ],
      0.5,
      { source: "timeline", label: "Move Keyframes" },
    );
    expect(moved.map((item) => item.propertyPath)).toEqual(["position.x", "position.x"]);
    expect(moved.map((item) => item.time)).toEqual([1.5, 2.5]);

    expect(animationStore.getKeyframesForObject("cube", ["position.x"]).map((item) => item.time)).toEqual([1.5, 2.5]);
    expect(animationStore.getKeyframesForObject("cube", ["position.y"]).map((item) => item.time)).toEqual([1, 2]);
    expect(animationStore.getKeyframesForObject("cube", ["position.z"]).map((item) => item.time)).toEqual([1, 2]);
  });

  it("undo/redo restores exact lane keys after lane-scoped move", () => {
    const clip = createEmptyClip(5);
    addTransformKeyframes(clip, "cube", "rotation", 0.5, { x: 0.1, y: 0.2, z: 0.3 });
    addTransformKeyframes(clip, "cube", "rotation", 1.5, { x: 1.1, y: 1.2, z: 1.3 });
    animationStore.setClip(clip, { markDirty: false });
    undoStore.clear();

    const beforeX = animationStore.getKeyframesForObject("cube", ["rotation.x"]);
    const beforeY = animationStore.getKeyframesForObject("cube", ["rotation.y"]);

    animationStore.moveKeyframes(
      [{ objectId: "cube", propertyPath: "rotation.y", time: 0.5 }],
      0.4,
      { source: "timeline", label: "Move Keyframes" },
    );

    expect(animationStore.getKeyframesForObject("cube", ["rotation.y"]).map((item) => item.time)).toEqual([0.9, 1.5]);
    expect(animationStore.getKeyframesForObject("cube", ["rotation.x"])).toEqual(beforeX);

    undoStore.undo();
    expect(animationStore.getKeyframesForObject("cube", ["rotation.x"])).toEqual(beforeX);
    expect(animationStore.getKeyframesForObject("cube", ["rotation.y"])).toEqual(beforeY);

    undoStore.redo();
    expect(animationStore.getKeyframesForObject("cube", ["rotation.x"])).toEqual(beforeX);
    expect(animationStore.getKeyframesForObject("cube", ["rotation.y"]).map((item) => item.time)).toEqual([0.9, 1.5]);
  });
});
