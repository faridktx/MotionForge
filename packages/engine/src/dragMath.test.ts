import { describe, expect, it } from "vitest";
import {
  computeDragDelta,
  createPlaneFromPointAndNormal,
  intersectRayWithPlane,
  snapDelta,
} from "./dragMath.js";

describe("dragMath", () => {
  it("intersects a ray with a plane", () => {
    const plane = createPlaneFromPointAndNormal(
      { x: 0, y: 2, z: 0 },
      { x: 0, y: 1, z: 0 },
    );
    const hit = intersectRayWithPlane(
      { x: 1, y: 10, z: -3 },
      { x: 0, y: -1, z: 0 },
      plane,
    );

    expect(hit).toEqual({ x: 1, y: 2, z: -3 });
  });

  it("returns null for rays parallel to the plane", () => {
    const plane = createPlaneFromPointAndNormal(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    );
    const hit = intersectRayWithPlane(
      { x: 0, y: 2, z: 0 },
      { x: 1, y: 0, z: 0 },
      plane,
    );

    expect(hit).toBeNull();
  });

  it("computes a drag delta from two points", () => {
    const delta = computeDragDelta(
      { x: 1, y: 2, z: 3 },
      { x: 2.5, y: 4, z: -1 },
    );

    expect(delta).toEqual({ x: 1.5, y: 2, z: -4 });
  });

  it("snaps drag delta by increment", () => {
    const delta = snapDelta({ x: 0.14, y: -0.24, z: 0.06 }, 0.1);
    expect(delta).toEqual({ x: 0.1, y: -0.2, z: 0.1 });
  });
});
