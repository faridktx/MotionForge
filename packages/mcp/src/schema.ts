import { z } from "zod";

export const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(JsonValueSchema)]),
);

export const MfPingInputSchema = z.object({
  nonce: z.string().optional(),
});

export const MfProjectLoadJsonInputSchema = z.object({
  json: z.string().min(1),
  staged: z.boolean().default(true),
});

export const MfProjectCommitInputSchema = z.object({});
export const MfProjectDiscardInputSchema = z.object({});
export const MfStateSnapshotInputSchema = z.object({});

export const MfCommandExecuteInputSchema = z.object({
  action: z.string().min(1),
  input: JsonValueSchema.optional(),
});

const PlanConstraintsSchema = z
  .object({
    durationSec: z.number().positive().optional(),
    fps: z.number().positive().optional(),
    style: z.enum(["snappy", "realistic", "cartoony", "cinematic"]).optional(),
    loop: z.boolean().optional(),
    targetObjects: z.array(z.string().min(1)).optional(),
    camera: z
      .object({
        enabled: z.boolean(),
      })
      .optional(),
  })
  .optional();

export const MfPlanGenerateInputSchema = z.object({
  goal: z.string().min(1),
  constraints: PlanConstraintsSchema,
});

export const MfPlanPreviewDiffInputSchema = z.object({
  planId: z.string().min(1),
});

export const MfPlanApplyInputSchema = z.object({
  planId: z.string().min(1),
  confirm: z.boolean(),
});

export const MfPlanDiscardInputSchema = z.object({
  planId: z.string().min(1),
});

export const MfScriptCompileInputSchema = z.object({
  script: z.string().min(1),
  defaults: z
    .object({
      fps: z.number().positive().optional(),
      durationSec: z.number().positive().optional(),
    })
    .optional(),
  staged: z.boolean().optional(),
});

export const MfScriptRunInputSchema = z.object({
  script: z.string().min(1),
  confirm: z.boolean().default(false),
  applyMode: z.enum(["previewOnly", "apply"]),
  staged: z.boolean().default(false),
});

export const MfScriptValidateInputSchema = z.object({
  script: z.string().min(1),
});

export const MfScriptExamplesInputSchema = z.object({});

export const MfSkillGenerateScriptInputSchema = z.object({
  goal: z.string().min(1),
  constraints: z
    .object({
      durationSec: z.number().positive().optional(),
      fps: z.number().positive().optional(),
      style: z.enum(["snappy", "smooth", "heavy", "floaty"]).optional(),
    })
    .optional(),
  target: z
    .object({
      select: z.string().min(1).optional(),
    })
    .optional(),
});

export const MfExportBundleInputSchema = z.object({
  outDir: z.string().min(1),
});

export const MfExportUnityPackageInputSchema = z.object({
  outDir: z.string().min(1),
  options: z
    .object({
      scale: z.number().positive().optional(),
      yUp: z.boolean().optional(),
      includeProjectJson: z.boolean().optional(),
    })
    .optional(),
});

export const MfExportVideoInputSchema = z.object({
  outDir: z.string().min(1),
  settings: z.record(JsonValueSchema).default({}),
});

export const MfExportProjectJsonInputSchema = z.object({});

export const MfIoReadFileBase64InputSchema = z.object({
  path: z.string().min(1),
  maxBytes: z.number().int().positive().max(1024 * 1024).default(256 * 1024),
});

export const MfIoWriteFileInputSchema = z.object({
  path: z.string().min(1),
  base64: z.string().min(1),
});

export const MfPipelineMakeBundleInputSchema = z.object({
  inJson: z.string().min(1).optional(),
  inBundleBase64: z.string().min(1).optional(),
  goal: z.string().min(1),
  takes: z
    .array(
      z.object({
        name: z.string().min(1),
        startTime: z.number().finite(),
        endTime: z.number().finite(),
      }),
    )
    .optional(),
  constraints: z
    .object({
      durationSec: z.number().positive().optional(),
      style: z.string().min(1).optional(),
      fps: z.number().positive().optional(),
    })
    .optional(),
  target: z
    .object({
      select: z.string().min(1).optional(),
      bindPath: z.string().min(1).optional(),
    })
    .optional(),
  unity: z.boolean().optional(),
  outDir: z.string().min(1),
  confirm: z.boolean(),
});

export const MfUnityRecipeMakeBundleInputSchema = z.object({
  goal: z.string().min(1),
  target: z.object({
    select: z.string().min(1),
    bindPath: z.string().min(1).optional(),
  }),
  constraints: z
    .object({
      durationSec: z.number().positive().optional(),
      style: z.string().min(1).optional(),
      fps: z.number().positive().optional(),
    })
    .optional(),
  outDir: z.string().min(1),
  confirm: z.boolean(),
});

export const ToolSchemas = {
  "mf.ping": MfPingInputSchema,
  "mf.capabilities": z.object({}),
  "mf.project.loadJson": MfProjectLoadJsonInputSchema,
  "mf.project.commit": MfProjectCommitInputSchema,
  "mf.project.discard": MfProjectDiscardInputSchema,
  "mf.state.snapshot": MfStateSnapshotInputSchema,
  "mf.command.execute": MfCommandExecuteInputSchema,
  "mf.plan.generate": MfPlanGenerateInputSchema,
  "mf.plan.previewDiff": MfPlanPreviewDiffInputSchema,
  "mf.plan.apply": MfPlanApplyInputSchema,
  "mf.plan.discard": MfPlanDiscardInputSchema,
  "mf.script.compile": MfScriptCompileInputSchema,
  "mf.script.run": MfScriptRunInputSchema,
  "mf.script.validate": MfScriptValidateInputSchema,
  "mf.script.examples": MfScriptExamplesInputSchema,
  "mf.skill.generateScript": MfSkillGenerateScriptInputSchema,
  "mf.export.bundle": MfExportBundleInputSchema,
  "mf.export.unityPackage": MfExportUnityPackageInputSchema,
  "mf.export.video": MfExportVideoInputSchema,
  "mf.export.projectJson": MfExportProjectJsonInputSchema,
  "mf.io.readFileBase64": MfIoReadFileBase64InputSchema,
  "mf.io.writeFile": MfIoWriteFileInputSchema,
  "mf.pipeline.makeBundle": MfPipelineMakeBundleInputSchema,
  "mf.unity.recipe.makeBundle": MfUnityRecipeMakeBundleInputSchema,
} as const;

export const ToolDefinitions = [
  {
    name: "mf.ping",
    description: "Liveness probe.",
    input: MfPingInputSchema,
    output: "{ ok: true, version, commit?, nonce? }",
  },
  {
    name: "mf.capabilities",
    description: "List available tools and actions.",
    input: z.object({}),
    output: "{ tools: [...], actions: [...] }",
  },
  {
    name: "mf.project.loadJson",
    description: "Stage project JSON load with validation.",
    input: MfProjectLoadJsonInputSchema,
    output: "{ projectId, summary }",
  },
  {
    name: "mf.project.commit",
    description: "Commit staged load atomically.",
    input: MfProjectCommitInputSchema,
    output: "{ ok }",
  },
  {
    name: "mf.project.discard",
    description: "Discard staged load.",
    input: MfProjectDiscardInputSchema,
    output: "{ ok }",
  },
  {
    name: "mf.state.snapshot",
    description: "Read deterministic state snapshot.",
    input: MfStateSnapshotInputSchema,
    output: "{ scene, selection, assets, animation, dirty, version }",
  },
  {
    name: "mf.command.execute",
    description: "Execute headless deterministic action through command bus.",
    input: MfCommandExecuteInputSchema,
    output: "{ ok, result, events }",
  },
  {
    name: "mf.plan.generate",
    description: "Generate deterministic command plan from natural-language goal.",
    input: MfPlanGenerateInputSchema,
    output: "{ ok, planId, summary, steps, safety }",
  },
  {
    name: "mf.plan.previewDiff",
    description: "Preview diff for a generated plan by simulation on cloned runtime.",
    input: MfPlanPreviewDiffInputSchema,
    output: "{ ok, diff }",
  },
  {
    name: "mf.plan.apply",
    description: "Apply generated plan atomically with confirm gate.",
    input: MfPlanApplyInputSchema,
    output: "{ ok, events, result }",
  },
  {
    name: "mf.plan.discard",
    description: "Discard generated plan from in-memory registry.",
    input: MfPlanDiscardInputSchema,
    output: "{ ok }",
  },
  {
    name: "mf.script.compile",
    description: "Validate and compile MotionForge Script into a deterministic plan.",
    input: MfScriptCompileInputSchema,
    output: "{ ok, planId, ast, summary, warnings }",
  },
  {
    name: "mf.script.run",
    description: "Compile script, preview diff, and optionally apply with confirm gate.",
    input: MfScriptRunInputSchema,
    output: "{ ok, planId, diff, events?, warnings }",
  },
  {
    name: "mf.script.validate",
    description: "Validate MotionForge Script with path-based diagnostics.",
    input: MfScriptValidateInputSchema,
    output: "{ ok, errors, warnings }",
  },
  {
    name: "mf.script.examples",
    description: "List deterministic script examples.",
    input: MfScriptExamplesInputSchema,
    output: "{ ok, examples[] }",
  },
  {
    name: "mf.skill.generateScript",
    description: "Deterministic goal/constraints to MotionForge Script mapping.",
    input: MfSkillGenerateScriptInputSchema,
    output: "{ ok, script, matchedPreset, warnings }",
  },
  {
    name: "mf.export.bundle",
    description: "Write bundle zip artifact to disk.",
    input: MfExportBundleInputSchema,
    output: "{ path, bytes, warnings }",
  },
  {
    name: "mf.export.unityPackage",
    description: "Write Unity interchange package zip artifact to disk.",
    input: MfExportUnityPackageInputSchema,
    output: "{ path, bytes, warnings }",
  },
  {
    name: "mf.export.video",
    description: "Attempt headless video export or return structured unsupported error.",
    input: MfExportVideoInputSchema,
    output: "{ path, bytes, warnings, mode? }",
  },
  {
    name: "mf.export.projectJson",
    description: "Export latest normalized project JSON.",
    input: MfExportProjectJsonInputSchema,
    output: "{ json }",
  },
  {
    name: "mf.io.readFileBase64",
    description: "Read small file content as base64 with size guard.",
    input: MfIoReadFileBase64InputSchema,
    output: "{ path, bytes, base64 }",
  },
  {
    name: "mf.io.writeFile",
    description: "Write base64 content to path.",
    input: MfIoWriteFileInputSchema,
    output: "{ path, bytes }",
  },
  {
    name: "mf.pipeline.makeBundle",
    description: "Deterministic staged pipeline: goal -> script(s) -> preview/apply -> commit -> bundle + proof.",
    input: MfPipelineMakeBundleInputSchema,
    output: "{ ok, outZipPath, manifestPath, proofPath, previewOnly, errors?, warnings? }",
  },
  {
    name: "mf.unity.recipe.makeBundle",
    description: "Unity-targeted deterministic recipe pipeline with bindPath guarantees.",
    input: MfUnityRecipeMakeBundleInputSchema,
    output: "{ ok, outZipPath, proofPath, warnings? }",
  },
] as const;

export type MotionforgeToolName = typeof ToolDefinitions[number]["name"];
