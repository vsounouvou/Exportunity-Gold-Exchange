import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Bot, Box, BriefcaseBusiness, Coins, Pin, Search, Store, VolumeX } from "lucide-react";

import { WalletStrip } from "@/components/agentic/WalletStrip";
import { AppProBottomNav } from "@/components/agentic/AppProBottomNav";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

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

type RoomPreferences = {
  pinned: string[];
  muted: string[];
  archived: string[];
};

const DEFAULT_ROOM_PREFS: RoomPreferences = {
  pinned: [],
  muted: [],
  archived: [],
};

const PINNED_DEFAULTS = new Set(["wallet", "sales", "procurement", "support", "team"]);
const PINNED_ORDER = ["sales", "procurement", "wallet", "support", "team", "investor", "delivery"];

const ROOM_TITLES: Record<string, string> = {
  sales: "Clients",
  procurement: "Orders",
  team: "AI Team Room",
};

const ROOM_SEARCH_HINTS: Record<string, string[]> = {
  sales: ["clients", "customer", "prospects", "products", "quotes"],
  procurement: ["orders", "purchase", "buy", "rfq"],
  wallet: ["money", "payment", "balance", "xof"],
  delivery: ["delivery", "pickup", "logistics"],
  team: ["agents", "team", "staff"],
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

export default function AppProInboxPage() {
  const { isAuthenticated, isGuest, user } = useSession();
  const [location, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [openActionsKey, setOpenActionsKey] = useState<string | null>(null);
  const touchStartX = useRef<Record<string, number>>({});
  const prefStorageKey = useMemo(() => `bdo_pro_inbox_prefs_v2_${user?.id ?? "anon"}`, [user?.id]);
  const [prefs, setPrefs] = useState<RoomPreferences>(DEFAULT_ROOM_PREFS);
  const roles = Array.isArray(user?.roles) ? user.roles.map((role) => String(role)) : [];
  const currentMode = String(user?.currentMode || "");
  const hasShopAccess = roles.some((role) =>
    ["seller", "shop_owner", "mine_owner", "authorized_gold_buyer", "jewelry_reseller", "jewelry_manufacturer"].includes(role),
  ) || ["seller", "shop_owner", "mine_owner", "authorized_gold_buyer"].includes(currentMode);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(prefStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as RoomPreferences;
      setPrefs({
        pinned: Array.isArray(parsed?.pinned) ? parsed.pinned : [],
        muted: Array.isArray(parsed?.muted) ? parsed.muted : [],
        archived: Array.isArray(parsed?.archived) ? parsed.archived : [],
      });
    } catch {
      setPrefs(DEFAULT_ROOM_PREFS);
    }
  }, [prefStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(prefStorageKey, JSON.stringify(prefs));
    } catch {
      // ignore local storage failures
    }
  }, [prefStorageKey, prefs]);

  const { data, isLoading, error } = useQuery<{ rooms: InboxRoom[] }>({
    queryKey: ["/api/ece/inbox/rooms"],
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 1,
    enabled: isAuthenticated && !isGuest,
  });

  const rooms = useMemo(() => {
    const all = (data?.rooms || []).map((room) => ({
      ...room,
      title: ROOM_TITLES[room.key] || room.title,
    }));
    const q = query.trim().toLowerCase();
    const filtered = all
      .filter((room) => !prefs.archived.includes(room.key))
      .filter((room) => {
        if (!q) return true;
        const searchIndex = [
          room.title || "",
          room.subtitle || "",
          ...(ROOM_SEARCH_HINTS[room.key] || []),
        ]
          .join(" ")
          .toLowerCase();
        return searchIndex.includes(q);
      })
      .map((room) => {
        const isPinned = prefs.pinned.includes(room.key) || room.isPinned || PINNED_DEFAULTS.has(room.key);
        const isMuted = prefs.muted.includes(room.key);
        return { ...room, isPinned, isMuted };
      });

    return filtered.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      if (a.isPinned && b.isPinned) {
        const ai = PINNED_ORDER.indexOf(a.key);
        const bi = PINNED_ORDER.indexOf(b.key);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
      }
      const at = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bt = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bt - at;
    });
  }, [data?.rooms, prefs.archived, prefs.muted, prefs.pinned, query]);

  const togglePreference = (kind: keyof RoomPreferences, key: string) => {
    setPrefs((prev) => {
      const current = new Set(prev[kind]);
      if (current.has(key)) current.delete(key);
      else current.add(key);
      return { ...prev, [kind]: Array.from(current.values()) };
    });
  };

  if (!isAuthenticated || isGuest) {
    return <Redirect to={`/pro/login?next=${encodeURIComponent(location)}`} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-24">
      <WalletStrip href="/pro/money" />

      <div className="max-w-xl mx-auto px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Threads</h1>
            <p className="text-xs text-white/60 mt-1">Company communication layer: clients, orders, wallet, support, and team.</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {hasShopAccess ? (
            <button
              type="button"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left hover:bg-white/10"
              onClick={() => setLocation("/app/shop")}
            >
              <div className="flex items-center gap-2 text-[11px] text-white/70">
                <Store className="h-3.5 w-3.5" />
                My Shop
              </div>
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left hover:bg-white/10"
                    onClick={() => setLocation("/pro/operations/sales")}
          >
            <div className="flex items-center gap-2 text-[11px] text-white/70">
              <BriefcaseBusiness className="h-3.5 w-3.5" />
              Clients
            </div>
          </button>
          <button
            type="button"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left hover:bg-white/10"
                    onClick={() => setLocation("/pro/operations/procurement")}
          >
            <div className="flex items-center gap-2 text-[11px] text-white/70">
              <Box className="h-3.5 w-3.5" />
              Orders
            </div>
          </button>
          <button
            type="button"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left hover:bg-white/10"
            onClick={() => setLocation("/pro/money")}
          >
            <div className="flex items-center gap-2 text-[11px] text-white/70">
              <Coins className="h-3.5 w-3.5" />
              Wallet
            </div>
          </button>
          <button
            type="button"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left hover:bg-white/10 col-span-2"
                    onClick={() => setLocation("/pro/operations/team")}
          >
              <div className="flex items-center gap-2 text-[11px] text-white/70">
                <Bot className="h-3.5 w-3.5" />
                AI Team Room
              </div>
            </button>
        </div>

        <div className="mt-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats, clients, orders, products..."
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/40"
          />
        </div>

        <div className="mt-4 space-y-2">
          {error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
              Impossible de charger l&apos;inbox.
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
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/70 space-y-3">
              <p>No conversations yet. Start with your support thread.</p>
              <button
                type="button"
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/85 hover:bg-white/10"
                onClick={() => setLocation("/pro/operations/support")}
              >
                Open Support
              </button>
            </div>
          ) : (
            rooms.map((room) => (
              <div key={room.key} className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5">
                <div className="absolute inset-y-0 right-0 flex items-center gap-1 px-2">
                  <button
                    type="button"
                    className="rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-[10px] text-white/75 hover:bg-white/10"
                    onClick={() => {
                      togglePreference("pinned", room.key);
                      setOpenActionsKey(null);
                    }}
                  >
                    Pin
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-[10px] text-white/75 hover:bg-white/10"
                    onClick={() => {
                      togglePreference("muted", room.key);
                      setOpenActionsKey(null);
                    }}
                  >
                    Mute
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-200 hover:bg-rose-500/20"
                    onClick={() => {
                      togglePreference("archived", room.key);
                      setOpenActionsKey(null);
                    }}
                  >
                    Archive
                  </button>
                </div>

                <Link href={`/pro/operations/${encodeURIComponent(room.key)}`}>
                  <div
                    className={cn(
                      "relative z-[1] cursor-pointer p-4 transition-transform duration-150 hover:bg-white/10",
                      openActionsKey === room.key ? "-translate-x-[138px]" : "translate-x-0",
                    )}
                    onTouchStart={(event) => {
                      touchStartX.current[room.key] = event.changedTouches[0]?.clientX ?? 0;
                    }}
                    onTouchEnd={(event) => {
                      const start = touchStartX.current[room.key] ?? 0;
                      const end = event.changedTouches[0]?.clientX ?? start;
                      const delta = end - start;
                      if (delta < -40) setOpenActionsKey(room.key);
                      if (delta > 40) setOpenActionsKey(null);
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="text-sm font-semibold truncate">{room.title}</div>
                          {room.isPinned ? <Pin className="h-3.5 w-3.5 text-amber-300" /> : null}
                          {(room as any).isMuted ? <VolumeX className="h-3.5 w-3.5 text-white/45" /> : null}
                          {room.unreadCount && !(room as any).isMuted ? (
                            <div className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300">
                              {room.unreadCount}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-xs text-white/60 mt-1 truncate">
                          {room.lastMessage?.content ? room.lastMessage.content : room.subtitle || "Ouvrir"}
                        </div>
                      </div>
                      <div className={cn("text-[11px] text-white/50 shrink-0", room.isPinned && "text-amber-300/80")}>
                        {formatTime(room.lastMessage?.createdAt)}
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            ))
          )}
        </div>
      </div>

      <AppProBottomNav activeKey="operations" />
    </div>
  );
}
