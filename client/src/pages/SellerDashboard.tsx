import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Package, 
  ShoppingCart, 
  Wallet, 
  Star, 
  TrendingUp, 
  Plus,
  Edit,
  Trash2,
  Eye,
  BarChart3,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Store,
  Loader2,
  Coins,
  Scale,
  Shield,
  MapPin,
  RefreshCw,
  Calculator,
  Images,
  Wand2
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { SellerProductImagesDialog } from "@/components/SellerProductImagesDialog";

const productSchema = z.object({
  name: z.string().min(2, "Product name must be at least 2 characters"),
  description: z.string().optional(),
  shortDescription: z.string().optional(),
  price: z.number().min(0, "Price must be positive"),
  stockQuantity: z.number().min(0, "Stock must be positive").optional(),
  categoryId: z.number().optional(),
  isHandmade: z.boolean().optional(),
  productionTime: z.string().optional(),
  videoUrl: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().url("Video URL must be a valid URL").nullable().optional(),
  ),
});

type ProductFormData = z.infer<typeof productSchema>;

type ProductI18nLang = "en" | "fr" | "ar";
type ProductI18nFields = { name?: string; shortDescription?: string; description?: string };
type ProductI18n = Partial<Record<ProductI18nLang, ProductI18nFields>>;

function normalizeProductI18n(value: unknown): ProductI18n {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: ProductI18n = {};
  for (const lang of ["en", "fr", "ar"] as const) {
    const entry = (value as any)[lang];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    result[lang] = {
      name: typeof entry.name === "string" ? entry.name : undefined,
      shortDescription: typeof entry.shortDescription === "string" ? entry.shortDescription : undefined,
      description: typeof entry.description === "string" ? entry.description : undefined,
    };
  }
  return result;
}

function cleanProductI18n(i18n: ProductI18n): ProductI18n {
  const result: ProductI18n = {};
  for (const lang of ["en", "fr", "ar"] as const) {
    const entry = i18n[lang];
    if (!entry) continue;
    const cleaned: ProductI18nFields = {};
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const shortDescription = typeof entry.shortDescription === "string" ? entry.shortDescription.trim() : "";
    const description = typeof entry.description === "string" ? entry.description.trim() : "";
    if (name) cleaned.name = name;
    if (shortDescription) cleaned.shortDescription = shortDescription;
    if (description) cleaned.description = description;
    if (Object.keys(cleaned).length) result[lang] = cleaned;
  }
  return result;
}

interface Product {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  tags?: unknown;
  price: string;
  stockQuantity: number | null;
  status: string;
  categoryId: number | null;
  isHandmade: boolean | null;
  productionTime: string | null;
  viewCount: number | null;
  totalSold: number | null;
  attributes?: unknown;
  createdAt: string;
}

interface Order {
  id: number;
  orderNumber: string;
  status: string;
  subtotal: string;
  total: string;
  buyerName: string | null;
  buyerPhone: string | null;
  deliveryAddress: string | null;
  createdAt: string;
  confirmedAt: string | null;
  deliveredAt: string | null;
}

interface WalletTransaction {
  id: number;
  type: string;
  amount: string;
  description: string | null;
  reference: string | null;
  createdAt: string;
}

interface SellerStats {
  seller: any;
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  totalProducts: number;
  activeProducts: number;
  walletBalance: string;
  totalSales: string;
  rating: string;
  reviewCount: number;
}

interface Category {
  id: number;
  name: string;
  slug: string;
}

interface Seller {
  id: number;
  userId: number;
  shopName: string;
  slug: string;
  status: string;
  walletBalance: string;
  totalSales: string;
  rating: string;
  reviewCount: number;
}

export default function SellerDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [activeTab, setActiveTab] = useState("overview");
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productI18nLang, setProductI18nLang] = useState<ProductI18nLang>("fr");
  const [productI18n, setProductI18n] = useState<ProductI18n>({});
  const [imagesDialogOpen, setImagesDialogOpen] = useState(false);
  const [imagesProduct, setImagesProduct] = useState<{ id: number; name: string } | null>(null);
  const [suggestingField, setSuggestingField] = useState<"name" | "shortDescription" | "description" | null>(null);

  const getProductVideoUrl = (product: Product | null) => {
    if (!product) return null;
    const attrs = product.attributes as any;
    if (typeof attrs?.videoUrl === "string") return attrs.videoUrl as string;
    if (Array.isArray(attrs?.videos) && typeof attrs.videos[0] === "string") return attrs.videos[0] as string;
    return null;
  };
  
  const { data: seller, isLoading: sellerLoading, refetch: refetchSeller } = useQuery<Seller | null>({
    queryKey: ['/api/marketplace/sellers/by-user', user?.id],
    queryFn: async () => {
      try {
        return await apiRequest(`/api/marketplace/sellers/by-user/${user?.id}`);
      } catch (err: any) {
        const msg = String(err?.message || "");
        if (msg.includes("Seller not found")) return null;
        throw err;
      }
    },
    enabled: !!user?.id,
  });

  const sellerId = seller?.id;

  const { data: stats, isLoading: statsLoading } = useQuery<SellerStats>({
    queryKey: ['/api/marketplace/sellers', sellerId, 'stats'],
    queryFn: async () => {
      return apiRequest(`/api/marketplace/sellers/${sellerId}/stats`);
    },
    enabled: !!sellerId,
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ['/api/marketplace/sellers', sellerId, 'products'],
    queryFn: async () => {
      return apiRequest(`/api/marketplace/sellers/${sellerId}/products`);
    },
    enabled: !!sellerId,
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ['/api/marketplace/sellers', sellerId, 'orders'],
    queryFn: async () => {
      return apiRequest(`/api/marketplace/sellers/${sellerId}/orders`);
    },
    enabled: !!sellerId,
  });

  const { data: transactions = [] } = useQuery<WalletTransaction[]>({
    queryKey: ['/api/marketplace/sellers', sellerId, 'transactions'],
    queryFn: async () => {
      return apiRequest(`/api/marketplace/sellers/${sellerId}/transactions`);
    },
    enabled: !!sellerId,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/marketplace/product-categories"],
    queryFn: async () => {
      return apiRequest("/api/marketplace/product-categories");
    },
  });

  const createDemoSellerMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/marketplace/demo/create-seller', {
        method: 'POST',
        body: JSON.stringify({ userId: user?.id }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sellers/by-user', user?.id] });
      toast({ title: "Demo seller account created!" });
      refetchSeller();
    },
    onError: () => {
      toast({ title: "Failed to create demo seller", variant: "destructive" });
    },
  });

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      description: "",
      shortDescription: "",
      price: 0,
      stockQuantity: 0,
      isHandmade: true,
      productionTime: "",
      videoUrl: "",
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const cleanedI18n = cleanProductI18n(productI18n);
      const attributes = Object.keys(cleanedI18n).length ? ({ i18n: cleanedI18n } as any) : undefined;
      const payload = { ...data, ...(attributes ? { attributes } : {}) };
      return apiRequest(`/api/marketplace/sellers/${sellerId}/products`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sellers', sellerId, 'products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sellers', sellerId, 'stats'] });
      toast({ title: "Product created successfully" });
      setProductDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to create product", variant: "destructive" });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async (params: { productId: number; data: ProductFormData }) => {
      const cleanedI18n = cleanProductI18n(productI18n);
      const baseAttributes =
        selectedProduct?.attributes && typeof selectedProduct.attributes === "object" && !Array.isArray(selectedProduct.attributes)
          ? (selectedProduct.attributes as any)
          : {};
      const nextAttributes = { ...baseAttributes };
      if (Object.keys(cleanedI18n).length) nextAttributes.i18n = cleanedI18n;
      else delete nextAttributes.i18n;

      return apiRequest(`/api/marketplace/shop-products/${params.productId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...params.data,
          price: params.data.price.toString(),
          attributes: nextAttributes,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sellers', sellerId, 'products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sellers', sellerId, 'stats'] });
      toast({ title: "Product updated successfully" });
      setProductDialogOpen(false);
      setSelectedProduct(null);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to update product", variant: "destructive" });
    },
  });

  const updateOrderMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: number; status: string }) => {
      return apiRequest(`/api/marketplace/orders/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sellers', sellerId, 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sellers', sellerId, 'stats'] });
      toast({ title: "Order updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update order", variant: "destructive" });
    },
  });

  const onSubmitProduct = (data: ProductFormData) => {
    if (selectedProduct) {
      updateProductMutation.mutate({ productId: selectedProduct.id, data });
      return;
    }
    createProductMutation.mutate(data);
  };

  const openCreateProductDialog = () => {
    setSelectedProduct(null);
    setProductI18n({});
    setProductI18nLang("fr");
    form.reset({
      name: "",
      description: "",
      shortDescription: "",
      price: 0,
      stockQuantity: 0,
      categoryId: undefined,
      isHandmade: true,
      productionTime: "",
      videoUrl: "",
    });
    setProductDialogOpen(true);
  };

  const openEditProductDialog = (product: Product) => {
    setSelectedProduct(product);
    const attrs = product.attributes as any;
    setProductI18n(normalizeProductI18n(attrs?.i18n));
    setProductI18nLang("fr");
    form.reset({
      name: product.name ?? "",
      description: product.description ?? "",
      shortDescription: product.shortDescription ?? "",
      price: Number.parseFloat(product.price ?? "0") || 0,
      stockQuantity: product.stockQuantity ?? 0,
      categoryId: product.categoryId ?? undefined,
      isHandmade: product.isHandmade ?? true,
      productionTime: product.productionTime ?? "",
      videoUrl: getProductVideoUrl(product) ?? "",
    });
    setProductDialogOpen(true);
  };

  const openImagesDialog = (product: Product) => {
    setImagesProduct({ id: product.id, name: product.name });
    setImagesDialogOpen(true);
  };

  const suggestProductField = async (field: "name" | "shortDescription" | "description") => {
    if (!selectedProduct) {
      toast({ title: "Save this product first, then use AI improvements." });
      return;
    }

    setSuggestingField(field);
    try {
      const draft = {
        name: form.getValues("name"),
        shortDescription: form.getValues("shortDescription"),
        description: form.getValues("description"),
        categoryId: form.getValues("categoryId") ?? selectedProduct.categoryId ?? undefined,
        tags: selectedProduct.tags ?? [],
      };

      const res = (await apiRequest(`/api/marketplace/shop-products/${selectedProduct.id}/suggest`, {
        method: "POST",
        body: JSON.stringify({
          field,
          draft,
          language: productI18nLang,
        }),
      })) as { value?: string; ok?: boolean; reason?: string };

      const value = String(res?.value || "").trim();
      if (!value) {
        throw new Error("AI did not return a suggestion");
      }

      if (field === "name") {
        form.setValue("name", value, { shouldDirty: true, shouldTouch: true });
      } else if (field === "shortDescription") {
        form.setValue("shortDescription", value, { shouldDirty: true, shouldTouch: true });
      } else if (field === "description") {
        form.setValue("description", value, { shouldDirty: true, shouldTouch: true });
      }

      toast({ title: "AI suggestion applied" });
    } catch (err: any) {
      toast({ title: err?.message || "Failed to suggest content", variant: "destructive" });
    } finally {
      setSuggestingField(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700';
      case 'draft': return 'bg-gray-100 text-gray-700';
      case 'out_of_stock': return 'bg-red-100 text-red-700';
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      case 'confirmed': return 'bg-blue-100 text-blue-700';
      case 'delivered': return 'bg-green-100 text-green-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('fr-CI', { 
      style: 'currency', 
      currency: 'XOF',
      minimumFractionDigits: 0 
    }).format(num);
  };

  if (sellerLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading seller profile...</span>
        </div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Store className="h-12 w-12 md:h-16 md:w-16 mx-auto text-muted-foreground mb-4" />
            <CardTitle className="text-xl md:text-2xl">No Seller Account</CardTitle>
            <CardDescription className="text-sm">
              You don't have a seller account yet. Create a demo seller to explore the dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <Button 
              onClick={() => createDemoSellerMutation.mutate()}
              disabled={createDemoSellerMutation.isPending}
              size="lg"
              className="h-12 w-full sm:w-auto"
            >
              {createDemoSellerMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Demo Seller
                </>
              )}
            </Button>
            <Link href="/">
              <Button variant="ghost" className="h-11">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (statsLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-32 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* Header - stacks on mobile */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 md:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" className="h-10 self-start">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-xl md:text-3xl font-bold">Seller Dashboard</h1>
              <p className="text-muted-foreground text-sm">
                {stats?.seller?.shopName || 'Your Shop'}
              </p>
            </div>
          </div>
          <Badge className={`${getStatusColor(stats?.seller?.status || 'pending')} self-start sm:self-auto`}>
            {stats?.seller?.status || 'Pending'}
          </Badge>
        </div>

        {/* Stats - horizontal scroll on mobile */}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-4 mb-4 md:mb-6">
          <Card className="min-w-[140px] flex-shrink-0 md:min-w-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-4">
              <CardTitle className="text-xs md:text-sm font-medium">Wallet</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 md:p-4 pt-0">
              <div className="text-lg md:text-2xl font-bold">{formatCurrency(stats?.walletBalance || '0')}</div>
              <p className="text-[10px] md:text-xs text-muted-foreground">Available</p>
            </CardContent>
          </Card>

          <Card className="min-w-[140px] flex-shrink-0 md:min-w-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-4">
              <CardTitle className="text-xs md:text-sm font-medium">Sales</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 md:p-4 pt-0">
              <div className="text-lg md:text-2xl font-bold">{formatCurrency(stats?.totalSales || '0')}</div>
              <p className="text-[10px] md:text-xs text-muted-foreground">{stats?.completedOrders || 0} orders</p>
            </CardContent>
          </Card>

          <Card className="min-w-[140px] flex-shrink-0 md:min-w-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-4">
              <CardTitle className="text-xs md:text-sm font-medium">Products</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 md:p-4 pt-0">
              <div className="text-lg md:text-2xl font-bold">{stats?.totalProducts || 0}</div>
              <p className="text-[10px] md:text-xs text-muted-foreground">{stats?.activeProducts || 0} active</p>
            </CardContent>
          </Card>

          <Card className="min-w-[140px] flex-shrink-0 md:min-w-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-4">
              <CardTitle className="text-xs md:text-sm font-medium">Rating</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 md:p-4 pt-0">
              <div className="text-lg md:text-2xl font-bold flex items-center gap-1">
                {parseFloat(stats?.rating || '5.0').toFixed(1)}
                <Star className="h-3 w-3 md:h-4 md:w-4 text-yellow-500 fill-yellow-500" />
              </div>
              <p className="text-[10px] md:text-xs text-muted-foreground">{stats?.reviewCount || 0} reviews</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start overflow-x-auto scrollbar-hide gap-1.5 mb-4 md:mb-6 -mx-4 px-4 md:mx-0 md:px-0">
            <TabsTrigger value="overview" className="text-xs sm:text-sm h-10 flex-shrink-0 px-4 md:flex-1 md:px-3">Overview</TabsTrigger>
            <TabsTrigger value="products" className="text-xs sm:text-sm h-10 flex-shrink-0 px-4 md:flex-1 md:px-3">Products</TabsTrigger>
            <TabsTrigger value="orders" className="text-xs sm:text-sm h-10 flex-shrink-0 px-4 md:flex-1 md:px-3">Orders</TabsTrigger>
            <TabsTrigger value="wallet" className="text-xs sm:text-sm h-10 flex-shrink-0 px-4 md:flex-1 md:px-3">Wallet</TabsTrigger>
            <TabsTrigger value="gold" className="text-xs sm:text-sm h-10 flex-shrink-0 px-4 md:flex-1 md:px-3 text-amber-600">
              <Coins className="h-3 w-3 mr-1 hidden sm:inline" />
              Gold
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Orders</CardTitle>
                  <CardDescription>Latest orders from customers</CardDescription>
                </CardHeader>
                <CardContent>
                  {orders.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No orders yet</p>
                  ) : (
                    <div className="space-y-4">
                      {orders.slice(0, 5).map(order => (
                        <div key={order.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">{order.orderNumber}</p>
                            <p className="text-sm text-muted-foreground">{order.buyerName || 'Customer'}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{formatCurrency(order.total)}</p>
                            <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Products</CardTitle>
                  <CardDescription>Best performing products</CardDescription>
                </CardHeader>
                <CardContent>
                  {products.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground mb-4">No products yet</p>
                      <Button onClick={() => setProductDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Your First Product
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {products.slice(0, 5).map(product => (
                        <div key={product.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-sm text-muted-foreground">{formatCurrency(product.price)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm">{product.totalSold || 0} sold</p>
                            <Badge className={getStatusColor(product.status)}>{product.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="products">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Products</CardTitle>
                  <CardDescription>Manage your product catalog</CardDescription>
                </div>
                  <Dialog
                  open={productDialogOpen}
                  onOpenChange={(open) => {
                    setProductDialogOpen(open);
                    if (!open) {
                      setSelectedProduct(null);
                      setProductI18n({});
                      setProductI18nLang("fr");
                      form.reset();
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button onClick={openCreateProductDialog}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Product
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>{selectedProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
                      <DialogDescription>
                        {selectedProduct ? "Update product details and media" : "Add a new product to your catalog"}
                      </DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(onSubmitProduct)} className="space-y-4">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center justify-between gap-2">
                                <span>Product Name</span>
                                {selectedProduct ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs"
                                    disabled={suggestingField !== null || updateProductMutation.isPending}
                                    onClick={() => void suggestProductField("name")}
                                  >
                                    {suggestingField === "name" ? (
                                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                    ) : (
                                      <Wand2 className="h-3.5 w-3.5 mr-1" />
                                    )}
                                    AI improve
                                  </Button>
                                ) : null}
                              </FormLabel>
                              <FormControl>
                                <Input placeholder="Enter product name" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="shortDescription"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center justify-between gap-2">
                                <span>Short description</span>
                                {selectedProduct ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs"
                                    disabled={suggestingField !== null || updateProductMutation.isPending}
                                    onClick={() => void suggestProductField("shortDescription")}
                                  >
                                    {suggestingField === "shortDescription" ? (
                                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                    ) : (
                                      <Wand2 className="h-3.5 w-3.5 mr-1" />
                                    )}
                                    AI improve
                                  </Button>
                                ) : null}
                              </FormLabel>
                              <FormControl>
                                <Textarea placeholder="Short summary (shown on cards)" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center justify-between gap-2">
                                <span>Description</span>
                                {selectedProduct ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs"
                                    disabled={suggestingField !== null || updateProductMutation.isPending}
                                    onClick={() => void suggestProductField("description")}
                                  >
                                    {suggestingField === "description" ? (
                                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                    ) : (
                                      <Wand2 className="h-3.5 w-3.5 mr-1" />
                                    )}
                                    AI improve
                                  </Button>
                                ) : null}
                              </FormLabel>
                              <FormControl>
                                <Textarea placeholder="Describe your product" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="rounded-lg border p-3 space-y-3">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold">Translations</div>
                              <div className="text-xs text-muted-foreground">
                                Optional localized text shown to buyers when they switch language.
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {(["en", "fr", "ar"] as const).map((lang) => (
                                <Button
                                  key={`prod-i18n-${lang}`}
                                  type="button"
                                  size="sm"
                                  variant={productI18nLang === lang ? "default" : "outline"}
                                  onClick={() => setProductI18nLang(lang)}
                                >
                                  {lang.toUpperCase()}
                                </Button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="space-y-1">
                              <Label>Name ({productI18nLang.toUpperCase()})</Label>
                              <Input
                                value={productI18n[productI18nLang]?.name ?? ""}
                                onChange={(e) =>
                                  setProductI18n((prev) => ({
                                    ...prev,
                                    [productI18nLang]: { ...(prev[productI18nLang] || {}), name: e.target.value },
                                  }))
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Short description ({productI18nLang.toUpperCase()})</Label>
                              <Textarea
                                value={productI18n[productI18nLang]?.shortDescription ?? ""}
                                onChange={(e) =>
                                  setProductI18n((prev) => ({
                                    ...prev,
                                    [productI18nLang]: {
                                      ...(prev[productI18nLang] || {}),
                                      shortDescription: e.target.value,
                                    },
                                  }))
                                }
                                rows={2}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Description ({productI18nLang.toUpperCase()})</Label>
                              <Textarea
                                value={productI18n[productI18nLang]?.description ?? ""}
                                onChange={(e) =>
                                  setProductI18n((prev) => ({
                                    ...prev,
                                    [productI18nLang]: { ...(prev[productI18nLang] || {}), description: e.target.value },
                                  }))
                                }
                                rows={4}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="price"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Price (XOF)</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    placeholder="0" 
                                    {...field}
                                    onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="stockQuantity"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Stock Quantity</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    placeholder="0" 
                                    {...field}
                                    onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormField
                          control={form.control}
                          name="categoryId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Category</FormLabel>
                              <Select 
                                onValueChange={(value) => field.onChange(parseInt(value))}
                                value={field.value?.toString()}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a category" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {categories.map(cat => (
                                    <SelectItem key={cat.id} value={cat.id.toString()}>
                                      {cat.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="productionTime"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Production Time</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g., 2-3 days" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="videoUrl"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Video URL (MP4)</FormLabel>
                              <FormControl>
                                <Input placeholder="https://..." {...field} value={field.value ?? ""} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <DialogFooter>
                          <Button
                            type="submit"
                            disabled={createProductMutation.isPending || updateProductMutation.isPending}
                          >
                            {selectedProduct
                              ? updateProductMutation.isPending
                                ? "Saving..."
                                : "Save Changes"
                              : createProductMutation.isPending
                                ? "Creating..."
                                : "Create Product"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {productsLoading ? (
                  <div className="animate-pulse space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-16 bg-muted rounded"></div>
                    ))}
                  </div>
                ) : products.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No products yet</h3>
                    <p className="text-muted-foreground mb-4">Start adding products to your catalog</p>
                    <Button onClick={openCreateProductDialog}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Your First Product
                    </Button>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="hidden md:grid grid-cols-6 gap-4 p-4 border-b bg-muted/50 font-medium text-sm">
                      <div className="col-span-2">Product</div>
                      <div>Price</div>
                      <div>Stock</div>
                      <div>Status</div>
                      <div>Actions</div>
                    </div>

                    {/* Desktop table */}
                    <div className="hidden md:block">
                      {products.map(product => (
                        <div key={product.id} className="grid grid-cols-6 gap-4 p-4 border-b last:border-0 items-center">
                          <div className="col-span-2">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{product.name}</p>
                              {getProductVideoUrl(product) && (
                                <Badge className="bg-indigo-100 text-indigo-700">Video</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-1">
                              {product.shortDescription || product.description || 'No description'}
                            </p>
                          </div>
                          <div className="font-medium">{formatCurrency(product.price)}</div>
                          <div>
                            <span className={product.stockQuantity && product.stockQuantity > 0 ? '' : 'text-red-600'}>
                              {product.stockQuantity || 0}
                            </span>
                          </div>
                          <div>
                            <Badge className={getStatusColor(product.status)}>{product.status}</Badge>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="icon" className="h-9 w-9">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              onClick={() => openImagesDialog(product)}
                              title="Manage images"
                            >
                              <Images className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              onClick={() => openEditProductDialog(product)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Mobile cards */}
                    <div className="md:hidden divide-y">
                      {products.map(product => (
                        <div key={product.id} className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="font-semibold truncate">{product.name}</div>
                                {getProductVideoUrl(product) && (
                                  <Badge className="bg-indigo-100 text-indigo-700 flex-shrink-0">Video</Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground line-clamp-2">
                                {product.shortDescription || product.description || 'No description'}
                              </div>
                            </div>
                            <Badge className={`${getStatusColor(product.status)} flex-shrink-0`}>{product.status}</Badge>
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="rounded-lg border bg-muted/30 p-3">
                              <div className="text-xs text-muted-foreground">Price</div>
                              <div className="font-semibold">{formatCurrency(product.price)}</div>
                            </div>
                            <div className="rounded-lg border bg-muted/30 p-3">
                              <div className="text-xs text-muted-foreground">Stock</div>
                              <div className={`font-semibold ${product.stockQuantity && product.stockQuantity > 0 ? '' : 'text-red-600'}`}>
                                {product.stockQuantity || 0}
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="h-11 flex-1">
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-11 flex-1"
                              onClick={() => openImagesDialog(product)}
                            >
                              <Images className="h-4 w-4 mr-2" />
                              Images
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-11 flex-1"
                              onClick={() => openEditProductDialog(product)}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle>Orders</CardTitle>
                <CardDescription>Manage customer orders</CardDescription>
              </CardHeader>
              <CardContent>
                {ordersLoading ? (
                  <div className="animate-pulse space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-20 bg-muted rounded"></div>
                    ))}
                  </div>
                ) : orders.length === 0 ? (
                  <div className="text-center py-12">
                    <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No orders yet</h3>
                    <p className="text-muted-foreground">Orders will appear here when customers purchase your products</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {orders.map(order => (
                      <div key={order.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-medium">{order.orderNumber}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(order.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Customer</p>
                            <p className="font-medium">{order.buyerName || 'Customer'}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Phone</p>
                            <p className="font-medium">{order.buyerPhone || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Total</p>
                            <p className="font-medium">{formatCurrency(order.total)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Delivery</p>
                            <p className="font-medium line-clamp-1">{order.deliveryAddress || 'N/A'}</p>
                          </div>
                        </div>
                        {order.status === 'pending' && (
                          <div className="flex gap-2 mt-4">
                            <Button 
                              size="sm" 
                              onClick={() => updateOrderMutation.mutate({ orderId: order.id, status: 'confirmed' })}
                              disabled={updateOrderMutation.isPending}
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Confirm Order
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => updateOrderMutation.mutate({ orderId: order.id, status: 'cancelled' })}
                              disabled={updateOrderMutation.isPending}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                        {order.status === 'confirmed' && (
                          <div className="flex gap-2 mt-4">
                            <Button 
                              size="sm"
                              onClick={() => updateOrderMutation.mutate({ orderId: order.id, status: 'ready_for_pickup' })}
                              disabled={updateOrderMutation.isPending}
                            >
                              <Package className="h-4 w-4 mr-2" />
                              Mark Ready for Pickup
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="wallet">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Transaction History</CardTitle>
                  <CardDescription>All wallet transactions</CardDescription>
                </CardHeader>
                <CardContent>
                  {transactions.length === 0 ? (
                    <div className="text-center py-12">
                      <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-2">No transactions yet</h3>
                      <p className="text-muted-foreground">Transactions will appear here when you make sales</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {transactions.map(tx => (
                        <div key={tx.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${tx.type === 'credit' ? 'bg-green-100' : 'bg-red-100'}`}>
                              {tx.type === 'credit' ? (
                                <TrendingUp className="h-4 w-4 text-green-600" />
                              ) : (
                                <Wallet className="h-4 w-4 text-red-600" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium">{tx.description || 'Transaction'}</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(tx.createdAt).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className={`text-lg font-bold ${tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                            {tx.type === 'credit' ? '+' : '-'}{formatCurrency(tx.amount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Wallet Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-primary/10 rounded-lg">
                    <p className="text-sm text-muted-foreground">Available Balance</p>
                    <p className="text-3xl font-bold">{formatCurrency(stats?.walletBalance || '0')}</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Earnings</p>
                    <p className="text-xl font-bold">{formatCurrency(stats?.totalSales || '0')}</p>
                  </div>
                  <Button className="w-full" variant="outline">
                    Request Withdrawal
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="gold">
            <GoldExchangeTab sellerId={sellerId} />
          </TabsContent>
        </Tabs>

        <SellerProductImagesDialog
          open={imagesDialogOpen}
          onOpenChange={(open) => {
            setImagesDialogOpen(open);
            if (!open) setImagesProduct(null);
          }}
          productId={imagesProduct?.id ?? null}
          productName={imagesProduct?.name ?? null}
        />
      </div>
    </div>
  );
}

interface LBMAPrice {
  prices: {
    usd: { perOunce: number; perGram: number; perKg: number };
  };
  fxRates: { EUR_USD: number; AED_USD: number; XOF_USD: number };
  fetchedAt: string;
}

interface Bureau {
  id: number;
  name: string;
  authorizationNumber: string;
  city: string;
  isVerified: boolean;
  rating: string;
  totalSalesKg: string;
  completedOrders: number;
}

function GoldExchangeTab({ sellerId }: { sellerId: number | undefined }) {
  const { toast } = useToast();
  const [roiQuantity, setRoiQuantity] = useState(10);

  const { data: lbmaPrice, isLoading: priceLoading, refetch: refetchPrice } = useQuery<LBMAPrice>({
    queryKey: ["/api/gold-exchange/lbma-price"]
  });

  const { data: bureaus = [], isLoading: bureausLoading } = useQuery<Bureau[]>({
    queryKey: ["/api/gold-exchange/bureaus"]
  });

  const roiMutation = useMutation({
    mutationFn: async (data: { quantityKg: number }) => {
      const res = await fetch(resolveApiUrl("/api/gold-exchange/roi-calculator"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      return res.json();
    }
  });

  const calculateROI = () => {
    roiMutation.mutate({ quantityKg: roiQuantity });
  };

  const formatUSD = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-amber-700">
              <Coins className="h-5 w-5" />
              Live LBMA Gold Price
            </CardTitle>
          </CardHeader>
          <CardContent>
            {priceLoading ? (
              <div className="animate-pulse h-16 bg-amber-100 rounded" />
            ) : lbmaPrice ? (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-amber-600">Per Ounce</span>
                  <span className="text-xl font-bold text-amber-800">
                    {formatUSD(lbmaPrice.prices.usd.perOunce)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-amber-600">Per Gram</span>
                  <span className="font-medium text-amber-700">
                    {formatUSD(lbmaPrice.prices.usd.perGram)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-amber-600">Per Kg</span>
                  <span className="font-medium text-amber-700">
                    {formatUSD(lbmaPrice.prices.usd.perKg)}
                  </span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full mt-2 border-amber-300"
                  onClick={() => refetchPrice()}
                >
                  <RefreshCw className="h-3 w-3 mr-2" />
                  Refresh Price
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-blue-700">
              <Calculator className="h-5 w-5" />
              ROI Calculator
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">Quantity (kg)</label>
                <Input
                  type="number"
                  value={roiQuantity}
                  onChange={(e) => setRoiQuantity(parseFloat(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={calculateROI}
                disabled={roiMutation.isPending}
              >
                {roiMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Calculator className="h-4 w-4 mr-2" />
                )}
                Calculate ROI
              </Button>
              {roiMutation.data && (
                <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm text-green-700">Net Margin</p>
                  <p className="text-xl font-bold text-green-800">
                    {formatUSD(roiMutation.data.margins.netMargin)}
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    ROI: {roiMutation.data.margins.roiPercent.toFixed(2)}% | 
                    Annualized: {roiMutation.data.margins.annualizedRoiPercent.toFixed(1)}%
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-green-700">
              <Shield className="h-5 w-5" />
              Exchange Features
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {[
                { icon: CheckCircle, text: "Licensed Bureau d'Achat" },
                { icon: Shield, text: "Escrow-Secured Payments" },
                { icon: Scale, text: "Verified Weight & Purity" },
                { icon: MapPin, text: "Origin Traceability" }
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-green-700">
                  <item.icon className="h-4 w-4" />
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Bureau d'Achat Network
          </CardTitle>
          <CardDescription>
            {bureaus.length} licensed gold buying offices in Ivory Coast
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bureausLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse h-32 bg-muted rounded-lg" />
              ))}
            </div>
          ) : bureaus.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Store className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No Bureau d'Achat data loaded yet</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={async () => {
                  await fetch(resolveApiUrl("/api/gold-exchange/seed-bureaus"), { method: "POST" });
                  window.location.reload();
                }}
              >
                Load Bureau Data
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bureaus.slice(0, 9).map(bureau => (
                <div key={bureau.id} className="p-4 border rounded-lg hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-sm line-clamp-1">{bureau.name}</h4>
                    {bureau.isVerified && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 text-xs">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Verified
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                    <MapPin className="h-3 w-3" />
                    {bureau.city}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                      {parseFloat(bureau.rating).toFixed(1)}
                    </span>
                    <span>{parseFloat(bureau.totalSalesKg).toFixed(0)}kg sold</span>
                    <span>{bureau.completedOrders} orders</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {bureaus.length > 9 && (
            <p className="text-center text-sm text-muted-foreground mt-4">
              + {bureaus.length - 9} more Bureau d'Achat offices
            </p>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
