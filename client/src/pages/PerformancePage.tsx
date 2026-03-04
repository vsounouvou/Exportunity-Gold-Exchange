import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { 
  TrendingUp, 
  TrendingDown,
  Activity,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  Zap,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Brain,
  MessageSquare,
  Calendar,
  RefreshCw,
  Download,
  Filter
} from "lucide-react";
import { useCompany } from "@/hooks/use-company";

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const mockDailyMetrics = [
  { date: 'Mon', tasks: 45, messages: 120, costs: 2.4 },
  { date: 'Tue', tasks: 52, messages: 145, costs: 2.8 },
  { date: 'Wed', tasks: 38, messages: 98, costs: 1.9 },
  { date: 'Thu', tasks: 67, messages: 189, costs: 3.2 },
  { date: 'Fri', tasks: 58, messages: 167, costs: 2.9 },
  { date: 'Sat', tasks: 23, messages: 56, costs: 1.1 },
  { date: 'Sun', tasks: 19, messages: 42, costs: 0.9 },
];

const mockHourlyActivity = [
  { hour: '00:00', activity: 5 },
  { hour: '02:00', activity: 3 },
  { hour: '04:00', activity: 2 },
  { hour: '06:00', activity: 8 },
  { hour: '08:00', activity: 25 },
  { hour: '10:00', activity: 45 },
  { hour: '12:00', activity: 38 },
  { hour: '14:00', activity: 52 },
  { hour: '16:00', activity: 48 },
  { hour: '18:00', activity: 35 },
  { hour: '20:00', activity: 22 },
  { hour: '22:00', activity: 12 },
];

const mockCostBreakdown = [
  { name: 'GPT-4', value: 45, color: '#22c55e' },
  { name: 'Claude', value: 35, color: '#3b82f6' },
  { name: 'GPT-3.5', value: 15, color: '#f59e0b' },
  { name: 'Other', value: 5, color: '#8b5cf6' },
];

interface AgentPerformance {
  id: number;
  name: string;
  role: string;
  department: string;
  tasksCompleted: number;
  responseTime: number;
  successRate: number;
  cost: number;
  messages: number;
  trend: 'up' | 'down' | 'stable';
}

const mockAgentPerformance: AgentPerformance[] = [
  { id: 1, name: "Chief Orchestrator", role: "Chief of Staff", department: "Executive", tasksCompleted: 156, responseTime: 1.2, successRate: 98, cost: 12.45, messages: 890, trend: 'up' },
  { id: 2, name: "Sales Director", role: "Sales Lead", department: "Sales", tasksCompleted: 234, responseTime: 0.8, successRate: 95, cost: 18.32, messages: 1245, trend: 'up' },
  { id: 3, name: "Marketing Manager", role: "Content Lead", department: "Marketing", tasksCompleted: 189, responseTime: 1.5, successRate: 92, cost: 15.67, messages: 876, trend: 'stable' },
  { id: 4, name: "Finance Director", role: "CFO", department: "Finance", tasksCompleted: 78, responseTime: 2.1, successRate: 99, cost: 8.90, messages: 432, trend: 'up' },
  { id: 5, name: "Support Agent", role: "Customer Success", department: "Support", tasksCompleted: 312, responseTime: 0.5, successRate: 94, cost: 22.15, messages: 2134, trend: 'down' },
];

export function PerformancePage() {
  const { selectedCompanyId } = useCompany();
  const [timeRange, setTimeRange] = useState("7d");
  const [activeTab, setActiveTab] = useState("overview");

  const { data: agents = [] } = useQuery<any[]>({
    queryKey: ["/api/agents"],
  });

  const { data: costData } = useQuery<any>({
    queryKey: ["/api/ai-costs/summary"],
  });

  const companyAgents = agents.filter(a => !selectedCompanyId || a.companyId === selectedCompanyId);
  const totalCost = costData?.totalCost || 45.67;
  const totalTasks = mockAgentPerformance.reduce((sum, a) => sum + a.tasksCompleted, 0);
  const avgResponseTime = mockAgentPerformance.reduce((sum, a) => sum + a.responseTime, 0) / mockAgentPerformance.length;
  const avgSuccessRate = mockAgentPerformance.reduce((sum, a) => sum + a.successRate, 0) / mockAgentPerformance.length;

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Activity className="h-6 w-6 text-blue-400" />
              Performance
            </h1>
            <p className="text-gray-400 mt-1">Monitor agent performance, costs, and platform health</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32 bg-gray-900 border-gray-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-800">
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="border-gray-700">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" size="icon" className="border-gray-700">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-4 mb-6">
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Active Agents</p>
                  <p className="text-2xl font-bold text-white">{companyAgents.length || 14}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 text-green-400 text-sm">
                <ArrowUpRight className="h-4 w-4" />
                <span>All online</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Tasks Completed</p>
                  <p className="text-2xl font-bold text-white">{totalTasks.toLocaleString()}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 text-green-400 text-sm">
                <ArrowUpRight className="h-4 w-4" />
                <span>+12% this week</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Avg Response</p>
                  <p className="text-2xl font-bold text-white">{avgResponseTime.toFixed(1)}s</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-purple-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 text-green-400 text-sm">
                <ArrowDownRight className="h-4 w-4" />
                <span>-0.3s faster</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Success Rate</p>
                  <p className="text-2xl font-bold text-white">{avgSuccessRate.toFixed(1)}%</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <Target className="h-5 w-5 text-orange-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 text-green-400 text-sm">
                <ArrowUpRight className="h-4 w-4" />
                <span>+2% improvement</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">AI Costs</p>
                  <p className="text-2xl font-bold text-white">${totalCost.toFixed(2)}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-red-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 text-yellow-400 text-sm">
                <ArrowUpRight className="h-4 w-4" />
                <span>On budget</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-gray-900 border border-gray-800">
            <TabsTrigger value="overview" className="data-[state=active]:bg-gray-800">Overview</TabsTrigger>
            <TabsTrigger value="agents" className="data-[state=active]:bg-gray-800">Agent Rankings</TabsTrigger>
            <TabsTrigger value="costs" className="data-[state=active]:bg-gray-800">Cost Analysis</TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-gray-800">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Weekly Performance Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={mockDailyMetrics}>
                      <defs>
                        <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="date" stroke="#9ca3af" />
                      <YAxis stroke="#9ca3af" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                        labelStyle={{ color: '#fff' }}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="tasks" stroke="#22c55e" fillOpacity={1} fill="url(#colorTasks)" name="Tasks" />
                      <Area type="monotone" dataKey="messages" stroke="#3b82f6" fillOpacity={1} fill="url(#colorMessages)" name="Messages" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-lg">AI Provider Usage</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={mockCostBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {mockCostBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                        formatter={(value: number) => [`${value}%`, 'Usage']}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white text-lg">Top Performing Agents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {mockAgentPerformance.slice(0, 5).map((agent, index) => (
                    <div key={agent.id} className="flex items-center gap-4">
                      <div className="w-8 text-center">
                        <span className={`text-lg font-bold ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-300' : index === 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                          #{index + 1}
                        </span>
                      </div>
                      <Avatar className="h-10 w-10 border-2 border-gray-700">
                        <AvatarFallback className="bg-blue-600 text-white text-sm">
                          {agent.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-white">{agent.name}</div>
                            <div className="text-sm text-gray-400">{agent.department}</div>
                          </div>
                          <div className="flex items-center gap-6 text-sm">
                            <div className="text-right">
                              <div className="text-gray-400">Tasks</div>
                              <div className="text-white font-medium">{agent.tasksCompleted}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-gray-400">Success</div>
                              <div className="text-green-400 font-medium">{agent.successRate}%</div>
                            </div>
                            <div className="text-right">
                              <div className="text-gray-400">Cost</div>
                              <div className="text-white font-medium">${agent.cost.toFixed(2)}</div>
                            </div>
                            <Badge variant="outline" className={
                              agent.trend === 'up' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                              agent.trend === 'down' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                              'bg-gray-500/20 text-gray-400 border-gray-500/30'
                            }>
                              {agent.trend === 'up' ? <TrendingUp className="h-3 w-3 mr-1" /> : 
                               agent.trend === 'down' ? <TrendingDown className="h-3 w-3 mr-1" /> :
                               <Activity className="h-3 w-3 mr-1" />}
                              {agent.trend}
                            </Badge>
                          </div>
                        </div>
                        <Progress value={agent.successRate} className="h-1 mt-2" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="agents" className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white">Agent Performance Rankings</CardTitle>
                  <Button variant="outline" size="sm" className="border-gray-700">
                    <Filter className="h-4 w-4 mr-2" />
                    Filter
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Rank</th>
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Agent</th>
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Department</th>
                        <th className="text-right py-3 px-4 text-gray-400 font-medium">Tasks</th>
                        <th className="text-right py-3 px-4 text-gray-400 font-medium">Messages</th>
                        <th className="text-right py-3 px-4 text-gray-400 font-medium">Avg Response</th>
                        <th className="text-right py-3 px-4 text-gray-400 font-medium">Success Rate</th>
                        <th className="text-right py-3 px-4 text-gray-400 font-medium">Cost</th>
                        <th className="text-right py-3 px-4 text-gray-400 font-medium">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mockAgentPerformance.map((agent, index) => (
                        <tr key={agent.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                          <td className="py-4 px-4">
                            <span className={`font-bold ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-300' : index === 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                              #{index + 1}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8 border border-gray-700">
                                <AvatarFallback className="bg-blue-600 text-white text-xs">
                                  {agent.name.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium text-white">{agent.name}</div>
                                <div className="text-xs text-gray-500">{agent.role}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <Badge variant="outline" className="bg-gray-800 border-gray-700">
                              {agent.department}
                            </Badge>
                          </td>
                          <td className="py-4 px-4 text-right text-white">{agent.tasksCompleted}</td>
                          <td className="py-4 px-4 text-right text-white">{agent.messages}</td>
                          <td className="py-4 px-4 text-right text-white">{agent.responseTime}s</td>
                          <td className="py-4 px-4 text-right">
                            <span className={agent.successRate >= 95 ? 'text-green-400' : agent.successRate >= 90 ? 'text-yellow-400' : 'text-red-400'}>
                              {agent.successRate}%
                            </span>
                          </td>
                          <td className="py-4 px-4 text-right text-white">${agent.cost.toFixed(2)}</td>
                          <td className="py-4 px-4 text-right">
                            {agent.trend === 'up' ? (
                              <TrendingUp className="h-4 w-4 text-green-400 ml-auto" />
                            ) : agent.trend === 'down' ? (
                              <TrendingDown className="h-4 w-4 text-red-400 ml-auto" />
                            ) : (
                              <Activity className="h-4 w-4 text-gray-400 ml-auto" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="costs" className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Card className="bg-gray-900 border-gray-800">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-12 w-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                      <Brain className="h-6 w-6 text-green-400" />
                    </div>
                    <div>
                      <div className="text-sm text-gray-400">GPT-4 Usage</div>
                      <div className="text-xl font-bold text-white">$28.45</div>
                    </div>
                  </div>
                  <Progress value={45} className="h-2" />
                  <p className="text-xs text-gray-500 mt-2">45% of total AI costs</p>
                </CardContent>
              </Card>

              <Card className="bg-gray-900 border-gray-800">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-12 w-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                      <Brain className="h-6 w-6 text-blue-400" />
                    </div>
                    <div>
                      <div className="text-sm text-gray-400">Claude Usage</div>
                      <div className="text-xl font-bold text-white">$22.12</div>
                    </div>
                  </div>
                  <Progress value={35} className="h-2" />
                  <p className="text-xs text-gray-500 mt-2">35% of total AI costs</p>
                </CardContent>
              </Card>

              <Card className="bg-gray-900 border-gray-800">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-12 w-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                      <Brain className="h-6 w-6 text-orange-400" />
                    </div>
                    <div>
                      <div className="text-sm text-gray-400">GPT-3.5 Usage</div>
                      <div className="text-xl font-bold text-white">$9.50</div>
                    </div>
                  </div>
                  <Progress value={15} className="h-2" />
                  <p className="text-xs text-gray-500 mt-2">15% of total AI costs</p>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white text-lg">Daily Cost Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={mockDailyMetrics}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" tickFormatter={(value) => `$${value}`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']}
                    />
                    <Bar dataKey="costs" fill="#ef4444" radius={[4, 4, 0, 0]} name="AI Costs" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white text-lg">Cost by Agent</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {mockAgentPerformance.sort((a, b) => b.cost - a.cost).map((agent) => (
                    <div key={agent.id} className="flex items-center gap-4">
                      <Avatar className="h-8 w-8 border border-gray-700">
                        <AvatarFallback className="bg-blue-600 text-white text-xs">
                          {agent.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-white text-sm">{agent.name}</span>
                          <span className="text-white font-medium">${agent.cost.toFixed(2)}</span>
                        </div>
                        <Progress value={(agent.cost / 25) * 100} className="h-2" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white text-lg">24-Hour Activity Heatmap</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={mockHourlyActivity}>
                    <defs>
                      <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="hour" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                    />
                    <Area type="monotone" dataKey="activity" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorActivity)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-4">
                      {[
                        { agent: "Sales Director", action: "Completed lead qualification", time: "2 min ago", type: "task" },
                        { agent: "Marketing Manager", action: "Posted social content", time: "5 min ago", type: "task" },
                        { agent: "Chief Orchestrator", action: "Scheduled team meeting", time: "12 min ago", type: "meeting" },
                        { agent: "Finance Director", action: "Generated Q4 report", time: "18 min ago", type: "report" },
                        { agent: "Support Agent", action: "Resolved customer ticket", time: "25 min ago", type: "task" },
                        { agent: "Sales Director", action: "Sent follow-up email", time: "32 min ago", type: "message" },
                      ].map((activity, index) => (
                        <div key={index} className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                            activity.type === 'task' ? 'bg-green-500/20' :
                            activity.type === 'meeting' ? 'bg-blue-500/20' :
                            activity.type === 'report' ? 'bg-purple-500/20' :
                            'bg-orange-500/20'
                          }`}>
                            {activity.type === 'task' ? <CheckCircle2 className="h-4 w-4 text-green-400" /> :
                             activity.type === 'meeting' ? <Calendar className="h-4 w-4 text-blue-400" /> :
                             activity.type === 'report' ? <Activity className="h-4 w-4 text-purple-400" /> :
                             <MessageSquare className="h-4 w-4 text-orange-400" />}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm text-white">{activity.action}</div>
                            <div className="text-xs text-gray-500">{activity.agent} • {activity.time}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-lg">System Health</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="h-3 w-3 rounded-full bg-green-400 animate-pulse" />
                        <span className="text-white">API Response Time</span>
                      </div>
                      <span className="text-green-400">45ms</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="h-3 w-3 rounded-full bg-green-400 animate-pulse" />
                        <span className="text-white">Database</span>
                      </div>
                      <span className="text-green-400">Healthy</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="h-3 w-3 rounded-full bg-green-400 animate-pulse" />
                        <span className="text-white">WebSocket</span>
                      </div>
                      <span className="text-green-400">Connected</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="h-3 w-3 rounded-full bg-yellow-400 animate-pulse" />
                        <span className="text-white">AI Provider</span>
                      </div>
                      <span className="text-yellow-400">High Load</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="h-3 w-3 rounded-full bg-green-400 animate-pulse" />
                        <span className="text-white">Background Jobs</span>
                      </div>
                      <span className="text-green-400">Running</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default PerformancePage;
