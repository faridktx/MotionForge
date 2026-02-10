export function createEngineVersion(): string {
  return "0.0.1";
}

export { framingDistance } from "./cameraFraming.js";
export { degToRad, radToDeg } from "./conversion.js";
export { validateProjectData, validateProjectDataDetailed } from "./projectSchema.js";
export type { ProjectSchema, ProjectObjectSchema } from "./projectSchema.js";
export type { ProjectValidationResult } from "./projectSchema.js";

// Animation
export type { Keyframe, Track, Clip, TrackProperty, Interpolation } from "./animation/types.js";
export { createEmptyClip } from "./animation/types.js";
export { evaluateTrack, evaluateClip, getKeyframeTimesForObject } from "./animation/evaluate.js";
export { insertKeyframe, getOrCreateTrack, addTransformKeyframes, removeTracksForObject } from "./animation/addKeyframe.js";
export { normalizeClip, countKeyframes } from "./animation/normalize.js";
export {
  removeKeyframes,
  moveKeyframes,
  setKeyframeValue,
  setKeyframeInterpolation,
} from "./animation/ops.js";
export type { KeyframeRef } from "./animation/ops.js";
