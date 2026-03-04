import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from '@tanstack/react-query';
import { Separator } from "@/components/ui/separator";
import { resolveApiUrl } from "@/lib/runtimeConfig";

interface Agent {
  id: number;
  name: string;
  role: string;
  status: string;
}

interface AgentGroup {
  name: string;
  agents: Agent[];
}

interface SuggestedGroup {
  name: string;
  description: string;
  agents: Agent[];
}

interface AgentSelectorProps {
  onSelect: (selectedIds: number[]) => void;
  initialSelected?: number[];
  conversationId?: string;
}

export function AgentSelector({ onSelect, initialSelected = [], conversationId }: AgentSelectorProps) {
  const [selectedAgents, setSelectedAgents] = useState<Set<number>>(new Set(initialSelected));

  // Fetch agent groups (organized by role)
  const { data: agentGroups } = useQuery<AgentGroup[]>({
    queryKey: ['/api/agent-groups'],
    queryFn: async () => {
      const response = await fetch(resolveApiUrl('/api/agent-groups'));
      if (!response.ok) throw new Error('Failed to fetch agent groups');
      return response.json();
    },
  });

  // Fetch suggested combinations
  const { data: suggestedGroups } = useQuery<SuggestedGroup[]>({
    queryKey: ['/api/agent-combinations'],
    queryFn: async () => {
      const response = await fetch(resolveApiUrl('/api/agent-combinations'));
      if (!response.ok) throw new Error('Failed to fetch suggested combinations');
      return response.json();
    },
  });

  const toggleAgent = (agentId: number) => {
    const newSelected = new Set(selectedAgents);
    if (newSelected.has(agentId)) {
      newSelected.delete(agentId);
    } else {
      newSelected.add(agentId);
    }
    setSelectedAgents(newSelected);
    onSelect(Array.from(newSelected));
  };

  const selectPreset = (agents: Agent[]) => {
    const newSelected = new Set(agents.map(a => a.id));
    setSelectedAgents(newSelected);
    onSelect(Array.from(newSelected));
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4">
      {/* Quick Select Presets */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Select Teams</CardTitle>
          <CardDescription>
            Choose from predefined team combinations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {suggestedGroups?.map((group) => (
              <Button
                key={group.name}
                variant="outline"
                className="justify-start h-auto py-2"
                onClick={() => selectPreset(group.agents)}
              >
                <div className="text-left">
                  <div className="font-medium">{group.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {group.description}
                  </div>
                </div>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Individual Agent Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Individual Agents</CardTitle>
          <CardDescription>
            Or choose specific agents to add
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-6">
              {agentGroups?.map((group) => (
                <div key={group.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">{group.name}</h4>
                    <Badge variant="secondary">
                      {group.agents.length} {group.agents.length === 1 ? 'Agent' : 'Agents'}
                    </Badge>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {group.agents.map((agent) => (
                      <div
                        key={agent.id}
                        className="flex items-center space-x-2 p-2 rounded-lg hover:bg-accent"
                      >
                        <Checkbox
                          id={`agent-${agent.id}`}
                          checked={selectedAgents.has(agent.id)}
                          onCheckedChange={() => toggleAgent(agent.id)}
                        />
                        <label
                          htmlFor={`agent-${agent.id}`}
                          className="flex flex-col cursor-pointer flex-1"
                        >
                          <span className="font-medium">{agent.name}</span>
                          <span className="text-sm text-muted-foreground">
                            {agent.role}
                          </span>
                        </label>
                        <Badge
                          variant={agent.status === 'active' ? 'default' : 'secondary'}
                        >
                          {agent.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
