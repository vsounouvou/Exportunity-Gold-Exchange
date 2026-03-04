import React from "react";
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Link,
  Lock,
  MoreVertical,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Task {
  id: number;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "in_progress" | "completed";
  isAutomated: boolean;
  dueDate?: string;
  createdAt: string;
  dependencies: number[];
  blockedBy: number[];
}

interface TaskBoardProps {
  tasks: Task[];
  isLoading?: boolean;
  onTaskUpdate: (taskId: string, updates: Partial<Task>) => Promise<void>;
}

const COLUMNS = [
  { 
    id: "pending", 
    name: "To Do",
    icon: <Clock className="h-4 w-4 text-muted-foreground" />,
    color: "border-slate-200"
  },
  { 
    id: "in_progress", 
    name: "In Progress",
    icon: <AlertCircle className="h-4 w-4 text-blue-500" />,
    color: "border-blue-200"
  },
  { 
    id: "completed", 
    name: "Done",
    icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    color: "border-green-200"
  },
];

// Enhanced priority configuration with more comprehensive color schemes
const PRIORITY_CONFIG = {
  high: {
    icon: <ArrowUpRight className="h-4 w-4" />,
    label: "High Priority",
    colors: {
      bg: "bg-red-50 dark:bg-red-950",
      border: "border-red-200 dark:border-red-800",
      text: "text-red-700 dark:text-red-300",
      indicator: "bg-red-500",
      badge: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
      hover: "hover:bg-red-100 dark:hover:bg-red-900",
    }
  },
  medium: {
    icon: <Minus className="h-4 w-4" />,
    label: "Medium Priority",
    colors: {
      bg: "bg-yellow-50 dark:bg-yellow-950",
      border: "border-yellow-200 dark:border-yellow-800",
      text: "text-yellow-700 dark:text-yellow-300",
      indicator: "bg-yellow-500",
      badge: "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
      hover: "hover:bg-yellow-100 dark:hover:bg-yellow-900",
    }
  },
  low: {
    icon: <ArrowDownRight className="h-4 w-4" />,
    label: "Low Priority",
    colors: {
      bg: "bg-blue-50 dark:bg-blue-950",
      border: "border-blue-200 dark:border-blue-800",
      text: "text-blue-700 dark:text-blue-300",
      indicator: "bg-blue-500",
      badge: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
      hover: "hover:bg-blue-100 dark:hover:bg-blue-900",
    }
  },
};

export function TaskBoard({ tasks, isLoading, onTaskUpdate }: TaskBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const taskId = active.id;
    const newStatus = over.id;
    const task = tasks.find((t) => t.id === taskId);

    if (!task) return;

    const hasUncompletedDependencies = task.dependencies.some((depId) => {
      const depTask = tasks.find((t) => t.id === depId);
      return depTask && depTask.status !== "completed";
    });

    if (hasUncompletedDependencies && newStatus === "completed") {
      return;
    }

    await onTaskUpdate(String(taskId), { status: newStatus });
  };

  const getColumnTasks = (columnId: string) =>
    tasks.filter((task) => task.status === columnId);

  const getTaskDependencyInfo = (task: Task) => {
    const dependencies = task.dependencies
      .map((id) => tasks.find((t) => t.id === id))
      .filter(Boolean) as Task[];

    const blockedBy = tasks.filter((t) =>
      task.blockedBy.includes(t.id)
    );

    const isBlocked = dependencies.some((dep) => dep.status !== "completed");

    return { dependencies, blockedBy, isBlocked };
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full p-4">
        <div className="grid grid-cols-3 gap-6 h-full">
          {COLUMNS.map((column) => (
            <div
              key={column.id}
              className={cn(
                "flex flex-col rounded-lg border-2",
                column.color
              )}
            >
              <div className="p-4 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {column.icon}
                    <h3 className="font-semibold">{column.name}</h3>
                  </div>
                  <Badge variant="secondary">
                    {getColumnTasks(column.id).length}
                  </Badge>
                </div>
              </div>

              <ScrollArea className="flex-1 p-3">
                <SortableContext
                  items={getColumnTasks(column.id).map((t) => String(t.id))}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {getColumnTasks(column.id).map((task) => {
                      const { dependencies, blockedBy, isBlocked } =
                        getTaskDependencyInfo(task);
                      const priorityConfig = PRIORITY_CONFIG[task.priority];

                      return (
                        <Card
                          key={task.id}
                          className={cn(
                            "group transition-all border-2",
                            priorityConfig.colors.border,
                            priorityConfig.colors.bg,
                            isBlocked ? "opacity-75" : "opacity-100",
                            task.status === "completed" ? "bg-slate-50" : "bg-white",
                            priorityConfig.colors.hover,
                          )}
                        >
                          {/* Priority Indicator Strip */}
                          <div 
                            className={cn(
                              "h-1.5 rounded-t-sm",
                              priorityConfig.colors.indicator
                            )} 
                          />

                          <div className="p-4 space-y-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className={cn(
                                    "font-medium truncate",
                                    priorityConfig.colors.text
                                  )}>
                                    {task.title}
                                  </h4>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                  {task.description}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge 
                                  variant="outline" 
                                  className={cn(
                                    "text-xs font-medium",
                                    priorityConfig.colors.badge
                                  )}
                                >
                                  <span className="flex items-center gap-1">
                                    {priorityConfig.icon}
                                    {priorityConfig.label}
                                  </span>
                                </Badge>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            {(dependencies.length > 0 || blockedBy.length > 0) && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                {isBlocked ? (
                                  <Lock className="h-4 w-4" />
                                ) : (
                                  <Link className="h-4 w-4" />
                                )}
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        className="h-auto p-0 text-sm font-normal"
                                      >
                                        {dependencies.length > 0 &&
                                          `${dependencies.length} dependencies`}
                                        {dependencies.length > 0 &&
                                          blockedBy.length > 0 &&
                                          " • "}
                                        {blockedBy.length > 0 &&
                                          `Blocks ${blockedBy.length} tasks`}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent 
                                      side="bottom" 
                                      align="start"
                                      className="p-4 max-w-sm"
                                    >
                                      <div className="space-y-4">
                                        {dependencies.length > 0 && (
                                          <div>
                                            <h5 className="font-medium mb-2">Dependencies</h5>
                                            <ul className="space-y-2">
                                              {dependencies.map((dep) => (
                                                <li
                                                  key={dep.id}
                                                  className="flex items-center gap-2 text-sm"
                                                >
                                                  <span
                                                    className={cn(
                                                      "h-2 w-2 rounded-full",
                                                      dep.status === "completed"
                                                        ? "bg-green-500"
                                                        : "bg-yellow-500"
                                                    )}
                                                  />
                                                  <span className="flex-1">
                                                    {dep.title}
                                                  </span>
                                                  <Badge 
                                                    variant="secondary"
                                                    className="text-xs"
                                                  >
                                                    {dep.status}
                                                  </Badge>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                        {blockedBy.length > 0 && (
                                          <div>
                                            <h5 className="font-medium mb-2">Blocking</h5>
                                            <ul className="space-y-2">
                                              {blockedBy.map((task) => (
                                                <li
                                                  key={task.id}
                                                  className="flex items-center gap-2 text-sm"
                                                >
                                                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                                                  <span className="flex-1">
                                                    {task.title}
                                                  </span>
                                                  <Badge 
                                                    variant="secondary"
                                                    className="text-xs"
                                                  >
                                                    {task.status}
                                                  </Badge>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            )}

                            <div className="flex items-center justify-between text-sm text-muted-foreground pt-2 border-t">
                              {task.dueDate && (
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-4 w-4" />
                                  <span>
                                    {formatDistanceToNow(new Date(task.dueDate), {
                                      addSuffix: true,
                                    })}
                                  </span>
                                </div>
                              )}
                              <Badge
                                variant={task.isAutomated ? "secondary" : "outline"}
                                className="text-xs"
                              >
                                {task.isAutomated ? "Automated" : "Manual"}
                              </Badge>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </SortableContext>
              </ScrollArea>
            </div>
          ))}
        </div>
      </div>
    </DndContext>
  );
}