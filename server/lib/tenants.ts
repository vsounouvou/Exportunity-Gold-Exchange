import { db } from "@db";
import { tenants } from "@db/schema/tenants";
import { eq, sql } from "drizzle-orm";
import {
  getTenantConfigByKey,
  listTenantConfigs,
  normalizeHost,
  normalizeTenantKey,
  resolveTenantConfigWithOverrides,
  type TenantConfig,
  type TenantSlug,
} from "../../tenants/index";

export type TenantKey = TenantSlug;

export type TenantDefinition = {
  key: TenantKey;
  name: string;
  domains: string[];
  themeConfig?: Record<string, unknown>;
  featureFlags?: Record<string, boolean>;
};

function toFeatureFlags(config: TenantConfig): Record<string, boolean> {
  const flags: Record<string, boolean> = {};

  for (const moduleKey of config.modulesEnabled) {
    flags[`module.${moduleKey}`] = true;
  }

  for (const moduleKey of config.modulesDisabled) {
    flags[`module.${moduleKey}`] = false;
  }

  flags.multiProduct = flags["module.products"] === true;
  flags.goldOnly = config.slug === "bdo";
  flags.wholesale = flags["module.wholesale"] === true;
  flags.retail = flags["module.products"] === true;
  flags.mindbase = config.slug === "mindbase";
  flags.zOne = config.slug === "zone" || config.slug === "exportunity";
  return flags;
}

const DEFAULT_TENANTS: TenantDefinition[] = listTenantConfigs().map((config) => ({
  key: config.slug,
  name: config.brandName,
  domains: config.domains,
  themeConfig: {
    brand: config.slug,
    uiMode: config.uiMode,
    categoryPreset: config.categoryPreset,
    tagline: config.tagline,
    themeTokens: config.themeTokens,
  },
  featureFlags: toFeatureFlags(config),
}));

let tenantCache: Array<{
  id: number;
  key: string;
  name: string;
  domains: string[] | null;
  featureFlags: Record<string, boolean> | null;
  themeConfig: Record<string, unknown> | null;
}> | null = null;

function normalizeKey(key: string | undefined | null): TenantKey | null {
  return normalizeTenantKey(key) as TenantKey | null;
}

export function resolveTenantKeyFromHost(host: string | undefined): TenantKey {
  const config = resolveTenantConfigWithOverrides({
    host,
    forcedKey: process.env.TENANT_FORCE_KEY,
    envHostMap: process.env.TENANT_HOST_MAP,
    defaultKey: process.env.TENANT_DEFAULT || "exportunity",
  });
  return config.slug;
}

export function getTenantDomains(key: TenantKey): string[] {
  return getTenantConfigByKey(key)?.domains ?? [];
}

async function queryTenantByDomainFromSites(host: string) {
  const normalized = normalizeHost(host);
  if (!normalized) return null;
  let result: any = null;
  try {
    result = await db.execute(sql`
      select t.id, t.key, t.name, t.domains, t.feature_flags as "featureFlags", t.theme_config as "themeConfig"
      from tenant_sites s
      join tenants t on t.id = s.tenant_id
      where lower(s.domain) = ${normalized}
         or lower(s.canonical_host) = ${normalized}
      order by s.id asc
      limit 1
    `);
  } catch {
    // tenant_sites can be absent in fresh environments before telemetry bootstrap.
    return null;
  }

  const row = (result as any)?.rows?.[0];
  if (!row) return null;

  return {
    id: Number(row.id),
    key: String(row.key || ""),
    name: String(row.name || ""),
    domains: Array.isArray(row.domains) ? row.domains : null,
    featureFlags: row.featureFlags && typeof row.featureFlags === "object" ? row.featureFlags : null,
    themeConfig: row.themeConfig && typeof row.themeConfig === "object" ? row.themeConfig : null,
  };
}

async function queryTenantByDomainFromTenants(host: string) {
  const normalized = normalizeHost(host);
  if (!normalized) return null;

  const rows = await db.select().from(tenants);
  for (const row of rows) {
    const domains = Array.isArray((row as any).domains) ? ((row as any).domains as string[]) : [];
    const matched = domains.some((domain) => {
      const normalizedDomain = normalizeHost(domain);
      if (!normalizedDomain) return false;
      return normalized === normalizedDomain || normalized.endsWith(`.${normalizedDomain}`);
    });
    if (!matched) continue;
    return row;
  }

  return null;
}

export async function ensureTenants() {
  const now = new Date();

  for (const def of DEFAULT_TENANTS) {
    await db
      .insert(tenants)
      .values({
        key: def.key,
        name: def.name,
        domains: def.domains,
        themeConfig: def.themeConfig ?? {},
        featureFlags: def.featureFlags ?? {},
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: tenants.key,
        set: {
          name: def.name,
          domains: def.domains,
          themeConfig: def.themeConfig ?? {},
          featureFlags: def.featureFlags ?? {},
          updatedAt: now,
        },
      });
  }

  tenantCache = await db.select().from(tenants);
  return tenantCache;
}

export async function getTenantByKey(keyInput: TenantKey | string) {
  const key = normalizeKey(String(keyInput || ""));
  if (!key) return null;

  if (tenantCache) {
    const cached = tenantCache.find((tenant) => tenant.key === key);
    if (cached) return cached;
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.key, key),
  });
  if (!tenant) return null;

  tenantCache = tenantCache ? [...tenantCache.filter((t) => t.key !== key), tenant] : [tenant];
  return tenant;
}

export async function resolveTenantFromHost(host: string | undefined) {
  const normalized = normalizeHost(host);

  // Preferred source: tenant_sites (domain inventory table)
  if (normalized) {
    const siteTenant = await queryTenantByDomainFromSites(normalized);
    if (siteTenant) {
      if (tenantCache) {
        tenantCache = [...tenantCache.filter((entry) => entry.key !== siteTenant.key), siteTenant as any];
      }
      return siteTenant;
    }

    const domainTenant = await queryTenantByDomainFromTenants(normalized);
    if (domainTenant) {
      if (tenantCache) {
        tenantCache = [...tenantCache.filter((entry) => entry.key !== domainTenant.key), domainTenant as any];
      }
      return domainTenant;
    }
  }

  // Fallback: registry/env mapping -> tenants table by key
  const key = resolveTenantKeyFromHost(normalized);
  return getTenantByKey(key);
}
