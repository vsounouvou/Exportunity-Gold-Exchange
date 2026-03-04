import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Pause, Play, RefreshCw, ScrollText, Zap } from "lucide-react";

type AgentKey = "marketing" | "client_hunter" | "media" | "ops" | "compliance" | "data";

type AgentStatusRow = {
  agent: AgentKey;
  status: "idle" | "running" | "error";
  budget: { usd: number; maxCalls: number; maxTokens: number } | null;
  taskId: number | null;
  updatedAt: string | null;
};

type AgentStatusResponse = {
  ok: boolean;
  agents: AgentStatusRow[];
};

type TaskLogItem = {
  id: number;
  action: string;
  status: string;
  estimatedCostUsd: string | number | null;
  outputSummary: string | null;
  createdAt: string;
};

type TaskDetailResponse = {
  ok: boolean;
  task: any;
  logs: TaskLogItem[];
};

function formatMoney(value: number | null | undefined) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return `$${num.toFixed(2)}`;
}

function formatIso(value: string | null | undefined) {
  if (!value) return "—";
  const dt = new Date(value);
  return Number.isFinite(dt.getTime()) ? dt.toISOString().slice(0, 19).replace("T", " ") : String(value);
}

function statusBadge(status: AgentStatusRow["status"]) {
  if (status === "running") return <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">running</Badge>;
  if (status === "error") return <Badge className="bg-red-500/15 text-red-300 border border-red-500/30">error</Badge>;
  return <Badge className="bg-slate-500/15 text-slate-200 border border-slate-500/30">idle</Badge>;
}

function isAgentKey(value: string): value is AgentKey {
  return ["marketing", "client_hunter", "media", "ops", "compliance", "data"].includes(value);
}

export function AgentCommandCenterPage() {
  const { tenant } = useTenant();
  const [location, setLocation] = useLocation();

  const qs = useMemo(() => new URLSearchParams(location.split("?")[1] || ""), [location]);
  const territoryId = qs.get("territoryId") || "";
  const agentFromQuery = qs.get("agent") || "";
  const goalFromQuery = qs.get("goal") || "";

  const [agent, setAgent] = useState<AgentKey>("marketing");
  const [goal, setGoal] = useState<string>("");
  const [budgetUsd, setBudgetUsd] = useState<string>("5");
  const [maxCalls, setMaxCalls] = useState<string>("50");
  const [maxTokens, setMaxTokens] = useState<string>("");
  const [language, setLanguage] = useState<string>("fr");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentFromQuery) return;
    if (!isAgentKey(agentFromQuery)) return;
    setAgent(agentFromQuery);
  }, [agentFromQuery]);

  useEffect(() => {
    if (!goalFromQuery) return;
    if (goal.trim()) return;
    setGoal(goalFromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalFromQuery]);

  const statusQuery = useQuery<AgentStatusResponse>({
    queryKey: ["/api/admin/agent-tasks/agents/status"],
    staleTime: 0,
  });

  const taskDetailQuery = useQuery<TaskDetailResponse>({
    queryKey: detailTaskId ? [`/api/admin/agent-tasks/${detailTaskId}`] : ["__no_task__"],
    enabled: detailOpen && !!detailTaskId,
    staleTime: 0,
  });

  const createTaskMutation = useMutation({
    mutationFn: async (opts: { agent: AgentKey; goal: string }) => {
      const usd = Number(budgetUsd);
      const calls = parseInt(maxCalls, 10);
      const tokens = maxTokens.trim() ? parseInt(maxTokens, 10) : undefined;
      const constraints: Record<string, any> = {};
      if (territoryId) constraints.territoryId = territoryId;
      if (language.trim()) constraints.language = language.trim();

      return apiRequest("/api/admin/agent-tasks", {
        method: "POST",
        body: JSON.stringify({
          tenant: tenant.key,
          agent: opts.agent,
          goal: opts.goal,
          budget: {
            usd: Number.isFinite(usd) ? usd : 0,
            maxCalls: Number.isFinite(calls) ? calls : 0,
            ...(Number.isFinite(tokens) ? { maxTokens: tokens } : {}),
          },
          constraints,
        }),
      });
    },
    onSuccess: async () => {
      await statusQuery.refetch();
    },
    onError: (err: any) => {
      setError(err?.message || "Failed to create task");
    },
  });

  const runTaskMutation = useMutation({
    mutationFn: async (opts: { taskId: number; dryRun: boolean }) => {
      return apiRequest("/api/agent/actions/run", {
        method: "POST",
        body: JSON.stringify({ taskId: opts.taskId, dryRun: opts.dryRun }),
      });
    },
    onSuccess: async (_res, vars) => {
      await statusQuery.refetch();
      setDetailTaskId(vars.taskId);
      setDetailOpen(true);
    },
    onError: (err: any) => {
      setError(err?.message || "Failed to run task");
    },
  });

  const pauseTaskMutation = useMutation({
    mutationFn: async (taskId: number) => apiRequest(`/api/admin/agent-tasks/${taskId}/pause`, { method: "POST" }),
    onSuccess: async () => statusQuery.refetch(),
  });

  const resumeTaskMutation = useMutation({
    mutationFn: async (taskId: number) => apiRequest(`/api/admin/agent-tasks/${taskId}/resume`, { method: "POST" }),
    onSuccess: async () => statusQuery.refetch(),
  });

  const submit = async (dryRun: boolean) => {
    setError(null);
    const trimmed = goal.trim();
    if (!trimmed) return;
    const created = await createTaskMutation.mutateAsync({ agent, goal: trimmed });
    const taskId = Number(created?.task?.id);
    if (!Number.isFinite(taskId) || taskId <= 0) return;
    await runTaskMutation.mutateAsync({ taskId, dryRun });
  };

  const agents = Array.isArray(statusQuery.data?.agents) ? statusQuery.data!.agents : [];

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xl font-semibold text-white">Agent Jobs</div>
          <div className="text-xs text-gray-400">
            Run and monitor agent jobs (budgets, logs, controls). Tenant:{" "}
            <span className="text-gray-200">{tenant.key}</span>
            {territoryId ? (
              <>
                {" "}
                • Territory: <span className="text-gray-200">{territoryId}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setLocation("/ai-team")}>
            Operations Center
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setLocation("/admin/email")}>
            Email
          </Button>
          <Button variant="secondary" size="sm" onClick={() => statusQuery.refetch()} disabled={statusQuery.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${statusQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-lg">Run an agent job</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2">{error}</div>
          ) : null}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-300">Agent</Label>
              <Select value={agent} onValueChange={(v) => setAgent(v as AgentKey)}>
                <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent className="bg-gray-950 border-gray-800">
                  {(["marketing", "client_hunter", "media", "ops", "compliance", "data"] as AgentKey[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-[11px] text-gray-500">marketing | client_hunter | media | ops | compliance | data</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-300">Budget (USD)</Label>
              <Input value={budgetUsd} onChange={(e) => setBudgetUsd(e.target.value)} className="bg-slate-950 border-slate-800 text-white" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-300">Max calls</Label>
              <Input value={maxCalls} onChange={(e) => setMaxCalls(e.target.value)} className="bg-slate-950 border-slate-800 text-white" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-300">Max tokens (optional)</Label>
              <Input value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} className="bg-slate-950 border-slate-800 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <div className="space-y-1 lg:col-span-3">
              <Label className="text-xs text-gray-300">Goal</Label>
              <Textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="What should this agent accomplish?"
                className="min-h-[90px] bg-slate-950 border-slate-800 text-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-300">Language</Label>
              <Input value={language} onChange={(e) => setLanguage(e.target.value)} className="bg-slate-950 border-slate-800 text-white" />
              <div className="pt-3 flex flex-col gap-2">
                <Button onClick={() => submit(false)} disabled={createTaskMutation.isPending || runTaskMutation.isPending || !goal.trim()}>
                  {createTaskMutation.isPending || runTaskMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  Run
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => submit(true)}
                  disabled={createTaskMutation.isPending || runTaskMutation.isPending || !goal.trim()}
                >
                  <ScrollText className="h-4 w-4 mr-2" />
                  Dry run
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-lg">Agents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {statusQuery.isLoading ? (
            <div className="flex items-center gap-2 text-gray-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading agents…
            </div>
          ) : agents.length === 0 ? (
            <div className="text-sm text-gray-400">No agents found.</div>
          ) : (
            <div className="space-y-2">
              {agents.map((row) => {
                const busy = pauseTaskMutation.isPending || resumeTaskMutation.isPending;
                return (
                  <div key={row.agent} className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border border-gray-800 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <div className="font-semibold text-white">{row.agent}</div>
                      {statusBadge(row.status)}
                      <div className="text-xs text-gray-400">updated: {formatIso(row.updatedAt)}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <div className="text-gray-300">
                        budget: {row.budget ? `${formatMoney(row.budget.usd)} • calls ${row.budget.maxCalls || 0} • tokens ${row.budget.maxTokens || 0}` : "—"}
                      </div>
                      {row.taskId ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setDetailTaskId(row.taskId);
                              setDetailOpen(true);
                            }}
                          >
                            View logs
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => pauseTaskMutation.mutate(row.taskId!)}>
                            <Pause className="h-3.5 w-3.5 mr-2" />
                            Pause
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => resumeTaskMutation.mutate(row.taskId!)}>
                            <Play className="h-3.5 w-3.5 mr-2" />
                            Resume
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setDetailTaskId(null);
        }}
      >
        <DialogContent className="max-w-3xl bg-gray-950 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">Task logs</DialogTitle>
            <DialogDescription className="text-gray-400">
              Task {detailTaskId ? `#${detailTaskId}` : ""} • budgets enforced server-side
            </DialogDescription>
          </DialogHeader>

          {taskDetailQuery.isLoading ? (
            <div className="flex items-center gap-2 text-gray-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading logs…
            </div>
          ) : taskDetailQuery.isError ? (
            <div className="text-sm text-red-300">Failed to load logs.</div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-gray-400">
                Agent: <span className="text-gray-200">{String(taskDetailQuery.data?.task?.agent || "—")}</span> • Status:{" "}
                <span className="text-gray-200">{String(taskDetailQuery.data?.task?.status || "—")}</span>
              </div>
              <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
                {(taskDetailQuery.data?.logs || []).map((log) => (
                  <div key={log.id} className="border border-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm text-white font-semibold">{log.action}</div>
                      <div className="text-xs text-gray-400">{formatIso(log.createdAt)}</div>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      status: <span className="text-gray-200">{log.status}</span> • cost:{" "}
                      <span className="text-gray-200">{log.estimatedCostUsd ? formatMoney(Number(log.estimatedCostUsd)) : "—"}</span>
                    </div>
                    {log.outputSummary ? (
                      <pre className="mt-2 whitespace-pre-wrap text-xs text-gray-200 bg-black/30 border border-gray-800 rounded-md p-2">
                        {log.outputSummary}
                      </pre>
                    ) : null}
                  </div>
                ))}
                {!taskDetailQuery.data?.logs?.length ? <div className="text-sm text-gray-400">No logs yet.</div> : null}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
