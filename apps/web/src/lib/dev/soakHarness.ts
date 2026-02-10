import { assetStore } from "../../state/assetStore.js";
import { animationStore } from "../../state/animationStore.js";
import { rendererStatsStore, type RendererStatsSnapshot } from "../../state/rendererStatsStore.js";
import { sceneStore } from "../../state/sceneStore.js";
import { collectReferencedAssetIdsFromModelRoots, findUnusedAssetIds } from "../project/assetMaintenance.js";
import { newProject } from "../project/deserialize.js";
import { serializeProject } from "../project/serialize.js";
import { insertBuiltInDemoModel } from "../three/demoModel.js";

export interface SoakProgress {
  iterations: number;
  keyframeOps: number;
  scrubOps: number;
  exportOps: number;
  purgeOps: number;
  bytesSerialized: number;
  failures: number;
}

export interface SoakStepDelta {
  keyframeOps?: number;
  scrubOps?: number;
  exportOps?: number;
  purgeOps?: number;
  bytesSerialized?: number;
  failures?: number;
}

export interface SoakSummary {
  progress: SoakProgress;
  rendererStats: RendererStatsSnapshot;
  assetsRemaining: number;
}

export interface RunSoakOptions {
  durationMs?: number;
  intervalMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: SoakProgress, stats: RendererStatsSnapshot, assetsCount: number) => void;
}

export function createInitialSoakProgress(): SoakProgress {
  return {
    iterations: 0,
    keyframeOps: 0,
    scrubOps: 0,
    exportOps: 0,
    purgeOps: 0,
    bytesSerialized: 0,
    failures: 0,
  };
}

export function applySoakStep(progress: SoakProgress, delta: SoakStepDelta): SoakProgress {
  return {
    iterations: progress.iterations + 1,
    keyframeOps: progress.keyframeOps + (delta.keyframeOps ?? 0),
    scrubOps: progress.scrubOps + (delta.scrubOps ?? 0),
    exportOps: progress.exportOps + (delta.exportOps ?? 0),
    purgeOps: progress.purgeOps + (delta.purgeOps ?? 0),
    bytesSerialized: progress.bytesSerialized + (delta.bytesSerialized ?? 0),
    failures: progress.failures + (delta.failures ?? 0),
  };
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Soak test canceled", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function runSoakIteration(iteration: number): Promise<SoakStepDelta> {
  const meshes = newProject();
  if (meshes.length === 0) {
    return { failures: 1 };
  }

  let failures = 0;
  // Re-import the same built-in model fixture periodically for deterministic soak coverage.
  if (iteration % 2 === 0) {
    try {
      await insertBuiltInDemoModel();
    } catch {
      failures += 1;
    }
  }

  const first = sceneStore.getSelectedObject() ?? meshes[0];
  const firstId = sceneStore.getIdForObject(first);
  if (firstId) {
    sceneStore.setSelectedId(firstId);
  }

  let scrubOps = 0;
  animationStore.scrubTo(0);
  scrubOps += 1;
  const keyedA = animationStore.addAllKeyframesForSelected({ source: "soak", label: "Soak Keyframe A" }).length;

  first.position.x += 0.25;
  sceneStore.notifyTransformChanged();
  animationStore.scrubTo(1);
  scrubOps += 1;
  const keyedB = animationStore.addAllKeyframesForSelected({ source: "soak", label: "Soak Keyframe B" }).length;

  animationStore.scrubTo((iteration % 10) / 10);
  scrubOps += 1;

  const payload = JSON.stringify(serializeProject());

  const referenced = collectReferencedAssetIdsFromModelRoots(sceneStore.getAllUserObjects());
  const unused = findUnusedAssetIds(assetStore.getAssets(), referenced);
  for (const assetId of unused) {
    assetStore.removeAsset(assetId);
  }

  return {
    keyframeOps: keyedA + keyedB,
    scrubOps,
    exportOps: 1,
    purgeOps: 1,
    bytesSerialized: payload.length,
    failures,
  };
}

export async function runSoakTest(options: RunSoakOptions = {}): Promise<SoakSummary> {
  const durationMs = options.durationMs ?? 5 * 60 * 1000;
  const intervalMs = options.intervalMs ?? 1000;
  let progress = createInitialSoakProgress();
  const start = performance.now();
  let iteration = 0;

  while (performance.now() - start < durationMs) {
    if (options.signal?.aborted) {
      throw new DOMException("Soak test canceled", "AbortError");
    }
    const delta = await runSoakIteration(iteration);
    progress = applySoakStep(progress, delta);
    options.onProgress?.(progress, rendererStatsStore.getStats(), assetStore.getAssets().length);
    iteration += 1;
    await wait(intervalMs, options.signal);
  }

  return {
    progress,
    rendererStats: rendererStatsStore.getStats(),
    assetsRemaining: assetStore.getAssets().length,
  };
}
