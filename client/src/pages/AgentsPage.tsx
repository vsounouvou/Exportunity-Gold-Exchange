import { useMemo, useState } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { 
  Users, 
  Plus,
  Search,
  Settings,
  Edit,
  Network,
  ShoppingCart,
  Brain,
  MessageSquare,
  Zap,
  Star,
  ChevronRight,
  Filter
} from "lucide-react";
import { useCompany } from "@/hooks/use-company";
import { AgentProfileDialog } from "@/components/AgentProfileDialog";
import { useToast } from "@/hooks/use-toast";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { getAgentAvatarUrl } from "@/lib/agentAvatar";
import { useTenant } from "@/lib/tenant";
import type { Agent, Department } from "@db/schema";

type AgentProposal = {
  key: string;
  name: string;
  role: string;
  departmentName: string;
  reportsToKey?: string;
  isDepartmentHead?: boolean;
  profile: {
    country?: string | null;
    timezone?: string | null;
    birthday?: string | null;
    languages?: string[];
    cv?: string | null;
    mission?: string | null;
    skills?: string[];
    industryFocus?: string[];
    responsibilities?: string[];
    personality?: Record<string, any>;
    permissions?: Record<string, any>;
    autonomyLevel?: "draft_only" | "partial" | "full";
    decisionAuthority?: "low" | "medium" | "high" | "executive";
    metadata?: Record<string, any>;
  };
};

type ProposalResponse = {
  companyId: number;
  id: string;
  title: string;
  agents: AgentProposal[];
};

const departmentColors: Record<string, string> = {
  Sales: "bg-green-500/20 text-green-400 border-green-500/30",
  Marketing: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  Operations: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Finance: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  HR: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  Executive: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

const marketplaceAgents = [
  { id: 1, name: "Sales Specialist Pro", role: "Senior Sales Rep", category: "Sales", rating: 4.8, hires: 1250, price: 49, description: "Expert in B2B sales with proven closing techniques" },
  { id: 2, name: "Content Creator AI", role: "Content Writer", category: "Marketing", rating: 4.9, hires: 890, price: 39, description: "Creates engaging blog posts, social media content, and copy" },
  { id: 3, name: "Data Analyst Pro", role: "Business Analyst", category: "Operations", rating: 4.7, hires: 560, price: 59, description: "Advanced data analysis and reporting capabilities" },
  { id: 4, name: "Customer Success Lead", role: "Account Manager", category: "Sales", rating: 4.6, hires: 340, price: 44, description: "Manages customer relationships and ensures satisfaction" },
];

export function AgentsPage() {
  const { brand } = useTenant();
  const [location] = useLocation();
  const { selectedCompanyId, companies, isLoading: companiesLoading } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isProposalOpen, setIsProposalOpen] = useState(false);
  const [confirmProposalCreate, setConfirmProposalCreate] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentRole, setNewAgentRole] = useState("");
  const [newAgentDepartmentId, setNewAgentDepartmentId] = useState<string>("");
  const [activeTab, setActiveTab] = useState(() => {
    if (location.includes('/marketplace')) return 'marketplace';
    if (location.includes('/hierarchy')) return 'hierarchy';
    return 'list';
  });
  const effectiveCompanyId =
    selectedCompanyId ??
    companies.find((c) => c.name.toLowerCase().replace(/\s+/g, " ").trim() === "exportunity gold exchange")?.id ??
    companies[0]?.id ??
    null;

  const { data: agents = [], isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: effectiveCompanyId ? [`/api/companies/${effectiveCompanyId}/departments`] : ["__no_company_departments__"],
    enabled: !!effectiveCompanyId,
  });

  const departmentNameById = useMemo(() => {
    const map = new Map<number, string>();
    departments.forEach((d) => map.set(d.id, d.name));
    return map;
  }, [departments]);

  const companyAgents = useMemo(() => {
    return agents.filter((a) => {
      const matchesCompany = !effectiveCompanyId || a.companyId === effectiveCompanyId;
      const matchesSearch =
        searchQuery === "" ||
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (a.role || "").toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCompany && matchesSearch;
    });
  }, [agents, searchQuery, effectiveCompanyId]);

  const agentsByDepartment = useMemo(() => {
    return companyAgents.reduce((acc, agent) => {
      const deptName =
        (agent.departmentId ? departmentNameById.get(agent.departmentId) : null) || "Unassigned";
      if (!acc[deptName]) acc[deptName] = [];
      acc[deptName].push(agent);
      return acc;
    }, {} as Record<string, Agent[]>);
  }, [companyAgents, departmentNameById]);

  const proposalQuery = useQuery<ProposalResponse>({
    queryKey: effectiveCompanyId
      ? [`/api/companies/${effectiveCompanyId}/agent-proposals/ege-core-v1`]
      : ["__no_company_proposal__"],
    enabled: !!effectiveCompanyId && isProposalOpen,
  });

  const createAgentMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveCompanyId) throw new Error(companiesLoading ? "Loading company..." : "No company found");
      if (!newAgentName.trim() || !newAgentRole.trim()) throw new Error("Name and role are required");
      const res = await fetch(resolveApiUrl("/api/agents"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: effectiveCompanyId,
          name: newAgentName.trim(),
          role: newAgentRole.trim(),
          status: "active",
          departmentId: newAgentDepartmentId ? parseInt(newAgentDepartmentId, 10) : null,
          metadata: {},
          capabilities: [],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      if (effectiveCompanyId) {
        queryClient.invalidateQueries({ queryKey: [`/api/companies/${effectiveCompanyId}/agents`] });
        queryClient.invalidateQueries({ queryKey: [`/api/companies/${effectiveCompanyId}`] });
      }
      toast({ title: "Agent created", description: "New agent added to your company" });
      setIsCreateOpen(false);
      setNewAgentName("");
      setNewAgentRole("");
      setNewAgentDepartmentId("");
    },
    onError: (error) => {
      toast({
        title: "Create failed",
        description: error instanceof Error ? error.message : "Failed to create agent",
        variant: "destructive",
      });
    },
  });

  const createFromProposalMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveCompanyId) throw new Error(companiesLoading ? "Loading company..." : "No company found");
      const res = await fetch(
        resolveApiUrl(`/api/companies/${effectiveCompanyId}/agent-proposals/ege-core-v1/create`),
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      if (effectiveCompanyId) {
        queryClient.invalidateQueries({ queryKey: [`/api/companies/${effectiveCompanyId}/agents`] });
        queryClient.invalidateQueries({ queryKey: [`/api/companies/${effectiveCompanyId}/departments`] });
        queryClient.invalidateQueries({ queryKey: [`/api/companies/${effectiveCompanyId}`] });
      }
      toast({
        title: "Agents created",
        description: `Created ${data?.createdCount ?? 0} agents and updated ${data?.updatedCount ?? 0} reporting lines`,
      });
      setConfirmProposalCreate(false);
      setIsProposalOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Proposal creation failed",
        description: error instanceof Error ? error.message : "Failed to create agents from proposal",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header - stacks on mobile */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
              <Users className="h-5 w-5 md:h-6 md:w-6 text-blue-400" />
              Agents
            </h1>
            <p className="text-gray-400 text-sm mt-1">Manage your AI team members and hire new agents</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/hierarchy">
              <Button variant="outline" className="border-gray-700 h-11 min-w-[44px]">
                <Network className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">View Hierarchy</span>
              </Button>
            </Link>
            <Dialog open={isProposalOpen} onOpenChange={(open) => { setIsProposalOpen(open); if (!open) setConfirmProposalCreate(false); }}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-gray-700 h-11 min-w-[44px]">
                  <Settings className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Recommended Team</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-gray-950 border-gray-800">
                <DialogHeader>
                  <DialogTitle className="text-white">Recommended Agents (Proposal)</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Proposed roles for {brand.name}. Review first, then explicitly confirm to create.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  {proposalQuery.isLoading && (
                    <div className="text-gray-400 text-sm">Loading proposal…</div>
                  )}
                  {proposalQuery.error && (
                    <div className="text-red-400 text-sm">
                      {proposalQuery.error instanceof Error ? proposalQuery.error.message : "Failed to load proposal"}
                    </div>
                  )}
                  {proposalQuery.data && (
                    <>
                      <div className="text-sm text-gray-300 font-medium">{proposalQuery.data.title}</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {proposalQuery.data.agents.map((p) => (
                          <Card key={p.key} className="bg-gray-900 border-gray-800">
                            <CardContent className="p-4 space-y-2">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-white font-semibold truncate">{p.name}</div>
                                  <div className="text-gray-400 text-sm truncate">{p.role}</div>
                                </div>
                                <Badge variant="outline" className={departmentColors[p.departmentName] || "bg-gray-500/20 text-gray-300 border-gray-700"}>
                                  {p.departmentName}
                                </Badge>
                              </div>
                              <div className="text-xs text-gray-400 line-clamp-3">{p.profile?.mission || p.profile?.cv || ""}</div>
                              <div className="flex flex-wrap gap-1">
                                {(p.profile?.skills || []).slice(0, 4).map((s) => (
                                  <Badge key={s} variant="secondary" className="bg-gray-800 text-gray-300">{s}</Badge>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-3">
                          <Switch checked={confirmProposalCreate} onCheckedChange={setConfirmProposalCreate} />
                          <div className="text-sm text-gray-300">
                            I approve creating these agents in my company
                          </div>
                        </div>
                        <Button
                          className="bg-blue-600 hover:bg-blue-700"
                          disabled={!confirmProposalCreate || createFromProposalMutation.isPending}
                          onClick={() => createFromProposalMutation.mutate()}
                        >
                          {createFromProposalMutation.isPending ? "Creating…" : "Create Proposal Agents"}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700 h-11 min-w-[44px]">
                  <Plus className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Create Agent</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-950 border-gray-800">
                <DialogHeader>
                  <DialogTitle className="text-white">Create Agent</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Add a new agent to your selected company.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-gray-200">Name</Label>
                    <Input
                      value={newAgentName}
                      onChange={(e) => setNewAgentName(e.target.value)}
                      placeholder="e.g., Marketplace Ops Lead"
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-200">Role</Label>
                    <Input
                      value={newAgentRole}
                      onChange={(e) => setNewAgentRole(e.target.value)}
                      placeholder="e.g., Operations Manager"
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-200">Department</Label>
                    <Select
                      value={newAgentDepartmentId || "__none__"}
                      onValueChange={(v) => setNewAgentDepartmentId(v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-800">
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    className="border-gray-700"
                    onClick={() => setIsCreateOpen(false)}
                    type="button"
                  >
                    Cancel
                  </Button>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700"
                    disabled={createAgentMutation.isPending}
                    onClick={() => createAgentMutation.mutate()}
                    type="button"
                  >
                    {createAgentMutation.isPending ? "Creating…" : "Create"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats grid - horizontal scroll on mobile */}
        <div className="flex gap-3 overflow-x-auto pb-2 mb-6 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-4">
          <Card className="bg-gray-900 border-gray-800 min-w-[140px] flex-shrink-0 md:min-w-0">
            <CardContent className="pt-4 px-3 md:px-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-gray-400 text-xs md:text-sm">Total Agents</p>
                  <p className="text-xl md:text-2xl font-bold text-white">{companyAgents.length}</p>
                </div>
                <div className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <Users className="h-4 w-4 md:h-5 md:w-5 text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800 min-w-[140px] flex-shrink-0 md:min-w-0">
            <CardContent className="pt-4 px-3 md:px-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-gray-400 text-xs md:text-sm">Active Now</p>
                  <p className="text-xl md:text-2xl font-bold text-white">{companyAgents.filter(a => a.status === 'active').length}</p>
                </div>
                <div className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <Zap className="h-4 w-4 md:h-5 md:w-5 text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800 min-w-[140px] flex-shrink-0 md:min-w-0">
            <CardContent className="pt-4 px-3 md:px-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-gray-400 text-xs md:text-sm">Departments</p>
                  <p className="text-xl md:text-2xl font-bold text-white">{Object.keys(agentsByDepartment).length}</p>
                </div>
                <div className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <Network className="h-4 w-4 md:h-5 md:w-5 text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800 min-w-[140px] flex-shrink-0 md:min-w-0">
            <CardContent className="pt-4 px-3 md:px-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-gray-400 text-xs md:text-sm">Messages Today</p>
                  <p className="text-xl md:text-2xl font-bold text-white">247</p>
                </div>
                <div className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="h-4 w-4 md:h-5 md:w-5 text-orange-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          {/* Tabs header - stacks on mobile */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <TabsList className="bg-gray-900 border border-gray-800 w-full sm:w-auto">
              <TabsTrigger value="list" className="data-[state=active]:bg-gray-800 flex-1 sm:flex-initial h-11">Agent List</TabsTrigger>
              <TabsTrigger value="marketplace" className="data-[state=active]:bg-gray-800 flex-1 sm:flex-initial h-11">Marketplace</TabsTrigger>
            </TabsList>
            
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-gray-900 border-gray-800 h-11"
              />
            </div>
          </div>

          <TabsContent value="list" className="space-y-6">
            {Object.entries(agentsByDepartment).map(([department, deptAgents]) => (
              <div key={department}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-base md:text-lg font-semibold text-white">{department}</h3>
                  <Badge variant="outline" className={departmentColors[department] || "bg-gray-500/20 text-gray-400"}>
                    {deptAgents.length} agents
                  </Badge>
                </div>
                {/* Agent cards - 1 col mobile, 2 col tablet, 3 col desktop */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {deptAgents.map((agent) => (
                    <Card
                      key={agent.id}
                      className="bg-gray-900 border-gray-800 hover:border-gray-700 cursor-pointer transition-all group"
                      onClick={() => {
                        setSelectedAgent(agent);
                        setIsProfileOpen(true);
                      }}
                    >
                      <CardContent className="p-3 md:p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar className="h-10 w-10 md:h-12 md:w-12 border-2 border-gray-700 flex-shrink-0">
                              <AvatarImage
                                src={getAgentAvatarUrl({ id: agent.id, name: agent.name, size: 96 })}
                                alt={agent.name || "Agent"}
                              />
                              <AvatarFallback className="bg-blue-600 text-white text-sm md:text-base">
                                {agent.name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="font-medium text-white group-hover:text-blue-400 transition-colors truncate text-sm md:text-base">{agent.name}</div>
                              <div className="text-xs md:text-sm text-gray-400 truncate">{agent.role}</div>
                            </div>
                          </div>
                          <Badge variant="outline" className={`${agent.status === 'active' ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"} flex-shrink-0 text-xs`}>
                            {agent.status}
                          </Badge>
                        </div>
                        <div className="mt-3 md:mt-4 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs md:text-sm text-gray-500">
                            <MessageSquare className="h-3.5 w-3.5 md:h-4 md:w-4" />
                            <span>12 messages</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-gray-400 hover:text-white h-9 w-9 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAgent(agent);
                              setIsProfileOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}

            {Object.keys(agentsByDepartment).length === 0 && !isLoading && (
              <Card className="bg-gray-900 border-gray-800">
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                  <p className="text-gray-400">No agents found</p>
                  <p className="text-sm text-gray-500 mt-1">Create your first agent or hire from the marketplace</p>
                  <Button className="mt-4 h-11">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Agent
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="marketplace" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base md:text-lg font-semibold text-white">Agent Marketplace</h3>
                <p className="text-xs md:text-sm text-gray-400">Hire pre-trained expert agents for your team</p>
              </div>
              <Button variant="outline" size="sm" className="border-gray-700 h-11 w-full sm:w-auto">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
            </div>

            {/* Marketplace grid - 1 col mobile, 2 col tablet+ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              {marketplaceAgents.map((agent) => (
                <Card key={agent.id} className="bg-gray-900 border-gray-800 hover:border-blue-500/50 cursor-pointer transition-all">
                  <CardContent className="p-4 md:p-5">
                    <div className="flex items-start justify-between mb-3 md:mb-4 gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-12 w-12 md:h-14 md:w-14 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                          <Brain className="h-6 w-6 md:h-7 md:w-7 text-white" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-white text-sm md:text-base truncate">{agent.name}</div>
                          <div className="text-xs md:text-sm text-gray-400 truncate">{agent.role}</div>
                        </div>
                      </div>
                      <Badge variant="outline" className={`${departmentColors[agent.category] || "bg-gray-500/20 text-gray-400"} flex-shrink-0 text-xs`}>
                        {agent.category}
                      </Badge>
                    </div>
                    
                    <p className="text-xs md:text-sm text-gray-400 mb-3 md:mb-4 line-clamp-2">{agent.description}</p>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 md:gap-4 text-xs md:text-sm">
                        <div className="flex items-center gap-1 text-yellow-400">
                          <Star className="h-3.5 w-3.5 md:h-4 md:w-4 fill-current" />
                          <span>{agent.rating}</span>
                        </div>
                        <div className="text-gray-500">{agent.hires} hires</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-base md:text-lg font-bold text-white">${agent.price}</span>
                        <span className="text-xs md:text-sm text-gray-500">/mo</span>
                      </div>
                    </div>
                    
                    <Button className="w-full mt-3 md:mt-4 bg-blue-600 hover:bg-blue-700 h-11">
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Hire Agent
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <AgentProfileDialog agent={selectedAgent} open={isProfileOpen} onOpenChange={setIsProfileOpen} />
    </div>
  );
}
