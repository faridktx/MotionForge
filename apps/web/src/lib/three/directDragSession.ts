import * as THREE from "three";
import { sceneStore } from "../../state/sceneStore.js";
import { undoStore } from "../../state/undoStore.js";
import { computeDragDelta, snapDragDelta, type DirectDragPlaneMode } from "./directDrag.js";

const EPSILON = 1e-6;

export interface DirectDragSessionOptions {
  object: THREE.Object3D;
  label?: string;
  startGroundHit: THREE.Vector3;
  startCameraHit: THREE.Vector3;
  snapStep?: number;
}

export interface DirectDragUpdate {
  mode: DirectDragPlaneMode;
  currentHit: THREE.Vector3;
  snapEnabled: boolean;
}

function positionsEqual(a: THREE.Vector3, b: THREE.Vector3): boolean {
  return (
    Math.abs(a.x - b.x) < EPSILON &&
    Math.abs(a.y - b.y) < EPSILON &&
    Math.abs(a.z - b.z) < EPSILON
  );
}

export class DirectDragSession {
  private readonly object: THREE.Object3D;
  private readonly label: string;
  private readonly startLocalPosition = new THREE.Vector3();
  private readonly currentLocalPosition = new THREE.Vector3();
  private readonly startWorldPosition = new THREE.Vector3();
  private readonly startGroundHit = new THREE.Vector3();
  private readonly startCameraHit = new THREE.Vector3();
  private readonly snapStep: number;
  private finished = false;

  constructor(options: DirectDragSessionOptions) {
    this.object = options.object;
    this.label = options.label ?? "Direct Drag";
    this.startLocalPosition.copy(options.object.position);
    this.currentLocalPosition.copy(options.object.position);
    this.object.updateWorldMatrix(true, false);
    this.object.getWorldPosition(this.startWorldPosition);
    this.startGroundHit.copy(options.startGroundHit);
    this.startCameraHit.copy(options.startCameraHit);
    this.snapStep = options.snapStep ?? 0.1;
  }

  getAnchorPosition(): THREE.Vector3 {
    return this.startWorldPosition.clone();
  }

  update(update: DirectDragUpdate): boolean {
    if (this.finished) return false;
    const startHit = update.mode === "ground" ? this.startGroundHit : this.startCameraHit;
    const rawDelta = computeDragDelta(startHit, update.currentHit);
    const delta = update.snapEnabled ? snapDragDelta(rawDelta, this.snapStep) : rawDelta;

    const nextWorldPosition = this.startWorldPosition.clone().add(delta);
    if (update.mode === "ground") {
      nextWorldPosition.y = this.startWorldPosition.y;
    }

    if (this.object.parent) {
      this.object.parent.updateWorldMatrix(true, false);
      this.currentLocalPosition.copy(this.object.parent.worldToLocal(nextWorldPosition));
    } else {
      this.currentLocalPosition.copy(nextWorldPosition);
    }

    this.object.position.copy(this.currentLocalPosition);
    sceneStore.notifyTransformChanged({ markDirty: false });
    return !positionsEqual(this.currentLocalPosition, this.startLocalPosition);
  }

  commit(): boolean {
    if (this.finished) return false;
    this.finished = true;
    if (positionsEqual(this.currentLocalPosition, this.startLocalPosition)) {
      sceneStore.notifyTransformChanged({ markDirty: false });
      return false;
    }

    const ref = this.object;
    const start = this.startLocalPosition.clone();
    const end = this.currentLocalPosition.clone();

    undoStore.pushExecuted({
      label: this.label,
      do() {
        ref.position.copy(end);
        sceneStore.notifyTransformChanged();
      },
      undo() {
        ref.position.copy(start);
        sceneStore.notifyTransformChanged();
      },
    });

    sceneStore.markDirty();
    sceneStore.notifyTransformChanged({ markDirty: false });
    return true;
  }

  cancel() {
    if (this.finished) return;
    this.finished = true;
    this.currentLocalPosition.copy(this.startLocalPosition);
    this.object.position.copy(this.startLocalPosition);
    sceneStore.notifyTransformChanged({ markDirty: false });
  }
}
