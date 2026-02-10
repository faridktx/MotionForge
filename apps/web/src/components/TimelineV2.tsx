import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { Interpolation, TrackProperty } from "@motionforge/engine";
import { animationStore, type KeyframeRecord } from "../state/animationStore.js";
import {
  keyframeSelectionStore,
  type SelectedKeyframe,
} from "../state/keyframeSelectionStore.js";
import { timelineStore } from "../state/timelineStore.js";
import { sceneStore } from "../state/sceneStore.js";
import { useSceneObjects } from "../state/useScene.js";
import { TrackList } from "./TrackList.js";
import { TrackLane, type TrackLaneMarker } from "./TrackLane.js";
import { buildTimelineLayoutRows } from "./timelineLayout.js";

const EPSILON = 1e-6;

interface DragState {
  startClientX: number;
  refs: SelectedKeyframe[];
  minTime: number;
  maxTime: number;
}

interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function roundTime(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function sameTime(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

function keyToken(key: SelectedKeyframe): string {
  return `${key.objectId}|${key.propertyPath}|${roundTime(key.time).toFixed(6)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function axisFromProperty(propertyPath: TrackProperty): "x" | "y" | "z" {
  const axis = propertyPath.split(".")[1] as "x" | "y" | "z";
  return axis;
}

function isInputActiveElement(target: Element | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function formatTime(seconds: number): string {
  return seconds.toFixed(2);
}

function buildRulerTicks(duration: number, pixelsPerSecond: number): number[] {
  let step = 1;
  if (pixelsPerSecond >= 220) step = 0.25;
  else if (pixelsPerSecond >= 140) step = 0.5;
  else if (pixelsPerSecond <= 70) step = 2;

  const ticks: number[] = [];
  for (let time = 0; time <= duration + EPSILON; time += step) {
    ticks.push(roundTime(time));
  }
  return ticks;
}

function usePlaybackState() {
  const [state, setState] = useState(() => ({
    playing: animationStore.isPlaying(),
    currentTime: animationStore.getCurrentTime(),
    duration: animationStore.getDuration(),
  }));

  useEffect(() => {
    const updateTime = () => {
      setState((prev) => ({ ...prev, currentTime: animationStore.getCurrentTime() }));
    };
    const updatePlayback = () => {
      setState({
        playing: animationStore.isPlaying(),
        currentTime: animationStore.getCurrentTime(),
        duration: animationStore.getDuration(),
      });
    };

    const unsubTime = animationStore.subscribe("time", updateTime);
    const unsubPlayback = animationStore.subscribe("playback", updatePlayback);
    return () => {
      unsubTime();
      unsubPlayback();
    };
  }, []);

  return state;
}

function useKeyframeRevision(): number {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    return animationStore.subscribe("keyframes", () => {
      setRevision((value) => value + 1);
    });
  }, []);

  return revision;
}

function useTimelinePixelsPerSecond(): number {
  const [value, setValue] = useState(() => timelineStore.getPixelsPerSecond());

  useEffect(() => {
    return timelineStore.subscribe(() => {
      setValue(timelineStore.getPixelsPerSecond());
    });
  }, []);

  return value;
}

function useSelectedKeyframes(): SelectedKeyframe[] {
  const [selected, setSelected] = useState(() => keyframeSelectionStore.getSelected());

  useEffect(() => {
    return keyframeSelectionStore.subscribe(() => {
      setSelected(keyframeSelectionStore.getSelected());
    });
  }, []);

  return selected;
}

export function TimelineV2() {
  const { selectedId, nodes } = useSceneObjects();

  const { playing, currentTime, duration } = usePlaybackState();
  const keyframeRevision = useKeyframeRevision();
  const pixelsPerSecond = useTimelinePixelsPerSecond();
  const snapSeconds = timelineStore.getSnapSeconds();
  const selectedKeyframes = useSelectedKeyframes();

  const selectedTokenSet = useMemo(
    () => new Set(selectedKeyframes.map((key) => keyToken(key))),
    [selectedKeyframes],
  );

  const [previewDeltaSeconds, setPreviewDeltaSeconds] = useState(0);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);

  const dragStateRef = useRef<DragState | null>(null);
  const previewDeltaRef = useRef(0);
  const clipboardRef = useRef<KeyframeRecord[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    keyframeSelectionStore.clear();
  }, [selectedId]);

  const timelineRows = useMemo(() => {
    void keyframeRevision;
    const clip = animationStore.getClip();
    const animatedObjectIds = new Set(clip.tracks.map((track) => track.objectId));

    if (selectedId) {
      animatedObjectIds.add(selectedId);
    }

    const orderedObjectIds = nodes
      .map((node) => node.id)
      .filter((id) => animatedObjectIds.has(id));
    const objects = orderedObjectIds.map((id) => ({
      id,
      name: nodes.find((node) => node.id === id)?.name || id,
    }));

    return buildTimelineLayoutRows({
      objects,
      selectedId,
      isObjectHidden: (objectId) => timelineStore.isObjectHidden(objectId),
      isObjectCollapsed: (objectId, selectedObjectId) =>
        timelineStore.isObjectCollapsed(objectId, selectedObjectId),
    });
  }, [keyframeRevision, nodes, selectedId]);

  const rowMarkers = useMemo(() => {
    void keyframeRevision;
    const markersByRow = new Map<string, TrackLaneMarker[]>();
    for (const row of timelineRows) {
      if (row.type !== "lane" || row.hidden) {
        markersByRow.set(row.id, []);
        continue;
      }

      const keyframes = animationStore.getKeyframesForObject(row.objectId, row.properties);
      markersByRow.set(
        row.id,
        keyframes.map((keyframe) => ({
          objectId: keyframe.objectId,
          propertyPath: keyframe.propertyPath,
          time: keyframe.time,
          axis: axisFromProperty(keyframe.propertyPath),
        })),
      );
    }

    return markersByRow;
  }, [keyframeRevision, timelineRows]);

  const selectedSingleKey: KeyframeRecord | null = useMemo(() => {
    void keyframeRevision;
    if (selectedKeyframes.length !== 1) {
      return null;
    }
    return animationStore.getKeyframe(selectedKeyframes[0]);
  }, [selectedKeyframes, keyframeRevision]);

  const timelineWidthPx = Math.max(1, duration * pixelsPerSecond);
  const rulerTicks = useMemo(
    () => buildRulerTicks(duration, pixelsPerSecond),
    [duration, pixelsPerSecond],
  );

  const applyScrubFromClientX = useCallback(
    (clientX: number) => {
      const scroll = scrollRef.current;
      if (!scroll) return;

      const rect = scroll.getBoundingClientRect();
      const timelineX = clientX - rect.left + scroll.scrollLeft;
      const nextTime = clamp(timelineX / pixelsPerSecond, 0, duration);
      animationStore.scrubTo(nextTime);
    },
    [duration, pixelsPerSecond],
  );

  const startScrub = useCallback(
    (clientX: number) => {
      applyScrubFromClientX(clientX);

      const onMove = (event: PointerEvent) => {
        applyScrubFromClientX(event.clientX);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [applyScrubFromClientX],
  );

  const updateMarqueeSelection = useCallback((startX: number, startY: number, currentX: number, currentY: number) => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    const clientLeft = Math.min(startX, currentX);
    const clientTop = Math.min(startY, currentY);
    const clientRight = Math.max(startX, currentX);
    const clientBottom = Math.max(startY, currentY);
    const clientWidth = clientRight - clientLeft;
    const clientHeight = clientBottom - clientTop;

    const rect = scroll.getBoundingClientRect();
    setMarqueeRect({
      left: clientLeft - rect.left,
      top: clientTop - rect.top + scroll.scrollTop,
      width: clientWidth,
      height: clientHeight,
    });

    const keyButtons = scroll.querySelectorAll<HTMLButtonElement>(".timeline-v2-key");
    const selected: SelectedKeyframe[] = [];
    for (const button of keyButtons) {
      const keyRect = button.getBoundingClientRect();
      const intersects =
        keyRect.right >= clientLeft &&
        keyRect.left <= clientRight &&
        keyRect.bottom >= clientTop &&
        keyRect.top <= clientBottom;
      if (!intersects) continue;

      const objectId = button.dataset.objectId;
      const propertyPath = button.dataset.propertyPath as TrackProperty | undefined;
      const time = button.dataset.time ? parseFloat(button.dataset.time) : NaN;
      if (!objectId || !propertyPath || !Number.isFinite(time)) continue;

      selected.push({ objectId, propertyPath, time });
    }

    keyframeSelectionStore.setMarqueeSelection(selected);
  }, []);

  const onLanePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();

      const startX = event.clientX;
      const startY = event.clientY;
      let marqueeActive = false;

      const onMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (!marqueeActive && dx * dx + dy * dy > 16) {
          marqueeActive = true;
        }
        if (marqueeActive) {
          updateMarqueeSelection(startX, startY, moveEvent.clientX, moveEvent.clientY);
        }
      };

      const onUp = (upEvent: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);

        if (marqueeActive) {
          setMarqueeRect(null);
        } else {
          startScrub(upEvent.clientX);
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [startScrub, updateMarqueeSelection],
  );

  const deleteSelectedKeyframes = useCallback(() => {
    const selected = keyframeSelectionStore.getSelected();
    if (selected.length === 0) {
      return;
    }

    const deleted = animationStore.removeKeyframes(selected, {
      source: "timeline",
      label: "Delete Keyframes",
    });
    if (deleted) {
      keyframeSelectionStore.clear();
    }
  }, []);

  const applyDragDelta = useCallback(
    (clientX: number, altKey: boolean) => {
      const state = dragStateRef.current;
      if (!state) return;

      const rawDelta = (clientX - state.startClientX) / pixelsPerSecond;
      const minDelta = -state.minTime;
      const maxDelta = duration - state.maxTime;
      let nextDelta = clamp(rawDelta, minDelta, maxDelta);

      if (!altKey && snapSeconds > 0) {
        nextDelta = roundTime(Math.round(nextDelta / snapSeconds) * snapSeconds);
        nextDelta = clamp(nextDelta, minDelta, maxDelta);
      }

      previewDeltaRef.current = nextDelta;
      setPreviewDeltaSeconds(nextDelta);
    },
    [duration, pixelsPerSecond, snapSeconds],
  );

  const startKeyDrag = useCallback(
    (startClientX: number, refs: SelectedKeyframe[]) => {
      if (refs.length === 0) return;

      let minTime = Number.POSITIVE_INFINITY;
      let maxTime = Number.NEGATIVE_INFINITY;
      for (const ref of refs) {
        minTime = Math.min(minTime, ref.time);
        maxTime = Math.max(maxTime, ref.time);
      }

      dragStateRef.current = {
        startClientX,
        refs,
        minTime: Number.isFinite(minTime) ? minTime : 0,
        maxTime: Number.isFinite(maxTime) ? maxTime : 0,
      };
      previewDeltaRef.current = 0;
      setPreviewDeltaSeconds(0);

      const onMove = (event: PointerEvent) => {
        applyDragDelta(event.clientX, event.altKey);
      };

      const onUp = () => {
        const drag = dragStateRef.current;
        const delta = previewDeltaRef.current;

        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);

        dragStateRef.current = null;
        previewDeltaRef.current = 0;
        setPreviewDeltaSeconds(0);

        if (!drag || Math.abs(delta) < EPSILON) {
          return;
        }

        const moved = animationStore.moveKeyframes(drag.refs, delta, {
          source: "timeline",
          label: "Move Keyframes",
        });

        if (moved.length > 0) {
          keyframeSelectionStore.setMarqueeSelection(
            moved.map((item) => ({
              objectId: item.objectId,
              propertyPath: item.propertyPath,
              time: item.time,
            })),
          );
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [applyDragDelta],
  );

  const onKeyPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, key: SelectedKeyframe) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();

      if (event.shiftKey) {
        keyframeSelectionStore.toggle(key);
        return;
      }

      const existingSelection = keyframeSelectionStore.getSelected();
      const clickedToken = keyToken(key);
      const clickedInSelection = existingSelection.some((item) => keyToken(item) === clickedToken);
      const dragRefs = clickedInSelection ? existingSelection : [key];

      if (!clickedInSelection) {
        keyframeSelectionStore.selectSingle(key);
      }

      startKeyDrag(event.clientX, dragRefs);
    },
    [startKeyDrag],
  );

  const onDurationBlur = useCallback((event: FocusEvent<HTMLInputElement>) => {
    const next = parseFloat(event.target.value);
    if (!Number.isFinite(next) || next <= 0) {
      event.target.value = animationStore.getDuration().toString();
      return;
    }

    animationStore.setDuration(next, {
      source: "timeline",
      label: "Change Duration",
      undoable: true,
    });
  }, []);

  const onTimelineWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    timelineStore.zoomByFactor(event.deltaY < 0 ? 1.1 : 0.9);
  }, []);

  const commitEditorTime = useCallback((value: string) => {
    if (!selectedSingleKey) return;
    const next = parseFloat(value);
    if (!Number.isFinite(next)) return;

    const updated = animationStore.setKeyframeTime(selectedSingleKey, next, {
      source: "timeline",
      label: "Keyframe Time",
    });

    if (updated) {
      keyframeSelectionStore.selectSingle({
        objectId: updated.objectId,
        propertyPath: updated.propertyPath,
        time: updated.time,
      });
    }
  }, [selectedSingleKey]);

  const commitEditorValue = useCallback((value: string) => {
    if (!selectedSingleKey) return;
    const next = parseFloat(value);
    if (!Number.isFinite(next)) return;

    const updated = animationStore.setKeyframeValue(selectedSingleKey, next, {
      source: "timeline",
      label: "Keyframe Value",
    });

    if (updated) {
      keyframeSelectionStore.selectSingle({
        objectId: updated.objectId,
        propertyPath: updated.propertyPath,
        time: updated.time,
      });
    }
  }, [selectedSingleKey]);

  const commitEditorInterpolation = useCallback(
    (next: Interpolation) => {
      if (!selectedSingleKey) return;

      const updated = animationStore.setKeyframeInterpolation(selectedSingleKey, next, {
        source: "timeline",
        label: "Keyframe Interpolation",
      });

      if (updated) {
        keyframeSelectionStore.selectSingle({
          objectId: updated.objectId,
          propertyPath: updated.propertyPath,
          time: updated.time,
        });
      }
    },
    [selectedSingleKey],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isInputActiveElement(document.activeElement)) {
        return;
      }
      const hasMod = event.metaKey || event.ctrlKey;

      if (hasMod && event.key.toLowerCase() === "c") {
        const selected = keyframeSelectionStore.getSelected();
        const payload = selected
          .map((ref) => animationStore.getKeyframe(ref))
          .filter((item): item is KeyframeRecord => item !== null);
        if (payload.length > 0) {
          clipboardRef.current = payload;
          event.preventDefault();
        }
        return;
      }

      if (hasMod && event.key.toLowerCase() === "v") {
        if (clipboardRef.current.length === 0) return;
        const playhead = animationStore.getCurrentTime();
        const baseTime = Math.min(...clipboardRef.current.map((item) => item.time));
        const pasted = clipboardRef.current.map((item) => ({
          ...item,
          time: item.time - baseTime + playhead,
        }));
        const inserted = animationStore.insertKeyframes(pasted, {
          source: "timeline",
          label: "Paste Keyframes",
        });
        if (inserted.length > 0) {
          keyframeSelectionStore.setMarqueeSelection(inserted);
        }
        event.preventDefault();
        return;
      }

      if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        const selected = keyframeSelectionStore.getSelected();
        if (selected.length === 0) return;
        const delta = event.key === "ArrowLeft" ? -0.05 : 0.05;
        const moved = animationStore.moveKeyframes(selected, delta, {
          source: "timeline",
          label: "Nudge Keyframes",
        });
        if (moved.length > 0) {
          keyframeSelectionStore.setMarqueeSelection(moved);
        }
        event.preventDefault();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        const selected = keyframeSelectionStore.getSelected();
        if (selected.length === 0) return;
        event.preventDefault();
        deleteSelectedKeyframes();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelectedKeyframes]);

  if (timelineRows.length === 0) {
    return <div className="timeline-v2-empty">Add keyframes to see animated objects in timeline</div>;
  }

  const { minPixelsPerSecond, maxPixelsPerSecond } = timelineStore.getBounds();
  const playheadLeftPx = currentTime * pixelsPerSecond;

  return (
    <div className="timeline-v2">
      <div className="timeline-v2-controls">
        <button
          type="button"
          className="timeline-v2-play-btn"
          onClick={() => animationStore.togglePlayback()}
        >
          {playing ? "||" : "\u25B6"}
        </button>

        <span className="timeline-v2-time-label">{formatTime(currentTime)}s</span>

        <span className="timeline-v2-divider">/</span>

        <input
          className="timeline-v2-duration-input"
          type="number"
          min={0.1}
          step={0.1}
          key={`duration-${duration}`}
          defaultValue={duration}
          onBlur={onDurationBlur}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              (event.target as HTMLInputElement).blur();
            }
          }}
        />
        <span className="timeline-v2-time-unit">s</span>

        <label className="timeline-v2-zoom-control">
          Zoom
          <input
            type="range"
            min={minPixelsPerSecond}
            max={maxPixelsPerSecond}
            value={pixelsPerSecond}
            onChange={(event) => timelineStore.setPixelsPerSecond(parseFloat(event.target.value))}
          />
        </label>

        <button
          type="button"
          className="timeline-v2-delete-btn"
          onClick={deleteSelectedKeyframes}
          title="Delete selected keyframes"
          disabled={selectedKeyframes.length === 0}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
            <path
              d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 7h2v8h-2v-8Zm4 0h2v8h-2v-8ZM7 10h2v8H7v-8Z"
              fill="currentColor"
            />
          </svg>
        </button>

        <span className="timeline-v2-shortcuts">K key all · Del remove · Ctrl+C/V copy/paste · Alt+Arrows nudge · Ctrl+Wheel zoom</span>
      </div>

      {selectedSingleKey && (
        <div className="timeline-v2-editor" role="group" aria-label="Selected keyframe editor">
          <span className="timeline-v2-editor-title">{selectedSingleKey.propertyPath}</span>

          <label>
            Time
            <input
              key={`editor-time-${selectedSingleKey.objectId}-${selectedSingleKey.propertyPath}-${selectedSingleKey.time}`}
              type="number"
              step={0.01}
              defaultValue={selectedSingleKey.time}
              onBlur={(event) => commitEditorTime(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitEditorTime((event.target as HTMLInputElement).value);
                  (event.target as HTMLInputElement).blur();
                }
              }}
            />
          </label>

          <label>
            Value
            <input
              key={`editor-value-${selectedSingleKey.objectId}-${selectedSingleKey.propertyPath}-${selectedSingleKey.time}`}
              type="number"
              step={0.01}
              defaultValue={selectedSingleKey.value}
              onBlur={(event) => commitEditorValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitEditorValue((event.target as HTMLInputElement).value);
                  (event.target as HTMLInputElement).blur();
                }
              }}
            />
          </label>

          <label>
            Interp
            <select
              key={`editor-interp-${selectedSingleKey.objectId}-${selectedSingleKey.propertyPath}-${selectedSingleKey.time}`}
              defaultValue={selectedSingleKey.interpolation}
              onChange={(event) => commitEditorInterpolation(event.target.value as Interpolation)}
            >
              <option value="linear">Linear</option>
              <option value="step">Step</option>
              <option value="easeIn">Ease In</option>
              <option value="easeOut">Ease Out</option>
              <option value="easeInOut">Ease In Out</option>
            </select>
          </label>
        </div>
      )}

      <div className="timeline-v2-body">
        <TrackList
          rows={timelineRows}
          onSelectObject={(objectId) => sceneStore.setSelectedId(objectId)}
          onToggleObjectCollapsed={(objectId) => timelineStore.toggleObjectCollapsed(objectId, selectedId)}
          onToggleObjectHidden={(objectId) => timelineStore.toggleObjectHidden(objectId)}
        />

        <div className="timeline-v2-right" onWheel={onTimelineWheel}>
          <div className="timeline-v2-scroll" ref={scrollRef}>
            <div className="timeline-v2-scroll-content" style={{ width: `${timelineWidthPx}px` }}>
              <div className="timeline-v2-ruler" onPointerDown={onLanePointerDown}>
                {rulerTicks.map((tickTime) => {
                  const isMajor = sameTime(tickTime, Math.round(tickTime));
                  return (
                    <div
                      key={tickTime}
                      className={`timeline-v2-ruler-tick${isMajor ? " is-major" : ""}`}
                      style={{ left: `${tickTime * pixelsPerSecond}px` }}
                    >
                      {isMajor && <span className="timeline-v2-ruler-label">{tickTime.toFixed(0)}s</span>}
                    </div>
                  );
                })}
              </div>

              {timelineRows.map((row) =>
                row.type === "lane" ? (
                  <TrackLane
                    key={row.id}
                    laneId={row.id}
                    widthPx={timelineWidthPx}
                    pixelsPerSecond={pixelsPerSecond}
                    markers={rowMarkers.get(row.id) ?? []}
                    selectedTokens={selectedTokenSet}
                    previewDeltaSeconds={previewDeltaSeconds}
                    makeToken={keyToken}
                    onLanePointerDown={onLanePointerDown}
                    onKeyPointerDown={onKeyPointerDown}
                  />
                ) : (
                  <div
                    key={row.id}
                    className={`timeline-v2-lane ${row.type === "object" ? "timeline-v2-lane--group" : "timeline-v2-lane--property"}`}
                  >
                    <div className="timeline-v2-lane-inner" style={{ width: `${timelineWidthPx}px` }} />
                  </div>
                ),
              )}

              {marqueeRect && (
                <div
                  className="timeline-v2-marquee"
                  style={{
                    left: `${marqueeRect.left}px`,
                    top: `${marqueeRect.top}px`,
                    width: `${marqueeRect.width}px`,
                    height: `${marqueeRect.height}px`,
                  }}
                />
              )}

              <div className="timeline-v2-playhead" style={{ left: `${playheadLeftPx}px` }}>
                <span className="timeline-v2-playhead-label">{formatTime(currentTime)}s</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
