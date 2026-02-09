import type { Keyframe, Track, Clip, TrackProperty, Interpolation } from "./types.js";

/**
 * Insert a keyframe into a track, sorted by time.
 * If a keyframe at the same time already exists, replace it.
 */
export function insertKeyframe(track: Track, kf: Keyframe): void {
  const idx = track.keyframes.findIndex((k) => Math.abs(k.time - kf.time) < 1e-6);
  if (idx >= 0) {
    track.keyframes[idx] = kf;
  } else {
    track.keyframes.push(kf);
    track.keyframes.sort((a, b) => a.time - b.time);
  }
}

/**
 * Find or create a track for the given objectId + property in a clip.
 */
export function getOrCreateTrack(clip: Clip, objectId: string, property: TrackProperty): Track {
  let track = clip.tracks.find((t) => t.objectId === objectId && t.property === property);
  if (!track) {
    track = { objectId, property, keyframes: [] };
    clip.tracks.push(track);
  }
  return track;
}

/**
 * Add keyframes for all 3 axes of a transform property at a given time.
 */
export function addTransformKeyframes(
  clip: Clip,
  objectId: string,
  property: "position" | "rotation" | "scale",
  time: number,
  values: { x: number; y: number; z: number },
  interpolation: Interpolation = "linear",
): void {
  for (const axis of ["x", "y", "z"] as const) {
    const trackProp = `${property}.${axis}` as TrackProperty;
    const track = getOrCreateTrack(clip, objectId, trackProp);
    insertKeyframe(track, { time, value: values[axis], interpolation });
  }
}

/**
 * Remove all keyframes for a given objectId from the clip.
 */
export function removeTracksForObject(clip: Clip, objectId: string): void {
  clip.tracks = clip.tracks.filter((t) => t.objectId !== objectId);
}
