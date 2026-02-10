export interface TrackListRow {
  id: string;
  objectId: string;
  label: string;
  depth: number;
  type: "object" | "property" | "lane";
  collapsed?: boolean;
  hidden?: boolean;
  selected?: boolean;
}

interface TrackListProps {
  rows: TrackListRow[];
  onSelectObject: (objectId: string) => void;
  onToggleObjectCollapsed: (objectId: string) => void;
  onToggleObjectHidden: (objectId: string) => void;
}

export function TrackList({
  rows,
  onSelectObject,
  onToggleObjectCollapsed,
  onToggleObjectHidden,
}: TrackListProps) {
  return (
    <div className="timeline-v2-track-list" aria-label="Track list">
      <div className="timeline-v2-track-list-header">Tracks</div>
      {rows.map((row) => {
        if (row.type === "object") {
          return (
            <div
              key={row.id}
              className={`timeline-v2-track-list-row timeline-v2-track-list-row--object${row.selected ? " is-selected" : ""}`}
            >
              <button
                type="button"
                className="timeline-v2-track-toggle"
                onClick={() => onToggleObjectCollapsed(row.objectId)}
                title={row.collapsed ? "Expand object tracks" : "Collapse object tracks"}
              >
                {row.collapsed ? "\u25B6" : "\u25BC"}
              </button>

              <button
                type="button"
                className={`timeline-v2-track-eye${row.hidden ? " is-hidden" : ""}`}
                onClick={() => onToggleObjectHidden(row.objectId)}
                title={row.hidden ? "Show object tracks" : "Hide object tracks"}
              >
                {row.hidden ? "\u25CC" : "\u25C9"}
              </button>

              <button
                type="button"
                className="timeline-v2-track-object-name"
                onClick={() => onSelectObject(row.objectId)}
                title={row.label}
              >
                {row.label}
              </button>
            </div>
          );
        }

        const laneClass =
          row.type === "property"
            ? "timeline-v2-track-list-row timeline-v2-track-list-row--property"
            : "timeline-v2-track-list-row timeline-v2-track-list-row--lane";

        return (
          <div
            key={row.id}
            className={laneClass}
            style={{ paddingLeft: `${12 + row.depth * 14}px` }}
          >
            {row.label}
          </div>
        );
      })}
    </div>
  );
}
