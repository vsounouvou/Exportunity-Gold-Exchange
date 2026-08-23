import { useMemo } from "react";
import { Redirect, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Package, Share2, ShoppingCart, Store, Users } from "lucide-react";

import { AppProBottomNav } from "@/components/agentic/AppProBottomNav";
import { AppProTopBar } from "@/components/agentic/AppProTopBar";
import { ProSideNav } from "@/components/agentic/ProSideNav";
import { WalletStrip } from "@/components/agentic/WalletStrip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";

type Seller = {
  id: number;
  shopName: string;
  slug: string;
  status: string;
};

type SellerStats = {
  totalOrders: number;
  totalProducts: number;
  totalSales: string;
  rating: string;
  reviewCount: number;
};

type Product = {
  id: number;
  name: string;
  price: string;
  stockQuantity: number | null;
  status: string;
};

type Order = {
  id: number;
  orderNumber: string;
  status: string;
  total: string;
  buyerName: string | null;
  buyerPhone: string | null;
  createdAt: string;
};

type Client = {
  userId: string;
  displayName: string | null;
  lastAt: string;
  lastAmount: number;
};

function formatXof(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "0 XOF";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount)} XOF`;
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

export default function AppProShopPage() {
  const { isAuthenticated, isGuest, user } = useSession();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  const sellerQuery = useQuery<Seller | null>({
    queryKey: ["/api/marketplace/sellers/by-user", user?.id],
    enabled: isAuthenticated && !isGuest && !!user?.id,
    queryFn: async () => {
      try {
        return await apiRequest(`/api/marketplace/sellers/by-user/${user?.id}`);
      } catch (error: any) {
        const msg = String(error?.message || "").toLowerCase();
        if (msg.includes("seller not found")) return null;
        throw error;
      }
    },
    staleTime: 10_000,
  });

  const sellerId = sellerQuery.data?.id;

  const statsQuery = useQuery<SellerStats>({
    queryKey: ["/api/marketplace/sellers", sellerId, "stats"],
    enabled: isAuthenticated && !isGuest && !!sellerId,
    queryFn: async () => apiRequest(`/api/marketplace/sellers/${sellerId}/stats`),
    staleTime: 8_000,
  });

  const productsQuery = useQuery<Product[]>({
    queryKey: ["/api/marketplace/sellers", sellerId, "products"],
    enabled: isAuthenticated && !isGuest && !!sellerId,
    queryFn: async () => apiRequest(`/api/marketplace/sellers/${sellerId}/products`),
    staleTime: 8_000,
  });

  const ordersQuery = useQuery<Order[]>({
    queryKey: ["/api/marketplace/sellers", sellerId, "orders"],
    enabled: isAuthenticated && !isGuest && !!sellerId,
    queryFn: async () => apiRequest(`/api/marketplace/sellers/${sellerId}/orders`),
    staleTime: 8_000,
  });

  const clientsQuery = useQuery<{ clients: Client[] }>({
    queryKey: ["/api/seller/clients/recent"],
    enabled: isAuthenticated && !isGuest && !!sellerId,
    queryFn: async () => apiRequest("/api/seller/clients/recent"),
    staleTime: 8_000,
  });

  const shopUrl = useMemo(() => {
    if (!sellerQuery.data?.id) return "";
    if (typeof window === "undefined") return `/marketplace/sellers/${sellerQuery.data.id}`;
    return `${window.location.origin}/marketplace/sellers/${sellerQuery.data.id}`;
  }, [sellerQuery.data?.id]);

  const handleShareShop = async () => {
    if (!shopUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: sellerQuery.data?.shopName || "My Shop", url: shopUrl });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shopUrl);
      }
      toast({ title: "Shop link ready", description: "Share link copied or shared." });
    } catch {
      toast({ title: "Share cancelled" });
    }
  };

  if (!isAuthenticated || isGuest) {
    return <Redirect to={`/pro/login?next=${encodeURIComponent(location)}`} />;
  }

  if (!sellerQuery.data) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] pb-24 text-slate-950">
        <ProSideNav activeKey="operations" />
        <div className="md:ml-56">
          <AppProTopBar subtitle="Shop" />
          <WalletStrip href="/pro/money" />
          <div className="mx-auto max-w-xl px-4 py-6">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Store className="h-5 w-5 text-[#B26F00]" />
                  Seller workspace
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-slate-600">
                <p>Complete the governed seller application before products, orders, and customer conversations are activated.</p>
                <Button
                  className="w-full bg-[#F5A623] font-semibold text-[#07111F] hover:bg-[#F8C45B]"
                  onClick={() => setLocation("/apply/shop")}
                >
                  Start seller application
                </Button>
              </CardContent>
            </Card>
          </div>
          <AppProBottomNav activeKey="operations" />
        </div>
      </div>
    );
  }

  const seller = sellerQuery.data;
  const stats = statsQuery.data;
  const products = productsQuery.data || [];
  const orders = ordersQuery.data || [];
  const clients = clientsQuery.data?.clients || [];

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-24 text-slate-950">
      <ProSideNav activeKey="operations" />
      <div className="md:ml-56">
      <AppProTopBar subtitle="Shop" />
      <WalletStrip href="/pro/money" />
      <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="pt-5 space-y-4">
            <div>
              <div className="text-xs uppercase tracking-[0.12em] text-slate-500">Seller workspace</div>
              <div className="text-lg font-semibold mt-1">{seller.shopName || "Shop"}</div>
              <div className="mt-1 text-xs text-slate-500">Status: {seller.status}</div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div className="text-slate-500">Products</div>
                <div className="text-sm font-semibold">{stats?.totalProducts ?? products.length}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div className="text-slate-500">Orders</div>
                <div className="text-sm font-semibold">{stats?.totalOrders ?? orders.length}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div className="text-slate-500">Sales</div>
                <div className="text-sm font-semibold">{formatXof(stats?.totalSales ?? 0)}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="border-slate-300 text-slate-700"
                onClick={() => setLocation(`/marketplace/sellers/${seller.id}`)}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open
              </Button>
              <Button variant="outline" className="border-slate-300 text-slate-700" onClick={handleShareShop}>
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
              <Button
                variant="outline"
                className="border-slate-300 text-slate-700"
                onClick={() => setLocation("/seller-dashboard")}
              >
                Edit
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="products">
          <TabsList className="grid w-full grid-cols-3 border border-slate-200 bg-white">
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="mt-3 space-y-2">
            {products.slice(0, 8).map((product) => (
              <Card key={product.id} className="border-slate-200 bg-white shadow-sm">
                <CardContent className="pt-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{product.name}</div>
                    <div className="mt-1 text-xs text-slate-600">
                      {formatXof(product.price)} · Stock {product.stockQuantity ?? 0}
                    </div>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">{product.status}</div>
                </CardContent>
              </Card>
            ))}
            {!products.length ? (
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="pt-6 text-sm text-slate-600">No products yet. Add products from your seller dashboard.</CardContent>
              </Card>
            ) : null}
          </TabsContent>

          <TabsContent value="orders" className="mt-3 space-y-2">
            {orders.slice(0, 8).map((order) => (
              <Card key={order.id} className="border-slate-200 bg-white shadow-sm">
                <CardContent className="pt-4 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold truncate">{order.orderNumber}</div>
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">{order.status}</div>
                  </div>
                  <div className="text-xs text-slate-600">{order.buyerName || "Client"} · {formatXof(order.total)}</div>
                  <div className="text-[11px] text-slate-400">{formatDateTime(order.createdAt)}</div>
                </CardContent>
              </Card>
            ))}
            {!orders.length ? (
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="pt-6 text-sm text-slate-600">No orders yet.</CardContent>
              </Card>
            ) : null}
          </TabsContent>

          <TabsContent value="clients" className="mt-3 space-y-2">
            {clients.slice(0, 10).map((client) => (
              <Card key={client.userId} className="border-slate-200 bg-white shadow-sm">
                <CardContent className="pt-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{client.displayName || `Client ${client.userId}`}</div>
                    <div className="text-[11px] text-slate-500">Last top-up {formatXof(client.lastAmount)}</div>
                  </div>
                  <div className="text-[11px] text-slate-400">{formatDateTime(client.lastAt)}</div>
                </CardContent>
              </Card>
            ))}
            {!clients.length ? (
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="pt-6 text-sm text-slate-600">No client records yet.</CardContent>
              </Card>
            ) : null}
          </TabsContent>

        </Tabs>

        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" className="border-slate-300 text-slate-700" onClick={() => setLocation("/pro/threads/sales")}>
            <Users className="h-4 w-4 mr-2" />
            Clients
          </Button>
          <Button variant="outline" className="border-slate-300 text-slate-700" onClick={() => setLocation("/pro/threads/procurement")}>
            <ShoppingCart className="h-4 w-4 mr-2" />
            Orders
          </Button>
          <Button variant="outline" className="border-slate-300 text-slate-700" onClick={() => setLocation("/pro/threads/team")}>
            <Package className="h-4 w-4 mr-2" />
            Team
          </Button>
        </div>
      </div>

      <AppProBottomNav activeKey="operations" />
      </div>
    </div>
  );
}
