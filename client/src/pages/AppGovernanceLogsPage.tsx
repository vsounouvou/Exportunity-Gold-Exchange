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
    <div className="min-h-screen bg-gray-950 pb-32 text-white">
      <AppProTopBar subtitle="Governance logs" />
      <main className="mx-auto w-full max-w-3xl px-4 pb-4 pt-6 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-white/70">If the platform says it executed, it must show here.</div>
          <Button variant="outline" className="border-white/15 text-white/80 hover:bg-white/10" onClick={() => query.refetch()}>
            Refresh
          </Button>
        </div>

        {query.isLoading ? (
          <div className="space-y-2">
            <div className="h-16 animate-pulse rounded-xl border border-white/10 bg-white/5" />
            <div className="h-16 animate-pulse rounded-xl border border-white/10 bg-white/5" />
            <div className="h-16 animate-pulse rounded-xl border border-white/10 bg-white/5" />
          </div>
        ) : null}

        {!query.isLoading && !items.length ? (
          <Card className="border-white/10 bg-white/5">
            <CardContent className="p-5 text-sm text-white/70">No recent audit events.</CardContent>
          </Card>
        ) : null}

        {items.map((row) => (
          <div key={row.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-white">{row.action}</div>
              <div className="text-[11px] text-white/55">#{row.id}</div>
            </div>
            <div className="mt-1 text-xs text-white/65">
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
