import type { PointerEvent as ReactPointerEvent } from "react";
import type { SelectedKeyframe } from "../state/keyframeSelectionStore.js";

export interface TrackLaneMarker extends SelectedKeyframe {
  axis: "x" | "y" | "z";
}

interface TrackLaneProps {
  laneId: string;
  widthPx: number;
  pixelsPerSecond: number;
  markers: TrackLaneMarker[];
  selectedTokens: Set<string>;
  previewDeltaSeconds: number;
  makeToken: (key: SelectedKeyframe) => string;
  onLanePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, key: SelectedKeyframe) => void;
}

function clampTimeToLane(time: number): number {
  return Number.isFinite(time) ? Math.max(0, time) : 0;
}

export function TrackLane({
  laneId,
  widthPx,
  pixelsPerSecond,
  markers,
  selectedTokens,
  previewDeltaSeconds,
  makeToken,
  onLanePointerDown,
  onKeyPointerDown,
}: TrackLaneProps) {
  return (
    <div className="timeline-v2-lane" onPointerDown={onLanePointerDown} data-lane-id={laneId}>
      <div className="timeline-v2-lane-inner" style={{ width: `${widthPx}px` }}>
        {markers.map((marker, index) => {
          const token = makeToken(marker);
          const isSelected = selectedTokens.has(token);
          const displayTime = clampTimeToLane(marker.time + (isSelected ? previewDeltaSeconds : 0));

          return (
            <button
              key={`${token}-${index}`}
              type="button"
              className={`timeline-v2-key timeline-v2-key--${marker.axis}${isSelected ? " is-selected" : ""}`}
              style={{ left: `${displayTime * pixelsPerSecond}px` }}
              onPointerDown={(event) => onKeyPointerDown(event, marker)}
              title={`${marker.propertyPath} @ ${marker.time.toFixed(3)}s`}
              data-object-id={marker.objectId}
              data-property-path={marker.propertyPath}
              data-time={marker.time}
            />
          );
        })}
      </div>
    </div>
  );
}
