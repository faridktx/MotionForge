import { beforeEach, describe, expect, it } from "vitest";
import { timelineStore } from "./timelineStore.js";

describe("timelineStore object UI state", () => {
  beforeEach(() => {
    timelineStore.clearObjectUiState();
    timelineStore.setSnapSeconds(0.1);
    timelineStore.setPanOffsetPx(0);
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

  it("supports snap grid presets including off", () => {
    expect(timelineStore.getSnapSeconds()).toBe(0.1);
    timelineStore.setSnapSeconds(0.5);
    expect(timelineStore.getSnapSeconds()).toBe(0.5);

    timelineStore.setSnapSeconds(1);
    expect(timelineStore.getSnapSeconds()).toBe(1);

    timelineStore.setSnapSeconds(0);
    expect(timelineStore.getSnapSeconds()).toBe(0);
  });

  it("tracks pan offset and clamps to zero when panning left past origin", () => {
    expect(timelineStore.getPanOffsetPx()).toBe(0);
    timelineStore.panBy(120);
    expect(timelineStore.getPanOffsetPx()).toBe(120);

    timelineStore.panBy(-500);
    expect(timelineStore.getPanOffsetPx()).toBe(0);
  });
});
