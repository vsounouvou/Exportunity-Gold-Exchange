import { useEffect, useMemo, useState } from "react";
import { Link, Redirect, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent } from "@db/schema";

import { apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AgentProfileDialog } from "@/components/AgentProfileDialog";

import { Activity, ArrowLeft, ListChecks, Loader2, Mail, MessageSquare, RefreshCw, Settings } from "lucide-react";

type AgentMailbox = {
  id: number;
  tenantId: number;
  agentKey: string;
  email: string;
  isEnabled: boolean;
  quotaMb: number;
  dailyOutboundLimit: number;
};

type MailboxResponse = { ok: boolean; mailbox: AgentMailbox | null };

type EmailThread = {
  id: number;
  mailboxId: number;
  subjectNorm: string;
  subject: string | null;
  lastMessageAt: string;
  createdAt: string;
};

type ThreadsResponse = { ok: boolean; items: EmailThread[] };

type EmailMessage = {
  id: number;
  threadId: number | null;
  direction: "inbound" | "outbound";
  status: string;
  fromEmail: string;
  toJson: string[];
  ccJson: string[];
  subject: string | null;
  textBody: string | null;
  htmlBody: string | null;
  messageId: string | null;
  createdAt: string;
};

type MessagesResponse = { ok: boolean; items: EmailMessage[] };

type CommsThread = {
  id: number;
  tenantId: number;
  agentKey: string;
  channel: "sms" | "whatsapp" | "voice";
  peerAddress: string;
  lastMessageAt: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type CommsWorkOrder = {
  id: number;
  tenantId: number;
  agentKey: string;
  channel: "sms" | "whatsapp" | "voice";
  threadId: number;
  status: string;
  peerAddress: string;
  lastInboundMessageId: number | null;
  lastInboundAt: string | null;
  ackSentAt: string | null;
  repliedAt: string | null;
  dueAt: string | null;
  lastEscalatedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type CommsWorkOrdersResponse = {
  ok: boolean;
  items: Array<{
    workOrder: CommsWorkOrder;
    thread: Pick<CommsThread, "id" | "agentKey" | "channel" | "peerAddress" | "lastMessageAt" | "metadata"> | null;
  }>;
};

type CommsMessage = {
  id: number;
  tenantId: number;
  agentKey: string;
  threadId: number;
  direction: "inbound" | "outbound";
  status: string;
  provider: string;
  channel: "sms" | "whatsapp" | "voice";
  fromAddress: string;
  toAddress: string;
  body: string | null;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type CommsMessagesResponse = { ok: boolean; items: CommsMessage[] };

type EmailWorkOrder = {
  id: number;
  tenantId: number;
  agentKey: string;
  mailboxId: number;
  threadId: number;
  status: string;
  senderEmail: string;
  lastInboundMessageId: number | null;
  lastInboundAt: string | null;
  dueAt: string | null;
};

type WorkOrdersResponse = {
  ok: boolean;
  items: Array<{
    workOrder: EmailWorkOrder;
    thread: { id: number; subject: string | null; lastMessageAt: string | null } | null;
  }>;
};

type TasksResponse = {
  tasks: Array<{
    id: number;
    title: string;
    description: string;
    status: string;
    priority: string;
    dueDate: string | null;
    createdAt: string;
  }>;
};

type ChatRoom = {
  id: string | number;
  name: string;
  type: string;
  status?: string;
  createdAt: string;
  conversationId: string;
  agents: Array<{ id: number; name: string; role: string }>;
};

type AgentAnalyticsResponse = {
  agent: Agent;
  analytics: {
    recentTasks: Array<{ id: number; title?: string | null; status?: string | null; createdAt?: string | null }>;
    recentMessages: Array<{ id: number; content?: string | null; createdAt?: string | null }>;
    transactions: Array<{ id: number; type?: string | null; amount?: string | number | null; createdAt?: string | null }>;
    period?: { start?: string; end?: string };
  };
};

type AgentVersionRow = {
  id: number;
  version: number;
  change_note: string | null;
  created_at: string;
};

type AgentVersionsResponse = {
  ok: boolean;
  versions: AgentVersionRow[];
};

type ActionQueueItem = {
  id: number;
  actionType?: string;
  action_type?: string;
  requestedByAgentKey?: string | null;
  requested_by_agent_key?: string | null;
  payload?: Record<string, unknown> | null;
  status?: string;
  createdAt?: string;
  created_at?: string;
};

type ActionQueueResponse = {
  ok: boolean;
  items: ActionQueueItem[];
};

function normalizeAgentKey(input: string) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeCsv(value: string) {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function ensureReplySubject(subject: string | null | undefined) {
  const value = String(subject || "").trim();
  if (!value) return "Re: (no subject)";
  if (/^\s*re\s*:/i.test(value)) return value;
  return `Re: ${value}`;
}

function formatDueLabel(dueAtIso: string | null | undefined) {
  if (!dueAtIso) return null;
  const dueAt = new Date(dueAtIso);
  const deltaMs = dueAt.getTime() - Date.now();
  if (!Number.isFinite(deltaMs)) return null;

  const absMinutes = Math.max(0, Math.round(Math.abs(deltaMs) / 60_000));
  const absHours = Math.floor(absMinutes / 60);
  const absDays = Math.floor(absHours / 24);

  const fmt = () => {
    if (absDays > 0) return `${absDays}d`;
    if (absHours > 0) return `${absHours}h`;
    return `${absMinutes}m`;
  };

  return deltaMs < 0 ? `overdue ${fmt()}` : `due in ${fmt()}`;
}

function statusBadge(status: string | null | undefined) {
  const v = String(status || "").toLowerCase();
  if (v === "active") return <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">active</Badge>;
  if (v === "paused") return <Badge className="bg-amber-500/15 text-amber-200 border border-amber-500/30">paused</Badge>;
  if (v === "archived") return <Badge className="bg-slate-500/15 text-slate-300 border border-slate-500/30">archived</Badge>;
  if (v === "inactive") return <Badge className="bg-slate-500/15 text-slate-300 border border-slate-500/30">inactive</Badge>;
  return <Badge className="bg-slate-500/15 text-slate-300 border border-slate-500/30">{v || "unknown"}</Badge>;
}

export function AgentDetailPage() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [, legacyParams] = useRoute("/agents/:agentId");
  const [, adminParams] = useRoute("/admin/agents-os/agents/:id");
  const [, canonicalParams] = useRoute("/agents-os/agents/:id");
  const adminPath = Boolean((adminParams as any)?.id || (canonicalParams as any)?.id);
  const agentId = Number((adminParams as any)?.id || (canonicalParams as any)?.id || (legacyParams as any)?.agentId || 0);
  const backHref = adminPath ? "/agents-os?tab=registry" : "/agents";
  const tenantId = tenant.id ?? null;

  const [activeTab, setActiveTab] = useState<"overview" | "inbox" | "comms" | "chats" | "tasks" | "logs" | "settings">(
    "overview",
  );
  const [editOpen, setEditOpen] = useState(false);

  const normalizeAgentRecord = (record: any): Agent | null => {
    if (!record || typeof record !== "object") return null;
    const explicitRuntimeAgentId =
      Number(record.runtimeAgentId || record.runtime_agent_id || record.approval_policy?.runtimeAgentId || record.approval_policy?.runtime_agent_id || 0) ||
      Number(record.approvalPolicy?.runtimeAgentId || record.approvalPolicy?.runtime_agent_id || 0);
    const runtimeAgentId = explicitRuntimeAgentId || (record.name || record.role ? Number(record.id || 0) : 0);
    if (record.name || record.role) return { ...(record as any), runtimeAgentId } as Agent;
    return {
      ...(record as any),
      id: Number(record.id || 0),
      runtimeAgentId,
      name: String(record.title || record.display_name || record.name || ""),
      role: String(record.role_title || record.role || ""),
      status: String(record.status || "draft"),
      metadata:
        record.metadata && typeof record.metadata === "object"
          ? record.metadata
          : {
              category: record.category || null,
              baseModel: record.base_model || null,
              autonomyLevel: record.autonomy_level ?? null,
              visibility: record.visibility || null,
              salaryMonthly: record.base_salary_monthly ?? null,
            },
    } as Agent;
  };

  const agentQuery = useQuery<Agent>({
    queryKey: agentId ? [adminPath ? `/api/admin/agents/${agentId}` : `/api/agents/${agentId}`] : ["__no_agent__"],
    enabled: Number.isFinite(agentId) && agentId > 0,
    staleTime: 0,
    queryFn: async () => {
      if (!agentId) throw new Error("Agent not found");
      if (adminPath) {
        const payload: any = await apiRequest(`/api/admin/agents/${agentId}`, "GET");
        const normalized = normalizeAgentRecord(payload?.agent);
        if (!normalized) throw new Error("Agent not found");
        return normalized;
      }
      const payload: any = await apiRequest(`/api/agents/${agentId}`, "GET");
      const normalized = normalizeAgentRecord(payload);
      if (!normalized) throw new Error("Agent not found");
      return normalized;
    },
  });

  const agent = agentQuery.data ?? null;
  const adminAgent = adminPath ? ((agent as any) ?? null) : null;
  const runtimeAgentId = useMemo(() => {
    const candidates = [
      Number((adminAgent as any)?.runtimeAgentId || 0),
      Number((adminAgent as any)?.runtime_agent_id || 0),
      Number((adminAgent as any)?.approval_policy?.runtimeAgentId || 0),
      Number((adminAgent as any)?.approval_policy?.runtime_agent_id || 0),
      Number((agent as any)?.runtimeAgentId || 0),
      Number((agent as any)?.runtime_agent_id || 0),
      adminPath ? 0 : Number(agent?.id || 0),
    ];
    return candidates.find((value) => Number.isInteger(value) && value > 0) || 0;
  }, [adminAgent, adminPath, agent]);

  const versionsQuery = useQuery<AgentVersionsResponse>({
    queryKey: adminPath && agentId ? [`/api/admin/agents/${agentId}/versions`] : ["__no_agent_versions__"],
    enabled: adminPath && Number.isFinite(agentId) && agentId > 0,
    staleTime: 0,
  });

  const actionQueueQuery = useQuery<ActionQueueResponse>({
    queryKey: adminPath ? ["/api/actions/queue?limit=250"] : ["__no_agent_actions__"],
    enabled: adminPath,
    staleTime: 10_000,
  });

  const actionSignals = useMemo(() => {
    const items = Array.isArray(actionQueueQuery.data?.items) ? actionQueueQuery.data.items : [];
    if (!items.length || !agent) return { total: 0, recent: [] as ActionQueueItem[] };
    const possibleKeys = new Set(
      [
        normalizeAgentKey(String(agent.name || "")),
        String((adminAgent as any)?.agent_key || ""),
        String((adminAgent as any)?.slug || ""),
      ]
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    );
    if (!possibleKeys.size) return { total: 0, recent: [] as ActionQueueItem[] };

    const matches = items.filter((item) => {
      const direct = String(item.requestedByAgentKey || item.requested_by_agent_key || "").trim().toLowerCase();
      if (direct && possibleKeys.has(normalizeAgentKey(direct))) return true;
      const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
      const payloadAgentKey = String((payload as any).agentKey || (payload as any).requestedByAgentKey || "").trim().toLowerCase();
      if (payloadAgentKey && possibleKeys.has(normalizeAgentKey(payloadAgentKey))) return true;
      return false;
    });
    return {
      total: matches.length,
      recent: matches.slice(0, 8),
    };
  }, [actionQueueQuery.data?.items, adminAgent, agent]);

  const mailboxAgentKey = useMemo(() => {
    if (!agent || !runtimeAgentId) return "";
    const meta = (agent as any)?.metadata && typeof (agent as any).metadata === "object" ? (agent as any).metadata : {};
    const explicit = typeof meta?.mailAgentKey === "string" ? meta.mailAgentKey : null;
    return normalizeAgentKey(explicit || agent.name || "");
  }, [agent, runtimeAgentId]);

  const mailboxQuery = useQuery<MailboxResponse>({
    queryKey:
      tenantId && mailboxAgentKey
        ? [`/api/admin/tenants/${tenantId}/agents/${mailboxAgentKey}/mailbox`]
        : ["__no_agent_mailbox__"],
    enabled: !!tenantId && !!mailboxAgentKey,
    staleTime: 0,
  });

  const mailbox = mailboxQuery.data?.mailbox ?? null;
  const mailboxId = mailbox?.id ?? null;

  const workOrdersQuery = useQuery<WorkOrdersResponse>({
    queryKey: mailboxId ? [`/api/admin/mailboxes/${mailboxId}/work-orders?limit=200`] : ["__no_work_orders__"],
    enabled: activeTab === "inbox" && !!mailboxId,
    staleTime: 0,
  });

  const threadsQuery = useQuery<ThreadsResponse>({
    queryKey: mailboxId ? [`/api/admin/mailboxes/${mailboxId}/threads?limit=100`] : ["__no_threads__"],
    enabled: activeTab === "inbox" && !!mailboxId,
    staleTime: 0,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("tenant required");
      if (!mailboxAgentKey) throw new Error("agent mailbox required");
      return apiRequest("/api/admin/email/index", {
        method: "POST",
        body: JSON.stringify({ agentKey: mailboxAgentKey, limitPerMailbox: 500 }),
      });
    },
    onSuccess: async (data: any) => {
      const indexed = typeof data?.indexed === "number" ? data.indexed : null;
      const failures = Array.isArray(data?.mailboxes)
        ? data.mailboxes.filter((m: any) => Array.isArray(m?.errors) && m.errors.length > 0)
        : [];
      const firstFailure = failures[0] ?? null;
      const hasMaildirIssue = failures.some((m: any) =>
        (m?.errors || []).some((e: any) => typeof e === "string" && e.startsWith("maildir_")),
      );

      toast({
        title: "Inbox synced",
        description: indexed != null ? `${indexed} new messages indexed.` : "New mail indexed.",
      });

      if (failures.length) {
        toast({
          title: "Mail sync warnings",
          description: firstFailure
            ? `${failures.length} mailbox(es) could not be read. First: ${String(firstFailure.agentKey || "unknown")}: ${String(
                firstFailure.errors?.[0] || "error",
              )}${hasMaildirIssue ? " • Tip: run mail indexing on the mail server (Maildir) if this host can’t access mail storage." : ""}`
            : `${failures.length} mailbox(es) could not be read.`,
          variant: "destructive",
        });
      }

      await Promise.all([
        mailboxId ? queryClient.invalidateQueries({ queryKey: [`/api/admin/mailboxes/${mailboxId}/threads?limit=100`] }) : Promise.resolve(),
        mailboxId ? queryClient.invalidateQueries({ queryKey: [`/api/admin/mailboxes/${mailboxId}/work-orders?limit=200`] }) : Promise.resolve(),
        selectedThreadId
          ? queryClient.invalidateQueries({ queryKey: [`/api/admin/threads/${selectedThreadId}/messages?limit=200`] })
          : Promise.resolve(),
      ]);
    },
    onError: (err: any) => {
      toast({
        title: "Sync failed",
        description: err?.message || "Could not index inbound mail on the server.",
        variant: "destructive",
      });
    },
  });

  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");

  useEffect(() => {
    if (activeTab !== "inbox") return;
    if (selectedThreadId) return;
    const urgent = workOrdersQuery.data?.items?.[0]?.thread?.id ?? null;
    const first = threadsQuery.data?.items?.[0]?.id ?? null;
    const next = urgent ?? first;
    if (next) setSelectedThreadId(next);
  }, [activeTab, selectedThreadId, workOrdersQuery.data, threadsQuery.data]);

  const messagesQuery = useQuery<MessagesResponse>({
    queryKey: selectedThreadId ? [`/api/admin/threads/${selectedThreadId}/messages?limit=200`] : ["__no_messages__"],
    enabled: activeTab === "inbox" && !!selectedThreadId,
    staleTime: 0,
  });

  const activeThread = useMemo(() => {
    if (!selectedThreadId) return null;
    return (threadsQuery.data?.items ?? []).find((t) => t.id === selectedThreadId) ?? null;
  }, [selectedThreadId, threadsQuery.data]);

  const activeWorkOrder = useMemo(() => {
    if (!selectedThreadId) return null;
    const items = workOrdersQuery.data?.items ?? [];
    return items.find((x) => x.workOrder.threadId === selectedThreadId)?.workOrder ?? null;
  }, [selectedThreadId, workOrdersQuery.data]);

  const lastInboundFrom = useMemo(() => {
    const items = messagesQuery.data?.items ?? [];
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i]?.direction === "inbound") return items[i]?.fromEmail;
    }
    return null as string | null;
  }, [messagesQuery.data]);

  const clearCompose = () => {
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!mailbox) throw new Error("Mailbox not provisioned");
      const to = normalizeCsv(composeTo);
      if (!to.length) throw new Error("Recipient required");
      if (!composeSubject.trim()) throw new Error("Subject required");
      if (!composeBody.trim()) throw new Error("Message required");

      return apiRequest("/api/email/send", {
        method: "POST",
        body: JSON.stringify({
          tenant_id: tenantId,
          agent_id: mailbox.agentKey,
          to,
          subject: composeSubject.trim(),
          body: { text: composeBody.trim() },
        }),
      });
    },
    onSuccess: async (payload: any) => {
      const requiresApproval = payload?.requiresApproval === true;
      clearCompose();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: mailboxId ? [`/api/admin/mailboxes/${mailboxId}/threads?limit=100`] : [] }),
        queryClient.invalidateQueries({
          queryKey: selectedThreadId ? [`/api/admin/threads/${selectedThreadId}/messages?limit=200`] : [],
        }),
        queryClient.invalidateQueries({
          queryKey: mailboxId ? [`/api/admin/mailboxes/${mailboxId}/work-orders?limit=200`] : [],
        }),
      ]);
      toast({
        title: requiresApproval ? "Email queued (approval required)" : "Email queued",
        description: requiresApproval
          ? "An admin must approve this send in Actions → Decisions."
          : "This will be sent by the background Actions worker.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Send failed",
        description: err?.message || "Could not send email",
        variant: "destructive",
      });
    },
  });

  const commsAgentKey = mailboxAgentKey;
  const commsWorkOrdersQuery = useQuery<CommsWorkOrdersResponse>({
    queryKey:
      tenantId && commsAgentKey
        ? [`/api/communications/work-orders?limit=200&agentKey=${encodeURIComponent(commsAgentKey)}`]
        : ["__no_comms_work_orders__"],
    enabled: activeTab === "comms" && !!tenantId && !!commsAgentKey,
    staleTime: 0,
  });

  const [commsSelectedThreadId, setCommsSelectedThreadId] = useState<number | null>(null);
  const [commsComposeBody, setCommsComposeBody] = useState("");

  useEffect(() => {
    if (activeTab !== "comms") return;
    if (commsSelectedThreadId) return;
    const firstRow = commsWorkOrdersQuery.data?.items?.[0] ?? null;
    const firstThreadId = firstRow?.thread?.id ?? firstRow?.workOrder?.threadId ?? null;
    if (firstThreadId) setCommsSelectedThreadId(firstThreadId);
  }, [activeTab, commsSelectedThreadId, commsWorkOrdersQuery.data]);

  const commsActiveRow = useMemo(() => {
    if (!commsSelectedThreadId) return null;
    const items = commsWorkOrdersQuery.data?.items ?? [];
    return (
      items.find((x) => (x.thread?.id ?? x.workOrder.threadId) === commsSelectedThreadId) ?? null
    );
  }, [commsSelectedThreadId, commsWorkOrdersQuery.data]);

  const commsActiveThread = useMemo(() => {
    if (!commsActiveRow) return null;
    const t = commsActiveRow.thread;
    if (t) return t;
    const wo = commsActiveRow.workOrder;
    return {
      id: wo.threadId,
      agentKey: wo.agentKey,
      channel: wo.channel,
      peerAddress: wo.peerAddress,
      lastMessageAt: wo.lastInboundAt || new Date().toISOString(),
      metadata: {},
    } as Pick<CommsThread, "id" | "agentKey" | "channel" | "peerAddress" | "lastMessageAt" | "metadata">;
  }, [commsActiveRow]);

  const commsMessagesQuery = useQuery<CommsMessagesResponse>({
    queryKey: commsSelectedThreadId ? [`/api/communications/threads/${commsSelectedThreadId}/messages?limit=500`] : ["__no_comms_messages__"],
    enabled: activeTab === "comms" && !!commsSelectedThreadId,
    staleTime: 0,
  });

  const commsSendMutation = useMutation({
    mutationFn: async () => {
      if (!commsActiveThread) throw new Error("Select a thread first");
      if (commsActiveThread.channel === "voice") throw new Error("Voice threads require a call back");
      const body = commsComposeBody.trim();
      if (!body) throw new Error("Message required");
      return await apiRequest("/api/comms/send", "POST", {
        agentKey: commsActiveThread.agentKey,
        channel: commsActiveThread.channel,
        toE164: commsActiveThread.peerAddress,
        body,
      });
    },
    onSuccess: async () => {
      setCommsComposeBody("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: commsAgentKey ? [`/api/communications/work-orders?limit=200&agentKey=${encodeURIComponent(commsAgentKey)}`] : [] }),
        commsSelectedThreadId
          ? queryClient.invalidateQueries({ queryKey: [`/api/communications/threads/${commsSelectedThreadId}/messages?limit=500`] })
          : Promise.resolve(),
      ]);
      toast({ title: "Sent", description: "Message queued." });
    },
    onError: (err: any) => toast({ title: "Send failed", description: err?.message || "Unable to send", variant: "destructive" }),
  });

  const commsCallMutation = useMutation({
    mutationFn: async () => {
      if (!commsActiveThread) throw new Error("Select a thread first");
      return await apiRequest("/api/voice/call", "POST", {
        agentKey: commsActiveThread.agentKey,
        toE164: commsActiveThread.peerAddress,
        record: false,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: commsAgentKey ? [`/api/communications/work-orders?limit=200&agentKey=${encodeURIComponent(commsAgentKey)}`] : [],
      });
      toast({ title: "Calling", description: "Voice call initiated." });
    },
    onError: (err: any) => toast({ title: "Call failed", description: err?.message || "Unable to call", variant: "destructive" }),
  });

  const tasksQuery = useQuery<TasksResponse>({
    queryKey: runtimeAgentId ? [`/api/tasks?agentId=${runtimeAgentId}`] : ["__no_tasks__"],
    enabled: activeTab === "tasks" && Number.isFinite(runtimeAgentId) && runtimeAgentId > 0,
    staleTime: 0,
  });

  const chatsQuery = useQuery<ChatRoom[]>({
    queryKey: ["/api/chatrooms"],
    enabled: activeTab === "chats",
    staleTime: 0,
  });

  const agentRooms = useMemo(() => {
    const rooms = chatsQuery.data ?? [];
    if (!runtimeAgentId) return [];
    return rooms.filter((r) => (r.agents || []).some((a) => a.id === runtimeAgentId));
  }, [chatsQuery.data, runtimeAgentId]);

  const analyticsQuery = useQuery<AgentAnalyticsResponse>({
    queryKey: runtimeAgentId ? [`/api/agents/${runtimeAgentId}/analytics?timeframe=30`] : ["__no_analytics__"],
    enabled: activeTab === "logs" && Number.isFinite(runtimeAgentId) && runtimeAgentId > 0,
    staleTime: 0,
  });

  const provisionMailboxMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("tenant required");
      if (!mailboxAgentKey) throw new Error("agent key required");
      return apiRequest(`/api/admin/tenants/${tenantId}/agents/${mailboxAgentKey}/mailbox`, { method: "POST" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [`/api/admin/tenants/${tenantId}/agents/${mailboxAgentKey}/mailbox`],
      });
      toast({ title: "Mailbox provisioned" });
      setActiveTab("inbox");
    },
    onError: (err: any) => {
      toast({
        title: "Mailbox provisioning failed",
        description: err?.message || "Could not provision mailbox",
        variant: "destructive",
      });
    },
  });

  const disableMailboxMutation = useMutation({
    mutationFn: async () => {
      if (!mailboxId) throw new Error("Mailbox not provisioned");
      return apiRequest(`/api/admin/mailboxes/${mailboxId}/disable`, { method: "POST" });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [`/api/admin/tenants/${tenantId}/agents/${mailboxAgentKey}/mailbox`],
        }),
        queryClient.invalidateQueries({
          queryKey: mailboxId ? [`/api/admin/mailboxes/${mailboxId}/threads?limit=100`] : [],
        }),
        queryClient.invalidateQueries({
          queryKey: mailboxId ? [`/api/admin/mailboxes/${mailboxId}/work-orders?limit=200`] : [],
        }),
      ]);
      toast({ title: "Mailbox disabled" });
    },
    onError: (err: any) => {
      toast({
        title: "Disable failed",
        description: err?.message || "Could not disable mailbox",
        variant: "destructive",
      });
    },
  });

  if (!Number.isFinite(agentId) || agentId <= 0) {
    return <Redirect to={backHref} />;
  }

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Link href={backHref}>
              <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Agents
              </Button>
            </Link>
            <div className="min-w-0">
              <div className="text-xl font-semibold text-white truncate">
                {agentQuery.isLoading ? "Loading…" : agent?.name || `Agent #${agentId}`}
              </div>
              <div className="text-sm text-gray-400 truncate">{agent?.role || ""}</div>
            </div>
            {agent ? statusBadge(agent.status) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {mailbox ? (
            <Badge
              className={
                mailbox.isEnabled
                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                  : "bg-red-500/15 text-red-300 border border-red-500/30"
              }
            >
              {mailbox.isEnabled ? "email: enabled" : "email: disabled"}
            </Badge>
          ) : (
            <Badge className="bg-amber-500/15 text-amber-200 border border-amber-500/30">email: missing</Badge>
          )}
          <Button variant="secondary" onClick={() => setEditOpen(true)} disabled={!agent}>
            <Settings className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-3">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="inbox" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Inbox
          </TabsTrigger>
          <TabsTrigger value="comms" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Comms
          </TabsTrigger>
          <TabsTrigger value="chats" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Chats
          </TabsTrigger>
          <TabsTrigger value="tasks" className="flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card className="bg-gray-950 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Summary</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-300 space-y-2">
              {agentQuery.isLoading ? (
                <div className="flex items-center gap-2 text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading agent…
                </div>
              ) : agent ? (
                <>
                  <div>
                    <span className="text-gray-400">Mailbox key:</span>{" "}
                    <span className="text-gray-100">{mailboxAgentKey || "—"}</span>
                  </div>
                  {mailbox ? (
                    <div>
                      <span className="text-gray-400">Email:</span> <span className="text-gray-100">{mailbox.email}</span>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="text-gray-400">Agent not found.</div>
              )}
            </CardContent>
          </Card>
          {agent ? (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              <Card className="bg-gray-950 border-gray-800 xl:col-span-4">
                <CardHeader>
                  <CardTitle className="text-white">Identity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <div className="h-14 w-14 rounded-lg border border-gray-800 bg-gray-900/60 overflow-hidden flex items-center justify-center text-[10px] text-gray-500">
                      {(adminAgent as any)?.avatar_url ? (
                        <img src={String((adminAgent as any).avatar_url)} alt={agent.name} className="h-full w-full object-cover" />
                      ) : (
                        "No photo"
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-white truncate">{agent.name}</div>
                      <div className="text-xs text-gray-400 truncate">{agent.role || "—"}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {statusBadge(agent.status)}
                        {(adminAgent as any)?.marketplace_visible ? (
                          <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">marketplace</Badge>
                        ) : (
                          <Badge className="bg-gray-500/15 text-gray-300 border border-gray-500/30">internal</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400">
                    ID: <span className="text-gray-100">{String((adminAgent as any)?.id ?? agent.id)}</span> • Slug:{" "}
                    <span className="text-gray-100">{String((adminAgent as any)?.slug || "—")}</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    Category:{" "}
                    <span className="text-gray-100">{String((adminAgent as any)?.category || (agent as any)?.metadata?.category || "—")}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-950 border-gray-800 xl:col-span-4">
                <CardHeader>
                  <CardTitle className="text-white">Model & Controls</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="text-gray-400">
                    LLM: <span className="text-gray-100">{String((adminAgent as any)?.base_model || "gpt-5")}</span>
                  </div>
                  <div className="text-gray-400">
                    Autonomy: <span className="text-gray-100">{String((adminAgent as any)?.autonomy_level ?? "2")}</span>
                  </div>
                  <div className="text-gray-400">
                    Approval policy:{" "}
                    <span className="text-gray-100">{(adminAgent as any)?.approval_policy ? "configured" : "default"}</span>
                  </div>
                  <div className="rounded border border-gray-800 bg-gray-900/30 p-2 text-[11px] text-gray-300 whitespace-pre-wrap break-words">
                    {JSON.stringify(
                      (adminAgent as any)?.default_tools ||
                        (adminAgent as any)?.approval_policy ||
                        (adminAgent as any)?.metadata?.tools ||
                        {},
                      null,
                      2,
                    ).slice(0, 420)}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-950 border-gray-800 xl:col-span-4">
                <CardHeader>
                  <CardTitle className="text-white">Salary & Marketplace</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="text-gray-400">
                    Base salary / month:{" "}
                    <span className="text-gray-100">
                      {String((adminAgent as any)?.base_salary_monthly ?? (agent as any)?.metadata?.salaryMonthly ?? 0)}
                    </span>
                  </div>
                  <div className="text-gray-400">
                    Marketplace price: <span className="text-gray-100">{String((adminAgent as any)?.price_monthly ?? 0)}</span>
                  </div>
                  <div className="text-gray-400">
                    Currency: <span className="text-gray-100">{String((adminAgent as any)?.currency || "USD")}</span>
                  </div>
                  <div className="text-gray-400">
                    Availability: <span className="text-gray-100">{String((adminAgent as any)?.availability || "hidden")}</span>
                  </div>
                  <div className="text-gray-400">
                    Email: <span className="text-gray-100">{mailbox?.email || "not provisioned"}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-950 border-gray-800 xl:col-span-6">
                <CardHeader>
                  <CardTitle className="text-white">Version snapshots</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {versionsQuery.isLoading ? (
                    <div className="text-gray-400">Loading versions…</div>
                  ) : (versionsQuery.data?.versions?.length ?? 0) === 0 ? (
                    <div className="text-gray-400">No snapshots yet.</div>
                  ) : (
                    (versionsQuery.data?.versions ?? []).slice(0, 6).map((row) => (
                      <div key={row.id} className="rounded border border-gray-800 bg-gray-900/30 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-gray-100">v{row.version}</span>
                          <span className="text-gray-500">{new Date(row.created_at).toLocaleString()}</span>
                        </div>
                        <div className="text-gray-400 mt-1">{row.change_note || "Snapshot saved"}</div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="bg-gray-950 border-gray-800 xl:col-span-6">
                <CardHeader>
                  <CardTitle className="text-white">Recent action usage</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="text-gray-400">
                    Linked actions found: <span className="text-gray-100">{actionSignals.total}</span>
                  </div>
                  {actionSignals.total === 0 ? (
                    <div className="text-gray-400">No recent actions matched this agent key.</div>
                  ) : (
                    actionSignals.recent.map((item) => (
                      <div key={item.id} className="rounded border border-gray-800 bg-gray-900/30 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-gray-100 truncate">{item.actionType || item.action_type || "UNKNOWN_ACTION"}</span>
                          <Badge className="bg-slate-500/15 text-slate-200 border border-slate-500/30">{item.status || "unknown"}</Badge>
                        </div>
                        <div className="text-gray-500 mt-1">
                          {new Date(item.createdAt || item.created_at || Date.now()).toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="inbox" className="space-y-4">
          {!mailbox ? (
            <Card className="bg-gray-950 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Email inbox</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-gray-400">
                  This agent has no mailbox yet. Provision one to enable inbound/outbound email.
                </div>
                <Button onClick={() => provisionMailboxMutation.mutate()} disabled={provisionMailboxMutation.isPending}>
                  {provisionMailboxMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Provisioning…
                    </>
                  ) : (
                    "Provision mailbox"
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <Card className="bg-gray-950 border-gray-800 lg:col-span-4">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-white text-base">Threads</CardTitle>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => syncMutation.mutate()}
                      disabled={syncMutation.isPending}
                      className="h-8"
                      title="Sync inbox"
                    >
                      <RefreshCw className={syncMutation.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                    </Button>
                  </div>
                  {mailbox?.email ? <div className="text-xs text-gray-400 truncate">{mailbox.email}</div> : null}
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[460px] pr-4">
                    <div className="space-y-2">
                      {(threadsQuery.data?.items ?? []).map((t) => {
                        const active = selectedThreadId === t.id;
                        const due = (workOrdersQuery.data?.items ?? []).find((x) => x.workOrder.threadId === t.id)?.workOrder
                          ?.dueAt;
                        return (
                          <button
                            key={t.id}
                            onClick={() => setSelectedThreadId(t.id)}
                            className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                              active
                                ? "border-amber-500/40 bg-amber-500/10"
                                : "border-gray-800 bg-gray-900/30 hover:bg-gray-900/50"
                            }`}
                          >
                            <div className="text-sm text-white truncate">{t.subject || "(no subject)"}</div>
                            <div className="text-xs text-gray-400 mt-1 flex items-center justify-between gap-2">
                              <span className="truncate">{new Date(t.lastMessageAt).toLocaleString()}</span>
                              {formatDueLabel(due) ? (
                                <Badge className="bg-amber-500/15 text-amber-200 border border-amber-500/30">
                                  {formatDueLabel(due)}
                                </Badge>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                      {threadsQuery.isLoading ? <div className="text-sm text-gray-400">Loading…</div> : null}
                      {!threadsQuery.isLoading && (threadsQuery.data?.items?.length ?? 0) === 0 ? (
                        <div className="text-sm text-gray-400">
                          No threads yet. Click sync to index inbound mail (Maildir) for this agent.
                        </div>
                      ) : null}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="bg-gray-950 border-gray-800 lg:col-span-8">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-base">Thread</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!selectedThreadId ? (
                    <div className="text-sm text-gray-400">Select a thread.</div>
                  ) : (
                    <>
                      {activeWorkOrder ? (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-amber-200">Reply required</div>
                              <div className="text-xs text-slate-200/70 mt-0.5 truncate">
                                From <span className="text-slate-100">{activeWorkOrder.senderEmail}</span>
                                {formatDueLabel(activeWorkOrder.dueAt) ? (
                                  <span> • {formatDueLabel(activeWorkOrder.dueAt)}</span>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Button
                                size="sm"
                                onClick={() => {
                                  if (lastInboundFrom) setComposeTo(lastInboundFrom);
                                  setComposeSubject(ensureReplySubject(activeThread?.subject));
                                }}
                              >
                                Reply
                              </Button>
                              <Button size="sm" variant="secondary" onClick={clearCompose}>
                                New
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <ScrollArea className="h-[260px] pr-4 rounded-lg border border-slate-800 bg-slate-950/30">
                        <div className="p-3 space-y-3">
                          {messagesQuery.isLoading ? (
                            <div className="text-sm text-slate-400">Loading…</div>
                          ) : (messagesQuery.data?.items?.length ?? 0) === 0 ? (
                            <div className="text-sm text-slate-400">No messages in this thread yet.</div>
                          ) : (
                            (messagesQuery.data?.items ?? []).map((m) => (
                              <div key={m.id} className="rounded-lg border border-slate-800 bg-slate-900/30 p-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-xs text-slate-400 truncate">
                                    {m.direction === "outbound" ? "To" : "From"}:{" "}
                                    <span className="text-slate-200">
                                      {m.direction === "outbound" ? (m.toJson || []).join(", ") : m.fromEmail}
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-500">{new Date(m.createdAt).toLocaleString()}</div>
                                </div>
                                {m.textBody ? (
                                  <div className="text-sm text-slate-100 mt-2 whitespace-pre-wrap">{m.textBody}</div>
                                ) : m.htmlBody ? (
                                  <div className="text-sm text-slate-100 mt-2">(HTML body indexed)</div>
                                ) : null}
                              </div>
                            ))
                          )}
                        </div>
                      </ScrollArea>

                      <Separator className="bg-gray-800" />

                      <div className="space-y-2">
                        <div className="text-sm font-semibold text-white">Compose</div>
                        <div className="space-y-2">
                          <Input
                            value={composeTo}
                            onChange={(e) => setComposeTo(e.target.value)}
                            placeholder="to@example.com, other@example.com"
                            className="bg-slate-950/40 border-slate-800 text-slate-100"
                          />
                          <Input
                            value={composeSubject}
                            onChange={(e) => setComposeSubject(e.target.value)}
                            placeholder="Subject"
                            className="bg-slate-950/40 border-slate-800 text-slate-100"
                          />
                          <Textarea
                            value={composeBody}
                            onChange={(e) => setComposeBody(e.target.value)}
                            placeholder="Message"
                            className="bg-slate-950/40 border-slate-800 text-slate-100 min-h-[120px]"
                          />
                          <div className="flex items-center gap-2">
                            <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
                              {sendMutation.isPending ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  Sending…
                                </>
                              ) : (
                                "Send"
                              )}
                            </Button>
                            <Button variant="secondary" onClick={clearCompose} disabled={sendMutation.isPending}>
                              Clear
                            </Button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="comms" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <Card className="bg-gray-950 border-gray-800 lg:col-span-4">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-white text-base">External inbox</CardTitle>
                  <Link href="/admin/communications/twilio">
                    <Button size="sm" variant="secondary" className="h-8">
                      Open global inbox
                    </Button>
                  </Link>
                </div>
                <div className="text-xs text-gray-400">SMS • WhatsApp • Voice</div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[460px] pr-4">
                  <div className="space-y-2">
                    {commsWorkOrdersQuery.isLoading ? (
                      <div className="text-sm text-gray-400">Loading…</div>
                    ) : (commsWorkOrdersQuery.data?.items?.length ?? 0) === 0 ? (
                      <div className="text-sm text-gray-400">No open work orders.</div>
                    ) : (
                      (commsWorkOrdersQuery.data?.items ?? []).map((row) => {
                        const tid = row.thread?.id ?? row.workOrder.threadId;
                        const active = commsSelectedThreadId === tid;
                        const peer = row.thread?.peerAddress ?? row.workOrder.peerAddress;
                        const due = row.workOrder.dueAt;
                        return (
                          <button
                            key={row.workOrder.id}
                            onClick={() => setCommsSelectedThreadId(tid)}
                            className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                              active
                                ? "border-emerald-500/40 bg-emerald-500/10"
                                : "border-gray-800 bg-gray-900/30 hover:bg-gray-900/50"
                            }`}
                            type="button"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-sm text-white truncate">{peer}</div>
                                <div className="text-xs text-gray-400 mt-1 truncate">{row.workOrder.channel.toUpperCase()}</div>
                              </div>
                              <div className="shrink-0 text-right">
                                <Badge className="bg-white/10 border-white/15 text-white/70 text-[10px]">
                                  {row.workOrder.channel.toUpperCase()}
                                </Badge>
                                {formatDueLabel(due) ? (
                                  <div className={`text-[10px] mt-1 ${String(formatDueLabel(due)).includes("overdue") ? "text-rose-300" : "text-white/50"}`}>
                                    {formatDueLabel(due)}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="bg-gray-950 border-gray-800 lg:col-span-8">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-base">Thread</CardTitle>
                <div className="text-xs text-gray-400 truncate">
                  {commsActiveThread ? `${commsActiveThread.channel.toUpperCase()} • ${commsActiveThread.peerAddress}` : "—"}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <ScrollArea className="h-[320px] pr-4 rounded-lg border border-gray-800 bg-gray-900/30">
                  <div className="p-3 space-y-2">
                    {commsMessagesQuery.isLoading ? (
                      <div className="text-sm text-gray-400">Loading…</div>
                    ) : (commsMessagesQuery.data?.items?.length ?? 0) === 0 ? (
                      <div className="text-sm text-gray-400">No messages yet.</div>
                    ) : (
                      (commsMessagesQuery.data?.items ?? []).map((m) => (
                        <div
                          key={m.id}
                          className={`max-w-[85%] rounded-xl border px-3 py-2 ${
                            m.direction === "outbound" ? "ml-auto bg-emerald-500/10 border-emerald-400/20" : "bg-white/5 border-white/10"
                          }`}
                        >
                          <div className="text-[11px] text-white/50 flex items-center justify-between gap-2">
                            <span>{m.direction.toUpperCase()}</span>
                            <span>{new Date(m.createdAt).toLocaleString()}</span>
                          </div>
                          <div className="text-sm text-white whitespace-pre-wrap mt-1">
                            {m.channel === "voice" ? `Call (${m.status || "unknown"})` : m.body || "—"}
                          </div>
                          {m.errorMessage ? <div className="text-[11px] text-rose-200 mt-1">{m.errorMessage}</div> : null}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>

                {commsActiveThread ? (
                  commsActiveThread.channel === "voice" ? (
                    <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm text-white font-semibold">Voice</div>
                          <div className="text-xs text-gray-400 mt-1">Call back to satisfy reply obligation.</div>
                        </div>
                        <Button onClick={() => commsCallMutation.mutate()} disabled={commsCallMutation.isPending}>
                          {commsCallMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              Calling…
                            </>
                          ) : (
                            "Call"
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3 space-y-3">
                      <div className="text-sm text-white font-semibold">Reply</div>
                      <Textarea
                        value={commsComposeBody}
                        onChange={(e) => setCommsComposeBody(e.target.value)}
                        placeholder="Write a reply…"
                        className="bg-gray-900 border-gray-800 text-white min-h-[120px]"
                      />
                      <div className="flex items-center gap-2">
                        <Button onClick={() => commsSendMutation.mutate()} disabled={commsSendMutation.isPending || !commsComposeBody.trim()}>
                          {commsSendMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              Sending…
                            </>
                          ) : (
                            "Send"
                          )}
                        </Button>
                        <Button variant="secondary" onClick={() => commsCallMutation.mutate()} disabled={commsCallMutation.isPending}>
                          {commsCallMutation.isPending ? "Calling…" : "Call"}
                        </Button>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="text-sm text-gray-400">Select a work order to view messages.</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="chats">
          <Card className="bg-gray-950 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Chats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {chatsQuery.isLoading ? (
                <div className="text-sm text-gray-400">Loading…</div>
              ) : agentRooms.length === 0 ? (
                <div className="text-sm text-gray-400">No meeting rooms found for this agent.</div>
              ) : (
                <div className="space-y-2">
                  {agentRooms.map((r) => (
                    <div key={String(r.id)} className="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
                      <div className="text-sm text-white font-semibold">{r.name}</div>
                      <div className="text-xs text-gray-400 mt-1">conversation: {r.conversationId}</div>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <Link href="/ai-team">
                  <Button variant="secondary" size="sm">
                    Open AI Team HQ
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks">
          <Card className="bg-gray-950 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              {tasksQuery.isLoading ? (
                <div className="text-sm text-gray-400">Loading…</div>
              ) : (tasksQuery.data?.tasks?.length ?? 0) === 0 ? (
                <div className="text-sm text-gray-400">No tasks assigned.</div>
              ) : (
                <div className="space-y-2">
                  {(tasksQuery.data?.tasks ?? []).map((t) => (
                    <div key={t.id} className="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm text-white font-semibold truncate">{t.title}</div>
                        <Badge className="bg-slate-500/15 text-slate-200 border border-slate-500/30">{t.status}</Badge>
                      </div>
                      <div className="text-xs text-gray-400 mt-1 line-clamp-2">{t.description}</div>
                      {t.dueDate ? (
                        <div className="text-xs text-gray-500 mt-2">Due: {new Date(t.dueDate).toLocaleDateString()}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card className="bg-gray-950 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Logs / History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {analyticsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </div>
              ) : analyticsQuery.data?.analytics ? (
                <>
                  {analyticsQuery.data?.analytics?.period?.start || analyticsQuery.data?.analytics?.period?.end ? (
                    <div className="text-xs text-gray-400">
                      Period:{" "}
                      <span className="text-gray-200">
                        {analyticsQuery.data?.analytics?.period?.start
                          ? new Date(analyticsQuery.data.analytics.period.start).toLocaleDateString()
                          : "—"}
                      </span>{" "}
                      →{" "}
                      <span className="text-gray-200">
                        {analyticsQuery.data?.analytics?.period?.end
                          ? new Date(analyticsQuery.data.analytics.period.end).toLocaleDateString()
                          : "—"}
                      </span>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
                      <div className="text-xs text-gray-400">Tasks</div>
                      <div className="text-2xl font-semibold text-white">
                        {analyticsQuery.data.analytics.recentTasks?.length ?? 0}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
                      <div className="text-xs text-gray-400">Messages</div>
                      <div className="text-2xl font-semibold text-white">
                        {analyticsQuery.data.analytics.recentMessages?.length ?? 0}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
                      <div className="text-xs text-gray-400">Transactions</div>
                      <div className="text-2xl font-semibold text-white">
                        {analyticsQuery.data.analytics.transactions?.length ?? 0}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
                      <div className="text-sm text-white font-semibold">Recent tasks</div>
                      <Separator className="my-2 bg-gray-800" />
                      <ScrollArea className="h-[200px] pr-3">
                        <div className="space-y-2">
                          {(analyticsQuery.data.analytics.recentTasks ?? []).slice(0, 20).map((t: any) => (
                            <div key={t.id} className="text-sm">
                              <div className="text-gray-100 truncate">{t.title || `Task #${t.id}`}</div>
                              <div className="text-xs text-gray-500 flex items-center justify-between gap-2">
                                <span className="truncate">{t.status || "unknown"}</span>
                                {t.createdAt ? <span>{new Date(t.createdAt).toLocaleString()}</span> : null}
                              </div>
                            </div>
                          ))}
                          {(analyticsQuery.data.analytics.recentTasks?.length ?? 0) === 0 ? (
                            <div className="text-sm text-gray-400">No tasks in this period.</div>
                          ) : null}
                        </div>
                      </ScrollArea>
                    </div>

                    <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
                      <div className="text-sm text-white font-semibold">Recent messages</div>
                      <Separator className="my-2 bg-gray-800" />
                      <ScrollArea className="h-[200px] pr-3">
                        <div className="space-y-2">
                          {(analyticsQuery.data.analytics.recentMessages ?? []).slice(0, 20).map((m: any) => (
                            <div key={m.id} className="text-sm">
                              <div className="text-gray-100 line-clamp-2">{m.content || `(message #${m.id})`}</div>
                              <div className="text-xs text-gray-500">
                                {m.createdAt ? new Date(m.createdAt).toLocaleString() : null}
                              </div>
                            </div>
                          ))}
                          {(analyticsQuery.data.analytics.recentMessages?.length ?? 0) === 0 ? (
                            <div className="text-sm text-gray-400">No messages in this period.</div>
                          ) : null}
                        </div>
                      </ScrollArea>
                    </div>

                    <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
                      <div className="text-sm text-white font-semibold">Recent transactions</div>
                      <Separator className="my-2 bg-gray-800" />
                      <ScrollArea className="h-[200px] pr-3">
                        <div className="space-y-2">
                          {(analyticsQuery.data.analytics.transactions ?? []).slice(0, 20).map((tr: any) => (
                            <div key={tr.id} className="text-sm">
                              <div className="text-gray-100 truncate">{tr.type || `Transaction #${tr.id}`}</div>
                              <div className="text-xs text-gray-500 flex items-center justify-between gap-2">
                                <span className="truncate">{tr.amount != null ? String(tr.amount) : "—"}</span>
                                {tr.createdAt ? <span>{new Date(tr.createdAt).toLocaleString()}</span> : null}
                              </div>
                            </div>
                          ))}
                          {(analyticsQuery.data.analytics.transactions?.length ?? 0) === 0 ? (
                            <div className="text-sm text-gray-400">No transactions in this period.</div>
                          ) : null}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-400">No activity data yet.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card className="bg-gray-950 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
                <div className="text-sm text-white font-semibold">Profile</div>
                <div className="text-sm text-gray-300 mt-2 space-y-1">
                  <div>
                    <span className="text-gray-400">Agent id:</span> <span className="text-gray-100">{agentId}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Status:</span> <span className="text-gray-100">{agent?.status || "—"}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Role:</span> <span className="text-gray-100">{agent?.role || "—"}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
                <div className="text-sm text-white font-semibold">Email mailbox</div>
                <div className="text-sm text-gray-300 mt-2 space-y-1">
                  <div>
                    <span className="text-gray-400">Mailbox key:</span>{" "}
                    <span className="text-gray-100">{mailboxAgentKey || "—"}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Email:</span> <span className="text-gray-100">{mailbox?.email || "—"}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">State:</span>{" "}
                    <span className="text-gray-100">{mailbox ? (mailbox.isEnabled ? "enabled" : "disabled") : "missing"}</span>
                  </div>
                  {mailbox ? (
                    <div className="text-xs text-gray-500 mt-2">
                      Quota: {mailbox.quotaMb}MB • Daily outbound limit: {mailbox.dailyOutboundLimit}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {!mailbox ? (
                    <Button onClick={() => provisionMailboxMutation.mutate()} disabled={provisionMailboxMutation.isPending}>
                      {provisionMailboxMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Provisioning…
                        </>
                      ) : (
                        "Provision mailbox"
                      )}
                    </Button>
                  ) : (
                    <>
                      <Button variant="secondary" onClick={() => setActiveTab("inbox")}>
                        Open inbox
                      </Button>
                      {mailbox.isEnabled ? (
                        <Button
                          variant="destructive"
                          onClick={() => disableMailboxMutation.mutate()}
                          disabled={disableMailboxMutation.isPending}
                        >
                          {disableMailboxMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              Disabling…
                            </>
                          ) : (
                            "Disable mailbox"
                          )}
                        </Button>
                      ) : null}
                    </>
                  )}

                  <Link href="/admin/inbox">
                    <Button variant="outline">Global inbox</Button>
                  </Link>
                  <Link href="/admin/email">
                    <Button variant="outline">Email setup</Button>
                  </Link>
                </div>
              </div>

              <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
                <div className="text-sm text-white font-semibold">Agent profile editor</div>
                <div className="text-sm text-gray-300 mt-2">
                  Use <span className="text-white font-semibold">Edit</span> in the header to update name, role, department, and settings.
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AgentProfileDialog agent={agent} runtimeAgentId={runtimeAgentId} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
