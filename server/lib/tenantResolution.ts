import type { Request } from "express";

import { getTenantByKey, resolveTenantFromHost, type TenantKey } from "./tenants";

const LOCAL_OVERRIDE_HOSTS = new Set(["localhost", "127.0.0.1"]);

function normalizeHost(host: string | undefined): string {
  return String(host || "")
    .split(",")[0]
    ?.split(":")[0]
    ?.trim()
    .toLowerCase() || "";
}

function asTenantKey(value: unknown): TenantKey | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "bdo") return "bdo";
  if (normalized === "exportunity") return "exportunity";
  if (normalized === "zone") return "zone";
  if (normalized === "mindbase") return "mindbase";
  if (normalized === "met" || normalized === "maisonenterre" || normalized === "maisonsenterre") {
    return "met";
  }
  if (normalized === "vs" || normalized === "vss" || normalized === "vital" || normalized === "vitalsounouvou") {
    return "vs";
  }
  if (normalized === "hoz" || normalized === "houseofzogue" || normalized === "zogue") {
    return "hoz";
  }
  if (normalized === "zogueland") {
    return "zogueland";
  }
  if (normalized === "rayon1km" || normalized === "rayon") {
    return "rayon1km";
  }
  return null;
}

function getForwardedHost(req: Request): string | undefined {
  const raw = req.headers["x-forwarded-host"];
  if (Array.isArray(raw)) return raw[0];
  if (typeof raw === "string") return raw;
  return undefined;
}

function readLocalOverrideTenantKey(req: Request): TenantKey | null {
  const headerTenant = asTenantKey(req.headers["x-tenant-key"] || req.headers["x-tenant"]);
  if (headerTenant) return headerTenant;

  const queryTenant = asTenantKey((req.query as any)?.tenant || (req.query as any)?.tenant_key);
  if (queryTenant) return queryTenant;

  return null;
}

export async function resolveTenantFromRequest(req: Request) {
  const hostValue = getForwardedHost(req) || String(req.headers.host || "");
  const normalizedHost = normalizeHost(hostValue);

  const tenantFromHost = await resolveTenantFromHost(hostValue);
  if (!LOCAL_OVERRIDE_HOSTS.has(normalizedHost)) return tenantFromHost;

  const overrideKey = readLocalOverrideTenantKey(req);
  if (!overrideKey) return tenantFromHost;

  const overrideTenant = await getTenantByKey(overrideKey);
  return overrideTenant || tenantFromHost;
}
