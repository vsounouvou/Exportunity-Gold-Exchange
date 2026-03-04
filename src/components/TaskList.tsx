import React from "react";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { cn } from "./ui/utils";

interface Task {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
  priority: "low" | "medium" | "high";
  description?: string;
  createdAt: string;
  metadata?: { automated: boolean };
}

interface TaskListProps {
  tasks: Task[];
}

const priorityIcons = {
  low: <Clock className="h-4 w-4 text-blue-500" />,
  medium: <AlertCircle className="h-4 w-4 text-yellow-500" />,
  high: <AlertCircle className="h-4 w-4 text-red-500" />,
};

const statusColors = {
  pending: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-300",
};

export function TaskList({ tasks }: TaskListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
      {tasks.map((task) => (
        <Card key={task.id} className={cn(
          "overflow-hidden border-l-4",
          task.priority === "high" ? "border-l-red-500" :
            task.priority === "medium" ? "border-l-yellow-500" :
              "border-l-blue-500"
        )}>
          <div className="p-4 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium text-lg text-foreground">{task.title}</h3>
                {task.description && (
                  <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                )}
              </div>
              <div className="flex items-center space-x-2">
                {priorityIcons[task.priority]}
                <Badge className={statusColors[task.status]} variant="secondary">
                  {task.status.replace('_', ' ')}
                </Badge>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Created {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {task.priority} priority
                </Badge>
                {task.metadata?.automated && (
                  <Badge variant="secondary">Automated</Badge>
                )}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}