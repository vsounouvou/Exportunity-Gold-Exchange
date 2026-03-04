import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AgentSelector } from './AgentSelector';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { resolveApiUrl } from "@/lib/runtimeConfig";

interface AddAgentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  onAgentsAdded?: () => void;
}

export function AddAgentsModal({
  open,
  onOpenChange,
  conversationId,
  onAgentsAdded
}: AddAgentsModalProps) {
  const [selectedAgents, setSelectedAgents] = React.useState<number[]>([]);
  const { toast } = useToast();

  const addAgentsMutation = useMutation({
    mutationFn: async (agentIds: number[]) => {
      const response = await fetch(resolveApiUrl(`/api/chatrooms/${conversationId}/members/batch`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentIds }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to add agents');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Agents added successfully",
        description: `Added ${selectedAgents.length} agents to the conversation`,
      });
      onAgentsAdded?.();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Failed to add agents",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddAgents = () => {
    if (selectedAgents.length === 0) {
      toast({
        title: "No agents selected",
        description: "Please select at least one agent to add",
        variant: "destructive",
      });
      return;
    }

    addAgentsMutation.mutate(selectedAgents);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Agents to Conversation</DialogTitle>
          <DialogDescription>
            Select agents to add to this conversation. You can choose from predefined teams or select individual agents.
          </DialogDescription>
        </DialogHeader>

        <AgentSelector
          onSelect={setSelectedAgents}
          conversationId={conversationId}
        />

        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAddAgents}
            disabled={addAgentsMutation.isPending}
          >
            {addAgentsMutation.isPending ? (
              "Adding agents..."
            ) : (
              `Add ${selectedAgents.length} ${selectedAgents.length === 1 ? 'Agent' : 'Agents'}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
