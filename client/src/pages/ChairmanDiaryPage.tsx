import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/hooks/use-user";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar,
  MessageSquare,
  Sparkles,
  TrendingUp,
  Brain,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, subMonths, addMonths } from "date-fns";

interface ChairmanMessage {
  id: number;
  chatDayId: number;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: any;
}

interface DailySummary {
  id: number;
  chatDayId: number;
  summaryText: string;
  keyDecisions: string[];
  keyTopics: string[];
  actionItems: string[];
  metadata?: any;
}

interface MemoryFact {
  id: number;
  type: 'decision' | 'preference' | 'context' | 'goal';
  content: string;
  importance: 'high' | 'medium' | 'low';
  createdAt: string;
}

interface ChatDay {
  id: number;
  userId: number;
  companyId: number | null;
  date: string;
  messageCount: number;
  messages?: ChairmanMessage[];
  summary?: DailySummary;
  metadata?: any;
}

export default function ChairmanDiaryPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const { data: allDays = [], isLoading: isLoadingDays } = useQuery<ChatDay[]>({
    queryKey: ['/api/chairman/chat/days', user?.id],
  });

  const { data: selectedDayChat, isLoading: isLoadingDay } = useQuery<ChatDay>({
    queryKey: ['/api/chairman/chat', selectedDate, user?.id],
    enabled: !!selectedDate,
  });

  const { data: memoryFacts = [] } = useQuery<MemoryFact[]>({
    queryKey: ['/api/chairman/memory', user?.id],
  });

  const generateSummaryMutation = useMutation({
    mutationFn: async (chatDayId: number) => {
      return await apiRequest(`/api/chairman/summary/generate`, {
        method: 'POST',
        body: JSON.stringify({ chatDayId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chairman/chat/days'] });
      if (selectedDate) {
        queryClient.invalidateQueries({ queryKey: ['/api/chairman/chat', selectedDate] });
      }
      toast({
        title: "Summary Generated",
        description: "Daily summary and insights have been created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate summary",
        variant: "destructive",
      });
    },
  });

  const daysWithChats = new Set(allDays.map(day => day.date));
  
  const calendarDays = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const handleDateSelect = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    if (daysWithChats.has(dateStr)) {
      setSelectedDate(dateStr);
    }
  };

  const highPriorityMemories = memoryFacts.filter(m => m.importance === 'high');
  const totalMessages = allDays.reduce((sum, day) => sum + day.messageCount, 0);
  const daysWithSummaries = allDays.filter(day => day.summary).length;

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <BookOpen className="h-8 w-8 text-blue-400" />
          Chairman's Daily Diary
        </h1>
        <p className="text-gray-400">
          Your conversations, decisions, and insights organized by day with AI-powered memory
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2 text-gray-400">
              <Calendar className="h-4 w-4" />
              Total Days
            </CardDescription>
            <CardTitle className="text-2xl text-white">{allDays.length}</CardTitle>
          </CardHeader>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2 text-gray-400">
              <MessageSquare className="h-4 w-4" />
              Total Messages
            </CardDescription>
            <CardTitle className="text-2xl text-white">{totalMessages}</CardTitle>
          </CardHeader>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2 text-gray-400">
              <Sparkles className="h-4 w-4" />
              Summaries
            </CardDescription>
            <CardTitle className="text-2xl text-white">{daysWithSummaries}</CardTitle>
          </CardHeader>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2 text-gray-400">
              <Brain className="h-4 w-4" />
              Key Memories
            </CardDescription>
            <CardTitle className="text-2xl text-white">{highPriorityMemories.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-gray-800 border-gray-700 lg:col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-white flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-400" />
                Calendar
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-white font-medium min-w-[120px] text-center">
                  {format(currentMonth, 'MMMM yyyy')}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-xs text-gray-400 text-center font-medium p-2">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, idx) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const hasChat = daysWithChats.has(dateStr);
                const isTodayDate = isToday(day);
                const isSelected = selectedDate === dateStr;
                
                return (
                  <button
                    key={idx}
                    onClick={() => handleDateSelect(day)}
                    disabled={!hasChat}
                    className={`
                      p-2 text-sm rounded-md transition-colors
                      ${hasChat ? 'cursor-pointer hover:bg-gray-700' : 'cursor-default opacity-40'}
                      ${isSelected ? 'bg-blue-600 text-white' : isTodayDate ? 'bg-gray-700 text-blue-400 font-bold' : 'text-gray-300'}
                      ${hasChat && !isSelected ? 'bg-gray-900/50' : ''}
                    `}
                  >
                    <div className="text-center">{format(day, 'd')}</div>
                    {hasChat && !isSelected && (
                      <div className="h-1 w-1 bg-blue-400 rounded-full mx-auto mt-1"></div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-blue-400" />
                {selectedDate ? format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy') : 'Select a date'}
              </span>
              {selectedDayChat && !selectedDayChat.summary && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateSummaryMutation.mutate(selectedDayChat.id)}
                  disabled={generateSummaryMutation.isPending}
                >
                  {generateSummaryMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Generate Summary
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedDate ? (
              <div className="flex flex-col items-center justify-center h-96 text-center space-y-3">
                <Calendar className="h-16 w-16 text-gray-600" />
                <h3 className="text-lg font-medium text-gray-300">Select a Date</h3>
                <p className="text-sm text-gray-500 max-w-md">
                  Choose a day from the calendar to view your conversations and insights
                </p>
              </div>
            ) : isLoadingDay ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full bg-gray-700" />
                <Skeleton className="h-32 w-full bg-gray-700" />
                <Skeleton className="h-32 w-full bg-gray-700" />
              </div>
            ) : selectedDayChat ? (
              <div className="space-y-6">
                {selectedDayChat.summary && (
                  <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-blue-400" />
                      Daily Summary
                    </h4>
                    <p className="text-sm text-gray-300 mb-4">{selectedDayChat.summary.summaryText}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedDayChat.summary.keyDecisions.length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-2">
                            <TrendingUp className="h-3 w-3" />
                            Key Decisions
                          </h5>
                          <ul className="text-xs text-gray-300 space-y-1">
                            {selectedDayChat.summary.keyDecisions.map((decision, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-blue-400">•</span>
                                <span>{decision}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {selectedDayChat.summary.keyTopics.length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium text-gray-400 mb-2">Topics Discussed</h5>
                          <div className="flex flex-wrap gap-1">
                            {selectedDayChat.summary.keyTopics.map((topic, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {topic}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {selectedDayChat.summary.actionItems.length > 0 && (
                      <div className="mt-4">
                        <h5 className="text-xs font-medium text-gray-400 mb-2">Action Items</h5>
                        <ul className="text-xs text-gray-300 space-y-1">
                          {selectedDayChat.summary.actionItems.map((item, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-green-400">✓</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-blue-400" />
                    Conversation ({selectedDayChat.messageCount} messages)
                  </h4>
                  <ScrollArea className="h-96 rounded-md border border-gray-700 p-4">
                    <div className="space-y-4">
                      {selectedDayChat.messages?.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.sender === 'assistant' ? "justify-start" : "justify-end"}`}
                        >
                          <div
                            className={`
                              max-w-[80%] rounded-lg p-3 shadow-lg
                              ${msg.sender === 'assistant'
                                ? "bg-gray-900 border border-gray-700" 
                                : "bg-blue-600 text-white"
                              }
                            `}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-medium">
                                {msg.sender === 'assistant' ? "Chairman Assistant" : "You"}
                              </span>
                              <span className="text-xs text-gray-400">
                                {format(parseISO(msg.timestamp), "HH:mm")}
                              </span>
                            </div>
                            <div className="text-sm leading-relaxed whitespace-pre-wrap">
                              {msg.content}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700 lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Brain className="h-5 w-5 text-blue-400" />
              Long-Term Memory
            </CardTitle>
            <CardDescription className="text-gray-400">
              Important facts and context extracted from your conversations
            </CardDescription>
          </CardHeader>
          <CardContent>
            {memoryFacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center space-y-2">
                <Brain className="h-10 w-10 text-gray-600" />
                <p className="text-sm text-gray-500">
                  No memories yet. Generate daily summaries to extract key insights.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {memoryFacts.map((fact) => (
                  <div
                    key={fact.id}
                    className={`
                      p-3 rounded-lg border
                      ${fact.importance === 'high' ? 'bg-blue-900/20 border-blue-700' : 
                        fact.importance === 'medium' ? 'bg-gray-900/50 border-gray-700' : 
                        'bg-gray-900/30 border-gray-800'}
                    `}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <Badge variant="outline" className="text-xs">
                        {fact.type}
                      </Badge>
                      <Badge
                        variant={fact.importance === 'high' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {fact.importance}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-300">{fact.content}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      {format(parseISO(fact.createdAt), 'MMM d, yyyy')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
