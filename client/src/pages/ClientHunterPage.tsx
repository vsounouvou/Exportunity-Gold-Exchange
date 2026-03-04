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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  new: 'bg-blue-500/20 text-blue-400',
  contacted: 'bg-yellow-500/20 text-yellow-400',
  responded: 'bg-purple-500/20 text-purple-400',
  qualified: 'bg-green-500/20 text-green-400',
  converted: 'bg-emerald-500/20 text-emerald-400',
  disqualified: 'bg-red-500/20 text-red-400',
};

export default function ClientHunterPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const session = useSession();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isQualifying, setIsQualifying] = useState(false);
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
      setIsDiscovering(false);
    },
    onError: () => {
      toast({ 
        title: "Discovery failed", 
        description: "Could not complete AI discovery. Try again later.",
        variant: "destructive"
      });
      setIsDiscovering(false);
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
      setIsQualifying(false);
    },
    onError: () => {
      toast({ 
        title: "Qualification failed", 
        variant: "destructive"
      });
      setIsQualifying(false);
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
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  const handleGenerateOutreach = (lead: Lead) => {
    setSelectedLead(lead);
    setShowOutreachDialog(true);
    setGeneratedOutreach(null);
  };

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 pb-20">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
              <Bot className="h-6 w-6 text-amber-500" />
              AI Client Hunter
            </h1>
            <p className="text-sm text-gray-400">Automated lead discovery, scoring & outreach</p>
          </div>
        </div>

        <Card className="bg-gradient-to-r from-amber-900/30 to-purple-900/30 border-amber-500/30 mb-6">
          <CardContent className="p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-400" />
                  AI-Powered Lead Generation
                </h3>
                <p className="text-sm text-gray-300 mt-1">
                  Let AI discover, score, and qualify potential clients in the African commodities market automatically.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button 
                  onClick={() => {
                    setIsDiscovering(true);
                    aiDiscoverMutation.mutate();
                  }}
                  disabled={aiDiscoverMutation.isPending}
                  className="h-11 bg-amber-500 hover:bg-amber-600 text-black font-medium"
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
                  onClick={() => {
                    setIsQualifying(true);
                    aiQualifyBatchMutation.mutate();
                  }}
                  disabled={aiQualifyBatchMutation.isPending}
                  className="h-11 border-purple-500/50 text-purple-300 hover:bg-purple-500/20"
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
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Total Leads</p>
                  <p className="text-xl md:text-2xl font-bold text-white">{leadsData?.pagination?.total || 0}</p>
                </div>
                <Target className="h-8 w-8 text-amber-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">AI Discovered</p>
                  <p className="text-xl md:text-2xl font-bold text-white">
                    {leadsData?.leads?.filter(l => l.source === 'ai_discovery').length || 0}
                  </p>
                </div>
                <Bot className="h-8 w-8 text-purple-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Qualified</p>
                  <p className="text-xl md:text-2xl font-bold text-white">
                    {leadsData?.leads?.filter(l => l.status === 'qualified').length || 0}
                  </p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Avg Score</p>
                  <p className="text-xl md:text-2xl font-bold text-white">
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
          <TabsList className="grid w-full grid-cols-4 bg-gray-800 h-11 mb-4">
            <TabsTrigger value="sourcing" className="h-10">
              <Search className="h-4 w-4 mr-2" />
              Sourcing
            </TabsTrigger>
            <TabsTrigger value="access" className="h-10">
              <FileText className="h-4 w-4 mr-2" />
              Access
            </TabsTrigger>
            <TabsTrigger value="leads" className="h-10">
              <Users className="h-4 w-4 mr-2" />
              Lead Pipeline
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="h-10">
              <Zap className="h-4 w-4 mr-2" />
              AI Campaigns
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sourcing" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="bg-gray-900 border-gray-800 lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Search className="h-5 w-5 text-amber-400" />
                    Open Sourcing Requests
                  </CardTitle>
                  <CardDescription>
                    Created automatically from unmet product searches (demand-driven).
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[420px]">
                    <div className="divide-y divide-gray-800">
                      {sourcingLoading ? (
                        <div className="p-8 text-center">
                          <Loader2 className="h-8 w-8 animate-spin text-amber-500 mx-auto" />
                          <p className="text-gray-400 mt-2">Loading sourcing requests...</p>
                        </div>
                      ) : (sourcingData?.requests?.length || 0) === 0 ? (
                        <div className="p-8 text-center text-gray-400">
                          <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No open sourcing requests yet.</p>
                          <p className="text-sm text-gray-500 mt-1">They appear automatically when buyers search and supply is missing.</p>
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
                                  <p className="text-white font-semibold truncate">{r.productQuery}</p>
                                  <p className="text-xs text-gray-400 mt-1 truncate">
                                    {label} • {new Date(r.createdAt).toLocaleString()}
                                  </p>
                                  {r.quantityIntent ? (
                                    <p className="text-xs text-gray-400 mt-1">Qty/intent: {r.quantityIntent}</p>
                                  ) : null}
                                </div>
                                <Badge className="bg-blue-500/15 text-blue-300 border-blue-400/20 text-[10px]">
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
                                  className="bg-green-600 hover:bg-green-700"
                                  disabled={updateSourcingRequest.isPending}
                                  onClick={() => updateSourcingRequest.mutate({ id: r.id, status: "matched" })}
                                >
                                  Mark matched
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-gray-700"
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

              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-emerald-400" />
                    Territory Demand
                  </CardTitle>
                  <CardDescription>Open sourcing volume by area (last 30 days).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(territoryMetrics?.territories || []).slice(0, 8).map((t) => (
                    <div key={t.key} className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-white truncate">{t.label}</p>
                        <Badge className="bg-amber-500/15 text-amber-300 border-amber-400/20 text-[10px]">
                          {t.counts.open || 0} open
                        </Badge>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">Last seen: {new Date(t.lastSeenAt).toLocaleString()}</p>
                    </div>
                  ))}
                  {(territoryMetrics?.territories || []).length === 0 ? (
                    <p className="text-sm text-gray-500">No data yet.</p>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="access" className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-amber-400" />
                  Wholesale Gold Access Requests
                </CardTitle>
                <CardDescription>Approve or reject private market access.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="divide-y divide-gray-800">
                    {accessLoading ? (
                      <div className="p-8 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-amber-500 mx-auto" />
                        <p className="text-gray-400 mt-2">Loading access requests...</p>
                      </div>
                    ) : (accessData?.requests || []).length === 0 ? (
                      <div className="p-8 text-center text-gray-400">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No access requests.</p>
                      </div>
                    ) : (
                      (accessData?.requests || []).map((r) => (
                        <div key={r.id} className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-white font-semibold truncate">{r.user?.displayName || r.user?.email || `User ${r.user?.id}`}</p>
                              <p className="text-xs text-gray-400 mt-1 truncate">
                                {r.businessName || "Business name not provided"} • {new Date(r.createdAt).toLocaleString()}
                              </p>
                              {r.licenseFileName ? (
                                <p className="text-xs text-gray-500 mt-1 truncate">License file: {r.licenseFileName}</p>
                              ) : null}
                            </div>
                            <Badge className="bg-purple-500/15 text-purple-300 border-purple-400/20 text-[10px]">
                              {r.status}
                            </Badge>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              disabled={updateMarketAccessRequest.isPending || r.status !== "pending"}
                              onClick={() => updateMarketAccessRequest.mutate({ id: r.id, status: "approved" })}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-gray-700 text-gray-200"
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
                className="h-9"
              >
                All
              </Button>
              {Object.keys(STATUS_COLORS).map(status => (
                <Button
                  key={status}
                  variant={filterStatus === status ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus(status)}
                  className="h-9 capitalize"
                >
                  {status}
                </Button>
              ))}
            </div>

            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="divide-y divide-gray-800">
                    {leadsLoading ? (
                      <div className="p-8 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-amber-500 mx-auto" />
                        <p className="text-gray-400 mt-2">Loading leads...</p>
                      </div>
                    ) : filteredLeads.length === 0 ? (
                      <div className="p-8 text-center text-gray-400">
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
                            setIsDiscovering(true);
                            aiDiscoverMutation.mutate();
                          }}
                          className="bg-amber-500 hover:bg-amber-600"
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
                          className="p-4 hover:bg-gray-800/50 transition-colors"
                        >
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h3 className="text-sm font-medium text-white">
                                  {lead.companyName || lead.contactName || 'Unknown'}
                                </h3>
                                <Badge className={STATUS_COLORS[lead.status] || 'bg-gray-500/20'}>
                                  {lead.status}
                                </Badge>
                                {lead.source === 'ai_discovery' && (
                                  <Badge className="bg-purple-500/20 text-purple-300">
                                    <Bot className="h-3 w-3 mr-1" />
                                    AI Found
                                  </Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs text-gray-400">
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
                                <div className="text-xs text-gray-500">Score</div>
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
                                className="h-9 border-amber-500/50 text-amber-300"
                              >
                                <FileText className="h-3 w-3 mr-1" />
                                Outreach
                              </Button>
                              <Select
                                value={lead.status}
                                onValueChange={(v) => updateLeadMutation.mutate({ id: lead.id, updates: { status: v } })}
                              >
                                <SelectTrigger className="w-28 h-9 bg-gray-800 border-gray-700 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-800 border-gray-700">
                                  {Object.keys(STATUS_COLORS).map(s => (
                                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          {lead.notes && (
                            <p className="text-xs text-gray-500 mt-2 line-clamp-2">{lead.notes}</p>
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
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-400" />
                  AI Discovery Campaigns
                </CardTitle>
                <CardDescription>Automated lead generation campaigns run by AI</CardDescription>
              </CardHeader>
              <CardContent>
                {!campaignsData?.campaigns?.length ? (
                  <div className="text-center py-8 text-gray-400">
                    <Radar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="mb-4">No campaigns yet. Start an AI Discovery to create your first campaign.</p>
                    <Button 
                      onClick={() => {
                        setIsDiscovering(true);
                        aiDiscoverMutation.mutate();
                      }}
                      className="bg-amber-500 hover:bg-amber-600"
                    >
                      <Bot className="h-4 w-4 mr-2" />
                      Launch AI Discovery
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {campaignsData?.campaigns?.map(campaign => (
                      <div key={campaign.id} className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium text-white flex items-center gap-2">
                            {campaign.type === 'ai_discovery' && <Bot className="h-4 w-4 text-purple-400" />}
                            {campaign.name}
                          </h4>
                          <Badge variant="outline" className={
                            campaign.status === 'completed' ? 'border-green-500 text-green-400' :
                            campaign.status === 'running' ? 'border-blue-500 text-blue-400' :
                            'border-gray-500'
                          }>
                            {campaign.status}
                          </Badge>
                        </div>
                        {campaign.description && (
                          <p className="text-xs text-gray-400 mb-3">{campaign.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-gray-400">
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
          <DialogContent className="bg-gray-900 border-gray-800 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-400" />
                AI Outreach Generator
              </DialogTitle>
              <DialogDescription>
                Generate personalized outreach for {selectedLead?.companyName || selectedLead?.contactName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-gray-300">Channel</Label>
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
                className="w-full h-11 bg-amber-500 hover:bg-amber-600"
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
                      <Label className="text-gray-300">Subject</Label>
                      <Input
                        value={generatedOutreach.subject}
                        readOnly
                        className="bg-gray-800 border-gray-700 text-white mt-1"
                      />
                    </div>
                  )}
                  <div>
                    <Label className="text-gray-300">Message</Label>
                    <Textarea
                      value={generatedOutreach.content}
                      readOnly
                      className="bg-gray-800 border-gray-700 text-white mt-1 min-h-[200px]"
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
                      className="flex-1 h-11 bg-green-600 hover:bg-green-700"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Mark as Sent
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
