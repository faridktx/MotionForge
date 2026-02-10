export type AssetType = "gltf";

export type AssetSource =
  | {
    mode: "embedded";
    data: string;
    fileName: string;
  }
  | {
    mode: "external";
    path: string;
  };

export interface AssetRecord {
  id: string;
  name: string;
  type: AssetType;
  source: AssetSource;
  size: number;
}

export interface MaterialOverrideRecord {
  nodePath: string;
  color: number;
  metallic: number;
  roughness: number;
}

export interface ModelInstanceRecord {
  id: string;
  name: string;
  assetId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  materialOverrides?: MaterialOverrideRecord[];
}

export interface ImportStatus {
  inProgress: boolean;
  fileName: string | null;
  loadedBytes: number;
  totalBytes: number;
}

type Listener = () => void;

const assets = new Map<string, AssetRecord>();
const importStatus: ImportStatus = {
  inProgress: false,
  fileName: null,
  loadedBytes: 0,
  totalBytes: 0,
};
let cancelImport: (() => void) | null = null;

const listeners = {
  assets: new Set<Listener>(),
  import: new Set<Listener>(),
};

function notify(channel: keyof typeof listeners) {
  listeners[channel].forEach((listener) => listener());
}

export const assetStore = {
  getAssets(): AssetRecord[] {
    return Array.from(assets.values());
  },

  getAssetById(id: string): AssetRecord | null {
    return assets.get(id) ?? null;
  },

  replaceAssets(next: AssetRecord[]) {
    assets.clear();
    for (const item of next) {
      assets.set(item.id, item);
    }
    notify("assets");
  },

  addAsset(asset: AssetRecord) {
    assets.set(asset.id, asset);
    notify("assets");
  },

  removeAsset(id: string) {
    if (!assets.delete(id)) return;
    notify("assets");
  },

  clearAssets() {
    if (assets.size === 0) return;
    assets.clear();
    notify("assets");
  },

  getImportStatus(): ImportStatus {
    return { ...importStatus };
  },

  beginImport(fileName: string, totalBytes: number, onCancel: () => void) {
    importStatus.inProgress = true;
    importStatus.fileName = fileName;
    importStatus.loadedBytes = 0;
    importStatus.totalBytes = Math.max(0, totalBytes);
    cancelImport = onCancel;
    notify("import");
  },

  updateImportProgress(loadedBytes: number, totalBytes: number) {
    importStatus.loadedBytes = Math.max(0, loadedBytes);
    importStatus.totalBytes = Math.max(0, totalBytes);
    notify("import");
  },

  finishImport() {
    importStatus.inProgress = false;
    importStatus.fileName = null;
    importStatus.loadedBytes = 0;
    importStatus.totalBytes = 0;
    cancelImport = null;
    notify("import");
  },

  cancelActiveImport() {
    if (cancelImport) {
      cancelImport();
    }
    this.finishImport();
  },

  subscribeAssets(listener: Listener): () => void {
    listeners.assets.add(listener);
    return () => listeners.assets.delete(listener);
  },

  subscribeImport(listener: Listener): () => void {
    listeners.import.add(listener);
    return () => listeners.import.delete(listener);
  },
};

