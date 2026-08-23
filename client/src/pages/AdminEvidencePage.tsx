import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  FlaskConical,
  Link2,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type EvidenceReceipt = {
  id: string;
  receiptType: string;
  entityType: string | null;
  entityIds: Array<string | number>;
  affectedRows: number | null;
  externalRef: string | null;
  evidenceUrl: string | null;
  createdAt: string | null;
};

type EvidenceRun = {
  id: number;
  actionType: string;
  actor: string;
  mode: "REAL" | "SIMULATED";
  outcome: "SUCCESS" | "FAILED" | "NO_EFFECT" | "APPROVAL_PENDING";
  correlationId: string | null;
  createdAt: string;
  action_run_id: number;
  receipt_count: number;
  receipts: EvidenceReceipt[];
};

type EvidenceListResponse = {
  ok: boolean;
  items: EvidenceRun[];
  alerts: {
    noEffectLastHour: number;
    simulatedLastHour: number;
  };
};

type EvidenceDetailResponse = {
  ok: boolean;
  run: EvidenceRun & {
    payload: Record<string, unknown>;
    status: string;
    updatedAt: string;
    finishedAt: string | null;
  };
  receipts: EvidenceReceipt[];
  results: Array<{
    id: number;
    createdAt: string;
    result: Record<string, unknown>;
    error: Record<string, unknown> | null;
  }>;
};

const sensitiveEvidenceKey = /(authorization|api[-_]?key|secret|token|password|cookie|pin|card(?:number)?|cvv|cvc)/i;

function formatTime(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString();
}

function humanize(value: string | null | undefined, fallback = "Not recorded") {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;
  return normalized
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function entityLink(entityType: string | null, entityId: string | number) {
  if (!entityType) return null;
  const id = Number(entityId);
  if (entityType === "agent" && Number.isFinite(id) && id > 0) return `/agents/${id}`;
  if (entityType === "task" && Number.isFinite(id) && id > 0) return "/tasks";
  if (entityType === "shop" && Number.isFinite(id) && id > 0) return `/marketplace/sellers/${id}`;
  return null;
}

function safeEvidenceHref(value: string | null) {
  const href = String(value || "").trim();
  if (!href) return null;
  if (href.startsWith("/") || /^https:\/\//i.test(href)) return href;
  return null;
}

function redactForDisplay(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.map((item) => redactForDisplay(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sensitiveEvidenceKey.test(key) ? "[REDACTED]" : redactForDisplay(item, depth + 1),
      ]),
    );
  }
  if (typeof value === "string" && /^(?:basic|bearer)\s+/i.test(value)) return "[REDACTED]";
  return value;
}

function outcomeClass(outcome: EvidenceRun["outcome"]) {
  if (outcome === "SUCCESS") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (outcome === "FAILED" || outcome === "NO_EFFECT") return "border-red-200 bg-red-50 text-red-800";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function Metric({
  label,
  value,
  note,
  icon: Icon,
  tone = "slate",
}: {
  label: string;
  value: number;
  note: string;
  icon: typeof ShieldCheck;
  tone?: "slate" | "amber" | "red" | "emerald";
}) {
  const iconTone = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-red-200 bg-red-50 text-red-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
          <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
          <div className="mt-1 text-xs text-slate-500">{note}</div>
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg border", iconTone)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-[#FBFCFD] p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 break-words text-sm font-bold text-slate-950">{value}</div>
    </div>
  );
}

export default function AdminEvidencePage() {
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const listQuery = useQuery<EvidenceListResponse>({
    queryKey: ["/api/admin/evidence"],
    queryFn: () => apiRequest("/api/admin/evidence?limit=100", { method: "GET" }),
    refetchInterval: 5000,
  });

  const detailQuery = useQuery<EvidenceDetailResponse>({
    queryKey: ["/api/admin/evidence", selectedRunId],
    queryFn: () => apiRequest(`/api/admin/evidence/${selectedRunId}`, { method: "GET" }),
    enabled: Boolean(selectedRunId),
    refetchInterval: 5000,
  });

  const allRows = listQuery.data?.items || [];
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return allRows;
    return allRows.filter((row) => {
      const haystack = `${row.actionType} ${row.actor} ${row.outcome} ${row.mode} ${row.correlationId || ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [allRows, search]);

  const receiptCount = allRows.reduce((total, row) => total + Number(row.receipt_count || 0), 0);
  const successfulCount = allRows.filter((row) => row.outcome === "SUCCESS").length;
  const noEffectLastHour = Number(listQuery.data?.alerts?.noEffectLastHour || 0);
  const simulatedLastHour = Number(listQuery.data?.alerts?.simulatedLastHour || 0);

  return (
    <div data-testid="exportunity-evidence-workspace" className="min-h-full bg-[#F7F8FA] p-4 text-slate-950 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-[#D78C00]">Exportunity Industrial OS</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Execution evidence</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Inspect attributable action runs, receipts, outcomes, and redacted result snapshots from the live governance record.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-slate-300 bg-white text-slate-800 hover:border-amber-400 hover:bg-amber-50"
            onClick={() => void listQuery.refetch()}
            disabled={listQuery.isFetching}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", listQuery.isFetching && "animate-spin")} />
            Refresh evidence
          </Button>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Runs loaded" value={allRows.length} note="Latest governed actions" icon={FileCheck2} />
          <Metric label="Successful" value={successfulCount} note="Within the loaded record" icon={CheckCircle2} tone="emerald" />
          <Metric label="Receipts" value={receiptCount} note="Attributable effects recorded" icon={ReceiptText} tone="amber" />
          <Metric
            label="Needs review"
            value={noEffectLastHour + simulatedLastHour}
            note={`${noEffectLastHour} no-effect · ${simulatedLastHour} simulated in 1h`}
            icon={AlertTriangle}
            tone={noEffectLastHour > 0 ? "red" : "amber"}
          />
        </section>

        <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
          <CardHeader className="space-y-4 border-b border-slate-200">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <CardTitle className="text-xl font-black text-slate-950">Action record</CardTitle>
                <p className="mt-1 text-sm text-slate-500">Select a run to inspect its receipt chain and redacted result details.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="border-red-200 bg-red-50 text-red-800 hover:bg-red-50">
                  No effect · 1h: {noEffectLastHour}
                </Badge>
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-50">
                  Simulated · 1h: {simulatedLastHour}
                </Badge>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter by action, actor, outcome, mode, or correlation ID"
                className="border-slate-200 bg-white pl-9 text-slate-950 placeholder:text-slate-400"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {listQuery.isLoading ? (
              <div className="space-y-3 p-5">
                {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24 bg-slate-100" />)}
              </div>
            ) : listQuery.isError ? (
              <div className="m-5 flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                <div className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" /> Evidence could not be loaded.</div>
                <Button type="button" size="sm" variant="outline" className="border-red-300 bg-white text-red-800" onClick={() => void listQuery.refetch()}>Try again</Button>
              </div>
            ) : !rows.length ? (
              <div className="px-5 py-12 text-center text-sm text-slate-500">
                {search.trim() ? "No action run matches this filter." : "No governed action run is recorded yet."}
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    data-testid="exportunity-evidence-run"
                    className="grid w-full gap-3 px-5 py-4 text-left transition-colors hover:bg-[#FFF8E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F5A623] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    onClick={() => setSelectedRunId(row.id)}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-950">{humanize(row.actionType)}</span>
                        <Badge variant="outline" className={cn("text-[10px] font-bold hover:bg-inherit", outcomeClass(row.outcome))}>{humanize(row.outcome)}</Badge>
                        {row.mode === "SIMULATED" ? (
                          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-900 hover:bg-amber-50">Simulation</Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">{row.actor || "Unknown actor"} · run {row.action_run_id} · {row.receipt_count} receipt{row.receipt_count === 1 ? "" : "s"}</div>
                      <div className="mt-1 truncate font-mono text-[11px] text-slate-400">{row.correlationId || "No correlation ID"}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs text-slate-500 sm:flex-col sm:items-end">
                      <span>{formatTime(row.createdAt)}</span>
                      <span className="font-bold text-[#9A6200]">Inspect run →</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet open={Boolean(selectedRunId)} onOpenChange={(open) => { if (!open) setSelectedRunId(null); }}>
        <SheetContent side="right" className="w-full overflow-y-auto border-slate-200 bg-[#F7F8FA] p-0 text-slate-950 sm:max-w-[760px] [&>button]:z-20 [&>button]:rounded-md [&>button]:border [&>button]:border-slate-200 [&>button]:bg-white [&>button]:p-2 [&>button]:text-slate-600 [&>button]:opacity-100">
          <SheetHeader className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4 pr-16 text-left shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#D78C00]">Governed action record</div>
            <SheetTitle className="text-xl font-black text-slate-950">Action run #{selectedRunId || "—"}</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 p-5">
            {detailQuery.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((item) => <Skeleton key={item} className="h-28 bg-slate-100" />)}
              </div>
            ) : detailQuery.isError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                <div className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" /> Run detail could not be loaded.</div>
                <Button type="button" size="sm" variant="outline" className="mt-3 border-red-300 bg-white text-red-800" onClick={() => void detailQuery.refetch()}>Try again</Button>
              </div>
            ) : detailQuery.data ? (
              <>
                <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
                  <CardHeader className="border-b border-slate-200 pb-3">
                    <CardTitle className="flex items-center gap-2 text-base font-black text-slate-950"><ShieldCheck className="h-4 w-4 text-[#D78C00]" /> Run summary</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
                    <SummaryField label="Action" value={humanize(detailQuery.data.run.actionType)} />
                    <SummaryField label="Status" value={humanize(detailQuery.data.run.status)} />
                    <SummaryField label="Outcome" value={humanize(detailQuery.data.run.outcome)} />
                    <SummaryField label="Mode" value={humanize(detailQuery.data.run.mode)} />
                    <SummaryField label="Created" value={formatTime(detailQuery.data.run.createdAt)} />
                    <SummaryField label="Finished" value={formatTime(detailQuery.data.run.finishedAt)} />
                    <div className="sm:col-span-2"><SummaryField label="Correlation ID" value={detailQuery.data.run.correlationId || "Not recorded"} /></div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
                  <CardHeader className="border-b border-slate-200 pb-3">
                    <CardTitle className="flex items-center gap-2 text-base font-black text-slate-950"><ReceiptText className="h-4 w-4 text-[#D78C00]" /> Receipts</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-4">
                    {detailQuery.data.receipts.length === 0 ? (
                      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"><AlertTriangle className="h-4 w-4 shrink-0" /> No receipt was captured for this run.</div>
                    ) : detailQuery.data.receipts.map((receipt) => {
                      const evidenceHref = safeEvidenceHref(receipt.evidenceUrl);
                      return (
                        <div key={receipt.id} className="rounded-lg border border-slate-200 bg-[#FBFCFD] p-3 text-sm">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="font-bold text-slate-950">{humanize(receipt.receiptType)} · {humanize(receipt.entityType, "Entity")}</div>
                              <div className="mt-1 text-xs text-slate-500">{receipt.affectedRows ?? 0} affected row{receipt.affectedRows === 1 ? "" : "s"} · {formatTime(receipt.createdAt)}</div>
                            </div>
                            {receipt.externalRef ? <span className="break-all font-mono text-[10px] text-slate-400">{receipt.externalRef}</span> : null}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {evidenceHref ? (
                              <a href={evidenceHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100">
                                <ExternalLink className="h-3.5 w-3.5" /> Open evidence
                              </a>
                            ) : null}
                            {receipt.entityIds.slice(0, 3).map((entityId) => {
                              const href = entityLink(receipt.entityType, entityId);
                              if (!href) return null;
                              return (
                                <a key={`${receipt.id}:${String(entityId)}`} href={href} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-amber-300 hover:bg-amber-50">
                                  <Link2 className="h-3.5 w-3.5" /> Open {humanize(receipt.entityType, "entity")} {String(entityId)}
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
                  <CardHeader className="border-b border-slate-200 pb-3">
                    <CardTitle className="flex items-center gap-2 text-base font-black text-slate-950"><FlaskConical className="h-4 w-4 text-[#D78C00]" /> Redacted result snapshots</CardTitle>
                    <p className="text-xs leading-5 text-slate-500">Credential-like fields and authorization values are masked before display.</p>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-4">
                    {detailQuery.data.results.length === 0 ? <div className="text-sm text-slate-500">No result snapshot was recorded.</div> : null}
                    {detailQuery.data.results.map((result) => (
                      <div key={result.id} className="rounded-lg border border-slate-200 bg-[#FBFCFD] p-3 text-xs">
                        <div className="font-bold text-slate-500">{formatTime(result.createdAt)}</div>
                        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-white p-3 font-mono text-[11px] leading-5 text-slate-700">{JSON.stringify(redactForDisplay(result.result || {}), null, 2)}</pre>
                        {result.error ? (
                          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-red-200 bg-red-50 p-3 font-mono text-[11px] leading-5 text-red-800">{JSON.stringify(redactForDisplay(result.error), null, 2)}</pre>
                        ) : null}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="text-sm text-slate-500">Run detail is unavailable.</div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
