import * as THREE from "three";

/**
 * Compute a bounding sphere that encloses the given objects.
 * Returns null if the list is empty.
 */
export function computeBoundingSphere(
  objects: THREE.Object3D[],
): THREE.Sphere | null {
  if (objects.length === 0) return null;

  const box = new THREE.Box3();
  for (const obj of objects) {
    box.expandByObject(obj);
  }

  if (box.isEmpty()) return null;

  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  return sphere;
}

/**
 * Compute camera position and target to frame a bounding sphere within a
 * perspective camera's field of view.
 *
 * Returns { position, target } the camera should move to.
 */
export function frameSphere(
  sphere: THREE.Sphere,
  camera: THREE.PerspectiveCamera,
): { position: THREE.Vector3; target: THREE.Vector3 } {
  const fov = camera.fov * (Math.PI / 180);
  const halfFov = fov / 2;
  const distance = sphere.radius / Math.sin(halfFov);

  // Maintain current camera direction
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);

  const target = sphere.center.clone();
  const position = target.clone().sub(direction.multiplyScalar(distance));

  return { position, target };
}
