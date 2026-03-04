import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Agent } from "@db/schema";
import { Users, Plus, Loader2 } from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { resolveApiUrl } from "@/lib/runtimeConfig";

interface AgentHierarchyProps {
  agents: Agent[];
  selectedAgent: Agent | null;
  onSelectAgent: (agent: Agent) => void;
}

export default function AgentHierarchy({
  agents,
  selectedAgent,
  onSelectAgent,
}: AgentHierarchyProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentRole, setNewAgentRole] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createAgentMutation = useMutation({
    mutationFn: async () => {
      console.log("Creating agent with:", { name: newAgentName, role: newAgentRole });

      if (!newAgentName.trim() || !newAgentRole.trim()) {
        throw new Error("Name and role are required");
      }

      const response = await fetch(resolveApiUrl("/api/agents"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newAgentName.trim(),
          role: newAgentRole.trim(),
          status: "active",
          avatar: "",
          capabilities: [],
          metadata: {},
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to create agent:", errorText);
        throw new Error(errorText || "Failed to create agent");
      }

      const data = await response.json();
      console.log("Agent created successfully:", data);
      return data;
    },
    onSuccess: (data) => {
      console.log("Mutation succeeded, invalidating queries");
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setIsOpen(false);
      setNewAgentName("");
      setNewAgentRole("");
      toast({
        title: "Success",
        description: `Agent "${data.name}" created successfully`,
      });
    },
    onError: (error) => {
      console.error("Mutation error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create agent",
        variant: "destructive",
      });
    },
  });

  const handleCreateAgent = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form submitted, triggering mutation");
    createAgentMutation.mutate();
  };

  if (!agents || agents.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span>Loading agents...</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-100">Available Agents</h2>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-900 border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-gray-100">Create New Agent</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateAgent} className="space-y-4">
              <div>
                <Label htmlFor="name" className="text-gray-200">Name</Label>
                <Input
                  id="name"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  placeholder="Enter agent name"
                  className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500"
                />
              </div>
              <div>
                <Label htmlFor="role" className="text-gray-200">Role</Label>
                <Input
                  id="role"
                  value={newAgentRole}
                  onChange={(e) => setNewAgentRole(e.target.value)}
                  placeholder="Enter agent role"
                  className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500"
                />
              </div>
              <div className="flex justify-end gap-2">
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
                  disabled={createAgentMutation.isPending || !newAgentName.trim() || !newAgentRole.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {createAgentMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    'Create'
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <ScrollArea className="h-[calc(100vh-8rem)]">
        <div className="space-y-1">
          {agents.map((agent) => (
            <Button
              key={agent.id}
              variant={selectedAgent?.id === agent.id ? "secondary" : "ghost"}
              className={`w-full justify-start text-sm group relative overflow-hidden transition-all duration-200 hover:bg-gray-800 ${
                selectedAgent?.id === agent.id 
                  ? 'bg-gray-800 text-white border border-gray-600 shadow-md' 
                  : 'text-gray-200 hover:text-white'
              }`}
              onClick={() => onSelectAgent(agent)}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-700/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-x-full group-hover:translate-x-full transform" />
              <Users className="mr-2 h-4 w-4 text-gray-300 group-hover:text-white" />
              <span className="truncate font-medium">{agent.name}</span>
              <span className="ml-1.5 text-xs text-gray-400 truncate">({agent.role})</span>
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
