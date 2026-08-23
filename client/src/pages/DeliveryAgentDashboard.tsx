import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { 
  Wallet, TrendingUp, Package, Star, Shield, MapPin, 
  ArrowUpRight, ArrowDownRight, CheckCircle2, 
  Bike, Car, Truck, User, Settings
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AgentStats {
  agent: any;
  stats: {
    totalEarnings: string;
    totalDeliveries: number;
    successfulDeliveries: number;
    successRate: string;
    rating: string;
    insuranceTier: string;
    walletBalance: string;
    availableBalance: string;
    heldAmount: string;
  };
  recentDeliveries: any[];
}

interface InsurancePlan {
  id: number;
  tier: string;
  name: string;
  description: string;
  monthlyFee: string;
  depositMultiplier: string;
  coveragePercentage: number;
  benefits: string[];
}

interface DeliveryAgentDashboardProps {
  agentId?: number;
}

export default function DeliveryAgentDashboard({ agentId: propAgentId }: DeliveryAgentDashboardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, params] = useRoute("/delivery/agent/:id");
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isOnline, setIsOnline] = useState(false);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [insuranceDialogOpen, setInsuranceDialogOpen] = useState(false);

  const agentId = propAgentId || (params?.id ? parseInt(params.id) : null);

  const { data: agentStats, isLoading: statsLoading } = useQuery<AgentStats>({
    queryKey: ["/api/delivery/agents", agentId, "stats"],
    queryFn: () => fetch(resolveApiUrl(`/api/delivery/agents/${agentId}/stats`)).then(r => r.json()),
    enabled: !!agentId,
  });

  const { data: transactions } = useQuery({
    queryKey: ["/api/delivery/wallets", agentId, "transactions"],
    queryFn: () => fetch(resolveApiUrl(`/api/delivery/wallets/${agentId}/transactions`)).then(r => r.json()),
    enabled: !!agentId,
  });

  const { data: insurancePlans } = useQuery<InsurancePlan[]>({
    queryKey: ["/api/delivery/insurance/plans"],
  });

  useEffect(() => {
    if (agentStats?.agent?.isOnline !== undefined) {
      setIsOnline(agentStats.agent.isOnline);
    }
  }, [agentStats?.agent?.isOnline]);

  const depositMutation = useMutation({
    mutationFn: (amount: number) => 
      apiRequest("/api/delivery/wallets/deposit", "POST", {
        agentId,
        amount,
        paymentMethod: "mobile_money",
        paymentProvider: "MTN"
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/delivery/agents", agentId, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery/wallets", agentId, "transactions"] });
      setDepositDialogOpen(false);
      setDepositAmount("");
      toast({ title: "Deposit successful", description: "Your wallet has been topped up." });
    },
    onError: (error: any) => {
      toast({ title: "Deposit failed", description: error.message, variant: "destructive" });
    }
  });

  const withdrawMutation = useMutation({
    mutationFn: (amount: number) => 
      apiRequest("/api/delivery/wallets/withdraw", "POST", {
        agentId,
        amount,
        paymentMethod: "mobile_money"
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/delivery/agents", agentId, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery/wallets", agentId, "transactions"] });
      setWithdrawDialogOpen(false);
      setWithdrawAmount("");
      toast({ title: "Withdrawal initiated", description: "Your withdrawal is being processed." });
    },
    onError: (error: any) => {
      toast({ title: "Withdrawal failed", description: error.message, variant: "destructive" });
    }
  });

  const onlineStatusMutation = useMutation({
    mutationFn: (online: boolean) => 
      apiRequest(`/api/delivery/agents/${agentId}/online`, "PATCH", { isOnline: online }),
    onSuccess: (_, online) => {
      setIsOnline(online);
      queryClient.invalidateQueries({ queryKey: ["/api/delivery/agents", agentId, "stats"] });
      toast({ 
        title: online ? "You're now online" : "You're now offline",
        description: online ? "You can receive delivery requests." : "You won't receive new requests."
      });
    }
  });

  const subscribeMutation = useMutation({
    mutationFn: (planId: number) => 
      apiRequest("/api/delivery/insurance/subscribe", "POST", { agentId, planId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/delivery/agents", agentId, "stats"] });
      setInsuranceDialogOpen(false);
      toast({ title: "Subscription successful", description: "Your insurance plan has been updated." });
    },
    onError: (error: any) => {
      toast({ title: "Subscription failed", description: error.message, variant: "destructive" });
    }
  });

  const formatCurrency = (amount: string | number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "XOF",
      minimumFractionDigits: 0,
    }).format(Number(amount));
  };

  const getVehicleIcon = (type?: string) => {
    switch (type) {
      case "motorcycle": return <Bike className="h-4 w-4" />;
      case "car": return <Car className="h-4 w-4" />;
      case "van":
      case "truck": return <Truck className="h-4 w-4" />;
      default: return <User className="h-4 w-4" />;
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "gold": return "bg-yellow-500";
      case "silver": return "bg-gray-400";
      default: return "bg-amber-700";
    }
  };

  if (!agentId) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F7F8FA]">
        <div className="text-center text-slate-500">
          <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No Agent Selected</p>
          <p className="text-sm">Please select an agent to view the dashboard</p>
        </div>
      </div>
    );
  }

  if (statsLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F7F8FA]">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#F5A623]" />
      </div>
    );
  }

  const stats = agentStats?.stats;
  const agent = agentStats?.agent;
  const recentDeliveries = agentStats?.recentDeliveries ?? [];

  return (
    <div data-testid="exportunity-delivery-agent" className="min-h-[calc(100vh-var(--admin-header-height,4rem))] bg-[#F7F8FA] text-[#07111F]">
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-4 md:px-6 md:py-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8A5700]">GTN fulfilment partner</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Delivery workspace</h1>
            <p className="text-sm text-slate-600">Manage delivery records, availability, cover, and wallet activity.</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch 
                checked={isOnline} 
                onCheckedChange={(checked) => onlineStatusMutation.mutate(checked)}
              />
              <span className={isOnline ? "font-semibold text-emerald-700" : "font-semibold text-slate-500"}>
                {isOnline ? "Online" : "Offline"}
              </span>
            </div>
            <Badge className={getTierColor(stats?.insuranceTier || "basic")}>
              <Shield className="h-3 w-3 mr-1" />
              {stats?.insuranceTier?.toUpperCase() || "BASIC"}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500">Wallet balance</CardTitle>
              <Wallet className="h-4 w-4 text-[#B26F00]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-slate-950">{formatCurrency(stats?.walletBalance || 0)}</div>
              <p className="mt-1 text-xs text-slate-500">
                Available: {formatCurrency(stats?.availableBalance || 0)}
              </p>
              {Number(stats?.heldAmount || 0) > 0 && (
                <p className="mt-1 text-xs font-semibold text-[#8A5700]">
                  Held: {formatCurrency(stats?.heldAmount || 0)}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500">Total earnings</CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-slate-950">{formatCurrency(stats?.totalEarnings || 0)}</div>
              <p className="mt-1 text-xs font-semibold text-emerald-700">
                From {stats?.totalDeliveries || 0} deliveries
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500">Success rate</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-sky-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-slate-950">{stats?.successRate || 100}%</div>
              <Progress value={Number(stats?.successRate || 100)} className="mt-2 h-2" />
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500">Rating</CardTitle>
              <Star className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 text-2xl font-black text-slate-950">
                {Number(stats?.rating || 5).toFixed(1)}
                <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Based on {stats?.successfulDeliveries || 0} reviews
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm lg:col-span-2">
            <CardHeader>
              <CardTitle>Wallet Management</CardTitle>
              <CardDescription className="text-slate-500">
                Manage your deposit and earnings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-4 mb-6">
                <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="flex-1 bg-emerald-700 font-bold text-white hover:bg-emerald-800">
                      <ArrowDownRight className="h-4 w-4 mr-2" />
                      Deposit
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="border-slate-200 bg-white text-slate-950">
                    <DialogHeader>
                      <DialogTitle>Deposit Funds</DialogTitle>
                      <DialogDescription className="text-slate-500">
                        Add money to your wallet to accept deliveries
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label htmlFor="deposit">Amount (XOF)</Label>
                        <Input
                          id="deposit"
                          type="number"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          placeholder="10000"
                          className="border-slate-200 bg-white text-slate-950"
                        />
                      </div>
                      <p className="text-sm text-slate-600">
                        Fee: 1.5% ({formatCurrency(Number(depositAmount) * 0.015 || 0)})
                      </p>
                    </div>
                    <DialogFooter>
                      <Button 
                        onClick={() => depositMutation.mutate(Number(depositAmount))}
                        disabled={!depositAmount || depositMutation.isPending}
                        className="bg-emerald-700 font-bold text-white hover:bg-emerald-800"
                      >
                        {depositMutation.isPending ? "Processing..." : "Confirm Deposit"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="flex-1 border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]">
                      <ArrowUpRight className="h-4 w-4 mr-2" />
                      Withdraw
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="border-slate-200 bg-white text-slate-950">
                    <DialogHeader>
                      <DialogTitle>Withdraw Funds</DialogTitle>
                      <DialogDescription className="text-slate-500">
                        Withdraw your available balance
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label htmlFor="withdraw">Amount (XOF)</Label>
                        <Input
                          id="withdraw"
                          type="number"
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          placeholder="5000"
                          max={Number(stats?.availableBalance || 0)}
                          className="border-slate-200 bg-white text-slate-950"
                        />
                      </div>
                      <p className="text-sm text-slate-600">
                        Available: {formatCurrency(stats?.availableBalance || 0)}
                      </p>
                      <p className="text-sm text-slate-600">
                        Fee: 2% ({formatCurrency(Number(withdrawAmount) * 0.02 || 0)})
                      </p>
                    </div>
                    <DialogFooter>
                      <Button 
                        onClick={() => withdrawMutation.mutate(Number(withdrawAmount))}
                        disabled={!withdrawAmount || withdrawMutation.isPending}
                      >
                        {withdrawMutation.isPending ? "Processing..." : "Confirm Withdrawal"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <div>
                <h4 className="mb-3 text-sm font-semibold text-slate-600">Recent transactions</h4>
                <ScrollArea className="h-[200px]">
                  {transactions?.length > 0 ? (
                    <div className="space-y-2">
                      {transactions.slice(0, 10).map((tx: any) => (
                        <div key={tx.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${
                              tx.type === 'deposit' || tx.type === 'commission' 
                                ? 'bg-green-500/20 text-green-500'
                                : 'bg-red-500/20 text-red-500'
                            }`}>
                              {tx.type === 'deposit' || tx.type === 'commission' 
                                ? <ArrowDownRight className="h-4 w-4" />
                                : <ArrowUpRight className="h-4 w-4" />
                              }
                            </div>
                            <div>
                              <p className="font-medium capitalize">{tx.type.replace('_', ' ')}</p>
                              <p className="text-xs text-slate-500">{tx.description}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`font-medium ${
                              tx.type === 'deposit' || tx.type === 'commission' 
                                ? 'text-green-500'
                                : 'text-red-500'
                            }`}>
                              {tx.type === 'deposit' || tx.type === 'commission' ? '+' : '-'}
                              {formatCurrency(tx.amount)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {new Date(tx.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-slate-500">
                      No transactions yet
                    </div>
                  )}
                </ScrollArea>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Insurance Plan</CardTitle>
                <Dialog open={insuranceDialogOpen} onOpenChange={setInsuranceDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="border-slate-200 bg-white text-slate-700 hover:border-[#F5A623] hover:bg-[#FFF8E8]">
                      <Settings className="h-4 w-4 mr-1" />
                      Change
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl border-slate-200 bg-white text-slate-950">
                    <DialogHeader>
                      <DialogTitle>Choose Insurance Plan</DialogTitle>
                      <DialogDescription className="text-slate-500">
                        Select a plan that fits your delivery volume
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
                      {insurancePlans?.map((plan) => (
                        <Card 
                          key={plan.id} 
                          className={`cursor-pointer border-slate-200 bg-slate-50 text-slate-950 transition-colors hover:border-[#F5A623] ${
                            stats?.insuranceTier === plan.tier ? 'border-amber-500' : ''
                          }`}
                          onClick={() => subscribeMutation.mutate(plan.id)}
                        >
                          <CardHeader className="pb-2">
                            <Badge className={getTierColor(plan.tier)}>
                              {plan.tier.toUpperCase()}
                            </Badge>
                            <CardTitle className="text-lg">{plan.name}</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            <p className="text-2xl font-bold">
                              {formatCurrency(plan.monthlyFee)}
                              <span className="text-sm text-slate-500">/month</span>
                            </p>
                            <p className="text-sm text-slate-600">{plan.description}</p>
                            <div className="pt-2 space-y-1">
                              <p className="text-xs text-slate-500">
                                Deposit required: {Number(plan.depositMultiplier) * 100}%
                              </p>
                              <p className="text-xs text-slate-500">
                                Coverage: {plan.coveragePercentage}%
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-[#F5A623]/20 bg-[#FFF8E8] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-5 w-5 text-amber-500" />
                  <span className="font-medium capitalize">{stats?.insuranceTier} Plan</span>
                </div>
                <p className="text-sm leading-6 text-slate-600">
                  {stats?.insuranceTier === 'gold' 
                    ? "No deposit required. 100% insurance coverage."
                    : stats?.insuranceTier === 'silver'
                    ? "50% deposit required. 50% insurance coverage."
                    : "Full deposit required. No insurance coverage."
                  }
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-600">Coverage details</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <p className="text-slate-500">Deposit multiplier</p>
                    <p className="font-medium">
                      {stats?.insuranceTier === 'gold' ? '0%' 
                        : stats?.insuranceTier === 'silver' ? '50%' 
                        : '100%'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <p className="text-slate-500">Insurance coverage</p>
                    <p className="font-medium">
                      {stats?.insuranceTier === 'gold' ? '100%' 
                        : stats?.insuranceTier === 'silver' ? '50%' 
                        : '0%'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
          <CardHeader>
            <CardTitle>Recent Deliveries</CardTitle>
            <CardDescription className="text-slate-500">
              Your last 10 completed deliveries
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {recentDeliveries.length > 0 ? (
                <div className="space-y-3">
                  {recentDeliveries.map((delivery: any) => (
                    <div key={delivery.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-amber-500/20 rounded-lg">
                          <Package className="h-5 w-5 text-amber-500" />
                        </div>
                        <div>
                          <p className="font-medium">{delivery.order?.orderId}</p>
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate max-w-[200px]">
                              {delivery.order?.dropoffAddress}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-emerald-700">
                          +{formatCurrency(delivery.order?.agentEarnings || 0)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {delivery.completedAt && new Date(delivery.completedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500">
                  <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No deliveries yet</p>
                  <p className="text-sm">Complete your first delivery to see it here</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
