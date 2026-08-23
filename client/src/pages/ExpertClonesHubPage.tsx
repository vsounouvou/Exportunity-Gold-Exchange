import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/hooks/use-company";
import { apiRequest } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import HierarchyPage from "@/pages/HierarchyPage";
import {
  Award,
  Bot,
  Briefcase,
  CheckCircle,
  GitBranch,
  Pause,
  Play,
  Search,
  Sparkles,
  Star,
  Users,
  XCircle,
} from "lucide-react";

interface CloneProfile {
  id: number;
  displayName: string;
  title: string;
  category: string;
  primaryExpertise: string;
  bio: string | null;
  longDescription: string | null;
  skills: string[];
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
  status: string;
  hierarchyLevel: number;
  companyId: number;
}

type AssignmentAction = "activate" | "pause" | "terminate";

function exactDecimal(value: string | null | undefined, scale = 2) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value ?? "").trim());
  if (!match) return "—";
  const whole = match[1].replace(/^0+(?=\d)/, "");
  if (scale === 0) return whole;
  const fraction = (match[2] || "").padEnd(scale, "0").slice(0, scale);
  return `${whole}.${fraction}`;
}

function exactUsd(value: string | null | undefined) {
  const amount = exactDecimal(value);
  return amount === "—" ? "Not set" : `USD ${amount}`;
}

function profileDescription(profile: CloneProfile) {
  return profile.longDescription || profile.bio || "No operational description has been recorded.";
}

export function ExpertClonesHubPage() {
  const { selectedCompanyId, selectedCompany, companies, isLoading: companiesLoading } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("team");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const effectiveCompanyId = selectedCompanyId ?? companies[0]?.id ?? null;
  const effectiveCompany = selectedCompany ?? companies.find((company) => company.id === effectiveCompanyId) ?? null;

  const {
    data: profiles = [],
    isLoading: loadingProfiles,
    isError: profilesError,
  } = useQuery<CloneProfile[]>({
    queryKey: ["/api/expert-clones/profiles"],
    select: (data) => data.filter((profile) => profile.isPublished && profile.visibility === "public_marketplace"),
  });

  const {
    data: assignments = [],
    isLoading: loadingAssignments,
    isError: assignmentsError,
  } = useQuery<Assignment[]>({
    queryKey: [`/api/expert-clones/companies/${effectiveCompanyId}/assignments`],
    enabled: Boolean(effectiveCompanyId),
  });

  const {
    data: agents = [],
    isLoading: loadingAgents,
    isError: agentsError,
  } = useQuery<Agent[]>({
    queryKey: [`/api/companies/${effectiveCompanyId}/agents`],
    enabled: Boolean(effectiveCompanyId),
  });

  const createAssignmentMutation = useMutation({
    mutationFn: async ({ profileId, role }: { profileId: number; role: string }) => {
      if (!effectiveCompanyId) throw new Error(companiesLoading ? "Loading company…" : "No company found");
      return apiRequest(`/api/expert-clones/companies/${effectiveCompanyId}/assignments`, {
        method: "POST",
        body: JSON.stringify({ cloneProfileId: profileId, roleWithinCompany: role }),
      });
    },
    onSuccess: async () => {
      if (effectiveCompanyId) {
        await queryClient.invalidateQueries({ queryKey: [`/api/expert-clones/companies/${effectiveCompanyId}/assignments`] });
      }
      toast({ title: "Assignment created", description: "The expert agent is now pending activation in this workspace." });
    },
    onError: (error: any) => {
      toast({ title: "Assignment failed", description: error?.message || "The expert agent could not be assigned.", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ assignmentId, action }: { assignmentId: number; action: AssignmentAction }) => {
      if (!effectiveCompanyId) throw new Error(companiesLoading ? "Loading company…" : "No company found");
      return apiRequest(`/api/expert-clones/assignments/${assignmentId}/${action}`, {
        method: "POST",
        body: JSON.stringify({ companyId: effectiveCompanyId }),
      });
    },
    onSuccess: async () => {
      if (effectiveCompanyId) {
        await queryClient.invalidateQueries({ queryKey: [`/api/expert-clones/companies/${effectiveCompanyId}/assignments`] });
      }
      toast({ title: "Assignment updated", description: "The recorded assignment status has been changed." });
    },
    onError: (error: any) => {
      toast({ title: "Status update failed", description: error?.message || "The assignment status could not be changed.", variant: "destructive" });
    },
  });

  if (!effectiveCompanyId) {
    return (
      <div data-testid="exportunity-expert-agents-workspace" className="flex min-h-[calc(100vh-var(--admin-header-height,4rem))] items-center justify-center bg-[#F7F8FA] p-4 text-[#07111F]">
        <Card className="w-full max-w-md border-slate-200 bg-white text-slate-950 shadow-sm">
          <CardContent className="py-10 text-center">
            <p className="font-bold text-slate-950">{companiesLoading ? "Loading company…" : "No tenant company is available"}</p>
            <p className="mt-2 text-sm text-slate-500">Expert assignments require an active company in the current tenant.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const agentsByDepartment = agents.reduce((acc, agent) => {
    const department = agent.department || "Unassigned";
    if (!acc[department]) acc[department] = [];
    acc[department].push(agent);
    return acc;
  }, {} as Record<string, Agent[]>);

  const activeAgents = agents.filter((agent) => agent.status === "active").length;
  const activeExpertAssignments = assignments.filter((assignment) => assignment.status === "active").length;
  const assignedProfileIds = new Set(
    assignments
      .filter((assignment) => assignment.status !== "terminated")
      .map((assignment) => assignment.cloneProfileId),
  );
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredProfiles = profiles.filter((profile) => {
    const matchesSearch =
      !normalizedSearch ||
      profile.displayName.toLowerCase().includes(normalizedSearch) ||
      profile.primaryExpertise.toLowerCase().includes(normalizedSearch) ||
      profile.title.toLowerCase().includes(normalizedSearch) ||
      profileDescription(profile).toLowerCase().includes(normalizedSearch) ||
      (profile.skills || []).some((skill) => skill.toLowerCase().includes(normalizedSearch));
    const matchesCategory = categoryFilter === "all" || profile.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });
  const categories = Array.from(new Set(profiles.map((profile) => profile.category))).sort();

  return (
    <div data-testid="exportunity-expert-agents-workspace" className="min-h-[calc(100vh-var(--admin-header-height,4rem))] bg-[#F7F8FA] p-4 pb-24 text-[#07111F] md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8A5700]">GTN agent operations</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">Expert agent network</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                Review the current team, assign verified expert profiles, and manage their recorded operating state.
              </p>
            </div>
            <div className="rounded-full border border-slate-200 bg-[#FBFCFD] px-3 py-1.5 text-xs font-bold text-slate-700">
              {effectiveCompany?.name || `Company #${effectiveCompanyId}`}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={<Users className="h-5 w-5" />} label="Team agents" value={agents.length} />
            <StatCard icon={<CheckCircle className="h-5 w-5" />} label="Active team" value={activeAgents} tone="success" />
            <StatCard icon={<Sparkles className="h-5 w-5" />} label="Expert assignments" value={assignments.length} tone="accent" />
            <StatCard icon={<Award className="h-5 w-5" />} label="Active experts" value={activeExpertAssignments} tone="gold" />
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
          <TabsList className="h-auto w-full justify-start overflow-x-auto border border-slate-200 bg-white p-1 text-slate-600 sm:w-auto">
            <TabsTrigger value="team" className="h-10 gap-2 whitespace-nowrap data-[state=active]:bg-[#07111F] data-[state=active]:text-white">
              <Users className="h-4 w-4" /> Team <Badge variant="secondary" className="ml-1">{agents.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="catalog" className="h-10 gap-2 whitespace-nowrap data-[state=active]:bg-[#07111F] data-[state=active]:text-white">
              <Sparkles className="h-4 w-4" /> Expert catalog <Badge variant="secondary" className="ml-1">{profiles.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="hierarchy" className="h-10 gap-2 whitespace-nowrap data-[state=active]:bg-[#07111F] data-[state=active]:text-white">
              <GitBranch className="h-4 w-4" /> Hierarchy
            </TabsTrigger>
          </TabsList>

          <TabsContent value="team" className="space-y-5">
            {loadingAgents ? (
              <div className="grid gap-4">
                {[0, 1, 2].map((item) => <Skeleton key={item} className="h-48 bg-slate-200" />)}
              </div>
            ) : agentsError ? (
              <ReadError message="The tenant team could not be loaded." />
            ) : agents.length === 0 ? (
              <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
                <CardContent className="py-12 text-center">
                  <Users className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-3 font-bold text-slate-950">No team agents recorded</p>
                  <p className="mt-1 text-sm text-slate-500">You can review eligible expert profiles without creating an assignment.</p>
                  <Button variant="outline" className="mt-4 border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]" onClick={() => setActiveTab("catalog")}>Open expert catalog</Button>
                </CardContent>
              </Card>
            ) : (
              Object.entries(agentsByDepartment).map(([department, departmentAgents]) => (
                <Card key={department} className="border-slate-200 bg-white text-slate-950 shadow-sm">
                  <CardHeader className="p-4 md:p-6">
                    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base text-slate-950 md:text-xl"><Briefcase className="h-5 w-5 text-[#8A5700]" />{department}</CardTitle>
                        <CardDescription className="text-slate-500">{departmentAgents.length} recorded {departmentAgents.length === 1 ? "agent" : "agents"}</CardDescription>
                      </div>
                      <Badge variant="outline" className="w-fit border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                        {departmentAgents.filter((agent) => agent.status === "active").length} active
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-3 p-4 pt-0 sm:grid-cols-2 md:p-6 md:pt-0 lg:grid-cols-3">
                    {departmentAgents.map((agent) => <TeamAgentCard key={agent.id} agent={agent} />)}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="catalog" className="space-y-6">
            <section className="space-y-3">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                <div>
                  <h2 className="text-lg font-black text-slate-950">Assigned expert agents</h2>
                  <p className="text-sm text-slate-500">Activation, pause, and termination are explicit tenant-scoped status changes.</p>
                </div>
                <Badge variant="outline" className="w-fit border-slate-200 bg-white text-slate-700 hover:bg-white">{assignments.length} assignments</Badge>
              </div>
              {loadingAssignments ? (
                <Skeleton className="h-40 bg-slate-200" />
              ) : assignmentsError ? (
                <ReadError message="Expert assignments could not be loaded." />
              ) : assignments.length ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {assignments.map((assignment) => (
                    <AssignmentCard
                      key={assignment.id}
                      assignment={assignment}
                      onStatusChange={(action) => updateStatusMutation.mutate({ assignmentId: assignment.id, action })}
                      isUpdating={updateStatusMutation.isPending}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">No expert assignments have been recorded for this company.</div>
              )}
            </section>

            <section className="space-y-4">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                <div>
                  <h2 className="text-lg font-black text-slate-950">Verified expert catalog</h2>
                  <p className="text-sm text-slate-500">Only published profiles with current public-marketplace visibility are shown.</p>
                </div>
                <span className="text-xs font-bold text-slate-500">{filteredProfiles.length} available</span>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input placeholder="Search name, role, expertise, or skill" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-11 border-slate-200 bg-white pl-10 text-slate-950" />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-11 w-full border-slate-200 bg-white text-slate-950 sm:w-52"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent className="border-slate-200 bg-white text-slate-950">
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {loadingProfiles ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[0, 1, 2, 3, 4, 5].map((item) => <Skeleton key={item} className="h-72 bg-slate-200" />)}
                </div>
              ) : profilesError ? (
                <ReadError message="The verified expert catalog could not be loaded." />
              ) : filteredProfiles.length ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredProfiles.map((profile) => (
                    <CloneCard
                      key={profile.id}
                      profile={profile}
                      alreadyAssigned={assignedProfileIds.has(profile.id)}
                      onAssign={(role) => createAssignmentMutation.mutate({ profileId: profile.id, role })}
                      isAssigning={createAssignmentMutation.isPending}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
                  <Bot className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-3 font-bold text-slate-950">No matching expert profiles</p>
                  <p className="mt-1 text-sm text-slate-500">Adjust the catalog search or category filter.</p>
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="hierarchy" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <HierarchyPage />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, tone = "default" }: { icon: ReactNode; label: string; value: number; tone?: "default" | "success" | "accent" | "gold" }) {
  const toneClass = {
    default: "bg-blue-50 text-blue-700",
    success: "bg-emerald-50 text-emerald-700",
    accent: "bg-violet-50 text-violet-700",
    gold: "bg-[#FFF8E8] text-[#8A5700]",
  }[tone];
  return (
    <Card className="border-slate-200 bg-[#FBFCFD] text-slate-950 shadow-none">
      <CardContent className="flex items-center gap-3 p-3 md:p-4">
        <div className={`rounded-lg p-2 ${toneClass}`}>{icon}</div>
        <div><p className="text-xl font-black text-slate-950 md:text-2xl">{value}</p><p className="text-xs text-slate-500 md:text-sm">{label}</p></div>
      </CardContent>
    </Card>
  );
}

function TeamAgentCard({ agent }: { agent: Agent }) {
  const active = agent.status === "active";
  return (
    <article data-testid="exportunity-team-agent-record" className="rounded-xl border border-slate-200 bg-[#FBFCFD] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#07111F] text-sm font-black text-white">{agent.name.trim().slice(0, 1).toUpperCase() || "A"}</div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold text-slate-950">{agent.name}</h3>
          <p className="truncate text-sm text-slate-500">{agent.role}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline" className={active ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50" : "border-slate-200 bg-white text-slate-600 hover:bg-white"}>{agent.status}</Badge>
            <Badge variant="outline" className="border-slate-200 bg-white text-slate-600 hover:bg-white">Level {agent.hierarchyLevel}</Badge>
          </div>
        </div>
      </div>
    </article>
  );
}

function trainingBadge(status: string) {
  if (status === "ready" || status === "active") return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Ready</Badge>;
  if (status === "training") return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">Training</Badge>;
  if (status === "paused") return <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">Paused</Badge>;
  if (status === "archived") return <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100">Archived</Badge>;
  return <Badge variant="outline" className="border-slate-200 bg-white text-slate-600 hover:bg-white">Draft</Badge>;
}

function CloneCard({ profile, alreadyAssigned, onAssign, isAssigning }: { profile: CloneProfile; alreadyAssigned: boolean; onAssign: (role: string) => void; isAssigning: boolean }) {
  const [role, setRole] = useState(profile.title);
  const requestAssignment = () => {
    const normalizedRole = role.trim();
    if (!normalizedRole || alreadyAssigned) return;
    if (window.confirm(`Assign ${profile.displayName} as ${normalizedRole} at ${exactUsd(profile.baseDailyCost)} per day?`)) onAssign(normalizedRole);
  };
  return (
    <Card data-testid="exportunity-expert-profile-record" className="flex h-full flex-col border-slate-200 bg-white text-slate-950 shadow-sm transition-colors hover:border-[#F5A623]">
      <CardHeader className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1"><CardTitle className="truncate text-lg text-slate-950">{profile.displayName}</CardTitle><CardDescription className="truncate text-slate-500">{profile.primaryExpertise}</CardDescription></div>
          {trainingBadge(profile.trainingStatus)}
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4 p-4 pt-0">
        <p className="line-clamp-3 text-sm text-slate-600">{profileDescription(profile)}</p>
        {profile.skills?.length ? <div className="flex flex-wrap gap-1.5">{profile.skills.slice(0, 3).map((skill) => <Badge key={skill} variant="outline" className="border-slate-200 bg-[#FBFCFD] text-slate-600 hover:bg-[#FBFCFD]">{skill}</Badge>)}</div> : null}
        <div className="flex items-center gap-4 text-sm text-slate-500"><span className="flex items-center gap-1"><Star className="h-4 w-4 text-[#F5A623]" />{exactDecimal(profile.averageRating)}</span><span className="flex items-center gap-1"><Briefcase className="h-4 w-4" />{profile.totalAssignments} assignments</span></div>
        <div className="flex items-center justify-between border-t border-slate-200 pt-3"><div><p className="text-xs text-slate-500">Daily cost</p><p className="font-black text-slate-950">{exactUsd(profile.baseDailyCost)}</p></div><Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">{profile.category}</Badge></div>
        <Input aria-label={`Role for ${profile.displayName}`} value={role} onChange={(event) => setRole(event.target.value)} disabled={alreadyAssigned} placeholder="Operational role" className="h-10 border-slate-200 bg-white text-slate-950" />
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Button className="h-11 w-full bg-[#F5A623] font-bold text-[#07111F] hover:bg-[#E49718]" onClick={requestAssignment} disabled={alreadyAssigned || isAssigning || !role.trim()}>
          <CheckCircle className="mr-2 h-4 w-4" />{alreadyAssigned ? "Already assigned" : isAssigning ? "Assigning…" : "Assign to workspace"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function assignmentBadge(status: string) {
  if (status === "active") return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Active</Badge>;
  if (status === "learning") return <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">Learning</Badge>;
  if (status === "paused") return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">Paused</Badge>;
  if (status === "terminated") return <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100">Terminated</Badge>;
  return <Badge variant="outline" className="border-slate-200 bg-white text-slate-600 hover:bg-white">Pending</Badge>;
}

function AssignmentCard({ assignment, onStatusChange, isUpdating }: { assignment: Assignment; onStatusChange: (action: AssignmentAction) => void; isUpdating: boolean }) {
  const requestStatusChange = (action: AssignmentAction) => {
    const label = assignment.cloneProfile.displayName;
    const prompt = action === "terminate"
      ? `Terminate ${label}'s assignment? This ends the current assignment.`
      : `${action === "pause" ? "Pause" : "Activate"} ${label}'s assignment?`;
    if (window.confirm(prompt)) onStatusChange(action);
  };
  const canActivate = assignment.status === "pending" || assignment.status === "learning" || assignment.status === "paused";
  return (
    <Card data-testid="exportunity-expert-assignment-record" className="border-slate-200 bg-white text-slate-950 shadow-sm">
      <CardHeader className="p-4">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0 flex-1"><CardTitle className="truncate text-lg text-slate-950">{assignment.cloneProfile.displayName}</CardTitle><CardDescription className="truncate text-slate-500">{assignment.roleWithinCompany}</CardDescription></div>{assignmentBadge(assignment.status)}</div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0">
        <div className="grid grid-cols-3 gap-3 rounded-lg bg-[#FBFCFD] p-3 text-sm"><div><p className="text-xs text-slate-500">Tasks</p><p className="mt-1 font-bold text-slate-950">{assignment.tasksCompleted}</p></div><div><p className="text-xs text-slate-500">Daily</p><p className="mt-1 font-bold text-slate-950">{exactUsd(assignment.dailyCost)}</p></div><div><p className="text-xs text-slate-500">Monthly</p><p className="mt-1 font-bold text-slate-950">{exactUsd(assignment.monthlyCost)}</p></div></div>
        <div className="flex flex-wrap gap-2">
          {canActivate ? <Button size="sm" className="bg-[#F5A623] font-bold text-[#07111F] hover:bg-[#E49718]" onClick={() => requestStatusChange("activate")} disabled={isUpdating}><Play className="mr-1 h-4 w-4" />Activate</Button> : null}
          {assignment.status === "active" ? <Button size="sm" variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-[#FFF8E8]" onClick={() => requestStatusChange("pause")} disabled={isUpdating}><Pause className="mr-1 h-4 w-4" />Pause</Button> : null}
          {assignment.status !== "terminated" ? <Button size="sm" variant="destructive" onClick={() => requestStatusChange("terminate")} disabled={isUpdating}><XCircle className="mr-1 h-4 w-4" />Terminate</Button> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ReadError({ message }: { message: string }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">{message}</div>;
}
