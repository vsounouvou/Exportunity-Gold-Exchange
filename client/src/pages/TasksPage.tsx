import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/hooks/use-company";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { 
  CheckCircle, CheckSquare, Circle, Clock, Plus, AlertTriangle, Calendar,
  Search, Filter, Users, Target, Inbox, PlayCircle, XCircle, RefreshCw, User,
  MessageSquare, ArrowRight, LayoutGrid, List, Menu, X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

interface TaskWithGoal {
  id: number;
  companyId: number | null;
  goalId: number | null;
  objectiveId: number | null;
  title: string;
  description: string;
  agentId: number | null;
  priority: string | null;
  status: string | null;
  dueDate: string | null;
  isGroupTask: boolean | null;
  participantAgentIds: number[] | null;
  isRecurring: boolean | null;
  createdAt: string | null;
  agent?: { id: number; name: string; role: string | null } | null;
  goal?: { id: number; title: string; status: string | null } | null;
  objective?: { id: number; title: string; status: string | null } | null;
}

interface Goal {
  id: number;
  companyId: number;
  title: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  deadline: string | null;
  progress: number | null;
  taskStats: {
    total: number;
    completed: number;
    inProgress: number;
    blocked: number;
    backlog: number;
  };
}

const STATUS_COLORS: Record<string, string> = {
  backlog: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  in_progress: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  blocked: "bg-red-500/20 text-red-400 border-red-500/30",
  done: "bg-green-500/20 text-green-400 border-green-500/30",
  pending: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
};

export function TasksPage() {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [goalFilter, setGoalFilter] = useState<string>("all");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("all");
  const [selectedTask, setSelectedTask] = useState<TaskWithGoal | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("medium");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskAgentId, setNewTaskAgentId] = useState<string>("");
  const [newTaskGoalId, setNewTaskGoalId] = useState<string>("");
  const [newTaskObjectiveId, setNewTaskObjectiveId] = useState<string>("");

  const { data: tasksResponse, isLoading: isLoadingTasks } = useQuery<TaskWithGoal[]>({
    queryKey: [`/api/task-lifecycle/company/${selectedCompanyId}`],
    enabled: !!selectedCompanyId,
  });

  const { data: goals = [] } = useQuery<Goal[]>({
    queryKey: [`/api/goals/company/${selectedCompanyId}`],
    enabled: !!selectedCompanyId,
  });

  const { data: agents = [] } = useQuery<any[]>({
    queryKey: ["/api/agents"],
  });

  const companyAgents = agents.filter(a => a.companyId === selectedCompanyId);
  const tasks = tasksResponse || [];

  const filteredTasks = tasks.filter((task: TaskWithGoal) => {
    const matchesSearch = task.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          task.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
    const matchesAgent = selectedAgentId === "all" || task.agentId === parseInt(selectedAgentId);
    const matchesGoal = goalFilter === "all" || String(task.goalId) === goalFilter;
    return matchesSearch && matchesStatus && matchesPriority && matchesAgent && matchesGoal;
  });

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/task-lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          title: newTaskTitle,
          description: newTaskDescription,
          priority: newTaskPriority,
          dueDate: newTaskDueDate || null,
          agentId: newTaskAgentId && newTaskAgentId !== "none" ? parseInt(newTaskAgentId) : null,
          goalId: newTaskGoalId ? parseInt(newTaskGoalId) : null,
          objectiveId: newTaskObjectiveId ? parseInt(newTaskObjectiveId) : null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/task-lifecycle/company/${selectedCompanyId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/goals/company/${selectedCompanyId}`] });
      setIsOpen(false);
      resetNewTask();
      toast({ title: "Task Created", description: "New task added successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create task", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return apiRequest(`/api/task-lifecycle/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/task-lifecycle/company/${selectedCompanyId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/goals/company/${selectedCompanyId}`] });
    },
  });

  const createGoalFromTaskMutation = useMutation({
    mutationFn: async (task: TaskWithGoal) => {
      if (!selectedCompanyId) throw new Error("Please select a company first");
      const goal = await apiRequest("/api/goals", "POST", {
        companyId: selectedCompanyId,
        title: task.title,
        description: task.description,
        metadata: { source: "task", sourceTaskId: task.id },
      });
      await apiRequest(`/api/task-lifecycle/${task.id}`, "PATCH", { goalId: goal.id, objectiveId: goal.id });
      return goal as Goal;
    },
    onSuccess: (goal) => {
      queryClient.invalidateQueries({ queryKey: [`/api/task-lifecycle/company/${selectedCompanyId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/goals/company/${selectedCompanyId}`] });
      setSelectedTask((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          goalId: goal.id,
          objectiveId: goal.id,
          goal: { id: goal.id, title: goal.title, status: goal.status },
          objective: { id: goal.id, title: goal.title, status: goal.status },
        };
      });
      toast({ title: "Goal Created", description: "Task linked to a new goal" });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create goal",
        variant: "destructive",
      });
    },
  });

  const resetNewTask = () => {
    setNewTaskTitle("");
    setNewTaskDescription("");
    setNewTaskPriority("medium");
    setNewTaskDueDate("");
    setNewTaskAgentId("");
    setNewTaskGoalId("");
    setNewTaskObjectiveId("");
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !newTaskDescription.trim()) return;
    if (!selectedCompanyId) {
      toast({ title: "Error", description: "Please select a company first", variant: "destructive" });
      return;
    }
    if (!newTaskGoalId || !newTaskObjectiveId) {
      toast({ title: "Goal Required", description: "Link every task to both a goal and an objective.", variant: "destructive" });
      return;
    }
    createTaskMutation.mutate();
  };

  const handleStatusToggle = (task: TaskWithGoal) => {
    const newStatus = task.status === "done" ? "in_progress" : "done";
    updateStatusMutation.mutate({ id: task.id, status: newStatus });
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "done":
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "in_progress":
        return <PlayCircle className="h-4 w-4 text-blue-500" />;
      case "blocked":
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <Circle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getAgentName = (agentId: number | null) => {
    if (!agentId) return "Unassigned";
    const agent = agents.find(a => a.id === agentId);
    return agent?.name || "Unknown Agent";
  };

  const taskStats = {
    total: tasks.length,
    backlog: tasks.filter(t => t.status === "backlog").length,
    inProgress: tasks.filter(t => t.status === "in_progress").length,
    blocked: tasks.filter(t => t.status === "blocked").length,
    done: tasks.filter(t => t.status === "done").length,
  };

  const SidebarContent = () => (
    <>
      <div className="p-4 border-b border-gray-800">
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="w-full bg-blue-600 hover:bg-blue-700 gap-2 h-11">
              <Plus className="h-4 w-4" />
              New Task
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-900 border-gray-700 max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">Create New Task</DialogTitle>
              <DialogDescription className="text-gray-400">Add a new task and link it to a goal and objective.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <Label className="text-gray-200">Title</Label>
                <Input
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Enter task title"
                  className="bg-gray-800 border-gray-700 text-white h-11"
                />
              </div>
              <div>
                <Label className="text-gray-200">Description</Label>
                <Textarea
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  placeholder="Enter task description"
                  className="bg-gray-800 border-gray-700 text-white"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-gray-200">Priority</Label>
                  <Select value={newTaskPriority} onValueChange={setNewTaskPriority}>
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
                  <Label className="text-gray-200">Goal</Label>
                  <Select value={newTaskGoalId} onValueChange={setNewTaskGoalId}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-11">
                      <SelectValue placeholder="Select goal" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      {goals.map(goal => (
                        <SelectItem key={goal.id} value={goal.id.toString()}>
                          {goal.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-200">Objective</Label>
                  <Select value={newTaskObjectiveId} onValueChange={setNewTaskObjectiveId}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-11">
                      <SelectValue placeholder="Select objective" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      {goals.map(goal => (
                        <SelectItem key={`objective-${goal.id}`} value={goal.id.toString()}>
                          {goal.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-200">Assign To</Label>
                  <Select value={newTaskAgentId} onValueChange={setNewTaskAgentId}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-11">
                      <SelectValue placeholder="Select agent" />
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
                <div>
                  <Label className="text-gray-200">Due Date</Label>
                  <Input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white h-11"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsOpen(false)} type="button" className="border-gray-700 h-11">
                  Cancel
                </Button>
                <Button type="submit" disabled={createTaskMutation.isPending} className="bg-blue-600 hover:bg-blue-700 h-11">
                  {createTaskMutation.isPending ? "Creating..." : "Create Task"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          <div className="text-xs font-medium text-gray-500 px-2 py-1">VIEWS</div>
          <Button 
            variant={goalFilter === "all" && viewMode === "list" ? "secondary" : "ghost"} 
            className="w-full justify-start gap-2 text-gray-300 hover:text-white h-11"
            onClick={() => { setGoalFilter("all"); setViewMode("list"); setSidebarOpen(false); }}
          >
            <CheckSquare className="w-4 h-4" />
            All Tasks
            <Badge variant="secondary" className="ml-auto bg-gray-800">{tasks.length}</Badge>
          </Button>
          <Button 
            variant={viewMode === "board" ? "secondary" : "ghost"} 
            className="w-full justify-start gap-2 text-gray-300 hover:text-white h-11"
            onClick={() => { setViewMode("board"); setSidebarOpen(false); }}
          >
            <LayoutGrid className="w-4 h-4" />
            Board View
          </Button>
          
          <Separator className="my-3 bg-gray-800" />
          
          <div className="text-xs font-medium text-gray-500 px-2 py-1">BY STATUS</div>
          <Button 
            variant={statusFilter === "backlog" ? "secondary" : "ghost"} 
            className="w-full justify-start gap-2 text-gray-300 hover:text-white h-11"
            onClick={() => { setStatusFilter(statusFilter === "backlog" ? "all" : "backlog"); setSidebarOpen(false); }}
          >
            <Inbox className="w-4 h-4" />
            Backlog
            <Badge variant="secondary" className="ml-auto bg-gray-800">{taskStats.backlog}</Badge>
          </Button>
          <Button 
            variant={statusFilter === "in_progress" ? "secondary" : "ghost"} 
            className="w-full justify-start gap-2 text-gray-300 hover:text-white h-11"
            onClick={() => { setStatusFilter(statusFilter === "in_progress" ? "all" : "in_progress"); setSidebarOpen(false); }}
          >
            <PlayCircle className="w-4 h-4" />
            In Progress
            <Badge variant="secondary" className="ml-auto bg-blue-500/20 text-blue-400">{taskStats.inProgress}</Badge>
          </Button>
          <Button 
            variant={statusFilter === "blocked" ? "secondary" : "ghost"} 
            className="w-full justify-start gap-2 text-gray-300 hover:text-white h-11"
            onClick={() => { setStatusFilter(statusFilter === "blocked" ? "all" : "blocked"); setSidebarOpen(false); }}
          >
            <AlertTriangle className="w-4 h-4" />
            Blocked
            <Badge variant="secondary" className="ml-auto bg-red-500/20 text-red-400">{taskStats.blocked}</Badge>
          </Button>
          <Button 
            variant={statusFilter === "done" ? "secondary" : "ghost"} 
            className="w-full justify-start gap-2 text-gray-300 hover:text-white h-11"
            onClick={() => { setStatusFilter(statusFilter === "done" ? "all" : "done"); setSidebarOpen(false); }}
          >
            <CheckCircle className="w-4 h-4" />
            Done
            <Badge variant="secondary" className="ml-auto bg-green-500/20 text-green-400">{taskStats.done}</Badge>
          </Button>
          
          <Separator className="my-3 bg-gray-800" />
          
          <div className="text-xs font-medium text-gray-500 px-2 py-1">GOALS</div>
          {goals.slice(0, 8).map(goal => (
            <Button 
              key={goal.id}
              variant={goalFilter === String(goal.id) ? "secondary" : "ghost"} 
              className="w-full justify-start gap-2 text-gray-300 hover:text-white text-left h-11"
              onClick={() => { setGoalFilter(goalFilter === String(goal.id) ? "all" : String(goal.id)); setSidebarOpen(false); }}
            >
              <Target className="w-4 h-4 flex-shrink-0" />
              <span className="truncate flex-1 text-sm">{goal.title}</span>
              <Badge variant="secondary" className="ml-auto bg-gray-800 text-xs">{goal.taskStats?.total || 0}</Badge>
            </Button>
          ))}
          {goals.length === 0 && (
            <div className="px-2 py-4 text-sm text-gray-500 text-center">
              No goals yet
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );

  return (
    <div className="flex h-[calc(100dvh-var(--admin-header-height))] bg-gray-950">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 border-r border-gray-800 flex-col bg-gray-900/50">
        <SidebarContent />
      </div>
      
      {/* Center Panel - Task List */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <div className="p-3 md:p-4 border-b border-gray-800 flex flex-col gap-3">
          {/* Top row with menu and search */}
          <div className="flex items-center gap-2">
            {/* Mobile menu button */}
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="md:hidden h-11 w-11 p-0">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0 bg-gray-900 border-gray-800">
                <SheetTitle className="sr-only">Task Filters</SheetTitle>
                <div className="flex flex-col h-full">
                  <SidebarContent />
                </div>
              </SheetContent>
            </Sheet>
            
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                className="pl-10 bg-gray-900 border-gray-700 text-white h-11"
              />
            </div>
          </div>
          
          {/* Filter row */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-3 px-3 md:mx-0 md:px-0">
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[120px] sm:w-[130px] bg-gray-900 border-gray-700 text-white h-10 flex-shrink-0">
                <Filter className="w-4 h-4 mr-1 sm:mr-2" />
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
              <SelectTrigger className="w-[130px] sm:w-[160px] bg-gray-900 border-gray-700 text-white h-10 flex-shrink-0">
                <User className="w-4 h-4 mr-1 sm:mr-2" />
                <SelectValue placeholder="All Agents" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="all">All Agents</SelectItem>
                {companyAgents.map(agent => (
                  <SelectItem key={agent.id} value={agent.id.toString()}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs sm:text-sm text-gray-400 flex-shrink-0 ml-auto">
              {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-3 md:p-4 space-y-2">
            {isLoadingTasks ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-20 bg-gray-800" />
                ))}
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8 text-gray-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-300">No tasks found</h3>
                <p className="text-gray-500 mt-1">Create a new task to get started</p>
              </div>
            ) : (
              filteredTasks.map((task: TaskWithGoal) => (
                <Card 
                  key={task.id} 
                  className={`bg-gray-900/50 border-gray-800 cursor-pointer hover:bg-gray-900 transition-colors ${selectedTask?.id === task.id ? "ring-2 ring-blue-500" : ""}`}
                  onClick={() => { setSelectedTask(task); setDetailsOpen(true); }}
                >
                  <CardContent className="p-3 md:p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox 
                        checked={task.status === "done"}
                        onCheckedChange={() => handleStatusToggle(task)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 border-gray-600 h-5 w-5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-medium text-sm md:text-base ${task.status === "done" ? "text-gray-500 line-through" : "text-white"}`}>
                            {task.title}
                          </span>
                          {task.isRecurring && <RefreshCw className="w-3 h-3 text-gray-500" />}
                          {task.isGroupTask && <Users className="w-3 h-3 text-gray-500" />}
                        </div>
                        <div className="flex items-center gap-2 md:gap-3 mt-1.5 text-xs md:text-sm text-gray-400 flex-wrap">
                          {task.goal && (
                            <span className="flex items-center gap-1">
                              <Target className="w-3 h-3" />
                              <span className="truncate max-w-[100px] md:max-w-none">{task.goal.title}</span>
                            </span>
                          )}
                          {task.objective && (
                            <span className="flex items-center gap-1">
                              <ArrowRight className="w-3 h-3" />
                              <span className="truncate max-w-[100px] md:max-w-none">{task.objective.title}</span>
                            </span>
                          )}
                          {task.agent && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {task.agent.name}
                            </span>
                          )}
                          {task.priority && (
                            <Badge className={`${PRIORITY_COLORS[task.priority]} text-xs`}>
                              {task.priority}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
      
      {/* Desktop Details Panel */}
      {selectedTask && (
        <div className="hidden lg:flex w-[360px] border-l border-gray-800 bg-gray-900/50 flex-col">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <h3 className="font-semibold text-white">Task Details</h3>
            <Button variant="ghost" size="sm" onClick={() => setSelectedTask(null)} className="text-gray-400 hover:text-white h-9 w-9 p-0">
              <XCircle className="w-4 h-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">{selectedTask.title}</h2>
              <p className="text-gray-400 text-sm">{selectedTask.description}</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Status</span>
                  <Badge className={STATUS_COLORS[selectedTask.status || "backlog"]}>
                    {selectedTask.status?.replace("_", " ")}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Priority</span>
                  <Badge className={PRIORITY_COLORS[selectedTask.priority || "medium"]}>
                    {selectedTask.priority}
                  </Badge>
                </div>
                {selectedTask.agent && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Assigned To</span>
                    <span className="text-white text-sm">{selectedTask.agent.name}</span>
                  </div>
                )}
                {selectedTask.goal && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Goal</span>
                    <span className="text-white text-sm truncate max-w-[150px]">{selectedTask.goal.title}</span>
                  </div>
                )}
                {selectedTask.objective && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Objective</span>
                    <span className="text-white text-sm truncate max-w-[150px]">{selectedTask.objective.title}</span>
                  </div>
                )}
                {(!selectedTask.goal || !selectedTask.objective) && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Goal / Objective</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-blue-500/30 text-blue-200 hover:bg-blue-500/10"
                      disabled={createGoalFromTaskMutation.isPending}
                      onClick={() => selectedTask && createGoalFromTaskMutation.mutate(selectedTask)}
                    >
                      Create Goal
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>
      )}
      
      {/* Mobile Details Sheet */}
      <Sheet open={detailsOpen && !!selectedTask} onOpenChange={(open) => { setDetailsOpen(open); if (!open) setSelectedTask(null); }}>
        <SheetContent side="right" className="w-[90vw] max-w-[400px] p-0 bg-gray-900 border-gray-800">
          <SheetTitle className="sr-only">Task Details</SheetTitle>
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold text-white">Task Details</h3>
              <Button variant="ghost" size="sm" onClick={() => setDetailsOpen(false)} className="text-gray-400 hover:text-white h-9 w-9 p-0">
                <X className="w-4 h-4" />
              </Button>
            </div>
            {selectedTask && (
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-white">{selectedTask.title}</h2>
                  <p className="text-gray-400 text-sm">{selectedTask.description}</p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Status</span>
                      <Badge className={STATUS_COLORS[selectedTask.status || "backlog"]}>
                        {selectedTask.status?.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Priority</span>
                      <Badge className={PRIORITY_COLORS[selectedTask.priority || "medium"]}>
                        {selectedTask.priority}
                      </Badge>
                    </div>
                    {selectedTask.agent && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Assigned To</span>
                        <span className="text-white text-sm">{selectedTask.agent.name}</span>
                      </div>
                    )}
                    {selectedTask.goal && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Goal</span>
                        <span className="text-white text-sm">{selectedTask.goal.title}</span>
                      </div>
                    )}
                    {selectedTask.objective && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Objective</span>
                        <span className="text-white text-sm">{selectedTask.objective.title}</span>
                      </div>
                    )}
                    {(!selectedTask.goal || !selectedTask.objective) && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Goal / Objective</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-blue-500/30 text-blue-200 hover:bg-blue-500/10"
                          disabled={createGoalFromTaskMutation.isPending}
                          onClick={() => selectedTask && createGoalFromTaskMutation.mutate(selectedTask)}
                        >
                          Create Goal
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default TasksPage;
