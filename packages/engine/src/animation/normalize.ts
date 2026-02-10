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

  if (Array.isArray(clip.takes)) {
    const seen = new Set<string>();
    const normalized = clip.takes
      .filter((take) => typeof take.id === "string" && take.id.length > 0 && !seen.has(take.id))
      .map((take) => {
        seen.add(take.id);
        const start = Math.max(0, Math.min(take.startTime, clip.durationSeconds));
        const end = Math.max(start, Math.min(take.endTime, clip.durationSeconds));
        return {
          ...take,
          startTime: start,
          endTime: end,
        };
      })
      .filter((take) => take.endTime > take.startTime)
      .sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
    clip.takes = normalized;
  }
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
