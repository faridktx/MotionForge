import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deserializeProject, newProject } from "../project/deserialize.js";
import { DEMO_PROJECT } from "../project/demoProject.js";
import { commandBus } from "../commands/commandBus.js";
import { sceneStore } from "../../state/sceneStore.js";
import { agentApi } from "./agentApi.js";

function ensureHeadlessScene() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
  const target = new THREE.Vector3(0, 0, 0);
  sceneStore.setScene(scene, camera, target);
}

describe("agentApi capabilities", () => {
  it("returns stable capability shape", () => {
    const capabilities = agentApi.getCapabilities();
    expect(capabilities).toEqual([
      {
        action: "command.execute",
        description: "Execute a registered commandBus command with optional payload.",
        inputSchema: {
          properties: {
            commandId: { type: "string" },
            payload: { type: ["object", "array", "string", "number", "boolean", "null"] },
          },
          required: ["commandId"],
          type: "object",
        },
      },
      {
        action: "state.snapshot",
        description: "Get deterministic scene/selection/asset/animation summary.",
        inputSchema: {
          properties: {},
          required: [],
          type: "object",
        },
      },
    ]);
  });
});

describe("agentApi execute routing", () => {
  it("routes through commandBus and returns result", async () => {
    const run = vi.fn((payload?: unknown) => ({ payload }));
    const unregister = commandBus.register({
      id: "test.agent.execute",
      title: "Test Agent Execute",
      category: "test",
      run,
    });

    try {
      const response = await agentApi.execute("command.execute", {
        commandId: "test.agent.execute",
        payload: { a: 1, b: "x" },
      });

      expect(response.ok).toBe(true);
      expect(response.error).toBeNull();
      expect(response.events).toEqual([{ type: "command.executed", commandId: "test.agent.execute" }]);
      expect(response.result).toEqual({ payload: { a: 1, b: "x" } });
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });

  it("enforces enabled predicate", async () => {
    const run = vi.fn();
    const unregister = commandBus.register({
      id: "test.agent.disabled",
      title: "Test Agent Disabled",
      category: "test",
      isEnabled: () => false,
      run,
    });

    try {
      const response = await agentApi.execute("command.execute", {
        commandId: "test.agent.disabled",
      });
      expect(response.ok).toBe(false);
      expect(response.error).toContain("disabled");
      expect(response.events[0]).toEqual({
        type: "command.rejected",
        commandId: "test.agent.disabled",
        reason: "disabled",
      });
      expect(run).toHaveBeenCalledTimes(0);
    } finally {
      unregister();
    }
  });
});

describe("agentApi snapshot determinism", () => {
  beforeEach(async () => {
    ensureHeadlessScene();
    newProject();
    await deserializeProject(DEMO_PROJECT);
  });

  it("returns stable snapshots for same loaded project", () => {
    const snapshotA = agentApi.getStateSnapshot();
    const snapshotB = agentApi.getStateSnapshot();
    expect(snapshotA).toEqual(snapshotB);
  });
});
