import * as THREE from "three";

const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();

/**
 * Pick the closest gizmo handle mesh from a pointer event.
 * Returns the mesh name (e.g. "translate_x") or null.
 */
export function pickGizmoHandle(
  event: PointerEvent,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  handleMeshes: THREE.Object3D[],
): string | null {
  const rect = canvas.getBoundingClientRect();
  _pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  _pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  _raycaster.setFromCamera(_pointer, camera);
  // Increase threshold for thin geometries
  _raycaster.params.Line = { threshold: 0.15 };

  const hits = _raycaster.intersectObjects(handleMeshes, true);
  if (hits.length > 0) {
    // Walk up to find the named handle
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj) {
      if (obj.name && obj.name.startsWith("gizmo_")) return obj.name;
      obj = obj.parent;
    }
  }
  return null;
}
