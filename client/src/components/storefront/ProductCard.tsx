import { Link } from "wouter";
import type { StoreProduct } from "@/types/storefront";
import type { TenantKey } from "@/types/tenant";
import { useTenant } from "@/lib/tenant";
import { getTenantPlaceholderProductImage } from "@/lib/storefrontIdentity";

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

function resolveProductImage(product: StoreProduct, tenantKey: TenantKey) {
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
  return fromMetadata || getTenantPlaceholderProductImage(tenantKey);
}

function resolveSellerLabel(product: StoreProduct) {
  const metadata = product.metadata && typeof product.metadata === "object" ? product.metadata : {};
  const candidates = [
    (metadata as any)?.sellerName,
    (metadata as any)?.seller_name,
    (metadata as any)?.shopName,
    (metadata as any)?.shop_name,
  ];
  const label = candidates.find((entry) => typeof entry === "string" && entry.trim().length > 0);
  if (label) return String(label);
  if (product.creatorId) return `Seller #${product.creatorId}`;
  return "Verified seller";
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
  const cover = resolveProductImage(product, tenant.key);
  const sellerLabel = resolveSellerLabel(product);

  return (
    <article className="rounded-xl border border-white/10 bg-[#0f172a] p-4 shadow-sm">
      <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-[#111827]">
        <img src={cover} alt={product.title} className="h-full w-full object-cover" loading="lazy" />
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">{product.title}</h3>
          <p className="line-clamp-2 text-xs text-white/60">{product.subtitle || product.description}</p>
          <p className="mt-1 text-[11px] text-white/40">{sellerLabel}</p>
        </div>
        <span className="text-xs font-semibold text-amber-300">{formatMoney(product.price, product.currency)}</span>
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
            className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/20"
            onClick={() => quickAdd(product)}
          >
            Quick add
          </button>
          <Link href={`/product/${encodeURIComponent(product.slug || String(product.id))}`}>
            <span className="text-xs text-amber-300 hover:text-amber-200">View</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
