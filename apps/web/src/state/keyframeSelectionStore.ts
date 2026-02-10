import type { TrackProperty } from "@motionforge/engine";

export interface SelectedKeyframe {
  objectId: string;
  propertyPath: TrackProperty;
  time: number;
}

type Listener = () => void;

const EPSILON = 1e-6;
let selected: SelectedKeyframe[] = [];

const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

function isSameKey(a: SelectedKeyframe, b: SelectedKeyframe): boolean {
  return a.objectId === b.objectId && a.propertyPath === b.propertyPath && Math.abs(a.time - b.time) < EPSILON;
}

function hasKey(target: SelectedKeyframe): boolean {
  return selected.some((item) => isSameKey(item, target));
}

function dedupe(list: SelectedKeyframe[]): SelectedKeyframe[] {
  const unique: SelectedKeyframe[] = [];
  for (const item of list) {
    if (!unique.some((existing) => isSameKey(existing, item))) {
      unique.push(item);
    }
  }
  return unique;
}

export const keyframeSelectionStore = {
  getSelected(): SelectedKeyframe[] {
    return selected;
  },

  selectSingle(item: SelectedKeyframe) {
    if (selected.length === 1 && isSameKey(selected[0], item)) {
      return;
    }
    selected = [item];
    notify();
  },

  toggle(item: SelectedKeyframe) {
    if (hasKey(item)) {
      selected = selected.filter((existing) => !isSameKey(existing, item));
    } else {
      selected = [...selected, item];
    }
    notify();
  },

  clear() {
    if (selected.length === 0) return;
    selected = [];
    notify();
  },

  setMarqueeSelection(list: SelectedKeyframe[]) {
    const next = dedupe(list);
    const unchanged =
      next.length === selected.length && next.every((item, index) => isSameKey(item, selected[index]));
    if (unchanged) return;
    selected = next;
    notify();
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
