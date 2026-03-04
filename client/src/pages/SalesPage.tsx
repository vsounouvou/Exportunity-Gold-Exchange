import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  DollarSign, 
  Users, 
  TrendingUp, 
  Mail, 
  Phone, 
  Calendar,
  Target,
  BarChart3,
  Plus,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Clock
} from "lucide-react";

interface Lead {
  id: number;
  name: string;
  company: string;
  email: string;
  stage: 'new' | 'contacted' | 'qualified' | 'proposal' | 'closed';
  value: number;
  assignedTo: string;
  lastContact: string;
}

const mockLeads: Lead[] = [
  { id: 1, name: "John Smith", company: "Acme Corp", email: "john@acme.com", stage: "qualified", value: 50000, assignedTo: "Sales Rep", lastContact: "2 hours ago" },
  { id: 2, name: "Sarah Johnson", company: "TechStart Inc", email: "sarah@techstart.com", stage: "proposal", value: 75000, assignedTo: "Account Manager", lastContact: "1 day ago" },
  { id: 3, name: "Mike Brown", company: "Global Solutions", email: "mike@global.com", stage: "new", value: 25000, assignedTo: "Unassigned", lastContact: "Just now" },
  { id: 4, name: "Emily Davis", company: "Innovate LLC", email: "emily@innovate.com", stage: "contacted", value: 100000, assignedTo: "Sales Rep", lastContact: "3 hours ago" },
];

const stageColors = {
  new: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  contacted: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  qualified: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  proposal: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  closed: "bg-green-500/20 text-green-400 border-green-500/30",
};

export function SalesPage() {
  const [location] = useLocation();
  const [activeTab, setActiveTab] = useState(() => {
    if (location.includes('/pipeline')) return 'pipeline';
    if (location.includes('/leads')) return 'leads';
    if (location.includes('/sequences')) return 'sequences';
    if (location.includes('/reports')) return 'reports';
    return 'pipeline';
  });

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <DollarSign className="h-6 w-6 text-green-400" />
              Sales
            </h1>
            <p className="text-gray-400 mt-1">Manage your sales pipeline and customer relationships</p>
          </div>
          <Button className="bg-green-600 hover:bg-green-700">
            <Plus className="h-4 w-4 mr-2" />
            Add Lead
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Pipeline</p>
                  <p className="text-2xl font-bold text-white">$250,000</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-green-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 text-green-400 text-sm">
                <ArrowUpRight className="h-4 w-4" />
                <span>12% from last month</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Active Leads</p>
                  <p className="text-2xl font-bold text-white">24</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 text-blue-400 text-sm">
                <ArrowUpRight className="h-4 w-4" />
                <span>5 new this week</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Conversion Rate</p>
                  <p className="text-2xl font-bold text-white">32%</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <Target className="h-5 w-5 text-purple-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 text-green-400 text-sm">
                <ArrowUpRight className="h-4 w-4" />
                <span>3% improvement</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Avg Deal Size</p>
                  <p className="text-2xl font-bold text-white">$12,500</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-orange-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 text-red-400 text-sm">
                <ArrowDownRight className="h-4 w-4" />
                <span>2% from last month</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-gray-900 border border-gray-800">
            <TabsTrigger value="pipeline" className="data-[state=active]:bg-gray-800">Pipeline</TabsTrigger>
            <TabsTrigger value="leads" className="data-[state=active]:bg-gray-800">Leads</TabsTrigger>
            <TabsTrigger value="sequences" className="data-[state=active]:bg-gray-800">Sequences</TabsTrigger>
            <TabsTrigger value="reports" className="data-[state=active]:bg-gray-800">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="space-y-4">
            <div className="grid grid-cols-5 gap-4">
              {['New', 'Contacted', 'Qualified', 'Proposal', 'Closed'].map((stage) => (
                <Card key={stage} className="bg-gray-900 border-gray-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-300 flex items-center justify-between">
                      {stage}
                      <Badge variant="outline" className="text-xs">
                        {mockLeads.filter(l => l.stage === stage.toLowerCase()).length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {mockLeads
                      .filter(l => l.stage === stage.toLowerCase())
                      .map((lead) => (
                        <div key={lead.id} className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors">
                          <div className="font-medium text-white text-sm">{lead.name}</div>
                          <div className="text-xs text-gray-400">{lead.company}</div>
                          <div className="text-sm text-green-400 font-medium mt-2">${lead.value.toLocaleString()}</div>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="leads" className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white">All Leads</CardTitle>
                  <Button variant="outline" size="sm" className="border-gray-700">
                    <Filter className="h-4 w-4 mr-2" />
                    Filter
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {mockLeads.map((lead) => (
                    <div key={lead.id} className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                          <span className="text-blue-400 font-medium">{lead.name.charAt(0)}</span>
                        </div>
                        <div>
                          <div className="font-medium text-white">{lead.name}</div>
                          <div className="text-sm text-gray-400">{lead.company} • {lead.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant="outline" className={stageColors[lead.stage]}>
                          {lead.stage}
                        </Badge>
                        <div className="text-right">
                          <div className="text-green-400 font-medium">${lead.value.toLocaleString()}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {lead.lastContact}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sequences" className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Email Sequences</CardTitle>
                <CardDescription>Automated outreach campaigns</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-gray-400">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No active sequences yet</p>
                  <Button className="mt-4">Create Sequence</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Sales Reports</CardTitle>
                <CardDescription>Analytics and performance metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-gray-400">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Reports coming soon</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
