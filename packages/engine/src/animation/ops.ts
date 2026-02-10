import { insertKeyframe } from "./addKeyframe.js";
import { normalizeClip } from "./normalize.js";
import type { Clip, Interpolation, Track, TrackProperty } from "./types.js";

const EPSILON = 1e-6;

export interface KeyframeRef {
  objectId: string;
  property: TrackProperty;
  time: number;
}

function sameTime(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

function roundTime(time: number): number {
  return Math.round(time * 1_000_000) / 1_000_000;
}

function findTrack(clip: Clip, ref: KeyframeRef): Track | undefined {
  return clip.tracks.find((track) => track.objectId === ref.objectId && track.property === ref.property);
}

function findKeyframeIndex(track: Track, time: number): number {
  return track.keyframes.findIndex((keyframe) => sameTime(keyframe.time, time));
}

function dedupeRefs(refs: KeyframeRef[]): KeyframeRef[] {
  const seen = new Set<string>();
  const unique: KeyframeRef[] = [];
  for (const ref of refs) {
    const token = `${ref.objectId}|${ref.property}|${ref.time.toFixed(6)}`;
    if (seen.has(token)) continue;
    seen.add(token);
    unique.push(ref);
  }
  return unique;
}

export function removeKeyframes(clip: Clip, refs: KeyframeRef[]): void {
  if (refs.length === 0) return;

  for (const ref of dedupeRefs(refs)) {
    const track = findTrack(clip, ref);
    if (!track) continue;
    const index = findKeyframeIndex(track, ref.time);
    if (index >= 0) {
      track.keyframes.splice(index, 1);
    }
  }

  normalizeClip(clip);
}

export function moveKeyframes(clip: Clip, refs: KeyframeRef[], deltaTime: number): KeyframeRef[] {
  if (refs.length === 0 || deltaTime === 0) return refs;

  const selected = dedupeRefs(refs);
  const removalsByTrack = new Map<Track, number[]>();
  const captured: Array<{
    track: Track;
    ref: KeyframeRef;
    value: number;
    interpolation: Interpolation;
  }> = [];

  for (const ref of selected) {
    const track = findTrack(clip, ref);
    if (!track) continue;

    const index = findKeyframeIndex(track, ref.time);
    if (index < 0) continue;

    const key = track.keyframes[index];
    captured.push({
      track,
      ref,
      value: key.value,
      interpolation: key.interpolation,
    });

    const existing = removalsByTrack.get(track);
    if (existing) {
      existing.push(index);
    } else {
      removalsByTrack.set(track, [index]);
    }
  }

  for (const [track, indices] of removalsByTrack) {
    indices.sort((a, b) => b - a);
    for (const index of indices) {
      track.keyframes.splice(index, 1);
    }
  }

  const movedRefs: KeyframeRef[] = [];
  for (const item of captured) {
    const nextTime = roundTime(Math.max(0, Math.min(clip.durationSeconds, item.ref.time + deltaTime)));
    insertKeyframe(item.track, {
      time: nextTime,
      value: item.value,
      interpolation: item.interpolation,
    });
    movedRefs.push({
      objectId: item.ref.objectId,
      property: item.ref.property,
      time: nextTime,
    });
  }

  normalizeClip(clip);
  return movedRefs;
}

export function setKeyframeValue(clip: Clip, ref: KeyframeRef, newValue: number): KeyframeRef | null {
  const track = findTrack(clip, ref);
  if (!track) return null;

  const index = findKeyframeIndex(track, ref.time);
  if (index < 0) return null;

  track.keyframes[index].value = newValue;
  normalizeClip(clip);
  return {
    objectId: ref.objectId,
    property: ref.property,
    time: track.keyframes[index].time,
  };
}

export function setKeyframeInterpolation(
  clip: Clip,
  ref: KeyframeRef,
  interpolation: Interpolation,
): KeyframeRef | null {
  const track = findTrack(clip, ref);
  if (!track) return null;

  const index = findKeyframeIndex(track, ref.time);
  if (index < 0) return null;

  track.keyframes[index].interpolation = interpolation;
  normalizeClip(clip);
  return {
    objectId: ref.objectId,
    property: ref.property,
    time: track.keyframes[index].time,
  };
}
