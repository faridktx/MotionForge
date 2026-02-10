import * as THREE from "three";

/**
 * Recursively dispose all geometries and materials on an Object3D and its children.
 * Does not remove the object from its parent.
 */
export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      disposeMaterial(child.material);
    }
  });
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    material.forEach((m) => m.dispose());
  } else {
    const maps = material as THREE.Material & {
      map?: THREE.Texture;
      normalMap?: THREE.Texture;
      roughnessMap?: THREE.Texture;
      metalnessMap?: THREE.Texture;
      emissiveMap?: THREE.Texture;
      aoMap?: THREE.Texture;
      alphaMap?: THREE.Texture;
      bumpMap?: THREE.Texture;
      displacementMap?: THREE.Texture;
      envMap?: THREE.Texture;
    };

    maps.map?.dispose();
    maps.normalMap?.dispose();
    maps.roughnessMap?.dispose();
    maps.metalnessMap?.dispose();
    maps.emissiveMap?.dispose();
    maps.aoMap?.dispose();
    maps.alphaMap?.dispose();
    maps.bumpMap?.dispose();
    maps.displacementMap?.dispose();
    maps.envMap?.dispose();
    material.dispose();
  }
}
