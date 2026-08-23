import { useMemo, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MessageSquareText, Pin, Search } from "lucide-react";

import { AppProBottomNav } from "@/components/agentic/AppProBottomNav";
import { AppProTopBar } from "@/components/agentic/AppProTopBar";
import { ProSideNav } from "@/components/agentic/ProSideNav";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PRIMARY_ROOM_KEY, PRIMARY_ROOM_SLUG, STARTER_AGENT_ROSTER, roomSlugFromKey } from "@/config/chatRooms";
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

function formatTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function initialsOf(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return "?";
  const parts = text.split(/\s+/g).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}

export default function AppProChatsPage() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isGuest } = useSession();
  const [query, setQuery] = useState("");

  const roomsQuery = useQuery<{ rooms: InboxRoom[] }>({
    queryKey: ["/api/ece/inbox/rooms"],
    staleTime: 10_000,
    refetchInterval: 12_000,
    retry: 1,
    enabled: isAuthenticated && !isGuest,
  });

  if (!isAuthenticated || isGuest) {
    return <Redirect to={`/pro/login?next=${encodeURIComponent(location)}`} />;
  }

  const rooms = Array.isArray(roomsQuery.data?.rooms) ? roomsQuery.data!.rooms : [];
  const roomMap = new Map(rooms.map((room) => [room.key, room]));

  const agentRoster = useMemo(() => {
    const map = new Map<string, (typeof STARTER_AGENT_ROSTER)[number]>();
    for (const agent of STARTER_AGENT_ROSTER) {
      map.set(agent.key, agent);
    }
    return map;
  }, []);

  const operationsThreads = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    const definitions = [
      {
        key: PRIMARY_ROOM_KEY,
        slug: PRIMARY_ROOM_SLUG,
        kind: "group" as const,
        title: "General Operations",
        hint: "Main chat - tag agents to route work.",
      },
      { key: "procurement", slug: roomSlugFromKey("procurement"), kind: "agent" as const },
      { key: "accounting", slug: roomSlugFromKey("accounting"), kind: "agent" as const },
      { key: "compliance", slug: roomSlugFromKey("compliance"), kind: "agent" as const },
      { key: "sales", slug: roomSlugFromKey("sales"), kind: "agent" as const },
      { key: "support", slug: roomSlugFromKey("support"), kind: "agent" as const },
    ];

    return definitions
      .map((def) => {
        const room = roomMap.get(def.key);
        const roster = def.kind === "agent" ? agentRoster.get(def.key) : null;
        const roleLabel =
          def.key === "procurement"
            ? "Orders Agent"
            : def.key === "sales"
              ? "Marketing Agent"
              : roster?.role || (def.kind === "agent" ? "Agent" : "");

        const ownerName = roster?.name || (def.kind === "agent" ? def.key : null);

        const title = def.kind === "group" ? def.title : ownerName || def.key;
        const subtitle =
          def.kind === "group"
            ? def.hint
            : roleLabel;

        const lastMessage = room?.lastMessage?.content || "";

        const haystack = `${title} ${subtitle} ${lastMessage}`.toLowerCase();
        if (normalized && !haystack.includes(normalized)) return null;

        return {
          key: def.key,
          slug: def.slug,
          kind: def.kind,
          title,
          subtitle,
          roleLabel,
          statusLabel: def.kind === "agent" ? "Active" : "Pinned",
          isPinned: def.key === PRIMARY_ROOM_KEY,
          unreadCount: Number(room?.unreadCount ?? 0) || 0,
          lastMessage,
          lastAt: room?.lastMessage?.createdAt || null,
          initials: def.kind === "agent" ? initialsOf(ownerName) : null,
        };
      })
      .filter(Boolean) as Array<{
      key: string;
      slug: string;
      kind: "group" | "agent";
      title: string;
      subtitle: string;
      roleLabel: string;
      statusLabel: string;
      isPinned: boolean;
      unreadCount: number;
      lastMessage: string;
      lastAt: string | null;
      initials: string | null;
    }>;
  }, [agentRoster, query, roomMap]);

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-24 text-[#07111F]">
      <ProSideNav activeKey="operations" />
      <div className="md:ml-56">
      <AppProTopBar subtitle="Chats" />
      <main className="mx-auto w-full max-w-3xl px-4 py-4">
        <div className="mt-4 relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats"
            className="border-slate-200 bg-white pl-9 text-slate-950 placeholder:text-slate-400 focus-visible:ring-[#F5A623]"
          />
        </div>

        <section className="mt-4 space-y-2">
          {operationsThreads.map((thread) => (
            <button
              key={thread.key}
              type="button"
              data-testid={`chat-room-${thread.key}`}
              className={[
                "w-full rounded-xl border p-4 text-left transition",
                thread.isPinned ? "border-[#F5A623]/40 bg-[#FFF8E8] hover:bg-[#FFF1CF]" : "border-slate-200 bg-white shadow-sm hover:border-[#F5A623]/40",
              ].join(" ")}
              onClick={() => setLocation(`/pro/operations/${thread.slug}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-black text-slate-700">
                      {thread.kind === "group" ? <MessageSquareText className="h-4 w-4 text-[#9A6200]" /> : thread.initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <span className="truncate">{thread.title}</span>
                        {thread.isPinned ? <Pin className="h-3.5 w-3.5 text-amber-300" /> : null}
                        {thread.kind === "agent" ? (
                          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                            {thread.roleLabel}
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full border border-[#F5A623]/30 bg-white px-2 py-0.5 text-[11px] font-bold text-[#8A5700]">
                            Pinned
                          </span>
                        )}
                      </div>
                      <div className="mt-1 truncate text-xs text-slate-500">
                        {thread.lastMessage || thread.subtitle}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[11px] text-slate-400">{formatTime(thread.lastAt)}</div>
                  {thread.unreadCount ? (
                    <div className="mt-2 inline-flex rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-black">
                      {thread.unreadCount}
                    </div>
                  ) : null}
                </div>
              </div>
            </button>
          ))}

          {!roomsQuery.isLoading && !operationsThreads.length ? (
            <Card className="border-slate-200 bg-white">
              <CardContent className="space-y-3 p-4 text-sm text-slate-600">
                <div>No operations threads found.</div>
              </CardContent>
            </Card>
          ) : null}
        </section>
      </main>
      <AppProBottomNav activeKey="operations" />
      </div>
    </div>
  );
}
