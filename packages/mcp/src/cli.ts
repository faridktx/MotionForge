#!/usr/bin/env node
import { parseCliConfig, renderHelpText } from "./config.js";
import { startMotionforgeMcpServer } from "./index.js";

async function main() {
  const parsed = parseCliConfig(process.argv.slice(2));
  if (parsed.error) {
    if (parsed.error === "help") {
      process.stdout.write(`${renderHelpText()}\n`);
      return;
    }
    process.stderr.write(`motionforge-mcp: ${parsed.error}\n`);
    process.stderr.write(`${renderHelpText()}\n`);
    process.exitCode = 1;
    return;
  }

  try {
    await startMotionforgeMcpServer(parsed.config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`motionforge-mcp failed: ${message}\n`);
    process.exitCode = 1;
  }
}

main();
