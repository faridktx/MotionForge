import { describe, expect, it, vi } from "vitest";
import {
  buildFrameTimes,
  cleanupExportResources,
  frameIndexToTimeSeconds,
  normalizeVideoExportSettings,
  resolveFfmpegCoreAssetUrls,
  validateVideoExportSettings,
  type VideoExportSettings,
} from "./videoExport.js";

describe("video export settings validation", () => {
  it("accepts valid settings", () => {
    const settings: VideoExportSettings = {
      format: "mp4",
      width: 1280,
      height: 720,
      fps: 30,
      durationSeconds: 2,
      transparentBackground: false,
    };
    expect(validateVideoExportSettings(settings)).toEqual([]);
  });

  it("rejects invalid dimension/fps/duration", () => {
    const settings: VideoExportSettings = {
      format: "gif",
      width: 0,
      height: -10,
      fps: 0,
      durationSeconds: 0,
      transparentBackground: true,
    };
    const errors = validateVideoExportSettings(settings);
    expect(errors.join(" ")).toContain("Width");
    expect(errors.join(" ")).toContain("Height");
    expect(errors.join(" ")).toContain("FPS");
    expect(errors.join(" ")).toContain("Duration");
  });

  it("normalizes settings into integer-safe values", () => {
    const normalized = normalizeVideoExportSettings({
      format: "mp4",
      width: 1280.9,
      height: 719.2,
      fps: 29.6,
      durationSeconds: 2.4,
      transparentBackground: false,
    });
    expect(normalized.width).toBe(1281);
    expect(normalized.height).toBe(719);
    expect(normalized.fps).toBe(30);
    expect(normalized.durationSeconds).toBeCloseTo(2.4);
  });
});

describe("frame scheduling math", () => {
  it("maps frame index to seconds deterministically", () => {
    expect(frameIndexToTimeSeconds(0, 30)).toBe(0);
    expect(frameIndexToTimeSeconds(1, 30)).toBeCloseTo(1 / 30);
    expect(frameIndexToTimeSeconds(15, 30)).toBeCloseTo(0.5);
  });

  it("builds frame times for duration and fps", () => {
    const frames = buildFrameTimes(2, 4);
    expect(frames).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75]);
  });
});

describe("ffmpeg core asset resolution", () => {
  it("resolves local asset URLs when strategy is local", () => {
    const urls = resolveFfmpegCoreAssetUrls({ strategy: "local" });
    expect(urls.strategy).toBe("local");
    expect(urls.coreScriptUrl).toContain("ffmpeg-core.js");
    expect(urls.wasmUrl).toContain("ffmpeg-core.wasm");
  });

  it("resolves remote asset URLs when strategy is remote", () => {
    expect(resolveFfmpegCoreAssetUrls({ strategy: "remote", basePath: "https://cdn.example.com/ffmpeg" })).toEqual({
      strategy: "remote",
      coreScriptUrl: "https://cdn.example.com/ffmpeg/ffmpeg-core.js",
      wasmUrl: "https://cdn.example.com/ffmpeg/ffmpeg-core.wasm",
    });
  });
});

describe("export cleanup", () => {
  it("terminates encoder and revokes all object URLs", () => {
    const terminate = vi.fn();
    const revokeObjectURL = vi.fn();

    const result = cleanupExportResources({
      ffmpegTerminate: terminate,
      createdObjectUrls: ["blob:a", "blob:b"],
      revokeObjectURL,
    });

    expect(terminate).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      terminated: true,
      revokedObjectUrls: 2,
    });
  });
});
