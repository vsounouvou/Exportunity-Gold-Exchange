import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Grip, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Agent } from "@db/schema";
import { resolveApiUrl } from "@/lib/runtimeConfig";

type AgentWithHierarchy = Agent & { hierarchyLevel?: number | string | null };

interface AgentHierarchyBuilderProps {
  agents: AgentWithHierarchy[];
}

function DraggableAgentCard({ agent, isDragging = false, isOverlay = false }: {
  agent: AgentWithHierarchy;
  isDragging?: boolean;
  isOverlay?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: agent.id,
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(isOverlay ? {} : attributes)}
      className={`
        ${isDragging ? "opacity-50" : ""}
        ${isOverlay ? "cursor-grabbing" : ""}
        transition-all duration-300 ease-in-out
      `}
    >
      <Card className={`p-4 relative 
        ${isDragging ? "ring-2 ring-primary/50 ring-offset-2 shadow-lg" : ""}
        hover:shadow-md transition-all duration-300 ease-in-out
        `}>
        <div className="flex items-center gap-4">
          <div
            {...listeners}
            className="cursor-grab active:cursor-grabbing hover:bg-accent p-1 rounded transition-colors duration-200"
          >
            <Grip className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-medium">{agent.name}</h4>
              <Badge variant="secondary">{agent.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {agent.role}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function toHierarchyLevel(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(1, Math.trunc(value));
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "super") return 1;
  if (normalized === "director") return 2;
  if (normalized === "manager") return 3;
  if (normalized === "executor") return 4;
  const parsed = Number.parseInt(normalized, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 1;
}

export function AgentHierarchyBuilder({ agents }: AgentHierarchyBuilderProps) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 100,
        tolerance: 8,
      },
    })
  );

  // Organize agents by hierarchy level
  const agentHierarchy = agents.reduce((acc, agent) => {
    const level = toHierarchyLevel(agent.hierarchyLevel);
    if (!acc[level]) {
      acc[level] = [];
    }
    acc[level].push(agent);
    return acc;
  }, {} as Record<number, AgentWithHierarchy[]>);

  const updateAgentHierarchy = useMutation({
    mutationFn: async ({ agentId, newLevel, newParentId }: {
      agentId: number;
      newLevel: number;
      newParentId?: number;
    }) => {
      const response = await fetch(resolveApiUrl(`/api/agents/${agentId}/hierarchy`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hierarchyLevel: newLevel, parentId: newParentId }),
      });

      if (!response.ok) {
        throw new Error("Failed to update agent hierarchy");
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      const agent = agents.find(a => a.id === variables.agentId);
      const parent = agents.find(a => a.id === variables.newParentId);

      toast({
        title: "Hierarchy Updated",
        description: `${agent?.name || 'Agent'} is now reporting to ${parent?.name || 'Level ' + variables.newLevel}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update agent hierarchy",
        variant: "destructive",
      });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(Number(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;

    if (!over) {
      setDropTarget(null);
      return;
    }

    // Don't allow dropping on self
    if (active.id === over.id) {
      setDropTarget(null);
      return;
    }

    const activeAgent = agents.find(a => a.id === Number(active.id));
    const overAgent = agents.find(a => a.id === Number(over.id));

    if (!activeAgent || !overAgent) {
      setDropTarget(null);
      return;
    }

    // Allow dropping on agents at lower level only
    const activeLevel = toHierarchyLevel(activeAgent.hierarchyLevel);
    const overLevel = toHierarchyLevel(overAgent.hierarchyLevel);

    if (overLevel >= activeLevel) {
      setDropTarget(null);
      return;
    }

    setDropTarget(Number(over.id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    try {
      const { active, over } = event;

      // Clear states
      setActiveId(null);
      setDropTarget(null);

      if (!over) return;

      const activeAgent = agents.find(a => a.id === Number(active.id));
      const overAgent = agents.find(a => a.id === Number(over.id));

      if (!activeAgent || !overAgent) return;

      // Prevent dropping on self or invalid targets
      const activeLevel = toHierarchyLevel(activeAgent.hierarchyLevel);
      const overLevel = toHierarchyLevel(overAgent.hierarchyLevel);

      if (activeAgent.id === overAgent.id || overLevel >= activeLevel) {
        toast({
          title: "Invalid Operation",
          description: "Cannot create circular dependencies in the hierarchy",
          variant: "destructive",
        });
        return;
      }

      // Calculate new hierarchy level - one level above the target
      const newLevel = toHierarchyLevel(overAgent.hierarchyLevel) + 1;

      await updateAgentHierarchy.mutateAsync({
        agentId: activeAgent.id,
        newLevel: newLevel,
        newParentId: overAgent.id,
      });

    } catch (error) {
      console.error("Failed to update hierarchy:", error);
      toast({
        title: "Error",
        description: "Failed to update agent hierarchy",
        variant: "destructive",
      });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-8">
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
          <p className="text-sm text-muted-foreground">
            Drag agents using the grip handle to reorganize the hierarchy. Drop an agent onto another agent to make it a subordinate.
            The hierarchy will automatically adjust based on your changes.
          </p>
        </div>

        {Object.entries(agentHierarchy).map(([level, levelAgents]) => (
          <div key={level} className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Level {level}
              </h3>
              {Number(level) > 1 && (
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <SortableContext
              items={levelAgents.map(a => a.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="grid gap-2">
                {levelAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className={`
                      transition-all duration-300 ease-in-out transform
                      ${dropTarget === agent.id ?
                        "scale-[1.02] ring-2 ring-primary/60 ring-offset-4 shadow-lg bg-primary/5" :
                        "hover:scale-[1.01]"
                      }
                    `}
                  >
                    <DraggableAgentCard
                      agent={agent}
                      isDragging={activeId === agent.id}
                    />
                  </div>
                ))}
              </div>
            </SortableContext>
          </div>
        ))}
      </div>

      <DragOverlay>
        {activeId ? (
          <DraggableAgentCard
            agent={agents.find(a => a.id === activeId)!}
            isOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
