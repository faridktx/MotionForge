import type { Clip } from "@motionforge/engine";
import * as THREE from "three";
import { animationStore } from "../../state/animationStore.js";
import { generateId, sceneStore } from "../../state/sceneStore.js";
import { undoStore } from "../../state/undoStore.js";

export type PrimitiveType = "box" | "sphere" | "cone";
export type LightKind = "directional" | "point" | "ambient";

type Vector3Tuple = [number, number, number];

interface PrimitiveDefinition {
  label: string;
  color: number;
  createGeometry: () => THREE.BufferGeometry;
  y: number;
}

const PRIMITIVE_DEFINITIONS: Record<PrimitiveType, PrimitiveDefinition> = {
  box: {
    label: "Cube",
    color: 0x4488ff,
    createGeometry: () => new THREE.BoxGeometry(1, 1, 1),
    y: 0.5,
  },
  sphere: {
    label: "Sphere",
    color: 0x44cc66,
    createGeometry: () => new THREE.SphereGeometry(0.5, 32, 32),
    y: 0.5,
  },
  cone: {
    label: "Cone",
    color: 0xcc6644,
    createGeometry: () => new THREE.ConeGeometry(0.5, 1, 32),
    y: 0.5,
  },
};

interface HierarchyEntry {
  node: THREE.Object3D;
  id: string;
}

interface ParentSnapshot {
  node: THREE.Object3D;
  parent: THREE.Object3D;
  index: number;
}

export interface AddPrimitiveOptions {
  name?: string;
  at?: {
    position?: Vector3Tuple;
    rotation?: Vector3Tuple;
    scale?: Vector3Tuple;
  };
  material?: {
    color?: number;
    metallic?: number;
    roughness?: number;
  };
}

export interface AddLightOptions {
  name?: string;
  intensity?: number;
  color?: number;
  position?: Vector3Tuple;
}

export interface AddCameraOptions {
  name?: string;
  position?: Vector3Tuple;
  target?: Vector3Tuple;
}

export interface DuplicateOptions {
  offset?: Vector3Tuple;
}

export interface GroupOptions {
  objectIds?: string[];
  name?: string;
}

function cloneClip(clip: Clip): Clip {
  return structuredClone(clip);
}

function clipsEqual(a: Clip, b: Clip): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function getCurrentScene(): THREE.Scene | null {
  return sceneStore.getScene();
}

function reserveUniqueObjectId(reserved: Set<string>): string {
  let id = generateId();
  while (reserved.has(id) || sceneStore.getObjectById(id)) {
    id = generateId();
  }
  reserved.add(id);
  return id;
}

function collectReservedIds(): Set<string> {
  return new Set(sceneStore.getSnapshot().nodes.map((node) => node.id));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toBaseName(name: string, fallback: string): string {
  const normalized = name.trim();
  if (!normalized) return fallback;
  return normalized.replace(/\s+\d+$/, "") || fallback;
}

function createUniqueObjectName(baseName: string): string {
  const expression = new RegExp(`^${escapeRegex(baseName)}(?:\\s+(\\d+))?$`);
  let highest = 0;
  let found = false;

  for (const obj of sceneStore.getAllUserObjects()) {
    const match = expression.exec(obj.name ?? "");
    if (!match) continue;
    found = true;
    const index = match[1] ? Number.parseInt(match[1], 10) : 1;
    highest = Math.max(highest, Number.isFinite(index) ? index : 1);
  }

  return found ? `${baseName} ${highest + 1}` : baseName;
}

function getUserRootCount(): number {
  const ids = new Set(sceneStore.getSnapshot().nodes.map((node) => node.id));
  let count = 0;
  for (const obj of sceneStore.getAllUserObjects()) {
    const parentId = obj.parent ? sceneStore.getIdForObject(obj.parent) : null;
    if (!parentId || !ids.has(parentId)) {
      count += 1;
    }
  }
  return count;
}

function computeSpawnPosition(index: number, y: number): THREE.Vector3 {
  const angle = (index % 10) * (Math.PI / 5);
  const ring = Math.floor(index / 10) + 1;
  const radius = 0.7 + ring * 0.35;
  return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
}

function collectHierarchyEntries(root: THREE.Object3D): HierarchyEntry[] {
  const entries: HierarchyEntry[] = [];
  root.traverse((node) => {
    const id = sceneStore.getIdForObject(node);
    if (!id) return;
    entries.push({ node, id });
  });
  return entries;
}

function collectHierarchyEntriesWithIds(root: THREE.Object3D): HierarchyEntry[] {
  const entries: HierarchyEntry[] = [];
  root.traverse((node) => {
    const id = sceneStore.getIdForObject(node);
    if (!id) return;
    entries.push({ node, id });
  });
  return entries;
}

function registerHierarchyEntries(entries: HierarchyEntry[]) {
  for (const entry of entries) {
    sceneStore.registerObject(entry.node, entry.id, { silent: true });
  }
  sceneStore.notifyObjectsChanged();
}

function unregisterHierarchyEntries(entries: HierarchyEntry[]) {
  for (const entry of entries) {
    sceneStore.unregisterObject(entry.id);
  }
}

function applyClip(clip: Clip) {
  animationStore.setClip(clip, { markDirty: false });
}

function removeTracksForIds(beforeClip: Clip, ids: Set<string>): Clip {
  const after = cloneClip(beforeClip);
  after.tracks = after.tracks.filter((track) => !ids.has(track.objectId));
  return after;
}

function duplicateTracksForIdMap(beforeClip: Clip, idMap: Map<string, string>): Clip {
  const after = cloneClip(beforeClip);
  const copies = beforeClip.tracks
    .filter((track) => idMap.has(track.objectId))
    .map((track) => {
      const copy = structuredClone(track);
      copy.objectId = idMap.get(track.objectId) ?? track.objectId;
      return copy;
    });

  if (copies.length > 0) {
    after.tracks = [...after.tracks, ...copies];
  }
  return after;
}

function insertChildAt(parent: THREE.Object3D, child: THREE.Object3D, index: number) {
  parent.add(child);
  const currentIndex = parent.children.indexOf(child);
  if (currentIndex < 0) return;
  if (index < 0 || index >= parent.children.length) return;
  parent.children.splice(currentIndex, 1);
  parent.children.splice(index, 0, child);
}

function cloneObjectForDuplicate(source: THREE.Object3D): {
  clone: THREE.Object3D;
  entries: HierarchyEntry[];
  idMap: Map<string, string>;
} {
  const clone = source.clone(true);
  const sourceNodes: THREE.Object3D[] = [];
  const cloneNodes: THREE.Object3D[] = [];
  source.traverse((node) => sourceNodes.push(node));
  clone.traverse((node) => cloneNodes.push(node));

  const reserved = collectReservedIds();
  const entries: HierarchyEntry[] = [];
  const idMap = new Map<string, string>();

  for (let index = 0; index < sourceNodes.length; index += 1) {
    const sourceNode = sourceNodes[index];
    const cloneNode = cloneNodes[index];
    if (!sourceNode || !cloneNode) continue;

    cloneNode.userData = structuredClone(sourceNode.userData ?? {});

    if (cloneNode instanceof THREE.Mesh) {
      cloneNode.geometry = cloneNode.geometry.clone();
      if (Array.isArray(cloneNode.material)) {
        cloneNode.material = cloneNode.material.map((material) => material.clone());
      } else if (cloneNode.material) {
        cloneNode.material = cloneNode.material.clone();
      }
    }

    const sourceId = sceneStore.getIdForObject(sourceNode);
    if (!sourceId) {
      delete cloneNode.userData.__sceneId;
      continue;
    }

    const cloneId = reserveUniqueObjectId(reserved);
    cloneNode.userData.__sceneId = cloneId;
    entries.push({ node: cloneNode, id: cloneId });
    idMap.set(sourceId, cloneId);
  }

  return { clone, entries, idMap };
}

function isDescendant(node: THREE.Object3D, maybeAncestor: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = node.parent;
  while (cursor) {
    if (cursor === maybeAncestor) return true;
    cursor = cursor.parent;
  }
  return false;
}

function collectUserRoots(): ParentSnapshot[] {
  const snapshots: ParentSnapshot[] = [];
  const registered = new Set(sceneStore.getAllUserObjects().map((item) => sceneStore.getIdForObject(item)));
  for (const object of sceneStore.getAllUserObjects()) {
    const parentId = object.parent ? sceneStore.getIdForObject(object.parent) : null;
    if (parentId && registered.has(parentId)) continue;
    if (!object.parent) continue;
    snapshots.push({
      node: object,
      parent: object.parent,
      index: object.parent.children.indexOf(object),
    });
  }
  return snapshots;
}

function resolveSelectionIds(options?: { objectIds?: string[] }): string[] {
  if (options?.objectIds && options.objectIds.length > 0) {
    return [...new Set(options.objectIds)];
  }
  const selectedId = sceneStore.getSelectedId();
  return selectedId ? [selectedId] : [];
}

function asVector3Tuple(value: Vector3Tuple | undefined): Vector3Tuple | null {
  if (!value) return null;
  if (!Array.isArray(value) || value.length !== 3) return null;
  if (!value.every((part) => typeof part === "number" && Number.isFinite(part))) return null;
  return [value[0], value[1], value[2]];
}

function setVector3(target: THREE.Vector3 | THREE.Euler, value?: Vector3Tuple) {
  const tuple = asVector3Tuple(value);
  if (!tuple) return;
  target.set(tuple[0], tuple[1], tuple[2]);
}

function updateMeshMaterial(mesh: THREE.Mesh, material?: AddPrimitiveOptions["material"]) {
  if (!material || !(mesh.material instanceof THREE.MeshStandardMaterial)) return;
  if (typeof material.color === "number" && Number.isFinite(material.color)) {
    mesh.material.color.setHex(Math.max(0, Math.min(0xffffff, Math.round(material.color))));
  }
  if (typeof material.metallic === "number" && Number.isFinite(material.metallic)) {
    mesh.material.metalness = Math.max(0, Math.min(1, material.metallic));
  }
  if (typeof material.roughness === "number" && Number.isFinite(material.roughness)) {
    mesh.material.roughness = Math.max(0, Math.min(1, material.roughness));
  }
  mesh.material.needsUpdate = true;
}

export function isPrimitiveType(value: unknown): value is PrimitiveType {
  return value === "box" || value === "sphere" || value === "cone";
}

export function isLightKind(value: unknown): value is LightKind {
  return value === "directional" || value === "point" || value === "ambient";
}

export function addPrimitiveObject(type: PrimitiveType, options: AddPrimitiveOptions = {}): string | null {
  const scene = getCurrentScene();
  if (!scene) return null;

  const definition = PRIMITIVE_DEFINITIONS[type];
  const reserved = collectReservedIds();
  const objectId = reserveUniqueObjectId(reserved);
  const name = options.name?.trim() || createUniqueObjectName(definition.label);
  const position = computeSpawnPosition(getUserRootCount(), definition.y);
  const previousSelectedId = sceneStore.getSelectedId();

  const mesh = new THREE.Mesh(
    definition.createGeometry(),
    new THREE.MeshStandardMaterial({ color: definition.color }),
  );
  mesh.name = name;
  mesh.position.copy(position);
  setVector3(mesh.position, options.at?.position);
  setVector3(mesh.rotation, options.at?.rotation);
  setVector3(mesh.scale, options.at?.scale);
  updateMeshMaterial(mesh, options.material);

  undoStore.push({
    label: `Add ${definition.label}`,
    do() {
      scene.add(mesh);
      sceneStore.registerObject(mesh, objectId);
      sceneStore.setSelectedId(objectId);
      sceneStore.markDirty();
    },
    undo() {
      mesh.removeFromParent();
      sceneStore.unregisterObject(objectId);
      const restoreId = previousSelectedId && sceneStore.getObjectById(previousSelectedId)
        ? previousSelectedId
        : null;
      sceneStore.setSelectedId(restoreId);
    },
  });

  return objectId;
}

export function addCameraObject(options: AddCameraOptions = {}): string | null {
  const scene = getCurrentScene();
  if (!scene) return null;

  const reserved = collectReservedIds();
  const objectId = reserveUniqueObjectId(reserved);
  const previousSelectedId = sceneStore.getSelectedId();

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  camera.name = options.name?.trim() || createUniqueObjectName("Camera");
  camera.position.copy(computeSpawnPosition(getUserRootCount(), 1.5));
  setVector3(camera.position, options.position);

  const target = asVector3Tuple(options.target);
  if (target) {
    camera.lookAt(target[0], target[1], target[2]);
  }

  undoStore.push({
    label: "Add Camera",
    do() {
      scene.add(camera);
      sceneStore.registerObject(camera, objectId);
      sceneStore.setSelectedId(objectId);
      sceneStore.markDirty();
    },
    undo() {
      camera.removeFromParent();
      sceneStore.unregisterObject(objectId);
      const restoreId = previousSelectedId && sceneStore.getObjectById(previousSelectedId)
        ? previousSelectedId
        : null;
      sceneStore.setSelectedId(restoreId);
    },
  });

  return objectId;
}

export function addLightObject(kind: LightKind, options: AddLightOptions = {}): string | null {
  const scene = getCurrentScene();
  if (!scene) return null;

  const reserved = collectReservedIds();
  const objectId = reserveUniqueObjectId(reserved);
  const previousSelectedId = sceneStore.getSelectedId();
  const color = typeof options.color === "number" && Number.isFinite(options.color)
    ? Math.max(0, Math.min(0xffffff, Math.round(options.color)))
    : 0xffffff;
  const intensity = typeof options.intensity === "number" && Number.isFinite(options.intensity)
    ? Math.max(0, options.intensity)
    : kind === "ambient"
      ? 0.7
      : 1;

  const light = (() => {
    if (kind === "ambient") {
      return new THREE.AmbientLight(color, intensity);
    }
    if (kind === "point") {
      const point = new THREE.PointLight(color, intensity, 50);
      point.position.copy(computeSpawnPosition(getUserRootCount(), 2));
      setVector3(point.position, options.position);
      return point;
    }
    const directional = new THREE.DirectionalLight(color, intensity);
    directional.position.copy(computeSpawnPosition(getUserRootCount(), 3));
    setVector3(directional.position, options.position);
    return directional;
  })();

  light.name = options.name?.trim() || createUniqueObjectName(kind === "ambient" ? "Ambient Light" : kind === "point" ? "Point Light" : "Directional Light");

  undoStore.push({
    label: "Add Light",
    do() {
      scene.add(light);
      sceneStore.registerObject(light, objectId);
      sceneStore.setSelectedId(objectId);
      sceneStore.markDirty();
    },
    undo() {
      light.removeFromParent();
      sceneStore.unregisterObject(objectId);
      const restoreId = previousSelectedId && sceneStore.getObjectById(previousSelectedId)
        ? previousSelectedId
        : null;
      sceneStore.setSelectedId(restoreId);
    },
  });

  return objectId;
}

export function deleteSelectedObject(): string | null {
  const selectedId = sceneStore.getSelectedId();
  if (!selectedId) return null;
  return deleteObjectById(selectedId);
}

export function deleteObjectById(objectId: string): string | null {
  const scene = getCurrentScene();
  const selected = sceneStore.getObjectById(objectId);
  if (!scene || !selected) return null;

  const parent = selected.parent;
  if (!parent) return null;

  const insertIndex = parent.children.indexOf(selected);
  const entries = collectHierarchyEntries(selected);
  if (entries.length === 0) return null;

  const removedIds = new Set(entries.map((entry) => entry.id));
  const beforeClip = cloneClip(animationStore.getClip());
  const afterClip = removeTracksForIds(beforeClip, removedIds);
  const tracksChanged = !clipsEqual(beforeClip, afterClip);
  const selectedBefore = sceneStore.getSelectedId();

  undoStore.push({
    label: "Delete Object",
    do() {
      selected.removeFromParent();
      unregisterHierarchyEntries(entries);
      if (tracksChanged) {
        applyClip(afterClip);
      }
      sceneStore.setSelectedId(null);
    },
    undo() {
      insertChildAt(parent, selected, insertIndex);
      registerHierarchyEntries(entries);
      if (tracksChanged) {
        applyClip(beforeClip);
      }
      if (selectedBefore && sceneStore.getObjectById(selectedBefore)) {
        sceneStore.setSelectedId(selectedBefore);
      }
    },
  });

  return objectId;
}

export function clearUserObjects(): number {
  const roots = collectUserRoots();
  if (roots.length === 0) {
    return 0;
  }

  const entriesByRoot = roots.map((root) => collectHierarchyEntries(root.node));
  const removedIds = new Set(entriesByRoot.flatMap((entries) => entries.map((entry) => entry.id)));
  const beforeClip = cloneClip(animationStore.getClip());
  const afterClip = removeTracksForIds(beforeClip, removedIds);
  const tracksChanged = !clipsEqual(beforeClip, afterClip);
  const selectedBefore = sceneStore.getSelectedId();

  undoStore.push({
    label: "Clear User Objects",
    do() {
      for (const root of roots) {
        root.node.removeFromParent();
      }
      for (const entries of entriesByRoot) {
        unregisterHierarchyEntries(entries);
      }
      if (tracksChanged) {
        applyClip(afterClip);
      }
      sceneStore.setSelectedId(null);
    },
    undo() {
      for (const root of roots) {
        insertChildAt(root.parent, root.node, root.index);
      }
      for (const entries of entriesByRoot) {
        registerHierarchyEntries(entries);
      }
      if (tracksChanged) {
        applyClip(beforeClip);
      }
      if (selectedBefore && sceneStore.getObjectById(selectedBefore)) {
        sceneStore.setSelectedId(selectedBefore);
      }
    },
  });

  return roots.length;
}

export function duplicateSelectedObject(options: DuplicateOptions = {}): string | null {
  const scene = getCurrentScene();
  const selected = sceneStore.getSelectedObject();
  const selectedId = sceneStore.getSelectedId();
  if (!scene || !selected || !selectedId) return null;

  const parent = selected.parent ?? scene;
  const sourceIndex = parent.children.indexOf(selected);
  const insertIndex = sourceIndex >= 0 ? sourceIndex + 1 : parent.children.length;
  const previousSelectedId = selectedId;

  const { clone, entries, idMap } = cloneObjectForDuplicate(selected);
  if (entries.length === 0) return null;

  const cloneRootId = idMap.get(selectedId);
  if (!cloneRootId) return null;

  clone.name = createUniqueObjectName(toBaseName(selected.name || "Object", "Object"));

  const offset = asVector3Tuple(options.offset);
  if (offset) {
    clone.position.x += offset[0];
    clone.position.y += offset[1];
    clone.position.z += offset[2];
  }

  const beforeClip = cloneClip(animationStore.getClip());
  const afterClip = duplicateTracksForIdMap(beforeClip, idMap);
  const tracksChanged = !clipsEqual(beforeClip, afterClip);

  undoStore.push({
    label: "Duplicate Object",
    do() {
      insertChildAt(parent, clone, insertIndex);
      registerHierarchyEntries(entries);
      if (tracksChanged) {
        applyClip(afterClip);
      }
      sceneStore.setSelectedId(cloneRootId);
    },
    undo() {
      clone.removeFromParent();
      unregisterHierarchyEntries(entries);
      if (tracksChanged) {
        applyClip(beforeClip);
      }
      const restoreId = previousSelectedId && sceneStore.getObjectById(previousSelectedId)
        ? previousSelectedId
        : null;
      sceneStore.setSelectedId(restoreId);
    },
  });

  return cloneRootId;
}

export function selectObjectById(id: string | null): boolean {
  if (id === null) {
    sceneStore.setSelectedId(null);
    return true;
  }
  if (!sceneStore.getObjectById(id)) {
    return false;
  }
  sceneStore.setSelectedId(id);
  return true;
}

export function selectObjectByName(name: string):
  | { status: "ok"; objectId: string }
  | { status: "not_found" }
  | { status: "ambiguous"; candidates: string[] } {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return { status: "not_found" };
  }

  const matches = sceneStore
    .getSnapshot()
    .nodes
    .filter((node) => node.name.trim().toLowerCase() === normalized)
    .map((node) => node.id);

  if (matches.length === 0) {
    return { status: "not_found" };
  }

  if (matches.length > 1) {
    return { status: "ambiguous", candidates: matches };
  }

  const objectId = matches[0];
  sceneStore.setSelectedId(objectId);
  return { status: "ok", objectId };
}

export function parentObject(childId: string, parentId: string): boolean {
  if (childId === parentId) return false;

  const child = sceneStore.getObjectById(childId);
  const parent = sceneStore.getObjectById(parentId);
  if (!child || !parent) return false;

  if (isDescendant(parent, child)) return false;

  const oldParent = child.parent;
  if (!oldParent) return false;
  const oldIndex = oldParent.children.indexOf(child);
  const selectedBefore = sceneStore.getSelectedId();

  undoStore.push({
    label: "Parent Object",
    do() {
      parent.attach(child);
      sceneStore.notifyObjectsChanged();
      sceneStore.setSelectedId(selectedBefore);
    },
    undo() {
      insertChildAt(oldParent, child, oldIndex);
      sceneStore.notifyObjectsChanged();
      sceneStore.setSelectedId(selectedBefore);
    },
  });

  return true;
}

export function unparentObject(childId: string): boolean {
  const scene = getCurrentScene();
  const child = sceneStore.getObjectById(childId);
  if (!scene || !child || !child.parent) return false;

  const oldParent = child.parent;
  const oldIndex = oldParent.children.indexOf(child);
  const selectedBefore = sceneStore.getSelectedId();

  undoStore.push({
    label: "Unparent Object",
    do() {
      scene.attach(child);
      sceneStore.notifyObjectsChanged();
      sceneStore.setSelectedId(selectedBefore);
    },
    undo() {
      insertChildAt(oldParent, child, oldIndex);
      sceneStore.notifyObjectsChanged();
      sceneStore.setSelectedId(selectedBefore);
    },
  });

  return true;
}

export function groupObjects(options: GroupOptions = {}): string | null {
  const scene = getCurrentScene();
  if (!scene) return null;

  const ids = resolveSelectionIds(options);
  if (ids.length === 0) return null;

  const objects = ids
    .map((id) => sceneStore.getObjectById(id))
    .filter((value): value is THREE.Object3D => Boolean(value));
  if (objects.length === 0) return null;

  const reserved = collectReservedIds();
  const groupId = reserveUniqueObjectId(reserved);
  const group = new THREE.Group();
  group.name = options.name?.trim() || createUniqueObjectName("Group");

  const parent = objects[0]?.parent ?? scene;
  const insertIndex = objects[0] && objects[0].parent ? objects[0].parent.children.indexOf(objects[0]) : parent.children.length;

  const originals: ParentSnapshot[] = objects
    .filter((node) => node.parent)
    .map((node) => ({
      node,
      parent: node.parent as THREE.Object3D,
      index: (node.parent as THREE.Object3D).children.indexOf(node),
    }));

  undoStore.push({
    label: "Group Objects",
    do() {
      insertChildAt(parent, group, insertIndex);
      sceneStore.registerObject(group, groupId);
      for (const snapshot of originals) {
        group.attach(snapshot.node);
      }
      sceneStore.notifyObjectsChanged();
      sceneStore.setSelectedId(groupId);
    },
    undo() {
      for (const snapshot of originals) {
        insertChildAt(snapshot.parent, snapshot.node, snapshot.index);
      }
      group.removeFromParent();
      sceneStore.unregisterObject(groupId);
      sceneStore.notifyObjectsChanged();
      sceneStore.setSelectedId(originals[0] ? sceneStore.getIdForObject(originals[0].node) : null);
    },
  });

  return groupId;
}

export function ungroupObject(groupId: string, preserveWorldTransform = true): boolean {
  const scene = getCurrentScene();
  const group = sceneStore.getObjectById(groupId);
  if (!scene || !group || !(group instanceof THREE.Group)) return false;
  if (!group.parent) return false;

  const parent = group.parent;
  const groupIndex = parent.children.indexOf(group);
  const children = [...group.children];
  const childEntries = collectHierarchyEntriesWithIds(group).filter((entry) => entry.node !== group);

  undoStore.push({
    label: "Ungroup Objects",
    do() {
      let insertionIndex = groupIndex;
      for (const child of children) {
        if (preserveWorldTransform) {
          parent.attach(child);
          insertChildAt(parent, child, insertionIndex);
        } else {
          parent.add(child);
          insertChildAt(parent, child, insertionIndex);
        }
        insertionIndex += 1;
      }
      group.removeFromParent();
      sceneStore.unregisterObject(groupId);
      sceneStore.notifyObjectsChanged();
      sceneStore.setSelectedId(children.length > 0 ? sceneStore.getIdForObject(children[0]) : null);
    },
    undo() {
      insertChildAt(parent, group, groupIndex);
      sceneStore.registerObject(group, groupId);
      for (const childEntry of childEntries) {
        group.attach(childEntry.node);
      }
      sceneStore.notifyObjectsChanged();
      sceneStore.setSelectedId(groupId);
    },
  });

  return true;
}
