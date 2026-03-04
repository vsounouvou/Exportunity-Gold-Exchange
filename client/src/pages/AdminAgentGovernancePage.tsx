import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { getDemoModeHeaders } from "@/lib/demoMode";
import { useTenant } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";

type ProductionAgentRow = {
  id: number;
  tenantId: number;
  agentId: number | null;
  agentKey: string;
  displayName: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  agentName: string | null;
  agentRole: string | null;
  agentStatus: string | null;
  agentIsTest: boolean | null;
  agentIsVisible: boolean | null;
};

type ProductionAgentsResponse = {
  ok: boolean;
  tenantId: number;
  items: ProductionAgentRow[];
};

type ConsentPlan = {
  what?: string;
  why?: string;
  forHowLong?: string;
  resources?: string[];
  howToStop?: string[];
  visibility?: string[] | string;
};

function authHeaders() {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = typeof window !== "undefined" ? localStorage.getItem("ece_session") : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const lang = typeof window !== "undefined" ? localStorage.getItem("ece_language") : null;
  if (lang) headers.set("x-ece-lang", lang);
  const demo = getDemoModeHeaders();
  for (const [k, v] of Object.entries(demo)) headers.set(k, v);
  return headers;
}

async function previewPost(url: string, body: Record<string, unknown>) {
  const resp = await fetch(resolveApiUrl(url), {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
    body: JSON.stringify(body),
  });
  const payload = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, payload };
}

export function AdminAgentGovernancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const settingsScope = useMemo(() => `tenant:${tenant?.key || "bdo"}`, [tenant?.key]);

  const [manualAgentKey, setManualAgentKey] = useState("");
  const [manualAgentId, setManualAgentId] = useState("");
  const [manualDisplayName, setManualDisplayName] = useState("");

  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [seedPlan, setSeedPlan] = useState<ConsentPlan | null>(null);
  const [seedBusy, setSeedBusy] = useState(false);

  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [purgePlan, setPurgePlan] = useState<ConsentPlan | null>(null);
  const [purgePreview, setPurgePreview] = useState<any | null>(null);
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [purgeCompanyId, setPurgeCompanyId] = useState("");
  const [purgeLimit, setPurgeLimit] = useState("2000");
  const [maxRetryInput, setMaxRetryInput] = useState("3");
  const [escalationPolicyInput, setEscalationPolicyInput] = useState("Owner agent -> IT lead -> Admin");

  const productionQuery = useQuery<ProductionAgentsResponse>({
    queryKey: ["/api/admin/agents/production"],
    staleTime: 0,
  });

  const governanceSettingsQuery = useQuery<{ settings: Record<string, any> }>({
    queryKey: [`/api/admin/settings?scope=${encodeURIComponent(settingsScope)}&prefix=AGENT_`],
    staleTime: 5_000,
  });

  useEffect(() => {
    const settings = governanceSettingsQuery.data?.settings || {};
    const maxRaw = settings.AGENT_MAX_RETRY_ATTEMPTS_PER_HOUR;
    const escalationRaw = settings.AGENT_ESCALATION_POLICY;
    if (maxRaw != null) setMaxRetryInput(String(maxRaw));
    if (typeof escalationRaw === "string" && escalationRaw.trim()) setEscalationPolicyInput(escalationRaw.trim());
  }, [governanceSettingsQuery.data?.settings]);

  const productionItems = Array.isArray(productionQuery.data?.items) ? productionQuery.data!.items : [];

  const upsertMutation = useMutation({
    mutationFn: async (payload: { agentKey: string; agentId?: number | null; displayName?: string | null; isEnabled?: boolean }) => {
      return apiRequest("/api/admin/agents/production/upsert", "POST", payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/agents/production"] });
      toast({ title: "Updated", description: "Production allowlist updated." });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error?.message || "Could not update allowlist.",
        variant: "destructive",
      });
    },
  });

  const saveGovernanceSetting = useMutation({
    mutationFn: async (payload: { key: string; value: unknown }) => {
      return apiRequest("/api/admin/settings", "POST", {
        scope: settingsScope,
        key: payload.key,
        value: payload.value,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [`/api/admin/settings?scope=${encodeURIComponent(settingsScope)}&prefix=AGENT_`],
      });
    },
    onError: (error: any) => {
      toast({
        title: "Save failed",
        description: error?.message || "Could not persist governance settings.",
        variant: "destructive",
      });
    },
  });

  const beginSeed = async () => {
    setSeedBusy(true);
    try {
      const result = await previewPost("/api/admin/agents/production/seed", { confirm: false });
      if (result.ok) {
        toast({ title: "Seeded", description: `Inserted ${Number(result.payload?.insertedCount ?? 0)} entries.` });
        await queryClient.invalidateQueries({ queryKey: ["/api/admin/agents/production"] });
        return;
      }
      if (result.status === 428 && result.payload?.requiresConsent) {
        setSeedPlan((result.payload?.plan as ConsentPlan) ?? null);
        setSeedDialogOpen(true);
        return;
      }
      toast({
        title: "Seed failed",
        description: String(result.payload?.message || result.payload?.error || "Could not seed allowlist."),
        variant: "destructive",
      });
    } finally {
      setSeedBusy(false);
    }
  };

  const confirmSeed = async () => {
    setSeedBusy(true);
    try {
      const result = await apiRequest("/api/admin/agents/production/seed", "POST", { confirm: true });
      setSeedDialogOpen(false);
      setSeedPlan(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/agents/production"] });
      toast({
        title: "Seed complete",
        description: `Inserted ${Number(result?.insertedCount ?? 0)} production agents.`,
      });
    } catch (error: any) {
      toast({
        title: "Seed failed",
        description: error?.message || "Could not seed allowlist.",
        variant: "destructive",
      });
    } finally {
      setSeedBusy(false);
    }
  };

  const beginPurgePreview = async () => {
    setPurgeBusy(true);
    try {
      const companyId = purgeCompanyId.trim() ? Number(purgeCompanyId.trim()) : null;
      const limit = purgeLimit.trim() ? Number(purgeLimit.trim()) : 2000;
      const result = await previewPost("/api/admin/agents/purge-limited", {
        confirm: false,
        ...(companyId && Number.isFinite(companyId) ? { companyId } : {}),
        ...(Number.isFinite(limit) ? { limit } : {}),
      });

      if (result.ok) {
        toast({ title: "No candidates", description: "Nothing to purge." });
        return;
      }
      if (result.status === 428 && result.payload?.requiresConsent) {
        setPurgePreview(result.payload);
        setPurgePlan((result.payload?.plan as ConsentPlan) ?? null);
        setPurgeDialogOpen(true);
        return;
      }
      toast({
        title: "Preview failed",
        description: String(result.payload?.message || result.payload?.error || "Could not preview purge."),
        variant: "destructive",
      });
    } finally {
      setPurgeBusy(false);
    }
  };

  const confirmPurge = async () => {
    setPurgeBusy(true);
    try {
      const companyId = purgeCompanyId.trim() ? Number(purgeCompanyId.trim()) : null;
      const limit = purgeLimit.trim() ? Number(purgeLimit.trim()) : 2000;
      const result = await apiRequest("/api/admin/agents/purge-limited", "POST", {
        confirm: true,
        ...(companyId && Number.isFinite(companyId) ? { companyId } : {}),
        ...(Number.isFinite(limit) ? { limit } : {}),
      });

      setPurgeDialogOpen(false);
      setPurgePreview(null);
      setPurgePlan(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/agents/production"] });
      toast({
        title: "Purge complete",
        description: `Deleted ${Number(result?.deletedCount ?? 0)} limited/test agents.`,
      });
    } catch (error: any) {
      toast({
        title: "Purge failed",
        description: error?.message || "Could not purge agents.",
        variant: "destructive",
      });
    } finally {
      setPurgeBusy(false);
    }
  };

  const allowlistStats = useMemo(() => {
    const enabled = productionItems.filter((item) => item.isEnabled).length;
    return {
      total: productionItems.length,
      enabled,
      disabled: productionItems.length - enabled,
    };
  }, [productionItems]);

  const governanceSettings = governanceSettingsQuery.data?.settings || {};
  const allowAutoJoin = Boolean(governanceSettings.AGENT_ALLOW_AUTO_JOIN === true);
  const noiseSuppression = governanceSettings.AGENT_NOISE_SUPPRESSION !== false;
  const requireReceipts = governanceSettings.AGENT_REQUIRE_RECEIPTS !== false;

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xl font-semibold text-white flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-400" />
            Agent Governance
          </div>
          <div className="text-xs text-gray-400">
            Production allowlist + safe purge of limited/test agents. Only allowlisted agents can run actions or send emails.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => productionQuery.refetch()}
            disabled={productionQuery.isFetching}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", productionQuery.isFetching ? "animate-spin" : "")} />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-lg">Conversation governance</CardTitle>
          <div className="text-xs text-gray-400">
            Controls for auto-join, noise suppression, receipt enforcement, and retry escalation.
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-md border border-gray-800 bg-slate-950/60 p-3">
              <div>
                <div className="text-sm text-white">Allow agents to auto-join chats</div>
                <div className="text-xs text-gray-400">Default OFF</div>
              </div>
              <Switch
                checked={allowAutoJoin}
                onCheckedChange={(checked) =>
                  saveGovernanceSetting.mutate({ key: "AGENT_ALLOW_AUTO_JOIN", value: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-md border border-gray-800 bg-slate-950/60 p-3">
              <div>
                <div className="text-sm text-white">Noise suppression</div>
                <div className="text-xs text-gray-400">Default ON</div>
              </div>
              <Switch
                checked={noiseSuppression}
                onCheckedChange={(checked) =>
                  saveGovernanceSetting.mutate({ key: "AGENT_NOISE_SUPPRESSION", value: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-md border border-gray-800 bg-slate-950/60 p-3">
              <div>
                <div className="text-sm text-white">Require receipts for completion</div>
                <div className="text-xs text-gray-400">Default ON</div>
              </div>
              <Switch
                checked={requireReceipts}
                onCheckedChange={(checked) =>
                  saveGovernanceSetting.mutate({ key: "AGENT_REQUIRE_RECEIPTS", value: checked })
                }
              />
            </div>

            <div className="rounded-md border border-gray-800 bg-slate-950/60 p-3 space-y-2">
              <Label className="text-xs text-gray-300">Max retry attempts per task per hour</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={maxRetryInput}
                  onChange={(e) => setMaxRetryInput(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white h-8"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/15 text-white/80 hover:bg-white/10"
                  onClick={() => {
                    const value = Number(maxRetryInput);
                    if (!Number.isFinite(value) || value <= 0) {
                      toast({ title: "Invalid value", description: "Retry cap must be a positive number.", variant: "destructive" });
                      return;
                    }
                    saveGovernanceSetting.mutate({
                      key: "AGENT_MAX_RETRY_ATTEMPTS_PER_HOUR",
                      value: Math.max(1, Math.min(24, Math.trunc(value))),
                    });
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-gray-800 bg-slate-950/60 p-3 space-y-2">
            <Label className="text-xs text-gray-300">Escalation policy</Label>
            <div className="flex items-center gap-2">
              <Input
                value={escalationPolicyInput}
                onChange={(e) => setEscalationPolicyInput(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white h-8"
              />
              <Button
                size="sm"
                variant="outline"
                className="border-white/15 text-white/80 hover:bg-white/10"
                onClick={() =>
                  saveGovernanceSetting.mutate({
                    key: "AGENT_ESCALATION_POLICY",
                    value: escalationPolicyInput.trim() || "Owner agent -> IT lead -> Admin",
                  })
                }
              >
                Save
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-lg">Production allowlist</CardTitle>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Badge variant="outline" className="border-gray-700 bg-gray-800/40 text-gray-300">
              total: {allowlistStats.total}
            </Badge>
            <Badge variant="outline" className="border-gray-700 bg-emerald-500/10 text-emerald-300">
              enabled: {allowlistStats.enabled}
            </Badge>
            <Badge variant="outline" className="border-gray-700 bg-red-500/10 text-red-300">
              disabled: {allowlistStats.disabled}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs text-gray-300">Agent key</Label>
              <Input
                value={manualAgentKey}
                onChange={(e) => setManualAgentKey(e.target.value)}
                placeholder="e.g. marketing"
                className="bg-slate-950 border-slate-800 text-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-300">Agent id (optional)</Label>
              <Input
                value={manualAgentId}
                onChange={(e) => setManualAgentId(e.target.value)}
                placeholder="e.g. 42"
                className="bg-slate-950 border-slate-800 text-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-300">Display name (optional)</Label>
              <Input
                value={manualDisplayName}
                onChange={(e) => setManualDisplayName(e.target.value)}
                placeholder="e.g. Marketing Director"
                className="bg-slate-950 border-slate-800 text-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
              disabled={upsertMutation.isPending}
              onClick={() => {
                const key = manualAgentKey.trim();
                if (!key) {
                  toast({ title: "Agent key required", description: "Provide an agent key.", variant: "destructive" });
                  return;
                }
                const agentId = manualAgentId.trim() ? Number(manualAgentId.trim()) : null;
                upsertMutation.mutate({
                  agentKey: key,
                  agentId: agentId && Number.isFinite(agentId) ? agentId : null,
                  displayName: manualDisplayName.trim() || null,
                  isEnabled: true,
                });
              }}
            >
              {upsertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add / Enable
            </Button>
            <Button
              variant="outline"
              className="border-white/15 text-white/80 hover:bg-white/10"
              disabled={seedBusy}
              onClick={() => void beginSeed()}
            >
              {seedBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Seed from active agents
            </Button>
          </div>

          {productionQuery.isLoading ? (
            <div className="text-sm text-gray-400">Loading…</div>
          ) : productionQuery.isError ? (
            <div className="text-sm text-red-300">Failed to load allowlist.</div>
          ) : productionItems.length === 0 ? (
            <div className="text-sm text-gray-400">No allowlisted agents yet.</div>
          ) : (
            <Table className="text-white/90">
              <TableHeader>
                <TableRow className="border-gray-800">
                  <TableHead className="text-gray-400">Enabled</TableHead>
                  <TableHead className="text-gray-400">Key</TableHead>
                  <TableHead className="text-gray-400">Agent</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                  <TableHead className="text-gray-400 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productionItems.map((item) => {
                  const status = String(item.agentStatus || "").trim() || "—";
                  return (
                    <TableRow key={String(item.id)} className="border-gray-800 hover:bg-white/5">
                      <TableCell>
                        <Switch
                          checked={Boolean(item.isEnabled)}
                          onCheckedChange={(checked) => {
                            upsertMutation.mutate({
                              agentKey: item.agentKey,
                              agentId: item.agentId,
                              displayName: item.displayName,
                              isEnabled: checked,
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.agentKey}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium text-white">{item.agentName || item.displayName || "—"}</div>
                        <div className="text-[11px] text-gray-400 truncate">{item.agentRole || "—"}</div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] border-gray-700",
                            status === "active" ? "bg-emerald-500/10 text-emerald-300" : "bg-gray-800/40 text-gray-300",
                          )}
                        >
                          {status}
                        </Badge>
                        {item.agentIsTest ? (
                          <Badge variant="outline" className="ml-2 text-[10px] bg-red-500/10 text-red-300 border-red-500/30">
                            test
                          </Badge>
                        ) : null}
                        {item.agentIsVisible === false ? (
                          <Badge variant="outline" className="ml-2 text-[10px] bg-gray-800/40 text-gray-300 border-gray-700">
                            hidden
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-white/15 text-white/80 hover:bg-white/10"
                          disabled={upsertMutation.isPending}
                          onClick={() => {
                            upsertMutation.mutate({
                              agentKey: item.agentKey,
                              agentId: item.agentId,
                              displayName: item.displayName,
                              isEnabled: false,
                            });
                          }}
                        >
                          Disable
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-lg">Purge limited/test agents</CardTitle>
          <div className="text-xs text-gray-400">
            Hard delete demo/limited/test agents (confirm-gated). Removes their messages, memberships, tasks, and other test artifacts.
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-300">Company id (optional)</Label>
              <Input
                value={purgeCompanyId}
                onChange={(e) => setPurgeCompanyId(e.target.value)}
                placeholder="All companies"
                className="bg-slate-950 border-slate-800 text-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-300">Scan limit</Label>
              <Input
                value={purgeLimit}
                onChange={(e) => setPurgeLimit(e.target.value)}
                placeholder="2000"
                className="bg-slate-950 border-slate-800 text-white"
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                className="w-full border-white/15 text-white/80 hover:bg-white/10"
                disabled={purgeBusy}
                onClick={() => void beginPurgePreview()}
              >
                {purgeBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Preview purge
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={seedDialogOpen} onOpenChange={setSeedDialogOpen}>
        <DialogContent className="bg-gray-950 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle>Confirm allowlist seed</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-white/85">
            {seedPlan ? (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
                {seedPlan.what ? <div><span className="text-white/70">What:</span> {seedPlan.what}</div> : null}
                {seedPlan.why ? <div><span className="text-white/70">Why:</span> {seedPlan.why}</div> : null}
                {seedPlan.forHowLong ? <div><span className="text-white/70">For:</span> {seedPlan.forHowLong}</div> : null}
                {seedPlan.resources?.length ? <div className="text-white/70">Resources: {seedPlan.resources.join(", ")}</div> : null}
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/15 text-white/80 hover:bg-white/10"
                onClick={() => setSeedDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
                onClick={() => void confirmSeed()}
                disabled={seedBusy}
              >
                {seedBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Confirm & seed
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={purgeDialogOpen} onOpenChange={setPurgeDialogOpen}>
        <DialogContent className="bg-gray-950 border-gray-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirm purge</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-white/85">
            {purgePlan ? (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
                {purgePlan.what ? <div><span className="text-white/70">What:</span> {purgePlan.what}</div> : null}
                {purgePlan.why ? <div><span className="text-white/70">Why:</span> {purgePlan.why}</div> : null}
                {purgePlan.forHowLong ? <div><span className="text-white/70">For:</span> {purgePlan.forHowLong}</div> : null}
                {purgePreview?.candidateCount != null ? (
                  <div><span className="text-white/70">Candidates:</span> {String(purgePreview.candidateCount)}</div>
                ) : null}
              </div>
            ) : null}

            {Array.isArray(purgePreview?.sample) && purgePreview.sample.length ? (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/70 mb-2">Sample (first 50)</div>
                <div className="max-h-[220px] overflow-auto space-y-1">
                  {purgePreview.sample.map((row: any) => (
                    <div key={String(row.id)} className="text-xs text-white/80 flex items-center justify-between gap-2">
                      <span className="truncate">
                        #{row.id} — {String(row.name || "agent")} ({String(row.role || "role")})
                      </span>
                      <span className="text-white/50">{String(row.env || "")} • {String(row.status || "")}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/15 text-white/80 hover:bg-white/10"
                onClick={() => setPurgeDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-red-500 hover:bg-red-600 text-white font-semibold"
                onClick={() => void confirmPurge()}
                disabled={purgeBusy}
              >
                {purgeBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Confirm & delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminAgentGovernancePage;
