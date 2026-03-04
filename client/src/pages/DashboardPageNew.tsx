import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign,
  Users,
  CheckCircle2,
  TrendingUp,
  MessageSquare,
  Calendar as CalendarIcon,
  Clock,
  ArrowRight,
  Building2,
  Briefcase,
  ShoppingCart,
  FileText,
  Shield
} from "lucide-react";
import { format, isToday, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { useLocation } from "wouter";

interface Conversation {
  id: string;
  date: string;
  title: string;
  type: string;
  status: string;
  participants: any[];
  startTime?: string;
  endTime?: string;
  metadata?: {
    categories?: string[];
    decisions?: string[];
    actions?: string[];
    startTime?: string;
    money?: {
      revenue?: number;
      pipeline?: number;
      cost?: number;
    };
  };
}

type ConversationsByDate = Record<string, Conversation[]>;

const CATEGORIES = [
  { id: "strategy", label: "Strategy", icon: TrendingUp, color: "text-purple-400" },
  { id: "sales", label: "Sales & Business Development", icon: ShoppingCart, color: "text-green-400" },
  { id: "marketing", label: "Marketing", icon: Briefcase, color: "text-blue-400" },
  { id: "finance", label: "Finance", icon: DollarSign, color: "text-yellow-400" },
  { id: "operations", label: "Operations", icon: Building2, color: "text-orange-400" },
  { id: "compliance", label: "Compliance & Legal", icon: Shield, color: "text-red-400" },
  { id: "product", label: "Product & Tech", icon: FileText, color: "text-indigo-400" },
  { id: "agent-sync", label: "Agent-only Syncs", icon: Users, color: "text-gray-400" },
];

export default function DashboardPageNew() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [dateRange, setDateRange] = useState<"today" | "week" | "month">("today");
  const [, setLocation] = useLocation();

  const { data: conversationsByDate } = useQuery<ConversationsByDate>({
    queryKey: ["/api/conversations/by-date"],
  });

  // Calculate KPIs based on date range
  const getDateRangeConversations = () => {
    if (!conversationsByDate) return [];
    
    const now = new Date();
    let startDate: Date, endDate: Date;

    switch (dateRange) {
      case "today":
        startDate = endDate = now;
        break;
      case "week":
        startDate = startOfWeek(now);
        endDate = endOfWeek(now);
        break;
      case "month":
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
        break;
      default:
        startDate = endDate = now;
    }

    const conversations: Conversation[] = [];
    Object.entries(conversationsByDate).forEach(([date, convs]) => {
      const convDate = parseISO(date);
      if (convDate >= startDate && convDate <= endDate) {
        conversations.push(...convs);
      }
    });

    return conversations;
  };

  const rangeConversations = getDateRangeConversations();

  const kpis = {
    revenue: rangeConversations.reduce((sum, conv) => 
      sum + (conv.metadata?.money?.revenue || 0), 0),
    meetings: rangeConversations.length,
    actions: rangeConversations.reduce((sum, conv) => 
      sum + (conv.metadata?.actions?.length || 0), 0),
    decisions: rangeConversations.reduce((sum, conv) => 
      sum + (conv.metadata?.decisions?.length || 0), 0),
    pipeline: rangeConversations.reduce((sum, conv) => 
      sum + (conv.metadata?.money?.pipeline || 0), 0),
  };

  // Get conversations for selected date
  const selectedDateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const selectedDayConversations = selectedDateStr && conversationsByDate 
    ? conversationsByDate[selectedDateStr] || []
    : [];

  // Group by category
  const conversationsByCategory = CATEGORIES.map(category => {
    const categoryConvs = selectedDayConversations.filter(conv =>
      conv.metadata?.categories?.includes(category.id) ||
      (category.id === "agent-sync" && conv.type === "agent-sync")
    );

    const categoryKpis = {
      meetings: categoryConvs.length,
      actions: categoryConvs.reduce((sum, conv) => sum + (conv.metadata?.actions?.length || 0), 0),
      revenue: categoryConvs.reduce((sum, conv) => sum + (conv.metadata?.money?.revenue || 0), 0),
    };

    return {
      ...category,
      conversations: categoryConvs,
      kpis: categoryKpis,
    };
  }).filter(cat => cat.conversations.length > 0);

  // Dates with activity for calendar highlighting
  const datesWithActivity = conversationsByDate 
    ? Object.keys(conversationsByDate).map(d => parseISO(d))
    : [];

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="container mx-auto p-6 space-y-6 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Dashboard</h1>
            <p className="text-gray-400 mt-1">Your business intelligence control tower</p>
          </div>
          
          {/* Date Range Selector */}
          <Tabs value={dateRange} onValueChange={(v: any) => setDateRange(v)}>
            <TabsList className="bg-gray-800">
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="week">This Week</TabsTrigger>
              <TabsTrigger value="month">This Month</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* KPI Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-400">Revenue Generated</CardTitle>
                <DollarSign className="h-4 w-4 text-green-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">${kpis.revenue.toLocaleString()}</div>
              <p className="text-xs text-gray-500 mt-1">
                ${kpis.pipeline.toLocaleString()} pipeline
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-400">Meetings Held</CardTitle>
                <Users className="h-4 w-4 text-blue-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{kpis.meetings}</div>
              <p className="text-xs text-gray-500 mt-1">Conversations & meetings</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-400">Actions Executed</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-purple-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{kpis.actions}</div>
              <p className="text-xs text-gray-500 mt-1">Tasks, emails, follow-ups</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-400">Decisions Made</CardTitle>
                <TrendingUp className="h-4 w-4 text-yellow-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{kpis.decisions}</div>
              <p className="text-xs text-gray-500 mt-1">Strategic decisions</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-400">Active Today</CardTitle>
                <MessageSquare className="h-4 w-4 text-orange-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {selectedDayConversations.filter(c => c.status === 'ongoing').length}
              </div>
              <p className="text-xs text-gray-500 mt-1">Ongoing conversations</p>
            </CardContent>
          </Card>
        </div>

        {/* Calendar Widget */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-blue-400" />
              Activity Calendar
            </CardTitle>
            <CardDescription>Click a date to see conversations and outcomes</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              className="rounded-md border border-gray-800"
              modifiers={{
                hasActivity: datesWithActivity,
              }}
              modifiersStyles={{
                hasActivity: {
                  fontWeight: "bold",
                  backgroundColor: "rgba(59, 130, 246, 0.2)",
                  color: "#60a5fa",
                },
              }}
            />
          </CardContent>
        </Card>

        {/* Daily Log - Grouped by Category */}
        {selectedDate && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">
                {isToday(selectedDate) ? "Today's Activity" : format(selectedDate, "MMMM d, yyyy")}
              </h2>
              {selectedDayConversations.length > 0 && (
                <Badge variant="outline" className="text-sm">
                  {selectedDayConversations.length} conversation{selectedDayConversations.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>

            {conversationsByCategory.length === 0 ? (
              <Card className="bg-gray-900 border-gray-800">
                <CardContent className="py-12 text-center">
                  <CalendarIcon className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-300">No Activity</h3>
                  <p className="text-gray-500 mt-2">
                    No conversations or meetings on this date
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {conversationsByCategory.map((category) => {
                  const Icon = category.icon;
                  return (
                    <Card key={category.id} className="bg-gray-900 border-gray-800">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Icon className={`h-5 w-5 ${category.color}`} />
                            <CardTitle className="text-white">{category.label}</CardTitle>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-400">
                            <span>{category.kpis.meetings} meeting{category.kpis.meetings !== 1 ? 's' : ''}</span>
                            {category.kpis.actions > 0 && (
                              <span>{category.kpis.actions} action{category.kpis.actions !== 1 ? 's' : ''}</span>
                            )}
                            {category.kpis.revenue > 0 && (
                              <span className="text-green-400 font-medium">
                                ${category.kpis.revenue.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {category.conversations.map((conv) => (
                          <Card key={conv.id} className="bg-gray-800/50 border-gray-700">
                            <CardContent className="p-4">
                              <div className="space-y-3">
                                {/* Conversation Header */}
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <h4 className="text-sm font-medium text-white mb-1">
                                      {conv.title}
                                    </h4>
                                    <div className="flex items-center gap-3 text-xs text-gray-400">
                                      <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {conv.metadata?.startTime 
                                          ? format(parseISO(conv.metadata.startTime), "h:mm a")
                                          : "Time not set"}
                                      </span>
                                      {conv.participants && conv.participants.length > 0 && (
                                        <span className="flex items-center gap-1">
                                          <Users className="h-3 w-3" />
                                          {conv.participants.length} participant{conv.participants.length !== 1 ? 's' : ''}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <Badge variant={conv.status === 'completed' ? 'secondary' : 'default'}>
                                    {conv.status}
                                  </Badge>
                                </div>

                                {/* Decisions */}
                                {conv.metadata?.decisions && conv.metadata.decisions.length > 0 && (
                                  <div>
                                    <h5 className="text-xs font-semibold text-gray-400 mb-2">Decisions:</h5>
                                    <ul className="space-y-1">
                                      {conv.metadata.decisions.map((decision, idx) => (
                                        <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                                          <span className="text-blue-400 mt-0.5">•</span>
                                          <span>{decision}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {/* Actions */}
                                {conv.metadata?.actions && conv.metadata.actions.length > 0 && (
                                  <div>
                                    <h5 className="text-xs font-semibold text-gray-400 mb-2">Actions Executed:</h5>
                                    <ul className="space-y-1">
                                      {conv.metadata.actions.map((action, idx) => (
                                        <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                                          <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                                          <span>{action}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {/* Money Impact */}
                                {conv.metadata?.money && (conv.metadata.money.revenue || conv.metadata.money.pipeline) && (
                                  <div className="flex items-center gap-4 text-sm">
                                    {conv.metadata.money.revenue && (
                                      <div className="flex items-center gap-1 text-green-400">
                                        <DollarSign className="h-4 w-4" />
                                        <span className="font-medium">
                                          ${conv.metadata.money.revenue.toLocaleString()} revenue
                                        </span>
                                      </div>
                                    )}
                                    {conv.metadata.money.pipeline && (
                                      <div className="flex items-center gap-1 text-blue-400">
                                        <TrendingUp className="h-4 w-4" />
                                        <span>
                                          ${conv.metadata.money.pipeline.toLocaleString()} pipeline
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-2 pt-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setLocation(`/meetings`)}
                                    className="flex-1"
                                  >
                                    Open Conversation
                                    <ArrowRight className="h-3 w-3 ml-1" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
