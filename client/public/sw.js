/* eslint-disable no-restricted-globals */
function resolveTenant(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (host.includes("boursedelor")) return "bdo";
  if (host.includes("maisonenterre") || host.includes("maisonsenterre")) return "met";
  if (host.includes("xportcard")) return "xportcard";
  if (host.includes("mindbase")) return "mindbase";
  if (host.includes("zogueland")) return "zogueland";
  if (host.includes("rayon1km")) return "rayon1km";
  if (host.includes("houseofzogue")) return "hoz";
  if (host.includes("vitalsounouvou")) return "vs";
  if (host.includes("exportunity.zone")) return "zone";
  return "exportunity";
}

const TENANT = resolveTenant(self.location.hostname);
const BUILD_SUFFIX = "dev";
const VERSION = `${TENANT}-sw-v1-build-${BUILD_SUFFIX}`;

const STATIC_CACHE = `${VERSION}:static`;
const RUNTIME_CACHE = `${VERSION}:runtime`;
const API_CACHE = `${VERSION}:api`;

const TENANT_PRECACHE = {
  bdo: [
    "/manifest-bdo.webmanifest",
    "/tenants/bdo/official/brand/app-icon-512.png",
    "/tenants/bdo/official/brand/favicon-512.png",
  ],
  met: ["/met/site.webmanifest", "/tenants/met/app-icon-1024.png", "/tenants/met/favicon-512.png"],
  zogueland: ["/manifest-zogueland.webmanifest", "/tenants/zogueland/favicon.svg"],
  zone: ["/manifest.webmanifest", "/icons/zone-192.png", "/icons/zone-512.png", "/icons/zone-512-maskable.png"],
};

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/offline.html",
  "/apple-touch-icon.png",
  ...(TENANT_PRECACHE[TENANT] || ["/manifest.webmanifest"]),
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
