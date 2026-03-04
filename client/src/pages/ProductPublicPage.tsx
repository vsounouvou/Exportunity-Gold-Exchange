import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { absolutizePublicUrl } from "@/lib/assets";
import { useSession } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Loader2, ArrowLeft, ExternalLink } from "lucide-react";

function normalizeImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
}

export default function ProductPublicPage() {
  const [match, params] = useRoute("/product/:id");
  const [, setLocation] = useLocation();
  const session = useSession();
  const productId = params?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<any | null>(null);
  const [seller, setSeller] = useState<any | null>(null);
  const [category, setCategory] = useState<any | null>(null);

  const idNum = useMemo(() => {
    const n = productId ? parseInt(String(productId), 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [productId]);

  const imageUrls = useMemo(() => {
    const list = normalizeImages(product?.images);
    return list.map((url) => absolutizePublicUrl(url));
  }, [product?.images]);

  useEffect(() => {
    if (!match || !idNum) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const prod = await apiRequest(`/api/marketplace/shop-products/${idNum}`);
        setProduct(prod);

        const [sellerRes, categories] = await Promise.all([
          prod?.sellerId ? apiRequest(`/api/marketplace/sellers/${prod.sellerId}`) : Promise.resolve(null),
          apiRequest("/api/marketplace/product-categories"),
        ]);
        setSeller(sellerRes);
        const foundCategory =
          Array.isArray(categories) && prod?.categoryId
            ? categories.find((c: any) => Number(c?.id) === Number(prod.categoryId)) || null
            : null;
        setCategory(foundCategory);
      } catch (err: any) {
        setError(err?.message || "Failed to load product");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [match, idNum]);

  if (!match) return null;

  const canAdminEdit = session.isAuthenticated && !session.isGuest && session.hasRole("admin");

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => setLocation("/marketplace")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Marketplace
          </Button>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {canAdminEdit && product?.id ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setLocation(`/admin/marketplace/products?edit=${encodeURIComponent(String(product.id))}`)}
                >
                  Admin edit
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setLocation(`/admin/marketplace/products?images=${encodeURIComponent(String(product.id))}`)}
                >
                  Images & prompts
                </Button>
              </>
            ) : null}

            {product?.id ? (
              <a
                className="text-xs text-amber-300 hover:underline inline-flex items-center gap-1"
                href={`/api/marketplace/shop-products/${product.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Raw API <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : error ? (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">{error}</div>
        ) : !product ? (
          <div className="text-sm text-gray-400">Product not found.</div>
        ) : (
          <Card className="bg-slate-900 border-slate-800 overflow-hidden">
            <div className="h-72 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 relative">
              {imageUrls.length ? (
                <Carousel opts={{ loop: imageUrls.length > 1 }} className="h-full">
                  <CarouselContent className="h-full">
                    {imageUrls.map((url, idx) => (
                      <CarouselItem key={`${url}-${idx}`} className="h-full">
                        <img src={url} alt={product.name} className="w-full h-72 object-cover" />
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  {imageUrls.length > 1 ? (
                    <>
                      <CarouselPrevious className="left-3" />
                      <CarouselNext className="right-3" />
                    </>
                  ) : null}
                </Carousel>
              ) : null}
            </div>
            <CardHeader>
              <CardTitle className="text-white text-2xl flex items-center gap-2 flex-wrap">
                <span>{product.name}</span>
                <Badge variant="outline" className="border-slate-700 text-gray-200">
                  {product.status || "unknown"}
                </Badge>
                {category?.name ? (
                  <Badge variant="secondary" className="bg-slate-800 text-gray-200">
                    {category.name}
                  </Badge>
                ) : null}
              </CardTitle>
              <div className="text-sm text-gray-300">{seller?.shopName || "Seller"}</div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-gray-200 whitespace-pre-line">
                {product.description || product.shortDescription || "No description provided."}
              </div>
              <div className="text-sm text-gray-300">
                Price: <span className="text-amber-300 font-semibold">{product.price}</span> {product.currency || ""}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
