import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { SessionProvider } from "./lib/session";
import { LocaleProvider } from "./contexts/LocaleContext";
import { PwaInstallProvider } from "./contexts/PwaInstallContext";
import { TenantProvider } from "./lib/tenant";
import { Toaster } from "@/components/ui/toaster";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TenantGuard } from "@/components/TenantGuard";
import App from './App';
import "./index.css";
import { installApiFetchPatch } from "./lib/fetchPatch";
import { hardRefreshOncePerSession } from "./lib/hardRefresh";
import { initTelemetry } from "@platform/telemetry";

installApiFetchPatch();
initTelemetry({ enabled: import.meta.env.PROD });

function installClientSelfHeal() {
  if (!import.meta.env.PROD) return;
  if (typeof window === "undefined") return;

  const looksLikeStaleChunk = (message: unknown) => {
    const m = String((message as any)?.message || message || "").toLowerCase();
    return (
      m.includes("failed to fetch dynamically imported module") ||
      m.includes("chunkloaderror") ||
      m.includes("loading chunk") ||
      m.includes("importing a module script failed") ||
      (m.includes("expected a javascript module script") && m.includes("text/html"))
    );
  };

  window.addEventListener("vite:preloadError", () => {
    void hardRefreshOncePerSession({ reason: "vite_preload_error", maxAttempts: 3 });
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (!looksLikeStaleChunk((event as any)?.reason)) return;
    void hardRefreshOncePerSession({ reason: "unhandledrejection_chunk", maxAttempts: 3 });
  });

  window.addEventListener("error", (event) => {
    const anyEvent = event as any;
    if (!looksLikeStaleChunk(anyEvent?.error || anyEvent?.message)) return;
    void hardRefreshOncePerSession({ reason: "window_error_chunk", maxAttempts: 3 });
  });

  // Last-resort protection: if a CDN/proxy/browser served a stale client build, auto-heal to the current build.
  window.setTimeout(() => {
    try {
      const cfg = (window as any).__EXPORTUNITY_CONFIG__ || {};
      const clientBuildId = String(cfg.buildId || "").trim();
      if (!clientBuildId) return;

      fetch(`/api/system/version?v=${Date.now()}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((payload) => {
          const serverBuildId = String(payload?.buildId || "").trim();
          if (!serverBuildId || serverBuildId === clientBuildId) return;
          void hardRefreshOncePerSession({ reason: "build_mismatch", maxAttempts: 3 });
        })
        .catch(() => undefined);
    } catch {
      // ignore
    }
  }, 1500);
}

installClientSelfHeal();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TenantProvider>
          <LocaleProvider>
            <SessionProvider>
              <PwaInstallProvider>
                <TenantGuard>
                  <App />
                </TenantGuard>
                <Toaster />
              </PwaInstallProvider>
            </SessionProvider>
          </LocaleProvider>
        </TenantProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        // Deploy safety: check for a newer SW periodically so users don't stay on an old build for hours/days
        // just because they kept a tab open.
        const triggerUpdateCheck = () => {
          try {
            if (document.visibilityState && document.visibilityState !== "visible") return;
          } catch {
            // ignore
          }
          registration.update().catch(() => undefined);
        };

        triggerUpdateCheck();
        window.addEventListener("focus", triggerUpdateCheck);
        document.addEventListener("visibilitychange", triggerUpdateCheck);
        window.setInterval(triggerUpdateCheck, 2 * 60 * 1000);

        const autoApplyUpdate = () => {
          try {
            const key = "bdo_sw_autoupdate_at";
            const now = Date.now();
            const last = Number(sessionStorage.getItem(key) || "0");
            if (Number.isFinite(last) && now - last < 10_000) return; // avoid reload loops
            sessionStorage.setItem(key, String(now));

            const waiting = registration.waiting;
            if (!waiting) return;

            const onControllerChange = () => window.location.reload();
            navigator.serviceWorker.addEventListener("controllerchange", onControllerChange, { once: true });
            waiting.postMessage({ type: "SKIP_WAITING" });
          } catch {
            // ignore
          }
        };

        const notifyUpdate = () => {
          window.dispatchEvent(new CustomEvent("bdo-sw-update", { detail: { registration } }));
        };

        if (registration.waiting && navigator.serviceWorker.controller) {
          notifyUpdate();
          autoApplyUpdate();
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              notifyUpdate();
              autoApplyUpdate();
            }
          });
        });
      })
      .catch(() => {
        // Non-blocking: PWA is optional.
      });
  });
}
