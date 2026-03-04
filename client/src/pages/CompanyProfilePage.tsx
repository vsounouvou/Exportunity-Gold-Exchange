import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useCompany } from "@/hooks/use-company";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  Building2, Edit, TrendingUp, Users, DollarSign, 
  Target, Settings, Globe, FileText, PieChart,
  BarChart3, Calendar, Award, AlertCircle, CheckCircle2,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AddShareholderDialog } from "@/components/AddShareholderDialog";
import { AddKPIDialog } from "@/components/AddKPIDialog";
import { AddTransactionDialog } from "@/components/AddTransactionDialog";
import { UpdateAISettingsDialog } from "@/components/UpdateAISettingsDialog";
import { resolveApiUrl } from "@/lib/runtimeConfig";

const formatSector = (sector: string): string => {
  const sectorMap: Record<string, string> = {
    'trade_export': 'Trade & Export',
    'gold_metals': 'Gold & Metals',
    'education': 'Education',
    'logistics': 'Logistics',
    'construction': 'Construction',
    'architecture': 'Architecture',
    'technology': 'Technology',
    'retail': 'Retail',
    'media': 'Media',
    'agriculture': 'Agriculture',
    'real_estate': 'Real Estate',
    'other': 'Other'
  };
  return sectorMap[sector] || sector;
};

function KPICard({ kpi, companyId }: {
  kpi: CompanyKpi;
  companyId: number;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(resolveApiUrl(`/api/companies/${companyId}/kpis/${kpi.id}`), {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete KPI");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId] });
      toast({
        title: "Success",
        description: "KPI removed successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove KPI",
        variant: "destructive",
      });
    },
  });

  const progress = kpi.target ? (kpi.kpiValue / kpi.target) * 100 : 0;

  return (
    <div className="border border-gray-800 rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h4 className="text-white font-medium">{kpi.kpiName}</h4>
          <Badge variant="outline" className="text-xs mt-1">
            {kpi.category}
          </Badge>
        </div>
        <div className="flex items-start gap-1">
          <Badge variant="secondary" className="text-xs">
            {kpi.period}
          </Badge>
          <AddKPIDialog
            companyId={companyId}
            existingKPI={kpi}
            trigger={
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Edit className="h-4 w-4" />
              </Button>
            }
          />
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-red-400 hover:text-red-300"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-2xl font-bold text-white">
            {kpi.kpiValue.toLocaleString()}
          </p>
          {kpi.target && (
            <p className="text-sm text-gray-400">
              of {kpi.target.toLocaleString()}
            </p>
          )}
        </div>
        {kpi.target && (
          <Progress 
            value={Math.min(progress, 100)} 
            className={cn(
              "h-2",
              progress >= 100 ? "bg-green-900" : "bg-gray-800"
            )}
          />
        )}
      </div>
    </div>
  );
}

function TransactionCard({ transaction, companyId }: {
  transaction: RevenueTransaction;
  companyId: number;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        resolveApiUrl(`/api/companies/${companyId}/transactions/${transaction.id}`),
        {
        method: "DELETE",
        },
      );
      if (!response.ok) throw new Error("Failed to delete transaction");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId] });
      toast({
        title: "Success",
        description: "Transaction removed successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove transaction",
        variant: "destructive",
      });
    },
  });

  // Use direction field to determine if it's revenue or expense
  const isRevenue = transaction.direction === 'credit';

  return (
    <div className="border border-gray-800 rounded-lg p-4 flex items-center justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Badge variant={isRevenue ? 'default' : 'secondary'}>
            {transaction.type}
          </Badge>
          {transaction.source && (
            <span className="text-sm text-gray-400">{transaction.source}</span>
          )}
        </div>
        {transaction.description && (
          <p className="text-sm text-gray-500 mt-1">{transaction.description}</p>
        )}
        <p className="text-xs text-gray-600 mt-1">
          {new Date(transaction.createdAt).toLocaleString()}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className={cn(
          "text-xl font-bold",
          isRevenue ? "text-green-500" : "text-red-500"
        )}>
          {isRevenue ? '+' : '-'}
          ${typeof transaction.amount === 'number' 
            ? Math.abs(transaction.amount).toLocaleString() 
            : Math.abs(parseFloat(transaction.amount)).toLocaleString()}
        </div>
        <div className="flex gap-1">
          <AddTransactionDialog
            companyId={companyId}
            existingTransaction={transaction}
            trigger={
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Edit className="h-4 w-4" />
              </Button>
            }
          />
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-red-400 hover:text-red-300"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ShareholderCard({ shareholder, companyId }: { 
  shareholder: CompanyShareholder; 
  companyId: number;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        resolveApiUrl(`/api/companies/${companyId}/shareholders/${shareholder.id}`),
        {
        method: "DELETE",
        },
      );
      if (!response.ok) throw new Error("Failed to delete shareholder");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId] });
      toast({
        title: "Success",
        description: "Shareholder removed successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove shareholder",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="border border-gray-800 rounded-lg p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-white font-medium">{shareholder.shareholderName}</h4>
            <Badge variant="outline" className="text-xs">
              {shareholder.shareholderType}
            </Badge>
          </div>
          {shareholder.notes && (
            <p className="text-xs text-gray-500 mt-1">{shareholder.notes}</p>
          )}
          {shareholder.investmentAmount && (
            <p className="text-xs text-gray-400 mt-1">
              Investment: ${parseFloat(shareholder.investmentAmount).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex items-start gap-2">
          <div className="text-right">
            <p className="text-2xl font-bold text-white">
              {shareholder.sharePercentage}%
            </p>
          </div>
          <div className="flex gap-1">
            <AddShareholderDialog
              companyId={companyId}
              existingShareholder={shareholder}
              trigger={
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Edit className="h-4 w-4" />
                </Button>
              }
            />
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-red-400 hover:text-red-300"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <Progress 
        value={shareholder.sharePercentage} 
        className="h-2"
      />
    </div>
  );
}

interface CompanyShareholder {
  id: number;
  shareholderName: string;
  shareholderType: string;
  sharePercentage: number;
  investmentAmount?: string;
  notes?: string;
  role?: string;
  walletAddress?: string;
  distributionMode: string;
}

interface CompanyKpi {
  id: number;
  kpiName: string;
  kpiValue: number;
  period: string;
  target?: number;
  category: string;
}

interface RevenueTransaction {
  id: number;
  amount: number;
  type: string;
  direction: 'credit' | 'debit';
  source?: string;
  description?: string;
  createdAt: string;
}

interface CompanyProfile {
  id: number;
  name: string;
  description: string;
  logo?: string;
  country: string;
  legalType: string;
  registrationNumber?: string;
  registrationDate?: string;
  primarySector: string;
  secondarySector?: string;
  industryTags: string[];
  vision?: string;
  currentGoals: string[];
  kpiTargets: Record<string, number>;
  dailyCashBurnTarget: number;
  tokenUsageLimit: number;
  totalRevenue: number;
  totalProfit: number;
  totalExpenses: number;
  autonomyLevel: string;
  riskAppetite: string;
  creativity: string;
  strictness: string;
  parentCompanyId?: number;
  themeColor: string;
  shareholders: CompanyShareholder[];
  kpis: CompanyKpi[];
  revenueTransactions: RevenueTransaction[];
}

export function CompanyProfilePage() {
  const { selectedCompanyId } = useCompany();
  const searchParams = useSearch();
  const urlParams = new URLSearchParams(searchParams);
  const urlCompanyId = urlParams.get('id');
  
  const companyId = urlCompanyId ? parseInt(urlCompanyId) : selectedCompanyId;

  const { data: company, isLoading } = useQuery<CompanyProfile>({
    queryKey: ['/api/companies', companyId],
    queryFn: async () => {
      const response = await fetch(resolveApiUrl(`/api/companies/${companyId}`));
      if (!response.ok) {
        throw new Error('Failed to fetch company');
      }
      return response.json();
    },
    enabled: !!companyId
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-800 rounded w-1/4"></div>
          <div className="h-64 bg-gray-800 rounded"></div>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="container mx-auto p-6">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No company selected</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalShares = company.shareholders?.reduce((sum, s) => sum + s.sharePercentage, 0) || 0;
  const profitMargin = company.totalRevenue > 0 
    ? ((company.totalProfit / company.totalRevenue) * 100).toFixed(1) 
    : '0';

  return (
    <div className="container mx-auto p-6 pb-32 space-y-6">
      {/* Header Section */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div 
            className="h-16 w-16 rounded-lg flex items-center justify-center text-2xl font-bold text-white"
            style={{ backgroundColor: company.themeColor }}
          >
            {company.logo ? (
              <img src={company.logo} alt={company.name} className="h-full w-full object-cover rounded-lg" />
            ) : (
              company.name.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-2">
              {company.name}
              <Badge variant="outline" className="text-xs">
                {company.legalType}
              </Badge>
            </h1>
            <p className="text-gray-400 mt-1">{company.description}</p>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Globe className="h-4 w-4" />
                {company.country}
              </span>
              <span className="flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                {formatSector(company.primarySector)}
              </span>
              {company.registrationNumber && (
                <span className="flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  Reg: {company.registrationNumber}
                </span>
              )}
            </div>
          </div>
        </div>
        <Button variant="outline" className="gap-2">
          <Edit className="h-4 w-4" />
          Edit Profile
        </Button>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Total Revenue</p>
                <p className="text-2xl font-bold text-white mt-1">
                  ${company.totalRevenue.toLocaleString()}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Total Profit</p>
                <p className="text-2xl font-bold text-white mt-1">
                  ${company.totalProfit.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 mt-1">{profitMargin}% margin</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Total Expenses</p>
                <p className="text-2xl font-bold text-white mt-1">
                  ${company.totalExpenses.toLocaleString()}
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Daily Cash Burn</p>
                <p className="text-2xl font-bold text-white mt-1">
                  ${company.dailyCashBurnTarget.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 mt-1">Target</p>
              </div>
              <Target className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-gray-900 border border-gray-800">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="shareholders">Shareholders</TabsTrigger>
          <TabsTrigger value="kpis">KPIs & Performance</TabsTrigger>
          <TabsTrigger value="revenue">Revenue & Transactions</TabsTrigger>
          <TabsTrigger value="ai-settings">AI Settings</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Vision & Goals */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Vision & Goals
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {company.vision && (
                  <div>
                    <p className="text-sm text-gray-400 mb-2">Vision Statement</p>
                    <p className="text-white">{company.vision}</p>
                  </div>
                )}
                {company.currentGoals && company.currentGoals.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-400 mb-2">Current Goals</p>
                    <ul className="space-y-2">
                      {company.currentGoals.map((goal, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-white">
                          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>{goal}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(!company.vision && (!company.currentGoals || company.currentGoals.length === 0)) && (
                  <p className="text-gray-500 text-sm">No vision or goals defined yet</p>
                )}
              </CardContent>
            </Card>

            {/* Industry & Classification */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Industry & Classification
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-gray-400 mb-2">Primary Sector</p>
                  <Badge variant="outline" className="text-sm">
                    {formatSector(company.primarySector)}
                  </Badge>
                </div>
                {company.secondarySector && (
                  <div>
                    <p className="text-sm text-gray-400 mb-2">Secondary Sector</p>
                    <Badge variant="outline" className="text-sm">
                      {formatSector(company.secondarySector)}
                    </Badge>
                  </div>
                )}
                {company.industryTags && company.industryTags.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-400 mb-2">Industry Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {company.industryTags.map((tag, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Legal Information */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Legal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-400">Legal Type</p>
                    <p className="text-white font-medium">{company.legalType}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Country</p>
                    <p className="text-white font-medium">{company.country}</p>
                  </div>
                </div>
                {company.registrationNumber && (
                  <div>
                    <p className="text-sm text-gray-400">Registration Number</p>
                    <p className="text-white font-medium">{company.registrationNumber}</p>
                  </div>
                )}
                {company.registrationDate && (
                  <div>
                    <p className="text-sm text-gray-400">Registration Date</p>
                    <p className="text-white font-medium">
                      {new Date(company.registrationDate).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Budget & Limits */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Budget & Limits
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-gray-400 mb-1">Daily Cash Burn Target</p>
                  <p className="text-2xl font-bold text-white">
                    ${company.dailyCashBurnTarget.toLocaleString()}
                  </p>
                </div>
                <Separator className="bg-gray-800" />
                <div>
                  <p className="text-sm text-gray-400 mb-1">Token Usage Limit</p>
                  <p className="text-xl font-semibold text-white">
                    {company.tokenUsageLimit.toLocaleString()} tokens
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Shareholders Tab */}
        <TabsContent value="shareholders" className="space-y-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Shareholders
                  </CardTitle>
                  <CardDescription>
                    Total ownership: {totalShares.toFixed(2)}%
                  </CardDescription>
                </div>
                <AddShareholderDialog 
                  companyId={company.id}
                  trigger={
                    <Button variant="outline" size="sm">
                      Add Shareholder
                    </Button>
                  }
                />
              </div>
            </CardHeader>
            <CardContent>
              {company.shareholders && company.shareholders.length > 0 ? (
                <div className="space-y-4">
                  {company.shareholders.map((shareholder) => (
                    <ShareholderCard 
                      key={shareholder.id} 
                      shareholder={shareholder}
                      companyId={company.id}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No shareholders defined</p>
                  <AddShareholderDialog 
                    companyId={company.id}
                    trigger={
                      <Button variant="outline" className="mt-4" size="sm">
                        Add First Shareholder
                      </Button>
                    }
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* KPIs Tab */}
        <TabsContent value="kpis" className="space-y-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Key Performance Indicators
                </CardTitle>
                <AddKPIDialog companyId={company.id} />
              </div>
            </CardHeader>
            <CardContent>
              {company.kpis && company.kpis.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {company.kpis.map((kpi) => (
                    <KPICard 
                      key={kpi.id} 
                      kpi={kpi}
                      companyId={company.id}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <PieChart className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No KPIs defined</p>
                  <AddKPIDialog 
                    companyId={company.id}
                    trigger={
                      <Button variant="outline" className="mt-4" size="sm">
                        Add First KPI
                      </Button>
                    }
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Revenue Tab */}
        <TabsContent value="revenue" className="space-y-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Revenue Transactions
                </CardTitle>
                <AddTransactionDialog companyId={company.id} />
              </div>
            </CardHeader>
            <CardContent>
              {company.revenueTransactions && company.revenueTransactions.length > 0 ? (
                <div className="space-y-2">
                  {company.revenueTransactions.slice(0, 10).map((transaction) => (
                    <TransactionCard
                      key={transaction.id}
                      transaction={transaction}
                      companyId={company.id}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <DollarSign className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No transactions recorded</p>
                  <AddTransactionDialog 
                    companyId={company.id}
                    trigger={
                      <Button variant="outline" className="mt-4" size="sm">
                        Add First Transaction
                      </Button>
                    }
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Settings Tab */}
        <TabsContent value="ai-settings" className="space-y-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                AI Agent Behavior Settings
              </CardTitle>
              <CardDescription>
                Configure how AI agents behave within this company
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">Autonomy Level</label>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-lg px-4 py-2",
                        company.autonomyLevel === 'high' && "border-green-500 text-green-500",
                        company.autonomyLevel === 'medium' && "border-yellow-500 text-yellow-500",
                        company.autonomyLevel === 'low' && "border-red-500 text-red-500"
                      )}
                    >
                      {company.autonomyLevel}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500">
                    How much freedom agents have to make decisions
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-gray-400">Risk Appetite</label>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-lg px-4 py-2",
                        company.riskAppetite === 'bold' && "border-red-500 text-red-500",
                        company.riskAppetite === 'moderate' && "border-yellow-500 text-yellow-500",
                        company.riskAppetite === 'conservative' && "border-blue-500 text-blue-500"
                      )}
                    >
                      {company.riskAppetite === 'bold' ? 'Bold' : company.riskAppetite.charAt(0).toUpperCase() + company.riskAppetite.slice(1)}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500">
                    Willingness to take business risks
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-gray-400">Creativity Level</label>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-lg px-4 py-2">
                      {company.creativity.charAt(0).toUpperCase() + company.creativity.slice(1)}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500">
                    How creative and innovative agents should be
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-gray-400">Strictness</label>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-lg px-4 py-2">
                      {company.strictness.charAt(0).toUpperCase() + company.strictness.slice(1)}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500">
                    How strictly agents follow rules and procedures
                  </p>
                </div>
              </div>

              <Separator className="bg-gray-800" />

              <div className="flex justify-end">
                <UpdateAISettingsDialog 
                  companyId={company.id}
                  currentSettings={{
                    autonomyLevel: company.autonomyLevel as "low" | "medium" | "high" | "full",
                    riskAppetite: company.riskAppetite as "conservative" | "moderate" | "bold",
                    creativity: company.creativity as "low" | "medium" | "high",
                    strictness: company.strictness as "relaxed" | "balanced" | "strict",
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
