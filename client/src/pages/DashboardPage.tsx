import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Calendar, MessageSquare, Video, Users, ChevronRight, Filter, Plus, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, isToday } from "date-fns";

interface ConversationMessage {
  id: number;
  content: string;
  senderType: string;
  senderName: string;
  timestamp: Date;
  metadata?: any;
}

interface Conversation {
  id: string;
  date: string;
  title: string;
  type: 'chat' | 'scheduled' | 'agent-sync' | 'chairman-daily';
  status: 'planned' | 'ongoing' | 'completed' | 'cancelled';
  messageCount: number;
  startTime?: Date;
  endTime?: Date;
  participants: any[];
  messages?: ConversationMessage[];
  metadata?: any;
}

type ConversationsByDate = Record<string, Conversation[]>;

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  // Fetch conversations grouped by date
  const { data: conversationsByDate, isLoading } = useQuery<ConversationsByDate>({
    queryKey: ["/api/conversations/by-date"],
  });

  // Fetch specific conversation when selected
  const { data: activeConversation } = useQuery<Conversation>({
    queryKey: ["/api/conversations", selectedConversation],
    enabled: !!selectedConversation,
  });

  // Get sorted dates
  const dates = conversationsByDate ? Object.keys(conversationsByDate).sort().reverse() : [];
  
  // Filter conversations by type if filter is active
  const getFilteredConversations = (convs: Conversation[]) => {
    if (!typeFilter) return convs;
    return convs.filter(c => c.type === typeFilter);
  };

  // Get conversation icon based on type
  const getConversationIcon = (type: string) => {
    switch (type) {
      case 'chairman-daily':
        return <MessageSquare className="h-4 w-4" />;
      case 'scheduled':
        return <Video className="h-4 w-4" />;
      case 'agent-sync':
        return <Users className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  // Get conversation status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planned':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'ongoing':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'completed':
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
      case 'cancelled':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  // Format date for display
  const formatDisplayDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return "Today";
    return format(date, "MMM d, yyyy");
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading conversations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left Sidebar - Timeline */}
      <div className="w-80 border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Conversations & Diary</h2>
            <Button size="sm" variant="ghost">
              <Plus className="h-4 w-4 mr-1" />
              New
            </Button>
          </div>

          {/* Type Filter Tabs */}
          <Tabs value={typeFilter || "all"} onValueChange={(v) => setTypeFilter(v === "all" ? null : v)}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
              <TabsTrigger value="chairman-daily" className="text-xs">Daily</TabsTrigger>
              <TabsTrigger value="scheduled" className="text-xs">Meetings</TabsTrigger>
              <TabsTrigger value="chat" className="text-xs">Chats</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Date-based Timeline */}
        <ScrollArea className="flex-1">
          {dates.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs mt-1">Start a conversation to see it here</p>
            </div>
          ) : (
            dates.map((date) => {
              const dateConversations = getFilteredConversations((conversationsByDate && conversationsByDate[date]) || []);
              if (dateConversations.length === 0 && typeFilter) return null;

              return (
                <div key={date} className="mb-2">
                  <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-2 z-10">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {formatDisplayDate(date)}
                    </h3>
                  </div>

                  <div className="space-y-1 px-2">
                    {dateConversations.map((conv: Conversation) => (
                      <button
                        key={conv.id}
                        onClick={() => {
                          setSelectedDate(date);
                          setSelectedConversation(conv.id);
                        }}
                        className={`w-full text-left p-3 rounded-lg transition-colors hover:bg-accent ${
                          selectedConversation === conv.id ? 'bg-accent' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5">
                            {getConversationIcon(conv.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <p className="text-sm font-medium truncate">{conv.title}</p>
                              {conv.status === 'ongoing' && isToday(new Date(conv.date)) && (
                                <div className="flex-shrink-0 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className={`${getStatusColor(conv.status)} text-xs px-1.5 py-0`}>
                                {conv.status}
                              </Badge>
                              <span>{conv.messageCount} messages</span>
                              {conv.participants.length > 0 && (
                                <>
                                  <span>•</span>
                                  <span>{conv.participants.length} participants</span>
                                </>
                              )}
                            </div>
                            {conv.startTime && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {format(new Date(conv.startTime), "h:mm a")}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </ScrollArea>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {selectedConversation && activeConversation ? (
          <>
            {/* Conversation Header */}
            <div className="border-b p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {getConversationIcon(activeConversation.type)}
                    <h1 className="text-xl font-semibold">{activeConversation.title}</h1>
                    <Badge variant="outline" className={getStatusColor(activeConversation.status)}>
                      {activeConversation.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>{format(new Date(activeConversation.date), "MMMM d, yyyy")}</span>
                    {activeConversation.startTime && (
                      <>
                        <span>•</span>
                        <span>{format(new Date(activeConversation.startTime), "h:mm a")}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>{activeConversation.participants.length} participants</span>
                  </div>
                </div>

                {activeConversation.status === 'completed' && activeConversation.metadata?.summary && (
                  <Button variant="outline" size="sm">
                    View Summary
                  </Button>
                )}
              </div>

              {/* Participants */}
              {activeConversation.participants.length > 0 && (
                <div className="mt-3 flex items-center gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Participants:</p>
                  <div className="flex items-center gap-2">
                    {activeConversation.participants.map((p: any) => (
                      <Badge key={p.id} variant="secondary" className="text-xs">
                        {p.participantName}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {activeConversation.messages && activeConversation.messages.length > 0 ? (
                <div className="space-y-4 max-w-3xl mx-auto">
                  {activeConversation.messages.map((msg) => (
                    <div key={msg.id} className="flex gap-3">
                      <div className={`flex-1 ${
                        msg.senderType === 'chairman' ? 'text-right' : ''
                      }`}>
                        <div className={`inline-block max-w-[80%] ${
                          msg.senderType === 'chairman' 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted'
                        } rounded-lg p-3`}>
                          <p className="text-xs font-medium mb-1 opacity-70">{msg.senderName}</p>
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          <p className="text-xs mt-1 opacity-60">
                            {format(new Date(msg.timestamp), "h:mm a")}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-center text-muted-foreground">
                  <div>
                    <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No messages yet</p>
                  </div>
                </div>
              )}
            </ScrollArea>

            {/* Summary Section (if completed) */}
            {activeConversation.status === 'completed' && activeConversation.metadata?.summary && (
              <div className="border-t p-4 bg-muted/30">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Conversation Summary
                </h3>
                <p className="text-sm text-muted-foreground">{activeConversation.metadata.summary}</p>
                
                {activeConversation.metadata.keyDecisions && activeConversation.metadata.keyDecisions.length > 0 && (
                  <div className="mt-3">
                    <h4 className="text-xs font-semibold mb-1">Key Decisions:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {activeConversation.metadata.keyDecisions.map((decision: string, i: number) => (
                        <li key={i} className="flex items-start gap-2">
                          <ChevronRight className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          <span>{decision}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-muted-foreground">
            <div>
              <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">Select a conversation</h3>
              <p className="text-sm">Choose a conversation from the timeline to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
