import { describe, it, expect } from "vitest";
import { framingDistance } from "./cameraFraming.js";

describe("framingDistance", () => {
  it("returns correct distance for a unit sphere at 90 degree fov", () => {
    const fov90 = Math.PI / 2;
    // sin(45 deg) = sqrt(2)/2 ~ 0.7071
    // distance = 1 / 0.7071 ~ 1.4142
    const dist = framingDistance(1, fov90);
    expect(dist).toBeCloseTo(Math.SQRT2, 4);
  });

  it("returns 0 for zero radius", () => {
    expect(framingDistance(0, Math.PI / 4)).toBe(0);
  });

  it("returns 0 for zero fov", () => {
    expect(framingDistance(1, 0)).toBe(0);
  });

  it("scales linearly with radius", () => {
    const fov = Math.PI / 3;
    const d1 = framingDistance(1, fov);
    const d2 = framingDistance(2, fov);
    expect(d2).toBeCloseTo(d1 * 2, 4);
  });

  it("increases as fov narrows", () => {
    const wide = framingDistance(1, Math.PI / 2);
    const narrow = framingDistance(1, Math.PI / 6);
    expect(narrow).toBeGreaterThan(wide);
  });
});
