import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { BarChart3, Coins, Crown, RefreshCw, ShieldAlert, Wallet, Zap } from "lucide-react";

type ScopeMode = "tenant" | "global";

type CommandCenterResponse = {
  scope: ScopeMode;
  canUseGlobalView: boolean;
  tenant: { id: number; key: string; name: string };
  selectedTenantId: number | null;
  tenantOptions: Array<{ id: number; key: string; name: string }>;
  metrics: {
    totalCredits: number;
    activeWallets: number;
    avgSpendPerAgent: number;
    dailySpend: number;
    dailyLimit: number;
  };
  wallets: Array<{
    walletId: number;
    agentId: number;
    tenantId: number | null;
    agentName: string;
    role: string;
    status: string;
    hierarchyLevel: string;
    intelligenceCap: string;
    maxContextTokens: number;
    maxDailyTokens: number;
    isSuperAgent: boolean;
    tokenMultiplier: number;
    tier: string;
    walletStatus: string;
    creditBalance: number;
    dailySpent: number;
    lifetimeSpent: number;
    dailyLimit: number;
  }>;
  performance: Array<{
    agentId: number;
    agentName: string;
    hierarchyLevel: string;
    isSuperAgent: boolean;
    successRate: number;
    avgExecutionSeconds: number;
    scriptReusePct: number;
    llmUsagePct: number;
    cronUsagePct: number;
    totalTokens: number;
    anomaly: string | null;
  }>;
  crons: Array<{
    source: "registry" | "governed";
    id: number;
    tenantId: number;
    agentId: number | null;
    agentName: string | null;
    cronType: string;
    schedule: string | null;
    scriptReference: string | null;
    budgetTokens: number;
    isActive: boolean;
    lastRun: string | null;
    nextRun: string | null;
  }>;
};

function asMoney(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function asPercent(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function hierarchyBadge(level: string, isSuper: boolean) {
  const normalized = String(level || "executor").toLowerCase();
  if (isSuper || normalized === "super") {
    return (
      <Badge className="bg-amber-500 text-black">
        <Crown className="mr-1 h-3 w-3" />
        SUPER
      </Badge>
    );
  }
  if (normalized === "director") return <Badge className="bg-purple-600 text-white">DIRECTOR</Badge>;
  if (normalized === "manager") return <Badge className="bg-blue-600 text-white">MANAGER</Badge>;
  return <Badge variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-white">EXECUTOR</Badge>;
}

export default function AgentEconomyDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scopeMode, setScopeMode] = useState<ScopeMode>("tenant");
  const [selectedTenantId, setSelectedTenantId] = useState<number | "">("");

  const queryPath = useMemo(() => {
    const params = new URLSearchParams();
    params.set("scope", scopeMode);
    if (scopeMode === "global" && selectedTenantId) {
      params.set("tenantId", String(selectedTenantId));
    }
    return `/api/agent-economy/command-center?${params.toString()}`;
  }, [scopeMode, selectedTenantId]);

  const { data, isLoading, refetch } = useQuery<CommandCenterResponse>({
    queryKey: ["/api/agent-economy/command-center", scopeMode, selectedTenantId || 0],
    queryFn: () => apiRequest(queryPath),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/agent-economy/command-center"] });
  };

  const elevateMutation = useMutation({
    mutationFn: async ({ agentId, isSuperAgent }: { agentId: number; isSuperAgent: boolean }) =>
      apiRequest(`/api/agent-economy/agents/${agentId}/super`, {
        method: "PATCH",
        body: JSON.stringify({ isSuperAgent }),
      }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Agent updated", description: "Super-agent privileges updated." });
    },
    onError: (error: any) => {
      toast({
        title: "Action failed",
        description: error?.message || "Could not update super-agent privileges.",
        variant: "destructive",
      });
    },
  });

  const freezeMutation = useMutation({
    mutationFn: async ({ agentId, freeze }: { agentId: number; freeze: boolean }) =>
      apiRequest(`/api/agent-economy/agents/${agentId}/freeze`, {
        method: "PATCH",
        body: JSON.stringify({ freeze }),
      }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Agent state updated", description: "Governance freeze state changed." });
    },
    onError: (error: any) => {
      toast({
        title: "Action failed",
        description: error?.message || "Could not update freeze state.",
        variant: "destructive",
      });
    },
  });

  const cronToggleMutation = useMutation({
    mutationFn: async ({ id, source, isActive }: { id: number; source: string; isActive: boolean }) =>
      apiRequest(`/api/agent-economy/cron/${id}/toggle`, {
        method: "PATCH",
        body: JSON.stringify({ source, isActive }),
      }),
    onSuccess: () => {
      invalidate();
      toast({ title: "CRON updated", description: "CRON status updated." });
    },
    onError: (error: any) => {
      toast({
        title: "Action failed",
        description: error?.message || "Could not update CRON status.",
        variant: "destructive",
      });
    },
  });

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[calc(100vh-var(--admin-header-height,4rem))] items-center justify-center bg-[#F7F8FA]">
        <RefreshCw className="h-8 w-8 animate-spin text-[#F5A623]" />
      </div>
    );
  }

  const spendPct = data.metrics.dailyLimit > 0 ? Math.min(100, (data.metrics.dailySpend / data.metrics.dailyLimit) * 100) : 0;

  return (
    <div
      data-testid="exportunity-agent-economy-workspace"
      className="min-h-[calc(100vh-var(--admin-header-height,4rem))] bg-[#F7F8FA] p-4 pb-24 text-[#07111F] md:p-6"
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8A5700]">GTN agent governance</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-black tracking-tight text-slate-950">
              <Coins className="h-6 w-6 text-[#F5A623]" />
              Agent economy command center
            </h1>
            <p className="mt-1 text-slate-500">
              Wallets, token governance, CRON army, and hierarchy controls
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data.canUseGlobalView && (
              <>
                <select
                  value={scopeMode}
                  onChange={(event) => {
                    const nextScope = event.target.value === "global" ? "global" : "tenant";
                    setScopeMode(nextScope);
                    if (nextScope !== "global") setSelectedTenantId("");
                  }}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
                >
                  <option value="tenant">Tenant View</option>
                  <option value="global">Global View</option>
                </select>
                {scopeMode === "global" && (
                  <select
                    value={selectedTenantId}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      setSelectedTenantId(Number.isFinite(next) && next > 0 ? next : "");
                    }}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
                  >
                    <option value="">All tenants</option>
                    {data.tenantOptions.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8] hover:text-slate-950"
              onClick={() => refetch()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Credits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{asMoney(data.metrics.totalCredits)}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active Wallets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.metrics.activeWallets}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Avg Spend / Agent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{asMoney(data.metrics.avgSpendPerAgent)}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Daily Spend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{asMoney(data.metrics.dailySpend)}</div>
              <Progress value={spendPct} className="mt-2" />
              <p className="mt-1 text-xs text-muted-foreground">
                of {asMoney(data.metrics.dailyLimit)} limit
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="wallets" className="space-y-4">
          <TabsList className="border border-slate-200 bg-white p-1 shadow-sm">
            <TabsTrigger value="wallets">
              <Wallet className="mr-2 h-4 w-4" />
              Agent Wallets
            </TabsTrigger>
            <TabsTrigger value="performance">
              <BarChart3 className="mr-2 h-4 w-4" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="cron">
              <Zap className="mr-2 h-4 w-4" />
              CRON Army
            </TabsTrigger>
          </TabsList>

          <TabsContent value="wallets">
            <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
              <CardHeader>
                <CardTitle>Wallet Governance</CardTitle>
                <CardDescription>
                  Tier, hierarchy, token ceilings, and wallet burn controls per agent.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[520px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Hierarchy</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead className="text-right">Daily Spend</TableHead>
                        <TableHead className="text-right">Daily Token Cap</TableHead>
                        {data.canUseGlobalView && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.wallets.map((wallet) => (
                        <TableRow key={wallet.walletId}>
                          <TableCell className="font-medium">{wallet.agentName}</TableCell>
                          <TableCell>{wallet.role}</TableCell>
                          <TableCell>{hierarchyBadge(wallet.hierarchyLevel, wallet.isSuperAgent)}</TableCell>
                          <TableCell>{wallet.tier}</TableCell>
                          <TableCell>
                            <Badge
                              variant={wallet.walletStatus === "active" ? "secondary" : "outline"}
                              className={wallet.walletStatus === "active" ? "bg-slate-900 text-white hover:bg-slate-900" : "border-slate-200 bg-white text-slate-700 hover:bg-white"}
                            >
                              {wallet.walletStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">{asMoney(wallet.creditBalance)}</TableCell>
                          <TableCell className="text-right font-mono">
                            {asMoney(wallet.dailySpent)} / {asMoney(wallet.dailyLimit)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {wallet.maxDailyTokens.toLocaleString()}
                          </TableCell>
                          {data.canUseGlobalView && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8] hover:text-slate-950"
                                  disabled={elevateMutation.isPending}
                                  onClick={() =>
                                    elevateMutation.mutate({
                                      agentId: wallet.agentId,
                                      isSuperAgent: !wallet.isSuperAgent,
                                    })
                                  }
                                >
                                  {wallet.isSuperAgent ? "Unset Super" : "Elevate Super"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8] hover:text-slate-950"
                                  disabled={freezeMutation.isPending}
                                  onClick={() =>
                                    freezeMutation.mutate({
                                      agentId: wallet.agentId,
                                      freeze: wallet.walletStatus === "active",
                                    })
                                  }
                                >
                                  {wallet.walletStatus === "active" ? "Freeze" : "Unfreeze"}
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance">
            <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
              <CardHeader>
                <CardTitle>Execution Performance</CardTitle>
                <CardDescription>
                  Success rate, execution time, script reuse, LLM usage, CRON usage, and anomaly flags.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[520px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent</TableHead>
                        <TableHead>Hierarchy</TableHead>
                        <TableHead className="text-right">Success</TableHead>
                        <TableHead className="text-right">Avg Exec</TableHead>
                        <TableHead className="text-right">Script Reuse</TableHead>
                        <TableHead className="text-right">LLM Usage</TableHead>
                        <TableHead className="text-right">CRON Usage</TableHead>
                        <TableHead className="text-right">Tokens</TableHead>
                        <TableHead>Anomaly</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.performance.map((row) => (
                        <TableRow key={row.agentId}>
                          <TableCell className="font-medium">{row.agentName}</TableCell>
                          <TableCell>{hierarchyBadge(row.hierarchyLevel, row.isSuperAgent)}</TableCell>
                          <TableCell className="text-right">{asPercent(row.successRate)}</TableCell>
                          <TableCell className="text-right">{row.avgExecutionSeconds.toFixed(1)}s</TableCell>
                          <TableCell className="text-right">{asPercent(row.scriptReusePct)}</TableCell>
                          <TableCell className="text-right">{asPercent(row.llmUsagePct)}</TableCell>
                          <TableCell className="text-right">{asPercent(row.cronUsagePct)}</TableCell>
                          <TableCell className="text-right font-mono">{row.totalTokens.toLocaleString()}</TableCell>
                          <TableCell>
                            {row.anomaly ? (
                              <Badge variant="destructive">
                                <ShieldAlert className="mr-1 h-3 w-3" />
                                {row.anomaly}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-white">ok</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cron">
            <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
              <CardHeader>
                <CardTitle>CRON Army Registry</CardTitle>
                <CardDescription>
                  Time/event/monitor execution controls with budget and activation state.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[520px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Schedule</TableHead>
                        <TableHead>Script</TableHead>
                        <TableHead className="text-right">Budget Tokens</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.crons.map((cron) => (
                        <TableRow key={`${cron.source}-${cron.id}`}>
                          <TableCell>
                            <Badge variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-white">{cron.source}</Badge>
                          </TableCell>
                          <TableCell>{cron.agentName || (cron.agentId ? `#${cron.agentId}` : "Unassigned")}</TableCell>
                          <TableCell>{cron.cronType}</TableCell>
                          <TableCell className="font-mono text-xs">{cron.schedule || "-"}</TableCell>
                          <TableCell className="font-mono text-xs">{cron.scriptReference || "-"}</TableCell>
                          <TableCell className="text-right font-mono">{(cron.budgetTokens || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant={cron.isActive ? "secondary" : "outline"}
                              className={cron.isActive ? "bg-slate-900 text-white hover:bg-slate-900" : "border-slate-200 bg-white text-slate-700 hover:bg-white"}
                            >
                              {cron.isActive ? "active" : "paused"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8] hover:text-slate-950"
                              disabled={cronToggleMutation.isPending}
                              onClick={() =>
                                cronToggleMutation.mutate({
                                  id: cron.id,
                                  source: cron.source,
                                  isActive: !cron.isActive,
                                })
                              }
                            >
                              {cron.isActive ? "Disable" : "Enable"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
