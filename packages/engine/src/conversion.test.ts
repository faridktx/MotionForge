import { describe, it, expect } from "vitest";
import { degToRad, radToDeg } from "./conversion.js";

describe("degToRad", () => {
  it("converts 0 degrees to 0 radians", () => {
    expect(degToRad(0)).toBe(0);
  });

  it("converts 180 degrees to PI radians", () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI, 10);
  });

  it("converts 90 degrees to PI/2 radians", () => {
    expect(degToRad(90)).toBeCloseTo(Math.PI / 2, 10);
  });

  it("converts negative degrees", () => {
    expect(degToRad(-45)).toBeCloseTo(-Math.PI / 4, 10);
  });
});

describe("radToDeg", () => {
  it("converts 0 radians to 0 degrees", () => {
    expect(radToDeg(0)).toBe(0);
  });

  it("converts PI radians to 180 degrees", () => {
    expect(radToDeg(Math.PI)).toBeCloseTo(180, 10);
  });

  it("round-trips with degToRad", () => {
    expect(radToDeg(degToRad(42))).toBeCloseTo(42, 10);
  });
});
