import { describe, expect, it } from "vitest";
import { buildProofDocument, deriveTakesFromGoal, ensureUnityBindPaths } from "./makeBundle.js";
import { stableJsonStringify } from "./hash.js";

describe("make bundle pipeline helpers", () => {
  it("derives idle/recoil takes deterministically from goal text", () => {
    const takes = deriveTakesFromGoal("idle loop then recoil", 4);
    expect(takes).toEqual([
      { id: "take_idle", name: "Idle", startTime: 0, endTime: 2 },
      { id: "take_recoil", name: "Recoil", startTime: 2, endTime: 2.4 },
    ]);
  });

  it("builds deterministic proof payload", () => {
    const proofA = buildProofDocument({
      previewOnly: true,
      goal: "idle loop then recoil",
      takes: [
        { id: "take_idle", name: "Idle", startTime: 0, endTime: 2 },
        { id: "take_recoil", name: "Recoil", startTime: 2, endTime: 2.4 },
      ],
      inputHash: "a",
      outputProjectHash: null,
      bundleHash: null,
      tooling: { mcpVersion: "0.1.0", commit: "abc1234" },
      diffSummary: {
        scripts: [{ take: "Idle", keyframesAdded: 1, keyframesMoved: 0, keyframesDeleted: 0, tracksTouched: 1 }],
        totals: { keyframesAdded: 1, keyframesMoved: 0, keyframesDeleted: 0, tracksTouched: 1 },
      },
      outputs: { outDir: "/tmp/out", projectJsonPath: null, bundleZipPath: null, manifestPath: null },
      bytes: { projectJson: null, bundleZip: null, manifest: null },
      warnings: [],
      errors: [{ code: "MF_ERR_CONFIRM_REQUIRED", message: "confirm required" }],
    });
    const proofB = buildProofDocument({
      previewOnly: true,
      goal: "idle loop then recoil",
      takes: [
        { id: "take_idle", name: "Idle", startTime: 0, endTime: 2 },
        { id: "take_recoil", name: "Recoil", startTime: 2, endTime: 2.4 },
      ],
      inputHash: "a",
      outputProjectHash: null,
      bundleHash: null,
      tooling: { mcpVersion: "0.1.0", commit: "abc1234" },
      diffSummary: {
        scripts: [{ take: "Idle", keyframesAdded: 1, keyframesMoved: 0, keyframesDeleted: 0, tracksTouched: 1 }],
        totals: { keyframesAdded: 1, keyframesMoved: 0, keyframesDeleted: 0, tracksTouched: 1 },
      },
      outputs: { outDir: "/tmp/out", projectJsonPath: null, bundleZipPath: null, manifestPath: null },
      bytes: { projectJson: null, bundleZip: null, manifest: null },
      warnings: [],
      errors: [{ code: "MF_ERR_CONFIRM_REQUIRED", message: "confirm required" }],
    });

    expect(stableJsonStringify(proofA)).toBe(stableJsonStringify(proofB));
  });

  it("auto-fills missing bindPath fields for unity mode", () => {
    const inputJson = JSON.stringify({
      version: 4,
      objects: [{ id: "obj_cube", name: "Cube", geometryType: "box", color: 1, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }],
      animation: {
        durationSeconds: 2.4,
        takes: [{ id: "take_idle", name: "Idle", startTime: 0, endTime: 2 }],
        tracks: [{ objectId: "obj_cube", property: "position.y", keyframes: [{ time: 0, value: 0, interpolation: "linear" }] }],
      },
    });

    const result = ensureUnityBindPaths(inputJson, { targetSelect: "obj_cube" });
    const json = JSON.parse(result.json) as {
      objects: Array<{ bindPath?: string }>;
      animation: { tracks: Array<{ bindPath?: string }> };
    };
    expect(json.objects[0]?.bindPath).toBe("Cube");
    expect(json.animation.tracks[0]?.bindPath).toBe("Cube");
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
