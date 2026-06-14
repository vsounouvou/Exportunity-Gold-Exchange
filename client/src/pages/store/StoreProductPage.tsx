import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

import { useLocale, type Currency } from "@/contexts/LocaleContext";
import { apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant";
import type { StoreProduct } from "@/types/storefront";

function normalizeCurrencyCode(value: unknown): Currency {
  const upper = String(value || "").trim().toUpperCase();
  if (upper === "USD" || upper === "EUR" || upper === "GBP" || upper === "XOF" || upper === "GHS" || upper === "NGN" || upper === "KES" || upper === "AED") {
    return upper as Currency;
  }
  return "XOF";
}

const copy = {
  fr: {
    loading: "Chargement du produit...",
    notFound: "Produit introuvable.",
    back: "Retour a la boutique",
    noImage: "Aucune image disponible",
    description: "Description",
    emptyDescription: "Aucune description disponible.",
  },
  en: {
    loading: "Loading product...",
    notFound: "Product not found.",
    back: "Back to store",
    noImage: "No image available",
    description: "Description",
    emptyDescription: "No description available.",
  },
  ar: {
    loading: "جاري تحميل المنتج...",
    notFound: "المنتج غير موجود.",
    back: "العودة إلى المتجر",
    noImage: "لا توجد صورة متاحة",
    description: "الوصف",
    emptyDescription: "لا يوجد وصف متاح.",
  },
};

export default function StoreProductPage({ slug }: { slug: string }) {
  const { brand, tenant } = useTenant();
  const { formatAmount, language } = useLocale();
  const query = useQuery({
    queryKey: ["store", "product", slug],
    queryFn: async () => apiRequest(`/api/store/product/${encodeURIComponent(slug)}`, "GET"),
    staleTime: 20_000,
  });

  const product = (query.data?.item || null) as StoreProduct | null;
  const productPrice = useMemo(() => {
    if (!product) return null;
    return formatAmount(Number(product.price || 0), normalizeCurrencyCode(product.currency));
  }, [formatAmount, product]);

  useEffect(() => {
    document.title = tenant.key === "met" ? brand.name : product?.title ? `${product.title} | ${brand.name}` : brand.name;
  }, [brand.name, product?.title, tenant.key]);

  const labels = tenant.key === "met" ? copy.fr : copy[language] || copy.fr;

  if (query.isLoading) {
    return (
      <main className="min-h-screen bg-[#020817] px-4 py-6 text-white sm:px-6 lg:px-10">
        <div className="mx-auto max-w-5xl rounded-xl border border-white/10 bg-[#0b1220] p-6 text-sm text-white/60">
          {labels.loading}
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="min-h-screen bg-[#020817] px-4 py-6 text-white sm:px-6 lg:px-10">
        <div className="mx-auto max-w-5xl rounded-xl border border-white/10 bg-[#0b1220] p-6 text-sm text-white/60">
          {labels.notFound} <Link href="/store"><span className="text-amber-300">{labels.back}</span></Link>
        </div>
      </main>
    );
  }

  const cover = product.media?.[0] || "";

  return (
    <main className="min-h-screen bg-[#020817] px-4 py-6 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href="/store">
          <span className="text-xs text-white/60 hover:text-white">{labels.back}</span>
        </Link>

        <section className="grid gap-6 rounded-2xl border border-white/10 bg-[#0b1220] p-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="rounded-xl bg-[#111827] p-2">
            {cover ? (
              <img src={cover} alt={product.title} className="h-full w-full rounded-lg object-cover" />
            ) : (
              <div className="flex min-h-[280px] items-center justify-center text-sm text-white/50">{labels.noImage}</div>
            )}
          </div>

          <div className="space-y-4">
            <h1 className="text-2xl font-semibold">{product.title}</h1>
            <p className="text-sm text-white/70">{product.subtitle || product.description}</p>
            <div className="text-lg font-semibold text-amber-300">{productPrice}</div>
            <div className="flex flex-wrap gap-2">
              {(product.tags || []).map((tag) => (
                <span key={tag} className="rounded bg-white/10 px-2 py-1 text-xs text-white/70">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0b1220] p-6">
          <h2 className="text-lg font-semibold">{labels.description}</h2>
          <p className="mt-2 text-sm text-white/70 whitespace-pre-wrap">{product.description || labels.emptyDescription}</p>
        </section>
      </div>
    </main>
  );
}
