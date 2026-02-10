import type { Interpolation, TrackProperty } from "@motionforge/engine";
import { agentApi } from "./agentApi.js";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
interface JsonObject {
  [key: string]: JsonValue;
}

export interface SkillStep {
  id: string;
  action: string;
  ok: boolean;
  input?: JsonValue;
  result?: JsonValue;
  error?: string;
}

export interface SkillReport {
  skill: string;
  steps: SkillStep[];
  warnings: string[];
  outputs: JsonObject[];
}

export interface RenameRuleSet {
  match?: string;
  replace?: string;
  prefix?: string;
  suffix?: string;
  caseSensitive?: boolean;
}

export interface RenameNodeInput {
  objectId: string;
  name: string;
}

export interface RenameChange {
  objectId: string;
  name: string;
}

export interface KeyframeTransformSequenceInput {
  position?: [number, number, number] | Array<[number, number, number]>;
  rotation?: [number, number, number] | Array<[number, number, number]>;
  scale?: [number, number, number] | Array<[number, number, number]>;
}

export interface BuildKeyframePlanInput {
  objectId: string;
  times: number[];
  transforms: KeyframeTransformSequenceInput;
  interpolation: Interpolation;
}

export interface PlannedKeyframeRecord {
  objectId: string;
  propertyPath: TrackProperty;
  time: number;
  value: number;
  interpolation: Interpolation;
}

export interface AddKeyframesForSelectionInput {
  times: number[];
  transforms: KeyframeTransformSequenceInput;
  interpolation?: Interpolation;
}

export interface ExportVideoPreviewInput {
  format: "mp4" | "gif";
  fps: number;
  duration: number;
  resolution: {
    width: number;
    height: number;
  };
}

function normalizeText(value: string, caseSensitive?: boolean): string {
  return caseSensitive ? value : value.toLowerCase();
}

function applyRenameRule(name: string, ruleset: RenameRuleSet): string {
  let next = name;
  if (ruleset.match && ruleset.replace !== undefined) {
    const source = normalizeText(next, ruleset.caseSensitive);
    const target = normalizeText(ruleset.match, ruleset.caseSensitive);
    const matchIndex = source.indexOf(target);
    if (matchIndex >= 0) {
      const end = matchIndex + ruleset.match.length;
      next = `${next.slice(0, matchIndex)}${ruleset.replace}${next.slice(end)}`;
    }
  }
  if (ruleset.prefix) {
    next = `${ruleset.prefix}${next}`;
  }
  if (ruleset.suffix) {
    next = `${next}${ruleset.suffix}`;
  }
  return next;
}

export function buildRenamePlan(nodes: RenameNodeInput[], ruleset: RenameRuleSet): RenameChange[] {
  const changes: RenameChange[] = [];
  for (const node of nodes) {
    const renamed = applyRenameRule(node.name, ruleset).trim();
    if (renamed.length === 0 || renamed === node.name) continue;
    changes.push({
      objectId: node.objectId,
      name: renamed,
    });
  }

  return changes.sort((a, b) => a.objectId.localeCompare(b.objectId));
}

function resolveVec3Value(
  value: [number, number, number] | Array<[number, number, number]> | undefined,
  index: number,
): [number, number, number] | null {
  if (!value) return null;
  if (Array.isArray(value) && value.length > 0 && Array.isArray(value[0])) {
    const list = value as Array<[number, number, number]>;
    const item = list[Math.min(index, list.length - 1)];
    return item;
  }
  return value as [number, number, number];
}

export function buildKeyframePlan(input: BuildKeyframePlanInput): PlannedKeyframeRecord[] {
  const times = [...input.times]
    .filter((time) => Number.isFinite(time))
    .map((time) => Math.max(0, Number(time.toFixed(6))))
    .sort((a, b) => a - b);

  const records: PlannedKeyframeRecord[] = [];
  for (let i = 0; i < times.length; i += 1) {
    const time = times[i];
    const position = resolveVec3Value(input.transforms.position, i);
    const rotation = resolveVec3Value(input.transforms.rotation, i);
    const scale = resolveVec3Value(input.transforms.scale, i);

    const insertAxisValues = (group: "position" | "rotation" | "scale", vec: [number, number, number] | null) => {
      if (!vec) return;
      const axes = ["x", "y", "z"] as const;
      for (let axisIndex = 0; axisIndex < axes.length; axisIndex += 1) {
        records.push({
          objectId: input.objectId,
          propertyPath: `${group}.${axes[axisIndex]}` as TrackProperty,
          time,
          value: vec[axisIndex],
          interpolation: input.interpolation,
        });
      }
    };

    insertAxisValues("position", position);
    insertAxisValues("rotation", rotation);
    insertAxisValues("scale", scale);
  }

  records.sort((a, b) => {
    const dt = a.time - b.time;
    if (Math.abs(dt) > 1e-9) return dt;
    return a.propertyPath.localeCompare(b.propertyPath);
  });
  return records;
}

export function formatSkillReport(
  skill: string,
  steps: SkillStep[],
  warnings: string[] = [],
  outputs: JsonObject[] = [],
): SkillReport {
  return {
    skill,
    steps,
    warnings,
    outputs,
  };
}

async function executeCommandStep(
  id: string,
  commandId: string,
  payload?: JsonValue,
): Promise<SkillStep> {
  const response = await agentApi.execute("command.execute", {
    commandId,
    payload,
  });
  return {
    id,
    action: `command.execute:${commandId}`,
    ok: response.ok,
    input: payload,
    result: response.result ?? undefined,
    error: response.error ?? undefined,
  };
}

export async function importModelFromUrl(url: string): Promise<SkillReport> {
  const step = await executeCommandStep("import-url", "agent.project.importModelFromUrl", { url });
  return formatSkillReport(
    "importModelFromUrl",
    [step],
    step.ok ? [] : ["Import failed or blocked by Dev Tools flag."],
    step.ok ? [{ modelImport: step.result as JsonValue }] : [],
  );
}

export async function renameHierarchyWithRules(ruleset: RenameRuleSet): Promise<SkillReport> {
  const steps: SkillStep[] = [];
  const warnings: string[] = [];
  const snapshotResponse = await agentApi.execute("state.snapshot", {});
  steps.push({
    id: "snapshot",
    action: "state.snapshot",
    ok: snapshotResponse.ok,
    result: snapshotResponse.result ?? undefined,
    error: snapshotResponse.error ?? undefined,
  });

  if (!snapshotResponse.ok || !snapshotResponse.result || typeof snapshotResponse.result !== "object") {
    warnings.push("Snapshot unavailable.");
    return formatSkillReport("renameHierarchyWithRules", steps, warnings, []);
  }

  const snapshot = snapshotResponse.result as {
    scene?: {
      nodes?: Array<{ id: string; name: string }>;
    };
  };
  const nodes = (snapshot.scene?.nodes ?? []).map((node) => ({
    objectId: node.id,
    name: node.name,
  }));
  const changes = buildRenamePlan(nodes, ruleset);
  if (changes.length === 0) {
    warnings.push("No hierarchy names matched the provided ruleset.");
    return formatSkillReport("renameHierarchyWithRules", steps, warnings, []);
  }

  const renameStep = await executeCommandStep(
    "rename",
    "agent.hierarchy.renameMany",
    { changes } as unknown as JsonValue,
  );
  steps.push(renameStep);
  return formatSkillReport(
    "renameHierarchyWithRules",
    steps,
    renameStep.ok ? warnings : [...warnings, "Rename command failed."],
    renameStep.ok ? [{ renamedCount: changes.length }] : [],
  );
}

export async function setMaterial(
  objectId: string,
  material: { baseColor?: string | number; metallic?: number; roughness?: number },
): Promise<SkillReport> {
  const step = await executeCommandStep("set-material", "agent.material.set", {
    objectId,
    ...material,
  });

  return formatSkillReport(
    "setMaterial",
    [step],
    step.ok ? [] : ["Material update failed."],
    step.ok ? [{ material: step.result as JsonValue }] : [],
  );
}

export async function addKeyframesForSelection(input: AddKeyframesForSelectionInput): Promise<SkillReport> {
  const steps: SkillStep[] = [];
  const warnings: string[] = [];

  const snapshotResponse = await agentApi.execute("state.snapshot", {});
  steps.push({
    id: "snapshot",
    action: "state.snapshot",
    ok: snapshotResponse.ok,
    result: snapshotResponse.result ?? undefined,
    error: snapshotResponse.error ?? undefined,
  });

  if (!snapshotResponse.ok || !snapshotResponse.result || typeof snapshotResponse.result !== "object") {
    warnings.push("Snapshot unavailable.");
    return formatSkillReport("addKeyframesForSelection", steps, warnings, []);
  }

  const selectedObjectId = (
    snapshotResponse.result as { scene?: { selectedObjectId?: string | null } }
  ).scene?.selectedObjectId ?? null;
  if (!selectedObjectId) {
    warnings.push("No selected object for keyframe insertion.");
    return formatSkillReport("addKeyframesForSelection", steps, warnings, []);
  }

  const plan = buildKeyframePlan({
    objectId: selectedObjectId,
    times: input.times,
    transforms: input.transforms,
    interpolation: input.interpolation ?? "linear",
  });
  if (plan.length === 0) {
    warnings.push("Keyframe plan is empty.");
    return formatSkillReport("addKeyframesForSelection", steps, warnings, []);
  }

  const insertStep = await executeCommandStep("insert-keyframes", "agent.animation.insertRecords", {
    records: plan,
    label: "Agent Skill Keyframe Insert",
  } as unknown as JsonValue);
  steps.push(insertStep);
  return formatSkillReport(
    "addKeyframesForSelection",
    steps,
    insertStep.ok ? warnings : [...warnings, "Keyframe insertion failed."],
    insertStep.ok ? [{ insertedRecords: plan.length }] : [],
  );
}

export async function exportBundle(): Promise<SkillReport> {
  const step = await executeCommandStep("export-bundle", "agent.project.exportBundle", { includeData: true });
  return formatSkillReport(
    "exportBundle",
    [step],
    step.ok ? [] : ["Bundle export failed."],
    step.ok ? [{ bundle: step.result as JsonValue }] : [],
  );
}

export async function exportVideoPreview(input: ExportVideoPreviewInput): Promise<SkillReport> {
  const step = await executeCommandStep("export-video-preview", "agent.project.exportVideoPreview", {
    format: input.format,
    fps: input.fps,
    durationSeconds: input.duration,
    width: input.resolution.width,
    height: input.resolution.height,
    transparentBackground: false,
  });

  return formatSkillReport(
    "exportVideoPreview",
    [step],
    step.ok ? ["Preview only: this skill does not render frames in headless mode."] : ["Video preview export failed."],
    step.ok ? [{ videoPreview: step.result as JsonValue }] : [],
  );
}
