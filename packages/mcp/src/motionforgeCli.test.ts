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
});
