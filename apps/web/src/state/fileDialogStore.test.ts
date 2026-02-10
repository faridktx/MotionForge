import { describe, expect, it, vi } from "vitest";
import { fileDialogStore } from "./fileDialogStore.js";

describe("fileDialogStore", () => {
  it("opens registered project import dialog", () => {
    const open = vi.fn();
    fileDialogStore.registerProjectOpenDialog(open);
    expect(fileDialogStore.openProjectImportDialog()).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("returns false when no opener is registered", () => {
    fileDialogStore.registerProjectOpenDialog(null);
    expect(fileDialogStore.openProjectImportDialog()).toBe(false);
  });
});
