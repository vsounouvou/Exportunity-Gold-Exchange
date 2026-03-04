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

import { Loader2, PhoneCall, RefreshCw, Send } from "lucide-react";

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

type WorkOrdersResponse = {
  ok: boolean;
  items: Array<{
    workOrder: CommsWorkOrder;
    thread: Pick<CommsThread, "id" | "agentKey" | "channel" | "peerAddress" | "lastMessageAt" | "metadata"> | null;
  }>;
};

type ThreadsResponse = {
  ok: boolean;
  items: Array<{
    thread: CommsThread;
    workOrder: CommsWorkOrder | null;
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

type MessagesResponse = { ok: boolean; items: CommsMessage[] };

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

export function AdminCommunicationsInboxPage() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = tenant.id ?? null;

  const [mode, setMode] = useState<"all" | "work_orders">("work_orders");
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);

  const workOrdersQuery = useQuery<WorkOrdersResponse>({
    queryKey: tenantId ? ["/api/communications/work-orders?limit=500"] : ["__no_tenant__"],
    enabled: !!tenantId,
    staleTime: 0,
  });

  const threadsQuery = useQuery<ThreadsResponse>({
    queryKey: tenantId ? ["/api/communications/threads?limit=500"] : ["__no_tenant__"],
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

  const listItems = useMemo(() => {
    if (mode === "work_orders") {
      const items = workOrdersQuery.data?.items ?? [];
      return items
        .map((row) => ({
          key: `wo:${row.workOrder.id}`,
          threadId: row.thread?.id ?? row.workOrder.threadId,
          channel: row.workOrder.channel,
          agentKey: row.workOrder.agentKey,
          peer: row.thread?.peerAddress ?? row.workOrder.peerAddress,
          dueAt: row.workOrder.dueAt,
          lastAt: row.thread?.lastMessageAt ?? row.workOrder.lastInboundAt ?? null,
          status: row.workOrder.status,
        }))
        .sort((a, b) => String(a.dueAt || "").localeCompare(String(b.dueAt || "")));
    }

    const items = threadsQuery.data?.items ?? [];
    return items.map((row) => ({
      key: `t:${row.thread.id}`,
      threadId: row.thread.id,
      channel: row.thread.channel,
      agentKey: row.thread.agentKey,
      peer: row.thread.peerAddress,
      dueAt: row.workOrder?.dueAt ?? null,
      lastAt: row.thread.lastMessageAt ?? null,
      status: row.workOrder?.status ?? "-",
    }));
  }, [mode, workOrdersQuery.data?.items, threadsQuery.data?.items]);

  useEffect(() => {
    if (selectedThreadId) return;
    const first = listItems[0]?.threadId ?? null;
    if (first) setSelectedThreadId(first);
  }, [listItems, selectedThreadId]);

  const activeThread = useMemo(() => {
    const items = threadsQuery.data?.items ?? [];
    return items.find((r) => r.thread.id === selectedThreadId)?.thread ?? null;
  }, [threadsQuery.data?.items, selectedThreadId]);

  const activeWorkOrder = useMemo(() => {
    if (!selectedThreadId) return null;

    for (const row of workOrdersQuery.data?.items ?? []) {
      const threadId = row.thread?.id ?? row.workOrder.threadId;
      if (threadId === selectedThreadId) return row.workOrder;
    }

    const items = threadsQuery.data?.items ?? [];
    return items.find((r) => r.thread.id === selectedThreadId)?.workOrder ?? null;
  }, [selectedThreadId, workOrdersQuery.data?.items, threadsQuery.data?.items]);

  const messagesQuery = useQuery<MessagesResponse>({
    queryKey: selectedThreadId ? [`/api/communications/threads/${selectedThreadId}/messages?limit=500`] : ["__no_thread__"],
    enabled: !!selectedThreadId,
    staleTime: 0,
  });

  const [composeBody, setComposeBody] = useState("");
  const [reassignAgentKey, setReassignAgentKey] = useState("");

  useEffect(() => {
    if (!activeThread) return;
    setReassignAgentKey(activeThread.agentKey || "");
  }, [activeThread?.id]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!activeThread) throw new Error("Select a thread first");
      if (activeThread.channel === "voice") throw new Error("Voice threads require a call back");
      const body = composeBody.trim();
      if (!body) throw new Error("Message is empty");
      return await apiRequest("/api/comms/send", "POST", {
        agentKey: activeThread.agentKey,
        channel: activeThread.channel,
        toE164: activeThread.peerAddress,
        body,
      });
    },
    onSuccess: () => {
      setComposeBody("");
      toast({ title: "Sent", description: "Message queued." });
      if (selectedThreadId) {
        void queryClient.invalidateQueries({ queryKey: [`/api/communications/threads/${selectedThreadId}/messages?limit=500`] });
      }
      void queryClient.invalidateQueries({ queryKey: ["/api/communications/work-orders?limit=500"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/communications/threads?limit=500"] });
    },
    onError: (err: any) => toast({ title: "Send failed", description: err?.message || "Unable to send", variant: "destructive" }),
  });

  const callMutation = useMutation({
    mutationFn: async () => {
      if (!activeThread) throw new Error("Select a thread first");
      return await apiRequest("/api/voice/call", "POST", {
        agentKey: activeThread.agentKey,
        toE164: activeThread.peerAddress,
        record: false,
      });
    },
    onSuccess: () => {
      toast({ title: "Calling", description: "Voice call initiated." });
      void queryClient.invalidateQueries({ queryKey: ["/api/communications/work-orders?limit=500"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/communications/threads?limit=500"] });
    },
    onError: (err: any) => toast({ title: "Call failed", description: err?.message || "Unable to place call", variant: "destructive" }),
  });

  const reassignMutation = useMutation({
    mutationFn: async () => {
      if (!activeThread) throw new Error("Select a thread first");
      const nextAgentKey = normalizeAgentKey(reassignAgentKey);
      if (!nextAgentKey) throw new Error("Enter a valid agent key");
      return await apiRequest(`/api/communications/threads/${activeThread.id}/reassign`, "POST", { agentKey: nextAgentKey });
    },
    onSuccess: (data: any) => {
      const nextThreadId = Number(data?.threadId ?? data?.thread?.id) || null;
      toast({ title: "Reassigned", description: nextThreadId ? `Thread moved (id=${nextThreadId}).` : "Thread reassigned." });
      void queryClient.invalidateQueries({ queryKey: ["/api/communications/work-orders?limit=500"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/communications/threads?limit=500"] });
      if (nextThreadId && nextThreadId !== selectedThreadId) setSelectedThreadId(nextThreadId);
    },
    onError: (err: any) => toast({ title: "Reassign failed", description: err?.message || "Unable to reassign", variant: "destructive" }),
  });

  const escalateMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkOrder) throw new Error("No open work order for this thread");
      return await apiRequest(`/api/communications/work-orders/${activeWorkOrder.id}/escalate`, "POST", { reason: "manual_escalation" });
    },
    onSuccess: () => {
      toast({ title: "Escalated", description: "Work order escalation logged." });
      void queryClient.invalidateQueries({ queryKey: ["/api/communications/work-orders?limit=500"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/communications/threads?limit=500"] });
    },
    onError: (err: any) => toast({ title: "Escalation failed", description: err?.message || "Unable to escalate", variant: "destructive" }),
  });

  const dueLabel = formatDueLabel(activeWorkOrder?.dueAt ?? null);

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Inbox (SMS / WhatsApp / Voice)</h1>
          <p className="text-gray-400 text-sm">Tenant: {tenant?.name || "-"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={mode === "work_orders" ? "default" : "secondary"} onClick={() => setMode("work_orders")} size="sm">
            Work orders
          </Button>
          <Button variant={mode === "all" ? "default" : "secondary"} onClick={() => setMode("all")} size="sm">
            All threads
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["/api/communications/work-orders?limit=500"] });
              void queryClient.invalidateQueries({ queryKey: ["/api/communications/threads?limit=500"] });
              if (selectedThreadId) {
                void queryClient.invalidateQueries({ queryKey: [`/api/communications/threads/${selectedThreadId}/messages?limit=500`] });
              }
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Link href="/admin/settings/communications/twilio">
            <Button variant="outline" size="sm">
              Twilio settings
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-sm">Queue</CardTitle>
            <div className="text-xs text-gray-500">{mode === "work_orders" ? "Requires reply" : "All threads"}</div>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="h-[70vh] pr-3">
              <div className="space-y-2">
                {workOrdersQuery.isLoading || threadsQuery.isLoading ? (
                  <div className="text-sm text-gray-500 py-8">Loading...</div>
                ) : listItems.length ? (
                  listItems.map((it) => {
                    const isActive = it.threadId === selectedThreadId;
                    const agent = agentsByKey.get(normalizeAgentKey(it.agentKey));
                    const itDueLabel = formatDueLabel(it.dueAt);
                    return (
                      <button
                        key={it.key}
                        className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                          isActive ? "bg-white/10 border-white/20" : "bg-white/5 border-white/10 hover:bg-white/10"
                        }`}
                        onClick={() => setSelectedThreadId(it.threadId)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white truncate">{it.peer}</div>
                            <div className="text-[11px] text-white/55 truncate">
                              {it.channel.toUpperCase()} • {agent?.name || it.agentKey}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <Badge className="text-[10px] bg-white/10 border-white/15 text-white/70">{it.channel.toUpperCase()}</Badge>
                            {itDueLabel ? (
                              <div className={`text-[10px] mt-1 ${String(itDueLabel).includes("overdue") ? "text-rose-300" : "text-white/50"}`}>
                                {itDueLabel}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="text-sm text-gray-500 py-8">No threads yet.</div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-white text-sm truncate">{activeThread ? activeThread.peerAddress : "Thread"}</CardTitle>
                <div className="text-xs text-gray-500 mt-1">
                  {activeThread ? `${activeThread.channel.toUpperCase()} • agent: ${activeThread.agentKey}` : "-"}
                  {activeWorkOrder ? ` • status: ${activeWorkOrder.status}` : ""}
                  {dueLabel ? ` • ${dueLabel}` : ""}
                </div>
              </div>

              {activeThread ? (
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={reassignAgentKey}
                      onChange={(e) => setReassignAgentKey(e.target.value)}
                      placeholder="agent key"
                      className="bg-gray-950 border-gray-800 text-white h-9 w-[160px]"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => reassignMutation.mutate()}
                      disabled={reassignMutation.isPending || !reassignAgentKey.trim()}
                      title="Admin only"
                    >
                      {reassignMutation.isPending ? "..." : "Reassign"}
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => escalateMutation.mutate()}
                    disabled={escalateMutation.isPending || !activeWorkOrder}
                    title={!activeWorkOrder ? "No open work order" : "Admin only"}
                  >
                    {escalateMutation.isPending ? "..." : "Escalate"}
                  </Button>
                </div>
              ) : null}
            </div>
          </CardHeader>

          <CardContent className="pt-0 space-y-3">
            <ScrollArea className="h-[48vh] pr-4 rounded-lg border border-white/10 bg-black/20">
              <div className="p-3 space-y-2">
                {messagesQuery.isLoading ? (
                  <div className="text-sm text-white/60 py-8">Loading...</div>
                ) : (messagesQuery.data?.items?.length ?? 0) === 0 ? (
                  <div className="text-sm text-white/60 py-8">No messages yet.</div>
                ) : (
                  (messagesQuery.data?.items ?? []).map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[85%] rounded-xl border px-3 py-2 ${
                        m.direction === "outbound" ? "ml-auto bg-emerald-500/10 border-emerald-400/20" : "bg-white/5 border-white/10"
                      }`}
                    >
                      <div className="text-[11px] text-white/50 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <span>{m.direction.toUpperCase()}</span>
                          {m.direction === "outbound" ? (
                            <Badge className="text-[10px] bg-white/10 border-white/15 text-white/70">{String(m.status || "unknown").toUpperCase()}</Badge>
                          ) : null}
                        </span>
                        <span>{new Date(m.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="text-sm text-white whitespace-pre-wrap mt-1">
                        {m.channel === "voice" ? `Call (${m.status || "unknown"})` : m.body || ((m.metadata as any)?.media ? "[media]" : "-")}
                      </div>
                      {m.direction === "outbound" && m.providerMessageId ? (
                        <div className="text-[11px] text-white/50 mt-1 font-mono break-words">sid: {m.providerMessageId}</div>
                      ) : null}
                      {m.errorMessage ? <div className="text-[11px] text-rose-200 mt-1">{m.errorMessage}</div> : null}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {activeThread ? (
              activeThread.channel === "voice" ? (
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm text-white font-semibold">Voice</div>
                      <div className="text-xs text-white/60 mt-1">Call back to satisfy reply obligation.</div>
                    </div>
                    <Button onClick={() => callMutation.mutate()} disabled={callMutation.isPending}>
                      {callMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Calling...
                        </>
                      ) : (
                        <>
                          <PhoneCall className="h-4 w-4 mr-2" />
                          Call
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-white font-semibold">Reply</div>
                    <Button variant="secondary" size="sm" onClick={() => setComposeBody("")} disabled={sendMutation.isPending}>
                      Clear
                    </Button>
                  </div>
                  <Textarea
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                    placeholder="Write a reply..."
                    className="bg-black/30 border-white/10 text-white min-h-[120px]"
                  />
                  <div className="flex items-center gap-2">
                    <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending || !composeBody.trim()}>
                      {sendMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Send
                        </>
                      )}
                    </Button>
                    <Button variant="outline" onClick={() => callMutation.mutate()} disabled={callMutation.isPending}>
                      <PhoneCall className="h-4 w-4 mr-2" />
                      Call
                    </Button>
                  </div>
                </div>
              )
            ) : (
              <div className="text-sm text-white/60 py-6">Select a thread to view messages.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
