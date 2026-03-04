import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  DollarSign, 
  Wallet,
  CreditCard,
  FileText,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  Building2,
  Plus,
  Download,
  Calendar,
  Clock
} from "lucide-react";

interface Transaction {
  id: number;
  type: 'incoming' | 'outgoing';
  amount: number;
  description: string;
  date: string;
  status: 'completed' | 'pending' | 'failed';
  client?: string;
}

const mockTransactions: Transaction[] = [
  { id: 1, type: 'incoming', amount: 5000, description: "Invoice #1234 - Project Alpha", date: "Today, 2:30 PM", status: 'completed', client: "Acme Corp" },
  { id: 2, type: 'outgoing', amount: 1200, description: "Vendor Payment - Cloud Services", date: "Today, 11:00 AM", status: 'completed' },
  { id: 3, type: 'incoming', amount: 3500, description: "Invoice #1233 - Consulting", date: "Yesterday", status: 'pending', client: "TechStart Inc" },
  { id: 4, type: 'outgoing', amount: 450, description: "Subscription - Software License", date: "Nov 23", status: 'completed' },
  { id: 5, type: 'incoming', amount: 8000, description: "Invoice #1232 - Development", date: "Nov 22", status: 'completed', client: "Global Solutions" },
];

const statusColors = {
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
};

interface PaymentGatewayCard {
  name: string;
  description: string;
  status: string;
  statusClassName: string;
  iconBgClassName: string;
  iconClassName: string;
  buttonLabel: string;
  buttonVariant?: "default" | "outline";
  iconType?: "card" | "bank";
}

export function FinancePage() {
  const [location] = useLocation();
  const [activeTab, setActiveTab] = useState(() => {
    if (location.includes('/accounting')) return 'accounting';
    if (location.includes('/wallets')) return 'wallets';
    if (location.includes('/payments')) return 'payments';
    if (location.includes('/reports')) return 'reports';
    return 'accounting';
  });

  const paymentGatewayCards: PaymentGatewayCard[] = [
    {
      name: "Flutterwave",
      description: "Accept cards and mobile money across Africa with unified checkout.",
      status: "Connected",
      statusClassName: "bg-green-500/20 text-green-400 border-green-500/30",
      iconBgClassName: "bg-orange-500/20",
      iconClassName: "text-orange-400",
      buttonLabel: "Configure",
      buttonVariant: "outline",
    },
    {
      name: "KKiaPay",
      description: "Collect local and regional payments with secure merchant processing.",
      status: "Connected",
      statusClassName: "bg-green-500/20 text-green-400 border-green-500/30",
      iconBgClassName: "bg-amber-500/20",
      iconClassName: "text-amber-400",
      buttonLabel: "Configure",
      buttonVariant: "outline",
    },
    {
      name: "Paystack",
      description: "Online payments for cards, bank transfers, and mobile channels.",
      status: "Not Connected",
      statusClassName: "bg-gray-500/20 text-gray-400 border-gray-500/30",
      iconBgClassName: "bg-emerald-500/20",
      iconClassName: "text-emerald-400",
      buttonLabel: "Connect",
      buttonVariant: "default",
    },
    {
      name: "CinetPay",
      description: "Pan-African checkout optimized for Francophone market payment rails.",
      status: "Not Connected",
      statusClassName: "bg-gray-500/20 text-gray-400 border-gray-500/30",
      iconBgClassName: "bg-cyan-500/20",
      iconClassName: "text-cyan-400",
      buttonLabel: "Connect",
      buttonVariant: "default",
    },
    {
      name: "Stripe",
      description: "Global payment processing for online businesses and subscriptions.",
      status: "Not Connected",
      statusClassName: "bg-gray-500/20 text-gray-400 border-gray-500/30",
      iconBgClassName: "bg-purple-500/20",
      iconClassName: "text-purple-400",
      buttonLabel: "Connect",
      buttonVariant: "default",
    },
    {
      name: "Bank Transfer",
      description: "Direct bank transfers for large transactions and settlement workflows.",
      status: "Active",
      statusClassName: "bg-green-500/20 text-green-400 border-green-500/30",
      iconBgClassName: "bg-green-500/20",
      iconClassName: "text-green-400",
      buttonLabel: "View Details",
      buttonVariant: "outline",
      iconType: "bank",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header - stacks on mobile */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
              <DollarSign className="h-5 w-5 md:h-6 md:w-6 text-green-400" />
              Finance
            </h1>
            <p className="text-gray-400 text-sm mt-1">Manage accounting, payments, and reports</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="border-gray-700 h-11 flex-1 sm:flex-initial">
              <Download className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Export</span>
            </Button>
            <Button className="bg-green-600 hover:bg-green-700 h-11 flex-1 sm:flex-initial">
              <Plus className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">New Invoice</span>
            </Button>
          </div>
        </div>

        {/* Stats - horizontal scroll on mobile */}
        <div className="flex gap-3 overflow-x-auto pb-2 mb-6 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-4">
          <Card className="bg-gray-900 border-gray-800 min-w-[160px] flex-shrink-0 md:min-w-0">
            <CardContent className="pt-4 px-3 md:px-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-gray-400 text-xs md:text-sm">Total Revenue</p>
                  <p className="text-xl md:text-2xl font-bold text-white">$127,450</p>
                </div>
                <div className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-green-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 text-green-400 text-xs">
                <ArrowUpRight className="h-3 w-3" />
                <span>12% from last month</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800 min-w-[160px] flex-shrink-0 md:min-w-0">
            <CardContent className="pt-4 px-3 md:px-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-gray-400 text-xs md:text-sm">Total Expenses</p>
                  <p className="text-xl md:text-2xl font-bold text-white">$45,230</p>
                </div>
                <div className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <TrendingDown className="h-4 w-4 md:h-5 md:w-5 text-red-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 text-red-400 text-xs">
                <ArrowUpRight className="h-3 w-3" />
                <span>5% from last month</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800 min-w-[160px] flex-shrink-0 md:min-w-0">
            <CardContent className="pt-4 px-3 md:px-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-gray-400 text-xs md:text-sm">Net Profit</p>
                  <p className="text-xl md:text-2xl font-bold text-white">$82,220</p>
                </div>
                <div className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <DollarSign className="h-4 w-4 md:h-5 md:w-5 text-blue-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 text-green-400 text-xs">
                <ArrowUpRight className="h-3 w-3" />
                <span>18% margin</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800 min-w-[160px] flex-shrink-0 md:min-w-0">
            <CardContent className="pt-4 px-3 md:px-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-gray-400 text-xs md:text-sm">Pending</p>
                  <p className="text-xl md:text-2xl font-bold text-white">$12,500</p>
                </div>
                <div className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                  <Receipt className="h-4 w-4 md:h-5 md:w-5 text-yellow-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 text-yellow-400 text-xs">
                <Clock className="h-3 w-3" />
                <span>3 awaiting</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-gray-900 border border-gray-800 w-full sm:w-auto overflow-x-auto">
            <TabsTrigger value="accounting" className="data-[state=active]:bg-gray-800 h-10 text-xs sm:text-sm">Accounting</TabsTrigger>
            <TabsTrigger value="wallets" className="data-[state=active]:bg-gray-800 h-10 text-xs sm:text-sm">Wallets</TabsTrigger>
            <TabsTrigger value="payments" className="data-[state=active]:bg-gray-800 h-10 text-xs sm:text-sm">Payments</TabsTrigger>
            <TabsTrigger value="reports" className="data-[state=active]:bg-gray-800 h-10 text-xs sm:text-sm">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="accounting" className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="p-4 md:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <CardTitle className="text-white text-base md:text-lg">Recent Transactions</CardTitle>
                  <Button variant="outline" size="sm" className="border-gray-700 h-10 w-full sm:w-auto">View All</Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 md:p-6 pt-0">
                <div className="space-y-3">
                  {mockTransactions.map((tx) => (
                    <div key={tx.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 bg-gray-800/50 rounded-lg border border-gray-700 gap-3">
                      <div className="flex items-center gap-3 md:gap-4">
                        <div className={`h-9 w-9 md:h-10 md:w-10 rounded-full flex items-center justify-center flex-shrink-0 ${tx.type === 'incoming' ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                          {tx.type === 'incoming' ? (
                            <ArrowDownRight className="h-4 w-4 md:h-5 md:w-5 text-green-400" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4 md:h-5 md:w-5 text-red-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-white text-sm md:text-base truncate">{tx.description}</div>
                          <div className="text-xs md:text-sm text-gray-400">
                            {tx.client && <span>{tx.client} • </span>}
                            {tx.date}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-3 md:gap-4 pl-12 sm:pl-0">
                        <Badge variant="outline" className={`${statusColors[tx.status]} text-xs`}>
                          {tx.status}
                        </Badge>
                        <div className={`text-base md:text-lg font-semibold ${tx.type === 'incoming' ? 'text-green-400' : 'text-red-400'}`}>
                          {tx.type === 'incoming' ? '+' : '-'}${tx.amount.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="wallets" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              <Card className="bg-gray-900 border-gray-800">
                <CardContent className="pt-6 p-4 md:p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-11 w-11 md:h-12 md:w-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                      <Wallet className="h-5 w-5 md:h-6 md:w-6 text-blue-400" />
                    </div>
                    <div>
                      <div className="text-sm text-gray-400">Main Wallet</div>
                      <div className="text-lg md:text-xl font-bold text-white">$45,230.00</div>
                    </div>
                  </div>
                  <Button className="w-full h-11" variant="outline">Manage</Button>
                </CardContent>
              </Card>

              <Card className="bg-gray-900 border-gray-800">
                <CardContent className="pt-6 p-4 md:p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-11 w-11 md:h-12 md:w-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                      <DollarSign className="h-5 w-5 md:h-6 md:w-6 text-green-400" />
                    </div>
                    <div>
                      <div className="text-sm text-gray-400">Revenue Wallet</div>
                      <div className="text-lg md:text-xl font-bold text-white">$127,450.00</div>
                    </div>
                  </div>
                  <Button className="w-full h-11" variant="outline">Manage</Button>
                </CardContent>
              </Card>

              <Card className="bg-gray-900 border-gray-800 border-dashed">
                <CardContent className="pt-6 p-4 md:p-6 flex flex-col items-center justify-center h-full min-h-[140px]">
                  <Plus className="h-8 w-8 text-gray-500 mb-2" />
                  <div className="text-gray-400">Add Wallet</div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="payments" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {paymentGatewayCards.map((gateway) => (
                <Card key={gateway.name} className="bg-gray-900 border-gray-800 hover:border-blue-500/50 cursor-pointer transition-all">
                  <CardContent className="pt-6 p-4 md:p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`h-11 w-11 md:h-12 md:w-12 rounded-xl ${gateway.iconBgClassName} flex items-center justify-center`}>
                        {gateway.iconType === "bank" ? (
                          <Building2 className={`h-5 w-5 md:h-6 md:w-6 ${gateway.iconClassName}`} />
                        ) : (
                          <CreditCard className={`h-5 w-5 md:h-6 md:w-6 ${gateway.iconClassName}`} />
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-white">{gateway.name}</div>
                        <Badge className={`${gateway.statusClassName} mt-1 text-xs`}>{gateway.status}</Badge>
                      </div>
                    </div>
                    <p className="text-xs md:text-sm text-gray-400 mb-4">{gateway.description}</p>
                    <Button className="w-full h-11" variant={gateway.buttonVariant ?? "default"}>
                      {gateway.buttonLabel}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-white text-base md:text-lg">Financial Reports</CardTitle>
                <CardDescription className="text-xs md:text-sm">AI-generated financial analysis and reports</CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-6 pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                  <div className="p-3 md:p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors min-h-[80px]">
                    <div className="flex items-center gap-3 mb-2">
                      <FileText className="h-4 w-4 md:h-5 md:w-5 text-blue-400" />
                      <div className="font-medium text-white text-sm md:text-base">Monthly P&L Statement</div>
                    </div>
                    <p className="text-xs md:text-sm text-gray-400">November 2024</p>
                  </div>
                  <div className="p-3 md:p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors min-h-[80px]">
                    <div className="flex items-center gap-3 mb-2">
                      <FileText className="h-4 w-4 md:h-5 md:w-5 text-green-400" />
                      <div className="font-medium text-white text-sm md:text-base">Cash Flow Analysis</div>
                    </div>
                    <p className="text-xs md:text-sm text-gray-400">Q4 2024</p>
                  </div>
                  <div className="p-3 md:p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors min-h-[80px]">
                    <div className="flex items-center gap-3 mb-2">
                      <FileText className="h-4 w-4 md:h-5 md:w-5 text-purple-400" />
                      <div className="font-medium text-white text-sm md:text-base">Revenue Forecast</div>
                    </div>
                    <p className="text-xs md:text-sm text-gray-400">Next 6 months</p>
                  </div>
                  <div className="p-3 md:p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors min-h-[80px]">
                    <div className="flex items-center gap-3 mb-2">
                      <FileText className="h-4 w-4 md:h-5 md:w-5 text-orange-400" />
                      <div className="font-medium text-white text-sm md:text-base">Budget vs Actual</div>
                    </div>
                    <p className="text-xs md:text-sm text-gray-400">YTD 2024</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
