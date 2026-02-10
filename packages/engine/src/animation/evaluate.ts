import type { Track, Keyframe, Clip, TrackProperty } from "./types.js";

/**
 * Evaluate a single track at time t. Returns the interpolated value,
 * or null if the track has no keyframes.
 */
export function evaluateTrack(track: Track, t: number): number | null {
  const kfs = track.keyframes;
  if (kfs.length === 0) return null;
  if (kfs.length === 1) return kfs[0].value;

  // Before first keyframe
  if (t <= kfs[0].time) return kfs[0].value;
  // After last keyframe
  if (t >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;

  // Find surrounding keyframes
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (t >= a.time && t <= b.time) {
      return interpolate(a, b, t);
    }
  }

  return kfs[kfs.length - 1].value;
}

function interpolate(a: Keyframe, b: Keyframe, t: number): number {
  if (a.interpolation === "step") return a.value;

  const dt = b.time - a.time;
  if (dt === 0) return a.value;
  const alpha = (t - a.time) / dt;
  const easedAlpha = applyInterpolation(alpha, a.interpolation);
  return a.value + (b.value - a.value) * easedAlpha;
}

function applyInterpolation(alpha: number, interpolation: Keyframe["interpolation"]): number {
  if (interpolation === "linear") return alpha;
  if (interpolation === "easeIn") return alpha * alpha * alpha;
  if (interpolation === "easeOut") {
    const inv = 1 - alpha;
    return 1 - inv * inv * inv;
  }
  if (interpolation === "easeInOut") {
    if (alpha < 0.5) return 4 * alpha * alpha * alpha;
    const inv = -2 * alpha + 2;
    return 1 - (inv * inv * inv) / 2;
  }
  return alpha;
}

/**
 * Result of evaluating a clip at time t.
 * Maps objectId -> property -> value.
 */
export type EvalResult = Map<string, Map<TrackProperty, number>>;

/**
 * Evaluate all tracks in a clip at time t.
 */
export function evaluateClip(clip: Clip, t: number): EvalResult {
  const result: EvalResult = new Map();

  for (const track of clip.tracks) {
    const val = evaluateTrack(track, t);
    if (val === null) continue;

    let objMap = result.get(track.objectId);
    if (!objMap) {
      objMap = new Map();
      result.set(track.objectId, objMap);
    }
    objMap.set(track.property, val);
  }

  return result;
}

/**
 * Get all keyframe times for a specific object in a clip.
 */
export function getKeyframeTimesForObject(clip: Clip, objectId: string): number[] {
  const times = new Set<number>();
  for (const track of clip.tracks) {
    if (track.objectId === objectId) {
      for (const kf of track.keyframes) {
        times.add(Math.round(kf.time * 1000) / 1000);
      }
    }
  }
  return Array.from(times).sort((a, b) => a - b);
}
