export type OfflineCacheStatus = "not-supported" | "downloading" | "ready";

export interface OfflineCacheState {
  status: OfflineCacheStatus;
  completed: number;
  total: number;
  message: string;
}

export type OfflineCacheEvent =
  | { type: "UNSUPPORTED" }
  | { type: "DOWNLOAD_STARTED"; total: number }
  | { type: "DOWNLOAD_PROGRESS"; completed: number; total: number }
  | { type: "DOWNLOAD_READY" }
  | { type: "DOWNLOAD_FAILED"; reason: string };

export function createOfflineCacheState(supported: boolean): OfflineCacheState {
  if (!supported) {
    return {
      status: "not-supported",
      completed: 0,
      total: 0,
      message: "Export dependencies are not supported in this browser.",
    };
  }
  return {
    status: "downloading",
    completed: 0,
    total: 0,
    message: "Export dependencies are not downloaded yet.",
  };
}

export function nextOfflineCacheState(
  state: OfflineCacheState,
  event: OfflineCacheEvent,
): OfflineCacheState {
  switch (event.type) {
    case "UNSUPPORTED":
      return {
        status: "not-supported",
        completed: 0,
        total: 0,
        message: "Export dependencies are not supported in this browser.",
      };
    case "DOWNLOAD_STARTED":
      return {
        status: "downloading",
        completed: 0,
        total: Math.max(0, Math.floor(event.total)),
        message: "Downloading export dependencies...",
      };
    case "DOWNLOAD_PROGRESS":
      return {
        status: "downloading",
        completed: Math.max(0, Math.floor(event.completed)),
        total: Math.max(0, Math.floor(event.total)),
        message: "Downloading export dependencies...",
      };
    case "DOWNLOAD_READY":
      return {
        status: "ready",
        completed: state.total,
        total: state.total,
        message: "Export dependencies are ready for offline video export.",
      };
    case "DOWNLOAD_FAILED":
      return {
        status: "downloading",
        completed: state.completed,
        total: state.total,
        message: `Offline pack download failed: ${event.reason}`,
      };
    default:
      return state;
  }
}
