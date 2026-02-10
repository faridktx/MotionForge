import { describe, expect, it } from "vitest";
import { applyPlanStepsAtomic } from "./apply.js";
import type { PlanStep } from "./planner.js";

function createSteps(): PlanStep[] {
  return [
    {
      id: "inspect",
      label: "Inspect",
      type: "inspect",
      command: { action: "mf.state.snapshot", input: {} },
      rationale: "inspect",
    },
    {
      id: "mutate-1",
      label: "Mutate 1",
      type: "mutate",
      command: { action: "a", input: {} },
      rationale: "a",
    },
    {
      id: "mutate-2",
      label: "Mutate 2",
      type: "mutate",
      command: { action: "b", input: {} },
      rationale: "b",
    },
  ];
}

describe("applyPlanStepsAtomic", () => {
  it("applies mutate steps and returns events", () => {
    let counter = 0;
    const out = applyPlanStepsAtomic(
      {
        capture: () => ({ counter }),
        restore: (snapshot) => {
          counter = snapshot.counter;
        },
        execute: (action) => {
          counter += 1;
          return { events: [{ action }] };
        },
      },
      createSteps(),
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.commandsExecuted).toBe(2);
      expect(out.events).toHaveLength(2);
    }
    expect(counter).toBe(2);
  });

  it("rolls back on failure and reports failed step", () => {
    let counter = 0;
    const out = applyPlanStepsAtomic(
      {
        capture: () => ({ counter }),
        restore: (snapshot) => {
          counter = snapshot.counter;
        },
        execute: (action) => {
          if (action === "b") {
            throw new Error("forced failure");
          }
          counter += 1;
          return { events: [{ action }] };
        },
      },
      createSteps(),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failedStepId).toBe("mutate-2");
      expect(out.commandsExecuted).toBe(1);
    }
    expect(counter).toBe(0);
  });
});
