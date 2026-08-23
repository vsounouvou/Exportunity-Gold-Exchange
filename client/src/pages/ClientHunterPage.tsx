import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Target, Search, Phone, Mail, Globe, 
  TrendingUp, MessageSquare, Loader2, Bot,
  CheckCircle2, Clock, Zap, Sparkles, Send,
  Brain, BarChart3, Users, Radar, FileText
} from "lucide-react";

interface Lead {
  id: number;
  companyName?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  source: string;
  status: string;
  score: number;
  notes?: string;
  lastContactedAt?: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

interface Campaign {
  id: number;
  name: string;
  description?: string;
  status: string;
  type: string;
  targetCriteria: Record<string, any>;
  leadsGenerated: number;
  leadsConverted: number;
  createdAt: string;
}

interface SourcingRequest {
  id: number;
  productQuery: string;
  quantityIntent?: string | null;
  urgency?: string | null;
  qualityNotes?: string | null;
  status: "open" | "sourcing" | "matched" | "closed";
  location?: Record<string, any>;
  requester?: { id: number; email?: string | null; displayName?: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

interface MarketAccessRequest {
  id: number;
  marketKey: string;
  businessName?: string | null;
  licenseFileName?: string | null;
  notes?: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
  user: {
    id: number;
    email?: string | null;
    displayName?: string | null;
    buyerType?: string | null;
    role?: string | null;
    roles?: any;
  };
}

interface TerritoryMetric {
  key: string;
  label: string;
  counts: Record<string, number>;
  lastSeenAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  new: 'border border-blue-200 bg-blue-50 text-blue-700',
  contacted: 'border border-amber-200 bg-amber-50 text-amber-800',
  responded: 'border border-violet-200 bg-violet-50 text-violet-700',
  qualified: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  converted: 'border border-teal-200 bg-teal-50 text-teal-700',
  disqualified: 'border border-rose-200 bg-rose-50 text-rose-700',
};

export default function ClientHunterPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const session = useSession();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showOutreachDialog, setShowOutreachDialog] = useState(false);
  const [outreachType, setOutreachType] = useState<'email' | 'sms' | 'whatsapp'>('email');
  const [generatedOutreach, setGeneratedOutreach] = useState<{ subject?: string; content: string } | null>(null);

  const adminAuthHeaders: Record<string, string> = session.token
    ? { Authorization: `Bearer ${session.token}` }
    : {};

  const { data: sourcingData, isLoading: sourcingLoading } = useQuery<{
    requests: SourcingRequest[];
  }>({
    queryKey: ['/api/marketplace/admin/sourcing-requests', session.token],
    enabled: !!session.token,
    queryFn: async () => {
      return apiRequest('/api/marketplace/admin/sourcing-requests?status=open', {
        headers: adminAuthHeaders,
      });
    }
  });

  const { data: territoryMetrics } = useQuery<{
    windowDays: number;
    territories: TerritoryMetric[];
  }>({
    queryKey: ['/api/marketplace/admin/territory-metrics', session.token],
    enabled: !!session.token,
    queryFn: async () => {
      return apiRequest('/api/marketplace/admin/territory-metrics?days=30', {
        headers: adminAuthHeaders,
      });
    }
  });

  const { data: accessData, isLoading: accessLoading } = useQuery<{
    requests: MarketAccessRequest[];
  }>({
    queryKey: ['/api/marketplace/admin/markets/wholesale-gold/access-requests', session.token],
    enabled: !!session.token,
    queryFn: async () => {
      return apiRequest('/api/marketplace/admin/markets/wholesale-gold/access-requests', {
        headers: adminAuthHeaders,
      });
    }
  });

  const updateSourcingRequest = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: SourcingRequest["status"] }) => {
      return apiRequest(`/api/marketplace/admin/sourcing-requests/${id}`, {
        method: "PATCH",
        headers: adminAuthHeaders,
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/admin/sourcing-requests', session.token] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/admin/territory-metrics', session.token] });
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error?.message || "Try again", variant: "destructive" });
    }
  });

  const updateMarketAccessRequest = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "approved" | "rejected" }) => {
      return apiRequest(`/api/marketplace/admin/markets/wholesale-gold/access-requests/${id}`, {
        method: "PATCH",
        headers: adminAuthHeaders,
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/admin/markets/wholesale-gold/access-requests', session.token] });
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error?.message || "Try again", variant: "destructive" });
    }
  });

  const { data: leadsData, isLoading: leadsLoading } = useQuery<{
    leads: Lead[];
    pagination: { total: number };
  }>({
    queryKey: ['/api/admin/leads']
  });

  const { data: campaignsData } = useQuery<{
    campaigns: Campaign[];
  }>({
    queryKey: ['/api/admin/campaigns']
  });

  const aiDiscoverMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/admin/leads/ai-discover', {
        method: 'POST',
        body: JSON.stringify({
          criteria: {
            industry: 'commodities',
            region: 'africa',
            minScore: 60
          }
        })
      });
    },
    onSuccess: (data) => {
      toast({ 
        title: "AI Discovery Complete", 
        description: `Found ${data.leadsFound || 0} new potential clients in the commodities sector.` 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/campaigns'] });
    },
    onError: () => {
      toast({ 
        title: "Discovery failed", 
        description: "Could not complete AI discovery. Try again later.",
        variant: "destructive"
      });
    }
  });

  const aiQualifyBatchMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/admin/leads/ai-qualify-batch', {
        method: 'POST'
      });
    },
    onSuccess: (data) => {
      toast({ 
        title: "AI Qualification Complete", 
        description: `Processed ${data.processed} leads. ${data.qualified} qualified for outreach.` 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leads'] });
    },
    onError: () => {
      toast({ 
        title: "Qualification failed", 
        variant: "destructive"
      });
    }
  });

  const aiScoreMutation = useMutation({
    mutationFn: async (leadId: number) => {
      return await apiRequest(`/api/admin/leads/${leadId}/ai-score`, {
        method: 'POST'
      });
    },
    onSuccess: (data) => {
      toast({ 
        title: "Lead Scored", 
        description: `Score: ${data.score}/100 - ${data.recommendation.replace('_', ' ')}` 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leads'] });
    }
  });

  const aiOutreachMutation = useMutation({
    mutationFn: async ({ leadId, type }: { leadId: number; type: string }) => {
      return await apiRequest(`/api/admin/leads/${leadId}/ai-outreach`, {
        method: 'POST',
        body: JSON.stringify({ type })
      });
    },
    onSuccess: (data) => {
      setGeneratedOutreach({ subject: data.subject, content: data.content });
      toast({ 
        title: "Outreach Generated", 
        description: `AI drafted a ${outreachType} message for this lead.` 
      });
    }
  });

  const updateLeadMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Lead> }) => {
      return await apiRequest(`/api/admin/leads/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leads'] });
    }
  });

  const filteredLeads = leadsData?.leads?.filter(lead => {
    if (filterStatus === 'all') return true;
    return lead.status === filterStatus;
  }) || [];

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-700';
    if (score >= 60) return 'text-amber-700';
    if (score >= 40) return 'text-orange-700';
    return 'text-rose-700';
  };

  const handleGenerateOutreach = (lead: Lead) => {
    setSelectedLead(lead);
    setShowOutreachDialog(true);
    setGeneratedOutreach(null);
  };

  return (
    <div
      className="min-h-[calc(100vh-var(--admin-header-height))] bg-[#F7F8FA] px-4 py-5 text-[#07111F] md:px-6"
      data-testid="exportunity-lead-operations-page"
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9A6200]">Global Trade Network</div>
            <h1 className="mt-2 flex items-center gap-2 text-xl font-black text-slate-950 md:text-2xl">
              <Bot className="h-6 w-6 text-[#F5A623]" />
              Lead operations
            </h1>
            <p className="mt-1 text-sm text-slate-500">Demand-driven discovery, scoring, and governed outreach drafts.</p>
          </div>
        </div>

        <Card className="mb-6 border-[#F5A623]/35 bg-gradient-to-r from-[#FFF8E8] to-white shadow-sm">
          <CardContent className="p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex-1">
                <h3 className="flex items-center gap-2 text-lg font-black text-slate-950">
                  <Sparkles className="h-5 w-5 text-[#F5A623]" />
                  AI-assisted lead preparation
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Use current sourcing demand to identify and qualify potential clients. Outreach remains a draft until a person reviews it.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button 
                  onClick={() => aiDiscoverMutation.mutate()}
                  disabled={aiDiscoverMutation.isPending}
                  className="h-11 bg-[#F5A623] font-black text-[#07111F] hover:bg-[#F8C45B]"
                >
                  {aiDiscoverMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Radar className="h-4 w-4 mr-2" />
                  )}
                  Discover Leads
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => aiQualifyBatchMutation.mutate()}
                  disabled={aiQualifyBatchMutation.isPending}
                  className="h-11 border-slate-300 bg-white font-bold text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8] hover:text-slate-950"
                >
                  {aiQualifyBatchMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Brain className="h-4 w-4 mr-2" />
                  )}
                  AI Qualify All
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-500">Total Leads</p>
                  <p className="text-xl font-black text-slate-950 md:text-2xl">{leadsData?.pagination?.total || 0}</p>
                </div>
                <Target className="h-8 w-8 text-amber-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-500">AI Discovered</p>
                  <p className="text-xl font-black text-slate-950 md:text-2xl">
                    {leadsData?.leads?.filter(l => l.source === 'ai_discovery').length || 0}
                  </p>
                </div>
                <Bot className="h-8 w-8 text-violet-500 opacity-60" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-500">Qualified</p>
                  <p className="text-xl font-black text-slate-950 md:text-2xl">
                    {leadsData?.leads?.filter(l => l.status === 'qualified').length || 0}
                  </p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-500">Avg Score</p>
                  <p className="text-xl font-black text-slate-950 md:text-2xl">
                    {Math.round(
                      (leadsData?.leads?.reduce((sum, l) => sum + (l.score || 0), 0) || 0) / 
                      Math.max(leadsData?.leads?.length || 1, 1)
                    )}
                  </p>
                </div>
                <BarChart3 className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="leads" className="w-full">
          <TabsList className="mb-4 grid h-auto w-full grid-cols-2 gap-1 border border-slate-200 bg-white p-1 sm:grid-cols-4">
            <TabsTrigger value="sourcing" className="h-10 data-[state=active]:bg-[#FFF8E8] data-[state=active]:text-[#8A5700]">
              <Search className="h-4 w-4 mr-2" />
              Sourcing
            </TabsTrigger>
            <TabsTrigger value="access" className="h-10 data-[state=active]:bg-[#FFF8E8] data-[state=active]:text-[#8A5700]">
              <FileText className="h-4 w-4 mr-2" />
              Access
            </TabsTrigger>
            <TabsTrigger value="leads" className="h-10 data-[state=active]:bg-[#FFF8E8] data-[state=active]:text-[#8A5700]">
              <Users className="h-4 w-4 mr-2" />
              Lead Pipeline
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="h-10 data-[state=active]:bg-[#FFF8E8] data-[state=active]:text-[#8A5700]">
              <Zap className="h-4 w-4 mr-2" />
              AI Campaigns
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sourcing" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="border-slate-200 bg-white shadow-sm lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-950">
                    <Search className="h-5 w-5 text-[#F5A623]" />
                    Open Sourcing Requests
                  </CardTitle>
                  <CardDescription>
                    Created automatically from unmet product searches (demand-driven).
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[420px]">
                    <div className="divide-y divide-slate-100">
                      {sourcingLoading ? (
                        <div className="p-8 text-center">
                          <Loader2 className="h-8 w-8 animate-spin text-amber-500 mx-auto" />
                          <p className="mt-2 text-slate-500">Loading sourcing requests...</p>
                        </div>
                      ) : (sourcingData?.requests?.length || 0) === 0 ? (
                        <div className="p-8 text-center text-slate-500">
                          <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No open sourcing requests yet.</p>
                          <p className="mt-1 text-sm text-slate-400">They appear automatically when buyers search and supply is missing.</p>
                        </div>
                      ) : (
                        (sourcingData?.requests || []).map((r) => {
                          const label =
                            (r.location as any)?.label ||
                            ((r.location as any)?.cityName && (r.location as any)?.countryName
                              ? `${(r.location as any).cityName}, ${(r.location as any).countryName}`
                              : (r.location as any)?.cityName || (r.location as any)?.countryName) ||
                            "Unknown";
                          return (
                            <div key={r.id} className="p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate font-bold text-slate-950">{r.productQuery}</p>
                                  <p className="mt-1 truncate text-xs text-slate-500">
                                    {label} • {new Date(r.createdAt).toLocaleString()}
                                  </p>
                                  {r.quantityIntent ? (
                                    <p className="mt-1 text-xs text-slate-500">Qty/intent: {r.quantityIntent}</p>
                                  ) : null}
                                </div>
                                <Badge className="border border-blue-200 bg-blue-50 text-[10px] text-blue-700">
                                  {r.status}
                                </Badge>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={updateSourcingRequest.isPending}
                                  onClick={() => updateSourcingRequest.mutate({ id: r.id, status: "sourcing" })}
                                >
                                  Mark sourcing
                                </Button>
                                <Button
                                  size="sm"
                                  className="bg-emerald-600 hover:bg-emerald-700"
                                  disabled={updateSourcingRequest.isPending}
                                  onClick={() => updateSourcingRequest.mutate({ id: r.id, status: "matched" })}
                                >
                                  Mark matched
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-slate-300 text-slate-700"
                                  disabled={updateSourcingRequest.isPending}
                                  onClick={() => updateSourcingRequest.mutate({ id: r.id, status: "closed" })}
                                >
                                  Close
                                </Button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-950">
                    <TrendingUp className="h-5 w-5 text-emerald-400" />
                    Territory Demand
                  </CardTitle>
                  <CardDescription>Open sourcing volume by area (last 30 days).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(territoryMetrics?.territories || []).slice(0, 8).map((t) => (
                    <div key={t.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-bold text-slate-900">{t.label}</p>
                        <Badge className="border border-[#F5A623]/30 bg-[#FFF8E8] text-[10px] text-[#8A5700]">
                          {t.counts.open || 0} open
                        </Badge>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">Last seen: {new Date(t.lastSeenAt).toLocaleString()}</p>
                    </div>
                  ))}
                  {(territoryMetrics?.territories || []).length === 0 ? (
                    <p className="text-sm text-slate-500">No data yet.</p>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="access" className="space-y-4">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-950">
                  <FileText className="h-5 w-5 text-[#F5A623]" />
                  Wholesale Gold Access Requests
                </CardTitle>
                <CardDescription>Approve or reject private market access.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="divide-y divide-slate-100">
                    {accessLoading ? (
                      <div className="p-8 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-amber-500 mx-auto" />
                        <p className="mt-2 text-slate-500">Loading access requests...</p>
                      </div>
                    ) : (accessData?.requests || []).length === 0 ? (
                      <div className="p-8 text-center text-slate-500">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No access requests.</p>
                      </div>
                    ) : (
                      (accessData?.requests || []).map((r) => (
                        <div key={r.id} className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-bold text-slate-950">{r.user?.displayName || r.user?.email || `User ${r.user?.id}`}</p>
                              <p className="mt-1 truncate text-xs text-slate-500">
                                {r.businessName || "Business name not provided"} • {new Date(r.createdAt).toLocaleString()}
                              </p>
                              {r.licenseFileName ? (
                                <p className="mt-1 truncate text-xs text-slate-400">License file: {r.licenseFileName}</p>
                              ) : null}
                            </div>
                            <Badge className="border border-violet-200 bg-violet-50 text-[10px] text-violet-700">
                              {r.status}
                            </Badge>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700"
                              disabled={updateMarketAccessRequest.isPending || r.status !== "pending"}
                              onClick={() => updateMarketAccessRequest.mutate({ id: r.id, status: "approved" })}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-slate-300 text-slate-700"
                              disabled={updateMarketAccessRequest.isPending || r.status !== "pending"}
                              onClick={() => updateMarketAccessRequest.mutate({ id: r.id, status: "rejected" })}
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leads" className="space-y-4">
            <div className="flex flex-wrap gap-2 mb-4">
              <Button
                variant={filterStatus === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterStatus('all')}
                className={
                  filterStatus === 'all'
                    ? "h-9 bg-[#F5A623] font-bold text-[#07111F] hover:bg-[#F8C45B]"
                    : "h-9 border-slate-300 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]"
                }
              >
                All
              </Button>
              {Object.keys(STATUS_COLORS).map(status => (
                <Button
                  key={status}
                  variant={filterStatus === status ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus(status)}
                  className={
                    filterStatus === status
                      ? "h-9 bg-[#F5A623] font-bold capitalize text-[#07111F] hover:bg-[#F8C45B]"
                      : "h-9 border-slate-300 bg-white capitalize text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]"
                  }
                >
                  {status}
                </Button>
              ))}
            </div>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="divide-y divide-slate-100">
                    {leadsLoading ? (
                      <div className="p-8 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-amber-500 mx-auto" />
                        <p className="mt-2 text-slate-500">Loading leads...</p>
                      </div>
                    ) : filteredLeads.length === 0 ? (
                      <div className="p-8 text-center text-slate-500">
                        <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="mb-4">
                          No leads found. Leads should be created from real demand (Sourcing Requests) rather than random outreach.
                        </p>
                        <Button 
                          onClick={() => {
                            if ((sourcingData?.requests?.length || 0) === 0) {
                              toast({
                                title: "No demand yet",
                                description: "Wait for a buyer search to create a sourcing request, then run discovery.",
                              });
                              return;
                            }
                            aiDiscoverMutation.mutate();
                          }}
                          className="bg-[#F5A623] font-black text-[#07111F] hover:bg-[#F8C45B]"
                          disabled={(sourcingData?.requests?.length || 0) === 0}
                        >
                          <Radar className="h-4 w-4 mr-2" />
                          Start AI Discovery
                        </Button>
                      </div>
                    ) : (
                      filteredLeads.map(lead => (
                        <div
                          key={lead.id}
                          className="p-4 transition-colors hover:bg-slate-50"
                        >
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h3 className="text-sm font-bold text-slate-950">
                                  {lead.companyName || lead.contactName || 'Unknown'}
                                </h3>
                                <Badge className={STATUS_COLORS[lead.status] || 'border border-slate-200 bg-slate-50 text-slate-600'}>
                                  {lead.status}
                                </Badge>
                                {lead.source === 'ai_discovery' && (
                                  <Badge className="border border-violet-200 bg-violet-50 text-violet-700">
                                    <Bot className="h-3 w-3 mr-1" />
                                    AI Found
                                  </Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                                {lead.contactName && (
                                  <span>{lead.contactName}</span>
                                )}
                                {lead.contactEmail && (
                                  <span className="flex items-center gap-1">
                                    <Mail className="h-3 w-3" />
                                    {lead.contactEmail}
                                  </span>
                                )}
                                {lead.metadata?.industry && (
                                  <span className="flex items-center gap-1">
                                    <Globe className="h-3 w-3" />
                                    {lead.metadata.industry.replace('_', ' ')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="text-right mr-2">
                                <div className={`text-lg font-bold ${getScoreColor(lead.score)}`}>
                                  {lead.score}
                                </div>
                                <div className="text-xs text-slate-400">Score</div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => aiScoreMutation.mutate(lead.id)}
                                disabled={aiScoreMutation.isPending}
                                className="h-9"
                              >
                                <Brain className="h-3 w-3 mr-1" />
                                Score
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleGenerateOutreach(lead)}
                                className="h-9 border-[#F5A623]/50 text-[#8A5700] hover:bg-[#FFF8E8]"
                              >
                                <FileText className="h-3 w-3 mr-1" />
                                Outreach
                              </Button>
                              <Select
                                value={lead.status}
                                onValueChange={(v) => updateLeadMutation.mutate({ id: lead.id, updates: { status: v } })}
                              >
                                <SelectTrigger className="h-9 w-28 border-slate-300 bg-white text-xs text-slate-700">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="border-slate-200 bg-white text-slate-800">
                                  {Object.keys(STATUS_COLORS).map(s => (
                                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          {lead.notes && (
                            <p className="mt-2 line-clamp-2 text-xs text-slate-400">{lead.notes}</p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="campaigns" className="space-y-4">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-slate-950">
                  <Zap className="h-5 w-5 text-[#F5A623]" />
                  AI Discovery Campaigns
                </CardTitle>
                <CardDescription>Recorded lead-discovery campaigns and their measured outcomes.</CardDescription>
              </CardHeader>
              <CardContent>
                {!campaignsData?.campaigns?.length ? (
                  <div className="py-8 text-center text-slate-500">
                    <Radar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="mb-4">No campaigns yet. Start an AI Discovery to create your first campaign.</p>
                    <Button 
                      onClick={() => {
                        aiDiscoverMutation.mutate();
                      }}
                      className="bg-[#F5A623] font-black text-[#07111F] hover:bg-[#F8C45B]"
                    >
                      <Bot className="h-4 w-4 mr-2" />
                      Launch AI Discovery
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {campaignsData?.campaigns?.map(campaign => (
                      <div key={campaign.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="flex items-center gap-2 text-sm font-bold text-slate-950">
                            {campaign.type === 'ai_discovery' && <Bot className="h-4 w-4 text-violet-600" />}
                            {campaign.name}
                          </h4>
                          <Badge variant="outline" className={
                            campaign.status === 'completed' ? 'border-emerald-300 text-emerald-700' :
                            campaign.status === 'running' ? 'border-blue-300 text-blue-700' :
                            'border-slate-300 text-slate-600'
                          }>
                            {campaign.status}
                          </Badge>
                        </div>
                        {campaign.description && (
                          <p className="mb-3 text-xs text-slate-500">{campaign.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            {campaign.leadsGenerated} leads found
                          </span>
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {campaign.leadsConverted} converted
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(campaign.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <Progress 
                          value={(campaign.leadsConverted / Math.max(campaign.leadsGenerated, 1)) * 100} 
                          className="h-1 mt-3"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={showOutreachDialog} onOpenChange={setShowOutreachDialog}>
          <DialogContent className="max-w-2xl border-slate-200 bg-white text-slate-900">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-950">
                <Sparkles className="h-5 w-5 text-[#F5A623]" />
                AI outreach draft
              </DialogTitle>
              <DialogDescription>
                Generate personalized outreach for {selectedLead?.companyName || selectedLead?.contactName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-slate-700">Channel</Label>
                <div className="flex gap-2 mt-2">
                  {(['email', 'sms', 'whatsapp'] as const).map(type => (
                    <Button
                      key={type}
                      variant={outreachType === type ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setOutreachType(type);
                        setGeneratedOutreach(null);
                      }}
                      className="h-10 capitalize"
                    >
                      {type === 'email' && <Mail className="h-4 w-4 mr-2" />}
                      {type === 'sms' && <MessageSquare className="h-4 w-4 mr-2" />}
                      {type === 'whatsapp' && <Phone className="h-4 w-4 mr-2" />}
                      {type}
                    </Button>
                  ))}
                </div>
              </div>

              <Button
                onClick={() => selectedLead && aiOutreachMutation.mutate({ leadId: selectedLead.id, type: outreachType })}
                disabled={aiOutreachMutation.isPending}
                className="h-11 w-full bg-[#F5A623] font-black text-[#07111F] hover:bg-[#F8C45B]"
              >
                {aiOutreachMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Generate AI Message
              </Button>

              {generatedOutreach && (
                <div className="space-y-3">
                  {generatedOutreach.subject && (
                    <div>
                      <Label className="text-slate-700">Subject</Label>
                      <Input
                        value={generatedOutreach.subject}
                        readOnly
                        className="mt-1 border-slate-300 bg-slate-50 text-slate-900"
                      />
                    </div>
                  )}
                  <div>
                    <Label className="text-slate-700">Message</Label>
                    <Textarea
                      value={generatedOutreach.content}
                      readOnly
                      className="mt-1 min-h-[200px] border-slate-300 bg-slate-50 text-slate-900"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedOutreach.content);
                        toast({ title: "Copied to clipboard" });
                      }}
                      className="flex-1 h-11"
                    >
                      Copy Message
                    </Button>
                    <Button
                      onClick={() => {
                        if (selectedLead) {
                          updateLeadMutation.mutate({ 
                            id: selectedLead.id, 
                            updates: { status: 'contacted', lastContactedAt: new Date().toISOString() } 
                          });
                        }
                        setShowOutreachDialog(false);
                        toast({ title: "Lead marked as contacted" });
                      }}
                      className="h-11 flex-1 bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Mark as contacted
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
