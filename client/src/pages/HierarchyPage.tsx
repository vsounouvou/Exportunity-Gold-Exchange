import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Users, UserRoundCog, ChevronRight, ChevronDown, Plus, Building2, Pencil, Trash2, Eye, EyeOff, Target } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/use-company";
import { OrgChartTree } from "@/components/OrgChartTree";
import type { Agent as DBAgent, Department } from "@db/schema";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { useLocation } from "wouter";

interface Agent extends DBAgent {
  manager?: {
    id: number;
    name: string;
    role: string;
  };
  subordinates?: Array<{
    id: number;
    name: string;
    role: string;
    status: string;
  }>;
}

interface DepartmentWithAgents extends Department {
  agents: Agent[];
}

interface Company {
  id: number;
  name: string;
  description: string | null;
  vision: string | null;
  currentGoals: string[] | null;
  monthlyBudget: string;
  budgetUsed: string;
  status: string;
}

interface StrategicGoal {
  id: number;
  title: string;
  status: string | null;
  priority: string | null;
}

function DepartmentCard({ 
  department, 
  onEdit, 
  onDelete,
  onAgentClick,
  allAgents 
}: { 
  department: DepartmentWithAgents;
  onEdit: (dept: DepartmentWithAgents) => void;
  onDelete: (deptId: number) => void;
  onAgentClick: (agent: Agent) => void;
  allAgents: Agent[];
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  // Build parent→children map once for O(1) lookups (performance optimization)
  const childrenMap = useMemo(() => {
    const map = new Map<number, Agent[]>();
    const inDepartment = new Set<number>(department.agents.map((a) => a.id));

    department.agents.forEach((agent) => {
      const parentId =
        agent.managerId && inDepartment.has(agent.managerId) ? agent.managerId : 0;
      const list = map.get(parentId) ?? [];
      list.push(agent);
      map.set(parentId, list);
    });

    for (const [, list] of map) {
      list.sort((a, b) => {
        const headA = a.isDepartmentHead ? 1 : 0;
        const headB = b.isDepartmentHead ? 1 : 0;
        if (headA !== headB) return headB - headA;
        return a.name.localeCompare(b.name);
      });
    }

    return map;
  }, [department.agents]);
  
  const renderAgentNode = (agent: Agent, level: number = 0) => {
    const subordinates = childrenMap.get(agent.id) || [];
    const baseBudget = parseFloat(agent.baseBudget || '0');
    const budgetUsed = parseFloat(agent.budgetUsed || '0');
    const budgetBonus = parseFloat(agent.budgetBonus || '0');
    const totalBudget = baseBudget + budgetBonus;
    const avatarSrc = agent.avatarUrl || agent.avatar || "";
    
    return (
      <div key={agent.id} className={level > 0 ? 'ml-6 mt-2' : 'mt-2'}>
        <div 
          className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent cursor-pointer transition-colors border border-border"
          onClick={() => onAgentClick(agent)}
        >
          <div className="flex items-center gap-2 flex-1">
            {avatarSrc ? (
              <img src={avatarSrc} alt="" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                {agent.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">{agent.name}</p>
                {agent.isDepartmentHead && (
                  <Badge variant="outline" className="text-xs">Head</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate">{agent.role}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">${totalBudget.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{subordinates.length} reports</p>
            </div>
            <Badge variant={agent.status === 'active' ? 'default' : 'secondary'}>
              {agent.status}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={(event) => {
                event.stopPropagation();
                onAgentClick(agent);
              }}
              aria-label={`Edit ${agent.name}`}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
        </div>
        {subordinates.length > 0 && (
          <div className="relative mt-2">
            <div className="absolute left-4 top-0 bottom-2 w-px bg-border" />
            {subordinates.map(sub => renderAgentNode(sub, level + 1))}
          </div>
        )}
      </div>
    );
  };
  
  const topLevelAgents = childrenMap.get(0) || [];
  
  return (
    <Card className="overflow-hidden">
      <CardHeader 
        className="cursor-pointer hover:bg-accent/50 transition-colors"
        style={{ backgroundColor: `${department.color || '#6B7280'}15` }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isExpanded ? (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            )}
            <div 
              className="w-1 h-12 rounded-full" 
              style={{ backgroundColor: department.color || '#6B7280' }}
            />
            <div>
              <CardTitle className="text-lg">{department.name}</CardTitle>
              {department.description && (
                <p className="text-sm text-muted-foreground mt-1">{department.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <Badge variant="secondary" className="text-xs md:text-sm">
              {department.agents.length} {department.agents.length === 1 ? 'agent' : 'agents'}
            </Badge>
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <Button 
                variant="ghost" 
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => onEdit(department)}
                aria-label={`Edit ${department.name}`}
                title={`Edit ${department.name}`}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => onDelete(department.id)}
                aria-label={`Delete ${department.name}`}
                title={`Delete ${department.name}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="pt-4">
          {department.agents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No agents in this department yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {topLevelAgents.map(agent => renderAgentNode(agent))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function CreateDepartmentDialog({ companyId }: { companyId: number }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6B7280");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(resolveApiUrl(`/api/companies/${companyId}/departments`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, color }),
        credentials: 'include'
      });
      
      if (!res.ok) throw new Error('Failed to create department');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/departments`] });
      toast({ title: "Department created", description: `${name} has been added` });
      setOpen(false);
      setName("");
      setDescription("");
      setColor("#6B7280");
    },
    onError: () => {
      toast({ 
        title: "Creation failed", 
        description: "Could not create department",
        variant: "destructive" 
      });
    }
  });
  
  const departmentColors = [
    { name: "Gray", value: "#6B7280" },
    { name: "Blue", value: "#3B82F6" },
    { name: "Green", value: "#10B981" },
    { name: "Purple", value: "#8B5CF6" },
    { name: "Orange", value: "#F59E0B" },
    { name: "Pink", value: "#EC4899" },
    { name: "Red", value: "#EF4444" },
    { name: "Teal", value: "#14B8A6" },
  ];
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Department
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Department</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="dept-name">Department Name</Label>
            <Input
              id="dept-name"
              placeholder="e.g., Sales, Marketing, Finance"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dept-desc">Description (Optional)</Label>
            <Input
              id="dept-desc"
              placeholder="Brief description of this department"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="grid grid-cols-4 gap-2">
              {departmentColors.map((c) => (
                <button
                  key={c.value}
                  className={`h-10 rounded-md border-2 transition-all ${color === c.value ? 'border-primary scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c.value }}
                  onClick={() => setColor(c.value)}
                  title={c.name}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!name || createMutation.isPending}>
            Create Department
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDepartmentDialog({ 
  department, 
  open, 
  onOpenChange 
}: { 
  department: DepartmentWithAgents | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(department?.name || "");
  const [description, setDescription] = useState(department?.description || "");
  const [color, setColor] = useState(department?.color || "#6B7280");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Sync form state with incoming department prop
  useEffect(() => {
    if (open && department) {
      setName(department.name || "");
      setDescription(department.description || "");
      setColor(department.color || "#6B7280");
    }
  }, [open, department]);
  
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!department) return;
      const res = await fetch(resolveApiUrl(`/api/departments/${department.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, color }),
        credentials: 'include'
      });
      
      if (!res.ok) throw new Error('Failed to update department');
      return res.json();
    },
    onSuccess: () => {
      if (department) {
        queryClient.invalidateQueries({ queryKey: [`/api/companies/${department.companyId}/departments`] });
      }
      toast({ title: "Department updated", description: `${name} has been saved` });
      onOpenChange(false);
    },
    onError: () => {
      toast({ 
        title: "Update failed", 
        description: "Could not update department",
        variant: "destructive" 
      });
    }
  });
  
  const departmentColors = [
    { name: "Gray", value: "#6B7280" },
    { name: "Blue", value: "#3B82F6" },
    { name: "Green", value: "#10B981" },
    { name: "Purple", value: "#8B5CF6" },
    { name: "Orange", value: "#F59E0B" },
    { name: "Pink", value: "#EC4899" },
    { name: "Red", value: "#EF4444" },
    { name: "Teal", value: "#14B8A6" },
  ];
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Department</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-dept-name">Department Name</Label>
            <Input
              id="edit-dept-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-dept-desc">Description</Label>
            <Input
              id="edit-dept-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="grid grid-cols-4 gap-2">
              {departmentColors.map((c) => (
                <button
                  key={c.value}
                  className={`h-10 rounded-md border-2 transition-all ${color === c.value ? 'border-primary scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c.value }}
                  onClick={() => setColor(c.value)}
                  title={c.name}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function HierarchyPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { selectedCompanyId } = useCompany();
  const [, setLocation] = useLocation();
  const [viewMode, setViewMode] = useState<"departments" | "org">("org");
  const [showEmptyDepartments, setShowEmptyDepartments] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<DepartmentWithAgents | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  const { data: companyData, isLoading: isLoadingCompany } = useQuery<Company>({
    queryKey: [`/api/companies/${selectedCompanyId}`],
    enabled: !!selectedCompanyId,
  });
  
  const { data: departments, isLoading: isLoadingDepts } = useQuery<DepartmentWithAgents[]>({
    queryKey: [`/api/companies/${selectedCompanyId}/departments`],
    enabled: !!selectedCompanyId,
  });
  
  const { data: allAgents } = useQuery<Agent[]>({
    queryKey: [`/api/companies/${selectedCompanyId}/agents`],
    enabled: !!selectedCompanyId,
  });

  const { data: strategicGoals = [] } = useQuery<StrategicGoal[]>({
    queryKey: [`/api/goals/company/${selectedCompanyId}`],
    enabled: !!selectedCompanyId,
  });
  
  const deleteDepartmentMutation = useMutation({
    mutationFn: async (deptId: number) => {
      const res = await fetch(resolveApiUrl(`/api/departments/${deptId}`), {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (!res.ok) throw new Error('Failed to delete department');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/departments`] });
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/agents`] });
      toast({ title: "Department deleted", description: "Agents have been reassigned" });
    },
    onError: () => {
      toast({ 
        title: "Deletion failed", 
        description: "Could not delete department",
        variant: "destructive" 
      });
    }
  });
  
  const handleEditDepartment = (dept: DepartmentWithAgents) => {
    setEditingDepartment(dept);
    setIsEditDialogOpen(true);
  };
  
  const handleDeleteDepartment = (deptId: number) => {
    if (confirm("Delete this department? All agents will be unassigned.")) {
      deleteDepartmentMutation.mutate(deptId);
    }
  };
  
  const handleAgentClick = (agent: Agent) => {
    setLocation(`/operations/agents/${agent.id}?edit=1`);
  };
  
  const companyAgentIds = new Set((allAgents || []).map((agent) => agent.id));
  const orphanedAgents = (allAgents || []).filter(
    (agent) => agent.managerId != null && !companyAgentIds.has(agent.managerId),
  );
  const departmentUnassignedAgents = (allAgents || []).filter((agent) => !agent.departmentId);
  const activeDepartments = (departments || []).filter((department) => department.agents.length > 0);
  const emptyDepartments = (departments || []).filter((department) => department.agents.length === 0);
  const visibleDepartments = showEmptyDepartments ? (departments || []) : activeDepartments;
  
  if (!selectedCompanyId || isLoadingCompany || isLoadingDepts) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }
  
  if (!companyData) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>No company found</AlertDescription>
        </Alert>
      </div>
    );
  }
  
  const activeStrategicGoals = strategicGoals.filter((goal) => goal.status === "planned" || goal.status === "in_progress");
  const companyMission = companyData.vision || activeStrategicGoals[0]?.title || companyData.currentGoals?.[0] || "Set the industrial mission";
  
  return (
    <div className="exportunity-operations-light min-h-full bg-[#f7f8fa] p-4 text-slate-950 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-3xl font-bold tracking-tight">{companyData.name}</h1>
          <p className="mt-1 text-sm text-slate-600 md:text-base">
            AI operating team, departments, reporting lines, and human oversight.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="border-slate-300 bg-white text-slate-800" onClick={() => setLocation("/admin-users")}>
            <UserRoundCog className="mr-2 h-4 w-4" /> People & access
          </Button>
          {selectedCompanyId && <CreateDepartmentDialog companyId={selectedCompanyId} />}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Target className="h-4 w-4 text-amber-600" />
              Industrial Mission
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="line-clamp-3 text-sm font-semibold leading-6">{companyMission}</p>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-0 text-amber-700" onClick={() => setLocation("/goals")}>
              {activeStrategicGoals.length} active objectives
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
        
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <UserRoundCog className="h-4 w-4 text-amber-600" />
              Human oversight
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-6 text-slate-600">
              People approve external messages, payments, legal commitments, and sensitive agent actions.
            </p>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-0 text-amber-700" onClick={() => setLocation("/admin-users")}>
              Manage people & access
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
        
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Departments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <Building2 className="w-5 h-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{activeDepartments.length}</span>
              <span className="text-sm text-muted-foreground">active departments</span>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {allAgents?.length || 0} AI agents{emptyDepartments.length ? ` - ${emptyDepartments.length} empty hidden` : ""}
            </p>
          </CardContent>
        </Card>
      </div>
      
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="org">AI org chart</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
        </TabsList>

        <TabsContent value="org" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">AI operating team</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">
                Select any agent to edit its identity, face, instructions, model, permissions, and memory.
              </p>
              <OrgChartTree agents={allAgents || []} onAgentClick={handleAgentClick} />
              {orphanedAgents.length > 0 && (
                <div className="text-sm text-amber-700">
                  {orphanedAgents.length} {orphanedAgents.length === 1 ? "agent has" : "agents have"} an unavailable manager.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments" className="space-y-4">
          {emptyDepartments.length > 0 && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setShowEmptyDepartments((current) => !current)}
              >
                {showEmptyDepartments ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showEmptyDepartments ? "Hide empty departments" : `Show ${emptyDepartments.length} empty departments`}
              </Button>
            </div>
          )}
          {visibleDepartments.length > 0 ? (
            visibleDepartments.map(dept => (
              <DepartmentCard
                key={dept.id}
                department={dept}
                onEdit={handleEditDepartment}
                onDelete={handleDeleteDepartment}
                onAgentClick={handleAgentClick}
                allAgents={allAgents || []}
              />
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No Departments Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first department to organize your agents
                </p>
                {selectedCompanyId && <CreateDepartmentDialog companyId={selectedCompanyId} />}
              </CardContent>
            </Card>
          )}
          
          {departmentUnassignedAgents.length > 0 && (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Unassigned Agents ({departmentUnassignedAgents.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {departmentUnassignedAgents.map(agent => (
                    <div 
                      key={agent.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent cursor-pointer transition-colors border border-border"
                      onClick={() => handleAgentClick(agent)}
                    >
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <Users className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{agent.name}</p>
                        <p className="text-sm text-muted-foreground">{agent.role}</p>
                      </div>
                      <Badge variant="secondary">{agent.status}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
      
      <EditDepartmentDialog
        department={editingDepartment}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
      />
      </div>
    </div>
  );
}
