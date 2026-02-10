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
const SUPPORTED_VERSIONS = new Set([1, 2]);
const VALID_TRACK_PROPS = new Set([
  "position.x", "position.y", "position.z",
  "rotation.x", "rotation.y", "rotation.z",
  "scale.x", "scale.y", "scale.z",
]);
const VALID_INTERPOLATIONS = new Set(["linear", "step", "easeIn", "easeOut", "easeInOut"]);

export function validateProjectData(data: unknown): data is ProjectSchema {
  return validateProjectDataDetailed(data).valid;
}

export interface ProjectValidationResult {
  valid: boolean;
  error?: string;
}

export function validateProjectDataDetailed(data: unknown): ProjectValidationResult {
  if (typeof data !== "object" || data === null) return invalid("project root must be an object");

  const d = data as Record<string, unknown>;
  if (typeof d.version !== "number" || !Number.isFinite(d.version)) {
    return invalid("version must be a finite number");
  }
  if (!SUPPORTED_VERSIONS.has(d.version)) {
    return invalid("unsupported project version");
  }
  if (!Array.isArray(d.objects)) {
    return invalid("objects must be an array");
  }

  for (let i = 0; i < d.objects.length; i++) {
    const obj = d.objects[i];
    if (typeof obj !== "object" || obj === null) return invalid(`objects[${i}] must be an object`);
    const o = obj as Record<string, unknown>;
    if (typeof o.id !== "string") return invalid(`objects[${i}].id must be a string`);
    if (typeof o.name !== "string") return invalid(`objects[${i}].name must be a string`);
    if (typeof o.geometryType !== "string" || !VALID_GEO_TYPES.has(o.geometryType)) {
      return invalid(`objects[${i}].geometryType is invalid`);
    }
    if (typeof o.color !== "number" || !Number.isFinite(o.color)) {
      return invalid(`objects[${i}].color must be a finite number`);
    }
    if (!isVec3Tuple(o.position)) return invalid(`objects[${i}].position must be a vec3`);
    if (!isVec3Tuple(o.rotation)) return invalid(`objects[${i}].rotation must be a vec3`);
    if (!isVec3Tuple(o.scale)) return invalid(`objects[${i}].scale must be a vec3`);
  }

  if (d.camera !== undefined) {
    if (typeof d.camera !== "object" || d.camera === null) {
      return invalid("camera must be an object");
    }
    const c = d.camera as Record<string, unknown>;
    if (!isVec3Tuple(c.position)) return invalid("camera.position must be a vec3");
    if (!isVec3Tuple(c.target)) return invalid("camera.target must be a vec3");
    if (typeof c.fov !== "number" || !Number.isFinite(c.fov) || c.fov <= 1 || c.fov >= 179) {
      return invalid("camera.fov must be a finite number between 1 and 179");
    }
  }

  // Validate optional animation (v2)
  if (d.animation !== undefined) {
    const result = validateAnimation(d.animation);
    if (!result.valid) return result;
  }

  return { valid: true };
}

function validateAnimation(anim: unknown): ProjectValidationResult {
  if (typeof anim !== "object" || anim === null) return invalid("animation must be an object");
  const a = anim as Record<string, unknown>;
  if (typeof a.durationSeconds !== "number" || !Number.isFinite(a.durationSeconds)) {
    return invalid("animation.durationSeconds must be a finite number");
  }
  if (a.durationSeconds <= 0 || a.durationSeconds > 3600) {
    return invalid("animation.durationSeconds must be > 0 and <= 3600");
  }
  if (!Array.isArray(a.tracks)) return invalid("animation.tracks must be an array");

  for (let i = 0; i < a.tracks.length; i++) {
    const track = a.tracks[i];
    if (typeof track !== "object" || track === null) return invalid(`animation.tracks[${i}] must be an object`);
    const t = track as Record<string, unknown>;
    if (typeof t.objectId !== "string") return invalid(`animation.tracks[${i}].objectId must be a string`);
    if (typeof t.property !== "string" || !VALID_TRACK_PROPS.has(t.property)) {
      return invalid(`animation.tracks[${i}].property is invalid`);
    }
    if (!Array.isArray(t.keyframes)) return invalid(`animation.tracks[${i}].keyframes must be an array`);

    for (let j = 0; j < t.keyframes.length; j++) {
      const kf = t.keyframes[j];
      if (typeof kf !== "object" || kf === null) {
        return invalid(`animation.tracks[${i}].keyframes[${j}] must be an object`);
      }
      const k = kf as Record<string, unknown>;
      if (typeof k.time !== "number" || !Number.isFinite(k.time)) {
        return invalid(`animation.tracks[${i}].keyframes[${j}].time must be a finite number`);
      }
      if (k.time < 0 || k.time > a.durationSeconds) {
        return invalid(`animation.tracks[${i}].keyframes[${j}].time must be within [0, durationSeconds]`);
      }
      if (typeof k.value !== "number" || !Number.isFinite(k.value)) {
        return invalid(`animation.tracks[${i}].keyframes[${j}].value must be a finite number`);
      }
      if (typeof k.interpolation !== "string" || !VALID_INTERPOLATIONS.has(k.interpolation)) {
        return invalid(`animation.tracks[${i}].keyframes[${j}].interpolation is invalid`);
      }
    }
  }

  return { valid: true };
}

function isVec3Tuple(v: unknown): v is [number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    typeof v[2] === "number" &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1]) &&
    Number.isFinite(v[2])
  );
}

function invalid(error: string): ProjectValidationResult {
  return { valid: false, error };
}
