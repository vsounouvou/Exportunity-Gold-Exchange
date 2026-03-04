import { resolveTenantKeyFromHost, type TenantKey } from "./tenants";

const REDIRECT_BY_TENANT: Record<TenantKey, string> = {
  bdo: "/dashboard",
  exportunity: "/zone",
  zone: "/zone",
  mindbase: "/admin/mindbase",
  met: "/admin/met",
  vs: "/admin/vs",
  hoz: "/admin/hoz",
  zogueland: "/admin/zogueland",
  rayon1km: "/admin/rayon1km",
};

function asTenantKey(value: unknown): TenantKey | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "bdo") return "bdo";
  if (normalized === "exportunity") return "exportunity";
  if (normalized === "zone") return "zone";
  if (normalized === "mindbase") return "mindbase";
  if (normalized === "met" || normalized === "maisonenterre" || normalized === "maisonsenterre") return "met";
  if (normalized === "vs" || normalized === "vss" || normalized === "vital" || normalized === "vitalsounouvou") return "vs";
  if (normalized === "hoz" || normalized === "houseofzogue" || normalized === "zogue") return "hoz";
  if (normalized === "zogueland") return "zogueland";
  if (normalized === "rayon1km" || normalized === "rayon") return "rayon1km";
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
  return resolveTenantKeyFromHost(host);
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
