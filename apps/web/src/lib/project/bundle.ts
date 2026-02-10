import { strFromU8, unzipSync } from "fflate";
import { arrayBufferToBase64 } from "../three/importGltf.js";
import type { ParseProjectResult, ProjectData } from "./serialize.js";
import { getBundleAssetFileName, parseProjectJSONResult } from "./serialize.js";

export interface ParseBundleResult extends ParseProjectResult {
  warnings: string[];
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
    return { data: null, error: "Bundle is not a valid zip file.", warnings: [] };
  }

  const projectBytes = resolveBundleFile(files, "project.json");
  if (!projectBytes) {
    return { data: null, error: 'Bundle is missing required file "project.json".', warnings: [] };
  }

  const projectText = strFromU8(projectBytes);
  const parsed = parseProjectJSONResult(projectText);
  if (!parsed.data) {
    return { data: null, error: parsed.error ?? "project.json is invalid.", warnings: [] };
  }

  const data = structuredClone(parsed.data) as ProjectData;
  const warnings: string[] = [];

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
      };
    }
    asset.source.data = arrayBufferToBase64(toArrayBuffer(bytes));
    asset.size = bytes.byteLength;
  }

  return { data, error: null, warnings };
}
