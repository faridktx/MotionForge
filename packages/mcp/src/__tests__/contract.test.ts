import { constants as fsConstants } from "node:fs";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { unzipSync } from "fflate";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { createRuntime } from "../runtime/runtime.js";
import { createToolHandlers } from "../tools.js";
import { createMultiObjectProjectJson, createSampleProjectJson } from "./fixtures.js";

function readToolPayload(result: { content: Array<{ type: string; text?: string }> }) {
  const textItem = result.content.find((item) => item.type === "text" && typeof item.text === "string");
  if (!textItem?.text) {
    throw new Error("Missing text payload.");
  }
  return JSON.parse(textItem.text) as Record<string, unknown>;
}

describe("mcp contract tools", () => {
  it("ping responds and staged load commits atomically", async () => {
    const runtime = createRuntime();
    const handlers = createToolHandlers(runtime, {
      version: "0.1.0",
      commit: "abc1234",
      maxAssetBytes: 1024 * 1024,
    });

    const ping = await handlers["mf.ping"]({ nonce: "n1" });
    expect(ping.ok).toBe(true);
    expect(ping).toMatchObject({ version: "0.1.0", nonce: "n1" });

    const load = await handlers["mf.project.loadJson"]({ json: createSampleProjectJson(), staged: true });
    expect(load.ok).toBe(true);

    const beforeCommit = await handlers["mf.state.snapshot"]({});
    expect(beforeCommit.ok).toBe(true);
    if (beforeCommit.ok) {
      expect((beforeCommit.scene as { objects: unknown[] }).objects).toHaveLength(0);
    }

    const commit = await handlers["mf.project.commit"]({});
    expect(commit.ok).toBe(true);

    const afterCommit = await handlers["mf.state.snapshot"]({});
    expect(afterCommit.ok).toBe(true);
    if (afterCommit.ok) {
      expect((afterCommit.scene as { objects: unknown[] }).objects).toHaveLength(1);
    }
  });

  it("execute returns events and export bundle writes expected structure", async () => {
    const runtime = createRuntime();
    const handlers = createToolHandlers(runtime, {
      version: "0.1.0",
      commit: undefined,
      maxAssetBytes: 1024 * 1024,
    });

    await handlers["mf.project.loadJson"]({ json: createSampleProjectJson(), staged: false });
    const executed = await handlers["mf.command.execute"]({
      action: "selection.set",
      input: { objectId: "obj_cube" },
    });
    expect(executed.ok).toBe(true);
    if (executed.ok) {
      expect(Array.isArray(executed.events)).toBe(true);
      expect((executed.events as Array<{ type: string }>)[0]?.type).toBe("selection.changed");
    }

    const outDir = await mkdtemp(join(tmpdir(), "mf-mcp-"));
    try {
      const exported = await handlers["mf.export.bundle"]({ outDir });
      expect(exported.ok).toBe(true);
      if (exported.ok) {
        const zipBytes = await readFile(exported.path as string);
        const files = unzipSync(zipBytes);
        expect(Object.keys(files).includes("project.json")).toBe(true);
        expect(Object.keys(files).includes("motionforge-manifest.json")).toBe(true);
        const manifest = JSON.parse(Buffer.from(files["motionforge-manifest.json"] ?? new Uint8Array()).toString("utf8")) as {
          takes?: Array<{ id: string; name: string; startTime: number; endTime: number }>;
          clipNaming?: { pattern: string; fallbackTakeName: string };
        };
        expect(manifest.takes).toEqual([{ id: "take_main", name: "Main", startTime: 0, endTime: 2 }]);
        expect(manifest.clipNaming).toEqual({
          pattern: "<ProjectName>_<TakeName>",
          fallbackTakeName: "Main",
        });
      }
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("invalid json returns error and keeps runtime unchanged", async () => {
    const runtime = createRuntime();
    const handlers = createToolHandlers(runtime, {
      version: "0.1.0",
      commit: undefined,
      maxAssetBytes: 1024 * 1024,
    });

    await handlers["mf.project.loadJson"]({ json: createSampleProjectJson(), staged: false });
    const before = await handlers["mf.state.snapshot"]({});
    const failed = await handlers["mf.project.loadJson"]({ json: "{", staged: true });
    const after = await handlers["mf.state.snapshot"]({});

    expect(failed.ok).toBe(false);
    expect(before).toEqual(after);
  });

  it("plan flow generate -> preview -> apply mutates animation deterministically", async () => {
    const runtime = createRuntime();
    const handlers = createToolHandlers(runtime, {
      version: "0.1.0",
      commit: undefined,
      maxAssetBytes: 1024 * 1024,
    });

    await handlers["mf.project.loadJson"]({ json: createSampleProjectJson(), staged: false });
    const before = await handlers["mf.state.snapshot"]({});
    const generated = await handlers["mf.plan.generate"]({
      goal: "bounce",
    });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;

    const planId = generated.planId as string;
    const preview = await handlers["mf.plan.previewDiff"]({ planId });
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      const animation = preview.diff as Array<{ keyframesAdded?: number }> | Record<string, unknown>;
      const serialized = JSON.stringify(animation);
      expect(serialized.includes("keyframesAdded")).toBe(true);
    }

    const applied = await handlers["mf.plan.apply"]({ planId, confirm: true });
    expect(applied.ok).toBe(true);

    const after = await handlers["mf.state.snapshot"]({});
    expect(after.ok).toBe(true);
    if (before.ok && after.ok) {
      const beforeCount = (before.animation as { keyframeCount: number }).keyframeCount;
      const afterCount = (after.animation as { keyframeCount: number }).keyframeCount;
      expect(afterCount).toBeGreaterThan(beforeCount);
    }
  });

  it("plan apply requires confirm for high-impact plans and discard removes plan", async () => {
    const runtime = createRuntime();
    const handlers = createToolHandlers(runtime, {
      version: "0.1.0",
      commit: undefined,
      maxAssetBytes: 1024 * 1024,
    });

    await handlers["mf.project.loadJson"]({ json: createMultiObjectProjectJson(), staged: false });
    const generated = await handlers["mf.plan.generate"]({
      goal: "bounce",
      constraints: {
        targetObjects: ["obj_cube", "obj_cube_2"],
      },
    });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    const planId = generated.planId as string;

    const denied = await handlers["mf.plan.apply"]({ planId, confirm: false });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect((denied.error as { code: string }).code).toBe("MF_ERR_CONFIRM_REQUIRED");
    }

    const discarded = await handlers["mf.plan.discard"]({ planId });
    expect(discarded.ok).toBe(true);
    const previewAfterDiscard = await handlers["mf.plan.previewDiff"]({ planId });
    expect(previewAfterDiscard.ok).toBe(false);
    if (!previewAfterDiscard.ok) {
      expect((previewAfterDiscard.error as { code: string }).code).toBe("MF_ERR_PLAN_NOT_FOUND");
    }
  });

  it("unity package export writes README and project payload", async () => {
    const runtime = createRuntime();
    const handlers = createToolHandlers(runtime, {
      version: "0.1.0",
      commit: undefined,
      maxAssetBytes: 1024 * 1024,
    });

    await handlers["mf.project.loadJson"]({ json: createSampleProjectJson(), staged: false });
    const outDir = await mkdtemp(join(tmpdir(), "mf-mcp-unity-"));
    try {
      const exported = await handlers["mf.export.unityPackage"]({ outDir });
      expect(exported.ok).toBe(true);
      if (exported.ok) {
        const zipBytes = await readFile(exported.path as string);
        const files = unzipSync(zipBytes);
        expect(Object.keys(files).includes("README_UNITY.txt")).toBe(true);
        expect(Object.keys(files).includes("project.json")).toBe(true);
      }
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("pipeline makeBundle supports preview-only and confirmed apply modes", async () => {
    const runtime = createRuntime();
    const handlers = createToolHandlers(runtime, {
      version: "0.1.0",
      commit: "abc1234",
      maxAssetBytes: 1024 * 1024,
    });
    const outDir = await mkdtemp(join(tmpdir(), "mf-pipeline-"));
    try {
      const preview = await handlers["mf.pipeline.makeBundle"]({
        inJson: createSampleProjectJson(),
        goal: "idle loop then recoil",
        outDir,
        confirm: false,
      });
      expect(preview.ok).toBe(false);
      if (!preview.ok) {
        expect((preview.error as { code: string }).code).toBe("MF_ERR_CONFIRM_REQUIRED");
      }
      expect((preview as { previewOnly?: boolean }).previewOnly).toBe(true);
      const previewProofPath = (preview as { proofPath?: string }).proofPath as string;
      await access(previewProofPath, fsConstants.F_OK);

      const applied = await handlers["mf.pipeline.makeBundle"]({
        inJson: createSampleProjectJson(),
        goal: "idle loop then recoil",
        outDir,
        confirm: true,
      });
      expect(applied.ok).toBe(true);
      expect((applied as { previewOnly?: boolean }).previewOnly).toBe(false);
      const proofPath = (applied as { proofPath?: string }).proofPath as string;
      await access(proofPath, fsConstants.F_OK);
      const proof = JSON.parse(await readFile(proofPath, "utf8")) as {
        takes: Array<{ name: string }>;
      };
      expect(proof.takes.map((item) => item.name)).toEqual(["Idle", "Recoil"]);
      await access((applied as { outZipPath?: string }).outZipPath as string, fsConstants.F_OK);
      await access((applied as { manifestPath?: string }).manifestPath as string, fsConstants.F_OK);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("script compile -> previewDiff -> apply updates animation", async () => {
    const runtime = createRuntime();
    const handlers = createToolHandlers(runtime, {
      version: "0.1.0",
      commit: undefined,
      maxAssetBytes: 1024 * 1024,
    });

    await handlers["mf.project.loadJson"]({ json: createSampleProjectJson(), staged: false });
    const compiled = await handlers["mf.script.compile"]({
      script: `select "obj_cube"
duration 1
label "Bounce"
bounce amplitude 1.2 at 0..1`,
      defaults: {
        fps: 30,
      },
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const planId = compiled.planId as string;

    const preview = await handlers["mf.plan.previewDiff"]({ planId });
    expect(preview.ok).toBe(true);

    const before = await handlers["mf.state.snapshot"]({});
    const applied = await handlers["mf.plan.apply"]({ planId, confirm: true });
    expect(applied.ok).toBe(true);
    const after = await handlers["mf.state.snapshot"]({});
    expect(after.ok).toBe(true);
    if (before.ok && after.ok) {
      expect((after.animation as { keyframeCount: number }).keyframeCount).toBeGreaterThan(
        (before.animation as { keyframeCount: number }).keyframeCount,
      );
    }
  });

  it("script compile does not mutate runtime snapshot", async () => {
    const runtime = createRuntime();
    const handlers = createToolHandlers(runtime, {
      version: "0.1.0",
      commit: undefined,
      maxAssetBytes: 1024 * 1024,
    });
    await handlers["mf.project.loadJson"]({ json: createSampleProjectJson(), staged: false });
    const before = await handlers["mf.state.snapshot"]({});
    const compiled = await handlers["mf.script.compile"]({
      script: `select "obj_cube"
duration 1
bounce amplitude 1.2 at 0..1`,
    });
    const after = await handlers["mf.state.snapshot"]({});
    expect(compiled.ok).toBe(true);
    expect(after).toEqual(before);
  });

  it("script plan apply requires confirm for delete operations", async () => {
    const runtime = createRuntime();
    const handlers = createToolHandlers(runtime, {
      version: "0.1.0",
      commit: undefined,
      maxAssetBytes: 1024 * 1024,
    });
    await handlers["mf.project.loadJson"]({ json: createSampleProjectJson(), staged: false });
    const compiled = await handlers["mf.script.compile"]({
      script: `select "obj_cube"
duration 1
delete key position x at 1`,
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const denied = await handlers["mf.plan.apply"]({ planId: compiled.planId as string, confirm: false });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect((denied.error as { code: string }).code).toBe("MF_ERR_CONFIRM_REQUIRED");
    }
  });

  it("script run previewOnly returns diff and keeps runtime unchanged", async () => {
    const runtime = createRuntime();
    const handlers = createToolHandlers(runtime, {
      version: "0.1.0",
      commit: undefined,
      maxAssetBytes: 1024 * 1024,
    });
    await handlers["mf.project.loadJson"]({ json: createSampleProjectJson(), staged: false });
    const before = await handlers["mf.state.snapshot"]({});
    const ran = await handlers["mf.script.run"]({
      script: `select "obj_cube"
duration 1
bounce amplitude 1.2 at 0..1`,
      confirm: false,
      applyMode: "previewOnly",
      staged: false,
    });
    const after = await handlers["mf.state.snapshot"]({});
    expect(ran.ok).toBe(true);
    if (ran.ok) {
      expect(JSON.stringify(ran.diff).includes("keyframesAdded")).toBe(true);
    }
    expect(after).toEqual(before);
  });

  it("script run apply requires confirm when plan is destructive", async () => {
    const runtime = createRuntime();
    const handlers = createToolHandlers(runtime, {
      version: "0.1.0",
      commit: undefined,
      maxAssetBytes: 1024 * 1024,
    });
    await handlers["mf.project.loadJson"]({ json: createSampleProjectJson(), staged: false });
    const denied = await handlers["mf.script.run"]({
      script: `select "obj_cube"
duration 1
delete key position x at 1`,
      confirm: false,
      applyMode: "apply",
      staged: false,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect((denied.error as { code: string }).code).toBe("MF_ERR_CONFIRM_REQUIRED");
    }
  });

  it("script validate returns path-based errors", async () => {
    const runtime = createRuntime();
    const handlers = createToolHandlers(runtime, {
      version: "0.1.0",
      commit: undefined,
      maxAssetBytes: 1024 * 1024,
    });
    await handlers["mf.project.loadJson"]({ json: createSampleProjectJson(), staged: false });
    const validated = await handlers["mf.script.validate"]({
      script: `select "unknown"
duration 1
key position y at 2 = 1`,
    });
    expect(validated.ok).toBe(false);
    if (!validated.ok) {
      const errors = (validated as unknown as { errors: Array<{ path: string }> }).errors;
      expect(errors.some((item) => item.path === "line:1")).toBe(true);
      expect(errors.some((item) => item.path === "line:3")).toBe(true);
    }
  });

  it("skill generate script returns script-only output", async () => {
    const runtime = createRuntime();
    const handlers = createToolHandlers(runtime, {
      version: "0.1.0",
      commit: undefined,
      maxAssetBytes: 1024 * 1024,
    });
    const generated = await handlers["mf.skill.generateScript"]({
      goal: "bounce",
      constraints: { durationSec: 1, style: "snappy" },
      target: { select: "obj_cube" },
    });
    expect(generated.ok).toBe(true);
    if (generated.ok) {
      const script = generated.script as string;
      expect(script).not.toContain("{");
      expect(script).not.toContain("}");
      expect(script).not.toContain("mf.");
      expect(script).not.toContain("http");
      expect(script).not.toContain("```");
      expect(script).toContain('select "obj_cube"');
    }
  });

  it("staged safety demo: staged load and staged script apply do not mutate current until commit", async () => {
    const runtime = createRuntime();
    const handlers = createToolHandlers(runtime, {
      version: "0.1.0",
      commit: undefined,
      maxAssetBytes: 1024 * 1024,
    });
    const load = await handlers["mf.project.loadJson"]({ json: createSampleProjectJson(), staged: true });
    expect(load.ok).toBe(true);
    const beforeCommit = await handlers["mf.state.snapshot"]({});
    if (beforeCommit.ok) {
      expect((beforeCommit.animation as { keyframeCount: number }).keyframeCount).toBe(0);
    }

    const stagedRun = await handlers["mf.script.run"]({
      script: `select "obj_cube"
duration 1
bounce amplitude 1.2 at 0..1`,
      confirm: true,
      applyMode: "apply",
      staged: true,
    });
    expect(stagedRun.ok).toBe(true);

    const stillBeforeCommit = await handlers["mf.state.snapshot"]({});
    expect(stillBeforeCommit).toEqual(beforeCommit);

    const committed = await handlers["mf.project.commit"]({});
    expect(committed.ok).toBe(true);

    const afterCommit = await handlers["mf.state.snapshot"]({});
    expect(afterCommit.ok).toBe(true);
    if (afterCommit.ok) {
      expect((afterCommit.scene as { objects: unknown[] }).objects).toHaveLength(1);
      expect((afterCommit.animation as { keyframeCount: number }).keyframeCount).toBeGreaterThan(2);
    }
  });

  it(
    "stdio server speaks MCP framing for list/call tools",
    async () => {
      const transport = new StdioClientTransport({
        command: resolve(process.cwd(), "node_modules/.bin/tsx"),
        args: [resolve(process.cwd(), "src/cli.ts"), "--stdio"],
        cwd: process.cwd(),
        stderr: "pipe",
      });
      const client = new Client({ name: "mcp-contract-client", version: "0.0.1" });

      try {
        await client.connect(transport);
        const listed = await client.request({ method: "tools/list", params: {} }, ListToolsResultSchema);
        expect(listed.tools.some((tool) => tool.name === "mf.ping")).toBe(true);

        const called = await client.request(
          {
            method: "tools/call",
            params: {
              name: "mf.ping",
              arguments: {
                nonce: "stdio",
              },
            },
          },
          CallToolResultSchema,
        );
        const payload = readToolPayload(called as { content: Array<{ type: string; text?: string }> });
        expect(payload.ok).toBe(true);
        expect(payload.nonce).toBe("stdio");
      } finally {
        await transport.close();
      }
    },
    20000,
  );
});
