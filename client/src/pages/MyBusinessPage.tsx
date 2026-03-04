import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/hooks/use-company";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { 
  Wallet, 
  Building2, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Users, 
  Vote, 
  Scale, 
  PieChart, 
  ArrowUpRight, 
  ArrowDownRight,
  Plus,
  Settings,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  Gavel,
  Send,
  Download,
  Upload,
  ArrowRightLeft,
  UserPlus,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface WalletData {
  id: number;
  owner_type: string;
  wallet_type: string;
  name: string;
  balance: string;
  currency: string;
  pending_inbound: string;
  pending_outbound: string;
}

interface WalletTransaction {
  id: number;
  transaction_type: string;
  amount: string;
  currency: string;
  category: string | null;
  description: string | null;
  status: string;
  created_at: string;
}

interface Shareholder {
  id: number;
  shareholderName: string;
  shareholderType: string;
  sharePercentage: string;
  role: string | null;
  metadata: Record<string, unknown> | null;
}

interface GovernanceRule {
  id: number;
  rule_name: string;
  rule_description: string | null;
  category: string;
  threshold_amount: string | null;
  vote_type: string;
  is_active: boolean;
}

interface VotingSession {
  id: number;
  title: string;
  description: string | null;
  proposal_type: string;
  status: string;
  votes_for: number;
  votes_against: number;
  votes_abstained: number;
  closes_at: string | null;
  outcome: string | null;
}

interface AccountingData {
  revenue: number;
  expenses: number;
  profit: number;
  revenueChange: number;
  expenseChange: number;
  profitChange: number;
  monthlyBreakdown: { month: string; revenue: number; expenses: number }[];
}

export function MyBusinessPage() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: wallets, isLoading: loadingWallets } = useQuery<WalletData[]>({
    queryKey: [`/api/companies/${selectedCompanyId}/wallets`],
    enabled: !!selectedCompanyId
  });

  const { data: transactions, isLoading: loadingTransactions } = useQuery<WalletTransaction[]>({
    queryKey: [`/api/companies/${selectedCompanyId}/wallet-transactions`],
    enabled: !!selectedCompanyId
  });

  const { data: shareholders, isLoading: loadingShareholders } = useQuery<Shareholder[]>({
    queryKey: [`/api/companies/${selectedCompanyId}/shareholders`],
    enabled: !!selectedCompanyId
  });

  const { data: governanceRules, isLoading: loadingRules } = useQuery<GovernanceRule[]>({
    queryKey: [`/api/companies/${selectedCompanyId}/governance-rules`],
    enabled: !!selectedCompanyId
  });

  const { data: votingSessions, isLoading: loadingVotes } = useQuery<VotingSession[]>({
    queryKey: [`/api/companies/${selectedCompanyId}/voting-sessions`],
    enabled: !!selectedCompanyId
  });

  const { data: accountingData, isLoading: loadingAccounting } = useQuery<AccountingData>({
    queryKey: [`/api/companies/${selectedCompanyId}/accounting`],
    enabled: !!selectedCompanyId
  });

  // Dialog states
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [addShareholderDialogOpen, setAddShareholderDialogOpen] = useState(false);
  const [newProposalDialogOpen, setNewProposalDialogOpen] = useState(false);
  const [addRuleDialogOpen, setAddRuleDialogOpen] = useState(false);
  const [addTransactionDialogOpen, setAddTransactionDialogOpen] = useState(false);

  // Form states
  const [depositAmount, setDepositAmount] = useState('');
  const [depositDescription, setDepositDescription] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawDescription, setWithdrawDescription] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDescription, setTransferDescription] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutDescription, setPayoutDescription] = useState('');
  
  // Shareholder form
  const [shareholderName, setShareholderName] = useState('');
  const [shareholderType, setShareholderType] = useState('individual');
  const [sharePercentage, setSharePercentage] = useState('');
  const [shareholderRole, setShareholderRole] = useState('');
  
  // Proposal form
  const [proposalTitle, setProposalTitle] = useState('');
  const [proposalDescription, setProposalDescription] = useState('');
  const [proposalType, setProposalType] = useState('spending');
  const [proposalAmount, setProposalAmount] = useState('');
  
  // Rule form
  const [ruleName, setRuleName] = useState('');
  const [ruleDescription, setRuleDescription] = useState('');
  const [ruleCategory, setRuleCategory] = useState('financial');
  const [ruleThreshold, setRuleThreshold] = useState('');
  const [ruleVoteType, setRuleVoteType] = useState('majority');

  // Transaction form
  const [txType, setTxType] = useState<'revenue' | 'expense'>('revenue');
  const [txAmount, setTxAmount] = useState('');
  const [txDescription, setTxDescription] = useState('');
  const [txCategory, setTxCategory] = useState('');

  // Initialize wallets if needed
  const initializeWalletsMutation = useMutation({
    mutationFn: () => apiRequest(`/api/companies/${selectedCompanyId}/wallets/initialize`, 'POST'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/wallets`] });
    }
  });

  useEffect(() => {
    if (selectedCompanyId && wallets?.length === 0) {
      initializeWalletsMutation.mutate();
    }
  }, [selectedCompanyId, wallets]);

  const personalWallet = wallets?.find(w => w.wallet_type === 'personal');
  const companyWallet = wallets?.find(w => w.wallet_type === 'company_operating');

  // Mutations
  const depositMutation = useMutation({
    mutationFn: (data: { amount: string; description: string }) => 
      apiRequest(`/api/companies/${selectedCompanyId}/wallets/${personalWallet?.id}/deposit`, 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/wallets`] });
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/wallet-transactions`] });
      toast({ title: "Deposit successful", description: `$${depositAmount} has been added to your wallet` });
      setDepositDialogOpen(false);
      setDepositAmount('');
      setDepositDescription('');
    },
    onError: (error: Error) => {
      toast({ title: "Deposit failed", description: error.message, variant: "destructive" });
    }
  });

  const withdrawMutation = useMutation({
    mutationFn: (data: { amount: string; description: string }) => 
      apiRequest(`/api/companies/${selectedCompanyId}/wallets/${personalWallet?.id}/withdraw`, 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/wallets`] });
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/wallet-transactions`] });
      toast({ title: "Withdrawal successful", description: `$${withdrawAmount} has been withdrawn` });
      setWithdrawDialogOpen(false);
      setWithdrawAmount('');
      setWithdrawDescription('');
    },
    onError: (error: Error) => {
      toast({ title: "Withdrawal failed", description: error.message, variant: "destructive" });
    }
  });

  const transferMutation = useMutation({
    mutationFn: (data: { fromWalletId: number; toWalletId: number; amount: string; description: string }) => 
      apiRequest(`/api/companies/${selectedCompanyId}/wallets/transfer`, 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/wallets`] });
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/wallet-transactions`] });
      toast({ title: "Transfer successful", description: `$${transferAmount} transferred to company wallet` });
      setTransferDialogOpen(false);
      setTransferAmount('');
      setTransferDescription('');
    },
    onError: (error: Error) => {
      toast({ title: "Transfer failed", description: error.message, variant: "destructive" });
    }
  });

  const payoutMutation = useMutation({
    mutationFn: (data: { amount: string; description: string }) => 
      apiRequest(`/api/companies/${selectedCompanyId}/wallets/${companyWallet?.id}/request-payout`, 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/wallets`] });
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/wallet-transactions`] });
      toast({ title: "Payout requested", description: `Payout of $${payoutAmount} is pending approval` });
      setPayoutDialogOpen(false);
      setPayoutAmount('');
      setPayoutDescription('');
    },
    onError: (error: Error) => {
      toast({ title: "Payout request failed", description: error.message, variant: "destructive" });
    }
  });

  const addShareholderMutation = useMutation({
    mutationFn: (data: { shareholderName: string; shareholderType: string; sharePercentage: string; role?: string }) => 
      apiRequest(`/api/companies/${selectedCompanyId}/shareholders`, 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/shareholders`] });
      toast({ title: "Shareholder added", description: `${shareholderName} has been added` });
      setAddShareholderDialogOpen(false);
      setShareholderName('');
      setShareholderType('individual');
      setSharePercentage('');
      setShareholderRole('');
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add shareholder", description: error.message, variant: "destructive" });
    }
  });

  const deleteShareholderMutation = useMutation({
    mutationFn: (shareholderId: number) => 
      apiRequest(`/api/companies/${selectedCompanyId}/shareholders/${shareholderId}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/shareholders`] });
      toast({ title: "Shareholder removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove shareholder", description: error.message, variant: "destructive" });
    }
  });

  const addProposalMutation = useMutation({
    mutationFn: (data: { title: string; description: string; proposalType: string; proposedAmount?: string }) => 
      apiRequest(`/api/companies/${selectedCompanyId}/voting-sessions`, 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/voting-sessions`] });
      toast({ title: "Proposal created", description: "Voting session is now open" });
      setNewProposalDialogOpen(false);
      setProposalTitle('');
      setProposalDescription('');
      setProposalType('spending');
      setProposalAmount('');
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create proposal", description: error.message, variant: "destructive" });
    }
  });

  const castVoteMutation = useMutation({
    mutationFn: ({ sessionId, vote }: { sessionId: number; vote: 'for' | 'against' | 'abstain' }) => 
      apiRequest(`/api/companies/${selectedCompanyId}/voting-sessions/${sessionId}/vote`, 'POST', { vote }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/voting-sessions`] });
      toast({ title: "Vote recorded" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to cast vote", description: error.message, variant: "destructive" });
    }
  });

  const addRuleMutation = useMutation({
    mutationFn: (data: { ruleName: string; ruleDescription: string; category: string; thresholdAmount?: string; voteType: string }) => 
      apiRequest(`/api/companies/${selectedCompanyId}/governance-rules`, 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/governance-rules`] });
      toast({ title: "Governance rule added" });
      setAddRuleDialogOpen(false);
      setRuleName('');
      setRuleDescription('');
      setRuleCategory('financial');
      setRuleThreshold('');
      setRuleVoteType('majority');
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add rule", description: error.message, variant: "destructive" });
    }
  });

  const addTransactionMutation = useMutation({
    mutationFn: (data: { type: string; amount: string; description: string; category?: string }) => 
      apiRequest(`/api/companies/${selectedCompanyId}/transactions`, 'POST', {
        ...data,
        direction: data.type === 'revenue' ? 'credit' : 'debit'
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${selectedCompanyId}/accounting`] });
      toast({ title: "Transaction recorded" });
      setAddTransactionDialogOpen(false);
      setTxType('revenue');
      setTxAmount('');
      setTxDescription('');
      setTxCategory('');
    },
    onError: (error: Error) => {
      toast({ title: "Failed to record transaction", description: error.message, variant: "destructive" });
    }
  });
  
  const totalBalance = wallets?.reduce((sum, w) => sum + parseFloat(w.balance), 0) || 0;
  const totalShareholders = shareholders?.length || 0;
  const pendingVotes = votingSessions?.filter(v => v.status === 'open').length || 0;

  const formatCurrency = (amount: number | string, currency = 'USD') => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(num);
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'deposit':
      case 'revenue':
      case 'transfer_in':
        return <ArrowUpRight className="h-4 w-4 text-green-400" />;
      case 'withdrawal':
      case 'expense':
      case 'transfer_out':
      case 'fee':
        return <ArrowDownRight className="h-4 w-4 text-red-400" />;
      case 'dividend':
        return <PieChart className="h-4 w-4 text-purple-400" />;
      default:
        return <DollarSign className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-900/20 text-yellow-400 border-yellow-700">Pending</Badge>;
      case 'approved':
      case 'completed':
        return <Badge variant="outline" className="bg-green-900/20 text-green-400 border-green-700">Approved</Badge>;
      case 'rejected':
      case 'failed':
        return <Badge variant="outline" className="bg-red-900/20 text-red-400 border-red-700">Rejected</Badge>;
      default:
        return <Badge variant="outline" className="bg-gray-700/20 text-gray-400 border-gray-600">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-lg border border-gray-800 bg-gradient-to-br from-emerald-950/30 via-gray-900 to-blue-950/30 p-8">
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-8 w-8 text-emerald-400" />
              <h1 className="text-3xl font-bold text-white">My Business</h1>
            </div>
            <p className="text-gray-300 text-lg mb-6 max-w-2xl">
              Manage your wallets, track finances, and oversee company governance
            </p>
            
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="bg-gray-900/50 border-gray-800 backdrop-blur">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-lg">
                      <Wallet className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Total Balance</p>
                      <p className="text-xl font-bold text-white">{formatCurrency(totalBalance)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-gray-900/50 border-gray-800 backdrop-blur">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                      <Users className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Shareholders</p>
                      <p className="text-xl font-bold text-white">{totalShareholders}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-gray-900/50 border-gray-800 backdrop-blur">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                      <Vote className="h-5 w-5 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Pending Votes</p>
                      <p className="text-xl font-bold text-white">{pendingVotes}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-gray-900/50 border-gray-800 backdrop-blur">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-yellow-500/10 rounded-lg">
                      <TrendingUp className="h-5 w-5 text-yellow-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">This Month</p>
                      <p className="text-xl font-bold text-white">
                        {accountingData ? formatCurrency(accountingData.profit) : '$0.00'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          
          <div className="absolute -top-16 -right-16 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl" />
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="wallets" className="space-y-6">
          <TabsList className="bg-gray-900 border border-gray-800 p-1">
            <TabsTrigger value="wallets" className="data-[state=active]:bg-gray-800 data-[state=active]:text-white gap-2">
              <Wallet className="h-4 w-4" />
              Wallets
            </TabsTrigger>
            <TabsTrigger value="accounting" className="data-[state=active]:bg-gray-800 data-[state=active]:text-white gap-2">
              <TrendingUp className="h-4 w-4" />
              Accounting
            </TabsTrigger>
            <TabsTrigger value="governance" className="data-[state=active]:bg-gray-800 data-[state=active]:text-white gap-2">
              <Gavel className="h-4 w-4" />
              Governance
            </TabsTrigger>
          </TabsList>

          {/* Wallets Tab */}
          <TabsContent value="wallets" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Personal Wallet */}
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500/10 rounded-lg">
                        <Wallet className="h-5 w-5 text-blue-400" />
                      </div>
                      <div>
                        <CardTitle className="text-white">Personal Wallet</CardTitle>
                        <CardDescription>Your personal funds</CardDescription>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="border-gray-700 text-gray-300" onClick={() => setDepositDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Funds
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingWallets ? (
                    <Skeleton className="h-16 bg-gray-800" />
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <p className="text-3xl font-bold text-white">
                          {personalWallet ? formatCurrency(personalWallet.balance, personalWallet.currency) : '$0.00'}
                        </p>
                        {personalWallet && parseFloat(personalWallet.pending_inbound || '0') > 0 && (
                          <p className="text-sm text-yellow-400">
                            +{formatCurrency(personalWallet.pending_inbound)} pending
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => setDepositDialogOpen(true)}>
                          <Upload className="h-4 w-4 mr-1" />
                          Deposit
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 border-gray-700 text-gray-300" onClick={() => setWithdrawDialogOpen(true)}>
                          <Download className="h-4 w-4 mr-1" />
                          Withdraw
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Company Wallet */}
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-500/10 rounded-lg">
                        <Building2 className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div>
                        <CardTitle className="text-white">Company Wallet</CardTitle>
                        <CardDescription>Operating funds</CardDescription>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="border-gray-700 text-gray-300" onClick={() => setTransferDialogOpen(true)}>
                      <Settings className="h-4 w-4 mr-1" />
                      Manage
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingWallets ? (
                    <Skeleton className="h-16 bg-gray-800" />
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <p className="text-3xl font-bold text-white">
                          {companyWallet ? formatCurrency(companyWallet.balance, companyWallet.currency) : '$0.00'}
                        </p>
                        {companyWallet && parseFloat(companyWallet.pending_outbound || '0') > 0 && (
                          <p className="text-sm text-orange-400">
                            -{formatCurrency(companyWallet.pending_outbound)} pending payout
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setTransferDialogOpen(true)}>
                          <ArrowRightLeft className="h-4 w-4 mr-1" />
                          Transfer In
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 border-gray-700 text-gray-300" onClick={() => setPayoutDialogOpen(true)}>
                          <Send className="h-4 w-4 mr-1" />
                          Request Payout
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Recent Transactions */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white">Recent Transactions</CardTitle>
                  <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                    View All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  {loadingTransactions ? (
                    <div className="space-y-3">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-16 bg-gray-800" />
                      ))}
                    </div>
                  ) : transactions && transactions.length > 0 ? (
                    <div className="space-y-3">
                      {transactions.slice(0, 10).map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-gray-800 rounded-full">
                              {getTransactionIcon(tx.transaction_type)}
                            </div>
                            <div>
                              <p className="text-white font-medium capitalize">
                                {tx.transaction_type.replace('_', ' ')}
                              </p>
                              <p className="text-sm text-gray-400">
                                {tx.description || tx.category || 'Transaction'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={cn(
                              "font-medium",
                              ['deposit', 'revenue', 'transfer_in'].includes(tx.transaction_type) 
                                ? "text-green-400" 
                                : "text-red-400"
                            )}>
                              {['deposit', 'revenue', 'transfer_in'].includes(tx.transaction_type) ? '+' : '-'}
                              {formatCurrency(tx.amount, tx.currency)}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(tx.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Wallet className="h-12 w-12 text-gray-700 mb-3" />
                      <p className="text-gray-500">No transactions yet</p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Accounting Tab */}
          <TabsContent value="accounting" className="space-y-6">
            {/* Header with Record Transaction Button */}
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-white">Financial Overview</h2>
              <Button onClick={() => setAddTransactionDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-1" />
                Record Transaction
              </Button>
            </div>
            
            {/* Financial Overview */}
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-400" />
                    Revenue
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingAccounting ? (
                    <Skeleton className="h-16 bg-gray-800" />
                  ) : (
                    <div>
                      <p className="text-3xl font-bold text-white">
                        {formatCurrency(accountingData?.revenue || 0)}
                      </p>
                      <p className={cn(
                        "text-sm flex items-center gap-1",
                        (accountingData?.revenueChange || 0) >= 0 ? "text-green-400" : "text-red-400"
                      )}>
                        {(accountingData?.revenueChange || 0) >= 0 ? (
                          <ArrowUpRight className="h-4 w-4" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4" />
                        )}
                        {Math.abs(accountingData?.revenueChange || 0).toFixed(1)}% from last month
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-red-400" />
                    Expenses
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingAccounting ? (
                    <Skeleton className="h-16 bg-gray-800" />
                  ) : (
                    <div>
                      <p className="text-3xl font-bold text-white">
                        {formatCurrency(accountingData?.expenses || 0)}
                      </p>
                      <p className={cn(
                        "text-sm flex items-center gap-1",
                        (accountingData?.expenseChange || 0) <= 0 ? "text-green-400" : "text-red-400"
                      )}>
                        {(accountingData?.expenseChange || 0) <= 0 ? (
                          <ArrowDownRight className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                        {Math.abs(accountingData?.expenseChange || 0).toFixed(1)}% from last month
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-yellow-400" />
                    Net Profit
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingAccounting ? (
                    <Skeleton className="h-16 bg-gray-800" />
                  ) : (
                    <div>
                      <p className={cn(
                        "text-3xl font-bold",
                        (accountingData?.profit || 0) >= 0 ? "text-green-400" : "text-red-400"
                      )}>
                        {formatCurrency(accountingData?.profit || 0)}
                      </p>
                      <p className={cn(
                        "text-sm flex items-center gap-1",
                        (accountingData?.profitChange || 0) >= 0 ? "text-green-400" : "text-red-400"
                      )}>
                        {(accountingData?.profitChange || 0) >= 0 ? (
                          <ArrowUpRight className="h-4 w-4" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4" />
                        )}
                        {Math.abs(accountingData?.profitChange || 0).toFixed(1)}% from last month
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Shareholder Payout Calculator */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <PieChart className="h-5 w-5 text-purple-400" />
                  Shareholder Distribution Preview
                </CardTitle>
                <CardDescription>
                  Based on current profit and ownership percentages
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingShareholders ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-12 bg-gray-800" />
                    ))}
                  </div>
                ) : shareholders && shareholders.length > 0 ? (
                  <div className="space-y-4">
                    {shareholders.map((sh) => {
                      const potentialPayout = (accountingData?.profit || 0) * (parseFloat(sh.sharePercentage) / 100);
                      return (
                        <div key={sh.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-500/10 rounded-full">
                              <Users className="h-4 w-4 text-purple-400" />
                            </div>
                            <div>
                              <p className="text-white font-medium">{sh.shareholderName}</p>
                              <p className="text-sm text-gray-400 capitalize">{sh.shareholderType}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-white font-medium">{sh.sharePercentage}%</p>
                            <p className="text-sm text-purple-400">
                              {formatCurrency(potentialPayout)} potential
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <Button className="w-full bg-purple-600 hover:bg-purple-700">
                      <Vote className="h-4 w-4 mr-2" />
                      Propose Dividend Distribution
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-gray-700 mx-auto mb-3" />
                    <p className="text-gray-500">No shareholders configured</p>
                    <Button variant="outline" size="sm" className="mt-3 border-gray-700 text-gray-300">
                      Add Shareholders
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Governance Tab */}
          <TabsContent value="governance" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Cap Table */}
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white flex items-center gap-2">
                      <PieChart className="h-5 w-5 text-blue-400" />
                      Capitalization Table
                    </CardTitle>
                    <Button variant="outline" size="sm" className="border-gray-700 text-gray-300" onClick={() => setAddShareholderDialogOpen(true)}>
                      <UserPlus className="h-4 w-4 mr-1" />
                      Add Shareholder
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px]">
                    {loadingShareholders ? (
                      <div className="space-y-3">
                        {[...Array(4)].map((_, i) => (
                          <Skeleton key={i} className="h-16 bg-gray-800" />
                        ))}
                      </div>
                    ) : shareholders && shareholders.length > 0 ? (
                      <div className="space-y-3">
                        {shareholders.map((sh) => (
                          <div key={sh.id} className="p-3 bg-gray-800/50 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <p className="text-white font-medium">{sh.shareholderName}</p>
                                <p className="text-xs text-gray-400 capitalize">{sh.shareholderType}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xl font-bold text-white">{sh.sharePercentage}%</p>
                              </div>
                            </div>
                            <Progress value={parseFloat(sh.sharePercentage)} className="h-2" />
                            <div className="flex gap-2 mt-2">
                              {!!(sh.metadata as any)?.votingRights && (
                                <Badge variant="outline" className="text-xs bg-blue-900/20 text-blue-400 border-blue-700">
                                  Voting Rights
                                </Badge>
                              )}
                              {!!(sh.metadata as any)?.boardSeat && (
                                <Badge variant="outline" className="text-xs bg-purple-900/20 text-purple-400 border-purple-700">
                                  Board Seat
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Users className="h-12 w-12 text-gray-700 mx-auto mb-3" />
                        <p className="text-gray-500">No shareholders yet</p>
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Voting Rules */}
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white flex items-center gap-2">
                      <Scale className="h-5 w-5 text-yellow-400" />
                      Voting Rules
                    </CardTitle>
                    <Button variant="outline" size="sm" className="border-gray-700 text-gray-300" onClick={() => setAddRuleDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Rule
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px]">
                    {loadingRules ? (
                      <div className="space-y-3">
                        {[...Array(4)].map((_, i) => (
                          <Skeleton key={i} className="h-16 bg-gray-800" />
                        ))}
                      </div>
                    ) : governanceRules && governanceRules.length > 0 ? (
                      <div className="space-y-3">
                        {governanceRules.map((rule) => (
                          <div key={rule.id} className="p-3 bg-gray-800/50 rounded-lg">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-white font-medium">{rule.rule_name}</p>
                                <p className="text-xs text-gray-400">{rule.rule_description}</p>
                              </div>
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "text-xs",
                                  rule.is_active 
                                    ? "bg-green-900/20 text-green-400 border-green-700"
                                    : "bg-gray-700/20 text-gray-400 border-gray-600"
                                )}
                              >
                                {rule.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                            <div className="flex gap-2 mt-2">
                              <Badge variant="outline" className="text-xs bg-gray-700/50 text-gray-300 border-gray-600">
                                {rule.category}
                              </Badge>
                              <Badge variant="outline" className="text-xs bg-gray-700/50 text-gray-300 border-gray-600">
                                {rule.vote_type}
                              </Badge>
                              {rule.threshold_amount && (
                                <Badge variant="outline" className="text-xs bg-yellow-900/20 text-yellow-400 border-yellow-700">
                                  &gt; {formatCurrency(rule.threshold_amount)}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Scale className="h-12 w-12 text-gray-700 mx-auto mb-3" />
                        <p className="text-gray-500">No governance rules configured</p>
                        <p className="text-xs text-gray-600 mt-1">
                          Set up rules for spending limits, approvals, and voting requirements
                        </p>
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Active Voting Sessions */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2">
                    <Vote className="h-5 w-5 text-purple-400" />
                    Voting Sessions
                  </CardTitle>
                  <Button className="bg-purple-600 hover:bg-purple-700" onClick={() => setNewProposalDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    New Proposal
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingVotes ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-24 bg-gray-800" />
                    ))}
                  </div>
                ) : votingSessions && votingSessions.length > 0 ? (
                  <div className="space-y-4">
                    {votingSessions.map((session) => {
                      const totalVotes = (session.votes_for || 0) + (session.votes_against || 0) + (session.votes_abstained || 0);
                      const forPercentage = totalVotes > 0 ? ((session.votes_for || 0) / totalVotes) * 100 : 0;
                      
                      return (
                        <div key={session.id} className="p-4 bg-gray-800/50 rounded-lg border border-gray-800">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="text-white font-medium">{session.title}</p>
                              <p className="text-sm text-gray-400">{session.description}</p>
                            </div>
                            {getStatusBadge(session.status)}
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">Votes</span>
                              <span className="text-white">
                                For: {session.votes_for || 0} | Against: {session.votes_against || 0} | Abstain: {session.votes_abstained || 0}
                              </span>
                            </div>
                            <div className="flex h-2 rounded-full overflow-hidden bg-gray-700">
                              <div 
                                className="bg-green-500" 
                                style={{ width: `${forPercentage}%` }} 
                              />
                              <div 
                                className="bg-red-500" 
                                style={{ width: `${totalVotes > 0 ? ((session.votes_against || 0) / totalVotes) * 100 : 0}%` }} 
                              />
                              <div 
                                className="bg-gray-500" 
                                style={{ width: `${totalVotes > 0 ? ((session.votes_abstained || 0) / totalVotes) * 100 : 0}%` }} 
                              />
                            </div>
                          </div>
                          
                          {session.status === 'open' && session.closes_at && (
                            <div className="flex items-center gap-2 mt-3 text-sm text-yellow-400">
                              <Clock className="h-4 w-4" />
                              Closes {new Date(session.closes_at).toLocaleDateString()}
                            </div>
                          )}
                          
                          {session.status === 'open' && (
                            <div className="flex gap-2 mt-3">
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
                                Vote Against
                              </Button>
                            </div>
                          )}
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
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Deposit Dialog */}
      <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-400" />
              Deposit Funds
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Add funds to your personal wallet
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="depositAmount">Amount (USD)</Label>
              <Input
                id="depositAmount"
                type="number"
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="depositDescription">Description (optional)</Label>
              <Input
                id="depositDescription"
                placeholder="e.g., Monthly deposit"
                value={depositDescription}
                onChange={(e) => setDepositDescription(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepositDialogOpen(false)} className="border-gray-700">
              Cancel
            </Button>
            <Button 
              onClick={() => depositMutation.mutate({ amount: depositAmount, description: depositDescription })}
              disabled={!depositAmount || parseFloat(depositAmount) <= 0 || depositMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {depositMutation.isPending ? 'Processing...' : 'Deposit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdraw Dialog */}
      <Dialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-orange-400" />
              Withdraw Funds
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Withdraw from your personal wallet. Available: {formatCurrency(personalWallet?.balance || 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="withdrawAmount">Amount (USD)</Label>
              <Input
                id="withdrawAmount"
                type="number"
                placeholder="0.00"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="withdrawDescription">Description (optional)</Label>
              <Input
                id="withdrawDescription"
                placeholder="e.g., Expense reimbursement"
                value={withdrawDescription}
                onChange={(e) => setWithdrawDescription(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawDialogOpen(false)} className="border-gray-700">
              Cancel
            </Button>
            <Button 
              onClick={() => withdrawMutation.mutate({ amount: withdrawAmount, description: withdrawDescription })}
              disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || withdrawMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {withdrawMutation.isPending ? 'Processing...' : 'Withdraw'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-emerald-400" />
              Transfer to Company Wallet
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Transfer funds from personal wallet to company operating wallet
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-gray-800 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">From: Personal Wallet</span>
                <span className="text-white">{formatCurrency(personalWallet?.balance || 0)}</span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-gray-400">To: Company Wallet</span>
                <span className="text-white">{formatCurrency(companyWallet?.balance || 0)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="transferAmount">Amount (USD)</Label>
              <Input
                id="transferAmount"
                type="number"
                placeholder="0.00"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transferDescription">Description (optional)</Label>
              <Input
                id="transferDescription"
                placeholder="e.g., Operating capital"
                value={transferDescription}
                onChange={(e) => setTransferDescription(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialogOpen(false)} className="border-gray-700">
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (personalWallet && companyWallet) {
                  transferMutation.mutate({ 
                    fromWalletId: personalWallet.id, 
                    toWalletId: companyWallet.id, 
                    amount: transferAmount, 
                    description: transferDescription 
                  });
                }
              }}
              disabled={!transferAmount || parseFloat(transferAmount) <= 0 || transferMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {transferMutation.isPending ? 'Transferring...' : 'Transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payout Request Dialog */}
      <Dialog open={payoutDialogOpen} onOpenChange={setPayoutDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-purple-400" />
              Request Payout
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Request payout from company wallet. Available: {formatCurrency(companyWallet?.balance || 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="payoutAmount">Amount (USD)</Label>
              <Input
                id="payoutAmount"
                type="number"
                placeholder="0.00"
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payoutDescription">Reason for payout</Label>
              <Textarea
                id="payoutDescription"
                placeholder="e.g., Dividend distribution"
                value={payoutDescription}
                onChange={(e) => setPayoutDescription(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="p-3 bg-yellow-900/20 rounded-lg border border-yellow-700/50">
              <p className="text-sm text-yellow-400">
                This request may require shareholder approval depending on governance rules.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayoutDialogOpen(false)} className="border-gray-700">
              Cancel
            </Button>
            <Button 
              onClick={() => payoutMutation.mutate({ amount: payoutAmount, description: payoutDescription })}
              disabled={!payoutAmount || parseFloat(payoutAmount) <= 0 || payoutMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {payoutMutation.isPending ? 'Submitting...' : 'Request Payout'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            </div>
            <div className="space-y-2">
              <Label htmlFor="shareholderRole">Role (optional)</Label>
              <Input
                id="shareholderRole"
                placeholder="e.g., Board Member"
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

      {/* Add Governance Rule Dialog */}
      <Dialog open={addRuleDialogOpen} onOpenChange={setAddRuleDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-yellow-400" />
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

      {/* Add Transaction Dialog */}
      <Dialog open={addTransactionDialogOpen} onOpenChange={setAddTransactionDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-400" />
              Record Transaction
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Record a revenue or expense transaction
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Transaction Type</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={txType === 'revenue' ? 'default' : 'outline'}
                  onClick={() => setTxType('revenue')}
                  className={txType === 'revenue' ? 'bg-green-600' : 'border-gray-700'}
                >
                  <ArrowUpRight className="h-4 w-4 mr-1" />
                  Revenue
                </Button>
                <Button
                  variant={txType === 'expense' ? 'default' : 'outline'}
                  onClick={() => setTxType('expense')}
                  className={txType === 'expense' ? 'bg-red-600' : 'border-gray-700'}
                >
                  <ArrowDownRight className="h-4 w-4 mr-1" />
                  Expense
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="txAmount">Amount (USD)</Label>
              <Input
                id="txAmount"
                type="number"
                placeholder="0.00"
                value={txAmount}
                onChange={(e) => setTxAmount(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="txDescription">Description</Label>
              <Input
                id="txDescription"
                placeholder="e.g., Client payment, Office supplies"
                value={txDescription}
                onChange={(e) => setTxDescription(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="txCategory">Category</Label>
              <Select value={txCategory} onValueChange={setTxCategory}>
                <SelectTrigger className="bg-gray-800 border-gray-700">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  {txType === 'revenue' ? (
                    <>
                      <SelectItem value="sales">Sales</SelectItem>
                      <SelectItem value="services">Services</SelectItem>
                      <SelectItem value="subscriptions">Subscriptions</SelectItem>
                      <SelectItem value="consulting">Consulting</SelectItem>
                      <SelectItem value="other_income">Other Income</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="payroll">Payroll</SelectItem>
                      <SelectItem value="software">Software & Tools</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="office">Office & Supplies</SelectItem>
                      <SelectItem value="travel">Travel</SelectItem>
                      <SelectItem value="professional">Professional Services</SelectItem>
                      <SelectItem value="other_expense">Other Expense</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTransactionDialogOpen(false)} className="border-gray-700">
              Cancel
            </Button>
            <Button 
              onClick={() => addTransactionMutation.mutate({ 
                type: txType, 
                amount: txAmount, 
                description: txDescription,
                category: txCategory || undefined
              })}
              disabled={!txAmount || !txDescription || addTransactionMutation.isPending}
              className={txType === 'revenue' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {addTransactionMutation.isPending ? 'Recording...' : 'Record Transaction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MyBusinessPage;
