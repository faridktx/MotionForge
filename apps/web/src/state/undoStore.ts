export interface UndoCommand {
  label: string;
  execute(): void;
  undo(): void;
}

const MAX_STACK = 100;

let undoStack: UndoCommand[] = [];
let redoStack: UndoCommand[] = [];

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((fn) => fn());
}

export const undoStore = {
  push(cmd: UndoCommand) {
    cmd.execute();
    undoStack.push(cmd);
    if (undoStack.length > MAX_STACK) {
      undoStack.shift();
    }
    redoStack = [];
    notify();
  },

  /** Push a command that has already been executed (e.g., gizmo drag end). */
  pushExecuted(cmd: UndoCommand) {
    undoStack.push(cmd);
    if (undoStack.length > MAX_STACK) {
      undoStack.shift();
    }
    redoStack = [];
    notify();
  },

  undo() {
    const cmd = undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    redoStack.push(cmd);
    notify();
  },

  redo() {
    const cmd = redoStack.pop();
    if (!cmd) return;
    cmd.execute();
    undoStack.push(cmd);
    notify();
  },

  canUndo(): boolean {
    return undoStack.length > 0;
  },

  canRedo(): boolean {
    return redoStack.length > 0;
  },

  clear() {
    undoStack = [];
    redoStack = [];
    notify();
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
