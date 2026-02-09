import { useState, useMemo } from "react";
import { useSceneObjects } from "../state/useScene.js";
import { sceneStore } from "../state/sceneStore.js";

export function HierarchyContent() {
  const snapshot = useSceneObjects();
  const [filter, setFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const filteredNodes = useMemo(() => {
    if (!filter) return snapshot.nodes;
    const lower = filter.toLowerCase();
    return snapshot.nodes.filter((n) => n.name.toLowerCase().includes(lower));
  }, [snapshot.nodes, filter]);

  function handleSelect(id: string) {
    if (editingId) return;
    sceneStore.setSelectedId(id);
  }

  function startRename(id: string, currentName: string) {
    setEditingId(id);
    setEditName(currentName);
  }

  function commitRename() {
    if (editingId && editName.trim()) {
      sceneStore.renameObject(editingId, editName.trim());
    }
    setEditingId(null);
  }

  return (
    <div className="hierarchy">
      <input
        type="text"
        className="hierarchy-search"
        placeholder="Filter..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <ul className="hierarchy-list">
        {filteredNodes.map((node) => {
          const isSelected = node.id === snapshot.selectedId;
          return (
            <li
              key={node.id}
              className={`hierarchy-item${isSelected ? " hierarchy-item--selected" : ""}`}
              onClick={() => handleSelect(node.id)}
              onDoubleClick={() => startRename(node.id, node.name)}
            >
              <span className="hierarchy-type">{typeLabel(node.type)}</span>
              {editingId === node.id ? (
                <input
                  className="hierarchy-rename"
                  value={editName}
                  autoFocus
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="hierarchy-name">{node.name}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function typeLabel(type: string): string {
  switch (type) {
    case "Mesh":
      return "\u25A0"; // filled square
    case "Group":
      return "\u25CB"; // circle
    default:
      return "\u25C6"; // diamond
  }
}
