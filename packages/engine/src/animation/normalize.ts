import type { Clip } from "./types.js";

/**
 * Normalize a clip: sort all keyframes by time, clamp times to [0, duration],
 * remove tracks with no keyframes.
 */
export function normalizeClip(clip: Clip): void {
  for (const track of clip.tracks) {
    // Clamp and sort
    for (const kf of track.keyframes) {
      kf.time = Math.max(0, Math.min(kf.time, clip.durationSeconds));
    }
    track.keyframes.sort((a, b) => a.time - b.time);
  }
  // Remove empty tracks
  clip.tracks = clip.tracks.filter((t) => t.keyframes.length > 0);
}

/**
 * Count total keyframes in a clip.
 */
export function countKeyframes(clip: Clip): number {
  let n = 0;
  for (const track of clip.tracks) {
    n += track.keyframes.length;
  }
  return n;
}
