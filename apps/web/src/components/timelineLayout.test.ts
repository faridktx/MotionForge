import { describe, expect, it } from "vitest";
import { buildTimelineLayoutRows } from "./timelineLayout.js";

describe("buildTimelineLayoutRows", () => {
  it("creates object > property > axis rows when object is expanded", () => {
    const rows = buildTimelineLayoutRows({
      objects: [{ id: "cube", name: "Cube" }],
      selectedId: "cube",
      isObjectHidden: () => false,
      isObjectCollapsed: () => false,
    });

    expect(rows[0]).toMatchObject({ id: "object:cube", type: "object", label: "Cube" });
    expect(rows.some((row) => row.id === "property:cube:position" && row.type === "property")).toBe(true);
    expect(rows.some((row) => row.id === "lane:cube:position.x" && row.type === "lane")).toBe(true);
    expect(rows.some((row) => row.id === "lane:cube:rotation.y" && row.type === "lane")).toBe(true);
    expect(rows.some((row) => row.id === "lane:cube:scale.z" && row.type === "lane")).toBe(true);
  });

  it("returns only object row when hidden", () => {
    const rows = buildTimelineLayoutRows({
      objects: [{ id: "cube", name: "Cube" }],
      selectedId: "cube",
      isObjectHidden: () => true,
      isObjectCollapsed: () => false,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "object:cube", type: "object", hidden: true });
  });

  it("forces selected object expanded even when collapse source says collapsed", () => {
    const rows = buildTimelineLayoutRows({
      objects: [{ id: "cube", name: "Cube" }],
      selectedId: "cube",
      isObjectHidden: () => false,
      isObjectCollapsed: (id, selectedId) => id !== selectedId,
    });

    expect(rows.some((row) => row.id === "lane:cube:position.x")).toBe(true);
  });
});
