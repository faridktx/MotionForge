import type { AssetRecord } from "../../state/assetStore.js";

export function collectReferencedAssetIdsFromModelRoots(objects: readonly { userData: Record<string, unknown> }[]): Set<string> {
  const ids = new Set<string>();
  for (const object of objects) {
    if (!object.userData.__isModelRoot) continue;
    const assetId = object.userData.__assetId;
    if (typeof assetId === "string" && assetId.length > 0) {
      ids.add(assetId);
    }
  }
  return ids;
}

export function findUnusedAssetIds(assets: AssetRecord[], referencedAssetIds: ReadonlySet<string>): string[] {
  const unused: string[] = [];
  for (const asset of assets) {
    if (!referencedAssetIds.has(asset.id)) {
      unused.push(asset.id);
    }
  }
  unused.sort((a, b) => a.localeCompare(b));
  return unused;
}
