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
import { initTelemetry } from "@platform/telemetry";
import { recoverFromStaleClient, runVersionGuardOnce } from "./system/versionGuard";
import { registerServiceWorkerWithAutoUpgrade } from "./system/swRegistration";

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
    void recoverFromStaleClient("vite_preload_error");
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (!looksLikeStaleChunk((event as any)?.reason)) return;
    void recoverFromStaleClient("unhandledrejection_chunk");
  });

  window.addEventListener("error", (event) => {
    const anyEvent = event as any;
    if (!looksLikeStaleChunk(anyEvent?.error || anyEvent?.message)) return;
    void recoverFromStaleClient("window_error_chunk");
  });

  void runVersionGuardOnce();

  // Last-resort protection: if a CDN/proxy/browser served a stale client build, auto-heal to the current build.
  window.setTimeout(() => {
    void runVersionGuardOnce();
  }, 1500);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    void runVersionGuardOnce();
  });

  window.addEventListener("focus", () => {
    void runVersionGuardOnce();
  });
}

installClientSelfHeal();
registerServiceWorkerWithAutoUpgrade();

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
