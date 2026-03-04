import { useEffect, useMemo, useState } from "react";
import { Redirect, useLocation, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, CheckCircle2, MessageSquare, Pause, Play, ShieldAlert, UserPlus, Users, Wallet } from "lucide-react";

import { AppProBottomNav } from "@/components/agentic/AppProBottomNav";
import { AppProTopBar } from "@/components/agentic/AppProTopBar";
import { ProSideNav } from "@/components/agentic/ProSideNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSession } from "@/lib/session";

type MarketplaceAgentItem = {
  id: string;
  displayName: string;
  roleTitle: string;
  shortPitch: string;
  longDescription?: string | null;
  category: string;
  priceMonthly: number;
  currency: string;
  tags: string[];
  avatarUrl?: string | null;
  featured?: boolean;
  availability?: string;
};

type TeamItem = {
  id: number;
  display_name: string;
  status: "active" | "paused" | "cancelled";
  model_tier: string;
  salary_monthly: string | number;
  template_title?: string | null;
  goals?: string | null;
  last_message?: string | null;
};

type ThreadItem = {
  org_agent_id: number;
  display_name: string;
  status: string;
  thread_title: string;
  last_message: string | null;
  last_message_at: string | null;
};

type ThreadMessage = {
  id: number;
  sender_type: "user" | "agent" | "system";
  content: string;
  created_at: string;
};

type TaskItem = {
  id: number;
  title: string;
  status: string;
  type: string;
  org_agent_id: number;
  agent_name?: string | null;
  rejection_reason?: string | null;
  created_at: string;
};

type BillingPlan = {
  id: number;
  plan_name: string;
  monthly_fee: string | number;
  included_tokens: number;
  max_agents: number;
};

type BillingPayload = {
  summary: {
    activeAgents: number;
    monthlySalaryTotal: number;
  };
  subscription: {
    plan_name: string;
    monthly_fee: string | number;
    renewal_date?: string | null;
  } | null;
  plans: BillingPlan[];
};

const AGENTS_TAB_VALUES = ["store", "team", "inbox", "tasks", "billing"] as const;
type AgentTab = (typeof AGENTS_TAB_VALUES)[number];
const AGENTS_TAB_SET = new Set<string>(AGENTS_TAB_VALUES);

function normalizeAgentTab(value: unknown): AgentTab | null {
  const normalized = String(value || "").trim().toLowerCase();
  return AGENTS_TAB_SET.has(normalized) ? (normalized as AgentTab) : null;
}

function parseTabFromPath(pathname: string): AgentTab | null {
  const match = String(pathname || "").match(/^\/(?:pro|app)\/agents\/([^/?#]+)/i);
  if (!match?.[1]) return null;
  return normalizeAgentTab(match[1]);
}

function parseTabFromSearch(search: string): AgentTab | null {
  try {
    const tab = new URLSearchParams(search || "").get("tab");
    return normalizeAgentTab(tab);
  } catch {
    return null;
  }
}

function parseAgentIdFromSearch(search: string): number | null {
  try {
    const raw = String(new URLSearchParams(search || "").get("agentId") || "").trim();
    if (!raw) return null;
    const id = Number.parseInt(raw, 10);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function buildAgentsPath(tab: AgentTab, agentId?: number | null) {
  const base = tab === "team" ? "/pro/agents" : `/pro/agents/${tab}`;
  if (!agentId || !Number.isFinite(agentId) || agentId <= 0) return base;
  return `${base}?agentId=${encodeURIComponent(String(agentId))}`;
}

function fmtMoney(value: string | number | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "0";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(numeric);
}

export default function AppProAgentsPage() {
  const { isAuthenticated, isGuest } = useSession();
  const [location, setLocation] = useLocation();
  const [, proRouteParams] = useRoute("/pro/agents/:tab");
  const [, appRouteParams] = useRoute("/app/agents/:tab");
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<AgentTab>("team");
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [hireDialogOpen, setHireDialogOpen] = useState(false);
  const [selectedStoreAgent, setSelectedStoreAgent] = useState<MarketplaceAgentItem | null>(null);
  const [hireName, setHireName] = useState("");
  const [hireGoal, setHireGoal] = useState("");
  const [storeSearch, setStoreSearch] = useState("");
  const [storeCategory, setStoreCategory] = useState("all");
  const [storeSort, setStoreSort] = useState<"trending" | "featured" | "new">("trending");

  const bootstrap = useQuery<{
    scope: string;
    canManage: boolean;
    canOperate: boolean;
    team: TeamItem[];
  }>({
    queryKey: ["/api/ece/agents/bootstrap"],
    enabled: isAuthenticated && !isGuest,
    staleTime: 15_000,
  });

  const team = useQuery<{ items: TeamItem[] }>({
    queryKey: ["/api/ece/agents/team"],
    enabled: isAuthenticated && !isGuest,
    staleTime: 10_000,
  });

  const threads = useQuery<{ items: ThreadItem[] }>({
    queryKey: ["/api/ece/agents/threads"],
    enabled: isAuthenticated && !isGuest,
    staleTime: 8_000,
    refetchInterval: 10_000,
  });

  const messages = useQuery<{ items: ThreadMessage[]; agent?: { display_name: string } }>({
    queryKey: selectedAgentId
      ? [`/api/ece/agents/threads/${selectedAgentId}/messages?limit=200`]
      : ["__no_agent_messages__"],
    enabled: isAuthenticated && !isGuest && !!selectedAgentId,
    staleTime: 3_000,
    refetchInterval: 5_000,
  });

  const tasks = useQuery<{ items: TaskItem[] }>({
    queryKey: ["/api/ece/agents/tasks?limit=120"],
    enabled: isAuthenticated && !isGuest,
    staleTime: 5_000,
    refetchInterval: 8_000,
  });

  const billing = useQuery<BillingPayload>({
    queryKey: ["/api/ece/agents/billing"],
    enabled: isAuthenticated && !isGuest,
    staleTime: 15_000,
  });

  const marketplaceStore = useQuery<{ items: MarketplaceAgentItem[]; page: number; pageSize: number; total: number }>({
    queryKey: ["/api/marketplace/agents", storeSearch, storeCategory, storeSort],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("pageSize", "60");
      params.set("sort", storeSort);
      if (storeSearch.trim()) params.set("q", storeSearch.trim());
      if (storeCategory !== "all") params.set("category", storeCategory);
      return apiRequest(`/api/marketplace/agents?${params.toString()}`, "GET");
    },
    enabled: isAuthenticated && !isGuest,
    staleTime: 10_000,
  });

  const routeTab = useMemo(
    () => normalizeAgentTab((proRouteParams as any)?.tab || (appRouteParams as any)?.tab),
    [appRouteParams, proRouteParams],
  );

  const searchTab = useMemo(
    () => parseTabFromSearch(typeof window === "undefined" ? "" : window.location.search),
    [location],
  );

  const searchAgentId = useMemo(
    () => parseAgentIdFromSearch(typeof window === "undefined" ? "" : window.location.search),
    [location],
  );

  useEffect(() => {
    const pathTab = parseTabFromPath(location);
    const nextTab = routeTab || pathTab || searchTab || "team";
    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [activeTab, location, routeTab, searchTab]);

  useEffect(() => {
    if (!searchAgentId) return;
    if (searchAgentId !== selectedAgentId) {
      setSelectedAgentId(searchAgentId);
    }
  }, [searchAgentId, selectedAgentId]);

  useEffect(() => {
    if (selectedAgentId) return;
    const first = threads.data?.items?.[0];
    if (first?.org_agent_id) setSelectedAgentId(first.org_agent_id);
  }, [threads.data?.items, selectedAgentId]);

  const canManage = Boolean(bootstrap.data?.canManage);
  const canOperate = Boolean(bootstrap.data?.canOperate);
  const storeItems = marketplaceStore.data?.items || [];
  const teamItems = team.data?.items || bootstrap.data?.team || [];
  const threadItems = threads.data?.items || [];
  const taskItems = tasks.data?.items || [];
  const storeCategories = useMemo(() => {
    const set = new Set<string>();
    for (const item of storeItems) {
      const category = String(item.category || "").trim();
      if (category) set.add(category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [storeItems]);

  const selectedThreadLabel = useMemo(
    () => threadItems.find((thread) => thread.org_agent_id === selectedAgentId)?.display_name || "Agent",
    [threadItems, selectedAgentId],
  );

  const hireAgent = useMutation({
    mutationFn: async () => {
      if (!selectedStoreAgent) throw new Error("Select an agent");
      const parsedTemplateId = Number.parseInt(String(selectedStoreAgent.id), 10);
      if (!Number.isFinite(parsedTemplateId) || parsedTemplateId <= 0) {
        throw new Error("Invalid marketplace agent id");
      }
      return apiRequest("/api/ece/agents/hire", "POST", {
        templateId: parsedTemplateId,
        displayName: hireName.trim() || selectedStoreAgent.displayName,
        goals: hireGoal.trim() || null,
      });
    },
    onSuccess: () => {
      setHireDialogOpen(false);
      setSelectedStoreAgent(null);
      setHireName("");
      setHireGoal("");
      queryClient.invalidateQueries({ queryKey: ["/api/ece/agents/bootstrap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ece/agents/team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ece/agents/threads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ece/agents/billing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/agents"] });
      toast({ title: "Agent hired", description: "Your new team member is ready." });
    },
    onError: (error: any) => {
      toast({ title: "Hire failed", description: error?.message || "Could not hire agent", variant: "destructive" });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (params: { agentId: number; status: "active" | "paused" | "cancelled" }) =>
      apiRequest(`/api/ece/agents/team/${params.agentId}`, "PATCH", { status: params.status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ece/agents/team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ece/agents/threads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ece/agents/billing"] });
    },
  });

  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!selectedAgentId) throw new Error("Select an agent");
      const content = messageDraft.trim();
      if (!content) throw new Error("Enter a message");
      return apiRequest(`/api/ece/agents/threads/${selectedAgentId}/send`, "POST", { content });
    },
    onSuccess: () => {
      setMessageDraft("");
      queryClient.invalidateQueries({ queryKey: ["/api/ece/agents/threads"] });
      if (selectedAgentId) {
        queryClient.invalidateQueries({ queryKey: [`/api/ece/agents/threads/${selectedAgentId}/messages?limit=200`] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/ece/agents/tasks?limit=120"] });
    },
    onError: (error: any) => {
      toast({ title: "Send failed", description: error?.message || "Could not send message", variant: "destructive" });
    },
  });

  const approveTask = useMutation({
    mutationFn: async (taskId: number) => apiRequest(`/api/ece/agents/tasks/${taskId}/approve`, "POST", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ece/agents/tasks?limit=120"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ece/agents/threads"] });
      if (selectedAgentId) {
        queryClient.invalidateQueries({ queryKey: [`/api/ece/agents/threads/${selectedAgentId}/messages?limit=200`] });
      }
    },
  });

  const rejectTask = useMutation({
    mutationFn: async (taskId: number) => apiRequest(`/api/ece/agents/tasks/${taskId}/reject`, "POST", { reason: "Rejected from owner panel" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ece/agents/tasks?limit=120"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ece/agents/threads"] });
      if (selectedAgentId) {
        queryClient.invalidateQueries({ queryKey: [`/api/ece/agents/threads/${selectedAgentId}/messages?limit=200`] });
      }
    },
  });

  const subscribePlan = useMutation({
    mutationFn: async (planId: number) => apiRequest("/api/ece/agents/billing/subscribe", "POST", { planId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ece/agents/billing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ece/agents/bootstrap"] });
      toast({ title: "Plan updated", description: "Subscription changed successfully." });
    },
  });

  if (!isAuthenticated || isGuest) {
    return <Redirect to={`/pro/login?next=${encodeURIComponent(location)}`} />;
  }

  const handleTabChange = (nextTab: string, agentId?: number | null) => {
    const safeTab = normalizeAgentTab(nextTab) || "team";
    setActiveTab(safeTab);
    setLocation(buildAgentsPath(safeTab, agentId), { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-24">
      <ProSideNav activeKey="agents" />
      <div className="md:ml-56">
      <AppProTopBar subtitle="Agents" />
      <div className="px-4 pt-3">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Agents</h1>
            <p className="text-xs text-white/60 mt-1">Hire, manage, and approve agent work in one place.</p>
          </div>
          <div className="text-xs px-3 py-1 rounded-full border border-white/10 bg-white/5">
            {teamItems.filter((item) => item.status === "active").length} active agents
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="bg-white/5 border border-white/10 w-full grid grid-cols-5">
            <TabsTrigger value="store" data-testid="pro-agents-tab-trigger-store">Store</TabsTrigger>
            <TabsTrigger value="team" data-testid="pro-agents-tab-trigger-team">My Team</TabsTrigger>
            <TabsTrigger value="inbox" data-testid="pro-agents-tab-trigger-inbox">Inbox</TabsTrigger>
            <TabsTrigger value="tasks" data-testid="pro-agents-tab-trigger-tasks">Tasks</TabsTrigger>
            <TabsTrigger value="billing" data-testid="pro-agents-tab-trigger-billing">Billing</TabsTrigger>
          </TabsList>

          <TabsContent value="store" className="mt-4" data-testid="pro-agents-tab-store">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
              <Input
                value={storeSearch}
                onChange={(event) => setStoreSearch(event.target.value)}
                placeholder="Search agents..."
                className="bg-white/5 border-white/10"
              />
              <Select value={storeCategory} onValueChange={setStoreCategory}>
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700">
                  <SelectItem value="all">All categories</SelectItem>
                  {storeCategories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={storeSort} onValueChange={(next) => setStoreSort((next as "trending" | "featured" | "new") || "trending")}>
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700">
                  <SelectItem value="trending">Trending</SelectItem>
                  <SelectItem value="featured">Featured</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {storeItems.map((agent) => (
                <Card key={agent.id} className="bg-white/5 border-white/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Bot className="h-4 w-4 text-amber-300" />
                      {agent.displayName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-white/70">{agent.shortPitch || "No pitch available."}</p>
                    <div className="text-xs text-white/50">{agent.category}</div>
                    <div className="text-sm font-semibold">Salary: {fmtMoney(agent.priceMonthly)} / month</div>
                    <Button
                      className="w-full bg-amber-500 hover:bg-amber-600 text-black"
                      disabled={!canManage}
                      onClick={() => {
                        setSelectedStoreAgent(agent);
                        setHireName(agent.displayName);
                        setHireDialogOpen(true);
                      }}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Hire
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {!storeItems.length ? (
                <Card className="bg-white/5 border-white/10 sm:col-span-2 lg:col-span-3">
                  <CardContent className="p-6 text-sm text-white/70">
                    No marketplace agents found yet. Please retry in a few seconds.
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="team" className="mt-4" data-testid="pro-agents-tab-team">
            <div className="space-y-2">
              {teamItems.map((item) => (
                <Card key={item.id} className="bg-white/5 border-white/10">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{item.display_name}</div>
                      <div className="text-xs text-white/60 truncate">{item.template_title || "Agent"} • {item.model_tier}</div>
                      <div className="text-xs text-white/50 mt-1">Salary: {fmtMoney(item.salary_monthly)} / month</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="border-white/15 text-white/80"
                        onClick={() => {
                          setSelectedAgentId(item.id);
                          handleTabChange("inbox", item.id);
                        }}
                      >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Chat
                      </Button>
                      {item.status === "active" ? (
                        <Button
                          variant="outline"
                          className="border-white/15 text-white/80"
                          disabled={!canManage}
                          onClick={() => updateStatus.mutate({ agentId: item.id, status: "paused" })}
                        >
                          <Pause className="h-4 w-4 mr-2" />
                          Pause
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="border-white/15 text-white/80"
                          disabled={!canManage || item.status === "cancelled"}
                          onClick={() => updateStatus.mutate({ agentId: item.id, status: "active" })}
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Resume
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!teamItems.length ? (
                <Card className="bg-white/5 border-white/10">
                  <CardContent className="p-6 text-sm text-white/70">No agents hired yet. Go to Store to hire your first agent.</CardContent>
                </Card>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="inbox" className="mt-4" data-testid="pro-agents-tab-inbox">
            <div className="grid lg:grid-cols-[280px_1fr] gap-3">
              <Card className="bg-white/5 border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Agent Threads</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {threadItems.map((thread) => (
                    <button
                      key={thread.org_agent_id}
                      className={`w-full text-left rounded-lg px-3 py-2 border ${selectedAgentId === thread.org_agent_id ? "border-amber-400/60 bg-amber-500/10" : "border-white/10 bg-white/5"}`}
                      onClick={() => setSelectedAgentId(thread.org_agent_id)}
                    >
                      <div className="text-xs font-semibold truncate">{thread.display_name}</div>
                      <div className="text-[11px] text-white/60 truncate mt-1">{thread.last_message || "Open thread"}</div>
                    </button>
                  ))}
                  {!threadItems.length ? <div className="text-xs text-white/60">No threads yet.</div> : null}
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{selectedThreadLabel}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="h-[44vh] overflow-y-auto space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
                    {(messages.data?.items || []).map((message) => (
                      <div key={message.id} className={`flex ${message.sender_type === "user" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[85%] rounded-xl px-3 py-2 text-xs whitespace-pre-wrap ${
                            message.sender_type === "user"
                              ? "bg-amber-500 text-black"
                              : message.sender_type === "agent"
                                ? "bg-white/10 text-white"
                                : "bg-blue-500/10 border border-blue-400/20 text-blue-100"
                          }`}
                        >
                          {message.content}
                        </div>
                      </div>
                    ))}
                    {!messages.data?.items?.length ? <div className="text-xs text-white/60">Select an agent to start.</div> : null}
                  </div>

                  <div className="flex gap-2">
                    <Input
                      value={messageDraft}
                      onChange={(event) => setMessageDraft(event.target.value)}
                      placeholder="Instruct the agent..."
                      className="bg-white/5 border-white/10"
                    />
                    <Button
                      className="bg-amber-500 hover:bg-amber-600 text-black"
                      disabled={!canOperate || sendMessage.isPending || !selectedAgentId}
                      onClick={() => sendMessage.mutate()}
                    >
                      Send
                    </Button>
                  </div>
                  <div className="text-[11px] text-white/50 flex items-center gap-1">
                    <ShieldAlert className="h-3 w-3" />
                    External actions are always approval-gated.
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="tasks" className="mt-4" data-testid="pro-agents-tab-tasks">
            <div className="space-y-2">
              {taskItems.map((task) => (
                <Card key={task.id} className="bg-white/5 border-white/10">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{task.title}</div>
                      <div className="text-xs text-white/60 truncate">{task.agent_name || "Agent"} • {task.type}</div>
                      <div className="text-[11px] text-white/50 mt-1">Status: {task.status}</div>
                    </div>
                    <div className="flex gap-2">
                      {task.status === "needs_approval" ? (
                        <>
                          <Button
                            size="sm"
                            className="bg-emerald-500 hover:bg-emerald-600 text-black"
                            disabled={!canManage || approveTask.isPending}
                            onClick={() => approveTask.mutate(task.id)}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-white/15 text-white/80"
                            disabled={!canManage || rejectTask.isPending}
                            onClick={() => rejectTask.mutate(task.id)}
                          >
                            Reject
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!taskItems.length ? (
                <Card className="bg-white/5 border-white/10">
                  <CardContent className="p-6 text-sm text-white/70">No tasks yet.</CardContent>
                </Card>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="billing" className="mt-4 space-y-3" data-testid="pro-agents-tab-billing">
            <div className="grid md:grid-cols-3 gap-3">
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-4">
                  <div className="text-xs text-white/60">Current Plan</div>
                  <div className="text-lg font-semibold mt-1">{billing.data?.subscription?.plan_name || "Starter"}</div>
                </CardContent>
              </Card>
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-4">
                  <div className="text-xs text-white/60">Active Agents</div>
                  <div className="text-lg font-semibold mt-1">{billing.data?.summary?.activeAgents || 0}</div>
                </CardContent>
              </Card>
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-4">
                  <div className="text-xs text-white/60">Monthly Salaries</div>
                  <div className="text-lg font-semibold mt-1">{fmtMoney(billing.data?.summary?.monthlySalaryTotal || 0)}</div>
                </CardContent>
              </Card>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(billing.data?.plans || []).map((plan) => (
                <Card key={plan.id} className="bg-white/5 border-white/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4 text-amber-300" />{plan.plan_name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-sm font-semibold">{fmtMoney(plan.monthly_fee)} / month</div>
                    <div className="text-xs text-white/60">Max agents: {plan.max_agents}</div>
                    <div className="text-xs text-white/60">Included tokens: {fmtMoney(plan.included_tokens)}</div>
                    <Button
                      className="w-full bg-amber-500 hover:bg-amber-600 text-black"
                      disabled={!canManage || subscribePlan.isPending}
                      onClick={() => subscribePlan.mutate(plan.id)}
                    >
                      Choose plan
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={hireDialogOpen}
        onOpenChange={(open) => {
          setHireDialogOpen(open);
          if (!open) setSelectedStoreAgent(null);
        }}
      >
        <DialogContent className="bg-gray-950 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Hire Agent{selectedStoreAgent ? ` • ${selectedStoreAgent.displayName}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={hireName} onChange={(event) => setHireName(event.target.value)} className="bg-white/5 border-white/10" />
            </div>
            <div className="space-y-1">
              <Label>Mission</Label>
              <Textarea value={hireGoal} onChange={(event) => setHireGoal(event.target.value)} className="bg-white/5 border-white/10 min-h-24" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-white/15 text-white/80" onClick={() => setHireDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-amber-500 hover:bg-amber-600 text-black" onClick={() => hireAgent.mutate()} disabled={hireAgent.isPending}>
              <UserPlus className="h-4 w-4 mr-2" />
              Hire
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </div>
      <AppProBottomNav activeKey="agents" />
      </div>
    </div>
  );
}
