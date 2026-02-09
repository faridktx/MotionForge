import { useCallback, useState } from "react";
import { useSelectedTransform } from "../state/useScene.js";
import { sceneStore } from "../state/sceneStore.js";
import { animationStore } from "../state/animationStore.js";
import { computeBoundingSphere, frameSphere } from "../lib/three/cameraFraming.js";

const DEG_TO_RAD = Math.PI / 180;
const MIN_SCALE = 0.001;

export function InspectorContent() {
  const snap = useSelectedTransform();

  const applyTransform = useCallback(
    (field: string, axis: "x" | "y" | "z", raw: string) => {
      const id = sceneStore.getSelectedId();
      if (!id) return;
      const obj = sceneStore.getObjectById(id);
      if (!obj) return;

      const val = parseFloat(raw);
      if (isNaN(val)) return;

      if (field === "position") {
        obj.position[axis] = val;
      } else if (field === "rotation") {
        obj.rotation[axis] = val * DEG_TO_RAD;
      } else if (field === "scale") {
        obj.scale[axis] = Math.max(val, MIN_SCALE);
      }

      sceneStore.notifyTransformChanged();
    },
    [],
  );

  const resetTransform = useCallback(() => {
    const id = sceneStore.getSelectedId();
    if (!id) return;
    const obj = sceneStore.getObjectById(id);
    if (!obj) return;
    obj.position.set(0, 0, 0);
    obj.rotation.set(0, 0, 0);
    obj.scale.set(1, 1, 1);
    sceneStore.notifyTransformChanged();
  }, []);

  const frameSelected = useCallback(() => {
    const obj = sceneStore.getSelectedObject();
    const cam = sceneStore.getCamera();
    const target = sceneStore.getControlsTarget();
    if (!obj || !cam || !target) return;
    const bs = computeBoundingSphere([obj]);
    if (!bs) return;
    const framing = frameSphere(bs, cam);
    cam.position.copy(framing.position);
    target.copy(framing.target);
  }, []);

  const keyProperty = useCallback((property: "position" | "rotation" | "scale") => {
    animationStore.addKeyframesForSelected(property);
  }, []);

  if (!snap) {
    return <p className="inspector-empty">No object selected</p>;
  }

  const selId = sceneStore.getSelectedId() ?? "";

  return (
    <div className="inspector-content">
      <div className="inspector-row">
        <span className="inspector-label">Name</span>
        <span className="inspector-value">{snap.name}</span>
      </div>

      <div className="inspector-divider" />

      <CollapsibleSection title="Position" onKey={() => keyProperty("position")}>
        <Vec3Input
          keyPrefix={`${selId}-pos-${snap.position.x}-${snap.position.y}-${snap.position.z}`}
          value={snap.position}
          step={0.1}
          onChange={(axis, val) => applyTransform("position", axis, val)}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Rotation" onKey={() => keyProperty("rotation")}>
        <Vec3Input
          keyPrefix={`${selId}-rot-${snap.rotation.x}-${snap.rotation.y}-${snap.rotation.z}`}
          value={snap.rotation}
          step={1}
          onChange={(axis, val) => applyTransform("rotation", axis, val)}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Scale" onKey={() => keyProperty("scale")}>
        <Vec3Input
          keyPrefix={`${selId}-scl-${snap.scale.x}-${snap.scale.y}-${snap.scale.z}`}
          value={snap.scale}
          step={0.1}
          onChange={(axis, val) => applyTransform("scale", axis, val)}
        />
      </CollapsibleSection>

      <div className="inspector-divider" />

      <div className="inspector-actions">
        <button className="inspector-btn" onClick={resetTransform}>
          Reset Transform
        </button>
        <button className="inspector-btn" onClick={frameSelected}>
          Focus
        </button>
      </div>
    </div>
  );
}

interface CollapsibleSectionProps {
  title: string;
  onKey: () => void;
  children: React.ReactNode;
}

function CollapsibleSection({ title, onKey, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="inspector-section">
      <div className="inspector-section-header">
        <button
          className="inspector-section-toggle"
          onClick={() => setOpen(!open)}
        >
          <span className="inspector-section-arrow">{open ? "\u25BC" : "\u25B6"}</span>
          <span className="inspector-section-title">{title}</span>
        </button>
        <button
          className="inspector-key-btn"
          onClick={onKey}
          title={`Add ${title.toLowerCase()} keyframe at current time`}
        >
          Key
        </button>
      </div>
      {open && <div className="inspector-section-body">{children}</div>}
    </div>
  );
}

interface Vec3InputProps {
  keyPrefix: string;
  value: { x: number; y: number; z: number };
  step: number;
  onChange: (axis: "x" | "y" | "z", value: string) => void;
}

function Vec3Input({ keyPrefix, value, step, onChange }: Vec3InputProps) {
  return (
    <div className="inspector-vec3-fields">
      {(["x", "y", "z"] as const).map((axis) => (
        <label key={axis} className="inspector-field">
          <span className={`inspector-axis inspector-axis--${axis}`}>
            {axis.toUpperCase()}
          </span>
          <input
            key={`${keyPrefix}-${axis}`}
            type="number"
            className="inspector-input"
            defaultValue={value[axis]}
            step={step}
            onBlur={(e) => onChange(axis, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onChange(axis, (e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        </label>
      ))}
    </div>
  );
}
