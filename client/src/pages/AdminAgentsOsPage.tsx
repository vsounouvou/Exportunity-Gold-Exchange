import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BarChart3, Bot, CopyPlus, Globe, Library, Network, Pencil, Plus, RefreshCw, Settings2, ShieldCheck, Sparkles, UsersRound } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type AgentsOsTab = "registry" | "studio" | "knowledge" | "marketplace" | "analytics" | "governance";

type SummaryPayload = {
  summary: {
    totalAgents: number;
    marketplaceVisible: number;
    activeAgents: number;
    draftAgents: number;
    visibleMonthlyRevenue: number;
  };
};

type AgentRow = {
  id: number;
  display_name: string;
  role_title: string;
  category: string;
  status: string;
  short_pitch: string | null;
  base_model?: string | null;
  autonomy_level?: number | null;
  marketplace_visible?: boolean;
  price_monthly?: number | string;
  currency?: string | null;
  is_featured?: boolean;
  sort_rank?: number;
  availability?: string;
  avatar_url?: string | null;
  runtime_agent_id?: number | null;
};

type ListResponse = { ok: boolean; total: number; page: number; pageSize: number; items: AgentRow[] };
type RuntimeImportResponse = {
  ok: boolean;
  imported: {
    runtimeCount: number;
    created: number;
    updated: number;
    skipped: number;
    throttled?: boolean;
  };
};
type SeedResponse = {
  ok: boolean;
  seeded: { created: number; updated: number };
  imported: RuntimeImportResponse["imported"];
};
type GovernanceNode = {
  id: number;
  displayName: string;
  roleTitle: string;
  category: string;
  status: string;
  runtimeAgentId: number | null;
  runtimeManagerId: number | null;
  managerId: number | null;
  managerName: string | null;
  isDepartmentHead: boolean;
};
type GovernanceResponse = {
  ok: boolean;
  total: number;
  roots: number;
  orphans: number;
  nodes: GovernanceNode[];
};

function useDebouncedValue<T>(value: T, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function fmtMoney(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "0";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(amount);
}

function parseTab(search: string): AgentsOsTab {
  try {
    const value = String(new URLSearchParams(search).get("tab") || "").toLowerCase();
    if (value === "registry" || value === "studio" || value === "knowledge" || value === "marketplace" || value === "analytics" || value === "governance") {
      return value;
    }
  } catch {
    // noop
  }
  return "registry";
}

export default function AdminAgentsOsPage() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const search = typeof window !== "undefined" ? window.location.search : "";
  const activeTab = parseTab(search);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createRoleTitle, setCreateRoleTitle] = useState("");
  const [createCategory, setCreateCategory] = useState("operations");
  const [createShortPitch, setCreateShortPitch] = useState("");
  const [createLongDescription, setCreateLongDescription] = useState("");
  const [createPrice, setCreatePrice] = useState("220");
  const qDebounced = useDebouncedValue(q, 250);
  const needsAgentsList = activeTab === "registry" || activeTab === "knowledge" || activeTab === "studio";
  const needsMarketplaceList = activeTab === "marketplace" || activeTab === "analytics";

  const summaryQuery = useQuery<SummaryPayload>({
    queryKey: ["/api/admin/agents-os/summary"],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const agentsQuery = useQuery<ListResponse>({
    queryKey: ["/api/admin/agents", qDebounced, statusFilter, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("pageSize", "40");
      if (qDebounced.trim()) params.set("q", qDebounced.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      return apiRequest(`/api/admin/agents?${params.toString()}`, "GET");
    },
    enabled: needsAgentsList,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const marketplaceQuery = useQuery<ListResponse>({
    queryKey: ["/api/admin/marketplace/agents", qDebounced, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("pageSize", "80");
      if (qDebounced.trim()) params.set("q", qDebounced.trim());
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      return apiRequest(`/api/admin/marketplace/agents?${params.toString()}`, "GET");
    },
    enabled: needsMarketplaceList,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const governanceQuery = useQuery<GovernanceResponse>({
    queryKey: ["/api/admin/agents-os/governance"],
    queryFn: async () => apiRequest("/api/admin/agents-os/governance", "GET"),
    enabled: activeTab === "governance",
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const categories = useMemo(() => {
    const unique = new Set<string>();
    for (const row of agentsQuery.data?.items || []) {
      const c = String(row.category || "").trim();
      if (c) unique.add(c);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [agentsQuery.data?.items]);

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents-os/summary"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/marketplace/agents"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/agents"] }),
    ]);
  };

  const createAgent = useMutation({
    mutationFn: async () =>
      apiRequest("/api/admin/agents", "POST", {
        displayName: createDisplayName,
        roleTitle: createRoleTitle || createDisplayName,
        category: createCategory,
        shortPitch: createShortPitch,
        longDescription: createLongDescription,
        priceMonthly: Number(createPrice || 0),
        status: "draft",
      }),
    onSuccess: async () => {
      toast({ title: "Agent created", description: "New draft agent added to Registry." });
      setCreateDisplayName("");
      setCreateRoleTitle("");
      setCreateShortPitch("");
      setCreateLongDescription("");
      await refreshAll();
      setLocation("/admin/agents-os?tab=registry");
    },
    onError: (error: any) => {
      toast({ title: "Create failed", description: error?.message || "Failed to create agent", variant: "destructive" });
    },
  });
  const importRuntimeAgents = useMutation({
    mutationFn: async () => apiRequest("/api/admin/agents-os/import-runtime", "POST", {}),
    onSuccess: async (payload: RuntimeImportResponse) => {
      toast({
        title: "Runtime agents imported",
        description: `${payload?.imported?.created ?? 0} created, ${payload?.imported?.updated ?? 0} updated.`,
      });
      await refreshAll();
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/agents-os/governance"] });
    },
    onError: (error: any) => {
      toast({ title: "Import failed", description: error?.message || "Could not import runtime agents", variant: "destructive" });
    },
  });

  const seedAgents = useMutation({
    mutationFn: async () => apiRequest("/api/admin/agents-os/seed", "POST", { preset: "boursedelor_core" }),
    onSuccess: async (payload: SeedResponse) => {
      toast({
        title: "Agents generated",
        description: `${payload?.seeded?.created ?? 0} generated, ${payload?.imported?.updated ?? 0} runtime agents refreshed.`,
      });
      await refreshAll();
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/agents-os/governance"] });
      setLocation("/admin/agents-os?tab=registry");
    },
    onError: (error: any) => {
      toast({ title: "Generation failed", description: error?.message || "Could not generate agents", variant: "destructive" });
    },
  });

  const setMarketplace = useMutation({
    mutationFn: async (payload: {
      id: number;
      isVisible: boolean;
      priceMonthly: number;
      currency: string;
      isFeatured: boolean;
      availability: string;
      sortRank: number;
    }) =>
      apiRequest(`/api/admin/agents/${payload.id}/marketplace`, "PUT", {
        isVisible: payload.isVisible,
        priceMonthly: payload.priceMonthly,
        currency: payload.currency,
        isFeatured: payload.isFeatured,
        availability: payload.availability,
        sortRank: payload.sortRank,
      }),
    onSuccess: async () => {
      await refreshAll();
    },
    onError: (error: any) => {
      toast({ title: "Marketplace update failed", description: error?.message || "Update failed", variant: "destructive" });
    },
  });

  const setAgentStatus = useMutation({
    mutationFn: async (payload: { id: number; action: "activate" | "retire" }) =>
      apiRequest(`/api/admin/agents/${payload.id}/${payload.action}`, "POST", {}),
    onSuccess: async () => {
      await refreshAll();
    },
    onError: (error: any) => {
      toast({ title: "Status update failed", description: error?.message || "Update failed", variant: "destructive" });
    },
  });

  const cloneAgent = useMutation({
    mutationFn: async (id: number) => apiRequest(`/api/admin/agents/${id}/clone`, "POST", { cloneReason: "studio_clone" }),
    onSuccess: async () => {
      toast({ title: "Agent cloned", description: "Clone created as draft." });
      await refreshAll();
    },
    onError: (error: any) => {
      toast({ title: "Clone failed", description: error?.message || "Could not clone agent", variant: "destructive" });
    },
  });

  const snapshotAgent = useMutation({
    mutationFn: async (id: number) => apiRequest(`/api/admin/agents/${id}/version`, "POST", { changeNote: "Manual snapshot" }),
    onSuccess: async () => {
      toast({ title: "Snapshot created", description: "Version saved." });
      await refreshAll();
    },
    onError: (error: any) => {
      toast({ title: "Snapshot failed", description: error?.message || "Could not snapshot agent", variant: "destructive" });
    },
  });

  const navigateTab = (tab: string) => {
    const safe = (tab || "registry").toLowerCase();
    setLocation(`/admin/agents-os?tab=${safe}`, { replace: true });
  };

  return (
    <div className="agents-os-light min-h-screen space-y-4 p-4 lg:p-6">
      <style>{`
        .agents-os-light {
          background: #f7f8fa;
          color: #111827;
        }
        .agents-os-light .bg-gray-900,
        .agents-os-light .bg-gray-900\\/50,
        .agents-os-light .bg-gray-900\\/60,
        .agents-os-light .bg-gray-900\\/70,
        .agents-os-light .bg-gray-900\\/80,
        .agents-os-light .bg-gray-950,
        .agents-os-light .bg-gray-950\\/30,
        .agents-os-light .bg-gray-950\\/40,
        .agents-os-light .bg-gray-950\\/50,
        .agents-os-light .bg-gray-950\\/70 {
          background: #ffffff !important;
        }
        .agents-os-light .border-gray-800,
        .agents-os-light .border-gray-800\\/70,
        .agents-os-light .border-gray-800\\/80,
        .agents-os-light .border-gray-700 {
          border-color: rgba(15, 23, 42, 0.12) !important;
        }
        .agents-os-light .text-white,
        .agents-os-light .text-gray-100,
        .agents-os-light .text-gray-200,
        .agents-os-light .text-gray-300 {
          color: #111827 !important;
        }
        .agents-os-light .text-gray-400,
        .agents-os-light .text-gray-500 {
          color: #4b5563 !important;
        }
        .agents-os-light input,
        .agents-os-light textarea,
        .agents-os-light [role="combobox"] {
          background: #ffffff !important;
          color: #111827 !important;
          border-color: rgba(15, 23, 42, 0.16) !important;
        }
        .agents-os-light [role="tablist"] {
          background: #ffffff !important;
          border-color: rgba(15, 23, 42, 0.12) !important;
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
        }
        .agents-os-light [role="tab"] {
          color: #334155 !important;
        }
        .agents-os-light [role="tab"][data-state="active"] {
          background: #f5a623 !important;
          color: #07111f !important;
        }
        .agents-os-light .bg-amber-500,
        .agents-os-light .hover\\:bg-amber-600:hover {
          background: #f5a623 !important;
          color: #07111f !important;
        }
        .agents-os-light .bg-emerald-600\\/20 {
          background: rgba(22, 163, 74, 0.12) !important;
        }
      `}</style>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-white">Agents OS</h1>
          <p className="text-xs text-gray-400">Advanced registry, versions, marketplace controls, analytics, and governance.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="border-gray-700 text-gray-100"
            onClick={() => setLocation("/operations/agents")}
          >
            <UsersRound className="h-4 w-4 mr-2" />
            Team &amp; identity
          </Button>
          <Button
            variant="outline"
            className="border-gray-700 text-gray-100"
            disabled={importRuntimeAgents.isPending}
            onClick={() => importRuntimeAgents.mutate()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Import runtime agents
          </Button>
          <Button className="bg-amber-500 hover:bg-amber-600 text-black" disabled={seedAgents.isPending} onClick={() => seedAgents.mutate()}>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate agents
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="bg-gray-900 border-gray-800"><CardContent className="p-4"><div className="text-xs text-gray-400">Total Agents</div><div className="text-xl font-semibold text-white">{summaryQuery.data?.summary.totalAgents ?? 0}</div></CardContent></Card>
        <Card className="bg-gray-900 border-gray-800"><CardContent className="p-4"><div className="text-xs text-gray-400">Marketplace Visible</div><div className="text-xl font-semibold text-white">{summaryQuery.data?.summary.marketplaceVisible ?? 0}</div></CardContent></Card>
        <Card className="bg-gray-900 border-gray-800"><CardContent className="p-4"><div className="text-xs text-gray-400">Active</div><div className="text-xl font-semibold text-white">{summaryQuery.data?.summary.activeAgents ?? 0}</div></CardContent></Card>
        <Card className="bg-gray-900 border-gray-800"><CardContent className="p-4"><div className="text-xs text-gray-400">Draft</div><div className="text-xl font-semibold text-white">{summaryQuery.data?.summary.draftAgents ?? 0}</div></CardContent></Card>
        <Card className="bg-gray-900 border-gray-800"><CardContent className="p-4"><div className="text-xs text-gray-400">Visible Revenue</div><div className="text-xl font-semibold text-white">${fmtMoney(summaryQuery.data?.summary.visibleMonthlyRevenue ?? 0)}</div></CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={navigateTab}>
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-6 bg-gray-900 border border-gray-800">
          <TabsTrigger value="registry"><Bot className="h-4 w-4 mr-1" />Registry</TabsTrigger>
          <TabsTrigger value="studio"><Plus className="h-4 w-4 mr-1" />Studio</TabsTrigger>
          <TabsTrigger value="knowledge"><Library className="h-4 w-4 mr-1" />Knowledge</TabsTrigger>
          <TabsTrigger value="marketplace"><Globe className="h-4 w-4 mr-1" />Marketplace</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 mr-1" />Analytics</TabsTrigger>
          <TabsTrigger value="governance"><ShieldCheck className="h-4 w-4 mr-1" />Governance</TabsTrigger>
        </TabsList>

        <TabsContent value="registry" className="space-y-3">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Registry</CardTitle>
              <CardDescription>Search and manage tenant agents.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search by name, role, pitch..." className="bg-gray-950 border-gray-800 text-white" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-gray-950 border-gray-800 text-white"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="retired">Retired</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="bg-gray-950 border-gray-800 text-white"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                {agentsQuery.isLoading ? (
                  <div className="text-sm text-gray-400 border border-gray-800 rounded-lg p-4">Loading agents...</div>
                ) : null}
                {(agentsQuery.data?.items || []).map((item) => (
                  <div key={item.id} className="border border-gray-800 rounded-lg p-3 bg-gray-950/50 flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-white truncate">{item.display_name}</div>
                        <Badge variant="secondary" className="bg-gray-800 text-gray-200">{item.status}</Badge>
                        {item.marketplace_visible ? <Badge className="bg-emerald-600/20 text-emerald-300 border border-emerald-500/40">visible</Badge> : null}
                      </div>
                      <div className="text-xs text-gray-400 truncate">{item.role_title} • {item.category}</div>
                      {item.short_pitch ? <div className="text-xs text-gray-500 mt-1 line-clamp-2">{item.short_pitch}</div> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {Number(item.runtime_agent_id || 0) > 0 ? (
                        <Button
                          size="sm"
                          className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                          onClick={() => setLocation(`/operations/agents/${Number(item.runtime_agent_id)}?edit=1`)}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" />Edit identity &amp; face
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-gray-700 text-gray-200"
                        onClick={() => setLocation(`/admin/agents-os/agents/${item.id}`)}
                      >
                        {Number(item.runtime_agent_id || 0) > 0 ? "Workspace" : "Edit listing"}
                      </Button>
                      <Button size="sm" variant="outline" className="border-gray-700 text-gray-200" onClick={() => snapshotAgent.mutate(item.id)}>
                        <Settings2 className="h-3.5 w-3.5 mr-1" />Snapshot
                      </Button>
                      <Button size="sm" variant="outline" className="border-gray-700 text-gray-200" onClick={() => cloneAgent.mutate(item.id)}>
                        <CopyPlus className="h-3.5 w-3.5 mr-1" />Clone
                      </Button>
                      {item.status === "active" ? (
                        <Button size="sm" variant="outline" className="border-amber-600 text-amber-300" onClick={() => setAgentStatus.mutate({ id: item.id, action: "retire" })}>
                          Retire
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="border-emerald-600 text-emerald-300" onClick={() => setAgentStatus.mutate({ id: item.id, action: "activate" })}>
                          Activate
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {!agentsQuery.data?.items?.length ? (
                  <div className="text-sm text-gray-400 border border-gray-800 rounded-lg p-4 space-y-3">
                    <div>No agents found for this tenant.</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-gray-700 text-gray-100"
                        disabled={importRuntimeAgents.isPending}
                        onClick={() => importRuntimeAgents.mutate()}
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        Import runtime agents
                      </Button>
                      <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black" disabled={seedAgents.isPending} onClick={() => seedAgents.mutate()}>
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        Generate agents
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="studio" className="space-y-3">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Studio (Create / Clone)</CardTitle>
              <CardDescription>Create new agents and clone from existing ones.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Display name</Label><Input value={createDisplayName} onChange={(event) => setCreateDisplayName(event.target.value)} className="bg-gray-950 border-gray-800 text-white" /></div>
                <div className="space-y-1"><Label>Role title</Label><Input value={createRoleTitle} onChange={(event) => setCreateRoleTitle(event.target.value)} className="bg-gray-950 border-gray-800 text-white" /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select value={createCategory} onValueChange={setCreateCategory}>
                    <SelectTrigger className="bg-gray-950 border-gray-800 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700">
                      <SelectItem value="operations">operations</SelectItem>
                      <SelectItem value="compliance">compliance</SelectItem>
                      <SelectItem value="marketing">marketing</SelectItem>
                      <SelectItem value="finance">finance</SelectItem>
                      <SelectItem value="support">support</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Price / month</Label><Input value={createPrice} onChange={(event) => setCreatePrice(event.target.value)} className="bg-gray-950 border-gray-800 text-white" /></div>
              </div>
              <div className="space-y-1"><Label>Short pitch</Label><Textarea value={createShortPitch} onChange={(event) => setCreateShortPitch(event.target.value)} className="bg-gray-950 border-gray-800 text-white min-h-16" /></div>
              <div className="space-y-1"><Label>Long description</Label><Textarea value={createLongDescription} onChange={(event) => setCreateLongDescription(event.target.value)} className="bg-gray-950 border-gray-800 text-white min-h-24" /></div>
              <Button className="bg-amber-500 hover:bg-amber-600 text-black" disabled={createAgent.isPending || !createDisplayName.trim()} onClick={() => createAgent.mutate()}>
                <Plus className="h-4 w-4 mr-2" />Create agent
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-3">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Knowledge Base</CardTitle>
              <CardDescription>Knowledge assignment is controlled per agent record.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {agentsQuery.isLoading ? <div className="text-sm text-gray-400">Loading knowledge targets...</div> : null}
              {(agentsQuery.data?.items || []).map((item) => (
                <div key={item.id} className="p-3 border border-gray-800 rounded-lg bg-gray-950/40 text-sm flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-white truncate">{item.display_name}</div>
                    <div className="text-xs text-gray-400 truncate">{item.role_title}</div>
                  </div>
                  <Button size="sm" variant="outline" className="border-gray-700 text-gray-200" onClick={() => snapshotAgent.mutate(item.id)}>
                    Snapshot config
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="marketplace" className="space-y-3">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Marketplace</CardTitle>
              <CardDescription>Chairman/Super Admin control publish visibility and pricing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {marketplaceQuery.isLoading ? <div className="text-sm text-gray-400">Loading marketplace agents...</div> : null}
              {(marketplaceQuery.data?.items || agentsQuery.data?.items || []).map((item) => (
                <div key={item.id} className="p-3 border border-gray-800 rounded-lg bg-gray-950/40 grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
                  <div className="md:col-span-2 min-w-0">
                    <div className="text-white text-sm truncate">{item.display_name}</div>
                    <div className="text-xs text-gray-400 truncate">{item.category}</div>
                  </div>
                  <div className="text-xs text-gray-300">Price: {fmtMoney(item.price_monthly)} {item.currency || "USD"}</div>
                  <div className="text-xs text-gray-300">Availability: {item.availability || "available"}</div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={Boolean(item.marketplace_visible ?? (item as any).is_visible)}
                      onCheckedChange={(checked) =>
                        setMarketplace.mutate({
                          id: item.id,
                          isVisible: checked,
                          priceMonthly: Number(item.price_monthly || 0),
                          currency: String(item.currency || "USD"),
                          isFeatured: Boolean(item.is_featured),
                          availability: String(item.availability || "available"),
                          sortRank: Number(item.sort_rank || 0),
                        })
                      }
                    />
                    <span className="text-xs text-gray-300">{Boolean(item.marketplace_visible ?? (item as any).is_visible) ? "Visible" : "Hidden"}</span>
                  </div>
                  <div className="text-right">
                    <Button
                      size="sm"
                      className="bg-amber-500 hover:bg-amber-600 text-black"
                      onClick={() =>
                        setMarketplace.mutate({
                          id: item.id,
                          isVisible: true,
                          priceMonthly: Number(item.price_monthly || 0),
                          currency: String(item.currency || "USD"),
                          isFeatured: true,
                          availability: String(item.availability || "available"),
                          sortRank: 0,
                        })
                      }
                    >
                      Feature
                    </Button>
                  </div>
                </div>
              ))}
              {!agentsQuery.data?.items?.length ? <div className="text-sm text-gray-400">No agents to publish.</div> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-3">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader><CardTitle className="text-white">Analytics</CardTitle><CardDescription>Live catalog health and publishing coverage.</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-950/40">
                <div className="text-xs text-gray-400">Catalog coverage</div>
                <div className="text-lg text-white font-semibold">
                  {summaryQuery.data?.summary.totalAgents ? Math.round(((summaryQuery.data?.summary.marketplaceVisible || 0) / Math.max(1, summaryQuery.data.summary.totalAgents)) * 100) : 0}%
                </div>
              </div>
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-950/40">
                <div className="text-xs text-gray-400">Draft backlog</div>
                <div className="text-lg text-white font-semibold">{summaryQuery.data?.summary.draftAgents || 0}</div>
              </div>
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-950/40">
                <div className="text-xs text-gray-400">Featured opportunities</div>
                <div className="text-lg text-white font-semibold">{(marketplaceQuery.data?.items || []).filter((x) => Boolean(x.is_featured)).length}</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="governance" className="space-y-3">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2"><Network className="h-4 w-4" />Governance (Hierarchy)</CardTitle>
              <CardDescription>Hierarchy tools are managed from this section.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded border border-gray-800 bg-gray-950/40 p-2 text-xs text-gray-300">
                  <div className="text-gray-500">Total</div>
                  <div className="text-white text-lg font-semibold">{governanceQuery.data?.total ?? 0}</div>
                </div>
                <div className="rounded border border-gray-800 bg-gray-950/40 p-2 text-xs text-gray-300">
                  <div className="text-gray-500">Roots</div>
                  <div className="text-white text-lg font-semibold">{governanceQuery.data?.roots ?? 0}</div>
                </div>
                <div className="rounded border border-gray-800 bg-gray-950/40 p-2 text-xs text-gray-300">
                  <div className="text-gray-500">Orphans</div>
                  <div className="text-white text-lg font-semibold">{governanceQuery.data?.orphans ?? 0}</div>
                </div>
              </div>
              {governanceQuery.isLoading ? (
                <div className="text-sm text-gray-400">Loading hierarchy...</div>
              ) : governanceQuery.data?.nodes?.length ? (
                <div className="space-y-2">
                  {governanceQuery.data.nodes.map((node) => (
                    <div key={node.id} className="p-3 border border-gray-800 rounded-lg bg-gray-950/40">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm text-white font-medium">{node.displayName}</div>
                        <Badge variant="secondary" className="bg-gray-800 text-gray-100">{node.status}</Badge>
                        {node.isDepartmentHead ? <Badge className="bg-emerald-600/20 text-emerald-200 border border-emerald-500/40">department head</Badge> : null}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{node.roleTitle} • {node.category}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Manager: {node.managerName || "Unassigned"}{node.runtimeAgentId ? ` • runtime #${node.runtimeAgentId}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-400 border border-gray-800 rounded-lg p-3">No hierarchy data found.</div>
              )}
              <div className="flex items-center gap-2">
                <Button variant="outline" className="border-gray-700 text-gray-100" onClick={() => importRuntimeAgents.mutate()} disabled={importRuntimeAgents.isPending}>
                  <RefreshCw className="h-4 w-4 mr-1.5" />
                  Refresh from runtime agents
                </Button>
                <Button variant="outline" className="border-gray-700 text-gray-100" onClick={() => setLocation("/admin/agents/governance")}>
                  Open Governance Workspace
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="text-xs text-gray-500">{location.includes("admin/agents-os") ? "" : ""}</div>
    </div>
  );
}
