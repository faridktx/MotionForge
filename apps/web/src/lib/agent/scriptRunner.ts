import * as THREE from "three";
import { agentApi } from "./agentApi.js";
import { deserializeProject } from "../project/deserialize.js";
import { parseProjectJSONResult, serializeProject } from "../project/serialize.js";
import { sceneStore } from "../../state/sceneStore.js";

export interface AgentScriptAction {
  action: string;
  input?: unknown;
}

export interface AgentScriptPlan {
  projectJson: string;
  actions: AgentScriptAction[];
}

export interface AgentScriptActionReport {
  index: number;
  action: string;
  ok: boolean;
  error: string | null;
  result: unknown;
  events: unknown[];
}

export interface AgentScriptRunResult {
  finalProjectJson: string;
  reports: AgentScriptActionReport[];
  exports: Array<{
    type: string;
    payload: unknown;
  }>;
  error?: string;
}

function ensureHeadlessScene() {
  if (sceneStore.getScene()) return;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
  const target = new THREE.Vector3(0, 0, 0);
  sceneStore.setScene(scene, camera, target);
}

function isExportCommandAction(action: AgentScriptAction): string | null {
  if (action.action !== "command.execute") return null;
  if (typeof action.input !== "object" || action.input === null) return null;
  const commandId = (action.input as { commandId?: unknown }).commandId;
  if (commandId === "agent.project.exportBundle") return "bundle";
  if (commandId === "agent.project.exportVideoPreview") return "video-preview";
  return null;
}

async function restoreProjectFromJson(projectJson: string): Promise<void> {
  const parsed = parseProjectJSONResult(projectJson);
  if (!parsed.data) {
    return;
  }
  await deserializeProject(parsed.data);
}

export async function runAgentScript(plan: AgentScriptPlan): Promise<AgentScriptRunResult> {
  ensureHeadlessScene();

  const baselineJson = JSON.stringify(serializeProject());
  const reports: AgentScriptActionReport[] = [];
  const exports: Array<{ type: string; payload: unknown }> = [];

  const parsedPlanProject = parseProjectJSONResult(plan.projectJson);
  if (!parsedPlanProject.data) {
    return {
      finalProjectJson: baselineJson,
      reports: [],
      exports: [],
      error: parsedPlanProject.error ?? "Invalid project JSON input.",
    };
  }

  try {
    await deserializeProject(parsedPlanProject.data);

    for (let index = 0; index < plan.actions.length; index += 1) {
      const action = plan.actions[index];
      const response = await agentApi.execute(action.action, action.input ?? {});
      reports.push({
        index,
        action: action.action,
        ok: response.ok,
        error: response.error,
        result: response.result,
        events: response.events,
      });

      const exportType = isExportCommandAction(action);
      if (exportType && response.ok) {
        exports.push({
          type: exportType,
          payload: response.result,
        });
      }

      if (!response.ok) {
        throw new Error(`Action ${index} failed: ${response.error ?? "unknown error"}`);
      }
    }

    const finalProjectJson = JSON.stringify(serializeProject(), null, 2);
    return {
      finalProjectJson,
      reports,
      exports,
    };
  } catch (error) {
    return {
      finalProjectJson: baselineJson,
      reports,
      exports,
      error: error instanceof Error ? error.message : "Script run failed.",
    };
  } finally {
    await restoreProjectFromJson(baselineJson);
  }
}
