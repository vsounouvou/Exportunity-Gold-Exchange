import { getClientBuildId, isVersionGuardEnabledByConfig } from "./buildIdentity";

type SystemVersionPayload = {
  build?: string | null;
  buildId?: string | null;
  versionGuardEnabled?: boolean | string | null;
};

let runPromise: Promise<void> | null = null;

function normalize(value: unknown): string {
  return String(value ?? "").trim();
}

function isEnabled(value: unknown): boolean {
  const normalized = normalize(value).toLowerCase();
  if (!normalized) return true;
  return !["0", "false", "off", "no"].includes(normalized);
}

function getAttemptKey(serverBuildId: string) {
  return `__did_nuke_for_${serverBuildId}`;
}

async function fetchSystemVersion(): Promise<SystemVersionPayload | null> {
  try {
    const res = await fetch(`/api/system/version?v=${Date.now()}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as SystemVersionPayload;
  } catch {
    return null;
  }
}

async function clearClientCaches() {
  try {
    if ("serviceWorker" in navigator && navigator.serviceWorker.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    // ignore
  }

  try {
    if ("caches" in window && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // ignore
  }
}

export async function recoverFromStaleClient(reason: string, targetBuildId?: string | null) {
  if (typeof window === "undefined") return;
  const normalizedBuildId = normalize(targetBuildId || Date.now());
  const attemptKey = getAttemptKey(normalizedBuildId);
  if (sessionStorage.getItem(attemptKey) === "1") return;
  sessionStorage.setItem(attemptKey, "1");

  try {
    await clearClientCaches();
  } catch {
    // ignore
  }

  const resetUrl = new URL("/api/system/cache-reset", window.location.origin);
  resetUrl.searchParams.set("from", reason || "version-guard");
  resetUrl.searchParams.set("targetBuild", normalizedBuildId);
  resetUrl.searchParams.set("mode", "soft");
  resetUrl.searchParams.set("v", normalizedBuildId);
  window.location.replace(resetUrl.toString());
}

export async function runVersionGuardOnce() {
  if (typeof window === "undefined") return;
  if (runPromise) return runPromise;

  runPromise = (async () => {
    if (!isVersionGuardEnabledByConfig()) return;

    const clientBuildId = normalize(getClientBuildId());
    if (!clientBuildId) return;

    const payload = await fetchSystemVersion();
    if (!payload) return;
    if (!isEnabled(payload.versionGuardEnabled)) return;

    const serverBuildId = normalize(payload.build || payload.buildId);
    if (!serverBuildId) return;
    if (serverBuildId === clientBuildId) return;

    await recoverFromStaleClient("version-guard", serverBuildId);
  })().finally(() => {
    runPromise = null;
  });

  return runPromise;
}
