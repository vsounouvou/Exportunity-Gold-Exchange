import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Agent } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { io } from "socket.io-client";
import { getSocketBaseUrl, resolveApiUrl } from "@/lib/runtimeConfig";
import {
  Send,
  MessageSquare,
  Loader2,
  Users,
  Clock,
  Check,
  AlertCircle,
  Brain,
} from "lucide-react";
import { format } from "date-fns";

interface ChatInterfaceProps {
  selectedAgent: Agent | null;
  agents: Agent[];
  chatRoomId?: string;
  activeAgents: Agent[];
}

interface Message {
  id: number;
  content: string;
  fromAgentId: number | null;
  toAgentId: number | null;
  type: "chat" | "system" | "notification" | "thought";
  status: "sending" | "sent" | "error";
  conversationId: string;
  createdAt: string;
  fromAgent?: Agent;
  metadata?: {
    sentiment?: { score: number };
    analysis?: { type: string };
    agentRole?: string;
  };
}

export function ChatInterface({ selectedAgent, agents, chatRoomId, activeAgents }: ChatInterfaceProps) {
  const [message, setMessage] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: [`/api/messages/${chatRoomId}`],
    enabled: !!chatRoomId,
    refetchInterval: 3000,
  });

  const handleSend = async () => {
    if (!message.trim() || !chatRoomId) return;

    try {
      setIsThinking(true);
      const response = await fetch(resolveApiUrl("/api/messages"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: message,
          type: "chat",
          fromAgentId: null,
          toAgentId: selectedAgent?.id || null,
          conversationId: chatRoomId,
          metadata: {
            requestType: "user_message",
            requiresResponse: true,
          }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to send message");
      }

      const result = await response.json();
      console.log("Message sent, server response:", result);

      setMessage("");
      await queryClient.invalidateQueries({
        queryKey: [`/api/messages/${chatRoomId}`],
      });
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setIsThinking(false);
    }
  };

  useEffect(() => {
    if (!chatRoomId) return;

    // Create socket connection with proper config
    const socket = io(getSocketBaseUrl() ?? "/", {
      path: "/socket.io",
      transports: ["websocket"],
      autoConnect: true
    });

    // Handle socket connection
    socket.on("connect", () => {
      console.log("Socket connected");
      if (selectedAgent) {
        socket.emit("join", { agentId: selectedAgent.id });
      }
    });

    // Handle agent typing indicators
    socket.on("agent_typing", (data: { agentId: number, agentName: string }) => {
      console.log("Agent typing:", data);
      // You can add UI feedback for typing indicators here
    });

    socket.on("agent_typing_end", (data: { agentId: number }) => {
      console.log("Agent stopped typing:", data);
    });

    // Handle new messages
    socket.on("new_message", (data: { conversationId: string }) => {
      if (data.conversationId === chatRoomId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/messages/${chatRoomId}`],
        });
      }
    });

    socket.on("error", (error: any) => {
      console.error("Socket error:", error);
      toast({
        title: "Connection Error",
        description: "Lost connection to agent responses. Please refresh the page.",
        variant: "destructive",
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [chatRoomId, selectedAgent, queryClient]);

  const getMessageSender = (fromAgentId: number | null) => {
    if (!fromAgentId) return "You";
    const agent = agents.find(a => a.id === fromAgentId);
    return agent ? agent.name : "Unknown Agent";
  };

  const getInputPlaceholder = () => {
    if (!chatRoomId) {
      return "Create a new chat first...";
    }
    if (activeAgents.length === 0) {
      return "Add agents to start chatting...";
    }
    return `Type your message${selectedAgent ? ` to ${selectedAgent.name}` : ''}...`;
  };

  const getMessageStatusIcon = (status: string) => {
    switch (status) {
      case "sending":
        return <Clock className="h-3 w-3 text-gray-400" />;
      case "sent":
        return <Check className="h-3 w-3 text-green-400" />;
      case "error":
        return <AlertCircle className="h-3 w-3 text-red-400" />;
      default:
        return null;
    }
  };

  const renderMessageContent = (msg: Message) => {
    const content = msg.content;

    // Check if this is an agent response with analysis
    if (msg.fromAgentId && content.includes('[Analysis]') && content.includes('[Response]')) {
      const [analysisPart, responsePart] = content.split('[Response]');
      const analysis = analysisPart.replace('[Analysis]:', '').trim();
      const response = responsePart.trim();

      return (
        <div className="space-y-4">
          {/* Analysis section */}
          <div className="bg-gray-800/70 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="h-4 w-4 text-blue-400" />
              <span className="text-xs font-medium text-blue-400">Analysis</span>
            </div>
            <div className="text-sm text-gray-300/90 leading-relaxed">
              {analysis}
            </div>
          </div>

          {/* Response section */}
          <div className="bg-gray-900/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="h-4 w-4 text-green-400" />
              <span className="text-xs font-medium text-green-400">Response</span>
            </div>
            <div className="text-sm text-white/90 leading-relaxed">
              {response}
            </div>
          </div>
        </div>
      );
    }

    // For regular messages
    return (
      <div className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">
        {content}
      </div>
    );
  };

  const canChat = chatRoomId && activeAgents.length > 0;

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="p-4 border-b border-gray-800 bg-gray-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-400" />
            <span className="text-lg font-medium text-gray-200">
              {!chatRoomId ? 'Create a chat room to start' : 'Multi-Agent Chat'}
            </span>
          </div>
          {activeAgents.length > 0 && (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-400">
                {activeAgents.length} agent{activeAgents.length !== 1 ? 's' : ''} active
              </span>
            </div>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 py-6">
        <div className="space-y-6">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.fromAgentId ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`
                  max-w-[85%] rounded-lg p-4 shadow-lg
                  ${msg.fromAgentId 
                    ? "bg-gray-800/90 border border-gray-700/50" 
                    : "bg-blue-600/20 text-blue-50"
                  }
                `}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`
                    h-8 w-8 rounded-full flex items-center justify-center
                    ${msg.fromAgentId ? "bg-gray-900/60" : "bg-blue-500/20"}
                  `}>
                    {msg.fromAgentId ? (
                      <Brain className="h-4 w-4 text-blue-400" />
                    ) : (
                      <MessageSquare className="h-4 w-4 text-blue-400" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {msg.fromAgentId 
                        ? agents.find(a => a.id === msg.fromAgentId)?.name || 'Agent'
                        : 'You'
                      }
                    </span>
                    {msg.fromAgentId && (
                      <span className="text-xs text-gray-400">
                        {agents.find(a => a.id === msg.fromAgentId)?.role}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 ml-auto flex items-center gap-1">
                    {format(new Date(msg.createdAt), "HH:mm")}
                    {getMessageStatusIcon(msg.status)}
                  </span>
                </div>

                {renderMessageContent(msg)}
              </div>
            </div>
          ))}
        </div>

        {isLoading && (
          <div className="flex justify-center my-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-[200px] text-center space-y-2">
            <MessageSquare className="h-12 w-12 text-gray-600" />
            <h3 className="font-medium text-gray-300">No messages yet</h3>
            <p className="text-sm text-gray-500">
              Start a conversation with the agents
            </p>
          </div>
        )}
      </ScrollArea>

      <div className="p-4 border-t border-gray-800 bg-gray-900/80">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={getInputPlaceholder()}
            disabled={!canChat || isThinking}
            className="flex-1 bg-gray-800 border-gray-700 text-white"
          />
          <Button
            type="submit"
            disabled={!message.trim() || !canChat || isThinking}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isThinking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default ChatInterface;
