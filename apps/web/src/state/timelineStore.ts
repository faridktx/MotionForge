const MIN_PIXELS_PER_SECOND = 40;
const MAX_PIXELS_PER_SECOND = 480;
const DEFAULT_PIXELS_PER_SECOND = 120;
const DEFAULT_SNAP_SECONDS = 0.1;

type Listener = () => void;

let pixelsPerSecond = DEFAULT_PIXELS_PER_SECOND;
let snapSeconds = DEFAULT_SNAP_SECONDS;
const collapsedObjects = new Map<string, boolean>();
const hiddenObjects = new Set<string>();

const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

function clampPixelsPerSecond(value: number): number {
  return Math.max(MIN_PIXELS_PER_SECOND, Math.min(MAX_PIXELS_PER_SECOND, value));
}

export const timelineStore = {
  getPixelsPerSecond(): number {
    return pixelsPerSecond;
  },

  setPixelsPerSecond(value: number) {
    const next = clampPixelsPerSecond(value);
    if (Math.abs(next - pixelsPerSecond) < 1e-6) {
      return;
    }
    pixelsPerSecond = next;
    notify();
  },

  zoomByFactor(factor: number) {
    if (!Number.isFinite(factor) || factor <= 0) {
      return;
    }
    this.setPixelsPerSecond(pixelsPerSecond * factor);
  },

  getSnapSeconds(): number {
    return snapSeconds;
  },

  setSnapSeconds(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }
    snapSeconds = value;
    notify();
  },

  isObjectCollapsed(objectId: string, selectedId: string | null): boolean {
    if (objectId === selectedId) return false;
    return collapsedObjects.get(objectId) ?? true;
  },

  setObjectCollapsed(objectId: string, collapsed: boolean) {
    const current = collapsedObjects.get(objectId) ?? true;
    if (current === collapsed) return;
    collapsedObjects.set(objectId, collapsed);
    notify();
  },

  toggleObjectCollapsed(objectId: string, selectedId: string | null) {
    if (objectId === selectedId) return;
    this.setObjectCollapsed(objectId, !this.isObjectCollapsed(objectId, selectedId));
  },

  isObjectHidden(objectId: string): boolean {
    return hiddenObjects.has(objectId);
  },

  toggleObjectHidden(objectId: string) {
    if (hiddenObjects.has(objectId)) {
      hiddenObjects.delete(objectId);
    } else {
      hiddenObjects.add(objectId);
    }
    notify();
  },

  clearObjectUiState() {
    collapsedObjects.clear();
    hiddenObjects.clear();
    notify();
  },

  getBounds() {
    return {
      minPixelsPerSecond: MIN_PIXELS_PER_SECOND,
      maxPixelsPerSecond: MAX_PIXELS_PER_SECOND,
    };
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
