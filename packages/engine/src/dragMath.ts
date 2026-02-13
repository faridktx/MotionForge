export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PlaneEquation {
  normal: Vec3;
  constant: number;
}

const EPSILON = 1e-8;

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalize(vec: Vec3): Vec3 {
  const length = Math.hypot(vec.x, vec.y, vec.z);
  if (length < EPSILON) {
    return { x: 0, y: 1, z: 0 };
  }
  return {
    x: vec.x / length,
    y: vec.y / length,
    z: vec.z / length,
  };
}

export function createPlaneFromPointAndNormal(point: Vec3, normal: Vec3): PlaneEquation {
  const unit = normalize(normal);
  return {
    normal: unit,
    constant: -dot(unit, point),
  };
}

export function intersectRayWithPlane(
  origin: Vec3,
  direction: Vec3,
  plane: PlaneEquation,
): Vec3 | null {
  const denom = dot(plane.normal, direction);
  if (Math.abs(denom) < EPSILON) {
    return null;
  }
  const t = -(dot(plane.normal, origin) + plane.constant) / denom;
  if (t < 0) {
    return null;
  }
  return {
    x: origin.x + direction.x * t,
    y: origin.y + direction.y * t,
    z: origin.z + direction.z * t,
  };
}

export function computeDragDelta(startHit: Vec3, currentHit: Vec3): Vec3 {
  return {
    x: currentHit.x - startHit.x,
    y: currentHit.y - startHit.y,
    z: currentHit.z - startHit.z,
  };
}

export function snapDelta(delta: Vec3, increment: number): Vec3 {
  if (!Number.isFinite(increment) || increment <= 0) {
    return { ...delta };
  }
  return {
    x: Math.round(delta.x / increment) * increment,
    y: Math.round(delta.y / increment) * increment,
    z: Math.round(delta.z / increment) * increment,
  };
}
