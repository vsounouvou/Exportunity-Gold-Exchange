import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/lib/tenant";
import { apiRequest } from "@/lib/queryClient";
import { useIsMobile } from "@/hooks/use-mobile";
import { useChairmanContext } from "@/hooks/use-chairman-context";
import { useToast } from "@/hooks/use-toast";
import { VoiceToTextButton } from "@/components/chat/VoiceToTextButton";
import {
  Activity,
  ArrowUpRight,
  FileUp,
  History,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  Move,
  Paperclip,
  PhoneCall,
  Send,
  Sparkles,
  X,
} from "lucide-react";

type TerminalAgent = {
  id: number;
  name: string;
  displayName: string;
  role: string;
  status: string;
  avatarUrl?: string | null;
  isTerminalDefault?: boolean;
};

type AssistantThread = {
  id: number;
  assistantDisplayName?: string | null;
  assistantRole?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lastMessage?: { content?: string; created_at?: string } | null;
};

type AssistantMessage = {
  id: number;
  senderType: "user" | "assistant" | "system";
  senderName?: string | null;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
};

type ChatAttachment = {
  id: string;
  name: string;
  type?: string;
  size?: number;
  version?: number;
  url?: string;
  textPreview?: string;
};

type ActionRun = {
  id: number;
  actionKey: string;
  status: string;
  createdAt?: string;
  evidence?: Array<{ id: number; evidenceType?: string | null; payload?: any }>;
  source?: string;
};

type ManagerContextPayload = {
  pageKey?: string | null;
  pageLabel?: string | null;
  managerAgentId?: number | null;
  managerName?: string | null;
  managerRole?: string | null;
};

type DockLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed: boolean;
};

const DOCK_LAYOUT_STORAGE_KEY = "exportunity:chairman-chat-dock-layout:v4";
const MIN_DOCK_WIDTH = 300;
const MIN_DOCK_HEIGHT = 320;
const DEFAULT_DOCK_WIDTH = 312;
const DEFAULT_DOCK_HEIGHT = 360;
const WORK_SURFACE_PATH_PATTERN = /^\/(admin|ai-team|dashboard|meetings|m\/|operations|actions|agenda|goals|objectives|decisions|tasks)(\/|$)/i;

function getDefaultDockLayout(): DockLayout {
  if (typeof window === "undefined") {
    return { x: 24, y: 96, width: DEFAULT_DOCK_WIDTH, height: DEFAULT_DOCK_HEIGHT, collapsed: false };
  }
  return {
    x: Math.max(16, window.innerWidth - DEFAULT_DOCK_WIDTH - 18),
    y: Math.max(80, window.innerHeight - DEFAULT_DOCK_HEIGHT - 92),
    width: Math.min(DEFAULT_DOCK_WIDTH, Math.max(MIN_DOCK_WIDTH, window.innerWidth - 32)),
    height: Math.min(DEFAULT_DOCK_HEIGHT, Math.max(MIN_DOCK_HEIGHT, window.innerHeight - 120)),
    collapsed: false,
  };
}

function getWorkSurfaceDockLayout(): DockLayout {
  if (typeof window === "undefined") return getDefaultDockLayout();
  const width = Math.min(316, Math.max(MIN_DOCK_WIDTH, window.innerWidth - 32));
  const height = Math.min(360, Math.max(MIN_DOCK_HEIGHT, window.innerHeight - 132));
  return clampDockLayout({
    x: window.innerWidth - width - 16,
    y: Math.max(76, window.innerHeight - height - 24),
    width,
    height,
    collapsed: false,
  });
}

function clampDockLayout(next: DockLayout): DockLayout {
  if (typeof window === "undefined") return next;
  const width = Math.min(Math.max(next.width, MIN_DOCK_WIDTH), Math.max(MIN_DOCK_WIDTH, window.innerWidth - 24));
  const height = Math.min(Math.max(next.height, MIN_DOCK_HEIGHT), Math.max(MIN_DOCK_HEIGHT, window.innerHeight - 32));
  return {
    ...next,
    width,
    height,
    x: Math.min(Math.max(12, next.x), Math.max(12, window.innerWidth - width - 12)),
    y: Math.min(Math.max(12, next.y), Math.max(12, window.innerHeight - height - 12)),
  };
}

function readStoredDockLayout(): DockLayout {
  if (typeof window === "undefined") return getDefaultDockLayout();
  try {
    const stored = window.localStorage.getItem(DOCK_LAYOUT_STORAGE_KEY);
    if (!stored) return getDefaultDockLayout();
    const parsed = JSON.parse(stored) as Partial<DockLayout>;
    return clampDockLayout({
      ...getDefaultDockLayout(),
      ...parsed,
      collapsed: Boolean(parsed.collapsed),
    });
  } catch {
    return getDefaultDockLayout();
  }
}

function formatTimestamp(value?: string | null) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleTimeString();
  } catch {
    return "";
  }
}

function statusTone(status: string) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "SUCCEEDED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized === "FAILED") return "border-rose-200 bg-rose-50 text-rose-700";
  if (normalized === "RUNNING") return "border-blue-200 bg-blue-50 text-blue-700";
  if (normalized === "REQUIRES_APPROVAL") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function extractMessageAttachments(message?: AssistantMessage | null): ChatAttachment[] {
  const raw = Array.isArray(message?.metadata?.attachments) ? message?.metadata?.attachments : [];
  return raw.filter((entry: any) => entry && typeof entry === "object" && typeof entry.name === "string");
}

function toPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

function isTassiAssistant(name: string | null | undefined) {
  const normalizedName = String(name || "").trim().toLowerCase();
  return normalizedName.includes("tassi");
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

function renderLinkFragment(
  hrefRaw: string,
  label: string,
  key: string,
  onInternalPath?: (path: string) => void,
) {
  const href = String(hrefRaw || "").trim();
  if (!href) return null;
  const isExternal = /^https?:\/\//i.test(href);
  const isInternal = href.startsWith("/") && !href.startsWith("//");
  const normalizedHref = isInternal ? normalizeInternalPath(href) : href;
  if (!isExternal && !isInternal) return <span key={key}>{label}</span>;

  if (isInternal && onInternalPath) {
    return (
      <button
        key={key}
        type="button"
        onClick={() => onInternalPath(normalizedHref)}
        className="underline decoration-dotted underline-offset-2 text-blue-200 hover:text-blue-100"
      >
        {label}
      </button>
    );
  }

  return (
    <a
      key={key}
      href={normalizedHref}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noreferrer noopener" : undefined}
      className="underline decoration-dotted underline-offset-2 text-blue-200 hover:text-blue-100"
    >
      {label}
    </a>
  );
}

function renderMessageContent(content: string, onInternalPath?: (path: string) => void) {
  const text = String(content || "");
  const markdownParts = text.split(/(\[[^\]]+\]\((?:https?:\/\/[^\s)]+|\/[^\s)]+)\))/g);
  const output: Array<JSX.Element | null> = [];

  markdownParts.forEach((mdPart, mdIndex) => {
    if (!mdPart) return;
    const markdownMatch = mdPart.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)$/);
    if (markdownMatch) {
      const label = markdownMatch[1] || markdownMatch[2];
      output.push(renderLinkFragment(markdownMatch[2], label, `md-${mdIndex}`, onInternalPath));
      return;
    }

    const parts = mdPart.split(/(https?:\/\/[^\s]+|\/[a-zA-Z0-9][\w\-./?=&%#]*)/g);
    parts.forEach((part, partIndex) => {
      if (!part) return;
      const isExternal = /^https?:\/\//i.test(part);
      const isInternal = part.startsWith("/") && !part.startsWith("//");
      if (!isExternal && !isInternal) {
        output.push(<span key={`txt-${mdIndex}-${partIndex}`}>{part}</span>);
        return;
      }

      const trailing = part.match(/[),.;!?]+$/)?.[0] || "";
      const href = trailing ? part.slice(0, -trailing.length) : part;
      if (!href) {
        output.push(<span key={`txt-${mdIndex}-${partIndex}`}>{part}</span>);
        return;
      }

      output.push(renderLinkFragment(href, href, `lnk-${mdIndex}-${partIndex}`, onInternalPath));
      if (trailing) {
        output.push(<span key={`trail-${mdIndex}-${partIndex}`}>{trailing}</span>);
      }
    });
  });

  return output;
}

export function ChairmanChatDock() {
  const { tenant } = useTenant();
  const tenantId = Number(tenant?.id || 0);
  const isMobile = useIsMobile();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { currentCompanyId } = useChairmanContext();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "history" | "actions">("chat");
  const [message, setMessage] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [managerContext, setManagerContext] = useState<ManagerContextPayload | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [assistantThinking, setAssistantThinking] = useState(false);
  const [isEnsuringThread, setIsEnsuringThread] = useState(false);
  const [dockLayout, setDockLayout] = useState<DockLayout>(() => readStoredDockLayout());
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const dockDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const maxAttachmentBytes = 20 * 1024 * 1024;
  const isWorkSurface = WORK_SURFACE_PATH_PATTERN.test(location || "");

  const headers = useMemo(() => ({ "x-chairman-admin-override": "1" }), []);

  const openDock = useCallback(() => {
    setDockLayout((current) => ({
      ...clampDockLayout(current),
      collapsed: false,
    }));
    setIsOpen(true);
  }, []);

  useEffect(() => {
    if (isMobile || typeof window === "undefined") return;
    setDockLayout((current) => clampDockLayout(current));
    const handleResize = () => setDockLayout((current) => clampDockLayout(current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isMobile]);

  useEffect(() => {
    if (isMobile || typeof window === "undefined") return;
    window.localStorage.setItem(DOCK_LAYOUT_STORAGE_KEY, JSON.stringify(dockLayout));
  }, [dockLayout, isMobile]);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<any>)?.detail || {};
      setManagerContext({
        pageKey: typeof detail?.pageKey === "string" ? detail.pageKey : null,
        pageLabel: typeof detail?.pageLabel === "string" ? detail.pageLabel : null,
        managerAgentId: Number.isFinite(Number(detail?.managerAgentId)) ? Number(detail.managerAgentId) : null,
        managerName: typeof detail?.managerName === "string" ? detail.managerName : null,
        managerRole: typeof detail?.managerRole === "string" ? detail.managerRole : null,
      });
      openDock();
    };
    const handleContext = (event: Event) => {
      const detail = (event as CustomEvent<any>)?.detail || {};
      setManagerContext({
        pageKey: typeof detail?.pageKey === "string" ? detail.pageKey : null,
        pageLabel: typeof detail?.pageLabel === "string" ? detail.pageLabel : null,
        managerAgentId: Number.isFinite(Number(detail?.managerAgentId)) ? Number(detail.managerAgentId) : null,
        managerName: typeof detail?.managerName === "string" ? detail.managerName : null,
        managerRole: typeof detail?.managerRole === "string" ? detail.managerRole : null,
      });
    };
    window.addEventListener("chairman-dock:open", handleOpen as EventListener);
    window.addEventListener("chairman-dock:context", handleContext as EventListener);
    return () => {
      window.removeEventListener("chairman-dock:open", handleOpen as EventListener);
      window.removeEventListener("chairman-dock:context", handleContext as EventListener);
    };
  }, [openDock]);

  const terminalAgentQuery = useQuery<{ agent: TerminalAgent }>({
    queryKey: ["/api/tenants", tenantId, "terminal-agent"],
    queryFn: () =>
      apiRequest(`/api/tenants/${tenantId}/terminal-agent`, {
        headers,
      }),
    enabled: isOpen && tenantId > 0,
    staleTime: 60_000,
  });

  const threadQuery = useQuery<{ thread: AssistantThread; assistant: TerminalAgent }>({
    queryKey: ["/api/assistant/thread", tenantId],
    queryFn: () =>
      apiRequest("/api/assistant/thread", {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      }),
    enabled: isOpen && tenantId > 0,
  });

  useEffect(() => {
    const threadId = toPositiveInt(threadQuery.data?.thread?.id);
    if (threadId && !toPositiveInt(activeThreadId)) {
      setActiveThreadId(threadId);
    }
  }, [threadQuery.data?.thread?.id, activeThreadId]);

  useEffect(() => {
    if (isOpen) return;
    setActiveThreadId(null);
    setPendingAttachments([]);
    setMessage("");
    setComposerError(null);
    setAssistantThinking(false);
    setIsEnsuringThread(false);
  }, [isOpen]);

  const stableActiveThreadId = toPositiveInt(activeThreadId);

  const ensureThreadReady = useCallback(async () => {
    const existing = toPositiveInt(activeThreadId) ?? toPositiveInt(threadQuery.data?.thread?.id);
    if (existing) {
      if (!toPositiveInt(activeThreadId)) setActiveThreadId(existing);
      return existing;
    }

    setIsEnsuringThread(true);
    try {
      const payload = await withTimeout(
        apiRequest("/api/assistant/thread", {
          method: "POST",
          headers,
          body: JSON.stringify({}),
        }),
        12_000,
        "Thread creation timed out. Retry.",
      );
      const threadId = toPositiveInt(payload?.thread?.id);
      if (!threadId) {
        throw new Error("Assistant thread unavailable. Please retry.");
      }
      setActiveThreadId(threadId);
      queryClient.setQueryData(["/api/assistant/thread", tenantId], payload);
      return threadId;
    } finally {
      setIsEnsuringThread(false);
    }
  }, [activeThreadId, headers, queryClient, tenantId, threadQuery.data?.thread?.id]);

  const messagesQuery = useQuery<{ thread: AssistantThread; messages: AssistantMessage[] }>({
    queryKey: ["/api/assistant/thread", stableActiveThreadId, "messages"],
    queryFn: () =>
      apiRequest(`/api/assistant/thread/${stableActiveThreadId}/messages?limit=120`, {
        headers,
      }),
    enabled: isOpen && !!stableActiveThreadId,
    refetchInterval: isOpen ? 15_000 : false,
  });

  const historyQuery = useQuery<{ threads: AssistantThread[] }>({
    queryKey: ["/api/assistant/threads"],
    queryFn: () =>
      apiRequest("/api/assistant/threads?limit=10", {
        headers,
      }),
    enabled: isOpen,
  });

  const actionsQuery = useQuery<{ runs: ActionRun[] }>({
    queryKey: ["/api/actions/runs"],
    queryFn: () =>
      apiRequest("/api/actions/runs?limit=30", {
        headers,
      }),
    enabled: isOpen,
    refetchInterval: isOpen ? 15_000 : false,
  });

  useEffect(() => {
    if (!isOpen) return;
    const node = messagesScrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "auto" });
  }, [messagesQuery.data?.messages, isOpen]);

  const messagesQueryKey = useMemo(
    () => ["/api/assistant/thread", stableActiveThreadId, "messages"] as const,
    [stableActiveThreadId],
  );
  const isThreadReady = Boolean(stableActiveThreadId);

  const uploadAttachmentMutation = useMutation({
    mutationFn: async (file: File) => {
      const threadId = await ensureThreadReady();
      const formData = new FormData();
      formData.append("file", file);
      return apiRequest(`/api/assistant/thread/${threadId}/attachments`, {
        method: "POST",
        headers,
        body: formData,
      });
    },
    onSuccess: (payload) => {
      const resolvedThreadId = toPositiveInt(payload?.threadId);
      if (resolvedThreadId && resolvedThreadId !== stableActiveThreadId) {
        setActiveThreadId(resolvedThreadId);
      }
      const attachment = payload?.attachment;
      if (!attachment || typeof attachment !== "object") return;
      setComposerError(null);
      setPendingAttachments((prev) => [...prev, attachment as ChatAttachment]);
    },
    onError: (error: any) => {
      const message = error?.message || "Unable to upload attachment.";
      setComposerError(message);
      toast({
        title: "Attachment upload failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (input: { content: string; attachments: ChatAttachment[] }) => {
      return await apiRequest("/api/assistant/message", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...(stableActiveThreadId ? { threadId: stableActiveThreadId } : {}),
          content: input.content,
          attachments: input.attachments,
          companyId: currentCompanyId,
          metadata: {
            managerContext,
          },
        }),
      });
    },
    onMutate: async (input) => {
      setAssistantThinking(true);
      if (stableActiveThreadId) {
        await queryClient.cancelQueries({ queryKey: messagesQueryKey });
        const previous = queryClient.getQueryData<any>(messagesQueryKey);
        const optimisticMessage: AssistantMessage = {
          id: -Date.now(),
          senderType: "user",
          senderName: "You",
          content: input.content || `Shared ${input.attachments.length} attachment(s).`,
          createdAt: new Date().toISOString(),
          metadata: input.attachments.length ? { attachments: input.attachments } : {},
        };
        queryClient.setQueryData(messagesQueryKey, (current: any) => ({
          ...(current || {}),
          messages: [optimisticMessage, ...(Array.isArray(current?.messages) ? current.messages : [])],
        }));
        setMessage("");
        setPendingAttachments([]);
        return {
          previous,
          draft: {
            content: input.content,
            attachments: [...input.attachments],
          },
        };
      }
      setMessage("");
      setPendingAttachments([]);
      return {
        previous: null,
        draft: {
          content: input.content,
          attachments: [...input.attachments],
        },
      };
    },
    onSuccess: (payload) => {
      const resolvedThreadId = toPositiveInt(payload?.thread?.id);
      if (resolvedThreadId && resolvedThreadId !== stableActiveThreadId) {
        setActiveThreadId(resolvedThreadId);
        queryClient.invalidateQueries({ queryKey: ["/api/assistant/thread", resolvedThreadId, "messages"] });
      }
      setAssistantThinking(false);
      setComposerError(null);
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/assistant/threads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions/runs"] });
      const createdRuns = Array.isArray(payload?.actionRuns?.runIds) ? payload.actionRuns.runIds : [];
      if (createdRuns.length) {
        toast({
          title: "Actions queued",
          description: `${createdRuns.length} action run${createdRuns.length > 1 ? "s" : ""} created.`,
        });
      }
    },
    onError: (error: any, _variables, context) => {
      setAssistantThinking(false);
      if (context?.previous) {
        queryClient.setQueryData(messagesQueryKey, context.previous);
      }
      if (context?.draft) {
        setMessage(String(context.draft.content || ""));
        setPendingAttachments(Array.isArray(context.draft.attachments) ? context.draft.attachments : []);
      }
      console.error("[ChairmanChatDock] send message failed", error);
      setComposerError(error?.message || "Unable to send message.");
      toast({
        title: "Message failed",
        description: error?.message || "Unable to send message to the operations assistant.",
        variant: "destructive",
      });
    },
  });

  const openInternalRoute = useCallback(
    (path: string) => {
      const resolved = normalizeInternalPath(path);
      if (!resolved.startsWith("/")) return;
      setLocation(resolved);
    },
    [setLocation],
  );

  const navigateMutation = useMutation({
    mutationFn: async (input: { path: string; label: string }) => {
      const resolvedPath = normalizeInternalPath(input.path);
      const openExternal = /^https?:\/\//i.test(resolvedPath);

      if (openExternal) {
        window.open(resolvedPath, "_blank", "noopener");
      } else {
        openInternalRoute(resolvedPath);
      }

      try {
        const created = await apiRequest("/api/actions/run", {
          method: "POST",
          headers,
          body: JSON.stringify({
            actionKey: "NAVIGATE_OPEN_PAGE",
            payload: { path: resolvedPath, label: input.label },
            threadId: stableActiveThreadId,
          }),
        });
        const runId = created?.run?.id;
        if (!runId) return { logged: false };

        await apiRequest(`/api/actions/run/${runId}/evidence`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            complete: true,
            evidenceType: "NAVIGATE",
            payload: {
              path: resolvedPath,
              label: input.label,
              method: openExternal ? "new_tab" : "push",
            },
          }),
        });
        queryClient.invalidateQueries({ queryKey: ["/api/actions/runs"] });
        return { logged: true };
      } catch (error) {
        console.warn("[ChairmanChatDock] navigation evidence logging failed", error);
        return { logged: false };
      }
    },
    onSuccess: (result) => {
      if (result?.logged === false) {
        toast({
          title: "Navigation opened",
          description: "Route opened, but action evidence logging failed.",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Navigation action failed",
        description: error?.message || "Unable to execute navigation action.",
        variant: "destructive",
      });
    },
  });

  const liveCallMutation = useMutation({
    mutationFn: async (input: { toE164: string; agentKey: string }) =>
      apiRequest("/api/voice/call", {
        method: "POST",
        headers,
        body: JSON.stringify({
          toE164: input.toE164,
          agentKey: input.agentKey,
          record: false,
        }),
      }),
    onSuccess: () => {
      toast({
        title: "Live call started",
        description: "Voice call request sent.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Live call failed",
        description: error?.message || "Unable to start live call.",
        variant: "destructive",
      });
    },
  });

  const agent = terminalAgentQuery.data?.agent ?? threadQuery.data?.assistant;
  const messages = messagesQuery.data?.messages ?? [];
  const orderedMessages = useMemo(
    () =>
      [...messages].sort((left, right) => {
        const leftTime = new Date(left.createdAt || 0).getTime();
        const rightTime = new Date(right.createdAt || 0).getTime();
        if (leftTime !== rightTime) return leftTime - rightTime;
        return Number(left.id || 0) - Number(right.id || 0);
      }),
    [messages],
  );
  const threads = historyQuery.data?.threads ?? [];
  const runs = actionsQuery.data?.runs ?? [];
  const readyForSend = !sendMutation.isPending && !uploadAttachmentMutation.isPending;
  const assistantName = agent?.displayName || (tenant?.key === "exportunity" ? "Fenou" : "Tassi");
  const threadStatusText = threadQuery.isLoading || isEnsuringThread
    ? "Connecting..."
    : threadQuery.isError
      ? "Connection failed"
      : isThreadReady
        ? "Connected"
        : "Ready";

  const quickActions = [
    { label: "Open Actions", path: "/actions" },
    { label: "Open Goals", path: "/goals" },
    { label: "Open Agenda", path: "/agenda" },
  ];

  const handleAttachmentPick = () => {
    attachmentInputRef.current?.click();
  };

  const handleAttachmentChange = async (event: any) => {
    const file = event.target?.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
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
    if (!isThreadReady) {
      try {
        await ensureThreadReady();
      } catch (error: any) {
        const detail = error?.message || "Unable to create chat thread.";
        setComposerError(detail);
        toast({
          title: "Chat not ready",
          description: detail,
          variant: "destructive",
        });
        return;
      }
    }
    uploadAttachmentMutation.mutate(file);
  };

  const handleSend = () => {
    const content = message.trim();
    if (!content && pendingAttachments.length === 0) return;
    if (sendMutation.isPending || uploadAttachmentMutation.isPending) {
      setComposerError("Assistant is busy. Retry in a moment.");
      toast({
        title: "Assistant busy",
        description: "Please wait for the current operation to finish.",
        variant: "destructive",
      });
      return;
    }
    setComposerError(null);
    sendMutation.mutate({
      content,
      attachments: pendingAttachments,
    });
  };

  const handleRetryConnection = () => {
    setComposerError(null);
    void ensureThreadReady().catch(() => {});
    void threadQuery.refetch();
    if (stableActiveThreadId) {
      void messagesQuery.refetch();
    }
  };

  const handleStartLiveCall = () => {
    const phone = window.prompt("Enter destination phone number in E.164 format (example +229xxxxxxxx)");
    if (!phone) return;
    const agentKeyInput = window.prompt("Agent key for voice routing", "chairman_assistant");
    const agentKey = String(agentKeyInput || "chairman_assistant").trim() || "chairman_assistant";
    liveCallMutation.mutate({ toE164: phone.trim(), agentKey });
  };

  const toggleDockCollapsed = () => {
    setDockLayout((current) => ({ ...current, collapsed: !current.collapsed }));
  };

  const resetDockLayout = () => {
    setDockLayout(
      isWorkSurface && !isMobile ? getWorkSurfaceDockLayout() : getDefaultDockLayout(),
    );
  };

  const snapDockToSide = () => {
    if (typeof window === "undefined") return;
    const width = Math.min(360, Math.max(MIN_DOCK_WIDTH, window.innerWidth - 32));
    setDockLayout(
      clampDockLayout({
        x: window.innerWidth - width - 16,
        y: 82,
        width,
        height: Math.min(Math.max(MIN_DOCK_HEIGHT, window.innerHeight - 112), window.innerHeight - 96),
        collapsed: false,
      }),
    );
  };

  const snapDockToBottom = () => {
    if (typeof window === "undefined") return;
    const width = Math.min(620, Math.max(MIN_DOCK_WIDTH, window.innerWidth - 32));
    const height = Math.min(340, Math.max(MIN_DOCK_HEIGHT, window.innerHeight - 112));
    setDockLayout(
      clampDockLayout({
        x: Math.max(16, (window.innerWidth - width) / 2),
        y: Math.max(16, window.innerHeight - height - 16),
        width,
        height,
        collapsed: false,
      }),
    );
  };

  const handleDockPointerDown = (event: any) => {
    if (isMobile || dockLayout.collapsed) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button,input,textarea,a,[role='tab'],[data-no-drag='true']")) return;
    dockDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: dockLayout.x,
      originY: dockLayout.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDockPointerMove = (event: any) => {
    const drag = dockDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setDockLayout((current) =>
      clampDockLayout({
        ...current,
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      }),
    );
  };

  const handleDockPointerUp = (event: any) => {
    const drag = dockDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dockDragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore stale capture
    }
  };

  const handleDockResize = (event: any) => {
    if (isMobile || dockLayout.collapsed) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startLayout = dockLayout;
    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(pointerId);

    const handleMove = (moveEvent: PointerEvent) => {
      setDockLayout((current) =>
        clampDockLayout({
          ...current,
          width: startLayout.width + moveEvent.clientX - startX,
          height: startLayout.height + moveEvent.clientY - startY,
        }),
      );
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  const desktopDockStyle = isMobile
    ? undefined
    : dockLayout.collapsed
      ? {
          left: dockLayout.x,
          top: dockLayout.y,
          width: 260,
        }
      : {
          left: dockLayout.x,
          top: dockLayout.y,
          width: dockLayout.width,
          height: dockLayout.height,
        };
  const assistantScopeLabel =
    tenant?.key === "exportunity"
      ? "Exportunity operations"
      : isTassiAssistant(assistantName)
        ? "Tassi (Global)"
        : "Tenant-scoped";

  return (
    <>
      <button
        type="button"
        className="fixed bottom-5 right-5 z-40 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg hover:bg-slate-50"
        title={`Open ${assistantName}. You can drag, resize, snap, minimize, or close the assistant.`}
        aria-label={`Open ${assistantName} assistant`}
        onClick={openDock}
      >
        {assistantName} assistant
      </button>

      {isOpen && (
        <div
          className={`fixed z-50 ${
            isMobile
              ? "inset-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
              : dockLayout.collapsed
                ? "rounded-full border border-slate-200"
                : "rounded-2xl border border-slate-200"
          } bg-white text-slate-950 shadow-2xl flex flex-col`}
          style={desktopDockStyle}
        >
          <div
            className={`flex items-center justify-between gap-3 px-4 py-3 ${
              dockLayout.collapsed && !isMobile ? "" : "border-b border-slate-200"
            } ${isMobile ? "" : "cursor-move select-none"}`}
            onPointerDown={handleDockPointerDown}
            onPointerMove={handleDockPointerMove}
            onPointerUp={handleDockPointerUp}
            onPointerCancel={handleDockPointerUp}
            title={isMobile ? undefined : "Drag to move assistant"}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden">
                {agent?.avatarUrl ? (
                  <img
                    src={agent.avatarUrl}
                    alt={agent.displayName || "Assistant"}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <Sparkles className="h-5 w-5 text-[#F5A623]" />
                )}
              </div>
              <div>
                <div className="text-sm font-semibold flex items-center gap-2">
                  <span>{assistantName}</span>
                  {!dockLayout.collapsed || isMobile ? (
                  <Badge variant="outline" className="border-slate-200 text-[10px] text-slate-600">
                    {assistantScopeLabel}
                  </Badge>
                  ) : null}
                </div>
                {!dockLayout.collapsed || isMobile ? (
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  <span>Workspace assistant</span>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      threadQuery.isError ? "bg-rose-400" : isThreadReady ? "bg-emerald-400" : "bg-amber-300"
                    }`}
                  />
                  <span>{threadStatusText}</span>
                  {agent?.status ? (
                    <Badge variant="outline" className="border-slate-200 text-slate-500 text-[10px]">
                      {agent.status}
                    </Badge>
                  ) : null}
                </div>
                ) : (
                  <div className="text-xs text-slate-500">Collapsed</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1" data-no-drag="true">
              {!isMobile ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    onClick={resetDockLayout}
                    title="Reset position"
                  >
                    <Move className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    onClick={toggleDockCollapsed}
                    title={dockLayout.collapsed ? "Expand assistant" : "Collapse assistant"}
                  >
                    {dockLayout.collapsed ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                  </Button>
                  {!dockLayout.collapsed ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        onClick={snapDockToSide}
                        title="Snap assistant to the right side"
                      >
                        Side
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        onClick={snapDockToBottom}
                        title="Snap assistant to the bottom"
                      >
                        Bottom
                      </Button>
                    </>
                  ) : null}
                </>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {dockLayout.collapsed && !isMobile ? null : (
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as "chat" | "history" | "actions")}
            className="flex-1 flex flex-col min-h-0"
          >
            <TabsList className="grid grid-cols-3 bg-slate-100 text-xs rounded-none shrink-0">
              <TabsTrigger value="chat" className="gap-1">
                <MessageSquare className="h-4 w-4" />
                Chat
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1">
                <History className="h-4 w-4" />
                History
              </TabsTrigger>
              <TabsTrigger value="actions" className="gap-1">
                <Activity className="h-4 w-4" />
                Actions
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="mt-0 flex-1 min-h-0 flex flex-col p-4 gap-3 overflow-hidden">
              <div className={`shrink-0 flex gap-2 ${isMobile ? "overflow-x-auto pb-1" : "flex-wrap"}`}>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shrink-0"
                  onClick={handleStartLiveCall}
                  disabled={liveCallMutation.isPending}
                >
                  {liveCallMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <PhoneCall className="h-3.5 w-3.5 mr-1" />
                  )}
                  Start live call
                </Button>
                {quickActions.map((action) => (
                  <Button
                    key={action.path}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shrink-0"
                    onClick={() => navigateMutation.mutate({ path: action.path, label: action.label })}
                    disabled={navigateMutation.isPending}
                  >
                    <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
                    {action.label}
                  </Button>
                ))}
              </div>

              <div ref={messagesScrollRef} className="min-h-0 flex-1 overflow-y-auto space-y-3 pr-1">
                {orderedMessages.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Start a conversation with {assistantName}. Upload files, ask for decisions, or create tasks from the current page.</div>
                ) : (
                  orderedMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.senderType === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                          msg.senderType === "user"
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-900"
                        }`}
                      >
                        <div className={`text-[11px] mb-1 ${msg.senderType === "user" ? "text-white/70" : "text-slate-500"}`}>
                          {msg.senderName || (msg.senderType === "user" ? "You" : agent?.displayName || "Assistant")} |{" "}
                          {formatTimestamp(msg.createdAt)}
                        </div>
                        <div className="whitespace-pre-wrap break-words">{renderMessageContent(msg.content, openInternalRoute)}</div>
                        {extractMessageAttachments(msg).length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {extractMessageAttachments(msg).map((attachment) => (
                              attachment.url ? (
                                <a
                                  key={`${msg.id}-${attachment.id}-${attachment.name}`}
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-blue-700 hover:text-blue-900"
                                >
                                  <div className="flex items-center gap-1">
                                    <Paperclip className="h-3 w-3" />
                                    <span className="truncate">{attachment.name}</span>
                                    {typeof attachment.size === "number" ? (
                                      <span className="text-slate-500">({Math.max(0, Math.round(attachment.size / 1024))} KB)</span>
                                    ) : null}
                                  </div>
                                </a>
                              ) : (
                                <div
                                  key={`${msg.id}-${attachment.id}-${attachment.name}`}
                                  className="block rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600"
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
                    <div className="max-w-[80%] rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-900">
                      <div className="text-[11px] text-slate-500 mb-1">{assistantName}</div>
                      <div className="inline-flex items-center gap-2 text-slate-700">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Thinking...</span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {pendingAttachments.length > 0 ? (
                <div className={`shrink-0 flex gap-2 ${isMobile ? "overflow-x-auto pb-1" : "flex-wrap"}`}>
                  {pendingAttachments.map((attachment) => (
                    <div
                      key={`${attachment.id}-${attachment.name}`}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 shrink-0"
                    >
                      <Paperclip className="h-3 w-3" />
                      <span className="max-w-[170px] truncate">{attachment.name}</span>
                      <button
                        type="button"
                        className="text-slate-500 hover:text-slate-900"
                        onClick={() =>
                          setPendingAttachments((prev) =>
                            prev.filter((item) => !(item.id === attachment.id && item.name === attachment.name)),
                          )
                        }
                        aria-label={`Remove ${attachment.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSend();
                }}
                className={`shrink-0 flex items-center gap-2 border-t border-slate-200 bg-white/95 pt-2 ${
                  isMobile ? "pb-[env(safe-area-inset-bottom)]" : ""
                }`}
              >
                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept="image/*,audio/*,video/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                  onChange={handleAttachmentChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shrink-0"
                  onClick={handleAttachmentPick}
                  disabled={uploadAttachmentMutation.isPending}
                  aria-label="Attach file"
                >
                  {uploadAttachmentMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileUp className="h-4 w-4" />
                  )}
                </Button>
                <VoiceToTextButton
                  disabled={uploadAttachmentMutation.isPending}
                  draftText={message}
                  setDraftText={setMessage}
                  appendDraftText={(text) =>
                    setMessage((prev) => `${prev}${prev.trim().length ? " " : ""}${text}`.trimStart())
                  }
                  conversationId={stableActiveThreadId ? `assistant-thread:${stableActiveThreadId}` : null}
                  tenantId={tenantId > 0 ? tenantId : null}
                />
                <Input
                  value={message}
                  onChange={(event) => {
                    setMessage(event.target.value);
                    if (composerError) setComposerError(null);
                  }}
                  placeholder={isThreadReady ? `Message ${assistantName}...` : `Message ${assistantName}... (thread auto-creates)`}
                  disabled={uploadAttachmentMutation.isPending}
                  className="h-11 border-slate-300 bg-white text-slate-950 placeholder:text-slate-400"
                />
                <Button
                  type="submit"
                  className="h-11 w-11 p-0 shrink-0"
                  disabled={
                    sendMutation.isPending ||
                    uploadAttachmentMutation.isPending ||
                    (!message.trim() && pendingAttachments.length === 0) ||
                    !readyForSend
                  }
                >
                  {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
              {composerError ? (
                <div className="shrink-0 text-xs text-rose-600 flex items-center justify-between gap-2">
                  <span className="truncate">{composerError}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-slate-700 hover:text-slate-950"
                    onClick={handleRetryConnection}
                  >
                    Retry
                  </Button>
                </div>
              ) : null}
              {threadQuery.isError ? (
                <div className="shrink-0 text-xs text-rose-600">Unable to load chat thread. Refresh or reopen the dock.</div>
              ) : null}
              {!threadQuery.isError && !isThreadReady ? (
                <div className="shrink-0 text-xs text-slate-500">
                  {isEnsuringThread ? "Preparing secure thread..." : "Thread will auto-create on your first message."}
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="history" className="mt-0 flex-1 p-4 overflow-y-auto min-h-0">
              <div className="space-y-2">
                {threads.length === 0 ? (
                  <div className="text-sm text-slate-500">No threads yet.</div>
                ) : (
                  threads.map((thread) => (
                    <button
                      key={thread.id}
                      type="button"
                      className={`w-full rounded-xl border px-3 py-2 text-left ${
                        Number(thread.id) === stableActiveThreadId
                          ? "border-blue-500/60 bg-blue-500/10"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                      onClick={() => {
                        setActiveThreadId(Number(thread.id));
                        setActiveTab("chat");
                      }}
                    >
                      <div className="text-sm font-semibold">
                        {thread.assistantDisplayName || agent?.displayName || "Workspace assistant"}
                      </div>
                      <div className="text-xs text-slate-500 line-clamp-2">
                        {thread.lastMessage?.content || "No messages yet"}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="actions" className="mt-0 flex-1 p-4 overflow-y-auto min-h-0">
              <div className="space-y-3">
                {runs.length === 0 ? (
                  <div className="text-sm text-slate-500">No action runs yet.</div>
                ) : (
                  runs.map((run) => (
                    <div key={`${run.source || "chairman"}-${run.id}`} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">{run.actionKey}</div>
                        <Badge variant="outline" className={statusTone(run.status)}>
                          {run.status}
                        </Badge>
                      </div>
                      {run.createdAt ? (
                        <div className="text-xs text-slate-500 mt-1">{formatTimestamp(run.createdAt)}</div>
                      ) : null}
                      {run.evidence && run.evidence.length > 0 ? (
                        <div className="mt-2 space-y-2">
                          {run.evidence.map((evidence) => (
                            <div
                              key={evidence.id}
                              className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-700"
                            >
                              <div className="text-slate-500 mb-1">{evidence.evidenceType || "Evidence"}</div>
                              <pre className="whitespace-pre-wrap break-words">
                                {JSON.stringify(evidence.payload ?? {}, null, 2)}
                              </pre>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
          )}
          {!isMobile && !dockLayout.collapsed ? (
            <div
              className="absolute bottom-1 right-1 h-5 w-5 cursor-nwse-resize rounded-br-2xl text-slate-400"
              onPointerDown={handleDockResize}
              title="Resize assistant"
              data-no-drag="true"
            >
              <div className="absolute bottom-1 right-1 h-3 w-3 border-b-2 border-r-2 border-slate-300" />
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}



