import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { BUILT_IN_DEMO_MODEL_URL, resolveBuiltInDemoModelImportPayload } from "./demoModel.js";

describe("built-in demo model import pipeline", () => {
  it("loads bytes from built-in fixture URL and parses model with mock fetch", async () => {
    const fixture = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url !== BUILT_IN_DEMO_MODEL_URL) {
        throw new Error("unexpected URL");
      }
      return new Response(fixture.buffer, {
        status: 200,
        headers: { "content-type": "model/gltf-binary" },
      });
    });
    const root = new THREE.Group();
    root.name = "DemoRoot";
    const parseModel = vi.fn(async (buffer: ArrayBuffer) => {
      expect(new Uint8Array(buffer)).toEqual(fixture);
      return root;
    });

    const payload = await resolveBuiltInDemoModelImportPayload({
      fetchImpl,
      parseModel,
      now: () => 1700000000000,
      random: () => 0.1234,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(parseModel).toHaveBeenCalledTimes(1);
    expect(payload.root).toBe(root);
    expect(payload.asset.name).toBe("demo-model.glb");
    expect(payload.summary.nodes).toBeGreaterThan(0);
  });
});
