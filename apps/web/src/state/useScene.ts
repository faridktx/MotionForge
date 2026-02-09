import { useEffect, useState, useCallback } from "react";
import { sceneStore, type SceneSnapshot } from "./sceneStore.js";

/**
 * Subscribe to the scene object list. Returns a snapshot that updates
 * when objects are added, removed, or renamed.
 */
export function useSceneObjects(): SceneSnapshot {
  const [snap, setSnap] = useState(() => sceneStore.getSnapshot());

  useEffect(() => {
    const update = () => setSnap(sceneStore.getSnapshot());
    const unsub1 = sceneStore.subscribe("objects", update);
    const unsub2 = sceneStore.subscribe("selection", update);
    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  return snap;
}

/**
 * Subscribe to the selected object ID only.
 */
export function useSelectedId(): string | null {
  const [id, setId] = useState(() => sceneStore.getSelectedId());

  useEffect(() => {
    return sceneStore.subscribe("selection", () => {
      setId(sceneStore.getSelectedId());
    });
  }, []);

  return id;
}

/**
 * Subscribe to transform changes for the currently selected object.
 * Returns a snapshot of the transform, or null if nothing is selected.
 */
export interface TransformSnapshot {
  name: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function snapshotTransform(id: string | null): TransformSnapshot | null {
  if (!id) return null;
  const obj = sceneStore.getObjectById(id);
  if (!obj) return null;
  const toDeg = 180 / Math.PI;
  return {
    name: obj.name || "(unnamed)",
    position: {
      x: round(obj.position.x),
      y: round(obj.position.y),
      z: round(obj.position.z),
    },
    rotation: {
      x: round(obj.rotation.x * toDeg),
      y: round(obj.rotation.y * toDeg),
      z: round(obj.rotation.z * toDeg),
    },
    scale: {
      x: round(obj.scale.x),
      y: round(obj.scale.y),
      z: round(obj.scale.z),
    },
  };
}

export function useSelectedTransform(): TransformSnapshot | null {
  const selectedId = useSelectedId();
  const [snap, setSnap] = useState<TransformSnapshot | null>(() =>
    snapshotTransform(selectedId),
  );

  const refresh = useCallback(() => {
    setSnap(snapshotTransform(sceneStore.getSelectedId()));
  }, []);

  useEffect(() => {
    refresh();
    const unsub1 = sceneStore.subscribe("selection", refresh);
    const unsub2 = sceneStore.subscribe("transform", refresh);
    return () => {
      unsub1();
      unsub2();
    };
  }, [refresh]);

  return snap;
}

/**
 * Subscribe to dirty state.
 */
export function useDirtyState(): boolean {
  const [dirty, setDirty] = useState(() => sceneStore.isDirty());

  useEffect(() => {
    return sceneStore.subscribeDirty(() => setDirty(sceneStore.isDirty()));
  }, []);

  return dirty;
}
