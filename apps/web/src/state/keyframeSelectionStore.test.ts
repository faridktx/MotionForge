import { beforeEach, describe, expect, it } from "vitest";
import { keyframeSelectionStore, type SelectedKeyframe } from "./keyframeSelectionStore.js";

function key(objectId: string, propertyPath: "position.x" | "rotation.y" | "scale.z", time: number): SelectedKeyframe {
  return { objectId, propertyPath, time };
}

describe("keyframeSelectionStore", () => {
  beforeEach(() => {
    keyframeSelectionStore.clear();
  });

  it("supports selectSingle and toggle multi-select behavior", () => {
    const a = key("cube", "position.x", 0.2);
    const b = key("cube", "rotation.y", 1.1);

    keyframeSelectionStore.selectSingle(a);
    expect(keyframeSelectionStore.getSelected()).toEqual([a]);

    keyframeSelectionStore.toggle(b);
    expect(keyframeSelectionStore.getSelected()).toEqual([a, b]);

    keyframeSelectionStore.toggle(a);
    expect(keyframeSelectionStore.getSelected()).toEqual([b]);
  });

  it("dedupes marquee selection set", () => {
    const a = key("cube", "position.x", 0.2);
    keyframeSelectionStore.setMarqueeSelection([a, a]);
    expect(keyframeSelectionStore.getSelected()).toEqual([a]);
  });
});
