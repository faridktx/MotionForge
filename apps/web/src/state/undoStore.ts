export interface UndoCommand {
  label: string;
  do?(): void;
  execute?(): void;
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

function executeCommand(cmd: UndoCommand) {
  if (cmd.do) {
    cmd.do();
    return;
  }
  cmd.execute?.();
}

export const undoStore = {
  push(cmd: UndoCommand) {
    executeCommand(cmd);
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
    executeCommand(cmd);
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
