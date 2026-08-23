import { useEffect, useMemo, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";

import { AppProBottomNav } from "@/components/agentic/AppProBottomNav";
import { AppProTopBar } from "@/components/agentic/AppProTopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type OperationsSummary = {
  activeTickets: number;
  slaRisks: number;
  newClientReplies: number;
  paymentsReceivedToday: number;
  pendingApprovals: number;
};

type OperationsEvent = {
  id: string;
  title: string;
  detail?: string | null;
  severity: "low" | "medium" | "high";
  createdAt: string;
  link?: string | null;
  category?: "company" | "clients" | "team" | "money" | "approvals";
};

type OperationsTask = {
  id: number;
  title: string;
  status: string;
  type: string;
  org_agent_id: number;
  agent_name?: string | null;
  created_at: string;
};

type OperationsCenterResponse = {
  summary: OperationsSummary;
  live: OperationsEvent[];
  tasks: OperationsTask[];
};

type FilterKey = "all" | "orders" | "payments" | "approvals";

function formatTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

export default function AppProActionsPage() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isGuest } = useSession();
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    const queryStart = location.indexOf("?");
    const search = queryStart >= 0 ? location.slice(queryStart + 1) : "";
    const requested = new URLSearchParams(search).get("filter");
    if (requested === "orders" || requested === "payments" || requested === "approvals" || requested === "all") {
      setFilter(requested);
      return;
    }
    setFilter("all");
  }, [location]);

  const setFilterWithRoute = (value: FilterKey) => {
    setFilter(value);
    setLocation(value === "all" ? "/app/actions" : `/app/actions?filter=${value}`);
  };

  const centerQuery = useQuery<OperationsCenterResponse>({
    queryKey: ["/api/ece/operations/center"],
    staleTime: 5_000,
    refetchInterval: 10_000,
    retry: 1,
    enabled: isAuthenticated && !isGuest,
  });

  const approveTask = useMutation({
    mutationFn: async (taskId: number) => apiRequest(`/api/ece/agents/tasks/${taskId}/approve`, "POST", {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/ece/operations/center"] });
      toast({ title: "Action approved" });
    },
    onError: (error: any) => {
      toast({ title: "Approval failed", description: error?.message || "Could not approve action", variant: "destructive" });
    },
  });

  if (!isAuthenticated || isGuest) {
    return <Redirect to={`/pro/login?next=${encodeURIComponent(location)}`} />;
  }

  const summary = centerQuery.data?.summary;
  const tasks = centerQuery.data?.tasks || [];
  const events = centerQuery.data?.live || [];
  const pendingApprovals = useMemo(() => tasks.filter((task) => task.status === "needs_approval"), [tasks]);

  const filteredEvents = useMemo(() => {
    if (filter === "all") return events;
    if (filter === "orders") return events.filter((event) => event.category === "clients");
    if (filter === "payments") return events.filter((event) => event.category === "money");
    if (filter === "approvals") return events.filter((event) => event.category === "approvals");
    return events;
  }, [events, filter]);

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-24 text-[#07111F]">
      <AppProTopBar subtitle="Actions" />
      <main className="mx-auto w-full max-w-3xl px-4 py-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            data-testid="actions-filter-orders"
            aria-pressed={filter === "orders"}
            className={cn(
              "rounded-xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm hover:border-[#F5A623]/50",
              filter === "orders" && "border-[#F5A623]/50 bg-[#FFF8E8]",
            )}
            onClick={() => setFilterWithRoute("orders")}
          >
            <div className="text-[11px] font-bold text-slate-500">Orders</div>
            <div className="mt-1 text-base font-black">{summary?.activeTickets ?? 0}</div>
          </button>
          <button
            type="button"
            data-testid="actions-filter-approvals"
            aria-pressed={filter === "approvals"}
            className={cn(
              "rounded-xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm hover:border-[#F5A623]/50",
              filter === "approvals" && "border-[#F5A623]/50 bg-[#FFF8E8]",
            )}
            onClick={() => setFilterWithRoute("approvals")}
          >
            <div className="text-[11px] font-bold text-slate-500">Approvals</div>
            <div className="mt-1 text-base font-black">{summary?.pendingApprovals ?? 0}</div>
          </button>
          <button
            type="button"
            data-testid="actions-filter-payments"
            aria-pressed={filter === "payments"}
            className={cn(
              "rounded-xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm hover:border-[#F5A623]/50",
              filter === "payments" && "border-[#F5A623]/50 bg-[#FFF8E8]",
            )}
            onClick={() => setFilterWithRoute("payments")}
          >
            <div className="text-[11px] font-bold text-slate-500">Payments</div>
            <div className="mt-1 text-base font-black">
              {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(summary?.paymentsReceivedToday ?? 0)} XOF
            </div>
          </button>
          <button
            type="button"
            data-testid="actions-filter-all"
            aria-pressed={filter === "all"}
            className={cn(
              "rounded-xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm hover:border-[#F5A623]/50",
              filter === "all" && "border-[#F5A623]/50 bg-[#FFF8E8]",
            )}
            onClick={() => setFilterWithRoute("all")}
          >
            <div className="text-[11px] font-bold text-slate-500">Late risk</div>
            <div className="mt-1 text-base font-black">{summary?.slaRisks ?? 0}</div>
          </button>
        </div>

        {pendingApprovals.length > 0 ? (
          <Card className="mt-4 border-[#F5A623]/35 bg-[#FFF8E8]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-[#9A6200]" />
                Approval queue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pendingApprovals.slice(0, 5).map((task) => (
                <div key={task.id} className="rounded-lg border border-[#F5A623]/25 bg-white p-3">
                  <div className="text-sm font-semibold">{task.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{task.agent_name || "Assigned agent"}</div>
                  <div className="mt-2">
                    <Button
                      size="sm"
                      className="bg-emerald-500 text-black hover:bg-emerald-400"
                      disabled={approveTask.isPending}
                      onClick={() => approveTask.mutate(task.id)}
                    >
                      Approve
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <section className="mt-4 space-y-2" data-testid="actions-feed">
          {filteredEvents.map((event) => (
            <button
              key={event.id}
              type="button"
              className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-[#F5A623]/50"
              onClick={() => setLocation(event.link || "/pro/operations")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{event.title}</div>
                  {event.detail ? <div className="mt-1 line-clamp-2 text-xs text-slate-500">{event.detail}</div> : null}
                </div>
                <div className="shrink-0 text-[11px] text-slate-400">{formatTime(event.createdAt)}</div>
              </div>
              <div className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#9A6200]">
                Open
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </button>
          ))}

          {!centerQuery.isLoading && !filteredEvents.length ? (
            <Card className="border-slate-200 bg-white">
              <CardContent className="space-y-3 p-4 text-sm text-slate-600">
                <div>No active items in this filter.</div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-slate-200 text-slate-700"
                  onClick={() => setLocation("/pro/operations")}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Open General Operations
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </section>
      </main>
      <AppProBottomNav activeKey="operations" />
    </div>
  );
}
