export interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let nextToastId = 1;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((fn) => fn([...toasts]));
}

export const toastStore = {
  getAll(): Toast[] {
    return toasts;
  },

  show(message: string, type: Toast["type"] = "info", durationMs = 3000) {
    const id = nextToastId++;
    toasts = [...toasts, { id, message, type }];
    notify();

    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
      notify();
    }, durationMs);
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
