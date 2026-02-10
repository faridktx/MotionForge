const CACHE_NAME = "motionforge-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response && response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    cacheFirst(request).catch(async () => {
      if (request.mode === "navigate") {
        const cache = await caches.open(CACHE_NAME);
        const fallback = await cache.match(self.registration.scope);
        if (fallback) {
          return fallback;
        }
      }
      throw new Error(`offline fetch failed: ${request.url}`);
    }),
  );
});
