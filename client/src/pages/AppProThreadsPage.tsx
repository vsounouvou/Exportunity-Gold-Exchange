import { useEffect, useMemo, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Bot, Building2, CheckCircle2, ChevronRight, MessageSquareText, Pin, Search, ShieldAlert, Users, Wallet } from "lucide-react";

import { AppProBottomNav } from "@/components/agentic/AppProBottomNav";
import { AppProTopBar } from "@/components/agentic/AppProTopBar";
import { ProSideNav } from "@/components/agentic/ProSideNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/lib/session";

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

type OperationsEvent = {
  id: string;
  title: string;
  detail?: string | null;
  severity: "low" | "medium" | "high";
  createdAt: string;
  link?: string | null;
  category?: "company" | "clients" | "team" | "money" | "approvals";
};

type OperationsSummary = {
  activeTickets: number;
  slaRisks: number;
  newClientReplies: number;
  paymentsReceivedToday: number;
  pendingApprovals: number;
};

type OperationsCenterResponse = {
  summary: OperationsSummary;
  live: OperationsEvent[];
};

type AgentThread = {
  org_agent_id: number;
  display_name: string;
  last_message: string | null;
  last_message_at: string | null;
};

const CLIENT_ROOM_KEYS = new Set(["sales", "procurement", "support", "delivery", "wallet"]);

function readTabFromLocation(location: string) {
  try {
    const parsed = new URL(location, "https://app.local");
    const candidate = String(parsed.searchParams.get("tab") || "").trim().toLowerCase();
    if (candidate === "company" || candidate === "clients" || candidate === "team") return candidate;
  } catch {
    // ignore parse errors
  }
  return "company";
}

function formatTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function iconForCategory(category: OperationsEvent["category"]) {
  if (category === "money") return <Wallet className="h-4 w-4 text-emerald-300" />;
  if (category === "approvals") return <CheckCircle2 className="h-4 w-4 text-amber-300" />;
  if (category === "team") return <Users className="h-4 w-4 text-indigo-300" />;
  if (category === "clients") return <MessageSquareText className="h-4 w-4 text-cyan-300" />;
  return <ShieldAlert className="h-4 w-4 text-white/70" />;
}

function replyLinkFromEvent(link: string | null | undefined) {
  const value = String(link || "").trim();
  if (value.startsWith("/app/room/") || value.startsWith("/pro/room/")) return value;
  if (value.includes("money")) return "/pro/threads/wallet";
  if (value.includes("clients")) return "/pro/threads/sales";
  return "/pro/threads/team";
}

export default function AppProThreadsPage() {
  const { isAuthenticated, isGuest } = useSession();
  const [location, setLocation] = useLocation();
  const [tab, setTab] = useState(() => readTabFromLocation(location));
  const [query, setQuery] = useState("");

  const roomsQuery = useQuery<{ rooms: InboxRoom[] }>({
    queryKey: ["/api/ece/inbox/rooms"],
    staleTime: 10_000,
    refetchInterval: 12_000,
    retry: 1,
    enabled: isAuthenticated && !isGuest,
  });

  const centerQuery = useQuery<OperationsCenterResponse>({
    queryKey: ["/api/ece/operations/center"],
    staleTime: 8_000,
    refetchInterval: 10_000,
    retry: 1,
    enabled: isAuthenticated && !isGuest,
  });

  const teamThreadsQuery = useQuery<{ items: AgentThread[] }>({
    queryKey: ["/api/ece/agents/threads"],
    staleTime: 8_000,
    refetchInterval: 10_000,
    retry: 1,
    enabled: isAuthenticated && !isGuest,
  });

  useEffect(() => {
    const next = readTabFromLocation(location);
    if (next !== tab) setTab(next);
  }, [location, tab]);

  if (!isAuthenticated || isGuest) {
    return <Redirect to={`/pro/login?next=${encodeURIComponent(location)}`} />;
  }

  const rooms = roomsQuery.data?.rooms || [];

  const clientRooms = rooms
    .filter((room) => CLIENT_ROOM_KEYS.has(room.key))
    .filter((room) => {
      const normalized = query.trim().toLowerCase();
      if (!normalized) return true;
      const text = `${room.title} ${room.subtitle || ""} ${room.lastMessage?.content || ""}`.toLowerCase();
      return text.includes(normalized);
    })
    .sort((a, b) => {
      const pinnedA = Boolean(a.isPinned);
      const pinnedB = Boolean(b.isPinned);
      if (pinnedA && !pinnedB) return -1;
      if (!pinnedA && pinnedB) return 1;
      const at = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bt = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bt - at;
    });

  const companyFeed = centerQuery.data?.live || [];
  const summary = centerQuery.data?.summary;
  const teamThreads = teamThreadsQuery.data?.items || [];

  return (
      <div className="min-h-screen bg-gray-950 pb-32 text-white">
      <ProSideNav activeKey="operations" />
      <div className="md:ml-56">
        <AppProTopBar subtitle="Threads" />
        <main className="mx-auto w-full max-w-3xl px-4 py-4">
        <Tabs
          value={tab}
          onValueChange={(next) => {
            const safe = next === "clients" || next === "team" ? next : "company";
            setTab(safe);
            setLocation(safe === "company" ? "/pro/threads" : `/pro/threads?tab=${safe}`, { replace: true });
          }}
        >
          <TabsList className="grid w-full grid-cols-3 border border-white/10 bg-white/5">
            <TabsTrigger value="company">Company</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
          </TabsList>

          <TabsContent value="company" className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Card className="border-white/10 bg-white/5">
                <CardContent className="p-3">
                  <div className="text-[11px] text-white/60">Active requests</div>
                  <div className="mt-1 text-base font-semibold">{summary?.activeTickets ?? 0}</div>
                </CardContent>
              </Card>
              <Card className="border-white/10 bg-white/5">
                <CardContent className="p-3">
                  <div className="text-[11px] text-white/60">Late risk</div>
                  <div className="mt-1 text-base font-semibold">{summary?.slaRisks ?? 0}</div>
                </CardContent>
              </Card>
              <Card className="border-white/10 bg-white/5">
                <CardContent className="p-3">
                  <div className="text-[11px] text-white/60">Client replies</div>
                  <div className="mt-1 text-base font-semibold">{summary?.newClientReplies ?? 0}</div>
                </CardContent>
              </Card>
              <Card className="border-white/10 bg-white/5">
                <CardContent className="p-3">
                  <div className="text-[11px] text-white/60">Today received</div>
                  <div className="mt-1 text-base font-semibold">
                    {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(summary?.paymentsReceivedToday ?? 0)}
                  </div>
                </CardContent>
              </Card>
              <Card className="border-white/10 bg-white/5">
                <CardContent className="p-3">
                  <div className="text-[11px] text-white/60">Approvals</div>
                  <div className="mt-1 text-base font-semibold">{summary?.pendingApprovals ?? 0}</div>
                </CardContent>
              </Card>
            </div>

            {companyFeed.map((event) => (
              <Card key={event.id} className="border-white/10 bg-white/5">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        {iconForCategory(event.category)}
                        <span className="truncate">{event.title}</span>
                      </div>
                      {event.detail ? <div className="mt-1 line-clamp-2 text-xs text-white/65">{event.detail}</div> : null}
                    </div>
                    <div className="shrink-0 text-[11px] text-white/50">{formatTime(event.createdAt)}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-amber-500 text-black hover:bg-amber-400"
                      onClick={() => setLocation(event.link || "/pro/operations")}
                    >
                      Open
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/20 text-white/90"
                      onClick={() => setLocation(replyLinkFromEvent(event.link))}
                    >
                      Reply
                    </Button>
                    {event.category === "approvals" || event.severity === "high" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-emerald-400/40 text-emerald-200"
                        onClick={() => setLocation("/app/approvals")}
                      >
                        Approve
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}

            {!centerQuery.isLoading && !companyFeed.length ? (
              <Card className="border-white/10 bg-white/5">
                <CardContent className="space-y-3 p-5 text-sm text-white/70">
                  <div>No company activity yet. Start a client, order, or payment flow.</div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="bg-amber-500 text-black hover:bg-amber-400" onClick={() => setLocation("/pro/operations")}>
                      Open Operations
                    </Button>
                    <Button size="sm" variant="outline" className="border-white/20 text-white/90" onClick={() => setLocation("/pro/money?modal=receive")}>
                      Receive payment
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          <TabsContent value="clients" className="mt-4 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search clients, orders, support..."
                className="border-white/10 bg-white/5 pl-9 text-white placeholder:text-white/45"
              />
            </div>

            {clientRooms.map((room) => (
              <button
                key={room.key}
                type="button"
                className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-left hover:bg-white/10"
                onClick={() => setLocation(`/pro/threads/${encodeURIComponent(room.key)}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-semibold">{room.title}</div>
                      {room.isPinned ? <Pin className="h-3.5 w-3.5 text-amber-300" /> : null}
                    </div>
                    <div className="mt-1 truncate text-xs text-white/60">
                      {room.lastMessage?.content || room.subtitle || "Open thread"}
                    </div>
                  </div>
                  <div className="shrink-0 text-[11px] text-white/45">{formatTime(room.lastMessage?.createdAt)}</div>
                </div>
              </button>
            ))}

            {!roomsQuery.isLoading && !clientRooms.length ? (
              <Card className="border-white/10 bg-white/5">
                <CardContent className="space-y-3 p-5 text-sm text-white/70">
                  <div>No client threads yet. Open the Clients room to start.</div>
                  <Button size="sm" variant="outline" className="border-white/20 text-white/90" onClick={() => setLocation("/pro/threads/sales")}>
                    Open Clients room
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          <TabsContent value="team" className="mt-4 space-y-3">
            <button
              type="button"
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-left hover:bg-white/10"
              onClick={() => setLocation("/pro/threads/team")}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Users className="h-4 w-4 text-amber-300" />
                    AI Team Room
                  </div>
                  <div className="mt-1 text-xs text-white/65">Coordinate agents, approvals, and handoffs.</div>
                </div>
                <ChevronRight className="h-4 w-4 text-white/35" />
              </div>
            </button>

            {teamThreads.map((thread) => (
              <button
                key={thread.org_agent_id}
                type="button"
                className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-left hover:bg-white/10"
                onClick={() => setLocation(`/pro/agents/inbox?agentId=${thread.org_agent_id}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Bot className="h-4 w-4 text-amber-300" />
                      {thread.display_name}
                    </div>
                    <div className="mt-1 truncate text-xs text-white/65">{thread.last_message || "Open agent thread"}</div>
                  </div>
                  <div className="shrink-0 text-[11px] text-white/45">{formatTime(thread.last_message_at)}</div>
                </div>
              </button>
            ))}

            {!teamThreadsQuery.isLoading && !teamThreads.length ? (
              <Card className="border-white/10 bg-white/5">
                <CardContent className="space-y-3 p-5 text-sm text-white/70">
                  <div>Team threads are not initialized yet. Open AI Team to begin.</div>
                  <Button size="sm" className="bg-amber-500 text-black hover:bg-amber-400" onClick={() => setLocation("/pro/threads/team")}>
                    Open AI Team room
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            <button
              type="button"
              className="w-full rounded-xl border border-white/10 bg-black/30 p-4 text-left hover:bg-white/5"
              onClick={() => setLocation("/pro/operations")}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-white/75">
                  <Building2 className="h-4 w-4 text-amber-300" />
                  Open Operations Center
                </div>
                <ChevronRight className="h-4 w-4 text-white/35" />
              </div>
            </button>
          </TabsContent>
        </Tabs>
        </main>

      <AppProBottomNav activeKey="operations" />
      </div>
    </div>
  );
}
