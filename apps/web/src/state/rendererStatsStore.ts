const STORAGE_KEY = "motionforge_renderer_stats_v1";

type Listener = () => void;
const listeners = new Set<Listener>();

let enabled = false;

function notify() {
  listeners.forEach((listener) => listener());
}

function readInitialValue(): boolean {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "1";
}

enabled = readInitialValue();

export const rendererStatsStore = {
  getEnabled(): boolean {
    return enabled;
  },

  setEnabled(next: boolean) {
    if (enabled === next) return;
    enabled = next;
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    notify();
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
