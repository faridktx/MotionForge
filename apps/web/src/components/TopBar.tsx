import { useRef, useCallback } from "react";
import { useDirtyState } from "../state/useScene.js";
import {
  saveProject,
  loadFromLocalStorage,
  parseProjectJSONResult,
  downloadProjectJSON,
} from "../lib/project/serialize.js";
import { deserializeProject, newProject } from "../lib/project/deserialize.js";
import { toastStore } from "../state/toastStore.js";

interface TopBarProps {
  onHelp: () => void;
}

export function TopBar({ onHelp }: TopBarProps) {
  const dirty = useDirtyState();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = useCallback(() => {
    const ok = saveProject();
    if (ok) {
      toastStore.show("Project saved", "success");
    } else {
      toastStore.show("Failed to save project", "error");
    }
  }, []);

  const handleLoad = useCallback(() => {
    const data = loadFromLocalStorage();
    if (data) {
      deserializeProject(data);
      toastStore.show("Project loaded", "success");
    } else {
      toastStore.show("No saved project found", "error");
    }
  }, []);

  const handleNew = useCallback(() => {
    newProject();
    toastStore.show("New project created", "info");
  }, []);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleExport = useCallback(() => {
    downloadProjectJSON();
    toastStore.show("Project exported", "success");
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parsed = parseProjectJSONResult(text);
      const data = parsed.data;
      if (data) {
        deserializeProject(data);
        toastStore.show("Project imported", "success");
      } else {
        toastStore.show(parsed.error ? `Import failed: ${parsed.error}` : "Import failed", "error");
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be imported again
    e.target.value = "";
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
        <button className="topbar-btn topbar-btn--primary" onClick={handleExport}>
          Export
        </button>
        <button className="topbar-btn" onClick={onHelp}>
          Help
        </button>
      </nav>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
    </header>
  );
}
