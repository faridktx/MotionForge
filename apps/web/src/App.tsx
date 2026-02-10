import { useState, useCallback } from "react";
import { Panel } from "@motionforge/ui";
import { Viewport } from "./components/Viewport.js";
import { InspectorContent } from "./components/InspectorContent.js";
import { HierarchyContent } from "./components/HierarchyContent.js";
import { TopBar } from "./components/TopBar.js";
import { Timeline } from "./components/Timeline.js";
import { WalkthroughModal } from "./components/WalkthroughModal.js";
import { OnboardingModal } from "./components/OnboardingModal.js";
import { ToastHost } from "./components/ToastHost.js";
import type { GizmoMode } from "./lib/three/gizmo/Gizmo.js";
import { DEMO_PROJECT, hasSeenOnboarding, markOnboardingSeen } from "./lib/project/demoProject.js";
import { deserializeProject } from "./lib/project/deserialize.js";
import { toastStore } from "./state/toastStore.js";
import { fileDialogStore } from "./state/fileDialogStore.js";

function buildInfoLabel(): string {
  const date = new Date(__BUILD_DATE__);
  const dateLabel = Number.isNaN(date.getTime()) ? __BUILD_DATE__ : date.toLocaleString();
  return `${__APP_VERSION__} · ${dateLabel}`;
}

export function App() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(() => !hasSeenOnboarding());
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("translate");
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const modeLabel = gizmoMode === "translate" ? "Translate (W)" : gizmoMode === "rotate" ? "Rotate (E)" : "Scale (R)";

  const markSeen = useCallback(() => {
    markOnboardingSeen();
    setOnboardingOpen(false);
  }, []);

  const loadDemo = useCallback(async () => {
    try {
      await deserializeProject(DEMO_PROJECT);
      toastStore.show("Demo project loaded", "success");
      markSeen();
    } catch {
      toastStore.show("Failed to load demo project", "error");
    }
  }, [markSeen]);

  const openProjectPicker = useCallback(() => {
    const opened = fileDialogStore.openProjectImportDialog();
    if (!opened) {
      toastStore.show("Project import dialog is unavailable", "error");
    }
    markSeen();
  }, [markSeen]);

  const openHelpFromOnboarding = useCallback(() => {
    markSeen();
    setHelpOpen(true);
  }, [markSeen]);

  const resetDemoFromHelp = useCallback(async () => {
    await loadDemo();
    setHelpOpen(false);
  }, [loadDemo]);

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
          <div className="mode-indicator">{modeLabel}</div>
          <Viewport onModeChange={setGizmoMode} />
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

      <WalkthroughModal open={helpOpen} onClose={closeHelp} onResetDemo={resetDemoFromHelp} />
      <OnboardingModal
        open={onboardingOpen}
        onStartDemo={loadDemo}
        onWatchControls={openHelpFromOnboarding}
        onOpenProject={openProjectPicker}
      />
      <footer className="app-footer">Build {buildInfoLabel()}</footer>
      <ToastHost />
    </div>
  );
}
