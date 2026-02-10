import { describe, expect, it } from "vitest";
import { compileScriptToPlan } from "./compile.js";

describe("compileScriptToPlan", () => {
  it("compiles deterministically for same input", () => {
    const script = `
select "Cube"
duration 1
label "Bounce"
bounce amplitude 1 at 0..1
take "Main" from 0 to 1
`;
    const context = {
      availableObjects: [{ id: "obj_cube", name: "Cube" }],
      defaults: { fps: 30, durationSec: 2 },
    };
    const first = compileScriptToPlan(script, context);
    const second = compileScriptToPlan(script, context);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    expect(first.steps.some((step) => step.command.action === "animation.setTakes")).toBe(true);
  });

  it("requires confirm when script deletes keys", () => {
    const script = `
select "obj_cube"
duration 1
delete key position y at 0.5
`;
    const out = compileScriptToPlan(script, {
      availableObjects: [{ id: "obj_cube", name: "Cube" }],
    });
    expect(out.ok).toBe(true);
    expect(out.safety.requiresConfirm).toBe(true);
    expect(out.safety.reasons.some((reason) => reason.includes("deletes keyframes"))).toBe(true);
  });
});
