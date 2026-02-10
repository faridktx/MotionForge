import type { TrackProperty } from "@motionforge/engine";
import type { TrackListRow } from "./TrackList.js";

export interface TimelineLayoutRow extends TrackListRow {
  properties: TrackProperty[];
  hidden: boolean;
}

export interface TimelineLayoutObject {
  id: string;
  name: string;
}

export interface TimelineLayoutInput {
  objects: TimelineLayoutObject[];
  selectedId: string | null;
  isObjectHidden: (objectId: string) => boolean;
  isObjectCollapsed: (objectId: string, selectedId: string | null) => boolean;
}

const PROPERTY_GROUPS = [
  { id: "position", label: "Position", axes: ["x", "y", "z"] as const },
  { id: "rotation", label: "Rotation", axes: ["x", "y", "z"] as const },
  { id: "scale", label: "Scale", axes: ["x", "y", "z"] as const },
];

export function buildTimelineLayoutRows(input: TimelineLayoutInput): TimelineLayoutRow[] {
  const rows: TimelineLayoutRow[] = [];

  for (const object of input.objects) {
    const hidden = input.isObjectHidden(object.id);
    const collapsed = input.isObjectCollapsed(object.id, input.selectedId);

    rows.push({
      id: `object:${object.id}`,
      objectId: object.id,
      label: object.name || object.id,
      depth: 0,
      type: "object",
      selected: object.id === input.selectedId,
      collapsed,
      hidden,
      properties: [],
    });

    if (collapsed || hidden) {
      continue;
    }

    for (const group of PROPERTY_GROUPS) {
      rows.push({
        id: `property:${object.id}:${group.id}`,
        objectId: object.id,
        label: group.label,
        depth: 1,
        type: "property",
        hidden,
        properties: [],
      });

      for (const axis of group.axes) {
        rows.push({
          id: `lane:${object.id}:${group.id}.${axis}`,
          objectId: object.id,
          label: axis.toUpperCase(),
          depth: 2,
          type: "lane",
          hidden,
          properties: [`${group.id}.${axis}` as TrackProperty],
        });
      }
    }
  }

  return rows;
}
