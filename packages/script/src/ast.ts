export type Axis = "x" | "y" | "z";
export type TrackGroup = "position" | "rotation" | "scale";
export type Interpolation = "linear" | "easeIn" | "easeOut" | "easeInOut" | "step";

export interface SourceLocation {
  line: number;
  column: number;
}

export interface ParseError {
  code: string;
  message: string;
  path: string;
  location: SourceLocation;
}

export interface SelectStatement {
  kind: "select";
  target: string;
  location: SourceLocation;
}

export interface DurationStatement {
  kind: "duration";
  seconds: number;
  location: SourceLocation;
}

export interface FpsStatement {
  kind: "fps";
  fps: number;
  location: SourceLocation;
}

export interface LoopStatement {
  kind: "loop";
  enabled: boolean;
  location: SourceLocation;
}

export interface LabelStatement {
  kind: "label";
  value: string;
  location: SourceLocation;
}

export interface TakeStatement {
  kind: "take";
  name: string;
  startTime: number;
  endTime: number;
  location: SourceLocation;
}

export interface KeyStatement {
  kind: "key";
  group: TrackGroup;
  axis: Axis;
  time: number;
  value: number;
  valueUnit: "number" | "deg";
  interpolation: Interpolation;
  location: SourceLocation;
}

export interface DeleteKeyStatement {
  kind: "deleteKey";
  group: TrackGroup;
  axis: Axis;
  time: number;
  location: SourceLocation;
}

export interface BounceHelperStatement {
  kind: "helper.bounce";
  amplitude: number;
  startTime: number;
  endTime: number;
  location: SourceLocation;
}

export interface RecoilHelperStatement {
  kind: "helper.recoil";
  distance: number;
  startTime: number;
  endTime: number;
  location: SourceLocation;
}

export type ScriptStatement =
  | SelectStatement
  | DurationStatement
  | FpsStatement
  | LoopStatement
  | LabelStatement
  | TakeStatement
  | KeyStatement
  | DeleteKeyStatement
  | BounceHelperStatement
  | RecoilHelperStatement;

export interface ScriptAst {
  type: "MotionForgeScript";
  statements: ScriptStatement[];
}

export interface ParseScriptResult {
  ok: boolean;
  ast: ScriptAst;
  errors: ParseError[];
}
