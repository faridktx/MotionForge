import { useCallback, useEffect, useRef, useState } from "react";
import { animationStore } from "../state/animationStore.js";
import { sceneStore } from "../state/sceneStore.js";

function useAnimTime(): number {
  const [t, setT] = useState(() => animationStore.getCurrentTime());
  useEffect(() => {
    const unsub = animationStore.subscribe("time", () =>
      setT(animationStore.getCurrentTime()),
    );
    return unsub;
  }, []);
  return t;
}

function usePlayback(): boolean {
  const [playing, setPlaying] = useState(() => animationStore.isPlaying());
  useEffect(() => {
    return animationStore.subscribe("playback", () =>
      setPlaying(animationStore.isPlaying()),
    );
  }, []);
  return playing;
}

function useKeyframeTimes(): number[] {
  const [times, setTimes] = useState<number[]>([]);
  useEffect(() => {
    const update = () => setTimes(animationStore.getKeyframeTimesForSelected());
    update();
    const u1 = animationStore.subscribe("keyframes", update);
    const u2 = sceneStore.subscribe("selection", update);
    return () => { u1(); u2(); };
  }, []);
  return times;
}

function useDuration(): number {
  const [dur, setDur] = useState(() => animationStore.getDuration());
  useEffect(() => {
    return animationStore.subscribe("playback", () =>
      setDur(animationStore.getDuration()),
    );
  }, []);
  return dur;
}

function fmt(seconds: number): string {
  const s = Math.max(0, seconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toFixed(2).padStart(5, "0")}`;
}

export function Timeline() {
  const currentTime = useAnimTime();
  const playing = usePlayback();
  const keyframeTimes = useKeyframeTimes();
  const duration = useDuration();
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);

  const scrubFromEvent = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      animationStore.scrubTo(ratio * duration);
    },
    [duration],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      scrubbing.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      scrubFromEvent(e.clientX);
    },
    [scrubFromEvent],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!scrubbing.current) return;
      scrubFromEvent(e.clientX);
    },
    [scrubFromEvent],
  );

  const onPointerUp = useCallback(() => {
    scrubbing.current = false;
  }, []);

  const togglePlay = useCallback(() => {
    animationStore.togglePlayback();
  }, []);

  const onDurationChange = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val > 0) {
      animationStore.setDuration(val);
    }
  }, []);

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="timeline-content">
      <div className="timeline-controls">
        <button className="timeline-play-btn" onClick={togglePlay}>
          {playing ? "||" : "\u25B6"}
        </button>
        <span className="timeline-time">{fmt(currentTime)}</span>
        <span className="timeline-separator">/</span>
        <input
          className="timeline-duration-input"
          type="number"
          defaultValue={duration}
          min={0.1}
          step={0.5}
          key={`dur-${duration}`}
          onBlur={onDurationChange}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <span className="timeline-unit">s</span>
      </div>

      <div
        className="timeline-track"
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Keyframe markers */}
        {keyframeTimes.map((t, i) => {
          const pct = duration > 0 ? (t / duration) * 100 : 0;
          return (
            <div
              key={i}
              className="timeline-keyframe"
              style={{ left: `${pct}%` }}
            />
          );
        })}

        {/* Playhead */}
        <div
          className="timeline-playhead"
          style={{ left: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
