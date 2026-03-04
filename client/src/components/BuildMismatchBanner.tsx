import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { resolveApiUrl } from "@/lib/runtimeConfig";

type BuildHealthPayload = {
  ok?: boolean;
  buildId?: string | null;
  gitSha?: string | null;
  deployedAt?: string | null;
};

type BuildJson = {
  buildId?: string | null;
  gitSha?: string | null;
};

function safeString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

export default function BuildMismatchBanner() {
  const session = useSession();
  const [mismatch, setMismatch] = useState<{
    reason: "mismatch" | "missing_client_meta" | "missing_build_json";
    serverBuildId: string | null;
    serverGitSha: string | null;
    clientBuildId: string | null;
    clientGitSha: string | null;
    servedBuildId: string | null;
    servedGitSha: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const cfg = (window as any).__EXPORTUNITY_CONFIG__ || {};
        const clientBuildId = safeString(cfg.buildId);
        const clientGitSha = safeString(cfg.gitSha);
        const hasClientMeta = !!clientBuildId && !!clientGitSha;

        const shouldCheckServedBuild = !import.meta.env.DEV;

        const versionHeaders: Record<string, string> = { "Cache-Control": "no-cache", Pragma: "no-cache" };
        if (session.token) versionHeaders.Authorization = `Bearer ${session.token}`;

        const [versionRes, buildRes] = await Promise.all([
          fetch(resolveApiUrl(`/api/health/build?v=${Date.now()}`), {
            cache: "no-store",
            headers: versionHeaders,
            credentials: "include",
          }),
          shouldCheckServedBuild
            ? fetch(`/build.json?v=${Date.now()}`, {
                cache: "no-store",
                headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
              })
            : Promise.resolve(null as Response | null),
        ]);

        if (!versionRes.ok) return;
        const payload = (await versionRes.json()) as BuildHealthPayload;
        const serverBuildId = safeString(payload.buildId);
        const serverGitSha = safeString(payload.gitSha);

        let servedBuildId: string | null = null;
        let servedGitSha: string | null = null;
        if (buildRes?.ok) {
          try {
            const buildJson = (await buildRes.json()) as BuildJson;
            servedBuildId = safeString(buildJson?.buildId);
            servedGitSha = safeString(buildJson?.gitSha);
          } catch {
            // ignore parse errors
          }
        }

        const idMismatch = hasClientMeta && !!serverBuildId && serverBuildId !== clientBuildId;
        const shaMismatch = hasClientMeta && !!serverGitSha && serverGitSha !== clientGitSha;
        const servedMismatch =
          shouldCheckServedBuild &&
          ((!!servedBuildId && !!serverBuildId && servedBuildId !== serverBuildId) ||
            (!!servedGitSha && !!serverGitSha && servedGitSha !== serverGitSha));

        if (cancelled) return;

        if (idMismatch || shaMismatch || servedMismatch) {
          setMismatch({
            reason: "mismatch",
            serverBuildId,
            serverGitSha,
            clientBuildId,
            clientGitSha,
            servedBuildId,
            servedGitSha,
          });
          return;
        }

        if (shouldCheckServedBuild && !buildRes?.ok && (serverBuildId || serverGitSha)) {
          setMismatch({
            reason: "missing_build_json",
            serverBuildId,
            serverGitSha,
            clientBuildId,
            clientGitSha,
            servedBuildId,
            servedGitSha,
          });
          return;
        }

        if (!hasClientMeta && (serverBuildId || serverGitSha)) {
          // Don't force-reload here; missing client meta is usually a deep-link cache issue.
          setMismatch({
            reason: "missing_client_meta",
            serverBuildId,
            serverGitSha,
            clientBuildId,
            clientGitSha,
            servedBuildId,
            servedGitSha,
          });
          return;
        }

        setMismatch(null);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session.token]);

  const cacheResetUrl = useMemo(() => {
    if (typeof window === "undefined") return "/api/system/cache-reset";
    return new URL("/api/system/cache-reset", window.location.origin).toString();
  }, []);

  useEffect(() => {
    if (!mismatch) return;
    if (mismatch.reason !== "mismatch") return;
    if (import.meta.env.DEV) return;

    // Auto-fix at most once per session to avoid loops.
    const key = "bdo_build_mismatch_attempts";
    const attempts = Number(sessionStorage.getItem(key) || "0");
    if (Number.isFinite(attempts) && attempts >= 1) return;
    sessionStorage.setItem(key, String(attempts + 1));

    const hardRefresh = async () => {
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

      const url = new URL(window.location.href);
      url.searchParams.set("v", String(Date.now()));
      window.location.replace(url.toString());
    };

    void hardRefresh();
  }, [mismatch]);

  if (!mismatch) return null;

  const canShowBanner = (() => {
    if (import.meta.env.DEV) return true;
    return (
      session.isAuthenticated &&
      (session.hasPermission("*") || session.hasRole("admin") || session.hasRole("chairman_assistant"))
    );
  })();

  // Always self-heal in the background, but don't disrupt normal users with a banner.
  if (!canShowBanner) return null;

  return (
    <div className="pointer-events-none relative z-[40] px-3 pt-safe" data-testid="build-mismatch-banner">
      <div className="pointer-events-auto mx-auto max-w-2xl rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-white shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-amber-200">
              {mismatch.reason === "mismatch"
                ? "Client build mismatch - refreshing..."
                : mismatch.reason === "missing_build_json"
                  ? "build.json missing (deploy stamp required)"
                  : "Client version info missing"}
            </div>
            <div className="text-[11px] text-white/70 mt-0.5">
              server {mismatch.serverGitSha ?? "?"}/{mismatch.serverBuildId ?? "?"} - client{" "}
              {mismatch.clientGitSha ?? "?"}/{mismatch.clientBuildId ?? "?"}
              {mismatch.servedBuildId || mismatch.servedGitSha ? (
                <span>
                  {" "}
                  - build.json {mismatch.servedGitSha ?? "?"}/{mismatch.servedBuildId ?? "?"}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              className="bg-white/10 hover:bg-white/15 text-white border border-white/10"
              onClick={() => window.location.assign(cacheResetUrl)}
            >
              Reset cache
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-white/15 text-white/80 hover:bg-white/10"
              onClick={() => setMismatch(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

