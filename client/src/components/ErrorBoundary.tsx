import React from "react";
import { hardRefreshOncePerSession } from "@/lib/hardRefresh";

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
  stack: string | null;
};

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.top = "0";
      textarea.style.left = "0";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}

function isLikelyChunkLoadError(message: string) {
  const m = String(message || "").toLowerCase();
  return (
    m.includes("failed to fetch dynamically imported module") ||
    m.includes("chunkloaderror") ||
    m.includes("loading chunk") ||
    m.includes("importing a module script failed") ||
    (m.includes("expected a javascript module script") && m.includes("text/html"))
  );
}

function cacheResetUrl() {
  if (typeof window === "undefined") return "/api/system/cache-reset";
  return new URL("/api/system/cache-reset", window.location.origin).toString();
}

function resolveBrandName() {
  if (typeof window === "undefined") return "Bourse de l'Or";
  const host = window.location.hostname.toLowerCase();
  if (
    host === "exportunity.com" ||
    host === "www.exportunity.com" ||
    host === "exportunity.net" ||
    host === "www.exportunity.net" ||
    host.endsWith(".exportunity.net")
  ) {
    return "Exportunity";
  }
  return "Bourse de l'Or";
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: "", stack: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || "Unexpected error",
      stack: null,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ui] crash", error, info);
    const message = error?.message || "Unexpected error";
    const errorStack = typeof error?.stack === "string" ? error.stack : null;
    const componentStack = info?.componentStack || null;
    const combined = [errorStack, componentStack].filter(Boolean).join("\n\n");
    this.setState({ message, stack: combined || null });

    if (isLikelyChunkLoadError(message)) {
      void hardRefreshOncePerSession({ reason: "chunk_load_error", maxAttempts: 3 });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const brandName = resolveBrandName();
    const canResetCache = isLikelyChunkLoadError(this.state.message);
    const route = typeof window === "undefined" ? "" : `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const buildId =
      typeof window === "undefined" ? "" : String((window as any)?.__EXPORTUNITY_CONFIG__?.buildId || "").trim();
    const debugText = [
      `brand=${brandName}`,
      route ? `route=${route}` : null,
      buildId ? `buildId=${buildId}` : null,
      `message=${this.state.message}`,
      this.state.stack ? `stack:\n${this.state.stack}` : null,
      typeof navigator !== "undefined" ? `ua=${navigator.userAgent}` : null,
      `ts=${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
          <h1 className="text-xl font-semibold">{brandName} encountered an error</h1>
          <p className="text-sm text-white/70 mt-2">
            A client-side error prevented the page from rendering. The details below help us fix it fast.
          </p>
          <div className="mt-4 rounded-xl bg-black/60 border border-white/10 p-4">
            {route ? (
              <div className="text-[11px] text-white/60 break-words">
                <span className="text-white/50">Route:</span> {route}
              </div>
            ) : null}
            <div className="text-xs uppercase tracking-wider text-white/50">Error</div>
            <div className="text-sm mt-1 break-words">{this.state.message}</div>
            {this.state.stack ? (
              <pre className="mt-3 text-[11px] text-white/60 whitespace-pre-wrap">
                {this.state.stack}
              </pre>
            ) : null}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              className="inline-flex items-center justify-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-600"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
            <button
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/15"
              onClick={() => {
                void copyToClipboard(debugText);
              }}
            >
              Report to Codex
            </button>
            {canResetCache ? (
              <button
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/15"
                onClick={() => window.location.assign(cacheResetUrl())}
              >
                Reset cache
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
}
