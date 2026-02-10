#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { runMotionforgeCli } from "./motionforgeCli.js";

async function main() {
  const outDir = resolve(join(tmpdir(), "motionforge-unity-demo"));
  await mkdir(outDir, { recursive: true });

  const inputPath = resolve(process.cwd(), "../../apps/web/public/demo/motionforge-takes-demo.json");
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
      writeStdout: (line) => process.stdout.write(`${line}\n`),
      writeStderr: (line) => process.stderr.write(`${line}\n`),
    },
  );

  process.stdout.write("\nNext Unity steps:\n");
  process.stdout.write("1) Open Unity 2022.3 project\n");
  process.stdout.write("2) Install glTFast (com.unity.cloud.gltfast)\n");
  process.stdout.write("3) Tools -> MotionForge -> Import Bundle\n");
  process.stdout.write(`4) Select: ${join(outDir, "motionforge-bundle.zip")}\n`);
  process.stdout.write("5) Press Play to preview Idle/Recoil takes\n");

  process.exitCode = exitCode;
}

main();
