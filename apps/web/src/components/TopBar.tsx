import { useRef, useCallback, useEffect, useState } from "react";
import { useDirtyState } from "../state/useScene.js";
import {
  saveProject,
  loadFromLocalStorage,
  parseProjectJSONResult,
  downloadProjectJSON,
  downloadProjectBundle,
} from "../lib/project/serialize.js";
import { deserializeProject, newProject } from "../lib/project/deserialize.js";
import { toastStore } from "../state/toastStore.js";
import { assetStore } from "../state/assetStore.js";
import {
  WARN_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_BYTES,
  annotateImportedHierarchy,
  arrayBufferToBase64,
  parseGltfFromArrayBuffer,
  readFileAsArrayBuffer,
  toEmbeddedAssetRecord,
} from "../lib/three/importGltf.js";
import { sceneStore } from "../state/sceneStore.js";

interface TopBarProps {
  onHelp: () => void;
}

export function TopBar({ onHelp }: TopBarProps) {
  const dirty = useDirtyState();
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const modelFileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState(() => assetStore.getImportStatus());

  useEffect(() => {
    return assetStore.subscribeImport(() => setImportStatus(assetStore.getImportStatus()));
  }, []);

  const handleSave = useCallback(() => {
    const ok = saveProject();
    if (ok) {
      toastStore.show("Project saved", "success");
    } else {
      toastStore.show("Failed to save project", "error");
    }
  }, []);

  const handleLoad = useCallback(async () => {
    const data = loadFromLocalStorage();
    if (data) {
      try {
        await deserializeProject(data);
        toastStore.show("Project loaded", "success");
      } catch {
        toastStore.show("Load failed: project could not be reconstructed", "error");
      }
    } else {
      toastStore.show("No saved project found", "error");
    }
  }, []);

  const handleNew = useCallback(() => {
    newProject();
    toastStore.show("New project created", "info");
  }, []);

  const handleImport = useCallback(() => {
    projectFileInputRef.current?.click();
  }, []);

  const handleImportModel = useCallback(() => {
    modelFileInputRef.current?.click();
  }, []);

  const handleExport = useCallback(() => {
    downloadProjectJSON();
    toastStore.show("Project exported", "success");
  }, []);

  const handleExportBundle = useCallback(() => {
    downloadProjectBundle();
    toastStore.show("Bundle exported", "success");
  }, []);

  const handleProjectFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseProjectJSONResult(text);
    const data = parsed.data;
    if (data) {
      try {
        await deserializeProject(data);
        toastStore.show("Project imported", "success");
      } catch {
        toastStore.show("Import failed: project could not be reconstructed", "error");
      }
    } else {
      toastStore.show(parsed.error ? `Import failed: ${parsed.error}` : "Import failed", "error");
    }
    // Reset so the same file can be imported again
    e.target.value = "";
  }, []);

  const handleModelFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".glb") && !lowerName.endsWith(".gltf")) {
      toastStore.show("Model import failed: only .gltf/.glb files are supported", "error");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toastStore.show("Model import blocked: file exceeds 100MB limit", "error");
      e.target.value = "";
      return;
    }
    if (file.size > WARN_FILE_SIZE_BYTES) {
      toastStore.show("Large model detected. Import may take longer.", "info");
    }

    const abortController = new AbortController();
    assetStore.beginImport(file.name, file.size, () => abortController.abort());

    try {
      const scene = sceneStore.getScene();
      if (!scene) {
        throw new Error("Viewport scene is not ready");
      }

      const arrayBuffer = await readFileAsArrayBuffer(file, {
        signal: abortController.signal,
        onProgress: (loaded, total) => {
          assetStore.updateImportProgress(loaded, total);
        },
      });
      assetStore.updateImportProgress(file.size, file.size);

      const root = await parseGltfFromArrayBuffer(arrayBuffer);
      const assetId = `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      annotateImportedHierarchy(root, assetId, file.name);

      scene.add(root);
      const ids = sceneStore.registerHierarchy(root, { markDirty: true });
      const rootId = ids[0] ?? null;
      if (rootId) {
        sceneStore.setSelectedId(rootId);
      }

      const encoded = arrayBufferToBase64(arrayBuffer);
      const record = toEmbeddedAssetRecord(file, assetId, encoded);
      assetStore.addAsset(record);

      toastStore.show("Model imported", "success");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toastStore.show("Model import canceled", "info");
      } else {
        const reason = error instanceof Error ? error.message : "Unknown error";
        const hint = lowerName.endsWith(".gltf")
          ? " (if textures are external, use .glb or re-export with embedded textures)"
          : "";
        toastStore.show(`Model import failed: ${reason}${hint}`, "error");
      }
    } finally {
      assetStore.finishImport();
      e.target.value = "";
    }
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-brand">MotionForge</span>
        {dirty && <span className="topbar-badge">Unsaved</span>}
      </div>
      <nav className="topbar-nav">
        <button className="topbar-btn topbar-btn--primary" onClick={handleNew}>
          New
        </button>
        <button className="topbar-btn topbar-btn--primary" onClick={handleSave}>
          Save
        </button>
        <button className="topbar-btn" onClick={handleLoad}>
          Load
        </button>
        <button className="topbar-btn" onClick={handleImport}>
          Import
        </button>
        <button className="topbar-btn" onClick={handleImportModel}>
          Import Model
        </button>
        <button className="topbar-btn topbar-btn--primary" onClick={handleExport}>
          Export
        </button>
        <button className="topbar-btn" onClick={handleExportBundle}>
          Export Bundle
        </button>
        <button className="topbar-btn" onClick={onHelp}>
          Help
        </button>
      </nav>
      {importStatus.inProgress && (
        <div className="topbar-import-status" role="status" aria-live="polite">
          <span>
            Importing {importStatus.fileName}
            {importStatus.totalBytes > 0
              ? ` (${Math.round((importStatus.loadedBytes / importStatus.totalBytes) * 100)}%)`
              : ""}
          </span>
          <button className="topbar-btn" onClick={() => assetStore.cancelActiveImport()}>
            Cancel
          </button>
        </div>
      )}
      <input
        ref={projectFileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleProjectFileChange}
      />
      <input
        ref={modelFileInputRef}
        type="file"
        accept=".gltf,.glb,model/gltf-binary,model/gltf+json"
        style={{ display: "none" }}
        onChange={handleModelFileChange}
      />
    </header>
  );
}
