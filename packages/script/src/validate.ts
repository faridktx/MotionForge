import type { ParseError, ScriptAst, ScriptStatement } from "./ast.js";
import { parseScript } from "./parser.js";

export interface ScriptValidationMessage {
  code: string;
  message: string;
  path: string;
}

export interface ScriptValidationContext {
  defaults?: {
    fps?: number;
    durationSec?: number;
  };
  availableObjects?: Array<{
    id: string;
    name: string;
  }>;
}

export interface ScriptValidationResult {
  ok: boolean;
  ast: ScriptAst;
  errors: ScriptValidationMessage[];
  warnings: ScriptValidationMessage[];
}

function toValidationMessage(error: ParseError): ScriptValidationMessage {
  return {
    code: error.code,
    message: error.message,
    path: error.path,
  };
}

function pushError(errors: ScriptValidationMessage[], path: string, code: string, message: string) {
  errors.push({
    code,
    message,
    path,
  });
}

function pushWarning(warnings: ScriptValidationMessage[], path: string, code: string, message: string) {
  warnings.push({
    code,
    message,
    path,
  });
}

function statementPath(statement: ScriptStatement): string {
  return `line:${statement.location.line}`;
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && !Number.isNaN(value);
}

export function validateScript(script: string, context: ScriptValidationContext = {}): ScriptValidationResult {
  const parsed = parseScript(script);
  const errors: ScriptValidationMessage[] = parsed.errors.map((item) => toValidationMessage(item));
  const warnings: ScriptValidationMessage[] = [];

  if (!parsed.ok) {
    return {
      ok: false,
      ast: parsed.ast,
      errors,
      warnings,
    };
  }

  const durationFromDefault = context.defaults?.durationSec;
  const fpsFromDefault = context.defaults?.fps;

  let durationSec: number | undefined = durationFromDefault;
  let fps: number | undefined = fpsFromDefault;
  let lastSelect: string | null = null;
  let selectCount = 0;
  let mutateCount = 0;
  const seenTakeNames = new Set<string>();

  for (const statement of parsed.ast.statements) {
    const path = statementPath(statement);
    switch (statement.kind) {
      case "select": {
        selectCount += 1;
        lastSelect = statement.target;
        if (context.availableObjects && context.availableObjects.length > 0) {
          const known = context.availableObjects.some(
            (item) => item.id === statement.target || item.name === statement.target,
          );
          if (!known) {
            pushError(errors, path, "MF_SCRIPT_UNKNOWN_OBJECT", `Unknown object reference "${statement.target}".`);
          }
        }
        break;
      }
      case "duration": {
        durationSec = statement.seconds;
        if (!isFiniteNumber(statement.seconds) || statement.seconds <= 0) {
          pushError(errors, path, "MF_SCRIPT_INVALID_DURATION", "Duration must be a positive finite number.");
        } else if (statement.seconds > 600) {
          pushError(errors, path, "MF_SCRIPT_DURATION_RANGE", "Duration exceeds max allowed (600s).");
        }
        break;
      }
      case "fps": {
        fps = statement.fps;
        if (!isFiniteNumber(statement.fps) || statement.fps <= 0) {
          pushError(errors, path, "MF_SCRIPT_INVALID_FPS", "FPS must be a positive finite number.");
        } else if (statement.fps > 240) {
          pushError(errors, path, "MF_SCRIPT_FPS_RANGE", "FPS exceeds max allowed (240).");
        }
        break;
      }
      case "key": {
        mutateCount += 1;
        if (!isFiniteNumber(statement.time) || statement.time < 0) {
          pushError(errors, path, "MF_SCRIPT_INVALID_TIME", "Keyframe time must be a finite number >= 0.");
        }
        if (!isFiniteNumber(statement.value)) {
          pushError(errors, path, "MF_SCRIPT_INVALID_VALUE", "Keyframe value must be finite.");
        }
        if (durationSec !== undefined && statement.time > durationSec) {
          pushError(errors, path, "MF_SCRIPT_TIME_OUT_OF_RANGE", "Keyframe time exceeds clip duration.");
        }
        break;
      }
      case "deleteKey": {
        mutateCount += 1;
        if (!isFiniteNumber(statement.time) || statement.time < 0) {
          pushError(errors, path, "MF_SCRIPT_INVALID_TIME", "Delete-key time must be a finite number >= 0.");
        }
        if (durationSec !== undefined && statement.time > durationSec) {
          pushError(errors, path, "MF_SCRIPT_TIME_OUT_OF_RANGE", "Delete-key time exceeds clip duration.");
        }
        break;
      }
      case "helper.bounce":
      case "helper.recoil": {
        mutateCount += 1;
        const amplitude = statement.kind === "helper.bounce" ? statement.amplitude : statement.distance;
        if (!isFiniteNumber(amplitude)) {
          pushError(errors, path, "MF_SCRIPT_INVALID_VALUE", "Helper parameter must be finite.");
        }
        if (statement.startTime < 0 || statement.endTime < 0) {
          pushError(errors, path, "MF_SCRIPT_INVALID_TIME", "Helper range times must be >= 0.");
        }
        if (statement.endTime <= statement.startTime) {
          pushError(errors, path, "MF_SCRIPT_RANGE_ORDER", "Helper end time must be greater than start time.");
        }
        if (durationSec !== undefined && statement.endTime > durationSec) {
          pushError(errors, path, "MF_SCRIPT_TIME_OUT_OF_RANGE", "Helper range exceeds clip duration.");
        }
        break;
      }
      case "loop":
      case "label":
        break;
      case "take": {
        mutateCount += 1;
        if (statement.name.trim().length === 0) {
          pushError(errors, path, "MF_SCRIPT_TAKE_NAME", "Take name must be non-empty.");
        }
        if (seenTakeNames.has(statement.name.trim().toLowerCase())) {
          pushError(errors, path, "MF_SCRIPT_TAKE_DUPLICATE", "Take name must be unique.");
        }
        seenTakeNames.add(statement.name.trim().toLowerCase());
        if (!isFiniteNumber(statement.startTime) || !isFiniteNumber(statement.endTime)) {
          pushError(errors, path, "MF_SCRIPT_INVALID_TIME", "Take range times must be finite numbers.");
          break;
        }
        if (statement.startTime < 0 || statement.endTime <= statement.startTime) {
          pushError(errors, path, "MF_SCRIPT_RANGE_ORDER", "Take range must satisfy start >= 0 and end > start.");
        }
        if (durationSec !== undefined && statement.endTime > durationSec) {
          pushError(errors, path, "MF_SCRIPT_TIME_OUT_OF_RANGE", "Take range exceeds clip duration.");
        }
        break;
      }
    }
  }

  if (selectCount > 1) {
    pushWarning(warnings, "script", "MF_SCRIPT_MULTI_SELECT", "Multiple select statements found; last select wins.");
  }

  if (!lastSelect) {
    pushWarning(
      warnings,
      "script",
      "MF_SCRIPT_NO_SELECT",
      "No select statement found; compiler will resolve target from runtime selection/default.",
    );
  }

  if (durationSec === undefined) {
    pushWarning(warnings, "script", "MF_SCRIPT_NO_DURATION", "No duration statement; default duration will be used.");
  }

  if (fps === undefined) {
    pushWarning(warnings, "script", "MF_SCRIPT_NO_FPS", "No fps statement; default fps will be used.");
  }

  if (mutateCount === 0) {
    pushWarning(warnings, "script", "MF_SCRIPT_NO_MUTATIONS", "Script has no mutating statements.");
  }

  return {
    ok: errors.length === 0,
    ast: parsed.ast,
    errors,
    warnings,
  };
}
