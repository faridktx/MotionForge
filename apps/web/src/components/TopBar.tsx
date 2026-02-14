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
import { parseProjectBundle } from "../lib/project/bundle.js";
import { runSoakTest } from "../lib/dev/soakHarness.js";
import { runAgentScript, type AgentScriptAction } from "../lib/agent/scriptRunner.js";
import { deserializeProject, newProject } from "../lib/project/deserialize.js";
import {
  estimateVideoExportSeconds,
  validateVideoExportSettings,
  type VideoExportSettings,
} from "../lib/export/videoExportConfig.js";
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
import { insertBuiltInDemoModel } from "../lib/three/demoModel.js";
import { sceneStore } from "../state/sceneStore.js";
import { collectReferencedAssetIdsFromModelRoots, findUnusedAssetIds } from "../lib/project/assetMaintenance.js";
import { purgeUnusedAssetsWithConfirm } from "../lib/project/purgeUnusedAssets.js";
import {
  downloadOfflinePack,
  isOfflinePackReady,
  isOfflinePackSupported,
} from "../lib/offline/offlinePack.js";
import {
  createOfflineCacheState,
  nextOfflineCacheState,
} from "../lib/offline/offlineCacheState.js";
import {
  isNativeFileAccessSupported,
  readNativeFileAccessSettings,
  writeNativeFileAccessMeta,
  writeNativeFileAccessSettings,
} from "../lib/file/nativeFileAccess.js";
import { rendererStatsStore } from "../state/rendererStatsStore.js";
import { fileDialogStore } from "../state/fileDialogStore.js";
import { commandBus } from "../lib/commands/commandBus.js";
import {
  addPrimitiveObject,
  addCameraObject,
  addLightObject,
  clearUserObjects,
  deleteObjectById,
  deleteSelectedObject,
  duplicateSelectedObject,
  groupObjects,
  isPrimitiveType,
  isLightKind,
  parentObject,
  selectObjectById,
  selectObjectByName,
  ungroupObject,
  unparentObject,
  type AddPrimitiveOptions,
  type AddCameraOptions,
  type AddLightOptions,
  type DuplicateOptions,
  type GroupOptions,
  type LightKind,
  type PrimitiveType,
} from "../lib/scene/objectCommands.js";

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

interface ProjectDiagnosticsState {
  version: number;
  objects: number;
  primitiveObjects: number;
  modelInstances: number;
  assets: number;
  externalAssets: number;
  tracks: number;
  durationSeconds: number;
  payloadSizeBytes: number;
}

interface AgentConsolePlanInput {
  projectJson?: string;
  actions: AgentScriptAction[];
}

const DEFAULT_VIDEO_EXPORT_SETTINGS: VideoExportSettings = {
  format: "mp4",
  width: 1280,
  height: 720,
  fps: 30,
  durationSeconds: 2,
  transparentBackground: false,
};

const AUTOSAVE_SECONDS_KEY = "motionforge_autosave_seconds_v1";
const DEFAULT_AUTOSAVE_SECONDS = 15;
const DEV_TOOLS_KEY = "motionforge_dev_tools_enabled_v1";
const DEFAULT_AGENT_PLAN_JSON = JSON.stringify(
  {
    actions: [
      {
        action: "command.execute",
        input: {
          commandId: "agent.project.exportBundle",
          payload: { includeData: false },
        },
      },
    ],
  },
  null,
  2,
);

function readAutosaveSeconds(): number {
  const raw = localStorage.getItem(AUTOSAVE_SECONDS_KEY);
  const parsed = raw ? Number(raw) : DEFAULT_AUTOSAVE_SECONDS;
  if (!Number.isFinite(parsed) || parsed < 5 || parsed > 300) {
    return DEFAULT_AUTOSAVE_SECONDS;
  }
  return parsed;
}

function readDevToolsEnabled(): boolean {
  return localStorage.getItem(DEV_TOOLS_KEY) === "1";
}

function parsePrimitiveTypeFromPayload(payload: unknown): PrimitiveType | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = (payload as { type?: unknown }).type;
  return isPrimitiveType(candidate) ? candidate : null;
}

function parseLightKindFromPayload(payload: unknown): LightKind | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = (payload as { kind?: unknown }).kind;
  return isLightKind(candidate) ? candidate : null;
}

function parseTuple3(value: unknown): [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  if (!value.every((part) => typeof part === "number" && Number.isFinite(part))) return undefined;
  return [value[0], value[1], value[2]];
}

function parseAddPrimitivePayload(payload: unknown): AddPrimitiveOptions {
  if (typeof payload !== "object" || payload === null) return {};
  const data = payload as {
    name?: unknown;
    at?: { position?: unknown; rotation?: unknown; scale?: unknown };
    material?: { color?: unknown; metallic?: unknown; roughness?: unknown };
  };
  return {
    name: typeof data.name === "string" ? data.name : undefined,
    at: data.at
      ? {
          position: parseTuple3(data.at.position),
          rotation: parseTuple3(data.at.rotation),
          scale: parseTuple3(data.at.scale),
        }
      : undefined,
    material: data.material
      ? {
          color: typeof data.material.color === "number" ? data.material.color : undefined,
          metallic: typeof data.material.metallic === "number" ? data.material.metallic : undefined,
          roughness: typeof data.material.roughness === "number" ? data.material.roughness : undefined,
        }
      : undefined,
  };
}

function parseDuplicatePayload(payload: unknown): DuplicateOptions {
  if (typeof payload !== "object" || payload === null) return {};
  return { offset: parseTuple3((payload as { offset?: unknown }).offset) };
}

function parseGroupPayload(payload: unknown): GroupOptions {
  if (typeof payload !== "object" || payload === null) return {};
  const data = payload as { objectIds?: unknown; name?: unknown };
  return {
    objectIds: Array.isArray(data.objectIds) ? data.objectIds.filter((value): value is string => typeof value === "string") : undefined,
    name: typeof data.name === "string" ? data.name : undefined,
  };
}

function parseAddCameraPayload(payload: unknown): AddCameraOptions {
  if (typeof payload !== "object" || payload === null) return {};
  const data = payload as { name?: unknown; position?: unknown; target?: unknown };
  return {
    name: typeof data.name === "string" ? data.name : undefined,
    position: parseTuple3(data.position),
    target: parseTuple3(data.target),
  };
}

function parseAddLightPayload(payload: unknown): AddLightOptions {
  if (typeof payload !== "object" || payload === null) return {};
  const data = payload as {
    name?: unknown;
    intensity?: unknown;
    color?: unknown;
    position?: unknown;
  };
  return {
    name: typeof data.name === "string" ? data.name : undefined,
    intensity: typeof data.intensity === "number" ? data.intensity : undefined,
    color: typeof data.color === "number" ? data.color : undefined,
    position: parseTuple3(data.position),
  };
}

function hasConfirmed(payload: unknown): boolean {
  return typeof payload === "object" && payload !== null && (payload as { confirm?: unknown }).confirm === true;
}

function buildProjectDiagnosticsState(data: ReturnType<typeof serializeProject>, payloadSizeBytes: number): ProjectDiagnosticsState {
  const assets = data.assets ?? [];
  return {
    version: data.version,
    objects: data.objects.length + (data.modelInstances?.length ?? 0),
    primitiveObjects: data.objects.length,
    modelInstances: data.modelInstances?.length ?? 0,
    assets: assets.length,
    externalAssets: assets.filter((asset) => asset.source.mode === "external").length,
    tracks: data.animation?.tracks.length ?? 0,
    durationSeconds: data.animation?.durationSeconds ?? 0,
    payloadSizeBytes,
  };
}

export function TopBar({ onHelp }: TopBarProps) {
  const dirty = useDirtyState();
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const modelFileInputRef = useRef<HTMLInputElement>(null);
  const bundleFileInputRef = useRef<HTMLInputElement>(null);
  const nativeFileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const [importStatus, setImportStatus] = useState(() => assetStore.getImportStatus());
  const [recentOpen, setRecentOpen] = useState(false);
  const [recentProjects, setRecentProjects] = useState(() => getRecentProjects());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnosticsState, setDiagnosticsState] = useState<ProjectDiagnosticsState | null>(null);
  const [nativeEnabled, setNativeEnabled] = useState(() => readNativeFileAccessSettings().enabled);
  const [rendererStatsEnabled, setRendererStatsEnabled] = useState(() => rendererStatsStore.getEnabled());
  const [devToolsEnabled, setDevToolsEnabled] = useState(() => readDevToolsEnabled());
  const [soakRunning, setSoakRunning] = useState(false);
  const [soakStatus, setSoakStatus] = useState<string | null>(null);
  const [agentPlanText, setAgentPlanText] = useState(DEFAULT_AGENT_PLAN_JSON);
  const [agentRunStatus, setAgentRunStatus] = useState<string | null>(null);
  const [agentRunReport, setAgentRunReport] = useState<string | null>(null);
  const [agentRunInProgress, setAgentRunInProgress] = useState(false);
  const [videoExportOpen, setVideoExportOpen] = useState(false);
  const [videoExportRunning, setVideoExportRunning] = useState(false);
  const [videoExportProgress, setVideoExportProgress] = useState<string | null>(null);
  const [videoExportSettings, setVideoExportSettings] = useState<VideoExportSettings>(
    DEFAULT_VIDEO_EXPORT_SETTINGS,
  );
  const [offlineCacheState, setOfflineCacheState] = useState(() =>
    createOfflineCacheState(isOfflinePackSupported()),
  );
  const [autosaveSeconds, setAutosaveSeconds] = useState(() => readAutosaveSeconds());
  const [pendingOpen, setPendingOpen] = useState<PendingOpenState | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandActiveIndex, setCommandActiveIndex] = useState(0);
  const [commandRevision, setCommandRevision] = useState(0);
  const [triggerCrash, setTriggerCrash] = useState(false);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const soakAbortRef = useRef<AbortController | null>(null);
  const videoExportAbortRef = useRef<AbortController | null>(null);
  const nativeSupported = isNativeFileAccessSupported();

  useEffect(() => {
    return assetStore.subscribeImport(() => setImportStatus(assetStore.getImportStatus()));
  }, []);

  useEffect(() => {
    fileDialogStore.registerProjectOpenDialog(() => {
      projectFileInputRef.current?.click();
    });
    return () => fileDialogStore.registerProjectOpenDialog(null);
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
    let cancelled = false;
    if (!isOfflinePackSupported()) {
      setOfflineCacheState((state) => nextOfflineCacheState(state, { type: "UNSUPPORTED" }));
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const ready = await isOfflinePackReady();
        if (cancelled) return;
        setOfflineCacheState((state) => (
          ready ? nextOfflineCacheState(state, { type: "DOWNLOAD_READY" }) : state
        ));
      } catch {
        if (cancelled) return;
        setOfflineCacheState((state) => nextOfflineCacheState(state, {
          type: "DOWNLOAD_FAILED",
          reason: "status check failed",
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
    localStorage.setItem(DEV_TOOLS_KEY, devToolsEnabled ? "1" : "0");
  }, [devToolsEnabled]);

  useEffect(() => {
    return () => {
      soakAbortRef.current?.abort();
      soakAbortRef.current = null;
      videoExportAbortRef.current?.abort();
      videoExportAbortRef.current = null;
    };
  }, []);

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
    } catch (error) {
      const reason = error instanceof Error ? error.message : "project could not be reconstructed";
      toastStore.show(`${label} failed: ${reason}`, "error");
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

  const handleImportBundle = useCallback(() => {
    if (!confirmDiscard("Open Bundle")) return;
    bundleFileInputRef.current?.click();
  }, [confirmDiscard]);

  const handleImportModel = useCallback(() => {
    modelFileInputRef.current?.click();
  }, []);

  const handleInsertDemoModel = useCallback(async () => {
    try {
      const { summary } = await insertBuiltInDemoModel();
      toastStore.show(
        `Demo model inserted (${summary.nodes} nodes · ${summary.meshes} meshes · ${summary.materials} materials · ${summary.textures} textures)`,
        "success",
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown import error";
      toastStore.show(`Insert demo model failed: ${reason}`, "error");
    }
  }, []);

  const handleAddPrimitive = useCallback((type: PrimitiveType, options: AddPrimitiveOptions = {}) => {
    const addedId = addPrimitiveObject(type, options);
    if (!addedId) {
      toastStore.show("Add primitive failed: scene is not ready", "error");
      return;
    }
    const label = type === "box" ? "Cube" : type === "sphere" ? "Sphere" : "Cone";
    toastStore.show(`${label} added`, "success");
  }, []);

  const handleDuplicateSelected = useCallback((options: DuplicateOptions = {}) => {
    const duplicateId = duplicateSelectedObject(options);
    if (!duplicateId) {
      toastStore.show("Duplicate failed: no selected object", "info");
      return;
    }
    toastStore.show("Object duplicated", "success");
  }, []);

  const handleDeleteSelected = useCallback((objectId?: string) => {
    const deletedId = objectId ? deleteObjectById(objectId) : deleteSelectedObject();
    if (!deletedId) {
      toastStore.show("Delete failed: no selected object", "info");
      return;
    }
    toastStore.show("Object deleted", "success");
  }, []);

  const handleClearUserObjects = useCallback(() => {
    const removedRoots = clearUserObjects();
    if (removedRoots <= 0) {
      toastStore.show("Scene is already empty", "info");
      return;
    }
    toastStore.show(`Cleared ${removedRoots} root object(s)`, "success");
  }, []);

  const handleAddCamera = useCallback((options: AddCameraOptions = {}) => {
    const objectId = addCameraObject(options);
    if (!objectId) {
      toastStore.show("Add camera failed: scene is not ready", "error");
      return;
    }
    toastStore.show("Camera added", "success");
  }, []);

  const handleAddLight = useCallback((kind: LightKind, options: AddLightOptions = {}) => {
    const objectId = addLightObject(kind, options);
    if (!objectId) {
      toastStore.show("Add light failed: scene is not ready", "error");
      return;
    }
    toastStore.show("Light added", "success");
  }, []);

  const handleParent = useCallback((childId: string, parentId: string) => {
    if (!parentObject(childId, parentId)) {
      toastStore.show("Parent failed", "error");
      return;
    }
    toastStore.show("Parent updated", "success");
  }, []);

  const handleUnparent = useCallback((childId: string) => {
    if (!unparentObject(childId)) {
      toastStore.show("Unparent failed", "error");
      return;
    }
    toastStore.show("Object unparented", "success");
  }, []);

  const handleGroup = useCallback((options: GroupOptions = {}) => {
    const groupId = groupObjects(options);
    if (!groupId) {
      toastStore.show("Group failed", "error");
      return;
    }
    toastStore.show("Group created", "success");
  }, []);

  const handleUngroup = useCallback((groupId: string, preserveWorldTransform = true) => {
    if (!ungroupObject(groupId, preserveWorldTransform)) {
      toastStore.show("Ungroup failed", "error");
      return;
    }
    toastStore.show("Group removed", "success");
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
    const result = purgeUnusedAssetsWithConfirm({
      assetIds: assets.map((asset) => asset.id),
      referencedAssetIds: referenced,
      confirm: (message) => window.confirm(message),
      removeAsset: (assetId) => assetStore.removeAsset(assetId),
      markDirty: () => sceneStore.markDirty(),
    });
    if (result.status === "cancelled") {
      toastStore.show("Purge cancelled", "info");
      return;
    }
    if (result.status === "purged") {
      toastStore.show(`Purged ${result.unusedCount} unused asset(s)`, "success");
    }
  }, []);

  const handleExport = useCallback(() => {
    downloadProjectJSON();
    toastStore.show("Project exported", "success");
  }, []);

  const handleOpenVideoExport = useCallback(() => {
    setVideoExportOpen(true);
    setVideoExportProgress(null);
    // Lazy-load encoder runtime only when export UI is opened.
    void import("../lib/export/videoExport.js");
  }, []);

  const handleStartVideoExport = useCallback(async () => {
    const canvas = document.querySelector(".viewport canvas") as HTMLCanvasElement | null;
    if (!canvas) {
      toastStore.show("Video export failed: viewport canvas is unavailable", "error");
      return;
    }

    const errors = validateVideoExportSettings(videoExportSettings);
    if (errors.length > 0) {
      toastStore.show(`Video export failed: ${errors[0]}`, "error");
      return;
    }

    const controller = new AbortController();
    videoExportAbortRef.current = controller;
    setVideoExportRunning(true);
    setVideoExportProgress("Preparing export...");

    try {
      const { exportVideoFromCanvas } = await import("../lib/export/videoExport.js");
      const result = await exportVideoFromCanvas(canvas, videoExportSettings, {
        signal: controller.signal,
        onProgress(progress) {
          setVideoExportProgress(progress.message);
        },
      });
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `motionforge-export-${Date.now()}.${result.extension}`;
      anchor.click();
      URL.revokeObjectURL(url);
      setVideoExportProgress(result.mode === "video" ? "Export complete" : "Fallback export complete");
      if (result.mode === "video") {
        toastStore.show(
          result.encoderSource === "local"
            ? "Video export complete (local encoder core)"
            : "Video export complete",
          "success",
        );
      } else {
        toastStore.show("Encoder failed; exported PNG sequence zip fallback", "info");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setVideoExportProgress("Export canceled");
        toastStore.show("Video export canceled", "info");
      } else {
        const reason = error instanceof Error ? error.message : "unknown export error";
        setVideoExportProgress("Export failed");
        toastStore.show(`Video export failed: ${reason}`, "error");
      }
    } finally {
      videoExportAbortRef.current = null;
      setVideoExportRunning(false);
    }
  }, [videoExportSettings]);

  const handleCancelVideoExport = useCallback(() => {
    videoExportAbortRef.current?.abort();
  }, []);

  const handleDownloadOfflinePack = useCallback(async () => {
    if (!isOfflinePackSupported()) {
      setOfflineCacheState((state) => nextOfflineCacheState(state, { type: "UNSUPPORTED" }));
      toastStore.show("Offline pack is not supported in this browser", "info");
      return;
    }

    try {
      setOfflineCacheState((state) => nextOfflineCacheState(state, {
        type: "DOWNLOAD_STARTED",
        total: 0,
      }));
      const cachedCount = await downloadOfflinePack({
        onStart(total) {
          setOfflineCacheState((state) => nextOfflineCacheState(state, {
            type: "DOWNLOAD_STARTED",
            total,
          }));
        },
        onProgress(progress) {
          setOfflineCacheState((state) => nextOfflineCacheState(state, {
            type: "DOWNLOAD_PROGRESS",
            completed: progress.completed,
            total: progress.total,
          }));
        },
      });
      setOfflineCacheState((state) => nextOfflineCacheState(state, { type: "DOWNLOAD_READY" }));
      toastStore.show(`Offline pack ready (${cachedCount} files cached)`, "success");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      setOfflineCacheState((state) => nextOfflineCacheState(state, {
        type: "DOWNLOAD_FAILED",
        reason,
      }));
      toastStore.show(`Offline pack failed: ${reason}`, "error");
    }
  }, []);

  const handleExportBundle = useCallback(() => {
    downloadProjectBundle();
    toastStore.show("Bundle exported", "success");
  }, []);

  const handleOpenDiagnostics = useCallback(() => {
    const data = serializeProject();
    const json = JSON.stringify(data);
    setDiagnosticsState(buildProjectDiagnosticsState(data, json.length));
    setRecentOpen(false);
    setSettingsOpen(false);
    setCommandPaletteOpen(false);
    setDiagnosticsOpen(true);
  }, []);

  const handleProjectFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    reviewOpenCandidate(text, file.name, file.size, null);
    // Reset so the same file can be imported again
    e.target.value = "";
  }, [reviewOpenCandidate]);

  const handleBundleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = parseProjectBundle(bytes);
      if (!parsed.data) {
        toastStore.show(parsed.error ?? "Bundle import failed", "error");
        return;
      }
      for (const warning of parsed.warnings) {
        toastStore.show(warning, "info");
      }
      const text = JSON.stringify(parsed.data);
      setPendingOpen({
        text,
        fileName: file.name,
        sizeBytes: file.size,
        nativeHandle: null,
        validation: { data: parsed.data, error: null },
      });
    } finally {
      e.target.value = "";
    }
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

  const handleRunSoakTest = useCallback(async () => {
    if (soakRunning) return;
    const controller = new AbortController();
    soakAbortRef.current = controller;
    setSoakRunning(true);
    setSoakStatus("Starting soak test...");

    try {
      const summary = await runSoakTest({
        durationMs: 5 * 60 * 1000,
        intervalMs: 1000,
        signal: controller.signal,
        onProgress(progress, stats, assetsCount) {
          setSoakStatus(
            `Iter ${progress.iterations} · keys ${progress.keyframeOps} · scrub ${progress.scrubOps} · bytes ${progress.bytesSerialized} · assets ${assetsCount} · draws ${stats.drawCalls} geo ${stats.geometries} tex ${stats.textures}`,
          );
        },
      });
      setSoakStatus(
        `Done: iterations=${summary.progress.iterations}, failures=${summary.progress.failures}, assets=${summary.assetsRemaining}, drawCalls=${summary.rendererStats.drawCalls}, geo=${summary.rendererStats.geometries}, tex=${summary.rendererStats.textures}`,
      );
      toastStore.show("Soak test completed", "success");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setSoakStatus("Soak test canceled");
        toastStore.show("Soak test canceled", "info");
      } else {
        setSoakStatus("Soak test failed");
        toastStore.show("Soak test failed", "error");
      }
    } finally {
      soakAbortRef.current = null;
      setSoakRunning(false);
    }
  }, [soakRunning]);

  const handleCancelSoakTest = useCallback(() => {
    soakAbortRef.current?.abort();
  }, []);

  const handleRunAgentPlan = useCallback(async () => {
    if (agentRunInProgress) return;
    setAgentRunInProgress(true);
    setAgentRunStatus("Running agent plan...");

    try {
      const parsed = JSON.parse(agentPlanText) as AgentConsolePlanInput;
      if (!parsed || !Array.isArray(parsed.actions)) {
        throw new Error("Plan must include an actions array.");
      }

      const planProjectJson = typeof parsed.projectJson === "string"
        ? parsed.projectJson
        : JSON.stringify(serializeProject());
      const result = await runAgentScript({
        projectJson: planProjectJson,
        actions: parsed.actions,
      });

      const report = JSON.stringify(result, null, 2);
      setAgentRunReport(report);
      if (result.error) {
        setAgentRunStatus(`Agent plan failed: ${result.error}`);
        toastStore.show(`Agent plan failed: ${result.error}`, "error");
      } else {
        setAgentRunStatus(`Agent plan complete (${result.reports.length} actions)`);
        toastStore.show("Agent plan complete", "success");
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Invalid plan JSON";
      setAgentRunStatus(`Agent plan failed: ${reason}`);
      toastStore.show(`Agent plan failed: ${reason}`, "error");
    } finally {
      setAgentRunInProgress(false);
    }
  }, [agentPlanText, agentRunInProgress]);

  const handleExportAgentReport = useCallback(() => {
    if (!agentRunReport) return;
    const blob = new Blob([agentRunReport], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `motionforge-agent-report-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [agentRunReport]);

  useEffect(() => {
    return commandBus.subscribe(() => {
      setCommandRevision((value) => value + 1);
    });
  }, []);

  useEffect(() => {
    const unregister = [
      commandBus.register({
        id: "scene.addPrimitive",
        title: "Add Primitive",
        category: "Scene",
        keywords: ["add", "primitive", "cube", "sphere", "cone"],
        run: (payload) => {
          const type = parsePrimitiveTypeFromPayload(payload);
          if (!type) return;
          handleAddPrimitive(type, parseAddPrimitivePayload(payload));
        },
      }),
      commandBus.register({
        id: "scene.addCube",
        title: "Add Cube",
        category: "Scene",
        keywords: ["add", "cube", "primitive", "box"],
        run: () => handleAddPrimitive("box"),
      }),
      commandBus.register({
        id: "scene.addSphere",
        title: "Add Sphere",
        category: "Scene",
        keywords: ["add", "sphere", "primitive"],
        run: () => handleAddPrimitive("sphere"),
      }),
      commandBus.register({
        id: "scene.addCone",
        title: "Add Cone",
        category: "Scene",
        keywords: ["add", "cone", "primitive"],
        run: () => handleAddPrimitive("cone"),
      }),
      commandBus.register({
        id: "scene.duplicateSelected",
        title: "Duplicate Selected Object",
        category: "Scene",
        keywords: ["duplicate", "clone", "object"],
        isEnabled: () => sceneStore.getSelectedObject() !== null,
        run: (payload) => handleDuplicateSelected(parseDuplicatePayload(payload)),
      }),
      commandBus.register({
        id: "scene.deleteSelected",
        title: "Delete Selected Object",
        category: "Scene",
        keywords: ["delete", "remove", "object"],
        isEnabled: () => sceneStore.getSelectedObject() !== null,
        run: (payload) => {
          if (!hasConfirmed(payload)) {
            throw new Error("MF_ERR_CONFIRM_REQUIRED: scene.deleteSelected requires confirm=true.");
          }
          const id = typeof (payload as { objectId?: unknown })?.objectId === "string"
            ? (payload as { objectId: string }).objectId
            : undefined;
          handleDeleteSelected(id);
        },
      }),
      commandBus.register({
        id: "scene.clearUserObjects",
        title: "Clear User Objects",
        category: "Scene",
        keywords: ["clear", "reset", "scene", "delete"],
        run: (payload) => {
          if (!hasConfirmed(payload)) {
            throw new Error("MF_ERR_CONFIRM_REQUIRED: scene.clearUserObjects requires confirm=true.");
          }
          handleClearUserObjects();
        },
      }),
      commandBus.register({
        id: "scene.parent",
        title: "Parent Object",
        category: "Scene",
        keywords: ["parent", "child", "hierarchy"],
        run: (payload) => {
          const data = payload as { childId?: unknown; parentId?: unknown };
          if (typeof data?.childId !== "string" || typeof data.parentId !== "string") return;
          handleParent(data.childId, data.parentId);
        },
      }),
      commandBus.register({
        id: "scene.unparent",
        title: "Unparent Object",
        category: "Scene",
        keywords: ["unparent", "detach", "hierarchy"],
        run: (payload) => {
          const data = payload as { childId?: unknown };
          if (typeof data?.childId !== "string") return;
          handleUnparent(data.childId);
        },
      }),
      commandBus.register({
        id: "scene.group",
        title: "Group Objects",
        category: "Scene",
        keywords: ["group", "hierarchy", "collection"],
        run: (payload) => handleGroup(parseGroupPayload(payload)),
      }),
      commandBus.register({
        id: "scene.ungroup",
        title: "Ungroup Objects",
        category: "Scene",
        keywords: ["ungroup", "hierarchy"],
        run: (payload) => {
          const data = payload as { groupId?: unknown; preserveWorldTransform?: unknown };
          if (typeof data?.groupId !== "string") return;
          handleUngroup(data.groupId, data.preserveWorldTransform !== false);
        },
      }),
      commandBus.register({
        id: "scene.addCamera",
        title: "Add Camera",
        category: "Scene",
        keywords: ["camera", "add", "scene"],
        run: (payload) => handleAddCamera(parseAddCameraPayload(payload)),
      }),
      commandBus.register({
        id: "scene.addLight",
        title: "Add Light",
        category: "Scene",
        keywords: ["light", "add", "scene", "directional", "point", "ambient"],
        run: (payload) => {
          const kind = parseLightKindFromPayload(payload) ?? "directional";
          handleAddLight(kind, parseAddLightPayload(payload));
        },
      }),
      commandBus.register({
        id: "scene.selectById",
        title: "Select By Id",
        category: "Scene",
        keywords: ["select", "id", "scene"],
        run: (payload) => {
          const id = typeof (payload as { id?: unknown })?.id === "string"
            ? (payload as { id: string }).id
            : null;
          if (!selectObjectById(id)) {
            throw new Error(`MF_ERR_NOT_FOUND: object id "${String(id)}" was not found.`);
          }
        },
      }),
      commandBus.register({
        id: "scene.selectByName",
        title: "Select By Name",
        category: "Scene",
        keywords: ["select", "name", "scene"],
        run: (payload) => {
          const name = typeof (payload as { name?: unknown })?.name === "string"
            ? (payload as { name: string }).name
            : "";
          const result = selectObjectByName(name);
          if (result.status === "not_found") {
            throw new Error(`MF_ERR_NOT_FOUND: object name "${name}" was not found.`);
          }
          if (result.status === "ambiguous") {
            throw new Error(`MF_ERR_AMBIGUOUS_NAME: ${result.candidates.join(", ")}`);
          }
        },
      }),
      commandBus.register({
        id: "project.new",
        title: "New Project",
        category: "Project",
        shortcutLabel: "N",
        keywords: ["new", "scene"],
        run: handleNew,
      }),
      commandBus.register({
        id: "project.save",
        title: "Save Project",
        category: "Project",
        shortcutLabel: "Ctrl+S",
        keywords: ["save", "persist"],
        run: () => { void handleSave(); },
      }),
      commandBus.register({
        id: "project.export",
        title: "Export Project JSON",
        category: "Project",
        keywords: ["export", "json", "download"],
        run: handleExport,
      }),
      commandBus.register({
        id: "project.exportVideo",
        title: "Export Video",
        category: "Project",
        keywords: ["export", "mp4", "gif", "video"],
        run: handleOpenVideoExport,
      }),
      commandBus.register({
        id: "project.import",
        title: "Import Project JSON",
        category: "Project",
        keywords: ["import", "json", "open"],
        run: handleImport,
      }),
      commandBus.register({
        id: "project.importBundle",
        title: "Import Bundle ZIP",
        category: "Project",
        keywords: ["import", "bundle", "zip"],
        run: handleImportBundle,
      }),
      commandBus.register({
        id: "project.insertDemoModel",
        title: "Insert Demo Model",
        category: "Project",
        keywords: ["demo", "model", "glb", "asset"],
        run: () => { void handleInsertDemoModel(); },
      }),
      commandBus.register({
        id: "project.open",
        title: "Open Project",
        category: "Project",
        keywords: ["open", "file"],
        run: () => { void handleOpenNative(); },
      }),
      commandBus.register({
        id: "project.diagnostics",
        title: "Project Diagnostics",
        category: "Project",
        keywords: ["diagnostics", "metadata", "project"],
        run: handleOpenDiagnostics,
      }),
    ];
    return () => unregister.forEach((dispose) => dispose());
  }, [
    handleAddCamera,
    handleAddLight,
    handleAddPrimitive,
    handleClearUserObjects,
    handleDeleteSelected,
    handleDuplicateSelected,
    handleExport,
    handleGroup,
    handleImport,
    handleImportBundle,
    handleInsertDemoModel,
    handleNew,
    handleOpenDiagnostics,
    handleOpenNative,
    handleOpenVideoExport,
    handleParent,
    handleSave,
    handleUngroup,
    handleUnparent,
  ]);

  const filteredCommandActions = useMemo(
    () => {
      void commandRevision;
      return commandBus.filter(commandQuery);
    },
    [commandQuery, commandRevision],
  );

  const videoExportErrors = useMemo(
    () => validateVideoExportSettings(videoExportSettings),
    [videoExportSettings],
  );
  const estimatedExportSeconds = useMemo(
    () => estimateVideoExportSeconds(videoExportSettings),
    [videoExportSettings],
  );

  const executeCommandAction = useCallback(async (commandId: string) => {
    const outcome = await commandBus.executeWithResult(commandId, { respectInputFocus: false });
    if (!outcome.executed && outcome.error) {
      toastStore.show(outcome.error, "error");
      return;
    }
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

  if (triggerCrash) {
    throw new Error("Manual crash trigger");
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-brand">MotionForge</span>
        {dirty && <span className="topbar-badge">Unsaved</span>}
      </div>
      <nav className="topbar-nav">
        <div className="topbar-nav-group topbar-nav-group--primary">
          <button
            className="topbar-btn topbar-btn--primary"
            onClick={() => commandBus.execute("project.new", { respectInputFocus: false })}
          >
            New
          </button>
          <button
            className="topbar-btn topbar-btn--primary"
            onClick={() => commandBus.execute("project.save", { respectInputFocus: false })}
          >
            Save
          </button>
          <button
            className="topbar-btn topbar-btn--primary"
            onClick={() => commandBus.execute("project.export", { respectInputFocus: false })}
          >
            Export
          </button>
          <button
            className="topbar-btn topbar-btn--primary"
            onClick={() => commandBus.execute("project.exportVideo", { respectInputFocus: false })}
          >
            Export Video
          </button>
        </div>

        <div className="topbar-nav-group">
          <button
            className="topbar-btn"
            onClick={() => commandBus.execute("project.open", { respectInputFocus: false })}
          >
            Open
          </button>
        </div>

        <div className="topbar-nav-group topbar-nav-group--secondary">
          <button
            className="topbar-btn"
            onClick={() => commandBus.execute("scene.addCube", { respectInputFocus: false })}
          >
            Add Cube
          </button>
          <button
            className="topbar-btn"
            onClick={() => commandBus.execute("scene.addSphere", { respectInputFocus: false })}
          >
            Add Sphere
          </button>
          <button
            className="topbar-btn"
            onClick={() => commandBus.execute("scene.addCone", { respectInputFocus: false })}
          >
            Add Cone
          </button>
          <button
            className="topbar-btn"
            onClick={() => commandBus.execute("scene.addLight", {
              respectInputFocus: false,
              payload: { kind: "directional" },
            })}
          >
            Add Light
          </button>
          <button
            className="topbar-btn"
            onClick={() => commandBus.execute("scene.addCamera", { respectInputFocus: false })}
          >
            Add Camera
          </button>
          <button
            className="topbar-btn"
            onClick={() => commandBus.execute("scene.duplicateSelected", { respectInputFocus: false })}
          >
            Duplicate
          </button>
          <button
            className="topbar-btn"
            onClick={() => commandBus.execute("scene.deleteSelected", {
              respectInputFocus: false,
              payload: { confirm: true },
            })}
          >
            Delete
          </button>
        </div>

        <div className="topbar-nav-group topbar-nav-group--secondary">
          <button
            className="topbar-btn"
            onClick={() => commandBus.execute("project.import", { respectInputFocus: false })}
          >
            Import
          </button>
          <button
            className="topbar-btn"
            onClick={() => commandBus.execute("project.importBundle", { respectInputFocus: false })}
          >
            Import Bundle
          </button>
          <button className="topbar-btn" onClick={handleImportModel}>
            Import Model
          </button>
          <button
            className="topbar-btn"
            onClick={() => commandBus.execute("project.insertDemoModel", { respectInputFocus: false })}
          >
            Insert Demo Model
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
          <button className="topbar-btn" onClick={handleOpenDiagnostics}>
            Diagnostics
          </button>
          <button className="topbar-btn" onClick={() => {
            setRecentOpen(false);
            setCommandPaletteOpen(false);
            setDiagnosticsOpen(false);
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
          <div className="topbar-settings-note">
            Native file handles do not persist across reload.
          </div>
          {!nativeSupported && (
            <div className="topbar-settings-note">
              Native file access is not supported in this browser. Falling back to upload/download.
            </div>
          )}
          <div className="topbar-settings-note">
            Export dependencies:{" "}
            <b>
              {offlineCacheState.status === "ready"
                ? "ready"
                : offlineCacheState.status === "not-supported"
                  ? "not supported"
                  : "downloading"}
            </b>
            {offlineCacheState.status === "downloading" && offlineCacheState.total > 0
              ? ` (${offlineCacheState.completed}/${offlineCacheState.total})`
              : ""}
          </div>
          <div className="topbar-settings-note">{offlineCacheState.message}</div>
          <button
            className="topbar-btn"
            disabled={
              offlineCacheState.status === "not-supported"
              || (
                offlineCacheState.status === "downloading"
                && offlineCacheState.total > 0
                && offlineCacheState.completed < offlineCacheState.total
              )
            }
            onClick={() => { void handleDownloadOfflinePack(); }}
          >
            Download Offline Pack
          </button>
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
          <div className="topbar-settings-note">
            Autosave snapshots do not clear the Unsaved badge.
          </div>
          <label className="topbar-settings-row">
            <input
              type="checkbox"
              checked={rendererStatsEnabled}
              onChange={(event) => setRendererStatsEnabled(event.target.checked)}
            />
            <span>Show renderer stats overlay (dev)</span>
          </label>
          <label className="topbar-settings-row">
            <input
              type="checkbox"
              checked={devToolsEnabled}
              onChange={(event) => setDevToolsEnabled(event.target.checked)}
            />
            <span>Enable Dev Tools</span>
          </label>
          {devToolsEnabled && (
            <div className="topbar-devtools">
              <button
                className="topbar-btn"
                disabled={soakRunning}
                onClick={() => {
                  void handleRunSoakTest();
                }}
              >
                Run Soak Test (5 min)
              </button>
              {soakRunning && (
                <button className="topbar-btn" onClick={handleCancelSoakTest}>
                  Cancel Soak
                </button>
              )}
              {soakStatus && <div className="topbar-settings-note">{soakStatus}</div>}
              <button className="topbar-btn" onClick={() => setTriggerCrash(true)}>
                Trigger Test Crash
              </button>

              <div className="topbar-devtools-divider" />
              <div className="topbar-settings-note">Agent Console (JSON plan runner)</div>
              <textarea
                className="topbar-agent-textarea"
                value={agentPlanText}
                onChange={(event) => setAgentPlanText(event.target.value)}
                rows={10}
                spellCheck={false}
              />
              <div className="topbar-devtools-actions">
                <button
                  className="topbar-btn"
                  disabled={agentRunInProgress}
                  onClick={() => {
                    void handleRunAgentPlan();
                  }}
                >
                  {agentRunInProgress ? "Running..." : "Run Agent Plan"}
                </button>
                <button className="topbar-btn" disabled={!agentRunReport} onClick={handleExportAgentReport}>
                  Export Agent Report
                </button>
              </div>
              {agentRunStatus && <div className="topbar-settings-note">{agentRunStatus}</div>}
              {agentRunReport && (
                <pre className="topbar-agent-report">{agentRunReport}</pre>
              )}
            </div>
          )}
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
                  void executeCommandAction(selected.id);
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
                  onClick={() => { void executeCommandAction(action.id); }}
                >
                  <span>{action.title}</span>
                  {action.shortcutLabel && <small>{action.shortcutLabel}</small>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {videoExportOpen && (
        <div className="modal-overlay">
          <div className="modal modal--video-export" role="dialog" aria-modal="true" aria-label="Export Video">
            <div className="modal-header">
              <h2>Export Video</h2>
              <button
                className="modal-close"
                onClick={() => {
                  if (videoExportRunning) return;
                  setVideoExportOpen(false);
                }}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <section className="modal-section modal-video-grid">
                <label>
                  Format
                  <select
                    value={videoExportSettings.format}
                    onChange={(event) => {
                      const format = event.target.value === "gif" ? "gif" : "mp4";
                      setVideoExportSettings((prev) => ({ ...prev, format }));
                    }}
                    disabled={videoExportRunning}
                  >
                    <option value="mp4">MP4</option>
                    <option value="gif">GIF</option>
                  </select>
                </label>
                <label>
                  Width
                  <input
                    type="number"
                    min={16}
                    step={1}
                    value={videoExportSettings.width}
                    onChange={(event) => {
                      setVideoExportSettings((prev) => ({ ...prev, width: Number(event.target.value) }));
                    }}
                    disabled={videoExportRunning}
                  />
                </label>
                <label>
                  Height
                  <input
                    type="number"
                    min={16}
                    step={1}
                    value={videoExportSettings.height}
                    onChange={(event) => {
                      setVideoExportSettings((prev) => ({ ...prev, height: Number(event.target.value) }));
                    }}
                    disabled={videoExportRunning}
                  />
                </label>
                <label>
                  FPS
                  <input
                    type="number"
                    min={1}
                    max={60}
                    step={1}
                    value={videoExportSettings.fps}
                    onChange={(event) => {
                      setVideoExportSettings((prev) => ({ ...prev, fps: Number(event.target.value) }));
                    }}
                    disabled={videoExportRunning}
                  />
                </label>
                <label>
                  Duration (s)
                  <input
                    type="number"
                    min={0.1}
                    max={120}
                    step={0.1}
                    value={videoExportSettings.durationSeconds}
                    onChange={(event) => {
                      setVideoExportSettings((prev) => ({ ...prev, durationSeconds: Number(event.target.value) }));
                    }}
                    disabled={videoExportRunning}
                  />
                </label>
                <label className="modal-video-checkbox">
                  <input
                    type="checkbox"
                    checked={videoExportSettings.transparentBackground}
                    onChange={(event) => {
                      setVideoExportSettings((prev) => ({ ...prev, transparentBackground: event.target.checked }));
                    }}
                    disabled={videoExportRunning}
                  />
                  <span>Transparent background (PNG/GIF only)</span>
                </label>
              </section>
              {videoExportErrors.length > 0 && (
                <div className="topbar-settings-note">{videoExportErrors[0]}</div>
              )}
              {videoExportErrors.length === 0 && !videoExportRunning && (
                <div className="topbar-settings-note">
                  Estimated export time: ~{estimatedExportSeconds.toFixed(1)}s
                </div>
              )}
              {videoExportProgress && (
                <div className="topbar-settings-note">{videoExportProgress}</div>
              )}
              <section className="onboarding-actions">
                <button
                  className="topbar-btn"
                  disabled={videoExportRunning}
                  onClick={() => setVideoExportOpen(false)}
                >
                  Close
                </button>
                {!videoExportRunning ? (
                  <button
                    className="topbar-btn topbar-btn--primary"
                    disabled={videoExportErrors.length > 0}
                    onClick={() => {
                      void handleStartVideoExport();
                    }}
                  >
                    Start Export
                  </button>
                ) : (
                  <button className="topbar-btn topbar-btn--primary" onClick={handleCancelVideoExport}>
                    Cancel Export
                  </button>
                )}
              </section>
            </div>
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
                <div><b>Supported versions:</b> 1, 2, 3, 4</div>
              </section>
              <section className="modal-section">
                <h3>Validation Summary</h3>
                {pendingOpen.validation.data ? (
                  (() => {
                    const diagnostics = buildProjectDiagnosticsState(
                      pendingOpen.validation.data,
                      pendingOpen.sizeBytes,
                    );
                    return (
                      <>
                        <ul>
                          <li><b>Version:</b> {diagnostics.version}</li>
                          <li><b>Objects:</b> {diagnostics.objects}</li>
                          <li><b>Primitive objects:</b> {diagnostics.primitiveObjects}</li>
                          <li><b>Model instances:</b> {diagnostics.modelInstances}</li>
                          <li><b>Assets:</b> {diagnostics.assets}</li>
                          <li><b>External assets:</b> {diagnostics.externalAssets}</li>
                          <li><b>Tracks:</b> {diagnostics.tracks}</li>
                          <li><b>Animation duration:</b> {diagnostics.durationSeconds}s</li>
                          <li><b>Estimated payload:</b> {Math.round(diagnostics.payloadSizeBytes / 1024)} KB</li>
                        </ul>
                        {diagnostics.externalAssets > 0 && (
                          <div className="topbar-settings-note">
                            Warning: external assets are references and may not be reconstructable on this machine.
                          </div>
                        )}
                      </>
                    );
                  })()
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
      {diagnosticsOpen && diagnosticsState && (
        <div className="modal-overlay">
          <div className="modal modal--open-review" role="dialog" aria-modal="true" aria-label="Project Diagnostics">
            <div className="modal-header">
              <h2>Project Diagnostics</h2>
              <button className="modal-close" onClick={() => setDiagnosticsOpen(false)} aria-label="Close">
                &times;
              </button>
            </div>
            <div className="modal-body">
              <section className="modal-section">
                <ul>
                  <li><b>Version:</b> {diagnosticsState.version}</li>
                  <li><b>Objects:</b> {diagnosticsState.objects}</li>
                  <li><b>Primitive objects:</b> {diagnosticsState.primitiveObjects}</li>
                  <li><b>Model instances:</b> {diagnosticsState.modelInstances}</li>
                  <li><b>Assets:</b> {diagnosticsState.assets}</li>
                  <li><b>External assets:</b> {diagnosticsState.externalAssets}</li>
                  <li><b>Tracks:</b> {diagnosticsState.tracks}</li>
                  <li><b>Animation duration:</b> {diagnosticsState.durationSeconds}s</li>
                  <li><b>Payload size:</b> {Math.round(diagnosticsState.payloadSizeBytes / 1024)} KB</li>
                </ul>
                {diagnosticsState.externalAssets > 0 && (
                  <div className="topbar-settings-note">
                    Warning: this project references external assets that are not reconstructable from JSON alone.
                  </div>
                )}
              </section>
              <section className="onboarding-actions">
                <button className="topbar-btn topbar-btn--primary" onClick={() => setDiagnosticsOpen(false)}>
                  Close
                </button>
              </section>
            </div>
          </div>
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
      <input
        ref={bundleFileInputRef}
        type="file"
        accept=".zip,application/zip"
        style={{ display: "none" }}
        onChange={handleBundleFileChange}
      />
    </header>
  );
}
