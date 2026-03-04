/* eslint-disable no-restricted-globals */
const VERSION = "zone-sw-v1";

const STATIC_CACHE = `${VERSION}:static`;
const RUNTIME_CACHE = `${VERSION}:runtime`;
const API_CACHE = `${VERSION}:api`;

const PRECACHE_URLS = [
  "/",
  "/zone",
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/zone-192.png",
  "/icons/zone-512.png",
  "/icons/zone-512-maskable.png",
  "/apple-touch-icon.png",
];

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

function isApiRequest(url) {
  return url.pathname.startsWith("/api");
}

function shouldNetworkFirst(url) {
  if (url.pathname.endsWith("/config.js")) return true;
  if (url.pathname.endsWith("/build.json")) return true;
  if (url.pathname.endsWith(".webmanifest")) return true;
  if (url.pathname.endsWith("/sw.js") || url.pathname.endsWith("/service-worker.js")) return true;
  if (url.pathname.endsWith("/index.html")) return true;
  if (url.pathname === "/reset.html") return true;
  return false;
}

async function networkFirst(request, cacheName = RUNTIME_CACHE) {
  const cache = await caches.open(cacheName);
  try {
    const resp = await fetch(request, { cache: "no-store" });
    if (resp && resp.ok) {
      cache.put(request, resp.clone());
    }
    return resp;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("network_first_failed");
  }
}

async function staleWhileRevalidate(request, cacheName = RUNTIME_CACHE) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const revalidate = fetch(request)
    .then((resp) => {
      if (resp && resp.ok) {
        cache.put(request, resp.clone());
      }
      return resp;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }
  const fresh = await revalidate;
  if (fresh) return fresh;
  throw new Error("stale_while_revalidate_failed");
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => undefined),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data && data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isApiRequest(url)) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (shouldNetworkFirst(url)) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(
      networkFirst(request, STATIC_CACHE).catch(async () => {
        const cachedShell = await caches.match("/index.html");
        if (cachedShell) return cachedShell;
        return caches.match("/offline.html");
      }),
    );
    return;
  }

  event.respondWith(
    staleWhileRevalidate(request, RUNTIME_CACHE).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      throw new Error("asset_fetch_failed");
    }),
  );
});
