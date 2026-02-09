import { useState, useCallback, useEffect } from "react";
import { Panel } from "@motionforge/ui";
import { Viewport, onGizmoModeChange } from "./components/Viewport.js";
import { InspectorContent } from "./components/InspectorContent.js";
import { HierarchyContent } from "./components/HierarchyContent.js";
import { TopBar } from "./components/TopBar.js";
import { Timeline } from "./components/Timeline.js";
import { WalkthroughModal } from "./components/WalkthroughModal.js";
import { ToastHost } from "./components/ToastHost.js";
import type { GizmoMode } from "./lib/three/gizmo/Gizmo.js";

export function App() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("translate");
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  useEffect(() => {
    onGizmoModeChange((mode) => setGizmoMode(mode));
    return () => onGizmoModeChange(null);
  }, []);

  return (
    <div className="app-shell">
      <TopBar onHelp={() => setHelpOpen(true)} />

      <div className="app-layout">
        <div className="sidebar-left">
          <Panel title="Hierarchy">
            <HierarchyContent />
          </Panel>
        </div>

        <div className="viewport">
          <div className="mode-indicator">{gizmoMode.charAt(0).toUpperCase() + gizmoMode.slice(1)}</div>
          <Viewport />
        </div>

        <div className="sidebar-right">
          <Panel title="Inspector">
            <InspectorContent />
          </Panel>
        </div>

        <div className="timeline">
          <Panel title="Timeline">
            <Timeline />
          </Panel>
        </div>
      </div>

      <WalkthroughModal open={helpOpen} onClose={closeHelp} />
      <ToastHost />
    </div>
  );
}
