/**
 * Validate a raw parsed JSON object against the project schema.
 * Supports versions v1 through v4.
 */
export interface ProjectObjectSchema {
  id: string;
  name: string;
  bindPath?: string;
  geometryType: "box" | "sphere" | "cone";
  color: number;
  metallic?: number;
  roughness?: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface ProjectAssetSchema {
  id: string;
  name: string;
  type: "gltf";
  source:
    | {
      mode: "embedded";
      data: string;
      fileName: string;
    }
    | {
      mode: "external";
      path: string;
    };
  size: number;
}

export interface ProjectModelInstanceSchema {
  id: string;
  name: string;
  bindPath?: string;
  assetId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  materialOverrides?: {
    nodePath: string;
    color: number;
    metallic: number;
    roughness: number;
  }[];
}

export interface ProjectSchema {
  version: number;
  objects: ProjectObjectSchema[];
  assets?: ProjectAssetSchema[];
  modelInstances?: ProjectModelInstanceSchema[];
  camera?: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  };
  animation?: {
    durationSeconds: number;
    takes?: {
      id: string;
      name: string;
      startTime: number;
      endTime: number;
    }[];
    tracks: {
      objectId: string;
      bindPath?: string;
      property: string;
      keyframes: { time: number; value: number; interpolation: string }[];
    }[];
  };
}

const VALID_GEO_TYPES = new Set(["box", "sphere", "cone"]);
const SUPPORTED_VERSIONS = new Set([1, 2, 3, 4]);
const VALID_TRACK_PROPS = new Set([
  "position.x", "position.y", "position.z",
  "rotation.x", "rotation.y", "rotation.z",
  "scale.x", "scale.y", "scale.z",
]);
const VALID_INTERPOLATIONS = new Set(["linear", "step", "easeIn", "easeOut", "easeInOut"]);
const VALID_ASSET_TYPES = new Set(["gltf"]);

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
    return invalid("version must be a finite number at path version");
  }
  if (!SUPPORTED_VERSIONS.has(d.version)) {
    return invalid("unsupported project version at path version");
  }
  if (d.version < 3 && (d.assets !== undefined || d.modelInstances !== undefined)) {
    return invalid("assets/modelInstances are only supported in version 3+");
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
    if (d.version >= 4 && typeof o.bindPath !== "string") {
      return invalid(`objects[${i}].bindPath must be a string`);
    }
    if (o.bindPath !== undefined && !isValidBindPath(o.bindPath)) {
      return invalid(`objects[${i}].bindPath is invalid`);
    }
    if (typeof o.geometryType !== "string" || !VALID_GEO_TYPES.has(o.geometryType)) {
      return invalid(`objects[${i}].geometryType is invalid`);
    }
    if (typeof o.color !== "number" || !Number.isFinite(o.color)) {
      return invalid(`objects[${i}].color must be a finite number`);
    }
    if (!isVec3Tuple(o.position)) return invalid(`objects[${i}].position must be a vec3`);
    if (!isVec3Tuple(o.rotation)) return invalid(`objects[${i}].rotation must be a vec3`);
    if (!isVec3Tuple(o.scale)) return invalid(`objects[${i}].scale must be a vec3`);
    if (o.metallic !== undefined && !isUnitNumber(o.metallic)) {
      return invalid(`objects[${i}].metallic must be a number within [0, 1]`);
    }
    if (o.roughness !== undefined && !isUnitNumber(o.roughness)) {
      return invalid(`objects[${i}].roughness must be a number within [0, 1]`);
    }
  }

  if (d.assets !== undefined) {
    const result = validateAssets(d.assets);
    if (!result.valid) return result;
  }

  if (d.modelInstances !== undefined) {
    const assetIds = new Set<string>();
    if (Array.isArray(d.assets)) {
      for (const asset of d.assets) {
        if (typeof asset === "object" && asset !== null && typeof (asset as Record<string, unknown>).id === "string") {
          assetIds.add((asset as Record<string, unknown>).id as string);
        }
      }
    }
    const result = validateModelInstances(d.modelInstances, assetIds, d.version);
    if (!result.valid) return result;
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

  if (a.takes !== undefined) {
    if (!Array.isArray(a.takes)) return invalid("animation.takes must be an array");
    const seenIds = new Set<string>();
    for (let i = 0; i < a.takes.length; i++) {
      const take = a.takes[i];
      if (typeof take !== "object" || take === null) return invalid(`animation.takes[${i}] must be an object`);
      const t = take as Record<string, unknown>;
      if (typeof t.id !== "string" || t.id.length === 0) return invalid(`animation.takes[${i}].id must be a non-empty string`);
      if (seenIds.has(t.id)) return invalid(`animation.takes[${i}].id must be unique`);
      seenIds.add(t.id);
      if (typeof t.name !== "string" || t.name.length === 0) return invalid(`animation.takes[${i}].name must be a non-empty string`);
      if (typeof t.startTime !== "number" || !Number.isFinite(t.startTime)) {
        return invalid(`animation.takes[${i}].startTime must be a finite number`);
      }
      if (typeof t.endTime !== "number" || !Number.isFinite(t.endTime)) {
        return invalid(`animation.takes[${i}].endTime must be a finite number`);
      }
      if (t.startTime < 0 || t.endTime > a.durationSeconds || t.endTime <= t.startTime) {
        return invalid(`animation.takes[${i}] range must satisfy 0 <= startTime < endTime <= durationSeconds`);
      }
    }
  }

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

    if (t.bindPath !== undefined && !isValidBindPath(t.bindPath)) {
      return invalid(`animation.tracks[${i}].bindPath is invalid`);
    }
  }

  return { valid: true };
}

function validateAssets(assets: unknown): ProjectValidationResult {
  if (!Array.isArray(assets)) return invalid("assets must be an array");

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    if (typeof asset !== "object" || asset === null) return invalid(`assets[${i}] must be an object`);
    const a = asset as Record<string, unknown>;

    if (typeof a.id !== "string" || a.id.length === 0) return invalid(`assets[${i}].id must be a non-empty string`);
    if (typeof a.name !== "string" || a.name.length === 0) return invalid(`assets[${i}].name must be a non-empty string`);
    if (typeof a.type !== "string" || !VALID_ASSET_TYPES.has(a.type)) return invalid(`assets[${i}].type is invalid`);
    if (typeof a.size !== "number" || !Number.isFinite(a.size) || a.size < 0) {
      return invalid(`assets[${i}].size must be a finite number >= 0`);
    }

    if (typeof a.source !== "object" || a.source === null) {
      return invalid(`assets[${i}].source must be an object`);
    }

    const source = a.source as Record<string, unknown>;
    if (source.mode === "embedded") {
      if (typeof source.data !== "string" || source.data.length === 0) {
        return invalid(`assets[${i}].source.data must be a non-empty string`);
      }
      if (typeof source.fileName !== "string" || source.fileName.length === 0) {
        return invalid(`assets[${i}].source.fileName must be a non-empty string`);
      }
    } else if (source.mode === "external") {
      if (typeof source.path !== "string" || source.path.length === 0) {
        return invalid(`assets[${i}].source.path must be a non-empty string`);
      }
    } else {
      return invalid(`assets[${i}].source.mode is invalid`);
    }
  }

  return { valid: true };
}

function validateModelInstances(modelInstances: unknown, assetIds: Set<string>, version: number): ProjectValidationResult {
  if (!Array.isArray(modelInstances)) return invalid("modelInstances must be an array");

  for (let i = 0; i < modelInstances.length; i++) {
    const instance = modelInstances[i];
    if (typeof instance !== "object" || instance === null) return invalid(`modelInstances[${i}] must be an object`);
    const inst = instance as Record<string, unknown>;

    if (typeof inst.id !== "string" || inst.id.length === 0) return invalid(`modelInstances[${i}].id must be a non-empty string`);
    if (typeof inst.name !== "string" || inst.name.length === 0) return invalid(`modelInstances[${i}].name must be a non-empty string`);
    if (inst.bindPath !== undefined && !isValidBindPath(inst.bindPath)) {
      return invalid(`modelInstances[${i}].bindPath is invalid`);
    }
    if (version >= 4 && typeof inst.bindPath !== "string") {
      return invalid(`modelInstances[${i}].bindPath must be a non-empty string`);
    }
    if (typeof inst.assetId !== "string" || inst.assetId.length === 0) return invalid(`modelInstances[${i}].assetId must be a non-empty string`);
    if (!assetIds.has(inst.assetId)) {
      return invalid(`modelInstances[${i}].assetId must reference an existing asset`);
    }

    if (!isVec3Tuple(inst.position)) return invalid(`modelInstances[${i}].position must be a vec3`);
    if (!isVec3Tuple(inst.rotation)) return invalid(`modelInstances[${i}].rotation must be a vec3`);
    if (!isVec3Tuple(inst.scale)) return invalid(`modelInstances[${i}].scale must be a vec3`);

    if (inst.materialOverrides === undefined) continue;
    if (!Array.isArray(inst.materialOverrides)) {
      return invalid(`modelInstances[${i}].materialOverrides must be an array`);
    }

    for (let j = 0; j < inst.materialOverrides.length; j++) {
      const override = inst.materialOverrides[j];
      if (typeof override !== "object" || override === null) {
        return invalid(`modelInstances[${i}].materialOverrides[${j}] must be an object`);
      }
      const o = override as Record<string, unknown>;
      if (typeof o.nodePath !== "string" || o.nodePath.length === 0) {
        return invalid(`modelInstances[${i}].materialOverrides[${j}].nodePath must be a non-empty string`);
      }
      if (typeof o.color !== "number" || !Number.isFinite(o.color)) {
        return invalid(`modelInstances[${i}].materialOverrides[${j}].color must be a finite number`);
      }
      if (!isUnitNumber(o.metallic)) {
        return invalid(`modelInstances[${i}].materialOverrides[${j}].metallic must be a number within [0, 1]`);
      }
      if (!isUnitNumber(o.roughness)) {
        return invalid(`modelInstances[${i}].materialOverrides[${j}].roughness must be a number within [0, 1]`);
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

function isUnitNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}

function isValidBindPath(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const path = v.trim();
  if (path.length === 0) return false;
  if (path.startsWith("/") || path.endsWith("/")) return false;
  if (path.includes("//")) return false;
  const segments = path.split("/");
  if (segments.length === 0) return false;
  return segments.every((segment) => segment.length > 0 && /^[a-zA-Z0-9._-]+$/.test(segment));
}

function invalid(error: string): ProjectValidationResult {
  return { valid: false, error };
}
