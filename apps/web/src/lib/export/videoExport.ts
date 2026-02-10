import { strToU8, zipSync } from "fflate";
import { animationStore } from "../../state/animationStore.js";
import {
  buildFrameTimes,
  normalizeVideoExportSettings,
  validateVideoExportSettings,
  type VideoExportSettings,
} from "./videoExportConfig.js";
import {
  resolveFfmpegCoreAssetUrls,
  type FfmpegCoreStrategy,
  type ResolveFfmpegCoreAssetUrlsInput,
  type ResolvedFfmpegCoreAssetUrls,
} from "./videoExportCore.js";
export {
  buildFrameTimes,
  estimateVideoExportSeconds,
  frameIndexToTimeSeconds,
  normalizeVideoExportSettings,
  validateVideoExportSettings,
} from "./videoExportConfig.js";
export {
  resolveFfmpegCoreAssetUrls,
};
export type {
  FfmpegCoreStrategy,
  ResolveFfmpegCoreAssetUrlsInput,
  ResolvedFfmpegCoreAssetUrls,
};
export type { VideoExportFormat, VideoExportSettings } from "./videoExportConfig.js";

export type VideoExportProgressPhase = "warmup" | "render" | "encode" | "fallback";

export interface VideoExportProgress {
  phase: VideoExportProgressPhase;
  current: number;
  total: number;
  message: string;
}

export interface ExportVideoOptions {
  signal?: AbortSignal;
  onProgress?: (progress: VideoExportProgress) => void;
}

export interface ExportVideoResult {
  blob: Blob;
  extension: "mp4" | "gif" | "zip";
  mode: "video" | "png-sequence";
  encoderSource: "local" | "remote";
}

export interface ExportCleanupInput {
  ffmpegTerminate?: () => void;
  createdObjectUrls: string[];
  revokeObjectURL?: (url: string) => void;
}

export interface ExportCleanupResult {
  terminated: boolean;
  revokedObjectUrls: number;
}

export function cleanupExportResources(input: ExportCleanupInput): ExportCleanupResult {
  let terminated = false;
  if (input.ffmpegTerminate) {
    try {
      input.ffmpegTerminate();
      terminated = true;
    } catch {
      terminated = false;
    }
  }

  const revoke = input.revokeObjectURL ?? URL.revokeObjectURL;
  let revokedObjectUrls = 0;
  for (const url of input.createdObjectUrls) {
    try {
      revoke(url);
      revokedObjectUrls += 1;
    } catch {
      // Ignore revoke failures; cleanup remains best-effort.
    }
  }
  return { terminated, revokedObjectUrls };
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Video export canceled", "AbortError");
  }
}

function waitForRenderTick(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to capture frame"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

interface LoadedFfmpeg {
  ffmpeg: {
    terminate: () => void;
    on: (event: "progress", cb: (event: { progress: number }) => void) => void;
    load: (input: { coreURL: string; wasmURL: string }) => Promise<unknown>;
    writeFile: (name: string, data: Uint8Array) => Promise<unknown>;
    exec: (args: string[]) => Promise<unknown>;
    readFile: (name: string) => Promise<Uint8Array | string | ArrayBuffer>;
  };
  fetchFile: (input?: Blob | File | string) => Promise<Uint8Array>;
  encoderSource: "local" | "remote";
}

async function loadFfmpeg(options: {
  onProgress?: (progress: VideoExportProgress) => void;
}): Promise<LoadedFfmpeg> {
  const [{ FFmpeg }, { fetchFile }] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util"),
  ]);

  const ffmpeg = new FFmpeg();
  const local = resolveFfmpegCoreAssetUrls({ strategy: "local" });
  options.onProgress?.({
    phase: "warmup",
    current: 20,
    total: 100,
    message: "Warming up encoder (local cached core)...",
  });
  await ffmpeg.load({
    coreURL: local.coreScriptUrl,
    wasmURL: local.wasmUrl,
  });
  return { ffmpeg, fetchFile, encoderSource: "local" };
}

async function exportPngSequenceZip(
  frameBlobs: Blob[],
  settings: VideoExportSettings,
  options: ExportVideoOptions,
): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {};
  entries["README.txt"] = strToU8(
    [
      "MotionForge PNG Sequence Export",
      "",
      "FFmpeg encoding failed, so this fallback export contains rendered PNG frames.",
      "To encode manually:",
      `ffmpeg -framerate ${settings.fps} -i frame_%05d.png -c:v libx264 -pix_fmt yuv420p output.mp4`,
      "",
      "You can also import the sequence in your preferred video editor.",
    ].join("\n"),
  );

  for (let i = 0; i < frameBlobs.length; i += 1) {
    throwIfAborted(options.signal);
    const bytes = new Uint8Array(await frameBlobs[i].arrayBuffer());
    const fileName = `frame_${String(i).padStart(5, "0")}.png`;
    entries[fileName] = bytes;
    options.onProgress?.({
      phase: "fallback",
      current: i + 1,
      total: frameBlobs.length,
      message: `Packaging fallback PNG sequence ${i + 1}/${frameBlobs.length}`,
    });
  }

  const zipped = zipSync(entries, { level: 6 });
  const zipBytes = new Uint8Array(zipped.byteLength);
  zipBytes.set(zipped);
  return new Blob([zipBytes], { type: "application/zip" });
}

export async function exportVideoFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  rawSettings: VideoExportSettings,
  options: ExportVideoOptions = {},
): Promise<ExportVideoResult> {
  const errors = validateVideoExportSettings(rawSettings);
  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }

  const settings = normalizeVideoExportSettings(rawSettings);
  const frameTimes = buildFrameTimes(settings.durationSeconds, settings.fps);
  const captureCanvas = document.createElement("canvas");
  captureCanvas.width = settings.width;
  captureCanvas.height = settings.height;
  const context = captureCanvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create export canvas context");
  }

  const frameBlobs: Blob[] = [];
  let ffmpegTerminate: (() => void) | undefined;
  let encoderSource: ExportVideoResult["encoderSource"] = "local";

  try {
    options.onProgress?.({
      phase: "warmup",
      current: 0,
      total: 100,
      message: "Preparing export...",
    });

    for (let i = 0; i < frameTimes.length; i += 1) {
      throwIfAborted(options.signal);
      const timeSeconds = frameTimes[i];
      animationStore.scrubTo(timeSeconds);
      await waitForRenderTick();

      context.clearRect(0, 0, settings.width, settings.height);
      context.drawImage(sourceCanvas, 0, 0, settings.width, settings.height);
      const frameBlob = await canvasToPngBlob(captureCanvas);
      frameBlobs.push(frameBlob);

      options.onProgress?.({
        phase: "render",
        current: i + 1,
        total: frameTimes.length,
        message: `Rendering frames ${i + 1}/${frameTimes.length}`,
      });
    }

    throwIfAborted(options.signal);
    const loaded = await loadFfmpeg({
      onProgress: options.onProgress,
    });
    ffmpegTerminate = () => loaded.ffmpeg.terminate();
    encoderSource = loaded.encoderSource;

    const outputName = settings.format === "gif" ? "output.gif" : "output.mp4";

    loaded.ffmpeg.on("progress", (event: { progress: number }) => {
      const current = Math.max(1, Math.round(event.progress * 100));
      options.onProgress?.({
        phase: "encode",
        current,
        total: 100,
        message: `Encoding ${current}%`,
      });
    });

    for (let i = 0; i < frameBlobs.length; i += 1) {
      throwIfAborted(options.signal);
      const fileName = `frame_${String(i).padStart(5, "0")}.png`;
      await loaded.ffmpeg.writeFile(fileName, await loaded.fetchFile(frameBlobs[i]));
    }

    const common = [
      "-framerate",
      String(settings.fps),
      "-i",
      "frame_%05d.png",
    ];
    if (settings.format === "gif") {
      await loaded.ffmpeg.exec([...common, outputName]);
    } else {
      await loaded.ffmpeg.exec([...common, "-c:v", "libx264", "-pix_fmt", "yuv420p", outputName]);
    }

    const outputData = await loaded.ffmpeg.readFile(outputName);
    const mimeType = settings.format === "gif" ? "image/gif" : "video/mp4";
    const uint8 = typeof outputData === "string"
      ? new TextEncoder().encode(outputData)
      : outputData instanceof ArrayBuffer
        ? new Uint8Array(outputData)
        : new Uint8Array(outputData);
    return {
      blob: new Blob([uint8], { type: mimeType }),
      extension: settings.format,
      mode: "video",
      encoderSource,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    const fallbackBlob = await exportPngSequenceZip(frameBlobs, settings, options);
    return {
      blob: fallbackBlob,
      extension: "zip",
      mode: "png-sequence",
      encoderSource,
    };
  } finally {
    cleanupExportResources({
      ffmpegTerminate,
      createdObjectUrls: [],
    });
  }
}
