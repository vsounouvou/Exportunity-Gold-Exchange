import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { useToast } from "@/hooks/use-toast";
import { VoiceToTextButton } from "@/components/chat/VoiceToTextButton";
import {
  AlertTriangle,
  Brain,
  ChevronDown,
  ChevronUp,
  FileUp,
  Loader2,
  Paperclip,
  PhoneCall,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { useLocation } from "wouter";

type ChatAttachment = {
  id: string;
  name: string;
  type?: string;
  size?: number;
  version?: number;
  url?: string;
};

type CompanyBrainSource = {
  source_id: number;
  source_version_id: number;
  title: string;
  business_relevance: string;
  confidentiality: string;
};

type CompanyBrainEvidenceRef = {
  sourceId: number;
  sourceVersionId: number;
  title: string;
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

type ExecutiveTruth = {
  generatedAt: string;
  brain: {
    flags: Record<string, { envName: string; enabled: boolean }>;
    counts: {
      sources: number;
      activeSources: number;
      claims: number;
      verifiedInternalClaims: number;
      approvedExternalClaims: number;
      openConflicts: number;
      pendingApprovals: number;
    };
    sourceSecurity: Array<{ status: string; count: number }>;
    latestContextPack: {
      id: number;
      taskKey: string;
      purpose: string;
      status: string;
      citationCount: number;
      conflictCount: number;
      createdAt: string | null;
      expiresAt: string | null;
    } | null;
  };
  organization: {
    organizationVersion: string | null;
    baseline: number;
    summary: {
      total: number;
      available: number;
      linkedRuntime: number;
      activeRuntime: number;
      productionEnabled: number;
    };
    departments: Array<{
      key: string;
      name: string;
      total: number;
      available: number;
      linkedRuntime: number;
      activeRuntime: number;
      productionEnabled: number;
    }>;
  };
  workforce: {
    total: number;
    monitoring: number;
    proposed: number;
    approved: number;
    provisioned: number;
    active: number;
    paused: number;
  };
  controls: {
    readOnly: true;
    approvalsAvailable: false;
    agentLifecycleMutationAvailable: false;
    externalActionsStarted: false;
  };
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

function formatDateTime(value?: string | null) {
  if (!value) return "No record";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Unknown date";
}

function percentage(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function extractCompanyBrainEvidenceRefs(message?: QuickMessage | null): CompanyBrainEvidenceRef[] {
  const raw = Array.isArray(message?.metadata?.companyBrainEvidenceRefs)
    ? message?.metadata?.companyBrainEvidenceRefs
    : [];
  return raw
    .map((entry: any) => ({
      sourceId: Number(entry?.sourceId || 0),
      sourceVersionId: Number(entry?.sourceVersionId || 0),
      title: typeof entry?.title === "string" && entry.title.trim()
        ? entry.title.trim()
        : `Company Brain evidence #${Number(entry?.sourceId || 0)}`,
    }))
    .filter((entry) => entry.sourceId > 0 && entry.sourceVersionId > 0);
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
  const [companyBrainSources, setCompanyBrainSources] = useState<CompanyBrainSource[]>([]);
  const [pendingEvidenceRefs, setPendingEvidenceRefs] = useState<CompanyBrainEvidenceRef[]>([]);
  const [evidencePickerOpen, setEvidencePickerOpen] = useState(false);
  const [loadingEvidenceSources, setLoadingEvidenceSources] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [startingCall, setStartingCall] = useState(false);
  const [assistantThinking, setAssistantThinking] = useState(false);
  const [resolvingThread, setResolvingThread] = useState(false);
  const [executiveTruth, setExecutiveTruth] = useState<ExecutiveTruth | null>(null);
  const [executiveTruthOpen, setExecutiveTruthOpen] = useState(false);
  const [loadingExecutiveTruth, setLoadingExecutiveTruth] = useState(false);
  const [executiveTruthError, setExecutiveTruthError] = useState<string | null>(null);
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

  const refreshExecutiveTruth = useCallback(async () => {
    if (!sessionToken) return;
    setLoadingExecutiveTruth(true);
    setExecutiveTruthError(null);
    try {
      const payload = await apiQuick("/api/chairman/executive-truth");
      setExecutiveTruth(payload as ExecutiveTruth);
    } catch (error: any) {
      setExecutiveTruthError(error?.message || "Executive truth could not be loaded.");
    } finally {
      setLoadingExecutiveTruth(false);
    }
  }, [apiQuick, sessionToken]);

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

  useEffect(() => {
    if (!sessionToken) return;
    void refreshExecutiveTruth();
  }, [refreshExecutiveTruth, sessionToken]);

  const sendMessage = async () => {
    const content = message.trim();
    if (!content && pendingAttachments.length === 0 && pendingEvidenceRefs.length === 0) return;
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
        content: content || (pendingEvidenceRefs.length ? "Review the selected Company Brain evidence for this task." : `Shared ${pendingAttachments.length} attachment(s).`),
        createdAt: new Date().toISOString(),
        metadata: {
          ...(pendingAttachments.length ? { attachments: pendingAttachments } : {}),
          ...(pendingEvidenceRefs.length ? { companyBrainEvidenceRefs: pendingEvidenceRefs } : {}),
        },
      },
    ]);
    try {
      const payload = await apiQuick("/api/assistant/message", {
        method: "POST",
        body: JSON.stringify({
          threadId,
          content,
          attachments: pendingAttachments,
          companyBrainEvidenceRefs: pendingEvidenceRefs.map(({ sourceId, sourceVersionId }) => ({ sourceId, sourceVersionId })),
          metadata: pendingEvidenceRefs.length ? { companyBrainEvidenceRefs: pendingEvidenceRefs } : undefined,
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
      setPendingEvidenceRefs([]);
      setEvidencePickerOpen(false);
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

  const toggleCompanyBrainEvidence = async () => {
    if (evidencePickerOpen) {
      setEvidencePickerOpen(false);
      return;
    }
    let threadId: number;
    try {
      threadId = await ensureThread();
    } catch (error: any) {
      setComposerError(error?.message || "Thread is not available yet.");
      return;
    }
    setLoadingEvidenceSources(true);
    try {
      const payload = await apiQuick(`/api/assistant/thread/${threadId}/company-brain-sources`);
      setCompanyBrainSources(Array.isArray(payload?.sources) ? payload.sources : []);
      setEvidencePickerOpen(true);
    } catch (error: any) {
      setComposerError(error?.message || "Company Brain evidence is unavailable.");
    } finally {
      setLoadingEvidenceSources(false);
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
          <Button
            size="sm"
            variant="outline"
            className="border-white/15 text-white/80"
            onClick={() => {
              setExecutiveTruthOpen((current) => !current);
              if (!executiveTruth && !loadingExecutiveTruth) void refreshExecutiveTruth();
            }}
            aria-expanded={executiveTruthOpen}
            aria-controls="chairman-executive-truth"
          >
            <ShieldCheck className="mr-1 h-4 w-4" />
            Company truth
            {executiveTruthOpen ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}
          </Button>
        </div>

        {executiveTruthOpen ? (
          <Card
            id="chairman-executive-truth"
            className="space-y-4 border-white/10 bg-white/5 p-4 text-white"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  Executive truth
                  <Badge variant="outline" className="border-emerald-400/30 text-[10px] text-emerald-200">
                    Read-only
                  </Badge>
                </div>
                <div className="mt-1 text-[11px] text-white/50">
                  Evidence, conflicts, context, and organization coverage from current records.
                </div>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-white/65 hover:text-white"
                onClick={() => void refreshExecutiveTruth()}
                disabled={loadingExecutiveTruth}
                title="Refresh executive truth"
              >
                <RefreshCw className={`h-4 w-4 ${loadingExecutiveTruth ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {executiveTruthError ? (
              <div className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">
                {executiveTruthError}
              </div>
            ) : null}

            {!executiveTruth && loadingExecutiveTruth ? (
              <div className="flex items-center gap-2 py-4 text-xs text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading governed company state...
              </div>
            ) : null}

            {executiveTruth ? (
              <>
                <section className="space-y-2" aria-label="Company Brain truth">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-white/85">
                      <Brain className="h-4 w-4 text-amber-200" />
                      Company Brain
                    </div>
                    <span className="text-[10px] text-white/45">
                      {executiveTruth.brain.flags.companyBrain?.enabled && executiveTruth.brain.flags.contextPacks?.enabled
                        ? "Runtime and context packs on"
                        : "Runtime restricted"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ["Active sources", executiveTruth.brain.counts.activeSources],
                      ["Internal claims", executiveTruth.brain.counts.verifiedInternalClaims],
                      ["Public claims", executiveTruth.brain.counts.approvedExternalClaims],
                      ["Pending reviews", executiveTruth.brain.counts.pendingApprovals],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                        <div className="text-lg font-semibold text-white">{value}</div>
                        <div className="text-[10px] text-white/50">{label}</div>
                      </div>
                    ))}
                  </div>
                  {executiveTruth.brain.counts.openConflicts > 0 ? (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {executiveTruth.brain.counts.openConflicts} open evidence conflict{executiveTruth.brain.counts.openConflicts === 1 ? "" : "s"} require full governance review.
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5">
                    {executiveTruth.brain.sourceSecurity.map((item) => (
                      <Badge key={item.status} variant="outline" className="border-white/15 text-[10px] text-white/65">
                        {item.status.replace(/_/g, " ")}: {item.count}
                      </Badge>
                    ))}
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-white/60">
                    {executiveTruth.brain.latestContextPack ? (
                      <>
                        <div className="font-medium text-white/80">Latest governed context</div>
                        <div className="mt-1 line-clamp-2">{executiveTruth.brain.latestContextPack.purpose || executiveTruth.brain.latestContextPack.taskKey}</div>
                        <div className="mt-1">
                          {executiveTruth.brain.latestContextPack.citationCount} citation{executiveTruth.brain.latestContextPack.citationCount === 1 ? "" : "s"} · {executiveTruth.brain.latestContextPack.conflictCount} conflict{executiveTruth.brain.latestContextPack.conflictCount === 1 ? "" : "s"} · {formatDateTime(executiveTruth.brain.latestContextPack.createdAt)}
                        </div>
                      </>
                    ) : (
                      "No governed context pack has been recorded."
                    )}
                  </div>
                </section>

                <section className="space-y-2" aria-label="Organization coverage">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-white/85">
                      <UsersRound className="h-4 w-4 text-blue-200" />
                      Global organization
                    </div>
                    <span className="text-[10px] text-white/45">
                      {executiveTruth.organization.summary.activeRuntime} active / {executiveTruth.organization.summary.total || executiveTruth.organization.baseline} seats
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-blue-400"
                      style={{
                        width: `${percentage(
                          executiveTruth.organization.summary.activeRuntime,
                          executiveTruth.organization.summary.total || executiveTruth.organization.baseline,
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-black/20 px-2 py-2"><div className="text-sm font-semibold">{executiveTruth.organization.summary.linkedRuntime}</div><div className="text-[9px] text-white/45">Linked</div></div>
                    <div className="rounded-lg bg-black/20 px-2 py-2"><div className="text-sm font-semibold">{executiveTruth.organization.summary.productionEnabled}</div><div className="text-[9px] text-white/45">Production enabled</div></div>
                    <div className="rounded-lg bg-black/20 px-2 py-2"><div className="text-sm font-semibold">{executiveTruth.organization.summary.available}</div><div className="text-[9px] text-white/45">Available capacity</div></div>
                  </div>
                  <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                    {executiveTruth.organization.departments.map((department) => (
                      <div key={department.key} className="flex items-center justify-between gap-3 rounded-md bg-black/15 px-2.5 py-2 text-[11px]">
                        <span className="min-w-0 truncate text-white/70">{department.name}</span>
                        <span className="shrink-0 text-white/45">{department.activeRuntime} active / {department.total}</span>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-white/55">
                    Workforce demand: {executiveTruth.workforce.proposed} ready for review, {executiveTruth.workforce.approved} approved, {executiveTruth.workforce.active} active. This panel cannot approve or activate anything.
                  </div>
                </section>

                <div className="text-[10px] text-white/35">
                  Updated {formatDateTime(executiveTruth.generatedAt)} · no external action started
                </div>
              </>
            ) : null}
          </Card>
        ) : null}

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
                  {extractCompanyBrainEvidenceRefs(msg).length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {extractCompanyBrainEvidenceRefs(msg).map((evidence) => (
                        <div key={`${msg.id}:${evidence.sourceId}:${evidence.sourceVersionId}`} className="flex items-center gap-1 rounded-lg border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[11px] text-amber-100">
                          <Brain className="h-3 w-3" />
                          <span className="truncate">{evidence.title}</span>
                        </div>
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

        {evidencePickerOpen ? (
          <div className="max-h-44 overflow-y-auto rounded-lg border border-white/15 bg-[#0d1420] p-2">
            <div className="mb-2 flex items-center justify-between gap-2 px-1 text-xs font-semibold text-white/75">
              <span>Clean Company Brain evidence</span>
              <button type="button" className="text-white/50 hover:text-white" onClick={() => setEvidencePickerOpen(false)}><X className="h-3.5 w-3.5" /></button>
            </div>
            {companyBrainSources.map((source) => {
              const selected = pendingEvidenceRefs.some((item) => item.sourceId === source.source_id && item.sourceVersionId === source.source_version_id);
              return (
                <button
                  key={`${source.source_id}:${source.source_version_id}`}
                  type="button"
                  className={`mb-1 flex w-full items-start justify-between gap-2 rounded-md px-2 py-2 text-left text-xs ${selected ? "bg-amber-300/15 text-amber-100" : "bg-white/5 text-white/75 hover:bg-white/10"}`}
                  onClick={() => setPendingEvidenceRefs((current) => selected
                    ? current.filter((item) => !(item.sourceId === source.source_id && item.sourceVersionId === source.source_version_id))
                    : [...current, { sourceId: source.source_id, sourceVersionId: source.source_version_id, title: source.title }])}
                >
                  <span className="min-w-0"><span className="block truncate font-semibold">{source.title}</span><span className="mt-0.5 block text-[10px] opacity-60">{source.business_relevance} · {source.confidentiality}</span></span>
                  <span className="shrink-0">{selected ? "Linked" : "Link"}</span>
                </button>
              );
            })}
            {!companyBrainSources.length ? <div className="px-2 py-4 text-center text-xs text-white/50">No clean evidence is available. Review a source in Company Brain first.</div> : null}
          </div>
        ) : null}

        {pendingAttachments.length > 0 || pendingEvidenceRefs.length > 0 ? (
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
            {pendingEvidenceRefs.map((evidence) => (
              <div key={`${evidence.sourceId}:${evidence.sourceVersionId}`} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-xs text-amber-100">
                <Brain className="h-3 w-3" />
                <span className="max-w-[180px] truncate">{evidence.title}</span>
                <button type="button" className="text-amber-100/60 hover:text-amber-100" onClick={() => setPendingEvidenceRefs((current) => current.filter((item) => !(item.sourceId === evidence.sourceId && item.sourceVersionId === evidence.sourceVersionId)))}><X className="h-3 w-3" /></button>
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
            title="Link reviewed Company Brain evidence"
            className="h-11 w-11 border-white/15 text-white/80"
            onClick={() => void toggleCompanyBrainEvidence()}
            disabled={loadingEvidenceSources}
          >
            {loadingEvidenceSources ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
          </Button>
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
            disabled={loading || sending || (!message.trim() && pendingAttachments.length === 0 && pendingEvidenceRefs.length === 0)}
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


