import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/hooks/use-company";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Target, Plus, Calendar, Clock, CheckCircle, AlertTriangle, 
  Users, TrendingUp, PlayCircle, XCircle, Inbox, ChevronRight,
  BarChart3, User, ArrowUpRight, ArrowDownRight, X
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface Goal {
  id: number;
  companyId: number;
  title: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  deadline: string | null;
  progress: number | null;
  ownerAgentId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  taskStats: {
    total: number;
    completed: number;
    inProgress: number;
    blocked: number;
    backlog: number;
  };
  ownerAgent?: { id: number; name: string; role: string | null } | null;
}

interface Task {
  id: number;
  title: string;
  status: string | null;
  priority: string | null;
  agentId: number | null;
  agent?: { id: number; name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  in_progress: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  blocked: "bg-red-500/20 text-red-400 border-red-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  cancelled: "bg-gray-600/20 text-gray-500 border-gray-600/30",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
};

export function GoalsPage() {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState("all");
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [newGoal, setNewGoal] = useState({
    title: "",
    description: "",
    priority: "medium",
    deadline: "",
    ownerAgentId: "",
  });

  const { data: goals = [], isLoading } = useQuery<Goal[]>({
    queryKey: [`/api/goals/company/${selectedCompanyId}`],
    enabled: !!selectedCompanyId,
  });

  const { data: agents = [] } = useQuery<any[]>({
    queryKey: ["/api/agents"],
  });

  const { data: goalTasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/goals", selectedGoal?.id, "tasks"],
    enabled: !!selectedGoal?.id,
  });

  const companyAgents = agents.filter(a => a.companyId === selectedCompanyId);

  const createGoalMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          title: newGoal.title,
          description: newGoal.description,
          priority: newGoal.priority,
          deadline: newGoal.deadline || null,
          ownerAgentId: newGoal.ownerAgentId && newGoal.ownerAgentId !== "none" ? parseInt(newGoal.ownerAgentId) : null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/goals/company/${selectedCompanyId}`] });
      setShowCreateDialog(false);
      setNewGoal({ title: "", description: "", priority: "medium", deadline: "", ownerAgentId: "" });
      toast({ title: "Goal Created", description: "New goal added successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create goal", variant: "destructive" });
    },
  });

  const updateGoalMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return apiRequest(`/api/goals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/goals/company/${selectedCompanyId}`] });
    },
  });

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoal.title.trim()) return;
    if (!selectedCompanyId) {
      toast({ title: "Error", description: "Please select a company first", variant: "destructive" });
      return;
    }
    createGoalMutation.mutate();
  };

  const filteredGoals = goals.filter(goal => {
    if (activeTab === "all") return true;
    return goal.status === activeTab;
  });

  const goalStats = {
    total: goals.length,
    planned: goals.filter(g => g.status === "planned").length,
    inProgress: goals.filter(g => g.status === "in_progress").length,
    blocked: goals.filter(g => g.status === "blocked").length,
    completed: goals.filter(g => g.status === "completed").length,
  };

  const overallProgress = goals.length > 0 
    ? Math.round(goals.reduce((sum, g) => sum + (g.progress || 0), 0) / goals.length) 
    : 0;

  const GoalDetailsContent = () => {
    if (!selectedGoal) return null;
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg md:text-xl font-semibold mb-2 text-white">{selectedGoal.title}</h2>
          <p className="text-gray-400 text-sm">{selectedGoal.description || "No description"}</p>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Progress</span>
            <span className="text-xl font-bold text-white">{selectedGoal.progress || 0}%</span>
          </div>
          <Progress value={selectedGoal.progress || 0} className="h-3" />
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Status</span>
            <Select 
              value={selectedGoal.status || "planned"}
              onValueChange={(status) => {
                updateGoalMutation.mutate({ id: selectedGoal.id, status });
                setSelectedGoal({ ...selectedGoal, status });
              }}
            >
              <SelectTrigger className="w-40 bg-gray-800 border-gray-700 text-white h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="planned">Planned</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Priority</span>
            <Badge className={PRIORITY_COLORS[selectedGoal.priority || "medium"]}>
              {selectedGoal.priority}
            </Badge>
          </div>
          
          {selectedGoal.ownerAgent && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Owner</span>
              <span className="flex items-center gap-2 text-white text-sm">
                <User className="w-4 h-4" />
                {selectedGoal.ownerAgent.name}
              </span>
            </div>
          )}
          
          {selectedGoal.deadline && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Deadline</span>
              <span className="flex items-center gap-2 text-white text-sm">
                <Calendar className="w-4 h-4" />
                {format(new Date(selectedGoal.deadline), "MMM d, yyyy")}
              </span>
            </div>
          )}
        </div>
        
        <Separator className="bg-gray-800" />
        
        <div>
          <h4 className="font-medium mb-3 text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Task Breakdown
          </h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 bg-gray-800 rounded">
              <span className="flex items-center gap-2 text-gray-300 text-sm">
                <Inbox className="w-4 h-4 text-gray-500" />
                Backlog
              </span>
              <span className="font-medium text-white">{selectedGoal.taskStats?.backlog || 0}</span>
            </div>
            <div className="flex items-center justify-between p-2 bg-gray-800 rounded">
              <span className="flex items-center gap-2 text-gray-300 text-sm">
                <PlayCircle className="w-4 h-4 text-blue-500" />
                In Progress
              </span>
              <span className="font-medium text-white">{selectedGoal.taskStats?.inProgress || 0}</span>
            </div>
            <div className="flex items-center justify-between p-2 bg-gray-800 rounded">
              <span className="flex items-center gap-2 text-gray-300 text-sm">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Blocked
              </span>
              <span className="font-medium text-white">{selectedGoal.taskStats?.blocked || 0}</span>
            </div>
            <div className="flex items-center justify-between p-2 bg-gray-800 rounded">
              <span className="flex items-center gap-2 text-gray-300 text-sm">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Completed
              </span>
              <span className="font-medium text-white">{selectedGoal.taskStats?.completed || 0}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100dvh-var(--admin-header-height))] bg-gray-950">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="p-4 md:p-6 border-b border-gray-800">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 md:mb-6">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white">Company Objectives</h1>
              <p className="text-gray-400 text-xs md:text-sm">Track progress toward your objectives</p>
            </div>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700 gap-2 h-11 w-full sm:w-auto">
                  <Plus className="h-4 w-4" />
	                  New Objective
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-gray-700 max-w-[95vw] sm:max-w-md">
                <DialogHeader>
	                  <DialogTitle className="text-white">Create New Objective</DialogTitle>
                  <DialogDescription className="text-gray-400">Define a new objective for your company.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateGoal} className="space-y-4">
                  <div>
                    <Label className="text-gray-200">Title</Label>
                    <Input
                      value={newGoal.title}
                      onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
	                      placeholder="Objective title"
                      className="bg-gray-800 border-gray-700 text-white h-11"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-200">Description</Label>
                    <Textarea
                      value={newGoal.description}
                      onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
	                      placeholder="Objective description"
                      className="bg-gray-800 border-gray-700 text-white"
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-gray-200">Priority</Label>
                      <Select value={newGoal.priority} onValueChange={(v) => setNewGoal({ ...newGoal, priority: v })}>
                        <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 border-gray-700">
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-gray-200">Deadline</Label>
                      <Input
                        type="date"
                        value={newGoal.deadline}
                        onChange={(e) => setNewGoal({ ...newGoal, deadline: e.target.value })}
                        className="bg-gray-800 border-gray-700 text-white h-11"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-gray-200">Owner (Agent)</Label>
                    <Select value={newGoal.ownerAgentId} onValueChange={(v) => setNewGoal({ ...newGoal, ownerAgentId: v })}>
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-11">
                        <SelectValue placeholder="Select owner" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="none">Unassigned</SelectItem>
                        {companyAgents.map(agent => (
                          <SelectItem key={agent.id} value={agent.id.toString()}>
                            {agent.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setShowCreateDialog(false)} type="button" className="border-gray-700 h-11">
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createGoalMutation.isPending} className="bg-blue-600 hover:bg-blue-700 h-11">
                      {createGoalMutation.isPending ? "Creating..." : "Create Goal"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          
          {/* Stats Cards - horizontal scroll on mobile */}
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-5">
            <Card className="bg-gray-900/50 border-gray-800 min-w-[120px] flex-shrink-0 md:min-w-0">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xl md:text-2xl font-bold text-white">{goalStats.total}</div>
                    <div className="text-xs md:text-sm text-gray-400">Total</div>
                  </div>
                  <Target className="h-6 w-6 md:h-8 md:w-8 text-gray-600 hidden sm:block" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900/50 border-gray-800 min-w-[120px] flex-shrink-0 md:min-w-0">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xl md:text-2xl font-bold text-blue-400">{goalStats.inProgress}</div>
                    <div className="text-xs md:text-sm text-gray-400">Active</div>
                  </div>
                  <PlayCircle className="h-6 w-6 md:h-8 md:w-8 text-blue-600/50 hidden sm:block" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900/50 border-gray-800 min-w-[120px] flex-shrink-0 md:min-w-0">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xl md:text-2xl font-bold text-red-400">{goalStats.blocked}</div>
                    <div className="text-xs md:text-sm text-gray-400">Blocked</div>
                  </div>
                  <AlertTriangle className="h-6 w-6 md:h-8 md:w-8 text-red-600/50 hidden sm:block" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900/50 border-gray-800 min-w-[120px] flex-shrink-0 md:min-w-0">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xl md:text-2xl font-bold text-green-400">{goalStats.completed}</div>
                    <div className="text-xs md:text-sm text-gray-400">Done</div>
                  </div>
                  <CheckCircle className="h-6 w-6 md:h-8 md:w-8 text-green-600/50 hidden sm:block" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900/50 border-gray-800 min-w-[120px] flex-shrink-0 md:min-w-0">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xl md:text-2xl font-bold text-white">{overallProgress}%</div>
                    <div className="text-xs md:text-sm text-gray-400">Progress</div>
                  </div>
                  <TrendingUp className="h-6 w-6 md:h-8 md:w-8 text-gray-600 hidden sm:block" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        
        {/* Tabs and List */}
        <div className="flex-1 flex flex-col min-h-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <div className="px-4 md:px-6 pt-4 border-b border-gray-800 overflow-x-auto">
              <TabsList className="bg-gray-900 w-full sm:w-auto inline-flex">
                <TabsTrigger value="all" className="text-xs md:text-sm h-10">All ({goalStats.total})</TabsTrigger>
                <TabsTrigger value="planned" className="text-xs md:text-sm h-10">Planned</TabsTrigger>
                <TabsTrigger value="in_progress" className="text-xs md:text-sm h-10">Active</TabsTrigger>
                <TabsTrigger value="blocked" className="text-xs md:text-sm h-10">Blocked</TabsTrigger>
                <TabsTrigger value="completed" className="text-xs md:text-sm h-10">Done</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value={activeTab} className="flex-1 m-0 min-h-0">
              <ScrollArea className="h-full">
                <div className="p-4 md:p-6 space-y-3 md:space-y-4">
                  {isLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-32 bg-gray-800" />
                      ))}
                    </div>
                  ) : filteredGoals.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-4">
                        <Target className="h-8 w-8 text-gray-600" />
                      </div>
                      <h3 className="text-lg font-medium text-gray-300">No goals found</h3>
                      <p className="text-gray-500 mt-1">Create a new goal to get started</p>
                    </div>
                  ) : (
                    filteredGoals.map(goal => (
                      <Card 
                        key={goal.id} 
                        className={`bg-gray-900/50 border-gray-800 cursor-pointer hover:bg-gray-900 transition-colors ${selectedGoal?.id === goal.id ? "ring-2 ring-blue-500" : ""}`}
                        onClick={() => { setSelectedGoal(goal); setDetailsOpen(true); }}
                      >
                        <CardContent className="p-4 md:p-5">
                          <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
                            <div className="p-2 md:p-3 rounded-lg bg-gray-800 self-start">
                              <Target className="h-5 w-5 md:h-6 md:w-6 text-blue-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="font-semibold text-white text-base md:text-lg">{goal.title}</h3>
                                  <Badge className={`${PRIORITY_COLORS[goal.priority || "medium"]} text-xs`}>
                                    {goal.priority}
                                  </Badge>
                                  <Badge className={`${STATUS_COLORS[goal.status || "planned"]} text-xs`}>
                                    {goal.status?.replace("_", " ")}
                                  </Badge>
                                </div>
                                {/* Progress on mobile - inline */}
                                <div className="md:hidden text-right flex-shrink-0">
                                  <span className="text-lg font-bold text-white">{goal.progress || 0}%</span>
                                </div>
                              </div>
                              {goal.description && (
                                <p className="text-gray-400 text-xs md:text-sm mb-2 md:mb-3 line-clamp-2">{goal.description}</p>
                              )}
                              <div className="flex items-center gap-3 md:gap-6 text-xs md:text-sm text-gray-500 flex-wrap">
                                {goal.ownerAgent && (
                                  <span className="flex items-center gap-1">
                                    <User className="w-3 h-3 md:w-4 md:h-4" />
                                    {goal.ownerAgent.name}
                                  </span>
                                )}
                                {goal.deadline && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3 md:w-4 md:h-4" />
                                    {format(new Date(goal.deadline), "MMM d")}
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3 md:w-4 md:h-4" />
                                  {goal.taskStats?.completed || 0}/{goal.taskStats?.total || 0}
                                </span>
                              </div>
                            </div>
                            {/* Progress bar on desktop */}
                            <div className="hidden md:block w-32 flex-shrink-0">
                              <div className="text-right mb-2">
                                <span className="text-xl font-bold text-white">{goal.progress || 0}%</span>
                              </div>
                              <Progress value={goal.progress || 0} className="h-2" />
                            </div>
                          </div>
                          {/* Progress bar on mobile */}
                          <div className="mt-3 md:hidden">
                            <Progress value={goal.progress || 0} className="h-2" />
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      
      {/* Desktop Right Panel */}
      {selectedGoal && (
        <div className="hidden lg:flex w-[400px] border-l border-gray-800 bg-gray-900/50 flex-col">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <h3 className="font-semibold text-white">Goal Details</h3>
            <Button variant="ghost" size="sm" onClick={() => setSelectedGoal(null)} className="text-gray-400 hover:text-white h-9 w-9 p-0">
              <XCircle className="w-4 h-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1 p-4">
            <GoalDetailsContent />
          </ScrollArea>
        </div>
      )}
      
      {/* Mobile Details Sheet */}
      <Sheet open={detailsOpen && !!selectedGoal} onOpenChange={(open) => { setDetailsOpen(open); if (!open) setSelectedGoal(null); }}>
        <SheetContent side="right" className="w-[90vw] max-w-[400px] p-0 bg-gray-900 border-gray-800">
          <SheetTitle className="sr-only">Goal Details</SheetTitle>
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold text-white">Goal Details</h3>
              <Button variant="ghost" size="sm" onClick={() => setDetailsOpen(false)} className="text-gray-400 hover:text-white h-9 w-9 p-0">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1 p-4">
              <GoalDetailsContent />
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default GoalsPage;
