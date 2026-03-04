import { getTenantConfigByKey, matchTenantConfig, normalizeHost, normalizeTenantKey } from "../../../tenants/index";
import type { TenantKey } from "@/types/tenant";

function parseJwtPayload(token: string | null | undefined) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length < 2) return null;
  const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  try {
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

function asTenantKey(value: unknown): TenantKey | null {
  return normalizeTenantKey(value as string) as TenantKey | null;
}

export { normalizeHost };

export function tenantFromHost(host: string | undefined): TenantKey | null {
  const normalized = normalizeHost(host);
  if (!normalized) return null;
  const matched = matchTenantConfig(normalized);
  return matched ? (matched.slug as TenantKey) : null;
}

export function tenantFromSessionToken(token: string | null | undefined): TenantKey | null {
  const payload = parseJwtPayload(token);
  if (!payload || typeof payload !== "object") return null;
  const candidate =
    (payload as any).tenantKey ??
    (payload as any).tenant_key ??
    (payload as any).tenant ??
    (payload as any).tnt ??
    null;
  return asTenantKey(candidate);
}

export function resolveTenantKey(input: {
  host: string | undefined;
  sessionToken?: string | null;
  apiTenantKey?: string | null;
}): TenantKey {
  const hostTenant = tenantFromHost(input.host);
  if (hostTenant) return hostTenant;

  const sessionTenant = tenantFromSessionToken(input.sessionToken);
  if (sessionTenant) return sessionTenant;

  const apiTenant = asTenantKey(input.apiTenantKey);
  if (apiTenant) return apiTenant;

  const fallback = getTenantConfigByKey("exportunity");
  return (fallback?.slug || "exportunity") as TenantKey;
}
