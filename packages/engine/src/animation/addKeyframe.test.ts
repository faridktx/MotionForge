import { describe, it, expect } from "vitest";
import { insertKeyframe, getOrCreateTrack, addTransformKeyframes, removeTracksForObject } from "./addKeyframe.js";
import { createEmptyClip } from "./types.js";
import type { Track, Clip } from "./types.js";

describe("insertKeyframe", () => {
  it("inserts in sorted order", () => {
    const track: Track = { objectId: "a", property: "position.x", keyframes: [] };
    insertKeyframe(track, { time: 2, value: 10, interpolation: "linear" });
    insertKeyframe(track, { time: 0, value: 0, interpolation: "linear" });
    insertKeyframe(track, { time: 1, value: 5, interpolation: "linear" });
    expect(track.keyframes.map((k) => k.time)).toEqual([0, 1, 2]);
  });

  it("replaces keyframe at same time", () => {
    const track: Track = { objectId: "a", property: "position.x", keyframes: [
      { time: 1, value: 5, interpolation: "linear" },
    ]};
    insertKeyframe(track, { time: 1, value: 99, interpolation: "linear" });
    expect(track.keyframes).toHaveLength(1);
    expect(track.keyframes[0].value).toBe(99);
  });
});

describe("getOrCreateTrack", () => {
  it("creates a new track when none exists", () => {
    const clip = createEmptyClip();
    const track = getOrCreateTrack(clip, "obj_1", "position.x");
    expect(track.objectId).toBe("obj_1");
    expect(clip.tracks).toHaveLength(1);
  });

  it("returns existing track", () => {
    const clip = createEmptyClip();
    const t1 = getOrCreateTrack(clip, "obj_1", "position.x");
    const t2 = getOrCreateTrack(clip, "obj_1", "position.x");
    expect(t1).toBe(t2);
    expect(clip.tracks).toHaveLength(1);
  });
});

describe("addTransformKeyframes", () => {
  it("adds keyframes for all 3 axes", () => {
    const clip = createEmptyClip();
    addTransformKeyframes(clip, "obj_1", "position", 0, { x: 1, y: 2, z: 3 });
    expect(clip.tracks).toHaveLength(3);
    expect(clip.tracks[0].property).toBe("position.x");
    expect(clip.tracks[0].keyframes[0].value).toBe(1);
    expect(clip.tracks[1].property).toBe("position.y");
    expect(clip.tracks[2].property).toBe("position.z");
  });
});

describe("removeTracksForObject", () => {
  it("removes all tracks for the object", () => {
    const clip: Clip = {
      durationSeconds: 5,
      tracks: [
        { objectId: "a", property: "position.x", keyframes: [] },
        { objectId: "b", property: "position.x", keyframes: [] },
        { objectId: "a", property: "position.y", keyframes: [] },
      ],
    };
    removeTracksForObject(clip, "a");
    expect(clip.tracks).toHaveLength(1);
    expect(clip.tracks[0].objectId).toBe("b");
  });
});
