export { RECIPE_DEFINITIONS } from "./presets.js";
export type { RecipeDefinition, RecipeId } from "./presets.js";

export { generatePlan, listRecipeTriggers } from "./planner.js";
export { PlannerError } from "./planner.js";
export type {
  GeneratedPlan,
  PlanCommand,
  PlanConstraints,
  PlannerInput,
  PlannerSceneObject,
  PlannerStateSnapshot,
  PlanStep,
} from "./planner.js";

export { buildProjectDiff, createEmptyDiff, simulatePlanDiff } from "./diff.js";
export type { PlanPreviewDiff, PlanRuntimeLike } from "./diff.js";

export { validateConstraints } from "./validate.js";
export type { ValidationIssue } from "./validate.js";

export { applyPlanStepsAtomic } from "./apply.js";
export type { AtomicApplyAdapter, AtomicApplyFailure, AtomicApplyResult, AtomicApplySuccess } from "./apply.js";
