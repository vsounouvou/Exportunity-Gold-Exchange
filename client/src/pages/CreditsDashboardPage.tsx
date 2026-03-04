import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Coins,
  TrendingDown,
  Calendar,
  AlertTriangle,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Gift,
  CreditCard,
  Users
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { resolveApiUrl } from "@/lib/runtimeConfig";

interface CreditSummary {
  balance: string;
  dailyCost: string;
  forecastDays: number | null;
  lowBalanceThreshold: string;
  isLowBalance: boolean;
  activeAgents: Array<{
    id: number;
    name: string;
    tierName: string;
    dailyCost: string;
    weeklyCost: string;
    monthlyCost: string;
  }>;
}

interface CreditTransaction {
  id: number;
  type: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  description: string;
  metadata: any;
  createdAt: string;
}

export function CreditsDashboardPage() {
  const { data: summary, isLoading: summaryLoading, error: summaryError } = useQuery<CreditSummary>({
    queryKey: ["/api/credits/summary"],
    retry: 2
  });

  const { data: transactionsData, isLoading: transactionsLoading } = useQuery<{
    transactions: CreditTransaction[];
    total: number;
  }>({
    queryKey: ["/api/credits/transactions"],
    queryFn: async () => {
      const response = await fetch(resolveApiUrl("/api/credits/transactions?limit=10"));
      if (!response.ok) throw new Error("Failed to fetch transactions");
      return response.json();
    }
  });

  const balance = parseFloat(summary?.balance || "0");
  const dailyCost = parseFloat(summary?.dailyCost || "0");
  const lowBalanceThreshold = parseFloat(summary?.lowBalanceThreshold || "50");

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "spend": return <ArrowDownRight className="h-4 w-4 text-red-400" />;
      case "purchase": return <ArrowUpRight className="h-4 w-4 text-green-400" />;
      case "bonus": return <Gift className="h-4 w-4 text-purple-400" />;
      default: return <CreditCard className="h-4 w-4 text-blue-400" />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case "spend": return "text-red-400";
      case "purchase": return "text-green-400";
      case "bonus": return "text-purple-400";
      default: return "text-blue-400";
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Credits & Billing</h1>
            <p className="text-gray-400 mt-1">
              Manage your credits and monitor agent costs
            </p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Add Credits
          </Button>
        </div>

        {/* Error Alert */}
        {summaryError && (
          <Alert className="bg-red-900/20 border-red-600 text-red-400">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Failed to load credit summary. Please refresh the page or try again later.
            </AlertDescription>
          </Alert>
        )}

        {/* Low Balance Alert */}
        {summary?.isLowBalance && (
          <Alert className="bg-yellow-900/20 border-yellow-600 text-yellow-400">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Your credit balance is below {lowBalanceThreshold} credits. Consider adding more credits to avoid service interruption.
            </AlertDescription>
          </Alert>
        )}

        {/* Main Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Current Balance */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">
                Current Balance
              </CardTitle>
              <Coins className="h-5 w-5 text-blue-400" />
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <Skeleton className="h-10 w-32 bg-gray-800" />
              ) : (
                <>
                  <div className="text-3xl font-bold text-white">
                    {balance.toFixed(2)}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">credits available</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Daily Cost */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">
                Daily Cost
              </CardTitle>
              <TrendingDown className="h-5 w-5 text-orange-400" />
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <Skeleton className="h-10 w-32 bg-gray-800" />
              ) : (
                <>
                  <div className="text-3xl font-bold text-white">
                    {dailyCost.toFixed(2)}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">credits per day</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Forecast */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">
                Days Remaining
              </CardTitle>
              <Calendar className="h-5 w-5 text-purple-400" />
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <Skeleton className="h-10 w-32 bg-gray-800" />
              ) : (
                <>
                  <div className="text-3xl font-bold text-white">
                    {summary?.forecastDays !== null && summary?.forecastDays !== undefined
                      ? summary.forecastDays
                      : "∞"}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {summary?.forecastDays !== null && summary?.forecastDays !== undefined
                      ? "at current usage rate"
                      : "no active agents"}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Active Agents */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl text-white">Active Agents</CardTitle>
                <CardDescription className="text-gray-400">
                  Your current clone agents and their costs
                </CardDescription>
              </div>
              <Users className="h-6 w-6 text-gray-400" />
            </div>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full bg-gray-800" />
                ))}
              </div>
            ) : summary?.activeAgents && summary.activeAgents.length > 0 ? (
              <div className="space-y-3">
                {summary.activeAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <span className="text-white font-semibold text-sm">
                          {agent.name.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <div className="font-semibold text-white">{agent.name}</div>
                        <div className="text-sm text-gray-400">{agent.tierName}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-white">
                        {parseFloat(agent.dailyCost).toFixed(2)}
                        <span className="text-sm text-gray-400 ml-1">credits/day</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {parseFloat(agent.weeklyCost).toFixed(2)}/week • {parseFloat(agent.monthlyCost).toFixed(2)}/month
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No active agents yet</p>
                <p className="text-gray-500 text-xs mt-1">
                  Create your first Personal Clone to get started
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transaction History */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-xl text-white">Recent Transactions</CardTitle>
            <CardDescription className="text-gray-400">
              Your credit transaction history
            </CardDescription>
          </CardHeader>
          <CardContent>
            {transactionsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full bg-gray-800" />
                ))}
              </div>
            ) : transactionsData?.transactions && transactionsData.transactions.length > 0 ? (
              <div className="space-y-2">
                {transactionsData.transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg border border-gray-800 hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {getTransactionIcon(transaction.type)}
                      <div>
                        <div className="font-medium text-white text-sm">
                          {transaction.description}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatDistanceToNow(new Date(transaction.createdAt), {
                            addSuffix: true
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${getTransactionColor(transaction.type)}`}>
                        {transaction.type === "spend" ? "-" : "+"}
                        {parseFloat(transaction.amount).toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500">
                        Balance: {parseFloat(transaction.balanceAfter).toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
                {transactionsData.total > 10 && (
                  <>
                    <Separator className="bg-gray-800 my-4" />
                    <Button
                      variant="outline"
                      className="w-full border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
                    >
                      View All Transactions ({transactionsData.total})
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <CreditCard className="h-12 w-12 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No transactions yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
