import { describe, expect, it, vi } from "vitest";
import { createCommandPaletteActions, filterCommandPaletteActions } from "./commandPalette.js";

describe("commandPalette action mapping", () => {
  it("maps command ids to callbacks and executes them", () => {
    const deps = {
      onNewProject: vi.fn(),
      onSaveProject: vi.fn(),
      onExportProject: vi.fn(),
      onImportProject: vi.fn(),
      onTogglePlayback: vi.fn(),
      onFrameSelected: vi.fn(),
      onToggleGrid: vi.fn(),
    };

    const actions = createCommandPaletteActions(deps);
    const ids = actions.map((action) => action.id);
    expect(ids).toEqual([
      "new",
      "save",
      "export",
      "import",
      "play-pause",
      "frame-selected",
      "toggle-grid",
    ]);

    for (const action of actions) {
      action.run();
    }

    expect(deps.onNewProject).toHaveBeenCalledTimes(1);
    expect(deps.onSaveProject).toHaveBeenCalledTimes(1);
    expect(deps.onExportProject).toHaveBeenCalledTimes(1);
    expect(deps.onImportProject).toHaveBeenCalledTimes(1);
    expect(deps.onTogglePlayback).toHaveBeenCalledTimes(1);
    expect(deps.onFrameSelected).toHaveBeenCalledTimes(1);
    expect(deps.onToggleGrid).toHaveBeenCalledTimes(1);
  });

  it("filters commands by label and keywords", () => {
    const actions = createCommandPaletteActions({
      onNewProject: () => undefined,
      onSaveProject: () => undefined,
      onExportProject: () => undefined,
      onImportProject: () => undefined,
      onTogglePlayback: () => undefined,
      onFrameSelected: () => undefined,
      onToggleGrid: () => undefined,
    });

    expect(filterCommandPaletteActions(actions, "frame").map((item) => item.id)).toEqual(["frame-selected"]);
    expect(filterCommandPaletteActions(actions, "play").map((item) => item.id)).toEqual(["play-pause"]);
    expect(filterCommandPaletteActions(actions, "grid").map((item) => item.id)).toEqual(["toggle-grid"]);
  });
});
