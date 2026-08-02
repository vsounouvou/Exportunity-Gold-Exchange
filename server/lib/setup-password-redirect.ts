import { resolveTenantConfigWithOverrides, type TenantSlug } from "../../tenants/index";

type TenantKey = TenantSlug;

const REDIRECT_BY_TENANT: Record<TenantKey, string> = {
  bdo: "/dashboard",
  agoojye: "/admin/agoojye",
  exportunity: "/ai-team",
  zone: "/zone",
  mindbase: "/admin/mindbase",
  met: "/admin/met",
  vs: "/admin/vs",
  hoz: "/admin/hoz",
  zogueland: "/admin/zogueland",
  madd: "/admin/madd",
  rayon1km: "/admin/rayon1km",
  xportcard: "/admin/xportcard",
};

function asTenantKey(value: unknown): TenantKey | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "bdo") return "bdo";
  if (normalized === "agoojye" || normalized === "agojye") return "agoojye";
  if (normalized === "exportunity") return "exportunity";
  if (normalized === "zone") return "zone";
  if (normalized === "mindbase") return "mindbase";
  if (normalized === "met" || normalized === "maisonenterre" || normalized === "maisonsenterre") return "met";
  if (normalized === "vs" || normalized === "vss" || normalized === "vital" || normalized === "vitalsounouvou") return "vs";
  if (normalized === "hoz" || normalized === "houseofzogue" || normalized === "zogue") return "hoz";
  if (normalized === "zogueland") return "zogueland";
  if (normalized === "madd" || normalized === "maddacademy") return "madd";
  if (normalized === "rayon1km" || normalized === "rayon") return "rayon1km";
  if (normalized === "xportcard" || normalized === "xcard" || normalized === "xport") return "xportcard";
  return null;
}

function pickPrimaryHost(forwardedHost?: string | null, host?: string | null) {
  return String(forwardedHost || host || "")
    .split(",")[0]
    .trim();
}

export function resolveSetupPasswordTenantKey(input: {
  tenantKey?: unknown;
  host?: string | null;
  forwardedHost?: string | null;
}): TenantKey {
  const fromTenant = asTenantKey(input.tenantKey);
  if (fromTenant) return fromTenant;

  const host = pickPrimaryHost(input.forwardedHost, input.host);
  return resolveTenantConfigWithOverrides({
    host,
    forcedKey: process.env.TENANT_FORCE_KEY,
    envHostMap: process.env.TENANT_HOST_MAP,
    defaultKey: process.env.TENANT_DEFAULT || "exportunity",
  }).slug;
}

export function resolveSetupPasswordRedirect(input: {
  tenantKey?: unknown;
  host?: string | null;
  forwardedHost?: string | null;
}) {
  const tenantKey = resolveSetupPasswordTenantKey(input);
  return {
    tenantKey,
    redirect: REDIRECT_BY_TENANT[tenantKey],
  };
}
