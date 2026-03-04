type HardRefreshOptions = {
  reason: string;
  maxAttempts?: number;
};

function getClientBuildId(): string | null {
  try {
    const cfg = (window as any).__EXPORTUNITY_CONFIG__ || {};
    const buildId = String(cfg.buildId || "").trim();
    return buildId || null;
  } catch {
    return null;
  }
}

function getAttemptsKey() {
  const buildId = typeof window === "undefined" ? null : getClientBuildId();
  return `ece_hard_refresh_attempts:${buildId || "unknown"}`;
}

export async function hardRefreshOncePerSession(options: HardRefreshOptions) {
  if (typeof window === "undefined") return;

  // In automation (Playwright), an automatic hard refresh causes flaky "navigation interrupted" failures
  // and hides the original error. Let the test fail instead.
  try {
    if (navigator.webdriver) return;
  } catch {
    // ignore
  }

  const maxAttempts = Number.isFinite(options.maxAttempts) ? Math.max(1, options.maxAttempts as number) : 3;
  const key = getAttemptsKey();
  const attempts = Number(sessionStorage.getItem(key) || "0");
  if (Number.isFinite(attempts) && attempts >= maxAttempts) return;
  sessionStorage.setItem(key, String(attempts + 1));

  try {
    // eslint-disable-next-line no-console
    console.warn("[ui] hard refresh triggered", { reason: options.reason, attempt: attempts + 1, maxAttempts });
  } catch {
    // ignore
  }

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

  try {
    const url = new URL(window.location.href);
    url.searchParams.set("v", String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}
