import * as THREE from "three";
import { assetStore, type AssetRecord } from "../../state/assetStore.js";
import { sceneStore } from "../../state/sceneStore.js";
import {
  annotateImportedHierarchy,
  arrayBufferToBase64,
  parseGltfFromArrayBuffer,
  summarizeImportedScene,
  toEmbeddedAssetRecord,
  validateImportBudget,
  type ImportSceneSummary,
} from "./importGltf.js";

export const BUILT_IN_DEMO_MODEL_URL = "/assets/demo-model.glb";
export const BUILT_IN_DEMO_MODEL_NAME = "demo-model.glb";

interface ResolveBuiltInDemoModelImportPayloadOptions {
  fetchImpl?: typeof fetch;
  parseModel?: (arrayBuffer: ArrayBuffer) => Promise<THREE.Object3D>;
  now?: () => number;
  random?: () => number;
}

export interface BuiltInDemoModelImportPayload {
  root: THREE.Object3D;
  asset: AssetRecord;
  summary: ImportSceneSummary;
}

function buildAssetId(now: () => number, random: () => number): string {
  return `asset_${now().toString(36)}_${Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0")}`;
}

export async function fetchBuiltInDemoModelArrayBuffer(
  fetchImpl: typeof fetch = fetch,
): Promise<ArrayBuffer> {
  const response = await fetchImpl(BUILT_IN_DEMO_MODEL_URL);
  if (!response.ok) {
    throw new Error(`failed to fetch ${BUILT_IN_DEMO_MODEL_NAME} (${response.status})`);
  }
  return response.arrayBuffer();
}

export async function resolveBuiltInDemoModelImportPayload(
  options: ResolveBuiltInDemoModelImportPayloadOptions = {},
): Promise<BuiltInDemoModelImportPayload> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const parseModel = options.parseModel ?? parseGltfFromArrayBuffer;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;

  const arrayBuffer = await fetchBuiltInDemoModelArrayBuffer(fetchImpl);
  const root = await parseModel(arrayBuffer);
  const summary = summarizeImportedScene(root);
  const budgetError = validateImportBudget(summary);
  if (budgetError) {
    throw new Error(budgetError);
  }

  const assetId = buildAssetId(now, random);
  annotateImportedHierarchy(root, assetId, BUILT_IN_DEMO_MODEL_NAME);

  const file = new File([arrayBuffer], BUILT_IN_DEMO_MODEL_NAME, { type: "model/gltf-binary" });
  const asset = toEmbeddedAssetRecord(file, assetId, arrayBufferToBase64(arrayBuffer));
  return { root, asset, summary };
}

export async function insertBuiltInDemoModel(): Promise<BuiltInDemoModelImportPayload> {
  const payload = await resolveBuiltInDemoModelImportPayload();
  const scene = sceneStore.getScene();
  if (!scene) {
    throw new Error("Viewport scene is not ready");
  }

  scene.add(payload.root);
  const ids = sceneStore.registerHierarchy(payload.root, { markDirty: true });
  const rootId = ids[0] ?? null;
  if (rootId) {
    sceneStore.setSelectedId(rootId);
  }
  assetStore.addAsset(payload.asset);
  return payload;
}
