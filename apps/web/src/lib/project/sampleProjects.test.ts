import { describe, expect, it } from "vitest";
import { validateProjectDataDetailed } from "@motionforge/engine";
import { SAMPLE_PROJECTS } from "./sampleProjects.js";

describe("sample project registry", () => {
  it("contains deterministic built-in sample entries", () => {
    expect(SAMPLE_PROJECTS.length).toBeGreaterThanOrEqual(4);
    const ids = SAMPLE_PROJECTS.map((sample) => sample.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("primitives-demo");
    expect(ids).toContain("demo-model-animation");
    expect(ids).toContain("material-demo");
    expect(ids).toContain("timeline-lane-demo");
  });

  it("keeps project sample payloads schema-valid", () => {
    const projectSamples = SAMPLE_PROJECTS.filter((sample) => sample.kind === "project");
    for (const sample of projectSamples) {
      const validation = validateProjectDataDetailed(sample.project);
      expect(validation.valid, sample.id).toBe(true);
    }
  });
});
