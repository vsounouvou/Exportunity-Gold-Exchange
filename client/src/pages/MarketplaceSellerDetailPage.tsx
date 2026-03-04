import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Loader2, Pencil, RefreshCw, Wand2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { broadcastMarketplaceRefresh } from "@/lib/marketplaceRefresh";
import { useToast } from "@/hooks/use-toast";

type Seller = {
  id: number;
  shopName: string;
  slug?: string | null;
  status: string;
  phoneNumber?: string | null;
  email?: string | null;
  createdAt?: string | null;
  approvedAt?: string | null;
};

type SellerStats = {
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  totalProducts: number;
  activeProducts: number;
  walletBalance: string;
  totalSales: string;
  rating: string;
  reviewCount: number;
};

type AdminCategory = { id: number; name: string; slug: string };

type AdminProduct = {
  id: number;
  name: string;
  slug: string;
  status: string;
  price: string;
  currency?: string | null;
  stockQuantity: number | null;
  categoryId: number | null;
  images: string[] | null;
  shortDescription?: string | null;
  description?: string | null;
};

type AdminProductItem = {
  product: AdminProduct;
  seller: { id: number; shopName: string } | null;
  category: AdminCategory | null;
  imageAsset: { namespace: string; assetKey: string };
};

type AdminProductListResponse = {
  tenantKey: string;
  tenantId: number;
  items: AdminProductItem[];
  limit: number;
  offset: number;
};

function SellerStatusBadge({ status }: { status: string }) {
  const normalized = String(status || "").toLowerCase();

  if (normalized === "approved") {
    return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Approved</Badge>;
  }
  if (normalized === "pending") {
    return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pending</Badge>;
  }
  if (normalized === "rejected") {
    return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Rejected</Badge>;
  }
  if (normalized === "suspended") {
    return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Suspended</Badge>;
  }

  return <Badge variant="outline">{status || "Unknown"}</Badge>;
}

function safeMoney(value: unknown) {
  const n = typeof value === "number" ? value : Number(String(value ?? ""));
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

function firstImageUrl(product: AdminProduct) {
  if (Array.isArray(product.images) && typeof product.images[0] === "string" && product.images[0].trim()) {
    return product.images[0];
  }
  return null;
}

export default function MarketplaceSellerDetailPage({ sellerId }: { sellerId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [activeTab, setActiveTab] = useState<"products" | "seller">("products");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [hasImage, setHasImage] = useState("all");
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    categoryId: "",
    price: "",
    stockQuantity: "",
    autoGenerateImage: true,
  });
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const sellerQuery = useQuery<Seller>({
    queryKey: ["seller_detail", sellerId],
    queryFn: async () => apiRequest(`/api/marketplace/sellers/${sellerId}`),
    enabled: Number.isFinite(sellerId) && sellerId > 0,
  });

  const statsQuery = useQuery<SellerStats>({
    queryKey: ["seller_stats", sellerId],
    queryFn: async () => apiRequest(`/api/marketplace/sellers/${sellerId}/stats`),
    enabled: Number.isFinite(sellerId) && sellerId > 0,
  });

  const categoriesQuery = useQuery<{ ok: boolean; categories: AdminCategory[] }>({
    queryKey: ["admin_marketplace_categories"],
    queryFn: async () => apiRequest("/api/admin/marketplace/categories"),
    staleTime: 5 * 60_000,
  });

  const productsQs = useMemo(() => {
    const params = new URLSearchParams();
    params.set("sellerId", String(sellerId));
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    if (q.trim()) params.set("q", q.trim());
    if (status !== "all") params.set("status", status);
    if (categoryId !== "all") params.set("categoryId", categoryId);
    if (hasImage !== "all") params.set("hasImage", hasImage);
    return params.toString();
  }, [categoryId, hasImage, limit, offset, q, sellerId, status]);

  const productsQuery = useQuery<AdminProductListResponse>({
    queryKey: ["admin_marketplace_products", productsQs],
    queryFn: async () => apiRequest(`/api/admin/marketplace/products?${productsQs}`),
    enabled: activeTab === "products" && Number.isFinite(sellerId) && sellerId > 0,
  });

  const regeneratePrimaryMutation = useMutation({
    mutationFn: async (productId: number) => {
      return apiRequest(`/api/admin/marketplace/products/${productId}/regenerate-primary-image`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_marketplace_products"] });
      broadcastMarketplaceRefresh();
      toast({ title: "Regenerating image..." });
    },
    onError: (err: any) => {
      toast({ title: String(err?.message || "Failed to regenerate image"), variant: "destructive" });
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async () => {
      const name = createForm.name.trim();
      const category = Number(createForm.categoryId);
      const price = Number(createForm.price);
      const stockQuantity = createForm.stockQuantity.trim() ? Number(createForm.stockQuantity) : 0;

      if (!name) throw new Error("Product name is required");
      if (!Number.isFinite(category) || category <= 0) throw new Error("Category is required");
      if (!Number.isFinite(price) || price <= 0) throw new Error("Price must be > 0");
      if (!Number.isFinite(stockQuantity) || stockQuantity < 0) throw new Error("Stock must be >= 0");

      const payload: any = { name, categoryId: category, price, stockQuantity };
      if (createForm.autoGenerateImage) payload.images = [];

      return apiRequest(`/api/marketplace/sellers/${sellerId}/products`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (created) => {
      setCreateOpen(false);
      setCreateForm({ name: "", categoryId: "", price: "", stockQuantity: "", autoGenerateImage: true });
      queryClient.invalidateQueries({ queryKey: ["admin_marketplace_products"] });
      queryClient.invalidateQueries({ queryKey: ["seller_stats", sellerId] });
      broadcastMarketplaceRefresh();
      toast({ title: "Product created" });

      const productId = Number((created as any)?.id);
      if (Number.isFinite(productId) && productId > 0) {
        setLocation(
          `/admin/marketplace/products?sellerId=${encodeURIComponent(String(sellerId))}&edit=${encodeURIComponent(
            String(productId),
          )}`,
        );
      }
    },
    onError: (err: any) => {
      toast({ title: String(err?.message || "Failed to create product"), variant: "destructive" });
    },
  });

  const approveSellerMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/marketplace/sellers/${sellerId}/approve`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seller_detail", sellerId] });
      queryClient.invalidateQueries({ queryKey: ["seller_stats", sellerId] });
      toast({ title: "Seller approved" });
    },
    onError: (err: any) => {
      toast({ title: String(err?.message || "Failed to approve seller"), variant: "destructive" });
    },
  });

  const rejectSellerMutation = useMutation({
    mutationFn: async () => {
      const reason = rejectReason.trim();
      return apiRequest(`/api/marketplace/sellers/${sellerId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: reason || undefined }),
      });
    },
    onSuccess: () => {
      setRejectOpen(false);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["seller_detail", sellerId] });
      queryClient.invalidateQueries({ queryKey: ["seller_stats", sellerId] });
      toast({ title: "Seller rejected" });
    },
    onError: (err: any) => {
      toast({ title: String(err?.message || "Failed to reject seller"), variant: "destructive" });
    },
  });

  const seller = sellerQuery.data;
  const isLoading = sellerQuery.isLoading;
  const error = sellerQuery.error;
  const stats = statsQuery.data;
  const categories = categoriesQuery.data?.categories ?? [];
  const items = productsQuery.data?.items ?? [];
  const canPrev = offset > 0;
  const canNext = items.length >= limit;

  return (
    <div className="p-4 md:p-8 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/marketplace/sellers">
            <Button variant="outline" className="border-gray-700 text-gray-200 hover:bg-gray-800">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <div className="text-xs text-gray-400">Seller</div>
            <div className="text-lg font-semibold text-white flex items-center gap-2">
              {seller?.shopName || (isLoading ? "Loading..." : `Seller #${sellerId}`)}
              {seller?.status ? <SellerStatusBadge status={seller.status} /> : null}
            </div>
            {seller?.slug ? <div className="text-xs text-gray-400">/{seller.slug}</div> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            onClick={() => {
              sellerQuery.refetch();
              statsQuery.refetch();
              productsQuery.refetch();
            }}
            disabled={sellerQuery.isFetching || statsQuery.isFetching || productsQuery.isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${
                sellerQuery.isFetching || statsQuery.isFetching || productsQuery.isFetching ? "animate-spin" : ""
              }`}
            />
            Refresh
          </Button>
          {seller?.status === "pending" ? (
            <>
              <Button
                variant="outline"
                className="border-green-500/30 text-green-300 hover:bg-green-500/10"
                onClick={() => approveSellerMutation.mutate()}
                disabled={approveSellerMutation.isPending}
              >
                Approve
              </Button>
              <Button
                variant="outline"
                className="border-red-500/30 text-red-300 hover:bg-red-500/10"
                onClick={() => setRejectOpen(true)}
                disabled={rejectSellerMutation.isPending}
              >
                Reject
              </Button>
            </>
          ) : null}
          <Button
            className="bg-amber-600 hover:bg-amber-700 text-black"
            onClick={() => setLocation(`/admin/marketplace/products?sellerId=${encodeURIComponent(String(sellerId))}`)}
          >
            Product Studio
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="bg-gray-900/50 border-gray-800">
          <CardContent className="p-4">
            <div className="text-xs text-gray-400">Products</div>
            <div className="text-lg font-semibold text-white">
              {statsQuery.isLoading ? "..." : `${stats?.activeProducts ?? 0}/${stats?.totalProducts ?? 0}`}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 border-gray-800">
          <CardContent className="p-4">
            <div className="text-xs text-gray-400">Orders</div>
            <div className="text-lg font-semibold text-white">{statsQuery.isLoading ? "..." : safeMoney(stats?.totalOrders ?? 0)}</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 border-gray-800">
          <CardContent className="p-4">
            <div className="text-xs text-gray-400">Wallet</div>
            <div className="text-lg font-semibold text-white">{statsQuery.isLoading ? "..." : safeMoney(stats?.walletBalance)}</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 border-gray-800">
          <CardContent className="p-4">
            <div className="text-xs text-gray-400">Rating</div>
            <div className="text-lg font-semibold text-white">
              {statsQuery.isLoading ? "..." : `${stats?.rating ?? "-"} (${stats?.reviewCount ?? 0})`}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="bg-gray-900/50 border border-gray-800">
          <TabsTrigger value="products" className="data-[state=active]:bg-gray-800">
            Products
          </TabsTrigger>
          <TabsTrigger value="seller" className="data-[state=active]:bg-gray-800">
            Seller
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4">
          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-white">Products</CardTitle>
                <Button className="bg-amber-600 hover:bg-amber-700 text-black" onClick={() => setCreateOpen(true)}>
                  New product
                </Button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 mt-3">
                <Input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setOffset(0);
                  }}
                  placeholder="Search products..."
                  className="bg-gray-950 border-gray-800 text-white placeholder:text-white/30 lg:col-span-2"
                />
                <Select
                  value={status}
                  onValueChange={(v) => {
                    setStatus(v);
                    setOffset(0);
                  }}
                >
                  <SelectTrigger className="bg-gray-950 border-gray-800 text-white">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-950 border-gray-800 text-white">
                    <SelectItem value="all">All statuses</SelectItem>
                    {["draft", "active", "inactive", "archived"].map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={categoryId}
                  onValueChange={(v) => {
                    setCategoryId(v);
                    setOffset(0);
                  }}
                >
                  <SelectTrigger className="bg-gray-950 border-gray-800 text-white">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-950 border-gray-800 text-white">
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={hasImage}
                  onValueChange={(v) => {
                    setHasImage(v);
                    setOffset(0);
                  }}
                >
                  <SelectTrigger className="bg-gray-950 border-gray-800 text-white">
                    <SelectValue placeholder="Images" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-950 border-gray-800 text-white">
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="true">Has image</SelectItem>
                    <SelectItem value="false">Missing image</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {productsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-gray-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading products...
                </div>
              ) : productsQuery.error ? (
                <div className="text-sm text-red-300">
                  Failed to load products: {(productsQuery.error as Error).message}
                </div>
              ) : (
                <>
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-800 hover:bg-transparent">
                          <TableHead className="text-gray-400">Image</TableHead>
                          <TableHead className="text-gray-400">Product</TableHead>
                          <TableHead className="text-gray-400">Status</TableHead>
                          <TableHead className="text-gray-400">Category</TableHead>
                          <TableHead className="text-gray-400 text-right">Price</TableHead>
                          <TableHead className="text-gray-400 text-right">Stock</TableHead>
                          <TableHead className="text-gray-400 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.length === 0 ? (
                          <TableRow className="border-gray-800">
                            <TableCell colSpan={7} className="text-gray-300">
                              No products match these filters.
                            </TableCell>
                          </TableRow>
                        ) : (
                          items.map((item) => {
                            const img = firstImageUrl(item.product);
                            return (
                              <TableRow key={item.product.id} className="border-gray-800">
                                <TableCell className="py-3">
                                  <div className="h-12 w-12 rounded-md bg-black/30 border border-white/10 overflow-hidden">
                                    {img ? (
                                      <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
                                    ) : (
                                      <div className="h-full w-full flex items-center justify-center text-[10px] text-white/30">
                                        No image
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="text-white font-medium">{item.product.name}</div>
                                  <div className="text-xs text-gray-400">#{item.product.id}</div>
                                </TableCell>
                                <TableCell>
                                  <Badge className="bg-white/5 text-white border-white/10">{item.product.status}</Badge>
                                </TableCell>
                                <TableCell className="text-gray-200">{item.category?.name ?? "-"}</TableCell>
                                <TableCell className="text-right text-gray-200">
                                  {safeMoney(item.product.price)} {item.product.currency || ""}
                                </TableCell>
                                <TableCell className="text-right text-gray-200">
                                  {item.product.stockQuantity ?? "-"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      variant="outline"
                                      className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                                      onClick={() => setLocation(`/product/${item.product.id}`)}
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                                      onClick={() =>
                                        setLocation(
                                          `/admin/marketplace/products?sellerId=${encodeURIComponent(
                                            String(sellerId),
                                          )}&edit=${item.product.id}`,
                                        )
                                      }
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                                      onClick={() =>
                                        setLocation(
                                          `/admin/marketplace/products?sellerId=${encodeURIComponent(
                                            String(sellerId),
                                          )}&images=${item.product.id}`,
                                        )
                                      }
                                    >
                                      Images
                                    </Button>
                                    <Button
                                      className="bg-amber-600 hover:bg-amber-700 text-black"
                                      onClick={() => regeneratePrimaryMutation.mutate(item.product.id)}
                                      disabled={regeneratePrimaryMutation.isPending}
                                    >
                                      <Wand2 className="h-4 w-4 mr-2" />
                                      Regenerate
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
                    <div className="text-xs text-gray-400">
                      Showing {items.length ? offset + 1 : 0}-{offset + items.length} (limit {limit})
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={String(limit)}
                        onValueChange={(v) => {
                          setLimit(Number(v));
                          setOffset(0);
                        }}
                      >
                        <SelectTrigger className="bg-gray-950 border-gray-800 text-white w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-950 border-gray-800 text-white">
                          {[20, 50, 100].map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n} / page
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                        disabled={!canPrev || productsQuery.isFetching}
                        onClick={() => setOffset(Math.max(0, offset - limit))}
                      >
                        Prev
                      </Button>
                      <Button
                        variant="outline"
                        className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                        disabled={!canNext || productsQuery.isFetching}
                        onClick={() => setOffset(offset + limit)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seller" className="mt-4">
          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Seller</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center gap-2 text-gray-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading seller...
                </div>
              ) : error ? (
                <div className="text-sm text-red-300">Failed to load seller: {(error as Error).message}</div>
              ) : !seller ? (
                <div className="text-sm text-gray-300">Seller not found.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-400">Contact</div>
                    <div className="text-white">{seller.phoneNumber || "-"}</div>
                    <div className="text-white">{seller.email || "-"}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Status</div>
                    <div className="text-white flex items-center gap-2">
                      <span>{seller.status}</span>
                      <SellerStatusBadge status={seller.status} />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-gray-950 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle>Create product</DialogTitle>
            <DialogDescription className="text-gray-400">
              Creates a draft product for this seller. Use Product Studio for full editing and multi-image management.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label className="text-gray-300" htmlFor="seller_product_name">
                Name
              </Label>
              <Input
                id="seller_product_name"
                value={createForm.name}
                onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                className="bg-gray-900 border-gray-800 text-white"
                placeholder="e.g. Stamped Gold Coin 10g"
              />
            </div>

            <div className="grid gap-1">
              <Label className="text-gray-300">Category</Label>
              <Select value={createForm.categoryId} onValueChange={(v) => setCreateForm((p) => ({ ...p, categoryId: v }))}>
                <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent className="bg-gray-950 border-gray-800 text-white">
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label className="text-gray-300" htmlFor="seller_product_price">
                  Price
                </Label>
                <Input
                  id="seller_product_price"
                  value={createForm.price}
                  onChange={(e) => setCreateForm((p) => ({ ...p, price: e.target.value }))}
                  className="bg-gray-900 border-gray-800 text-white"
                  placeholder="e.g. 25000"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-gray-300" htmlFor="seller_product_stock">
                  Stock
                </Label>
                <Input
                  id="seller_product_stock"
                  value={createForm.stockQuantity}
                  onChange={(e) => setCreateForm((p) => ({ ...p, stockQuantity: e.target.value }))}
                  className="bg-gray-900 border-gray-800 text-white"
                  placeholder="e.g. 25"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-300">
              <input
                id="seller_product_autogen"
                type="checkbox"
                checked={createForm.autoGenerateImage}
                onChange={(e) => setCreateForm((p) => ({ ...p, autoGenerateImage: e.target.checked }))}
              />
              <Label className="cursor-pointer text-gray-300" htmlFor="seller_product_autogen">
                Generate primary image now
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-black"
              onClick={() => createProductMutation.mutate()}
              disabled={createProductMutation.isPending}
            >
              {createProductMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="bg-gray-950 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle>Reject seller</DialogTitle>
            <DialogDescription className="text-gray-400">Optional: record a reason for rejection.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label className="text-gray-300" htmlFor="reject_reason">
              Reason
            </Label>
            <Input
              id="reject_reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="bg-gray-900 border-gray-800 text-white"
              placeholder="e.g. Missing KYC, invalid phone, incomplete shop details"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
              onClick={() => setRejectOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => rejectSellerMutation.mutate()}
              disabled={rejectSellerMutation.isPending}
            >
              {rejectSellerMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Rejecting...
                </>
              ) : (
                "Reject"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
