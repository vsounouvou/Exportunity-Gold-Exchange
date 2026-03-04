import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, Link2, Search } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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

function formatTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString();
}

function entityLink(entityType: string | null, entityId: string | number) {
  if (!entityType) return null;
  const id = Number(entityId);
  if (entityType === "agent" && Number.isFinite(id) && id > 0) return `/agents/${id}`;
  if (entityType === "task" && Number.isFinite(id) && id > 0) return `/tasks`;
  if (entityType === "shop" && Number.isFinite(id) && id > 0) return `/marketplace/sellers/${id}`;
  return null;
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
    enabled: !!selectedRunId,
    refetchInterval: 5000,
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = listQuery.data?.items || [];
    if (!term) return all;
    return all.filter((row) => {
      const haystack = `${row.actionType} ${row.actor} ${row.outcome} ${row.mode} ${row.correlationId || ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [listQuery.data?.items, search]);

  return (
    <div className="space-y-4">
      <Card className="bg-gray-900/40 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white">Evidence</CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge className="bg-red-500/15 text-red-200 border-red-500/30">
              NO_EFFECT (1h): {Number(listQuery.data?.alerts?.noEffectLastHour || 0)}
            </Badge>
            <Badge className="bg-amber-500/15 text-amber-200 border-amber-500/30">
              SIMULATED (1h): {Number(listQuery.data?.alerts?.simulatedLastHour || 0)}
            </Badge>
          </div>
          <div className="relative">
            <Search className="h-4 w-4 text-gray-500 absolute left-2 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter by action, actor, outcome, correlation id"
              className="pl-8 bg-gray-900 border-gray-700 text-gray-100"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {listQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 bg-gray-800" />
              ))}
            </div>
          ) : !rows.length ? (
            <div className="text-sm text-gray-400 py-6 text-center">No action runs found.</div>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => {
                const isNoEffect = row.outcome === "NO_EFFECT";
                const isSimulated = row.mode === "SIMULATED";
                return (
                  <button
                    key={row.id}
                    className={cn(
                      "w-full text-left rounded-lg border px-3 py-2 transition-colors",
                      "border-gray-800 bg-gray-900/30 hover:bg-gray-800/40",
                      isNoEffect ? "border-red-500/30" : "",
                      !isNoEffect && isSimulated ? "border-amber-500/30" : "",
                    )}
                    onClick={() => setSelectedRunId(row.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-white truncate">{row.actionType}</div>
                        <div className="text-xs text-gray-400 truncate">
                          actor={row.actor} • run={row.action_run_id} • receipts={row.receipt_count}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate">corr={row.correlationId || "-"}</div>
                      </div>
                      <div className="text-right text-xs">
                        <Badge variant="outline" className="border-gray-700 text-gray-200">{row.outcome}</Badge>
                        <div className={cn("mt-1", row.mode === "SIMULATED" ? "text-amber-300" : "text-gray-400")}>
                          {row.mode}
                        </div>
                        <div className="text-gray-500 mt-1">{formatTime(row.createdAt)}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selectedRunId} onOpenChange={(open) => (!open ? setSelectedRunId(null) : null)}>
        <SheetContent side="right" className="w-[760px] max-w-[100vw] bg-gray-950 border-gray-800 text-gray-100">
          <SheetHeader>
            <SheetTitle className="text-white">Action Run #{selectedRunId || "-"}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-100px)] mt-4 pr-2">
            {detailQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 bg-gray-800" />
                ))}
              </div>
            ) : detailQuery.data ? (
              <div className="space-y-4">
                <Card className="bg-gray-900/40 border-gray-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-white">Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-1 text-gray-300">
                    <div>action={detailQuery.data.run.actionType}</div>
                    <div>status={detailQuery.data.run.status}</div>
                    <div>outcome={detailQuery.data.run.outcome}</div>
                    <div>mode={detailQuery.data.run.mode}</div>
                    <div>correlation_id={detailQuery.data.run.correlationId || "-"}</div>
                    <div>created_at={formatTime(detailQuery.data.run.createdAt)}</div>
                    <div>finished_at={formatTime(detailQuery.data.run.finishedAt)}</div>
                  </CardContent>
                </Card>

                <Card className="bg-gray-900/40 border-gray-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-white">Receipts</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {detailQuery.data.receipts.length === 0 ? (
                      <div className="text-xs text-red-300 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" /> No receipts captured.
                      </div>
                    ) : (
                      detailQuery.data.receipts.map((receipt) => (
                        <div key={receipt.id} className="rounded-md border border-gray-800 bg-gray-900/30 p-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-gray-200">
                              {receipt.receiptType} • {receipt.entityType || "entity"}
                            </div>
                            <div className="text-gray-500">{formatTime(receipt.createdAt)}</div>
                          </div>
                          <div className="text-gray-400 mt-1">
                            affected_rows={receipt.affectedRows ?? 0} • ids={receipt.entityIds.join(", ") || "-"}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {receipt.evidenceUrl ? (
                              <a
                                href={receipt.evidenceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-blue-300 hover:underline"
                              >
                                <ExternalLink className="h-3.5 w-3.5" /> evidence
                              </a>
                            ) : null}
                            {receipt.entityIds.slice(0, 3).map((entityId) => {
                              const href = entityLink(receipt.entityType, entityId);
                              if (!href) return null;
                              return (
                                <a
                                  key={`${receipt.id}:${String(entityId)}`}
                                  href={href}
                                  className="inline-flex items-center gap-1 text-emerald-300 hover:underline"
                                >
                                  <Link2 className="h-3.5 w-3.5" /> open entity {String(entityId)}
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-gray-900/40 border-gray-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-white">Result Snapshots</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {detailQuery.data.results.map((result) => (
                      <div key={result.id} className="rounded-md border border-gray-800 bg-gray-900/30 p-2 text-xs">
                        <div className="text-gray-500">{formatTime(result.createdAt)}</div>
                        <pre className="mt-2 whitespace-pre-wrap break-words text-gray-300">
                          {JSON.stringify(result.result || {}, null, 2)}
                        </pre>
                        {result.error ? (
                          <pre className="mt-2 whitespace-pre-wrap break-words text-red-300">
                            {JSON.stringify(result.error, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-sm text-gray-400">Run detail unavailable.</div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
