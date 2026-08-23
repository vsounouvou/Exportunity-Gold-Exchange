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
  if (typeof window === "undefined") return "Exportunity";
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
  const configuredName = String(
    (window as any)?.__EXPORTUNITY_CONFIG__?.brandName ||
      (window as any)?.__EXPORTUNITY_CONFIG__?.tenantName ||
      "",
  ).trim();
  return configuredName || "Platform";
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
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F7F8FA] p-6 text-[#07111F]">
        <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:38px_38px]" />
        <div className="relative w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.16)] sm:p-8">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#9A6200]">Global Trade Network</div>
          <h1 className="mt-3 text-2xl font-black tracking-tight">{brandName} encountered an error</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            A client-side error prevented the page from rendering. The details below help us fix it fast.
          </p>
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            {route ? (
              <div className="break-words text-[11px] text-slate-600">
                <span className="text-slate-400">Route:</span> {route}
              </div>
            ) : null}
            <div className="mt-3 text-xs font-black uppercase tracking-wider text-slate-400">Error</div>
            <div className="mt-1 break-words text-sm text-slate-800">{this.state.message}</div>
            {this.state.stack ? (
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-[11px] text-slate-500">
                {this.state.stack}
              </pre>
            ) : null}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              className="inline-flex items-center justify-center rounded-xl bg-[#F5A623] px-4 py-2 text-sm font-black text-[#07111F] hover:bg-[#F8C45B]"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
            <button
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-[#F5A623] hover:text-slate-950"
              onClick={() => {
                void copyToClipboard(debugText);
              }}
            >
              Copy error details
            </button>
            {canResetCache ? (
              <button
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-[#F5A623] hover:text-slate-950"
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
