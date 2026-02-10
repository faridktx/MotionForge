import { Component, type ReactNode } from "react";
import { DEMO_PROJECT } from "../lib/project/demoProject.js";
import { deserializeProject } from "../lib/project/deserialize.js";
import { loadAutosaveSnapshot } from "../lib/project/serialize.js";
import { toastStore } from "../state/toastStore.js";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

function downloadJsonFile(name: string, json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || "Unknown application error",
    };
  }

  componentDidCatch(error: Error) {
    console.error("App error boundary caught:", error);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleExportAutosave = async () => {
    const snapshot = await loadAutosaveSnapshot();
    if (!snapshot.data) {
      toastStore.show(snapshot.error ?? "No autosave available", "error");
      return;
    }
    downloadJsonFile("motionforge-autosave-recovery.json", JSON.stringify(snapshot.data, null, 2));
    toastStore.show("Autosave exported", "success");
  };

  private handleResetToDemo = async () => {
    try {
      await deserializeProject(DEMO_PROJECT);
      this.setState({ hasError: false, message: "" });
      toastStore.show("Recovered with demo project", "success");
    } catch {
      toastStore.show("Failed to reset to demo project", "error");
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="app-shell">
        <div className="app-layout" style={{ display: "grid", placeItems: "center" }}>
          <div className="modal" role="alertdialog" aria-label="Recovery">
            <div className="modal-header">
              <h2>MotionForge Recovery</h2>
            </div>
            <div className="modal-body">
              <p>The editor encountered an unexpected error and switched to recovery mode.</p>
              <p><b>Error:</b> {this.state.message}</p>
              <section className="onboarding-actions">
                <button className="topbar-btn topbar-btn--primary" onClick={this.handleReload}>Reload App</button>
                <button className="topbar-btn" onClick={() => { void this.handleExportAutosave(); }}>
                  Export Autosave Snapshot
                </button>
                <button className="topbar-btn" onClick={() => { void this.handleResetToDemo(); }}>
                  Reset To Demo Project
                </button>
              </section>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
