import { Redirect, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { AppProTopBar } from "@/components/agentic/AppProTopBar";
import { AppProBottomNav } from "@/components/agentic/AppProBottomNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";

type AuditRow = {
  id: number;
  action: string;
  entityType?: string | null;
  createdAt?: string | null;
  userRole?: string | null;
};

export default function AppGovernanceLogsPage() {
  const session = useSession();
  const [location] = useLocation();

  if (!session.isAuthenticated || session.isGuest) {
    return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  }

  const query = useQuery<{ items: AuditRow[] }>({
    queryKey: ["/api/ece/audit/logs"],
    queryFn: async () => apiRequest("/api/ece/audit/logs?limit=60"),
    staleTime: 5_000,
  });

  const items = Array.isArray(query.data?.items) ? query.data!.items : [];

  return (
    <div data-testid="exportunity-governance-log" className="min-h-screen bg-[#F7F8FA] pb-24 text-[#07111F]">
      <AppProTopBar subtitle="Governance logs" />
      <main className="mx-auto w-full max-w-3xl space-y-3 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium text-slate-600">If the network records an execution, its evidence appears here.</div>
          <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]" onClick={() => query.refetch()}>
            Refresh
          </Button>
        </div>

        {query.isLoading ? (
          <div className="space-y-2">
            <div className="h-16 animate-pulse rounded-xl border border-slate-200 bg-white" />
            <div className="h-16 animate-pulse rounded-xl border border-slate-200 bg-white" />
            <div className="h-16 animate-pulse rounded-xl border border-slate-200 bg-white" />
          </div>
        ) : null}

        {!query.isLoading && !items.length ? (
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-5 text-sm text-slate-600">No recent audit events.</CardContent>
          </Card>
        ) : null}

        {items.map((row) => (
          <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-slate-950">{row.action}</div>
              <div className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">#{row.id}</div>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {row.createdAt ? new Date(row.createdAt).toLocaleString() : ""} {row.userRole ? `• ${row.userRole}` : ""}{" "}
              {row.entityType ? `• ${row.entityType}` : ""}
            </div>
          </div>
        ))}
      </main>
      <AppProBottomNav activeKey="operations" />
    </div>
  );
}
