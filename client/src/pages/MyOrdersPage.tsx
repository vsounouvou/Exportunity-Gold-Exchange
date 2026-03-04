import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, RefreshCw, Search, Store, MapPin, Wallet, ShieldCheck, Package } from "lucide-react";

import { useSession } from "@/lib/session";
import { useLocale } from "@/contexts/LocaleContext";
import { apiRequest } from "@/lib/queryClient";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { WalletTopupModal } from "@/components/payments/WalletTopupModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MobileBottomNav } from "@/components/marketplace/MobileBottomNav";

type OrderSummary = {
  id: number;
  orderNumber: string;
  status: string | null;
  total: string;
  createdAt: string;
  deliveryAddress: string | null;
  itemsCount: number;
  previewImage: string | null;
  seller: { id: number; shopName: string } | null;
};

type OrderItem = {
  id: number;
  productId: number;
  productName: string;
  productImage: string | null;
  quantity: number;
  unitPrice: string;
  subtotal: string;
};

type OrderDetailResponse = {
  order: any;
  items: OrderItem[];
  seller: { id: number; shopName: string; phone?: string | null } | null;
};

type WalletSummaryResponse = {
  ok: boolean;
  wallet: { id: string; currency: string; balance: number; status: string; kycLevel: string };
};

function statusMeta(statusRaw: unknown) {
  const status = String(statusRaw ?? "pending").toLowerCase();
  if (status === "delivered") return { label: "DELIVERED", className: "bg-emerald-500/80 text-white border-emerald-400/50" };
  if (status === "confirmed") return { label: "CONFIRMED", className: "bg-sky-500/80 text-white border-sky-400/50" };
  if (status === "ready") return { label: "READY", className: "bg-indigo-500/80 text-white border-indigo-400/50" };
  if (status === "cancelled") return { label: "CANCELLED", className: "bg-rose-500/80 text-white border-rose-400/50" };
  return { label: "PENDING", className: "bg-amber-500/70 text-black border-amber-300/60" };
}

function safeDate(value: unknown) {
  const d = new Date(String(value ?? ""));
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function MyOrdersPage() {
  const session = useSession();
  const { formatAmount, language } = useLocale();
  const [location, navigate] = useLocation();
  const [, params] = useRoute("/orders/:orderNumber");
  const orderNumber = params?.orderNumber;

  const [lookupEmail, setLookupEmail] = useState(() => {
    const stored = localStorage.getItem("orders_lookup_email");
    if (stored) return stored;
    if (session.user?.email) return session.user.email;
    return `guest:${session.guestSessionId}`;
  });
  const [lookupPhone, setLookupPhone] = useState(() => localStorage.getItem("orders_lookup_phone") ?? "");
  const [submitted, setSubmitted] = useState(() => {
    const hasStored = !!localStorage.getItem("orders_lookup_email") || !!localStorage.getItem("orders_lookup_phone");
    return hasStored || !!session.user?.email || !!session.guestSessionId;
  });

  useEffect(() => {
    if (session.user?.email && !lookupEmail) {
      setLookupEmail(session.user.email);
      setSubmitted(true);
    }
  }, [session.user?.email, lookupEmail]);

  const lookup = useMemo(() => {
    const email = lookupEmail.trim().toLowerCase();
    const phone = lookupPhone.trim();
    return { email, phone };
  }, [lookupEmail, lookupPhone]);

  const formatMoney = (amount: unknown) => formatAmount(Number(amount ?? 0), "XOF");

  const ordersQuery = useQuery<{ orders: OrderSummary[] }>({
    queryKey: ["/api/marketplace/buyer/orders", lookup.email, lookup.phone],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (lookup.email) qs.set("email", lookup.email);
      if (lookup.phone) qs.set("phone", lookup.phone);
      const res = await fetch(resolveApiUrl(`/api/marketplace/buyer/orders?${qs.toString()}`));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !orderNumber && submitted && (!!lookup.email || !!lookup.phone),
  });

  const detailQuery = useQuery<OrderDetailResponse>({
    queryKey: ["/api/marketplace/buyer/orders/detail", orderNumber],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl(`/api/marketplace/buyer/orders/${encodeURIComponent(String(orderNumber))}`));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!orderNumber,
  });

  const walletSummaryQuery = useQuery<WalletSummaryResponse>({
    queryKey: ["wallet_summary", session.token, session.guestSessionId],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (session.guestSessionId) headers["x-guest-session"] = session.guestSessionId;
      if (session.token) headers["Authorization"] = `Bearer ${session.token}`;
      const res = await fetch(resolveApiUrl("/api/wallet/summary"), { headers });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!orderNumber,
    retry: 1,
  });

  const payWithWalletMutation = useMutation({
    mutationFn: async (orderNumberValue: string) => {
      const headers: Record<string, string> = {};
      if (session.guestSessionId) headers["x-guest-session"] = session.guestSessionId;
      return apiRequest(`/api/marketplace/buyer/orders/${encodeURIComponent(orderNumberValue)}/pay-with-wallet`, {
        method: "POST",
        headers,
      });
    },
    onSuccess: async () => {
      await Promise.allSettled([detailQuery.refetch(), ordersQuery.refetch(), walletSummaryQuery.refetch()]);
    },
  });

  const walletPayRequested = useMemo(() => {
    const qs = location.includes("?") ? location.split("?")[1] : "";
    const value = new URLSearchParams(qs).get("walletPay");
    return value === "1" || value === "true";
  }, [location]);

  useEffect(() => {
    if (!orderNumber) return;
    if (!walletPayRequested) return;
    if (payWithWalletMutation.isPending) return;
    if (payWithWalletMutation.isSuccess) return;

    const order = detailQuery.data?.order;
    if (!order) return;

    const isPending = String(order?.status ?? "pending").toLowerCase() === "pending";
    if (!isPending) return;

    const orderTotalRounded = Math.max(1, Math.round(Number(order?.total ?? 0)));
    const walletBalance = Number(walletSummaryQuery.data?.wallet?.balance ?? 0);
    if (walletBalance < orderTotalRounded) return;

    payWithWalletMutation.mutate(String(orderNumber));
  }, [detailQuery.data?.order, orderNumber, payWithWalletMutation, walletPayRequested, walletSummaryQuery.data?.wallet?.balance]);

  if (orderNumber) {
    const data = detailQuery.data;
    const order = data?.order;
    const status = statusMeta(order?.status);
    const created = safeDate(order?.createdAt);
    const dateText = created
      ? new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(created)
      : "—";

    const payRequested = useMemo(() => {
      const qs = location.includes("?") ? location.split("?")[1] : "";
      const value = new URLSearchParams(qs).get("pay");
      return value === "1" || value === "true";
    }, [location]);

    const isPending = String(order?.status ?? "pending").toLowerCase() === "pending";
    const orderTotalRounded = Math.max(1, Math.round(Number(order?.total ?? 0)));
    const walletBalance = Number(walletSummaryQuery.data?.wallet?.balance ?? 0);
    const canPayWithWallet = walletBalance >= orderTotalRounded;

    return (
      <div className="min-h-screen bg-black text-white pb-[calc(var(--bottom-stack-height)+16px)] md:pb-0">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <Button
              variant="ghost"
              className="text-white/80 hover:text-white hover:bg-white/10 w-full sm:w-auto justify-start"
              onClick={() => navigate("/orders")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to My Orders
            </Button>
            <Badge className={`text-[10px] px-2 py-1 ${status.className} self-start sm:self-auto`}>{status.label}</Badge>
          </div>

          <Card className="mt-4 bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-lg flex items-center justify-between gap-2">
                <span className="truncate">{String(order?.orderNumber ?? "")}</span>
                <span className="text-amber-400">{formatMoney(order?.total)}</span>
              </CardTitle>
              <div className="text-xs text-white/60">
                <span>{dateText}</span>
                {data?.seller?.shopName ? <span className="ml-2">• {data.seller.shopName}</span> : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-white/70">
                <div className="text-white/50 text-xs mb-1">Delivery address</div>
                <div>{order?.deliveryAddress || "—"}</div>
              </div>

              <div className="border-t border-white/10 pt-3">
                <div className="text-white/60 text-xs mb-2">Items</div>
                <div className="space-y-2">
                  {(data?.items || []).map((item) => (
                    <div key={item.id} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-3">
                      <div className="w-12 h-12 rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
                        <img
                          src={item.productImage || "/product-images/gold-coin.png"}
                          alt={item.productName}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = "/product-images/gold-coin.png";
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-white truncate">{item.productName}</div>
                        <div className="text-xs text-white/50">
                          Qty {item.quantity} • {formatMoney(item.unitPrice)} each
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-amber-400">{formatMoney(item.subtotal)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {isPending && order?.id ? (
                <div className="border-t border-white/10 pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-xs text-white/60">Pay now to confirm your order and start fulfillment.</div>
                    <div className="text-[11px] text-white/50">
                      Wallet balance: {walletSummaryQuery.isLoading ? "..." : `${walletBalance} XOF`}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                    <Button
                      className="bg-amber-500 hover:bg-amber-400 text-black font-semibold"
                      disabled={!canPayWithWallet || payWithWalletMutation.isPending}
                      onClick={() => payWithWalletMutation.mutate(String(orderNumber))}
                    >
                      {payWithWalletMutation.isPending ? "Processing..." : "Pay with wallet"}
                    </Button>
                    {!canPayWithWallet ? (
                      <WalletTopupModal
                        label="Top up & pay"
                        defaultAmount={Math.max(1, orderTotalRounded - walletBalance)}
                        next={`/orders/${encodeURIComponent(String(orderNumber))}?walletPay=1`}
                        autoOpen={payRequested}
                        buttonClassName="bg-white/10 hover:bg-white/15 text-white font-semibold"
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}

              {detailQuery.isLoading ? (
                <div className="text-xs text-white/50">Loading order…</div>
              ) : detailQuery.isError ? (
                <div className="text-xs text-rose-300">Failed to load order details.</div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <MobileBottomNav
          items={[
            {
              key: "browse",
              label: "Browse",
              icon: <Store className="h-4 w-4" />,
              onPress: () => navigate("/?mode=retail"),
            },
            {
              key: "map",
              label: "Map",
              icon: <MapPin className="h-4 w-4" />,
              onPress: () => navigate("/?panel=map"),
            },
            {
              key: "wallet",
              label: "Wallet",
              icon: <Wallet className="h-4 w-4" />,
              primary: true,
              onPress: () => navigate("/?panel=wallet"),
            },
            {
              key: "vault",
              label: "Vault",
              icon: <ShieldCheck className="h-4 w-4" />,
              onPress: () => navigate("/?panel=vault"),
            },
          ]}
        />
      </div>
    );
  }

  const orders = ordersQuery.data?.orders || [];

  return (
    <div className="min-h-screen bg-black text-white pb-[calc(var(--bottom-stack-height)+16px)] md:pb-0">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <div className="text-lg font-semibold">My Orders</div>
              <div className="text-xs text-white/50">Look up your orders by email or phone.</div>
            </div>
          </div>
          <Button
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10 w-full sm:w-auto"
            onClick={() => ordersQuery.refetch()}
            disabled={!submitted || ordersQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${ordersQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <Card className="mt-4 bg-white/5 border-white/10">
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2 space-y-2">
                <div className="text-xs text-white/50">Email (recommended)</div>
                <Input
                  value={lookupEmail}
                  onChange={(e) => setLookupEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="bg-black/30 border-white/10 text-white placeholder:text-white/30"
                />
              </div>
              <div className="space-y-2">
                <div className="text-xs text-white/50">Phone</div>
                <Input
                  value={lookupPhone}
                  onChange={(e) => setLookupPhone(e.target.value)}
                  placeholder="+225 07..."
                  className="bg-black/30 border-white/10 text-white placeholder:text-white/30"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-xs text-white/50">
                {session.isAuthenticated ? `Signed in as ${session.user?.email}` : "Not signed in"}
              </div>
              <Button
                className="bg-amber-500 hover:bg-amber-600 text-black"
                onClick={() => {
                  localStorage.setItem("orders_lookup_email", lookup.email);
                  localStorage.setItem("orders_lookup_phone", lookup.phone);
                  setSubmitted(true);
                  ordersQuery.refetch();
                }}
                disabled={!lookup.email && !lookup.phone}
              >
                <Search className="h-4 w-4 mr-2" />
                Find Orders
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mt-4">
          {ordersQuery.isLoading ? (
            <div className="text-sm text-white/60">Loading orders…</div>
          ) : ordersQuery.isError ? (
            <div className="text-sm text-rose-300">Failed to load orders.</div>
          ) : orders.length === 0 ? (
            <Card className="bg-white/5 border-white/10">
              <CardContent className="py-10 text-center">
                <Package className="h-10 w-10 text-white/25 mx-auto mb-3" />
                <div className="text-white/80 font-medium">No orders found</div>
                <div className="text-xs text-white/50 mt-1">
                  Place an order on the marketplace, then come back here to track it.
                </div>
                <Link href="/">
                  <Button className="mt-4 bg-white/10 hover:bg-white/15 text-white">Go to Marketplace</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[65vh] pr-2">
              <div className="space-y-2 pb-[calc(var(--bottom-stack-height)+16px)]">
                {orders.map((o) => {
                  const status = statusMeta(o.status);
                  const created = safeDate(o.createdAt);
                  const dateText = created
                    ? new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(created)
                    : "—";
                  return (
                    <button
                      key={o.orderNumber}
                      className="w-full text-left bg-white/5 border border-white/10 hover:bg-white/7 hover:border-amber-500/25 rounded-2xl p-3 transition-colors"
                      onClick={() => navigate(`/orders/${encodeURIComponent(o.orderNumber)}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl overflow-hidden border border-white/10 flex-shrink-0">
                          <img
                            src={o.previewImage || "/product-images/gold-coin.png"}
                            alt={o.orderNumber}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = "/product-images/gold-coin.png";
                            }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white truncate">{o.orderNumber}</div>
                              <div className="text-xs text-white/50 truncate">
                                {o.seller?.shopName ? o.seller.shopName : "—"} • {o.itemsCount} item{o.itemsCount === 1 ? "" : "s"}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="text-amber-400 font-semibold">{formatMoney(o.total)}</div>
                              <Badge className={`mt-1 text-[9px] px-2 py-0.5 ${status.className}`}>{status.label}</Badge>
                            </div>
                          </div>
                          <div className="text-[11px] text-white/40 mt-1 truncate">{dateText}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      <MobileBottomNav
        items={[
          {
            key: "browse",
            label: "Browse",
            icon: <Store className="h-4 w-4" />,
            onPress: () => navigate("/?mode=retail"),
          },
          {
            key: "map",
            label: "Map",
            icon: <MapPin className="h-4 w-4" />,
            onPress: () => navigate("/?panel=map"),
          },
          {
            key: "wallet",
            label: "Wallet",
            icon: <Wallet className="h-4 w-4" />,
            primary: true,
            onPress: () => navigate("/?panel=wallet"),
          },
          {
            key: "vault",
            label: "Vault",
            icon: <ShieldCheck className="h-4 w-4" />,
            onPress: () => navigate("/?panel=vault"),
          },
        ]}
      />
    </div>
  );
}
