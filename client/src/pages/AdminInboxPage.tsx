import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent } from "@db/schema";

import { apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant";
import { useToast } from "@/hooks/use-toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

import { ArrowRight, Loader2, Mail, RefreshCw } from "lucide-react";

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

type EmailWorkOrderRow = {
  workOrder: EmailWorkOrder;
  thread: { id: number; subject: string | null; lastMessageAt: string | null } | null;
  mailbox: { id: number; agentKey: string; email: string } | null;
};

type WorkOrdersResponse = {
  ok: boolean;
  items: EmailWorkOrderRow[];
};

type EmailThread = {
  id: number;
  tenantId: number;
  agentKey: string;
  mailboxId: number;
  subjectNorm: string;
  subject: string | null;
  lastMessageAt: string | null;
  createdAt: string;
};

type EmailThreadRow = {
  thread: EmailThread;
  mailbox: { id: number; agentKey: string; email: string } | null;
  workOrder: EmailWorkOrder | null;
};

type ThreadsResponse = {
  ok: boolean;
  items: EmailThreadRow[];
};

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

export function AdminInboxPage() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = tenant.id ?? null;

  const [mode, setMode] = useState<"all" | "work_orders">("all");
  const workOrdersQuery = useQuery<WorkOrdersResponse>({
    queryKey: tenantId ? ["/api/admin/email/work-orders?limit=500"] : ["__no_tenant__"],
    enabled: !!tenantId,
    staleTime: 0,
  });

  const threadsQuery = useQuery<ThreadsResponse>({
    queryKey: tenantId ? ["/api/admin/email/threads?limit=500"] : ["__no_threads__"],
    enabled: !!tenantId,
    staleTime: 0,
  });

  const agentsQuery = useQuery<Agent[]>({
    queryKey: tenantId ? ["/api/agents"] : ["__no_agents__"],
    enabled: !!tenantId,
    staleTime: 30_000,
  });

  const agentsByKey = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agentsQuery.data ?? []) {
      const meta = (a as any)?.metadata && typeof (a as any).metadata === "object" ? (a as any).metadata : {};
      const explicit = typeof meta?.mailAgentKey === "string" ? meta.mailAgentKey : null;
      const key = normalizeAgentKey(explicit || a.name || "");
      if (!key) continue;
      map.set(key, a);
    }
    return map;
  }, [agentsQuery.data]);

  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<number | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);

  useEffect(() => {
    if (mode !== "work_orders") return;
    if (selectedWorkOrderId) return;
    const first = workOrdersQuery.data?.items?.[0]?.workOrder?.id ?? null;
    if (first) setSelectedWorkOrderId(first);
  }, [mode, selectedWorkOrderId, workOrdersQuery.data]);

  useEffect(() => {
    if (mode !== "all") return;
    if (selectedThreadId) return;
    const first = threadsQuery.data?.items?.[0]?.thread?.id ?? null;
    if (first) setSelectedThreadId(first);
  }, [mode, selectedThreadId, threadsQuery.data]);

  const activeWorkOrder = useMemo(() => {
    const items = workOrdersQuery.data?.items ?? [];
    if (!items.length) return null;
    if (!selectedWorkOrderId) return items[0] ?? null;
    return items.find((x) => x.workOrder.id === selectedWorkOrderId) ?? items[0] ?? null;
  }, [selectedWorkOrderId, workOrdersQuery.data]);

  const activeThread = useMemo(() => {
    const items = threadsQuery.data?.items ?? [];
    if (!items.length) return null;
    if (!selectedThreadId) return items[0] ?? null;
    return items.find((x) => x.thread.id === selectedThreadId) ?? items[0] ?? null;
  }, [selectedThreadId, threadsQuery.data]);

  const activeThreadId = mode === "work_orders" ? activeWorkOrder?.workOrder?.threadId ?? null : activeThread?.thread?.id ?? null;
  const activeMailbox = mode === "work_orders" ? activeWorkOrder?.mailbox ?? null : activeThread?.mailbox ?? null;
  const activeAgentKey =
    mode === "work_orders"
      ? activeMailbox?.agentKey ?? activeWorkOrder?.workOrder?.agentKey ?? ""
      : activeMailbox?.agentKey ?? activeThread?.thread?.agentKey ?? "";

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("tenant required");
      const payload = activeAgentKey ? { agentKey: activeAgentKey, limitPerMailbox: 500 } : { limitPerMailbox: 250 };
      return apiRequest("/api/admin/email/index", {
        method: "POST",
        body: JSON.stringify(payload),
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
        mode === "work_orders"
          ? queryClient.invalidateQueries({ queryKey: ["/api/admin/email/work-orders?limit=500"] })
          : queryClient.invalidateQueries({ queryKey: ["/api/admin/email/threads?limit=500"] }),
        queryClient.invalidateQueries({
          queryKey: activeThreadId ? [`/api/admin/threads/${activeThreadId}/messages?limit=200`] : [],
        }),
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

  const messagesQuery = useQuery<MessagesResponse>({
    queryKey: activeThreadId ? [`/api/admin/threads/${activeThreadId}/messages?limit=200`] : ["__no_thread__"],
    enabled: !!activeThreadId,
    staleTime: 0,
  });

  const lastInboundFrom = useMemo(() => {
    const items = messagesQuery.data?.items ?? [];
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i]?.direction === "inbound") return items[i]?.fromEmail;
    }
    return null as string | null;
  }, [messagesQuery.data]);

  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");

  useEffect(() => {
    if (mode === "work_orders") {
      if (!activeWorkOrder) return;
      setComposeTo(activeWorkOrder.workOrder.senderEmail || "");
      setComposeSubject(ensureReplySubject(activeWorkOrder.thread?.subject));
      return;
    }

    if (!activeThread) return;
    setComposeSubject(ensureReplySubject(activeThread.thread?.subject));
  }, [mode, activeThread?.thread?.id, activeWorkOrder?.workOrder?.id]);

  const clearCompose = () => {
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("tenant required");
      if (!activeAgentKey) throw new Error("agent mailbox required");
      const to = normalizeCsv(composeTo);
      if (!to.length) throw new Error("Recipient required");
      if (!composeSubject.trim()) throw new Error("Subject required");
      if (!composeBody.trim()) throw new Error("Message required");

      return apiRequest("/api/email/send", {
        method: "POST",
        body: JSON.stringify({
          tenant_id: tenantId,
          agent_id: activeAgentKey,
          to,
          subject: composeSubject.trim(),
          body: { text: composeBody.trim() },
        }),
      });
    },
    onSuccess: async (payload: any) => {
      const requiresApproval = payload?.requiresApproval === true;
      toast({
        title: requiresApproval ? "Email queued (approval required)" : "Email queued",
        description: requiresApproval
          ? "An admin must approve this send in Actions → Decisions."
          : "This will be sent by the background Actions worker.",
      });
      clearCompose();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/admin/email/work-orders?limit=500"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/admin/email/threads?limit=500"] }),
        queryClient.invalidateQueries({
          queryKey: activeThreadId ? [`/api/admin/threads/${activeThreadId}/messages?limit=200`] : [],
        }),
      ]);
    },
    onError: (err: any) => {
      toast({
        title: "Send failed",
        description: err?.message || "Could not send email",
        variant: "destructive",
      });
    },
  });

  const activeAgent = activeAgentKey ? agentsByKey.get(activeAgentKey) ?? null : null;
  const workOrdersCount = workOrdersQuery.data?.items?.length ?? 0;
  const activeSubject = mode === "work_orders" ? activeWorkOrder?.thread?.subject : activeThread?.thread?.subject;

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-amber-300" />
            <h1 className="text-xl font-semibold text-white truncate">Inbox</h1>
          </div>
          <div className="text-sm text-gray-400 truncate">
            {mode === "work_orders"
              ? "Reply-required emails across all agent mailboxes (Chairman view)."
              : "All inbound + outbound email across agent mailboxes (monitoring view)."}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={mode === "all" ? "default" : "secondary"}
              onClick={() => setMode("all")}
              className="h-9"
            >
              All mail
            </Button>
            <Button
              size="sm"
              variant={mode === "work_orders" ? "default" : "secondary"}
              onClick={() => setMode("work_orders")}
              className="h-9 gap-2"
            >
              Work orders
              {workOrdersCount ? (
                <Badge className="bg-black/20 text-white border border-white/15">{workOrdersCount}</Badge>
              ) : null}
            </Button>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            <RefreshCw
              className={
                syncMutation.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"
              }
            />
          </Button>
          <Link href="/agents">
            <Button size="sm" className="gap-2">
              Agents <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="bg-gray-950 border-gray-800 lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base">{mode === "work_orders" ? "Work orders" : "Threads"}</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[520px] pr-4">
              <div className="space-y-2">
                {mode === "work_orders" && workOrdersQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading…
                  </div>
                ) : mode === "work_orders" && (workOrdersQuery.data?.items?.length ?? 0) === 0 ? (
                  <div className="text-sm text-gray-400">No reply-required emails.</div>
                ) : mode === "work_orders" ? (
                  (workOrdersQuery.data?.items ?? []).map((row) => {
                    const wo = row.workOrder;
                    const activeRow = wo.id === (activeWorkOrder?.workOrder?.id ?? null);
                    const dueLabel = formatDueLabel(wo.dueAt);
                    return (
                      <button
                        key={wo.id}
                        onClick={() => setSelectedWorkOrderId(wo.id)}
                        className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                          activeRow
                            ? "border-amber-500/40 bg-amber-500/10"
                            : "border-gray-800 bg-gray-900/30 hover:bg-gray-900/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm text-white truncate">{row.thread?.subject || "(no subject)"}</div>
                          {dueLabel ? (
                            <Badge className="bg-amber-500/15 text-amber-200 border border-amber-500/30">{dueLabel}</Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-gray-400 mt-1 truncate">
                          {row.mailbox?.agentKey || wo.agentKey} • {wo.senderEmail}
                        </div>
                        {row.thread?.lastMessageAt ? (
                          <div className="text-xs text-gray-500 mt-1">{new Date(row.thread.lastMessageAt).toLocaleString()}</div>
                        ) : null}
                      </button>
                    );
                  })
                ) : threadsQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading…
                  </div>
                ) : (threadsQuery.data?.items?.length ?? 0) === 0 ? (
                  <div className="text-sm text-gray-400">No emails indexed yet.</div>
                ) : (
                  (threadsQuery.data?.items ?? []).map((row) => {
                    const thread = row.thread;
                    const activeRow = thread.id === (activeThread?.thread?.id ?? null);
                    const dueLabel = row.workOrder ? formatDueLabel(row.workOrder.dueAt) : null;
                    return (
                      <button
                        key={thread.id}
                        onClick={() => setSelectedThreadId(thread.id)}
                        className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                          activeRow
                            ? "border-amber-500/40 bg-amber-500/10"
                            : "border-gray-800 bg-gray-900/30 hover:bg-gray-900/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm text-white truncate">{thread.subject || "(no subject)"}</div>
                          {dueLabel ? (
                            <Badge className="bg-amber-500/15 text-amber-200 border border-amber-500/30">{dueLabel}</Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-gray-400 mt-1 truncate">
                          {row.mailbox?.agentKey || thread.agentKey} • {row.mailbox?.email || "mailbox"}
                        </div>
                        {thread.lastMessageAt ? (
                          <div className="text-xs text-gray-500 mt-1">{new Date(thread.lastMessageAt).toLocaleString()}</div>
                        ) : null}
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
          </CardHeader>
          <CardContent className="space-y-3">
            {mode === "work_orders" && !activeWorkOrder ? (
              <div className="text-sm text-gray-400">Select a work order.</div>
            ) : mode === "all" && !activeThread ? (
              <div className="text-sm text-gray-400">Select a thread.</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-gray-300">
                    <span className="text-gray-400">Agent:</span>{" "}
                    <span className="text-white font-semibold">{activeAgentKey || "—"}</span>{" "}
                    {activeMailbox?.email ? <span className="text-gray-400">({activeMailbox.email})</span> : null}
                  </div>
                  {activeAgent ? (
                    <Link href={`/agents/${activeAgent.id}`}>
                      <Button size="sm" variant="secondary">
                        Open agent
                      </Button>
                    </Link>
                  ) : null}
                </div>

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

                <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-white font-semibold">Compose</div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        if (lastInboundFrom) setComposeTo(lastInboundFrom);
                        setComposeSubject(ensureReplySubject(activeSubject));
                      }}
                    >
                      Reply
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs text-gray-400 mb-1">To (comma separated)</div>
                      <Input value={composeTo} onChange={(e) => setComposeTo(e.target.value)} className="bg-gray-900 border-gray-800" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Subject</div>
                      <Input
                        value={composeSubject}
                        onChange={(e) => setComposeSubject(e.target.value)}
                        className="bg-gray-900 border-gray-800"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-400 mb-1">Message</div>
                    <Textarea
                      value={composeBody}
                      onChange={(e) => setComposeBody(e.target.value)}
                      placeholder="Write a reply…"
                      className="bg-slate-950/40 border-slate-800 text-slate-100 min-h-[120px]"
                    />
                  </div>

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
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
