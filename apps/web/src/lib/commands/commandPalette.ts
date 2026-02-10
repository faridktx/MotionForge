export type CommandPaletteActionId =
  | "new"
  | "save"
  | "export"
  | "import"
  | "play-pause"
  | "frame-selected"
  | "toggle-grid";

export interface CommandPaletteAction {
  id: CommandPaletteActionId;
  label: string;
  keywords: string[];
  run: () => void;
}

export interface CommandPaletteDependencies {
  onNewProject: () => void;
  onSaveProject: () => void;
  onExportProject: () => void;
  onImportProject: () => void;
  onTogglePlayback: () => void;
  onFrameSelected: () => void;
  onToggleGrid: () => void;
}

export function createCommandPaletteActions(deps: CommandPaletteDependencies): CommandPaletteAction[] {
  return [
    { id: "new", label: "New Project", keywords: ["file", "new"], run: deps.onNewProject },
    { id: "save", label: "Save Project", keywords: ["file", "save"], run: deps.onSaveProject },
    { id: "export", label: "Export Project JSON", keywords: ["file", "download", "json"], run: deps.onExportProject },
    { id: "import", label: "Import Project JSON", keywords: ["file", "open", "upload"], run: deps.onImportProject },
    { id: "play-pause", label: "Play/Pause Timeline", keywords: ["playback", "space"], run: deps.onTogglePlayback },
    { id: "frame-selected", label: "Frame Selected", keywords: ["camera", "focus", "f"], run: deps.onFrameSelected },
    { id: "toggle-grid", label: "Toggle Grid", keywords: ["viewport", "grid", "g"], run: deps.onToggleGrid },
  ];
}

export function filterCommandPaletteActions(actions: CommandPaletteAction[], query: string): CommandPaletteAction[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return actions;
  return actions.filter((action) => {
    if (action.label.toLowerCase().includes(normalized)) return true;
    return action.keywords.some((keyword) => keyword.toLowerCase().includes(normalized));
  });
}
