import { useMemo, useState } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search, MessageSquareText } from "lucide-react";

import { WalletStrip } from "@/components/agentic/WalletStrip";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
  } catch {
    return "";
  }
}

export default function InboxPage() {
  const { isAuthenticated, isGuest } = useSession();
  const [location] = useLocation();
  const [query, setQuery] = useState("");

  const { data, isLoading, error } = useQuery<{ rooms: InboxRoom[] }>({
    queryKey: ["/api/ece/inbox/rooms"],
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 1,
    enabled: isAuthenticated && !isGuest,
  });

  const rooms = useMemo(() => {
    const all = data?.rooms || [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter((r) => (r.title || "").toLowerCase().includes(q) || (r.subtitle || "").toLowerCase().includes(q))
      : all;
    const pinned = filtered.filter((r) => r.isPinned);
    const rest = filtered.filter((r) => !r.isPinned);
    return [...pinned, ...rest];
  }, [data?.rooms, query]);

  if (!isAuthenticated || isGuest) {
    return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <WalletStrip />

      <div className="max-w-xl mx-auto px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
            <p className="text-xs text-white/60 mt-1">
              Your work conversations and system updates, in one place.
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            <MessageSquareText className="h-5 w-5 text-white/70" />
          </div>
        </div>

        <div className="mt-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats..."
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/40"
          />
        </div>

        <div className="mt-4 space-y-2">
          {error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
              Failed to load inbox.
            </div>
          ) : isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="rounded-xl border border-white/10 bg-white/5 p-4 animate-pulse">
                  <div className="h-4 bg-white/10 rounded w-1/2" />
                  <div className="h-3 bg-white/10 rounded w-3/4 mt-3" />
                </div>
              ))}
            </div>
          ) : rooms.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
              No rooms yet.
            </div>
          ) : (
            rooms.map((room) => (
              <Link key={room.key} href={`/inbox/${encodeURIComponent(room.key)}`}>
                <div className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors p-4 cursor-pointer">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="text-sm font-semibold truncate">{room.title}</div>
                        {room.unreadCount ? (
                          <div className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300">
                            {room.unreadCount}
                          </div>
                        ) : null}
                      </div>
                      <div className="text-xs text-white/60 mt-1 truncate">
                        {room.lastMessage?.content
                          ? room.lastMessage.content
                          : room.subtitle || "Tap to open"}
                      </div>
                    </div>
                    <div className={cn("text-[11px] text-white/50 shrink-0", room.isPinned && "text-amber-300/80")}>
                      {formatTime(room.lastMessage?.createdAt)}
                    </div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
