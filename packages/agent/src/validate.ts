import type { PlanConstraints } from "./planner.js";

export interface ValidationIssue {
  code: string;
  message: string;
}

export function validateConstraints(constraints: PlanConstraints | undefined): ValidationIssue[] {
  if (!constraints) return [];
  const issues: ValidationIssue[] = [];
  if (constraints.durationSec !== undefined && (!Number.isFinite(constraints.durationSec) || constraints.durationSec <= 0)) {
    issues.push({
      code: "MF_ERR_INVALID_DURATION",
      message: "constraints.durationSec must be a positive number.",
    });
  }
  if (constraints.fps !== undefined && (!Number.isFinite(constraints.fps) || constraints.fps <= 0)) {
    issues.push({
      code: "MF_ERR_INVALID_FPS",
      message: "constraints.fps must be a positive number.",
    });
  }
  return issues;
}
