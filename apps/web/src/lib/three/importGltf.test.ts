import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { summarizeImportedScene, validateImportBudget } from "./importGltf.js";

describe("importGltf summary and budget", () => {
  it("summarizes nodes, meshes, materials, and unique textures", () => {
    const root = new THREE.Group();
    const texture = new THREE.Texture();

    const materialA = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    materialA.map = texture;
    materialA.normalMap = texture;
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(), materialA);

    const materialB = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    materialB.map = texture;
    const meshB = new THREE.Mesh(new THREE.SphereGeometry(), materialB);

    root.add(meshA);
    root.add(meshB);

    const summary = summarizeImportedScene(root);
    expect(summary.nodes).toBe(3);
    expect(summary.meshes).toBe(2);
    expect(summary.materials).toBe(2);
    expect(summary.textures).toBe(1);
  });

  it("rejects import summary when node budget is exceeded", () => {
    const result = validateImportBudget(
      { nodes: 15, meshes: 6, materials: 4, textures: 2 },
      { maxNodes: 10, maxTextures: 8 },
    );
    expect(result).toContain("node budget");
  });

  it("rejects import summary when texture budget is exceeded", () => {
    const result = validateImportBudget(
      { nodes: 15, meshes: 6, materials: 4, textures: 12 },
      { maxNodes: 100, maxTextures: 8 },
    );
    expect(result).toContain("texture budget");
  });
});
