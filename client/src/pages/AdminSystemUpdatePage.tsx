import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Copy,
  ExternalLink,
  Mic2,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { getApiBaseUrl } from "@/lib/runtimeConfig";

type ClientFingerprint = {
  mainJs?: { path?: string | null; size?: number | null; mtime?: string | null } | null;
  mainCss?: { path?: string | null; size?: number | null; mtime?: string | null } | null;
  sw?: { version?: string | null; mtime?: string | null; size?: number | null } | null;
  build?: {
    buildId?: string | null;
    buildTime?: string | null;
    gitSha?: string | null;
  } | null;
};

type SystemVersion = {
  ok: boolean;
  serverTime: string;
  nodeEnv: string;
  nodeVersion: string;
  gitSha: string | null;
  buildId: string | null;
  client?: ClientFingerprint | null;
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

type TranscriptionJob = {
  id: number;
  status: "SUCCESS" | "FAILED";
  provider: string | null;
  durationMs: number;
  errorCode: string | null;
  createdAt: string | null;
  userName: string | null;
};

type SystemTab = "overview" | "diagnostics" | "voice";

const EMPTY_DIAGNOSTICS: Diagnostics = {
  swVersion: null,
  swControllerUrl: null,
  swRegistrations: [],
  bundleScripts: [],
  caches: [],
  systemVersion: null,
  whoami: null,
  apiBaseUrl: null,
};

function initialSystemTab(): SystemTab {
  if (typeof window === "undefined") return "overview";
  const requested = new URLSearchParams(window.location.search).get("view");
  return requested === "diagnostics" || requested === "voice" ? requested : "overview";
}

function redactDiagnosticText(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return "Not reported";
  return text
    .replace(/\b(authorization)(\s*[:=]\s*)(?:(?:Bearer|Basic)\s+)?[^\s,;]+/gi, "$1$2[REDACTED]")
    .replace(/\b(api[-_]?key|secret|token|password|cookie|pin|cvv|cvc)(\s*[:=]\s*)[^\s,;]+/gi, "$1$2[REDACTED]")
    .replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, "$1 [REDACTED]");
}

function publicUrl(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "Not reported";
  try {
    const base = typeof window === "undefined" ? "https://exportunity.invalid" : window.location.origin;
    const parsed = new URL(raw, base);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.origin === base ? parsed.pathname : `${parsed.origin}${parsed.pathname}`;
  } catch {
    return redactDiagnosticText(raw.split(/[?#]/)[0]);
  }
}

function assetName(value?: string | null) {
  const normalized = String(value || "").replace(/\\/g, "/").split(/[?#]/)[0];
  return normalized.split("/").filter(Boolean).pop() || "Not reported";
}

function dateLabel(value?: string | null) {
  if (!value) return "Not reported";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not reported" : parsed.toLocaleString();
}

async function fetchSwVersion(): Promise<string | null> {
  try {
    const response = await fetch("/sw.js", { cache: "no-store" });
    if (!response.ok) return null;
    const text = await response.text();
    return text.match(/const\s+VERSION\s*=\s*["']([^"']+)["']/)?.[1] || null;
  } catch {
    return null;
  }
}

async function fetchWhoami(): Promise<WhoAmI | null> {
  try {
    return (await apiRequest("/api/whoami", "GET")) as WhoAmI;
  } catch {
    return null;
  }
}

async function fetchSystemVersion(): Promise<SystemVersion | null> {
  try {
    const data = (await apiRequest("/api/system/version", "GET")) as SystemVersion;
    return data?.ok ? data : null;
  } catch {
    return null;
  }
}

export default function AdminSystemUpdatePage() {
  const [activeTab, setActiveTab] = useState<SystemTab>(initialSystemTab);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [diag, setDiag] = useState<Diagnostics>(EMPTY_DIAGNOSTICS);

  const voiceJobsQuery = useQuery<{ jobs: TranscriptionJob[] }>({
    queryKey: ["/api/admin/transcription-jobs?limit=20"],
    enabled: activeTab === "voice",
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  const load = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const swControllerUrl = publicUrl(navigator.serviceWorker?.controller?.scriptURL || null);
      const swRegistrations = navigator.serviceWorker?.getRegistrations
        ? (await navigator.serviceWorker.getRegistrations())
            .map((registration) =>
              publicUrl(
                registration.active?.scriptURL ||
                  registration.installing?.scriptURL ||
                  registration.waiting?.scriptURL ||
                  null,
              ),
            )
            .filter((value) => value !== "Not reported")
        : [];
      const bundleScripts = Array.from(document.querySelectorAll("script[src]"))
        .map((element) => publicUrl((element as HTMLScriptElement).src))
        .filter((value) => value !== "Not reported");
      const cachesList = "caches" in window ? (await caches.keys()).map((value) => redactDiagnosticText(value)) : [];
      const [swVersion, whoami, systemVersion] = await Promise.all([
        fetchSwVersion(),
        fetchWhoami(),
        fetchSystemVersion(),
      ]);

      setDiag({
        swVersion,
        swControllerUrl: swControllerUrl === "Not reported" ? null : swControllerUrl,
        swRegistrations,
        bundleScripts,
        caches: cachesList,
        systemVersion,
        whoami,
        apiBaseUrl: getApiBaseUrl() || null,
      });
    } catch (error: any) {
      setMessage(redactDiagnosticText(error?.message || "Diagnostics could not be loaded."));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const debugPayload = useMemo(() => {
    const version = diag.systemVersion;
    return JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        page: typeof window === "undefined" ? "/admin/system/update" : window.location.pathname,
        serviceWorker: {
          version: diag.swVersion,
          controller: diag.swControllerUrl,
          registrations: diag.swRegistrations,
          caches: diag.caches,
        },
        clientScripts: diag.bundleScripts,
        tenant: diag.whoami,
        apiOrigin: publicUrl(diag.apiBaseUrl),
        release: version
          ? {
              serverTime: version.serverTime,
              nodeEnv: version.nodeEnv,
              nodeVersion: version.nodeVersion,
              gitSha: version.gitSha,
              buildId: version.buildId,
              client: {
                buildId: version.client?.build?.buildId || null,
                buildTime: version.client?.build?.buildTime || null,
                gitSha: version.client?.build?.gitSha || null,
                mainJs: assetName(version.client?.mainJs?.path),
                mainCss: assetName(version.client?.mainCss?.path),
                serviceWorker: version.client?.sw?.version || null,
              },
            }
          : null,
      },
      null,
      2,
    );
  }, [diag]);

  const copyDebug = async () => {
    try {
      await navigator.clipboard.writeText(debugPayload);
      setMessage("Sanitized diagnostics copied.");
    } catch {
      setMessage("Diagnostics could not be copied.");
    }
  };

  const resetNow = () => {
    const confirmed = window.confirm(
      "Reset this browser's Exportunity cache and reload? This clears local session data and signs you out, but does not change server or database records.",
    );
    if (!confirmed) return;

    const base = diag.apiBaseUrl;
    if (!base) {
      window.location.assign("/api/system/cache-reset");
      return;
    }
    try {
      if (new URL(base).origin === window.location.origin) {
        window.location.assign("/api/system/cache-reset");
        return;
      }
    } catch {
      // A malformed runtime base must not bypass the same-origin reset fallback.
    }
    window.location.assign("/reset.html");
  };

  const jobs = Array.isArray(voiceJobsQuery.data?.jobs) ? voiceJobsQuery.data!.jobs : [];
  const tenantLabel = diag.whoami?.displayName || diag.whoami?.tenantKey || "Not reported";
  const clientBuild = diag.systemVersion?.client?.build;
  const releaseLabel = clientBuild?.buildId || diag.systemVersion?.buildId || "Not reported";

  return (
    <div data-testid="exportunity-system-hub" className="min-h-full bg-[#f7f8fa] text-slate-950 dark:bg-[#07121f] dark:text-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-[#9a6200] dark:text-[#f5a623]">
              <Server className="h-4 w-4" /> Platform operations
            </div>
            <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">System hub</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
              Release identity, tenant routing, local client health, and on-demand operational diagnostics for Exportunity.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={busy ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-800"}>
              <Activity className={`mr-1.5 h-3.5 w-3.5 ${busy ? "animate-pulse" : ""}`} /> {busy ? "Reading status" : "Status ready"}
            </Badge>
            <Button variant="outline" className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-transparent dark:text-white" onClick={() => window.location.assign("/admin/exportunity/integrations")}>
              <ExternalLink className="mr-2 h-4 w-4" /> Integrations
            </Button>
            <Button className="bg-[#f5a623] text-[#07121f] hover:bg-[#e59a18]" onClick={() => void load()} disabled={busy}>
              <RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </header>

        {message ? (
          <div className="mt-4 border-l-4 border-[#f5a623] bg-white px-4 py-3 text-sm text-slate-700 shadow-sm dark:bg-[#0a1628] dark:text-slate-200">
            {message}
          </div>
        ) : null}

        <section className="mt-5 grid grid-cols-2 gap-px overflow-hidden border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 lg:grid-cols-4">
          {[
            { label: "Tenant", value: tenantLabel, Icon: ShieldCheck },
            { label: "Release", value: releaseLabel, Icon: Server },
            { label: "Client SW", value: diag.swVersion || diag.systemVersion?.client?.sw?.version || "Not reported", Icon: Activity },
            { label: "Voice records", value: activeTab === "voice" && !voiceJobsQuery.isLoading ? String(jobs.length) : "On demand", Icon: Mic2 },
          ].map(({ label, value, Icon }) => (
            <div key={label} className="min-w-0 bg-white px-4 py-4 dark:bg-[#0a1628]">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400"><Icon className="h-4 w-4" /> {label}</div>
              <div className="mt-1 truncate text-lg font-semibold" title={value}>{value}</div>
            </div>
          ))}
        </section>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SystemTab)} className="mt-6">
          <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border-b border-slate-200 bg-transparent p-0 dark:border-slate-800">
            {[
              ["overview", "Overview"],
              ["diagnostics", "Diagnostics"],
              ["voice", "Voice health"],
            ].map(([value, label]) => (
              <TabsTrigger key={value} value={value} className="rounded-none border-b-2 border-transparent px-3 py-3 text-xs text-slate-500 data-[state=active]:border-[#f5a623] data-[state=active]:bg-transparent data-[state=active]:text-slate-950 dark:text-slate-400 dark:data-[state=active]:text-white sm:px-4 sm:text-sm">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0a1628]">
                <h2 className="text-sm font-semibold">Release identity</h2>
                <dl className="mt-4 grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-3 text-sm">
                  <dt className="text-slate-500">Client build</dt><dd className="break-words font-medium">{clientBuild?.buildId || "Not reported"}</dd>
                  <dt className="text-slate-500">Built at</dt><dd>{dateLabel(clientBuild?.buildTime)}</dd>
                  <dt className="text-slate-500">Client SHA</dt><dd className="break-all font-mono text-xs">{clientBuild?.gitSha || "Not reported"}</dd>
                  <dt className="text-slate-500">Server build</dt><dd className="break-words">{diag.systemVersion?.buildId || "Not reported"}</dd>
                  <dt className="text-slate-500">Server SHA</dt><dd className="break-all font-mono text-xs">{diag.systemVersion?.gitSha || "Not reported"}</dd>
                </dl>
              </section>
              <section className="border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0a1628]">
                <h2 className="text-sm font-semibold">Tenant boundary</h2>
                <dl className="mt-4 grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-3 text-sm">
                  <dt className="text-slate-500">Tenant</dt><dd className="font-medium">{tenantLabel}</dd>
                  <dt className="text-slate-500">Key</dt><dd>{diag.whoami?.tenantKey || "Not reported"}</dd>
                  <dt className="text-slate-500">Host</dt><dd className="break-all">{redactDiagnosticText(diag.whoami?.host)}</dd>
                  <dt className="text-slate-500">Protocol</dt><dd>{diag.whoami?.forwardedProto || window.location.protocol.replace(":", "")}</dd>
                  <dt className="text-slate-500">API origin</dt><dd className="break-all">{publicUrl(diag.apiBaseUrl)}</dd>
                </dl>
              </section>
              <section className="border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0a1628]">
                <h2 className="text-sm font-semibold">Local client</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">These values describe only this browser and the currently loaded Exportunity artifact.</p>
                <dl className="mt-4 grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-3 text-sm">
                  <dt className="text-slate-500">Controller</dt><dd className="break-all">{diag.swControllerUrl || "Not reported"}</dd>
                  <dt className="text-slate-500">Registrations</dt><dd>{diag.swRegistrations.length}</dd>
                  <dt className="text-slate-500">Cache sets</dt><dd>{diag.caches.length}</dd>
                  <dt className="text-slate-500">Main script</dt><dd>{assetName(diag.systemVersion?.client?.mainJs?.path)}</dd>
                  <dt className="text-slate-500">Main style</dt><dd>{assetName(diag.systemVersion?.client?.mainCss?.path)}</dd>
                </dl>
              </section>
              <section className="border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0a1628]">
                <h2 className="text-sm font-semibold">Operator controls</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Local cache reset does not change server or database records. It clears this browser's session and signs you out.</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button variant="outline" className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-transparent dark:text-white" onClick={() => void copyDebug()}>
                    <Copy className="mr-2 h-4 w-4" /> Copy sanitized diagnostics
                  </Button>
                  <Button variant="outline" className="border-red-300 bg-white text-red-800 hover:bg-red-50 dark:bg-transparent" onClick={resetNow}>
                    <Trash2 className="mr-2 h-4 w-4" /> Reset local cache
                  </Button>
                </div>
              </section>
            </div>
          </TabsContent>

          <TabsContent value="diagnostics" className="mt-4">
            <section className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0a1628]">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="text-sm font-semibold">Sanitized diagnostic evidence</h2><p className="mt-1 text-xs text-slate-500">URLs omit credentials, queries, and fragments; server filesystem paths are reduced to asset names.</p></div>
                <Button size="sm" variant="outline" className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-transparent dark:text-white" onClick={() => void copyDebug()}><Copy className="mr-2 h-4 w-4" /> Copy</Button>
              </div>
              <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words bg-slate-950 p-5 text-xs leading-5 text-slate-100">{debugPayload}</pre>
            </section>
          </TabsContent>

          <TabsContent value="voice" className="mt-4">
            <section className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0a1628]">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="text-sm font-semibold">Voice transcription health</h2><p className="mt-1 text-xs text-slate-500">The latest 20 recorded jobs load on demand. This page does not poll or create background work.</p></div>
                <Button size="sm" variant="outline" className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-transparent dark:text-white" onClick={() => void voiceJobsQuery.refetch()} disabled={voiceJobsQuery.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${voiceJobsQuery.isFetching ? "animate-spin" : ""}`} /> Refresh records</Button>
              </div>
              {voiceJobsQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" /> Loading transcription records</div>
              ) : voiceJobsQuery.isError ? (
                <div className="px-5 py-12 text-center text-sm text-red-700">Transcription records could not be loaded.</div>
              ) : jobs.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900"><th className="px-5 py-3">Time</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Provider</th><th className="px-3 py-3">Duration</th><th className="px-3 py-3">Error</th><th className="px-5 py-3">User</th></tr></thead>
                    <tbody>{jobs.map((job) => (
                      <tr key={job.id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                        <td className="whitespace-nowrap px-5 py-3">{dateLabel(job.createdAt)}</td>
                        <td className="px-3 py-3"><Badge variant="outline" className={job.status === "SUCCESS" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}>{job.status}</Badge></td>
                        <td className="px-3 py-3">{job.provider || "Not reported"}</td>
                        <td className="px-3 py-3">{Math.max(0, Number(job.durationMs || 0))} ms</td>
                        <td className="px-3 py-3">{redactDiagnosticText(job.errorCode)}</td>
                        <td className="px-5 py-3">{redactDiagnosticText(job.userName)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : (
                <div className="px-5 py-16 text-center"><Mic2 className="mx-auto h-7 w-7 text-slate-400" /><p className="mt-3 text-sm font-medium">No transcription records</p><p className="mt-1 text-xs text-slate-500">No voice jobs are stored for this tenant.</p></div>
              )}
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
