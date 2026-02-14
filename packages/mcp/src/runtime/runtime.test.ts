import { describe, expect, it } from "vitest";
import { createRuntime } from "./runtime.js";
import { createMultiObjectProjectJson, createSampleProjectJson } from "../__tests__/fixtures.js";
import { RuntimeError } from "./errors.js";

describe("runtime deterministic events", () => {
  it("returns stable event ordering for same command sequence", () => {
    const runSequence = () => {
      const runtime = createRuntime();
      runtime.loadProjectJson(createMultiObjectProjectJson(), { staged: true });
      runtime.commitStagedLoad();
      const first = runtime.execute("scene.addPrimitive", { type: "box" }).events;
      const second = runtime.execute("scene.duplicateSelected", { offset: [1, 0, 0] }).events;
      const third = runtime.execute("scene.parent", { childId: "obj_cube_2", parentId: "obj_cube" }).events;
      const fourth = runtime.execute("scene.deleteSelected", { confirm: true }).events;
      return [...first, ...second, ...third, ...fourth].map((event) => `${event.seq}:${event.type}`);
    };

    expect(runSequence()).toEqual(runSequence());
  });

  it("undo and redo are symmetric for add/duplicate/delete/parent commands", () => {
    const runtime = createRuntime();
    runtime.loadProjectJson(createMultiObjectProjectJson(), { staged: true });
    runtime.commitStagedLoad();

    runtime.execute("scene.addPrimitive", { type: "sphere" });
    runtime.execute("scene.parent", { childId: "obj_cube_2", parentId: "obj_cube" });
    runtime.execute("scene.selectById", { id: "obj_cube_2" });
    runtime.execute("scene.duplicateSelected", { offset: [0.5, 0, 0] });

    const beforeDelete = runtime.snapshot();
    const selectedDuplicate = beforeDelete.selection.objectId;
    expect(selectedDuplicate).toBeTruthy();
    runtime.execute("scene.deleteSelected", { confirm: true });

    const afterDelete = runtime.snapshot();
    expect(afterDelete.scene.objects.some((item) => item.id === selectedDuplicate)).toBe(false);

    runtime.execute("history.undo", {});
    const afterUndoDelete = runtime.snapshot();
    expect(afterUndoDelete.scene.objects.some((item) => item.id === selectedDuplicate)).toBe(true);

    runtime.execute("history.redo", {});
    const afterRedoDelete = runtime.snapshot();
    expect(afterRedoDelete.scene.objects.some((item) => item.id === selectedDuplicate)).toBe(false);

    const parented = runtime.snapshot().scene.objects.find((item) => item.id === "obj_cube_2");
    expect(parented?.parentId).toBe("obj_cube");
    runtime.execute("history.undo", {}); // undo delete (again)
    runtime.execute("history.undo", {}); // undo duplicate
    runtime.execute("history.undo", {}); // undo selectById
    runtime.execute("history.undo", {}); // undo parent
    const unparented = runtime.snapshot().scene.objects.find((item) => item.id === "obj_cube_2");
    expect(unparented?.parentId ?? null).toBeNull();
    runtime.execute("history.redo", {}); // redo parent
    const reparents = runtime.snapshot().scene.objects.find((item) => item.id === "obj_cube_2");
    expect(reparents?.parentId).toBe("obj_cube");
  });

  it("adds bindPath to newly created tracks during key insert", () => {
    const runtime = createRuntime();
    runtime.loadProjectJson(createSampleProjectJson(), { staged: false });
    runtime.execute("animation.insertRecords", {
      records: [
        {
          objectId: "obj_cube",
          propertyPath: "position.y",
          time: 0.5,
          value: 1,
          interpolation: "linear",
        },
      ],
    });

    const json = JSON.parse(runtime.exportProjectJson()) as {
      animation?: { tracks?: Array<{ objectId: string; property: string; bindPath?: string }> };
    };
    const track = json.animation?.tracks?.find((item) => item.objectId === "obj_cube" && item.property === "position.y");
    expect(track?.bindPath).toBe("Cube");
  });

  it("requires confirm for destructive scene commands", () => {
    const runtime = createRuntime();
    runtime.loadProjectJson(createSampleProjectJson(), { staged: false });

    try {
      runtime.execute("scene.deleteSelected", { confirm: false });
      throw new Error("expected confirm error");
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeError);
      expect((error as RuntimeError).code).toBe("MF_ERR_CONFIRM_REQUIRED");
    }

    try {
      runtime.execute("scene.clearUserObjects", { confirm: false });
      throw new Error("expected confirm error");
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeError);
      expect((error as RuntimeError).code).toBe("MF_ERR_CONFIRM_REQUIRED");
    }
  });

  it("returns MF_ERR_AMBIGUOUS_NAME for selectByName collisions", () => {
    const runtime = createRuntime();
    runtime.loadProjectJson(createMultiObjectProjectJson(), { staged: false });
    runtime.execute("hierarchy.renameMany", {
      changes: [{ objectId: "obj_cube_2", name: "Cube" }],
    });

    try {
      runtime.execute("scene.selectByName", { name: "Cube" });
      throw new Error("expected ambiguity error");
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeError);
      expect((error as RuntimeError).code).toBe("MF_ERR_AMBIGUOUS_NAME");
    }
  });
});
