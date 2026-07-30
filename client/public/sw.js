/* eslint-disable no-restricted-globals */
function resolveTenant(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (host.includes("agoojiye") || host.includes("agoojye") || host.includes("agojye")) return "agoojye";
  if (host.includes("boursedelor")) return "bdo";
  return "neutral";
}

const TENANT = resolveTenant(self.location.hostname);
const BUILD_SUFFIX = "dev";
const VERSION = `${TENANT}-sw-v1-build-${BUILD_SUFFIX}`;

const STATIC_CACHE = `${VERSION}:static`;
const RUNTIME_CACHE = `${VERSION}:runtime`;

const PRECACHE_URLS_BY_TENANT = {
  agoojye: [
    "/offline.html",
    "/manifest-agoojiye.webmanifest",
    "/manifest-agoojiye-os.webmanifest",
    "/tenants/agoojye/app-icon-64.png",
  ],
  bdo: [
    "/offline.html",
    "/manifest-bdo.webmanifest",
    "/tenants/bdo/official/brand/app-icon-512.png",
    "/tenants/bdo/official/brand/favicon-512.png",
  ],
  neutral: ["/offline.html", "/manifest.webmanifest", "/favicon.svg"],
};

const PRECACHE_URLS = PRECACHE_URLS_BY_TENANT[TENANT] || PRECACHE_URLS_BY_TENANT.neutral;

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

function createOfflineDocumentResponse() {
  return new Response(
    `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Connexion interrompue | AGOOJIYE</title>
    <style>
      :root{color-scheme:dark}
      *{box-sizing:border-box}
      body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#0b100d;color:#fff;font-family:Arial,sans-serif}
      main{width:min(100%,520px);border-top:3px solid #d2aa35;padding:28px 0}
      h1{margin:0 0 12px;font-size:clamp(28px,7vw,44px);line-height:1.05}
      p{margin:0 0 22px;color:#c9d0cb;line-height:1.65}
      button{min-height:48px;border:0;background:#d2aa35;color:#111;padding:0 20px;font-weight:700;cursor:pointer}
    </style>
  </head>
  <body>
    <main>
      <h1>Connexion interrompue</h1>
      <p>AGOOJIYE n'a pas pu joindre le réseau. Vos données ne sont pas perdues. Vérifiez votre connexion puis réessayez.</p>
      <button type="button" onclick="location.reload()">Réessayer</button>
    </main>
  </body>
</html>`,
    {
      status: 503,
      statusText: "Service Unavailable",
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
        "X-Robots-Tag": "noindex",
      },
    },
  );
}

async function navigationNetworkFirst(request) {
  try {
    return await fetch(request, { cache: "no-store" });
  } catch {
    const cachedOffline = await caches.match("/offline.html");
    return cachedOffline || createOfflineDocumentResponse();
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
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined))))
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

  // Authenticated and operational API responses must never be stored by the SW.
  if (isApiRequest(url)) {
    return;
  }

  if (shouldNetworkFirst(url)) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(navigationNetworkFirst(request));
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

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = String(payload.title || "AGOOJIYE OS");
  const body = String(payload.body || "Une nouvelle information nécessite votre attention.");
  const url = String(payload.url || "/workspace");
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/tenants/agoojye/app-icon-128.png",
      badge: "/tenants/agoojye/app-icon-64.png",
      data: { url },
      tag: `agoojiye-os-${url}`,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = String(event.notification?.data?.url || "/workspace");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
