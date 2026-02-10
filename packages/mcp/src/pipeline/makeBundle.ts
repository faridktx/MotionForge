import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { sha256HexFromBytes, sha256HexFromString, stableJsonStringify } from "./hash.js";

export interface PipelineTakeInput {
  name: string;
  startTime: number;
  endTime: number;
}

export interface PipelineTakeRecord extends PipelineTakeInput {
  id: string;
}

export interface MakeBundlePipelineInput {
  inJson?: string;
  inBundleBase64?: string;
  goal: string;
  takes?: PipelineTakeInput[];
  constraints?: {
    durationSec?: number;
    style?: string;
    fps?: number;
  };
  target?: {
    select?: string;
    bindPath?: string;
  };
  unity?: boolean;
  outDir: string;
  confirm: boolean;
  staged?: boolean;
}

export interface MakeBundleToolingInfo {
  mcpVersion: string;
  commit: string | null;
}

export type MakeBundleToolCaller = (
  toolName: string,
  input: Record<string, unknown>,
) => Promise<unknown>;

export interface MakeBundlePipelineOutput {
  ok: boolean;
  previewOnly: boolean;
  outZipPath: string | null;
  manifestPath: string | null;
  proofPath: string;
  warnings: string[];
  errors?: Array<{ code: string; message: string }>;
}

export interface ProofDocument {
  schemaVersion: 1;
  previewOnly: boolean;
  goal: string;
  takes: PipelineTakeRecord[];
  inputHash: string;
  outputProjectHash: string | null;
  bundleHash: string | null;
  tooling: MakeBundleToolingInfo;
  diffSummary: {
    scripts: Array<{
      take: string;
      keyframesAdded: number;
      keyframesMoved: number;
      keyframesDeleted: number;
      tracksTouched: number;
    }>;
    totals: {
      keyframesAdded: number;
      keyframesMoved: number;
      keyframesDeleted: number;
      tracksTouched: number;
    };
  };
  outputs: {
    outDir: string;
    projectJsonPath: string | null;
    bundleZipPath: string | null;
    manifestPath: string | null;
  };
  bytes: {
    projectJson: number | null;
    bundleZip: number | null;
    manifest: number | null;
  };
  warnings: string[];
  errors: Array<{ code: string; message: string }>;
}

interface ProjectLike {
  animation?: {
    durationSeconds?: number;
    tracks?: Array<{ objectId?: string; bindPath?: string }>;
  };
  objects?: Array<{ id?: string; name?: string; bindPath?: string }>;
  modelInstances?: Array<{ id?: string; name?: string; bindPath?: string }>;
}

function asToolCallResult(value: unknown): { ok: boolean; [key: string]: unknown } {
  if (typeof value !== "object" || value === null || typeof (value as { ok?: unknown }).ok !== "boolean") {
    throw new Error("Invalid tool response payload.");
  }
  return value as { ok: boolean; [key: string]: unknown };
}

function normalizeGoal(goal: string): string {
  return goal.trim().toLowerCase();
}

function normalizeBindPathValue(value: string): string {
  const out = value.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
  return out.length > 0 ? out : "Object";
}

function normalizeSkillStyle(value: string | undefined): "snappy" | "smooth" | "heavy" | "floaty" | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "snappy" || normalized === "smooth" || normalized === "heavy" || normalized === "floaty") {
    return normalized;
  }
  return null;
}

function formatNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
}

function sanitizeTakeIdSegment(name: string): string {
  const out = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return out.length > 0 ? out : "segment";
}

function validateTakeRange(startTime: number, endTime: number): boolean {
  return Number.isFinite(startTime) && Number.isFinite(endTime) && startTime >= 0 && endTime > startTime;
}

function normalizeTakeInputs(takes: PipelineTakeInput[]): PipelineTakeRecord[] {
  const seen = new Set<string>();
  const rows = takes
    .filter((take) => validateTakeRange(take.startTime, take.endTime))
    .map((take, index) => {
      const baseId = `take_${sanitizeTakeIdSegment(take.name) || `segment_${index + 1}`}`;
      let id = baseId;
      let suffix = 2;
      while (seen.has(id)) {
        id = `${baseId}_${suffix}`;
        suffix += 1;
      }
      seen.add(id);
      return {
        id,
        name: take.name.trim().length > 0 ? take.name.trim() : `Take ${index + 1}`,
        startTime: Number(take.startTime.toFixed(4)),
        endTime: Number(take.endTime.toFixed(4)),
      };
    })
    .sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
  return rows;
}

export function deriveTakesFromGoal(goal: string, durationSeconds: number): PipelineTakeRecord[] {
  const normalized = normalizeGoal(goal);
  const out: PipelineTakeRecord[] = [];
  const pushTake = (id: string, name: string, startTime: number, endTime: number) => {
    if (!validateTakeRange(startTime, endTime)) return;
    out.push({ id, name, startTime, endTime });
  };

  if (normalized.includes("idle")) {
    pushTake("take_idle", "Idle", 0, 2);
  }
  if (normalized.includes("recoil")) {
    pushTake("take_recoil", "Recoil", 2, 2.4);
  }
  if (normalized.includes("turn")) {
    pushTake("take_turn", "Turn", 0, 1);
  }

  if (out.length === 0) {
    const end = durationSeconds > 0 ? durationSeconds : 2;
    pushTake("take_main", "Main", 0, end);
  }

  return out.sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
}

function inferTakeGoal(take: PipelineTakeRecord, goal: string): string {
  const lower = take.name.toLowerCase();
  if (lower.includes("idle")) return "idle loop";
  if (lower.includes("recoil")) return "recoil";
  if (lower.includes("turn")) return "turn in place";
  if (lower.includes("bounce")) return "bounce";
  return goal;
}

function addOffset(value: string, offset: number): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return formatNumber(parsed + offset);
}

function rebaseScriptForTake(
  script: string,
  take: PipelineTakeRecord,
  fullDuration: number,
  targetObjectId: string,
): string {
  const lines = script.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const out: string[] = [];
  let hasSelect = false;
  let hasDuration = false;

  for (const line of lines) {
    if (line.startsWith("select ")) {
      if (!hasSelect) {
        out.push(`select "${targetObjectId}"`);
        hasSelect = true;
      }
      continue;
    }
    if (line.startsWith("duration ")) {
      out.push(`duration ${formatNumber(fullDuration)}`);
      hasDuration = true;
      continue;
    }
    if (line.startsWith("label ")) {
      out.push(`label "${take.name}"`);
      continue;
    }
    if (line.startsWith("take ")) {
      continue;
    }

    const keyMatch = line.match(
      /^(key\s+(?:position|rotation|scale)\s+[xyz]\s+at\s+)([-+]?(?:\d+\.?\d*|\d*\.?\d+))(\s*=\s*.+)$/i,
    );
    if (keyMatch) {
      out.push(`${keyMatch[1]}${addOffset(keyMatch[2] ?? "0", take.startTime)}${keyMatch[3] ?? ""}`);
      continue;
    }

    const deleteMatch = line.match(
      /^(delete\s+key\s+(?:position|rotation|scale)\s+[xyz]\s+at\s+)([-+]?(?:\d+\.?\d*|\d*\.?\d+))$/i,
    );
    if (deleteMatch) {
      out.push(`${deleteMatch[1]}${addOffset(deleteMatch[2] ?? "0", take.startTime)}`);
      continue;
    }

    const helperMatch = line.match(
      /^(bounce\s+amplitude\s+[-+]?(?:\d+\.?\d*|\d*\.?\d+)\s+at\s+)([-+]?(?:\d+\.?\d*|\d*\.?\d+))\.\.([-+]?(?:\d+\.?\d*|\d*\.?\d+))$/i,
    ) ?? line.match(
      /^(recoil\s+distance\s+[-+]?(?:\d+\.?\d*|\d*\.?\d+)\s+at\s+)([-+]?(?:\d+\.?\d*|\d*\.?\d+))\.\.([-+]?(?:\d+\.?\d*|\d*\.?\d+))$/i,
    );
    if (helperMatch) {
      out.push(
        `${helperMatch[1]}${addOffset(helperMatch[2] ?? "0", take.startTime)}..${addOffset(helperMatch[3] ?? "0", take.startTime)}`,
      );
      continue;
    }

    out.push(line);
  }

  if (!hasSelect) {
    out.unshift(`select "${targetObjectId}"`);
  }
  if (!hasDuration) {
    out.splice(1, 0, `duration ${formatNumber(fullDuration)}`);
  }

  return out.join("\n");
}

function buildTakeScript(targetObjectId: string, durationSeconds: number, takes: PipelineTakeRecord[]): string {
  const lines = [
    `select "${targetObjectId}"`,
    `duration ${formatNumber(durationSeconds)}`,
    'label "Set Takes"',
  ];
  for (const take of takes) {
    lines.push(`take "${take.name}" from ${formatNumber(take.startTime)} to ${formatNumber(take.endTime)}`);
  }
  return lines.join("\n");
}

function summarizeDiff(diff: unknown): {
  keyframesAdded: number;
  keyframesMoved: number;
  keyframesDeleted: number;
  tracksTouched: number;
} {
  const animationRows = (diff as { animation?: unknown })?.animation;
  if (!Array.isArray(animationRows)) {
    return { keyframesAdded: 0, keyframesMoved: 0, keyframesDeleted: 0, tracksTouched: 0 };
  }
  let keyframesAdded = 0;
  let keyframesMoved = 0;
  let keyframesDeleted = 0;
  let tracksTouched = 0;
  for (const row of animationRows) {
    if (typeof row !== "object" || row === null) continue;
    const item = row as Record<string, unknown>;
    tracksTouched += Array.isArray(item.tracks) ? item.tracks.length : 0;
    keyframesAdded += typeof item.keyframesAdded === "number" ? item.keyframesAdded : 0;
    keyframesMoved += typeof item.keyframesMoved === "number" ? item.keyframesMoved : 0;
    keyframesDeleted += typeof item.keyframesDeleted === "number" ? item.keyframesDeleted : 0;
  }
  return { keyframesAdded, keyframesMoved, keyframesDeleted, tracksTouched };
}

function parseProjectJsonFromBundleBase64(input: string): string {
  const bytes = Buffer.from(input, "base64");
  const files = unzipSync(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  const projectBytes = files["project.json"];
  if (!projectBytes) {
    throw new Error("Bundle is missing project.json.");
  }
  return strFromU8(projectBytes);
}

function readManifestFromBundleBytes(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const manifest = files["motionforge-manifest.json"];
  if (!manifest) {
    throw new Error("Bundle is missing motionforge-manifest.json.");
  }
  return strFromU8(manifest);
}

function getPrimaryTargetObjectId(project: ProjectLike): string | null {
  const objectId = project.objects?.find((item) => typeof item.id === "string" && item.id.length > 0)?.id;
  if (objectId) return objectId;
  const modelId = project.modelInstances?.find((item) => typeof item.id === "string" && item.id.length > 0)?.id;
  return modelId ?? null;
}

function resolveTargetObjectId(project: ProjectLike, requested: string | undefined): string | null {
  const select = requested?.trim();
  if (!select) {
    return getPrimaryTargetObjectId(project);
  }

  const byId =
    project.objects?.find((item) => item.id === select)?.id ??
    project.modelInstances?.find((item) => item.id === select)?.id;
  if (byId) return byId;

  const byName =
    project.objects?.find((item) => item.name === select)?.id ??
    project.modelInstances?.find((item) => item.name === select)?.id;
  if (byName) return byName;

  return select;
}

function resolveUnityTargetBindPath(project: ProjectLike, targetSelect: string, explicitBindPath?: string): string {
  if (explicitBindPath && explicitBindPath.trim().length > 0) {
    return normalizeBindPathValue(explicitBindPath);
  }
  const byId =
    project.objects?.find((item) => item.id === targetSelect) ??
    project.modelInstances?.find((item) => item.id === targetSelect);
  if (byId && typeof byId.name === "string" && byId.name.trim().length > 0) {
    return normalizeBindPathValue(byId.name);
  }
  return normalizeBindPathValue(targetSelect);
}

interface EnsureUnityBindPathOptions {
  targetSelect?: string;
  targetBindPath?: string;
}

interface EnsureUnityBindPathResult {
  json: string;
  warnings: string[];
}

export function ensureUnityBindPaths(projectJson: string, options: EnsureUnityBindPathOptions = {}): EnsureUnityBindPathResult {
  const project = JSON.parse(projectJson) as ProjectLike & Record<string, unknown>;
  const warnings: string[] = [];
  const objectBindPathById = new Map<string, string>();
  const targetSelect = options.targetSelect?.trim();
  const targetBindPath = options.targetBindPath?.trim();

  const ensureObjectRows = (rows: unknown, label: "objects" | "modelInstances"): unknown => {
    if (!Array.isArray(rows)) return rows;
    return rows.map((row, index) => {
      if (typeof row !== "object" || row === null) return row;
      const item = { ...(row as Record<string, unknown>) };
      const id = typeof item.id === "string" ? item.id : "";
      const name = typeof item.name === "string" ? item.name : id;
      const existing = typeof item.bindPath === "string" ? item.bindPath.trim() : "";
      let bindPath = existing;
      if (!bindPath) {
        if (targetSelect && id === targetSelect && targetBindPath && targetBindPath.length > 0) {
          bindPath = targetBindPath;
        } else {
          bindPath = name.length > 0 ? name : (id.length > 0 ? id : `${label}_${index + 1}`);
        }
        warnings.push(`Filled missing bindPath for ${label}[${index}] as "${normalizeBindPathValue(bindPath)}".`);
      }
      const normalized = normalizeBindPathValue(bindPath);
      item.bindPath = normalized;
      if (id.length > 0) {
        objectBindPathById.set(id, normalized);
      }
      return item;
    });
  };

  project.objects = ensureObjectRows(project.objects, "objects") as ProjectLike["objects"];
  project.modelInstances = ensureObjectRows(project.modelInstances, "modelInstances") as ProjectLike["modelInstances"];

  if (project.animation && Array.isArray(project.animation.tracks)) {
    project.animation.tracks = project.animation.tracks.map((track, index) => {
      if (typeof track !== "object" || track === null) return track;
      const item = { ...(track as Record<string, unknown>) };
      const objectId = typeof item.objectId === "string" ? item.objectId : "";
      const existing = typeof item.bindPath === "string" ? item.bindPath.trim() : "";
      if (!existing) {
        let resolved = objectBindPathById.get(objectId) ?? objectId;
        if (targetSelect && objectId === targetSelect && targetBindPath && targetBindPath.length > 0) {
          resolved = targetBindPath;
        }
        const normalized = normalizeBindPathValue(resolved.length > 0 ? resolved : `track_${index + 1}`);
        item.bindPath = normalized;
        warnings.push(`Filled missing bindPath for animation.tracks[${index}] as "${normalized}".`);
      } else {
        item.bindPath = normalizeBindPathValue(existing);
      }
      return item;
    });
  }

  return {
    json: stableJsonStringify(project),
    warnings,
  };
}

function getDurationSeconds(project: ProjectLike): number {
  const value = project.animation?.durationSeconds;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Number(value.toFixed(4));
  }
  return 2;
}

export function buildProofDocument(input: Omit<ProofDocument, "schemaVersion">): ProofDocument {
  return {
    schemaVersion: 1,
    previewOnly: input.previewOnly,
    goal: input.goal,
    takes: input.takes,
    inputHash: input.inputHash,
    outputProjectHash: input.outputProjectHash,
    bundleHash: input.bundleHash,
    tooling: input.tooling,
    diffSummary: input.diffSummary,
    outputs: input.outputs,
    bytes: input.bytes,
    warnings: input.warnings,
    errors: input.errors,
  };
}

export async function runMakeBundlePipeline(
  callTool: MakeBundleToolCaller,
  input: MakeBundlePipelineInput,
  tooling: MakeBundleToolingInfo,
): Promise<MakeBundlePipelineOutput> {
  const outDir = resolve(input.outDir);
  await mkdir(outDir, { recursive: true });

  const warnings: string[] = [];
  const errors: Array<{ code: string; message: string }> = [];
  const staged = input.staged ?? true;

  let inputJson = input.inJson;
  if (!inputJson && input.inBundleBase64) {
    try {
      inputJson = parseProjectJsonFromBundleBase64(input.inBundleBase64);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        previewOnly: true,
        outZipPath: null,
        manifestPath: null,
        proofPath: resolve(outDir, "proof.json"),
        warnings,
        errors: [{ code: "MF_ERR_INVALID_BUNDLE", message }],
      };
    }
  }
  if (!inputJson) {
    const exported = asToolCallResult(await callTool("mf.export.projectJson", {}));
    if (!exported.ok) {
      const error = (exported.error as { code: string; message: string } | undefined) ?? {
        code: "MF_ERR_EXPORT_PROJECT",
        message: "Failed to export project JSON.",
      };
      return {
        ok: false,
        previewOnly: true,
        outZipPath: null,
        manifestPath: null,
        proofPath: resolve(outDir, "proof.json"),
        warnings,
        errors: [error],
      };
    }
    inputJson = String(exported.json ?? "");
  }

  const inputHash = sha256HexFromString(inputJson);
  const loaded = asToolCallResult(await callTool("mf.project.loadJson", {
    json: inputJson,
    staged,
  }));
  if (!loaded.ok) {
    const error = (loaded.error as { code: string; message: string } | undefined) ?? {
      code: "MF_ERR_LOAD_JSON",
      message: "Failed to load input project.",
    };
    return {
      ok: false,
      previewOnly: true,
      outZipPath: null,
      manifestPath: null,
      proofPath: resolve(outDir, "proof.json"),
      warnings,
      errors: [error],
    };
  }

  const project = JSON.parse(inputJson) as ProjectLike;
  const initialDuration = getDurationSeconds(project);
  const targetObjectId = resolveTargetObjectId(project, input.target?.select);
  if (!targetObjectId) {
    if (staged) {
      await callTool("mf.project.discard", {});
    }
    const proofPath = resolve(outDir, "proof.json");
    const proof = buildProofDocument({
      previewOnly: true,
      goal: input.goal,
      takes: [],
      inputHash,
      outputProjectHash: null,
      bundleHash: null,
      tooling,
      diffSummary: { scripts: [], totals: { keyframesAdded: 0, keyframesMoved: 0, keyframesDeleted: 0, tracksTouched: 0 } },
      outputs: { outDir, projectJsonPath: null, bundleZipPath: null, manifestPath: null },
      bytes: { projectJson: null, bundleZip: null, manifest: null },
      warnings,
      errors: [{ code: "MF_ERR_NO_OBJECTS", message: "Project has no animatable objects." }],
    });
    await writeFile(proofPath, stableJsonStringify(proof), "utf8");
    return {
      ok: false,
      previewOnly: true,
      outZipPath: null,
      manifestPath: null,
      proofPath,
      warnings,
      errors: proof.errors,
    };
  }

  const requestedDuration = input.constraints?.durationSec;
  const effectiveDuration =
    typeof requestedDuration === "number" && Number.isFinite(requestedDuration) && requestedDuration > 0
      ? requestedDuration
      : initialDuration;

  const takes = input.takes && input.takes.length > 0
    ? normalizeTakeInputs(input.takes)
    : deriveTakesFromGoal(input.goal, effectiveDuration);
  const requiredDuration = Math.max(effectiveDuration, ...takes.map((take) => take.endTime));
  const normalizedStyle = normalizeSkillStyle(input.constraints?.style);
  if (input.constraints?.style && !normalizedStyle) {
    warnings.push(`Ignored unsupported style "${input.constraints.style}".`);
  }

  const scriptDiffs: Array<{
    take: string;
    keyframesAdded: number;
    keyframesMoved: number;
    keyframesDeleted: number;
    tracksTouched: number;
  }> = [];

  for (const take of takes) {
    const generated = asToolCallResult(await callTool("mf.skill.generateScript", {
      goal: inferTakeGoal(take, input.goal),
      constraints: {
        durationSec: Number((take.endTime - take.startTime).toFixed(4)),
        ...(typeof input.constraints?.fps === "number" && Number.isFinite(input.constraints.fps) && input.constraints.fps > 0
          ? { fps: input.constraints.fps }
          : {}),
        ...(normalizedStyle ? { style: normalizedStyle } : {}),
      },
      target: {
        select: targetObjectId,
      },
    }));
    if (!generated.ok) {
      if (staged) {
        await callTool("mf.project.discard", {});
      }
      const error = (generated.error as { code: string; message: string } | undefined) ?? {
        code: "MF_ERR_SKILL_GENERATE_SCRIPT",
        message: "Failed to generate script from goal.",
      };
      errors.push(error);
      break;
    }
    const generatedWarnings = Array.isArray(generated.warnings) ? generated.warnings : [];
    for (const warning of generatedWarnings) {
      if (typeof warning === "string") warnings.push(warning);
    }

    const rebasedScript = rebaseScriptForTake(String(generated.script ?? ""), take, requiredDuration, targetObjectId);

    const validated = asToolCallResult(await callTool("mf.script.validate", { script: rebasedScript }));
    if (!validated.ok) {
      const error = (validated.error as { code: string; message: string } | undefined) ?? {
        code: "MF_ERR_SCRIPT_VALIDATE",
        message: "Script validation failed.",
      };
      errors.push(error);
      break;
    }

    const runResult = asToolCallResult(await callTool("mf.script.run", {
      script: rebasedScript,
      applyMode: input.confirm ? "apply" : "previewOnly",
      confirm: input.confirm,
      staged,
    }));
    if (!runResult.ok) {
      const error = (runResult.error as { code: string; message: string } | undefined) ?? {
        code: "MF_ERR_SCRIPT_RUN",
        message: "Script run failed.",
      };
      errors.push(error);
      break;
    }
    const summary = summarizeDiff(runResult.diff);
    scriptDiffs.push({
      take: take.name,
      ...summary,
    });
  }

  if (errors.length === 0) {
    const takesScript = buildTakeScript(targetObjectId, requiredDuration, takes);
    const takeRun = asToolCallResult(await callTool("mf.script.run", {
      script: takesScript,
      applyMode: input.confirm ? "apply" : "previewOnly",
      confirm: input.confirm,
      staged,
    }));
    if (!takeRun.ok) {
      const error = (takeRun.error as { code: string; message: string } | undefined) ?? {
        code: "MF_ERR_SCRIPT_RUN",
        message: "Take metadata apply failed.",
      };
      errors.push(error);
    }
  }

  const totals = scriptDiffs.reduce(
    (acc, item) => ({
      keyframesAdded: acc.keyframesAdded + item.keyframesAdded,
      keyframesMoved: acc.keyframesMoved + item.keyframesMoved,
      keyframesDeleted: acc.keyframesDeleted + item.keyframesDeleted,
      tracksTouched: acc.tracksTouched + item.tracksTouched,
    }),
    { keyframesAdded: 0, keyframesMoved: 0, keyframesDeleted: 0, tracksTouched: 0 },
  );

  const proofPath = resolve(outDir, "proof.json");
  if (!input.confirm || errors.length > 0) {
    if (!input.confirm && !errors.some((item) => item.code === "MF_ERR_CONFIRM_REQUIRED")) {
      errors.unshift({ code: "MF_ERR_CONFIRM_REQUIRED", message: "confirm=true is required to apply and commit." });
    }
    if (staged) {
      await callTool("mf.project.discard", {});
    }
    const proof = buildProofDocument({
      previewOnly: true,
      goal: input.goal,
      takes,
      inputHash,
      outputProjectHash: null,
      bundleHash: null,
      tooling,
      diffSummary: { scripts: scriptDiffs, totals },
      outputs: {
        outDir,
        projectJsonPath: null,
        bundleZipPath: null,
        manifestPath: null,
      },
      bytes: {
        projectJson: null,
        bundleZip: null,
        manifest: null,
      },
      warnings,
      errors,
    });
    await writeFile(proofPath, stableJsonStringify(proof), "utf8");
    return {
      ok: false,
      previewOnly: true,
      outZipPath: null,
      manifestPath: null,
      proofPath,
      warnings,
      errors,
    };
  }

  if (staged) {
    const committed = asToolCallResult(await callTool("mf.project.commit", {}));
    if (!committed.ok) {
      const error = (committed.error as { code: string; message: string } | undefined) ?? {
        code: "MF_ERR_COMMIT",
        message: "Failed to commit staged project.",
      };
      errors.push(error);
      const proof = buildProofDocument({
        previewOnly: true,
        goal: input.goal,
        takes,
        inputHash,
        outputProjectHash: null,
        bundleHash: null,
        tooling,
        diffSummary: { scripts: scriptDiffs, totals },
        outputs: { outDir, projectJsonPath: null, bundleZipPath: null, manifestPath: null },
        bytes: { projectJson: null, bundleZip: null, manifest: null },
        warnings,
        errors,
      });
      await writeFile(proofPath, stableJsonStringify(proof), "utf8");
      return {
        ok: false,
        previewOnly: true,
        outZipPath: null,
        manifestPath: null,
        proofPath,
        warnings,
        errors,
      };
    }
  }

  const exportedJson = asToolCallResult(await callTool("mf.export.projectJson", {}));
  if (!exportedJson.ok) {
    const error = (exportedJson.error as { code: string; message: string } | undefined) ?? {
      code: "MF_ERR_EXPORT_PROJECT",
      message: "Failed to export project JSON.",
    };
    errors.push(error);
  }
  if (errors.length > 0) {
    const proof = buildProofDocument({
      previewOnly: true,
      goal: input.goal,
      takes,
      inputHash,
      outputProjectHash: null,
      bundleHash: null,
      tooling,
      diffSummary: { scripts: scriptDiffs, totals },
      outputs: { outDir, projectJsonPath: null, bundleZipPath: null, manifestPath: null },
      bytes: { projectJson: null, bundleZip: null, manifest: null },
      warnings,
      errors,
    });
    await writeFile(proofPath, stableJsonStringify(proof), "utf8");
    return {
      ok: false,
      previewOnly: true,
      outZipPath: null,
      manifestPath: null,
      proofPath,
      warnings,
      errors,
    };
  }
  let finalProjectJson = String(exportedJson.json ?? "");
  if (input.unity) {
    const bindPathTarget = input.target?.select
      ? resolveUnityTargetBindPath(project, input.target.select, input.target.bindPath)
      : undefined;
    const ensured = ensureUnityBindPaths(finalProjectJson, {
      targetSelect: input.target?.select,
      targetBindPath: bindPathTarget,
    });
    finalProjectJson = ensured.json;
    warnings.push(...ensured.warnings);

    const reload = asToolCallResult(await callTool("mf.project.loadJson", {
      json: finalProjectJson,
      staged: false,
    }));
    if (!reload.ok) {
      const error = (reload.error as { code: string; message: string } | undefined) ?? {
        code: "MF_ERR_LOAD_JSON",
        message: "Failed to apply unity bindPath normalization.",
      };
      errors.push(error);
      const proof = buildProofDocument({
        previewOnly: true,
        goal: input.goal,
        takes,
        inputHash,
        outputProjectHash: null,
        bundleHash: null,
        tooling,
        diffSummary: { scripts: scriptDiffs, totals },
        outputs: { outDir, projectJsonPath: null, bundleZipPath: null, manifestPath: null },
        bytes: { projectJson: null, bundleZip: null, manifest: null },
        warnings,
        errors,
      });
      await writeFile(proofPath, stableJsonStringify(proof), "utf8");
      return {
        ok: false,
        previewOnly: true,
        outZipPath: null,
        manifestPath: null,
        proofPath,
        warnings,
        errors,
      };
    }
  }
  const projectJsonPath = resolve(outDir, "project.json");
  await writeFile(projectJsonPath, finalProjectJson, "utf8");

  const bundleResult = asToolCallResult(await callTool("mf.export.bundle", { outDir }));
  if (!bundleResult.ok) {
    const error = (bundleResult.error as { code: string; message: string } | undefined) ?? {
      code: "MF_ERR_EXPORT_BUNDLE",
      message: "Bundle export failed.",
    };
    errors.push(error);
  }
  if (errors.length > 0) {
    const proof = buildProofDocument({
      previewOnly: true,
      goal: input.goal,
      takes,
      inputHash,
      outputProjectHash: sha256HexFromString(finalProjectJson),
      bundleHash: null,
      tooling,
      diffSummary: { scripts: scriptDiffs, totals },
      outputs: { outDir, projectJsonPath, bundleZipPath: null, manifestPath: null },
      bytes: { projectJson: Buffer.byteLength(finalProjectJson, "utf8"), bundleZip: null, manifest: null },
      warnings,
      errors,
    });
    await writeFile(proofPath, stableJsonStringify(proof), "utf8");
    return {
      ok: false,
      previewOnly: true,
      outZipPath: null,
      manifestPath: null,
      proofPath,
      warnings,
      errors,
    };
  }
  const outZipPath = resolve(String(bundleResult.path ?? resolve(outDir, "motionforge-bundle.zip")));
  const bundleBytes = new Uint8Array(await readFile(outZipPath));
  let manifestRaw = "";
  try {
    manifestRaw = readManifestFromBundleBytes(bundleBytes);
  } catch (error) {
    errors.push({
      code: "MF_ERR_EXPORT_BUNDLE",
      message: error instanceof Error ? error.message : String(error),
    });
    const proof = buildProofDocument({
      previewOnly: true,
      goal: input.goal,
      takes,
      inputHash,
      outputProjectHash: sha256HexFromString(finalProjectJson),
      bundleHash: sha256HexFromBytes(bundleBytes),
      tooling,
      diffSummary: { scripts: scriptDiffs, totals },
      outputs: { outDir, projectJsonPath, bundleZipPath: outZipPath, manifestPath: null },
      bytes: { projectJson: Buffer.byteLength(finalProjectJson, "utf8"), bundleZip: bundleBytes.byteLength, manifest: null },
      warnings,
      errors,
    });
    await writeFile(proofPath, stableJsonStringify(proof), "utf8");
    return {
      ok: false,
      previewOnly: true,
      outZipPath,
      manifestPath: null,
      proofPath,
      warnings,
      errors,
    };
  }
  const manifestPath = resolve(outDir, "motionforge-manifest.json");
  await writeFile(manifestPath, manifestRaw, "utf8");

  const proof = buildProofDocument({
    previewOnly: false,
    goal: input.goal,
    takes,
    inputHash,
    outputProjectHash: sha256HexFromString(finalProjectJson),
    bundleHash: sha256HexFromBytes(bundleBytes),
    tooling,
    diffSummary: { scripts: scriptDiffs, totals },
    outputs: {
      outDir,
      projectJsonPath,
      bundleZipPath: outZipPath,
      manifestPath,
    },
    bytes: {
      projectJson: Buffer.byteLength(finalProjectJson, "utf8"),
      bundleZip: bundleBytes.byteLength,
      manifest: Buffer.byteLength(manifestRaw, "utf8"),
    },
    warnings,
    errors,
  });
  await writeFile(proofPath, stableJsonStringify(proof), "utf8");

  return {
    ok: true,
    previewOnly: false,
    outZipPath,
    manifestPath,
    proofPath,
    warnings,
    errors: errors.length > 0 ? errors : undefined,
  };
}
