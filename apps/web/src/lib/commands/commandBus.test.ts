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

  it("returns missing status for unknown commands", async () => {
    const executed = commandBus.execute("missing.command", { respectInputFocus: false });
    expect(executed).toBe(false);

    const outcome = await commandBus.executeWithResult("missing.command", { respectInputFocus: false });
    expect(outcome.executed).toBe(false);
    expect(outcome.reason).toBe("missing");
  });

  it("surfaces confirm-required and ambiguous-name command failures", async () => {
    const unregisterConfirm = commandBus.register({
      id: "test.confirmRequired",
      title: "Confirm Required",
      category: "test",
      run: () => {
        throw new Error("MF_ERR_CONFIRM_REQUIRED: confirm=true required.");
      },
    });
    const unregisterAmbiguous = commandBus.register({
      id: "test.ambiguousName",
      title: "Ambiguous Name",
      category: "test",
      run: () => {
        throw new Error("MF_ERR_AMBIGUOUS_NAME: Cube, Cube 2");
      },
    });

    try {
      const confirmOutcome = await commandBus.executeWithResult("test.confirmRequired", { respectInputFocus: false });
      expect(confirmOutcome.executed).toBe(false);
      expect(confirmOutcome.reason).toBe("failed");
      expect(confirmOutcome.error).toContain("MF_ERR_CONFIRM_REQUIRED");

      const ambiguousOutcome = await commandBus.executeWithResult("test.ambiguousName", { respectInputFocus: false });
      expect(ambiguousOutcome.executed).toBe(false);
      expect(ambiguousOutcome.reason).toBe("failed");
      expect(ambiguousOutcome.error).toContain("MF_ERR_AMBIGUOUS_NAME");
    } finally {
      unregisterConfirm();
      unregisterAmbiguous();
    }
  });
});
