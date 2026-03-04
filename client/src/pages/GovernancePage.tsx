import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useCompany } from "@/hooks/use-company";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { 
  Scale, 
  Users, 
  Vote, 
  Shield, 
  Gavel, 
  Plus, 
  UserPlus, 
  PieChart, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  FileText,
  MessageSquare,
  Brain,
  Sparkles,
  Send,
  ChevronRight,
  Building2,
  Percent,
  Crown,
  TrendingUp,
  History,
  BookOpen,
  ArrowRight
} from "lucide-react";

interface Shareholder {
  id: number;
  companyId: number;
  shareholderName: string;
  shareholderType: string;
  sharePercentage: string;
  votingPower?: string;
  role?: string;
  createdAt: string;
}

interface GovernanceRule {
  id: number;
  company_id: number;
  rule_name: string;
  rule_description?: string;
  category: string;
  threshold_amount?: string;
  vote_type: string;
  is_active: boolean;
  created_at: string;
}

interface VotingSession {
  id: number;
  company_id: number;
  title: string;
  description?: string;
  proposal_type: string;
  proposed_amount?: string;
  status: string;
  votes_for: number;
  votes_against: number;
  votes_abstained: number;
  closes_at?: string;
  created_at: string;
}

interface AILawyerMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function GovernancePage() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState("overview");
  
  const [addShareholderDialogOpen, setAddShareholderDialogOpen] = useState(false);
  const [shareholderName, setShareholderName] = useState("");
  const [shareholderType, setShareholderType] = useState("individual");
  const [sharePercentage, setSharePercentage] = useState("");
  const [shareholderRole, setShareholderRole] = useState("");
  
  const [addRuleDialogOpen, setAddRuleDialogOpen] = useState(false);
  const [ruleName, setRuleName] = useState("");
  const [ruleDescription, setRuleDescription] = useState("");
  const [ruleCategory, setRuleCategory] = useState("financial");
  const [ruleThreshold, setRuleThreshold] = useState("");
  const [ruleVoteType, setRuleVoteType] = useState("majority");
  
  const [newProposalDialogOpen, setNewProposalDialogOpen] = useState(false);
  const [proposalTitle, setProposalTitle] = useState("");
  const [proposalDescription, setProposalDescription] = useState("");
  const [proposalType, setProposalType] = useState("spending");
  const [proposalAmount, setProposalAmount] = useState("");
  
  const [aiLawyerOpen, setAiLawyerOpen] = useState(false);
  const [aiLawyerQuery, setAiLawyerQuery] = useState("");
  const [aiLawyerMessages, setAiLawyerMessages] = useState<AILawyerMessage[]>([]);
  const [aiLawyerLoading, setAiLawyerLoading] = useState(false);

  const { data: shareholders, isLoading: loadingShareholders } = useQuery<Shareholder[]>({
    queryKey: [`/api/companies/${selectedCompanyId}/shareholders`],
    enabled: !!selectedCompanyId,
  });

  const { data: rules, isLoading: loadingRules } = useQuery<GovernanceRule[]>({
    queryKey: [`/api/companies/${selectedCompanyId}/governance-rules`],
    enabled: !!selectedCompanyId,
  });

  const { data: votingSessions, isLoading: loadingVotes } = useQuery<VotingSession[]>({
    queryKey: [`/api/companies/${selectedCompanyId}/voting-sessions`],
    enabled: !!selectedCompanyId,
  });

  const addShareholderMutation = useMutation({
    mutationFn: async (data: { shareholderName: string; shareholderType: string; sharePercentage: string; role?: string }) => {
      return apiRequest(`/api/companies/${selectedCompanyId}/shareholders`, {
        method: 'POST',
        body: JSON.stringify({
          shareholderName: data.shareholderName,
          shareholderType: data.shareholderType,
          sharePercentage: data.sharePercentage,
          role: data.role,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/shareholders`] });
      toast({ title: "Shareholder added", description: "New shareholder has been added to the cap table" });
      setAddShareholderDialogOpen(false);
      setShareholderName("");
      setShareholderType("individual");
      setSharePercentage("");
      setShareholderRole("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to add shareholder", variant: "destructive" });
    },
  });

  const addRuleMutation = useMutation({
    mutationFn: async (data: { ruleName: string; ruleDescription: string; category: string; thresholdAmount?: string; voteType: string }) => {
      return apiRequest(`/api/companies/${selectedCompanyId}/governance-rules`, {
        method: 'POST',
        body: JSON.stringify({
          ruleName: data.ruleName,
          ruleDescription: data.ruleDescription,
          category: data.category,
          thresholdAmount: data.thresholdAmount,
          voteType: data.voteType,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/governance-rules`] });
      toast({ title: "Rule added", description: "New governance rule has been created" });
      setAddRuleDialogOpen(false);
      setRuleName("");
      setRuleDescription("");
      setRuleCategory("financial");
      setRuleThreshold("");
      setRuleVoteType("majority");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to add rule", variant: "destructive" });
    },
  });

  const addProposalMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; proposalType: string; proposedAmount?: string }) => {
      return apiRequest(`/api/companies/${selectedCompanyId}/voting-sessions`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/voting-sessions`] });
      toast({ title: "Proposal created", description: "Voting session has been initiated" });
      setNewProposalDialogOpen(false);
      setProposalTitle("");
      setProposalDescription("");
      setProposalType("spending");
      setProposalAmount("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create proposal", variant: "destructive" });
    },
  });

  const castVoteMutation = useMutation({
    mutationFn: async (data: { sessionId: number; vote: 'for' | 'against' | 'abstain' }) => {
      return apiRequest(`/api/companies/${selectedCompanyId}/voting-sessions/${data.sessionId}/vote`, {
        method: 'POST',
        body: JSON.stringify({ vote: data.vote }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/voting-sessions`] });
      toast({ title: "Vote recorded", description: "Your vote has been cast" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to cast vote", variant: "destructive" });
    },
  });

  const handleAILawyerQuery = async () => {
    if (!aiLawyerQuery.trim()) return;
    
    const userMessage: AILawyerMessage = {
      role: 'user',
      content: aiLawyerQuery,
      timestamp: new Date(),
    };
    
    setAiLawyerMessages(prev => [...prev, userMessage]);
    setAiLawyerQuery("");
    setAiLawyerLoading(true);
    
    try {
      const response = await apiRequest(`/api/ai-lawyer/query?companyId=${selectedCompanyId}`, {
        method: 'POST',
        body: JSON.stringify({ 
          query: aiLawyerQuery,
          context: {
            shareholders: shareholders?.length || 0,
            rules: rules?.length || 0,
            activeVotingSessions: votingSessions?.filter(v => v.status === 'open').length || 0,
          }
        }),
      });
      
      const assistantMessage: AILawyerMessage = {
        role: 'assistant',
        content: response.response || "I apologize, but I couldn't process that request. Please try again.",
        timestamp: new Date(),
      };
      
      setAiLawyerMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: AILawyerMessage = {
        role: 'assistant',
        content: "I'm currently unable to provide legal guidance. This could be due to API limits. Please try again later or consult with a human legal professional.",
        timestamp: new Date(),
      };
      setAiLawyerMessages(prev => [...prev, errorMessage]);
    } finally {
      setAiLawyerLoading(false);
    }
  };

  const totalShares = shareholders?.reduce((sum, s) => sum + parseFloat(s.sharePercentage || '0'), 0) || 0;
  const activeRules = rules?.filter(r => r.is_active).length || 0;
  const openVotingSessions = votingSessions?.filter(v => v.status === 'open').length || 0;

  const getShareholderTypeColor = (type: string) => {
    switch (type) {
      case 'founder': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'investor': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'institution': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getProposalTypeIcon = (type: string) => {
    switch (type) {
      case 'spending': return <TrendingUp className="h-4 w-4" />;
      case 'hiring': return <UserPlus className="h-4 w-4" />;
      case 'contract': return <FileText className="h-4 w-4" />;
      case 'dividend': return <Percent className="h-4 w-4" />;
      case 'strategic': return <Brain className="h-4 w-4" />;
      case 'ownership_change': return <Users className="h-4 w-4" />;
      default: return <Vote className="h-4 w-4" />;
    }
  };

  if (!selectedCompanyId) {
    return (
      <div className="min-h-screen bg-gray-950 p-6 flex items-center justify-center">
        <Card className="bg-gray-900 border-gray-800 max-w-md">
          <CardContent className="pt-6 text-center">
            <Building2 className="h-12 w-12 text-gray-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No Company Selected</h2>
            <p className="text-gray-400">Please select a company to view governance settings.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Scale className="h-8 w-8 text-purple-400" />
              Governance
            </h1>
            <p className="text-gray-400 mt-1">Manage shareholders, voting, and company rules</p>
          </div>
          
          <Button 
            onClick={() => setAiLawyerOpen(true)}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          >
            <Gavel className="h-4 w-4 mr-2" />
            AI Lawyer Advisory
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-blue-500/20">
                  <Users className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{shareholders?.length || 0}</p>
                  <p className="text-sm text-gray-400">Shareholders</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-purple-500/20">
                  <PieChart className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{totalShares.toFixed(1)}%</p>
                  <p className="text-sm text-gray-400">Allocated</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-yellow-500/20">
                  <Shield className="h-5 w-5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{activeRules}</p>
                  <p className="text-sm text-gray-400">Active Rules</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-green-500/20">
                  <Vote className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{openVotingSessions}</p>
                  <p className="text-sm text-gray-400">Open Votes</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-gray-900 border border-gray-800 p-1">
            <TabsTrigger value="overview" className="data-[state=active]:bg-gray-800">
              <PieChart className="h-4 w-4 mr-2" />
              Cap Table
            </TabsTrigger>
            <TabsTrigger value="rules" className="data-[state=active]:bg-gray-800">
              <Shield className="h-4 w-4 mr-2" />
              Rules
            </TabsTrigger>
            <TabsTrigger value="voting" className="data-[state=active]:bg-gray-800">
              <Vote className="h-4 w-4 mr-2" />
              Voting
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-gray-800">
              <History className="h-4 w-4 mr-2" />
              History
            </TabsTrigger>
          </TabsList>

          {/* Cap Table Tab */}
          <TabsContent value="overview" className="space-y-6">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white flex items-center gap-2">
                      <PieChart className="h-5 w-5 text-blue-400" />
                      Capitalization Table
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                      Manage company ownership and shareholder rights
                    </CardDescription>
                  </div>
                  <Button onClick={() => setAddShareholderDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Shareholder
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingShareholders ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-20 bg-gray-800" />
                    ))}
                  </div>
                ) : shareholders && shareholders.length > 0 ? (
                  <div className="space-y-4">
                    {/* Ownership Progress */}
                    <div className="p-4 bg-gray-800 rounded-lg">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-400">Total Ownership Allocated</span>
                        <span className="text-white font-medium">{totalShares.toFixed(1)}%</span>
                      </div>
                      <Progress value={totalShares} className="h-2" />
                      {totalShares < 100 && (
                        <p className="text-xs text-gray-500 mt-2">
                          {(100 - totalShares).toFixed(1)}% unallocated
                        </p>
                      )}
                    </div>
                    
                    {/* Shareholders List */}
                    <div className="space-y-3">
                      {shareholders.map((shareholder) => (
                        <div 
                          key={shareholder.id} 
                          className="p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                {shareholder.shareholderType === 'founder' ? (
                                  <Crown className="h-6 w-6 text-white" />
                                ) : (
                                  <span className="text-lg font-bold text-white">
                                    {shareholder.shareholderName?.charAt(0).toUpperCase() || '?'}
                                  </span>
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium text-white">{shareholder.shareholderName}</h4>
                                  <Badge className={cn("text-xs", getShareholderTypeColor(shareholder.shareholderType))}>
                                    {shareholder.shareholderType}
                                  </Badge>
                                </div>
                                {shareholder.role && (
                                  <p className="text-sm text-gray-400">{shareholder.role}</p>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-white">
                                {parseFloat(shareholder.sharePercentage).toFixed(1)}%
                              </p>
                              <p className="text-sm text-gray-400">
                                Voting Power: {parseFloat(shareholder.votingPower || shareholder.sharePercentage).toFixed(1)}%
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Users className="h-12 w-12 text-gray-700 mx-auto mb-3" />
                    <p className="text-gray-500">No shareholders registered</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Add shareholders to track company ownership
                    </p>
                    <Button 
                      onClick={() => setAddShareholderDialogOpen(true)} 
                      variant="outline" 
                      className="mt-4 border-gray-700"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add First Shareholder
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Rules Tab */}
          <TabsContent value="rules" className="space-y-6">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Shield className="h-5 w-5 text-yellow-400" />
                      Governance Rules
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                      Define rules that govern company decisions and approvals
                    </CardDescription>
                  </div>
                  <Button onClick={() => setAddRuleDialogOpen(true)} className="bg-yellow-600 hover:bg-yellow-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Rule
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingRules ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-24 bg-gray-800" />
                    ))}
                  </div>
                ) : rules && rules.length > 0 ? (
                  <div className="space-y-4">
                    {rules.map((rule) => (
                      <div 
                        key={rule.id} 
                        className={cn(
                          "p-4 rounded-lg border transition-colors",
                          rule.is_active 
                            ? "bg-gray-800/50 border-gray-700" 
                            : "bg-gray-900/50 border-gray-800 opacity-60"
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-medium text-white">{rule.rule_name}</h4>
                              <Badge variant="outline" className="border-gray-700 text-gray-400">
                                {rule.category}
                              </Badge>
                              {rule.is_active ? (
                                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                                  Active
                                </Badge>
                              ) : (
                                <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">
                                  Inactive
                                </Badge>
                              )}
                            </div>
                            {rule.rule_description && (
                              <p className="text-sm text-gray-400 mb-3">{rule.rule_description}</p>
                            )}
                            <div className="flex items-center gap-4 text-sm">
                              {rule.threshold_amount && (
                                <span className="text-gray-500">
                                  Threshold: ${parseFloat(rule.threshold_amount).toLocaleString()}
                                </span>
                              )}
                              <span className="text-gray-500">
                                Vote Required: {rule.vote_type.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Shield className="h-12 w-12 text-gray-700 mx-auto mb-3" />
                    <p className="text-gray-500">No governance rules defined</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Create rules to automate approval workflows
                    </p>
                    <Button 
                      onClick={() => setAddRuleDialogOpen(true)} 
                      variant="outline" 
                      className="mt-4 border-gray-700"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Create First Rule
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Rule Templates */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white text-lg flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-blue-400" />
                  Suggested Rule Templates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-3">
                  {[
                    { name: "Large Purchase Approval", desc: "Require board approval for purchases over $10,000", category: "financial" },
                    { name: "New Hire Authorization", desc: "Platform admin approval needed for all new hires", category: "hiring" },
                    { name: "Contract Signing Authority", desc: "Legal review for contracts over $5,000", category: "legal" },
                    { name: "Dividend Distribution", desc: "Supermajority vote for dividend payments", category: "financial" },
                  ].map((template, i) => (
                    <div 
                      key={i}
                      className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors"
                      onClick={() => {
                        setRuleName(template.name);
                        setRuleDescription(template.desc);
                        setRuleCategory(template.category);
                        setAddRuleDialogOpen(true);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="font-medium text-white text-sm">{template.name}</h5>
                          <p className="text-xs text-gray-500 mt-1">{template.desc}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-gray-500" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Voting Tab */}
          <TabsContent value="voting" className="space-y-6">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Vote className="h-5 w-5 text-purple-400" />
                      Active Voting Sessions
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                      Vote on proposals and track decision outcomes
                    </CardDescription>
                  </div>
                  <Button onClick={() => setNewProposalDialogOpen(true)} className="bg-purple-600 hover:bg-purple-700">
                    <Plus className="h-4 w-4 mr-2" />
                    New Proposal
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingVotes ? (
                  <div className="space-y-3">
                    {[1, 2].map(i => (
                      <Skeleton key={i} className="h-32 bg-gray-800" />
                    ))}
                  </div>
                ) : votingSessions && votingSessions.length > 0 ? (
                  <div className="space-y-4">
                    {votingSessions.map((session) => {
                      const totalVotes = (session.votes_for || 0) + (session.votes_against || 0) + (session.votes_abstained || 0);
                      const forPercentage = totalVotes > 0 ? ((session.votes_for || 0) / totalVotes) * 100 : 0;
                      const againstPercentage = totalVotes > 0 ? ((session.votes_against || 0) / totalVotes) * 100 : 0;
                      
                      return (
                        <div 
                          key={session.id} 
                          className="p-5 bg-gray-800/50 rounded-lg border border-gray-700"
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-start gap-3">
                              <div className={cn(
                                "p-2 rounded-lg",
                                session.status === 'open' ? "bg-purple-500/20" : "bg-gray-500/20"
                              )}>
                                {getProposalTypeIcon(session.proposal_type)}
                              </div>
                              <div>
                                <h4 className="font-medium text-white">{session.title}</h4>
                                {session.description && (
                                  <p className="text-sm text-gray-400 mt-1">{session.description}</p>
                                )}
                                <div className="flex items-center gap-3 mt-2">
                                  <Badge variant="outline" className="border-gray-700 text-gray-400">
                                    {session.proposal_type.replace('_', ' ')}
                                  </Badge>
                                  {session.proposed_amount && (
                                    <span className="text-sm text-gray-500">
                                      Amount: ${parseFloat(session.proposed_amount).toLocaleString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <Badge className={cn(
                              session.status === 'open' 
                                ? "bg-green-500/20 text-green-400" 
                                : session.status === 'passed'
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-red-500/20 text-red-400"
                            )}>
                              {session.status}
                            </Badge>
                          </div>
                          
                          {/* Voting Progress */}
                          <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">Votes Cast: {totalVotes}</span>
                              <span className="text-white">
                                For: {session.votes_for || 0} | Against: {session.votes_against || 0} | Abstain: {session.votes_abstained || 0}
                              </span>
                            </div>
                            <div className="flex h-3 rounded-full overflow-hidden bg-gray-700">
                              <div 
                                className="bg-green-500 transition-all" 
                                style={{ width: `${forPercentage}%` }} 
                              />
                              <div 
                                className="bg-red-500 transition-all" 
                                style={{ width: `${againstPercentage}%` }} 
                              />
                              <div 
                                className="bg-gray-500 transition-all" 
                                style={{ width: `${totalVotes > 0 ? ((session.votes_abstained || 0) / totalVotes) * 100 : 0}%` }} 
                              />
                            </div>
                            
                            {session.status === 'open' && session.closes_at && (
                              <div className="flex items-center gap-2 text-sm text-yellow-400">
                                <Clock className="h-4 w-4" />
                                Closes {new Date(session.closes_at).toLocaleDateString()}
                              </div>
                            )}
                            
                            {session.status === 'open' && (
                              <div className="flex gap-2 pt-2">
                                <Button 
                                  size="sm" 
                                  className="flex-1 bg-green-600 hover:bg-green-700"
                                  onClick={() => castVoteMutation.mutate({ sessionId: session.id, vote: 'for' })}
                                  disabled={castVoteMutation.isPending}
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Vote For
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="flex-1 border-red-700 text-red-400 hover:bg-red-900/20"
                                  onClick={() => castVoteMutation.mutate({ sessionId: session.id, vote: 'against' })}
                                  disabled={castVoteMutation.isPending}
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Vote Against
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="border-gray-700 text-gray-400 hover:bg-gray-800"
                                  onClick={() => castVoteMutation.mutate({ sessionId: session.id, vote: 'abstain' })}
                                  disabled={castVoteMutation.isPending}
                                >
                                  Abstain
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Vote className="h-12 w-12 text-gray-700 mx-auto mb-3" />
                    <p className="text-gray-500">No voting sessions</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Create proposals that require shareholder approval
                    </p>
                    <Button 
                      onClick={() => setNewProposalDialogOpen(true)} 
                      variant="outline" 
                      className="mt-4 border-gray-700"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Create First Proposal
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-6">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <History className="h-5 w-5 text-gray-400" />
                  Decision History
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Track all governance decisions and outcomes
                </CardDescription>
              </CardHeader>
              <CardContent>
                {votingSessions && votingSessions.filter(v => v.status !== 'open').length > 0 ? (
                  <div className="space-y-3">
                    {votingSessions
                      .filter(v => v.status !== 'open')
                      .map((session) => (
                        <div 
                          key={session.id} 
                          className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg border border-gray-800"
                        >
                          <div className="flex items-center gap-3">
                            {session.status === 'passed' ? (
                              <CheckCircle className="h-5 w-5 text-green-400" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-400" />
                            )}
                            <div>
                              <h4 className="font-medium text-white">{session.title}</h4>
                              <p className="text-sm text-gray-500">
                                {new Date(session.created_at).toLocaleDateString()} • 
                                {session.votes_for} for, {session.votes_against} against
                              </p>
                            </div>
                          </div>
                          <Badge className={cn(
                            session.status === 'passed'
                              ? "bg-green-500/20 text-green-400"
                              : "bg-red-500/20 text-red-400"
                          )}>
                            {session.status}
                          </Badge>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <History className="h-12 w-12 text-gray-700 mx-auto mb-3" />
                    <p className="text-gray-500">No decision history yet</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Completed voting sessions will appear here
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Shareholder Dialog */}
      <Dialog open={addShareholderDialogOpen} onOpenChange={setAddShareholderDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-blue-400" />
              Add Shareholder
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Add a new shareholder to the cap table
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="shareholderName">Name</Label>
              <Input
                id="shareholderName"
                placeholder="Shareholder name"
                value={shareholderName}
                onChange={(e) => setShareholderName(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shareholderType">Type</Label>
              <Select value={shareholderType} onValueChange={setShareholderType}>
                <SelectTrigger className="bg-gray-800 border-gray-700">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="institution">Institution</SelectItem>
                  <SelectItem value="founder">Platform Admin</SelectItem>
                  <SelectItem value="investor">Investor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sharePercentage">Share Percentage (%)</Label>
              <Input
                id="sharePercentage"
                type="number"
                placeholder="0.00"
                value={sharePercentage}
                onChange={(e) => setSharePercentage(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
              {totalShares + parseFloat(sharePercentage || '0') > 100 && (
                <p className="text-xs text-red-400">
                  Warning: Total allocation would exceed 100%
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="shareholderRole">Role (optional)</Label>
              <Input
                id="shareholderRole"
                placeholder="e.g., Board Member, Advisor"
                value={shareholderRole}
                onChange={(e) => setShareholderRole(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddShareholderDialogOpen(false)} className="border-gray-700">
              Cancel
            </Button>
            <Button 
              onClick={() => addShareholderMutation.mutate({ 
                shareholderName, 
                shareholderType, 
                sharePercentage,
                role: shareholderRole || undefined
              })}
              disabled={!shareholderName || !sharePercentage || addShareholderMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {addShareholderMutation.isPending ? 'Adding...' : 'Add Shareholder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Rule Dialog */}
      <Dialog open={addRuleDialogOpen} onOpenChange={setAddRuleDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-yellow-400" />
              Add Governance Rule
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Create a new governance rule for company operations
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ruleName">Rule Name</Label>
              <Input
                id="ruleName"
                placeholder="e.g., Large Purchase Approval"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ruleDescription">Description</Label>
              <Textarea
                id="ruleDescription"
                placeholder="Describe when this rule applies..."
                value={ruleDescription}
                onChange={(e) => setRuleDescription(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ruleCategory">Category</Label>
              <Select value={ruleCategory} onValueChange={setRuleCategory}>
                <SelectTrigger className="bg-gray-800 border-gray-700">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="financial">Financial</SelectItem>
                  <SelectItem value="operational">Operational</SelectItem>
                  <SelectItem value="legal">Legal</SelectItem>
                  <SelectItem value="hiring">Hiring</SelectItem>
                  <SelectItem value="strategic">Strategic</SelectItem>
                  <SelectItem value="ownership">Ownership</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ruleThreshold">Threshold Amount (optional)</Label>
              <Input
                id="ruleThreshold"
                type="number"
                placeholder="Amount above which rule applies"
                value={ruleThreshold}
                onChange={(e) => setRuleThreshold(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ruleVoteType">Required Vote Type</Label>
              <Select value={ruleVoteType} onValueChange={setRuleVoteType}>
                <SelectTrigger className="bg-gray-800 border-gray-700">
                  <SelectValue placeholder="Select vote type" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="majority">Majority (50%+)</SelectItem>
                  <SelectItem value="supermajority">Supermajority (66%+)</SelectItem>
                  <SelectItem value="unanimous">Unanimous (100%)</SelectItem>
                  <SelectItem value="founder_only">Platform Admin Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRuleDialogOpen(false)} className="border-gray-700">
              Cancel
            </Button>
            <Button 
              onClick={() => addRuleMutation.mutate({ 
                ruleName, 
                ruleDescription, 
                category: ruleCategory,
                thresholdAmount: ruleThreshold || undefined,
                voteType: ruleVoteType
              })}
              disabled={!ruleName || addRuleMutation.isPending}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              {addRuleMutation.isPending ? 'Adding...' : 'Add Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Proposal Dialog */}
      <Dialog open={newProposalDialogOpen} onOpenChange={setNewProposalDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Vote className="h-5 w-5 text-purple-400" />
              Create New Proposal
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Create a new proposal for shareholder voting
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="proposalTitle">Title</Label>
              <Input
                id="proposalTitle"
                placeholder="Proposal title"
                value={proposalTitle}
                onChange={(e) => setProposalTitle(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proposalDescription">Description</Label>
              <Textarea
                id="proposalDescription"
                placeholder="Describe the proposal..."
                value={proposalDescription}
                onChange={(e) => setProposalDescription(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proposalType">Type</Label>
              <Select value={proposalType} onValueChange={setProposalType}>
                <SelectTrigger className="bg-gray-800 border-gray-700">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="spending">Spending Approval</SelectItem>
                  <SelectItem value="hiring">Hiring Decision</SelectItem>
                  <SelectItem value="contract">Contract Approval</SelectItem>
                  <SelectItem value="dividend">Dividend Distribution</SelectItem>
                  <SelectItem value="strategic">Strategic Decision</SelectItem>
                  <SelectItem value="ownership_change">Ownership Change</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(proposalType === 'spending' || proposalType === 'dividend') && (
              <div className="space-y-2">
                <Label htmlFor="proposalAmount">Amount (USD)</Label>
                <Input
                  id="proposalAmount"
                  type="number"
                  placeholder="0.00"
                  value={proposalAmount}
                  onChange={(e) => setProposalAmount(e.target.value)}
                  className="bg-gray-800 border-gray-700"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewProposalDialogOpen(false)} className="border-gray-700">
              Cancel
            </Button>
            <Button 
              onClick={() => addProposalMutation.mutate({ 
                title: proposalTitle, 
                description: proposalDescription, 
                proposalType,
                proposedAmount: proposalAmount || undefined
              })}
              disabled={!proposalTitle || addProposalMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {addProposalMutation.isPending ? 'Creating...' : 'Create Proposal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Lawyer Dialog */}
      <Dialog open={aiLawyerOpen} onOpenChange={setAiLawyerOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600">
                <Gavel className="h-5 w-5 text-white" />
              </div>
              AI Lawyer Advisory
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Get guidance on corporate governance, contracts, and compliance
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col h-[400px]">
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-4">
                {aiLawyerMessages.length === 0 ? (
                  <div className="text-center py-8">
                    <Sparkles className="h-12 w-12 text-purple-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">
                      How can I help with governance?
                    </h3>
                    <p className="text-sm text-gray-400 mb-6">
                      Ask me about shareholder agreements, voting procedures, or corporate compliance
                    </p>
                    <div className="grid grid-cols-1 gap-2 max-w-md mx-auto">
                      {[
                        "What voting threshold should I use for major decisions?",
                        "How do I properly document board resolutions?",
                        "What are standard anti-dilution provisions?",
                      ].map((suggestion, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          className="border-gray-700 text-gray-300 hover:bg-gray-800 justify-start text-left h-auto py-2 px-3"
                          onClick={() => {
                            setAiLawyerQuery(suggestion);
                          }}
                        >
                          <ChevronRight className="h-4 w-4 mr-2 flex-shrink-0" />
                          <span className="text-sm">{suggestion}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  aiLawyerMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex gap-3",
                        msg.role === 'user' ? "justify-end" : "justify-start"
                      )}
                    >
                      {msg.role === 'assistant' && (
                        <div className="p-2 rounded-lg bg-purple-500/20 h-fit">
                          <Gavel className="h-4 w-4 text-purple-400" />
                        </div>
                      )}
                      <div
                        className={cn(
                          "max-w-[80%] rounded-lg p-3",
                          msg.role === 'user'
                            ? "bg-blue-600 text-white"
                            : "bg-gray-800 text-gray-100"
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <p className="text-xs opacity-50 mt-1">
                          {msg.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                {aiLawyerLoading && (
                  <div className="flex gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/20 h-fit">
                      <Gavel className="h-4 w-4 text-purple-400" />
                    </div>
                    <div className="bg-gray-800 rounded-lg p-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-100" />
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-200" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
            
            <div className="mt-4 flex gap-2">
              <Input
                placeholder="Ask about governance, contracts, compliance..."
                value={aiLawyerQuery}
                onChange={(e) => setAiLawyerQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAILawyerQuery();
                  }
                }}
                className="bg-gray-800 border-gray-700"
              />
              <Button 
                onClick={handleAILawyerQuery}
                disabled={!aiLawyerQuery.trim() || aiLawyerLoading}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            
            <p className="text-xs text-gray-500 mt-2 text-center">
              AI-generated guidance. Consult a legal professional for binding advice.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default GovernancePage;
