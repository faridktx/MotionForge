import { useEffect, useRef } from "react";

interface WalkthroughModalProps {
  open: boolean;
  onClose: () => void;
  onResetDemo?: () => void;
  onOpenGallery?: () => void;
}

export function WalkthroughModal({ open, onClose, onResetDemo, onOpenGallery }: WalkthroughModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="Help">
        <div className="modal-header">
          <h2>Getting Started</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <section className="modal-section">
            <h3>Navigation</h3>
            <ul>
              <li><b>Orbit:</b> Left mouse drag</li>
              <li><b>Pan:</b> Right mouse drag</li>
              <li><b>Zoom:</b> Scroll wheel</li>
            </ul>
          </section>

          <section className="modal-section">
            <h3>Selection</h3>
            <ul>
              <li><b>Select:</b> Left click on an object</li>
              <li><b>Deselect:</b> Click empty space or press Esc</li>
            </ul>
          </section>

          <section className="modal-section">
            <h3>Transform</h3>
            <table className="shortcut-table">
              <tbody>
                <tr><td><kbd>W</kbd></td><td>Translate mode</td></tr>
                <tr><td><kbd>E</kbd></td><td>Rotate mode</td></tr>
                <tr><td><kbd>R</kbd></td><td>Scale mode</td></tr>
                <tr><td><kbd>Esc</kbd></td><td>Cancel active gizmo drag, otherwise clear selection</td></tr>
              </tbody>
            </table>
          </section>

          <section className="modal-section">
            <h3>Animation</h3>
            <table className="shortcut-table">
              <tbody>
                <tr><td><kbd>K</kbd></td><td>Insert transform keyframes (position/rotation/scale) for selected object</td></tr>
                <tr><td><kbd>Space</kbd></td><td>Play / pause animation</td></tr>
                <tr><td><kbd>Delete</kbd></td><td>Delete selected timeline keyframes</td></tr>
              </tbody>
            </table>
          </section>

          <section className="modal-section">
            <h3>General</h3>
            <table className="shortcut-table">
              <tbody>
                <tr><td><kbd>F</kbd></td><td>Frame selected object (or origin)</td></tr>
                <tr><td><kbd>Shift+F</kbd></td><td>Frame all objects</td></tr>
                <tr><td><kbd>G</kbd></td><td>Toggle grid and axes</td></tr>
                <tr><td><kbd>Ctrl+Z</kbd></td><td>Undo</td></tr>
                <tr><td><kbd>Ctrl+Y</kbd></td><td>Redo</td></tr>
                <tr><td><kbd>Ctrl+Wheel</kbd></td><td>Zoom timeline scale (while hovering timeline)</td></tr>
              </tbody>
            </table>
          </section>

          <section className="modal-section">
            <h3>Troubleshooting</h3>
            <ul>
              <li><b>Selection does not work:</b> click the object body (not gizmo), or select from Hierarchy.</li>
              <li><b>Keyframes not visible:</b> ensure an object is selected and timeline zoom is not too wide.</li>
              <li><b>Playback does nothing:</b> add at least two keys with different values/times, then press Space.</li>
            </ul>
          </section>

          {onResetDemo && (
            <section className="modal-section">
              <h3>Demo</h3>
              <div className="onboarding-actions">
                <button className="topbar-btn topbar-btn--primary" onClick={onResetDemo}>
                  Reset Demo
                </button>
                {onOpenGallery && (
                  <button className="topbar-btn" onClick={onOpenGallery}>
                    Open Gallery
                  </button>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
