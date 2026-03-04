import { useEffect, useMemo, useState, type PointerEvent } from "react";
import { Redirect, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bot, CheckCircle2, ChevronRight, MessageSquareText, Users } from "lucide-react";

import { AppProBottomNav } from "@/components/agentic/AppProBottomNav";
import { AppProTopBar } from "@/components/agentic/AppProTopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLocale, type Language } from "@/contexts/LocaleContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSession } from "@/lib/session";

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

type OperationsAgent = {
  id: number;
  display_name: string;
  status: "active" | "paused" | "cancelled";
  model_tier: string;
  template_title?: string | null;
  last_message?: string | null;
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
  agents: OperationsAgent[];
  tasks: OperationsTask[];
};

type OperationsTabKey = "inbox" | "team" | "clients" | "approvals";

type InboxRoom = {
  key: string;
  title: string;
  subtitle?: string | null;
  isPinned?: boolean;
  unreadCount?: number;
  lastMessage?: {
    content: string;
    createdAt: string;
    role: "user" | "assistant" | "system";
  } | null;
};

const CLIENT_ROOM_KEYS = new Set(["sales", "procurement", "support", "delivery", "wallet"]);
const DEFAULT_OPERATION_ROOMS: InboxRoom[] = [
  { key: "team", title: "AI Team Room", subtitle: "Coordinate agents and approvals", isPinned: true, unreadCount: 0 },
  { key: "sales", title: "Clients", subtitle: "Prospects, buyers, and follow-ups", isPinned: true, unreadCount: 0 },
  { key: "procurement", title: "Orders", subtitle: "Order flow and execution status", isPinned: true, unreadCount: 0 },
  { key: "wallet", title: "Payments", subtitle: "Payment requests and receipts", isPinned: true, unreadCount: 0 },
  { key: "support", title: "Support", subtitle: "Issues and escalations", isPinned: false, unreadCount: 0 },
];

const ROOM_TITLE_OVERRIDES: Record<string, string> = {
  sales: "Clients",
  procurement: "Orders",
  team: "AI Team Room",
  wallet: "Payments",
};

const OPS_UI: Record<Language, Record<string, string>> = {
  en: {
    "ops.tab.inbox": "Inbox",
    "ops.tab.team": "AI Team",
    "ops.tab.clients": "Clients",
    "ops.tab.approvals": "Approvals",
    "ops.metric.activeRequests": "Active requests",
    "ops.metric.lateRisk": "Late risk",
    "ops.panel.inbox.heading": "Inbox",
    "ops.panel.team.heading": "AI Team",
    "ops.panel.clients.heading": "Clients",
    "ops.panel.approvals.heading": "Approvals",
    "ops.queue.heading": "Approval queue",
  },
  fr: {
    "ops.tab.inbox": "Boite de reception",
    "ops.tab.team": "Equipe IA",
    "ops.tab.clients": "Clients",
    "ops.tab.approvals": "A valider",
    "ops.metric.activeRequests": "Demandes actives",
    "ops.metric.lateRisk": "Risque de retard",
    "ops.panel.inbox.heading": "Boite de reception",
    "ops.panel.team.heading": "Equipe IA",
    "ops.panel.clients.heading": "Clients",
    "ops.panel.approvals.heading": "A valider",
    "ops.queue.heading": "File de validation",
  },
  ar: {
    "ops.tab.inbox": "Inbox",
    "ops.tab.team": "AI Team",
    "ops.tab.clients": "Clients",
    "ops.tab.approvals": "Approvals",
    "ops.metric.activeRequests": "Active requests",
    "ops.metric.lateRisk": "Late risk",
    "ops.panel.inbox.heading": "Inbox",
    "ops.panel.team.heading": "AI Team",
    "ops.panel.clients.heading": "Clients",
    "ops.panel.approvals.heading": "Approvals",
    "ops.queue.heading": "Approval queue",
  },
};

function labelFor(language: Language, key: string) {
  return OPS_UI[language]?.[key] || OPS_UI.en[key] || key;
}

function readTabFromLocation(location: string): OperationsTabKey {
  try {
    const parsed = new URL(location, "https://app.local");
    const candidate = String(parsed.searchParams.get("tab") || "").trim().toLowerCase();
    if (candidate === "inbox" || candidate === "clients" || candidate === "team" || candidate === "approvals") return candidate;
    if (candidate === "live") return "inbox";
    if (candidate === "tickets") return "clients";
    if (candidate === "agents") return "team";
    if (candidate === "tasks") return "approvals";
  } catch {
    // ignore parse errors
  }
  return "inbox";
}

function sortRooms(rooms: InboxRoom[]) {
  return [...rooms].sort((a, b) => {
    const pinnedA = Boolean(a.isPinned);
    const pinnedB = Boolean(b.isPinned);
    if (pinnedA && !pinnedB) return -1;
    if (!pinnedA && pinnedB) return 1;
    const at = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bt = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return bt - at;
  });
}

function formatTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function compactMoney(value: number | null | undefined) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

export default function AppProOperationsPage() {
  const { isAuthenticated, isGuest } = useSession();
  const [location, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<OperationsTabKey>(() => readTabFromLocation(location));
  const [pressedTab, setPressedTab] = useState<OperationsTabKey | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const { language } = useLocale();
  const { toast } = useToast();

  const centerQuery = useQuery<OperationsCenterResponse>({
    queryKey: ["/api/ece/operations/center"],
    staleTime: 5_000,
    refetchInterval: 10_000,
    retry: 1,
    enabled: isAuthenticated && !isGuest,
  });

  const roomsQuery = useQuery<{ rooms: InboxRoom[] }>({
    queryKey: ["/api/ece/inbox/rooms"],
    staleTime: 10_000,
    refetchInterval: 12_000,
    retry: 1,
    enabled: isAuthenticated && !isGuest,
  });

  useEffect(() => {
    // Sync initial/deep-link tab from URL, but do NOT keep overriding user-driven tab switches.
    // (Previously, any click would be reset back to the default `tab` from the URL.)
    setActiveTab(readTabFromLocation(location));
    setPressedTab(null);
  }, [location]);

  const approveTask = useMutation({
    mutationFn: async (taskId: number) => apiRequest(`/api/ece/agents/tasks/${taskId}/approve`, "POST", {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/ece/operations/center"] });
    },
    onError: (error: any) => {
      toast({ title: "Approval failed", description: error?.message || "Could not approve action", variant: "destructive" });
    },
  });

  const rejectTask = useMutation({
    mutationFn: async (taskId: number) =>
      apiRequest(`/api/ece/agents/tasks/${taskId}/reject`, "POST", { reason: "Rejected from Operations Center" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/ece/operations/center"] });
    },
    onError: (error: any) => {
      toast({ title: "Reject failed", description: error?.message || "Could not reject action", variant: "destructive" });
    },
  });

  if (!isAuthenticated || isGuest) {
    return <Redirect to={`/pro/login?next=${encodeURIComponent(location)}`} />;
  }

  const summary = centerQuery.data?.summary;
  const live = centerQuery.data?.live || [];
  const agents = centerQuery.data?.agents || [];
  const tasks = centerQuery.data?.tasks || [];

  const allRooms = sortRooms(
    (roomsQuery.data?.rooms || []).map((room) => ({
      ...room,
      title: ROOM_TITLE_OVERRIDES[room.key] || room.title,
    })),
  );
  const resilientRooms = allRooms.length ? allRooms : DEFAULT_OPERATION_ROOMS;
  const clientRooms = allRooms.filter((room) => CLIENT_ROOM_KEYS.has(room.key));
  const resilientClientRooms = clientRooms.length
    ? clientRooms
    : DEFAULT_OPERATION_ROOMS.filter((room) => CLIENT_ROOM_KEYS.has(room.key));
  const filteredClientRooms = clientRooms.filter((room) => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return true;
    const text = `${room.title} ${room.subtitle || ""} ${room.lastMessage?.content || ""}`.toLowerCase();
    return text.includes(q);
  });
  const filteredResilientClientRooms = (filteredClientRooms.length ? filteredClientRooms : resilientClientRooms).filter((room) => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return true;
    const text = `${room.title} ${room.subtitle || ""} ${room.lastMessage?.content || ""}`.toLowerCase();
    return text.includes(q);
  });
  const needsApproval = useMemo(() => tasks.filter((task) => task.status === "needs_approval"), [tasks]);
  const isBootstrapping = (centerQuery.isLoading || roomsQuery.isLoading) && !allRooms.length && !live.length;

  const handleTabPressStart = (event: PointerEvent<HTMLButtonElement>, nextTab: OperationsTabKey) => {
    setPressedTab(nextTab);

    // iOS Safari has been flaky with click delays and pointerup not firing when an element loses hit target.
    // Switching on pointerdown makes the UI feel instant and prevents "dead tap" perception.
    setActiveTab(nextTab);

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore capture failures
    }
  };

  const handleTabPressEnd = () => {
    setPressedTab(null);
  };

  return (
    <div className="min-h-screen bg-gray-950 pb-32 text-white">
      <AppProTopBar subtitle="Operations Center" />
      <main className="mx-auto w-full max-w-3xl px-4 pb-4 pt-8">
        <div className="relative z-40 mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="ops-chip-active-requests"
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/85 hover:bg-white/10"
            onClick={() => {
              setActiveTab("clients");
            }}
          >
            {labelFor(language, "ops.metric.activeRequests")}: {summary?.activeTickets ?? 0}
          </button>
          <button
            type="button"
            data-testid="ops-chip-late-risk"
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/85 hover:bg-white/10"
            onClick={() => {
              setActiveTab("approvals");
            }}
          >
            {labelFor(language, "ops.metric.lateRisk")}: {summary?.slaRisks ?? 0}
          </button>
          <button
            type="button"
            data-testid="ops-chip-new-replies"
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/85 hover:bg-white/10"
            onClick={() => {
              setActiveTab("clients");
            }}
          >
            New replies: {summary?.newClientReplies ?? 0}
          </button>
          <button
            type="button"
            data-testid="ops-chip-received-today"
            className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-500/20"
            onClick={() => setLocation("/pro/money")}
          >
            Received today: {compactMoney(summary?.paymentsReceivedToday)} XOF
          </button>
        </div>

        <section className="relative z-50 mt-3 pointer-events-auto" aria-label="Operations tabs" data-testid="ops-tabs">
          <div className="pointer-events-auto grid grid-cols-4 overflow-hidden rounded-xl border border-white/10 bg-white/5">
            <button
              type="button"
              data-testid="ops-tab-inbox"
              aria-pressed={activeTab === "inbox"}
              onPointerDown={(event) => handleTabPressStart(event, "inbox")}
              onPointerUp={handleTabPressEnd}
              onPointerCancel={handleTabPressEnd}
              onPointerLeave={handleTabPressEnd}
              onClick={() => setActiveTab("inbox")}
              className={`touch-manipulation min-h-[44px] w-full px-2 py-2 text-sm font-medium transition ${activeTab === "inbox" ? "bg-amber-500/20 text-amber-200" : "text-white/80 hover:bg-white/10"} ${pressedTab === "inbox" ? "scale-[0.98] opacity-85" : ""}`}
            >
              {labelFor(language, "ops.tab.inbox")}
            </button>
            <button
              type="button"
              data-testid="ops-tab-ai-team"
              aria-pressed={activeTab === "team"}
              onPointerDown={(event) => handleTabPressStart(event, "team")}
              onPointerUp={handleTabPressEnd}
              onPointerCancel={handleTabPressEnd}
              onPointerLeave={handleTabPressEnd}
              onClick={() => setActiveTab("team")}
              className={`touch-manipulation min-h-[44px] w-full px-2 py-2 text-sm font-medium transition ${activeTab === "team" ? "bg-amber-500/20 text-amber-200" : "text-white/80 hover:bg-white/10"} ${pressedTab === "team" ? "scale-[0.98] opacity-85" : ""}`}
            >
              {labelFor(language, "ops.tab.team")}
            </button>
            <button
              type="button"
              data-testid="ops-tab-clients"
              aria-pressed={activeTab === "clients"}
              onPointerDown={(event) => handleTabPressStart(event, "clients")}
              onPointerUp={handleTabPressEnd}
              onPointerCancel={handleTabPressEnd}
              onPointerLeave={handleTabPressEnd}
              onClick={() => setActiveTab("clients")}
              className={`touch-manipulation min-h-[44px] w-full px-2 py-2 text-sm font-medium transition ${activeTab === "clients" ? "bg-amber-500/20 text-amber-200" : "text-white/80 hover:bg-white/10"} ${pressedTab === "clients" ? "scale-[0.98] opacity-85" : ""}`}
            >
              {labelFor(language, "ops.tab.clients")}
            </button>
            <button
              type="button"
              data-testid="ops-tab-approvals"
              aria-pressed={activeTab === "approvals"}
              onPointerDown={(event) => handleTabPressStart(event, "approvals")}
              onPointerUp={handleTabPressEnd}
              onPointerCancel={handleTabPressEnd}
              onPointerLeave={handleTabPressEnd}
              onClick={() => setActiveTab("approvals")}
              className={`touch-manipulation min-h-[44px] w-full px-2 py-2 text-sm font-medium transition ${activeTab === "approvals" ? "bg-amber-500/20 text-amber-200" : "text-white/80 hover:bg-white/10"} ${pressedTab === "approvals" ? "scale-[0.98] opacity-85" : ""}`}
            >
              {labelFor(language, "ops.tab.approvals")}
            </button>
          </div>
        </section>

        {activeTab === "inbox" ? (
          <section className="mt-4 space-y-3" data-testid="ops-panel-inbox">
            <h2 className="text-base font-semibold text-white">{labelFor(language, "ops.panel.inbox.heading")}</h2>
            {isBootstrapping ? (
              <div className="space-y-2">
                <div className="h-14 animate-pulse rounded-xl border border-white/10 bg-white/5" />
                <div className="h-14 animate-pulse rounded-xl border border-white/10 bg-white/5" />
                <div className="h-14 animate-pulse rounded-xl border border-white/10 bg-white/5" />
              </div>
            ) : null}
            {resilientRooms.map((room) => (
              <button
                key={room.key}
                type="button"
                className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-left hover:bg-white/10"
                onClick={() => setLocation(`/pro/threads/${encodeURIComponent(room.key)}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{room.title}</div>
                    <div className="mt-1 truncate text-xs text-white/65">
                      {room.lastMessage?.content || room.subtitle || "Open conversation"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[11px] text-white/50">{formatTime(room.lastMessage?.createdAt)}</div>
                    {room.unreadCount ? (
                      <span className="mt-1 inline-flex rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] text-amber-100">
                        {room.unreadCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}

            {isBootstrapping ? (
              <Card className="border-white/10 bg-white/5">
                <CardContent className="p-5 text-sm text-white/70">Loading live conversations...</CardContent>
              </Card>
            ) : null}

            {!roomsQuery.isLoading && !allRooms.length ? (
              <Card className="border-white/10 bg-white/5">
                <CardContent className="space-y-3 p-5 text-sm text-white/70">
                  <div>No conversations yet. Start from AI Team or Payments.</div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="bg-amber-500 text-black hover:bg-amber-400" onClick={() => setLocation("/pro/threads/team")}>
                      Open AI Team
                    </Button>
                    <Button size="sm" variant="outline" className="border-white/20 text-white/90" onClick={() => setLocation("/pro/money?modal=receive")}>
                      Receive payment
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {live.slice(0, 4).map((event) => (
              <button
                key={event.id}
                type="button"
                className="w-full rounded-xl border border-white/10 bg-black/30 p-4 text-left hover:bg-white/5"
                onClick={() => setLocation(event.link || "/app")}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-white/90">{event.title}</div>
                    {event.detail ? <div className="mt-1 truncate text-xs text-white/60">{event.detail}</div> : null}
                  </div>
                  <ChevronRight className="h-4 w-4 text-white/35" />
                </div>
              </button>
            ))}
          </section>
        ) : null}

        {activeTab === "team" ? (
          <section className="mt-4 space-y-3" data-testid="ops-panel-ai-team">
            <h2 className="text-base font-semibold text-white">{labelFor(language, "ops.panel.team.heading")}</h2>
            {centerQuery.isLoading ? <div className="h-14 animate-pulse rounded-xl border border-white/10 bg-white/5" /> : null}
            <button
              type="button"
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-left hover:bg-white/10"
              onClick={() => setLocation("/pro/threads/team")}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Users className="h-4 w-4 text-amber-300" />
                  AI Team Room
                </div>
                <ChevronRight className="h-4 w-4 text-white/35" />
              </div>
            </button>

            {agents.map((agent) => (
              <Card key={agent.id} className="border-white/10 bg-white/5">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Bot className="h-4 w-4 text-amber-300" />
                        {agent.display_name}
                      </div>
                      <div className="mt-1 text-xs text-white/65">
                        {agent.template_title || "Agent"} | {agent.model_tier} | {agent.status}
                      </div>
                      {agent.last_message ? <div className="mt-2 truncate text-xs text-white/55">{agent.last_message}</div> : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {!centerQuery.isLoading && !agents.length ? (
              <Card className="border-white/10 bg-white/5">
                <CardContent className="space-y-3 p-5 text-sm text-white/70">
                  <div>No active agents yet. Activate the AI Team to continue.</div>
                  <Button size="sm" className="bg-amber-500 text-black hover:bg-amber-400" onClick={() => setLocation("/pro/threads/team")}>
                    Open AI Team room
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </section>
        ) : null}

        {activeTab === "clients" ? (
          <section className="mt-4 space-y-3" data-testid="ops-panel-clients">
            <h2 className="text-base font-semibold text-white">{labelFor(language, "ops.panel.clients.heading")}</h2>
            {roomsQuery.isLoading ? <div className="h-14 animate-pulse rounded-xl border border-white/10 bg-white/5" /> : null}
            <div className="relative">
              <MessageSquareText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <Input
                value={clientSearch}
                onChange={(event) => setClientSearch(event.target.value)}
                placeholder="Search clients, orders, support..."
                className="border-white/10 bg-white/5 pl-9 text-white placeholder:text-white/45"
              />
            </div>

            {filteredResilientClientRooms.map((room) => (
              <button
                key={room.key}
                type="button"
                className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-left hover:bg-white/10"
                onClick={() => setLocation(`/pro/threads/${encodeURIComponent(room.key)}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{room.title}</div>
                    <div className="mt-1 truncate text-xs text-white/65">
                      {room.lastMessage?.content || room.subtitle || "Open conversation"}
                    </div>
                  </div>
                  <div className="text-[11px] text-white/50">{formatTime(room.lastMessage?.createdAt)}</div>
                </div>
              </button>
            ))}

            {!roomsQuery.isLoading && !filteredResilientClientRooms.length ? (
              <Card className="border-white/10 bg-white/5">
                <CardContent className="space-y-3 p-5 text-sm text-white/70">
                  <div>No client conversations yet. Start a conversation from Orders or Clients.</div>
                  <Button size="sm" variant="outline" className="border-white/20 text-white/90" onClick={() => setLocation("/pro/threads/sales")}>
                    Open Clients room
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </section>
        ) : null}

        {activeTab === "approvals" ? (
          <section className="mt-4 space-y-3" data-testid="ops-panel-approvals">
            <h2 className="text-base font-semibold text-white">{labelFor(language, "ops.panel.approvals.heading")}</h2>
            {centerQuery.isLoading ? <div className="h-14 animate-pulse rounded-xl border border-white/10 bg-white/5" /> : null}
            {needsApproval.length ? (
              <Card className="border-amber-500/30 bg-amber-500/10">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm text-amber-100">
                    <AlertTriangle className="h-4 w-4" />
                    {labelFor(language, "ops.queue.heading")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {needsApproval.map((task) => (
                    <div key={task.id} className="rounded-lg border border-amber-400/30 bg-black/20 p-3">
                      <div className="text-xs font-semibold text-amber-100">{task.title}</div>
                      <div className="mt-1 text-[11px] text-amber-100/80">{task.agent_name || `Agent #${task.org_agent_id}`}</div>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          className="bg-emerald-500 text-black hover:bg-emerald-400"
                          disabled={approveTask.isPending}
                          onClick={() => approveTask.mutate(task.id)}
                        >
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-white/20 text-white/90"
                          disabled={rejectTask.isPending}
                          onClick={() => rejectTask.mutate(task.id)}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {!centerQuery.isLoading && !needsApproval.length ? (
              <Card className="border-white/10 bg-white/5">
                <CardContent className="p-5 text-sm text-white/70">No approvals pending right now.</CardContent>
              </Card>
            ) : null}
          </section>
        ) : null}
      </main>

      <AppProBottomNav activeKey="operations" />
    </div>
  );
}
