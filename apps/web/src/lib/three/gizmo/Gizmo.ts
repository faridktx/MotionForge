import * as THREE from "three";
import { pickGizmoHandle } from "./picking.js";
import { projectOntoPlane, getAxisPlaneNormal } from "./math.js";

export type GizmoMode = "translate" | "rotate" | "scale";

export interface GizmoCallbacks {
  onDragStart?: () => void;
  onDrag?: () => void;
  onDragEnd?: () => void;
  onCancel?: () => void;
}

const AXIS_COLORS = {
  x: 0xcc4444,
  y: 0x44cc44,
  z: 0x4488ff,
};

/**
 * Simple transform gizmo using Three.js primitives.
 * Supports translate and rotate modes.
 */
export class Gizmo {
  readonly root = new THREE.Group();
  private target: THREE.Object3D | null = null;
  private mode: GizmoMode = "translate";
  private camera: THREE.Camera;
  private canvas: HTMLCanvasElement;
  private callbacks: GizmoCallbacks;

  // Handles per mode
  private translateGroup = new THREE.Group();
  private rotateGroup = new THREE.Group();
  private scaleGroup = new THREE.Group();

  // Drag state
  private dragging = false;
  private activeAxis: "x" | "y" | "z" | null = null;
  private dragStartWorldPos = new THREE.Vector3();
  private dragStartObjPos = new THREE.Vector3();
  private dragStartObjRot = new THREE.Euler();
  private dragStartObjScale = new THREE.Vector3();
  private dragStartAngle = 0;

  // Bound handlers
  private _onPointerDown: (e: PointerEvent) => void;
  private _onPointerMove: (e: PointerEvent) => void;
  private _onPointerUp: (e: PointerEvent) => void;

  constructor(camera: THREE.Camera, canvas: HTMLCanvasElement, callbacks: GizmoCallbacks = {}) {
    this.camera = camera;
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.root.name = "__gizmo";
    this.root.renderOrder = 999;

    this.buildTranslateHandles();
    this.buildRotateHandles();
    this.buildScaleHandles();

    this.root.add(this.translateGroup);
    this.root.add(this.rotateGroup);
    this.root.add(this.scaleGroup);
    this.updateVisibility();

    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerMove = this.onPointerMove.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);

    canvas.addEventListener("pointerdown", this._onPointerDown);
    canvas.addEventListener("pointermove", this._onPointerMove);
    canvas.addEventListener("pointerup", this._onPointerUp);
  }

  private buildTranslateHandles() {
    for (const axis of ["x", "y", "z"] as const) {
      const color = AXIS_COLORS[axis];
      const group = new THREE.Group();
      group.name = `gizmo_translate_${axis}`;

      // Shaft
      const shaftGeo = new THREE.CylinderGeometry(0.02, 0.02, 1, 8);
      const shaftMat = new THREE.MeshBasicMaterial({ color, depthTest: false });
      const shaft = new THREE.Mesh(shaftGeo, shaftMat);
      shaft.position.y = 0.5;
      group.add(shaft);

      // Cone tip
      const coneGeo = new THREE.ConeGeometry(0.06, 0.2, 12);
      const coneMat = new THREE.MeshBasicMaterial({ color, depthTest: false });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.y = 1.1;
      group.add(cone);

      // Orient
      if (axis === "x") group.rotation.z = -Math.PI / 2;
      if (axis === "z") group.rotation.x = Math.PI / 2;

      this.translateGroup.add(group);
    }
  }

  private buildRotateHandles() {
    for (const axis of ["x", "y", "z"] as const) {
      const color = AXIS_COLORS[axis];
      const geo = new THREE.TorusGeometry(0.8, 0.02, 8, 48);
      const mat = new THREE.MeshBasicMaterial({ color, depthTest: false });
      const torus = new THREE.Mesh(geo, mat);
      torus.name = `gizmo_rotate_${axis}`;

      if (axis === "x") torus.rotation.y = Math.PI / 2;
      if (axis === "z") { /* default orientation */ }
      if (axis === "y") torus.rotation.x = Math.PI / 2;

      this.rotateGroup.add(torus);
    }
  }

  private buildScaleHandles() {
    for (const axis of ["x", "y", "z"] as const) {
      const color = AXIS_COLORS[axis];
      const group = new THREE.Group();
      group.name = `gizmo_scale_${axis}`;

      const shaftGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 8);
      const shaftMat = new THREE.MeshBasicMaterial({ color, depthTest: false });
      const shaft = new THREE.Mesh(shaftGeo, shaftMat);
      shaft.position.y = 0.4;
      group.add(shaft);

      const cubeGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      const cubeMat = new THREE.MeshBasicMaterial({ color, depthTest: false });
      const cube = new THREE.Mesh(cubeGeo, cubeMat);
      cube.position.y = 0.85;
      group.add(cube);

      if (axis === "x") group.rotation.z = -Math.PI / 2;
      if (axis === "z") group.rotation.x = Math.PI / 2;

      this.scaleGroup.add(group);
    }
  }

  private updateVisibility() {
    this.translateGroup.visible = this.mode === "translate";
    this.rotateGroup.visible = this.mode === "rotate";
    this.scaleGroup.visible = this.mode === "scale";
  }

  attach(obj: THREE.Object3D) {
    this.target = obj;
    this.root.visible = true;
    this.syncPosition();
  }

  detach() {
    this.target = null;
    this.root.visible = false;
    if (this.dragging) this.cancelDrag();
  }

  setMode(mode: GizmoMode) {
    this.mode = mode;
    this.updateVisibility();
  }

  getMode(): GizmoMode {
    return this.mode;
  }

  syncPosition() {
    if (!this.target) return;
    this.root.position.copy(this.target.position);
  }

  isDragging(): boolean {
    return this.dragging;
  }

  getHandleMeshes(): THREE.Object3D[] {
    const active =
      this.mode === "translate" ? this.translateGroup :
      this.mode === "rotate" ? this.rotateGroup :
      this.scaleGroup;
    return active.children;
  }

  private onPointerDown(e: PointerEvent) {
    if (e.button !== 0 || !this.target || !this.root.visible) return;

    const handle = pickGizmoHandle(e, this.camera, this.canvas, this.getHandleMeshes());
    if (!handle) return;

    const parts = handle.split("_");
    const axis = parts[2] as "x" | "y" | "z";
    if (!axis) return;

    this.dragging = true;
    this.activeAxis = axis;
    this.dragStartObjPos.copy(this.target.position);
    this.dragStartObjRot.copy(this.target.rotation);
    this.dragStartObjScale.copy(this.target.scale);

    if (this.mode === "translate" || this.mode === "scale") {
      const camDir = new THREE.Vector3();
      this.camera.getWorldDirection(camDir);
      const planeNormal = getAxisPlaneNormal(axis, camDir);
      const hit = projectOntoPlane(e, this.camera, this.canvas, this.target.position, planeNormal);
      if (hit) this.dragStartWorldPos.copy(hit);
    } else if (this.mode === "rotate") {
      this.dragStartAngle = this.getRotateAngle(e);
    }

    this.callbacks.onDragStart?.();
    e.stopPropagation();
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.dragging || !this.target || !this.activeAxis) return;

    if (this.mode === "translate") {
      const camDir = new THREE.Vector3();
      this.camera.getWorldDirection(camDir);
      const planeNormal = getAxisPlaneNormal(this.activeAxis, camDir);
      const hit = projectOntoPlane(e, this.camera, this.canvas, this.dragStartObjPos, planeNormal);
      if (!hit) return;

      const delta = hit.clone().sub(this.dragStartWorldPos);
      const axisIdx = this.activeAxis === "x" ? 0 : this.activeAxis === "y" ? 1 : 2;
      const axisDelta = delta.getComponent(axisIdx);

      this.target.position.copy(this.dragStartObjPos);
      this.target.position.setComponent(axisIdx, this.dragStartObjPos.getComponent(axisIdx) + axisDelta);
    } else if (this.mode === "rotate") {
      const angle = this.getRotateAngle(e);
      const delta = angle - this.dragStartAngle;
      this.target.rotation.copy(this.dragStartObjRot);
      this.target.rotation[this.activeAxis] = this.dragStartObjRot[this.activeAxis] + delta;
    } else if (this.mode === "scale") {
      const camDir = new THREE.Vector3();
      this.camera.getWorldDirection(camDir);
      const planeNormal = getAxisPlaneNormal(this.activeAxis, camDir);
      const hit = projectOntoPlane(e, this.camera, this.canvas, this.dragStartObjPos, planeNormal);
      if (!hit) return;

      const delta = hit.clone().sub(this.dragStartWorldPos);
      const axisIdx = this.activeAxis === "x" ? 0 : this.activeAxis === "y" ? 1 : 2;
      const axisDelta = delta.getComponent(axisIdx);

      this.target.scale.copy(this.dragStartObjScale);
      const newScale = Math.max(0.001, this.dragStartObjScale.getComponent(axisIdx) + axisDelta);
      this.target.scale.setComponent(axisIdx, newScale);
    }

    this.syncPosition();
    this.callbacks.onDrag?.();
  }

  private onPointerUp() {
    if (!this.dragging) return;
    this.dragging = false;
    this.activeAxis = null;
    this.callbacks.onDragEnd?.();
  }

  cancelDrag() {
    if (!this.dragging || !this.target) return;
    this.target.position.copy(this.dragStartObjPos);
    this.target.rotation.copy(this.dragStartObjRot);
    this.target.scale.copy(this.dragStartObjScale);
    this.dragging = false;
    this.activeAxis = null;
    this.syncPosition();
    this.callbacks.onCancel?.();
  }

  private getRotateAngle(e: PointerEvent): number {
    if (!this.target) return 0;
    // Project object center to screen, compute angle from that
    const center = this.target.position.clone().project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    const cx = ((center.x + 1) / 2) * rect.width;
    const cy = ((-center.y + 1) / 2) * rect.height;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    return Math.atan2(my - cy, mx - cx);
  }

  dispose() {
    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    this.canvas.removeEventListener("pointermove", this._onPointerMove);
    this.canvas.removeEventListener("pointerup", this._onPointerUp);

    this.root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
    });
  }
}
