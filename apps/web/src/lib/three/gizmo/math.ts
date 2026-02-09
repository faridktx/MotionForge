import * as THREE from "three";

const _plane = new THREE.Plane();
const _intersection = new THREE.Vector3();

/**
 * Project a pointer event onto a plane passing through `planePoint`
 * with the given `planeNormal`, from camera. Returns the world-space hit.
 */
export function projectOntoPlane(
  event: PointerEvent,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  planePoint: THREE.Vector3,
  planeNormal: THREE.Vector3,
): THREE.Vector3 | null {
  const rect = canvas.getBoundingClientRect();
  const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);

  _plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);
  const hit = raycaster.ray.intersectPlane(_plane, _intersection);
  return hit ? _intersection.clone() : null;
}

/**
 * Get the camera-facing plane normal for a given axis.
 * Used for translate gizmo: constrains movement to an axis by picking
 * the best plane to project onto.
 */
export function getAxisPlaneNormal(
  axis: "x" | "y" | "z",
  cameraDirection: THREE.Vector3,
): THREE.Vector3 {
  const axisVec = new THREE.Vector3(
    axis === "x" ? 1 : 0,
    axis === "y" ? 1 : 0,
    axis === "z" ? 1 : 0,
  );
  // Choose plane normal perpendicular to axis that faces camera most
  const cross = new THREE.Vector3().crossVectors(axisVec, cameraDirection);
  const normal = new THREE.Vector3().crossVectors(axisVec, cross).normalize();
  return normal;
}
