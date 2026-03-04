import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, RefreshCw } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type UxAuditPayload = {
  ok: boolean;
  generatedAt: string;
  tenantKey: string | null;
  errors: Array<{ scope: string; message: string }>;
  routes: any[];
  menuItems: any[];
  stats: {
    routeCount: number;
    menuCount: number;
    missingMenuRoutes: number;
    uncoveredRoutes: number;
  };
  missingMenuLinks: any[];
  uncoveredRoutes: any[];
  registryUpdatedAt: string | null;
};

type IaAuditPayload = {
  ok: boolean;
  generatedAt: string | null;
  lastUpdated: string | null;
  duplicates: Array<{
    capabilityTag: string;
    canonicalRoute: string | null;
    routes: string[];
    apiOverlapThreshold: number;
  }>;
};

function downloadJson(filename: string, data: unknown) {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
}

export default function AdminUxAuditPage() {
  const auditQuery = useQuery<UxAuditPayload>({
    queryKey: ["admin_ux_audit_runner"],
    queryFn: async () => apiRequest("/api/admin/ux-audit"),
    staleTime: 0,
    retry: 0,
  });

  const iaQuery = useQuery<IaAuditPayload>({
    queryKey: ["admin_ia_pages_audit"],
    queryFn: async () => apiRequest("/api/admin/ia/pages-audit"),
    staleTime: 0,
    retry: 0,
  });

  const audit = auditQuery.data;
  const duplicates = iaQuery.data?.duplicates ?? [];

  const auditFilename = useMemo(() => {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    return `ux-audit-${ts}.json`;
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">UX Audit Runner</h1>
          <p className="text-gray-400">Routes, nav coverage, duplicates, and dead-end checks.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            onClick={() => {
              auditQuery.refetch();
              iaQuery.refetch();
            }}
            disabled={auditQuery.isFetching || iaQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${(auditQuery.isFetching || iaQuery.isFetching) ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="secondary"
            onClick={() => downloadJson(auditFilename, { audit: auditQuery.data, ia: iaQuery.data })}
            disabled={!auditQuery.data}
          >
            <Download className="h-4 w-4 mr-2" />
            Download JSON
          </Button>
          <Button
            variant="ghost"
            className="text-white/70 hover:text-white hover:bg-white/10"
            onClick={() => window.open("/api/admin/ux-audit", "_blank", "noreferrer")}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Raw JSON
          </Button>
        </div>
      </div>

      {(auditQuery.error || iaQuery.error) && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg">Errors</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-rose-200 space-y-2">
            {auditQuery.error ? <div>{String((auditQuery.error as any)?.message || auditQuery.error)}</div> : null}
            {iaQuery.error ? <div>{String((iaQuery.error as any)?.message || iaQuery.error)}</div> : null}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg">Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-200 space-y-2">
            <div>Tenant: <span className="text-white">{audit?.tenantKey || "unknown"}</span></div>
            <div>Generated: <span className="text-white">{audit?.generatedAt || "…"}</span></div>
            <div>Routes: <span className="text-white font-semibold">{audit?.stats?.routeCount ?? "…"}</span></div>
            <div>Menu items: <span className="text-white font-semibold">{audit?.stats?.menuCount ?? "…"}</span></div>
            <div>Missing menu links: <span className="text-white font-semibold">{audit?.stats?.missingMenuRoutes ?? "…"}</span></div>
            <div>Uncovered routes: <span className="text-white font-semibold">{audit?.stats?.uncoveredRoutes ?? "…"}</span></div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg">Duplicates (Admin IA)</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[220px] rounded-md border border-slate-800 bg-black/20">
              <div className="p-3 space-y-2">
                {duplicates.length ? (
                  duplicates.slice(0, 50).map((d) => (
                    <div key={d.capabilityTag} className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="text-xs text-white/70">capabilityTag</div>
                      <div className="text-sm text-white font-semibold">{d.capabilityTag}</div>
                      <div className="mt-1 text-xs text-white/60">
                        Canonical: <span className="text-white/90">{d.canonicalRoute || "unset"}</span>
                      </div>
                      <div className="mt-2 text-xs text-white/60">{d.routes.join(" • ")}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-white/60">No duplicates detected.</div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-lg">Missing Menu Links</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-white/70">Label</TableHead>
                  <TableHead className="text-white/70">Route</TableHead>
                  <TableHead className="text-white/70">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(audit?.missingMenuLinks || []).length ? (
                  (audit?.missingMenuLinks || []).slice(0, 200).map((m: any, idx: number) => (
                    <TableRow key={`${m?.route || "missing"}-${idx}`}>
                      <TableCell className="text-white/90">{m?.label || "—"}</TableCell>
                      <TableCell className="text-amber-200">{m?.route || "—"}</TableCell>
                      <TableCell className="text-white/60">{m?.source || "—"}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-white/60">
                      No missing menu links detected.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

