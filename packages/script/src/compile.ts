import type { Axis, Interpolation, ScriptAst, ScriptStatement, TrackGroup } from "./ast.js";
import { validateScript, type ScriptValidationContext, type ScriptValidationMessage } from "./validate.js";

export interface PlanStepLike {
  id: string;
  label: string;
  type: "inspect" | "mutate";
  command: {
    action: string;
    input: Record<string, unknown>;
  };
  rationale: string;
}

export interface CompiledAstSummary {
  statements: number;
  kinds: Record<string, number>;
  selectedTarget: string | null;
  durationSec: number;
  fps: number;
}

export interface CompiledPlanSummary {
  commands: number;
  objectsTouched: string[];
  durationSec: number;
}

export interface CompiledScriptPlan {
  ok: boolean;
  ast: CompiledAstSummary;
  summary: CompiledPlanSummary;
  steps: PlanStepLike[];
  warnings: string[];
  safety: {
    requiresConfirm: boolean;
    reasons: string[];
  };
  errors: ScriptValidationMessage[];
}

export interface CompileScriptContext extends ScriptValidationContext {
  selectedObjectId?: string | null;
}

interface KeyRecord {
  objectId: string;
  propertyPath: string;
  time: number;
  value: number;
  interpolation: Interpolation;
}

interface DeleteRecord {
  objectId: string;
  propertyPath: string;
  time: number;
}

interface TakeRecord {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
}

function degToRad(value: number): number {
  return (value * Math.PI) / 180;
}

function propertyPath(group: TrackGroup, axis: Axis): string {
  return `${group}.${axis}`;
}

function convertValue(statement: Extract<ScriptStatement, { kind: "key" }>): number {
  if (statement.group !== "rotation") return statement.value;
  return degToRad(statement.value);
}

function resolveTargetObjectId(ast: ScriptAst, context: CompileScriptContext): string | null {
  let selectedTarget: string | null = null;
  for (const statement of ast.statements) {
    if (statement.kind === "select") {
      selectedTarget = statement.target;
    }
  }
  const objects = context.availableObjects ?? [];
  if (selectedTarget) {
    const matched = objects.find((item) => item.id === selectedTarget || item.name === selectedTarget);
    if (matched) return matched.id;
  }
  if (context.selectedObjectId) return context.selectedObjectId;
  if (objects.length > 0) {
    return [...objects].sort((a, b) => a.id.localeCompare(b.id))[0]?.id ?? null;
  }
  return null;
}

function compileHelperBounce(objectId: string, statement: Extract<ScriptStatement, { kind: "helper.bounce" }>): KeyRecord[] {
  const duration = statement.endTime - statement.startTime;
  const t0 = statement.startTime;
  const t1 = t0 + duration * 0.25;
  const t2 = t0 + duration * 0.5;
  const t3 = t0 + duration * 0.8;
  const t4 = statement.endTime;
  const a = statement.amplitude;
  return [
    { objectId, propertyPath: "position.y", time: t0, value: 0, interpolation: "easeOut" },
    { objectId, propertyPath: "position.y", time: t1, value: 0.6 * a, interpolation: "easeOut" },
    { objectId, propertyPath: "position.y", time: t2, value: a, interpolation: "easeInOut" },
    { objectId, propertyPath: "position.y", time: t3, value: 0.2 * a, interpolation: "easeInOut" },
    { objectId, propertyPath: "position.y", time: t4, value: 0, interpolation: "easeInOut" },
    { objectId, propertyPath: "scale.y", time: t0, value: 1, interpolation: "easeOut" },
    { objectId, propertyPath: "scale.y", time: t1, value: 0.82, interpolation: "easeInOut" },
    { objectId, propertyPath: "scale.y", time: t2, value: 1.2, interpolation: "easeOut" },
    { objectId, propertyPath: "scale.y", time: t4, value: 1, interpolation: "easeInOut" },
    { objectId, propertyPath: "scale.x", time: t0, value: 1, interpolation: "easeOut" },
    { objectId, propertyPath: "scale.x", time: t1, value: 1.12, interpolation: "easeInOut" },
    { objectId, propertyPath: "scale.x", time: t2, value: 0.92, interpolation: "easeOut" },
    { objectId, propertyPath: "scale.x", time: t4, value: 1, interpolation: "easeInOut" },
  ];
}

function compileHelperRecoil(objectId: string, statement: Extract<ScriptStatement, { kind: "helper.recoil" }>): KeyRecord[] {
  const duration = statement.endTime - statement.startTime;
  const t0 = statement.startTime;
  const t1 = t0 + duration * 0.2;
  const t2 = statement.endTime;
  const d = statement.distance;
  return [
    { objectId, propertyPath: "position.z", time: t0, value: 0, interpolation: "easeOut" },
    { objectId, propertyPath: "position.z", time: t1, value: -d, interpolation: "step" },
    { objectId, propertyPath: "position.z", time: t2, value: 0, interpolation: "easeOut" },
    { objectId, propertyPath: "rotation.x", time: t0, value: 0, interpolation: "easeOut" },
    { objectId, propertyPath: "rotation.x", time: t1, value: degToRad(-8 * Math.max(0.5, d)), interpolation: "step" },
    { objectId, propertyPath: "rotation.x", time: t2, value: 0, interpolation: "easeOut" },
  ];
}

function pushKindCount(kinds: Record<string, number>, kind: string) {
  kinds[kind] = (kinds[kind] ?? 0) + 1;
}

export function compileScriptToPlan(script: string, context: CompileScriptContext = {}): CompiledScriptPlan {
  const validated = validateScript(script, context);
  const kinds: Record<string, number> = {};
  for (const statement of validated.ast.statements) {
    pushKindCount(kinds, statement.kind);
  }

  const selectedTarget = resolveTargetObjectId(validated.ast, context);
  const defaultDuration = context.defaults?.durationSec ?? 2;
  const defaultFps = context.defaults?.fps ?? 30;

  let durationSec = defaultDuration;
  let fps = defaultFps;
  let labelPrefix = "Script";
  const warnings: string[] = validated.warnings.map((item) => `${item.path} ${item.message}`);
  const keyRecords: KeyRecord[] = [];
  const deleteRecords: DeleteRecord[] = [];
  const takeRecords: TakeRecord[] = [];
  let takeCounter = 1;

  for (const statement of validated.ast.statements) {
    switch (statement.kind) {
      case "duration":
        durationSec = statement.seconds;
        break;
      case "fps":
        fps = statement.fps;
        break;
      case "label":
        labelPrefix = statement.value;
        break;
      case "loop":
        warnings.push(`${statementPath(statement.location.line)} Loop metadata is not currently persisted in runtime.`);
        break;
      case "take":
        takeRecords.push({
          id: `take_${takeCounter.toString().padStart(2, "0")}_${slugifyTakeName(statement.name)}`,
          name: statement.name,
          startTime: statement.startTime,
          endTime: statement.endTime,
        });
        takeCounter += 1;
        break;
      case "key":
        if (!selectedTarget) break;
        keyRecords.push({
          objectId: selectedTarget,
          propertyPath: propertyPath(statement.group, statement.axis),
          time: statement.time,
          value: convertValue(statement),
          interpolation: statement.interpolation,
        });
        if (statement.group === "rotation" && statement.valueUnit !== "deg") {
          warnings.push(`${statementPath(statement.location.line)} Rotation key interpreted as degrees.`);
        }
        break;
      case "deleteKey":
        if (!selectedTarget) break;
        deleteRecords.push({
          objectId: selectedTarget,
          propertyPath: propertyPath(statement.group, statement.axis),
          time: statement.time,
        });
        break;
      case "helper.bounce":
        if (!selectedTarget) break;
        keyRecords.push(...compileHelperBounce(selectedTarget, statement));
        break;
      case "helper.recoil":
        if (!selectedTarget) break;
        keyRecords.push(...compileHelperRecoil(selectedTarget, statement));
        break;
      case "select":
        break;
    }
  }

  if (!selectedTarget) {
    validated.errors.push({
      code: "MF_SCRIPT_NO_TARGET_OBJECT",
      message: "Unable to resolve target object for key statements.",
      path: "script",
    });
  }

  if (!validated.ok || validated.errors.length > 0) {
    return {
      ok: false,
      ast: {
        statements: validated.ast.statements.length,
        kinds,
        selectedTarget,
        durationSec,
        fps,
      },
      summary: {
        commands: 0,
        objectsTouched: selectedTarget ? [selectedTarget] : [],
        durationSec,
      },
      steps: [],
      warnings,
      safety: {
        requiresConfirm: false,
        reasons: [],
      },
      errors: validated.errors,
    };
  }

  const sortedKeyRecords = [...keyRecords].sort((a, b) => {
    const objectCompare = a.objectId.localeCompare(b.objectId);
    if (objectCompare !== 0) return objectCompare;
    const propertyCompare = a.propertyPath.localeCompare(b.propertyPath);
    if (propertyCompare !== 0) return propertyCompare;
    return a.time - b.time;
  });
  const sortedDeleteRecords = [...deleteRecords].sort((a, b) => {
    const objectCompare = a.objectId.localeCompare(b.objectId);
    if (objectCompare !== 0) return objectCompare;
    const propertyCompare = a.propertyPath.localeCompare(b.propertyPath);
    if (propertyCompare !== 0) return propertyCompare;
    return a.time - b.time;
  });
  const sortedTakeRecords = [...takeRecords].sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));

  const steps: PlanStepLike[] = [
    {
      id: "inspect-scene",
      label: `${labelPrefix}: Inspect`,
      type: "inspect",
      command: { action: "mf.state.snapshot", input: {} },
      rationale: "Capture deterministic baseline before script mutations.",
    },
    {
      id: "set-duration",
      label: `${labelPrefix}: Duration`,
      type: "mutate",
      command: {
        action: "animation.setDuration",
        input: { durationSeconds: durationSec },
      },
      rationale: "Align clip duration with script directive/default.",
    },
  ];

  if (sortedKeyRecords.length > 0) {
    steps.push({
      id: "insert-keys",
      label: `${labelPrefix}: Key Insert`,
      type: "mutate",
      command: {
        action: "animation.insertRecords",
        input: {
          source: "script-compile",
          fps,
          records: sortedKeyRecords,
        },
      },
      rationale: "Insert compiled keyframes deterministically.",
    });
  }

  if (sortedDeleteRecords.length > 0) {
    steps.push({
      id: "delete-keys",
      label: `${labelPrefix}: Key Delete`,
      type: "mutate",
      command: {
        action: "animation.removeKeys",
        input: {
          keys: sortedDeleteRecords.map((item) => ({
            objectId: item.objectId,
            propertyPath: item.propertyPath,
            time: item.time,
          })),
        },
      },
      rationale: "Delete requested keyframes.",
    });
  }

  if (sortedTakeRecords.length > 0) {
    steps.push({
      id: "set-takes",
      label: `${labelPrefix}: Takes`,
      type: "mutate",
      command: {
        action: "animation.setTakes",
        input: {
          takes: sortedTakeRecords,
        },
      },
      rationale: "Persist take ranges for downstream multi-clip export/import.",
    });
  }

  const safetyReasons: string[] = [];
  if (sortedDeleteRecords.length > 0) {
    safetyReasons.push("Script deletes keyframes.");
  }
  if (sortedKeyRecords.length + sortedDeleteRecords.length > 20) {
    safetyReasons.push("Script touches more than 20 key edits.");
  }

  return {
    ok: true,
    ast: {
      statements: validated.ast.statements.length,
      kinds,
      selectedTarget,
      durationSec,
      fps,
    },
    summary: {
      commands: steps.filter((item) => item.type === "mutate").length,
      objectsTouched: selectedTarget ? [selectedTarget] : [],
      durationSec,
    },
    steps,
    warnings,
    safety: {
      requiresConfirm: safetyReasons.length > 0,
      reasons: safetyReasons,
    },
    errors: [],
  };
}

function statementPath(line: number): string {
  return `line:${line}`;
}

function slugifyTakeName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned : "segment";
}
