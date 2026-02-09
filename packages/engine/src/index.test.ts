import { describe, it, expect } from "vitest";
import { createEngineVersion } from "./index.js";

describe("createEngineVersion", () => {
  it("returns a version string", () => {
    const version = createEngineVersion();
    expect(version).toBe("0.0.1");
  });
});
