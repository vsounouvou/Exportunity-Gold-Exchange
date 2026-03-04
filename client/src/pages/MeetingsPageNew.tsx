import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Agent } from "@db/schema";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import {
  Send,
  Loader2,
  MessageSquare,
  Users,
  Plus,
  X,
  Video,
  Clock,
  Filter,
  Search,
  UserPlus,
  CheckCircle2,
  Circle,
  PlayCircle
} from "lucide-react";
import { format, isToday, isFuture, parseISO } from "date-fns";
import { io } from "socket.io-client";

interface ChatRoom {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  conversationId: string;
  agents: Agent[];
  status?: string;
  startTime?: string;
  endTime?: string;
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
  metadata?: any;
}

export default function MeetingsPageNew() {
  const [currentMeeting, setCurrentMeeting] = useState<ChatRoom | null>(null);
  const [message, setMessage] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewMeetingOpen, setIsNewMeetingOpen] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState("");
  const [selectedAgentsForNew, setSelectedAgentsForNew] = useState<number[]>([]);
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: agents = [], isLoading: isLoadingAgents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: chatRooms = [], isLoading: isLoadingRooms } = useQuery<ChatRoom[]>({
    queryKey: ["/api/chatrooms"],
    refetchInterval: 5000,
  });

  const { data: activeMemberships = [] } = useQuery<{ agent: Agent }[]>({
    queryKey: [`/api/chatrooms/${currentMeeting?.conversationId}/members`],
    enabled: !!currentMeeting?.conversationId,
  });

  // Extract agents from memberships
  const activeAgents = activeMemberships.map(m => m.agent).filter(Boolean);

  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: [`/api/messages/${currentMeeting?.conversationId}`],
    enabled: !!currentMeeting?.conversationId,
    refetchInterval: 3000,
  });

  const createMeetingMutation = useMutation({
    mutationFn: async (data: { title: string; agentIds: number[] }) => {
      // Use the proper /api/meetings endpoint which handles participants automatically
      const response = await fetch(resolveApiUrl("/api/meetings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.title || `Meeting ${Date.now()}`,
          description: "Meeting room",
          type: "spontaneous",
          startTime: new Date().toISOString(),
          duration: 60,
          organizerId: data.agentIds[0] || 1,
          participants: data.agentIds,
        }),
      });

      if (!response.ok) throw new Error("Failed to create meeting");
      const result = await response.json();

      // Return the chatRoom object which has the conversationId
      return result.chatRoom;
    },
    onSuccess: (newMeeting) => {
      setCurrentMeeting(newMeeting);
      queryClient.invalidateQueries({ queryKey: ["/api/chatrooms"] });
      queryClient.invalidateQueries({ 
        queryKey: [`/api/chatrooms/${newMeeting.conversationId}/members`] 
      });
      setIsNewMeetingOpen(false);
      setNewMeetingTitle("");
      setSelectedAgentsForNew([]);
      toast({
        title: "Meeting Created",
        description: "Your meeting room is ready",
      });
    },
  });

  const addAgentMutation = useMutation({
    mutationFn: async (agentId: number) => {
      if (!currentMeeting) throw new Error("No active meeting");
      
      const response = await fetch(resolveApiUrl(`/api/chatrooms/${currentMeeting.conversationId}/members`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });

      if (!response.ok) throw new Error("Failed to add agent");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: [`/api/chatrooms/${currentMeeting?.conversationId}/members`] 
      });
      toast({
        title: "Agent Added",
        description: "The agent has joined the meeting",
      });
    },
  });

  const removeAgentMutation = useMutation({
    mutationFn: async (agentId: number) => {
      if (!currentMeeting) throw new Error("No active meeting");
      
      const response = await fetch(
        resolveApiUrl(`/api/chatrooms/${currentMeeting.conversationId}/members/${agentId}`),
        { method: "DELETE" }
      );

      if (!response.ok) throw new Error("Failed to remove agent");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: [`/api/chatrooms/${currentMeeting?.conversationId}/members`] 
      });
      toast({
        title: "Agent Removed",
        description: "The agent has left the meeting",
      });
    },
  });

  const handleSend = async () => {
    if (!message.trim() || !currentMeeting) return;

    try {
      setIsThinking(true);
      const response = await fetch(resolveApiUrl("/api/messages"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: message,
          type: "chat",
          fromAgentId: null,
          toAgentId: null,
          conversationId: currentMeeting.conversationId,
          metadata: {
            requestType: "user_message",
            requiresResponse: true,
          },
        }),
      });

      if (!response.ok) throw new Error("Failed to send message");

      setMessage("");
      await queryClient.invalidateQueries({
        queryKey: [`/api/messages/${currentMeeting.conversationId}`],
      });
    } catch (error) {
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
    if (scrollAreaRef.current && messages.length > 0) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  const filteredMeetings = chatRooms.filter((room) => {
    const matchesSearch = room.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === "all" || room.type === filterType;
    return matchesSearch && matchesFilter;
  });

  const availableAgents = agents.filter(
    (agent) => !activeAgents.some((active) => active.id === agent.id)
  );

  const getMeetingStatusBadge = (room: ChatRoom) => {
    if (room.status === "ongoing") return <Badge>Live</Badge>;
    if (room.status === "completed") return <Badge variant="secondary">Completed</Badge>;
    if (room.status === "scheduled") return <Badge variant="outline">Scheduled</Badge>;
    return <Badge variant="outline">Active</Badge>;
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex bg-gray-950">
      {/* Left Column: Meetings List */}
      <div className="w-80 border-r border-gray-800 flex flex-col bg-gray-900/30">
        {/* Header */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-400" />
              Meetings
            </h2>
            <Dialog open={isNewMeetingOpen} onOpenChange={setIsNewMeetingOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-1" />
                  New
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-gray-800">
                <DialogHeader>
                  <DialogTitle className="text-white">Create Meeting</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Start a new meeting room with agents
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <label className="text-sm text-gray-300 mb-2 block">Meeting Title</label>
                    <Input
                      value={newMeetingTitle}
                      onChange={(e) => setNewMeetingTitle(e.target.value)}
                      placeholder="e.g., Sales Strategy Discussion"
                      className="bg-gray-800 border-gray-700 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-300 mb-2 block">Select Agents</label>
                    <ScrollArea className="h-48 border border-gray-800 rounded-md p-2">
                      {agents.map((agent) => (
                        <div key={agent.id} className="flex items-center gap-2 py-2">
                          <Checkbox
                            checked={selectedAgentsForNew.includes(agent.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedAgentsForNew([...selectedAgentsForNew, agent.id]);
                              } else {
                                setSelectedAgentsForNew(
                                  selectedAgentsForNew.filter((id) => id !== agent.id)
                                );
                              }
                            }}
                          />
                          <span className="text-sm text-white">{agent.name}</span>
                          {agent.role && (
                            <Badge variant="outline" className="text-xs">
                              {agent.role}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </ScrollArea>
                  </div>
                  <Button
                    onClick={() =>
                      createMeetingMutation.mutate({
                        title: newMeetingTitle,
                        agentIds: selectedAgentsForNew,
                      })
                    }
                    disabled={createMeetingMutation.isPending}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {createMeetingMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Create Meeting"
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search meetings..."
              className="pl-9 bg-gray-800 border-gray-700 text-white"
            />
          </div>

          {/* Filters */}
          <Tabs value={filterType} onValueChange={setFilterType} className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-gray-800">
              <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
              <TabsTrigger value="meeting" className="text-xs">Meetings</TabsTrigger>
              <TabsTrigger value="agent" className="text-xs">Agent-only</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Meetings List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-2">
            {filteredMeetings.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No meetings found</p>
              </div>
            ) : (
              filteredMeetings.map((room) => (
                <Card
                  key={room.id}
                  className={`cursor-pointer transition-colors ${
                    currentMeeting?.id === room.id
                      ? "bg-blue-600/20 border-blue-500"
                      : "bg-gray-800/50 border-gray-700 hover:bg-gray-800"
                  }`}
                  onClick={() => setCurrentMeeting(room)}
                >
                  <CardHeader className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm font-medium text-white truncate">
                          {room.name}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          {getMeetingStatusBadge(room)}
                          {room.agents && room.agents.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              <Users className="h-3 w-3 mr-1" />
                              {room.agents.length}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Center Column: Active Meeting Room */}
      <div className="flex-1 flex flex-col">
        {currentMeeting ? (
          <>
            {/* Meeting Header */}
            <div className="h-16 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm px-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Video className="h-5 w-5 text-blue-400" />
                <div>
                  <h2 className="text-base font-semibold text-white">{currentMeeting.name}</h2>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Clock className="h-3 w-3" />
                    Started {format(new Date(currentMeeting.createdAt), "MMM d, h:mm a")}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getMeetingStatusBadge(currentMeeting)}
              </div>
            </div>

            {/* Messages Area */}
            <ScrollArea ref={scrollAreaRef} className="flex-1 px-6 py-4">
              <div className="max-w-4xl mx-auto space-y-4">
                {messages.length === 0 && !isLoadingMessages && (
                  <div className="flex flex-col items-center justify-center h-[400px] text-center space-y-3">
                    <MessageSquare className="h-16 w-16 text-gray-600" />
                    <h3 className="text-lg font-medium text-gray-300">Meeting Room Ready</h3>
                    <p className="text-sm text-gray-500 max-w-md">
                      Start the conversation or add agents to join the discussion
                    </p>
                  </div>
                )}

                {messages.map((msg) => {
                  const isUser = msg.fromAgentId === null;
                  const agent = msg.fromAgent;

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg p-4 shadow-lg ${
                          isUser
                            ? "bg-blue-600/90 text-white"
                            : "bg-gray-800/90 border border-gray-700/50"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium">
                            {isUser ? "You" : agent?.name || "Agent"}
                          </span>
                          {agent?.role && !isUser && (
                            <Badge variant="outline" className="text-xs">
                              {agent.role}
                            </Badge>
                          )}
                          <span className="text-xs text-gray-400">
                            {format(new Date(msg.createdAt), "HH:mm")}
                          </span>
                        </div>
                        <div className={`text-sm leading-relaxed whitespace-pre-wrap ${
                          isUser ? 'text-white' : 'text-white/90'
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {isThinking && (
                  <div className="flex justify-start">
                    <div className="bg-gray-800/90 border border-gray-700/50 rounded-lg p-4">
                      <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Message Input */}
            <div className="p-4 border-t border-gray-800 bg-gray-900/80">
              <div className="max-w-4xl mx-auto">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex gap-3"
                >
                  <Input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type your message..."
                    disabled={isThinking}
                    className="flex-1 bg-gray-800 border-gray-700 text-white"
                  />
                  <Button
                    type="submit"
                    disabled={!message.trim() || isThinking}
                    className="bg-blue-600 hover:bg-blue-700 px-6"
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
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center space-y-4">
            <div>
              <Users className="h-20 w-20 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-gray-300 mb-2">No Meeting Selected</h3>
              <p className="text-gray-500 mb-6">
                Select a meeting from the list or create a new one to get started
              </p>
              <Button
                onClick={() => setIsNewMeetingOpen(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create New Meeting
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Participants */}
      <div className="w-80 border-l border-gray-800 flex flex-col bg-gray-900/30">
        <div className="p-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-400" />
            Participants
          </h3>
        </div>

        {currentMeeting ? (
          <>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                {/* Chairman (You) */}
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium">
                        C
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">Chairman (You)</p>
                        <p className="text-xs text-gray-400">Organizer</p>
                      </div>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </div>
                  </CardContent>
                </Card>

                {/* Active Agents */}
                {activeAgents.map((agent) => (
                  <Card key={agent.id} className="bg-gray-800/50 border-gray-700">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm font-medium">
                          {(agent.name || 'A').charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{agent.name || 'Unknown Agent'}</p>
                          {agent.role && (
                            <p className="text-xs text-gray-400 truncate">{agent.role}</p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeAgentMutation.mutate(agent.id)}
                          disabled={removeAgentMutation.isPending}
                          className="h-6 w-6 p-0 text-gray-400 hover:text-red-400"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {activeAgents.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No agents in this meeting yet
                  </p>
                )}
              </div>
            </ScrollArea>

            {/* Add Agent Section */}
            {availableAgents.length > 0 && (
              <div className="p-4 border-t border-gray-800">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="w-full bg-blue-600 hover:bg-blue-700">
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Agent
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-gray-900 border-gray-800">
                    <DialogHeader>
                      <DialogTitle className="text-white">Add Agent to Meeting</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="h-64 mt-4">
                      <div className="space-y-2">
                        {availableAgents.map((agent) => (
                          <Card
                            key={agent.id}
                            className="bg-gray-800/50 border-gray-700 hover:bg-gray-800 cursor-pointer transition-colors"
                            onClick={() => addAgentMutation.mutate(agent.id)}
                          >
                            <CardContent className="p-3">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm font-medium">
                                  {(agent.name || 'A').charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-white truncate">
                                    {agent.name || 'Unknown Agent'}
                                  </p>
                                  {agent.role && (
                                    <p className="text-xs text-gray-400 truncate">{agent.role}</p>
                                  )}
                                </div>
                                <Plus className="h-4 w-4 text-blue-400" />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center p-4">
            <p className="text-sm text-gray-500">
              Select a meeting to see participants
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
