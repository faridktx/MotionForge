/**
 * Validate a raw parsed JSON object against the project schema.
 * Supports both v1 (objects only) and v2 (objects + animation).
 */
export interface ProjectObjectSchema {
  id: string;
  name: string;
  geometryType: "box" | "sphere" | "cone";
  color: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface ProjectSchema {
  version: number;
  objects: ProjectObjectSchema[];
  camera?: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  };
  animation?: {
    durationSeconds: number;
    tracks: {
      objectId: string;
      property: string;
      keyframes: { time: number; value: number; interpolation: string }[];
    }[];
  };
}

const VALID_GEO_TYPES = new Set(["box", "sphere", "cone"]);
const VALID_TRACK_PROPS = new Set([
  "position.x", "position.y", "position.z",
  "rotation.x", "rotation.y", "rotation.z",
  "scale.x", "scale.y", "scale.z",
]);
const VALID_INTERPOLATIONS = new Set(["linear", "step"]);

export function validateProjectData(data: unknown): data is ProjectSchema {
  if (typeof data !== "object" || data === null) return false;

  const d = data as Record<string, unknown>;
  if (typeof d.version !== "number") return false;
  if (!Array.isArray(d.objects)) return false;

  for (const obj of d.objects) {
    if (typeof obj !== "object" || obj === null) return false;
    const o = obj as Record<string, unknown>;
    if (typeof o.id !== "string") return false;
    if (typeof o.name !== "string") return false;
    if (typeof o.geometryType !== "string" || !VALID_GEO_TYPES.has(o.geometryType)) return false;
    if (typeof o.color !== "number") return false;
    if (!isVec3Tuple(o.position)) return false;
    if (!isVec3Tuple(o.rotation)) return false;
    if (!isVec3Tuple(o.scale)) return false;
  }

  // Validate optional animation (v2)
  if (d.animation !== undefined) {
    if (!validateAnimation(d.animation)) return false;
  }

  return true;
}

function validateAnimation(anim: unknown): boolean {
  if (typeof anim !== "object" || anim === null) return false;
  const a = anim as Record<string, unknown>;
  if (typeof a.durationSeconds !== "number") return false;
  if (!Array.isArray(a.tracks)) return false;

  for (const track of a.tracks) {
    if (typeof track !== "object" || track === null) return false;
    const t = track as Record<string, unknown>;
    if (typeof t.objectId !== "string") return false;
    if (typeof t.property !== "string" || !VALID_TRACK_PROPS.has(t.property)) return false;
    if (!Array.isArray(t.keyframes)) return false;

    for (const kf of t.keyframes) {
      if (typeof kf !== "object" || kf === null) return false;
      const k = kf as Record<string, unknown>;
      if (typeof k.time !== "number") return false;
      if (typeof k.value !== "number") return false;
      if (typeof k.interpolation !== "string" || !VALID_INTERPOLATIONS.has(k.interpolation)) return false;
    }
  }

  return true;
}

function isVec3Tuple(v: unknown): v is [number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    typeof v[2] === "number"
  );
}
