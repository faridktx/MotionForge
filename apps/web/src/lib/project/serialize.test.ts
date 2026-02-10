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
});
