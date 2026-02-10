import type {
  Clip,
  Interpolation,
  KeyframeRef,
  TrackProperty,
} from "@motionforge/engine";
import {
  addTransformKeyframes,
  createEmptyClip,
  evaluateClip,
  getKeyframeTimesForObject,
  getOrCreateTrack,
  insertKeyframe,
  moveKeyframes,
  normalizeClip,
  removeKeyframes,
  setKeyframeInterpolation,
  setKeyframeValue,
} from "@motionforge/engine";
import { sceneStore } from "./sceneStore.js";
import { undoStore } from "./undoStore.js";

import type * as THREE from "three";

type Channel = "time" | "playback" | "keyframes";
type Listener = () => void;

export interface ActionSource {
  label?: string;
  source?: "inspector" | "shortcut" | "timeline" | string;
}

export interface SelectedKeyframeRef {
  objectId: string;
  propertyPath: TrackProperty;
  time: number;
}

export interface KeyframeRecord extends SelectedKeyframeRef {
  value: number;
  interpolation: Interpolation;
}

interface ApplyOptions {
  markDirty?: boolean;
  notifyPlayback?: boolean;
  syncScene?: boolean;
}

const EPSILON = 1e-6;

let clip: Clip = createEmptyClip(5);
let currentTime = 0;
let isPlaying = false;
let animFrameId = 0;
let lastTimestamp = 0;

const listeners: Record<Channel, Set<Listener>> = {
  time: new Set(),
  playback: new Set(),
  keyframes: new Set(),
};

function notify(channel: Channel) {
  listeners[channel].forEach((fn) => fn());
}

function cloneClip(source: Clip): Clip {
  return structuredClone(source);
}

function sameTime(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

function toTrackPropertyPath(property: "position" | "rotation" | "scale", axis: "x" | "y" | "z"): TrackProperty {
  return `${property}.${axis}` as TrackProperty;
}

function toEngineRef(ref: SelectedKeyframeRef): KeyframeRef {
  return {
    objectId: ref.objectId,
    property: ref.propertyPath,
    time: ref.time,
  };
}

function fromEngineRef(ref: KeyframeRef): SelectedKeyframeRef {
  return {
    objectId: ref.objectId,
    propertyPath: ref.property,
    time: ref.time,
  };
}

function applyProperty(obj: THREE.Object3D, prop: TrackProperty, val: number) {
  const [group, axis] = prop.split(".") as [string, "x" | "y" | "z"];
  if (group === "position") obj.position[axis] = val;
  else if (group === "rotation") obj.rotation[axis] = val;
  else if (group === "scale") obj.scale[axis] = val;
}

function applyClipToScene(t: number) {
  const result = evaluateClip(clip, t);
  for (const [objectId, props] of result) {
    const obj = sceneStore.getObjectById(objectId);
    if (!obj) continue;
    for (const [property, value] of props) {
      applyProperty(obj, property, value);
    }
  }
}

function applyClipState(nextClip: Clip, options: ApplyOptions = {}) {
  clip = nextClip;

  const clampedTime = Math.max(0, Math.min(currentTime, clip.durationSeconds));
  const timeChanged = !sameTime(clampedTime, currentTime);
  currentTime = clampedTime;

  if (options.syncScene !== false) {
    applyClipToScene(currentTime);
    sceneStore.notifyTransformChanged({ markDirty: false });
  }

  notify("keyframes");
  if (timeChanged) {
    notify("time");
  }
  if (options.notifyPlayback) {
    notify("playback");
  }
  if (options.markDirty !== false) {
    sceneStore.markDirty();
  }
}

function createClipCommand(label: string, before: Clip, after: Clip, options: ApplyOptions = {}) {
  const beforeJson = JSON.stringify(before);
  const afterJson = JSON.stringify(after);
  if (beforeJson === afterJson) {
    return false;
  }

  undoStore.push({
    label,
    do() {
      applyClipState(cloneClip(after), options);
    },
    undo() {
      applyClipState(cloneClip(before), options);
    },
  });
  return true;
}

function durationLabel(source?: ActionSource): string {
  if (source?.label) return source.label;
  return "Change Duration";
}

function keyframeLabel(property: "position" | "rotation" | "scale", source?: ActionSource): string {
  if (source?.label) return source.label;
  const suffix = property[0].toUpperCase() + property.slice(1);
  return `Keyframe ${suffix}`;
}

function tick(timestamp: number) {
  if (!isPlaying) return;
  if (lastTimestamp === 0) {
    lastTimestamp = timestamp;
  }
  const dt = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;

  currentTime += dt;
  if (currentTime >= clip.durationSeconds) {
    currentTime = 0;
  }

  applyClipToScene(currentTime);
  notify("time");
  animFrameId = requestAnimationFrame(tick);
}

export const animationStore = {
  getClip(): Clip {
    return clip;
  },

  setClip(nextClip: Clip, options?: { markDirty?: boolean }) {
    applyClipState(cloneClip(nextClip), {
      markDirty: options?.markDirty ?? false,
      notifyPlayback: true,
    });
  },

  getCurrentTime(): number {
    return currentTime;
  },

  getDuration(): number {
    return clip.durationSeconds;
  },

  setDuration(seconds: number, options?: ActionSource & { undoable?: boolean }) {
    const nextDuration = Math.max(0.1, seconds);
    if (!Number.isFinite(nextDuration)) return;

    const before = cloneClip(clip);
    const after = cloneClip(clip);
    after.durationSeconds = nextDuration;
    normalizeClip(after);

    if (options?.undoable === false) {
      applyClipState(after, {
        markDirty: options?.source !== "load",
        notifyPlayback: true,
      });
      return;
    }

    createClipCommand(durationLabel(options), before, after, {
      notifyPlayback: true,
      markDirty: true,
    });
  },

  isPlaying(): boolean {
    return isPlaying;
  },

  play() {
    if (isPlaying) return;
    isPlaying = true;
    lastTimestamp = 0;
    animFrameId = requestAnimationFrame(tick);
    notify("playback");
  },

  pause() {
    if (!isPlaying) return;
    isPlaying = false;
    cancelAnimationFrame(animFrameId);
    notify("playback");
  },

  togglePlayback() {
    if (isPlaying) this.pause();
    else this.play();
  },

  scrubTo(timeSeconds: number) {
    currentTime = Math.max(0, Math.min(timeSeconds, clip.durationSeconds));
    applyClipToScene(currentTime);
    notify("time");
    sceneStore.notifyTransformChanged({ markDirty: false });
  },

  addKeyframesForSelected(property: "position" | "rotation" | "scale", source?: ActionSource): SelectedKeyframeRef[] {
    const id = sceneStore.getSelectedId();
    if (!id) return [];
    const obj = sceneStore.getObjectById(id);
    if (!obj) return [];

    let values: { x: number; y: number; z: number };
    if (property === "position") {
      values = { x: obj.position.x, y: obj.position.y, z: obj.position.z };
    } else if (property === "rotation") {
      values = { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z };
    } else {
      values = { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z };
    }

    const before = cloneClip(clip);
    const after = cloneClip(clip);
    addTransformKeyframes(after, id, property, currentTime, values);
    normalizeClip(after);

    const committed = createClipCommand(keyframeLabel(property, source), before, after, {
      markDirty: true,
    });

    if (!committed) return [];

    return (["x", "y", "z"] as const).map((axis) => ({
      objectId: id,
      propertyPath: toTrackPropertyPath(property, axis),
      time: currentTime,
    }));
  },

  addAllKeyframesForSelected(source?: ActionSource): SelectedKeyframeRef[] {
    const id = sceneStore.getSelectedId();
    if (!id) return [];
    const obj = sceneStore.getObjectById(id);
    if (!obj) return [];

    const before = cloneClip(clip);
    const after = cloneClip(clip);

    addTransformKeyframes(after, id, "position", currentTime, {
      x: obj.position.x,
      y: obj.position.y,
      z: obj.position.z,
    });
    addTransformKeyframes(after, id, "rotation", currentTime, {
      x: obj.rotation.x,
      y: obj.rotation.y,
      z: obj.rotation.z,
    });
    addTransformKeyframes(after, id, "scale", currentTime, {
      x: obj.scale.x,
      y: obj.scale.y,
      z: obj.scale.z,
    });
    normalizeClip(after);

    const committed = createClipCommand(source?.label ?? "Keyframe Transform", before, after, {
      markDirty: true,
    });
    if (!committed) return [];

    const refs: SelectedKeyframeRef[] = [];
    for (const property of ["position", "rotation", "scale"] as const) {
      for (const axis of ["x", "y", "z"] as const) {
        refs.push({
          objectId: id,
          propertyPath: toTrackPropertyPath(property, axis),
          time: currentTime,
        });
      }
    }

    return refs;
  },

  removeKeyframes(refs: SelectedKeyframeRef[], source?: ActionSource): boolean {
    if (refs.length === 0) return false;
    const before = cloneClip(clip);
    const after = cloneClip(clip);
    removeKeyframes(after, refs.map(toEngineRef));

    return createClipCommand(source?.label ?? "Delete Keyframes", before, after, {
      markDirty: true,
    });
  },

  insertKeyframes(records: KeyframeRecord[], source?: ActionSource): SelectedKeyframeRef[] {
    if (records.length === 0) return [];
    const before = cloneClip(clip);
    const after = cloneClip(clip);

    for (const record of records) {
      const track = getOrCreateTrack(after, record.objectId, record.propertyPath);
      insertKeyframe(track, {
        time: record.time,
        value: record.value,
        interpolation: record.interpolation,
      });
    }
    normalizeClip(after);

    const committed = createClipCommand(source?.label ?? "Insert Keyframes", before, after, {
      markDirty: true,
    });

    if (!committed) return [];
    return records.map((record) => ({
      objectId: record.objectId,
      propertyPath: record.propertyPath,
      time: Math.max(0, Math.min(after.durationSeconds, record.time)),
    }));
  },

  moveKeyframes(refs: SelectedKeyframeRef[], deltaTime: number, source?: ActionSource): SelectedKeyframeRef[] {
    if (refs.length === 0 || Math.abs(deltaTime) < EPSILON) return refs;

    const before = cloneClip(clip);
    const after = cloneClip(clip);
    const moved = moveKeyframes(after, refs.map(toEngineRef), deltaTime).map(fromEngineRef);

    const committed = createClipCommand(source?.label ?? "Move Keyframes", before, after, {
      markDirty: true,
    });

    return committed ? moved : refs;
  },

  setKeyframeTime(ref: SelectedKeyframeRef, nextTime: number, source?: ActionSource): SelectedKeyframeRef | null {
    const deltaTime = nextTime - ref.time;
    if (Math.abs(deltaTime) < EPSILON) return ref;

    const [moved] = this.moveKeyframes([ref], deltaTime, {
      ...source,
      label: source?.label ?? "Keyframe Time",
    });

    return moved ?? null;
  },

  setKeyframeValue(ref: SelectedKeyframeRef, value: number, source?: ActionSource): SelectedKeyframeRef | null {
    const before = cloneClip(clip);
    const after = cloneClip(clip);
    const updated = setKeyframeValue(after, toEngineRef(ref), value);
    if (!updated) return null;

    const committed = createClipCommand(source?.label ?? "Keyframe Value", before, after, {
      markDirty: true,
    });
    if (!committed) return null;

    return fromEngineRef(updated);
  },

  setKeyframeInterpolation(ref: SelectedKeyframeRef, interpolation: Interpolation, source?: ActionSource): SelectedKeyframeRef | null {
    const before = cloneClip(clip);
    const after = cloneClip(clip);
    const updated = setKeyframeInterpolation(after, toEngineRef(ref), interpolation);
    if (!updated) return null;

    const committed = createClipCommand(source?.label ?? "Keyframe Interpolation", before, after, {
      markDirty: true,
    });
    if (!committed) return null;

    return fromEngineRef(updated);
  },

  getKeyframe(ref: SelectedKeyframeRef): KeyframeRecord | null {
    const track = clip.tracks.find(
      (item) => item.objectId === ref.objectId && item.property === ref.propertyPath,
    );
    if (!track) return null;

    const keyframe = track.keyframes.find((item) => sameTime(item.time, ref.time));
    if (!keyframe) return null;

    return {
      objectId: ref.objectId,
      propertyPath: ref.propertyPath,
      time: keyframe.time,
      value: keyframe.value,
      interpolation: keyframe.interpolation,
    };
  },

  getKeyframesForObject(objectId: string, properties?: TrackProperty[]): KeyframeRecord[] {
    const propertyFilter = properties ? new Set(properties) : null;
    const records: KeyframeRecord[] = [];

    for (const track of clip.tracks) {
      if (track.objectId !== objectId) continue;
      if (propertyFilter && !propertyFilter.has(track.property)) continue;

      for (const keyframe of track.keyframes) {
        records.push({
          objectId,
          propertyPath: track.property,
          time: keyframe.time,
          value: keyframe.value,
          interpolation: keyframe.interpolation,
        });
      }
    }

    records.sort((a, b) => {
      const dt = a.time - b.time;
      if (Math.abs(dt) > EPSILON) return dt;
      return a.propertyPath.localeCompare(b.propertyPath);
    });

    return records;
  },

  getKeyframeTimesForSelected(): number[] {
    const id = sceneStore.getSelectedId();
    if (!id) return [];
    return getKeyframeTimesForObject(clip, id);
  },

  reset() {
    clip = createEmptyClip(5);
    currentTime = 0;
    isPlaying = false;
    cancelAnimationFrame(animFrameId);
    notify("time");
    notify("playback");
    notify("keyframes");
  },

  subscribe(channel: Channel, listener: Listener): () => void {
    listeners[channel].add(listener);
    return () => listeners[channel].delete(listener);
  },
};
