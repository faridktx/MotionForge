import type { PlanStep } from "./planner.js";

export interface AtomicApplyAdapter<SnapshotT> {
  capture(): SnapshotT;
  restore(snapshot: SnapshotT): void;
  execute(action: string, input: unknown): { events: unknown[] };
}

export interface AtomicApplySuccess {
  ok: true;
  events: unknown[];
  commandsExecuted: number;
}

export interface AtomicApplyFailure {
  ok: false;
  commandsExecuted: number;
  failedStepId: string | null;
  error: Error;
}

export type AtomicApplyResult = AtomicApplySuccess | AtomicApplyFailure;

export function applyPlanStepsAtomic<SnapshotT>(
  adapter: AtomicApplyAdapter<SnapshotT>,
  steps: PlanStep[],
): AtomicApplyResult {
  const restorePoint = adapter.capture();
  const events: unknown[] = [];
  let commandsExecuted = 0;
  let currentStepId: string | null = null;

  try {
    for (const step of steps) {
      if (step.type !== "mutate") continue;
      currentStepId = step.id;
      const out = adapter.execute(step.command.action, step.command.input);
      events.push(...out.events);
      commandsExecuted += 1;
    }
  } catch (error) {
    adapter.restore(restorePoint);
    return {
      ok: false,
      commandsExecuted,
      failedStepId: currentStepId,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  return {
    ok: true,
    events,
    commandsExecuted,
  };
}
