import React from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  LineChart,
  Line,
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
import { CoachingOverlay } from "./CoachingOverlay";

interface AgentMetrics {
  agentId: number;
  name: string;
  role: string;
  performanceScore: number;
  tokenBalance: number;
  totalEarned: number;
  tasksCompleted: number;
  tasksPending: number;
  recentActivities: {
    date: string;
    activity: string;
    impact: number;
  }[];
  achievements: {
    type: string;
    count: number;
  }[];
}

interface AgentPerformanceDashboardProps {
  onAgentSelect?: (agentId: number) => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export function AgentPerformanceDashboard({ onAgentSelect }: AgentPerformanceDashboardProps) {
  const { data: metrics, isLoading, error } = useQuery<AgentMetrics[]>({
    queryKey: ["/api/agent-metrics"],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle>
                <Skeleton className="h-4 w-[150px]" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[200px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load agent metrics. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  if (!metrics || metrics.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>No agent metrics available</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {metrics?.map((agent) => (
        <div key={agent.agentId}>
          <Card 
            className="col-span-1 cursor-pointer hover:ring-2 hover:ring-primary transition-all"
            onClick={() => onAgentSelect?.(agent.agentId)}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{agent.name}</span>
                <span className="text-sm text-muted-foreground">{agent.role}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Performance Score */}
              <div>
                <h4 className="mb-2 text-sm font-medium">Performance Score</h4>
                <div className="text-2xl font-bold">
                  {agent.performanceScore.toFixed(2)}
                </div>
              </div>

              {/* Token Balance */}
              <div>
                <h4 className="mb-2 text-sm font-medium">Token Balance</h4>
                <div className="text-2xl font-bold">
                  {agent.tokenBalance.toLocaleString()}
                </div>
              </div>

              {/* Task Progress */}
              <div>
                <h4 className="mb-2 text-sm font-medium">Task Progress</h4>
                <ResponsiveContainer width="100%" height={100}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Completed', value: agent.tasksCompleted },
                        { name: 'Pending', value: agent.tasksPending },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={25}
                      outerRadius={40}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {[COLORS[0], COLORS[1]].map((color, index) => (
                        <Cell key={`cell-${index}`} fill={color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Recent Activity Chart */}
              <div>
                <h4 className="mb-2 text-sm font-medium">Recent Activity</h4>
                <ResponsiveContainer width="100%" height={100}>
                  <LineChart data={agent.recentActivities}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => new Date(value).toLocaleDateString()}
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(value) => new Date(value).toLocaleString()}
                    />
                    <Line
                      type="monotone"
                      dataKey="impact"
                      stroke={COLORS[0]}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Achievements */}
              <div>
                <h4 className="mb-2 text-sm font-medium">Achievements</h4>
                <div className="space-y-1">
                  {agent.achievements.map((achievement, index) => (
                    <div
                      key={achievement.type}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>{achievement.type}</span>
                      <span className="font-medium">{achievement.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="mt-4">
            <CoachingOverlay agentId={agent.agentId} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default AgentPerformanceDashboard;