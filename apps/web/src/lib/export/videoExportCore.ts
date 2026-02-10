import localCoreScriptUrl from "@ffmpeg/core?url";
import localWasmUrl from "@ffmpeg/core/wasm?url";

export type FfmpegCoreStrategy = "local" | "remote";

export interface ResolvedFfmpegCoreAssetUrls {
  strategy: FfmpegCoreStrategy;
  coreScriptUrl: string;
  wasmUrl: string;
}

export interface ResolveFfmpegCoreAssetUrlsInput {
  strategy?: FfmpegCoreStrategy;
  basePath?: string;
}

const DEFAULT_REMOTE_FFMPEG_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

function normalizeBasePath(path: string): string {
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

export function resolveFfmpegCoreAssetUrls(
  input: ResolveFfmpegCoreAssetUrlsInput = {},
): ResolvedFfmpegCoreAssetUrls {
  const strategy: FfmpegCoreStrategy = input.strategy ?? "local";
  if (strategy === "local") {
    return {
      strategy: "local",
      coreScriptUrl: localCoreScriptUrl,
      wasmUrl: localWasmUrl,
    };
  }

  const basePath = normalizeBasePath(input.basePath ?? DEFAULT_REMOTE_FFMPEG_BASE);
  return {
    strategy: "remote",
    coreScriptUrl: `${basePath}/ffmpeg-core.js`,
    wasmUrl: `${basePath}/ffmpeg-core.wasm`,
  };
}
