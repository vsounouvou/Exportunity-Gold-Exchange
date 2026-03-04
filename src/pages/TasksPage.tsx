import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { TaskList } from "@/components/TaskList";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Agent, Task } from "@db/schema";
import { useState } from "react";

export default function TasksPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterPriority, setFilterPriority] = useState<string[]>([]);

  const { data: tasks, isLoading: isLoadingTasks } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterStatus.length) {
        params.append("status", filterStatus.join(","));
      }
      if (filterPriority.length) {
        params.append("priority", filterPriority.join(","));
      }
      if (searchQuery) {
        params.append("search", searchQuery);
      }

      const response = await fetch(`/api/tasks?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch tasks");
      }
      return response.json();
    },
  });

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top Bar */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Filters
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                <DropdownMenuGroup>
                  {["pending", "in_progress", "completed"].map((status) => (
                    <DropdownMenuItem
                      key={status}
                      onClick={() =>
                        setFilterStatus((prev) =>
                          prev.includes(status)
                            ? prev.filter((s) => s !== status)
                            : [...prev, status]
                        )
                      }
                    >
                      <span className="capitalize">{status.replace("_", " ")}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Filter by Priority</DropdownMenuLabel>
                <DropdownMenuGroup>
                  {["low", "medium", "high"].map((priority) => (
                    <DropdownMenuItem
                      key={priority}
                      onClick={() =>
                        setFilterPriority((prev) =>
                          prev.includes(priority)
                            ? prev.filter((p) => p !== priority)
                            : [...prev, priority]
                        )
                      }
                    >
                      <span className="capitalize">{priority}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            New Task
          </Button>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-hidden">
        <TaskList
          tasks={tasks || []}
        />
      </div>
    </div>
  );
}