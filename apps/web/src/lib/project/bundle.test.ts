// @vitest-environment node

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { ProjectData } from "./serialize.js";
import { buildProjectBundleArtifact, getBundleAssetFileName } from "./serialize.js";
import { parseProjectBundle } from "./bundle.js";

const SAMPLE_ASSET_BYTES = new Uint8Array([1, 2, 3, 4, 5, 6]);

function createProjectFixture(): ProjectData {
  return {
    version: 3,
    objects: [],
    assets: [
      {
        id: "asset_1",
        name: "robot.glb",
        type: "gltf",
        source: {
          mode: "embedded",
          fileName: "robot.glb",
          data: "AA==",
        },
        size: 2,
      },
    ],
    modelInstances: [
      {
        id: "obj_100",
        name: "Robot",
        bindPath: "Robot",
        assetId: "asset_1",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ],
  };
}

describe("parseProjectBundle", () => {
  it("reconstructs embedded asset payloads from bundle files", () => {
    const project = createProjectFixture();
    const fileName = getBundleAssetFileName(project.assets![0]!);
    const zipped = zipSync({
      "project.json": strToU8(JSON.stringify(project)),
      [`assets/${fileName}`]: SAMPLE_ASSET_BYTES,
    });

    const result = parseProjectBundle(new Uint8Array(zipped));
    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    expect(result.data?.assets?.[0]?.size).toBe(SAMPLE_ASSET_BYTES.byteLength);
    expect(result.warnings).toEqual([]);
    expect(result.data?.assets?.[0]?.source.mode).toBe("embedded");
    expect((result.data?.assets?.[0]?.source as { data: string }).data).not.toBe("AA==");
  });

  it("fails with readable error when an embedded asset file is missing", () => {
    const project = createProjectFixture();
    const zipped = zipSync({
      "project.json": strToU8(JSON.stringify(project)),
    });

    const result = parseProjectBundle(new Uint8Array(zipped));
    expect(result.data).toBeNull();
    expect(result.error).toContain("missing asset payload");
  });

  it("bundle artifact includes manifest metadata", () => {
    const project = createProjectFixture();
    const artifact = buildProjectBundleArtifact(project);
    const files = unzipSync(artifact.bytes);
    expect(Object.keys(files)).toContain("motionforge-manifest.json");
    const manifestRaw = files["motionforge-manifest.json"];
    expect(manifestRaw).toBeTruthy();
    const manifest = JSON.parse(strFromU8(manifestRaw!)) as {
      version: number;
      projectVersion: number;
      primaryModelAssetId: string | null;
      exportedAt: string;
      takes: Array<{ id: string; name: string; startTime: number; endTime: number }>;
      clipNaming: { pattern: string; fallbackTakeName: string };
    };
    expect(manifest.version).toBe(1);
    expect(manifest.projectVersion).toBe(project.version);
    expect(manifest.primaryModelAssetId).toBe("asset_1");
    expect(typeof manifest.exportedAt).toBe("string");
    expect(manifest.takes).toEqual([]);
    expect(manifest.clipNaming).toEqual({
      pattern: "<ProjectName>_<TakeName>",
      fallbackTakeName: "Main",
    });
  });
});
