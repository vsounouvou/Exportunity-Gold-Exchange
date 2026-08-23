import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Check,
  Download,
  Eye,
  Globe2,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Undo2,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type WebsiteTab = "seo" | "visits" | "governance" | "navigation";

type SeoIssue = {
  id: number;
  path: string;
  issueType: string;
  severity: number;
  message: string;
  status: string;
  lastSeenAt: string;
};

type SeoSnapshot = {
  id: number;
  path: string;
  statusCode: number;
  title: string | null;
  canonical: string | null;
  collectedAt: string;
};

type TelemetrySummary = {
  ok: boolean;
  env: string;
  range: { days: number; since: string };
  totals: { sessions: number; pageViews: number; errors: number; botSessions: number };
  topPages: Array<{ path: string; views: number }>;
};

type RecentSession = {
  id: number;
  entryPath: string | null;
  exitPath: string | null;
  lastSeenAt: string;
  pageViews: number;
  errors: number;
  deviceClass: string | null;
  isBot: boolean;
};

type SeoRecommendation = {
  id: number;
  actionType: string;
  targetPath: string;
  severity: number;
  confidence: number;
  status: string;
  updatedAt: string;
};

type SeoPatch = {
  id: number;
  patchType: string;
  targetPath: string;
  featureFlag: string;
  requiresApproval: boolean;
  status: string;
  patch: Record<string, unknown>;
  updatedAt: string;
};

type UxAuditPayload = {
  ok: boolean;
  generatedAt: string;
  tenantKey: string | null;
  errors: Array<{ scope: string; message: string }>;
  stats: {
    routeCount: number;
    menuCount: number;
    missingMenuRoutes: number;
    uncoveredRoutes: number;
  };
  missingMenuLinks: Array<{ label?: string; route?: string; source?: string }>;
  uncoveredRoutes: unknown[];
};

type IaAuditPayload = {
  ok: boolean;
  generatedAt: string | null;
  duplicates: Array<{
    capabilityTag: string;
    canonicalRoute: string | null;
    routes: string[];
    apiOverlapThreshold: number;
  }>;
};

type SeoAction = "approve" | "dismiss" | "apply" | "rollback";

function initialWebsiteTab(): WebsiteTab {
  if (typeof window === "undefined") return "seo";
  const requested = new URLSearchParams(window.location.search).get("view");
  return requested === "visits" || requested === "governance" || requested === "navigation" ? requested : "seo";
}

function redactText(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "Not reported";
  return text
    .replace(/\b(authorization)(\s*[:=]\s*)(?:(?:Bearer|Basic)\s+)?[^\s,;]+/gi, "$1$2[REDACTED]")
    .replace(/\b(api[-_]?key|secret|token|password|cookie|pin|cvv|cvc)(\s*[:=]\s*)[^\s,;]+/gi, "$1$2[REDACTED]")
    .replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, "$1 [REDACTED]")
    .replace(/\b[A-Za-z]:\\(?:[^\\\r\n]+\\)*[^\\\r\n\s,;]+/g, "[LOCAL_PATH]")
    .replace(/\/(?:home|Users|srv|var\/www)\/[^\s,;]+/g, "[SERVER_PATH]");
}

function sanitizeEvidence(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeEvidence);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        /authorization|api[-_]?key|secret|token|password|cookie|pin|cvv|cvc/i.test(key)
          ? "[REDACTED]"
          : sanitizeEvidence(entry),
      ]),
    );
  }
  return typeof value === "string" ? redactText(value) : value;
}

function dateLabel(value?: string | null) {
  if (!value) return "Not reported";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not reported" : parsed.toLocaleString();
}

function downloadEvidence(data: unknown) {
  const blob = new Blob([JSON.stringify(sanitizeEvidence(data), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `website-intelligence-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0a1628]">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function TableFrame({ children }: { children: ReactNode }) {
  return <div className="max-h-[420px] overflow-auto">{children}</div>;
}

const headClass = "whitespace-nowrap bg-slate-50 px-4 py-3 text-left text-xs font-medium text-slate-500 dark:bg-slate-900 dark:text-slate-400";
const cellClass = "border-t border-slate-100 px-4 py-3 align-top text-sm dark:border-slate-800";

export default function AdminWebsiteIntelligencePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<WebsiteTab>(initialWebsiteTab);
  const [days, setDays] = useState(7);

  const seoEnabled = activeTab === "seo";
  const visitsEnabled = activeTab === "visits";
  const governanceEnabled = activeTab === "governance";
  const navigationEnabled = activeTab === "navigation";

  const issuesQuery = useQuery<{ ok: boolean; env: string; items: SeoIssue[] }>({
    queryKey: ["/api/admin/seo/issues?status=open&limit=250"],
    queryFn: () => apiRequest("/api/admin/seo/issues?status=open&limit=250", "GET"),
    enabled: seoEnabled,
    staleTime: 0,
    retry: false,
  });
  const snapshotsQuery = useQuery<{ ok: boolean; env: string; items: SeoSnapshot[] }>({
    queryKey: ["/api/admin/seo/snapshots?limit=200"],
    queryFn: () => apiRequest("/api/admin/seo/snapshots?limit=200", "GET"),
    enabled: seoEnabled,
    staleTime: 0,
    retry: false,
  });
  const summaryQuery = useQuery<TelemetrySummary>({
    queryKey: [`/api/admin/telemetry/summary?days=${days}`],
    queryFn: () => apiRequest(`/api/admin/telemetry/summary?days=${days}`, "GET"),
    enabled: visitsEnabled,
    staleTime: 30_000,
    retry: false,
  });
  const sessionsQuery = useQuery<{ ok: boolean; env: string; items: RecentSession[] }>({
    queryKey: ["/api/admin/telemetry/sessions/recent?limit=60"],
    queryFn: () => apiRequest("/api/admin/telemetry/sessions/recent?limit=60", "GET"),
    enabled: visitsEnabled,
    staleTime: 30_000,
    retry: false,
  });
  const recommendationsQuery = useQuery<{ ok: boolean; env: string; items: SeoRecommendation[] }>({
    queryKey: ["/api/admin/seo/recommendations?status=proposed&limit=250"],
    queryFn: () => apiRequest("/api/admin/seo/recommendations?status=proposed&limit=250", "GET"),
    enabled: governanceEnabled,
    staleTime: 0,
    retry: false,
  });
  const proposedPatchesQuery = useQuery<{ ok: boolean; env: string; items: SeoPatch[] }>({
    queryKey: ["/api/admin/seo/patches?status=proposed&limit=250"],
    queryFn: () => apiRequest("/api/admin/seo/patches?status=proposed&limit=250", "GET"),
    enabled: governanceEnabled,
    staleTime: 0,
    retry: false,
  });
  const activePatchesQuery = useQuery<{ ok: boolean; env: string; items: SeoPatch[] }>({
    queryKey: ["/api/admin/seo/patches?status=applied&limit=250"],
    queryFn: () => apiRequest("/api/admin/seo/patches?status=applied&limit=250", "GET"),
    enabled: governanceEnabled,
    staleTime: 0,
    retry: false,
  });
  const auditQuery = useQuery<UxAuditPayload>({
    queryKey: ["/api/admin/ux-audit"],
    queryFn: () => apiRequest("/api/admin/ux-audit", "GET"),
    enabled: navigationEnabled,
    staleTime: 0,
    retry: false,
  });
  const iaQuery = useQuery<IaAuditPayload>({
    queryKey: ["/api/admin/ia/pages-audit"],
    queryFn: () => apiRequest("/api/admin/ia/pages-audit", "GET"),
    enabled: navigationEnabled,
    staleTime: 0,
    retry: false,
  });

  const scanMutation = useMutation({
    mutationFn: () => apiRequest("/api/admin/seo/scan", "POST", { maxPages: 60 }),
    onSuccess: async (data: any) => {
      toast({ title: "SEO scan complete", description: `Pages: ${data?.pages ?? "?"} · Issues: ${data?.issues ?? "?"}` });
      await Promise.all([issuesQuery.refetch(), snapshotsQuery.refetch()]);
    },
    onError: (error: any) => toast({ title: "SEO scan failed", description: redactText(error?.message || error), variant: "destructive" }),
  });

  const seoActionMutation = useMutation({
    mutationFn: ({ action, id }: { action: SeoAction; id: number }) => {
      const endpoint = action === "approve" || action === "dismiss"
        ? `/api/admin/seo/recommendations/${id}/${action}`
        : `/api/admin/seo/patches/${id}/${action}`;
      return apiRequest(endpoint, "POST");
    },
    onSuccess: async (_data, input) => {
      toast({ title: input.action === "approve" ? "Recommendation approved" : input.action === "dismiss" ? "Recommendation dismissed" : input.action === "apply" ? "Patch applied" : "Patch rolled back" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/recommendations?status=proposed&limit=250"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/patches?status=proposed&limit=250"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/admin/seo/patches?status=applied&limit=250"] }),
      ]);
    },
    onError: (error: any) => toast({ title: "SEO decision failed", description: redactText(error?.message || error), variant: "destructive" }),
  });

  const issues = Array.isArray(issuesQuery.data?.items) ? issuesQuery.data!.items : [];
  const snapshots = Array.isArray(snapshotsQuery.data?.items) ? snapshotsQuery.data!.items : [];
  const summary = summaryQuery.data;
  const sessions = Array.isArray(sessionsQuery.data?.items) ? sessionsQuery.data!.items : [];
  const recommendations = Array.isArray(recommendationsQuery.data?.items) ? recommendationsQuery.data!.items : [];
  const proposedPatches = Array.isArray(proposedPatchesQuery.data?.items) ? proposedPatchesQuery.data!.items : [];
  const activePatches = Array.isArray(activePatchesQuery.data?.items) ? activePatchesQuery.data!.items : [];
  const duplicates = Array.isArray(iaQuery.data?.duplicates) ? iaQuery.data!.duplicates : [];

  const activeBusy =
    (activeTab === "seo" && (issuesQuery.isFetching || snapshotsQuery.isFetching || scanMutation.isPending)) ||
    (activeTab === "visits" && (summaryQuery.isFetching || sessionsQuery.isFetching)) ||
    (activeTab === "governance" && (recommendationsQuery.isFetching || proposedPatchesQuery.isFetching || activePatchesQuery.isFetching || seoActionMutation.isPending)) ||
    (activeTab === "navigation" && (auditQuery.isFetching || iaQuery.isFetching));

  const refreshActive = () => {
    if (activeTab === "seo") void Promise.all([issuesQuery.refetch(), snapshotsQuery.refetch()]);
    if (activeTab === "visits") void Promise.all([summaryQuery.refetch(), sessionsQuery.refetch()]);
    if (activeTab === "governance") void Promise.all([recommendationsQuery.refetch(), proposedPatchesQuery.refetch(), activePatchesQuery.refetch()]);
    if (activeTab === "navigation") void Promise.all([auditQuery.refetch(), iaQuery.refetch()]);
  };

  const confirmScan = () => {
    if (window.confirm("Run an on-demand technical SEO scan of up to 60 pages? This records new snapshots and issues but does not apply SEO patches.")) {
      scanMutation.mutate();
    }
  };

  const confirmSeoAction = (action: SeoAction, id: number, label: string) => {
    const prompt = action === "approve"
      ? `Approve recommendation ${label}? This records approval but does not apply a runtime patch.`
      : action === "dismiss"
        ? `Dismiss recommendation ${label}?`
        : action === "apply"
          ? `Apply SEO patch ${label}? This changes the governed runtime SEO configuration.`
          : `Roll back active SEO patch ${label}? This changes the governed runtime SEO configuration.`;
    if (window.confirm(prompt)) seoActionMutation.mutate({ action, id });
  };

  const lastScan = useMemo(() => dateLabel(snapshots[0]?.collectedAt), [snapshots]);
  const summaryCards = [
    { label: "Open SEO issues", value: issuesQuery.data ? String(issues.length) : "On demand", Icon: Search },
    { label: "Page views", value: summary ? String(summary.totals?.pageViews ?? 0) : "On demand", Icon: Eye },
    { label: "Proposed changes", value: recommendationsQuery.data || proposedPatchesQuery.data ? String(recommendations.length + proposedPatches.length) : "On demand", Icon: ShieldCheck },
    { label: "Route gaps", value: auditQuery.data ? String((auditQuery.data.stats?.missingMenuRoutes || 0) + (auditQuery.data.stats?.uncoveredRoutes || 0)) : "On demand", Icon: Globe2 },
  ];

  return (
    <div data-testid="exportunity-website-intelligence" className="min-h-full bg-[#f7f8fa] text-slate-950 dark:bg-[#07121f] dark:text-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-[#9a6200] dark:text-[#f5a623]"><BarChart3 className="h-4 w-4" /> Digital operations</div>
            <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">Website intelligence</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">Traffic, technical SEO, governed metadata changes, and interface coverage in one Exportunity workspace.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800"><Activity className="mr-1.5 h-3.5 w-3.5" /> On-demand reads</Badge>
            <Button className="bg-[#f5a623] text-[#07121f] hover:bg-[#e59a18]" onClick={refreshActive} disabled={activeBusy}><RefreshCw className={`mr-2 h-4 w-4 ${activeBusy ? "animate-spin" : ""}`} /> Refresh view</Button>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-px overflow-hidden border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 lg:grid-cols-4">
          {summaryCards.map(({ label, value, Icon }) => (
            <div key={label} className="min-w-0 bg-white px-4 py-4 dark:bg-[#0a1628]">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400"><Icon className="h-4 w-4" /> {label}</div>
              <div className="mt-1 truncate text-lg font-semibold">{value}</div>
            </div>
          ))}
        </section>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as WebsiteTab)} className="mt-6">
          <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border-b border-slate-200 bg-transparent p-0 dark:border-slate-800">
            {[["seo", "SEO health"], ["visits", "Visits"], ["governance", "Changes"], ["navigation", "Navigation"]].map(([value, label]) => (
              <TabsTrigger key={value} value={value} className="rounded-none border-b-2 border-transparent px-3 py-3 text-xs text-slate-500 data-[state=active]:border-[#f5a623] data-[state=active]:bg-transparent data-[state=active]:text-slate-950 dark:text-slate-400 dark:data-[state=active]:text-white sm:px-4 sm:text-sm">{label}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="seo" className="mt-4 space-y-4">
            <Panel
              title="Technical SEO health"
              description={`Tenant-scoped crawl evidence. Last recorded scan: ${lastScan}.`}
              action={<Button size="sm" variant="outline" className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-transparent dark:text-white" onClick={confirmScan} disabled={scanMutation.isPending}><Play className="mr-2 h-4 w-4" /> Run 60-page scan</Button>}
            >
              <div className="grid grid-cols-2 gap-px bg-slate-200 dark:bg-slate-800 sm:grid-cols-4">
                {["Environment", "Open issues", "Snapshots", "Last scan"].map((label, index) => {
                  const value = [issuesQuery.data?.env || snapshotsQuery.data?.env || "Not reported", String(issues.length), String(snapshots.length), lastScan][index];
                  return <div key={label} className="bg-white px-5 py-4 dark:bg-[#0a1628]"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 truncate font-semibold">{value}</div></div>;
                })}
              </div>
            </Panel>
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Open issues" description="Actionable findings currently stored for this tenant.">
                <TableFrame><table className="w-full min-w-[720px]"><thead><tr><th className={headClass}>Severity</th><th className={headClass}>Type</th><th className={headClass}>Path</th><th className={headClass}>Message</th><th className={headClass}>Last seen</th></tr></thead><tbody>
                  {issues.length ? issues.slice(0, 200).map((issue) => <tr key={issue.id}><td className={cellClass}>{issue.severity}</td><td className={`${cellClass} font-medium text-[#9a6200]`}>{redactText(issue.issueType)}</td><td className={cellClass}>{redactText(issue.path)}</td><td className={cellClass}>{redactText(issue.message)}</td><td className={`${cellClass} whitespace-nowrap`}>{dateLabel(issue.lastSeenAt)}</td></tr>) : <tr><td className={`${cellClass} text-slate-500`} colSpan={5}>{issuesQuery.isLoading ? "Loading issues…" : issuesQuery.isError ? "SEO issues could not be loaded." : "No open issues."}</td></tr>}
                </tbody></table></TableFrame>
              </Panel>
              <Panel title="Recent snapshots" description="Latest crawl records; no synthetic examples are shown.">
                <TableFrame><table className="w-full min-w-[760px]"><thead><tr><th className={headClass}>Path</th><th className={headClass}>HTTP</th><th className={headClass}>Title</th><th className={headClass}>Canonical</th><th className={headClass}>Collected</th></tr></thead><tbody>
                  {snapshots.length ? snapshots.slice(0, 200).map((snapshot) => <tr key={snapshot.id}><td className={cellClass}>{redactText(snapshot.path)}</td><td className={cellClass}>{snapshot.statusCode}</td><td className={cellClass}>{redactText(snapshot.title)}</td><td className={cellClass}>{redactText(snapshot.canonical)}</td><td className={`${cellClass} whitespace-nowrap`}>{dateLabel(snapshot.collectedAt)}</td></tr>) : <tr><td className={`${cellClass} text-slate-500`} colSpan={5}>{snapshotsQuery.isLoading ? "Loading snapshots…" : snapshotsQuery.isError ? "SEO snapshots could not be loaded." : "No snapshots recorded."}</td></tr>}
                </tbody></table></TableFrame>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="visits" className="mt-4 space-y-4">
            <Panel title="Tenant traffic" description="Privacy-safe session totals and page journeys from recorded telemetry." action={<div className="flex gap-1">{[1, 7, 30].map((value) => <Button key={value} size="sm" variant="outline" className={days === value ? "border-[#f5a623] bg-amber-50 text-slate-950" : "border-slate-300 bg-white text-slate-700"} onClick={() => setDays(value)}>{value}d</Button>)}</div>}>
              <div className="grid grid-cols-2 gap-px bg-slate-200 dark:bg-slate-800 sm:grid-cols-4">
                {[
                  ["Sessions", summary?.totals?.sessions],
                  ["Page views", summary?.totals?.pageViews],
                  ["Errors", summary?.totals?.errors],
                  ["Bot sessions", summary?.totals?.botSessions],
                ].map(([label, value]) => <div key={String(label)} className="bg-white px-5 py-4 dark:bg-[#0a1628]"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-2xl font-semibold">{value ?? "—"}</div></div>)}
              </div>
            </Panel>
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Top pages" description={`Last ${days} day(s) · ${summary?.env || "environment not reported"}`}>
                <TableFrame><table className="w-full"><thead><tr><th className={headClass}>Path</th><th className={`${headClass} text-right`}>Views</th></tr></thead><tbody>
                  {(summary?.topPages || []).length ? summary!.topPages.map((row) => <tr key={row.path}><td className={cellClass}>{redactText(row.path)}</td><td className={`${cellClass} text-right`}>{row.views}</td></tr>) : <tr><td className={`${cellClass} text-slate-500`} colSpan={2}>{summaryQuery.isLoading ? "Loading traffic…" : summaryQuery.isError ? "Traffic summary could not be loaded." : "No page views recorded."}</td></tr>}
                </tbody></table></TableFrame>
              </Panel>
              <Panel title="Recent sessions" description="Session identifiers are intentionally not exposed in the interface.">
                <TableFrame><table className="w-full min-w-[680px]"><thead><tr><th className={headClass}>Entry</th><th className={headClass}>Exit</th><th className={headClass}>Last seen</th><th className={headClass}>Views</th><th className={headClass}>Errors</th><th className={headClass}>Device</th></tr></thead><tbody>
                  {sessions.length ? sessions.map((session) => <tr key={session.id}><td className={cellClass}>{redactText(session.entryPath)}</td><td className={cellClass}>{redactText(session.exitPath)}</td><td className={`${cellClass} whitespace-nowrap`}>{dateLabel(session.lastSeenAt)}</td><td className={cellClass}>{session.pageViews || 0}</td><td className={cellClass}>{session.errors || 0}</td><td className={cellClass}>{session.isBot ? "bot" : redactText(session.deviceClass)}</td></tr>) : <tr><td className={`${cellClass} text-slate-500`} colSpan={6}>{sessionsQuery.isLoading ? "Loading sessions…" : sessionsQuery.isError ? "Recent sessions could not be loaded." : "No sessions recorded."}</td></tr>}
                </tbody></table></TableFrame>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="governance" className="mt-4 space-y-4">
            <div className="border-l-4 border-[#f5a623] bg-white px-5 py-4 text-sm leading-6 text-slate-700 dark:bg-[#0a1628] dark:text-slate-200"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#9a6200]" /><p>Recommendations, approvals, runtime application, and rollback remain distinct actions. Every mutation below requires a confirmation; patches marked as requiring separate approval remain disabled.</p></div></div>
            <Panel title="Proposed recommendations" description="Rules-first technical recommendations awaiting an attributable decision.">
              <TableFrame><table className="w-full min-w-[760px]"><thead><tr><th className={headClass}>Action</th><th className={headClass}>Path</th><th className={headClass}>Severity</th><th className={headClass}>Confidence</th><th className={headClass}>Decision</th></tr></thead><tbody>
                {recommendations.length ? recommendations.map((item) => <tr key={item.id}><td className={`${cellClass} font-medium text-[#9a6200]`}>{redactText(item.actionType)}</td><td className={cellClass}>{redactText(item.targetPath)}</td><td className={cellClass}>{item.severity}</td><td className={cellClass}>{item.confidence}</td><td className={cellClass}><div className="flex gap-2"><Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => confirmSeoAction("approve", item.id, item.actionType)} disabled={seoActionMutation.isPending}><Check className="mr-1.5 h-4 w-4" /> Approve</Button><Button size="sm" variant="outline" className="border-red-300 bg-white text-red-800 hover:bg-red-50 dark:bg-transparent" onClick={() => confirmSeoAction("dismiss", item.id, item.actionType)} disabled={seoActionMutation.isPending}><X className="mr-1.5 h-4 w-4" /> Dismiss</Button></div></td></tr>) : <tr><td className={`${cellClass} text-slate-500`} colSpan={5}>{recommendationsQuery.isLoading ? "Loading recommendations…" : recommendationsQuery.isError ? "Recommendations could not be loaded." : "No proposed recommendations."}</td></tr>}
              </tbody></table></TableFrame>
            </Panel>
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Proposed patches" description="Previewed runtime metadata changes; application is separately governed.">
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {proposedPatches.length ? proposedPatches.map((patch) => <div key={patch.id} className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="text-xs font-semibold uppercase text-[#9a6200]">{redactText(patch.patchType)}</div><div className="mt-1 break-all text-sm font-medium">{redactText(patch.targetPath)}</div><div className="mt-2 text-xs leading-5 text-slate-500">{typeof patch.patch?.title === "string" ? `Title: ${redactText(patch.patch.title)}` : "No title change"}{typeof patch.patch?.description === "string" ? ` · Description: ${redactText(patch.patch.description)}` : ""}</div></div><Button size="sm" className="bg-[#f5a623] text-[#07121f] hover:bg-[#e59a18]" disabled={patch.requiresApproval || seoActionMutation.isPending} onClick={() => confirmSeoAction("apply", patch.id, patch.patchType)}><Zap className="mr-1.5 h-4 w-4" /> {patch.requiresApproval ? "Separate approval required" : "Apply patch"}</Button></div></div>) : <div className="px-5 py-12 text-center text-sm text-slate-500">{proposedPatchesQuery.isLoading ? "Loading proposed patches…" : proposedPatchesQuery.isError ? "Proposed patches could not be loaded." : "No proposed patches."}</div>}
                </div>
              </Panel>
              <Panel title="Active patches" description="Feature-flagged patches currently recorded as applied.">
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activePatches.length ? activePatches.map((patch) => <div key={patch.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="text-xs font-semibold uppercase text-[#9a6200]">{redactText(patch.patchType)}</div><div className="mt-1 break-all text-sm">{redactText(patch.targetPath)}</div><div className="mt-1 break-all text-xs text-slate-500">Flag: {redactText(patch.featureFlag)}</div></div><Button size="sm" variant="outline" className="border-red-300 bg-white text-red-800 hover:bg-red-50 dark:bg-transparent" onClick={() => confirmSeoAction("rollback", patch.id, patch.patchType)} disabled={seoActionMutation.isPending}><Undo2 className="mr-1.5 h-4 w-4" /> Roll back</Button></div>) : <div className="px-5 py-12 text-center text-sm text-slate-500">{activePatchesQuery.isLoading ? "Loading active patches…" : activePatchesQuery.isError ? "Active patches could not be loaded." : "No active patches."}</div>}
                </div>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="navigation" className="mt-4 space-y-4">
            <Panel title="Interface coverage" description="Route coverage and duplicate-capability evidence from the current application graph." action={<Button size="sm" variant="outline" className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-transparent dark:text-white" onClick={() => downloadEvidence({ audit: auditQuery.data, informationArchitecture: iaQuery.data })} disabled={!auditQuery.data}><Download className="mr-2 h-4 w-4" /> Download sanitized JSON</Button>}>
              <div className="grid grid-cols-2 gap-px bg-slate-200 dark:bg-slate-800 sm:grid-cols-4">
                {[
                  ["Routes", auditQuery.data?.stats?.routeCount],
                  ["Menu items", auditQuery.data?.stats?.menuCount],
                  ["Missing links", auditQuery.data?.stats?.missingMenuRoutes],
                  ["Uncovered", auditQuery.data?.stats?.uncoveredRoutes],
                ].map(([label, value]) => <div key={String(label)} className="bg-white px-5 py-4 dark:bg-[#0a1628]"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-2xl font-semibold">{value ?? "—"}</div></div>)}
              </div>
              {(auditQuery.error || iaQuery.error || auditQuery.data?.errors?.length) ? <div className="border-t border-slate-200 px-5 py-4 text-sm text-red-700 dark:border-slate-800 dark:text-red-300">{[...(auditQuery.data?.errors || []).map((entry) => `${entry.scope}: ${redactText(entry.message)}`), auditQuery.error ? redactText((auditQuery.error as any)?.message || auditQuery.error) : "", iaQuery.error ? redactText((iaQuery.error as any)?.message || iaQuery.error) : ""].filter(Boolean).join(" · ")}</div> : null}
            </Panel>
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Duplicate capabilities" description="Canonical-route collisions detected by the information-architecture audit.">
                <div className="max-h-[420px] divide-y divide-slate-100 overflow-auto dark:divide-slate-800">
                  {duplicates.length ? duplicates.slice(0, 100).map((item) => <div key={item.capabilityTag} className="p-5"><div className="text-xs font-semibold uppercase text-[#9a6200]">{redactText(item.capabilityTag)}</div><div className="mt-1 text-sm">Canonical: {redactText(item.canonicalRoute)}</div><div className="mt-2 text-xs leading-5 text-slate-500">{item.routes.map(redactText).join(" · ")}</div></div>) : <div className="px-5 py-12 text-center text-sm text-slate-500">{iaQuery.isLoading ? "Loading duplicate audit…" : iaQuery.isError ? "Duplicate audit could not be loaded." : "No duplicate capabilities detected."}</div>}
                </div>
              </Panel>
              <Panel title="Missing menu links" description="Routes discovered in menu evidence but absent from the current application graph.">
                <TableFrame><table className="w-full min-w-[560px]"><thead><tr><th className={headClass}>Label</th><th className={headClass}>Route</th><th className={headClass}>Source</th></tr></thead><tbody>
                  {(auditQuery.data?.missingMenuLinks || []).length ? auditQuery.data!.missingMenuLinks.slice(0, 200).map((item, index) => <tr key={`${item.route || "missing"}-${index}`}><td className={cellClass}>{redactText(item.label)}</td><td className={`${cellClass} font-medium text-[#9a6200]`}>{redactText(item.route)}</td><td className={cellClass}>{redactText(item.source)}</td></tr>) : <tr><td className={`${cellClass} text-slate-500`} colSpan={3}>{auditQuery.isLoading ? "Loading route coverage…" : auditQuery.isError ? "Route coverage could not be loaded." : "No missing menu links detected."}</td></tr>}
                </tbody></table></TableFrame>
              </Panel>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
