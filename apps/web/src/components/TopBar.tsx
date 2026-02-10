import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import { useDirtyState } from "../state/useScene.js";
import {
  saveProject,
  loadFromLocalStorage,
  parseProjectJSONResult,
  downloadProjectJSON,
  downloadProjectBundle,
  getRecentProjects,
  loadAutosaveSnapshot,
  loadRecentProject,
  migrateLegacyRecentPayloads,
  persistRecentProject,
  saveAutosaveSnapshot,
  serializeProject,
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
  summarizeImportedScene,
  toEmbeddedAssetRecord,
  validateImportBudget,
} from "../lib/three/importGltf.js";
import { sceneStore } from "../state/sceneStore.js";
import { collectReferencedAssetIdsFromModelRoots, findUnusedAssetIds } from "../lib/project/assetMaintenance.js";
import {
  isNativeFileAccessSupported,
  readNativeFileAccessSettings,
  writeNativeFileAccessMeta,
  writeNativeFileAccessSettings,
} from "../lib/file/nativeFileAccess.js";
import { rendererStatsStore } from "../state/rendererStatsStore.js";
import {
  createCommandPaletteActions,
  filterCommandPaletteActions,
  type CommandPaletteAction,
} from "../lib/commands/commandPalette.js";

interface TopBarProps {
  onHelp: () => void;
}

interface PendingOpenState {
  text: string;
  fileName: string;
  sizeBytes: number;
  validation: ReturnType<typeof parseProjectJSONResult>;
  nativeHandle: FileSystemFileHandle | null;
}

const AUTOSAVE_SECONDS_KEY = "motionforge_autosave_seconds_v1";
const DEFAULT_AUTOSAVE_SECONDS = 15;

function readAutosaveSeconds(): number {
  const raw = localStorage.getItem(AUTOSAVE_SECONDS_KEY);
  const parsed = raw ? Number(raw) : DEFAULT_AUTOSAVE_SECONDS;
  if (!Number.isFinite(parsed) || parsed < 5 || parsed > 300) {
    return DEFAULT_AUTOSAVE_SECONDS;
  }
  return parsed;
}

function dispatchViewportShortcut(key: string, options: { shiftKey?: boolean } = {}) {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      shiftKey: options.shiftKey ?? false,
      bubbles: true,
      cancelable: true,
    }),
  );
}

export function TopBar({ onHelp }: TopBarProps) {
  const dirty = useDirtyState();
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const modelFileInputRef = useRef<HTMLInputElement>(null);
  const nativeFileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const [importStatus, setImportStatus] = useState(() => assetStore.getImportStatus());
  const [recentOpen, setRecentOpen] = useState(false);
  const [recentProjects, setRecentProjects] = useState(() => getRecentProjects());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nativeEnabled, setNativeEnabled] = useState(() => readNativeFileAccessSettings().enabled);
  const [rendererStatsEnabled, setRendererStatsEnabled] = useState(() => rendererStatsStore.getEnabled());
  const [autosaveSeconds, setAutosaveSeconds] = useState(() => readAutosaveSeconds());
  const [pendingOpen, setPendingOpen] = useState<PendingOpenState | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandActiveIndex, setCommandActiveIndex] = useState(0);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const nativeSupported = isNativeFileAccessSupported();

  useEffect(() => {
    return assetStore.subscribeImport(() => setImportStatus(assetStore.getImportStatus()));
  }, []);

  const refreshRecentProjects = useCallback(() => {
    setRecentProjects(getRecentProjects());
  }, []);

  useEffect(() => {
    void (async () => {
      const migrated = await migrateLegacyRecentPayloads();
      refreshRecentProjects();
      if (migrated > 0) {
        toastStore.show(`Migrated ${migrated} recent project payload(s) to IndexedDB`, "info");
      }
    })();
  }, [refreshRecentProjects]);

  useEffect(() => {
    writeNativeFileAccessSettings({ enabled: nativeEnabled });
  }, [nativeEnabled]);

  useEffect(() => {
    rendererStatsStore.setEnabled(rendererStatsEnabled);
  }, [rendererStatsEnabled]);

  useEffect(() => {
    localStorage.setItem(AUTOSAVE_SECONDS_KEY, autosaveSeconds.toString());
  }, [autosaveSeconds]);

  useEffect(() => {
    const intervalMs = autosaveSeconds * 1000;
    const timer = window.setInterval(() => {
      if (!sceneStore.isDirty()) return;
      void saveAutosaveSnapshot();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [autosaveSeconds]);

  const confirmDiscard = useCallback((actionLabel: string): boolean => {
    if (!dirty) return true;
    return window.confirm(`You have unsaved changes. Continue with ${actionLabel}?`);
  }, [dirty]);

  const applyProjectData = useCallback(async (text: string, label: string, customName?: string) => {
    const parsed = parseProjectJSONResult(text);
    const data = parsed.data;
    if (!data) {
      toastStore.show(parsed.error ? `${label} failed: ${parsed.error}` : `${label} failed`, "error");
      return false;
    }

    try {
      await deserializeProject(data);
      await persistRecentProject(data, text, customName);
      refreshRecentProjects();
      toastStore.show(`${label} successful`, "success");
      return true;
    } catch {
      toastStore.show(`${label} failed: project could not be reconstructed`, "error");
      return false;
    }
  }, [refreshRecentProjects]);

  const reviewOpenCandidate = useCallback((
    text: string,
    fileName: string,
    sizeBytes: number,
    nativeHandle: FileSystemFileHandle | null = null,
  ) => {
    setPendingOpen({
      text,
      fileName,
      sizeBytes,
      nativeHandle,
      validation: parseProjectJSONResult(text),
    });
  }, []);

  const confirmOpenCandidate = useCallback(async () => {
    if (!pendingOpen) return;

    if (!pendingOpen.validation.data) {
      toastStore.show(
        pendingOpen.validation.error
          ? `Open failed: ${pendingOpen.validation.error}`
          : "Open failed",
        "error",
      );
      return;
    }

    await saveAutosaveSnapshot();
    const loaded = await applyProjectData(
      pendingOpen.text,
      "Open Project",
      pendingOpen.fileName.replace(/\.json$/i, ""),
    );

    if (loaded) {
      nativeFileHandleRef.current = pendingOpen.nativeHandle;
      if (pendingOpen.nativeHandle) {
        writeNativeFileAccessMeta(pendingOpen.nativeHandle.name);
      }
      setPendingOpen(null);
    } else {
      toastStore.show("Use Recover Autosave to restore the last snapshot.", "info");
    }
  }, [applyProjectData, pendingOpen]);

  const writeProjectToNativeHandle = useCallback(async (handle: FileSystemFileHandle): Promise<boolean> => {
    try {
      const data = serializeProject();
      const json = JSON.stringify(data, null, 2);
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();

      writeNativeFileAccessMeta(handle.name);
      const ok = await saveProject();
      if (ok) {
        refreshRecentProjects();
      }
      return ok;
    } catch {
      return false;
    }
  }, [refreshRecentProjects]);

  const handleSaveAsNative = useCallback(async () => {
    if (!nativeSupported || !nativeEnabled || typeof window.showSaveFilePicker !== "function") {
      downloadProjectJSON();
      toastStore.show("Native save unavailable. Exported JSON instead.", "info");
      return;
    }
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "motionforge-project.json",
        types: [{
          description: "MotionForge Project JSON",
          accept: { "application/json": [".json"] },
        }],
      });
      nativeFileHandleRef.current = handle;
      const ok = await writeProjectToNativeHandle(handle);
      if (ok) {
        toastStore.show("Project saved (native)", "success");
      } else {
        toastStore.show("Native save failed", "error");
      }
    } catch {
      toastStore.show("Native save canceled", "info");
    }
  }, [nativeEnabled, nativeSupported, writeProjectToNativeHandle]);

  const handleSave = useCallback(async () => {
    if (nativeSupported && nativeEnabled) {
      const existingHandle = nativeFileHandleRef.current;
      if (existingHandle) {
        const ok = await writeProjectToNativeHandle(existingHandle);
        if (ok) {
          toastStore.show("Project saved", "success");
        } else {
          toastStore.show("Failed to save project", "error");
        }
        return;
      }
      await handleSaveAsNative();
      return;
    }

    const ok = await saveProject();
    if (ok) {
      refreshRecentProjects();
      toastStore.show("Project saved", "success");
    } else {
      toastStore.show("Failed to save project", "error");
    }
  }, [handleSaveAsNative, nativeEnabled, nativeSupported, refreshRecentProjects, writeProjectToNativeHandle]);

  const handleLoad = useCallback(async () => {
    if (!confirmDiscard("Load")) return;
    const data = loadFromLocalStorage();
    if (data) {
      try {
        await deserializeProject(data);
        await persistRecentProject(data, JSON.stringify(data), "Local Save");
        refreshRecentProjects();
        toastStore.show("Project loaded", "success");
      } catch {
        toastStore.show("Load failed: project could not be reconstructed", "error");
      }
    } else {
      toastStore.show("No saved project found", "error");
    }
  }, [confirmDiscard, refreshRecentProjects]);

  const handleOpenNative = useCallback(async () => {
    if (!confirmDiscard("Open")) return;
    if (!nativeSupported || !nativeEnabled || typeof window.showOpenFilePicker !== "function") {
      projectFileInputRef.current?.click();
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{
          description: "MotionForge JSON",
          accept: { "application/json": [".json"] },
        }],
      });
      const file = await handle.getFile();
      const text = await file.text();
      reviewOpenCandidate(text, file.name, file.size, handle);
    } catch {
      toastStore.show("Open canceled", "info");
    }
  }, [confirmDiscard, nativeEnabled, nativeSupported, reviewOpenCandidate]);

  const handleNew = useCallback(() => {
    if (!confirmDiscard("New")) return;
    newProject();
    toastStore.show("New project created", "info");
  }, [confirmDiscard]);

  const handleImport = useCallback(() => {
    if (!confirmDiscard("Open Project")) return;
    projectFileInputRef.current?.click();
  }, [confirmDiscard]);

  const handleImportModel = useCallback(() => {
    modelFileInputRef.current?.click();
  }, []);

  const handlePurgeUnusedAssets = useCallback(() => {
    const assets = assetStore.getAssets();
    if (assets.length === 0) {
      toastStore.show("No imported assets to purge", "info");
      return;
    }
    const referenced = collectReferencedAssetIdsFromModelRoots(sceneStore.getAllUserObjects());
    const unusedIds = findUnusedAssetIds(assets, referenced);
    if (unusedIds.length === 0) {
      toastStore.show("No unused assets found", "info");
      return;
    }
    for (const id of unusedIds) {
      assetStore.removeAsset(id);
    }
    sceneStore.markDirty();
    toastStore.show(`Purged ${unusedIds.length} unused asset(s)`, "success");
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
    reviewOpenCandidate(text, file.name, file.size, null);
    // Reset so the same file can be imported again
    e.target.value = "";
  }, [reviewOpenCandidate]);

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
      const summary = summarizeImportedScene(root);
      const budgetError = validateImportBudget(summary);
      if (budgetError) {
        throw new Error(budgetError);
      }
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

      toastStore.show(
        `Model imported (${summary.nodes} nodes · ${summary.meshes} meshes · ${summary.materials} materials · ${summary.textures} textures)`,
        "success",
      );
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

  const handleOpenRecent = useCallback(async (id: string) => {
    if (!confirmDiscard("Open Recent")) return;
    const parsed = await loadRecentProject(id);
    if (!parsed.data) {
      toastStore.show(parsed.error ? `Open recent failed: ${parsed.error}` : "Open recent failed", "error");
      return;
    }
    try {
      await deserializeProject(parsed.data);
      toastStore.show("Recent project opened", "success");
      setRecentOpen(false);
    } catch {
      toastStore.show("Open recent failed: project could not be reconstructed", "error");
    }
  }, [confirmDiscard]);

  const handleRecoverAutosave = useCallback(async () => {
    const snapshot = await loadAutosaveSnapshot();
    if (!snapshot.data) {
      toastStore.show(snapshot.error ?? "Recover failed", "error");
      return;
    }
    try {
      await deserializeProject(snapshot.data);
      toastStore.show("Recovered from autosave", "success");
    } catch {
      toastStore.show("Recover failed: snapshot could not be reconstructed", "error");
    }
  }, []);

  const commandActions = useMemo(() => (
    createCommandPaletteActions({
      onNewProject: handleNew,
      onSaveProject: () => { void handleSave(); },
      onExportProject: handleExport,
      onImportProject: handleImport,
      onTogglePlayback: () => dispatchViewportShortcut(" "),
      onFrameSelected: () => dispatchViewportShortcut("f"),
      onToggleGrid: () => dispatchViewportShortcut("g"),
    })
  ), [handleExport, handleImport, handleNew, handleSave]);

  const filteredCommandActions = useMemo(
    () => filterCommandPaletteActions(commandActions, commandQuery),
    [commandActions, commandQuery],
  );

  const executeCommandAction = useCallback((action: CommandPaletteAction) => {
    action.run();
    setCommandPaletteOpen(false);
    setCommandQuery("");
    setCommandActiveIndex(0);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const hasMod = event.metaKey || event.ctrlKey;
      if (hasMod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
        setCommandQuery("");
        setCommandActiveIndex(0);
        setRecentOpen(false);
        setSettingsOpen(false);
      }
      if (event.key === "Escape" && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commandPaletteOpen]);

  useEffect(() => {
    if (!commandPaletteOpen) return;
    commandInputRef.current?.focus();
  }, [commandPaletteOpen]);

  useEffect(() => {
    if (filteredCommandActions.length === 0) {
      setCommandActiveIndex(0);
      return;
    }
    if (commandActiveIndex >= filteredCommandActions.length) {
      setCommandActiveIndex(filteredCommandActions.length - 1);
    }
  }, [commandActiveIndex, filteredCommandActions.length]);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-brand">MotionForge</span>
        {dirty && <span className="topbar-badge">Unsaved</span>}
      </div>
      <nav className="topbar-nav">
        <div className="topbar-nav-group topbar-nav-group--primary">
          <button className="topbar-btn topbar-btn--primary" onClick={handleNew}>
            New
          </button>
          <button className="topbar-btn topbar-btn--primary" onClick={() => { void handleSave(); }}>
            Save
          </button>
          <button className="topbar-btn topbar-btn--primary" onClick={handleExport}>
            Export
          </button>
        </div>

        <div className="topbar-nav-group">
          <button className="topbar-btn" onClick={() => { void handleOpenNative(); }}>
            Open
          </button>
        </div>

        <div className="topbar-nav-group topbar-nav-group--secondary">
          <button className="topbar-btn" onClick={handleImport}>
            Import
          </button>
          <button className="topbar-btn" onClick={handleImportModel}>
            Import Model
          </button>
          <button className="topbar-btn" onClick={handleExportBundle}>
            Export Bundle
          </button>
        </div>

        <div className="topbar-nav-group topbar-nav-group--utility">
          <button className="topbar-btn" onClick={() => {
            setSettingsOpen(false);
            setCommandPaletteOpen(false);
            setRecentOpen((open) => !open);
          }}>
            Recent
          </button>
          <button
            className="topbar-btn"
            title="Command Palette (Ctrl+K)"
            onClick={() => {
              setRecentOpen(false);
              setSettingsOpen(false);
              setCommandPaletteOpen(true);
            }}
          >
            Ctrl+K
          </button>
          <button className="topbar-btn" onClick={onHelp}>
            Help
          </button>
          <button className="topbar-btn" onClick={() => {
            setRecentOpen(false);
            setCommandPaletteOpen(false);
            setSettingsOpen((open) => !open);
          }}>
            Settings
          </button>
        </div>
      </nav>
      {recentOpen && (
        <div className="topbar-recent" role="menu" aria-label="Recent projects">
          <div className="topbar-recent-title">Recent Projects</div>
          {recentProjects.length === 0 ? (
            <div className="topbar-recent-empty">No recent projects yet</div>
          ) : (
            recentProjects.map((entry) => (
              <button
                key={entry.id}
                className="topbar-recent-item"
                onClick={() => {
                  void handleOpenRecent(entry.id);
                }}
              >
                <span>{entry.name}</span>
                <small>
                  v{entry.version} · {Math.round(entry.size / 1024)}KB · {new Date(entry.updatedAt).toLocaleString()}
                </small>
              </button>
            ))
          )}
        </div>
      )}
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
      {settingsOpen && (
        <div className="topbar-settings" role="dialog" aria-label="Settings">
          <div className="topbar-recent-title">Settings</div>
          <label className="topbar-settings-row">
            <input
              type="checkbox"
              checked={nativeEnabled}
              disabled={!nativeSupported}
              onChange={(event) => setNativeEnabled(event.target.checked)}
            />
            <span>Use native file access (experimental)</span>
          </label>
          {!nativeSupported && (
            <div className="topbar-settings-note">
              Native file access is not supported in this browser. Falling back to upload/download.
            </div>
          )}
          <label className="topbar-settings-row">
            <span>Autosave (seconds)</span>
            <input
              className="topbar-settings-number"
              type="number"
              min={5}
              max={300}
              step={1}
              value={autosaveSeconds}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value)) return;
                setAutosaveSeconds(Math.max(5, Math.min(300, Math.round(value))));
              }}
            />
          </label>
          <label className="topbar-settings-row">
            <input
              type="checkbox"
              checked={rendererStatsEnabled}
              onChange={(event) => setRendererStatsEnabled(event.target.checked)}
            />
            <span>Show renderer stats overlay (dev)</span>
          </label>
          <div className="topbar-settings-actions">
            <button className="topbar-btn" onClick={() => { void handleSaveAsNative(); }}>
              Save As
            </button>
            <button className="topbar-btn" onClick={() => { void handleLoad(); }}>
              Load
            </button>
            <button className="topbar-btn" onClick={() => { void handleRecoverAutosave(); }}>
              Recover Autosave
            </button>
            <button className="topbar-btn" onClick={handlePurgeUnusedAssets}>
              Purge Unused
            </button>
          </div>
        </div>
      )}
      {commandPaletteOpen && (
        <div className="topbar-command-palette" role="dialog" aria-label="Command palette">
          <input
            ref={commandInputRef}
            className="topbar-command-input"
            placeholder="Search actions..."
            value={commandQuery}
            onChange={(event) => {
              setCommandQuery(event.target.value);
              setCommandActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCommandActiveIndex((index) => Math.min(filteredCommandActions.length - 1, index + 1));
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setCommandActiveIndex((index) => Math.max(0, index - 1));
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const selected = filteredCommandActions[commandActiveIndex];
                if (selected) {
                  executeCommandAction(selected);
                }
                return;
              }
              if (event.key === "Escape") {
                setCommandPaletteOpen(false);
              }
            }}
          />
          <div className="topbar-command-list">
            {filteredCommandActions.length === 0 ? (
              <div className="topbar-command-empty">No matching actions</div>
            ) : (
              filteredCommandActions.map((action, index) => (
                <button
                  key={action.id}
                  className={`topbar-command-item${index === commandActiveIndex ? " is-active" : ""}`}
                  onMouseEnter={() => setCommandActiveIndex(index)}
                  onClick={() => executeCommandAction(action)}
                >
                  {action.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {pendingOpen && (
        <div className="modal-overlay">
          <div className="modal modal--open-review" role="dialog" aria-modal="true" aria-label="Open Project Review">
            <div className="modal-header">
              <h2>Open Project</h2>
              <button className="modal-close" onClick={() => setPendingOpen(null)} aria-label="Close">
                &times;
              </button>
            </div>
            <div className="modal-body">
              <section className="modal-section">
                <div><b>File:</b> {pendingOpen.fileName}</div>
                <div><b>Size:</b> {Math.round(pendingOpen.sizeBytes / 1024)} KB</div>
                <div><b>Supported versions:</b> 1, 2, 3</div>
              </section>
              <section className="modal-section">
                <h3>Validation Summary</h3>
                {pendingOpen.validation.data ? (
                  <ul>
                    <li><b>Version:</b> {pendingOpen.validation.data.version}</li>
                    <li><b>Objects:</b> {pendingOpen.validation.data.objects.length}</li>
                    <li><b>Model instances:</b> {pendingOpen.validation.data.modelInstances?.length ?? 0}</li>
                    <li><b>Tracks:</b> {pendingOpen.validation.data.animation?.tracks.length ?? 0}</li>
                  </ul>
                ) : (
                  <div className="topbar-settings-note">
                    {pendingOpen.validation.error ?? "Unknown validation error"}
                  </div>
                )}
              </section>
              <section className="onboarding-actions">
                <button className="topbar-btn" onClick={() => setPendingOpen(null)}>
                  Cancel
                </button>
                <button
                  className="topbar-btn topbar-btn--primary"
                  disabled={!pendingOpen.validation.data}
                  onClick={() => { void confirmOpenCandidate(); }}
                >
                  Replace Current Scene
                </button>
              </section>
            </div>
          </div>
        </div>
      )}
      <input
        id="project-import-input"
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
