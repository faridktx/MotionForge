import type {
  Axis,
  Interpolation,
  ParseError,
  ParseScriptResult,
  ScriptAst,
  ScriptStatement,
  TrackGroup,
} from "./ast.js";

const NUMBER_PATTERN = String.raw`[-+]?(?:\d+\.?\d*|\d*\.?\d+)`;

const SELECT_PATTERN = /^select\s+"([^"]+)"\s*$/;
const DURATION_PATTERN = new RegExp(`^duration\\s+(${NUMBER_PATTERN})\\s*$`);
const FPS_PATTERN = new RegExp(`^fps\\s+(${NUMBER_PATTERN})\\s*$`);
const LOOP_PATTERN = /^loop\s+(on|off)\s*$/;
const LABEL_PATTERN = /^label\s+"([^"]+)"\s*$/;
const TAKE_PATTERN = new RegExp(`^take\\s+"([^"]+)"\\s+from\\s+(${NUMBER_PATTERN})\\s+to\\s+(${NUMBER_PATTERN})\\s*$`);
const KEY_PATTERN = new RegExp(
  `^key\\s+(position|rotation|scale)\\s+(x|y|z)\\s+at\\s+(${NUMBER_PATTERN})\\s*=\\s*(${NUMBER_PATTERN})(?:\\s*(deg))?(?:\\s+ease\\s+(linear|easeIn|easeOut|easeInOut|step))?\\s*$`,
);
const DELETE_KEY_PATTERN = new RegExp(
  `^delete\\s+key\\s+(position|rotation|scale)\\s+(x|y|z)\\s+at\\s+(${NUMBER_PATTERN})\\s*$`,
);
const BOUNCE_PATTERN = new RegExp(`^bounce\\s+amplitude\\s+(${NUMBER_PATTERN})\\s+at\\s+(${NUMBER_PATTERN})\\.\\.(${NUMBER_PATTERN})\\s*$`);
const RECOIL_PATTERN = new RegExp(`^recoil\\s+distance\\s+(${NUMBER_PATTERN})\\s+at\\s+(${NUMBER_PATTERN})\\.\\.(${NUMBER_PATTERN})\\s*$`);

function location(line: number): { line: number; column: number } {
  return { line, column: 1 };
}

function parseNumber(input: string): number {
  return Number(input);
}

function asTrackGroup(value: string): TrackGroup {
  return value as TrackGroup;
}

function asAxis(value: string): Axis {
  return value as Axis;
}

function asInterpolation(value: string | undefined): Interpolation {
  if (!value) return "linear";
  return value as Interpolation;
}

function makeError(line: number, message: string, code: string): ParseError {
  return {
    code,
    message,
    path: `line:${line}`,
    location: location(line),
  };
}

function parseLine(lineText: string, lineNumber: number): ScriptStatement | ParseError | null {
  const trimmed = lineText.trim();
  if (trimmed.length === 0 || trimmed.startsWith("#") || trimmed.startsWith("//")) {
    return null;
  }

  const selectMatch = trimmed.match(SELECT_PATTERN);
  if (selectMatch) {
    return {
      kind: "select",
      target: selectMatch[1] ?? "",
      location: location(lineNumber),
    };
  }

  const durationMatch = trimmed.match(DURATION_PATTERN);
  if (durationMatch) {
    return {
      kind: "duration",
      seconds: parseNumber(durationMatch[1] ?? "0"),
      location: location(lineNumber),
    };
  }

  const fpsMatch = trimmed.match(FPS_PATTERN);
  if (fpsMatch) {
    return {
      kind: "fps",
      fps: parseNumber(fpsMatch[1] ?? "0"),
      location: location(lineNumber),
    };
  }

  const loopMatch = trimmed.match(LOOP_PATTERN);
  if (loopMatch) {
    return {
      kind: "loop",
      enabled: (loopMatch[1] ?? "off") === "on",
      location: location(lineNumber),
    };
  }

  const labelMatch = trimmed.match(LABEL_PATTERN);
  if (labelMatch) {
    return {
      kind: "label",
      value: labelMatch[1] ?? "",
      location: location(lineNumber),
    };
  }

  const takeMatch = trimmed.match(TAKE_PATTERN);
  if (takeMatch) {
    return {
      kind: "take",
      name: takeMatch[1] ?? "",
      startTime: parseNumber(takeMatch[2] ?? "0"),
      endTime: parseNumber(takeMatch[3] ?? "0"),
      location: location(lineNumber),
    };
  }

  const keyMatch = trimmed.match(KEY_PATTERN);
  if (keyMatch) {
    return {
      kind: "key",
      group: asTrackGroup(keyMatch[1] ?? "position"),
      axis: asAxis(keyMatch[2] ?? "x"),
      time: parseNumber(keyMatch[3] ?? "0"),
      value: parseNumber(keyMatch[4] ?? "0"),
      valueUnit: keyMatch[5] ? "deg" : "number",
      interpolation: asInterpolation(keyMatch[6]),
      location: location(lineNumber),
    };
  }

  const deleteMatch = trimmed.match(DELETE_KEY_PATTERN);
  if (deleteMatch) {
    return {
      kind: "deleteKey",
      group: asTrackGroup(deleteMatch[1] ?? "position"),
      axis: asAxis(deleteMatch[2] ?? "x"),
      time: parseNumber(deleteMatch[3] ?? "0"),
      location: location(lineNumber),
    };
  }

  const bounceMatch = trimmed.match(BOUNCE_PATTERN);
  if (bounceMatch) {
    return {
      kind: "helper.bounce",
      amplitude: parseNumber(bounceMatch[1] ?? "0"),
      startTime: parseNumber(bounceMatch[2] ?? "0"),
      endTime: parseNumber(bounceMatch[3] ?? "0"),
      location: location(lineNumber),
    };
  }

  const recoilMatch = trimmed.match(RECOIL_PATTERN);
  if (recoilMatch) {
    return {
      kind: "helper.recoil",
      distance: parseNumber(recoilMatch[1] ?? "0"),
      startTime: parseNumber(recoilMatch[2] ?? "0"),
      endTime: parseNumber(recoilMatch[3] ?? "0"),
      location: location(lineNumber),
    };
  }

  return makeError(lineNumber, "Unsupported script statement.", "MF_SCRIPT_PARSE_UNSUPPORTED_STATEMENT");
}

export function parseScript(script: string): ParseScriptResult {
  const lines = script.split(/\r?\n/);
  const statements: ScriptStatement[] = [];
  const errors: ParseError[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index] ?? "";
    const result = parseLine(line, lineNumber);
    if (!result) continue;
    if ("code" in result) {
      errors.push(result);
    } else {
      statements.push(result);
    }
  }

  const ast: ScriptAst = {
    type: "MotionForgeScript",
    statements,
  };

  return {
    ok: errors.length === 0,
    ast,
    errors,
  };
}
