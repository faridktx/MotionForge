import * as THREE from "three";

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

/**
 * Given a mouse event on the canvas, find the first intersected Mesh
 * from the provided list of selectable objects.
 */
export function raycastSelection(
  event: MouseEvent,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  selectables: THREE.Object3D[],
): THREE.Object3D | null {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(selectables, false);

  return hits.length > 0 ? hits[0].object : null;
}
