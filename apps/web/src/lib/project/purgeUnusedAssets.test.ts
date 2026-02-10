import { describe, expect, it, vi } from "vitest";
import { purgeUnusedAssetsWithConfirm } from "./purgeUnusedAssets.js";

describe("purgeUnusedAssetsWithConfirm", () => {
  it("does not mutate assets when confirm is declined", () => {
    const removeAsset = vi.fn();
    const markDirty = vi.fn();
    const confirm = vi.fn(() => false);

    const result = purgeUnusedAssetsWithConfirm({
      assetIds: ["asset_a", "asset_b"],
      referencedAssetIds: new Set(["asset_a"]),
      confirm,
      removeAsset,
      markDirty,
    });

    expect(result).toEqual({ status: "cancelled", unusedCount: 1 });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(removeAsset).toHaveBeenCalledTimes(0);
    expect(markDirty).toHaveBeenCalledTimes(0);
  });

  it("removes only unused assets when confirmed", () => {
    const removeAsset = vi.fn();
    const markDirty = vi.fn();
    const confirm = vi.fn(() => true);

    const result = purgeUnusedAssetsWithConfirm({
      assetIds: ["asset_a", "asset_b", "asset_c"],
      referencedAssetIds: new Set(["asset_b"]),
      confirm,
      removeAsset,
      markDirty,
    });

    expect(result).toEqual({ status: "purged", unusedCount: 2 });
    expect(removeAsset).toHaveBeenCalledWith("asset_a");
    expect(removeAsset).toHaveBeenCalledWith("asset_c");
    expect(removeAsset).toHaveBeenCalledTimes(2);
    expect(markDirty).toHaveBeenCalledTimes(1);
  });
});
