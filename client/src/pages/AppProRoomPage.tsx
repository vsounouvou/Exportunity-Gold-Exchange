import { useEffect, useMemo, useRef, useState } from "react";
import { Redirect, useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Box, ChevronLeft, Coins, FileText, HandCoins, ListTodo, Loader2, PackagePlus, Plus, Send, Truck, UserPlus } from "lucide-react";

import { AppProBottomNav } from "@/components/agentic/AppProBottomNav";
import { AppProTopBar } from "@/components/agentic/AppProTopBar";
import { ProSideNav } from "@/components/agentic/ProSideNav";
import { WalletStrip } from "@/components/agentic/WalletStrip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { VoiceInput } from "@/components/VoiceInput";
import { usePwaInstall } from "@/contexts/PwaInstallContext";
import { roomKeyFromSlug } from "@/config/chatRooms";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { apiRequest } from "@/lib/queryClient";

type RoomMessage = {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  metadata?: {
    quickReplies?: string[];
    card?: {
      kind: string;
      title: string;
      status?: string;
      amount?: number;
      currency?: string;
      note?: string;
      dueDate?: string;
      productTitle?: string;
      deliveryStatus?: string;
      actionId?: number;
    };
  };
};

type InboxRoom = {
  key: string;
  title: string;
  subtitle?: string | null;
};

type TeamAgent = {
  id: number;
  display_name: string;
  status: "active" | "paused" | "cancelled";
  model_tier?: string;
  template_title?: string | null;
};

type OnboardingConfig = {
  version?: number;
  enabled?: boolean;
  pwaInstall?: {
    enabled?: boolean;
    minDaysBetweenPrompts?: number;
    roles?: string[];
    message?: { role?: "assistant" | "system"; content?: string; quickReplies?: string[] };
    postInstallMessage?: { role?: "assistant" | "system"; content?: string };
  };
};

type ChatCardKind =
  | "request_payment"
  | "pay_now"
  | "create_task"
  | "share_product"
  | "send_contract"
  | "create_order"
  | "delivery_update";

function isMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function createClientMessageId() {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return (crypto as any).randomUUID() as string;
    }
  } catch {
    // ignore
  }

  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function normalizeQuickReply(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['?]/g, "'")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function AppProRoomPage() {
  const { isAuthenticated, isGuest, user } = useSession();
  const [location, setLocation] = useLocation();
  const [, nextParams] = useRoute("/app/chats/:roomKey");
  const [, proOpsParams] = useRoute("/pro/operations/:roomKey");
  const [, proParams] = useRoute("/pro/threads/:roomKey");
  const [, legacyParams] = useRoute("/app/room/:roomKey");
  const [, legacyProParams] = useRoute("/pro/room/:roomKey");
  const roomSlug = String(
    (proOpsParams as any)?.roomKey ||
      (proParams as any)?.roomKey ||
      (nextParams as any)?.roomKey ||
      (legacyProParams as any)?.roomKey ||
      (legacyParams as any)?.roomKey ||
      "",
  ).trim();
  const roomKey = roomKeyFromSlug(roomSlug);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { installed, canPrompt, promptInstall } = usePwaInstall();
  const [message, setMessage] = useState("");
  const [addAgentDialogOpen, setAddAgentDialogOpen] = useState(false);
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [cardKind, setCardKind] = useState<ChatCardKind>("request_payment");
  const [cardTo, setCardTo] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [cardCurrency, setCardCurrency] = useState("XOF");
  const [cardNote, setCardNote] = useState("");
  const [cardDueDate, setCardDueDate] = useState("");
  const [cardProductTitle, setCardProductTitle] = useState("");
  const [cardDeliveryStatus, setCardDeliveryStatus] = useState("assigned");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastSendRef = useRef<{ content: string; at: number } | null>(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [installPromptLastAt, setInstallPromptLastAt] = useState<number>(() => {
    try {
      return Number(localStorage.getItem("bdo_pwa_install_prompt_at") || "0") || 0;
    } catch {
      return 0;
    }
  });
  const [showPostInstallMessage, setShowPostInstallMessage] = useState(false);

  const { data: roomsResp } = useQuery<{ rooms: InboxRoom[] }>({
    queryKey: ["/api/ece/inbox/rooms"],
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 1,
    enabled: isAuthenticated && !isGuest,
  });

  // Ensures the starter agent team is provisioned as soon as the default Operations thread loads.
  useQuery({
    queryKey: ["/api/ece/agents/threads"],
    staleTime: 60_000,
    retry: 1,
    enabled: isAuthenticated && !isGuest && roomKey === "ops",
  });

  const teamQuery = useQuery<{ items: TeamAgent[] }>({
    queryKey: ["/api/ece/agents/team"],
    staleTime: 10_000,
    refetchInterval: 20_000,
    retry: 1,
    enabled: isAuthenticated && !isGuest && roomKey === "ops",
  });

  const { data: messagesResp, isLoading } = useQuery<{ messages: RoomMessage[]; room?: InboxRoom }>({
    queryKey: [`/api/ece/inbox/rooms/${encodeURIComponent(roomKey)}/messages`],
    staleTime: 5_000,
    refetchInterval: 10_000,
    retry: 1,
    enabled: isAuthenticated && !isGuest && !!roomKey,
  });

  const { data: onboardingResp } = useQuery<{ config: OnboardingConfig }>({
    queryKey: ["/api/ece/onboarding/config"],
    staleTime: 60_000,
    retry: 1,
    enabled: isAuthenticated && !isGuest,
  });

  const room = useMemo(() => {
    const fromPayload = messagesResp?.room;
    if (fromPayload) return fromPayload;
    const list = roomsResp?.rooms || [];
    return list.find((r) => r.key === roomKey) || { key: roomKey, title: roomKey };
  }, [messagesResp?.room, roomsResp?.rooms, roomKey]);

  const sendMutation = useMutation({
    mutationFn: async (payload: { content: string; clientMessageId: string }) => {
      return apiRequest(`/api/ece/inbox/rooms/${encodeURIComponent(roomKey)}/send`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      setMessage("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [`/api/ece/inbox/rooms/${encodeURIComponent(roomKey)}/messages`] }),
        queryClient.invalidateQueries({ queryKey: ["/api/ece/inbox/rooms"] }),
      ]);
    },
    onError: (err: any) => {
      toast({
        title: "Service indisponible",
        description: err?.message || "Impossible d’envoyer le message.",
        variant: "destructive",
      });
    },
  });

  const cardActionMutation = useMutation({
    mutationFn: async (payload: {
      kind: ChatCardKind;
      to?: string;
      amount?: number;
      currency?: string;
      note?: string;
      dueDate?: string;
      productTitle?: string;
      deliveryStatus?: string;
    }) => {
      return apiRequest(`/api/ece/inbox/rooms/${encodeURIComponent(roomKey)}/cards`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      setCardDialogOpen(false);
      setCardTo("");
      setCardAmount("");
      setCardNote("");
      setCardDueDate("");
      setCardProductTitle("");
      setCardDeliveryStatus("assigned");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [`/api/ece/inbox/rooms/${encodeURIComponent(roomKey)}/messages`] }),
        queryClient.invalidateQueries({ queryKey: ["/api/ece/inbox/rooms"] }),
      ]);
    },
    onError: (err: any) => {
      toast({
        title: "Action failed",
        description: err?.message || "Could not create chat action",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!bottomRef.current) return;
    bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messagesResp?.messages?.length, showInstallPrompt, showPostInstallMessage]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const readKeyboardState = () => {
      const active = document.activeElement as HTMLElement | null;
      const inputFocused =
        !!active &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const keyboardHeight = Math.max(0, window.innerHeight - viewportHeight);
      setIsKeyboardOpen(inputFocused && keyboardHeight > 120);
    };

    readKeyboardState();
    window.visualViewport?.addEventListener("resize", readKeyboardState);
    window.visualViewport?.addEventListener("scroll", readKeyboardState);
    window.addEventListener("focusin", readKeyboardState);
    window.addEventListener("focusout", readKeyboardState);

    return () => {
      window.visualViewport?.removeEventListener("resize", readKeyboardState);
      window.visualViewport?.removeEventListener("scroll", readKeyboardState);
      window.removeEventListener("focusin", readKeyboardState);
      window.removeEventListener("focusout", readKeyboardState);
    };
  }, []);

  const installConfig = onboardingResp?.config?.pwaInstall;
  const installEnabled = Boolean(installConfig?.enabled ?? true);
  const minDaysBetweenPrompts =
    Number.isFinite(Number(installConfig?.minDaysBetweenPrompts)) && Number(installConfig?.minDaysBetweenPrompts) > 0
      ? Number(installConfig?.minDaysBetweenPrompts)
      : 7;
  const installRoles = Array.isArray(installConfig?.roles) && installConfig?.roles?.length
    ? installConfig.roles.map(String)
    : ["seller", "mine_owner", "delivery", "investor"];
  const currentMode = String(user?.currentMode || "").trim();
  const eligibleRole = installRoles.includes(currentMode);

  useEffect(() => {
    if (!isAuthenticated || isGuest) return;
    if (!installEnabled) return;
    if (installed) return;
    if (!eligibleRole) return;
    if (!isMobileBrowser()) return;
    if (!installConfig?.message?.content) return;
    if (showInstallPrompt) return;

    const windowMs = Math.max(1, minDaysBetweenPrompts) * 24 * 60 * 60 * 1000;
    if (installPromptLastAt && Date.now() - installPromptLastAt < windowMs) return;

    const now = Date.now();
    try {
      localStorage.setItem("bdo_pwa_install_prompt_at", String(now));
    } catch {
      // ignore
    }
    setInstallPromptLastAt(now);
    setShowInstallPrompt(true);
  }, [
    eligibleRole,
    installEnabled,
    installPromptLastAt,
    installed,
    isAuthenticated,
    isGuest,
    minDaysBetweenPrompts,
    showInstallPrompt,
  ]);

  useEffect(() => {
    if (!installed) return;
    if (showPostInstallMessage) return;
    try {
      const installedAt = Number(localStorage.getItem("bdo_pwa_installed_at") || "0") || 0;
      const ackAt = Number(localStorage.getItem("bdo_pwa_installed_ack_at") || "0") || 0;
      if (installedAt && ackAt < installedAt) {
        setShowPostInstallMessage(true);
        localStorage.setItem("bdo_pwa_installed_ack_at", String(Date.now()));
      }
    } catch {
      // ignore
    }
  }, [installed, showPostInstallMessage]);

  if (!isAuthenticated || isGuest) {
    return <Redirect to={`/pro/login?next=${encodeURIComponent(location)}`} />;
  }

  if (!roomKey) {
    return <Redirect to="/app" />;
  }

  const messages = messagesResp?.messages || [];
  const pwaPrompt = installConfig?.message;
  const postInstall = installConfig?.postInstallMessage;

  const renderedMessages: RoomMessage[] = useMemo(() => {
    const extra: RoomMessage[] = [];

    if (showPostInstallMessage && postInstall?.content) {
      extra.push({
        id: -2,
        role: postInstall.role === "assistant" ? "assistant" : "system",
        content: postInstall.content,
        createdAt: new Date().toISOString(),
      });
    }

    if (showInstallPrompt && pwaPrompt?.content) {
      extra.push({
        id: -1,
        role: pwaPrompt.role === "assistant" ? "assistant" : "system",
        content: pwaPrompt.content,
        createdAt: new Date().toISOString(),
        metadata: { quickReplies: Array.isArray(pwaPrompt.quickReplies) ? pwaPrompt.quickReplies : [] },
      });
    }

    return [...messages, ...extra];
  }, [
    messages,
    postInstall?.content,
    postInstall?.role,
    pwaPrompt?.content,
    pwaPrompt?.quickReplies,
    pwaPrompt?.role,
    showInstallPrompt,
    showPostInstallMessage,
  ]);

  const markInstallPromptAsSeenNow = () => {
    const now = Date.now();
    try {
      localStorage.setItem("bdo_pwa_install_prompt_at", String(now));
    } catch {
      // ignore
    }
    setInstallPromptLastAt(now);
  };

  const handleInstallNow = async () => {
    markInstallPromptAsSeenNow();
    setShowInstallPrompt(false);

    if (installed) return;

    if (!canPrompt) {
      setInstallHelpOpen(true);
      return;
    }

    const outcome = await promptInstall();
    if (outcome === "dismissed") {
      toast({ title: "Installation annulée", description: "Vous pouvez réessayer plus tard." });
    }
  };

  const handleInstallLater = () => {
    markInstallPromptAsSeenNow();
    setShowInstallPrompt(false);
  };

  const sendOnce = (raw: string) => {
    const content = String(raw || "").trim();
    if (!content) return;
    if (sendMutation.isPending) return;

    const now = Date.now();
    const last = lastSendRef.current;
    if (last && last.content === content && now - last.at < 800) return;
    lastSendRef.current = { content, at: now };

    sendMutation.mutate({ content, clientMessageId: createClientMessageId() });
  };

  const handleQuickReply = async (raw: string) => {
    const label = String(raw || "").trim();
    if (!label) return;

    const normalized = normalizeQuickReply(label);
    if (!normalized) return;

    if (normalized.includes("installer")) {
      await handleInstallNow();
      return;
    }

    if (normalized.includes("plus tard")) {
      handleInstallLater();
      return;
    }

    sendOnce(label);
  };

  const handleSend = async () => {
    const content = message.trim();
    if (!content) return;
    sendOnce(content);
  };

  const handleSubmitCardAction = () => {
    const numericAmount = Number(cardAmount || "0");
    const payload = {
      kind: cardKind,
      to: cardTo.trim() || undefined,
      amount: Number.isFinite(numericAmount) && numericAmount > 0 ? numericAmount : undefined,
      currency: cardCurrency || "XOF",
      note: cardNote.trim() || undefined,
      dueDate: cardDueDate || undefined,
      productTitle: cardProductTitle.trim() || undefined,
      deliveryStatus: cardDeliveryStatus || undefined,
    };
    cardActionMutation.mutate(payload);
  };

  const isGeneralOperations = roomKey === "ops";
  const activeSection = roomKey === "wallet" ? "money" : "operations";
  const teamAgents = teamQuery.data?.items || [];
  const activeTeamAgents = teamAgents.filter((agent) => agent.status === "active");

  const attachAgentMention = (agent: TeamAgent) => {
    const mentionName = String(agent.display_name || "Agent").trim();
    if (!mentionName) return;
    const mention = `@${mentionName}`;
    setMessage((previous) => {
      const trimmed = String(previous || "").trim();
      if (!trimmed) return `${mention} `;
      if (trimmed.includes(mention)) return `${trimmed} `;
      return `${trimmed} ${mention} `;
    });
    setAddAgentDialogOpen(false);
  };

  return (
    <div className={cn("min-h-screen bg-gray-950 text-white", isKeyboardOpen ? "pb-4" : "pb-24")}>
      <ProSideNav activeKey={activeSection} />
      <div className="md:ml-56">
        <AppProTopBar subtitle={room?.title || "Operations"} homeHref="/pro/operations" />
        <WalletStrip href="/pro/money" sticky={false} />

        <div className="max-w-xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {!isGeneralOperations ? (
              <Button
                variant="ghost"
                className="h-10 w-10 p-0 text-white/70 hover:text-white hover:bg-white/10"
                onClick={() => setLocation("/pro/chats")}
                aria-label="Back"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            ) : null}

            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{room?.title || roomKey}</div>
              {room?.subtitle ? <div className="text-[11px] text-white/50 truncate">{room.subtitle}</div> : null}
            </div>
          </div>

          {isGeneralOperations ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/15 text-white/85"
                onClick={() => setAddAgentDialogOpen(true)}
                data-testid="pro-ops-add-agent"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Add agent
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-white/15 text-white/85"
                onClick={() => setLocation("/pro/agents/store")}
                data-testid="pro-ops-agent-marketplace"
              >
                Marketplace
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-white/15 text-white/85"
                onClick={() => setLocation("/pro/chats")}
                data-testid="pro-open-chats"
              >
                Chats
              </Button>
            </div>
          ) : null}
        </div>

        {isGeneralOperations ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-3" data-testid="pro-ops-active-agents">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-white/70">My Team (active)</div>
              <div className="text-[11px] text-white/50">{activeTeamAgents.length} online</div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {activeTeamAgents.slice(0, 8).map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-3 py-1 text-[11px] text-white/85 hover:bg-white/10"
                  onClick={() => attachAgentMention(agent)}
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  {agent.display_name}
                </button>
              ))}
              {!teamQuery.isLoading && !activeTeamAgents.length ? (
                <div className="text-[11px] text-white/55">No active agents yet. Hire one in Marketplace.</div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="h-[62vh] overflow-y-auto px-4 py-4 space-y-3">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement…
              </div>
            ) : (
              renderedMessages.map((m) => (
                <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-amber-500 text-black"
                        : m.role === "assistant"
                          ? "bg-white/10 text-white"
                          : "bg-black/40 border border-white/10 text-white/80",
                    )}
                  >
                    {m.content}

                    {m.metadata?.card ? (
                      <div className="mt-3 rounded-xl border border-white/15 bg-black/35 p-3 text-xs">
                        <div className="font-semibold text-white">{m.metadata.card.title}</div>
                        <div className="mt-1 grid grid-cols-2 gap-2 text-white/70">
                          {m.metadata.card.amount ? (
                            <div>
                              Amount: {new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(m.metadata.card.amount))}{" "}
                              {m.metadata.card.currency || "XOF"}
                            </div>
                          ) : null}
                          {m.metadata.card.deliveryStatus ? <div>Status: {m.metadata.card.deliveryStatus}</div> : null}
                          {m.metadata.card.dueDate ? <div>Due: {m.metadata.card.dueDate}</div> : null}
                          {m.metadata.card.productTitle ? <div>Product: {m.metadata.card.productTitle}</div> : null}
                        </div>
                        {m.metadata.card.note ? <div className="mt-2 text-white/75">{m.metadata.card.note}</div> : null}
                        {m.metadata.card.status ? (
                          <div className="mt-2 inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
                            {m.metadata.card.status}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {Array.isArray(m.metadata?.quickReplies) && m.metadata?.quickReplies?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {m.metadata.quickReplies.map((qr) => (
                          <button
                            key={qr}
                            type="button"
                            className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-white/80 hover:bg-white/10"
                            onClick={() => handleQuickReply(qr)}
                          >
                            {qr}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}

            <div ref={bottomRef} />
          </div>

          <div className="border-t border-white/10 p-3 bg-black/40">
            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/15 text-white/85"
                onClick={() => setCardDialogOpen(true)}
                disabled={cardActionMutation.isPending}
              >
                <Plus className="h-4 w-4" />
              </Button>

              <VoiceInput
                onTranscript={(text: string) => {
                  setMessage((prev) => (prev ? `${prev}\n${text}` : text));
                }}
                isDisabled={sendMutation.isPending}
              />

              <div className="flex-1">
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Écrire un message…"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
              </div>

              <Button
                className="bg-amber-500 hover:bg-amber-400 text-black font-semibold"
                onClick={handleSend}
                disabled={sendMutation.isPending || !message.trim()}
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
      </div>

      {!isKeyboardOpen ? <AppProBottomNav activeKey={activeSection} /> : null}

      <Dialog open={addAgentDialogOpen} onOpenChange={setAddAgentDialogOpen}>
        <DialogContent className="bg-black border-white/10 text-white" data-testid="pro-ops-add-agent-dialog">
          <DialogHeader>
            <DialogTitle>Add agent to this chat</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-white/60">
              Select an agent to tag in the composer. This routes the next message to that agent in General Operations.
            </div>
            <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
              {teamAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className={cn(
                    "w-full rounded-xl border p-3 text-left",
                    agent.status === "active" ? "border-white/15 bg-white/5 hover:bg-white/10" : "border-white/10 bg-black/30 text-white/60",
                  )}
                  onClick={() => attachAgentMention(agent)}
                  disabled={agent.status === "cancelled"}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Bot className="h-4 w-4 text-amber-300" />
                        <span className="truncate">{agent.display_name}</span>
                      </div>
                      <div className="mt-1 truncate text-[11px] text-white/55">
                        {agent.template_title || "Agent"} • {agent.model_tier || "L0"}
                      </div>
                    </div>
                    <div className="shrink-0 text-[11px]">
                      {agent.status === "active" ? (
                        <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">Active</span>
                      ) : agent.status === "paused" ? (
                        <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-amber-200">Paused</span>
                      ) : (
                        <span className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-white/65">Inactive</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
              {!teamQuery.isLoading && !teamAgents.length ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/65">
                  No agents in your team yet.
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="outline" className="border-white/15 text-white/85" onClick={() => setLocation("/pro/agents/store")}>
                Open marketplace
              </Button>
              <Button variant="outline" className="border-white/15 text-white/85" onClick={() => setAddAgentDialogOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cardDialogOpen} onOpenChange={setCardDialogOpen}>
        <DialogContent className="bg-black border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Create chat action</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={cn(
                  "rounded-lg border px-3 py-2 text-left",
                  cardKind === "request_payment" ? "border-amber-400/60 bg-amber-500/10" : "border-white/15 bg-white/5",
                )}
                onClick={() => setCardKind("request_payment")}
              >
                <div className="flex items-center gap-2"><HandCoins className="h-4 w-4" /> Request money</div>
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-lg border px-3 py-2 text-left",
                  cardKind === "pay_now" ? "border-amber-400/60 bg-amber-500/10" : "border-white/15 bg-white/5",
                )}
                onClick={() => setCardKind("pay_now")}
              >
                <div className="flex items-center gap-2"><Coins className="h-4 w-4" /> Send money</div>
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-lg border px-3 py-2 text-left",
                  cardKind === "create_task" ? "border-amber-400/60 bg-amber-500/10" : "border-white/15 bg-white/5",
                )}
                onClick={() => setCardKind("create_task")}
              >
                <div className="flex items-center gap-2"><ListTodo className="h-4 w-4" /> Task</div>
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-lg border px-3 py-2 text-left",
                  cardKind === "share_product" ? "border-amber-400/60 bg-amber-500/10" : "border-white/15 bg-white/5",
                )}
                onClick={() => setCardKind("share_product")}
              >
                <div className="flex items-center gap-2"><PackagePlus className="h-4 w-4" /> Share product</div>
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-lg border px-3 py-2 text-left",
                  cardKind === "send_contract" ? "border-amber-400/60 bg-amber-500/10" : "border-white/15 bg-white/5",
                )}
                onClick={() => setCardKind("send_contract")}
              >
                <div className="flex items-center gap-2"><FileText className="h-4 w-4" /> Contract</div>
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-lg border px-3 py-2 text-left",
                  cardKind === "create_order" ? "border-amber-400/60 bg-amber-500/10" : "border-white/15 bg-white/5",
                )}
                onClick={() => setCardKind("create_order")}
              >
                <div className="flex items-center gap-2"><Box className="h-4 w-4" /> Create order</div>
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-lg border px-3 py-2 text-left",
                  cardKind === "delivery_update" ? "border-amber-400/60 bg-amber-500/10" : "border-white/15 bg-white/5",
                )}
                onClick={() => setCardKind("delivery_update")}
              >
                <div className="flex items-center gap-2"><Truck className="h-4 w-4" /> Delivery update</div>
              </button>
            </div>

            {(cardKind === "request_payment" || cardKind === "pay_now") ? (
              <div className="grid grid-cols-2 gap-2">
                <Input value={cardTo} onChange={(e) => setCardTo(e.target.value)} placeholder="Recipient (email/phone)" className="bg-white/5 border-white/10" />
                <Input value={cardAmount} onChange={(e) => setCardAmount(e.target.value)} placeholder="Amount" className="bg-white/5 border-white/10" />
                <Input value={cardCurrency} onChange={(e) => setCardCurrency(e.target.value.toUpperCase())} placeholder="Currency" className="bg-white/5 border-white/10" />
                <Input value={cardDueDate} onChange={(e) => setCardDueDate(e.target.value)} placeholder="Due date (optional)" className="bg-white/5 border-white/10" />
              </div>
            ) : null}

            {cardKind === "create_task" ? (
              <div className="grid grid-cols-2 gap-2">
                <Input value={cardTo} onChange={(e) => setCardTo(e.target.value)} placeholder="Owner (optional)" className="bg-white/5 border-white/10" />
                <Input value={cardDueDate} onChange={(e) => setCardDueDate(e.target.value)} placeholder="Due date (optional)" className="bg-white/5 border-white/10" />
              </div>
            ) : null}

            {cardKind === "share_product" ? (
              <Input value={cardProductTitle} onChange={(e) => setCardProductTitle(e.target.value)} placeholder="Product title" className="bg-white/5 border-white/10" />
            ) : null}

            {cardKind === "delivery_update" ? (
              <select
                className="h-10 w-full rounded-md bg-white/5 border border-white/10 text-white/90 px-3"
                value={cardDeliveryStatus}
                onChange={(e) => setCardDeliveryStatus(e.target.value)}
              >
                <option value="assigned">Assigned</option>
                <option value="picked_up">Picked up</option>
                <option value="delivered">Delivered</option>
                <option value="issue_reported">Issue reported</option>
              </select>
            ) : null}

            <Input
              value={cardNote}
              onChange={(e) => setCardNote(e.target.value)}
              placeholder={cardKind === "create_task" ? "Task title" : "Add context for this action"}
              className="bg-white/5 border-white/10"
            />

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" className="border-white/15 text-white/80" onClick={() => setCardDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-amber-500 hover:bg-amber-400 text-black"
                onClick={handleSubmitCardAction}
                disabled={cardActionMutation.isPending}
              >
                {cardActionMutation.isPending ? "Creating..." : "Create card"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={installHelpOpen} onOpenChange={setInstallHelpOpen}>
        <DialogContent className="bg-black border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Installer l’application</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-white/70 space-y-3">
            <p>
              Sur mobile, vous pouvez installer l’application depuis le menu du navigateur (Ajouter à l’écran d’accueil /
              Installer l’application).
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                className="border-white/15 text-white/80 hover:bg-white/10"
                onClick={() => setInstallHelpOpen(false)}
              >
                OK
              </Button>
              <Button className="bg-amber-500 hover:bg-amber-400 text-black" onClick={() => setLocation("/install")}>
                Ouvrir la page d’installation
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
