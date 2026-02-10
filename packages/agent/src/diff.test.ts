import { describe, expect, it } from "vitest";
import { buildProjectDiff, simulatePlanDiff, type PlanRuntimeLike } from "./diff.js";
import type { PlanStep } from "./planner.js";

class FakeRuntime implements PlanRuntimeLike {
  private project = {
    objects: [{ id: "obj_a", name: "Cube", color: 1, metallic: 0.2, roughness: 0.8 }],
    animation: {
      tracks: [
        {
          objectId: "obj_a",
          property: "position.y",
          keyframes: [{ time: 0, value: 0, interpolation: "linear" }],
        },
      ],
    },
  };

  clone(): PlanRuntimeLike {
    const next = new FakeRuntime();
    (next as FakeRuntime).project = JSON.parse(JSON.stringify(this.project)) as typeof this.project;
    return next;
  }

  execute(action: string): { events: unknown[] } {
    if (action === "animation.insertRecords") {
      this.project.animation.tracks[0]?.keyframes.push({
        time: 1,
        value: 2,
        interpolation: "easeOut",
      });
    }
    return { events: [] };
  }

  exportProjectJson(): string {
    return JSON.stringify(this.project);
  }
}

describe("diff builder", () => {
  it("computes keyframe additions", () => {
    const before = JSON.stringify({
      objects: [{ id: "obj_a", name: "Cube" }],
      animation: {
        tracks: [{ objectId: "obj_a", property: "position.y", keyframes: [{ time: 0, value: 0 }] }],
      },
    });
    const after = JSON.stringify({
      objects: [{ id: "obj_a", name: "Cube" }],
      animation: {
        tracks: [{ objectId: "obj_a", property: "position.y", keyframes: [{ time: 0, value: 0 }, { time: 1, value: 1 }] }],
      },
    });
    const diff = buildProjectDiff(before, after);
    expect(diff.animation[0]?.keyframesAdded).toBe(1);
  });

  it("simulates mutate steps on runtime clone", () => {
    const runtime = new FakeRuntime();
    const steps: PlanStep[] = [
      {
        id: "add",
        label: "Add",
        type: "mutate",
        command: { action: "animation.insertRecords", input: {} },
        rationale: "test",
      },
    ];
    const diff = simulatePlanDiff(runtime, steps);
    expect(diff.animation[0]?.keyframesAdded).toBe(1);
  });
});
