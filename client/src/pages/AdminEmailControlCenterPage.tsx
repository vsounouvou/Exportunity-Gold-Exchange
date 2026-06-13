import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AdminHumanEmailAccountsPanel } from "./AdminHumanEmailAccountsPanel";

type EmailAgentsResponse = {
  ok: boolean;
  agents: string[];
};

type EmailStatusResponse = {
  ok: boolean;
  mail: {
    domain: string;
    maildirBase: string;
    mailDbConfigured: boolean;
    signatureConfigured: boolean;
    smtpConfigured: boolean;
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      usingAuth: boolean;
      usingSendmail: boolean;
    };
    authDiagnostics?: {
      domain: string;
      trustedForOutbound: boolean;
      warnings: string[];
      spf: { ok: boolean; records: string[] };
      dkim: { ok: boolean; selector: string | null; records: string[] };
      dmarc: { ok: boolean; policy: string | null; records: string[] };
      ptr: { ok: boolean | null; ip: string | null; expectedHost: string | null; reverseHosts: string[] };
      helo: { ok: boolean | null; configured: string | null; expected: string | null };
    };
  };
};

type AgentMailbox = {
  id: number;
  tenantId: number;
  agentKey: string;
  email: string;
  mailUserId: number | null;
  quotaMb: number;
  dailyOutboundLimit: number;
  approvalRequired: boolean;
  isEnabled: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type MailboxesResponse = {
  ok: boolean;
  items: AgentMailbox[];
};

type EmailThread = {
  id: number;
  mailboxId: number;
  subjectNorm: string;
  subject: string | null;
  lastMessageAt: string;
  createdAt: string;
};

type ThreadsResponse = {
  ok: boolean;
  items: EmailThread[];
};

type EmailMessage = {
  id: number;
  threadId: number | null;
  direction: string;
  status: string;
  fromEmail: string;
  toJson: string[];
  ccJson: string[];
  subject: string | null;
  textBody: string | null;
  htmlBody: string | null;
  messageId: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

type MessagesResponse = {
  ok: boolean;
  items: EmailMessage[];
};

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
    workOrder: EmailWorkOrder;
    thread: { id: number; subject: string | null; lastMessageAt: string | null } | null;
  }>;
};

type EmailSendLog = {
  id: number;
  createdAt: string;
  status: string;
  resolvedFromEmail: string;
  toJson: string[];
  subject: string | null;
  providerMessageId: string | null;
  error: string | null;
  providerResponse?: Record<string, unknown> | null;
};

type EmailSendLogsResponse = {
  ok: boolean;
  items: EmailSendLog[];
};

function normalizeCsv(value: string) {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
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

function ensureReplySubject(subject: string | null | undefined) {
  const value = String(subject || "").trim();
  if (!value) return "Re: (no subject)";
  if (/^\\s*re\\s*:/i.test(value)) return value;
  return `Re: ${value}`;
}

function normalizeDeliveryStatus(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z_]+/g, "_");
}

function getDeliveryStatusMeta(value: unknown) {
  const status = normalizeDeliveryStatus(value);
  if (status === "QUEUED") return { label: "Queued", className: "bg-slate-500/15 text-slate-200 border border-slate-500/30" };
  if (status === "ACCEPTED_BY_MTA" || status === "SENT") {
    return { label: "Accepted by server", className: "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30" };
  }
  if (status === "DELIVERED_REMOTE_ACCEPTED") {
    return { label: "Delivered", className: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" };
  }
  if (status === "DEFERRED") return { label: "Deferred", className: "bg-amber-500/15 text-amber-300 border border-amber-500/30" };
  if (status === "SPAM_REJECTED") {
    return { label: "Rejected", className: "bg-rose-500/15 text-rose-300 border border-rose-500/30" };
  }
  if (status === "BOUNCED" || status === "FAILED") {
    return { label: "Bounced", className: "bg-red-500/15 text-red-300 border border-red-500/30" };
  }
  return { label: "Unknown", className: "bg-white/10 text-white border-white/10" };
}

function readNestedRecord(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const map = value as Record<string, unknown>;
  const out = map[key];
  return out && typeof out === "object" && !Array.isArray(out) ? (out as Record<string, unknown>) : null;
}

function readString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function readDeliveryTrace(metadata: Record<string, unknown> | null | undefined) {
  const delivery = readNestedRecord(metadata, "delivery");
  if (!delivery) return { queueId: null, deliveryStatus: null, error: null };
  return {
    queueId: readString(delivery.queueId),
    deliveryStatus: readString(delivery.deliveryStatus),
    error: readString((metadata as any)?.error) || readString(delivery.error),
  };
}

export function AdminEmailControlCenterPage() {
  const { tenant } = useTenant();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const tenantId = tenant.id ?? null;

  const [dashboardMode, setDashboardMode] = useState<"agents" | "humans">("agents");

  const [selectedAgentKey, setSelectedAgentKey] = useState<string>("");
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);

  const [testTo, setTestTo] = useState("vs@exportunity.net");
  const [testResults, setTestResults] = useState<
    Array<{
      agent: string;
      ok: boolean;
      status?: string;
      actionRequestId?: number | null;
      requiresApproval?: boolean;
      error?: string;
    }>
  >([]);
  const [newMailboxCredentials, setNewMailboxCredentials] = useState<Array<{ email: string; password: string }>>([]);

  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");

  const statusQuery = useQuery<EmailStatusResponse>({
    queryKey: ["/api/admin/email/status"],
    retry: false,
  });

  const smtpProbeQuery = useQuery<{
    ok: boolean;
    probe?: {
      ok: boolean;
      checkedAtIso?: string;
      host?: string | null;
      port?: number | null;
      secure?: boolean | null;
      usingAuth?: boolean;
      error?: string | null;
    };
    message?: string;
  }>({
    queryKey: ["/api/admin/email/smtp-probe"],
    retry: false,
    enabled: false,
  });

  const [placementWindowHours] = useState(24);
  const placementQuery = useQuery<{
    ok: boolean;
    snapshot?: {
      ok: boolean;
      configured: boolean;
      checkedAtIso: string;
      provider: string | null;
      windowHours: number;
      inbox: { mailbox: string | null; count: number | null };
      spam: { mailbox: string | null; count: number | null };
      spamRate: number | null;
      error: string | null;
    };
    message?: string;
  }>({
    queryKey: [`/api/admin/email/placement?windowHours=${placementWindowHours}`],
    retry: false,
    enabled: false,
  });

  const agentsQuery = useQuery<EmailAgentsResponse>({
    queryKey: ["/api/admin/email/agents"],
    retry: false,
  });

  const mailboxesQuery = useQuery<MailboxesResponse>({
    queryKey: tenantId ? [`/api/admin/tenants/${tenantId}/mailboxes`] : ["__no_tenant_mailboxes__"],
    enabled: !!tenantId,
  });

  const mailboxes = mailboxesQuery.data?.items ?? [];

  const mailboxByAgent = useMemo(() => {
    const map = new Map<string, AgentMailbox>();
    for (const mb of mailboxes) map.set(String(mb.agentKey || "").toLowerCase(), mb);
    return map;
  }, [mailboxes]);

  const agentKeys = useMemo(() => {
    const fromAgents = Array.isArray(agentsQuery.data?.agents) ? agentsQuery.data!.agents : [];
    const fromMail = mailboxes.map((m) => m.agentKey).filter(Boolean);
    const all = Array.from(new Set([...fromAgents, ...fromMail].map((v) => String(v).trim()).filter(Boolean)));
    all.sort((a, b) => a.localeCompare(b));
    return all;
  }, [agentsQuery.data?.agents, mailboxes]);

  const activeAgentKey = selectedAgentKey || agentKeys[0] || "";
  const activeMailbox = activeAgentKey ? mailboxByAgent.get(activeAgentKey.toLowerCase()) ?? null : null;
  const activeMailboxId = activeMailbox?.id ?? null;

  const threadsQuery = useQuery<ThreadsResponse>({
    queryKey: activeMailboxId ? [`/api/admin/mailboxes/${activeMailboxId}/threads?limit=100`] : ["__no_threads__"],
    enabled: !!activeMailboxId,
  });

  const threads = threadsQuery.data?.items ?? [];
  const activeThreadId = selectedThreadId ?? threads[0]?.id ?? null;
  const activeThread = useMemo(
    () => (activeThreadId ? threads.find((t) => t.id === activeThreadId) ?? null : null),
    [activeThreadId, threads],
  );

  const messagesQuery = useQuery<MessagesResponse>({
    queryKey: activeThreadId ? [`/api/admin/threads/${activeThreadId}/messages?limit=500`] : ["__no_messages__"],
    enabled: !!activeThreadId,
  });

  const workOrdersQuery = useQuery<WorkOrdersResponse>({
    queryKey: activeMailboxId ? [`/api/admin/mailboxes/${activeMailboxId}/work-orders?limit=500`] : ["__no_work_orders__"],
    enabled: !!activeMailboxId,
    staleTime: 10_000,
    retry: false,
  });

  const sendLogsQuery = useQuery<EmailSendLogsResponse>({
    queryKey: ["/api/admin/email/send-logs?limit=20"],
    retry: false,
  });

  const workOrderByThreadId = useMemo(() => {
    const map = new Map<number, EmailWorkOrder>();
    for (const item of workOrdersQuery.data?.items ?? []) {
      const workOrder = item?.workOrder;
      const threadId = Number(workOrder?.threadId);
      if (!Number.isFinite(threadId) || !workOrder) continue;
      map.set(threadId, workOrder);
    }
    return map;
  }, [workOrdersQuery.data?.items]);

  const activeWorkOrder = activeThreadId ? workOrderByThreadId.get(activeThreadId) ?? null : null;

  const lastInboundFrom = useMemo(() => {
    const messages = messagesQuery.data?.items ?? [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (String(m.direction || "").toLowerCase() !== "inbound") continue;
      if (m.fromEmail) return m.fromEmail;
    }
    return "";
  }, [messagesQuery.data?.items]);

  useEffect(() => {
    if (!activeThreadId) return;
    if (!lastInboundFrom) return;
    if (composeBody.trim()) return;
    setComposeTo(lastInboundFrom);
    setComposeSubject(ensureReplySubject(activeThread?.subject));
  }, [activeThread?.subject, activeThreadId, composeBody, lastInboundFrom]);

  const clearCompose = () => {
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
  };

  const provisionMutation = useMutation({
    mutationFn: async (agentKey: string) => {
      if (!tenantId) throw new Error("Tenant not resolved");
      return apiRequest(`/api/admin/tenants/${tenantId}/agents/${encodeURIComponent(agentKey)}/mailbox`, "POST", {});
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/tenants/${tenantId}/mailboxes`] });
      const password = (data as any)?.password;
      const email = (data as any)?.email;
      if (password && typeof email === "string") {
        setNewMailboxCredentials((prev) => [...prev, { email, password }]);
      }
      toast({
        title: "Mailbox provisioned",
        description: password ? `Password: ${password}` : "Mailbox already exists.",
      });
    },
    onError: (err) => {
      toast({ title: "Provision failed", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    },
  });

  const provisionAllMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Tenant not resolved");
      if (!agentKeys.length) throw new Error("No agents to provision");
      return apiRequest(`/api/admin/tenants/${tenantId}/mailboxes/bulk-provision`, "POST", { agents: agentKeys });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/tenants/${tenantId}/mailboxes`] });
      const items = Array.isArray((data as any)?.items) ? (data as any).items : [];
      const creds = items
        .map((it: any) => ({ email: it?.email, password: it?.password }))
        .filter((c: any) => typeof c.email === "string" && typeof c.password === "string" && c.password.trim());
      if (creds.length) {
        setNewMailboxCredentials((prev) => [...prev, ...creds]);
      }
      toast({ title: "Mailboxes provisioned", description: `${items.length} agent mailbox(es) processed.` });
    },
    onError: (err) => {
      toast({ title: "Bulk provision failed", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async (mailboxId: number) => apiRequest(`/api/admin/mailboxes/${mailboxId}/disable`, "POST", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/tenants/${tenantId}/mailboxes`] });
      toast({ title: "Mailbox disabled" });
    },
    onError: (err) => {
      toast({ title: "Disable failed", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!activeAgentKey) throw new Error("Select an agent");
      const to = normalizeCsv(composeTo);
      if (!to.length) throw new Error("Recipient required");
      const subject = composeSubject.trim();
      if (!subject) throw new Error("Subject required");
      const text = composeBody.trim();
      if (!text) throw new Error("Body required");
      return apiRequest("/api/email/send", "POST", {
        agent_id: activeAgentKey,
        to,
        subject,
        text,
      });
    },
    onSuccess: (payload: any) => {
      const requiresApproval = payload?.requiresApproval === true;
      toast({
        title: requiresApproval ? "Email queued (approval required)" : "Email queued",
        description: requiresApproval
          ? "An admin must approve this send in Actions → Decisions."
          : "This will be sent by the background Actions worker.",
      });
      setComposeBody("");
      queryClient.invalidateQueries({ queryKey: activeMailboxId ? [`/api/admin/mailboxes/${activeMailboxId}/threads?limit=100`] : ["__no_threads__"] });
      if (activeThreadId) queryClient.invalidateQueries({ queryKey: [`/api/admin/threads/${activeThreadId}/messages?limit=500`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email/send-logs?limit=20"] });
    },
    onError: (err) => {
      toast({ title: "Send failed", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    },
  });

  const sendTestMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Tenant not resolved");
      const to = normalizeCsv(testTo);
      if (!to.length) throw new Error("Recipient required");
      if (!agentKeys.length) throw new Error("No agents found");

      // Ensure mailboxes exist (best effort; will hard-fail if mail DB is not configured).
      const provisioned = await apiRequest(`/api/admin/tenants/${tenantId}/mailboxes/bulk-provision`, "POST", {
        agents: agentKeys,
      });
      const provisionedItems = Array.isArray((provisioned as any)?.items) ? (provisioned as any).items : [];
      const creds = provisionedItems
        .map((it: any) => ({ email: it?.email, password: it?.password }))
        .filter((c: any) => typeof c.email === "string" && typeof c.password === "string" && c.password.trim());

      const results: Array<{
        agent: string;
        ok: boolean;
        status?: string;
        actionRequestId?: number | null;
        requiresApproval?: boolean;
        error?: string;
      }> = [];
      for (const agent of agentKeys) {
        const subject = `Test email - ${agent} - ${tenant.key}`;
        const text = `Hello Vital,\n\nThis is a test email sent from agent "${agent}" for tenant "${tenant.key}" (${tenant.name}).\n\nTime: ${new Date().toISOString()}\n\n- Exportunity Mail Engine`;
        try {
          // eslint-disable-next-line no-await-in-loop
          const queued = await apiRequest("/api/email/send", "POST", { agent_id: agent, to, subject, text });
          const actionRequest = (queued as any)?.actionRequest ?? null;
          results.push({
            agent,
            ok: true,
            status: String(actionRequest?.status || "").trim() || undefined,
            actionRequestId: typeof actionRequest?.id === "number" ? actionRequest.id : null,
            requiresApproval: (queued as any)?.requiresApproval === true,
          });
        } catch (err: any) {
          const message = err instanceof Error ? err.message : String(err || "Send failed");
          results.push({ agent, ok: false, error: message });
        }
      }
      return { results, creds };
    },
    onSuccess: (payload) => {
      const results = payload?.results ?? [];
      const creds = payload?.creds ?? [];
      if (creds.length) {
        setNewMailboxCredentials((prev) => {
          const next = [...prev];
          for (const c of creds) {
            if (next.some((existing) => existing.email === c.email && existing.password === c.password)) continue;
            next.push(c);
          }
          return next;
        });
      }
      setTestResults(results);
      queryClient.invalidateQueries({ queryKey: [`/api/admin/tenants/${tenantId}/mailboxes`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email/send-logs?limit=20"] });
      const ok = results.filter((r: any) => r.ok).length;
      const fail = results.length - ok;
      toast({ title: "Test send queued", description: `${ok} queued, ${fail} failed.` });
    },
    onError: (err) => {
      toast({ title: "Test send failed", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Email Dashboard</h1>
          <p className="text-sm text-slate-400">
            Tenant: <span className="text-slate-200">{tenant.name}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={dashboardMode === "agents" ? "default" : "secondary"}
            onClick={() => setDashboardMode("agents")}
          >
            Agent inbox
          </Button>
          <Button
            variant={dashboardMode === "humans" ? "default" : "secondary"}
            onClick={() => setDashboardMode("humans")}
          >
            Human mailboxes
          </Button>
          <div className="w-px h-6 bg-slate-800 mx-1" />
          <Button variant="secondary" onClick={() => setLocation("/admin/dashboard")}>
            Dashboard
          </Button>
          <Button variant="secondary" onClick={() => setLocation("/ai-team")}>
            Operations Center
          </Button>
        </div>
      </div>

      {dashboardMode === "humans" ? (
        <AdminHumanEmailAccountsPanel />
      ) : (
        <>
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Quick setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {statusQuery.isError ? (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
              Unable to read mail configuration:{" "}
              {statusQuery.error instanceof Error ? statusQuery.error.message : "unknown error"}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge className="bg-slate-500/15 text-slate-200 border border-slate-500/30">
              Mail DB: {statusQuery.data?.mail?.mailDbConfigured ? "OK" : "missing MAIL_DATABASE_URL"}
            </Badge>
            <Badge className="bg-slate-500/15 text-slate-200 border border-slate-500/30">
              SMTP: {statusQuery.data?.mail?.smtpConfigured ? "OK" : "not configured"}
            </Badge>
            <Badge className="bg-slate-500/15 text-slate-200 border border-slate-500/30">
              Signature: {statusQuery.data?.mail?.signatureConfigured ? "OK" : "missing secret"}
            </Badge>
            <Badge className={statusQuery.data?.mail?.authDiagnostics?.spf?.ok ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-red-500/15 text-red-300 border border-red-500/30"}>
              SPF: {statusQuery.data?.mail?.authDiagnostics?.spf?.ok ? "pass" : "fail"}
            </Badge>
            <Badge className={statusQuery.data?.mail?.authDiagnostics?.dkim?.ok ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-red-500/15 text-red-300 border border-red-500/30"}>
              DKIM: {statusQuery.data?.mail?.authDiagnostics?.dkim?.ok ? "pass" : "fail"}
            </Badge>
            <Badge className={statusQuery.data?.mail?.authDiagnostics?.dmarc?.ok ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-amber-500/15 text-amber-300 border border-amber-500/30"}>
              DMARC: {statusQuery.data?.mail?.authDiagnostics?.dmarc?.ok ? "present" : "missing"}
            </Badge>
            <Badge className={statusQuery.data?.mail?.authDiagnostics?.ptr?.ok === false ? "bg-red-500/15 text-red-300 border border-red-500/30" : "bg-slate-500/15 text-slate-200 border border-slate-500/30"}>
              PTR: {statusQuery.data?.mail?.authDiagnostics?.ptr?.ok == null ? "n/a" : statusQuery.data?.mail?.authDiagnostics?.ptr?.ok ? "match" : "mismatch"}
            </Badge>
            <Badge className={statusQuery.data?.mail?.authDiagnostics?.trustedForOutbound ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-red-500/15 text-red-300 border border-red-500/30"}>
              Outbound trust: {statusQuery.data?.mail?.authDiagnostics?.trustedForOutbound ? "ready" : "blocked"}
            </Badge>
          </div>

          {(statusQuery.data?.mail?.authDiagnostics?.warnings?.length ?? 0) > 0 ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
              {statusQuery.data?.mail?.authDiagnostics?.warnings?.join(", ")}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void smtpProbeQuery.refetch()}
              disabled={smtpProbeQuery.isFetching}
            >
              {smtpProbeQuery.isFetching ? "Checking SMTP\u2026" : "Check SMTP TLS"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void placementQuery.refetch()}
              disabled={placementQuery.isFetching}
            >
              {placementQuery.isFetching ? "Checking placement\u2026" : "Check inbox placement"}
            </Button>

            {smtpProbeQuery.data?.probe ? (
              <Badge
                className={
                  smtpProbeQuery.data.probe.ok
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                    : "bg-red-500/15 text-red-300 border border-red-500/30"
                }
              >
                SMTP TLS: {smtpProbeQuery.data.probe.ok ? "ok" : "fail"}
              </Badge>
            ) : null}

            {placementQuery.data?.snapshot ? (
              <Badge
                className={
                  placementQuery.data.snapshot.ok && (placementQuery.data.snapshot.spamRate ?? 1) <= 0.2
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                }
              >
                Gmail spam rate:{" "}
                {placementQuery.data.snapshot.configured && typeof placementQuery.data.snapshot.spamRate === "number"
                  ? `${Math.round(placementQuery.data.snapshot.spamRate * 100)}%`
                  : "n/a"}
              </Badge>
            ) : null}
          </div>

          {smtpProbeQuery.data?.probe?.ok === false && smtpProbeQuery.data.probe.error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
              SMTP probe failed: {smtpProbeQuery.data.probe.error}
            </div>
          ) : null}
          {placementQuery.data?.snapshot?.ok === false && placementQuery.data.snapshot.error ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
              Placement probe: {placementQuery.data.snapshot.error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-slate-200">Test recipient</Label>
              <Input
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="vs@exportunity.net"
                className="bg-slate-950/40 border-slate-800 text-slate-100"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                onClick={() => sendTestMutation.mutate()}
                disabled={sendTestMutation.isPending || !tenantId}
              >
                Provision + Send tests
              </Button>
              <Button
                variant="secondary"
                onClick={() => provisionAllMutation.mutate()}
                disabled={provisionAllMutation.isPending || !tenantId}
              >
                Provision all
              </Button>
            </div>
            <div className="text-xs text-slate-400 flex items-end">
              Tip: provisioning requires <span className="font-mono">MAIL_DATABASE_URL</span>. Sending requires SMTP config +{" "}
              <span className="font-mono">MAIL_PLATFORM_SIGNATURE_SECRET</span>.
            </div>
          </div>
        </CardContent>
      </Card>

      {newMailboxCredentials.length ? (
        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">New mailbox passwords (copy now)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <ScrollArea className="h-[160px] pr-4">
              <div className="space-y-2">
                {newMailboxCredentials.map((c) => (
                  <div key={`${c.email}:${c.password}`} className="rounded-lg border border-slate-800 bg-slate-950/30 p-2">
                    <div className="text-xs text-slate-400">Email</div>
                    <div className="text-sm text-slate-100 font-mono break-all">{c.email}</div>
                    <div className="text-xs text-slate-400 mt-2">Password</div>
                    <div className="text-sm text-slate-100 font-mono break-all">{c.password}</div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <Button variant="secondary" size="sm" onClick={() => setNewMailboxCredentials([])}>
              Clear
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {testResults.length ? (
        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Test send results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {testResults.map((r) => (
                <div key={r.agent} className="rounded-lg border border-slate-800 bg-slate-950/30 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-slate-100 font-medium">{r.agent}</div>
                    {r.ok ? (
                      <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        {r.requiresApproval ? "approval" : "queued"}
                      </Badge>
                    ) : (
                      <Badge className="bg-red-500/15 text-red-300 border border-red-500/30">failed</Badge>
                    )}
                  </div>
                  {r.actionRequestId ? (
                    <div className="text-xs text-slate-500 mt-1">action #{r.actionRequestId}</div>
                  ) : null}
                  {r.error ? <div className="text-xs text-slate-400 mt-1 break-words">{r.error}</div> : null}
                </div>
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={() => setTestResults([])}>
              Clear
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Recent delivery status</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[180px] pr-4">
            <div className="space-y-2">
              {(sendLogsQuery.data?.items ?? []).length === 0 ? (
                <div className="text-sm text-slate-400">No outbound logs yet.</div>
              ) : (
                (sendLogsQuery.data?.items ?? []).map((log) => {
                  const statusMeta = getDeliveryStatusMeta(log.status);
                  const response = (log.providerResponse || {}) as Record<string, unknown>;
                  const queueId = readString(response.queueId);
                  const deliveryStatus = readString(response.deliveryStatus);
                  const effectiveLabel = deliveryStatus ? getDeliveryStatusMeta(deliveryStatus).label : statusMeta.label;
                  return (
                    <div key={log.id} className="rounded-lg border border-slate-800 bg-slate-950/30 p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs text-slate-400 truncate">{log.subject || "(no subject)"}</div>
                          <div className="text-xs text-slate-500 truncate">From {log.resolvedFromEmail}</div>
                          <div className="text-xs text-slate-500 truncate">To {(log.toJson || []).join(", ")}</div>
                        </div>
                        <Badge className={statusMeta.className}>{effectiveLabel}</Badge>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 flex flex-wrap gap-2">
                        <span>{new Date(log.createdAt).toLocaleString()}</span>
                        {queueId ? <span>queue {queueId}</span> : null}
                        {log.providerMessageId ? <span>msgid {log.providerMessageId}</span> : null}
                        {log.error ? <span className="text-red-300">{log.error}</span> : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Agent mailboxes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!tenantId ? (
              <div className="text-sm text-slate-400">Resolving tenant...</div>
            ) : agentsQuery.isLoading ? (
              <div className="text-sm text-slate-400">Loading agents...</div>
            ) : agentsQuery.isError ? (
              <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                Unable to load agents:{" "}
                {agentsQuery.error instanceof Error ? agentsQuery.error.message : "unknown error"}
              </div>
            ) : agentKeys.length === 0 ? (
              <div className="text-sm text-slate-400">No agents found.</div>
            ) : (
              <ScrollArea className="h-[520px] pr-4">
                <div className="space-y-2">
                  {agentKeys.map((key) => {
                    const mailbox = mailboxByAgent.get(key.toLowerCase()) ?? null;
                    const isSelected = key === activeAgentKey;
                    return (
                      <button
                        key={key}
                        className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                          isSelected
                            ? "border-amber-500/60 bg-amber-500/10"
                            : "border-slate-800 bg-slate-950/30 hover:bg-slate-900/40"
                        }`}
                        onClick={() => {
                          setSelectedAgentKey(key);
                          setSelectedThreadId(null);
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm text-slate-100 font-medium">{key}</div>
                          {mailbox ? (
                            mailbox.isEnabled ? (
                              <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">enabled</Badge>
                            ) : (
                              <Badge className="bg-red-500/15 text-red-300 border border-red-500/30">disabled</Badge>
                            )
                          ) : (
                            <Badge className="bg-slate-500/15 text-slate-200 border border-slate-500/30">missing</Badge>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-1 truncate">
                          {mailbox ? mailbox.email : "Not provisioned yet"}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          {mailbox ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                disableMutation.mutate(mailbox.id);
                              }}
                              disabled={!mailbox.isEnabled || disableMutation.isPending}
                            >
                              Disable
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                provisionMutation.mutate(key);
                              }}
                              disabled={provisionMutation.isPending}
                            >
                              Provision
                            </Button>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Inbox / Threads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!activeMailbox ? (
              <div className="text-sm text-slate-400">Provision a mailbox to view threads.</div>
            ) : (
              <ScrollArea className="h-[520px] pr-4">
                <div className="space-y-2">
                  {threads.length === 0 ? (
                    <div className="text-sm text-slate-400">No threads indexed yet. Run `npm run mail:index` on the mail server.</div>
                  ) : (
                    threads.map((t) => {
                      const selected = t.id === activeThreadId;
                      const workOrder = workOrderByThreadId.get(t.id) ?? null;
                      const dueLabel = workOrder ? formatDueLabel(workOrder.dueAt) : null;
                      const isOverdue = dueLabel?.startsWith("overdue") ?? false;
                      return (
                        <button
                          key={t.id}
                          className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                            selected
                              ? "border-sky-500/60 bg-sky-500/10"
                              : "border-slate-800 bg-slate-950/30 hover:bg-slate-900/40"
                          }`}
                          onClick={() => setSelectedThreadId(t.id)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm text-slate-100 font-medium truncate">
                                {t.subject || "(no subject)"}
                              </div>
                              <div className="text-xs text-slate-400 mt-1">
                                Last: {new Date(t.lastMessageAt).toLocaleString()}
                              </div>
                              {workOrder ? (
                                <div className="text-xs text-slate-400 mt-1 truncate">
                                  From: <span className="text-slate-200">{workOrder.senderEmail}</span>
                                </div>
                              ) : null}
                            </div>
                            {workOrder ? (
                              <Badge
                                className={
                                  isOverdue
                                    ? "bg-red-500/15 text-red-300 border border-red-500/30"
                                    : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                }
                              >
                                {dueLabel ?? "reply required"}
                              </Badge>
                            ) : null}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Thread</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeMailbox ? (
              <>
                <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
                  <div className="text-xs text-slate-400">Mailbox</div>
                  <div className="text-sm text-slate-100 truncate">{activeMailbox.email}</div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                    {activeMailbox.approvalRequired ? (
                      <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/30">approval required</Badge>
                    ) : (
                      <Badge className="bg-slate-500/15 text-slate-200 border border-slate-500/30">auto ok</Badge>
                    )}
                    {activeMailbox.dailyOutboundLimit > 0 ? (
                      <span>limit {activeMailbox.dailyOutboundLimit}/day</span>
                    ) : (
                      <span>no daily limit</span>
                    )}
                  </div>
                </div>

                {activeWorkOrder ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-amber-200">Reply required</div>
                        <div className="text-xs text-slate-200/70 mt-0.5 truncate">
                          From <span className="text-slate-100">{activeWorkOrder.senderEmail}</span>
                          {formatDueLabel(activeWorkOrder.dueAt) ? (
                            <span> ? {formatDueLabel(activeWorkOrder.dueAt)}</span>
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
                      <div className="text-sm text-slate-400">Loading...</div>
                    ) : (messagesQuery.data?.items?.length ?? 0) === 0 ? (
                      <div className="text-sm text-slate-400">No messages in this thread yet.</div>
                    ) : (
                      (messagesQuery.data?.items ?? []).map((m) => (
                        <div key={m.id} className="rounded-lg border border-slate-800 bg-slate-900/30 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-slate-400 truncate min-w-0">
                              {m.direction === "outbound" ? "To" : "From"}:{" "}
                              <span className="text-slate-200">
                                {m.direction === "outbound" ? (m.toJson || []).join(", ") : m.fromEmail}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {m.direction === "outbound" ? (
                                <Badge className={getDeliveryStatusMeta(readDeliveryTrace(m.metadata || {}).deliveryStatus || m.status).className}>
                                  {getDeliveryStatusMeta(readDeliveryTrace(m.metadata || {}).deliveryStatus || m.status).label}
                                </Badge>
                              ) : null}
                              <div className="text-xs text-slate-500">{new Date(m.createdAt).toLocaleString()}</div>
                            </div>
                          </div>
                          {m.textBody ? (
                            <div className="text-sm text-slate-100 mt-2 whitespace-pre-wrap">{m.textBody}</div>
                          ) : m.htmlBody ? (
                            <div className="text-sm text-slate-100 mt-2">(HTML body indexed)</div>
                          ) : null}
                          {m.direction === "outbound" ? (
                            <div className="mt-2 text-[11px] text-slate-500 flex flex-wrap gap-2">
                              {readDeliveryTrace(m.metadata || {}).queueId ? <span>queue {readDeliveryTrace(m.metadata || {}).queueId}</span> : null}
                              {m.messageId ? <span>msgid {m.messageId}</span> : null}
                              {readDeliveryTrace(m.metadata || {}).error ? (
                                <span className="text-red-300">{readDeliveryTrace(m.metadata || {}).error}</span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>

                <div className="space-y-2">
                  <Label className="text-slate-200">Compose</Label>
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
                        Send
                      </Button>
                      <Button variant="secondary" onClick={clearCompose} disabled={sendMutation.isPending}>
                        Clear
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-400">Select/provision an agent mailbox.</div>
            )}
          </CardContent>
        </Card>
      </div>
        </>
      )}
    </div>
  );
}
