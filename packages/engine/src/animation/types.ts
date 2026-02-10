export type Interpolation = "linear" | "step" | "easeIn" | "easeOut" | "easeInOut";

export interface AnimationTake {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
}

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
  takes?: AnimationTake[];
}

export function createEmptyClip(duration = 5): Clip {
  return { durationSeconds: duration, tracks: [] };
}
