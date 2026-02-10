import { useEffect, useRef } from "react";

interface OnboardingModalProps {
  open: boolean;
  onStartDemo: () => void;
  onWatchControls: () => void;
  onOpenProject: () => void;
}

export function OnboardingModal({
  open,
  onStartDemo,
  onWatchControls,
  onOpenProject,
}: OnboardingModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onWatchControls();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onWatchControls]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(event) => {
        if (event.target === overlayRef.current) {
          onWatchControls();
        }
      }}
    >
      <div className="modal modal--onboarding" role="dialog" aria-modal="true" aria-label="First run onboarding">
        <div className="modal-header">
          <h2>Welcome to MotionForge</h2>
        </div>
        <div className="modal-body">
          <section className="modal-section">
            <p>
              Start quickly with a deterministic demo project, open one of your own files, or review controls before
              editing.
            </p>
          </section>

          <section className="modal-section onboarding-actions">
            <button className="topbar-btn topbar-btn--primary" onClick={onStartDemo}>
              Start Demo Project
            </button>
            <button className="topbar-btn" onClick={onWatchControls}>
              Watch Controls
            </button>
            <button className="topbar-btn" onClick={onOpenProject}>
              Open Project
            </button>
          </section>

          <section className="modal-section">
            <h3>Demo In 60 Seconds</h3>
            <ol className="onboarding-list">
              <li>Select Demo Cube in hierarchy.</li>
              <li>Press Space to preview animation.</li>
              <li>Scrub timeline and drag a keyframe marker.</li>
              <li>Press Ctrl+Z then Ctrl+Y.</li>
              <li>Click Export to download project JSON.</li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

