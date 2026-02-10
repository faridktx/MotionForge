import { describe, expect, it } from "vitest";
import { applySoakStep, createInitialSoakProgress } from "./soakHarness.js";

describe("soakHarness progress helpers", () => {
  it("creates zeroed initial progress", () => {
    expect(createInitialSoakProgress()).toEqual({
      iterations: 0,
      keyframeOps: 0,
      scrubOps: 0,
      exportOps: 0,
      purgeOps: 0,
      bytesSerialized: 0,
      failures: 0,
    });
  });

  it("accumulates deltas predictably", () => {
    const base = createInitialSoakProgress();
    const next = applySoakStep(base, {
      keyframeOps: 12,
      scrubOps: 3,
      exportOps: 1,
      purgeOps: 1,
      bytesSerialized: 500,
    });
    expect(next).toEqual({
      iterations: 1,
      keyframeOps: 12,
      scrubOps: 3,
      exportOps: 1,
      purgeOps: 1,
      bytesSerialized: 500,
      failures: 0,
    });
  });
});
