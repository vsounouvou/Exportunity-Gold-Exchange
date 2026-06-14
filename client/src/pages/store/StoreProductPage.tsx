import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

import { useLocale, type Currency } from "@/contexts/LocaleContext";
import { apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant";
import { getTenantPlaceholderProductImage } from "@/lib/storefrontIdentity";
import { getBdoProductFallbackImage } from "@/lib/bdoProductVisuals";
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
    back: "Retour à la boutique",
    noImage: "Aucune image disponible",
    description: "Description",
    emptyDescription: "Aucune description disponible.",
    brand: "BOURSE DE L'OR",
    proof: "Or physique certifié, prix lié au marché et vérification documentaire.",
    priceNotice:
      "Prix indicatif jusqu'à confirmation finale. Le total payable peut inclure le prix du produit physique, le spread de plateforme, le paiement, la livraison, l'assurance, les taxes, les droits, le stockage ou la vérification selon le produit et le pays.",
    complianceNotice:
      "Commande soumise à disponibilité, paiement confirmé, vérification KYC/KYB si applicable, revue de conformité et validation finale par La Bourse de l'Or ou le partenaire approuvé. Le transfert de propriété intervient uniquement après confirmation finale.",
    order: "Commander",
    quote: "Demander une cotation",
  },
  en: {
    loading: "Loading product...",
    notFound: "Product not found.",
    back: "Back to store",
    noImage: "No image available",
    description: "Description",
    emptyDescription: "No description available.",
    brand: "BOURSE DE L'OR",
    proof: "Certified physical gold, market-linked price and document verification.",
    priceNotice:
      "Indicative price until final confirmation. The total payable may include the physical product price, platform spread, payment processing, delivery, insurance, taxes, duties, storage, or verification fees depending on the product and country.",
    complianceNotice:
      "Order subject to availability, confirmed payment, KYC/KYB verification when applicable, compliance review, and final validation by La Bourse de l'Or or the approved partner. Ownership transfers only after final confirmation.",
    order: "Order now",
    quote: "Request a quote",
  },
  ar: {
    loading: "جاري تحميل المنتج...",
    notFound: "المنتج غير موجود.",
    back: "العودة إلى المتجر",
    noImage: "لا توجد صورة متاحة",
    description: "الوصف",
    emptyDescription: "لا يوجد وصف متاح.",
    brand: "BOURSE DE L'OR",
    proof: "ذهب مادي موثق، سعر مرتبط بالسوق، وتحقق من الوثائق.",
    priceNotice:
      "السعر إرشادي حتى التأكيد النهائي. قد يشمل المبلغ النهائي سعر المنتج المادي وهامش المنصة ومعالجة الدفع والتسليم والتأمين والضرائب والرسوم والتخزين أو التحقق حسب المنتج والبلد.",
    complianceNotice:
      "الطلب خاضع للتوفر وتأكيد الدفع والتحقق KYC/KYB عند الاقتضاء ومراجعة الامتثال والتأكيد النهائي من لا بورص دو لور أو الشريك المعتمد. تنتقل الملكية فقط بعد التأكيد النهائي.",
    order: "اطلب الآن",
    quote: "طلب تسعير",
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
  const bdoLegalLabels: { priceNotice: string; complianceNotice: string } = {
    priceNotice: labels.priceNotice || copy.fr.priceNotice,
    complianceNotice: labels.complianceNotice || copy.fr.complianceNotice,
  };
  const isBdo = tenant.key === "bdo";

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

  const cover = product.media?.[0] || (isBdo ? getBdoProductFallbackImage(product) : "");
  const fallbackCover = isBdo ? getBdoProductFallbackImage(product) : getTenantPlaceholderProductImage(tenant.key);

  return (
    <main className="min-h-screen bg-[#020817] px-4 py-6 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href="/store">
          <span className="text-xs text-white/60 hover:text-white">{labels.back}</span>
        </Link>

        <section className="grid gap-6 rounded-2xl border border-white/10 bg-[#0b1220] p-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="rounded-xl bg-[#111827] p-2">
            {cover ? (
              <img
                src={cover}
                alt={product.title}
                className="h-full w-full rounded-lg object-cover"
                onError={(event) => {
                  const img = event.currentTarget;
                  if (img.src.includes(fallbackCover)) return;
                  img.src = fallbackCover;
                }}
              />
            ) : (
              <div className="flex min-h-[280px] items-center justify-center text-sm text-white/50">{labels.noImage}</div>
            )}
          </div>

          <div className="space-y-4">
            {isBdo ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#E8C873]">{labels.brand}</p>
                <p className="mt-1 text-xs text-white/60">{labels.proof}</p>
              </div>
            ) : null}
            <h1 className="text-2xl font-semibold">{product.title}</h1>
            <p className="text-sm text-white/70">{product.subtitle || product.description}</p>
            <div className="text-lg font-semibold text-amber-300">{productPrice}</div>
            {isBdo ? (
              <div className="space-y-1 rounded-lg border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-white/60">
                <p>{bdoLegalLabels.priceNotice}</p>
                <p>{bdoLegalLabels.complianceNotice}</p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {(product.tags || []).map((tag) => (
                <span key={tag} className="rounded bg-white/10 px-2 py-1 text-xs text-white/70">
                  {tag}
                </span>
              ))}
            </div>
            {isBdo ? (
              <div className="flex flex-wrap gap-2 pt-2">
                <Link href={`/checkout?product=${encodeURIComponent(product.slug || String(product.id))}`}>
                  <span className="inline-flex rounded-lg bg-[#D4AF37] px-4 py-2 text-xs font-semibold text-black hover:bg-[#E8C873]">
                    {labels.order}
                  </span>
                </Link>
                <Link href={`/store?quote=${encodeURIComponent(product.slug || String(product.id))}`}>
                  <span className="inline-flex rounded-lg border border-[#D4AF37]/45 px-4 py-2 text-xs font-semibold text-[#F1D27A] hover:bg-[#D4AF37]/10">
                    {labels.quote}
                  </span>
                </Link>
              </div>
            ) : null}
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
