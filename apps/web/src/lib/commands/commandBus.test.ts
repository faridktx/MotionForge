import { describe, expect, it, vi } from "vitest";
import { commandBus } from "./commandBus.js";

describe("commandBus", () => {
  it("filters commands and respects enabled predicates", () => {
    const runEnabled = vi.fn();
    const runDisabled = vi.fn();
    const unregisterEnabled = commandBus.register({
      id: "test.enabled",
      title: "Enabled Command",
      category: "test",
      keywords: ["alpha"],
      isEnabled: () => true,
      run: runEnabled,
    });
    const unregisterDisabled = commandBus.register({
      id: "test.disabled",
      title: "Disabled Command",
      category: "test",
      keywords: ["beta"],
      isEnabled: () => false,
      run: runDisabled,
    });

    try {
      expect(commandBus.filter("alpha").map((command) => command.id)).toEqual(["test.enabled"]);
      expect(commandBus.isEnabled("test.enabled")).toBe(true);
      expect(commandBus.isEnabled("test.disabled")).toBe(false);

      expect(commandBus.execute("test.enabled", { respectInputFocus: false })).toBe(true);
      expect(commandBus.execute("test.disabled", { respectInputFocus: false })).toBe(false);
      expect(runEnabled).toHaveBeenCalledTimes(1);
      expect(runDisabled).toHaveBeenCalledTimes(0);
    } finally {
      unregisterEnabled();
      unregisterDisabled();
    }
  });

  it("executes registered handlers", () => {
    const run = vi.fn();
    const unregister = commandBus.register({
      id: "test.run",
      title: "Run Command",
      category: "test",
      run,
    });

    try {
      const executed = commandBus.execute("test.run", { respectInputFocus: false });
      expect(executed).toBe(true);
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });
});
