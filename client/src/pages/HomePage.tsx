import { useUser } from "@/hooks/use-user";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Building2, 
  Users, 
  Calendar, 
  TrendingUp,
  Activity
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { ChairmanChatDock } from "@/components/ChairmanChatDock";
import { CreateCompanyDialog } from "@/components/CreateCompanyDialog";
import { useChairmanContext } from "@/hooks/use-chairman-context";
import { Agent } from "@db/schema";

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

export function HomePage() {
  const { user } = useUser();
  const { setCurrentCompanyId, setCurrentCompanyName } = useChairmanContext();

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

  const totalAgents = companies.reduce((sum, c) => sum + (c.agents?.length || 0), 0);
  const activeCompanies = companies.filter(c => c.status === "active").length;
  const totalBudgetUsed = companies.reduce((sum, c) => {
    const budget = Number(c.budgetUsed) || 0;
    return sum + budget;
  }, 0);

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-3">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-lg font-semibold text-white">Companies</CardTitle>
                <CreateCompanyDialog />
              </CardHeader>
              <CardContent className="space-y-2">
                {companies.length === 0 ? (
                  <div className="py-8 text-center text-gray-500 text-sm">
                    No companies yet
                  </div>
                ) : (
                  companies.slice(0, 5).map((company) => (
                    <div 
                      key={company.id} 
                      onClick={() => {
                        setCurrentCompanyId(company.id);
                        setCurrentCompanyName(company.name);
                      }}
                      className="p-3 rounded-lg border border-gray-800 hover:border-gray-700 hover:bg-gray-800/50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-white text-sm">{company.name}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {company.agents?.length || 0} agents
                          </div>
                        </div>
                        <div className={cn(
                          "text-xs px-2 py-1 rounded",
                          company.status === "active" 
                            ? "bg-green-500/10 text-green-400" 
                            : "bg-gray-500/10 text-gray-400"
                        )}>
                          {company.status}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="col-span-6">
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Link href="/agents">
                  <Card className="bg-gray-900 border-gray-800 hover:border-gray-700 cursor-pointer transition-colors">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm text-gray-400">Total Companies</div>
                          <div className="text-3xl font-bold text-white mt-2">{companies.length}</div>
                        </div>
                        <Building2 className="h-10 w-10 text-blue-500" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                <Link href="/agents">
                  <Card className="bg-gray-900 border-gray-800 hover:border-gray-700 cursor-pointer transition-colors">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm text-gray-400">Active Agents</div>
                          <div className="text-3xl font-bold text-white mt-2">{totalAgents}</div>
                        </div>
                        <Users className="h-10 w-10 text-green-500" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                <Link href="/meetings">
                  <Card className="bg-gray-900 border-gray-800 hover:border-gray-700 cursor-pointer transition-colors">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm text-gray-400">Meetings</div>
                          <div className="text-3xl font-bold text-white mt-2">{meetings.length}</div>
                        </div>
                        <Calendar className="h-10 w-10 text-purple-500" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                <Link href="/performance">
                  <Card className="bg-gray-900 border-gray-800 hover:border-gray-700 cursor-pointer transition-colors">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm text-gray-400">Budget Used</div>
                          <div className="text-3xl font-bold text-white mt-2">
                            ${totalBudgetUsed.toFixed(2)}
                          </div>
                        </div>
                        <TrendingUp className="h-10 w-10 text-orange-500" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </div>

              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-white">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                  <Link href="/agents">
                    <Button variant="outline" className="w-full justify-start">
                      <Users className="h-4 w-4 mr-2" />
                      Manage Agents
                    </Button>
                  </Link>
                  <Link href="/meetings">
                    <Button variant="outline" className="w-full justify-start">
                      <Calendar className="h-4 w-4 mr-2" />
                      View Meetings
                    </Button>
                  </Link>
                  <Link href="/hierarchy">
                    <Button variant="outline" className="w-full justify-start">
                      <Activity className="h-4 w-4 mr-2" />
                      View Hierarchy
                    </Button>
                  </Link>
                  <Link href="/performance">
                    <Button variant="outline" className="w-full justify-start">
                      <TrendingUp className="h-4 w-4 mr-2" />
                      Performance
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="col-span-3">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-white">Activity Feed</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentMessages.length === 0 ? (
                  <div className="py-8 text-center text-gray-500 text-sm">
                    No recent activity
                  </div>
                ) : (
                  recentMessages.slice(0, 8).map((message) => (
                    <div key={message.id} className="text-sm">
                      <div className="text-gray-400 line-clamp-2">
                        {message.content}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {new Date(message.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <ChairmanChatDock />
    </div>
  );
}
