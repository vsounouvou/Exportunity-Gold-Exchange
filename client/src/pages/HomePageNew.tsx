import { useState } from "react";
import { useUser } from "@/hooks/use-user";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar as CalendarWidget } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Building2, 
  Users, 
  Calendar, 
  TrendingUp,
  Activity,
  DollarSign,
  CheckCircle2,
  MessageSquare,
  Clock,
  ArrowRight,
  Briefcase,
  ShoppingCart,
  FileText,
  Shield
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { ChairmanChatDock } from "@/components/ChairmanChatDock";
import { CreateCompanyDialog } from "@/components/CreateCompanyDialog";
import { useChairmanContext } from "@/hooks/use-chairman-context";
import { Agent } from "@db/schema";
import { format, isToday, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

type Company = {
  id: number;
  name: string;
  monthlyBudget: number;
  budgetUsed: number;
  status: string;
  agents?: any[];
};

type Meeting = {
  id: number;
  title: string;
  status: string;
  scheduledAt: string;
};

type Message = {
  id: number;
  content: string;
  agentId: number | null;
  createdAt: string;
};

interface Conversation {
  id: string;
  date: string;
  title: string;
  type: string;
  status: string;
  participants: any[];
  startTime?: string;
  endTime?: string;
  companyId?: number;
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

export function HomePageNew() {
  const { user } = useUser();
  const { setCurrentCompanyId, setCurrentCompanyName } = useChairmanContext();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<"today" | "week" | "month">("today");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [, setLocation] = useLocation();

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: meetings = [] } = useQuery<Meeting[]>({
    queryKey: ["/api/meetings"],
  });

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: recentMessages = [] } = useQuery<Message[]>({
    queryKey: ["/api/messages/recent"],
  });

  const { data: conversationsByDate } = useQuery<ConversationsByDate>({
    queryKey: ["/api/conversations/by-date"],
  });

  const isAllCompanies = selectedCompanyId === null || selectedCompanyId === "all";

  // Filter conversations by company
  const filterByCompany = (conversations: Conversation[]) => {
    if (isAllCompanies) return conversations;
    return conversations.filter(c => c.companyId?.toString() === selectedCompanyId);
  };

  // Get conversations for date range
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
        conversations.push(...filterByCompany(convs));
      }
    });

    return conversations;
  };

  const rangeConversations = getDateRangeConversations();

  // Calculate KPIs
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

  // Get selected day conversations
  const selectedDateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const selectedDayConversations = selectedDateStr && conversationsByDate 
    ? filterByCompany(conversationsByDate[selectedDateStr] || [])
    : [];

  // Group by category
  const conversationsByCategory = CATEGORIES.map(category => {
    const categoryConvs = selectedDayConversations.filter(conv =>
      conv.metadata?.categories?.includes(category.id) ||
      (category.id === "agent-sync" && conv.type === "agent-sync")
    );

    return {
      ...category,
      conversations: categoryConvs,
      kpis: {
        meetings: categoryConvs.length,
        actions: categoryConvs.reduce((sum, conv) => sum + (conv.metadata?.actions?.length || 0), 0),
        revenue: categoryConvs.reduce((sum, conv) => sum + (conv.metadata?.money?.revenue || 0), 0),
      },
    };
  }).filter(cat => cat.conversations.length > 0);

  // Dates with activity
  const datesWithActivity = conversationsByDate 
    ? Object.keys(conversationsByDate).map(d => parseISO(d))
    : [];

  // Calculate company-specific KPIs
  const getCompanyKPIs = (companyId: number) => {
    const companyConvs = rangeConversations.filter(c => c.companyId === companyId);
    return {
      revenue: companyConvs.reduce((sum, conv) => sum + (conv.metadata?.money?.revenue || 0), 0),
      meetings: companyConvs.length,
      actions: companyConvs.reduce((sum, conv) => sum + (conv.metadata?.actions?.length || 0), 0),
      decisions: companyConvs.reduce((sum, conv) => sum + (conv.metadata?.decisions?.length || 0), 0),
    };
  };

  const totalAgents = companies.reduce((sum, c) => sum + (c.agents?.length || 0), 0);
  const activeCompanies = companies.filter(c => c.status === "active").length;
  const totalBudgetUsed = companies.reduce((sum, c) => {
    const budget = Number(c.budgetUsed) || 0;
    return sum + budget;
  }, 0);

  return (
    <div className="min-h-screen bg-gray-950 pb-24">
      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4 sm:space-y-6">
        {/* Company Selector */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Dashboard</h1>
            <p className="text-gray-400 mt-1 text-sm md:text-base">Welcome back, {user?.displayName || "Chairman"}</p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-sm text-gray-400 whitespace-nowrap">View:</span>
              <Select value={selectedCompanyId || "all"} onValueChange={setSelectedCompanyId}>
                <SelectTrigger className="w-full sm:w-[240px] bg-gray-900 border-gray-800">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Companies</SelectItem>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id.toString()}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Tabs value={dateRange} onValueChange={(v: any) => setDateRange(v)} className="w-full sm:w-auto">
              <TabsList className="bg-gray-800 w-full sm:w-auto">
                <TabsTrigger value="today" className="flex-1 sm:flex-none">Today</TabsTrigger>
                <TabsTrigger value="week" className="flex-1 sm:flex-none">Week</TabsTrigger>
                <TabsTrigger value="month" className="flex-1 sm:flex-none">Month</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* KPI Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors cursor-pointer">
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

          <Card className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors cursor-pointer">
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

          <Card className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors cursor-pointer">
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

          <Card className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors cursor-pointer">
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

          <Card className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors cursor-pointer">
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

        {/* Calendar Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-400" />
                  Activity Calendar
                </CardTitle>
                <CardDescription>Click a date to see daily activity</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center">
                <CalendarWidget
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
          </div>

          <div className="lg:col-span-8">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">
                  {isToday(selectedDate || new Date()) ? "Today's Activity" : format(selectedDate || new Date(), "MMMM d, yyyy")}
                </CardTitle>
                <CardDescription>
                  {conversationsByCategory.length} categor{conversationsByCategory.length !== 1 ? 'ies' : 'y'} with activity
                </CardDescription>
              </CardHeader>
              <CardContent>
                {conversationsByCategory.length === 0 ? (
                  <div className="py-12 text-center">
                    <Calendar className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-300">No Activity</h3>
                    <p className="text-gray-500 mt-2">No conversations or meetings on this date</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {conversationsByCategory.map((category) => {
                      const Icon = category.icon;
                      return (
                        <div key={category.id} className="border-l-4 border-blue-500 pl-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Icon className={`h-4 w-4 ${category.color}`} />
                            <span className="font-medium text-white">{category.label}</span>
                            <Badge variant="outline" className="ml-auto">
                              {category.kpis.meetings} meeting{category.kpis.meetings !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                          
                          <div className="space-y-2">
                            {category.conversations.slice(0, 2).map((conv) => (
                              <Card key={conv.id} className="bg-gray-800/50 border-gray-700">
                                <CardContent className="p-3">
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1">
                                      <h4 className="text-sm font-medium text-white">{conv.title}</h4>
                                      <p className="text-xs text-gray-400 mt-1">
                                        {conv.participants.length} participant{conv.participants.length !== 1 ? 's' : ''}
                                      </p>
                                    </div>
                                    <Badge variant={conv.status === 'completed' ? 'secondary' : 'default'} className="text-xs">
                                      {conv.status}
                                    </Badge>
                                  </div>
                                  
                                  {conv.metadata?.decisions && conv.metadata.decisions.length > 0 && (
                                    <div className="text-xs text-gray-300 mb-2">
                                      <span className="font-semibold text-blue-400">Decisions:</span> {conv.metadata.decisions.length}
                                    </div>
                                  )}

                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 text-xs text-gray-400">
                                      {conv.metadata?.actions && conv.metadata.actions.length > 0 && (
                                        <span>{conv.metadata.actions.length} actions</span>
                                      )}
                                      {conv.metadata?.money?.revenue && (
                                        <span className="text-green-400">${conv.metadata.money.revenue.toLocaleString()}</span>
                                      )}
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setLocation('/meetings')}
                                      className="h-6 text-xs"
                                    >
                                      Open <ArrowRight className="h-3 w-3 ml-1" />
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Companies Section with Mini KPIs */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white">Companies</h2>
            <CreateCompanyDialog />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {companies.map((company) => {
              const companyKPIs = getCompanyKPIs(company.id);
              return (
                <Card 
                  key={company.id} 
                  className={cn(
                    "bg-gray-900 border-gray-800 hover:border-gray-700 transition-all cursor-pointer",
                    selectedCompanyId === company.id.toString() && "border-blue-500 bg-gray-800"
                  )}
                  onClick={() => {
                    setSelectedCompanyId(company.id.toString());
                    setCurrentCompanyId(company.id);
                    setCurrentCompanyName(company.name);
                  }}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 bg-gradient-to-br from-blue-500 to-purple-600">
                          <AvatarFallback className="text-white font-semibold">
                            {company.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <CardTitle className="text-white text-base">{company.name}</CardTitle>
                          <p className="text-xs text-gray-400 mt-1">
                            {company.agents?.length || 0} agents
                          </p>
                        </div>
                      </div>
                      <Badge variant={company.status === "active" ? "default" : "secondary"}>
                        {company.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-gray-400">Revenue</div>
                        <div className="text-lg font-bold text-green-400">
                          ${companyKPIs.revenue.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Meetings</div>
                        <div className="text-lg font-bold text-white">
                          {companyKPIs.meetings}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Actions</div>
                        <div className="text-lg font-bold text-white">
                          {companyKPIs.actions}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Decisions</div>
                        <div className="text-lg font-bold text-white">
                          {companyKPIs.decisions}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {companies.length === 0 && (
              <Card className="bg-gray-900 border-gray-800 col-span-full">
                <CardContent className="py-12 text-center">
                  <Building2 className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-300">No Companies Yet</h3>
                  <p className="text-gray-500 mt-2 mb-4">Create your first company to get started</p>
                  <CreateCompanyDialog />
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Quick Links */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link href="/meetings">
              <Button variant="outline" className="w-full justify-start">
                <Calendar className="h-4 w-4 mr-2" />
                View All Meetings
              </Button>
            </Link>
            <Link href="/hierarchy">
              <Button variant="outline" className="w-full justify-start">
                <Activity className="h-4 w-4 mr-2" />
                Org Hierarchy
              </Button>
            </Link>
            <Link href="/diagnostics">
              <Button variant="outline" className="w-full justify-start">
                <TrendingUp className="h-4 w-4 mr-2" />
                Performance
              </Button>
            </Link>
            <Link href="/hierarchy">
              <Button variant="outline" className="w-full justify-start">
                <Users className="h-4 w-4 mr-2" />
                Manage Agents
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
