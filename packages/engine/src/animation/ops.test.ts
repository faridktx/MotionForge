import { describe, expect, it } from "vitest";
import { createEmptyClip, type Clip } from "./types.js";
import { addTransformKeyframes } from "./addKeyframe.js";
import { moveKeyframes, removeKeyframes, setKeyframeInterpolation, setKeyframeValue, type KeyframeRef } from "./ops.js";

function getTrack(clip: Clip, objectId: string, property: string) {
  return clip.tracks.find((track) => track.objectId === objectId && track.property === property);
}

describe("removeKeyframes", () => {
  it("deletes exact keyframes by object/property/time", () => {
    const clip = createEmptyClip(5);
    addTransformKeyframes(clip, "obj", "position", 1, { x: 1, y: 2, z: 3 });
    addTransformKeyframes(clip, "obj", "position", 2, { x: 4, y: 5, z: 6 });

    removeKeyframes(clip, [{ objectId: "obj", property: "position.y", time: 1 }]);

    expect(getTrack(clip, "obj", "position.x")?.keyframes.map((key) => key.time)).toEqual([1, 2]);
    expect(getTrack(clip, "obj", "position.y")?.keyframes.map((key) => key.time)).toEqual([2]);
    expect(getTrack(clip, "obj", "position.z")?.keyframes.map((key) => key.time)).toEqual([1, 2]);
  });

  it("normalizes clip by removing empty tracks after deletion", () => {
    const clip = createEmptyClip(5);
    addTransformKeyframes(clip, "obj", "scale", 1, { x: 1, y: 1, z: 1 });

    removeKeyframes(clip, [
      { objectId: "obj", property: "scale.x", time: 1 },
      { objectId: "obj", property: "scale.y", time: 1 },
      { objectId: "obj", property: "scale.z", time: 1 },
    ]);

    expect(clip.tracks).toEqual([]);
  });
});

describe("moveKeyframes", () => {
  it("moves selected keys and keeps key ordering stable", () => {
    const clip = createEmptyClip(5);
    addTransformKeyframes(clip, "obj", "position", 0.5, { x: 1, y: 2, z: 3 });
    addTransformKeyframes(clip, "obj", "position", 1.5, { x: 4, y: 5, z: 6 });

    const moved = moveKeyframes(clip, [{ objectId: "obj", property: "position.x", time: 1.5 }], -0.4);

    expect(getTrack(clip, "obj", "position.x")?.keyframes.map((key) => key.time)).toEqual([0.5, 1.1]);
    expect(moved).toEqual([{ objectId: "obj", property: "position.x", time: 1.1 }]);
  });

  it("clamps moved times to [0, duration]", () => {
    const clip = createEmptyClip(2);
    addTransformKeyframes(clip, "obj", "rotation", 0.1, { x: 1, y: 2, z: 3 });
    addTransformKeyframes(clip, "obj", "rotation", 1.9, { x: 4, y: 5, z: 6 });

    const moved = moveKeyframes(
      clip,
      [
        { objectId: "obj", property: "rotation.x", time: 0.1 },
        { objectId: "obj", property: "rotation.y", time: 1.9 },
      ],
      1,
    );

    expect(moved).toEqual([
      { objectId: "obj", property: "rotation.x", time: 1.1 },
      { objectId: "obj", property: "rotation.y", time: 2 },
    ]);
    expect(getTrack(clip, "obj", "rotation.y")?.keyframes.map((key) => key.time)).toEqual([0.1, 2]);
  });

  it("preserves relative spacing in batch moves", () => {
    const clip = createEmptyClip(5);
    addTransformKeyframes(clip, "obj", "position", 0.3, { x: 1, y: 2, z: 3 });
    addTransformKeyframes(clip, "obj", "position", 1.0, { x: 4, y: 5, z: 6 });
    addTransformKeyframes(clip, "obj", "position", 2.2, { x: 7, y: 8, z: 9 });

    const refs: KeyframeRef[] = [
      { objectId: "obj", property: "position.z", time: 0.3 },
      { objectId: "obj", property: "position.z", time: 1.0 },
      { objectId: "obj", property: "position.z", time: 2.2 },
    ];

    const moved = moveKeyframes(clip, refs, 0.5);
    const movedTimes = moved.map((key) => key.time);

    expect(movedTimes).toEqual([0.8, 1.5, 2.7]);
    expect(movedTimes[1] - movedTimes[0]).toBeCloseTo(0.7);
    expect(movedTimes[2] - movedTimes[1]).toBeCloseTo(1.2);
  });

  it("normalizes unsorted tracks after movement", () => {
    const clip = createEmptyClip(3);
    clip.tracks.push({
      objectId: "obj",
      property: "position.x",
      keyframes: [
        { time: 2.7, value: 20, interpolation: "linear" },
        { time: 0.4, value: 10, interpolation: "linear" },
      ],
    });

    moveKeyframes(clip, [{ objectId: "obj", property: "position.x", time: 2.7 }], -2.5);

    expect(getTrack(clip, "obj", "position.x")?.keyframes.map((key) => key.time)).toEqual([0.2, 0.4]);
  });
});

describe("setKeyframeValue", () => {
  it("updates value while retaining interpolation", () => {
    const clip = createEmptyClip(5);
    clip.tracks.push({
      objectId: "obj",
      property: "scale.x",
      keyframes: [{ time: 1, value: 3, interpolation: "step" }],
    });

    const updated = setKeyframeValue(clip, { objectId: "obj", property: "scale.x", time: 1 }, 42);

    expect(updated).toEqual({ objectId: "obj", property: "scale.x", time: 1 });
    expect(getTrack(clip, "obj", "scale.x")?.keyframes).toEqual([
      { time: 1, value: 42, interpolation: "step" },
    ]);
  });
});

describe("setKeyframeInterpolation", () => {
  it("updates interpolation to easing modes", () => {
    const clip = createEmptyClip(5);
    clip.tracks.push({
      objectId: "obj",
      property: "scale.x",
      keyframes: [{ time: 1, value: 3, interpolation: "linear" }],
    });

    const updated = setKeyframeInterpolation(
      clip,
      { objectId: "obj", property: "scale.x", time: 1 },
      "easeOut",
    );

    expect(updated).toEqual({ objectId: "obj", property: "scale.x", time: 1 });
    expect(getTrack(clip, "obj", "scale.x")?.keyframes).toEqual([
      { time: 1, value: 3, interpolation: "easeOut" },
    ]);
  });
});
