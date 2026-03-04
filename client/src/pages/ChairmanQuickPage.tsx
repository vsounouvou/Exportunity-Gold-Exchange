import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { useToast } from "@/hooks/use-toast";
import { VoiceToTextButton } from "@/components/chat/VoiceToTextButton";
import { FileUp, Loader2, Paperclip, PhoneCall, Send, Sparkles, X } from "lucide-react";
import { useLocation } from "wouter";

type ChatAttachment = {
  id: string;
  name: string;
  type?: string;
  size?: number;
  version?: number;
  url?: string;
};

type QuickMessage = {
  id: number;
  senderType: "user" | "assistant" | "system";
  senderName?: string | null;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
};

type QuickThread = {
  id: number;
  assistantDisplayName?: string | null;
};

type QuickRun = {
  id: number;
  actionKey: string;
  status: string;
  createdAt?: string;
  evidence?: Array<{ id: number; evidenceType?: string | null; payload?: any }>;
};

type QuickUser = {
  id: number;
  displayName: string;
};

function formatTime(value?: string | null) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleTimeString();
  } catch {
    return "";
  }
}

function statusTone(status: string) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "SUCCEEDED") return "border-emerald-500/40 text-emerald-300";
  if (normalized === "FAILED") return "border-rose-500/40 text-rose-300";
  if (normalized === "RUNNING") return "border-blue-500/40 text-blue-300";
  return "border-white/20 text-white/70";
}

function extractAttachments(message?: QuickMessage | null): ChatAttachment[] {
  const raw = Array.isArray(message?.metadata?.attachments) ? message?.metadata?.attachments : [];
  return raw.filter((entry: any) => entry && typeof entry === "object" && typeof entry.name === "string");
}

const LEGACY_INTERNAL_PATH_ALIASES: Record<string, string> = {
  "/admin/actions": "/actions",
  "/admin/goals": "/goals",
  "/admin/agenda": "/agenda",
  "/operations/actions": "/actions",
  "/operations/goals": "/goals",
  "/operations/agenda": "/agenda",
  "/app/actions": "/actions",
  "/app/goals": "/goals",
  "/app/agenda": "/agenda",
};

function normalizeInternalPath(rawPath: string) {
  const trimmed = String(rawPath || "").trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return trimmed;
  const hashIndex = trimmed.indexOf("#");
  const queryIndex = trimmed.indexOf("?");
  const splitIndex =
    queryIndex === -1
      ? hashIndex
      : hashIndex === -1
        ? queryIndex
        : Math.min(queryIndex, hashIndex);
  const pathname = splitIndex === -1 ? trimmed : trimmed.slice(0, splitIndex);
  const suffix = splitIndex === -1 ? "" : trimmed.slice(splitIndex);
  const canonicalPathname = LEGACY_INTERNAL_PATH_ALIASES[pathname.toLowerCase()] || pathname;
  return `${canonicalPathname}${suffix}`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export function ChairmanQuickPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [sessionToken, setSessionToken] = useState<string | null>(() =>
    typeof window !== "undefined" ? sessionStorage.getItem("chairman_quick_session") : null,
  );
  const [sessionUser, setSessionUser] = useState<QuickUser | null>(null);
  const [thread, setThread] = useState<QuickThread | null>(null);
  const [messages, setMessages] = useState<QuickMessage[]>([]);
  const [runs, setRuns] = useState<QuickRun[]>([]);
  const [message, setMessage] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [startingCall, setStartingCall] = useState(false);
  const [assistantThinking, setAssistantThinking] = useState(false);
  const [resolvingThread, setResolvingThread] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const maxAttachmentBytes = 20 * 1024 * 1024;
  const assistantName = thread?.assistantDisplayName || "Tassi Hangbé";

  const apiQuick = useMemo(
    () => async (path: string, options?: RequestInit) => {
      const headers = new Headers(options?.headers);
      if (sessionToken) headers.set("x-chairman-quick-session", sessionToken);
      if (!headers.has("Content-Type") && !(options?.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
      }
      const res = await fetch(resolveApiUrl(path), {
        ...options,
        headers,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        const message = text || res.statusText;
        const error = new Error(message);
        (error as any).status = res.status;
        throw error;
      }
      return res.json();
    },
    [sessionToken],
  );

  const refreshMessages = async (threadId: number) => {
    const payload = await apiQuick(`/api/assistant/thread/${threadId}/messages?limit=120`);
    setMessages(payload.messages || []);
  };

  const refreshRuns = async () => {
    const payload = await apiQuick("/api/actions/runs?limit=5");
    setRuns(payload.runs || []);
  };

  const ensureThread = useCallback(async () => {
    const currentId = Number(thread?.id || 0);
    if (currentId > 0) return currentId;

    setResolvingThread(true);
    try {
      const payload = await withTimeout(
        apiQuick("/api/assistant/thread", {
          method: "POST",
          body: JSON.stringify({}),
        }),
        12_000,
        "Thread creation timed out. Retry.",
      );
      const resolvedThread = payload?.thread || null;
      setThread(resolvedThread);
      const resolvedThreadId = Number(resolvedThread?.id || 0);
      if (!resolvedThreadId) {
        throw new Error("Thread unavailable. Retry in a moment.");
      }
      return resolvedThreadId;
    } finally {
      setResolvingThread(false);
    }
  }, [apiQuick, thread?.id]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = "Tassi Hangbé";
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.setAttribute("content", "#0B0F19");
    const manifest = document.getElementById("manifest-link");
    if (manifest) manifest.setAttribute("href", "/manifest-awa.webmanifest");
  }, []);

  useEffect(() => {
    if (sessionToken) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      setRedeemError("Quick token missing.");
      return;
    }
    setLoading(true);
    fetch(resolveApiUrl("/api/chairman/quick-token/redeem"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || res.statusText);
        }
        return res.json();
      })
      .then((payload) => {
        if (!payload?.sessionToken) throw new Error("Invalid redeem response.");
        sessionStorage.setItem("chairman_quick_session", payload.sessionToken);
        setSessionToken(payload.sessionToken);
        setSessionUser(payload.user || null);
      })
      .catch((error) => {
        setRedeemError(error.message || "Unable to redeem token");
      })
      .finally(() => setLoading(false));
  }, [sessionToken]);

  useEffect(() => {
    if (!sessionToken) return;
    setLoading(true);
    apiQuick("/api/assistant/thread", {
      method: "POST",
      body: JSON.stringify({}),
    })
      .then(async (payload) => {
        const resolvedThread = payload.thread || null;
        setThread(resolvedThread);
        if (resolvedThread?.id) {
          await Promise.all([refreshMessages(Number(resolvedThread.id)), refreshRuns()]);
        }
      })
      .catch((error: any) => {
        if (Number(error?.status || 0) === 401) {
          sessionStorage.removeItem("chairman_quick_session");
          setSessionToken(null);
        }
        setRedeemError(error?.message || "Unable to open quick chat.");
      })
      .finally(() => setLoading(false));
  }, [apiQuick, sessionToken]);

  const sendMessage = async () => {
    const content = message.trim();
    if (!content && pendingAttachments.length === 0) return;
    setSending(true);
    setAssistantThinking(true);
    setComposerError(null);
    setRedeemError(null);
    let threadId: number;
    try {
      threadId = await ensureThread();
    } catch (error: any) {
      const detail = error?.message || "Thread is not available yet.";
      setComposerError(detail);
      toast({
        title: "Chat not ready",
        description: detail,
        variant: "destructive",
      });
      setAssistantThinking(false);
      setSending(false);
      return;
    }
    const optimisticId = -Date.now();
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        senderType: "user",
        senderName: "You",
        content: content || `Shared ${pendingAttachments.length} attachment(s).`,
        createdAt: new Date().toISOString(),
        metadata: pendingAttachments.length ? { attachments: pendingAttachments } : null,
      },
    ]);
    try {
      const payload = await apiQuick("/api/assistant/message", {
        method: "POST",
        body: JSON.stringify({
          threadId,
          content,
          attachments: pendingAttachments,
        }),
      });
      setMessages((prev) => prev.filter((entry) => entry.id !== optimisticId));
      if (payload?.userMessage) {
        setMessages((prev) => [...prev, payload.userMessage as QuickMessage]);
      }
      if (payload?.assistantMessage) {
        setMessages((prev) => [...prev, payload.assistantMessage as QuickMessage]);
      }
      setMessage("");
      setPendingAttachments([]);
      setComposerError(null);
      await Promise.all([refreshMessages(threadId), refreshRuns()]);
    } catch (error: any) {
      console.error("[ChairmanQuickPage] send message failed", error);
      setMessages((prev) => prev.filter((entry) => entry.id !== optimisticId));
      setComposerError(error?.message || "Message failed");
      setRedeemError(error?.message || "Message failed");
      toast({
        title: "Message failed",
        description: error?.message || "Unable to send message.",
        variant: "destructive",
      });
    } finally {
      setAssistantThinking(false);
      setSending(false);
    }
  };

  const uploadAttachment = async (file: File) => {
    if (Number(file.size || 0) > maxAttachmentBytes) {
      const tooLargeMessage = `Attachment exceeds ${Math.round(maxAttachmentBytes / (1024 * 1024))}MB limit.`;
      setComposerError(tooLargeMessage);
      toast({
        title: "Attachment too large",
        description: tooLargeMessage,
        variant: "destructive",
      });
      return;
    }
    let threadId: number;
    try {
      threadId = await ensureThread();
    } catch (error: any) {
      const detail = error?.message || "Thread is not available yet.";
      setComposerError(detail);
      toast({
        title: "Chat not ready",
        description: detail,
        variant: "destructive",
      });
      return;
    }
    setUploadingAttachment(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const payload = await apiQuick(`/api/assistant/thread/${threadId}/attachments`, {
        method: "POST",
        body: formData,
      });
      const attachment = payload?.attachment;
      if (attachment) {
        setComposerError(null);
        setPendingAttachments((prev) => [...prev, attachment]);
      }
    } catch (error: any) {
      setComposerError(error?.message || "Unable to upload file.");
      toast({
        title: "Attachment upload failed",
        description: error?.message || "Unable to upload file.",
        variant: "destructive",
      });
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleRetryConnection = async () => {
    setComposerError(null);
    if (!sessionToken) return;
    setLoading(true);
    try {
      const payload = await apiQuick("/api/assistant/thread", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const resolvedThread = payload.thread || null;
      setThread(resolvedThread);
      if (resolvedThread?.id) {
        await Promise.all([refreshMessages(Number(resolvedThread.id)), refreshRuns()]);
      }
    } catch (error: any) {
      setComposerError(error?.message || "Retry failed");
    } finally {
      setLoading(false);
    }
  };

  const requestBriefing = async () => {
    try {
      const threadId = await ensureThread();
      await apiQuick("/api/actions/run", {
        method: "POST",
        body: JSON.stringify({
          actionKey: "DAILY_BRIEFING_GENERATE",
          payload: { source: "quick" },
          threadId,
        }),
      });
      setMessage("Generate a daily briefing.");
      await sendMessage();
    } catch (error: any) {
      setRedeemError(error?.message || "Briefing failed");
    }
  };

  const handleStartCall = async () => {
    const phone = window.prompt("Enter destination phone number in E.164 format (example +229xxxxxxxx)");
    if (!phone) return;
    const agentKeyInput = window.prompt("Agent key for voice routing", "chairman_assistant");
    const agentKey = String(agentKeyInput || "chairman_assistant").trim() || "chairman_assistant";
    setStartingCall(true);
    try {
      await apiQuick("/api/voice/call", {
        method: "POST",
        body: JSON.stringify({
          toE164: phone.trim(),
          agentKey,
          record: false,
        }),
      });
      toast({
        title: "Live call started",
        description: "Voice call request sent.",
      });
    } catch (error: any) {
      toast({
        title: "Live call failed",
        description: error?.message || "Unable to start live call.",
        variant: "destructive",
      });
    } finally {
      setStartingCall(false);
    }
  };

  const renderMessageContent = (content: string) => {
    const text = String(content || "");
    const parts = text.split(/(https?:\/\/[^\s]+|\/[a-zA-Z0-9][\w\-./?=&%#]*)/g);
    return parts.map((part, index) => {
      if (!part) return null;
      const isExternal = /^https?:\/\//i.test(part);
      const isInternal = part.startsWith("/") && !part.startsWith("//");
      if (!isExternal && !isInternal) return <span key={`text-${index}`}>{part}</span>;

      const trailing = part.match(/[),.;!?]+$/)?.[0] || "";
      const href = trailing ? part.slice(0, -trailing.length) : part;
      if (!href) return <span key={`text-${index}`}>{part}</span>;
      const normalized = isInternal ? normalizeInternalPath(href) : href;

      return (
        <span key={`link-${index}`}>
          {isExternal ? (
            <a
              href={normalized}
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-dotted underline-offset-2 text-blue-200 hover:text-blue-100"
            >
              {normalized}
            </a>
          ) : (
            <button
              type="button"
              onClick={() => setLocation(normalized)}
              className="underline decoration-dotted underline-offset-2 text-blue-200 hover:text-blue-100"
            >
              {normalized}
            </button>
          )}
          {trailing ? <span>{trailing}</span> : null}
        </span>
      );
    });
  };

  return (
    <div className="min-h-screen bg-[#070B12] text-white flex flex-col pb-[env(safe-area-inset-bottom)]">
      <header className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-blue-300" />
          </div>
          <div>
            <div className="text-sm font-semibold">{assistantName}</div>
            <div className="text-xs text-white/60">Quick Chairman Chat</div>
          </div>
        </div>
        {sessionUser ? <div className="text-xs text-white/60">Signed in as {sessionUser.displayName}</div> : null}
      </header>

      <main className="flex-1 px-4 md:px-5 py-4 space-y-4">
        {redeemError ? (
          <Card className="bg-white/5 border-white/10 p-4 text-sm text-rose-300">{redeemError}</Card>
        ) : null}

        <div className="flex gap-2 overflow-x-auto pb-1">
          <Button
            size="sm"
            variant="outline"
            className="border-white/15 text-white/80"
            onClick={requestBriefing}
            disabled={resolvingThread}
          >
            Daily briefing
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-white/15 text-white/80"
            onClick={handleStartCall}
            disabled={startingCall}
          >
            {startingCall ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PhoneCall className="h-4 w-4 mr-1" />}
            Start live call
          </Button>
        </div>

        <div className="space-y-3">
          {messages.length === 0 ? (
            <div className="text-sm text-white/60">Say hello to {assistantName}.</div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.senderType === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm ${
                    msg.senderType === "user" ? "bg-blue-600 text-white" : "bg-white/10 text-white"
                  }`}
                >
                  <div className="text-[11px] text-white/60 mb-1">
                    {msg.senderName || (msg.senderType === "user" ? "You" : assistantName)} | {formatTime(msg.createdAt)}
                  </div>
                  <div className="whitespace-pre-wrap break-words">{renderMessageContent(msg.content)}</div>
                  {extractAttachments(msg).length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {extractAttachments(msg).map((attachment) => (
                        attachment.url ? (
                          <a
                            key={`${msg.id}-${attachment.id}-${attachment.name}`}
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-blue-200 hover:text-blue-100"
                          >
                            <div className="flex items-center gap-1">
                              <Paperclip className="h-3 w-3" />
                              <span className="truncate">{attachment.name}</span>
                              {typeof attachment.size === "number" ? (
                                <span className="text-white/50">({Math.max(0, Math.round(attachment.size / 1024))} KB)</span>
                              ) : null}
                            </div>
                          </a>
                        ) : (
                          <div
                            key={`${msg.id}-${attachment.id}-${attachment.name}`}
                            className="block rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-white/55"
                          >
                            <div className="flex items-center gap-1">
                              <Paperclip className="h-3 w-3" />
                              <span className="truncate">{attachment.name}</span>
                            </div>
                          </div>
                        )
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
          {assistantThinking ? (
            <div className="flex justify-start">
              <div className="max-w-[82%] rounded-2xl px-3 py-2 text-sm bg-white/10 text-white">
                <div className="text-[11px] text-white/60 mb-1">{assistantName}</div>
                <div className="inline-flex items-center gap-2 text-white/80">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Thinking...</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {pendingAttachments.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {pendingAttachments.map((attachment) => (
              <div
                key={`${attachment.id}-${attachment.name}`}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80 shrink-0"
              >
                <Paperclip className="h-3 w-3" />
                <span className="max-w-[180px] truncate">{attachment.name}</span>
                <button
                  type="button"
                  className="text-white/60 hover:text-white"
                  onClick={() =>
                    setPendingAttachments((prev) =>
                      prev.filter((item) => !(item.id === attachment.id && item.name === attachment.name)),
                    )
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <form
          className="flex items-center gap-2 sticky bottom-0 bg-[#070B12] pt-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (sending || loading) return;
            void sendMessage();
          }}
        >
          <input
            ref={attachmentInputRef}
            type="file"
            accept="image/*,audio/*,video/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (file) void uploadAttachment(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 border-white/15 text-white/80"
            onClick={() => attachmentInputRef.current?.click()}
            disabled={uploadingAttachment}
          >
            {uploadingAttachment ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          </Button>
          <VoiceToTextButton
            disabled={uploadingAttachment}
            draftText={message}
            setDraftText={setMessage}
            appendDraftText={(text) => setMessage((prev) => `${prev}${prev.trim().length ? " " : ""}${text}`.trimStart())}
            conversationId={thread?.id ? `assistant-thread:${thread.id}` : null}
            tenantId={null}
            apiClient={apiQuick}
          />
          <Input
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              if (composerError) setComposerError(null);
            }}
            placeholder={thread?.id ? `Message ${assistantName}...` : `Message ${assistantName}... (thread auto-creates)`}
            disabled={uploadingAttachment}
            className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/40"
          />
          <Button
            type="submit"
            className="h-11 w-11 p-0"
            disabled={loading || sending || (!message.trim() && pendingAttachments.length === 0)}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
        {composerError ? (
          <div className="text-xs text-rose-300 flex items-center justify-between gap-2">
            <span className="truncate">{composerError}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] text-white/80"
              onClick={() => void handleRetryConnection()}
            >
              Retry
            </Button>
          </div>
        ) : null}
        {!composerError && !thread?.id ? (
          <div className="text-xs text-white/50">
            {resolvingThread ? "Preparing secure thread..." : "Thread will auto-create on your first message."}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-white/50">Recent runs</div>
          {runs.length === 0 ? (
            <div className="text-xs text-white/40">No runs yet.</div>
          ) : (
            runs.map((run) => (
              <Card key={run.id} className="bg-white/5 border-white/10 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{run.actionKey}</div>
                  <Badge variant="outline" className={statusTone(run.status)}>
                    {run.status}
                  </Badge>
                </div>
                {run.createdAt ? (
                  <div className="text-xs text-white/50 mt-1">{formatTime(run.createdAt)}</div>
                ) : null}
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
}


