import type { TenantKey } from "@/types/tenant";
import type { TenantCategoryVisual, TenantStorefrontIdentity } from "../../../tenants/types";
import { getTenantConfigByKey } from "../../../tenants/index";

const RETAIL_LABEL_BY_TENANT: Record<TenantKey, string> = {
  bdo: "Retail",
  exportunity: "Marketplace",
  zone: "Marketplace",
  mindbase: "Marketplace",
  met: "Materials",
  vs: "Studio",
  hoz: "Marketplace",
  zogueland: "Marketplace",
  rayon1km: "Nearby",
};

const PLATFORM_LABEL_BY_TENANT: Record<TenantKey, string> = {
  bdo: "Bourse de l'Or Retail",
  exportunity: "Exportunity Marketplace",
  zone: "Exportunity Marketplace",
  mindbase: "MindBase Intelligence Marketplace",
  met: "Maison en Terre Materials",
  vs: "Vital Sounouvou Studio",
  hoz: "House of Zogue Marketplace",
  zogueland: "Zogueland Marketplace",
  rayon1km: "Rayon 1km",
};

const FALLBACK_CATEGORY_VISUALS: Record<TenantKey, TenantCategoryVisual[]> = {
  bdo: [
    { slug: "dore", label: "Doré", icon: "🪨", image: "/product-images/dore-nuggets-01.png", accent: "#EA580C" },
    { slug: "stamped", label: "Stamped Gold", icon: "🪙", image: "/product-images/stamped-bar-01.png", accent: "#10B981" },
  ],
  exportunity: [{ slug: "default", label: "Marketplace", icon: "📦", image: "/tenants/exportunity/placeholder-product.svg", accent: "#0EA5E9" }],
  zone: [{ slug: "default", label: "Marketplace", icon: "📦", image: "/tenants/zone/placeholder-product.svg", accent: "#0EA5E9" }],
  mindbase: [{ slug: "default", label: "MindBase", icon: "🧠", image: "/tenants/mindbase/placeholder-product.svg", accent: "#6B4EFF" }],
  met: [{ slug: "default", label: "Materials", icon: "🧱", image: "/tenants/met/placeholder-product.svg", accent: "#C19A6B" }],
  vs: [{ slug: "default", label: "Studio", icon: "📚", image: "/tenants/vs/placeholder-product.svg", accent: "#8B0000" }],
  hoz: [{ slug: "default", label: "Marketplace", icon: "💎", image: "/tenants/hoz/placeholder-product.svg", accent: "#9A7D4F" }],
  zogueland: [{ slug: "default", label: "Stories", icon: "📖", image: "/tenants/zogueland/placeholder-product.svg", accent: "#FF6B6B" }],
  rayon1km: [{ slug: "default", label: "Nearby", icon: "🛍️", image: "/tenants/rayon1km/placeholder-product.svg", accent: "#F59E0B" }],
};

export function getTenantIdentity(tenantKey: TenantKey): TenantStorefrontIdentity {
  const config = getTenantConfigByKey(tenantKey);
  const configIdentity = config?.storefrontIdentity;
  return {
    platformLabel: configIdentity?.platformLabel || PLATFORM_LABEL_BY_TENANT[tenantKey] || config?.brandName || "Marketplace",
    retailModeLabel: configIdentity?.retailModeLabel || RETAIL_LABEL_BY_TENANT[tenantKey] || "Marketplace",
    sections: configIdentity?.sections || [],
    categoryVisuals: configIdentity?.categoryVisuals?.length
      ? configIdentity.categoryVisuals
      : FALLBACK_CATEGORY_VISUALS[tenantKey] || [],
  };
}

export function getRetailLabel(tenantKey: TenantKey) {
  return getTenantIdentity(tenantKey).retailModeLabel;
}

export function getCategoryVisual(tenantKey: TenantKey, slug: string | null | undefined): TenantCategoryVisual | null {
  const key = String(slug || "").trim().toLowerCase();
  if (!key) return null;

  const identity = getTenantIdentity(tenantKey);
  const direct = identity.categoryVisuals.find((entry) => String(entry.slug || "").trim().toLowerCase() === key);
  if (direct) return direct;

  const normalized = key.replace(/\s+/g, "-");
  const soft = identity.categoryVisuals.find((entry) => String(entry.slug || "").trim().toLowerCase() === normalized);
  if (soft) return soft;

  return identity.categoryVisuals.find((entry) => String(entry.slug || "").trim().toLowerCase() === "default") || null;
}

export function getTenantPlaceholderProductImage(tenantKey: TenantKey) {
  const config = getTenantConfigByKey(tenantKey);
  if (config?.assets?.placeholderProduct) return config.assets.placeholderProduct;
  return `/tenants/${tenantKey}/placeholder-product.svg`;
}

export function getTenantLogoPath(tenantKey: TenantKey) {
  const config = getTenantConfigByKey(tenantKey);
  return config?.assets?.logoPath || `/tenants/${tenantKey}/logo.svg`;
}

export function getTenantFaviconPath(tenantKey: TenantKey) {
  const config = getTenantConfigByKey(tenantKey);
  return config?.assets?.faviconPath || `/tenants/${tenantKey}/favicon.svg`;
}
