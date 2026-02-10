const MIN_PIXELS_PER_SECOND = 40;
const MAX_PIXELS_PER_SECOND = 480;
const DEFAULT_PIXELS_PER_SECOND = 120;
const DEFAULT_SNAP_SECONDS = 0.1;
const SNAP_PRESETS = [0, 0.1, 0.5, 1] as const;

type Listener = () => void;

let pixelsPerSecond = DEFAULT_PIXELS_PER_SECOND;
let snapSeconds = DEFAULT_SNAP_SECONDS;
let panOffsetPx = 0;
const collapsedObjects = new Map<string, boolean>();
const hiddenObjects = new Set<string>();

const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

function clampPixelsPerSecond(value: number): number {
  return Math.max(MIN_PIXELS_PER_SECOND, Math.min(MAX_PIXELS_PER_SECOND, value));
}

function clampPanOffset(value: number): number {
  return Math.max(0, value);
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
    if (!Number.isFinite(value) || value < 0) {
      return;
    }
    let closest: number = SNAP_PRESETS[0];
    let bestDistance = Math.abs(value - closest);
    for (const candidate of SNAP_PRESETS) {
      const distance = Math.abs(value - candidate);
      if (distance < bestDistance) {
        closest = candidate;
        bestDistance = distance;
      }
    }
    if (Math.abs(closest - snapSeconds) < 1e-6) {
      return;
    }
    snapSeconds = closest;
    notify();
  },

  getSnapPresets(): readonly number[] {
    return SNAP_PRESETS;
  },

  getPanOffsetPx(): number {
    return panOffsetPx;
  },

  setPanOffsetPx(value: number) {
    if (!Number.isFinite(value)) return;
    const next = clampPanOffset(value);
    if (Math.abs(next - panOffsetPx) < 1e-6) return;
    panOffsetPx = next;
    notify();
  },

  panBy(deltaPx: number) {
    if (!Number.isFinite(deltaPx) || Math.abs(deltaPx) < 1e-6) return;
    this.setPanOffsetPx(panOffsetPx + deltaPx);
  },

  resetView() {
    let changed = false;
    if (Math.abs(pixelsPerSecond - DEFAULT_PIXELS_PER_SECOND) > 1e-6) {
      pixelsPerSecond = DEFAULT_PIXELS_PER_SECOND;
      changed = true;
    }
    if (Math.abs(snapSeconds - DEFAULT_SNAP_SECONDS) > 1e-6) {
      snapSeconds = DEFAULT_SNAP_SECONDS;
      changed = true;
    }
    if (Math.abs(panOffsetPx) > 1e-6) {
      panOffsetPx = 0;
      changed = true;
    }
    if (changed) {
      notify();
    }
  },

  clearAllUiState() {
    this.clearObjectUiState();
    this.resetView();
  },

  clearObjectUiState() {
    const hadObjects = collapsedObjects.size > 0 || hiddenObjects.size > 0;
    collapsedObjects.clear();
    hiddenObjects.clear();
    if (hadObjects) {
      notify();
    }
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
