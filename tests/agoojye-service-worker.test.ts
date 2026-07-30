import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../client/public/sw.js", import.meta.url), "utf8");

function inspectWorker(hostname: string) {
  const listeners = new Map<string, unknown>();
  const cacheEntries = new Map<string, Response>();
  const context: Record<string, any> = {
    Response,
    URL,
    caches: {
      async keys() {
        return [];
      },
      async open() {
        return {
          async add() {},
          async match(key: string) {
            return cacheEntries.get(key);
          },
          async put(key: string, response: Response) {
            cacheEntries.set(key, response);
          },
        };
      },
      async match(key: string) {
        return cacheEntries.get(key);
      },
      async delete() {
        return true;
      },
    },
    self: {
      clients: { claim() {} },
      location: { hostname, origin: `https://${hostname}` },
      addEventListener(type: string, listener: unknown) {
        listeners.set(type, listener);
      },
      skipWaiting() {},
    },
  };

  vm.runInNewContext(
    `${source}\n;globalThis.__workerSnapshot = { tenant: TENANT, version: VERSION, precache: [...PRECACHE_URLS] };`,
    context,
  );

  return {
    ...context.__workerSnapshot,
    listeners: [...listeners.keys()].sort(),
    listener(type: string) {
      return listeners.get(type) as (event: any) => void;
    },
  } as { tenant: string; version: string; precache: string[]; listeners: string[] };
}

test("AGOOJIYE service worker uses only AGOOJIYE precache resources", () => {
  const worker = inspectWorker("agoojiye.com");

  assert.equal(worker.tenant, "agoojye");
  assert.match(worker.version, /^agoojye-sw-v1-build-/);
  assert.ok(worker.precache.includes("/manifest-agoojiye.webmanifest"));
  assert.ok(worker.precache.includes("/tenants/agoojye/app-icon-64.png"));
  assert.equal(worker.precache.some((url) => url.includes("/bdo/")), false);
  assert.equal(worker.precache.some((url) => url.includes("manifest-bdo")), false);
  assert.deepEqual(worker.listeners, ["activate", "fetch", "install", "message", "notificationclick", "push"]);
});

test("navigation failure always returns a usable French offline document", async () => {
  const worker = inspectWorker("agoojiye.com") as any;
  const originalFetch = globalThis.fetch;
  let responsePromise: Promise<Response> | null = null;

  try {
    globalThis.fetch = async () => {
      throw new Error("network unavailable");
    };
    worker.listener("fetch")({
      request: {
        method: "GET",
        mode: "navigate",
        url: "https://agoojiye.com/",
      },
      respondWith(value: Promise<Response>) {
        responsePromise = value;
      },
    });

    assert.ok(responsePromise);
    const response = await responsePromise;
    assert.equal(response.status, 503);
    assert.match(await response.text(), /Connexion interrompue/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Bourse de l'Or service worker keeps its own cache namespace", () => {
  const worker = inspectWorker("boursedelor.com");

  assert.equal(worker.tenant, "bdo");
  assert.match(worker.version, /^bdo-sw-v1-build-/);
  assert.ok(worker.precache.includes("/manifest-bdo.webmanifest"));
  assert.equal(worker.precache.some((url) => url.includes("/agoojye/")), false);
});
