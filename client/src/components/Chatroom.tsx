import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Brain, MessageSquare, RefreshCw, AlertCircle, Send, Quote } from "lucide-react";
import type { Agent } from "@db/schema";
import { format } from "date-fns";
import { resolveApiUrl } from "@/lib/runtimeConfig";

interface Message {
  message: {
    id: number;
    content: string;
    fromAgentId: number;
    toAgentId: number;
    createdAt: string;
    metadata: {
      analysis?: string;
      isResponse?: boolean;
      isSystemMessage?: boolean;
    };
  };
  fromAgent: Agent;
  toAgent: Agent;
}

interface ChatroomProps {
  chatroomId: string;
  currentAgentId: number;
  selectedAgentId: number | null;
  agents: Agent[];
}

export function Chatroom({ chatroomId, currentAgentId, selectedAgentId, agents }: ChatroomProps) {
  const [messageInput, setMessageInput] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: [`/api/chatrooms/${chatroomId}/messages`],
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!selectedAgentId) {
        throw new Error("Please select an agent to chat with");
      }

      const response = await fetch(resolveApiUrl(`/api/chatrooms/${chatroomId}/messages`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          fromAgentId: currentAgentId,
          toAgentId: selectedAgentId,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      setMessageInput("");
      queryClient.invalidateQueries({ queryKey: [`/api/chatrooms/${chatroomId}/messages`] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const handleSend = () => {
    if (!selectedAgentId) {
      toast({
        title: "Select an Agent",
        description: "Please select an agent to chat with first",
        variant: "destructive",
      });
      return;
    }

    if (messageInput.trim()) {
      sendMessage.mutate(messageInput);
    }
  };

  const renderMessage = (msg: Message) => {
    const isFromUser = msg.message.fromAgentId === currentAgentId;
    const isSystemMessage = msg.message.metadata?.isSystemMessage;

    // Extract analysis and response parts
    let analysis = '';
    let response = '';

    const content = msg.message.content;
    if (content.includes('[Analysis]') && content.includes('[Response]')) {
      const parts = content.split('[Response]');
      analysis = parts[0].replace('[Analysis]:', '').trim();
      response = parts[1].trim();
    }

    return (
      <div
        key={msg.message.id}
        className={`flex ${isFromUser ? "justify-end" : "justify-start"}`}
      >
        <div
          className={`
            max-w-[85%] rounded-lg p-4
            ${isSystemMessage
              ? "bg-gray-800/50 text-gray-300"
              : isFromUser
              ? "bg-primary/20 text-primary-foreground"
              : "bg-gray-800/50"
            }
          `}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="h-6 w-6 rounded-full bg-gray-900/40 flex items-center justify-center">
              {isSystemMessage ? (
                <Brain className="h-3 w-3" />
              ) : isFromUser ? (
                <MessageSquare className="h-3 w-3" />
              ) : (
                <Brain className="h-3 w-3" />
              )}
            </div>
            <div className="text-sm font-medium">
              {isFromUser ? "You" : msg.fromAgent?.name || `Agent ${msg.message.fromAgentId}`}
            </div>
            <div className="text-xs text-gray-400">
              {format(new Date(msg.message.createdAt), "h:mm a")}
            </div>
          </div>

          {analysis ? (
            <div className="space-y-3">
              <div className="text-sm text-gray-400 bg-gray-900/30 p-3 rounded-md">
                <div className="flex items-center gap-1.5 mb-1 text-xs font-medium text-gray-500">
                  <Brain className="h-3 w-3" />
                  Analysis
                </div>
                {analysis}
              </div>
              <div className="text-sm">
                <div className="flex items-center gap-1.5 mb-1 text-xs font-medium text-primary/70">
                  <MessageSquare className="h-3 w-3" />
                  Response
                </div>
                {response}
              </div>
            </div>
          ) : (
            <div className="text-sm whitespace-pre-wrap">{content}</div>
          )}
        </div>
      </div>
    );
  };

  if (!selectedAgentId) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground" />
          <h3 className="text-lg font-medium">Select an Agent</h3>
          <p className="text-sm text-muted-foreground">
            Choose an agent from the sidebar to start a conversation
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <ScrollArea className="flex-1 p-4">
        {isLoadingMessages ? (
          <div className="flex justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : messages.length > 0 ? (
          <div className="space-y-6">
            {messages.map((msg) => renderMessage(msg))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
            <MessageSquare className="h-12 w-12 text-gray-600" />
            <h3 className="font-medium text-gray-300">No messages yet</h3>
            <p className="text-sm text-gray-500">
              Start the conversation
            </p>
          </div>
        )}
      </ScrollArea>

      <div className="p-4 border-t border-gray-800 bg-gray-900/80">
        <div className="flex gap-2">
          <Input
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder={`Message...`}
            onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            disabled={sendMessage.isPending}
            className="flex-1 bg-gray-800 border-gray-700"
          />
          <Button
            onClick={handleSend}
            disabled={!messageInput.trim() || sendMessage.isPending}
            size="icon"
            className="bg-primary/20 hover:bg-primary/30"
          >
            {sendMessage.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default Chatroom;
