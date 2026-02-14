import * as THREE from "three";

// ---- Types ----

export interface SceneNodeInfo {
  id: string;
  name: string;
  type: string; // "Mesh" | "Group" | "Light" | etc.
  parentId: string | null;
}

export interface SceneSnapshot {
  nodes: SceneNodeInfo[];
  selectedId: string | null;
}

type Channel = "selection" | "objects" | "transform";
type Listener = () => void;

// ---- Internal state ----

let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controlsTarget: THREE.Vector3 | null = null;
const registry = new Map<string, THREE.Object3D>();
let selectedId: string | null = null;
let dirty = false;

const listeners: Record<Channel, Set<Listener>> = {
  selection: new Set(),
  objects: new Set(),
  transform: new Set(),
};

const dirtyListeners = new Set<Listener>();

// ---- Helpers ----

let nextId = 1;
export function generateId(): string {
  return `obj_${nextId++}`;
}

function bumpNextIdFromExplicitId(id: string) {
  const match = /^obj_(\d+)$/.exec(id);
  if (!match) return;
  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isFinite(parsed)) return;
  nextId = Math.max(nextId, parsed + 1);
}

function notify(channel: Channel) {
  listeners[channel].forEach((fn) => fn());
}

function notifyDirty() {
  dirtyListeners.forEach((fn) => fn());
}

function markDirty() {
  if (!dirty) {
    dirty = true;
    notifyDirty();
  }
}

// ---- Public API ----

export const sceneStore = {
  // -- Setup --

  setScene(s: THREE.Scene, cam: THREE.PerspectiveCamera, target: THREE.Vector3) {
    // Replace any prior scene bindings to avoid stale Object3D references
    // after StrictMode remounts in development.
    this.clearRegistry();
    scene = s;
    camera = cam;
    controlsTarget = target;
  },

  getScene(): THREE.Scene | null {
    return scene;
  },

  getCamera(): THREE.PerspectiveCamera | null {
    return camera;
  },

  getControlsTarget(): THREE.Vector3 | null {
    return controlsTarget;
  },

  // -- Object registry --

  registerObject(obj: THREE.Object3D, id?: string, options?: { silent?: boolean }): string {
    let objId = id ?? generateId();
    if (id) {
      if (registry.has(objId) && registry.get(objId) !== obj) {
        throw new Error(`sceneStore.registerObject id collision: ${objId}`);
      }
      bumpNextIdFromExplicitId(objId);
    } else {
      while (registry.has(objId)) {
        objId = generateId();
      }
    }
    obj.userData.__sceneId = objId;
    registry.set(objId, obj);
    if (!options?.silent) {
      notify("objects");
    }
    return objId;
  },

  registerHierarchy(root: THREE.Object3D, options?: { markDirty?: boolean; rootId?: string }): string[] {
    const ids: string[] = [];
    root.traverse((node) => {
      const preferredId = node === root ? options?.rootId : undefined;
      const id = this.registerObject(node, preferredId, { silent: true });
      ids.push(id);
    });
    notify("objects");
    if (options?.markDirty) {
      markDirty();
    }
    return ids;
  },

  unregisterObject(id: string) {
    registry.delete(id);
    if (selectedId === id) {
      selectedId = null;
      notify("selection");
    }
    notify("objects");
    markDirty();
  },

  getObjectById(id: string): THREE.Object3D | undefined {
    return registry.get(id);
  },

  getIdForObject(obj: THREE.Object3D): string | null {
    return (obj.userData.__sceneId as string) ?? null;
  },

  getAllUserObjects(): THREE.Object3D[] {
    return Array.from(registry.values());
  },

  // -- Selection --

  getSelectedId(): string | null {
    return selectedId;
  },

  setSelectedId(id: string | null) {
    if (id === selectedId) return;
    selectedId = id;
    notify("selection");
  },

  getSelectedObject(): THREE.Object3D | null {
    if (!selectedId) return null;
    return registry.get(selectedId) ?? null;
  },

  // -- Snapshot for UI --

  getSnapshot(): SceneSnapshot {
    const nodes: SceneNodeInfo[] = [];
    for (const [id, obj] of registry) {
      nodes.push({
        id,
        name: obj.name || "(unnamed)",
        type: obj.type,
        parentId: obj.parent?.userData.__sceneId ?? null,
      });
    }
    return { nodes, selectedId };
  },

  // -- Notifications --

  notifyTransformChanged(options?: { markDirty?: boolean }) {
    notify("transform");
    if (options?.markDirty !== false) {
      markDirty();
    }
  },

  notifyObjectsChanged() {
    notify("objects");
    markDirty();
  },

  renameObject(id: string, name: string) {
    const obj = registry.get(id);
    if (obj) {
      obj.name = name;
      notify("objects");
      markDirty();
    }
  },

  // -- Dirty state --

  isDirty(): boolean {
    return dirty;
  },

  clearDirty() {
    dirty = false;
    notifyDirty();
  },

  markDirty() {
    markDirty();
  },

  subscribeDirty(fn: Listener): () => void {
    dirtyListeners.add(fn);
    return () => dirtyListeners.delete(fn);
  },

  // -- Subscribe --

  subscribe(channel: Channel, fn: Listener): () => void {
    listeners[channel].add(fn);
    return () => listeners[channel].delete(fn);
  },

  // -- Reset (for new project / load) --

  clearRegistry() {
    registry.clear();
    selectedId = null;
    nextId = 1;
    notify("objects");
    notify("selection");
  },
};
