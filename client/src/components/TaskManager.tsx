import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Task } from "@db/schema";
import { CheckCircle, Circle, Clock, Plus, AlertTriangle, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { format } from "date-fns";
import { useDashboard } from "@/hooks/use-dashboard";
import { resolveApiUrl } from "@/lib/runtimeConfig";

interface TaskManagerProps {
  selectedAgent?: any;
}

export default function TaskManager({ selectedAgent: propSelectedAgent }: TaskManagerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const dashboard = useDashboard();
  const selectedAgent = propSelectedAgent || dashboard?.selectedAgent;
  const [isOpen, setIsOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("medium");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");

  const { data: tasksResponse, isLoading: isLoadingTasks } = useQuery<{ tasks: Task[] } | Task[]>({
    queryKey: ["/api/tasks"],
    enabled: !!selectedAgent,
  });

  // Handle both response formats
  const tasks = Array.isArray(tasksResponse) ? tasksResponse : (tasksResponse?.tasks || []);

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(resolveApiUrl("/api/tasks"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTaskTitle,
          description: newTaskDescription,
          priority: newTaskPriority,
          dueDate: newTaskDueDate || null,
          agentId: selectedAgent?.id,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to create task');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setIsOpen(false);
      setNewTaskTitle("");
      setNewTaskDescription("");
      setNewTaskPriority("medium");
      setNewTaskDueDate("");
      toast({
        title: "Success",
        description: "Task created successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create task",
        variant: "destructive",
      });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const response = await fetch(resolveApiUrl(`/api/tasks/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error('Failed to update task');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update task status",
        variant: "destructive",
      });
    },
  });

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !newTaskDescription.trim()) return;
    createTaskMutation.mutate();
  };

  const agentTasks = tasks.filter(
    (task: Task) => task.agentId === selectedAgent?.id
  );

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "in_progress":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <Circle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: string | null) => {
    switch (priority) {
      case "high":
        return "text-red-500";
      case "medium":
        return "text-yellow-500";
      case "low":
        return "text-blue-500";
      default:
        return "text-gray-500";
    }
  };

  const handleStatusChange = (task: Task) => {
    const newStatus = task.status === "pending"
      ? "in_progress"
      : task.status === "in_progress"
        ? "completed"
        : "pending";

    updateTaskMutation.mutate({ id: task.id, status: newStatus });
  };

  const handleInitSampleTasks = async () => {
    if (!selectedAgent) return;
    
    try {
      const response = await fetch(resolveApiUrl("/api/tasks/init-sample"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: selectedAgent.id }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to initialize sample tasks");
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Success",
        description: "Sample tasks created successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create sample tasks",
        variant: "destructive",
      });
    }
  };

  if (!selectedAgent) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <p className="text-gray-400 text-center">Select an agent to view and manage tasks</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-100">Tasks</h2>
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="outline"
            onClick={handleInitSampleTasks}
            className="gap-1.5 border-gray-700 hover:bg-gray-800 text-gray-200"
          >
            Generate Sample Tasks
          </Button>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="h-4 w-4" />
                New Task
              </Button>
            </DialogTrigger>
          <DialogContent className="bg-gray-900 border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-gray-100">Create New Task</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <Label htmlFor="title" className="text-gray-200">Title</Label>
                <Input
                  id="title"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Enter task title"
                  className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500"
                />
              </div>
              <div>
                <Label htmlFor="description" className="text-gray-200">Description</Label>
                <Textarea
                  id="description"
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  placeholder="Enter task description"
                  className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500"
                  rows={4}
                />
              </div>
              <div>
                <Label htmlFor="priority" className="text-gray-200">Priority</Label>
                <Select value={newTaskPriority} onValueChange={setNewTaskPriority}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-100">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="low" className="text-green-500">Low</SelectItem>
                    <SelectItem value="medium" className="text-yellow-500">Medium</SelectItem>
                    <SelectItem value="high" className="text-red-500">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dueDate" className="text-gray-200">Due Date</Label>
                <Input
                  id="dueDate"
                  type="datetime-local"
                  value={newTaskDueDate}
                  onChange={(e) => setNewTaskDueDate(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-gray-100"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                  type="button"
                  className="border-gray-700 hover:bg-gray-800 text-gray-200"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createTaskMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {createTaskMutation.isPending ? (
                    <>
                      <Clock className="h-4 w-4 animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    'Create Task'
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <ScrollArea className="flex-1 -mx-4 px-4">
        <div className="space-y-3 pr-2">
          {agentTasks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400">No tasks assigned</p>
              <p className="text-gray-500 text-sm mt-1">Create a new task to get started</p>
            </div>
          ) : (
            agentTasks.map((task: Task) => (
              <Card key={task.id} className="p-4 space-y-2 bg-gray-800/50 border-gray-700 hover:bg-gray-800 transition-colors duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <h3 className="font-medium text-gray-100 truncate">{task.title}</h3>
                    <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${getPriorityColor(task.priority)}`} />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleStatusChange(task)}
                    disabled={updateTaskMutation.isPending}
                    className="ml-2 hover:bg-gray-700"
                  >
                    {getStatusIcon(task.status)}
                  </Button>
                </div>
                <p className="text-sm text-gray-400">{task.description}</p>
                {task.dueDate && (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Calendar className="h-4 w-4" />
                    {format(new Date(task.dueDate), "PPp")}
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
