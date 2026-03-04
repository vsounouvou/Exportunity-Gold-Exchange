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
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
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
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Delivery Platform Admin</h1>
            <p className="text-gray-400">Monitor agents, orders, and revenue</p>
          </div>
          <Badge className="bg-green-600">
            <Activity className="h-3 w-3 mr-1 animate-pulse" />
            Live Dashboard
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">Total Agents</CardTitle>
              <Users className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stats?.agents?.total || 0}</div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-green-500 border-green-500/30">
                  {stats?.agents?.active || 0} active
                </Badge>
                <Badge variant="outline" className="text-amber-500 border-amber-500/30">
                  {stats?.agents?.online || 0} online
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">Total Orders</CardTitle>
              <Package className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stats?.orders?.total || 0}</div>
              <div className="flex items-center gap-2 mt-1 text-sm">
                <span className="text-green-500">{stats?.orders?.completed || 0} completed</span>
                <span className="text-gray-500">({completionRate}%)</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">Total Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {formatCurrency(stats?.revenue?.total || 0)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                From all revenue sources
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">Online Rate</CardTitle>
              <MapPin className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{onlineRate}%</div>
              <p className="text-xs text-gray-500 mt-1">
                Of active agents currently online
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle>Revenue Breakdown</CardTitle>
              <CardDescription className="text-gray-400">
                Revenue by source category
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats?.revenue?.bySource?.length ? (
                  stats.revenue.bySource.map((item) => (
                    <div key={item.source} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/20 rounded-lg text-amber-500">
                          {getSourceIcon(item.source)}
                        </div>
                        <span className="font-medium">{getSourceLabel(item.source)}</span>
                      </div>
                      <span className="font-bold text-green-500">
                        {formatCurrency(item.total)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No revenue data yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle>Agent Status Overview</CardTitle>
              <CardDescription className="text-gray-400">
                Current agent distribution
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/20 rounded-lg">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </div>
                    <span>Active Agents</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{stats?.agents?.active || 0}</span>
                    <span className="text-gray-500 text-sm">
                      ({stats?.agents?.total ? ((stats.agents.active / stats.agents.total) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500/20 rounded-lg">
                      <Bike className="h-4 w-4 text-amber-500" />
                    </div>
                    <span>Online Now</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{stats?.agents?.online || 0}</span>
                    <span className="text-gray-500 text-sm">
                      ({onlineRate}%)
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-500/20 rounded-lg">
                      <Clock className="h-4 w-4 text-gray-400" />
                    </div>
                    <span>Offline</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">
                      {(stats?.agents?.active || 0) - (stats?.agents?.online || 0)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
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

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle>Order Statistics</CardTitle>
            <CardDescription className="text-gray-400">
              Delivery order performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-gray-800 rounded-lg text-center">
                <p className="text-3xl font-bold text-white">{stats?.orders?.total || 0}</p>
                <p className="text-sm text-gray-400">Total Orders</p>
              </div>
              <div className="p-4 bg-gray-800 rounded-lg text-center">
                <p className="text-3xl font-bold text-green-500">{stats?.orders?.completed || 0}</p>
                <p className="text-sm text-gray-400">Completed</p>
              </div>
              <div className="p-4 bg-gray-800 rounded-lg text-center">
                <p className="text-3xl font-bold text-amber-500">
                  {(stats?.orders?.total || 0) - (stats?.orders?.completed || 0)}
                </p>
                <p className="text-sm text-gray-400">In Progress / Pending</p>
              </div>
              <div className="p-4 bg-gray-800 rounded-lg text-center">
                <p className="text-3xl font-bold text-blue-500">{completionRate}%</p>
                <p className="text-sm text-gray-400">Success Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
