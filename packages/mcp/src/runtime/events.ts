export type RuntimeEventType =
  | "selection.changed"
  | "object.renamed"
  | "object.materialChanged"
  | "keyframe.added"
  | "keyframe.deleted"
  | "keyframe.moved"
  | "animation.durationChanged"
  | "animation.takesChanged"
  | "project.dirtyChanged"
  | "history.undo"
  | "history.redo";

export interface RuntimeEvent {
  seq: number;
  type: RuntimeEventType;
  payload: Record<string, unknown>;
}

export interface RuntimeEventLog {
  next(type: RuntimeEventType, payload: Record<string, unknown>): RuntimeEvent;
}

export function createRuntimeEventLog(startAt = 0): RuntimeEventLog {
  let seq = startAt;
  return {
    next(type, payload) {
      seq += 1;
      return {
        seq,
        type,
        payload,
      };
    },
  };
}
