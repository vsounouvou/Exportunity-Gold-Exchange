import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Users, Package, TrendingUp, DollarSign, Wallet, Shield, 
  CheckCircle2, XCircle, Clock, Activity, Bike, MapPin
} from "lucide-react";

interface PlatformStats {
  agents: {
    total: number;
    active: number;
    online: number;
  };
  orders: {
    total: number;
    completed: number;
  };
  revenue: {
    total: number;
    bySource: {
      source: string;
      total: number;
    }[];
  };
}

export default function DeliveryAdminDashboard() {
  const { data: stats, isLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/delivery/dashboard/stats"],
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "XOF",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case "deposit_fee": return "Deposit Fees";
      case "withdrawal_fee": return "Withdrawal Fees";
      case "delivery_commission": return "Delivery Commissions";
      case "insurance_premium": return "Insurance Premiums";
      case "verification_fee": return "Verification Fees";
      default: return source;
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case "deposit_fee": return <Wallet className="h-4 w-4" />;
      case "withdrawal_fee": return <Wallet className="h-4 w-4" />;
      case "delivery_commission": return <Package className="h-4 w-4" />;
      case "insurance_premium": return <Shield className="h-4 w-4" />;
      case "verification_fee": return <CheckCircle2 className="h-4 w-4" />;
      default: return <DollarSign className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F7F8FA]">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#F5A623]" />
      </div>
    );
  }

  const completionRate = stats?.orders?.total 
    ? ((stats.orders.completed / stats.orders.total) * 100).toFixed(1) 
    : "0";

  const onlineRate = stats?.agents?.active 
    ? ((stats.agents.online / stats.agents.active) * 100).toFixed(1) 
    : "0";

  return (
    <div data-testid="exportunity-delivery-admin" className="min-h-[calc(100vh-var(--admin-header-height,4rem))] bg-[#F7F8FA] text-[#07111F]">
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-4 md:px-6 md:py-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8A5700]">GTN fulfilment control</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Delivery operations</h1>
            <p className="text-sm text-slate-600">Monitor agents, orders, and recorded revenue.</p>
          </div>
          <Badge className="border border-emerald-200 bg-emerald-50 font-bold text-emerald-800 hover:bg-emerald-50">
            <Activity className="h-3 w-3 mr-1 animate-pulse" />
            Live Dashboard
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500">Total agents</CardTitle>
              <Users className="h-4 w-4 text-sky-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-slate-950">{stats?.agents?.total || 0}</div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  {stats?.agents?.active || 0} active
                </Badge>
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                  {stats?.agents?.online || 0} online
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500">Total orders</CardTitle>
              <Package className="h-4 w-4 text-violet-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-slate-950">{stats?.orders?.total || 0}</div>
              <div className="flex items-center gap-2 mt-1 text-sm">
                <span className="font-semibold text-emerald-700">{stats?.orders?.completed || 0} completed</span>
                <span className="text-slate-500">({completionRate}%)</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500">Recorded revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-slate-950">
                {formatCurrency(stats?.revenue?.total || 0)}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                From all revenue sources
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500">Online rate</CardTitle>
              <MapPin className="h-4 w-4 text-[#B26F00]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-slate-950">{onlineRate}%</div>
              <p className="mt-1 text-xs text-slate-500">
                Of active agents currently online
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardHeader>
              <CardTitle>Revenue Breakdown</CardTitle>
              <CardDescription className="text-slate-500">
                Revenue by source category
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats?.revenue?.bySource?.length ? (
                  stats.revenue.bySource.map((item) => (
                    <div key={item.source} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-[#FFF0C7] p-2 text-[#8A5700]">
                          {getSourceIcon(item.source)}
                        </div>
                        <span className="font-medium">{getSourceLabel(item.source)}</span>
                      </div>
                      <span className="font-bold text-emerald-700">
                        {formatCurrency(item.total)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-slate-500">
                    <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No revenue data yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
            <CardHeader>
              <CardTitle>Agent Status Overview</CardTitle>
              <CardDescription className="text-slate-500">
                Current agent distribution
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-emerald-50 p-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                    </div>
                    <span>Active Agents</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{stats?.agents?.active || 0}</span>
                    <span className="text-sm text-slate-500">
                      ({stats?.agents?.total ? ((stats.agents.active / stats.agents.total) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-[#FFF0C7] p-2">
                      <Bike className="h-4 w-4 text-[#8A5700]" />
                    </div>
                    <span>Online Now</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{stats?.agents?.online || 0}</span>
                    <span className="text-sm text-slate-500">
                      ({onlineRate}%)
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-slate-200 p-2">
                      <Clock className="h-4 w-4 text-slate-600" />
                    </div>
                    <span>Offline</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">
                      {(stats?.agents?.active || 0) - (stats?.agents?.online || 0)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-500/20 rounded-lg">
                      <XCircle className="h-4 w-4 text-red-500" />
                    </div>
                    <span>Pending KYC / Inactive</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">
                      {(stats?.agents?.total || 0) - (stats?.agents?.active || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200 bg-white text-slate-950 shadow-sm">
          <CardHeader>
            <CardTitle>Order Statistics</CardTitle>
            <CardDescription className="text-slate-500">
              Delivery order performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-center">
                <p className="text-3xl font-black text-slate-950">{stats?.orders?.total || 0}</p>
                <p className="text-sm text-slate-500">Total orders</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-center">
                <p className="text-3xl font-black text-emerald-700">{stats?.orders?.completed || 0}</p>
                <p className="text-sm text-slate-500">Completed</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-center">
                <p className="text-3xl font-black text-[#B26F00]">
                  {(stats?.orders?.total || 0) - (stats?.orders?.completed || 0)}
                </p>
                <p className="text-sm text-slate-500">In progress / pending</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-center">
                <p className="text-3xl font-black text-sky-700">{completionRate}%</p>
                <p className="text-sm text-slate-500">Success rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
