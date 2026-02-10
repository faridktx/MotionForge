import { describe, it, expect } from "vitest";
import { validateProjectData, validateProjectDataDetailed } from "./projectSchema.js";

const VALID_PROJECT = {
  version: 1,
  objects: [
    {
      id: "obj_1",
      name: "Cube",
      geometryType: "box",
      color: 0x4488ff,
      position: [0, 0.5, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  ],
};

describe("validateProjectData", () => {
  it("accepts a valid project", () => {
    expect(validateProjectData(VALID_PROJECT)).toBe(true);
  });

  it("accepts a project with empty objects array", () => {
    expect(validateProjectData({ version: 1, objects: [] })).toBe(true);
  });

  it("rejects null", () => {
    expect(validateProjectData(null)).toBe(false);
  });

  it("rejects missing version", () => {
    expect(validateProjectData({ objects: [] })).toBe(false);
  });

  it("rejects invalid geometry type", () => {
    const bad = {
      version: 1,
      objects: [
        {
          id: "x",
          name: "x",
          geometryType: "cylinder",
          color: 0,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
    };
    expect(validateProjectData(bad)).toBe(false);
  });

  it("rejects position with wrong length", () => {
    const bad = {
      version: 1,
      objects: [
        {
          id: "x",
          name: "x",
          geometryType: "box",
          color: 0,
          position: [0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
    };
    expect(validateProjectData(bad)).toBe(false);
  });

  it("accepts a v2 project with animation", () => {
    const v2 = {
      version: 2,
      objects: [],
      animation: {
        durationSeconds: 5,
        tracks: [
          {
            objectId: "obj_1",
            property: "position.x",
            keyframes: [
              { time: 0, value: 0, interpolation: "linear" },
              { time: 1, value: 2, interpolation: "linear" },
            ],
          },
        ],
      },
    };
    expect(validateProjectData(v2)).toBe(true);
  });

  it("accepts a v1 project loaded without animation field", () => {
    expect(validateProjectData(VALID_PROJECT)).toBe(true);
  });

  it("rejects animation with invalid track property", () => {
    const bad = {
      version: 2,
      objects: [],
      animation: {
        durationSeconds: 5,
        tracks: [
          {
            objectId: "obj_1",
            property: "color.r",
            keyframes: [],
          },
        ],
      },
    };
    expect(validateProjectData(bad)).toBe(false);
  });

  it("rejects animation with invalid interpolation", () => {
    const bad = {
      version: 2,
      objects: [],
      animation: {
        durationSeconds: 5,
        tracks: [
          {
            objectId: "obj_1",
            property: "position.x",
            keyframes: [{ time: 0, value: 0, interpolation: "cubic" }],
          },
        ],
      },
    };
    expect(validateProjectData(bad)).toBe(false);
  });

  it("accepts supported easing interpolation values", () => {
    const valid = {
      version: 2,
      objects: [],
      animation: {
        durationSeconds: 5,
        tracks: [
          {
            objectId: "obj_1",
            property: "position.x",
            keyframes: [
              { time: 0, value: 0, interpolation: "easeIn" },
              { time: 1, value: 1, interpolation: "easeOut" },
              { time: 2, value: 2, interpolation: "easeInOut" },
            ],
          },
        ],
      },
    };
    expect(validateProjectData(valid)).toBe(true);
  });

  it("rejects unsupported version", () => {
    expect(validateProjectData({ version: 3, objects: [] })).toBe(false);
  });

  it("rejects non-finite keyframe values", () => {
    const bad = {
      version: 2,
      objects: [],
      animation: {
        durationSeconds: 5,
        tracks: [
          {
            objectId: "obj_1",
            property: "position.x",
            keyframes: [{ time: 1, value: Number.NaN, interpolation: "linear" }],
          },
        ],
      },
    };
    expect(validateProjectData(bad)).toBe(false);
  });

  it("rejects keyframe times less than zero", () => {
    const bad = {
      version: 2,
      objects: [],
      animation: {
        durationSeconds: 5,
        tracks: [
          {
            objectId: "obj_1",
            property: "position.x",
            keyframes: [{ time: -0.1, value: 0, interpolation: "linear" }],
          },
        ],
      },
    };
    expect(validateProjectData(bad)).toBe(false);
  });

  it("rejects keyframe times greater than clip duration", () => {
    const bad = {
      version: 2,
      objects: [],
      animation: {
        durationSeconds: 2,
        tracks: [
          {
            objectId: "obj_1",
            property: "position.x",
            keyframes: [{ time: 3, value: 0, interpolation: "linear" }],
          },
        ],
      },
    };
    expect(validateProjectData(bad)).toBe(false);
  });

  it("rejects animation when durationSeconds is missing", () => {
    const bad = {
      version: 2,
      objects: [],
      animation: {
        tracks: [],
      },
    };
    expect(validateProjectData(bad)).toBe(false);
  });

  it("returns a readable validation error", () => {
    const result = validateProjectDataDetailed({ version: 9, objects: [] });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("unsupported project version");
  });
});
