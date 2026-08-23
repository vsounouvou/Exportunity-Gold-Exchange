import { useEffect, useMemo, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Package, ShieldAlert } from "lucide-react";

import { AppProBottomNav } from "@/components/agentic/AppProBottomNav";
import { AppProTopBar } from "@/components/agentic/AppProTopBar";
import { ProSideNav } from "@/components/agentic/ProSideNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";

type Seller = {
  id: number;
  shopName?: string | null;
  status?: string | null;
};

type Order = {
  id: number;
  orderNumber: string;
  status: string | null;
  total: string;
  buyerName: string | null;
  buyerPhone: string | null;
  createdAt: string;
};

type OrdersTab = "new" | "processing" | "completed" | "disputed";

function parseOrdersTab(location: string): OrdersTab {
  try {
    const parsed = new URL(location, "https://app.local");
    const raw = String(parsed.searchParams.get("tab") || "").trim().toLowerCase();
    if (raw === "processing" || raw === "completed" || raw === "disputed") return raw;
  } catch {
    // ignore parse errors
  }
  return "new";
}

function ordersUrl(tab: OrdersTab) {
  if (tab === "new") return "/pro/orders";
  return `/pro/orders?tab=${encodeURIComponent(tab)}`;
}

function bucketForStatus(statusRaw: unknown): OrdersTab {
  const status = String(statusRaw ?? "").trim().toLowerCase();
  if (!status) return "new";
  if (status.includes("disput") || status.includes("issue") || status.includes("chargeback") || status.includes("cancel")) return "disputed";
  if (status.includes("deliver") || status.includes("complete") || status.includes("done")) return "completed";
  if (status.includes("process") || status.includes("confirm") || status.includes("ready") || status.includes("paid")) return "processing";
  if (status.includes("new") || status.includes("pending") || status.includes("created")) return "new";
  return "processing";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMoney(value: string | number | null | undefined, currency = "XOF") {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return `0 ${currency}`;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount)} ${currency}`;
}

export default function AppProOrdersPage() {
  const { isAuthenticated, isGuest, user } = useSession();
  const [location, setLocation] = useLocation();
  const [tab, setTab] = useState<OrdersTab>(() => parseOrdersTab(location));

  useEffect(() => {
    const next = parseOrdersTab(location);
    if (next !== tab) setTab(next);
  }, [location, tab]);

  if (!isAuthenticated || isGuest) {
    return <Redirect to={`/pro/login?next=${encodeURIComponent(location)}`} />;
  }

  const sellerQuery = useQuery<Seller | null>({
    queryKey: ["/api/marketplace/sellers/by-user", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      try {
        return (await apiRequest(`/api/marketplace/sellers/by-user/${user?.id}`)) as Seller;
      } catch (error: any) {
        const msg = String(error?.message || "").toLowerCase();
        if (msg.includes("seller not found")) return null;
        throw error;
      }
    },
    staleTime: 10_000,
    retry: 1,
  });

  const sellerId = sellerQuery.data?.id;

  const ordersQuery = useQuery<Order[]>({
    queryKey: ["/api/marketplace/sellers", sellerId, "orders"],
    enabled: !!sellerId,
    queryFn: async () => (await apiRequest(`/api/marketplace/sellers/${sellerId}/orders`)) as Order[],
    staleTime: 8_000,
    retry: 1,
  });

  const currency = "XOF";
  const allOrders = Array.isArray(ordersQuery.data) ? ordersQuery.data : [];

  const grouped = useMemo(() => {
    const result: Record<OrdersTab, Order[]> = { new: [], processing: [], completed: [], disputed: [] };
    for (const order of allOrders) {
      result[bucketForStatus(order.status)].push(order);
    }
    for (const key of Object.keys(result) as OrdersTab[]) {
      result[key].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return result;
  }, [allOrders]);

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-24 text-[#07111F]">
      <ProSideNav activeKey="orders" />
      <div className="md:ml-56">
        <AppProTopBar subtitle="Orders" />
        <main className="mx-auto w-full max-w-3xl px-4 py-4">
          <Tabs
            value={tab}
            onValueChange={(next) => {
              const safe = (next === "processing" || next === "completed" || next === "disputed" ? next : "new") as OrdersTab;
              setTab(safe);
              setLocation(ordersUrl(safe), { replace: true });
            }}
          >
            <TabsList className="grid w-full grid-cols-4 border border-slate-200 bg-white">
              <TabsTrigger value="new">New</TabsTrigger>
              <TabsTrigger value="processing">Processing</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="disputed">Disputed</TabsTrigger>
            </TabsList>

            {(["new", "processing", "completed", "disputed"] as OrdersTab[]).map((key) => {
              const ordersForTab = grouped[key] || [];
              return (
                <TabsContent key={key} value={key} className="mt-4 space-y-3">
                  {!sellerQuery.isLoading && !sellerId ? (
                    <Card className="border-slate-200 bg-white shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <ShieldAlert className="h-4 w-4 text-[#9A6200]" />
                          Orders are handled in Operations
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm text-slate-600">
                        <p>Your company does not have a seller shop yet. Use the Orders Agent to manage requests and fulfillment.</p>
                        <Button
                          className="w-full bg-amber-500 text-black hover:bg-amber-400"
                          onClick={() => setLocation("/pro/operations/procurement")}
                        >
                          <Package className="mr-2 h-4 w-4" />
                          Open Orders Agent
                        </Button>
                      </CardContent>
                    </Card>
                  ) : null}

                  {sellerId ? (
                    ordersForTab.length ? (
                      ordersForTab.map((order) => (
                        <button
                          key={order.id}
                          type="button"
                          className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-[#F5A623]/50"
                          onClick={() => setLocation("/pro/operations/procurement")}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="truncate text-sm font-black">{order.orderNumber}</div>
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                                  {String(order.status || "pending")}
                                </span>
                              </div>
                              <div className="mt-1 truncate text-xs text-slate-500">
                                {order.buyerName || "Buyer"}
                                {order.buyerPhone ? ` • ${order.buyerPhone}` : ""}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-sm font-black text-[#8A5700]">{formatMoney(order.total, currency)}</div>
                              <div className="mt-1 text-[11px] text-slate-400">{formatDateTime(order.createdAt)}</div>
                            </div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <Card className="border-slate-200 bg-white">
                        <CardContent className="p-5 text-sm text-slate-600">No orders in this state yet.</CardContent>
                      </Card>
                    )
                  ) : null}
                </TabsContent>
              );
            })}
          </Tabs>
        </main>

        <AppProBottomNav activeKey="orders" />
      </div>
    </div>
  );
}
