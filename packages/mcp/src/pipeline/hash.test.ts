import { describe, expect, it } from "vitest";
import { sha256HexFromBytes, sha256HexFromString, stableJsonStringify } from "./hash.js";

describe("pipeline hash utilities", () => {
  it("stableJsonStringify sorts keys recursively", () => {
    const a = stableJsonStringify({
      z: 1,
      a: {
        k: 2,
        b: 1,
      },
      list: [
        { z: 2, a: 1 },
        { b: 2, a: 3 },
      ],
    });
    const b = stableJsonStringify({
      a: {
        b: 1,
        k: 2,
      },
      list: [
        { a: 1, z: 2 },
        { a: 3, b: 2 },
      ],
      z: 1,
    });
    expect(a).toBe(b);
  });

  it("sha256 hashing is deterministic for same input", () => {
    expect(sha256HexFromString("motionforge")).toBe(sha256HexFromString("motionforge"));
    expect(sha256HexFromBytes(Buffer.from("motionforge"))).toBe(sha256HexFromString("motionforge"));
  });
});
