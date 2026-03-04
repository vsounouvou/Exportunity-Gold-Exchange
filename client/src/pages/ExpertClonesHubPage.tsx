import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/hooks/use-company";
import { apiRequest } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import HierarchyPage from "@/pages/HierarchyPage";
import { 
  Search, 
  Bot, 
  Briefcase, 
  Users, 
  TrendingUp, 
  DollarSign,
  Play,
  Pause,
  XCircle,
  CheckCircle,
  Clock,
  Star,
  GitBranch,
  Sparkles,
  Building2,
  UserPlus,
  Award
} from "lucide-react";

interface CloneProfile {
  id: number;
  displayName: string;
  title: string;
  category: string;
  primaryExpertise: string;
  description: string;
  capabilities: string[];
  baseDailyCost: string;
  trainingStatus: string;
  visibility: string;
  isPublished: boolean;
  averageRating: string;
  totalAssignments: number;
}

interface Assignment {
  id: number;
  cloneProfileId: number;
  roleWithinCompany: string;
  status: string;
  dailyCost: string;
  weeklyCost: string;
  monthlyCost: string;
  tasksCompleted: number;
  lastActiveAt: string | null;
  createdAt: string;
  cloneProfile: CloneProfile;
}

interface Agent {
  id: number;
  name: string;
  role: string;
  department: string | null;
  avatar: string;
  status: string;
  hierarchyLevel: number;
  companyId: number;
}

export function ExpertClonesHubPage() {
  const { selectedCompanyId, companies, isLoading: companiesLoading } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const effectiveCompanyId =
    selectedCompanyId ??
    companies.find((c) => c.name.toLowerCase().replace(/\s+/g, " ").trim() === "exportunity gold exchange")?.id ??
    companies[0]?.id ??
    null;

  const { data: profiles, isLoading: loadingProfiles } = useQuery<CloneProfile[]>({
    queryKey: ['/api/expert-clones/profiles'],
    select: (data) => data.filter(p => p.isPublished && p.visibility === 'public'),
  });

  const { data: assignments, isLoading: loadingAssignments } = useQuery<Assignment[]>({
    queryKey: [`/api/expert-clones/companies/${effectiveCompanyId}/assignments`],
    enabled: !!effectiveCompanyId,
  });

  const { data: agents, isLoading: loadingAgents } = useQuery<Agent[]>({
    queryKey: [`/api/companies/${effectiveCompanyId}/agents`],
    enabled: !!effectiveCompanyId,
  });

  const { data: company } = useQuery({
    queryKey: [`/api/companies/${effectiveCompanyId}`],
    enabled: !!effectiveCompanyId,
  });

  const createAssignmentMutation = useMutation({
    mutationFn: async ({ profileId, role }: { profileId: number; role: string }) => {
      if (!effectiveCompanyId) throw new Error(companiesLoading ? "Loading company..." : "No company found");

      return apiRequest(`/api/expert-clones/companies/${effectiveCompanyId}/assignments`, {
        method: "POST",
        body: JSON.stringify({
          cloneProfileId: profileId,
          roleWithinCompany: role,
        }),
      });
    },
    onSuccess: () => {
      if (effectiveCompanyId) {
        queryClient.invalidateQueries({ queryKey: [`/api/expert-clones/companies/${effectiveCompanyId}/assignments`] });
      }
      toast({
        title: "Assignment created",
        description: "Expert clone has been assigned to your company",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create assignment",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ assignmentId, action }: { assignmentId: number; action: 'activate' | 'pause' | 'terminate' }) => {
      if (!effectiveCompanyId) throw new Error(companiesLoading ? "Loading company..." : "No company found");
      return apiRequest(`/api/expert-clones/assignments/${assignmentId}/${action}`, {
        method: "POST",
        body: JSON.stringify({ companyId: effectiveCompanyId }),
      });
    },
    onSuccess: () => {
      if (effectiveCompanyId) {
        queryClient.invalidateQueries({ queryKey: [`/api/expert-clones/companies/${effectiveCompanyId}/assignments`] });
      }
      toast({
        title: "Status updated",
        description: "Assignment status has been changed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredProfiles = profiles?.filter(profile => {
    const matchesSearch = searchQuery === "" ||
      profile.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      profile.primaryExpertise.toLowerCase().includes(searchQuery.toLowerCase()) ||
      profile.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = categoryFilter === "all" || profile.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  const categories = Array.from(new Set(profiles?.map(p => p.category) || []));

  if (!effectiveCompanyId) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gray-950 flex items-center justify-center p-4">
        <Card className="bg-gray-900 border-gray-800 max-w-md w-full">
          <CardContent className="pt-6">
            <p className="text-gray-400 text-center text-sm">
              {companiesLoading ? "Loading company…" : "No company found"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const agentsByDepartment = agents?.reduce((acc, agent) => {
    const dept = agent.department || 'Unassigned';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(agent);
    return acc;
  }, {} as Record<string, Agent[]>);

  const totalAgents = agents?.length || 0;
  const totalExpertClones = assignments?.length || 0;
  const activeAgents = agents?.filter(a => a.status === 'active').length || 0;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-950">
      <div className="container mx-auto py-4 md:py-8 px-4 md:px-6 space-y-4 md:space-y-6">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-lg border border-gray-800 bg-gradient-to-br from-blue-950/30 via-gray-900 to-purple-950/30 p-4 md:p-8">
	          <div className="relative z-10">
	            <div className="flex items-center gap-2 mb-2 md:mb-3">
	              <Building2 className="h-6 w-6 md:h-8 md:w-8 text-blue-400" />
	              <h1 className="text-xl md:text-3xl font-bold text-white">Expert Agents</h1>
	            </div>
	            <p className="text-gray-300 text-sm md:text-lg mb-4 md:mb-6 max-w-2xl">
	              Manage your expert agents and discover new expert clones.
	            </p>
            
            {/* Stats Row - horizontal scroll on mobile */}
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-4">
              <Card className="bg-gray-900/50 border-gray-800 backdrop-blur min-w-[140px] flex-shrink-0 md:min-w-0">
                <CardContent className="pt-4 md:pt-6 px-3 md:px-4">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="p-1.5 md:p-2 bg-blue-500/10 rounded-lg">
                      <Users className="h-4 w-4 md:h-5 md:w-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xl md:text-2xl font-bold text-white">{totalAgents}</p>
                      <p className="text-xs md:text-sm text-gray-400">Total Agents</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-gray-900/50 border-gray-800 backdrop-blur min-w-[140px] flex-shrink-0 md:min-w-0">
                <CardContent className="pt-4 md:pt-6 px-3 md:px-4">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="p-1.5 md:p-2 bg-green-500/10 rounded-lg">
                      <CheckCircle className="h-4 w-4 md:h-5 md:w-5 text-green-400" />
                    </div>
                    <div>
                      <p className="text-xl md:text-2xl font-bold text-white">{activeAgents}</p>
                      <p className="text-xs md:text-sm text-gray-400">Active Agents</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-gray-900/50 border-gray-800 backdrop-blur min-w-[140px] flex-shrink-0 md:min-w-0">
                <CardContent className="pt-4 md:pt-6 px-3 md:px-4">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="p-1.5 md:p-2 bg-purple-500/10 rounded-lg">
                      <Sparkles className="h-4 w-4 md:h-5 md:w-5 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-xl md:text-2xl font-bold text-white">{totalExpertClones}</p>
                      <p className="text-xs md:text-sm text-gray-400">Expert Clones</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-gray-900/50 border-gray-800 backdrop-blur min-w-[140px] flex-shrink-0 md:min-w-0">
                <CardContent className="pt-4 md:pt-6 px-3 md:px-4">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="p-1.5 md:p-2 bg-yellow-500/10 rounded-lg">
                      <Award className="h-4 w-4 md:h-5 md:w-5 text-yellow-400" />
                    </div>
                    <div>
                      <p className="text-xl md:text-2xl font-bold text-white">{Object.keys(agentsByDepartment || {}).length}</p>
                      <p className="text-xs md:text-sm text-gray-400">Departments</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <Tabs defaultValue="team" className="space-y-4 md:space-y-6">
          <TabsList className="bg-gray-900 border border-gray-800 w-full sm:w-auto overflow-x-auto">
            <TabsTrigger value="team" className="flex items-center gap-1 md:gap-2 h-10 text-xs sm:text-sm">
              <Users className="h-3 w-3 md:h-4 md:w-4" />
              <span className="hidden sm:inline">Your</span> Team
              {totalAgents > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{totalAgents}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="marketplace" className="flex items-center gap-1 md:gap-2 h-10 text-xs sm:text-sm">
              <Sparkles className="h-3 w-3 md:h-4 md:w-4" />
              Marketplace
              {profiles && profiles.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{profiles.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="hierarchy" className="flex items-center gap-1 md:gap-2 h-10 text-xs sm:text-sm">
              <GitBranch className="h-3 w-3 md:h-4 md:w-4" />
              Hierarchy
            </TabsTrigger>
          </TabsList>

          <TabsContent value="team" className="space-y-4 md:space-y-6">
            {loadingAgents ? (
              <div className="grid gap-4 md:gap-6">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-48 bg-gray-900" />
                ))}
              </div>
            ) : (
              <div className="space-y-4 md:space-y-6">
                {Object.entries(agentsByDepartment || {}).map(([department, deptAgents]) => (
                  <Card key={department} className="bg-gray-900 border-gray-800">
                    <CardHeader className="p-4 md:p-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <CardTitle className="text-white text-base md:text-xl flex items-center gap-2">
                            <Briefcase className="h-4 w-4 md:h-5 md:w-5 text-blue-400" />
                            {department}
                          </CardTitle>
                          <CardDescription className="text-gray-400 text-xs md:text-sm">
                            {deptAgents.length} {deptAgents.length === 1 ? 'agent' : 'agents'} in this department
                          </CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-blue-900/20 text-blue-400 border-blue-700 self-start sm:self-auto text-xs">
                          {deptAgents.filter(a => a.status === 'active').length} Active
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 md:p-6 pt-0">
                      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                        {deptAgents.map(agent => (
                          <Card key={agent.id} className="bg-gray-800/50 border-gray-700 hover:border-gray-600 transition-colors">
                            <CardContent className="pt-4 p-3 md:p-4">
                              <div className="flex items-start gap-3">
                                <div className="text-2xl md:text-3xl">{agent.avatar}</div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-white font-medium truncate text-sm md:text-base">{agent.name}</h4>
                                  <p className="text-xs md:text-sm text-gray-400 truncate">{agent.role}</p>
                                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    <Badge 
                                      variant="outline" 
                                      className={
                                        agent.status === 'active' 
                                          ? 'bg-green-900/20 text-green-400 border-green-700 text-[10px] md:text-xs'
                                          : 'bg-gray-700/20 text-gray-400 border-gray-600 text-[10px] md:text-xs'
                                      }
                                    >
                                      {agent.status}
                                    </Badge>
                                    <Badge variant="outline" className="bg-gray-700/20 text-gray-400 border-gray-600 text-[10px] md:text-xs">
                                      Level {agent.hierarchyLevel}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                {totalAgents === 0 && (
                  <Card className="bg-gray-900 border-gray-800">
                    <CardContent className="pt-12 pb-12 text-center">
                      <Users className="h-10 w-10 md:h-12 md:w-12 text-gray-700 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm">No agents yet. Browse the Marketplace tab to hire expert clones.</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="marketplace" className="space-y-4 md:space-y-6">
            {/* My Clones Management Section */}
            {assignments && assignments.length > 0 && (
              <div className="space-y-3 md:space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base md:text-lg font-semibold text-white flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 md:h-5 md:w-5 text-green-400" />
                    My Assigned Clones ({assignments.length})
                  </h3>
                </div>
                <ScrollArea className="h-[250px] md:h-[300px]">
                  <div className="space-y-3 pr-4">
                    {assignments.map(assignment => (
                      <AssignmentCard
                        key={assignment.id}
                        assignment={assignment}
                        onStatusChange={(action) => updateStatusMutation.mutate({ assignmentId: assignment.id, action })}
                        isUpdating={updateStatusMutation.isPending}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Browse Marketplace */}
            <div className="space-y-3 md:space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-base md:text-lg font-semibold text-white">Browse Expert Clones</h3>
                <p className="text-xs md:text-sm text-gray-400">{filteredProfiles?.length || 0} available</p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    placeholder="Search by name, expertise..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-gray-900 border-gray-800 text-white h-11"
                  />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-48 bg-gray-900 border-gray-800 text-white h-11">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-800">
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <ScrollArea className="h-[calc(100vh-36rem)] md:h-[calc(100vh-32rem)]">
                {loadingProfiles ? (
                  <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {[...Array(6)].map((_, i) => (
                      <Skeleton key={i} className="h-64 bg-gray-900" />
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredProfiles?.map(profile => (
                      <CloneCard
                        key={profile.id}
                        profile={profile}
                        onAssign={(role) => createAssignmentMutation.mutate({ profileId: profile.id, role })}
                        isAssigning={createAssignmentMutation.isPending}
                      />
                    ))}
                    {filteredProfiles?.length === 0 && (
                      <div className="col-span-full text-center py-12">
                        <Bot className="h-10 w-10 md:h-12 md:w-12 text-gray-700 mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">No expert clones found matching your criteria</p>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="hierarchy">
            <HierarchyPage />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function CloneCard({ profile, onAssign, isAssigning }: { 
  profile: CloneProfile; 
  onAssign: (role: string) => void;
  isAssigning: boolean;
}) {
  const [role, setRole] = useState(profile.title);

  const getTrainingBadge = (status: string) => {
    switch (status) {
      case 'complete':
        return <Badge variant="outline" className="bg-green-900/20 text-green-400 border-green-700 text-xs">Trained</Badge>;
      case 'in_progress':
        return <Badge variant="outline" className="bg-yellow-900/20 text-yellow-400 border-yellow-700 text-xs">Training</Badge>;
      default:
        return <Badge variant="outline" className="bg-gray-700/20 text-gray-400 border-gray-600 text-xs">Draft</Badge>;
    }
  };

  return (
    <Card className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors">
      <CardHeader className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-white text-base md:text-lg truncate">{profile.displayName}</CardTitle>
            <CardDescription className="text-gray-400 text-xs md:text-sm truncate">{profile.primaryExpertise}</CardDescription>
          </div>
          {getTrainingBadge(profile.trainingStatus)}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-3 md:p-4 pt-0">
        <p className="text-xs md:text-sm text-gray-500 line-clamp-2">{profile.description}</p>
        
        <div className="flex items-center gap-4 text-xs md:text-sm">
          <div className="flex items-center gap-1 text-gray-400">
            <Star className="h-3 w-3 md:h-4 md:w-4 text-yellow-500" />
            <span>{parseFloat(profile.averageRating || '0').toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-1 text-gray-400">
            <Briefcase className="h-3 w-3 md:h-4 md:w-4" />
            <span>{profile.totalAssignments} jobs</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-800">
          <div>
            <p className="text-[10px] md:text-xs text-gray-500">Daily Cost</p>
            <p className="text-white font-semibold text-sm md:text-base">${parseFloat(profile.baseDailyCost).toFixed(2)}</p>
          </div>
          <Badge variant="outline" className="bg-blue-900/20 text-blue-400 border-blue-700 text-xs">
            {profile.category}
          </Badge>
        </div>

        <Input
          placeholder="Role (e.g., Marketing Manager)"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="bg-gray-800 border-gray-700 text-white h-10 text-sm"
        />
      </CardContent>
      <CardFooter className="p-3 md:p-4 pt-0">
        <Button
          className="w-full h-11"
          onClick={() => onAssign(role)}
          disabled={isAssigning || !role.trim()}
        >
          <CheckCircle className="h-4 w-4 mr-2" />
          Assign to Company
        </Button>
      </CardFooter>
    </Card>
  );
}

function AssignmentCard({ assignment, onStatusChange, isUpdating }: {
  assignment: Assignment;
  onStatusChange: (action: 'activate' | 'pause' | 'terminate') => void;
  isUpdating: boolean;
}) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="outline" className="bg-green-900/20 text-green-400 border-green-700 text-xs">Active</Badge>;
      case 'learning':
        return <Badge variant="outline" className="bg-blue-900/20 text-blue-400 border-blue-700 text-xs">Learning</Badge>;
      case 'paused':
        return <Badge variant="outline" className="bg-yellow-900/20 text-yellow-400 border-yellow-700 text-xs">Paused</Badge>;
      case 'terminated':
        return <Badge variant="outline" className="bg-gray-700/20 text-gray-400 border-gray-600 text-xs">Terminated</Badge>;
      default:
        return <Badge variant="outline" className="bg-gray-700/20 text-gray-400 border-gray-600 text-xs">Pending</Badge>;
    }
  };

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-white text-base md:text-lg truncate">{assignment.cloneProfile.displayName}</CardTitle>
            <CardDescription className="text-gray-400 text-xs md:text-sm truncate">{assignment.roleWithinCompany}</CardDescription>
          </div>
          {getStatusBadge(assignment.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 md:space-y-4 p-3 md:p-4 pt-0">
        <div className="grid grid-cols-3 gap-2 md:gap-4 text-xs md:text-sm">
          <div>
            <p className="text-gray-500 mb-1">Tasks</p>
            <p className="text-white font-medium">{assignment.tasksCompleted}</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Daily</p>
            <p className="text-white font-medium">${parseFloat(assignment.dailyCost).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Monthly</p>
            <p className="text-white font-medium">${parseFloat(assignment.monthlyCost).toFixed(2)}</p>
          </div>
        </div>

        <div className="flex gap-2">
          {assignment.status === 'paused' && (
            <Button 
              size="sm" 
              className="flex-1 h-10"
              onClick={() => onStatusChange('activate')}
              disabled={isUpdating}
            >
              <Play className="h-3 w-3 mr-1" />
              Activate
            </Button>
          )}
          {assignment.status === 'active' && (
            <Button 
              size="sm" 
              variant="outline"
              className="flex-1 h-10"
              onClick={() => onStatusChange('pause')}
              disabled={isUpdating}
            >
              <Pause className="h-3 w-3 mr-1" />
              Pause
            </Button>
          )}
          {assignment.status !== 'terminated' && (
            <Button 
              size="sm" 
              variant="destructive"
              className="h-10"
              onClick={() => onStatusChange('terminate')}
              disabled={isUpdating}
            >
              <XCircle className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
