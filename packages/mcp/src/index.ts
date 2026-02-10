import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRuntime } from "./runtime/runtime.js";
import { registerMotionforgeTools } from "./tools.js";
import type { MotionforgeMcpConfig } from "./config.js";

export const MCP_SERVER_NAME = "motionforge-mcp";
export const MCP_SERVER_VERSION = "0.1.0";

export interface MotionforgeMcpServerContext {
  server: McpServer;
  runtime: ReturnType<typeof createRuntime>;
}

export function createMotionforgeMcpServer(config: MotionforgeMcpConfig): MotionforgeMcpServerContext {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });
  const runtime = createRuntime({
    maxJsonBytes: config.maxJsonBytes,
  });
  registerMotionforgeTools(server, runtime, {
    version: MCP_SERVER_VERSION,
    commit: process.env.GITHUB_SHA?.slice(0, 7),
    maxAssetBytes: config.maxAssetBytes,
  });
  return {
    server,
    runtime,
  };
}

export async function startMotionforgeMcpServer(config: MotionforgeMcpConfig): Promise<void> {
  if (config.transport !== "stdio") {
    throw new Error("HTTP transport is not implemented yet. Use --stdio.");
  }
  const { server } = createMotionforgeMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
