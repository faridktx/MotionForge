import { describe, expect, it } from "vitest";
import {
  createOfflineCacheState,
  nextOfflineCacheState,
  type OfflineCacheEvent,
} from "./offlineCacheState.js";

describe("offline cache status state machine", () => {
  it("starts as ready/downloading/not-supported depending on support", () => {
    expect(createOfflineCacheState(false).status).toBe("not-supported");
    expect(createOfflineCacheState(true).status).toBe("downloading");
  });

  it("transitions to downloading with progress and then ready", () => {
    let state = createOfflineCacheState(true);
    const events: OfflineCacheEvent[] = [
      { type: "DOWNLOAD_STARTED", total: 3 },
      { type: "DOWNLOAD_PROGRESS", completed: 1, total: 3 },
      { type: "DOWNLOAD_PROGRESS", completed: 3, total: 3 },
      { type: "DOWNLOAD_READY" },
    ];

    for (const event of events) {
      state = nextOfflineCacheState(state, event);
    }

    expect(state.status).toBe("ready");
    expect(state.completed).toBe(3);
    expect(state.total).toBe(3);
    expect(state.message).toContain("ready");
  });

  it("returns to downloading when download fails and retry is requested", () => {
    let state = createOfflineCacheState(true);
    state = nextOfflineCacheState(state, { type: "DOWNLOAD_FAILED", reason: "network" });
    expect(state.status).toBe("downloading");
    expect(state.message).toContain("network");

    state = nextOfflineCacheState(state, { type: "DOWNLOAD_STARTED", total: 2 });
    expect(state.status).toBe("downloading");
    expect(state.completed).toBe(0);
    expect(state.total).toBe(2);
  });
});
