import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type EmailThread = {
  id: number;
  subject: string | null;
  lastMessageAt: string | null;
  createdAt: string;
};

type ThreadsResponse = { ok: boolean; items: EmailThread[] };

type EmailWorkOrder = {
  id: number;
  threadId: number;
  status: string;
  senderEmail: string;
  lastInboundAt: string | null;
  dueAt: string | null;
};

type WorkOrderRow = {
  workOrder: EmailWorkOrder;
  thread: { id: number; subject: string | null; lastMessageAt: string | null } | null;
};

type WorkOrdersResponse = { ok: boolean; items: WorkOrderRow[] };

type EmailMessage = {
  id: number;
  direction: "inbound" | "outbound";
  status: string;
  fromEmail: string;
  toJson: string[];
  subject: string | null;
  textBody: string | null;
  htmlBody: string | null;
  createdAt: string;
};

type MessagesResponse = { ok: boolean; items: EmailMessage[] };

type AttachmentMeta = {
  id: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

type MessageDetailResponse = { ok: boolean; message: EmailMessage; attachments: AttachmentMeta[] };

function readLocal(key: string, fallback: string) {
  try {
    const v = localStorage.getItem(key);
    return v ? String(v) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
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

export function MailPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [agentKey, setAgentKey] = useState(() => readLocal("mail_agent_key", "support"));
  const [mode, setMode] = useState<"threads" | "work_orders">("work_orders");
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);

  useEffect(() => {
    writeLocal("mail_agent_key", agentKey);
  }, [agentKey]);

  const threadsQueryKey = `/api/mail/threads?limit=200&agentKey=${encodeURIComponent(agentKey)}`;
  const workOrdersQueryKey = `/api/mail/work-orders?limit=200&agentKey=${encodeURIComponent(agentKey)}`;
  const threadsQuery = useQuery<ThreadsResponse>({ queryKey: [threadsQueryKey], staleTime: 0 });
  const workOrdersQuery = useQuery<WorkOrdersResponse>({ queryKey: [workOrdersQueryKey], staleTime: 0 });

  useEffect(() => {
    if (selectedThreadId) return;
    const first =
      mode === "work_orders"
        ? workOrdersQuery.data?.items?.[0]?.workOrder?.threadId ?? null
        : threadsQuery.data?.items?.[0]?.id ?? null;
    if (first) setSelectedThreadId(first);
  }, [mode, selectedThreadId, threadsQuery.data, workOrdersQuery.data]);

  const messagesQueryKey = selectedThreadId
    ? `/api/mail/threads/${selectedThreadId}/messages?limit=500&agentKey=${encodeURIComponent(agentKey)}`
    : null;
  const messagesQuery = useQuery<MessagesResponse>({
    queryKey: messagesQueryKey ? [messagesQueryKey] : ["__no_thread__"],
    enabled: !!messagesQueryKey,
    staleTime: 0,
  });

  useEffect(() => {
    if (!selectedThreadId) return;
    const inbound = (messagesQuery.data?.items ?? []).filter((m) => m.direction === "inbound");
    const lastInbound = inbound.length ? inbound[inbound.length - 1] : null;
    setSelectedMessageId(lastInbound?.id ?? (messagesQuery.data?.items?.[0]?.id ?? null));
  }, [selectedThreadId, messagesQuery.data]);

  const messageDetailQueryKey = selectedMessageId
    ? `/api/mail/message/${selectedMessageId}?agentKey=${encodeURIComponent(agentKey)}`
    : null;
  const messageDetailQuery = useQuery<MessageDetailResponse>({
    queryKey: messageDetailQueryKey ? [messageDetailQueryKey] : ["__no_message__"],
    enabled: !!messageDetailQueryKey,
    staleTime: 0,
  });

  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");

  const sendMutation = useMutation({
    mutationFn: async () => {
      const to = composeTo
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      if (!to.length) throw new Error("To is required");
      if (!composeSubject.trim()) throw new Error("Subject is required");
      if (!composeBody.trim()) throw new Error("Message is required");
      return apiRequest(`/api/mail/send?agentKey=${encodeURIComponent(agentKey)}`, "POST", {
        to,
        subject: composeSubject.trim(),
        body: { text: composeBody },
      });
    },
    onSuccess: async () => {
      setComposeBody("");
      toast({ title: "Queued", description: "Email queued for sending." });
      await queryClient.invalidateQueries({ queryKey: [threadsQueryKey] });
      await queryClient.invalidateQueries({ queryKey: [workOrdersQueryKey] });
    },
    onError: (err: any) => {
      toast({ title: "Send failed", description: String(err?.message || err), variant: "destructive" });
    },
  });

  const [replyBody, setReplyBody] = useState("");
  const replyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMessageId) throw new Error("Select a message to reply");
      if (!replyBody.trim()) throw new Error("Reply is required");
      return apiRequest(`/api/mail/message/${selectedMessageId}/reply?agentKey=${encodeURIComponent(agentKey)}`, "POST", {
        body: { text: replyBody },
      });
    },
    onSuccess: async () => {
      setReplyBody("");
      toast({ title: "Queued", description: "Reply queued for sending." });
      await queryClient.invalidateQueries({ queryKey: [workOrdersQueryKey] });
      if (messagesQueryKey) await queryClient.invalidateQueries({ queryKey: [messagesQueryKey] });
    },
    onError: (err: any) => {
      toast({ title: "Reply failed", description: String(err?.message || err), variant: "destructive" });
    },
  });

  const rows = mode === "work_orders" ? workOrdersQuery.data?.items ?? [] : threadsQuery.data?.items ?? [];
  const selectedThread = useMemo(() => {
    if (!selectedThreadId) return null;
    if (mode === "work_orders") {
      const row = (workOrdersQuery.data?.items ?? []).find((r) => r.workOrder.threadId === selectedThreadId) ?? null;
      return row?.thread ?? null;
    }
    return (threadsQuery.data?.items ?? []).find((t) => t.id === selectedThreadId) ?? null;
  }, [mode, selectedThreadId, threadsQuery.data, workOrdersQuery.data]);

  return (
    <div
      data-testid="exportunity-mail-workspace"
      className="min-h-[calc(100vh-var(--admin-header-height,4rem))] bg-[#F7F8FA] text-[#07111F]"
    >
      <div className="container mx-auto space-y-6 px-4 py-6 md:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8A5700]">GTN communications</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Mailbox operations</h1>
            <div className="text-xs font-medium text-slate-500">Platform-native email workspace with governed access</div>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Input
              value={agentKey}
              onChange={(e) => setAgentKey(e.target.value)}
              placeholder="Agent key (for example, support)"
              aria-label="Mailbox agent key"
              className="min-w-0 flex-1 border-slate-200 bg-white text-slate-950 sm:w-64 sm:flex-none"
            />
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]" onClick={() => {
              queryClient.invalidateQueries({ queryKey: [threadsQueryKey] });
              queryClient.invalidateQueries({ queryKey: [workOrdersQueryKey] });
            }}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardHeader>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-start xl:flex-row xl:items-center">
                <CardTitle className="text-slate-950">{mode === "work_orders" ? "Needs reply" : "All conversations"}</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className={mode === "work_orders" ? "border-[#F5A623]/40 bg-[#FFF0C7] font-bold text-[#8A5700] hover:bg-[#FFF0C7]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}
                    onClick={() => setMode("work_orders")}
                  >
                    Needs reply
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className={mode === "threads" ? "border-[#F5A623]/40 bg-[#FFF0C7] font-bold text-[#8A5700] hover:bg-[#FFF0C7]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}
                    onClick={() => setMode("threads")}
                  >
                    All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[36vh] pr-3 lg:h-[70vh]">
                <div className="space-y-2">
                  {rows.length === 0 ? (
                    <div className="text-sm text-slate-500">No conversations found for this agent.</div>
                  ) : (
                    rows.map((row: any) => {
                      const threadId = mode === "work_orders" ? row.workOrder.threadId : row.id;
                      const subject = mode === "work_orders" ? row.thread?.subject : row.subject;
                      const selected = selectedThreadId === threadId;
                      const dueLabel = mode === "work_orders" ? formatDueLabel(row.workOrder?.dueAt) : null;
                      return (
                        <button
                          key={threadId}
                          onClick={() => setSelectedThreadId(threadId)}
                          className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                            selected ? "border-[#F5A623]/55 bg-[#FFF8E8]" : "border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate text-sm font-bold text-slate-950">{subject || "(no subject)"}</div>
                            {mode === "work_orders" && dueLabel && <Badge className="border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-white">{dueLabel}</Badge>}
                          </div>
                          {mode === "work_orders" && (
                            <div className="mt-1 text-xs font-medium text-slate-500">From: {row.workOrder?.senderEmail}</div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-slate-950">{selectedThread?.subject || "Conversation workspace"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input className="border-slate-200 bg-white text-slate-950" value={composeTo} onChange={(e) => setComposeTo(e.target.value)} placeholder="To (comma-separated)" />
                <Input className="border-slate-200 bg-white text-slate-950" value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} placeholder="Subject" />
                <Button
                  disabled={sendMutation.isPending}
                  onClick={() => sendMutation.mutate()}
                  className="bg-[#F5A623] font-bold text-[#07111F] hover:bg-[#E49718]"
                >
                  Send
                </Button>
              </div>
              <Textarea value={composeBody} onChange={(e) => setComposeBody(e.target.value)} placeholder="Compose…" className="min-h-28 border-slate-200 bg-white text-slate-950" />

              <div className="border-t border-slate-200 pt-4">
                <div className="mb-2 text-sm font-bold text-slate-950">Messages</div>
                <ScrollArea className="h-[38vh] pr-3">
                  <div className="space-y-2">
                    {(messagesQuery.data?.items ?? []).map((m) => {
                      const selected = selectedMessageId === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setSelectedMessageId(m.id)}
                          className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                            selected ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Badge className="border border-sky-200 bg-white font-semibold text-sky-800 hover:bg-white">{m.direction}</Badge>
                            <div className="text-xs text-slate-500">{new Date(m.createdAt).toLocaleString()}</div>
                          </div>
                          <div className="mt-1 text-xs font-medium text-slate-500">From: {m.fromEmail}</div>
                          <div className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                            {m.textBody || "(no text body indexed)"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-slate-950">Reply</div>
                  <Button disabled={replyMutation.isPending} variant="outline" className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]" onClick={() => replyMutation.mutate()}>
                    Reply
                  </Button>
                </div>
                <Textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder="Write a reply…" className="min-h-24 border-slate-200 bg-white text-slate-950" />

                {messageDetailQuery.data?.attachments?.length ? (
                  <div className="pt-2">
                    <div className="mb-2 text-xs font-semibold text-slate-600">Attachments</div>
                    <div className="flex flex-wrap gap-2">
                      {messageDetailQuery.data.attachments.map((a) => (
                        <a
                          key={a.id}
                          className="rounded-full border border-[#F5A623]/30 bg-[#FFF8E8] px-3 py-1 text-xs font-bold text-[#8A5700] hover:underline"
                          href={`/api/mail/attachments/${a.id}/download?agentKey=${encodeURIComponent(agentKey)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {a.filename} ({Math.round((a.sizeBytes || 0) / 1024)} KB)
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

