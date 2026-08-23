import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Activity,
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  FileCheck2,
  History,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { resolveApiUrl } from "@/lib/runtimeConfig";

type ActionReceipt = {
  id?: number | null;
  receiptType?: string | null;
  entityType?: string | null;
  entityIds?: Array<string | number>;
  affectedRows?: number | null;
  createdAt?: string | null;
};

type ActionItem = {
  id: number;
  publicActionId?: string;
  actionType?: string;
  status?: string;
  state?: string;
  mode?: string;
  payload?: Record<string, any>;
  requestedByAgentKey?: string | null;
  createdAt?: string;
  updatedAt?: string;
  trace?: {
    conversationId?: string | null;
    source?: string | null;
    correlationId?: string | null;
  };
  evidence?: {
    outcome?: string | null;
    receipt_count?: number;
    receipts?: ActionReceipt[];
  };
  diagnostics?: {
    failureReason?: string | null;
    deliveryStatus?: string | null;
  };
};

type QueueResponse = { ok: boolean; items: ActionItem[] };
type RunnerResponse = {
  ok: boolean;
  runner?: { running?: boolean; healthy?: boolean; lastRunAt?: string | null; lastError?: string | null };
};
type ForgeRequest = {
  id: string | number;
  desired_action_key?: string;
  desired_description?: string | null;
  desired_entity?: string | null;
  status?: string;
  pr_url?: string | null;
  error_log?: string | null;
  updated_at?: string;
  created_at?: string;
};
type ForgeResponse = { ok: boolean; items: ForgeRequest[] };
type ForgeEvent = {
  id: string | number;
  status_from?: string | null;
  status_to?: string | null;
  notes?: string | null;
  created_at?: string;
};
type ForgeDetailResponse = { ok: boolean; request: ForgeRequest; events: ForgeEvent[] };
type ActionsTab = "queue" | "decisions" | "automations";

const ACTIVE_STATES = new Set(["CREATED", "QUEUED", "RUNNING", "PENDING"]);

function normalize(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function actionState(item: ActionItem) {
  return normalize(item.state || item.status || "CREATED");
}

function actionTitle(item: ActionItem) {
  const payload = item.payload || {};
  return String(
    payload.title ||
      payload.subject ||
      payload.shopName ||
      payload.displayName ||
      item.actionType ||
      "Operational action",
  ).trim();
}

function actionTypeLabel(value: unknown) {
  return String(value || "ACTION")
    .trim()
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function actionDetail(item: ActionItem) {
  const payload = item.payload || {};
  if (payload.description && payload.description !== payload.title) return String(payload.description);
  if (Array.isArray(payload.to) && payload.to.length) return `Recipient: ${payload.to.join(", ")}`;
  if (payload.sourceMeetingId) return `Created from meeting #${payload.sourceMeetingId}`;
  if (item.trace?.conversationId) return `Conversation: ${item.trace.conversationId}`;
  if (item.diagnostics?.failureReason) return item.diagnostics.failureReason;
  return "Recorded in the Exportunity action ledger.";
}

function statusClasses(state: string) {
  if (state === "SUCCEEDED" || state === "DONE") return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";
  if (state === "FAILED") return "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200";
  if (state === "REQUIRES_APPROVAL") return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100";
  if (state === "RUNNING") return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200";
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";
}

function dateLabel(value?: string) {
  if (!value) return "Time unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Time unavailable";
  return format(parsed, "MMM d, yyyy, HH:mm");
}

function buildActionKeyFromPrompt(input: string) {
  const normalized = String(input || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (normalized || "AUTOMATION_REQUEST").slice(0, 64);
}

function initialActionsTab(): ActionsTab {
  if (typeof window === "undefined") return "queue";
  const requested = new URLSearchParams(window.location.search).get("view");
  return requested === "decisions" || requested === "automations" ? requested : "queue";
}

function forgeStatusClasses(status: string) {
  if (status === "PUBLISHED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "APPROVED") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "NEEDS_REVIEW") return "border-amber-300 bg-amber-50 text-amber-900";
  if (status === "REJECTED") return "border-red-200 bg-red-50 text-red-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function redactForgeText(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return "No note recorded";
  return text
    .replace(/\b(authorization)(\s*[:=]\s*)(?:(?:Bearer|Basic)\s+)?[^\s,;]+/gi, "$1$2[REDACTED]")
    .replace(/\b(api[-_]?key|secret|token|password|cookie|pin|cvv|cvc)(\s*[:=]\s*)[^\s,;]+/gi, "$1$2[REDACTED]")
    .replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, "$1 [REDACTED]");
}

function ActionRecord({
  item,
  onApprove,
  onDeny,
  busy,
}: {
  item: ActionItem;
  onApprove: (id: number) => void;
  onDeny: (id: number) => void;
  busy: boolean;
}) {
  const state = actionState(item);
  const receipts = Array.isArray(item.evidence?.receipts) ? item.evidence!.receipts! : [];
  const needsApproval = state === "REQUIRES_APPROVAL" || normalize(item.status) === "REQUIRES_APPROVAL";

  return (
    <article className="border-b border-slate-200 px-4 py-4 last:border-b-0 dark:border-slate-800 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={statusClasses(state)}>{state.replace(/_/g, " ")}</Badge>
            <span className="text-xs font-semibold uppercase text-[#a76700] dark:text-[#f5a623]">
              {actionTypeLabel(item.actionType)}
            </span>
            {item.mode === "SIMULATED" ? <Badge variant="secondary">Dry run</Badge> : null}
          </div>
          <h3 className="break-words text-sm font-semibold text-slate-950 dark:text-white sm:text-base">{actionTitle(item)}</h3>
          <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">{actionDetail(item)}</p>
        </div>
        {needsApproval ? (
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              className="bg-[#f5a623] text-[#07121f] hover:bg-[#e59a18]"
              disabled={busy}
              onClick={() => onApprove(item.id)}
            >
              <Check className="mr-1.5 h-4 w-4" /> Approve
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onDeny(item.id)}>
              <X className="mr-1.5 h-4 w-4" /> Deny
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-mono">{item.publicActionId || `ACT-${item.id}`}</span>
        <span>{dateLabel(item.createdAt)}</span>
        {item.requestedByAgentKey ? <span>Agent: {item.requestedByAgentKey}</span> : null}
        {item.trace?.source ? <span>Source: {item.trace.source}</span> : null}
        <span>{item.evidence?.receipt_count || receipts.length} receipt(s)</span>
        <a
          className="font-medium text-[#9a6200] underline-offset-4 hover:underline dark:text-[#f5a623]"
          href={resolveApiUrl(`/api/admin/actions/${item.id}/events`)}
          target="_blank"
          rel="noreferrer"
        >
          Audit trail
        </a>
      </div>

      {item.diagnostics?.failureReason ? (
        <div className="mt-3 flex gap-2 border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{item.diagnostics.failureReason}</span>
        </div>
      ) : null}
    </article>
  );
}

export function ActionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<ActionsTab>(initialActionsTab);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [automationPrompt, setAutomationPrompt] = useState("");
  const [automationEntity, setAutomationEntity] = useState("operations");
  const [selectedForgeId, setSelectedForgeId] = useState<string | null>(null);
  const [forgeDecisionNote, setForgeDecisionNote] = useState("");

  const queueQuery = useQuery<QueueResponse>({
    queryKey: ["/api/actions/queue?limit=200"],
    queryFn: () => apiRequest("/api/actions/queue?limit=200", "GET"),
    refetchInterval: 5_000,
  });
  const decisionsQuery = useQuery<QueueResponse>({
    queryKey: ["/api/actions/decisions?limit=200"],
    queryFn: () => apiRequest("/api/actions/decisions?limit=200", "GET"),
    refetchInterval: 5_000,
  });
  const runnerQuery = useQuery<RunnerResponse>({
    queryKey: ["/api/actions/status"],
    queryFn: () => apiRequest("/api/actions/status", "GET"),
    refetchInterval: 10_000,
  });
  const forgeQuery = useQuery<ForgeResponse>({
    queryKey: ["/api/action-forge/requests"],
    queryFn: () => apiRequest("/api/action-forge/requests", "GET"),
  });
  const forgeDetailQuery = useQuery<ForgeDetailResponse>({
    queryKey: selectedForgeId ? [`/api/action-forge/requests/${selectedForgeId}`] : ["__no_forge_detail__"],
    queryFn: () => apiRequest(`/api/action-forge/requests/${selectedForgeId}`, "GET"),
    enabled: Boolean(selectedForgeId),
    staleTime: 8_000,
  });

  const refreshActionQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/actions/queue?limit=200"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/actions/decisions?limit=200"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/actions/status"] }),
    ]);
  };

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/actions/${id}/approve`, "POST", {}),
    onSuccess: async () => {
      toast({ title: "Action approved", description: "The action is queued with its audit trail." });
      await refreshActionQueries();
    },
    onError: (error: any) => toast({ title: "Approval failed", description: error?.message || "The action was not approved.", variant: "destructive" }),
  });

  const denyMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/actions/${id}/deny`, "POST", {}),
    onSuccess: async () => {
      toast({ title: "Action denied", description: "No execution will occur." });
      await refreshActionQueries();
    },
    onError: (error: any) => toast({ title: "Denial failed", description: error?.message || "The action was not denied.", variant: "destructive" }),
  });

  const automationMutation = useMutation({
    mutationFn: () => apiRequest("/api/action-forge/requests", "POST", {
      desiredActionKey: buildActionKeyFromPrompt(automationPrompt),
      desiredDescription: automationPrompt.trim(),
      desiredEntity: automationEntity,
    }),
    onSuccess: async () => {
      setAutomationOpen(false);
      setAutomationPrompt("");
      toast({ title: "Automation proposed", description: "The request is visible for technical review; it is not active yet." });
      await queryClient.invalidateQueries({ queryKey: ["/api/action-forge/requests"] });
    },
    onError: (error: any) => toast({ title: "Request failed", description: error?.message || "The automation request could not be created.", variant: "destructive" }),
  });

  const forgeTransitionMutation = useMutation({
    mutationFn: (input: { id: string; action: "approve" | "reject" | "publish"; note: string }) =>
      apiRequest(
        `/api/action-forge/${input.id}/${input.action}`,
        "POST",
        input.action === "reject" ? { reason: input.note } : { notes: input.note || undefined },
      ),
    onSuccess: async (_response, input) => {
      setForgeDecisionNote("");
      toast({
        title: input.action === "approve" ? "Automation approved" : input.action === "reject" ? "Automation rejected" : "Automation published",
        description: input.action === "publish" ? "The approved action key was added to the governed registry." : "The decision was added to the request history.",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/action-forge/requests"] }),
        queryClient.invalidateQueries({ queryKey: [`/api/action-forge/requests/${input.id}`] }),
      ]);
    },
    onError: (error: any) => toast({ title: "Decision failed", description: error?.message || "The request was not changed.", variant: "destructive" }),
  });

  const queue = Array.isArray(queueQuery.data?.items) ? queueQuery.data!.items : [];
  const decisions = Array.isArray(decisionsQuery.data?.items) ? decisionsQuery.data!.items : [];
  const forgeRequests = Array.isArray(forgeQuery.data?.items) ? forgeQuery.data!.items : [];

  useEffect(() => {
    if (!forgeRequests.length) {
      setSelectedForgeId(null);
      return;
    }
    if (!selectedForgeId || !forgeRequests.some((item) => String(item.id) === selectedForgeId)) {
      setSelectedForgeId(String(forgeRequests[0].id));
    }
  }, [forgeRequests, selectedForgeId]);

  const selectedForgeRequest = forgeDetailQuery.data?.request || forgeRequests.find((item) => String(item.id) === selectedForgeId) || null;
  const selectedForgeStatus = normalize(selectedForgeRequest?.status || "REQUESTED");
  const canApproveForge = selectedForgeStatus === "NEEDS_REVIEW";
  const canRejectForge = Boolean(selectedForgeRequest && !["PUBLISHED", "REJECTED"].includes(selectedForgeStatus));
  const canPublishForge = selectedForgeStatus === "APPROVED";

  const confirmForgeTransition = (action: "approve" | "reject" | "publish") => {
    if (!selectedForgeId || !selectedForgeRequest) return;
    const note = forgeDecisionNote.trim();
    if (action === "reject" && !note) {
      toast({ title: "Rejection reason required", description: "Record why this automation must not proceed.", variant: "destructive" });
      return;
    }
    if (action === "publish" && selectedForgeStatus !== "APPROVED") return;
    const actionKey = selectedForgeRequest.desired_action_key || "this automation";
    const prompt = action === "approve"
      ? `Approve ${actionKey} for the governed registry review stage? This does not publish it.`
      : action === "reject"
        ? `Reject ${actionKey} and record the supplied reason?`
        : `Publish ${actionKey} to the action registry? This changes the server-side registry and cannot be treated as a draft.`;
    if (window.confirm(prompt)) forgeTransitionMutation.mutate({ id: selectedForgeId, action, note });
  };

  const stats = useMemo(() => ({
    active: queue.filter((item) => ACTIVE_STATES.has(actionState(item))).length,
    review: decisions.length,
    completed: queue.filter((item) => ["DONE", "SUCCEEDED"].includes(actionState(item))).length,
    failed: queue.filter((item) => actionState(item) === "FAILED").length,
  }), [queue, decisions.length]);

  const filteredQueue = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return queue.filter((item) => {
      const state = actionState(item);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && ACTIVE_STATES.has(state)) ||
        (statusFilter === "review" && state === "REQUIRES_APPROVAL") ||
        (statusFilter === "completed" && ["DONE", "SUCCEEDED"].includes(state)) ||
        (statusFilter === "failed" && state === "FAILED");
      if (!matchesStatus) return false;
      if (!term) return true;
      return `${item.publicActionId || ""} ${item.actionType || ""} ${actionTitle(item)} ${actionDetail(item)}`
        .toLowerCase()
        .includes(term);
    });
  }, [queue, searchQuery, statusFilter]);

  const runnerHealthy = Boolean(runnerQuery.data?.runner?.healthy || runnerQuery.data?.runner?.running);
  const mutationBusy = approveMutation.isPending || denyMutation.isPending;
  const statCards: Array<{ label: string; value: number; Icon: LucideIcon }> = [
    { label: "Active", value: stats.active, Icon: Clock3 },
    { label: "Needs review", value: stats.review, Icon: ShieldCheck },
    { label: "Completed", value: stats.completed, Icon: CheckCircle2 },
    { label: "Failed", value: stats.failed, Icon: AlertCircle },
  ];

  return (
    <div className="min-h-full bg-[#f7f8fa] text-slate-950 dark:bg-[#07121f] dark:text-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-[#9a6200] dark:text-[#f5a623]">
              <Zap className="h-4 w-4" /> Operations
            </div>
            <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">Action ledger</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
              Real agent requests, approvals, execution states, receipts, and failures. Nothing shown here is simulated history.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={runnerHealthy ? statusClasses("SUCCEEDED") : statusClasses("FAILED")}>
              <Activity className="mr-1.5 h-3.5 w-3.5" /> {runnerHealthy ? "Runner healthy" : "Runner needs attention"}
            </Badge>
            <Button className="bg-[#f5a623] text-[#07121f] hover:bg-[#e59a18]" onClick={() => setAutomationOpen(true)}>
              <Sparkles className="mr-2 h-4 w-4" /> Propose automation
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-px overflow-hidden border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 sm:grid-cols-4">
          {statCards.map(({ label, value, Icon }) => (
            <div key={label} className="bg-white px-4 py-4 dark:bg-[#0a1628]">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Icon className="h-4 w-4" /> {label}
              </div>
              <div className="mt-1 text-2xl font-semibold">{value}</div>
            </div>
          ))}
        </section>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ActionsTab)} className="mt-6">
          <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border-b border-slate-200 bg-transparent p-0 dark:border-slate-800">
            <TabsTrigger value="queue" className="rounded-none border-b-2 border-transparent px-3 py-3 text-xs text-slate-500 data-[state=active]:border-[#f5a623] data-[state=active]:bg-transparent data-[state=active]:text-slate-950 dark:text-slate-400 dark:data-[state=active]:text-white sm:px-4 sm:text-sm">Work queue</TabsTrigger>
            <TabsTrigger value="decisions" className="rounded-none border-b-2 border-transparent px-3 py-3 text-xs text-slate-500 data-[state=active]:border-[#f5a623] data-[state=active]:bg-transparent data-[state=active]:text-slate-950 dark:text-slate-400 dark:data-[state=active]:text-white sm:px-4 sm:text-sm">Approvals ({decisions.length})</TabsTrigger>
            <TabsTrigger value="automations" aria-label="Automation requests" className="rounded-none border-b-2 border-transparent px-3 py-3 text-xs text-slate-500 data-[state=active]:border-[#f5a623] data-[state=active]:bg-transparent data-[state=active]:text-slate-950 dark:text-slate-400 dark:data-[state=active]:text-white sm:px-4 sm:text-sm">Automations</TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="mt-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="bg-white pl-9 dark:bg-[#0a1628]" placeholder="Search action ID, type, task, or source" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full bg-white dark:bg-[#0a1628] sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All states</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="review">Needs review</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="overflow-hidden border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0a1628]">
              {queueQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading the action ledger</div>
              ) : filteredQueue.length ? filteredQueue.map((item) => (
                <ActionRecord key={item.id} item={item} busy={mutationBusy} onApprove={(id) => approveMutation.mutate(id)} onDeny={(id) => denyMutation.mutate(id)} />
              )) : (
                <div className="px-4 py-16 text-center"><History className="mx-auto h-7 w-7 text-slate-400" /><p className="mt-3 text-sm font-medium">No matching action records</p><p className="mt-1 text-xs text-slate-500">Approved meeting work and agent tool requests appear here.</p></div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="decisions" className="mt-4">
            <div className="mb-3 border-l-2 border-[#f5a623] bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
              External communications, persistent automations, and other governed effects wait here for a human decision.
            </div>
            <div className="overflow-hidden border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0a1628]">
              {decisionsQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading approvals</div>
              ) : decisions.length ? decisions.map((item) => (
                <ActionRecord key={item.id} item={item} busy={mutationBusy} onApprove={(id) => approveMutation.mutate(id)} onDeny={(id) => denyMutation.mutate(id)} />
              )) : (
                <div className="px-4 py-16 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-emerald-600" /><p className="mt-3 text-sm font-medium">No approvals waiting</p><p className="mt-1 text-xs text-slate-500">The governed queue is clear.</p></div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="automations" className="mt-4">
            <div data-testid="exportunity-automation-governance" className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,.9fr)_minmax(360px,1.1fr)]">
              <section className="min-w-0 overflow-hidden border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0a1628]">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                  <h2 className="text-sm font-semibold">Automation request registry</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Proposals are database records only. They remain inactive until implementation, testing, approval, and publication are separately recorded.</p>
                </div>
                {forgeQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading requests</div>
                ) : forgeQuery.isError ? (
                  <div className="px-5 py-12 text-center text-sm text-red-700">Automation requests could not be loaded.</div>
                ) : forgeRequests.length ? forgeRequests.map((request) => {
                  const requestStatus = normalize(request.status || "REQUESTED");
                  const active = String(request.id) === selectedForgeId;
                  return (
                    <button
                      key={request.id}
                      type="button"
                      onClick={() => setSelectedForgeId(String(request.id))}
                      className={`block w-full border-b border-slate-200 px-5 py-4 text-left transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#f5a623] dark:border-slate-800 ${active ? "border-l-4 border-l-[#f5a623] bg-amber-50/70 dark:bg-amber-950/20" : "hover:bg-slate-50 dark:hover:bg-slate-900"}`}
                    >
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold uppercase text-[#9a6200] dark:text-[#f5a623]">{request.desired_action_key || "Automation request"}</div>
                          <div className="mt-1 line-clamp-2 text-sm font-medium">{request.desired_description || "Technical specification required"}</div>
                        </div>
                        <Badge variant="outline" className={forgeStatusClasses(requestStatus)}>{requestStatus.replace(/_/g, " ")}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500"><span>Entity: {request.desired_entity || "operations"}</span><span>{dateLabel(request.created_at)}</span></div>
                    </button>
                  );
                }) : (
                  <div className="px-4 py-16 text-center"><Sparkles className="mx-auto h-7 w-7 text-slate-400" /><p className="mt-3 text-sm font-medium">No automation requests</p><p className="mt-1 text-xs text-slate-500">Proposals remain inactive until reviewed and implemented.</p></div>
                )}
              </section>

              <section className="min-w-0 border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0a1628]">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                  <h2 className="text-sm font-semibold">Governance decision</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Approval and publication are distinct, attributable steps. Publication is available only after an approved state.</p>
                </div>
                {!selectedForgeRequest ? (
                  <div className="px-5 py-16 text-center text-sm text-slate-500">Select an automation request.</div>
                ) : forgeDetailQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading request history</div>
                ) : forgeDetailQuery.isError ? (
                  <div className="px-5 py-12 text-center text-sm text-red-700">The request detail could not be loaded.</div>
                ) : (
                  <div className="space-y-5 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0"><div className="break-words font-mono text-sm font-semibold text-slate-950 dark:text-white">{selectedForgeRequest.desired_action_key || "Automation request"}</div><div className="mt-1 text-xs text-slate-500">Entity: {selectedForgeRequest.desired_entity || "operations"} · updated {dateLabel(selectedForgeRequest.updated_at || selectedForgeRequest.created_at)}</div></div>
                      <Badge variant="outline" className={forgeStatusClasses(selectedForgeStatus)}>{selectedForgeStatus.replace(/_/g, " ")}</Badge>
                    </div>
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{selectedForgeRequest.desired_description || "No description recorded."}</p>
                    {selectedForgeRequest.pr_url ? <div className="border-l-2 border-blue-500 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:bg-blue-950/30 dark:text-blue-100">A review artifact is recorded for this request. Server filesystem paths are intentionally not exposed here.</div> : null}
                    {selectedForgeRequest.error_log ? <div className="border-l-2 border-red-500 bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950/30 dark:text-red-200">{redactForgeText(selectedForgeRequest.error_log)}</div> : null}
                    <div className="space-y-2">
                      <Label htmlFor="forge-decision-note">Decision note {canRejectForge ? "(required for rejection)" : ""}</Label>
                      <Textarea id="forge-decision-note" value={forgeDecisionNote} onChange={(event) => setForgeDecisionNote(event.target.value)} rows={3} placeholder="Record the operational or technical basis for this decision." className="border-slate-300 bg-white text-slate-950 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" className="bg-[#f5a623] text-[#07121f] hover:bg-[#e59a18]" disabled={!canApproveForge || forgeTransitionMutation.isPending} onClick={() => confirmForgeTransition("approve")}><Check className="mr-1.5 h-4 w-4" /> Approve review</Button>
                        <Button size="sm" variant="outline" className="border-red-300 bg-white text-red-800 hover:bg-red-50 dark:bg-transparent" disabled={!canRejectForge || forgeTransitionMutation.isPending} onClick={() => confirmForgeTransition("reject")}><X className="mr-1.5 h-4 w-4" /> Reject</Button>
                        <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={!canPublishForge || forgeTransitionMutation.isPending} onClick={() => confirmForgeTransition("publish")}><FileCheck2 className="mr-1.5 h-4 w-4" /> Publish approved key</Button>
                      </div>
                      {!canApproveForge && !canPublishForge && selectedForgeStatus !== "PUBLISHED" && selectedForgeStatus !== "REJECTED" ? <p className="text-xs leading-5 text-slate-500">Technical implementation and testing must advance this request to Needs Review before an administrator can approve it.</p> : null}
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recorded history</div>
                      <div className="max-h-64 space-y-2 overflow-y-auto">
                        {(forgeDetailQuery.data?.events || []).length ? (forgeDetailQuery.data?.events || []).map((event) => (
                          <div key={event.id} className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900">
                            <div className="font-medium text-slate-800 dark:text-slate-100">{normalize(event.status_from || "START").replace(/_/g, " ")} → {normalize(event.status_to || "RECORDED").replace(/_/g, " ")}</div>
                            <div className="mt-1 text-slate-600 dark:text-slate-300">{redactForgeText(event.notes)}</div>
                            <div className="mt-1 text-slate-500">{dateLabel(event.created_at)}</div>
                          </div>
                        )) : <div className="py-4 text-xs text-slate-500">No transition history recorded.</div>}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={automationOpen} onOpenChange={setAutomationOpen}>
        <DialogContent className="bg-white text-slate-950 dark:bg-[#0a1628] dark:text-white">
          <DialogHeader>
            <DialogTitle>Propose an automation</DialogTitle>
            <DialogDescription>Describe the repeatable outcome. This creates a visible technical request, not an active background process.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label htmlFor="automation-description">Required outcome</Label><Textarea id="automation-description" value={automationPrompt} onChange={(event) => setAutomationPrompt(event.target.value)} rows={5} placeholder="Example: Every Monday, prepare an internal supplier pipeline review for approval." className="border-slate-300 bg-white text-slate-950 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></div>
            <div className="space-y-2"><Label>Area</Label><Select value={automationEntity} onValueChange={setAutomationEntity}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="operations">Operations</SelectItem><SelectItem value="sourcing">Sourcing</SelectItem><SelectItem value="sales">Sales</SelectItem><SelectItem value="finance">Finance</SelectItem><SelectItem value="compliance">Compliance</SelectItem></SelectContent></Select></div>
            <div className="flex gap-2 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600 dark:bg-slate-900 dark:text-slate-300"><FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-[#b97500]" /><span>Activation requires implementation, testing, and an explicit production approval. No external contact is initiated here.</span></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAutomationOpen(false)}>Cancel</Button><Button className="bg-[#f5a623] text-[#07121f] hover:bg-[#e59a18]" disabled={!automationPrompt.trim() || automationMutation.isPending} onClick={() => automationMutation.mutate()}>{automationMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Create request</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ActionsPage;
