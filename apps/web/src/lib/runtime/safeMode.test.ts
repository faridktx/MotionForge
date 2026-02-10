import { describe, expect, it } from "vitest";
import { isSafeModeEnabled, shouldRenderViewport } from "./safeMode.js";

describe("safe mode runtime helpers", () => {
  it("detects safe mode from query string", () => {
    expect(isSafeModeEnabled("?safe=1")).toBe(true);
    expect(isSafeModeEnabled("?safe=0")).toBe(false);
    expect(isSafeModeEnabled("?foo=bar")).toBe(false);
  });

  it("gates viewport rendering when safe mode is enabled", () => {
    expect(shouldRenderViewport(true)).toBe(false);
    expect(shouldRenderViewport(false)).toBe(true);
  });
});
