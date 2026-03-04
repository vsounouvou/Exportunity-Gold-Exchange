import { useEffect, useMemo, useRef, useState } from "react";
import { Redirect, useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Send } from "lucide-react";

import { WalletStrip } from "@/components/agentic/WalletStrip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { VoiceInput } from "@/components/VoiceInput";
import { usePwaInstall } from "@/contexts/PwaInstallContext";
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
  };
};

type InboxRoom = {
  key: string;
  title: string;
  subtitle?: string | null;
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
    .replace(/['’]/g, "'")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function RoomPage() {
  const { isAuthenticated, isGuest, user } = useSession();
  const [location, setLocation] = useLocation();
  const [, params] = useRoute("/inbox/:roomKey");
  const roomKey = String((params as any)?.roomKey || "").trim();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { installed, canPrompt, promptInstall } = usePwaInstall();
  const [message, setMessage] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastSendRef = useRef<{ content: string; at: number } | null>(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
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

  useEffect(() => {
    if (!bottomRef.current) return;
    bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messagesResp?.messages?.length, showInstallPrompt, showPostInstallMessage]);

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
    return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  }

  if (!roomKey) {
    return <Redirect to="/inbox" />;
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

  const handleQuickReply = (qr: string) => {
    const norm = normalizeQuickReply(qr);
    if (norm === "installer maintenant" || norm === "installer l'application") {
      handleInstallNow();
      return;
    }
    if (norm === "plus tard" || norm === "continuer dans le navigateur") {
      handleInstallLater();
      return;
    }
    sendOnce(qr);
  };

  const handleSend = () => {
    const content = message.trim();
    if (!content) return;
    sendOnce(content);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <WalletStrip />

      <div className="border-b border-white/10 bg-black/40 backdrop-blur">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setLocation("/inbox")}
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{room.title}</div>
            <div className="text-[11px] text-white/60 truncate">{room.subtitle || "Agentic room"}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-xl mx-auto px-4 py-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-white/60">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading…
            </div>
          ) : renderedMessages.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
              Commencez la conversation. Ex: “Voir mon solde”, “J’ai 620g aujourd’hui”, “Créer une demande”.
            </div>
          ) : (
            renderedMessages.map((m) => (
              <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap border",
                    m.role === "user"
                      ? "bg-amber-500/20 border-amber-500/30 text-white"
                      : "bg-white/5 border-white/10 text-white/90",
                  )}
                >
                  {m.content}
                  {Array.isArray(m.metadata?.quickReplies) && m.metadata?.quickReplies.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {m.metadata.quickReplies.slice(0, 6).map((qr) => (
                        <button
                          key={qr}
                          type="button"
                          className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 hover:bg-white/10"
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
      </div>

      <div className="border-t border-white/10 bg-black/40 backdrop-blur">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-2">
          <VoiceInput onTranscript={(text) => setMessage((prev) => (prev ? prev + " " : "") + text)} />
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Message…"
            className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button
            className="bg-amber-500 text-black hover:bg-amber-400"
            disabled={!message.trim() || sendMutation.isPending}
            onClick={handleSend}
          >
            {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <Dialog open={installHelpOpen} onOpenChange={setInstallHelpOpen}>
        <DialogContent className="bg-gray-950 border border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Installer l’application</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-white/70 space-y-3">
            <p>Votre navigateur ne permet pas de déclencher l’installation automatiquement.</p>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <ol className="list-decimal pl-5 space-y-1">
                <li>Ouvrez le menu de votre navigateur</li>
                <li>Choisissez “Installer l’app” / “Ajouter à l’écran d’accueil”</li>
                <li>Confirmez</li>
              </ol>
            </div>
            <Button
              variant="secondary"
              className="bg-white/10 hover:bg-white/15 text-white border border-white/10"
              onClick={() => {
                setInstallHelpOpen(false);
                setLocation("/install");
              }}
            >
              Voir les instructions détaillées
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
