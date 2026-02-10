import { BUILT_IN_DEMO_MODEL_URL } from "../three/demoModel.js";
import { resolveFfmpegCoreAssetUrls } from "../export/videoExportCore.js";

export const OFFLINE_CACHE_NAME = "motionforge-offline-v1";

export interface OfflinePackProgress {
  completed: number;
  total: number;
  currentUrl: string;
}

export interface DownloadOfflinePackOptions {
  onStart?: (total: number) => void;
  onProgress?: (progress: OfflinePackProgress) => void;
}

let serviceWorkerRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

function toAbsoluteUrl(input: string): string {
  return new URL(input, window.location.href).toString();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function isOfflinePackSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "caches" in window
    && typeof window.fetch === "function";
}

export function resolveOfflinePackUrls(): string[] {
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
  const ffmpegCore = resolveFfmpegCoreAssetUrls({ strategy: "local" });
  const urls = [
    window.location.href,
    baseUrl,
    `${import.meta.env.BASE_URL}sw-offline.js`,
    BUILT_IN_DEMO_MODEL_URL,
    ffmpegCore.coreScriptUrl,
    ffmpegCore.wasmUrl,
  ];

  for (const script of Array.from(document.querySelectorAll("script[src]"))) {
    const src = script.getAttribute("src");
    if (src) {
      urls.push(src);
    }
  }
  for (const link of Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))) {
    const href = link.getAttribute("href");
    if (href) {
      urls.push(href);
    }
  }

  return unique(urls.map(toAbsoluteUrl));
}

async function openOfflineCache(): Promise<Cache> {
  return caches.open(OFFLINE_CACHE_NAME);
}

export async function registerOfflineServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isOfflinePackSupported()) {
    return null;
  }
  if (!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw-offline.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .then(() => navigator.serviceWorker.ready)
      .catch(() => null);
  }
  return serviceWorkerRegistrationPromise;
}

export async function isOfflinePackReady(urls: string[] = resolveOfflinePackUrls()): Promise<boolean> {
  if (!isOfflinePackSupported()) {
    return false;
  }

  const cache = await openOfflineCache();
  for (const url of urls) {
    const match = await cache.match(url);
    if (!match) {
      return false;
    }
  }
  return true;
}

export async function downloadOfflinePack(options: DownloadOfflinePackOptions = {}): Promise<number> {
  if (!isOfflinePackSupported()) {
    throw new Error("offline pack is not supported in this browser");
  }

  await registerOfflineServiceWorker();

  const urls = resolveOfflinePackUrls();
  const cache = await openOfflineCache();
  options.onStart?.(urls.length);

  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i];
    const response = await fetch(url, { cache: "reload" });
    if (!response.ok) {
      throw new Error(`failed to cache ${url} (${response.status})`);
    }
    await cache.put(url, response.clone());
    options.onProgress?.({
      completed: i + 1,
      total: urls.length,
      currentUrl: url,
    });
  }

  return urls.length;
}
