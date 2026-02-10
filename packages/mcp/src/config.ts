import { resolve } from "node:path";

export interface MotionforgeMcpConfig {
  transport: "stdio" | "http";
  port: number;
  outputDir: string;
  maxJsonBytes: number;
  maxAssetBytes: number;
  allowNetworkImports: boolean;
}

export interface ParsedCliConfig {
  config: MotionforgeMcpConfig;
  error?: string;
}

export const DEFAULT_MCP_CONFIG: MotionforgeMcpConfig = {
  transport: "stdio",
  port: 3333,
  outputDir: resolve(process.cwd(), ".motionforge/exports"),
  maxJsonBytes: 25 * 1024 * 1024,
  maxAssetBytes: 5 * 1024 * 1024,
  allowNetworkImports: false,
};

export function parseCliConfig(argv: string[], env: NodeJS.ProcessEnv = process.env): ParsedCliConfig {
  const config: MotionforgeMcpConfig = {
    ...DEFAULT_MCP_CONFIG,
  };

  if (env.MF_MCP_OUTPUT_DIR) config.outputDir = resolve(env.MF_MCP_OUTPUT_DIR);
  if (env.MF_MCP_MAX_JSON_BYTES) config.maxJsonBytes = Number(env.MF_MCP_MAX_JSON_BYTES);
  if (env.MF_MCP_MAX_ASSET_BYTES) config.maxAssetBytes = Number(env.MF_MCP_MAX_ASSET_BYTES);
  if (env.MF_MCP_ALLOW_NETWORK_IMPORTS === "1") config.allowNetworkImports = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--stdio") {
      config.transport = "stdio";
      continue;
    }
    if (arg === "--port") {
      const value = argv[index + 1];
      if (!value) {
        return {
          config,
          error: "--port requires a value.",
        };
      }
      const port = Number(value);
      if (!Number.isInteger(port) || port <= 0) {
        return {
          config,
          error: `Invalid --port value "${value}".`,
        };
      }
      config.transport = "http";
      config.port = port;
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      const value = argv[index + 1];
      if (!value) {
        return {
          config,
          error: "--output-dir requires a value.",
        };
      }
      config.outputDir = resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--max-json-bytes") {
      const value = argv[index + 1];
      const parsed = Number(value);
      if (!value || !Number.isFinite(parsed) || parsed <= 0) {
        return {
          config,
          error: `Invalid --max-json-bytes value "${value ?? ""}".`,
        };
      }
      config.maxJsonBytes = parsed;
      index += 1;
      continue;
    }
    if (arg === "--max-asset-bytes") {
      const value = argv[index + 1];
      const parsed = Number(value);
      if (!value || !Number.isFinite(parsed) || parsed <= 0) {
        return {
          config,
          error: `Invalid --max-asset-bytes value "${value ?? ""}".`,
        };
      }
      config.maxAssetBytes = parsed;
      index += 1;
      continue;
    }
    if (arg === "--allow-network-imports") {
      config.allowNetworkImports = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return {
        config,
        error: "help",
      };
    }
    return {
      config,
      error: `Unknown flag "${arg}".`,
    };
  }

  return { config };
}

export function renderHelpText() {
  return [
    "motionforge-mcp",
    "",
    "Usage:",
    "  motionforge-mcp --stdio",
    "  motionforge-mcp --port 3333",
    "",
    "Flags:",
    "  --stdio                 Run MCP over stdio (default).",
    "  --port <number>         Reserved for future HTTP transport.",
    "  --output-dir <path>     Export output directory (default: .motionforge/exports).",
    "  --max-json-bytes <n>    Max JSON payload bytes.",
    "  --max-asset-bytes <n>   Max IO asset bytes.",
    "  --allow-network-imports Enable URL import tooling (default: false).",
    "  -h, --help              Show help.",
  ].join("\n");
}
