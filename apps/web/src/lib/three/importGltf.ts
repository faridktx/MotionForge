import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { sceneStore } from "../../state/sceneStore.js";
import type { AssetRecord, MaterialOverrideRecord } from "../../state/assetStore.js";

export const WARN_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

interface ReadFileOptions {
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function readFileAsArrayBuffer(file: File, options: ReadFileOptions = {}): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    const onAbort = () => {
      reader.abort();
      reject(new DOMException("Import canceled", "AbortError"));
    };

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new DOMException("Import canceled", "AbortError"));
        return;
      }
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };
    reader.onabort = () => {
      reject(new DOMException("Import canceled", "AbortError"));
    };
    reader.onprogress = (event) => {
      if (event.lengthComputable && options.onProgress) {
        options.onProgress(event.loaded, event.total);
      }
    };
    reader.onload = () => {
      if (options.signal) {
        options.signal.removeEventListener("abort", onAbort);
      }
      resolve(reader.result as ArrayBuffer);
    };
    reader.readAsArrayBuffer(file);
  });
}

export async function parseGltfFromArrayBuffer(arrayBuffer: ArrayBuffer, resourcePath = ""): Promise<THREE.Object3D> {
  const loader = new GLTFLoader();
  return new Promise<THREE.Object3D>((resolve, reject) => {
    loader.parse(
      arrayBuffer,
      resourcePath,
      (gltf) => {
        resolve(gltf.scene);
      },
      (error) => {
        reject(error instanceof Error ? error : new Error("Unable to parse glTF"));
      },
    );
  });
}

function createNodePath(parentPath: string, node: THREE.Object3D, index: number): string {
  const part = node.name.trim().length > 0 ? sanitizeFileName(node.name) : `${node.type}_${index}`;
  return `${parentPath}/${part}`;
}

export function annotateImportedHierarchy(root: THREE.Object3D, assetId: string, fileName: string): void {
  root.name = root.name.trim().length > 0 ? root.name : fileName.replace(/\.[^.]+$/, "");
  root.userData.__isModelRoot = true;
  root.userData.__assetId = assetId;
  root.userData.__isImportedModel = true;
  root.userData.__assetNodePath = "root";

  const visit = (node: THREE.Object3D, parentPath: string) => {
    node.userData.__assetId = assetId;
    node.userData.__isImportedModel = true;

    node.children.forEach((child, index) => {
      const nodePath = createNodePath(parentPath, child, index);
      child.userData.__assetNodePath = nodePath;
      visit(child, nodePath);
    });
  };

  visit(root, "root");
}

export function registerImportedHierarchy(root: THREE.Object3D): string[] {
  return sceneStore.registerHierarchy(root, { markDirty: true });
}

export function toEmbeddedAssetRecord(file: File, assetId: string, base64Data: string): AssetRecord {
  return {
    id: assetId,
    name: file.name,
    type: "gltf",
    source: {
      mode: "embedded",
      data: base64Data,
      fileName: file.name,
    },
    size: file.size,
  };
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function firstMaterial(mesh: THREE.Mesh): THREE.Material | null {
  const material = mesh.material;
  if (Array.isArray(material)) return material[0] ?? null;
  return material ?? null;
}

export function collectMaterialOverrides(root: THREE.Object3D): MaterialOverrideRecord[] {
  const overrides: MaterialOverrideRecord[] = [];

  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const material = firstMaterial(node);
    if (!(material instanceof THREE.MeshStandardMaterial)) return;
    const nodePath = String(node.userData.__assetNodePath ?? "");
    if (!nodePath) return;

    overrides.push({
      nodePath,
      color: material.color.getHex(),
      metallic: material.metalness,
      roughness: material.roughness,
    });
  });

  return overrides;
}

export function applyMaterialOverrides(root: THREE.Object3D, overrides: MaterialOverrideRecord[]): void {
  if (overrides.length === 0) return;
  const map = new Map(overrides.map((item) => [item.nodePath, item]));

  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const material = firstMaterial(node);
    if (!(material instanceof THREE.MeshStandardMaterial)) return;

    const nodePath = String(node.userData.__assetNodePath ?? "");
    if (!nodePath) return;

    const override = map.get(nodePath);
    if (!override) return;

    material.color.setHex(override.color);
    material.metalness = override.metallic;
    material.roughness = override.roughness;
    material.needsUpdate = true;
  });
}
