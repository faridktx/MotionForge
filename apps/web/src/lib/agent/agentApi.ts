import type { TrackProperty } from "@motionforge/engine";
import { animationStore } from "../../state/animationStore.js";
import { assetStore } from "../../state/assetStore.js";
import { keyframeSelectionStore } from "../../state/keyframeSelectionStore.js";
import { sceneStore } from "../../state/sceneStore.js";
import { commandBus } from "../commands/commandBus.js";
import { ensureAgentCommandsRegistered } from "./agentCommands.js";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
interface JsonObject {
  [key: string]: JsonValue;
}

export interface AgentActionCapability {
  action: string;
  description: string;
  inputSchema: JsonObject;
}

export interface AgentStateSnapshot {
  scene: {
    selectedObjectId: string | null;
    nodeCount: number;
    nodes: Array<{
      id: string;
      name: string;
      type: string;
      parentId: string | null;
    }>;
  };
  keyframeSelection: Array<{
    objectId: string;
    propertyPath: TrackProperty;
    time: number;
  }>;
  assets: {
    count: number;
    items: Array<{
      id: string;
      name: string;
      type: string;
      sourceMode: "embedded" | "external";
      size: number;
    }>;
  };
  animation: {
    durationSeconds: number;
    trackCount: number;
    keyframeCount: number;
    tracks: Array<{
      objectId: string;
      property: TrackProperty;
      keyframeCount: number;
      times: number[];
    }>;
  };
  playback: {
    timeSeconds: number;
    isPlaying: boolean;
  };
}

export interface AgentExecuteResponse {
  ok: boolean;
  result: JsonValue | null;
  events: JsonObject[];
  error: string | null;
}

interface CommandExecuteInput {
  commandId: string;
  payload?: JsonValue;
}

const CAPABILITIES: readonly AgentActionCapability[] = [
  {
    action: "command.execute",
    description: "Execute a registered commandBus command with optional payload.",
    inputSchema: {
      type: "object",
      required: ["commandId"],
      properties: {
        commandId: { type: "string" },
        payload: { type: ["object", "array", "string", "number", "boolean", "null"] },
      },
    },
  },
  {
    action: "state.snapshot",
    description: "Get deterministic scene/selection/asset/animation summary.",
    inputSchema: {
      type: "object",
      required: [],
      properties: {},
    },
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeJsonValue(input: unknown): JsonValue {
  if (
    input === null
    || typeof input === "string"
    || typeof input === "number"
    || typeof input === "boolean"
  ) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => normalizeJsonValue(item));
  }

  if (isRecord(input)) {
    const sortedKeys = Object.keys(input).sort((a, b) => a.localeCompare(b));
    const result: JsonObject = {};
    for (const key of sortedKeys) {
      result[key] = normalizeJsonValue(input[key]);
    }
    return result;
  }

  return String(input);
}

function parseCommandExecuteInput(input: unknown): CommandExecuteInput | null {
  if (!isRecord(input)) return null;
  if (typeof input.commandId !== "string" || input.commandId.length === 0) return null;
  return {
    commandId: input.commandId,
    payload: input.payload as JsonValue | undefined,
  };
}

function buildSnapshot(): AgentStateSnapshot {
  const scene = sceneStore.getSnapshot();
  const nodes = [...scene.nodes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      parentId: node.parentId,
    }));

  const selectedKeyframes = [...keyframeSelectionStore.getSelected()]
    .sort((a, b) => {
      const objectCompare = a.objectId.localeCompare(b.objectId);
      if (objectCompare !== 0) return objectCompare;
      const propertyCompare = a.propertyPath.localeCompare(b.propertyPath);
      if (propertyCompare !== 0) return propertyCompare;
      return a.time - b.time;
    })
    .map((item) => ({
      objectId: item.objectId,
      propertyPath: item.propertyPath,
      time: Number(item.time.toFixed(6)),
    }));

  const assets = [...assetStore.getAssets()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((asset) => ({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      sourceMode: asset.source.mode,
      size: asset.size,
    }));

  const clip = animationStore.getClip();
  const tracks = [...clip.tracks]
    .sort((a, b) => {
      const objectCompare = a.objectId.localeCompare(b.objectId);
      if (objectCompare !== 0) return objectCompare;
      return a.property.localeCompare(b.property);
    })
    .map((track) => ({
      objectId: track.objectId,
      property: track.property,
      keyframeCount: track.keyframes.length,
      times: track.keyframes.map((keyframe) => Number(keyframe.time.toFixed(6))),
    }));

  return {
    scene: {
      selectedObjectId: scene.selectedId,
      nodeCount: nodes.length,
      nodes,
    },
    keyframeSelection: selectedKeyframes,
    assets: {
      count: assets.length,
      items: assets,
    },
    animation: {
      durationSeconds: Number(clip.durationSeconds.toFixed(6)),
      trackCount: tracks.length,
      keyframeCount: tracks.reduce((sum, track) => sum + track.keyframeCount, 0),
      tracks,
    },
    playback: {
      timeSeconds: Number(animationStore.getCurrentTime().toFixed(6)),
      isPlaying: animationStore.isPlaying(),
    },
  };
}

export const agentApi = {
  getCapabilities(): AgentActionCapability[] {
    ensureAgentCommandsRegistered();
    return CAPABILITIES.map((capability) => ({
      action: capability.action,
      description: capability.description,
      inputSchema: normalizeJsonValue(capability.inputSchema) as JsonObject,
    }));
  },

  getStateSnapshot(): AgentStateSnapshot {
    ensureAgentCommandsRegistered();
    return buildSnapshot();
  },

  async execute(action: string, input: unknown): Promise<AgentExecuteResponse> {
    ensureAgentCommandsRegistered();
    if (action === "state.snapshot") {
      return {
        ok: true,
        result: normalizeJsonValue(buildSnapshot()),
        events: [{ type: "agent.snapshot" }],
        error: null,
      };
    }

    if (action !== "command.execute") {
      return {
        ok: false,
        result: null,
        events: [],
        error: `Unsupported action "${action}".`,
      };
    }

    const parsed = parseCommandExecuteInput(input);
    if (!parsed) {
      return {
        ok: false,
        result: null,
        events: [],
        error: "Invalid input for command.execute.",
      };
    }

    const execution = await commandBus.executeWithResult(parsed.commandId, {
      respectInputFocus: false,
      payload: parsed.payload,
    });

    if (!execution.executed) {
      return {
        ok: false,
        result: null,
        events: [
          {
            type: "command.rejected",
            commandId: parsed.commandId,
            reason: execution.reason ?? "failed",
          },
        ],
        error: execution.error ?? "Command execution failed.",
      };
    }

    return {
      ok: true,
      result: normalizeJsonValue(execution.result ?? null),
      events: [{ type: "command.executed", commandId: parsed.commandId }],
      error: null,
    };
  },
};
