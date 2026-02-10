import { readFile, writeFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  PlannerError,
  applyPlanStepsAtomic,
  generatePlan as generateAgentPlan,
  simulatePlanDiff,
} from "@motionforge/agent";
import { compileScriptToPlan, validateScript } from "@motionforge/script";
import { ZodObject, ZodTypeAny } from "zod";
import {
  MfPipelineMakeBundleInputSchema,
  MfCommandExecuteInputSchema,
  MfExportBundleInputSchema,
  MfExportProjectJsonInputSchema,
  MfExportUnityPackageInputSchema,
  MfExportVideoInputSchema,
  MfIoReadFileBase64InputSchema,
  MfIoWriteFileInputSchema,
  MfPlanApplyInputSchema,
  MfPlanDiscardInputSchema,
  MfPlanGenerateInputSchema,
  MfPlanPreviewDiffInputSchema,
  MfPingInputSchema,
  MfProjectCommitInputSchema,
  MfProjectDiscardInputSchema,
  MfProjectLoadJsonInputSchema,
  MfScriptCompileInputSchema,
  MfScriptRunInputSchema,
  MfScriptExamplesInputSchema,
  MfScriptValidateInputSchema,
  MfSkillGenerateScriptInputSchema,
  MfStateSnapshotInputSchema,
  ToolDefinitions,
  ToolSchemas,
  type MotionforgeToolName,
} from "./schema.js";
import type { RuntimeInstance } from "./runtime/runtime.js";
import { RuntimeError, asRuntimeError } from "./runtime/errors.js";
import { generateScriptFromGoal } from "./tools/skill.js";
import { runMakeBundlePipeline } from "./pipeline/makeBundle.js";

interface RegisterToolsOptions {
  version: string;
  commit?: string;
  maxAssetBytes: number;
}

interface ToolFailure {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type ToolResponse = {
  ok: boolean;
  [key: string]: unknown;
} | ToolFailure;

export type ToolHandler = (input: unknown) => Promise<ToolResponse> | ToolResponse;

export type ToolHandlerMap = Record<MotionforgeToolName, ToolHandler>;

interface PlanRecord {
  planId: string;
  scope: "current" | "staged";
  plan: {
    summary: {
      durationSec: number;
      objectsTouched: string[];
      keyframesToAdd?: number;
      commands: number;
    };
    steps: Array<{
      id: string;
      label: string;
      type: "inspect" | "mutate";
      command: {
        action: string;
        input: unknown;
      };
      rationale: string;
    }>;
    safety: {
      requiresConfirm: boolean;
      reasons: string[];
    };
  };
  baseProjectJson: string;
  baseProjectHash: string;
}

const SCRIPT_EXAMPLES = [
  {
    name: "bounce",
    description: "Quick bounce with squash/stretch helper.",
    script: `select "obj_cube"
duration 1
label "Bounce"
bounce amplitude 1.2 at 0..1`,
  },
  {
    name: "recoil",
    description: "Kick-back and recover helper.",
    script: `select "obj_cube"
duration 0.4
label "Recoil"
recoil distance 0.25 at 0..0.4`,
  },
  {
    name: "anticipation-hit",
    description: "Anticipation, impact, and settle using explicit keys.",
    script: `select "obj_cube"
duration 1.2
label "Anticipation Hit"
key position x at 0 = 0 ease easeOut
key position x at 0.35 = -0.35 ease easeIn
key position x at 0.6 = 1.2 ease step
key position x at 1.2 = 0 ease easeOut`,
  },
  {
    name: "idle-loop",
    description: "Subtle breathing loop with position and scale.",
    script: `select "obj_cube"
duration 2
fps 30
label "Idle Loop"
key position y at 0 = 0 ease easeInOut
key position y at 1 = 0.06 ease easeInOut
key position y at 2 = 0 ease easeInOut
key scale y at 0 = 1 ease easeInOut
key scale y at 1 = 1.03 ease easeInOut
key scale y at 2 = 1 ease easeInOut
loop on`,
  },
  {
    name: "turn-in-place",
    description: "Rotate around Y by 90 degrees.",
    script: `select "obj_cube"
duration 1
label "Turn"
key rotation y at 0 = 0 deg ease easeInOut
key rotation y at 1 = 90 deg ease easeInOut`,
  },
  {
    name: "camera-dolly",
    description: "Simple camera dolly move on z axis.",
    script: `select "obj_camera"
duration 3
label "Camera Dolly"
key position z at 0 = 6 ease easeInOut
key position z at 3 = 2.5 ease easeInOut`,
  },
] as const;

function toToolResult(payload: ToolResponse) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    structuredContent: payload as Record<string, unknown>,
    isError: !payload.ok,
  };
}

function resolveError(error: unknown, fallbackCode: string, fallbackMessage: string): ToolFailure {
  const resolved = asRuntimeError(error, fallbackCode, fallbackMessage);
  return {
    ok: false,
    error: {
      code: resolved.code,
      message: resolved.message,
    },
  };
}

function parseInput<T extends ZodTypeAny>(schema: T, input: unknown): ReturnType<T["parse"]> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new RuntimeError("MF_ERR_INVALID_INPUT", parsed.error.issues.map((item) => item.message).join("; "));
  }
  return parsed.data;
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `h${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createToolHandlers(runtime: RuntimeInstance, options: RegisterToolsOptions): ToolHandlerMap {
  const planRegistry = new Map<string, PlanRecord>();

  const getCurrentProjectJson = () => runtime.exportProjectJson();

  const getStagedProjectJson = () => {
    const restorePoint = runtime.captureRestorePoint();
    if (!restorePoint.staged) {
      throw new RuntimeError("MF_ERR_NO_STAGED_PROJECT", "No staged project is available.");
    }
    const stagedRuntime = runtime.clone();
    stagedRuntime.loadProjectJson(JSON.stringify(restorePoint.staged.data), { staged: false });
    return stagedRuntime.exportProjectJson();
  };

  const getScopeProjectJson = (scope: "current" | "staged") => {
    if (scope === "staged") {
      return getStagedProjectJson();
    }
    return getCurrentProjectJson();
  };

  const createPlanRecord = (input: {
    scope: "current" | "staged";
    seed: Record<string, unknown>;
    summary: PlanRecord["plan"]["summary"];
    steps: PlanRecord["plan"]["steps"];
    safety: PlanRecord["plan"]["safety"];
    baseProjectJson: string;
  }): PlanRecord => {
    const planId = stableHash(
      JSON.stringify({
        ...input.seed,
        scope: input.scope,
        baseProjectJson: input.baseProjectJson,
        steps: input.steps,
      }),
    );
    const planRecord: PlanRecord = {
      planId,
      scope: input.scope,
      plan: {
        summary: input.summary,
        steps: input.steps,
        safety: input.safety,
      },
      baseProjectJson: input.baseProjectJson,
      baseProjectHash: stableHash(input.baseProjectJson),
    };
    planRegistry.set(planId, planRecord);
    return planRecord;
  };

  const previewPlanRecord = (planRecord: PlanRecord) => {
    const baseRuntime = runtime.clone();
    baseRuntime.loadProjectJson(planRecord.baseProjectJson, { staged: false });
    return simulatePlanDiff(baseRuntime, planRecord.plan.steps);
  };

  const applyPlanRecord = (planRecord: PlanRecord, confirm: boolean) => {
    if (planRecord.plan.safety.requiresConfirm && !confirm) {
      throw new RuntimeError("MF_ERR_CONFIRM_REQUIRED", "Plan requires confirm=true before apply.");
    }

    const currentHash = stableHash(getScopeProjectJson(planRecord.scope));
    if (currentHash !== planRecord.baseProjectHash) {
      throw new RuntimeError("MF_ERR_PLAN_STALE", "Current project changed since plan generation.");
    }

    if (planRecord.scope === "staged") {
      const stagedRuntime = runtime.clone();
      stagedRuntime.loadProjectJson(planRecord.baseProjectJson, { staged: false });
      const applied = applyPlanStepsAtomic(
        {
          capture: () => stagedRuntime.captureRestorePoint(),
          restore: (restorePoint) => stagedRuntime.restoreRestorePoint(restorePoint),
          execute: (action, commandInput) => stagedRuntime.execute(action, commandInput),
        },
        planRecord.plan.steps,
      );
      if (!applied.ok) {
        return applied;
      }
      runtime.loadProjectJson(stagedRuntime.exportProjectJson(), { staged: true });
      return applied;
    }

    return applyPlanStepsAtomic(
      {
        capture: () => runtime.captureRestorePoint(),
        restore: (restorePoint) => runtime.restoreRestorePoint(restorePoint),
        execute: (action, commandInput) => runtime.execute(action, commandInput),
      },
      planRecord.plan.steps,
    );
  };

  const compileScriptIntoPlan = (payload: {
    script: string;
    defaults?: {
      fps?: number;
      durationSec?: number;
    };
    staged?: boolean;
  }) => {
    const scope: "current" | "staged" = payload.staged ? "staged" : "current";
    const baseProjectJson = getScopeProjectJson(scope);
    const scopeRuntime = runtime.clone();
    scopeRuntime.loadProjectJson(baseProjectJson, { staged: false });
    const snapshot = scopeRuntime.snapshot();

    const compileOut = compileScriptToPlan(payload.script, {
      defaults: payload.defaults,
      availableObjects: snapshot.scene.objects.map((item) => ({
        id: item.id,
        name: item.name,
      })),
      selectedObjectId: snapshot.selection.objectId,
    });
    if (!compileOut.ok) {
      return {
        ok: false as const,
        errors: compileOut.errors,
        warnings: compileOut.warnings,
      };
    }

    const planRecord = createPlanRecord({
      scope,
      seed: {
        script: payload.script,
        defaults: payload.defaults ?? {},
      },
      summary: compileOut.summary,
      steps: compileOut.steps,
      safety: compileOut.safety,
      baseProjectJson,
    });

    return {
      ok: true as const,
      planId: planRecord.planId,
      ast: compileOut.ast,
      summary: compileOut.summary,
      warnings: compileOut.warnings,
    };
  };

  const handlers: ToolHandlerMap = {
    "mf.ping": async (input) => {
      const payload = parseInput(MfPingInputSchema, input ?? {});
      return {
        ok: true,
        version: options.version,
        commit: options.commit ?? null,
        nonce: payload.nonce ?? null,
      };
    },

    "mf.capabilities": async () => ({
      ok: true,
      tools: ToolDefinitions.map((tool) => ({
        name: tool.name,
        description: tool.description,
        output: tool.output,
      })),
      actions: runtime.getCapabilities().actions,
    }),

    "mf.project.loadJson": async (input) => {
      try {
        const payload = parseInput(MfProjectLoadJsonInputSchema, input ?? {});
        const result = runtime.loadProjectJson(payload.json, { staged: payload.staged });
        return {
          ok: true,
          ...result,
        };
      } catch (error) {
        return resolveError(error, "MF_ERR_LOAD_JSON", "Failed to load project JSON.");
      }
    },

    "mf.project.commit": async (input) => {
      try {
        parseInput(MfProjectCommitInputSchema, input ?? {});
        return runtime.commitStagedLoad();
      } catch (error) {
        return resolveError(error, "MF_ERR_COMMIT", "Failed to commit staged project.");
      }
    },

    "mf.project.discard": async (input) => {
      parseInput(MfProjectDiscardInputSchema, input ?? {});
      return runtime.discardStagedLoad();
    },

    "mf.state.snapshot": async (input) => {
      parseInput(MfStateSnapshotInputSchema, input ?? {});
      return {
        ok: true,
        ...runtime.snapshot(),
      };
    },

    "mf.command.execute": async (input) => {
      try {
        const payload = parseInput(MfCommandExecuteInputSchema, input ?? {});
        const executed = runtime.execute(payload.action, payload.input ?? {});
        return {
          ok: true,
          result: executed.result,
          events: executed.events,
        };
      } catch (error) {
        return resolveError(error, "MF_ERR_COMMAND_EXECUTE", "Command execution failed.");
      }
    },

    "mf.plan.generate": async (input) => {
      try {
        const payload = parseInput(MfPlanGenerateInputSchema, input ?? {});
        const snapshot = runtime.snapshot();
        const generated = generateAgentPlan(payload, {
          objects: snapshot.scene.objects.map((item) => ({
            id: item.id,
            name: item.name,
          })),
          selectedObjectId: snapshot.selection.objectId,
        });
        const planRecord = createPlanRecord({
          scope: "current",
          seed: {
            goal: payload.goal,
            constraints: payload.constraints ?? {},
          },
          summary: generated.summary,
          steps: generated.steps,
          safety: generated.safety,
          baseProjectJson: getCurrentProjectJson(),
        });
        return {
          ok: true,
          planId: planRecord.planId,
          summary: generated.summary,
          steps: generated.steps,
          safety: generated.safety,
        };
      } catch (error) {
        if (error instanceof PlannerError) {
          return {
            ok: false,
            error: {
              code: error.code,
              message: error.message,
            },
            suggestions: error.suggestions,
          };
        }
        return resolveError(error, "MF_ERR_PLAN_GENERATE", "Plan generation failed.");
      }
    },

    "mf.plan.previewDiff": async (input) => {
      try {
        const payload = parseInput(MfPlanPreviewDiffInputSchema, input ?? {});
        const planRecord = planRegistry.get(payload.planId);
        if (!planRecord) {
          throw new RuntimeError("MF_ERR_PLAN_NOT_FOUND", `Unknown planId "${payload.planId}".`);
        }
        const diff = previewPlanRecord(planRecord);
        return {
          ok: true,
          diff,
        };
      } catch (error) {
        return resolveError(error, "MF_ERR_PLAN_PREVIEW", "Plan preview failed.");
      }
    },

    "mf.plan.apply": async (input) => {
      try {
        const payload = parseInput(MfPlanApplyInputSchema, input ?? {});
        const planRecord = planRegistry.get(payload.planId);
        if (!planRecord) {
          throw new RuntimeError("MF_ERR_PLAN_NOT_FOUND", `Unknown planId "${payload.planId}".`);
        }
        const applied = applyPlanRecord(planRecord, payload.confirm);
        if (!applied.ok) {
          const resolved = asRuntimeError(applied.error, "MF_ERR_PLAN_APPLY_FAILED", "Plan apply failed.");
          return {
            ok: false,
            error: {
              code: "MF_ERR_PLAN_APPLY_FAILED",
              message: resolved.message,
            },
            stepId: applied.failedStepId,
          };
        }

        planRegistry.delete(payload.planId);
        return {
          ok: true,
          events: applied.events,
          result: {
            commandsExecuted: applied.commandsExecuted,
          },
        };
      } catch (error) {
        return resolveError(error, "MF_ERR_PLAN_APPLY", "Plan apply failed.");
      }
    },

    "mf.plan.discard": async (input) => {
      try {
        const payload = parseInput(MfPlanDiscardInputSchema, input ?? {});
        planRegistry.delete(payload.planId);
        return {
          ok: true,
        };
      } catch (error) {
        return resolveError(error, "MF_ERR_PLAN_DISCARD", "Plan discard failed.");
      }
    },

    "mf.script.validate": async (input) => {
      try {
        const payload = parseInput(MfScriptValidateInputSchema, input ?? {});
        const snapshot = runtime.snapshot();
        const validation = validateScript(payload.script, {
          availableObjects: snapshot.scene.objects.map((item) => ({
            id: item.id,
            name: item.name,
          })),
        });
        if (!validation.ok) {
          return {
            ok: false,
            errors: validation.errors,
            warnings: validation.warnings,
          };
        }
        return {
          ok: true,
          errors: [],
          warnings: validation.warnings,
        };
      } catch (error) {
        return resolveError(error, "MF_ERR_SCRIPT_VALIDATE", "Script validation failed.");
      }
    },

    "mf.script.compile": async (input) => {
      try {
        const payload = parseInput(MfScriptCompileInputSchema, input ?? {});
        const compileOut = compileScriptIntoPlan(payload);
        if (!compileOut.ok) {
          return {
            ok: false,
            errors: compileOut.errors,
            warnings: compileOut.warnings,
          };
        }
        return {
          ok: true,
          planId: compileOut.planId,
          ast: compileOut.ast,
          summary: compileOut.summary,
          warnings: compileOut.warnings,
        };
      } catch (error) {
        return resolveError(error, "MF_ERR_SCRIPT_COMPILE", "Script compile failed.");
      }
    },

    "mf.script.run": async (input) => {
      try {
        const payload = parseInput(MfScriptRunInputSchema, input ?? {});
        const compileOut = compileScriptIntoPlan({
          script: payload.script,
          staged: payload.staged,
        });
        if (!compileOut.ok) {
          return {
            ok: false,
            warnings: compileOut.warnings,
            errors: compileOut.errors,
            error: {
              code: "MF_ERR_SCRIPT_COMPILE",
              message: "Script compile failed.",
            },
          };
        }

        const planRecord = planRegistry.get(compileOut.planId);
        if (!planRecord) {
          throw new RuntimeError("MF_ERR_PLAN_NOT_FOUND", `Unknown planId "${compileOut.planId}".`);
        }
        const diff = previewPlanRecord(planRecord);
        if (payload.applyMode === "previewOnly") {
          return {
            ok: true,
            planId: compileOut.planId,
            diff,
            warnings: compileOut.warnings,
          };
        }

        const applied = applyPlanRecord(planRecord, payload.confirm);
        if (!applied.ok) {
          const resolved = asRuntimeError(applied.error, "MF_ERR_PLAN_APPLY_FAILED", "Plan apply failed.");
          return {
            ok: false,
            planId: compileOut.planId,
            diff,
            warnings: compileOut.warnings,
            error: {
              code: resolved.code,
              message: resolved.message,
            },
            stepId: applied.failedStepId,
          };
        }
        planRegistry.delete(compileOut.planId);
        return {
          ok: true,
          planId: compileOut.planId,
          diff,
          events: applied.events,
          warnings: compileOut.warnings,
          result: {
            commandsExecuted: applied.commandsExecuted,
          },
        };
      } catch (error) {
        return resolveError(error, "MF_ERR_SCRIPT_RUN", "Script run failed.");
      }
    },

    "mf.script.examples": async (input) => {
      try {
        parseInput(MfScriptExamplesInputSchema, input ?? {});
        return {
          ok: true,
          examples: SCRIPT_EXAMPLES,
        };
      } catch (error) {
        return resolveError(error, "MF_ERR_SCRIPT_EXAMPLES", "Failed to list script examples.");
      }
    },

    "mf.skill.generateScript": async (input) => {
      try {
        const payload = parseInput(MfSkillGenerateScriptInputSchema, input ?? {});
        const generated = generateScriptFromGoal(payload);
        if (!generated.ok) {
          return {
            ok: false,
            error: generated.error,
            supportedGoals: generated.supportedGoals,
          };
        }
        return {
          ok: true,
          script: generated.script,
          matchedPreset: generated.matchedPreset,
          warnings: generated.warnings,
        };
      } catch (error) {
        return resolveError(error, "MF_ERR_SKILL_GENERATE_SCRIPT", "Skill script generation failed.");
      }
    },

    "mf.export.bundle": async (input) => {
      try {
        const payload = parseInput(MfExportBundleInputSchema, input ?? {});
        const exported = await runtime.exportBundle(payload.outDir);
        return {
          ok: exported.ok,
          path: exported.path,
          bytes: exported.bytes,
          warnings: exported.warnings,
          mode: exported.mode,
          error: exported.error,
        };
      } catch (error) {
        return resolveError(error, "MF_ERR_EXPORT_BUNDLE", "Bundle export failed.");
      }
    },

    "mf.export.unityPackage": async (input) => {
      try {
        const payload = parseInput(MfExportUnityPackageInputSchema, input ?? {});
        const exported = await runtime.exportUnityPackage(payload.outDir, payload.options ?? {});
        return {
          ok: exported.ok,
          path: exported.path,
          bytes: exported.bytes,
          warnings: exported.warnings,
          mode: exported.mode,
          error: exported.error,
        };
      } catch (error) {
        return resolveError(error, "MF_ERR_EXPORT_UNITY_PACKAGE", "Unity package export failed.");
      }
    },

    "mf.export.video": async (input) => {
      try {
        const payload = parseInput(MfExportVideoInputSchema, input ?? {});
        const exported = await runtime.exportVideo(payload.outDir, payload.settings);
        return {
          ok: exported.ok,
          path: exported.path,
          bytes: exported.bytes,
          warnings: exported.warnings,
          mode: exported.mode,
          error: exported.error,
        };
      } catch (error) {
        return resolveError(error, "MF_ERR_EXPORT_VIDEO", "Video export failed.");
      }
    },

    "mf.export.projectJson": async (input) => {
      parseInput(MfExportProjectJsonInputSchema, input ?? {});
      return {
        ok: true,
        json: runtime.exportProjectJson(),
      };
    },

    "mf.io.readFileBase64": async (input) => {
      try {
        const payload = parseInput(MfIoReadFileBase64InputSchema, input ?? {});
        const bytes = await readFile(payload.path);
        if (bytes.byteLength > Math.min(payload.maxBytes, options.maxAssetBytes)) {
          return {
            ok: false,
            error: {
              code: "MF_ERR_IO_MAX_BYTES",
              message: `File exceeds max allowed bytes (${bytes.byteLength}).`,
            },
          };
        }
        return {
          ok: true,
          path: payload.path,
          bytes: bytes.byteLength,
          base64: bytes.toString("base64"),
        };
      } catch (error) {
        return resolveError(error, "MF_ERR_IO_READ", "Failed to read file.");
      }
    },

    "mf.io.writeFile": async (input) => {
      try {
        const payload = parseInput(MfIoWriteFileInputSchema, input ?? {});
        const bytes = Buffer.from(payload.base64, "base64");
        if (bytes.byteLength > options.maxAssetBytes) {
          return {
            ok: false,
            error: {
              code: "MF_ERR_IO_MAX_BYTES",
              message: `Payload exceeds max allowed bytes (${bytes.byteLength}).`,
            },
          };
        }
        await writeFile(payload.path, bytes);
        return {
          ok: true,
          path: payload.path,
          bytes: bytes.byteLength,
        };
      } catch (error) {
        return resolveError(error, "MF_ERR_IO_WRITE", "Failed to write file.");
      }
    },
    "mf.pipeline.makeBundle": async (input) => {
      try {
        const payload = parseInput(MfPipelineMakeBundleInputSchema, input ?? {});
        const pipeline = await runMakeBundlePipeline(
          async (toolName, toolInput) => {
            const tool = handlers[toolName as MotionforgeToolName];
            if (!tool) {
              throw new RuntimeError("MF_ERR_UNKNOWN_TOOL", `Unknown tool "${toolName}" in pipeline.`);
            }
            return await tool(toolInput);
          },
          {
            inJson: payload.inJson,
            inBundleBase64: payload.inBundleBase64,
            goal: payload.goal,
            takes: payload.takes,
            outDir: payload.outDir,
            confirm: payload.confirm,
            staged: true,
          },
          {
            mcpVersion: options.version,
            commit: options.commit ?? null,
          },
        );
        if (!pipeline.ok) {
          return {
            ok: false,
            previewOnly: pipeline.previewOnly,
            outZipPath: pipeline.outZipPath,
            manifestPath: pipeline.manifestPath,
            proofPath: pipeline.proofPath,
            warnings: pipeline.warnings,
            errors: pipeline.errors ?? [],
            error: pipeline.errors?.[0] ?? {
              code: "MF_ERR_PIPELINE_MAKE_BUNDLE",
              message: "Pipeline failed.",
            },
          };
        }
        return {
          ok: true,
          previewOnly: pipeline.previewOnly,
          outZipPath: pipeline.outZipPath,
          manifestPath: pipeline.manifestPath,
          proofPath: pipeline.proofPath,
          warnings: pipeline.warnings,
        };
      } catch (error) {
        return resolveError(error, "MF_ERR_PIPELINE_MAKE_BUNDLE", "Pipeline make-bundle failed.");
      }
    },
  };

  return handlers;
}

export async function invokeTool(
  runtime: RuntimeInstance,
  options: RegisterToolsOptions,
  name: MotionforgeToolName,
  input: unknown,
): Promise<ToolResponse> {
  const handlers = createToolHandlers(runtime, options);
  const schema = ToolSchemas[name];
  parseInput(schema, input ?? {});
  return handlers[name](input ?? {});
}

function getSchemaShape(schema: ZodTypeAny): Record<string, unknown> {
  if (schema instanceof ZodObject) {
    return schema.shape;
  }
  return {};
}

export function registerMotionforgeTools(server: McpServer, runtime: RuntimeInstance, options: RegisterToolsOptions) {
  const handlers = createToolHandlers(runtime, options);
  const registerTool = server.tool.bind(server) as (...args: unknown[]) => void;

  for (const definition of ToolDefinitions) {
    const toolName = definition.name;
    const handler = handlers[toolName];
    registerTool(toolName, definition.description, getSchemaShape(definition.input), async (input: unknown) => {
      const payload = await handler(input);
      return toToolResult(payload);
    });
  }
}
