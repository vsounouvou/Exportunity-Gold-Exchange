import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { useChairmanContext } from "@/hooks/use-chairman-context";
import { useUser } from "@/hooks/use-user";
import {
  Send,
  Loader2,
  MessageSquare,
  Users,
  Clock,
  Plus,
  CalendarIcon,
} from "lucide-react";
import { format, parseISO, isToday, isFuture } from "date-fns";
import { useLocation } from "wouter";

interface AssistantThread {
  id: number;
  assistantDisplayName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface AssistantMessage {
  id: number;
  content: string;
  senderType: "user" | "assistant" | "system";
  senderName?: string | null;
  createdAt: string;
}

interface Meeting {
  id: number;
  title: string;
  description: string;
  type: string;
  status: string;
  startTime: string;
  endTime?: string;
  duration: number;
  participants?: any[];
}

function formatMessageTime(value?: string | null) {
  if (!value) return "";
  try {
    return format(parseISO(value), "HH:mm");
  } catch {
    return "";
  }
}

export default function ChatAndMeetingsPage() {
  const [message, setMessage] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [isEnsuringThread, setIsEnsuringThread] = useState(false);
  const [selectedMeetingDate, setSelectedMeetingDate] = useState<Date | undefined>(undefined);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { currentCompanyName } = useChairmanContext();
  const [, setLocation] = useLocation();
  const assistantHeaders = { "x-chairman-admin-override": "1" };

  const threadQuery = useQuery<{ thread: AssistantThread }>({
    queryKey: ["/api/assistant/thread", "chat-meetings"],
    queryFn: () =>
      apiRequest("/api/assistant/thread", {
        method: "POST",
        headers: assistantHeaders,
        body: JSON.stringify({}),
      }),
  });

  useEffect(() => {
    const resolved = Number(threadQuery.data?.thread?.id || 0) || null;
    if (resolved && !activeThreadId) {
      setActiveThreadId(resolved);
    }
  }, [threadQuery.data?.thread?.id, activeThreadId]);

  const messageQueryKeyForThread = (threadId: number | null) =>
    ["/api/assistant/thread", threadId, "messages", "chat-meetings"] as const;
  const messagesQueryKey = messageQueryKeyForThread(activeThreadId);

  const messagesQuery = useQuery<{ messages: AssistantMessage[] }>({
    queryKey: messagesQueryKey,
    queryFn: () =>
      apiRequest(`/api/assistant/thread/${activeThreadId}/messages?limit=120`, {
        headers: assistantHeaders,
      }),
    enabled: Boolean(activeThreadId),
    refetchInterval: activeThreadId ? 15_000 : false,
  });

  const { data: meetings = [], isLoading: isLoadingMeetings } = useQuery<Meeting[]>({
    queryKey: ["/api/meetings"],
  });

  const ensureThreadReady = useCallback(async () => {
    const existing = Number(activeThreadId || 0);
    if (existing > 0) return existing;

    setIsEnsuringThread(true);
    try {
      const payload = await apiRequest("/api/assistant/thread", {
        method: "POST",
        headers: assistantHeaders,
        body: JSON.stringify({}),
      });
      const resolved = Number(payload?.thread?.id || 0);
      if (!resolved) throw new Error("Thread unavailable. Please retry.");
      setActiveThreadId(resolved);
      queryClient.setQueryData(["/api/assistant/thread", "chat-meetings"], payload);
      return resolved;
    } finally {
      setIsEnsuringThread(false);
    }
  }, [activeThreadId, assistantHeaders, queryClient]);

  const sendMessageMutation = useMutation({
    mutationFn: async (payload: { content: string; threadId: number }) => {
      return await apiRequest("/api/assistant/message", {
        method: "POST",
        headers: assistantHeaders,
        body: JSON.stringify({
          threadId: payload.threadId,
          content: payload.content,
          metadata: {
            source: "chat-and-meetings",
          },
        }),
      });
    },
    onMutate: async ({ content, threadId }) => {
      const optimisticQueryKey = messageQueryKeyForThread(threadId);
      await queryClient.cancelQueries({ queryKey: optimisticQueryKey });
      const previous = queryClient.getQueryData<{ messages: AssistantMessage[] }>(optimisticQueryKey);
      const optimisticMessage: AssistantMessage = {
        id: -Date.now(),
        content,
        senderType: "user",
        senderName: user?.displayName || "You",
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<{ messages: AssistantMessage[] }>(optimisticQueryKey, (current) => ({
        ...(current || { messages: [] }),
        messages: [...(Array.isArray(current?.messages) ? current.messages : []), optimisticMessage],
      }));
      setMessage("");
      return { previous, queryKey: optimisticQueryKey };
    },
    onSuccess: (payload: any, _variables, context) => {
      const queryKey = context?.queryKey || messagesQueryKey;
      const assistantMessage = payload?.assistantMessage;
      if (assistantMessage && typeof assistantMessage === "object") {
        queryClient.setQueryData<{ messages: AssistantMessage[] }>(queryKey, (current) => ({
          ...(current || { messages: [] }),
          messages: [
            ...(Array.isArray(current?.messages) ? current.messages.filter((entry) => Number(entry.id) > 0) : []),
            assistantMessage as AssistantMessage,
          ],
        }));
      }
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error, _content, context) => {
      if (context?.previous && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
      console.error("[ChatAndMeetings] send message failed", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const handleSend = () => {
    void (async () => {
      const content = message.trim();
      if (!content || sendMessageMutation.isPending) return;
      let threadId: number;
      try {
        threadId = await ensureThreadReady();
      } catch (error: any) {
        toast({
          title: "Chat not ready",
          description: error?.message || "Thread is still loading. Retry in a moment.",
          variant: "destructive",
        });
        return;
      }
      sendMessageMutation.mutate({ content, threadId });
    })();
  };

  useEffect(() => {
    if (scrollAreaRef.current && messagesQuery.data?.messages) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        (scrollElement as HTMLElement).scrollTop = (scrollElement as HTMLElement).scrollHeight;
      }
    }
  }, [messagesQuery.data?.messages]);

  const messages = messagesQuery.data?.messages || [];
  const contextLabel = currentCompanyName || "your platform";

  const upcomingMeetings = meetings
    .filter((m) => m.status === "scheduled" || m.status === "in_progress")
    .filter((m) => isFuture(parseISO(m.startTime)) || isToday(parseISO(m.startTime)))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const meetingsOnSelectedDate = selectedMeetingDate
    ? meetings.filter((m) => {
        const meetingDate = parseISO(m.startTime);
        return (
          meetingDate.getDate() === selectedMeetingDate.getDate() &&
          meetingDate.getMonth() === selectedMeetingDate.getMonth() &&
          meetingDate.getFullYear() === selectedMeetingDate.getFullYear()
        );
      })
    : [];

  const getMeetingStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      scheduled: { variant: "outline", label: "Scheduled" },
      in_progress: { variant: "default", label: "In Progress" },
      completed: { variant: "secondary", label: "Completed" },
      cancelled: { variant: "destructive", label: "Cancelled" },
    };
    const config = variants[status] || variants.scheduled;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const datesWithMeetings = meetings
    .filter((m) => m.status !== "cancelled")
    .map((m) => parseISO(m.startTime));

  return (
    <div className="h-[calc(100vh-4rem)] flex bg-gray-950">
      <div className="flex-1 flex flex-col border-r border-gray-800">
        <div className="h-16 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-blue-400" />
            <div>
              <h2 className="text-base font-semibold text-white">{threadQuery.data?.thread?.assistantDisplayName || "Chairman Assistant"}</h2>
              <p className="text-xs text-gray-400">Chat about {contextLabel}</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {isToday(new Date()) ? "Today" : format(new Date(), "MMM d, yyyy")}
          </Badge>
        </div>

        <ScrollArea ref={scrollAreaRef} className="flex-1 px-6 py-4">
          <div className="max-w-4xl mx-auto space-y-4">
            {messages.length === 0 && !messagesQuery.isLoading && (
              <div className="flex flex-col items-center justify-center h-[400px] text-center space-y-3">
                <MessageSquare className="h-16 w-16 text-gray-600" />
                <h3 className="text-lg font-medium text-gray-300">Your Strategic Assistant</h3>
                <p className="text-sm text-gray-500 max-w-md">
                  Ask for plans, priorities, actions, and next steps for {contextLabel}.
                </p>
              </div>
            )}

            {messages.map((msg) => {
              const isAssistant = msg.senderType === "assistant" || msg.senderType === "system";
              return (
                <div
                  key={msg.id}
                  className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`
                      max-w-[75%] rounded-lg p-4 shadow-lg
                      ${isAssistant
                        ? "bg-gray-800/90 border border-gray-700/50"
                        : "bg-blue-600/90 text-white"
                      }
                    `}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium">
                        {msg.senderName || (isAssistant ? threadQuery.data?.thread?.assistantDisplayName || "Assistant" : user?.displayName || "You")}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatMessageTime(msg.createdAt)}
                      </span>
                    </div>
                    <div className={`text-sm leading-relaxed whitespace-pre-wrap ${isAssistant ? "text-white/90" : "text-white"}`}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              );
            })}

            {(messagesQuery.isLoading || threadQuery.isLoading) && (
              <div className="flex justify-center my-4">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            )}
          </div>
        </ScrollArea>

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
                placeholder={activeThreadId ? `Ask your assistant about ${contextLabel}...` : `Ask your assistant about ${contextLabel}... (thread auto-creates)`}
                disabled={isEnsuringThread}
                className="flex-1 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                autoFocus
              />
              <Button
                type="submit"
                disabled={!message.trim() || sendMessageMutation.isPending || isEnsuringThread}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6"
              >
                {sendMessageMutation.isPending || isEnsuringThread ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>

      <div className="w-[400px] flex flex-col bg-gray-900/30">
        <div className="h-16 border-b border-gray-800 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-blue-400" />
            <h3 className="text-base font-semibold text-white">Meetings</h3>
          </div>
          <Button
            size="sm"
            onClick={() => setLocation("/meetings")}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
        </div>

        <div className="p-4 border-b border-gray-800">
          <Calendar
            mode="single"
            selected={selectedMeetingDate}
            onSelect={setSelectedMeetingDate}
            className="rounded-md border border-gray-800"
            modifiers={{
              hasMeeting: datesWithMeetings,
            }}
            modifiersStyles={{
              hasMeeting: {
                fontWeight: "bold",
                textDecoration: "underline",
                color: "#60a5fa",
              },
            }}
          />
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {selectedMeetingDate ? (
              <>
                <div className="text-sm font-medium text-gray-300 mb-3">
                  {format(selectedMeetingDate, "MMMM d, yyyy")}
                </div>
                {meetingsOnSelectedDate.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">
                    No meetings on this date
                  </p>
                ) : (
                  meetingsOnSelectedDate.map((meeting) => (
                    <Card
                      key={meeting.id}
                      className="bg-gray-800/50 border-gray-700 hover:bg-gray-800 transition-colors cursor-pointer"
                      onClick={() => setLocation(`/meetings/${meeting.id}`)}
                    >
                      <CardHeader className="p-4 pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-sm font-medium text-white">
                            {meeting.title}
                          </CardTitle>
                          {getMeetingStatusBadge(meeting.status)}
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 pt-0 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <Clock className="h-3 w-3" />
                          {format(parseISO(meeting.startTime), "h:mm a")}
                          {meeting.duration && ` | ${meeting.duration} min`}
                        </div>
                        {meeting.participants && meeting.participants.length > 0 && (
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <Users className="h-3 w-3" />
                            {meeting.participants.length} participant{meeting.participants.length !== 1 ? "s" : ""}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </>
            ) : (
              <>
                <div className="text-sm font-medium text-gray-300 mb-3">
                  Upcoming Meetings
                </div>
                {upcomingMeetings.length === 0 && !isLoadingMeetings ? (
                  <p className="text-sm text-gray-500 text-center py-8">
                    No upcoming meetings
                  </p>
                ) : (
                  upcomingMeetings.slice(0, 10).map((meeting) => (
                    <Card
                      key={meeting.id}
                      className="bg-gray-800/50 border-gray-700 hover:bg-gray-800 transition-colors cursor-pointer"
                      onClick={() => setLocation(`/meetings/${meeting.id}`)}
                    >
                      <CardHeader className="p-4 pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-sm font-medium text-white">
                            {meeting.title}
                          </CardTitle>
                          {getMeetingStatusBadge(meeting.status)}
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 pt-0 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <Clock className="h-3 w-3" />
                          {format(parseISO(meeting.startTime), "MMM d, h:mm a")}
                          {meeting.duration && ` | ${meeting.duration} min`}
                        </div>
                        {meeting.participants && meeting.participants.length > 0 && (
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <Users className="h-3 w-3" />
                            {meeting.participants.length} participant{meeting.participants.length !== 1 ? "s" : ""}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
