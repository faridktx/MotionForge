import { describe, it, expect } from "vitest";
import { evaluateTrack, evaluateClip, getKeyframeTimesForObject } from "./evaluate.js";
import type { Track, Clip } from "./types.js";

function makeTrack(kfs: { time: number; value: number }[]): Track {
  return {
    objectId: "obj_1",
    property: "position.x",
    keyframes: kfs.map((k) => ({ ...k, interpolation: "linear" as const })),
  };
}

describe("evaluateTrack", () => {
  it("returns null for empty track", () => {
    const t = makeTrack([]);
    expect(evaluateTrack(t, 0)).toBeNull();
  });

  it("returns single keyframe value at any time", () => {
    const t = makeTrack([{ time: 1, value: 5 }]);
    expect(evaluateTrack(t, 0)).toBe(5);
    expect(evaluateTrack(t, 1)).toBe(5);
    expect(evaluateTrack(t, 10)).toBe(5);
  });

  it("clamps before first keyframe", () => {
    const t = makeTrack([{ time: 1, value: 10 }, { time: 3, value: 20 }]);
    expect(evaluateTrack(t, 0)).toBe(10);
  });

  it("clamps after last keyframe", () => {
    const t = makeTrack([{ time: 1, value: 10 }, { time: 3, value: 20 }]);
    expect(evaluateTrack(t, 5)).toBe(20);
  });

  it("interpolates linearly between keyframes", () => {
    const t = makeTrack([{ time: 0, value: 0 }, { time: 2, value: 10 }]);
    expect(evaluateTrack(t, 1)).toBeCloseTo(5);
  });

  it("interpolates at 25%", () => {
    const t = makeTrack([{ time: 0, value: 0 }, { time: 4, value: 100 }]);
    expect(evaluateTrack(t, 1)).toBeCloseTo(25);
  });

  it("handles step interpolation", () => {
    const t: Track = {
      objectId: "obj_1",
      property: "position.x",
      keyframes: [
        { time: 0, value: 0, interpolation: "step" },
        { time: 2, value: 10, interpolation: "linear" },
      ],
    };
    expect(evaluateTrack(t, 1)).toBe(0); // step holds first value
  });

  it("handles easeIn interpolation", () => {
    const t: Track = {
      objectId: "obj_1",
      property: "position.x",
      keyframes: [
        { time: 0, value: 0, interpolation: "easeIn" },
        { time: 2, value: 10, interpolation: "linear" },
      ],
    };
    expect(evaluateTrack(t, 1)).toBeCloseTo(1.25);
  });

  it("handles easeOut interpolation", () => {
    const t: Track = {
      objectId: "obj_1",
      property: "position.x",
      keyframes: [
        { time: 0, value: 0, interpolation: "easeOut" },
        { time: 2, value: 10, interpolation: "linear" },
      ],
    };
    expect(evaluateTrack(t, 1)).toBeCloseTo(8.75);
  });

  it("handles easeInOut interpolation", () => {
    const t: Track = {
      objectId: "obj_1",
      property: "position.x",
      keyframes: [
        { time: 0, value: 0, interpolation: "easeInOut" },
        { time: 2, value: 10, interpolation: "linear" },
      ],
    };
    expect(evaluateTrack(t, 0.5)).toBeCloseTo(0.625);
    expect(evaluateTrack(t, 1.5)).toBeCloseTo(9.375);
  });

  it("follows cubic easing shape samples", () => {
    const t: Track = {
      objectId: "obj_1",
      property: "position.x",
      keyframes: [
        { time: 0, value: 0, interpolation: "easeInOut" },
        { time: 1, value: 1, interpolation: "linear" },
      ],
    };
    expect(evaluateTrack(t, 0.25)).toBeCloseTo(0.0625, 6);
    expect(evaluateTrack(t, 0.5)).toBeCloseTo(0.5, 6);
    expect(evaluateTrack(t, 0.75)).toBeCloseTo(0.9375, 6);
  });

  it("returns exact value at keyframe time", () => {
    const t = makeTrack([{ time: 0, value: 0 }, { time: 1, value: 10 }, { time: 2, value: 5 }]);
    expect(evaluateTrack(t, 1)).toBe(10);
  });
});

describe("evaluateClip", () => {
  it("evaluates multiple tracks for the same object", () => {
    const clip: Clip = {
      durationSeconds: 5,
      tracks: [
        makeTrack([{ time: 0, value: 0 }, { time: 2, value: 4 }]),
        {
          objectId: "obj_1",
          property: "position.y",
          keyframes: [{ time: 0, value: 10, interpolation: "linear" }],
        },
      ],
    };
    const result = evaluateClip(clip, 1);
    const objMap = result.get("obj_1")!;
    expect(objMap.get("position.x")).toBeCloseTo(2);
    expect(objMap.get("position.y")).toBe(10);
  });
});

describe("getKeyframeTimesForObject", () => {
  it("returns sorted unique times", () => {
    const clip: Clip = {
      durationSeconds: 5,
      tracks: [
        { objectId: "a", property: "position.x", keyframes: [
          { time: 2, value: 0, interpolation: "linear" },
          { time: 0, value: 0, interpolation: "linear" },
        ]},
        { objectId: "a", property: "position.y", keyframes: [
          { time: 0, value: 0, interpolation: "linear" },
          { time: 1, value: 0, interpolation: "linear" },
        ]},
        { objectId: "b", property: "position.x", keyframes: [
          { time: 3, value: 0, interpolation: "linear" },
        ]},
      ],
    };
    expect(getKeyframeTimesForObject(clip, "a")).toEqual([0, 1, 2]);
  });
});
