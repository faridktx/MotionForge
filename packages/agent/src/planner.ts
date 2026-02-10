import { RECIPE_DEFINITIONS, recipeSuggestions, type RecipeDefinition, type RecipeId } from "./presets.js";
import { validateConstraints } from "./validate.js";

type Style = "snappy" | "realistic" | "cartoony" | "cinematic";

export interface PlanConstraints {
  durationSec?: number;
  fps?: number;
  style?: Style;
  loop?: boolean;
  targetObjects?: string[];
  camera?: { enabled: boolean };
}

export interface PlannerInput {
  goal: string;
  constraints?: PlanConstraints;
}

export interface PlannerSceneObject {
  id: string;
  name: string;
}

export interface PlannerStateSnapshot {
  objects: readonly PlannerSceneObject[];
  selectedObjectId: string | null;
}

export interface PlanCommand {
  action: string;
  input: unknown;
}

export interface PlanStep {
  id: string;
  label: string;
  type: "inspect" | "mutate";
  command: PlanCommand;
  rationale: string;
}

export interface GeneratedPlan {
  recipeId: RecipeId;
  summary: {
    durationSec: number;
    objectsTouched: string[];
    keyframesToAdd: number;
    commands: number;
  };
  steps: PlanStep[];
  safety: {
    requiresConfirm: boolean;
    reasons: string[];
  };
}

export class PlannerError extends Error {
  readonly code: string;
  readonly suggestions: string[];

  constructor(code: string, message: string, suggestions: string[] = []) {
    super(message);
    this.name = "PlannerError";
    this.code = code;
    this.suggestions = suggestions;
  }
}

interface KeyRecord {
  objectId: string;
  propertyPath:
    | "position.x"
    | "position.y"
    | "position.z"
    | "rotation.x"
    | "rotation.y"
    | "rotation.z"
    | "scale.x"
    | "scale.y"
    | "scale.z";
  time: number;
  value: number;
  interpolation?: "linear" | "step" | "easeIn" | "easeOut" | "easeInOut";
}

interface RecipeBuildInput {
  objectIds: string[];
  durationSec: number;
  style: Style;
  loop: boolean;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function clampDuration(durationSec: number): number {
  return Math.max(0.1, Math.min(30, Number(durationSec.toFixed(3))));
}

function styleAmplitude(style: Style): number {
  switch (style) {
    case "snappy":
      return 1.2;
    case "realistic":
      return 0.8;
    case "cartoony":
      return 1.5;
    case "cinematic":
      return 0.65;
    default:
      return 1;
  }
}

function detectRecipe(goal: string): RecipeDefinition | null {
  const normalized = normalizeText(goal);
  for (const recipe of RECIPE_DEFINITIONS) {
    if (recipe.triggerPhrases.some((phrase) => normalized.includes(phrase))) {
      return recipe;
    }
  }
  return null;
}

function resolveTargetObjects(snapshot: PlannerStateSnapshot, recipeId: RecipeId, constraints?: PlanConstraints): string[] {
  if (constraints?.targetObjects && constraints.targetObjects.length > 0) {
    const known = new Set(snapshot.objects.map((item) => item.id));
    const unique = [...new Set(constraints.targetObjects)].filter((id) => known.has(id));
    if (unique.length === 0) {
      throw new PlannerError("MF_ERR_NO_TARGET_OBJECT", "No targetObjects matched current scene objects.");
    }
    return unique.sort((a, b) => a.localeCompare(b));
  }

  if (recipeId === "camera-dolly") {
    const cameraObject = snapshot.objects.find((item) => item.name.toLowerCase().includes("camera"));
    if (cameraObject) {
      return [cameraObject.id];
    }
  }

  if (snapshot.selectedObjectId) {
    return [snapshot.selectedObjectId];
  }
  const first = snapshot.objects[0];
  if (!first) {
    throw new PlannerError("MF_ERR_EMPTY_SCENE", "No objects available to animate.");
  }
  return [first.id];
}

function at(durationSec: number, ratio: number): number {
  return Number((durationSec * ratio).toFixed(4));
}

function buildBounceRecords(input: RecipeBuildInput): KeyRecord[] {
  const amp = styleAmplitude(input.style);
  const records: KeyRecord[] = [];
  for (const objectId of input.objectIds) {
    records.push(
      { objectId, propertyPath: "position.y", time: at(input.durationSec, 0), value: 0, interpolation: "easeOut" },
      { objectId, propertyPath: "position.y", time: at(input.durationSec, 0.22), value: 0.9 * amp, interpolation: "easeOut" },
      { objectId, propertyPath: "position.y", time: at(input.durationSec, 0.46), value: 1.6 * amp, interpolation: "easeInOut" },
      { objectId, propertyPath: "position.y", time: at(input.durationSec, 0.7), value: 0.35 * amp, interpolation: "easeInOut" },
      { objectId, propertyPath: "position.y", time: at(input.durationSec, 1), value: 0, interpolation: "easeInOut" },

      { objectId, propertyPath: "scale.y", time: at(input.durationSec, 0), value: 1, interpolation: "easeOut" },
      { objectId, propertyPath: "scale.y", time: at(input.durationSec, 0.18), value: 0.78, interpolation: "easeInOut" },
      { objectId, propertyPath: "scale.y", time: at(input.durationSec, 0.46), value: 1.24, interpolation: "easeOut" },
      { objectId, propertyPath: "scale.y", time: at(input.durationSec, 1), value: 1, interpolation: "easeInOut" },

      { objectId, propertyPath: "scale.x", time: at(input.durationSec, 0), value: 1, interpolation: "easeOut" },
      { objectId, propertyPath: "scale.x", time: at(input.durationSec, 0.18), value: 1.12, interpolation: "easeInOut" },
      { objectId, propertyPath: "scale.x", time: at(input.durationSec, 0.46), value: 0.9, interpolation: "easeOut" },
      { objectId, propertyPath: "scale.x", time: at(input.durationSec, 1), value: 1, interpolation: "easeInOut" },

      { objectId, propertyPath: "scale.z", time: at(input.durationSec, 0), value: 1, interpolation: "easeOut" },
      { objectId, propertyPath: "scale.z", time: at(input.durationSec, 0.18), value: 1.12, interpolation: "easeInOut" },
      { objectId, propertyPath: "scale.z", time: at(input.durationSec, 0.46), value: 0.9, interpolation: "easeOut" },
      { objectId, propertyPath: "scale.z", time: at(input.durationSec, 1), value: 1, interpolation: "easeInOut" },
    );
  }
  return records;
}

function buildAnticipationHitRecords(input: RecipeBuildInput): KeyRecord[] {
  const amp = styleAmplitude(input.style);
  const records: KeyRecord[] = [];
  for (const objectId of input.objectIds) {
    records.push(
      { objectId, propertyPath: "position.z", time: at(input.durationSec, 0), value: 0, interpolation: "easeOut" },
      { objectId, propertyPath: "position.z", time: at(input.durationSec, 0.22), value: -0.35 * amp, interpolation: "easeInOut" },
      { objectId, propertyPath: "position.z", time: at(input.durationSec, 0.48), value: 0.5 * amp, interpolation: "easeInOut" },
      { objectId, propertyPath: "position.z", time: at(input.durationSec, 0.72), value: -0.12 * amp, interpolation: "easeInOut" },
      { objectId, propertyPath: "position.z", time: at(input.durationSec, 1), value: 0, interpolation: "easeOut" },

      { objectId, propertyPath: "rotation.x", time: at(input.durationSec, 0), value: 0, interpolation: "easeOut" },
      { objectId, propertyPath: "rotation.x", time: at(input.durationSec, 0.22), value: -0.18 * amp, interpolation: "easeInOut" },
      { objectId, propertyPath: "rotation.x", time: at(input.durationSec, 0.48), value: 0.24 * amp, interpolation: "easeInOut" },
      { objectId, propertyPath: "rotation.x", time: at(input.durationSec, 1), value: 0, interpolation: "easeInOut" },
    );
  }
  return records;
}

function buildIdleLoopRecords(input: RecipeBuildInput): KeyRecord[] {
  const amp = styleAmplitude(input.style) * 0.5;
  const records: KeyRecord[] = [];
  for (const objectId of input.objectIds) {
    records.push(
      { objectId, propertyPath: "position.y", time: at(input.durationSec, 0), value: 0, interpolation: "easeInOut" },
      { objectId, propertyPath: "position.y", time: at(input.durationSec, 0.25), value: 0.08 * amp, interpolation: "easeInOut" },
      { objectId, propertyPath: "position.y", time: at(input.durationSec, 0.5), value: 0, interpolation: "easeInOut" },
      { objectId, propertyPath: "position.y", time: at(input.durationSec, 0.75), value: -0.05 * amp, interpolation: "easeInOut" },
      { objectId, propertyPath: "position.y", time: at(input.durationSec, 1), value: 0, interpolation: "easeInOut" },

      { objectId, propertyPath: "rotation.y", time: at(input.durationSec, 0), value: 0, interpolation: "easeInOut" },
      { objectId, propertyPath: "rotation.y", time: at(input.durationSec, 0.5), value: 0.06 * amp, interpolation: "easeInOut" },
      { objectId, propertyPath: "rotation.y", time: at(input.durationSec, 1), value: 0, interpolation: "easeInOut" },
    );
  }
  return records;
}

function buildCameraDollyRecords(input: RecipeBuildInput): KeyRecord[] {
  const amp = styleAmplitude(input.style);
  const records: KeyRecord[] = [];
  for (const objectId of input.objectIds) {
    records.push(
      { objectId, propertyPath: "position.z", time: at(input.durationSec, 0), value: 6, interpolation: "easeInOut" },
      { objectId, propertyPath: "position.z", time: at(input.durationSec, 1), value: 2.2 * amp + 1.2, interpolation: "easeInOut" },
      { objectId, propertyPath: "position.x", time: at(input.durationSec, 0), value: 0, interpolation: "easeInOut" },
      { objectId, propertyPath: "position.x", time: at(input.durationSec, 1), value: 0.5 * amp, interpolation: "easeInOut" },
    );
  }
  return records;
}

function buildTurnInPlaceRecords(input: RecipeBuildInput): KeyRecord[] {
  const records: KeyRecord[] = [];
  for (const objectId of input.objectIds) {
    records.push(
      { objectId, propertyPath: "rotation.y", time: at(input.durationSec, 0), value: 0, interpolation: "easeInOut" },
      {
        objectId,
        propertyPath: "rotation.y",
        time: at(input.durationSec, 1),
        value: Math.PI / 2,
        interpolation: "easeInOut",
      },
    );
  }
  return records;
}

function buildRecoilRecords(input: RecipeBuildInput): KeyRecord[] {
  const amp = styleAmplitude(input.style);
  const records: KeyRecord[] = [];
  for (const objectId of input.objectIds) {
    records.push(
      { objectId, propertyPath: "position.z", time: at(input.durationSec, 0), value: 0, interpolation: "easeOut" },
      { objectId, propertyPath: "position.z", time: at(input.durationSec, 0.22), value: -0.4 * amp, interpolation: "step" },
      { objectId, propertyPath: "position.z", time: at(input.durationSec, 1), value: 0, interpolation: "easeOut" },
      { objectId, propertyPath: "rotation.x", time: at(input.durationSec, 0), value: 0, interpolation: "easeOut" },
      { objectId, propertyPath: "rotation.x", time: at(input.durationSec, 0.22), value: -0.2 * amp, interpolation: "step" },
      { objectId, propertyPath: "rotation.x", time: at(input.durationSec, 1), value: 0, interpolation: "easeOut" },
    );
  }
  return records;
}

function buildRecipeRecords(recipeId: RecipeId, input: RecipeBuildInput): KeyRecord[] {
  switch (recipeId) {
    case "bounce":
      return buildBounceRecords(input);
    case "anticipation-and-hit":
      return buildAnticipationHitRecords(input);
    case "idle-loop":
      return buildIdleLoopRecords(input);
    case "camera-dolly":
      return buildCameraDollyRecords(input);
    case "turn-in-place":
      return buildTurnInPlaceRecords(input);
    case "recoil":
      return buildRecoilRecords(input);
  }
}

export function generatePlan(input: PlannerInput, snapshot: PlannerStateSnapshot): GeneratedPlan {
  const recipe = detectRecipe(input.goal);
  if (!recipe) {
    throw new PlannerError(
      "MF_ERR_UNSUPPORTED_GOAL",
      "Goal is not matched by a supported deterministic recipe.",
      recipeSuggestions(),
    );
  }

  const validationIssues = validateConstraints(input.constraints);
  if (validationIssues.length > 0) {
    throw new PlannerError("MF_ERR_INVALID_CONSTRAINTS", validationIssues.map((item) => item.message).join(" "));
  }

  const style = input.constraints?.style ?? "realistic";
  const durationSec = clampDuration(input.constraints?.durationSec ?? recipe.defaultDurationSec);
  const loop = Boolean(input.constraints?.loop ?? recipe.loopFriendly);
  const objectIds = resolveTargetObjects(snapshot, recipe.id, input.constraints);

  if (recipe.id === "camera-dolly" && input.constraints?.camera?.enabled === false) {
    throw new PlannerError("MF_ERR_CAMERA_DISABLED", "camera constraints disabled camera recipe execution.");
  }

  const records = buildRecipeRecords(recipe.id, {
    objectIds,
    durationSec,
    style,
    loop,
  });

  const steps: PlanStep[] = [
    {
      id: "inspect-scene",
      label: "Inspect Scene Snapshot",
      type: "inspect",
      command: { action: "mf.state.snapshot", input: {} },
      rationale: "Confirms targets before mutating animation tracks.",
    },
    {
      id: "set-duration",
      label: "Set Clip Duration",
      type: "mutate",
      command: {
        action: "animation.setDuration",
        input: { durationSeconds: durationSec },
      },
      rationale: "Aligns clip timing with recipe length.",
    },
    {
      id: "insert-keys",
      label: "Insert Recipe Keyframes",
      type: "mutate",
      command: {
        action: "animation.insertRecords",
        input: {
          source: "agent-plan",
          records,
        },
      },
      rationale: "Applies deterministic recipe keyframes across selected channels.",
    },
  ];

  const safetyReasons: string[] = [];
  if (records.length >= 24) {
    safetyReasons.push("Large keyframe insertion batch.");
  }
  if (objectIds.length > 1) {
    safetyReasons.push("Plan touches multiple objects.");
  }
  if (loop && !recipe.loopFriendly) {
    safetyReasons.push("Loop requested for non-loop-native recipe.");
  }

  return {
    recipeId: recipe.id,
    summary: {
      durationSec,
      objectsTouched: objectIds,
      keyframesToAdd: records.length,
      commands: steps.filter((step) => step.type === "mutate").length,
    },
    steps,
    safety: {
      requiresConfirm: safetyReasons.length > 0,
      reasons: safetyReasons,
    },
  };
}

export function listRecipeTriggers(): Array<{ id: RecipeId; triggerPhrases: string[] }> {
  return RECIPE_DEFINITIONS.map((recipe) => ({
    id: recipe.id,
    triggerPhrases: [...recipe.triggerPhrases],
  }));
}
