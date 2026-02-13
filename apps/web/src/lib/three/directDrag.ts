import {
  computeDragDelta as computeEngineDragDelta,
  createPlaneFromPointAndNormal,
  intersectRayWithPlane,
  snapDelta,
  type PlaneEquation,
} from "@motionforge/engine";
import * as THREE from "three";

export type DirectDragPlaneMode = "ground" | "camera";

const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const CAMERA_NORMAL_FALLBACK = new THREE.Vector3(0, 0, -1);

function toPlane(point: THREE.Vector3, normal: THREE.Vector3): PlaneEquation {
  return createPlaneFromPointAndNormal(
    { x: point.x, y: point.y, z: point.z },
    { x: normal.x, y: normal.y, z: normal.z },
  );
}

export function computeDragPlane(
  camera: THREE.Camera,
  anchorPoint: THREE.Vector3,
  mode: DirectDragPlaneMode,
): PlaneEquation {
  if (mode === "ground") {
    return toPlane(anchorPoint, new THREE.Vector3(0, 1, 0));
  }
  const normal = new THREE.Vector3();
  camera.getWorldDirection(normal);
  if (normal.lengthSq() < 1e-8) {
    normal.copy(CAMERA_NORMAL_FALLBACK);
  }
  return toPlane(anchorPoint, normal.normalize());
}

export function pointerRayToPlaneIntersection(
  event: PointerEvent,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  plane: PlaneEquation,
): THREE.Vector3 | null {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hit = intersectRayWithPlane(
    {
      x: raycaster.ray.origin.x,
      y: raycaster.ray.origin.y,
      z: raycaster.ray.origin.z,
    },
    {
      x: raycaster.ray.direction.x,
      y: raycaster.ray.direction.y,
      z: raycaster.ray.direction.z,
    },
    plane,
  );
  if (!hit) {
    return null;
  }
  return new THREE.Vector3(hit.x, hit.y, hit.z);
}

export function computeDragDelta(startHit: THREE.Vector3, currentHit: THREE.Vector3): THREE.Vector3 {
  const delta = computeEngineDragDelta(
    { x: startHit.x, y: startHit.y, z: startHit.z },
    { x: currentHit.x, y: currentHit.y, z: currentHit.z },
  );
  return new THREE.Vector3(delta.x, delta.y, delta.z);
}

export function snapDragDelta(delta: THREE.Vector3, increment: number): THREE.Vector3 {
  const snapped = snapDelta(
    { x: delta.x, y: delta.y, z: delta.z },
    increment,
  );
  return new THREE.Vector3(snapped.x, snapped.y, snapped.z);
}
