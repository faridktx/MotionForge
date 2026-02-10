import { strFromU8, unzipSync } from "fflate";
import { arrayBufferToBase64 } from "../three/importGltf.js";
import type { ParseProjectResult, ProjectData } from "./serialize.js";
import { getBundleAssetFileName, parseProjectJSONResult } from "./serialize.js";

export interface BundleManifestData {
  version: number;
  exportedAt: string;
  projectVersion: number;
  primaryModelAssetId: string | null;
  takes?: Array<{
    id: string;
    name: string;
    startTime: number;
    endTime: number;
  }>;
  clipNaming?: {
    pattern: string;
    fallbackTakeName: string;
  };
}

export interface ParseBundleResult extends ParseProjectResult {
  warnings: string[];
  manifest: BundleManifestData | null;
}

function normalizeBundlePath(path: string): string {
  return path.replace(/^\.?\//, "");
}

function resolveBundleFile(files: Record<string, Uint8Array>, targetPath: string): Uint8Array | undefined {
  const direct = files[targetPath];
  if (direct) return direct;

  const normalizedTarget = normalizeBundlePath(targetPath);
  for (const [name, bytes] of Object.entries(files)) {
    const normalizedName = normalizeBundlePath(name);
    if (normalizedName === normalizedTarget || normalizedName.endsWith(`/${normalizedTarget}`)) {
      return bytes;
    }
  }
  return undefined;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function parseProjectBundle(zipBytes: Uint8Array): ParseBundleResult {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zipBytes);
  } catch {
    return { data: null, error: "Bundle is not a valid zip file.", warnings: [], manifest: null };
  }

  const projectBytes = resolveBundleFile(files, "project.json");
  if (!projectBytes) {
    return { data: null, error: 'Bundle is missing required file "project.json".', warnings: [], manifest: null };
  }

  const projectText = strFromU8(projectBytes);
  const parsed = parseProjectJSONResult(projectText);
  if (!parsed.data) {
    return { data: null, error: parsed.error ?? "project.json is invalid.", warnings: [], manifest: null };
  }

  const data = structuredClone(parsed.data) as ProjectData;
  const warnings: string[] = [];
  let manifest: BundleManifestData | null = null;
  const manifestBytes = resolveBundleFile(files, "motionforge-manifest.json");
  if (manifestBytes) {
    try {
      const parsedManifest = JSON.parse(strFromU8(manifestBytes)) as Record<string, unknown>;
      if (
        typeof parsedManifest.version === "number" &&
        typeof parsedManifest.exportedAt === "string" &&
        typeof parsedManifest.projectVersion === "number"
      ) {
        const takes = Array.isArray(parsedManifest.takes)
          ? parsedManifest.takes
              .map((take) => {
                if (typeof take !== "object" || take === null) return null;
                const row = take as Record<string, unknown>;
                if (
                  typeof row.id !== "string" ||
                  typeof row.name !== "string" ||
                  typeof row.startTime !== "number" ||
                  typeof row.endTime !== "number"
                ) {
                  return null;
                }
                return {
                  id: row.id,
                  name: row.name,
                  startTime: row.startTime,
                  endTime: row.endTime,
                };
              })
              .filter((item): item is { id: string; name: string; startTime: number; endTime: number } => item !== null)
          : undefined;
        manifest = {
          version: parsedManifest.version,
          exportedAt: parsedManifest.exportedAt,
          projectVersion: parsedManifest.projectVersion,
          primaryModelAssetId:
            typeof parsedManifest.primaryModelAssetId === "string" ? parsedManifest.primaryModelAssetId : null,
          takes,
          clipNaming:
            typeof parsedManifest.clipNaming === "object" &&
            parsedManifest.clipNaming !== null &&
            typeof (parsedManifest.clipNaming as Record<string, unknown>).pattern === "string" &&
            typeof (parsedManifest.clipNaming as Record<string, unknown>).fallbackTakeName === "string"
              ? {
                  pattern: (parsedManifest.clipNaming as Record<string, unknown>).pattern as string,
                  fallbackTakeName: (parsedManifest.clipNaming as Record<string, unknown>).fallbackTakeName as string,
                }
              : undefined,
        };
      } else {
        warnings.push('Bundle manifest exists but is invalid; continuing with "project.json".');
      }
    } catch {
      warnings.push('Bundle manifest exists but is invalid JSON; continuing with "project.json".');
    }
  }

  for (const asset of data.assets ?? []) {
    if (asset.source.mode !== "embedded") {
      warnings.push(`Asset "${asset.id}" uses external source path and was not reconstructed.`);
      continue;
    }
    const bundlePath = `assets/${getBundleAssetFileName(asset)}`;
    const bytes = resolveBundleFile(files, bundlePath);
    if (!bytes) {
      return {
        data: null,
        error: `Bundle is missing asset payload "${bundlePath}" for asset "${asset.id}".`,
        warnings,
        manifest,
      };
    }
    asset.source.data = arrayBufferToBase64(toArrayBuffer(bytes));
    asset.size = bytes.byteLength;
  }

  return { data, error: null, warnings, manifest };
}
