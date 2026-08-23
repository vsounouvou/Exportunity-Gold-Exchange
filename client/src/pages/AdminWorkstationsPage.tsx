import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  ExternalLink,
  FileClock,
  HardDrive,
  ListChecks,
  Monitor,
  Network,
  Play,
  Power,
  RefreshCw,
  Server,
  Shield,
  TerminalSquare,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type WorkstationStatus = "RUNNING" | "CREATING" | "STOPPED" | "FAILED" | "DESTROYED" | string;
type NetworkPolicyMode = "DEFAULT_DENY" | "ALLOWLIST" | "FULL_EGRESS";

type Workstation = {
  id: string;
  agent_id: number;
  agent_name: string | null;
  agent_role: string | null;
  agent_department_key?: string | null;
  agent_manager_name?: string | null;
  status: WorkstationStatus;
  network_policy_mode: NetworkPolicyMode;
  active_session_id?: string | null;
  updated_at: string;
  failureReason?: string | null;
};

type WorkstationsResponse = {
  items: Workstation[];
  statusCounts?: Record<string, number>;
};

type WorkstationEvent = {
  id: string;
  event_type: string;
  created_at: string;
  command?: string | null;
  event_payload_json?: Record<string, unknown>;
};

type WorkstationSession = {
  id: string;
  session_type: string;
  started_at: string;
  ended_at: string | null;
  ip: string | null;
};

type WorkstationArtifact = {
  id: string;
  type: string;
  storage_key: string;
  url: string | null;
  created_at: string;
};

type AgentOption = {
  id: number;
  name: string;
  role?: string | null;
};

type WorkstationHealth = {
  ok?: boolean;
  feature?: { workstations?: boolean; monitoring?: boolean; internet?: boolean };
  provider?: { name?: string; healthy?: boolean };
  image?: { configured?: boolean; primary?: string | null };
  reverseProxy?: { configured?: boolean; base?: string | null };
  checkedAt?: string;
};

type LiveViewRequest = {
  id: string;
  scope: "IDE" | "DESKTOP";
  pendingWindow: Window | null;
};

const statuses = ["ALL", "RUNNING", "CREATING", "STOPPED", "FAILED", "DESTROYED"] as const;

function formatTime(value?: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString();
}

function humanize(value?: string | null, fallback = "Operations") {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;
  return normalized
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: WorkstationStatus) {
  if (status === "RUNNING") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "FAILED") return "border-red-200 bg-red-50 text-red-800";
  if (status === "CREATING") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "DESTROYED") return "border-slate-200 bg-slate-100 text-slate-500";
  return "border-slate-200 bg-white text-slate-700";
}

function redactOperationalText(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return "Not recorded";
  return text
    .replace(/\b(authorization)(\s*[:=]\s*)(?:(?:Bearer|Basic)\s+)?[^\s,;]+/gi, "$1$2[REDACTED]")
    .replace(/\b(api[-_]?key|secret|token|password|cookie|pin|cvv|cvc)(\s*[:=]\s*)[^\s,;]+/gi, "$1$2[REDACTED]")
    .replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, "$1 [REDACTED]");
}

function safeResourceUrl(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function parseAllowedDomains(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\s,;\n]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function Metric({
  label,
  value,
  note,
  icon: Icon,
  tone = "slate",
}: {
  label: string;
  value: number;
  note: string;
  icon: typeof Monitor;
  tone?: "slate" | "emerald" | "amber" | "red";
}) {
  const iconTone = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-red-200 bg-red-50 text-red-700",
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
          <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
          <div className="mt-1 text-xs text-slate-500">{note}</div>
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg border", iconTone)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function RecordList({
  title,
  icon: Icon,
  loading,
  empty,
  children,
}: {
  title: string;
  icon: typeof Activity;
  loading: boolean;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0 border-slate-200 bg-white text-slate-950 shadow-sm">
      <CardHeader className="border-b border-slate-200 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-black text-slate-950"><Icon className="h-4 w-4 text-[#D78C00]" /> {title}</CardTitle>
      </CardHeader>
      <CardContent className="max-h-80 space-y-2 overflow-y-auto pt-4">
        {loading ? [1, 2, 3].map((item) => <Skeleton key={item} className="h-16 bg-slate-100" />) : null}
        {!loading && empty ? <div className="py-6 text-center text-sm text-slate-500">No record yet.</div> : null}
        {!loading ? children : null}
      </CardContent>
    </Card>
  );
}

export default function AdminWorkstationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<(typeof statuses)[number]>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [policyMode, setPolicyMode] = useState<NetworkPolicyMode>("DEFAULT_DENY");
  const [allowlistInput, setAllowlistInput] = useState("");
  const [reassignAgentId, setReassignAgentId] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const listQuery = useQuery<WorkstationsResponse>({
    queryKey: ["/api/admin/workstations", status],
    queryFn: () => apiRequest(`/api/admin/workstations${status !== "ALL" ? `?status=${status}` : ""}`, { method: "GET" }),
    refetchInterval: 5000,
  });
  const healthQuery = useQuery<WorkstationHealth>({
    queryKey: ["/api/workstations/health"],
    queryFn: () => apiRequest("/api/workstations/health", { method: "GET" }),
    refetchInterval: 30_000,
  });
  const agentsQuery = useQuery<AgentOption[] | { items?: AgentOption[] }>({
    queryKey: ["/api/agents"],
    queryFn: () => apiRequest("/api/agents", { method: "GET" }),
    staleTime: 20_000,
  });

  const workstations = listQuery.data?.items || [];
  const selected = useMemo(
    () => workstations.find((item) => item.id === selectedId) || workstations[0] || null,
    [selectedId, workstations],
  );
  const workstationId = selected?.id || null;

  useEffect(() => {
    if (!selected) return;
    setPolicyMode(selected.network_policy_mode);
    setReassignAgentId(String(selected.agent_id));
    setAllowlistInput("");
    setPreviewUrl(null);
  }, [selected?.agent_id, selected?.id, selected?.network_policy_mode]);

  const eventsQuery = useQuery<{ items: WorkstationEvent[] }>({
    queryKey: ["/api/workstations/events", workstationId],
    queryFn: () => apiRequest(`/api/workstations/${workstationId}/events?limit=200`, { method: "GET" }),
    enabled: Boolean(workstationId),
    refetchInterval: 5000,
  });
  const sessionsQuery = useQuery<{ items: WorkstationSession[] }>({
    queryKey: ["/api/workstations/sessions", workstationId],
    queryFn: () => apiRequest(`/api/workstations/${workstationId}/sessions?limit=200`, { method: "GET" }),
    enabled: Boolean(workstationId),
    refetchInterval: 5000,
  });
  const artifactsQuery = useQuery<{ items: WorkstationArtifact[] }>({
    queryKey: ["/api/workstations/artifacts", workstationId],
    queryFn: () => apiRequest(`/api/workstations/${workstationId}/artifacts`, { method: "GET" }),
    enabled: Boolean(workstationId),
    refetchInterval: 10_000,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, Workstation[]>();
    for (const item of workstations) {
      const department = humanize(item.agent_department_key, "Operations");
      const entries = map.get(department) || [];
      entries.push(item);
      map.set(department, entries);
    }
    return Array.from(map.entries()).map(([department, items]) => ({ department, items }));
  }, [workstations]);

  const agentOptions = useMemo<AgentOption[]>(() => {
    const data = agentsQuery.data;
    const rows = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    const fromApi = rows
      .map((row) => ({ id: Number(row.id || 0), name: String(row.name || "").trim(), role: row.role || null }))
      .filter((row) => row.id > 0 && row.name && !/test|demo/i.test(row.name));
    if (fromApi.length) return fromApi;
    return Array.from(
      new Map(
        workstations.map((item) => [
          item.agent_id,
          { id: item.agent_id, name: item.agent_name || `Agent #${item.agent_id}`, role: item.agent_role },
        ]),
      ).values(),
    );
  }, [agentsQuery.data, workstations]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/workstations"] });
    if (!workstationId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/workstations/events", workstationId] }),
      queryClient.invalidateQueries({ queryKey: ["/api/workstations/sessions", workstationId] }),
      queryClient.invalidateQueries({ queryKey: ["/api/workstations/artifacts", workstationId] }),
    ]);
  };

  const controlMutation = useMutation({
    mutationFn: (input: { operation: "start" | "stop" | "destroy"; id: string }) =>
      input.operation === "destroy"
        ? apiRequest(`/api/workstations/${input.id}`, { method: "DELETE" })
        : apiRequest(`/api/workstations/${input.id}/${input.operation}`, { method: "POST" }),
    onSuccess: async (_response, input) => {
      toast({ title: `Workstation ${input.operation} completed` });
      await invalidate();
    },
    onError: (error: any) => toast({ title: "Operation failed", description: error?.message || "Request failed", variant: "destructive" }),
  });

  const terminateMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/workstations/${id}/terminate-session`, { method: "POST" }),
    onSuccess: async () => {
      toast({ title: "Session terminated" });
      await invalidate();
    },
    onError: (error: any) => toast({ title: "Terminate failed", description: error?.message || "Request failed", variant: "destructive" }),
  });

  const reassignMutation = useMutation({
    mutationFn: (input: { id: string; agentId: number }) => apiRequest(`/api/workstations/${input.id}/reassign`, { method: "POST", body: JSON.stringify({ agentId: input.agentId }) }),
    onSuccess: async () => {
      toast({ title: "Workstation reassigned" });
      await invalidate();
    },
    onError: (error: any) => toast({ title: "Reassignment failed", description: error?.message || "Request failed", variant: "destructive" }),
  });

  const viewMutation = useMutation({
    mutationFn: (input: LiveViewRequest) => apiRequest(`/api/workstations/${input.id}/view-token`, { method: "POST", body: JSON.stringify({ scope: input.scope }) }),
    onSuccess: (response, input) => {
      const url = safeResourceUrl(String(response?.url || ""));
      if (!url) {
        input.pendingWindow?.close();
        toast({ title: "Live view unavailable", description: "The server did not return a safe live URL.", variant: "destructive" });
        return;
      }
      setPreviewUrl(url);
      if (input.pendingWindow) input.pendingWindow.location.replace(url);
      toast({ title: `${input.scope === "IDE" ? "IDE" : "Desktop"} live view ready` });
    },
    onError: (error: any, input) => {
      input.pendingWindow?.close();
      toast({ title: "Open failed", description: error?.message || "Request failed", variant: "destructive" });
    },
  });

  const policyMutation = useMutation({
    mutationFn: (input: { id: string; mode: NetworkPolicyMode; allowedDomains: string[] }) => apiRequest(`/api/workstations/${input.id}/network-policy`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: async () => {
      toast({ title: "Network policy updated" });
      setAllowlistInput("");
      await invalidate();
    },
    onError: (error: any) => toast({ title: "Policy update failed", description: error?.message || "Request failed", variant: "destructive" }),
  });

  const counts = listQuery.data?.statusCounts || {};
  const runningCount = Number(counts.RUNNING || 0);
  const creatingCount = Number(counts.CREATING || 0);
  const failedCount = Number(counts.FAILED || 0);
  const allCount = Number(counts.ALL ?? workstations.length);
  const allowedDomains = parseAllowedDomains(allowlistInput);
  const selectedAgentId = Number(reassignAgentId || 0);
  const canReassign = Boolean(selected && selectedAgentId > 0 && selectedAgentId !== selected.agent_id);
  const canApplyPolicy = Boolean(selected && (policyMode !== "ALLOWLIST" || allowedDomains.length > 0));
  const providerHealthy = Boolean(healthQuery.data?.provider?.healthy);

  const openLiveView = (scope: LiveViewRequest["scope"]) => {
    if (!selected) return;
    const pendingWindow = window.open("about:blank", "_blank");
    if (pendingWindow) pendingWindow.opener = null;
    viewMutation.mutate({ id: selected.id, scope, pendingWindow });
  };

  const confirmControl = (operation: "stop" | "destroy") => {
    if (!selected) return;
    const prompt = operation === "destroy"
      ? `Destroy the workstation assigned to ${selected.agent_name || `agent #${selected.agent_id}`}? This removes the runtime and cannot be undone from this screen.`
      : `Stop the workstation assigned to ${selected.agent_name || `agent #${selected.agent_id}`}?`;
    if (window.confirm(prompt)) controlMutation.mutate({ id: selected.id, operation });
  };

  const confirmTerminate = () => {
    if (!selected) return;
    if (window.confirm(`Terminate the active session for ${selected.agent_name || `agent #${selected.agent_id}`}?`)) {
      terminateMutation.mutate(selected.id);
    }
  };

  const confirmReassignment = () => {
    if (!selected || !canReassign) return;
    const target = agentOptions.find((agent) => agent.id === selectedAgentId);
    if (window.confirm(`Reassign this workstation from ${selected.agent_name || `agent #${selected.agent_id}`} to ${target?.name || `agent #${selectedAgentId}`}?`)) {
      reassignMutation.mutate({ id: selected.id, agentId: selectedAgentId });
    }
  };

  const confirmPolicy = () => {
    if (!selected || !canApplyPolicy) return;
    const prompt = policyMode === "FULL_EGRESS"
      ? "Allow unrestricted outbound internet access for this workstation? This expands its network exposure."
      : policyMode === "ALLOWLIST"
        ? `Replace this workstation's allowed-domain list with ${allowedDomains.length} domain${allowedDomains.length === 1 ? "" : "s"}?`
        : "Set this workstation to default-deny network access?";
    if (window.confirm(prompt)) policyMutation.mutate({ id: selected.id, mode: policyMode, allowedDomains });
  };

  return (
    <div data-testid="exportunity-workstations-workspace" className="min-h-full bg-[#F7F8FA] p-4 text-slate-950 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-[#D78C00]">Exportunity Industrial OS</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Agent workstations</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Monitor isolated agent runtimes, inspect attributable activity, and apply explicit operator controls.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className={cn("font-bold", providerHealthy ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>
                <Server className="mr-1 h-3.5 w-3.5" /> {healthQuery.data?.provider?.name || "Provider unknown"} · {providerHealthy ? "healthy" : "needs attention"}
              </Badge>
              <span className="text-slate-500">Network controls: {healthQuery.data?.feature?.internet === false ? "disabled" : "available"}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={status} onValueChange={(value) => setStatus(value as (typeof statuses)[number])}>
              <SelectTrigger className="w-full border-slate-300 bg-white text-slate-800 sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent className="border-slate-200 bg-white text-slate-800">
                {statuses.map((item) => <SelectItem key={item} value={item}>{humanize(item, "All statuses")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" className="border-slate-300 bg-white text-slate-800 hover:border-amber-400 hover:bg-amber-50" onClick={() => void Promise.all([listQuery.refetch(), healthQuery.refetch()])} disabled={listQuery.isFetching || healthQuery.isFetching}>
              <RefreshCw className={cn("mr-2 h-4 w-4", (listQuery.isFetching || healthQuery.isFetching) && "animate-spin")} /> Refresh
            </Button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Workstations" value={allCount} note="Visible operational agents" icon={Monitor} />
          <Metric label="Running" value={runningCount} note="Live runtimes" icon={CheckCircle2} tone="emerald" />
          <Metric label="Provisioning" value={creatingCount} note="Runtimes being prepared" icon={Activity} tone="amber" />
          <Metric label="Failed" value={failedCount} note="Requires operator review" icon={AlertTriangle} tone={failedCount ? "red" : "slate"} />
        </section>

        <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
          <CardHeader className="border-b border-slate-200">
            <CardTitle className="text-xl font-black text-slate-950">Runtime registry</CardTitle>
            <p className="text-sm text-slate-500">Grouped by operating department. Select a workstation to inspect or control it.</p>
          </CardHeader>
          <CardContent className="pt-5">
            {listQuery.isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-40 bg-slate-100" />)}
              </div>
            ) : listQuery.isError ? (
              <div className="flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                <div className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" /> Workstations could not be loaded.</div>
                <Button type="button" size="sm" variant="outline" className="border-red-300 bg-white text-red-800" onClick={() => void listQuery.refetch()}>Try again</Button>
              </div>
            ) : workstations.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">No workstation matches the selected status.</div>
            ) : (
              <div className="space-y-6">
                {grouped.map((group) => (
                  <section key={group.department} className="space-y-3">
                    <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{group.department}</div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {group.items.map((workstation) => {
                        const active = selected?.id === workstation.id;
                        const live = Boolean(workstation.active_session_id) || workstation.status === "RUNNING";
                        return (
                          <button
                            key={workstation.id}
                            type="button"
                            data-testid="exportunity-workstation-record"
                            onClick={() => setSelectedId(workstation.id)}
                            className={cn(
                              "min-w-0 rounded-lg border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623]",
                              active ? "border-[#F5A623] bg-[#FFF8E8] shadow-sm" : "border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50/40",
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-[#F5A623]"><TerminalSquare className="h-5 w-5" /></div>
                              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500"><span className={cn("h-2.5 w-2.5 rounded-full", live ? "bg-emerald-500" : "bg-slate-300")} />{live ? "Live" : "Offline"}</div>
                            </div>
                            <div className="mt-4 min-w-0">
                              <div className="truncate font-black text-slate-950">{workstation.agent_name || `Agent #${workstation.agent_id}`}</div>
                              <div className="mt-1 truncate text-xs text-slate-500">{workstation.agent_role || "No role recorded"}</div>
                              <div className="mt-2 truncate font-mono text-[10px] text-slate-400">{workstation.id}</div>
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className={cn("text-[10px] font-bold hover:bg-inherit", statusClass(workstation.status))}>{humanize(workstation.status)}</Badge>
                              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-900 hover:bg-amber-50">{humanize(workstation.network_policy_mode)}</Badge>
                            </div>
                            {workstation.failureReason ? <div className="mt-3 line-clamp-2 text-xs text-red-700">{redactOperationalText(workstation.failureReason)}</div> : null}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {selected ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
            <Card className="min-w-0 border-slate-200 bg-white text-slate-950 shadow-sm">
              <CardHeader className="border-b border-slate-200">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg font-black text-slate-950"><Activity className="h-5 w-5 text-[#D78C00]" /> {selected.agent_name || `Agent #${selected.agent_id}`}</CardTitle>
                    <p className="mt-1 text-xs text-slate-500">Updated {formatTime(selected.updated_at)}{selected.agent_manager_name ? ` · manager ${selected.agent_manager_name}` : ""}</p>
                  </div>
                  <Badge variant="outline" className={cn("w-fit font-bold hover:bg-inherit", statusClass(selected.status))}>{humanize(selected.status)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 pt-5">
                <div>
                  <div className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Live access and runtime controls</div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" className="bg-[#F5A623] font-bold text-[#07111F] hover:bg-[#E49718]" onClick={() => openLiveView("IDE")} disabled={viewMutation.isPending}><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open IDE</Button>
                    <Button type="button" size="sm" className="bg-slate-950 font-bold text-white hover:bg-slate-800" onClick={() => openLiveView("DESKTOP")} disabled={viewMutation.isPending}><Monitor className="mr-1.5 h-3.5 w-3.5" /> Open desktop</Button>
                    <Button type="button" size="sm" variant="outline" className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50" onClick={() => controlMutation.mutate({ id: selected.id, operation: "start" })} disabled={controlMutation.isPending || selected.status === "RUNNING"}><Play className="mr-1.5 h-3.5 w-3.5" /> Start</Button>
                    <Button type="button" size="sm" variant="outline" className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50" onClick={() => confirmControl("stop")} disabled={controlMutation.isPending || selected.status !== "RUNNING"}><Power className="mr-1.5 h-3.5 w-3.5" /> Stop</Button>
                    <Button type="button" size="sm" variant="outline" className="border-amber-300 bg-white text-amber-800 hover:bg-amber-50" onClick={confirmTerminate} disabled={terminateMutation.isPending || !selected.active_session_id}><Activity className="mr-1.5 h-3.5 w-3.5" /> Terminate session</Button>
                    <Button type="button" size="sm" variant="outline" className="border-red-300 bg-white text-red-800 hover:bg-red-50" onClick={() => confirmControl("destroy")} disabled={controlMutation.isPending || selected.status === "DESTROYED"}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Destroy</Button>
                    <Link href={`/admin/evidence?workstation_id=${encodeURIComponent(selected.id)}`}><Button type="button" size="sm" variant="outline" className="border-slate-300 bg-white text-slate-800 hover:border-amber-400 hover:bg-amber-50"><FileClock className="mr-1.5 h-3.5 w-3.5" /> Evidence trail</Button></Link>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-[#FBFCFD] p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Reassign workstation</div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Choose a different active operational agent. Reassignment is recorded in the audit trail.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <Select value={reassignAgentId} onValueChange={setReassignAgentId}>
                      <SelectTrigger className="border-slate-300 bg-white text-slate-800"><SelectValue placeholder="Select target agent" /></SelectTrigger>
                      <SelectContent className="border-slate-200 bg-white text-slate-800">
                        {agentOptions.map((agent) => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name}{agent.role ? ` · ${agent.role}` : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button type="button" size="sm" className="bg-slate-950 font-bold text-white hover:bg-slate-800" onClick={confirmReassignment} disabled={!canReassign || reassignMutation.isPending}><ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" /> Reassign</Button>
                  </div>
                </div>

                {previewUrl ? (
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 text-xs font-bold text-slate-600"><span>Live preview</span><a href={previewUrl} target="_blank" rel="noreferrer" className="text-[#9A6200] hover:underline">Open in new tab</a></div>
                    <iframe title="Workstation live preview" src={previewUrl} className="h-[460px] w-full bg-white" />
                  </div>
                ) : (
                  <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                    <Monitor className="h-8 w-8 text-slate-400" />
                    <div className="mt-3 text-sm font-bold text-slate-700">No live preview open</div>
                    <div className="mt-1 text-xs text-slate-500">Request an IDE or desktop view to display the signed runtime session here.</div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0 border-slate-200 bg-white text-slate-950 shadow-sm">
              <CardHeader className="border-b border-slate-200">
                <CardTitle className="flex items-center gap-2 text-lg font-black text-slate-950"><Shield className="h-5 w-5 text-[#D78C00]" /> Network policy</CardTitle>
                <p className="text-xs leading-5 text-slate-500">Changes replace the workstation's stored egress policy and are audit-recorded.</p>
              </CardHeader>
              <CardContent className="space-y-4 pt-5">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">Mode</Label>
                  <Select value={policyMode} onValueChange={(value) => setPolicyMode(value as NetworkPolicyMode)}>
                    <SelectTrigger className="border-slate-300 bg-white text-slate-800"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-slate-200 bg-white text-slate-800">
                      <SelectItem value="DEFAULT_DENY">Default deny</SelectItem>
                      <SelectItem value="ALLOWLIST">Allowed domains only</SelectItem>
                      <SelectItem value="FULL_EGRESS">Full outbound access</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">New allowed-domain list</Label>
                  <Input value={allowlistInput} onChange={(event) => setAllowlistInput(event.target.value)} placeholder="example.com, docs.example.com" className="border-slate-300 bg-white text-slate-950 placeholder:text-slate-400" disabled={policyMode !== "ALLOWLIST"} />
                  <p className="text-[11px] leading-5 text-slate-500">For allowlist mode, enter the complete replacement list. Stored domains are never guessed from the browser.</p>
                </div>
                {policyMode === "FULL_EGRESS" ? <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Full egress exposes this runtime to unrestricted outbound internet access.</div> : null}
                <Button type="button" className="w-full bg-[#F5A623] font-black text-[#07111F] hover:bg-[#E49718]" onClick={confirmPolicy} disabled={!canApplyPolicy || policyMutation.isPending || healthQuery.data?.feature?.internet === false}><Network className="mr-2 h-4 w-4" /> Apply policy</Button>
                <div className="text-xs text-slate-500">Current recorded mode: <span className="font-bold text-slate-700">{humanize(selected.network_policy_mode)}</span></div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {selected ? (
          <section className="grid gap-4 xl:grid-cols-3">
            <RecordList title="Live sessions" icon={Monitor} loading={sessionsQuery.isLoading} empty={(sessionsQuery.data?.items || []).length === 0}>
              {(sessionsQuery.data?.items || []).map((session) => (
                <div key={session.id} className="rounded-lg border border-slate-200 bg-[#FBFCFD] p-3 text-xs">
                  <div className="font-bold text-slate-950">{humanize(session.session_type)}</div>
                  <div className="mt-1 text-slate-600">{session.ip || "No IP recorded"}</div>
                  <div className="mt-1 text-slate-500">{formatTime(session.started_at)}{session.ended_at ? ` · ended ${formatTime(session.ended_at)}` : " · active"}</div>
                </div>
              ))}
            </RecordList>

            <RecordList title="Tool and action events" icon={ListChecks} loading={eventsQuery.isLoading} empty={(eventsQuery.data?.items || []).length === 0}>
              {(eventsQuery.data?.items || []).map((event) => (
                <div key={event.id} className="rounded-lg border border-slate-200 bg-[#FBFCFD] p-3 text-xs">
                  <div className="font-bold text-slate-950">{humanize(event.event_type)}</div>
                  <div className="mt-1 break-words font-mono text-[11px] text-slate-600">{redactOperationalText(event.command)}</div>
                  <div className="mt-1 text-slate-500">{formatTime(event.created_at)}</div>
                </div>
              ))}
            </RecordList>

            <RecordList title="Artifacts and file history" icon={HardDrive} loading={artifactsQuery.isLoading} empty={(artifactsQuery.data?.items || []).length === 0}>
              {(artifactsQuery.data?.items || []).map((artifact) => {
                const artifactUrl = safeResourceUrl(artifact.url);
                return (
                  <div key={artifact.id} className="rounded-lg border border-slate-200 bg-[#FBFCFD] p-3 text-xs">
                    <div className="font-bold text-slate-950">{humanize(artifact.type)}</div>
                    <div className="mt-1 truncate font-mono text-[11px] text-slate-600">{artifact.storage_key}</div>
                    <div className="mt-1 text-slate-500">{formatTime(artifact.created_at)}</div>
                    {artifactUrl ? <a href={artifactUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-bold text-[#9A6200] hover:underline"><ExternalLink className="h-3.5 w-3.5" /> Open artifact</a> : null}
                  </div>
                );
              })}
            </RecordList>
          </section>
        ) : null}
      </div>
    </div>
  );
}
