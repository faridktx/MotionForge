export type VideoExportFormat = "mp4" | "gif";

export interface VideoExportSettings {
  format: VideoExportFormat;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  transparentBackground: boolean;
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

export function estimateVideoExportSeconds(settings: VideoExportSettings): number {
  const frames = Math.max(1, Math.ceil(settings.durationSeconds * settings.fps));
  const frameCaptureSeconds = frames * 0.025;
  const encodeSeconds = settings.format === "gif" ? Math.max(2, settings.durationSeconds * 1.4) : Math.max(1.5, settings.durationSeconds * 0.8);
  return Math.max(2, Math.round((frameCaptureSeconds + encodeSeconds + 1.5) * 10) / 10);
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
