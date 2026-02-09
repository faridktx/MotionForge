export type Interpolation = "linear" | "step";

export interface Keyframe {
  time: number;
  value: number;
  interpolation: Interpolation;
}

export type TrackProperty =
  | "position.x" | "position.y" | "position.z"
  | "rotation.x" | "rotation.y" | "rotation.z"
  | "scale.x" | "scale.y" | "scale.z";

export interface Track {
  objectId: string;
  property: TrackProperty;
  keyframes: Keyframe[];
}

export interface Clip {
  durationSeconds: number;
  tracks: Track[];
}

export function createEmptyClip(duration = 5): Clip {
  return { durationSeconds: duration, tracks: [] };
}
