import { describe, expect, it } from "vitest";
import { buildKeyframePlan, buildRenamePlan, formatSkillReport } from "./skills.js";

describe("buildRenamePlan", () => {
  it("applies prefix/suffix/replace rules deterministically", () => {
    const plan = buildRenamePlan(
      [
        { objectId: "b", name: "Cube" },
        { objectId: "a", name: "Sphere" },
      ],
      {
        match: "e",
        replace: "E",
        prefix: "Rig_",
        suffix: "_01",
      },
    );

    expect(plan).toEqual([
      { objectId: "a", name: "Rig_SphEre_01" },
      { objectId: "b", name: "Rig_CubE_01" },
    ]);
  });
});

describe("buildKeyframePlan", () => {
  it("builds sorted lane keyframe records for times and transforms", () => {
    const records = buildKeyframePlan({
      objectId: "obj_1",
      times: [1, 0],
      interpolation: "easeInOut",
      transforms: {
        position: [
          [0, 1, 2],
          [3, 4, 5],
        ],
      },
    });

    expect(records).toHaveLength(6);
    expect(records[0]).toEqual({
      objectId: "obj_1",
      propertyPath: "position.x",
      time: 0,
      value: 0,
      interpolation: "easeInOut",
    });
    expect(records[5]).toEqual({
      objectId: "obj_1",
      propertyPath: "position.z",
      time: 1,
      value: 5,
      interpolation: "easeInOut",
    });
  });
});

describe("formatSkillReport", () => {
  it("returns consistent structured report object", () => {
    const report = formatSkillReport(
      "renameHierarchyWithRules",
      [{ id: "step-1", action: "state.snapshot", ok: true }],
      ["none"],
      [{ renamedCount: 2 }],
    );

    expect(report).toEqual({
      skill: "renameHierarchyWithRules",
      steps: [{ id: "step-1", action: "state.snapshot", ok: true }],
      warnings: ["none"],
      outputs: [{ renamedCount: 2 }],
    });
  });
});
