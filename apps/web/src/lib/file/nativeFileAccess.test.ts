import { describe, expect, it } from "vitest";
import {
  isNativeFileAccessSupported,
  readNativeFileAccessSettings,
  writeNativeFileAccessSettings,
} from "./nativeFileAccess.js";

describe("nativeFileAccess", () => {
  it("detects support when picker functions exist", () => {
    const supported = isNativeFileAccessSupported({
      showOpenFilePicker: () => Promise.resolve([]),
      showSaveFilePicker: () => Promise.resolve({}),
    });
    expect(supported).toBe(true);
  });

  it("reads and writes settings from localStorage", () => {
    localStorage.clear();
    expect(readNativeFileAccessSettings().enabled).toBe(false);
    writeNativeFileAccessSettings({ enabled: true });
    expect(readNativeFileAccessSettings().enabled).toBe(true);
  });
});

