import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_PROJECT } from "../project/demoProject.js";
import { deserializeProject, newProject } from "../project/deserialize.js";
import { serializeProject } from "../project/serialize.js";
import { sceneStore } from "../../state/sceneStore.js";
import { runAgentScript } from "./scriptRunner.js";

function ensureHeadlessScene() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
  const target = new THREE.Vector3(0, 0, 0);
  sceneStore.setScene(scene, camera, target);
}

describe("runAgentScript", () => {
  beforeEach(async () => {
    ensureHeadlessScene();
    newProject();
    await deserializeProject(DEMO_PROJECT);
  });

  it("runs a deterministic action plan and yields expected final project json", async () => {
    const result = await runAgentScript({
      projectJson: JSON.stringify(DEMO_PROJECT),
      actions: [
        {
          action: "command.execute",
          input: {
            commandId: "agent.hierarchy.renameMany",
            payload: {
              changes: [{ objectId: "demo_cube", name: "Agent Cube" }],
            },
          },
        },
        {
          action: "command.execute",
          input: {
            commandId: "agent.project.exportBundle",
            payload: { includeData: false },
          },
        },
      ],
    });

    expect(result.error).toBeUndefined();
    expect(result.reports).toHaveLength(2);
    expect(result.exports).toHaveLength(1);

    const parsedFinal = JSON.parse(result.finalProjectJson) as {
      objects: Array<{ id: string; name: string }>;
    };
    const demoCube = parsedFinal.objects.find((item) => item.id === "demo_cube");
    expect(demoCube?.name).toBe("Agent Cube");
  });

  it("does not leave partial live-state mutations on mid-script failure", async () => {
    const baseline = JSON.stringify(serializeProject());
    const result = await runAgentScript({
      projectJson: JSON.stringify(DEMO_PROJECT),
      actions: [
        {
          action: "command.execute",
          input: {
            commandId: "agent.hierarchy.renameMany",
            payload: {
              changes: [{ objectId: "demo_cube", name: "Renamed Once" }],
            },
          },
        },
        {
          action: "command.execute",
          input: {
            commandId: "missing.command.id",
          },
        },
      ],
    });

    expect(result.error).toContain("Action 1 failed");
    expect(JSON.stringify(serializeProject())).toBe(baseline);
  });
});
