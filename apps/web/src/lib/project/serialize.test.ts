import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  getRecentProjects,
  loadRecentProject,
  migrateLegacyRecentPayloads,
  parseProjectJSONResult,
  persistRecentProject,
} from "./serialize.js";
import type { ProjectData } from "./serialize.js";

describe("parseProjectJSONResult", () => {
  it("returns a readable error for invalid animation keyframe times", () => {
    const bad = JSON.stringify({
      version: 2,
      objects: [],
      animation: {
        durationSeconds: 2,
        tracks: [
          {
            objectId: "obj_1",
            property: "position.x",
            keyframes: [{ time: 3, value: 1, interpolation: "linear" }],
          },
        ],
      },
    });

    const result = parseProjectJSONResult(bad);
    expect(result.data).toBeNull();
    expect(result.error).toContain("time must be within [0, durationSeconds]");
  });

  it("accepts valid v1 project data", () => {
    const good = JSON.stringify({
      version: 1,
      objects: [],
    });

    const result = parseProjectJSONResult(good);
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ version: 1, objects: [] });
  });

  it("accepts valid v3 project data with assets metadata", () => {
    const good = JSON.stringify({
      version: 3,
      objects: [],
      assets: [
        {
          id: "asset_1",
          name: "model.glb",
          type: "gltf",
          source: { mode: "embedded", data: "AA==", fileName: "model.glb" },
          size: 2,
        },
      ],
      modelInstances: [
        {
          id: "inst_1",
          name: "Model",
          assetId: "asset_1",
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
    });

    const result = parseProjectJSONResult(good);
    expect(result.error).toBeNull();
    expect(result.data?.version).toBe(3);
  });

  it("returns validation error for invalid v3 modelInstances", () => {
    const bad = JSON.stringify({
      version: 3,
      objects: [],
      assets: [],
      modelInstances: [
        {
          id: "inst_1",
          name: "Broken",
          assetId: "missing",
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
    });

    const result = parseProjectJSONResult(bad);
    expect(result.data).toBeNull();
    expect(result.error).toContain("assetId");
  });

  it("rejects assets metadata on version 2 projects", () => {
    const bad = JSON.stringify({
      version: 2,
      objects: [],
      assets: [],
      modelInstances: [],
    });

    const result = parseProjectJSONResult(bad);
    expect(result.data).toBeNull();
    expect(result.error).toContain("only supported in version 3");
  });
});

describe("recent projects", () => {
  const baseProject: ProjectData = {
    version: 3,
    objects: [
      {
        id: "obj",
        name: "Sample",
        geometryType: "box",
        color: 1,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ],
  };

  it("stores recent project metadata and limits list to five", async () => {
    localStorage.clear();
    for (let i = 0; i < 6; i++) {
      const data = { ...baseProject, objects: [{ ...baseProject.objects[0], id: `obj_${i}`, name: `Sample ${i}` }] };
      const json = JSON.stringify(data);
      await persistRecentProject(data, json, `Project ${i}`);
    }

    const recent = getRecentProjects();
    expect(recent).toHaveLength(5);
    expect(recent[0].name).toBe("Project 5");
    expect(recent[4].name).toBe("Project 1");
  });

  it("saves payload to indexeddb and loads identical JSON", async () => {
    localStorage.clear();
    const json = JSON.stringify(baseProject);
    await persistRecentProject(baseProject, json, "IndexedDB Project");
    const [recent] = getRecentProjects();
    expect(recent).toBeTruthy();

    const loaded = await loadRecentProject(recent.id);
    expect(loaded.error).toBeNull();
    expect(loaded.data).toEqual(baseProject);
  });

  it("migrates legacy localStorage payloads to indexeddb and cleans old keys", async () => {
    localStorage.clear();
    const legacyJson = JSON.stringify(baseProject);
    const storageKey = "motionforge_recent_item_legacy_1";
    localStorage.setItem(storageKey, legacyJson);
    localStorage.setItem(
      "motionforge_recent_projects_v1",
      JSON.stringify([
        {
          name: "Legacy Project",
          timestamp: new Date().toISOString(),
          size: legacyJson.length,
          version: 3,
          storageKey,
        },
      ]),
    );

    const migrated = await migrateLegacyRecentPayloads();
    expect(migrated).toBe(1);
    expect(localStorage.getItem(storageKey)).toBeNull();

    const [recent] = getRecentProjects();
    expect(recent.legacyStorageKey).toBeUndefined();
    const loaded = await loadRecentProject(recent.id);
    expect(loaded.data).toEqual(baseProject);
  });
});
