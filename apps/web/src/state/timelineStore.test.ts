import { beforeEach, describe, expect, it } from "vitest";
import { timelineStore } from "./timelineStore.js";

describe("timelineStore object UI state", () => {
  beforeEach(() => {
    timelineStore.clearObjectUiState();
  });

  it("defaults non-selected objects to collapsed and selected to expanded", () => {
    expect(timelineStore.isObjectCollapsed("obj_1", null)).toBe(true);
    expect(timelineStore.isObjectCollapsed("obj_1", "obj_1")).toBe(false);
  });

  it("toggles collapsed state for non-selected objects", () => {
    timelineStore.toggleObjectCollapsed("obj_1", null);
    expect(timelineStore.isObjectCollapsed("obj_1", null)).toBe(false);
    timelineStore.toggleObjectCollapsed("obj_1", null);
    expect(timelineStore.isObjectCollapsed("obj_1", null)).toBe(true);
  });

  it("does not collapse selected object through toggle", () => {
    timelineStore.toggleObjectCollapsed("obj_1", "obj_1");
    expect(timelineStore.isObjectCollapsed("obj_1", "obj_1")).toBe(false);
  });

  it("toggles object visibility state", () => {
    expect(timelineStore.isObjectHidden("obj_1")).toBe(false);
    timelineStore.toggleObjectHidden("obj_1");
    expect(timelineStore.isObjectHidden("obj_1")).toBe(true);
    timelineStore.toggleObjectHidden("obj_1");
    expect(timelineStore.isObjectHidden("obj_1")).toBe(false);
  });
});
