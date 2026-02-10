import { validateProjectData } from "@motionforge/engine";
import { describe, expect, it } from "vitest";
import { DEMO_PROJECT } from "./demoProject.js";

describe("DEMO_PROJECT", () => {
  it("is valid and deterministic", () => {
    expect(validateProjectData(DEMO_PROJECT)).toBe(true);
    expect(DEMO_PROJECT.version).toBe(3);
    expect(DEMO_PROJECT.objects).toHaveLength(1);
  });

  it("contains animated keyframes for onboarding playback", () => {
    expect(DEMO_PROJECT.animation?.tracks.length).toBeGreaterThan(0);
    const track = DEMO_PROJECT.animation?.tracks.find((item) => item.property === "position.x");
    expect(track?.keyframes).toHaveLength(3);
  });
});

