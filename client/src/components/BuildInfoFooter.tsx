import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useSession } from "@/lib/session";
import { resolveApiUrl } from "@/lib/runtimeConfig";

type BuildHealthPayload = {
  ok: boolean;
  buildId?: string | null;
  gitSha?: string | null;
  deployedAt?: string | null;
  serverTime?: string | null;
  nodeEnv?: string | null;
  clientBuild?: { buildId?: string | null; gitSha?: string | null; builtAt?: string | null } | null;
};

function safeString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

export default function BuildInfoFooter() {
  const session = useSession();
  const [location] = useLocation();
  const pathname = useMemo(() => String(location || "/").split("?")[0] || "/", [location]);

  const isDiagnosticsRoute = useMemo(() => {
    if (typeof window === "undefined") return false;
    if (import.meta.env.DEV) return true;

    // Hide build metadata by default in production to avoid leaking internal versioning
    // to general users/screenshots. Enable on-demand with `?build=1`.
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("build") === "1") return true;
    } catch {
      // ignore
    }

    return false;
  }, [pathname]);

  const canShowBuildInfo = isDiagnosticsRoute && (() => {
    if (import.meta.env.DEV) return true;
    if (!session.isAuthenticated) return false;
    const roles = session.user?.roles ?? [];
    return roles.includes("admin") || roles.includes("chairman_assistant");
  })();

  const [serverBuild, setServerBuild] = useState<BuildHealthPayload | null>(null);

  useEffect(() => {
    if (!canShowBuildInfo) return;

    let cancelled = false;
    (async () => {
      try {
        const headers: Record<string, string> = { "Cache-Control": "no-cache", Pragma: "no-cache" };
        if (session.token) headers.Authorization = `Bearer ${session.token}`;

        const res = await fetch(resolveApiUrl(`/api/health/build?v=${Date.now()}`), {
          cache: "no-store",
          headers,
          credentials: "include",
        });
        if (!res.ok) return;
        const payload = (await res.json()) as BuildHealthPayload;
        if (cancelled) return;
        setServerBuild(payload);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canShowBuildInfo, session.token]);

  const clientMeta = useMemo(() => {
    const cfg = (window as any).__EXPORTUNITY_CONFIG__ || {};
    return {
      buildId: safeString(cfg.buildId),
      gitSha: safeString(cfg.gitSha),
      builtAt: safeString(cfg.builtAt),
    };
  }, []);

  const serverMeta = useMemo(() => {
    return {
      buildId: safeString(serverBuild?.buildId),
      gitSha: safeString(serverBuild?.gitSha),
      deployedAt: safeString(serverBuild?.deployedAt),
    };
  }, [serverBuild]);

  if (!canShowBuildInfo) return null;

  const mismatch =
    !!serverMeta.buildId &&
    !!clientMeta.buildId &&
    serverMeta.buildId !== clientMeta.buildId &&
    serverMeta.buildId !== "unknown" &&
    clientMeta.buildId !== "unknown";

  return (
    <div className="fixed bottom-0 left-0 z-[9997] pb-safe px-3 py-2 pointer-events-none">
      <div className="pointer-events-auto rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl px-3 py-2 text-[11px] text-white/80 shadow-2xl">
        <div className="flex items-center gap-2">
          <span className={mismatch ? "text-amber-200 font-semibold" : "text-white/80 font-medium"}>
            Build
          </span>
          <span className="text-white/60">server</span>
          <span className="font-mono text-white/80">
            {serverMeta.gitSha ?? "?"}/{serverMeta.buildId ?? "?"}
          </span>
          {serverMeta.deployedAt ? (
            <>
              <span className="text-white/40">·</span>
              <span className="text-white/60">deployed</span>
              <span className="font-mono text-white/70">{new Date(serverMeta.deployedAt).toISOString()}</span>
            </>
          ) : null}
        </div>
        <div className="mt-0.5 text-white/55">
          client{" "}
          <span className="font-mono">
            {clientMeta.gitSha ?? "?"}/{clientMeta.buildId ?? "?"}
          </span>
          {clientMeta.builtAt ? (
            <>
              <span className="text-white/35"> · </span>
              built <span className="font-mono">{new Date(clientMeta.builtAt).toISOString()}</span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
