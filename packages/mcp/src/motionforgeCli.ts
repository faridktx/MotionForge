#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MCP_SERVER_VERSION } from "./index.js";
import { createRuntime } from "./runtime/runtime.js";
import { createToolHandlers } from "./tools.js";
import { runMakeBundlePipeline, type PipelineTakeInput } from "./pipeline/makeBundle.js";
import { stableJsonStringify } from "./pipeline/hash.js";

interface CliIo {
  writeStdout: (line: string) => void;
  writeStderr: (line: string) => void;
}

const defaultIo: CliIo = {
  writeStdout: (line) => process.stdout.write(`${line}\n`),
  writeStderr: (line) => process.stderr.write(`${line}\n`),
};

function renderHelpText(): string {
  return [
    "motionforge",
    "",
    "Usage:",
    "  motionforge make-bundle --goal \"idle loop then recoil\" --out ./out --in ./project.json --confirm",
    "",
    "Command: make-bundle",
    "  --in <path>            Input project.json or motionforge-bundle.zip (optional)",
    "  --goal <text>          Deterministic goal phrase",
    "  --takes <spec>         Optional take ranges, e.g. \"Idle:0..2,Recoil:2..2.4\"",
    "  --out <dir>            Output directory",
    "  --confirm              Required to apply and commit mutations",
    "  --staged               Use staged load/apply mode (default true)",
    "  --no-staged            Disable staged mode",
    "  -h, --help             Show help",
  ].join("\n");
}

function parseTakesSpec(value: string): PipelineTakeInput[] {
  const items = value.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
  const takes: PipelineTakeInput[] = [];
  for (const item of items) {
    const match = item.match(/^([^:]+):([-+]?(?:\d+\.?\d*|\d*\.?\d+))\.\.([-+]?(?:\d+\.?\d*|\d*\.?\d+))$/);
    if (!match) {
      throw new Error(`Invalid take segment "${item}". Expected Name:start..end`);
    }
    takes.push({
      name: match[1]?.trim() ?? "",
      startTime: Number(match[2]),
      endTime: Number(match[3]),
    });
  }
  return takes;
}

interface MakeBundleArgs {
  inPath?: string;
  goal: string;
  takes?: PipelineTakeInput[];
  outDir: string;
  confirm: boolean;
  staged: boolean;
}

function parseMakeBundleArgs(argv: string[]): MakeBundleArgs {
  let inPath: string | undefined;
  let goal: string | undefined;
  let takes: PipelineTakeInput[] | undefined;
  let outDir: string | undefined;
  let confirm = false;
  let staged = true;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--in") {
      const value = argv[i + 1];
      if (!value) throw new Error("--in requires a value.");
      inPath = resolve(value);
      i += 1;
      continue;
    }
    if (arg === "--goal") {
      const value = argv[i + 1];
      if (!value) throw new Error("--goal requires a value.");
      goal = value;
      i += 1;
      continue;
    }
    if (arg === "--takes") {
      const value = argv[i + 1];
      if (!value) throw new Error("--takes requires a value.");
      takes = parseTakesSpec(value);
      i += 1;
      continue;
    }
    if (arg === "--out") {
      const value = argv[i + 1];
      if (!value) throw new Error("--out requires a value.");
      outDir = resolve(value);
      i += 1;
      continue;
    }
    if (arg === "--confirm") {
      confirm = true;
      continue;
    }
    if (arg === "--staged") {
      staged = true;
      continue;
    }
    if (arg === "--no-staged") {
      staged = false;
      continue;
    }
    throw new Error(`Unknown flag "${arg}".`);
  }

  if (!goal || goal.trim().length === 0) throw new Error("--goal is required.");
  if (!outDir) throw new Error("--out is required.");

  return {
    inPath,
    goal: goal.trim(),
    takes,
    outDir,
    confirm,
    staged,
  };
}

async function readInputFile(inPath: string): Promise<{ inJson?: string; inBundleBase64?: string }> {
  const bytes = await readFile(inPath);
  if (inPath.toLowerCase().endsWith(".zip")) {
    return {
      inBundleBase64: Buffer.from(bytes).toString("base64"),
    };
  }
  return {
    inJson: bytes.toString("utf8"),
  };
}

export async function runMotionforgeCli(argv: string[], io: CliIo = defaultIo): Promise<number> {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    io.writeStdout(renderHelpText());
    return 0;
  }

  const command = argv[0];
  if (command !== "make-bundle") {
    io.writeStderr(`Unknown command "${command}".`);
    io.writeStdout(renderHelpText());
    return 1;
  }

  let parsed: MakeBundleArgs;
  try {
    parsed = parseMakeBundleArgs(argv.slice(1));
  } catch (error) {
    io.writeStderr(error instanceof Error ? error.message : String(error));
    io.writeStdout(renderHelpText());
    return 1;
  }

  const runtime = createRuntime();
  const handlers = createToolHandlers(runtime, {
    version: MCP_SERVER_VERSION,
    commit: process.env.GITHUB_SHA?.slice(0, 7),
    maxAssetBytes: 25 * 1024 * 1024,
  });

  let fileInput: { inJson?: string; inBundleBase64?: string } = {};
  if (parsed.inPath) {
    try {
      fileInput = await readInputFile(parsed.inPath);
    } catch (error) {
      io.writeStderr(`Failed to read input file: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
  }

  const result = await runMakeBundlePipeline(
    async (toolName, input) => handlers[toolName as keyof typeof handlers](input),
    {
      inJson: fileInput.inJson,
      inBundleBase64: fileInput.inBundleBase64,
      goal: parsed.goal,
      takes: parsed.takes,
      outDir: parsed.outDir,
      confirm: parsed.confirm,
      staged: parsed.staged,
    },
    {
      mcpVersion: MCP_SERVER_VERSION,
      commit: process.env.GITHUB_SHA?.slice(0, 7) ?? null,
    },
  );

  io.writeStdout(
    stableJsonStringify({
      ok: result.ok,
      previewOnly: result.previewOnly,
      outZipPath: result.outZipPath,
      manifestPath: result.manifestPath,
      proofPath: result.proofPath,
      warnings: result.warnings,
      errors: result.errors ?? [],
    }),
  );

  if (!result.ok) {
    const firstError = result.errors?.[0];
    if (firstError) {
      io.writeStderr(`${firstError.code}: ${firstError.message}`);
      if (firstError.code === "MF_ERR_CONFIRM_REQUIRED") {
        return 2;
      }
    }
    return 1;
  }

  return 0;
}

async function main() {
  const exitCode = await runMotionforgeCli(process.argv.slice(2), defaultIo);
  process.exitCode = exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
