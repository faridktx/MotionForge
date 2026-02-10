import { createHash } from "node:crypto";

function toStableJsonValue(input: unknown): unknown {
  if (input === null || typeof input !== "object") return input;
  if (Array.isArray(input)) {
    return input.map((item) => toStableJsonValue(item));
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    out[key] = toStableJsonValue(record[key]);
  }
  return out;
}

export function stableJsonStringify(input: unknown): string {
  return JSON.stringify(toStableJsonValue(input), null, 2);
}

export function sha256HexFromString(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function sha256HexFromBytes(input: Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}
