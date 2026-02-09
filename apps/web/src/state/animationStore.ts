import type { Clip, TrackProperty } from "@motionforge/engine";
import { createEmptyClip, evaluateClip, addTransformKeyframes, getKeyframeTimesForObject } from "@motionforge/engine";
import { sceneStore } from "./sceneStore.js";

type Channel = "time" | "playback" | "keyframes";
type Listener = () => void;

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

function notify(ch: Channel) {
  listeners[ch].forEach((fn) => fn());
}

function applyClipToScene(t: number) {
  const result = evaluateClip(clip, t);
  for (const [objId, props] of result) {
    const obj = sceneStore.getObjectById(objId);
    if (!obj) continue;
    for (const [prop, val] of props) {
      applyProperty(obj, prop, val);
    }
  }
}

function applyProperty(obj: THREE.Object3D, prop: TrackProperty, val: number) {
  const [group, axis] = prop.split(".") as [string, "x" | "y" | "z"];
  if (group === "position") obj.position[axis] = val;
  else if (group === "rotation") obj.rotation[axis] = val;
  else if (group === "scale") obj.scale[axis] = val;
}

import type * as THREE from "three";

function tick(timestamp: number) {
  if (!isPlaying) return;
  if (lastTimestamp === 0) lastTimestamp = timestamp;
  const dt = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;

  currentTime += dt;
  if (currentTime >= clip.durationSeconds) {
    currentTime = 0; // loop
  }

  applyClipToScene(currentTime);
  notify("time");
  animFrameId = requestAnimationFrame(tick);
}

export const animationStore = {
  getClip(): Clip {
    return clip;
  },

  setClip(c: Clip) {
    clip = c;
    notify("keyframes");
  },

  getCurrentTime(): number {
    return currentTime;
  },

  getDuration(): number {
    return clip.durationSeconds;
  },

  setDuration(s: number) {
    clip.durationSeconds = Math.max(0.1, s);
    notify("playback");
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

  scrubTo(t: number) {
    currentTime = Math.max(0, Math.min(t, clip.durationSeconds));
    applyClipToScene(currentTime);
    notify("time");
    sceneStore.notifyTransformChanged();
  },

  addKeyframesForSelected(property: "position" | "rotation" | "scale") {
    const id = sceneStore.getSelectedId();
    if (!id) return;
    const obj = sceneStore.getObjectById(id);
    if (!obj) return;

    let values: { x: number; y: number; z: number };
    if (property === "position") values = { x: obj.position.x, y: obj.position.y, z: obj.position.z };
    else if (property === "rotation") values = { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z };
    else values = { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z };

    addTransformKeyframes(clip, id, property, currentTime, values);
    notify("keyframes");
    sceneStore.markDirty();
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

  subscribe(ch: Channel, fn: Listener): () => void {
    listeners[ch].add(fn);
    return () => listeners[ch].delete(fn);
  },
};
