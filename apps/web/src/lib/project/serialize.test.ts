import { describe, expect, it } from "vitest";
import { parseProjectJSONResult } from "./serialize.js";

describe("parseProjectJSONResult", () => {
  it("returns a readable error for invalid animation keyframe times", () => {
    const bad = JSON.stringify({
      version: 2,
      objects: [],
      animation: {
        durationSeconds: 2,
        tracks: [
          {
            objectId: "obj_1",
            property: "position.x",
            keyframes: [{ time: 3, value: 1, interpolation: "linear" }],
          },
        ],
      },
    });

    const result = parseProjectJSONResult(bad);
    expect(result.data).toBeNull();
    expect(result.error).toContain("time must be within [0, durationSeconds]");
  });

  it("accepts valid v1 project data", () => {
    const good = JSON.stringify({
      version: 1,
      objects: [],
    });

    const result = parseProjectJSONResult(good);
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ version: 1, objects: [] });
  });

  it("accepts valid v3 project data with assets metadata", () => {
    const good = JSON.stringify({
      version: 3,
      objects: [],
      assets: [
        {
          id: "asset_1",
          name: "model.glb",
          type: "gltf",
          source: { mode: "embedded", data: "AA==", fileName: "model.glb" },
          size: 2,
        },
      ],
      modelInstances: [
        {
          id: "inst_1",
          name: "Model",
          assetId: "asset_1",
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
    });

    const result = parseProjectJSONResult(good);
    expect(result.error).toBeNull();
    expect(result.data?.version).toBe(3);
  });

  it("returns validation error for invalid v3 modelInstances", () => {
    const bad = JSON.stringify({
      version: 3,
      objects: [],
      assets: [],
      modelInstances: [
        {
          id: "inst_1",
          name: "Broken",
          assetId: "missing",
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
    });

    const result = parseProjectJSONResult(bad);
    expect(result.data).toBeNull();
    expect(result.error).toContain("assetId");
  });

  it("rejects assets metadata on version 2 projects", () => {
    const bad = JSON.stringify({
      version: 2,
      objects: [],
      assets: [],
      modelInstances: [],
    });

    const result = parseProjectJSONResult(bad);
    expect(result.data).toBeNull();
    expect(result.error).toContain("only supported in version 3");
  });
});
