import { describe, expect, it } from "vitest";
import { findUnusedAssetIds } from "./assetMaintenance.js";
import type { AssetRecord } from "../../state/assetStore.js";

function makeAsset(id: string): AssetRecord {
  return {
    id,
    name: `${id}.glb`,
    type: "gltf",
    source: {
      mode: "embedded",
      data: "AA==",
      fileName: `${id}.glb`,
    },
    size: 8,
  };
}

describe("assetMaintenance", () => {
  it("returns only assets that are not referenced by model roots", () => {
    const assets = [makeAsset("asset_a"), makeAsset("asset_b"), makeAsset("asset_c")];
    const unused = findUnusedAssetIds(assets, new Set(["asset_b"]));
    expect(unused).toEqual(["asset_a", "asset_c"]);
  });
});
