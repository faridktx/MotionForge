import { RECIPE_DEFINITIONS, type RecipeId } from "@motionforge/agent";

export type SkillStyle = "snappy" | "smooth" | "heavy" | "floaty";

export interface SkillGenerateInput {
  goal: string;
  constraints?: {
    durationSec?: number;
    fps?: number;
    style?: SkillStyle;
  };
  target?: {
    select?: string;
  };
}

export interface SkillGenerateOutput {
  ok: true;
  script: string;
  matchedPreset: RecipeId;
  warnings: string[];
}

export interface SkillGenerateFailure {
  ok: false;
  error: {
    code: "MF_ERR_UNKNOWN_GOAL";
    message: string;
  };
  supportedGoals: string[];
}

const DEFAULT_TARGET = "obj_cube";
const DEFAULT_CAMERA_TARGET = "obj_camera";

function styleFactor(style: SkillStyle): number {
  switch (style) {
    case "snappy":
      return 1.15;
    case "smooth":
      return 0.9;
    case "heavy":
      return 0.8;
    case "floaty":
      return 1.25;
  }
}

function toFixed(value: number): string {
  return Number(value.toFixed(4)).toString();
}

function clampDuration(value: number): number {
  return Math.max(0.1, Math.min(30, Number(value.toFixed(3))));
}

function normalizeGoal(goal: string): string {
  return goal.trim().toLowerCase();
}

function detectRecipe(goal: string): RecipeId | null {
  const normalized = normalizeGoal(goal);
  for (const recipe of RECIPE_DEFINITIONS) {
    if (recipe.triggerPhrases.some((phrase) => normalized.includes(phrase))) {
      return recipe.id;
    }
  }
  return null;
}

function defaultDuration(recipeId: RecipeId): number {
  const recipe = RECIPE_DEFINITIONS.find((item) => item.id === recipeId);
  return recipe?.defaultDurationSec ?? 1;
}

function recipeLabel(recipeId: RecipeId): string {
  switch (recipeId) {
    case "bounce":
      return "Bounce";
    case "anticipation-and-hit":
      return "Anticipation Hit";
    case "idle-loop":
      return "Idle Loop";
    case "camera-dolly":
      return "Camera Dolly";
    case "turn-in-place":
      return "Turn In Place";
    case "recoil":
      return "Recoil";
  }
}

function buildScriptLines(input: {
  recipeId: RecipeId;
  durationSec: number;
  fps?: number;
  style: SkillStyle;
  targetSelect?: string;
}): string[] {
  const target = input.targetSelect ?? (input.recipeId === "camera-dolly" ? DEFAULT_CAMERA_TARGET : DEFAULT_TARGET);
  const factor = styleFactor(input.style);
  const lines: string[] = [`select "${target}"`, `duration ${toFixed(input.durationSec)}`, `label "${recipeLabel(input.recipeId)}"`];

  if (typeof input.fps === "number") {
    lines.push(`fps ${toFixed(input.fps)}`);
  }

  switch (input.recipeId) {
    case "bounce":
      lines.push(`bounce amplitude ${toFixed(1.2 * factor)} at 0..${toFixed(input.durationSec)}`);
      break;
    case "recoil":
      lines.push(`recoil distance ${toFixed(0.25 * factor)} at 0..${toFixed(input.durationSec)}`);
      break;
    case "turn-in-place":
      lines.push("key rotation y at 0 = 0 deg ease easeInOut");
      lines.push(`key rotation y at ${toFixed(input.durationSec)} = 90 deg ease easeInOut`);
      break;
    case "camera-dolly":
      lines.push("key position z at 0 = 6 ease easeInOut");
      lines.push(`key position z at ${toFixed(input.durationSec)} = ${toFixed(2.8 - (factor - 1) * 0.6)} ease easeInOut`);
      break;
    case "anticipation-and-hit":
      lines.push("key position x at 0 = 0 ease easeOut");
      lines.push(`key position x at ${toFixed(input.durationSec * 0.3)} = ${toFixed(-0.3 * factor)} ease easeIn`);
      lines.push(`key position x at ${toFixed(input.durationSec * 0.52)} = ${toFixed(1.1 * factor)} ease step`);
      lines.push(`key position x at ${toFixed(input.durationSec)} = 0 ease easeOut`);
      break;
    case "idle-loop":
      lines.push("key position y at 0 = 0 ease easeInOut");
      lines.push(`key position y at ${toFixed(input.durationSec * 0.5)} = ${toFixed(0.06 * factor)} ease easeInOut`);
      lines.push(`key position y at ${toFixed(input.durationSec)} = 0 ease easeInOut`);
      lines.push("loop on");
      break;
  }

  lines.push(`take "${recipeLabel(input.recipeId)}" from 0 to ${toFixed(input.durationSec)}`);

  return lines;
}

function sortSupportedGoals(): string[] {
  return RECIPE_DEFINITIONS.map((recipe) => recipe.triggerPhrases[0] ?? recipe.id).sort((a, b) => a.localeCompare(b));
}

export function generateScriptFromGoal(input: SkillGenerateInput): SkillGenerateOutput | SkillGenerateFailure {
  const recipeId = detectRecipe(input.goal);
  if (!recipeId) {
    return {
      ok: false,
      error: {
        code: "MF_ERR_UNKNOWN_GOAL",
        message: "Goal does not match a supported deterministic skill preset.",
      },
      supportedGoals: sortSupportedGoals(),
    };
  }

  const warnings: string[] = [];
  const durationSec = clampDuration(input.constraints?.durationSec ?? defaultDuration(recipeId));
  const style = input.constraints?.style ?? "smooth";
  const fps = input.constraints?.fps;

  if (typeof fps === "number" && (fps < 1 || fps > 240)) {
    warnings.push("fps outside recommended range [1..240]; compiler validation may reject this value.");
  }

  return {
    ok: true,
    script: buildScriptLines({
      recipeId,
      durationSec,
      fps,
      style,
      targetSelect: input.target?.select,
    }).join("\n"),
    matchedPreset: recipeId,
    warnings,
  };
}
