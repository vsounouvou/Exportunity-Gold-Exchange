import { Link } from "wouter";
import type { StoreProduct } from "@/types/storefront";
import type { TenantKey } from "@/types/tenant";
import { useTenant } from "@/lib/tenant";
import { getTenantPlaceholderProductImage } from "@/lib/storefrontIdentity";
import { useLocale, type Currency } from "@/contexts/LocaleContext";
import { getBdoProductFallbackImage } from "@/lib/bdoProductVisuals";

const copy = {
  fr: {
    verifiedSeller: "Vendeur verifie",
    sellerPrefix: "Vendeur",
    quickAdd: "Ajouter",
    view: "Voir",
  },
  en: {
    verifiedSeller: "Verified seller",
    sellerPrefix: "Seller",
    quickAdd: "Add",
    view: "View",
  },
  ar: {
    verifiedSeller: "بائع موثق",
    sellerPrefix: "بائع",
    quickAdd: "إضافة",
    view: "عرض",
  },
};

function normalizeCurrencyCode(value: unknown): Currency {
  const upper = String(value || "").trim().toUpperCase();
  if (upper === "USD" || upper === "EUR" || upper === "GBP" || upper === "XOF" || upper === "GHS" || upper === "NGN" || upper === "KES" || upper === "AED") {
    return upper as Currency;
  }
  return "XOF";
}

function resolveProductImage(product: StoreProduct, tenantKey: TenantKey) {
  const fallback = tenantKey === "bdo" ? getBdoProductFallbackImage(product) : getTenantPlaceholderProductImage(tenantKey);
  const media = Array.isArray(product.media) ? product.media : [];
  const fromMedia = media.find((entry) => typeof entry === "string" && entry.trim().length > 0);
  if (fromMedia) return fromMedia;

  const metadata = product.metadata && typeof product.metadata === "object" ? product.metadata : {};
  const candidates = [
    (metadata as any)?.coverImage,
    (metadata as any)?.cover_image,
    (metadata as any)?.thumbnail,
    (metadata as any)?.image,
    (metadata as any)?.imageUrl,
    (metadata as any)?.image_url,
  ];
  const fromMetadata = candidates.find((entry) => typeof entry === "string" && entry.trim().length > 0);
  return fromMetadata || fallback;
}

function resolveSellerLabel(product: StoreProduct, labels: typeof copy.fr) {
  const metadata = product.metadata && typeof product.metadata === "object" ? product.metadata : {};
  const candidates = [
    (metadata as any)?.sellerName,
    (metadata as any)?.seller_name,
    (metadata as any)?.shopName,
    (metadata as any)?.shop_name,
  ];
  const label = candidates.find((entry) => typeof entry === "string" && entry.trim().length > 0);
  if (label) return String(label);
  if (product.creatorId) return `${labels.sellerPrefix} #${product.creatorId}`;
  return labels.verifiedSeller;
}

function quickAdd(product: StoreProduct) {
  if (typeof window === "undefined") return;
  const key = "storefront_quick_cart_v1";
  const existingRaw = window.localStorage.getItem(key);
  const existing = existingRaw ? JSON.parse(existingRaw) : [];
  const safe = Array.isArray(existing) ? existing : [];
  const current = safe.find((entry: any) => Number(entry?.id) === Number(product.id));
  if (current) {
    current.qty = Math.max(1, Number(current.qty || 1) + 1);
  } else {
    safe.push({
      id: product.id,
      slug: product.slug,
      title: product.title,
      price: product.price,
      currency: product.currency,
      qty: 1,
    });
  }
  window.localStorage.setItem(key, JSON.stringify(safe));
}

export function ProductCard({ product }: { product: StoreProduct }) {
  const { tenant } = useTenant();
  const { language, formatAmount } = useLocale();
  const labels = copy[language] || copy.fr;
  const cover = resolveProductImage(product, tenant.key);
  const fallbackCover = tenant.key === "bdo" ? getBdoProductFallbackImage(product) : getTenantPlaceholderProductImage(tenant.key);
  const sellerLabel = resolveSellerLabel(product, labels);
  const price = formatAmount(Number(product.price || 0), normalizeCurrencyCode(product.currency));
  const isBdo = tenant.key === "bdo";

  return (
    <article className="rounded-xl border border-white/10 bg-[#0f172a] p-4 shadow-sm">
      {isBdo ? <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#E8C873]">BOURSE DE L'OR</p> : null}
      <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-[#111827]">
        <img
          src={cover}
          alt={product.title}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={(event) => {
            const img = event.currentTarget;
            if (img.src.includes(fallbackCover)) return;
            img.src = fallbackCover;
          }}
        />
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">{product.title}</h3>
          <p className="line-clamp-2 text-xs text-white/60">{product.subtitle || product.description}</p>
          <p className="mt-1 text-[11px] text-white/40">{sellerLabel}</p>
        </div>
        <span className="text-xs font-semibold text-amber-300">{price}</span>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {(product.tags || []).slice(0, 2).map((tag) => (
            <span key={tag} className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/70">
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-[#D4AF37]/45 bg-[#D4AF37]/12 px-2 py-1 text-[10px] font-semibold text-[#F1D27A] hover:bg-[#D4AF37]/20"
            onClick={() => quickAdd(product)}
          >
            {labels.quickAdd}
          </button>
          <Link href={`/product/${encodeURIComponent(product.slug || String(product.id))}`}>
            <span className="text-xs text-amber-300 hover:text-amber-200">{labels.view}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
