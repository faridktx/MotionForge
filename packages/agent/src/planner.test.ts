import { describe, expect, it } from "vitest";
import { generatePlan, listRecipeTriggers, PlannerError, validateConstraints } from "./index.js";

const SNAPSHOT = {
  objects: [
    { id: "obj_a", name: "Cube" },
    { id: "cam_main", name: "Main Camera" },
  ],
  selectedObjectId: "obj_a",
} as const;

describe("deterministic planner", () => {
  it("produces stable plan output for same input", () => {
    const input = {
      goal: "Create a bounce",
      constraints: {
        style: "snappy" as const,
      },
    };
    const first = generatePlan(input, SNAPSHOT);
    const second = generatePlan(input, SNAPSHOT);
    expect(first).toEqual(second);
  });

  it("returns camera dolly plan when camera phrase is used", () => {
    const plan = generatePlan({ goal: "camera dolly shot" }, SNAPSHOT);
    expect(plan.recipeId).toBe("camera-dolly");
    expect(plan.steps.some((step) => step.command.action === "animation.insertRecords")).toBe(true);
  });

  it("throws unsupported goal with suggestions", () => {
    try {
      generatePlan({ goal: "do something random" }, SNAPSHOT);
      throw new Error("expected planner failure");
    } catch (error) {
      expect(error).toBeInstanceOf(PlannerError);
      const typed = error as PlannerError;
      expect(typed.code).toBe("MF_ERR_UNSUPPORTED_GOAL");
      expect(typed.suggestions.length).toBeGreaterThan(0);
    }
  });

  it("validates constraints consistently", () => {
    const issues = validateConstraints({ durationSec: -2, fps: 0 });
    expect(issues.map((item) => item.code)).toEqual(["MF_ERR_INVALID_DURATION", "MF_ERR_INVALID_FPS"]);
  });

  it("exports recipe trigger phrases", () => {
    const triggers = listRecipeTriggers();
    expect(triggers.some((item) => item.id === "bounce")).toBe(true);
    expect(triggers.some((item) => item.id === "recoil")).toBe(true);
  });
});
