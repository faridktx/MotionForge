import { beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { sceneStore } from "./sceneStore.js";

describe("sceneStore.setScene", () => {
  beforeEach(() => {
    sceneStore.clearRegistry();
    sceneStore.setSelectedId(null);
  });

  it("clears stale object registry entries when replacing scene bindings", () => {
    const staleObject = new THREE.Object3D();
    sceneStore.registerObject(staleObject, "stale");
    sceneStore.setSelectedId("stale");

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    const target = new THREE.Vector3();
    sceneStore.setScene(scene, camera, target);

    expect(sceneStore.getObjectById("stale")).toBeUndefined();
    expect(sceneStore.getSnapshot().nodes).toEqual([]);
    expect(sceneStore.getSelectedId()).toBeNull();
  });

  it("stores current scene, camera, and controls target", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 2, 0.1, 1000);
    const target = new THREE.Vector3(1, 2, 3);

    sceneStore.setScene(scene, camera, target);

    expect(sceneStore.getScene()).toBe(scene);
    expect(sceneStore.getCamera()).toBe(camera);
    expect(sceneStore.getControlsTarget()).toBe(target);
  });
});
