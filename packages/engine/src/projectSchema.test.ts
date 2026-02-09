import { describe, it, expect } from "vitest";
import { validateProjectData } from "./projectSchema.js";

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
});
