import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Building2,
  MessageSquare,
  Globe,
  FileText,
  DollarSign,
  CheckSquare,
  Settings,
  TrendingUp,
  Activity,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Filter,
  Info,
  Shield,
  Play,
  FlaskConical
} from "lucide-react";
import { format } from "date-fns";
import { Agent } from "@db/schema";

// Action definition type
interface ActionDefinition {
  code: string;
  name: string;
  description: string;
  inputs?: string[];
  outputs?: string[];
  cost?: string;
}

// Action Categories
const ACTION_CATEGORIES = [
  {
    id: "platform",
    label: "Platform Actions",
    icon: Settings,
    color: "text-blue-400",
    actions: [
      { code: "create_company", name: "Create Company", description: "Create a new company in the system", inputs: ["company name", "country", "sector"], outputs: ["company ID"] },
      { code: "create_agent", name: "Create Agent", description: "Add a new AI agent to a company", inputs: ["agent name", "role", "company ID"], outputs: ["agent ID"] },
      { code: "update_agent", name: "Update Agent", description: "Modify agent profile and settings", inputs: ["agent ID", "updates"], outputs: ["success"] },
      { code: "delete_agent", name: "Delete Agent", description: "Remove an agent from the system", inputs: ["agent ID"], outputs: ["success"] },
      { code: "update_budget", name: "Update Budget", description: "Change agent or company budget allocation", inputs: ["entity ID", "amount"], outputs: ["new balance"] },
      { code: "create_meeting", name: "Create Meeting", description: "Schedule a new meeting or conversation", inputs: ["title", "participants", "time"], outputs: ["meeting ID"] },
      { code: "end_meeting", name: "End Meeting", description: "Complete and summarize a meeting", inputs: ["meeting ID"], outputs: ["summary"] },
      { code: "add_participant", name: "Add Participant", description: "Add agent to meeting or conversation", inputs: ["meeting ID", "agent ID"], outputs: ["success"] },
      { code: "remove_participant", name: "Remove Participant", description: "Remove agent from conversation", inputs: ["meeting ID", "agent ID"], outputs: ["success"] },
      { code: "grant_permission", name: "Grant Permission", description: "Give an agent access to specific actions", inputs: ["agent ID", "action code"], outputs: ["success"] },
      { code: "revoke_permission", name: "Revoke Permission", description: "Remove agent's action permissions", inputs: ["agent ID", "action code"], outputs: ["success"] },
    ]
  },
  {
    id: "communication",
    label: "Communication Actions",
    icon: MessageSquare,
    color: "text-green-400",
    actions: [
      { code: "send_email", name: "Send Email", description: "Send email to internal or external contacts", inputs: ["recipient", "subject", "body"], outputs: ["message ID"], cost: "$0.01" },
      { code: "send_slack_message", name: "Send Slack Message", description: "Post message to Slack channel", inputs: ["channel", "message"], outputs: ["timestamp"] },
      { code: "create_notification", name: "Create Notification", description: "Send in-platform notification", inputs: ["user ID", "message"], outputs: ["notification ID"] },
      { code: "send_sms", name: "Send SMS", description: "Send text message via Twilio", inputs: ["phone", "message"], outputs: ["message ID"], cost: "$0.05" },
      { code: "create_announcement", name: "Create Announcement", description: "Broadcast message to team", inputs: ["message", "audience"], outputs: ["announcement ID"] },
    ]
  },
  {
    id: "external",
    label: "External Services",
    icon: Globe,
    color: "text-purple-400",
    actions: [
      { code: "google_search", name: "Google Search", description: "Search the web via Google", inputs: ["query"], outputs: ["results"], cost: "$0.02" },
      { code: "google_calendar_create_event", name: "Create Calendar Event", description: "Add event to Google Calendar", inputs: ["title", "start", "end"], outputs: ["event ID"] },
      { code: "google_calendar_update_event", name: "Update Calendar Event", description: "Modify Google Calendar event", inputs: ["event ID", "updates"], outputs: ["success"] },
      { code: "google_drive_upload_file", name: "Upload to Drive", description: "Upload file to Google Drive", inputs: ["file", "folder"], outputs: ["file ID"] },
      { code: "google_drive_list_files", name: "List Drive Files", description: "Browse Google Drive contents", inputs: ["folder ID"], outputs: ["file list"] },
      { code: "google_sheets_read_range", name: "Read Spreadsheet", description: "Read data from Google Sheets", inputs: ["sheet ID", "range"], outputs: ["data"] },
      { code: "google_sheets_write_range", name: "Write Spreadsheet", description: "Write data to Google Sheets", inputs: ["sheet ID", "range", "data"], outputs: ["success"] },
      { code: "gmail_send_email", name: "Send via Gmail", description: "Send email through Gmail API", inputs: ["to", "subject", "body"], outputs: ["message ID"], cost: "$0.01" },
    ]
  },
  {
    id: "documents",
    label: "Document Management",
    icon: FileText,
    color: "text-yellow-400",
    actions: [
      { code: "upload_document", name: "Upload Document", description: "Upload file to knowledge base", inputs: ["file", "category"], outputs: ["document ID"] },
      { code: "tag_document", name: "Tag Document", description: "Add metadata tags to document", inputs: ["document ID", "tags"], outputs: ["success"] },
      { code: "search_documents", name: "Search Documents", description: "Find documents in knowledge base", inputs: ["query"], outputs: ["results"] },
      { code: "delete_document", name: "Delete Document", description: "Remove document from system", inputs: ["document ID"], outputs: ["success"] },
      { code: "share_document", name: "Share Document", description: "Grant access to document", inputs: ["document ID", "user ID"], outputs: ["success"] },
    ]
  },
  {
    id: "financial",
    label: "Financial Actions",
    icon: DollarSign,
    color: "text-emerald-400",
    actions: [
      { code: "log_transaction", name: "Log Transaction", description: "Record financial transaction", inputs: ["amount", "type", "description"], outputs: ["transaction ID"] },
      { code: "update_budget", name: "Update Budget", description: "Adjust budget allocation", inputs: ["budget ID", "amount"], outputs: ["new balance"] },
      { code: "generate_invoice", name: "Generate Invoice", description: "Create invoice for client", inputs: ["client", "items", "amount"], outputs: ["invoice ID"] },
      { code: "process_payment", name: "Process Payment", description: "Execute payment transaction", inputs: ["amount", "method"], outputs: ["payment ID"], cost: "$0.30" },
      { code: "generate_financial_report", name: "Generate Report", description: "Create financial analysis report", inputs: ["period", "type"], outputs: ["report"], cost: "$0.50" },
    ]
  },
  {
    id: "tasks",
    label: "Task Management",
    icon: CheckSquare,
    color: "text-orange-400",
    actions: [
      { code: "create_task", name: "Create Task", description: "Add new task to system", inputs: ["title", "assignee", "deadline"], outputs: ["task ID"] },
      { code: "assign_task", name: "Assign Task", description: "Assign task to agent", inputs: ["task ID", "agent ID"], outputs: ["success"] },
      { code: "update_task", name: "Update Task", description: "Modify task details or status", inputs: ["task ID", "updates"], outputs: ["success"] },
      { code: "complete_task", name: "Complete Task", description: "Mark task as completed", inputs: ["task ID"], outputs: ["success"] },
      { code: "delete_task", name: "Delete Task", description: "Remove task from system", inputs: ["task ID"], outputs: ["success"] },
    ]
  },
];

// Agent permission type
type PermissionMode = "not_allowed" | "allowed" | "needs_approval";

interface AgentPermission {
  agentId: number;
  agentName: string;
  role: string;
  department: string;
  permission: PermissionMode;
}

interface ExecutedAction {
  id: string;
  actionCode: string;
  actionName: string;
  category: string;
  executedBy: string;
  executedByType: "chairman" | "agent" | "system";
  companyId?: number;
  companyName?: string;
  timestamp: string;
  status: "success" | "failed" | "pending";
  metadata?: {
    revenue?: number;
    cost?: number;
    participants?: string[];
    details?: string;
  };
}

export function ActionsPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [filterExecutor, setFilterExecutor] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedAction, setSelectedAction] = useState<ActionDefinition | null>(null);
  const [agentPermissions, setAgentPermissions] = useState<AgentPermission[]>([]);
  const [testInputs, setTestInputs] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");

  // Fetch agents
  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  // Mock executed actions data
  const executedActions: ExecutedAction[] = [
    {
      id: "1",
      actionCode: "create_meeting",
      actionName: "Create Meeting",
      category: "platform",
      executedBy: "Sales Agent",
      executedByType: "agent",
      companyName: "Exportunity CI",
      timestamp: new Date().toISOString(),
      status: "success",
      metadata: { participants: ["Chairman", "Sales Agent", "Finance Agent"], details: "Weekly Sales Review" }
    },
    {
      id: "2",
      actionCode: "log_transaction",
      actionName: "Log Transaction",
      category: "financial",
      executedBy: "Finance Agent",
      executedByType: "agent",
      companyName: "Gold Trading UAE",
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      status: "success",
      metadata: { revenue: 25000, details: "Client payment received" }
    },
    {
      id: "3",
      actionCode: "send_email",
      actionName: "Send Email",
      category: "communication",
      executedBy: "Chairman's Assistant",
      executedByType: "agent",
      companyName: "Exportunity CI",
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      status: "success",
      metadata: { details: "Follow-up to lead prospects" }
    },
  ];

  // Calculate metrics
  const totalActions = executedActions.length;
  const successRate = Math.round((executedActions.filter(a => a.status === "success").length / totalActions) * 100);
  const totalRevenue = executedActions.reduce((sum, a) => sum + (a.metadata?.revenue || 0), 0);

  // Handle action click
  const handleActionClick = (action: ActionDefinition) => {
    setSelectedAction(action);
    setTestInputs({});
    setTestResult(null);
    setTestStatus("idle");
    
    // Mock agent permissions - in real app, fetch from API
    const mockPermissions: AgentPermission[] = agents.slice(0, 5).map((agent, idx) => ({
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role || "Agent",
      department: "General",
      permission: idx % 3 === 0 ? "allowed" : idx % 3 === 1 ? "needs_approval" : "not_allowed"
    }));
    
    setAgentPermissions(mockPermissions);
  };

  // Handle test action
  const handleTestAction = (dryRun: boolean) => {
    setTestStatus("testing");
    setTestResult(null);
    
    // Mock test execution
    setTimeout(() => {
      const result = {
        status: "success",
        output: dryRun 
          ? `✓ Dry run successful. Action would execute with inputs: ${JSON.stringify(testInputs, null, 2)}`
          : `✓ Action executed successfully by Chairman's Assistant.\nOutput: ${JSON.stringify({ success: true, ...testInputs }, null, 2)}`,
        timestamp: new Date().toISOString()
      };
      
      setTestResult(result.output);
      setTestStatus("success");
    }, 1000);
  };

  // Update agent permission
  const updatePermission = (agentId: number, permission: PermissionMode) => {
    setAgentPermissions(prev =>
      prev.map(p => p.agentId === agentId ? { ...p, permission } : p)
    );
  };

  // Filter catalog
  const filteredCategories = ACTION_CATEGORIES.filter(category => {
    if (selectedCategory && category.id !== selectedCategory) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return category.label.toLowerCase().includes(query) ||
        category.actions.some(a => 
          a.name.toLowerCase().includes(query) || 
          a.description.toLowerCase().includes(query)
        );
    }
    return true;
  });

  // Filter executions
  const filteredExecutions = executedActions.filter(action => {
    if (filterCompany !== "all" && action.companyName !== filterCompany) return false;
    if (filterExecutor !== "all" && action.executedBy !== filterExecutor) return false;
    if (filterStatus !== "all" && action.status !== filterStatus) return false;
    return true;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success": return <CheckCircle2 className="h-4 w-4 text-green-400" />;
      case "failed": return <XCircle className="h-4 w-4 text-red-400" />;
      case "pending": return <AlertCircle className="h-4 w-4 text-yellow-400" />;
      default: return null;
    }
  };

  const getPermissionBadge = (permission: PermissionMode) => {
    switch (permission) {
      case "allowed":
        return <Badge className="bg-green-500/10 text-green-400 border-green-500/20">Allowed</Badge>;
      case "needs_approval":
        return <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">Needs Approval</Badge>;
      case "not_allowed":
        return <Badge variant="outline" className="text-gray-400">Not Allowed</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 pb-24">
      <div className="container mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Actions</h1>
          <p className="text-gray-400 mt-1">Action catalog and execution history</p>
        </div>

        {/* Metrics Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-400">Total Executions</CardTitle>
                <Activity className="h-4 w-4 text-blue-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{totalActions}</div>
              <p className="text-xs text-gray-500 mt-1">All time</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-400">Success Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{successRate}%</div>
              <p className="text-xs text-gray-500 mt-1">Actions completed</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-400">Revenue Generated</CardTitle>
                <DollarSign className="h-4 w-4 text-emerald-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">${totalRevenue.toLocaleString()}</div>
              <p className="text-xs text-gray-500 mt-1">From financial actions</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-400">Action Types</CardTitle>
                <Settings className="h-4 w-4 text-purple-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {ACTION_CATEGORIES.reduce((sum, cat) => sum + cat.actions.length, 0)}
              </div>
              <p className="text-xs text-gray-500 mt-1">Available actions</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="catalog" className="space-y-6">
          <TabsList className="bg-gray-900 border-gray-800">
            <TabsTrigger value="catalog">Action Catalog</TabsTrigger>
            <TabsTrigger value="history">Execution History</TabsTrigger>
          </TabsList>

          {/* Action Catalog Tab */}
          <TabsContent value="catalog" className="space-y-4">
            {/* Search and Filter */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Input
                  placeholder="Search actions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-gray-900 border-gray-800"
                />
              </div>
              <Select value={selectedCategory || "all"} onValueChange={(v) => setSelectedCategory(v === "all" ? null : v)}>
                <SelectTrigger className="w-[200px] bg-gray-900 border-gray-800">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {ACTION_CATEGORIES.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action Categories */}
            <div className="space-y-4">
              {filteredCategories.map((category) => {
                const Icon = category.icon;
                return (
                  <Card key={category.id} className="bg-gray-900 border-gray-800">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <Icon className={`h-5 w-5 ${category.color}`} />
                        <CardTitle className="text-white">{category.label}</CardTitle>
                        <Badge variant="outline" className="ml-auto">
                          {category.actions.length} actions
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {category.actions.map((action) => (
                          <Card 
                            key={action.code} 
                            className="bg-gray-800/50 border-gray-700 hover:border-blue-500/50 cursor-pointer transition-colors"
                            onClick={() => handleActionClick(action)}
                          >
                            <CardContent className="p-4">
                              <div className="space-y-2">
                                <div className="flex items-start justify-between">
                                  <h4 className="text-sm font-medium text-white">{action.name}</h4>
                                  <Badge variant="secondary" className="text-xs">
                                    {action.code}
                                  </Badge>
                                </div>
                                <p className="text-xs text-gray-400">{action.description}</p>
                                {action.cost && (
                                  <Badge variant="outline" className="text-xs">
                                    Cost: {action.cost}
                                  </Badge>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Execution History Tab */}
          <TabsContent value="history" className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-4">
              <Select value={filterCompany} onValueChange={setFilterCompany}>
                <SelectTrigger className="w-[200px] bg-gray-900 border-gray-800">
                  <SelectValue placeholder="All Companies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Companies</SelectItem>
                  <SelectItem value="Exportunity CI">Exportunity CI</SelectItem>
                  <SelectItem value="Gold Trading UAE">Gold Trading UAE</SelectItem>
                  <SelectItem value="Flying Cars Lab">Flying Cars Lab</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterExecutor} onValueChange={setFilterExecutor}>
                <SelectTrigger className="w-[200px] bg-gray-900 border-gray-800">
                  <SelectValue placeholder="All Executors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Executors</SelectItem>
                  <SelectItem value="Chairman">Chairman</SelectItem>
                  <SelectItem value="Chairman's Assistant">Chairman's Assistant</SelectItem>
                  <SelectItem value="Sales Agent">Sales Agent</SelectItem>
                  <SelectItem value="Finance Agent">Finance Agent</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[180px] bg-gray-900 border-gray-800">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Execution Log */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Recent Executions</CardTitle>
                <CardDescription>{filteredExecutions.length} action{filteredExecutions.length !== 1 ? 's' : ''} found</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {filteredExecutions.map((action) => (
                    <Card key={action.id} className="bg-gray-800/50 border-gray-700">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-3">
                              {getStatusIcon(action.status)}
                              <h4 className="text-sm font-medium text-white">{action.actionName}</h4>
                              <Badge variant="outline" className="text-xs">
                                {action.category}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center gap-4 text-xs text-gray-400">
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {action.executedBy}
                              </span>
                              {action.companyName && (
                                <span className="flex items-center gap-1">
                                  <Building2 className="h-3 w-3" />
                                  {action.companyName}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {format(new Date(action.timestamp), "MMM d, h:mm a")}
                              </span>
                            </div>

                            {action.metadata?.details && (
                              <p className="text-sm text-gray-300">{action.metadata.details}</p>
                            )}

                            {action.metadata?.revenue && (
                              <div className="flex items-center gap-2">
                                <Badge variant="default" className="bg-green-500/10 text-green-400">
                                  Revenue: ${action.metadata.revenue.toLocaleString()}
                                </Badge>
                              </div>
                            )}
                          </div>

                          <Badge variant={action.status === "success" ? "default" : "destructive"}>
                            {action.status}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {filteredExecutions.length === 0 && (
                    <div className="py-12 text-center">
                      <Filter className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-300">No actions found</h3>
                      <p className="text-gray-500 mt-2">Try adjusting your filters</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Action Detail Sheet */}
      <Sheet open={!!selectedAction} onOpenChange={(open) => !open && setSelectedAction(null)}>
        <SheetContent className="bg-gray-900 border-gray-800 sm:max-w-2xl overflow-y-auto">
          {selectedAction && (
            <>
              <SheetHeader>
                <SheetTitle className="text-white text-xl">{selectedAction.name}</SheetTitle>
                <SheetDescription className="text-gray-400">
                  {selectedAction.description}
                </SheetDescription>
                <Badge variant="secondary" className="w-fit mt-2">
                  {selectedAction.code}
                </Badge>
              </SheetHeader>

              <div className="space-y-6 mt-6">
                {/* Action Details */}
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-sm text-white">Action Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {selectedAction.inputs && selectedAction.inputs.length > 0 && (
                      <div>
                        <span className="text-gray-400 font-medium">Inputs:</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {selectedAction.inputs.map((input, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">{input}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {selectedAction.outputs && selectedAction.outputs.length > 0 && (
                      <div>
                        <span className="text-gray-400 font-medium">Outputs:</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {selectedAction.outputs.map((output, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs text-blue-400">{output}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedAction.cost && (
                      <div>
                        <span className="text-gray-400 font-medium">Cost per execution:</span>
                        <span className="text-white ml-2">{selectedAction.cost}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Agent Permissions */}
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-sm text-white flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Agents Who Can Perform This Action
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Chairman's Assistant Note */}
                    <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <Info className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="text-blue-300 font-medium">Chairman's Assistant: Always Allowed</p>
                        <p className="text-gray-400 mt-1">By default, the Chairman's Assistant can perform this action for this company.</p>
                      </div>
                    </div>

                    {/* Agent List */}
                    <div className="space-y-2">
                      {agentPermissions.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-4">No agents available</p>
                      ) : (
                        agentPermissions.map((agent) => (
                          <div key={agent.agentId} className="flex items-center justify-between p-3 bg-gray-900 rounded-lg border border-gray-700">
                            <div className="flex-1">
                              <h4 className="text-sm font-medium text-white">{agent.agentName}</h4>
                              <p className="text-xs text-gray-400 mt-1">{agent.role} • {agent.department}</p>
                            </div>
                            
                            <Select 
                              value={agent.permission} 
                              onValueChange={(value: PermissionMode) => updatePermission(agent.agentId, value)}
                            >
                              <SelectTrigger className="w-[160px] bg-gray-800 border-gray-700">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="not_allowed">Not Allowed</SelectItem>
                                <SelectItem value="allowed">Allowed</SelectItem>
                                <SelectItem value="needs_approval">Needs Approval</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Bulk Actions */}
                    {agentPermissions.length > 0 && (
                      <div className="flex gap-2 pt-4 border-t border-gray-700">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => {
                            setAgentPermissions(prev => prev.map(p => ({ ...p, permission: "allowed" })));
                          }}
                        >
                          Allow All
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => {
                            setAgentPermissions(prev => prev.map(p => ({ ...p, permission: "needs_approval" })));
                          }}
                        >
                          Require Approval for All
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => {
                            setAgentPermissions(prev => prev.map(p => ({ ...p, permission: "not_allowed" })));
                          }}
                        >
                          Block All
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Test Action Section */}
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-sm text-white flex items-center gap-2">
                      <FlaskConical className="h-4 w-4" />
                      Test This Action
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Test action execution as Chairman's Assistant
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Run As Selector */}
                    <div>
                      <label className="text-xs font-medium text-gray-400 mb-2 block">
                        Run as:
                      </label>
                      <Select defaultValue="chairman_assistant">
                        <SelectTrigger className="bg-gray-900 border-gray-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="chairman_assistant">
                            <div className="flex items-center gap-2">
                              <Shield className="h-3 w-3 text-blue-400" />
                              Chairman's Assistant (Always Allowed)
                            </div>
                          </SelectItem>
                          {agentPermissions.filter(a => a.permission === "allowed").map(agent => (
                            <SelectItem key={agent.agentId} value={String(agent.agentId)}>
                              {agent.agentName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Input Fields */}
                    {selectedAction.inputs && selectedAction.inputs.length > 0 && (
                      <div className="space-y-3">
                        <label className="text-xs font-medium text-gray-400">
                          Action Inputs:
                        </label>
                        {selectedAction.inputs.map((inputName, idx) => (
                          <div key={idx}>
                            <label className="text-xs text-gray-500 mb-1 block">
                              {inputName}
                            </label>
                            <Input
                              placeholder={`Enter ${inputName}...`}
                              value={testInputs[inputName] || ""}
                              onChange={(e) => setTestInputs(prev => ({
                                ...prev,
                                [inputName]: e.target.value
                              }))}
                              className="bg-gray-900 border-gray-700 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Test Buttons */}
                    <div className="flex gap-2 pt-2">
                      <Button 
                        variant="outline" 
                        className="flex-1"
                        onClick={() => handleTestAction(true)}
                        disabled={testStatus === "testing"}
                      >
                        <FlaskConical className="h-4 w-4 mr-2" />
                        Dry Run
                      </Button>
                      <Button 
                        className="flex-1 bg-blue-600 hover:bg-blue-700"
                        onClick={() => handleTestAction(false)}
                        disabled={testStatus === "testing"}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Test Live
                      </Button>
                    </div>

                    {/* Test Result */}
                    {testResult && (
                      <Card className={`${testStatus === "success" ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20"}`}>
                        <CardContent className="p-3">
                          <div className="flex items-start gap-2">
                            {testStatus === "success" ? (
                              <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1">
                              <p className={`text-xs font-medium ${testStatus === "success" ? "text-green-300" : "text-red-300"}`}>
                                Test Result
                              </p>
                              <pre className="text-xs text-gray-300 mt-2 whitespace-pre-wrap font-mono">
                                {testResult}
                              </pre>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
