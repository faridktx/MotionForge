import { describe, expect, it } from "vitest";
import { parseScript } from "./parser.js";

describe("parseScript", () => {
  it("parses all core statements", () => {
    const script = `
select "obj_cube"
duration 1.2
fps 30
label "Bounce pass"
loop on
take "Idle" from 0 to 1
key position y at 0.25 = 1.4 ease easeOut
key rotation y at 1.0 = 90 deg ease easeInOut
key scale x at 0.5 = 1.2
delete key position y at 0.25
bounce amplitude 1.2 at 0..1
recoil distance 0.2 at 0..0.4
`;
    const out = parseScript(script);
    expect(out.ok).toBe(true);
    expect(out.errors).toHaveLength(0);
    expect(out.ast.statements).toHaveLength(12);
  });

  it("returns path-oriented parse errors", () => {
    const script = `
select obj_cube
key position q at 0 = 1
`;
    const out = parseScript(script);
    expect(out.ok).toBe(false);
    expect(out.errors).toHaveLength(2);
    expect(out.errors[0]?.path).toBe("line:2");
    expect(out.errors[1]?.path).toBe("line:3");
  });
});
