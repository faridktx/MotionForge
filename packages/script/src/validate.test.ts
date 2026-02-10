import { describe, expect, it } from "vitest";
import { validateScript } from "./validate.js";

describe("validateScript", () => {
  it("returns errors with line paths for semantic failures", () => {
    const script = `
select "missing"
duration 1
key position y at 2 = 1 ease linear
`;
    const out = validateScript(script, {
      availableObjects: [{ id: "obj_cube", name: "Cube" }],
    });
    expect(out.ok).toBe(false);
    expect(out.errors.some((item) => item.path === "line:2")).toBe(true);
    expect(out.errors.some((item) => item.path === "line:4")).toBe(true);
  });

  it("returns warnings for missing optional declarations", () => {
    const script = `
key scale x at 0 = 1
`;
    const out = validateScript(script);
    expect(out.ok).toBe(true);
    expect(out.warnings.some((item) => item.code === "MF_SCRIPT_NO_SELECT")).toBe(true);
    expect(out.warnings.some((item) => item.code === "MF_SCRIPT_NO_DURATION")).toBe(true);
  });

  it("validates take ranges against duration", () => {
    const script = `
duration 2
take "Idle" from 0 to 2
take "Recoil" from 2 to 2.4
`;
    const out = validateScript(script);
    expect(out.ok).toBe(false);
    expect(out.errors.some((item) => item.path === "line:4")).toBe(true);
  });
});
