import { addTransformKeyframes, createEmptyClip } from "@motionforge/engine";
import { beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { assetStore } from "../../state/assetStore.js";
import { animationStore } from "../../state/animationStore.js";
import { sceneStore } from "../../state/sceneStore.js";
import { timelineStore } from "../../state/timelineStore.js";
import { undoStore } from "../../state/undoStore.js";
import type { ProjectData } from "./serialize.js";
import { deserializeProject } from "./deserialize.js";

function setupLiveScene() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  const target = new THREE.Vector3(0, 0, 0);
  sceneStore.setScene(scene, camera, target);
  sceneStore.clearRegistry();
  sceneStore.setSelectedId(null);
  assetStore.clearAssets();
  animationStore.reset();
  undoStore.clear();
  timelineStore.clearAllUiState();
  sceneStore.clearDirty();
  return { scene, camera, target };
}

function seedLiveState() {
  const { scene } = setupLiveScene();
  const liveMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x3366aa }),
  );
  liveMesh.name = "LiveCube";
  liveMesh.position.set(1, 2, 3);
  scene.add(liveMesh);
  sceneStore.registerObject(liveMesh, "live_obj");

  const clip = createEmptyClip(4);
  addTransformKeyframes(clip, "live_obj", "position", 0, { x: 1, y: 2, z: 3 });
  addTransformKeyframes(clip, "live_obj", "position", 2, { x: 4, y: 5, z: 6 });
  animationStore.setClip(clip, { markDirty: false });

  assetStore.addAsset({
    id: "live_asset",
    name: "live.glb",
    type: "gltf",
    source: { mode: "embedded", fileName: "live.glb", data: "AA==" },
    size: 2,
  });
  sceneStore.clearDirty();
}

function captureLiveState() {
  return {
    snapshot: sceneStore.getSnapshot(),
    assets: assetStore.getAssets(),
    clip: animationStore.getClip(),
    dirty: sceneStore.isDirty(),
  };
}

describe("deserializeProject dry-run safety", () => {
  beforeEach(() => {
    seedLiveState();
  });

  it("keeps live state unchanged when project is invalid for model references", async () => {
    const before = captureLiveState();
    const invalidProject: ProjectData = {
      version: 3,
      objects: [],
      assets: [],
      modelInstances: [
        {
          id: "model_1",
          name: "BrokenModel",
          assetId: "missing_asset",
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
    };

    await expect(deserializeProject(invalidProject)).rejects.toThrow("modelInstances[0].assetId");
    const after = captureLiveState();
    expect(after.snapshot).toEqual(before.snapshot);
    expect(after.assets).toEqual(before.assets);
    expect(after.clip).toEqual(before.clip);
    expect(after.dirty).toBe(false);
  });

  it("loads a valid project and restores equivalent output", async () => {
    const project: ProjectData = {
      version: 2,
      objects: [
        {
          id: "obj_1",
          name: "Cube",
          geometryType: "box",
          color: 0xff0000,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
      camera: {
        position: [3, 4, 5],
        target: [0, 1, 0],
        fov: 45,
      },
      animation: {
        durationSeconds: 6,
        tracks: [
          {
            objectId: "obj_1",
            property: "position.x",
            keyframes: [
              { time: 0, value: 0, interpolation: "linear" },
              { time: 3, value: 10, interpolation: "linear" },
            ],
          },
        ],
      },
    };

    const created = await deserializeProject(project);
    expect(created).toHaveLength(1);

    const snapshot = sceneStore.getSnapshot();
    expect(snapshot.nodes).toHaveLength(1);
    expect(snapshot.nodes[0]?.id).toBe("obj_1");
    expect(snapshot.nodes[0]?.name).toBe("Cube");

    expect(assetStore.getAssets()).toEqual([]);
    const loadedClip = animationStore.getClip();
    expect(loadedClip.durationSeconds).toBe(project.animation?.durationSeconds);
    expect(loadedClip.tracks).toHaveLength(1);
    expect(loadedClip.tracks[0]).toMatchObject({
      objectId: "obj_1",
      property: "position.x",
      keyframes: project.animation?.tracks[0]?.keyframes,
    });
    const withBindPath = loadedClip.tracks[0] as unknown as { bindPath?: string };
    expect(withBindPath.bindPath).toBe("Cube");
    expect(sceneStore.getCamera()?.fov).toBe(45);
  });

  it("keeps live state unchanged on mid-deserialize failure", async () => {
    const before = captureLiveState();
    const project: ProjectData = {
      version: 3,
      objects: [
        {
          id: "obj_new",
          name: "StagedOnly",
          geometryType: "box",
          color: 0x888888,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
      assets: [
        {
          id: "asset_bad",
          name: "bad.glb",
          type: "gltf",
          source: {
            mode: "embedded",
            fileName: "bad.glb",
            data: "###not_base64###",
          },
          size: 32,
        },
      ],
      modelInstances: [
        {
          id: "obj_model",
          name: "BadModel",
          assetId: "asset_bad",
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
    };

    await expect(deserializeProject(project)).rejects.toThrow();
    const after = captureLiveState();
    expect(after.snapshot).toEqual(before.snapshot);
    expect(after.assets).toEqual(before.assets);
    expect(after.clip).toEqual(before.clip);
    expect(after.dirty).toBe(false);
  });

  it("keeps live state unchanged when migrated legacy input is invalid", async () => {
    const before = captureLiveState();
    const legacyBadInput = {
      version: 1,
      objects: [
        {
          id: "obj_legacy",
          name: "LegacyBroken",
          geometryType: "invalid-geo",
          color: 0xffffff,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
    };

    await expect(deserializeProject(legacyBadInput as unknown as ProjectData)).rejects.toThrow();
    const after = captureLiveState();
    expect(after.snapshot).toEqual(before.snapshot);
    expect(after.assets).toEqual(before.assets);
    expect(after.clip).toEqual(before.clip);
    expect(after.dirty).toBe(false);
  });
});
