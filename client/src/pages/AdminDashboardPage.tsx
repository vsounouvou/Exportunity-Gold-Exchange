import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/use-company";
import {
  Activity,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock,
  Coins,
  DollarSign,
  Image,
  ImageDown,
  Mail,
  Megaphone,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Store,
  Target,
  Truck,
  Users,
} from "lucide-react";

type MarketplaceStats = {
  sellers: { total: number; approved: number; pending: number };
  products: { total: number; active: number };
  orders: { total: number; completed: number };
  revenue: { total: number };
};

type Seller = {
  id: number;
  shopName: string;
  slug: string;
  status: "pending" | "approved" | "rejected" | string;
  createdAt?: string;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
};

type AdminOrdersResponse = {
  orders: Array<{
    id: number;
    orderNumber: string;
    status: string;
    total: string;
    buyerName: string | null;
    buyerPhone: string | null;
    deliveryAddress: string | null;
    createdAt: string;
    seller?: { id: number; shopName: string } | null;
    itemsCount: number;
    previewImage?: string | null;
  }>;
};

type AiStatus = {
  config: {
    aiEnabled: boolean;
    aiBackgroundEnabled: boolean;
    cfoAgentEnabled: boolean;
    aiBackgroundAutoStart: boolean;
    cfoAgentAutoStart: boolean;
    actionsWorkerEnabled: boolean;
  };
  processes: {
    backgroundConversations: { hasSocketServer: boolean; running: boolean };
    cfoAgent: { running: boolean; monitorIntervalRunning: boolean };
    actionsRunner: {
      enabled: boolean;
      running: boolean;
      healthy: boolean;
      intervalMs: number;
      heartbeatAgeMs: number | null;
      lastHeartbeatAt: string | null;
      staleThresholdMs: number;
      lastError: string | null;
    };
  };
  backgroundSessions?: {
    activeSessionId: string | null;
    tokenEstimatePerSec: number;
    items: Array<{
      id: string;
      status: "RUNNING" | "PAUSED" | "STOPPED" | "COMPLETED" | string;
      durationSec: number;
      tokenBudget: number;
      tokenSpendEstimate: number;
      goalText: string;
      hardStopAt: string | null;
      stopReason: string | null;
      visibility: string;
    }>;
  };
};

type AiProvidersStatus = {
  aiEnabled: boolean;
  providers: {
    openai: { configured: boolean };
    claude: { configured: boolean };
    gemini: { configured: boolean };
  };
};

type AiRoutingResponse = {
  companyId: number;
  aiRouting: {
    strategy: "balanced" | "cheapest" | "quality";
    allowedProviders: Array<"openai" | "claude" | "gemini">;
    forcedProvider: "openai" | "claude" | "gemini" | null;
  };
};

type GoldMarginSettingsResponse = {
  scope: string;
  key: string;
  value: number;
  percent: number;
};

function formatXof(value: number) {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);
}

export default function AdminDashboardPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedCompanyId, companies, isLoading: companiesLoading } = useCompany();
  const [aiDurationMinutes, setAiDurationMinutes] = useState<number>(10);
  const [routingTouched, setRoutingTouched] = useState(false);
  const [routingDraft, setRoutingDraft] = useState<AiRoutingResponse["aiRouting"]>({
    strategy: "balanced",
    allowedProviders: ["claude", "gemini", "openai"],
    forcedProvider: null,
  });
  const [goldMarginDraft, setGoldMarginDraft] = useState("5");
  const [goldMarginTouched, setGoldMarginTouched] = useState(false);
  const effectiveCompanyId =
    selectedCompanyId ??
    companies.find((c) => c.name.toLowerCase().replace(/\s+/g, " ").trim() === "exportunity gold exchange")?.id ??
    companies[0]?.id ??
    null;

  const statsQuery = useQuery<MarketplaceStats>({
    queryKey: ["/api/marketplace/dashboard/stats"],
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const sellersQuery = useQuery<Seller[]>({
    queryKey: ["/api/marketplace/sellers"],
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const ordersQuery = useQuery<AdminOrdersResponse>({
    queryKey: ["/api/marketplace/admin/orders?limit=20"],
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const goldPriceQuery = useQuery<any>({
    queryKey: ["/api/marketplace/gold-price"],
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const fxRatesQuery = useQuery<any>({
    queryKey: ["/api/marketplace/fx-rates"],
    refetchInterval: 30 * 60_000,
    staleTime: 10 * 60_000,
  });

  const goldMarginQuery = useQuery<GoldMarginSettingsResponse>({
    queryKey: ["/api/admin/settings/pricing/gold-margin"],
    staleTime: 10_000,
  });

  const aiStatusQuery = useQuery<AiStatus>({
    queryKey: ["/api/ai/status"],
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const aiProvidersQuery = useQuery<AiProvidersStatus>({
    queryKey: ["/api/ai/providers"],
    staleTime: 30_000,
  });

  const aiRoutingQuery = useQuery<AiRoutingResponse>({
    queryKey: effectiveCompanyId ? [`/api/companies/${effectiveCompanyId}/ai-routing`] : ["__no_company_ai_routing__"],
    enabled: !!effectiveCompanyId,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!routingTouched && aiRoutingQuery.data?.aiRouting) {
      setRoutingDraft(aiRoutingQuery.data.aiRouting);
    }
  }, [aiRoutingQuery.data?.companyId, aiRoutingQuery.data?.aiRouting, routingTouched]);

  useEffect(() => {
    if (!goldMarginTouched && goldMarginQuery.data?.percent != null) {
      setGoldMarginDraft(String(goldMarginQuery.data.percent));
    }
  }, [goldMarginQuery.data?.percent, goldMarginTouched]);

  const saveAiRouting = useMutation({
    mutationFn: async () => {
      if (!effectiveCompanyId) throw new Error(companiesLoading ? "Loading company..." : "No company found");
      return apiRequest(`/api/companies/${effectiveCompanyId}/ai-routing`, {
        method: "PATCH",
        body: JSON.stringify(routingDraft),
      });
    },
    onSuccess: async () => {
      setRoutingTouched(false);
      if (effectiveCompanyId) {
        queryClient.invalidateQueries({ queryKey: [`/api/companies/${effectiveCompanyId}/ai-routing`] });
        queryClient.invalidateQueries({ queryKey: [`/api/companies/${effectiveCompanyId}`] });
      }
      toast({ title: "Saved", description: "LLM routing settings updated" });
    },
    onError: (error: any) => {
      toast({ title: "Save failed", description: error?.message || "Failed to update routing", variant: "destructive" });
    },
  });

  const pendingSellers = useMemo(() => {
    const all = sellersQuery.data ?? [];
    return all.filter((s) => s.status === "pending");
  }, [sellersQuery.data]);

  const approveSeller = useMutation({
    mutationFn: async (sellerId: number) => apiRequest(`/api/marketplace/sellers/${sellerId}/approve`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/sellers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/dashboard/stats"] });
      toast({ title: "Seller approved" });
    },
    onError: (error: any) => toast({ title: "Approve failed", description: error.message, variant: "destructive" }),
  });

  const rejectSeller = useMutation({
    mutationFn: async (sellerId: number) =>
      apiRequest(`/api/marketplace/sellers/${sellerId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: "Rejected by admin" }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/sellers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/dashboard/stats"] });
      toast({ title: "Seller rejected" });
    },
    onError: (error: any) => toast({ title: "Reject failed", description: error.message, variant: "destructive" }),
  });

  const seedBureaus = useMutation({
    mutationFn: async () => apiRequest("/api/gold-exchange/seed-bureaus", { method: "POST" }),
    onSuccess: () => toast({ title: "Bureaus seeded", description: "Bureau d'Achat data loaded." }),
    onError: (error: any) => toast({ title: "Seed failed", description: error.message, variant: "destructive" }),
  });

  const seedGoldMines = useMutation({
    mutationFn: async () => apiRequest("/api/marketplace/seed-gold-mines", { method: "POST" }),
    onSuccess: () => toast({ title: "Gold mines seeded" }),
    onError: (error: any) => toast({ title: "Seed failed", description: error.message, variant: "destructive" }),
  });

  const saveGoldMargin = useMutation({
    mutationFn: async () => {
      const percent = Number(goldMarginDraft);
      if (!Number.isFinite(percent)) throw new Error("Enter a valid margin percent");
      return apiRequest("/api/admin/settings/pricing/gold-margin", {
        method: "PUT",
        body: JSON.stringify({ percent }),
      });
    },
    onSuccess: async () => {
      setGoldMarginTouched(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/pricing/gold-margin"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/marketplace/gold-price"] }),
      ]);
      toast({ title: "Pricing updated", description: "Platform gold margin saved." });
    },
    onError: (error: any) => {
      toast({ title: "Save failed", description: error?.message || "Failed to update gold margin", variant: "destructive" });
    },
  });

  const aiStartBackground = useMutation({
    mutationFn: async () => {
      const companyId = selectedCompanyId ? Number(selectedCompanyId) : null;
      if (!companyId || !Number.isFinite(companyId)) {
        throw new Error("Select a company before starting background sessions.");
      }

      const companyName = (companies || []).find((c: any) => Number(c?.id) === companyId)?.name || "Company";
      const agenda = `${companyName} agenda catch-up: status, blockers, decisions, and next actions with owners + deadlines.`;

      const agents = await apiRequest("/api/agents");
      const participants = Array.isArray(agents)
        ? agents
            .filter((a: any) => Number(a?.companyId) === companyId && String(a?.status || "") === "active")
            .slice(0, 3)
            .map((a: any) => Number(a.id))
            .filter((id: any) => Number.isInteger(id) && id > 0)
        : [];

      if (participants.length < 2) {
        throw new Error("Need at least 2 active agents in this company to start background sessions.");
      }

      await apiRequest("/api/ai/background/config", "POST", {
        enabled: true,
        intervalMinutes: Math.max(5, Math.min(240, Math.trunc(aiDurationMinutes || 10))),
        topic: agenda,
        companyId,
        participantAgentIds: participants,
      });

      return apiRequest("/api/ai/background/start", {
        method: "POST",
        body: JSON.stringify({
          confirm: true,
          durationMinutes: aiDurationMinutes,
          goalText: agenda,
          companyId,
          participantAgentIds: participants,
          visibility: "admin",
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/status"] });
      toast({ title: "Background AI started", description: `Duration: ${aiDurationMinutes} minutes` });
    },
    onError: (error: any) => toast({ title: "Cannot start", description: error.message, variant: "destructive" }),
  });

  const aiStopBackground = useMutation({
    mutationFn: async (sessionId?: string) =>
      apiRequest("/api/ai/background/stop", {
        method: "POST",
        body: JSON.stringify(sessionId ? { sessionId } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/status"] });
      toast({ title: "Background AI stopped" });
    },
    onError: (error: any) => toast({ title: "Stop failed", description: error.message, variant: "destructive" }),
  });

  const aiPauseBackgroundSession = useMutation({
    mutationFn: async (sessionId: string) =>
      apiRequest(`/api/ai/background/sessions/${encodeURIComponent(sessionId)}/pause`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/status"] });
      toast({ title: "Background session paused" });
    },
    onError: (error: any) => toast({ title: "Pause failed", description: error.message, variant: "destructive" }),
  });

  const aiResumeBackgroundSession = useMutation({
    mutationFn: async (sessionId: string) =>
      apiRequest(`/api/ai/background/sessions/${encodeURIComponent(sessionId)}/resume`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/status"] });
      toast({ title: "Background session resumed" });
    },
    onError: (error: any) => toast({ title: "Resume failed", description: error.message, variant: "destructive" }),
  });

  const aiStartCfo = useMutation({
    mutationFn: async () =>
      apiRequest("/api/ai/cfo/start", {
        method: "POST",
        body: JSON.stringify({ confirm: true, durationMinutes: aiDurationMinutes }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/status"] });
      toast({ title: "CFO monitoring started", description: `Duration: ${aiDurationMinutes} minutes` });
    },
    onError: (error: any) => toast({ title: "Cannot start", description: error.message, variant: "destructive" }),
  });

  const aiStopCfo = useMutation({
    mutationFn: async () => apiRequest("/api/ai/cfo/stop", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/status"] });
      toast({ title: "CFO monitoring stopped" });
    },
    onError: (error: any) => toast({ title: "Stop failed", description: error.message, variant: "destructive" }),
  });

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/dashboard/stats"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/sellers"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/admin/orders?limit=20"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/gold-price"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/fx-rates"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/pricing/gold-margin"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/ai/status"] }),
    ]);
  };

  const gold = goldPriceQuery.data;
  const fx = fxRatesQuery.data;
  const goldMarginPercent = Number(goldMarginQuery.data?.percent ?? (Number(gold?.platform?.marginPercent || 0) * 100));
  const marketSpotPerGramXof = Number(gold?.market?.pure24KPerGramXOF || 0);
  const platformPerGramXof = Number(gold?.platform?.pure24KPerGramXOF || 0);
  const effectiveFx = fx?.effectiveRates || fx?.rates || {};
  const baseFx = fx?.baseRates || {};
  const fxHasOverride = Boolean(fx?.overrideApplied);
  const fxIsStale = Boolean(fx?.isStale);
  const fxUpdatedLabel = fx?.updatedAt ? new Date(fx.updatedAt).toLocaleString() : "--";
  const ai = aiStatusQuery.data;
  const activeBackgroundSession =
    ai?.backgroundSessions?.items?.find((session) => session.id === ai?.backgroundSessions?.activeSessionId) ?? null;
  const actionsRunner = ai?.processes.actionsRunner;
  const actionsRunnerOffline = Boolean(
    actionsRunner && actionsRunner.enabled && (!actionsRunner.running || !actionsRunner.healthy),
  );
  const stats = statsQuery.data;
  const mediaLinks = [
    { href: "/admin/media/assets", title: "Asset Studio", desc: "Generate, upload, set active assets", icon: ImageDown },
    { href: "/admin/media/debug", title: "Media Debug", desc: "Token/storage checks + test generation", icon: Image },
    { href: "/admin/email", title: "Email", desc: "Agent mailboxes, threads, and test sends", icon: Mail },
    { href: "/marketing", title: "Marketing", desc: "Campaigns and content", icon: Megaphone },
    { href: "/client-hunter", title: "Leads & Campaigns", desc: "AI discovery and scoring", icon: Target },
    { href: "/sales", title: "Sales", desc: "Pipeline and leads", icon: DollarSign },
  ];

  return (
    <div className="admin-dashboard-light p-4 md:p-6 space-y-6 pb-24">
      <style>{`
        .admin-dashboard-light {
          min-height: 100vh;
          background: #f7f8fa;
          color: #111827;
        }
        .admin-dashboard-light .bg-gray-900,
        .admin-dashboard-light .bg-gray-900\\/50,
        .admin-dashboard-light .bg-gray-900\\/60,
        .admin-dashboard-light .bg-gray-900\\/70,
        .admin-dashboard-light .bg-gray-950,
        .admin-dashboard-light .bg-gray-950\\/30,
        .admin-dashboard-light .bg-gray-950\\/40,
        .admin-dashboard-light .bg-gray-950\\/70,
        .admin-dashboard-light .bg-gray-900\\/80 {
          background: #ffffff !important;
        }
        .admin-dashboard-light .border-gray-800,
        .admin-dashboard-light .border-gray-800\\/70,
        .admin-dashboard-light .border-gray-800\\/80,
        .admin-dashboard-light .border-gray-700 {
          border-color: rgba(15, 23, 42, 0.12) !important;
        }
        .admin-dashboard-light .text-white,
        .admin-dashboard-light .text-gray-100,
        .admin-dashboard-light .text-gray-200,
        .admin-dashboard-light .text-gray-300 {
          color: #111827 !important;
        }
        .admin-dashboard-light .text-gray-400,
        .admin-dashboard-light .text-gray-500 {
          color: #4b5563 !important;
        }
        .admin-dashboard-light input,
        .admin-dashboard-light textarea,
        .admin-dashboard-light [role="combobox"] {
          background: #ffffff !important;
          color: #111827 !important;
          border-color: rgba(15, 23, 42, 0.16) !important;
        }
        .admin-dashboard-light .bg-black\\/40,
        .admin-dashboard-light .bg-red-950\\/40 {
          background: #fff7ed !important;
          color: #7f1d1d !important;
        }
        .admin-dashboard-light .bg-amber-500,
        .admin-dashboard-light .hover\\:bg-amber-600:hover {
          background: #f5a623 !important;
          color: #07111f !important;
        }
        .admin-dashboard-light .bg-green-600 {
          background: #16a34a !important;
          color: #ffffff !important;
        }
      `}</style>
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-gray-400 text-sm">
            Marketplace control center for the platform — approvals, monitoring, and automations.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <Button variant="outline" onClick={refreshAll} className="border-gray-800 w-full sm:w-auto">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Link href="/ai-team">
            <Button className="bg-amber-500 text-black hover:bg-amber-600 w-full sm:w-auto">
              Open Operations Center
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
              <Store className="h-4 w-4 text-amber-400" /> Sellers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats?.sellers.total ?? "--"}</div>
            <div className="text-xs text-gray-400 mt-1">
              <span className="text-green-400">{stats?.sellers.approved ?? 0} approved</span>
              {" · "}
              <span className="text-yellow-400">{stats?.sellers.pending ?? 0} pending</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
              <Package className="h-4 w-4 text-amber-400" /> Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats?.products.total ?? "--"}</div>
            <div className="text-xs text-gray-400 mt-1">
              <span className="text-green-400">{stats?.products.active ?? 0} active</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-amber-400" /> Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats?.orders.total ?? "--"}</div>
            <div className="text-xs text-gray-400 mt-1">
              <span className="text-green-400">{stats?.orders.completed ?? 0} delivered</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
              <Banknote className="h-4 w-4 text-amber-400" /> Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {stats?.revenue?.total !== undefined ? formatXof(Number(stats.revenue.total)) : "—"}
            </div>
            <div className="text-xs text-gray-400 mt-1">Delivered orders total</div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Image className="h-5 w-5" /> Media & Growth
          </CardTitle>
          <CardDescription>Image generation, media, marketing, and sales tools.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {mediaLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <div className="p-4 rounded-lg bg-gray-950 border border-gray-800 hover:border-amber-500/40 transition-colors cursor-pointer h-full">
                <div className="flex items-center gap-2 text-white font-medium">
                  <link.icon className="h-4 w-4 text-amber-400" />
                  {link.title}
                </div>
                <div className="text-xs text-gray-400 mt-1">{link.desc}</div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Tabs defaultValue="marketplace">
        <TabsList className="bg-gray-900 border border-gray-800">
          <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
          <TabsTrigger value="automations">Automations</TabsTrigger>
          <TabsTrigger value="ai">AI Controls</TabsTrigger>
          <TabsTrigger value="modules">Modules</TabsTrigger>
        </TabsList>

        <TabsContent value="marketplace" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="bg-gray-900 border-gray-800 lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Users className="h-5 w-5" /> Pending Seller Approvals
                </CardTitle>
                <CardDescription>{pendingSellers.length} sellers waiting for approval</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {sellersQuery.isLoading ? (
                  <div className="text-gray-400 text-sm">Loading…</div>
                ) : pendingSellers.length === 0 ? (
                  <div className="text-gray-400 text-sm">No pending sellers.</div>
                ) : (
                  pendingSellers.slice(0, 8).map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-950 border border-gray-800">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-white font-medium truncate">{s.shopName}</div>
                          <Badge variant="outline" className="border-yellow-500/40 text-yellow-400">
                            pending
                          </Badge>
                        </div>
                        <div className="text-xs text-gray-400 truncate">{s.email || s.phoneNumber || s.slug || "--"}</div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          disabled={approveSeller.isPending}
                          onClick={() => approveSeller.mutate(s.id)}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={rejectSeller.isPending}
                          onClick={() => rejectSeller.mutate(s.id)}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))
                )}
                <Separator className="bg-gray-800" />
                <div className="flex justify-end">
                  <Link href="/marketplace/sellers">
                    <Button variant="outline" className="border-gray-800">
                      Open Sellers Manager
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Activity className="h-5 w-5" /> Market Signals
                </CardTitle>
                <CardDescription>Gold price + FX rates</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded-lg bg-gray-950 border border-gray-800">
                  <div className="text-xs text-gray-400">Gold (USD/oz)</div>
                  <div className="text-white font-semibold text-lg">{gold?.lbma?.priceUSD ? `${gold.lbma.priceUSD}` : "--"}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    24h:{" "}
                    <span className={gold?.lbma?.isUp ? "text-green-400" : "text-red-400"}>
                      {gold?.lbma?.change24h ?? "--"}%
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-gray-950 border border-gray-800">
                  <div className="text-xs text-gray-400">FX (USD base)</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                    <Badge variant="outline" className={fxIsStale ? "border-red-500/40 text-red-300" : "border-green-500/40 text-green-300"}>
                      {fxIsStale ? "stale" : "fresh"}
                    </Badge>
                    <Badge variant="outline" className={fxHasOverride ? "border-amber-500/40 text-amber-300" : "border-gray-700 text-gray-300"}>
                      {fxHasOverride ? "override active" : "provider base"}
                    </Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center justify-between text-gray-300">
                      <span>EUR</span>
                      <span className="font-medium">{effectiveFx?.EUR ?? "--"}</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-300">
                      <span>GBP</span>
                      <span className="font-medium">{effectiveFx?.GBP ?? "--"}</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-300">
                      <span>KES</span>
                      <span className="font-medium">{effectiveFx?.KES ?? "--"}</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-300">
                      <span>XOF</span>
                      <span className="font-medium">{effectiveFx?.XOF ?? "--"}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-[10px] text-gray-500">
                    Updated: {fxUpdatedLabel}
                    {fxHasOverride ? ` | base XOF ${baseFx?.XOF ?? "--"}` : ""}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-gray-950 border border-gray-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-gray-400">Platform Gold Margin</div>
                      <div className="text-white font-semibold text-lg">{Number.isFinite(goldMarginPercent) ? `${goldMarginPercent.toFixed(2)}%` : "--"}</div>
                      <div className="mt-1 text-[10px] text-gray-500">
                        Applied to marketplace prices and orders. Chart remains spot-market only.
                      </div>
                    </div>
                    <Badge variant="outline" className="border-amber-500/40 text-amber-300">
                      tenant scoped
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <Input
                      inputMode="decimal"
                      value={goldMarginDraft}
                      onChange={(event) => {
                        setGoldMarginDraft(event.target.value);
                        setGoldMarginTouched(true);
                      }}
                      placeholder="5"
                      className="border-gray-800 bg-gray-900 text-white"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="bg-amber-500 text-black hover:bg-amber-600"
                      disabled={saveGoldMargin.isPending}
                      onClick={() => saveGoldMargin.mutate()}
                    >
                      Save %
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-gray-800 bg-gray-900/80 px-2.5 py-2">
                      <div className="text-gray-400">Spot XOF / g</div>
                      <div className="mt-1 font-medium text-white">{marketSpotPerGramXof > 0 ? formatXof(marketSpotPerGramXof) : "--"}</div>
                    </div>
                    <div className="rounded-md border border-gray-800 bg-gray-900/80 px-2.5 py-2">
                      <div className="text-gray-400">Marketplace XOF / g</div>
                      <div className="mt-1 font-medium text-white">{platformPerGramXof > 0 ? formatXof(platformPerGramXof) : "--"}</div>
                    </div>
                  </div>
                </div>
                <Link href="/seller-dashboard">
                  <Button className="w-full bg-amber-500 text-black hover:bg-amber-600">
                    Open Seller Ops
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
                <Link href="/admin/settings/fx">
                  <Button variant="outline" className="w-full border-gray-800">
                    Manage FX Settings
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" /> Recent Orders
              </CardTitle>
              <CardDescription>Last 20 orders (all sellers)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {ordersQuery.isLoading ? (
                <div className="text-gray-400 text-sm">Loading…</div>
              ) : (ordersQuery.data?.orders?.length ?? 0) === 0 ? (
                <div className="text-gray-400 text-sm">No orders yet.</div>
              ) : (
                ordersQuery.data!.orders.slice(0, 10).map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-950 border border-gray-800">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-white font-medium">{o.orderNumber}</div>
                        <Badge variant="outline" className="border-gray-700 text-gray-300">
                          {o.status}
                        </Badge>
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(o.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 truncate">
                        Seller: {o.seller?.shopName || "--"} · Items: {o.itemsCount} · Buyer: {o.buyerName || o.buyerPhone || "--"}
                      </div>
                    </div>
                    <div className="text-white font-semibold">{formatXof(Number(o.total))} XOF</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automations" className="space-y-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" /> One-click Operations
              </CardTitle>
              <CardDescription>Run admin automations on demand (no background execution).</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="border-gray-800 justify-start"
                disabled={seedBureaus.isPending}
                onClick={() => seedBureaus.mutate()}
              >
                <ShieldCheck className="h-4 w-4 mr-2" />
                Seed Bureau d’Achat directory
              </Button>
              <Button
                variant="outline"
                className="border-gray-800 justify-start"
                disabled={seedGoldMines.isPending}
                onClick={() => seedGoldMines.mutate()}
              >
                <PickaxeIcon />
                Seed gold mines (demo)
              </Button>
              <Link href="/delivery/admin">
                <Button variant="outline" className="border-gray-800 justify-start w-full">
                  <Truck className="h-4 w-4 mr-2" />
                  Open Delivery Admin
                </Button>
              </Link>
              <Link href="/whatsapp">
                <Button variant="outline" className="border-gray-800 justify-start w-full">
                  <Users className="h-4 w-4 mr-2" />
                  Open WhatsApp Inbox
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Coins className="h-5 w-5" /> AI Processes (Explicit Opt-in)
              </CardTitle>
              <CardDescription>
                AI is OFF by default. These controls require explicit confirmation and will only run for the configured duration.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="outline" className="border-gray-700 text-gray-300">
                  AI_ENABLED: {ai?.config.aiEnabled ? "true" : "false"}
                </Badge>
                <Badge variant="outline" className="border-gray-700 text-gray-300">
                  AI_BACKGROUND_ENABLED: {ai?.config.aiBackgroundEnabled ? "true" : "false"}
                </Badge>
                <Badge variant="outline" className="border-gray-700 text-gray-300">
                  AI_CFO_AGENT_ENABLED: {ai?.config.cfoAgentEnabled ? "true" : "false"}
                </Badge>
                <Badge variant="outline" className="border-gray-700 text-gray-300">
                  ACTIONS_WORKER_ENABLED: {ai?.config.actionsWorkerEnabled ? "true" : "false"}
                </Badge>
                <Badge variant="outline" className={actionsRunner?.healthy ? "border-green-700 text-green-300" : "border-red-700 text-red-300"}>
                  Runner: {actionsRunner?.healthy ? "healthy" : "offline"}
                </Badge>
              </div>

              {actionsRunnerOffline ? (
                <div className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                  Runner offline: queued actions will not execute until the actions worker heartbeat recovers.
                </div>
              ) : null}

              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">Duration (minutes)</span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={aiDurationMinutes}
                  onChange={(e) => setAiDurationMinutes(Math.max(1, Math.min(120, Number(e.target.value) || 1)))}
                  className="w-24 bg-gray-950 border border-gray-800 rounded-md px-2 py-1 text-white text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card className="bg-gray-950 border-gray-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-200">Background Conversations</CardTitle>
                    <CardDescription>
                      Status:{" "}
                      <span className={ai?.processes.backgroundConversations.running ? "text-green-400" : "text-gray-400"}>
                        {ai?.processes.backgroundConversations.running ? "running" : "stopped"}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      className="bg-amber-500 text-black hover:bg-amber-600"
                      disabled={aiStartBackground.isPending}
                      onClick={() => aiStartBackground.mutate()}
                    >
                      Start
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-gray-800"
                      disabled={aiStopBackground.isPending}
                      onClick={() => aiStopBackground.mutate(activeBackgroundSession?.id)}
                    >
                      Stop
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-gray-800"
                      disabled={!activeBackgroundSession || activeBackgroundSession.status !== "RUNNING" || aiPauseBackgroundSession.isPending}
                      onClick={() => activeBackgroundSession && aiPauseBackgroundSession.mutate(activeBackgroundSession.id)}
                    >
                      Pause
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-gray-800"
                      disabled={!activeBackgroundSession || activeBackgroundSession.status !== "PAUSED" || aiResumeBackgroundSession.isPending}
                      onClick={() => activeBackgroundSession && aiResumeBackgroundSession.mutate(activeBackgroundSession.id)}
                    >
                      Resume
                    </Button>
                    </div>
                    {activeBackgroundSession ? (
                      <div className="text-xs text-gray-400">
                        Session `{activeBackgroundSession.id}` | {activeBackgroundSession.status} | tokens {activeBackgroundSession.tokenSpendEstimate}/{activeBackgroundSession.tokenBudget}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500">No active background session</div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-gray-950 border-gray-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-200">CFO Monitoring</CardTitle>
                    <CardDescription>
                      Status:{" "}
                      <span className={ai?.processes.cfoAgent.running ? "text-green-400" : "text-gray-400"}>
                        {ai?.processes.cfoAgent.running ? "running" : "stopped"}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-amber-500 text-black hover:bg-amber-600"
                      disabled={aiStartCfo.isPending}
                      onClick={() => aiStartCfo.mutate()}
                    >
                      Start
                    </Button>
                    <Button size="sm" variant="outline" className="border-gray-800" disabled={aiStopCfo.isPending} onClick={() => aiStopCfo.mutate()}>
                      Stop
                    </Button>
                  </CardContent>
                </Card>

                <Card className="bg-gray-950 border-gray-800 md:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-200">Action Runner</CardTitle>
                    <CardDescription>
                      Status:{" "}
                      <span className={actionsRunner?.healthy ? "text-green-400" : "text-red-400"}>
                        {actionsRunner?.healthy ? "online" : "offline"}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-gray-400 space-y-1">
                    <div>Heartbeat: {actionsRunner?.lastHeartbeatAt ? new Date(actionsRunner.lastHeartbeatAt).toLocaleTimeString() : "never"}</div>
                    <div>Heartbeat age: {actionsRunner?.heartbeatAgeMs != null ? `${actionsRunner.heartbeatAgeMs}ms` : "n/a"}</div>
                    <div>Interval: {actionsRunner?.intervalMs ?? 0}ms</div>
                    {actionsRunner?.lastError ? <div className="text-red-300">Last error: {actionsRunner.lastError}</div> : null}
                  </CardContent>
                </Card>
              </div>

              <p className="text-xs text-gray-500">
                If start fails with consent requirements, set `AI_ENABLED=true` and the relevant flags in `.env`, then restart the server.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" /> LLM Routing (Admin Control)
              </CardTitle>
              <CardDescription>
                Configure which providers are allowed and how the app chooses between them. No keys are stored in the database.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { key: "claude", label: "Anthropic (Claude)", configured: aiProvidersQuery.data?.providers.claude.configured },
                  { key: "openai", label: "OpenAI", configured: aiProvidersQuery.data?.providers.openai.configured },
                  { key: "gemini", label: "Google (Gemini)", configured: aiProvidersQuery.data?.providers.gemini.configured },
                ].map((p) => (
                  <div key={p.key} className="p-3 rounded-lg bg-gray-950 border border-gray-800">
                    <div className="text-sm text-white font-medium">{p.label}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {p.configured ? <span className="text-green-400">configured</span> : <span className="text-gray-500">not configured</span>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <div className="text-sm text-gray-300 font-medium">Strategy</div>
                  <Select
                    value={routingDraft.strategy}
                    onValueChange={(v) => {
                      setRoutingTouched(true);
                      setRoutingDraft((prev) => ({ ...prev, strategy: v as any }));
                    }}
                  >
                    <SelectTrigger className="bg-gray-950 border-gray-800 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-950 border-gray-800">
                      <SelectItem value="balanced">Balanced (recommended)</SelectItem>
                      <SelectItem value="cheapest">Cheapest first</SelectItem>
                      <SelectItem value="quality">Highest quality first</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-gray-500">
                    Routing uses only configured + allowed providers.
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-gray-300 font-medium">Force Provider</div>
                  <Select
                    value={routingDraft.forcedProvider ?? "__auto__"}
                    onValueChange={(v) => {
                      setRoutingTouched(true);
                      setRoutingDraft((prev) => ({ ...prev, forcedProvider: v === "__auto__" ? null : (v as any) }));
                    }}
                  >
                    <SelectTrigger className="bg-gray-950 border-gray-800 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-950 border-gray-800">
                      <SelectItem value="__auto__">Auto (use strategy)</SelectItem>
                      <SelectItem value="claude">Claude</SelectItem>
                      <SelectItem value="gemini">Gemini</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-gray-300 font-medium">Allow Providers</div>
                  <div className="space-y-2">
                    {(["claude", "gemini", "openai"] as const).map((provider) => (
                      <div key={provider} className="flex items-center justify-between gap-3 rounded-lg bg-gray-950 border border-gray-800 p-3">
                        <div className="text-sm text-gray-200 capitalize">{provider}</div>
                        <Switch
                          checked={routingDraft.allowedProviders.includes(provider)}
                          onCheckedChange={(checked) => {
                            setRoutingTouched(true);
                            setRoutingDraft((prev) => {
                              const next = new Set(prev.allowedProviders);
                              if (checked) next.add(provider);
                              else next.delete(provider);
                              const arr = Array.from(next);
                              return { ...prev, allowedProviders: (arr.length ? arr : prev.allowedProviders) as any };
                            });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  AI calls still require `AI_ENABLED=true` + provider API keys on the server.
                </div>
                <Button
                  className="bg-amber-500 text-black hover:bg-amber-600"
                  disabled={!effectiveCompanyId || saveAiRouting.isPending}
                  onClick={() => saveAiRouting.mutate()}
                >
                  {saveAiRouting.isPending ? "Saving…" : "Save Routing"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modules" className="space-y-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Marketplace Modules</CardTitle>
              <CardDescription>Quick links to manage every operational module.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { href: "/marketplace/sellers", title: "Sellers", desc: "Approve / reject, view stats", icon: Store },
                { href: "/seller-dashboard", title: "Shop Ops", desc: "Products, orders, wallet", icon: Package },
                { href: "/orders", title: "Orders (Buyer view)", desc: "Lookup by order number", icon: ShoppingCart },
                { href: "/delivery/admin", title: "Delivery", desc: "Dispatch and logistics", icon: Truck },
                { href: "/bureaus", title: "Authorized Bureaus", desc: "Gold buying offices", icon: ShieldCheck },
                { href: "/admin-users", title: "Users", desc: "Roles & access", icon: Users },
              ].map((m) => (
                <Link key={m.href} href={m.href}>
                  <div className="p-4 rounded-lg bg-gray-950 border border-gray-800 hover:border-amber-500/40 transition-colors cursor-pointer">
                    <div className="flex items-center gap-2 text-white font-medium">
                      <m.icon className="h-4 w-4 text-amber-400" />
                      {m.title}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{m.desc}</div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PickaxeIcon() {
  return (
    <span className="inline-flex items-center justify-center mr-2">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path
          d="M2 21l6-6m0 0l3 3m-3-3l7-7m-5 1c4 0 7-3 7-7 0 0-3 0-7 2-2 1-4 3-5 5-1 2-2 5-2 5z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

