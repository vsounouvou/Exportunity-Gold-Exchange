export type AdminMarketplaceProductSurface = "edit" | "history" | "images";

type ExtraParamValue = string | number | boolean | null | undefined;

function normalizeProductId(productId: number | string) {
  const normalized = Number(productId);
  return Number.isFinite(normalized) && normalized > 0 ? Math.trunc(normalized) : null;
}

export function buildAdminMarketplaceProductPath(
  productId: number | string,
  surface: AdminMarketplaceProductSurface,
  options?: {
    tenantKey?: string | null;
    extraParams?: Record<string, ExtraParamValue>;
  },
) {
  const normalizedProductId = normalizeProductId(productId);
  if (normalizedProductId == null) return null;

  const url = new URL("/admin/marketplace/products", "http://localhost");
  if (options?.tenantKey) url.searchParams.set("tenantKey", String(options.tenantKey).trim());
  url.searchParams.set(surface, String(normalizedProductId));

  for (const [key, value] of Object.entries(options?.extraParams || {})) {
    if (value == null || value === false || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  return `${url.pathname}${url.search}`;
}

export function openAdminMarketplaceProductWindow(
  productId: number | string,
  surface: AdminMarketplaceProductSurface,
  options?: {
    tenantKey?: string | null;
    extraParams?: Record<string, ExtraParamValue>;
    target?: "_blank" | "_self";
  },
) {
  if (typeof window === "undefined") return false;
  const path = buildAdminMarketplaceProductPath(productId, surface, options);
  if (!path) return false;
  window.open(path, options?.target || "_blank", "noreferrer");
  return true;
}
