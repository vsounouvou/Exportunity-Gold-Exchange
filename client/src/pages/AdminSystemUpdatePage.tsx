import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, RefreshCw, Trash2, Copy } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { getApiBaseUrl } from "@/lib/runtimeConfig";

type SystemVersion = {
  ok: boolean;
  serverTime: string;
  nodeEnv: string;
  nodeVersion: string;
  gitSha: string | null;
  buildId: string | null;
  client?: ClientFingerprint | null;
};

type ClientFingerprint = {
  ok?: boolean;
  message?: string;
  indexHtml?: { size: number | null; mtime: string | null };
  mainJs?: { path: string | null; size: number | null; mtime: string | null };
  mainCss?: { path: string | null; size: number | null; mtime: string | null };
  sw?: { version: string | null; mtime: string | null; size: number | null };
  config?: { mtime: string | null; size: number | null; build?: { buildId?: string | null; buildTime?: string | null; gitSha?: string | null } };
  build?: { buildId?: string | null; buildTime?: string | null; gitSha?: string | null; mainJs?: any; mainCss?: any; sw?: string | null };
};

type WhoAmI = {
  host: string | null;
  forwardedHost: string | null;
  forwardedProto: string | null;
  hostname: string | null;
  tenantKey: string | null;
  displayName: string | null;
};

type Diagnostics = {
  swVersion: string | null;
  swControllerUrl: string | null;
  swRegistrations: string[];
  bundleScripts: string[];
  caches: string[];
  systemVersion: SystemVersion | null;
  whoami: WhoAmI | null;
  apiBaseUrl: string | null;
};

async function fetchSwVersion(): Promise<string | null> {
  try {
    const text = await fetch("/sw.js", { cache: "no-store" }).then((r) => r.text());
    const match = text.match(/const\\s+VERSION\\s*=\\s*\"([^\"]+)\"/);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

async function fetchWhoami(): Promise<WhoAmI | null> {
  try {
    const res = await fetch("/api/whoami", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as WhoAmI;
    return data || null;
  } catch {
    return null;
  }
}

async function fetchSystemVersion(): Promise<SystemVersion | null> {
  try {
    const data = (await apiRequest("/api/system/version", { method: "GET" })) as SystemVersion;
    if (!data?.ok) return null;
    return data;
  } catch {
    return null;
  }
}

export default function AdminSystemUpdatePage() {
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [demoUrl, setDemoUrl] = useState<string | null>(null);
  const [demoExpiresAt, setDemoExpiresAt] = useState<string | null>(null);
  const [demoEmailStatus, setDemoEmailStatus] = useState<string | null>(null);
  const [diag, setDiag] = useState<Diagnostics>({
    swVersion: null,
    swControllerUrl: null,
    swRegistrations: [],
    bundleScripts: [],
    caches: [],
    systemVersion: null,
    whoami: null,
    apiBaseUrl: null,
  });

  const load = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const swControllerUrl = navigator.serviceWorker?.controller?.scriptURL || null;
      const swRegistrations = navigator.serviceWorker?.getRegistrations
        ? (await navigator.serviceWorker.getRegistrations())
            .map((r) => r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "")
            .filter(Boolean)
        : [];

      const bundleScripts = Array.from(document.querySelectorAll("script[src]"))
        .map((el) => (el as HTMLScriptElement).src)
        .filter(Boolean);

      const cachesList = "caches" in window ? await caches.keys() : [];
      const apiBaseUrl = getApiBaseUrl();

      const [swVersion, whoami, systemVersion] = await Promise.all([
        fetchSwVersion(),
        fetchWhoami(),
        fetchSystemVersion(),
      ]);

      setDiag({
        swVersion,
        swControllerUrl,
        swRegistrations,
        bundleScripts,
        caches: cachesList,
        systemVersion,
        whoami,
        apiBaseUrl,
      });
    } catch (err: any) {
      setMessage(err?.message || "Failed to load diagnostics");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const debugPayload = useMemo(
    () =>
      JSON.stringify(
        {
          time: new Date().toISOString(),
          location: window.location.href,
          swVersion: diag.swVersion,
          swControllerUrl: diag.swControllerUrl,
          swRegistrations: diag.swRegistrations,
          bundleScripts: diag.bundleScripts,
          caches: diag.caches,
          whoami: diag.whoami,
          systemVersion: diag.systemVersion,
          apiBaseUrl: diag.apiBaseUrl,
        },
        null,
        2,
      ),
    [diag]
  );

  const copyDebug = async () => {
    try {
      await navigator.clipboard.writeText(debugPayload);
      setMessage("Copied diagnostics to clipboard.");
    } catch {
      setMessage("Copy failed.");
    }
  };

  const resetNow = () => {
    const base = diag.apiBaseUrl;
    if (!base) {
      window.location.assign("/api/system/cache-reset");
      return;
    }

    try {
      const apiOrigin = new URL(base).origin;
      if (apiOrigin === window.location.origin) {
        window.location.assign("/api/system/cache-reset");
        return;
      }
    } catch {
      // ignore
    }

    // App is hosted separately (e.g. static hosting). Reset caches on the current origin.
    window.location.assign("/reset.html");
  };

  const generateCadastreDemoLink = async () => {
    setDemoBusy(true);
    setMessage(null);
    try {
      const data = await apiRequest("/api/admin/demo-links", "POST", {
        label: `CEO cadastre demo ${new Date().toISOString().slice(0, 10)}`,
        expires_in_hours: 48,
        scopes: ["cadastre:read", "opportunities:read"],
        send_to: "vs@exportunity.com",
        email: true,
      });

      const url = String(data?.url || "").trim();
      if (!url) throw new Error("Demo link was not returned");
      setDemoUrl(url);
      setDemoExpiresAt(String(data?.expires_at || ""));
      setDemoEmailStatus(String(data?.email?.status || "unknown"));
      setMessage("Cadastre demo link generated.");
    } catch (err: any) {
      setMessage(err?.message || "Failed to generate demo link");
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">Admin &gt; System &gt; Update &amp; Cache Reset</h1>
        <div className="text-sm text-gray-400">
          If you can’t see recent changes, use the reset button below to clear cached app files and reload the latest version.
        </div>
      </div>

      {message && (
        <div className="text-sm text-gray-200 bg-slate-900/60 border border-slate-800 rounded-lg p-3">{message}</div>
      )}

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center justify-between gap-3">
            <span>Quick actions</span>
            <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30">Safe</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
              onClick={resetNow}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Reset cache &amp; reload
            </Button>
            <Button
              variant="secondary"
              className="bg-white/10 hover:bg-white/15 text-white border border-white/10"
              onClick={() => load()}
              disabled={busy}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${busy ? "animate-spin" : ""}`} />
              Refresh diagnostics
            </Button>
            <Button
              variant="secondary"
              className="bg-white/10 hover:bg-white/15 text-white border border-white/10"
              onClick={copyDebug}
              disabled={busy}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy diagnostics
            </Button>
            <Button
              variant="secondary"
              className="bg-white/10 hover:bg-white/15 text-white border border-white/10"
              onClick={() => window.open("/qa-mobile", "_blank")}
              disabled={busy}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open QA page
            </Button>
            <Button
              variant="secondary"
              className="bg-white/10 hover:bg-white/15 text-white border border-white/10"
              onClick={() => window.location.assign("/admin/settings/developer")}
              disabled={busy}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Voice Debug
            </Button>
            <Button
              variant="secondary"
              className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 border border-emerald-500/40"
              onClick={generateCadastreDemoLink}
              disabled={busy || demoBusy}
            >
              <ExternalLink className={`h-4 w-4 mr-2 ${demoBusy ? "animate-pulse" : ""}`} />
              {demoBusy ? "Generating demo link..." : "Generate Cadastre Demo Link"}
            </Button>
          </div>
          <div className="text-xs text-gray-500">
            Reset will log you out (cookies/storage cleared). It fixes stuck updates when Ctrl+F5 does not.
          </div>
          {demoUrl ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-100 space-y-2">
              <div className="font-medium">Latest cadastre demo link</div>
              <div className="break-all">{demoUrl}</div>
              <div className="text-emerald-200/90">
                Expires: {demoExpiresAt ? new Date(demoExpiresAt).toLocaleString() : "n/a"} | Email: {demoEmailStatus || "n/a"}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="bg-emerald-500 hover:bg-emerald-600 text-black"
                  onClick={() => window.open(demoUrl, "_blank")}
                >
                  Open demo
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-white/10 hover:bg-white/15 text-white border border-white/10"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(demoUrl);
                      setMessage("Demo URL copied.");
                    } catch {
                      setMessage("Failed to copy demo URL.");
                    }
                  }}
                >
                  Copy URL
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Service Worker</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-300 space-y-1">
            <div>
              sw version: <span className="text-gray-200">{diag.swVersion ?? "—"}</span>
            </div>
            <div className="break-all">
              controller: <span className="text-gray-200">{diag.swControllerUrl ?? "—"}</span>
            </div>
            <div className="break-all">
              registrations:{" "}
              <span className="text-gray-200">{diag.swRegistrations.length ? diag.swRegistrations.join(" | ") : "—"}</span>
            </div>
            <div className="break-all">
              caches: <span className="text-gray-200">{diag.caches.length ? diag.caches.join(" | ") : "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Loaded client bundle</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-300 space-y-1">
            <div className="break-all">
              scripts:{" "}
              <span className="text-gray-200">
                {diag.bundleScripts.length ? diag.bundleScripts.join(" | ") : "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Client build (server)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-300 space-y-1">
            <div>
              build id: <span className="text-gray-200">{diag.systemVersion?.client?.build?.buildId ?? "-"}</span>
            </div>
            <div>
              built at: <span className="text-gray-200">{diag.systemVersion?.client?.build?.buildTime ?? "-"}</span>
            </div>
            <div className="break-all">
              git sha: <span className="text-gray-200">{diag.systemVersion?.client?.build?.gitSha ?? "-"}</span>
            </div>
            <div className="break-all">
              main js:{" "}
              <span className="text-gray-200">{diag.systemVersion?.client?.mainJs?.path ?? "-"}</span>
            </div>
            <div className="break-all">
              main css:{" "}
              <span className="text-gray-200">{diag.systemVersion?.client?.mainCss?.path ?? "-"}</span>
            </div>
            <div className="break-all">
              sw version: <span className="text-gray-200">{diag.systemVersion?.client?.sw?.version ?? "-"}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Server version</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-300 space-y-1">
            <div>
              server time: <span className="text-gray-200">{diag.systemVersion?.serverTime ?? "—"}</span>
            </div>
            <div>
              node: <span className="text-gray-200">{diag.systemVersion?.nodeVersion ?? "—"}</span>
            </div>
            <div>
              env: <span className="text-gray-200">{diag.systemVersion?.nodeEnv ?? "—"}</span>
            </div>
            <div className="break-all">
              build id: <span className="text-gray-200">{diag.systemVersion?.buildId ?? "—"}</span>
            </div>
            <div className="break-all">
              git sha: <span className="text-gray-200">{diag.systemVersion?.gitSha ?? "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Tenant</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-300 space-y-1">
            <div className="break-all">
              host: <span className="text-gray-200">{diag.whoami?.host ?? "—"}</span>
            </div>
            <div className="break-all">
              tenant: <span className="text-gray-200">{diag.whoami?.displayName ?? diag.whoami?.tenantKey ?? "—"}</span>
            </div>
            <div className="break-all">
              forwarded host: <span className="text-gray-200">{diag.whoami?.forwardedHost ?? "—"}</span>
            </div>
            <div className="break-all">
              forwarded proto: <span className="text-gray-200">{diag.whoami?.forwardedProto ?? "—"}</span>
            </div>
            <div className="break-all">
              api base: <span className="text-gray-200">{diag.apiBaseUrl ?? "(same origin)"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Raw diagnostics</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs text-gray-200 bg-black/40 border border-white/10 rounded-lg p-3 overflow-auto max-h-[360px]">
            {debugPayload}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
