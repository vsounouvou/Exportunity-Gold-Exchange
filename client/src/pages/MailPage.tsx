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
    <div className="min-h-[calc(100vh-4rem)] bg-gray-950">
      <div className="container mx-auto py-8 px-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-white">Mail</h1>
            <div className="text-xs text-white/60">Platform-native mailbox (SSO)</div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={agentKey}
              onChange={(e) => setAgentKey(e.target.value)}
              placeholder="agent key (e.g. support)"
              className="w-56"
            />
            <Button variant="secondary" onClick={() => {
              queryClient.invalidateQueries({ queryKey: [threadsQueryKey] });
              queryClient.invalidateQueries({ queryKey: [workOrdersQueryKey] });
            }}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-white">{mode === "work_orders" ? "Work Orders" : "Threads"}</CardTitle>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant={mode === "work_orders" ? "secondary" : "ghost"} onClick={() => setMode("work_orders")}>
                    Needs reply
                  </Button>
                  <Button size="sm" variant={mode === "threads" ? "secondary" : "ghost"} onClick={() => setMode("threads")}>
                    All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[70vh] pr-3">
                <div className="space-y-2">
                  {rows.length === 0 ? (
                    <div className="text-sm text-white/60">No items.</div>
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
                          className={`w-full text-left rounded-lg border px-3 py-2 ${
                            selected ? "border-amber-500 bg-amber-500/10" : "border-gray-800 bg-gray-950/40"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate text-sm text-white">{subject || "(no subject)"}</div>
                            {mode === "work_orders" && dueLabel && <Badge className="bg-white/10 text-white">{dueLabel}</Badge>}
                          </div>
                          {mode === "work_orders" && (
                            <div className="mt-1 text-xs text-white/60">From: {row.workOrder?.senderEmail}</div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-white">{selectedThread?.subject || "Conversation"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input value={composeTo} onChange={(e) => setComposeTo(e.target.value)} placeholder="To (comma-separated)" />
                <Input value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} placeholder="Subject" />
                <Button
                  disabled={sendMutation.isPending}
                  onClick={() => sendMutation.mutate()}
                  className="bg-amber-500 hover:bg-amber-600 text-gray-950 font-semibold"
                >
                  Send
                </Button>
              </div>
              <Textarea value={composeBody} onChange={(e) => setComposeBody(e.target.value)} placeholder="Compose…" className="min-h-28" />

              <div className="border-t border-gray-800 pt-4">
                <div className="text-sm font-medium text-white mb-2">Messages</div>
                <ScrollArea className="h-[38vh] pr-3">
                  <div className="space-y-2">
                    {(messagesQuery.data?.items ?? []).map((m) => {
                      const selected = selectedMessageId === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setSelectedMessageId(m.id)}
                          className={`w-full text-left rounded-lg border px-3 py-2 ${
                            selected ? "border-blue-500 bg-blue-500/10" : "border-gray-800 bg-gray-950/40"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Badge className="bg-white/10 text-white">{m.direction}</Badge>
                            <div className="text-xs text-white/60">{new Date(m.createdAt).toLocaleString()}</div>
                          </div>
                          <div className="mt-1 text-xs text-white/60">From: {m.fromEmail}</div>
                          <div className="mt-2 text-sm text-white/80 line-clamp-3 whitespace-pre-wrap">
                            {m.textBody || "(no text body indexed)"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              <div className="border-t border-gray-800 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-white">Reply</div>
                  <Button disabled={replyMutation.isPending} variant="secondary" onClick={() => replyMutation.mutate()}>
                    Reply
                  </Button>
                </div>
                <Textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder="Write a reply…" className="min-h-24" />

                {messageDetailQuery.data?.attachments?.length ? (
                  <div className="pt-2">
                    <div className="text-xs text-white/70 mb-2">Attachments</div>
                    <div className="flex flex-wrap gap-2">
                      {messageDetailQuery.data.attachments.map((a) => (
                        <a
                          key={a.id}
                          className="text-xs text-amber-300 hover:underline"
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

