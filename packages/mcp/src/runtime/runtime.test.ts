import { describe, expect, it } from "vitest";
import { createRuntime } from "./runtime.js";
import { createSampleProjectJson } from "../__tests__/fixtures.js";

describe("runtime deterministic events", () => {
  it("returns stable event ordering for same command sequence", () => {
    const runSequence = () => {
      const runtime = createRuntime();
      runtime.loadProjectJson(createSampleProjectJson(), { staged: true });
      runtime.commitStagedLoad();
      const first = runtime.execute("selection.set", { objectId: "obj_cube" }).events;
      const second = runtime.execute("material.set", { objectId: "obj_cube", metallic: 0.5 }).events;
      return [...first, ...second].map((event) => `${event.seq}:${event.type}`);
    };

    expect(runSequence()).toEqual(runSequence());
  });

  it("undo and redo are symmetric for command label ordering", () => {
    const runtime = createRuntime();
    runtime.loadProjectJson(createSampleProjectJson(), { staged: true });
    runtime.commitStagedLoad();

    runtime.execute("material.set", { objectId: "obj_cube", roughness: 0.2 });
    const undoEvents = runtime.execute("history.undo", {}).events;
    const redoEvents = runtime.execute("history.redo", {}).events;

    expect(undoEvents).toHaveLength(1);
    expect(redoEvents).toHaveLength(1);
    expect(undoEvents[0].type).toBe("history.undo");
    expect(redoEvents[0].type).toBe("history.redo");
    expect(undoEvents[0].payload.label).toBe("material.set");
    expect(redoEvents[0].payload.label).toBe("material.set");
  });
});
