import type { TenantKey } from "@/types/tenant";
import type { TenantCategoryVisual, TenantStorefrontIdentity } from "../../../tenants/types";
import { getTenantConfigByKey } from "../../../tenants/index";

const RETAIL_LABEL_BY_TENANT: Record<TenantKey, string> = {
  bdo: "Or Estampillé",
  exportunity: "Marketplace",
  agoojye: "Mobilité électrique",
  zone: "Marketplace",
  mindbase: "Marketplace",
  met: "Materiaux",
  vs: "Studio",
  hoz: "Collections",
  zogueland: "Marketplace",
  madd: "Learning Shop",
  rayon1km: "Nearby",
  xportcard: "Territory Access",
};

const PLATFORM_LABEL_BY_TENANT: Record<TenantKey, string> = {
  bdo: "Bourse de l'Or - Or Estampillé",
  exportunity: "Global Export Marketplace",
  agoojye: "AGOOJYE Electric Mobility",
  zone: "Global Export Marketplace",
  mindbase: "MindBase Intelligence Marketplace",
  met: "Materiaux de construction",
  vs: "Vital Sounouvou Studio",
  hoz: "Collections",
  zogueland: "Zogueland Marketplace",
  madd: "MADD Academy",
  rayon1km: "Rayon 1km",
  xportcard: "XportCARD Territory Network",
};

const FALLBACK_CATEGORY_VISUALS: Record<TenantKey, TenantCategoryVisual[]> = {
  bdo: [
    { slug: "dore", label: "Dore", icon: "gem", image: "/tenants/bdo/official/products/piece-20g-22k-box.jpg", accent: "#D4AF37" },
    { slug: "stamped", label: "Or Estampille", icon: "shield", image: "/tenants/bdo/official/products/ingot-50g-22k-box.jpg", accent: "#E8C873" },
  ],
  exportunity: [{ slug: "default", label: "Marketplace", icon: "package", image: "/tenants/exportunity/placeholder-product.svg", accent: "#0EA5E9" }],
  agoojye: [{ slug: "default", label: "Bus électriques", icon: "zap", image: "/tenants/agoojye/bus-placeholder.svg", accent: "#C99A36" }],
  zone: [{ slug: "default", label: "Marketplace", icon: "package", image: "/tenants/zone/placeholder-product.svg", accent: "#0EA5E9" }],
  mindbase: [{ slug: "default", label: "MindBase", icon: "brain", image: "/tenants/mindbase/placeholder-product.svg", accent: "#6B4EFF" }],
  met: [{ slug: "default", label: "Materials", icon: "bricks", image: "/tenants/met/placeholder-product.svg", accent: "#C19A6B" }],
  vs: [{ slug: "default", label: "Studio", icon: "book", image: "/tenants/vs/placeholder-product.svg", accent: "#8B0000" }],
  hoz: [{ slug: "default", label: "Marketplace", icon: "diamond", image: "/tenants/hoz/placeholder-product.svg", accent: "#9A7D4F" }],
  zogueland: [{ slug: "default", label: "Stories", icon: "book-open", image: "/tenants/zogueland/placeholder-product.svg", accent: "#FF6B6B" }],
  madd: [{ slug: "default", label: "Learning Shop", icon: "sparkles", image: "/tenants/exportunity/placeholder-product.svg", accent: "#f97316" }],
  rayon1km: [{ slug: "default", label: "Nearby", icon: "map-pin", image: "/tenants/rayon1km/placeholder-product.svg", accent: "#F59E0B" }],
  xportcard: [{ slug: "default", label: "Territory Access", icon: "map", image: "/tenants/exportunity/placeholder-product.svg", accent: "#0EA5E9" }],
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
  const normalizeSlug = (value: string) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[_/\s]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

  const key = String(slug || "").trim().toLowerCase();
  if (!key) return null;

  const identity = getTenantIdentity(tenantKey);
  const normalizedKey = normalizeSlug(key);
  const direct = identity.categoryVisuals.find((entry) => normalizeSlug(String(entry.slug || "")) === normalizedKey);
  if (direct) return direct;

  const soft = identity.categoryVisuals.find((entry) => {
    const entrySlug = normalizeSlug(String(entry.slug || ""));
    return (
      entrySlug === normalizedKey ||
      normalizedKey.startsWith(`${entrySlug}-`) ||
      entrySlug.startsWith(`${normalizedKey}-`) ||
      normalizedKey.includes(entrySlug)
    );
  });
  if (soft) return soft;

  return identity.categoryVisuals.find((entry) => normalizeSlug(String(entry.slug || "")) === "default") || null;
}

function withBuildVersion(path: string) {
  const raw = String(path || "").trim();
  if (!raw || raw.toLowerCase().startsWith("data:image/")) return raw;
  if (typeof window === "undefined") return raw;
  const cfg = (window as any)?.__EXPORTUNITY_CONFIG__ || {};
  const buildId = String(cfg?.buildId || "").trim();
  if (!buildId) return raw;
  return `${raw}${raw.includes("?") ? "&" : "?"}v=${encodeURIComponent(buildId)}`;
}

export function getTenantPlaceholderProductImage(tenantKey: TenantKey) {
  const config = getTenantConfigByKey(tenantKey);
  if (config?.assets?.placeholderProduct) return withBuildVersion(config.assets.placeholderProduct);
  return withBuildVersion(`/tenants/${tenantKey}/placeholder-product.svg`);
}

export function getTenantLogoPath(tenantKey: TenantKey) {
  const config = getTenantConfigByKey(tenantKey);
  return config?.assets?.logoPath || `/tenants/${tenantKey}/logo.svg`;
}

export function getTenantFaviconPath(tenantKey: TenantKey) {
  const config = getTenantConfigByKey(tenantKey);
  return config?.assets?.faviconPath || `/tenants/${tenantKey}/favicon.svg`;
}


