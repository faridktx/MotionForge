interface PurgeUnusedAssetsWithConfirmInput {
  assetIds: string[];
  referencedAssetIds: Set<string>;
  confirm: (message: string) => boolean;
  removeAsset: (assetId: string) => void;
  markDirty: () => void;
}

export type PurgeUnusedAssetsResult =
  | { status: "none"; unusedCount: 0 }
  | { status: "cancelled"; unusedCount: number }
  | { status: "purged"; unusedCount: number };

export function purgeUnusedAssetsWithConfirm(input: PurgeUnusedAssetsWithConfirmInput): PurgeUnusedAssetsResult {
  const unused = input.assetIds.filter((assetId) => !input.referencedAssetIds.has(assetId));
  if (unused.length === 0) {
    return { status: "none", unusedCount: 0 };
  }

  const confirmed = input.confirm(`Purge ${unused.length} unused asset(s)?`);
  if (!confirmed) {
    return { status: "cancelled", unusedCount: unused.length };
  }

  for (const assetId of unused) {
    input.removeAsset(assetId);
  }
  input.markDirty();
  return { status: "purged", unusedCount: unused.length };
}
