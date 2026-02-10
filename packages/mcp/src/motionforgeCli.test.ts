import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runMotionforgeCli } from "./motionforgeCli.js";

describe("motionforge CLI", () => {
  it("returns MF_ERR_CONFIRM_REQUIRED in preview-only mode and writes proof", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "motionforge-cli-"));
    const inputPath = resolve(process.cwd(), "../../apps/web/public/demo/motionforge-takes-demo.json");
    const stdout: string[] = [];
    const stderr: string[] = [];
    try {
      const exitCode = await runMotionforgeCli(
        [
          "make-bundle",
          "--in",
          inputPath,
          "--goal",
          "idle loop then recoil",
          "--out",
          outDir,
        ],
        {
          writeStdout: (line) => stdout.push(line),
          writeStderr: (line) => stderr.push(line),
        },
      );

      expect(exitCode).toBe(2);
      expect(stdout.join("\n")).toContain("MF_ERR_CONFIRM_REQUIRED");

      const proofPath = join(outDir, "proof.json");
      await access(proofPath, fsConstants.F_OK);
      const proof = JSON.parse(await readFile(proofPath, "utf8")) as {
        previewOnly: boolean;
        goal: string;
      };
      expect(proof.previewOnly).toBe(true);
      expect(proof.goal).toBe("idle loop then recoil");
      expect(stderr.join("\n")).toContain("MF_ERR_CONFIRM_REQUIRED");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("supports --unity mode and writes bindPath normalization warnings when needed", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "motionforge-cli-unity-"));
    const inputPath = resolve(process.cwd(), "../../apps/web/public/demo/motionforge-takes-demo.json");
    const stdout: string[] = [];
    const stderr: string[] = [];
    try {
      const exitCode = await runMotionforgeCli(
        [
          "make-bundle",
          "--in",
          inputPath,
          "--goal",
          "idle loop then recoil",
          "--out",
          outDir,
          "--unity",
          "--confirm",
        ],
        {
          writeStdout: (line) => stdout.push(line),
          writeStderr: (line) => stderr.push(line),
        },
      );

      expect(exitCode).toBe(0);
      const project = JSON.parse(await readFile(join(outDir, "project.json"), "utf8")) as {
        animation?: { tracks?: Array<{ bindPath?: string }> };
      };
      const tracks = project.animation?.tracks ?? [];
      expect(tracks.length).toBeGreaterThan(0);
      expect(tracks.every((track) => typeof track.bindPath === "string" && track.bindPath.length > 0)).toBe(true);

      const proof = JSON.parse(await readFile(join(outDir, "proof.json"), "utf8")) as {
        warnings: string[];
      };
      expect(Array.isArray(proof.warnings)).toBe(true);
      expect(stdout.join("\n")).toContain("\"ok\": true");
      expect(stderr).toEqual([]);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
