import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChatInterface } from "@/components/ChatInterface";
import { ChatSidebar } from "@/components/ChatSidebar";
import { Button } from "@/components/ui/button";
import { Agent } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { resolveApiUrl } from "@/lib/runtimeConfig";

interface ChatRoom {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  conversationId: string;
  agents: Agent[];
}

export default function Chat() {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [currentChatRoom, setCurrentChatRoom] = useState<ChatRoom | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: agents = [], isLoading: isLoadingAgents, error: agentsError } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
    retry: 2,
  });

  const { data: chatRooms = [], isLoading: isLoadingRooms, error: roomsError } = useQuery<ChatRoom[]>({
    queryKey: ["/api/chatrooms"],
    refetchInterval: 5000,
    retry: 2,
  });

  const { data: activeAgents = [] } = useQuery<Agent[]>({
    queryKey: [`/api/chatrooms/${currentChatRoom?.conversationId}/members`],
    enabled: !!currentChatRoom?.conversationId,
  });

  const createChatRoomMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(resolveApiUrl("/api/chatrooms"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Chat ${Date.now()}`,
          type: "general",
          description: "New chat room",
          moderatorId: null
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to create chat room");
      }

      return response.json();
    },
    onSuccess: (newChatRoom) => {
      setCurrentChatRoom(newChatRoom);
      queryClient.invalidateQueries({ queryKey: ["/api/chatrooms"] });
      toast({
        title: "Chat Created",
        description: "New chat room has been created. Add agents to start chatting.",
      });
    },
    onError: (error) => {
      console.error("Failed to create chat room:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create chat",
        variant: "destructive",
      });
    },
  });

  const addAgentMutation = useMutation({
    mutationFn: async (agent: Agent) => {
      if (!currentChatRoom?.conversationId) {
        throw new Error("No active chat room");
      }

      const response = await fetch(
        resolveApiUrl(`/api/chatrooms/${currentChatRoom.conversationId}/members`),
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id }),
        },
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to add agent to chat");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: [`/api/chatrooms/${currentChatRoom?.conversationId}/members`] 
      });
      toast({
        title: "Agent Added",
        description: "The agent has been added to the chat",
      });
    },
    onError: (error) => {
      console.error("Failed to add agent:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add agent",
        variant: "destructive",
      });
    },
  });

  const handleNewChat = () => {
    createChatRoomMutation.mutate();
  };

  const handleAddAgent = (agent: Agent) => {
    if (!currentChatRoom?.conversationId) {
      toast({
        title: "Create Chat",
        description: "Please create or select a chat first",
        variant: "destructive",
      });
      return;
    }
    addAgentMutation.mutate(agent);
  };

  const handleRemoveAgent = async (agent: Agent) => {
    if (!currentChatRoom?.conversationId) return;

    try {
      const response = await fetch(
        resolveApiUrl(`/api/chatrooms/${currentChatRoom.conversationId}/members/${agent.id}`),
        {
        method: "DELETE",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to remove agent");
      }

      queryClient.invalidateQueries({ 
        queryKey: [`/api/chatrooms/${currentChatRoom.conversationId}/members`] 
      });
      toast({
        title: "Agent Removed",
        description: "The agent has been removed from the chat",
      });
    } catch (error) {
      console.error("Failed to remove agent:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to remove agent",
        variant: "destructive",
      });
    }
  };

  if (agentsError || roomsError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="text-center space-y-4 bg-gray-900 border border-gray-800 rounded-lg p-8 max-w-md">
          <h2 className="text-2xl font-bold text-white">Error Loading Chat</h2>
          <p className="text-gray-400">
            {agentsError ? "Failed to load agents" : "Failed to load chat rooms"}
          </p>
          <Button onClick={() => window.location.reload()}>
            Reload Page
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-950">
      <div className="hidden md:block">
        <ChatSidebar
          selectedAgent={selectedAgent}
          onSelectAgent={setSelectedAgent}
          agents={agents}
          activeAgents={activeAgents}
          onAddAgent={handleAddAgent}
          onRemoveAgent={handleRemoveAgent}
          onNewChat={handleNewChat}
          chatRooms={chatRooms}
          currentChatRoom={currentChatRoom}
          onSelectChatRoom={setCurrentChatRoom}
        />
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <ChatInterface 
          selectedAgent={selectedAgent} 
          agents={agents}
          chatRoomId={currentChatRoom?.conversationId}
          activeAgents={activeAgents}
        />
      </div>
    </div>
  );
}
