export const LATEST_PROJECT_VERSION = 4;

interface MutableProject {
  version?: unknown;
  [key: string]: unknown;
}

export interface ProjectMigrationResult {
  data: MutableProject;
  version: number | null;
  applied: string[];
}

function cloneProject<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function isObjectRecord(value: unknown): value is MutableProject {
  return typeof value === "object" && value !== null;
}

function migrateV1ToV2(input: MutableProject): MutableProject {
  return { ...input, version: 2 };
}

function migrateV2ToV3(input: MutableProject): MutableProject {
  return { ...input, version: 3 };
}

function migrateV3ToV4(input: MutableProject): MutableProject {
  return withSynthesizedBindPaths({ ...input, version: 4 });
}

function sanitizeBindPathSegment(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/\\/g, "/")
    .replace(/\//g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned : "Object";
}

function normalizeBindPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const normalized = trimmed.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
  if (normalized.length === 0) return null;
  return normalized;
}

function withUniqueSuffix(basePath: string, used: Set<string>): string {
  if (!used.has(basePath)) {
    used.add(basePath);
    return basePath;
  }
  let index = 2;
  let candidate = `${basePath}_${index}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${basePath}_${index}`;
  }
  used.add(candidate);
  return candidate;
}

function synthesizeTopLevelBindPaths(
  list: unknown,
  used: Set<string>,
) {
  if (!Array.isArray(list)) return [];

  const output: unknown[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) {
      output.push(item);
      continue;
    }
    const row = { ...(item as Record<string, unknown>) };
    const explicit = normalizeBindPath(row.bindPath);
    const idPart = typeof row.id === "string" && row.id.length > 0 ? row.id : "object";
    const namePart = typeof row.name === "string" && row.name.length > 0 ? row.name : idPart;
    const base = explicit ?? sanitizeBindPathSegment(namePart);
    row.bindPath = withUniqueSuffix(base, used);
    output.push(row);
  }
  return output;
}

function withSynthesizedTrackBindPaths(project: MutableProject): MutableProject {
  const animation = project.animation;
  if (typeof animation !== "object" || animation === null) return project;
  const tracks = (animation as Record<string, unknown>).tracks;
  if (!Array.isArray(tracks)) return project;

  const bindingById = new Map<string, string>();
  const collect = (rows: unknown) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (typeof row !== "object" || row === null) continue;
      const record = row as Record<string, unknown>;
      if (typeof record.id !== "string" || typeof record.bindPath !== "string") continue;
      bindingById.set(record.id, record.bindPath);
    }
  };
  collect(project.objects);
  collect(project.modelInstances);

  const nextTracks = tracks.map((track) => {
    if (typeof track !== "object" || track === null) return track;
    const row = { ...(track as Record<string, unknown>) };
    if (typeof row.bindPath === "string" && normalizeBindPath(row.bindPath)) {
      row.bindPath = normalizeBindPath(row.bindPath);
      return row;
    }
    if (typeof row.objectId === "string") {
      const resolved = bindingById.get(row.objectId);
      if (resolved) {
        row.bindPath = resolved;
      }
    }
    return row;
  });

  return {
    ...project,
    animation: {
      ...(animation as Record<string, unknown>),
      tracks: nextTracks,
    },
  };
}

function withSynthesizedAnimationTakes(project: MutableProject): MutableProject {
  const animation = project.animation;
  if (typeof animation !== "object" || animation === null) return project;
  const record = animation as Record<string, unknown>;
  const duration = typeof record.durationSeconds === "number" && Number.isFinite(record.durationSeconds)
    ? Math.max(0, record.durationSeconds)
    : 0;
  if (duration <= 0) return project;

  const takesRaw = record.takes;
  const hasValidTakes = Array.isArray(takesRaw) && takesRaw.some((take) => {
    if (typeof take !== "object" || take === null) return false;
    const row = take as Record<string, unknown>;
    return typeof row.id === "string" && row.id.length > 0 &&
      typeof row.name === "string" && row.name.length > 0 &&
      typeof row.startTime === "number" && Number.isFinite(row.startTime) &&
      typeof row.endTime === "number" && Number.isFinite(row.endTime) &&
      row.endTime > row.startTime;
  });

  if (hasValidTakes) return project;

  return {
    ...project,
    animation: {
      ...record,
      takes: [
        {
          id: "take_main",
          name: "Main",
          startTime: 0,
          endTime: duration,
        },
      ],
    },
  };
}

function withSynthesizedBindPaths(input: MutableProject): MutableProject {
  const used = new Set<string>();
  const objects = synthesizeTopLevelBindPaths(input.objects, used);
  const modelInstances = synthesizeTopLevelBindPaths(input.modelInstances, used);
  const next: MutableProject = {
    ...input,
    objects: Array.isArray(input.objects) ? objects : input.objects,
    modelInstances: Array.isArray(input.modelInstances) ? modelInstances : input.modelInstances,
  };
  return withSynthesizedAnimationTakes(withSynthesizedTrackBindPaths(next));
}

export function migrateProjectDataToLatest(input: unknown): ProjectMigrationResult {
  if (!isObjectRecord(input)) {
    return {
      data: { version: null },
      version: null,
      applied: [],
    };
  }

  let working = cloneProject(input);
  const applied: string[] = [];
  const currentVersion = typeof working.version === "number" && Number.isFinite(working.version)
    ? working.version
    : null;

  if (currentVersion === null) {
    return {
      data: working,
      version: null,
      applied,
    };
  }

  while (typeof working.version === "number" && Number.isFinite(working.version) && working.version < LATEST_PROJECT_VERSION) {
    if (working.version === 1) {
      working = migrateV1ToV2(working);
      applied.push("v1->v2");
      continue;
    }
    if (working.version === 2) {
      working = migrateV2ToV3(working);
      applied.push("v2->v3");
      continue;
    }
    if (working.version === 3) {
      working = migrateV3ToV4(working);
      applied.push("v3->v4");
      continue;
    }
    break;
  }

  if (typeof working.version === "number" && Number.isFinite(working.version) && working.version >= 4) {
    working = withSynthesizedBindPaths(working);
  }

  return {
    data: working,
    version: typeof working.version === "number" && Number.isFinite(working.version) ? working.version : null,
    applied,
  };
}
