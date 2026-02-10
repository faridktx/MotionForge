import { describe, expect, it } from "vitest";
import { buildProofDocument, deriveTakesFromGoal } from "./makeBundle.js";
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
});
