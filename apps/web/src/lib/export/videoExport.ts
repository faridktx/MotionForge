import { animationStore } from "../../state/animationStore.js";

export type VideoExportFormat = "mp4" | "gif";

export interface VideoExportSettings {
  format: VideoExportFormat;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  transparentBackground: boolean;
}

export interface VideoExportProgress {
  phase: "render" | "encode";
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
  extension: "mp4" | "gif";
}

export function validateVideoExportSettings(settings: VideoExportSettings): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(settings.width) || settings.width <= 0) {
    errors.push("Width must be greater than 0.");
  }
  if (!Number.isFinite(settings.height) || settings.height <= 0) {
    errors.push("Height must be greater than 0.");
  }
  if (!Number.isFinite(settings.fps) || settings.fps <= 0) {
    errors.push("FPS must be greater than 0.");
  }
  if (!Number.isFinite(settings.durationSeconds) || settings.durationSeconds <= 0) {
    errors.push("Duration must be greater than 0.");
  }
  if (settings.durationSeconds > 120) {
    errors.push("Duration must be 120 seconds or less.");
  }
  if (settings.fps > 60) {
    errors.push("FPS must be 60 or less.");
  }
  return errors;
}

export function normalizeVideoExportSettings(settings: VideoExportSettings): VideoExportSettings {
  return {
    ...settings,
    width: Math.max(1, Math.round(settings.width)),
    height: Math.max(1, Math.round(settings.height)),
    fps: Math.max(1, Math.round(settings.fps)),
    durationSeconds: Math.max(0.001, settings.durationSeconds),
  };
}

export function frameIndexToTimeSeconds(frameIndex: number, fps: number): number {
  return frameIndex / fps;
}

export function buildFrameTimes(durationSeconds: number, fps: number): number[] {
  const frameCount = Math.max(1, Math.ceil(durationSeconds * fps));
  const frames: number[] = [];
  for (let i = 0; i < frameCount; i += 1) {
    frames.push(frameIndexToTimeSeconds(i, fps));
  }
  return frames;
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

async function loadFfmpeg() {
  const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util"),
  ]);
  const ffmpeg = new FFmpeg();
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  return { ffmpeg, fetchFile };
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
      message: `Rendered ${i + 1}/${frameTimes.length} frames`,
    });
  }

  throwIfAborted(options.signal);
  const { ffmpeg, fetchFile } = await loadFfmpeg();
  const outputName = settings.format === "gif" ? "output.gif" : "output.mp4";

  ffmpeg.on("progress", (event: { progress: number }) => {
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
    await ffmpeg.writeFile(fileName, await fetchFile(frameBlobs[i]));
  }

  const common = [
    "-framerate",
    String(settings.fps),
    "-i",
    "frame_%05d.png",
  ];
  if (settings.format === "gif") {
    await ffmpeg.exec([...common, outputName]);
  } else {
    await ffmpeg.exec([...common, "-c:v", "libx264", "-pix_fmt", "yuv420p", outputName]);
  }

  const outputData = await ffmpeg.readFile(outputName);
  ffmpeg.terminate();
  const mimeType = settings.format === "gif" ? "image/gif" : "video/mp4";
  const uint8 = typeof outputData === "string"
    ? new TextEncoder().encode(outputData)
    : new Uint8Array(outputData);
  return {
    blob: new Blob([uint8], { type: mimeType }),
    extension: settings.format,
  };
}
