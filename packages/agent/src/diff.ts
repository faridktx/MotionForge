import type { PlanStep } from "./planner.js";

interface ProjectObject {
  id: string;
  name: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  color?: number;
  metallic?: number;
  roughness?: number;
}

interface ProjectAnimationTrack {
  objectId: string;
  property: string;
  keyframes: Array<{
    time: number;
    value: number;
    interpolation?: string;
  }>;
}

interface ProjectDataLike {
  objects?: ProjectObject[];
  animation?: {
    tracks?: ProjectAnimationTrack[];
  };
}

export interface PlanPreviewDiff {
  objects: Array<{ id: string; name: string; changes: string[] }>;
  animation: Array<{
    objectId: string;
    tracks: string[];
    keyframesAdded: number;
    keyframesMoved: number;
    keyframesDeleted: number;
  }>;
  materials: Array<{ objectId: string; changes: string[] }>;
}

export interface PlanRuntimeLike {
  clone(): PlanRuntimeLike;
  execute(action: string, input: unknown): { events: unknown[] };
  exportProjectJson(): string;
}

function parseProject(json: string): ProjectDataLike {
  return JSON.parse(json) as ProjectDataLike;
}

function keyframeToken(track: string, keyframe: { time: number; value: number; interpolation?: string }): string {
  return `${track}|${keyframe.time}|${keyframe.value}|${keyframe.interpolation ?? "linear"}`;
}

function compareObjects(before: ProjectDataLike, after: ProjectDataLike): PlanPreviewDiff["objects"] {
  const beforeMap = new Map((before.objects ?? []).map((item) => [item.id, item]));
  const result: PlanPreviewDiff["objects"] = [];

  for (const object of after.objects ?? []) {
    const prev = beforeMap.get(object.id);
    if (!prev) continue;
    const changes: string[] = [];
    if (prev.name !== object.name) changes.push("name");
    if (JSON.stringify(prev.position) !== JSON.stringify(object.position)) changes.push("position");
    if (JSON.stringify(prev.rotation) !== JSON.stringify(object.rotation)) changes.push("rotation");
    if (JSON.stringify(prev.scale) !== JSON.stringify(object.scale)) changes.push("scale");
    if (changes.length > 0) {
      result.push({
        id: object.id,
        name: object.name,
        changes,
      });
    }
  }

  return result.sort((a, b) => a.id.localeCompare(b.id));
}

function compareMaterials(before: ProjectDataLike, after: ProjectDataLike): PlanPreviewDiff["materials"] {
  const beforeMap = new Map((before.objects ?? []).map((item) => [item.id, item]));
  const result: PlanPreviewDiff["materials"] = [];

  for (const object of after.objects ?? []) {
    const prev = beforeMap.get(object.id);
    if (!prev) continue;
    const changes: string[] = [];
    if (prev.color !== object.color) changes.push("baseColor");
    if (prev.metallic !== object.metallic) changes.push("metallic");
    if (prev.roughness !== object.roughness) changes.push("roughness");
    if (changes.length > 0) {
      result.push({
        objectId: object.id,
        changes,
      });
    }
  }

  return result.sort((a, b) => a.objectId.localeCompare(b.objectId));
}

function compareAnimation(before: ProjectDataLike, after: ProjectDataLike): PlanPreviewDiff["animation"] {
  const beforeTracks = before.animation?.tracks ?? [];
  const afterTracks = after.animation?.tracks ?? [];
  const byObject = new Map<
    string,
    {
      tracks: Set<string>;
      added: number;
      deleted: number;
      moved: number;
    }
  >();

  const beforeTrackMap = new Map(beforeTracks.map((track) => [`${track.objectId}|${track.property}`, track]));
  const afterTrackMap = new Map(afterTracks.map((track) => [`${track.objectId}|${track.property}`, track]));

  const trackKeys = [...new Set([...beforeTrackMap.keys(), ...afterTrackMap.keys()])].sort((a, b) => a.localeCompare(b));
  for (const trackKey of trackKeys) {
    const [objectId, property] = trackKey.split("|");
    if (!objectId || !property) continue;
    const beforeTrack = beforeTrackMap.get(trackKey);
    const afterTrack = afterTrackMap.get(trackKey);
    const beforeTokens = new Set((beforeTrack?.keyframes ?? []).map((keyframe) => keyframeToken(property, keyframe)));
    const afterTokens = new Set((afterTrack?.keyframes ?? []).map((keyframe) => keyframeToken(property, keyframe)));

    let added = 0;
    let deleted = 0;
    for (const token of afterTokens) {
      if (!beforeTokens.has(token)) added += 1;
    }
    for (const token of beforeTokens) {
      if (!afterTokens.has(token)) deleted += 1;
    }

    const beforeCount = beforeTrack?.keyframes.length ?? 0;
    const afterCount = afterTrack?.keyframes.length ?? 0;
    const moved = Math.min(Math.min(added, deleted), Math.max(beforeCount, afterCount));
    const entry = byObject.get(objectId) ?? {
      tracks: new Set<string>(),
      added: 0,
      deleted: 0,
      moved: 0,
    };
    if (added > 0 || deleted > 0 || moved > 0) {
      entry.tracks.add(property);
      entry.added += added;
      entry.deleted += deleted;
      entry.moved += moved;
      byObject.set(objectId, entry);
    }
  }

  return [...byObject.entries()]
    .map(([objectId, value]) => ({
      objectId,
      tracks: [...value.tracks].sort((a, b) => a.localeCompare(b)),
      keyframesAdded: value.added,
      keyframesMoved: value.moved,
      keyframesDeleted: value.deleted,
    }))
    .sort((a, b) => a.objectId.localeCompare(b.objectId));
}

export function createEmptyDiff(): PlanPreviewDiff {
  return {
    objects: [],
    animation: [],
    materials: [],
  };
}

export function buildProjectDiff(beforeProjectJson: string, afterProjectJson: string): PlanPreviewDiff {
  const before = parseProject(beforeProjectJson);
  const after = parseProject(afterProjectJson);
  return {
    objects: compareObjects(before, after),
    animation: compareAnimation(before, after),
    materials: compareMaterials(before, after),
  };
}

export function simulatePlanDiff(runtime: PlanRuntimeLike, steps: PlanStep[]): PlanPreviewDiff {
  const runtimeClone = runtime.clone();
  const beforeJson = runtimeClone.exportProjectJson();
  for (const step of steps) {
    if (step.type !== "mutate") continue;
    runtimeClone.execute(step.command.action, step.command.input);
  }
  const afterJson = runtimeClone.exportProjectJson();
  return buildProjectDiff(beforeJson, afterJson);
}
