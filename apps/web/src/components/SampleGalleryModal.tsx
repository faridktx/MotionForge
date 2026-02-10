import { useCallback, useEffect, useRef, useState } from "react";
import { loadSampleProject, SAMPLE_PROJECTS } from "../lib/project/sampleProjects.js";
import { toastStore } from "../state/toastStore.js";

interface SampleGalleryModalProps {
  open: boolean;
  onClose: () => void;
}

export function SampleGalleryModal({ open, onClose }: SampleGalleryModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleLoad = useCallback(async (sampleId: string) => {
    const sample = SAMPLE_PROJECTS.find((item) => item.id === sampleId);
    if (!sample) return;
    setLoadingId(sample.id);
    try {
      await loadSampleProject(sample);
      toastStore.show(`${sample.title} loaded`, "success");
      onClose();
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      toastStore.show(`Failed to load sample: ${reason}`, "error");
    } finally {
      setLoadingId(null);
    }
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !loadingId) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loadingId, onClose, open]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(event) => {
        if (event.target === overlayRef.current && !loadingId) {
          onClose();
        }
      }}
    >
      <div className="modal modal--gallery" role="dialog" aria-modal="true" aria-label="Sample Gallery">
        <div className="modal-header">
          <h2>Sample Gallery</h2>
          <button className="modal-close" onClick={onClose} disabled={!!loadingId} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <section className="modal-section">
            <p>Load a deterministic sample project and start editing immediately.</p>
          </section>
          <section className="modal-section gallery-grid">
            {SAMPLE_PROJECTS.map((sample) => (
              <article className="gallery-card" key={sample.id}>
                <h3>{sample.title}</h3>
                <p>{sample.description}</p>
                <button
                  className="topbar-btn topbar-btn--primary"
                  disabled={!!loadingId}
                  onClick={() => {
                    void handleLoad(sample.id);
                  }}
                >
                  {loadingId === sample.id ? "Loading..." : "Load Sample"}
                </button>
              </article>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
