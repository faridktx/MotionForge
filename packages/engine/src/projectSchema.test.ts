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

  it("accepts animation takes with valid ranges", () => {
    const valid = {
      version: 4,
      objects: [
        {
          id: "obj_1",
          name: "Cube",
          bindPath: "Cube",
          geometryType: "box",
          color: 0,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
      animation: {
        durationSeconds: 3,
        takes: [
          { id: "take_idle", name: "Idle", startTime: 0, endTime: 2 },
          { id: "take_recoil", name: "Recoil", startTime: 2, endTime: 2.4 },
        ],
        tracks: [],
      },
    };
    expect(validateProjectData(valid)).toBe(true);
  });

  it("rejects invalid take range", () => {
    const bad = {
      version: 4,
      objects: [
        {
          id: "obj_1",
          name: "Cube",
          bindPath: "Cube",
          geometryType: "box",
          color: 0,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
      animation: {
        durationSeconds: 3,
        takes: [{ id: "take_bad", name: "Bad", startTime: 2.5, endTime: 2.4 }],
        tracks: [],
      },
    };
    expect(validateProjectData(bad)).toBe(false);
  });

  it("rejects unsupported version", () => {
    expect(validateProjectData({ version: 5, objects: [] })).toBe(false);
  });

  it("rejects assets/modelInstances in pre-v3 project versions", () => {
    const bad = {
      version: 2,
      objects: [],
      assets: [],
      modelInstances: [],
    };
    expect(validateProjectData(bad)).toBe(false);
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

  it("rejects v4 object without bindPath", () => {
    const bad = {
      version: 4,
      objects: [
        {
          id: "obj_1",
          name: "Cube",
          geometryType: "box",
          color: 0,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
    };
    expect(validateProjectData(bad)).toBe(false);
  });

  it("accepts v4 object with valid bindPath", () => {
    const good = {
      version: 4,
      objects: [
        {
          id: "obj_1",
          name: "Cube",
          bindPath: "Scene/Cube",
          geometryType: "box",
          color: 0,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
    };
    expect(validateProjectData(good)).toBe(true);
  });

  it("rejects invalid bindPath characters", () => {
    const bad = {
      version: 4,
      objects: [
        {
          id: "obj_1",
          name: "Cube",
          bindPath: "/Scene//Cube",
          geometryType: "box",
          color: 0,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
    };
    expect(validateProjectData(bad)).toBe(false);
  });

  it("accepts a v3 project with embedded gltf assets and model instances", () => {
    const v3 = {
      version: 3,
      objects: [],
      assets: [
        {
          id: "asset_1",
          name: "robot.glb",
          type: "gltf",
          source: {
            mode: "embedded",
            data: "AA==",
            fileName: "robot.glb",
          },
          size: 2,
        },
      ],
      modelInstances: [
        {
          id: "obj_model_1",
          name: "Robot",
          assetId: "asset_1",
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          materialOverrides: [
            {
              nodePath: "root/mesh_0",
              color: 16777215,
              metallic: 0.2,
              roughness: 0.8,
            },
          ],
        },
      ],
    };
    expect(validateProjectData(v3)).toBe(true);
  });

  it("rejects v3 project with invalid asset source", () => {
    const bad = {
      version: 3,
      objects: [],
      assets: [
        {
          id: "asset_1",
          name: "broken.glb",
          type: "gltf",
          source: {
            mode: "embedded",
          },
          size: 10,
        },
      ],
      modelInstances: [],
    };
    expect(validateProjectData(bad)).toBe(false);
  });

  it("rejects v3 project with model instance referencing unknown asset", () => {
    const bad = {
      version: 3,
      objects: [],
      assets: [],
      modelInstances: [
        {
          id: "inst_1",
          name: "MissingAsset",
          assetId: "missing",
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
    };
    expect(validateProjectData(bad)).toBe(false);
  });

  it("rejects invalid material override ranges in v3 model instances", () => {
    const bad = {
      version: 3,
      objects: [],
      assets: [
        {
          id: "asset_1",
          name: "robot.glb",
          type: "gltf",
          source: { mode: "embedded", data: "AA==", fileName: "robot.glb" },
          size: 2,
        },
      ],
      modelInstances: [
        {
          id: "inst_1",
          name: "Robot",
          assetId: "asset_1",
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          materialOverrides: [
            {
              nodePath: "root/mesh_0",
              color: 100,
              metallic: 2,
              roughness: 0.5,
            },
          ],
        },
      ],
    };
    expect(validateProjectData(bad)).toBe(false);
  });
});
