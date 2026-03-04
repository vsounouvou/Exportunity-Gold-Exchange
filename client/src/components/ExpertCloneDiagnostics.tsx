import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/hooks/use-company";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Activity, Clock, DollarSign, CheckCircle2, XCircle, TrendingUp, Users, Zap } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

interface CompanyDiagnostics {
  companyId: number;
  metrics: {
    totalAssignments: number;
    activeAssignments: number;
    totalTasks: number;
    successRate: string;
    averageResponseTime: number;
    totalCost: string;
    tokensUsed: number;
  };
  topPerformers: Array<{
    assignmentId: number;
    roleName: string;
    cloneProfile: {
      displayName: string;
      title: string;
      category: string;
    } | null;
    successRate: string;
    tasksCompleted: number;
  }>;
}

interface AssignmentDiagnostics {
  id: number;
  assignmentId: number;
  period: string;
  tasksReceived: number;
  tasksCompleted: number;
  tasksSucceeded: number;
  tasksFailed: number;
  averageResponseTime: number;
  successRate: string;
  tokensUsed: number;
  costIncurred: string;
  messagesReceived: number;
  messagesSent: number;
  conversationsHandled: number;
  qualityScore: string;
  updatedAt: string;
}

export function ExpertCloneDiagnostics() {
  const { selectedCompanyId } = useCompany();

  const { data: companyDiagnostics, isLoading: loadingCompany } = useQuery<CompanyDiagnostics>({
    queryKey: ['/api/expert-clones/diagnostics/company', selectedCompanyId],
    enabled: !!selectedCompanyId,
  });

  const { data: assignments } = useQuery<any[]>({
    queryKey: ['/api/expert-clones/companies', selectedCompanyId, 'assignments'],
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return (
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="pt-6">
          <p className="text-gray-400 text-center">Please select a company to view diagnostics</p>
        </CardContent>
      </Card>
    );
  }

  if (loadingCompany) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-3">
                <Skeleton className="h-4 w-24 bg-gray-800" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 bg-gray-800" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const metrics = companyDiagnostics?.metrics;

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Active Clones</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{metrics?.activeAssignments || 0}</div>
            <p className="text-xs text-gray-500 mt-1">
              of {metrics?.totalAssignments || 0} total
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {parseFloat(metrics?.successRate || '0').toFixed(1)}%
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {metrics?.totalTasks || 0} tasks completed
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Avg Response Time</CardTitle>
            <Clock className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {metrics?.averageResponseTime ? `${(metrics.averageResponseTime / 1000).toFixed(2)}s` : '0s'}
            </div>
            <p className="text-xs text-gray-500 mt-1">milliseconds</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              ${parseFloat(metrics?.totalCost || '0').toFixed(4)}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {metrics?.tokensUsed?.toLocaleString() || 0} tokens
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tabs */}
      <Tabs defaultValue="assignments" className="space-y-4">
        <TabsList className="bg-gray-900 border border-gray-800">
          <TabsTrigger value="assignments">Clone Assignments</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="assignments" className="space-y-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Assignment Performance</CardTitle>
              <CardDescription className="text-gray-400">
                Individual clone metrics across your company
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {assignments?.length === 0 && (
                    <p className="text-gray-500 text-center py-8">No assignments found</p>
                  )}
                  {assignments?.map((assignment) => (
                    <AssignmentCard key={assignment.id} assignment={assignment} />
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Top Performers</CardTitle>
              <CardDescription className="text-gray-400">
                Highest performing clone assignments this month
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {companyDiagnostics?.topPerformers?.length === 0 && (
                  <p className="text-gray-500 text-center py-8">No performance data yet</p>
                )}
                {companyDiagnostics?.topPerformers?.map((performer, index) => (
                  <div
                    key={performer.assignmentId}
                    className="flex items-center justify-between p-4 bg-gray-800 rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-8 h-8 bg-blue-600 rounded-full text-white font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-white font-medium">{performer.cloneProfile?.displayName || performer.roleName}</p>
                        <p className="text-xs text-gray-500">{performer.roleName} • {performer.tasksCompleted} tasks completed</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-green-900/20 text-green-400 border-green-700">
                      {parseFloat(performer.successRate).toFixed(1)}% success
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AssignmentCard({ assignment }: { assignment: any }) {
  const { data: diagnostics, isLoading } = useQuery<AssignmentDiagnostics>({
    queryKey: ['/api/expert-clones/diagnostics/assignment', assignment.id],
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-900/20 text-green-400 border-green-700';
      case 'learning': return 'bg-blue-900/20 text-blue-400 border-blue-700';
      case 'paused': return 'bg-yellow-900/20 text-yellow-400 border-yellow-700';
      case 'terminated': return 'bg-gray-700/20 text-gray-400 border-gray-600';
      default: return 'bg-gray-700/20 text-gray-400 border-gray-600';
    }
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-medium">{assignment.cloneProfile?.displayName || 'Unknown'}</h3>
            <Badge variant="outline" className={getStatusColor(assignment.status)}>
              {assignment.status}
            </Badge>
          </div>
          <p className="text-sm text-gray-400 mt-1">{assignment.roleWithinCompany}</p>
        </div>
        <Activity className="h-5 w-5 text-gray-500" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-12 bg-gray-700" />
          ))}
        </div>
      ) : diagnostics ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="flex items-center gap-1 text-gray-400 mb-1">
              <Zap className="h-3 w-3" />
              <span>Tasks</span>
            </div>
            <p className="text-white font-medium">{diagnostics.tasksCompleted || 0}</p>
          </div>
          <div>
            <div className="flex items-center gap-1 text-gray-400 mb-1">
              <CheckCircle2 className="h-3 w-3" />
              <span>Success</span>
            </div>
            <p className="text-white font-medium">
              {parseFloat(diagnostics.successRate || '0').toFixed(1)}%
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1 text-gray-400 mb-1">
              <Clock className="h-3 w-3" />
              <span>Avg Time</span>
            </div>
            <p className="text-white font-medium">
              {diagnostics.averageResponseTime ? `${(diagnostics.averageResponseTime / 1000).toFixed(2)}s` : '0s'}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1 text-gray-400 mb-1">
              <DollarSign className="h-3 w-3" />
              <span>Cost</span>
            </div>
            <p className="text-white font-medium">
              ${parseFloat(diagnostics.costIncurred || '0').toFixed(4)}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-gray-500 text-sm">No diagnostics data available</p>
      )}
    </div>
  );
}
