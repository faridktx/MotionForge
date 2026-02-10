import { describe, expect, it } from "vitest";
import { LATEST_PROJECT_VERSION, migrateProjectDataToLatest } from "./projectMigrations.js";

describe("project migrations", () => {
  it("migrates v1 payload to latest version", () => {
    const v1 = {
      version: 1,
      objects: [],
    };
    const migrated = migrateProjectDataToLatest(v1);
    expect(migrated.version).toBe(LATEST_PROJECT_VERSION);
    expect(migrated.applied).toEqual(["v1->v2", "v2->v3", "v3->v4"]);
    expect(v1.version).toBe(1);
  });

  it("migrates v2 payload to latest version while preserving animation", () => {
    const v2 = {
      version: 2,
      objects: [],
      animation: {
        durationSeconds: 2,
        tracks: [],
      },
    };
    const migrated = migrateProjectDataToLatest(v2);
    expect(migrated.version).toBe(LATEST_PROJECT_VERSION);
    const animation = migrated.data.animation as {
      durationSeconds: number;
      tracks: unknown[];
      takes?: Array<{ id: string; name: string; startTime: number; endTime: number }>;
    };
    expect(animation.durationSeconds).toBe(2);
    expect(animation.tracks).toEqual([]);
    expect(animation.takes).toEqual([
      { id: "take_main", name: "Main", startTime: 0, endTime: 2 },
    ]);
    expect(migrated.applied).toEqual(["v2->v3", "v3->v4"]);
  });

  it("keeps latest version data unchanged", () => {
    const v4 = {
      version: 4,
      objects: [{ id: "obj_1", name: "Cube" }],
    };
    const migrated = migrateProjectDataToLatest(v4);
    expect(migrated.version).toBe(4);
    expect(migrated.applied).toEqual([]);
    expect((migrated.data.objects as Array<{ bindPath?: string }>)[0]?.bindPath).toBe("Cube");
  });

  it("synthesizes bindPath for v1 fixture objects", () => {
    const v1 = {
      version: 1,
      objects: [{ id: "obj_1", name: "Cube One" }],
    };
    const migrated = migrateProjectDataToLatest(v1);
    const object = (migrated.data.objects as Array<{ bindPath?: string }>)[0];
    expect(object?.bindPath).toBe("Cube_One");
  });

  it("synthesizes bindPath for v2 fixture objects", () => {
    const v2 = {
      version: 2,
      objects: [{ id: "obj_1", name: "Sphere" }],
      animation: {
        durationSeconds: 1,
        tracks: [{ objectId: "obj_1", property: "position.x", keyframes: [{ time: 0, value: 0, interpolation: "linear" }] }],
      },
    };
    const migrated = migrateProjectDataToLatest(v2);
    const object = (migrated.data.objects as Array<{ bindPath?: string }>)[0];
    const animation = migrated.data.animation as {
      tracks: Array<{ bindPath?: string }>;
      takes?: Array<{ id: string; name: string; startTime: number; endTime: number }>;
    };
    const track = animation?.tracks?.[0];
    expect(object?.bindPath).toBe("Sphere");
    expect(track?.bindPath).toBe("Sphere");
    expect(animation?.takes).toEqual([
      { id: "take_main", name: "Main", startTime: 0, endTime: 1 },
    ]);
  });

  it("synthesizes bindPath for v3 modelInstances", () => {
    const v3 = {
      version: 3,
      objects: [],
      assets: [{ id: "asset_1", name: "robot.glb", type: "gltf", source: { mode: "embedded", fileName: "robot.glb", data: "AA==" }, size: 2 }],
      modelInstances: [{ id: "obj_robot", name: "Robot", assetId: "asset_1", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }],
    };
    const migrated = migrateProjectDataToLatest(v3);
    const model = (migrated.data.modelInstances as Array<{ bindPath?: string }>)[0];
    expect(model?.bindPath).toBe("Robot");
  });
});
