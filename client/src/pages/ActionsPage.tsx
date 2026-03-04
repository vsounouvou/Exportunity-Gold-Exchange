import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Calendar,
  Mail,
  Upload,
  Search,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Filter,
  Wand2,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const ACTION_CATEGORIES = [
  {
    id: "platform",
    label: "Platform Actions",
    icon: Settings,
    color: "text-blue-400",
    actions: [
      { code: "create_company", name: "Create Company", description: "Create a new company in the system" },
      { code: "create_agent", name: "Create Agent", description: "Add a new AI agent to a company" },
      { code: "update_agent", name: "Update Agent", description: "Modify agent profile and settings" },
      { code: "delete_agent", name: "Delete Agent", description: "Remove an agent from the system" },
      { code: "update_budget", name: "Update Budget", description: "Change agent or company budget allocation" },
      { code: "create_meeting", name: "Create Meeting", description: "Schedule a new meeting or conversation" },
      { code: "end_meeting", name: "End Meeting", description: "Complete and summarize a meeting" },
      { code: "add_participant", name: "Add Participant", description: "Add agent to meeting or conversation" },
      { code: "remove_participant", name: "Remove Participant", description: "Remove agent from conversation" },
      { code: "grant_permission", name: "Grant Permission", description: "Give an agent access to specific actions" },
      { code: "revoke_permission", name: "Revoke Permission", description: "Remove agent's action permissions" },
    ]
  },
  {
    id: "communication",
    label: "Communication",
    icon: MessageSquare,
    color: "text-green-400",
    actions: [
      { code: "send_email", name: "Send Email", description: "Send email to internal or external contacts" },
      { code: "send_slack_message", name: "Send Slack Message", description: "Post message to Slack channel" },
      { code: "create_notification", name: "Create Notification", description: "Send in-platform notification" },
      { code: "send_sms", name: "Send SMS", description: "Send text message via Twilio" },
      { code: "create_announcement", name: "Create Announcement", description: "Broadcast message to team" },
    ]
  },
  {
    id: "external",
    label: "External Services",
    icon: Globe,
    color: "text-purple-400",
    actions: [
      { code: "google_search", name: "Google Search", description: "Search the web via Google" },
      { code: "google_calendar_create_event", name: "Create Calendar Event", description: "Add event to Google Calendar" },
      { code: "google_calendar_update_event", name: "Update Calendar Event", description: "Modify Google Calendar event" },
      { code: "google_drive_upload_file", name: "Upload to Drive", description: "Upload file to Google Drive" },
      { code: "google_drive_list_files", name: "List Drive Files", description: "Browse Google Drive contents" },
      { code: "google_sheets_read_range", name: "Read Spreadsheet", description: "Read data from Google Sheets" },
      { code: "google_sheets_write_range", name: "Write Spreadsheet", description: "Write data to Google Sheets" },
      { code: "gmail_send_email", name: "Send via Gmail", description: "Send email through Gmail API" },
    ]
  },
  {
    id: "documents",
    label: "Documents",
    icon: FileText,
    color: "text-yellow-400",
    actions: [
      { code: "upload_document", name: "Upload Document", description: "Upload file to knowledge base" },
      { code: "tag_document", name: "Tag Document", description: "Add metadata tags to document" },
      { code: "search_documents", name: "Search Documents", description: "Find documents in knowledge base" },
      { code: "delete_document", name: "Delete Document", description: "Remove document from system" },
      { code: "share_document", name: "Share Document", description: "Grant access to document" },
    ]
  },
  {
    id: "financial",
    label: "Financial",
    icon: DollarSign,
    color: "text-emerald-400",
    actions: [
      { code: "log_transaction", name: "Log Transaction", description: "Record financial transaction" },
      { code: "update_budget", name: "Update Budget", description: "Adjust budget allocation" },
      { code: "generate_invoice", name: "Generate Invoice", description: "Create invoice for client" },
      { code: "process_payment", name: "Process Payment", description: "Execute payment transaction" },
      { code: "generate_financial_report", name: "Generate Report", description: "Create financial analysis report" },
    ]
  },
  {
    id: "tasks",
    label: "Task Management",
    icon: CheckSquare,
    color: "text-orange-400",
    actions: [
      { code: "create_task", name: "Create Task", description: "Add new task to system" },
      { code: "assign_task", name: "Assign Task", description: "Assign task to agent" },
      { code: "update_task", name: "Update Task", description: "Modify task details or status" },
      { code: "complete_task", name: "Complete Task", description: "Mark task as completed" },
      { code: "delete_task", name: "Delete Task", description: "Remove task from system" },
    ]
  },
];

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

type AutomationManagerResponse = {
  ok: boolean;
  manager: {
    id: number;
    name: string;
    role: string;
    company_id?: number | null;
  } | null;
};

function buildActionKeyFromPrompt(input: string) {
  const normalized = String(input || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (normalized || "AUTOMATION_TASK").slice(0, 64);
}

export function ActionsPage() {
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [filterExecutor, setFilterExecutor] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [desiredEntity, setDesiredEntity] = useState("automation");
  const [ownerAgentId, setOwnerAgentId] = useState<string>("none");
  const [testBeforeActivate, setTestBeforeActivate] = useState(true);

  const automationManagerQuery = useQuery<AutomationManagerResponse>({
    queryKey: ["/api/actions/automation-manager?ensure=1"],
    queryFn: async () => apiRequest("/api/actions/automation-manager?ensure=1", "GET"),
  });

  const { data: agents = [] } = useQuery<any[]>({
    queryKey: ["/api/agents"],
    queryFn: async () => apiRequest("/api/agents", "GET"),
  });

  const generateAutomationMutation = useMutation({
    mutationFn: async () => {
      const desiredActionKey = buildActionKeyFromPrompt(generatePrompt);
      const forgeRequest = await apiRequest("/api/action-forge/requests", "POST", {
        desiredActionKey,
        desiredDescription: generatePrompt,
        desiredEntity,
        metadata: {
          ownerAgentId: ownerAgentId !== "none" ? Number(ownerAgentId) : null,
          source: "automations.generate_button",
        },
      });

      let dryRunResult: any = null;
      if (testBeforeActivate) {
        dryRunResult = await apiRequest("/api/actions/request", "POST", {
          actionType: "GOOGLE_SEARCH",
          payload: { query: generatePrompt.slice(0, 120) || "automation draft test" },
          dryRun: true,
          mode: "SIMULATED",
        });
      }

      return { forgeRequest, dryRunResult };
    },
    onSuccess: (result: any) => {
      const forgeId = result?.forgeRequest?.request?.id ?? result?.forgeRequest?.id ?? "pending";
      const actionRunId = result?.dryRunResult?.action_run_id ?? null;
      toast({
        title: "Automation request created",
        description: actionRunId
          ? `Forge request #${forgeId} created. Dry-run action #${actionRunId} completed.`
          : `Forge request #${forgeId} created.`,
      });
      setGenerateOpen(false);
      setGeneratePrompt("");
      setDesiredEntity("automation");
      setOwnerAgentId("none");
      setTestBeforeActivate(true);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to generate automation",
        description: error?.message || "Could not create automation request",
        variant: "destructive",
      });
    },
  });

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
      metadata: { participants: ["Platform Admin", "Sales Agent", "Finance Agent"], details: "Weekly Sales Review" }
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
      executedBy: "Chairman Assistant",
      executedByType: "agent",
      companyName: "Exportunity CI",
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      status: "success",
      metadata: { details: "Follow-up to lead prospects" }
    },
    {
      id: "4",
      actionCode: "google_calendar_create_event",
      actionName: "Create Calendar Event",
      category: "external",
      executedBy: "Platform Admin",
      executedByType: "chairman",
      companyName: "Flying Cars Lab",
      timestamp: new Date(Date.now() - 10800000).toISOString(),
      status: "success",
      metadata: { details: "Q4 Strategy Meeting scheduled" }
    },
    {
      id: "5",
      actionCode: "create_agent",
      actionName: "Create Agent",
      category: "platform",
      executedBy: "Platform Admin",
      executedByType: "chairman",
      companyName: "Exportunity CI",
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      status: "success",
      metadata: { details: "Marketing Agent for Ghana region" }
    },
  ];

  const totalActions = executedActions.length;
  const successRate = Math.round((executedActions.filter(a => a.status === "success").length / totalActions) * 100);
  const totalRevenue = executedActions.reduce((sum, a) => sum + (a.metadata?.revenue || 0), 0);

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

	return (
	    <div className="min-h-screen bg-gray-950 pb-24">
	      <div className="container mx-auto px-4 md:px-6 py-4 md:py-8 space-y-4 md:space-y-6">
	        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
	            <h1 className="text-xl md:text-3xl font-bold text-white">Automations</h1>
	            <p className="text-gray-400 text-sm mt-1">Automation catalog and execution history</p>
              <p className="text-xs text-gray-500 mt-2">
                Automation Manager:{" "}
                <span className="text-emerald-300">
                  {automationManagerQuery.data?.manager?.name || "Not assigned"}
                </span>
              </p>
            </div>
            <Button className="bg-blue-600 hover:bg-blue-700 gap-2 h-11" onClick={() => setGenerateOpen(true)}>
              <Wand2 className="h-4 w-4" />
              Generate Automation
            </Button>
	        </div>

        {/* Stats - horizontal scroll on mobile */}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-4">
          <Card className="bg-gray-900 border-gray-800 min-w-[140px] flex-shrink-0 md:min-w-0">
            <CardHeader className="pb-2 p-3 md:p-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs md:text-sm font-medium text-gray-400">Executions</CardTitle>
                <Activity className="h-4 w-4 text-blue-400" />
              </div>
            </CardHeader>
            <CardContent className="p-3 md:p-4 pt-0">
              <div className="text-xl md:text-2xl font-bold text-white">{totalActions}</div>
              <p className="text-xs text-gray-500 mt-1">All time</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800 min-w-[140px] flex-shrink-0 md:min-w-0">
            <CardHeader className="pb-2 p-3 md:p-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs md:text-sm font-medium text-gray-400">Success Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-400" />
              </div>
            </CardHeader>
            <CardContent className="p-3 md:p-4 pt-0">
              <div className="text-xl md:text-2xl font-bold text-white">{successRate}%</div>
              <p className="text-xs text-gray-500 mt-1">Completed</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800 min-w-[140px] flex-shrink-0 md:min-w-0">
            <CardHeader className="pb-2 p-3 md:p-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs md:text-sm font-medium text-gray-400">Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-emerald-400" />
              </div>
            </CardHeader>
            <CardContent className="p-3 md:p-4 pt-0">
              <div className="text-xl md:text-2xl font-bold text-white">${totalRevenue.toLocaleString()}</div>
              <p className="text-xs text-gray-500 mt-1">From actions</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800 min-w-[140px] flex-shrink-0 md:min-w-0">
            <CardHeader className="pb-2 p-3 md:p-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs md:text-sm font-medium text-gray-400">Types</CardTitle>
                <Settings className="h-4 w-4 text-purple-400" />
              </div>
            </CardHeader>
            <CardContent className="p-3 md:p-4 pt-0">
              <div className="text-xl md:text-2xl font-bold text-white">
                {ACTION_CATEGORIES.reduce((sum, cat) => sum + cat.actions.length, 0)}
              </div>
              <p className="text-xs text-gray-500 mt-1">Available</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="catalog" className="space-y-4 md:space-y-6">
          <TabsList className="bg-gray-900 border-gray-800 w-full sm:w-auto">
            <TabsTrigger value="catalog" className="flex-1 sm:flex-initial h-10">Catalog</TabsTrigger>
            <TabsTrigger value="history" className="flex-1 sm:flex-initial h-10">History</TabsTrigger>
          </TabsList>

          <TabsContent value="catalog" className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-1">
                <Input
                  placeholder="Search actions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-gray-900 border-gray-800 h-11"
                />
              </div>
              <Select value={selectedCategory || "all"} onValueChange={(v) => setSelectedCategory(v === "all" ? null : v)}>
                <SelectTrigger className="w-full sm:w-[200px] bg-gray-900 border-gray-800 h-11">
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

            <div className="space-y-4">
              {filteredCategories.map((category) => {
                const Icon = category.icon;
                return (
                  <Card key={category.id} className="bg-gray-900 border-gray-800">
                    <CardHeader className="p-4 md:p-6">
                      <div className="flex items-center gap-3">
                        <Icon className={`h-5 w-5 ${category.color}`} />
                        <CardTitle className="text-white text-base md:text-lg">{category.label}</CardTitle>
                        <Badge variant="outline" className="ml-auto text-xs">
                          {category.actions.length}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 md:p-6 pt-0">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {category.actions.map((action) => (
                          <Card key={action.code} className="bg-gray-800/50 border-gray-700">
                            <CardContent className="p-3 md:p-4">
                              <div className="space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className="text-sm font-medium text-white">{action.name}</h4>
                                  <Badge variant="secondary" className="text-[10px] md:text-xs flex-shrink-0">
                                    {action.code}
                                  </Badge>
                                </div>
                                <p className="text-xs text-gray-400 line-clamp-2">{action.description}</p>
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

          <TabsContent value="history" className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch gap-3 overflow-x-auto pb-2">
              <Select value={filterCompany} onValueChange={setFilterCompany}>
                <SelectTrigger className="w-full sm:w-[180px] bg-gray-900 border-gray-800 h-11 flex-shrink-0">
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
                <SelectTrigger className="w-full sm:w-[180px] bg-gray-900 border-gray-800 h-11 flex-shrink-0">
                  <SelectValue placeholder="All Executors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Executors</SelectItem>
                  <SelectItem value="Platform Admin">Platform Admin</SelectItem>
                  <SelectItem value="Chairman Assistant">Chairman Assistant</SelectItem>
                  <SelectItem value="Sales Agent">Sales Agent</SelectItem>
                  <SelectItem value="Finance Agent">Finance Agent</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-[160px] bg-gray-900 border-gray-800 h-11 flex-shrink-0">
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

            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-white text-base md:text-lg">Recent Executions</CardTitle>
                <CardDescription className="text-xs md:text-sm">{filteredExecutions.length} action{filteredExecutions.length !== 1 ? 's' : ''} found</CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-6 pt-0">
                <div className="space-y-3">
                  {filteredExecutions.map((action) => (
                    <Card key={action.id} className="bg-gray-800/50 border-gray-700">
                      <CardContent className="p-3 md:p-4">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="flex-1 space-y-2 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {getStatusIcon(action.status)}
                              <h4 className="text-sm font-medium text-white">{action.actionName}</h4>
                              <Badge variant="outline" className="text-xs">
                                {action.category}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center gap-3 md:gap-4 text-xs text-gray-400 flex-wrap">
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
                              <p className="text-xs md:text-sm text-gray-300">{action.metadata.details}</p>
                            )}

                            {action.metadata?.revenue && (
                              <div className="flex items-center gap-2">
                                <Badge variant="default" className="bg-green-500/10 text-green-400 text-xs">
                                  Revenue: ${action.metadata.revenue.toLocaleString()}
                                </Badge>
                              </div>
                            )}

                            {action.metadata?.participants && (
                              <div className="text-xs text-gray-400">
                                Participants: {action.metadata.participants.join(", ")}
                              </div>
                            )}
                          </div>

                          <Badge variant={action.status === "success" ? "default" : "destructive"} className="self-start flex-shrink-0">
                            {action.status}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {filteredExecutions.length === 0 && (
                    <div className="py-12 text-center">
                      <Filter className="h-12 w-12 md:h-16 md:w-16 text-gray-600 mx-auto mb-4" />
                      <h3 className="text-base md:text-lg font-medium text-gray-300">No actions found</h3>
                      <p className="text-gray-500 mt-2 text-sm">Try adjusting your filters</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
          <DialogContent className="bg-gray-900 border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white">Generate Automation</DialogTitle>
              <DialogDescription className="text-gray-400">
                Create a real Action Forge request from natural language, assign an owner agent, and optionally run a dry-run validation.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-200">Automation prompt</Label>
                <Textarea
                  value={generatePrompt}
                  onChange={(e) => setGeneratePrompt(e.target.value)}
                  placeholder="Describe the automation you want to generate..."
                  className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-gray-200">Entity</Label>
                  <Input
                    value={desiredEntity}
                    onChange={(e) => setDesiredEntity(e.target.value)}
                    placeholder="automation"
                    className="bg-gray-800 border-gray-700 text-white h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-200">Owner agent</Label>
                  <Select value={ownerAgentId} onValueChange={setOwnerAgentId}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-10">
                      <SelectValue placeholder="Select owner" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      <SelectItem value="none">Automation Manager</SelectItem>
                      {agents.map((agent: any) => (
                        <SelectItem key={agent.id} value={String(agent.id)}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={testBeforeActivate}
                  onChange={(e) => setTestBeforeActivate(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-600 bg-gray-800"
                />
                Test before activate (dry-run)
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" className="border-gray-700" onClick={() => setGenerateOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700"
                disabled={!generatePrompt.trim() || generateAutomationMutation.isPending}
                onClick={() => generateAutomationMutation.mutate()}
              >
                {generateAutomationMutation.isPending ? "Generating..." : "Generate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
