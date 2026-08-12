import { agoojyeTenantConfig } from "./agoojye/config";
import { bdoTenantConfig } from "./bdo/config";
import { exportunityTenantConfig } from "./exportunity/config";
import { hozTenantConfig } from "./hoz/config";
import { maddTenantConfig } from "./madd/config";
import { metTenantConfig } from "./met/config";
import { mindbaseTenantConfig } from "./mindbase/config";
import { rayon1kmTenantConfig } from "./rayon1km/config";
import { vsTenantConfig } from "./vs/config";
import { xportcardTenantConfig } from "./xportcard/config";
import { zoneTenantConfig } from "./zone/config";
import { zoguelandTenantConfig } from "./zogueland/config";
import type { PlatformModuleKey, TenantConfig, TenantKeyInput, TenantRegistry, TenantSlug } from "./types";

export const TENANT_REGISTRY: TenantRegistry = {
  agoojye: agoojyeTenantConfig,
  bdo: bdoTenantConfig,
  exportunity: exportunityTenantConfig,
  zone: zoneTenantConfig,
  mindbase: mindbaseTenantConfig,
  met: metTenantConfig,
  vs: vsTenantConfig,
  hoz: hozTenantConfig,
  zogueland: zoguelandTenantConfig,
  madd: maddTenantConfig,
  xportcard: xportcardTenantConfig,
  rayon1km: rayon1kmTenantConfig,
};

const TENANT_ALIASES: Record<string, TenantSlug> = {
  agoojyé: "agoojye",
  agojye: "agoojye",
  vss: "vs",
  vital: "vs",
  vitalsounouvou: "vs",
  maisonsenterre: "met",
  maisonenterre: "met",
  houseofzogue: "hoz",
  zogue: "hoz",
  rayon: "rayon1km",
  rayon1km: "rayon1km",
  xcard: "xportcard",
  xport: "xportcard",
  maddacademy: "madd",
};

const TENANT_HOST_MAP: Record<string, TenantSlug> = Object.values(TENANT_REGISTRY).reduce((acc, config) => {
  for (const domain of config.domains) {
    acc[normalizeHost(domain)] = config.slug;
  }
  return acc;
}, {} as Record<string, TenantSlug>);

export function normalizeHost(host: string | undefined | null) {
  return String(host || "")
    .split(",")[0]
    .split(":")[0]
    .trim()
    .toLowerCase();
}

export function normalizeTenantKey(input: TenantKeyInput | string | null | undefined): TenantSlug | null {
  const normalized = String(input || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized in TENANT_REGISTRY) return normalized as TenantSlug;
  return TENANT_ALIASES[normalized] ?? null;
}

export function getTenantConfigByKey(input: TenantKeyInput | string | null | undefined): TenantConfig | null {
  const key = normalizeTenantKey(input);
  if (!key) return null;
  return TENANT_REGISTRY[key] || null;
}

export function listTenantConfigs() {
  return Object.values(TENANT_REGISTRY);
}

export function listTenantSlugs() {
  return Object.keys(TENANT_REGISTRY) as TenantSlug[];
}

export function resolveTenantConfig(host: string | undefined | null): TenantConfig {
  const normalized = normalizeHost(host);
  if (!normalized) return TENANT_REGISTRY.exportunity;

  const matched = matchTenantConfig(normalized);
  return matched ?? TENANT_REGISTRY.exportunity;
}

export function matchTenantConfig(host: string | undefined | null): TenantConfig | null {
  const normalized = normalizeHost(host);
  if (!normalized) return null;

  const exact = TENANT_HOST_MAP[normalized];
  if (exact) return TENANT_REGISTRY[exact] ?? null;

  const wildcardMatch = listTenantConfigs().find((config) =>
    config.domains.some((domain) => {
      const normalizedDomain = normalizeHost(domain);
      if (!normalizedDomain) return false;
      return normalized === normalizedDomain || normalized.endsWith(`.${normalizedDomain}`);
    }),
  );

  return wildcardMatch ?? null;
}

export function getTenantHostMapFromEnv(rawMap: string | undefined | null) {
  const source = String(rawMap || "").trim();
  if (!source) return {} as Record<string, TenantSlug>;

  const entries = source
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean);

  const map: Record<string, TenantSlug> = {};
  for (const entry of entries) {
    const [hostRaw, keyRaw] = entry.split("=").map((v) => String(v || "").trim());
    const host = normalizeHost(hostRaw);
    const slug = normalizeTenantKey(keyRaw);
    if (!host || !slug) continue;
    map[host] = slug;
  }
  return map;
}

export function resolveTenantConfigWithOverrides(input: {
  host?: string | null;
  forcedKey?: string | null;
  envHostMap?: string | null;
  defaultKey?: string | null;
}) {
  const forced = normalizeTenantKey(input.forcedKey);
  if (forced) return TENANT_REGISTRY[forced];

  const host = normalizeHost(input.host);
  const envMap = getTenantHostMapFromEnv(input.envHostMap);
  if (host && envMap[host]) return TENANT_REGISTRY[envMap[host]];

  if (host) {
    const resolved = resolveTenantConfig(host);
    if (resolved) return resolved;
  }

  const defaultKey = normalizeTenantKey(input.defaultKey);
  if (defaultKey) return TENANT_REGISTRY[defaultKey];

  return TENANT_REGISTRY.exportunity;
}

export function hasTenantModule(tenantKey: TenantKeyInput | string, moduleKey: PlatformModuleKey) {
  const config = getTenantConfigByKey(tenantKey);
  if (!config) return false;

  const aliasesByKey: Record<string, PlatformModuleKey[]> = {
    luxuryDrops: ["luxuryDrops", "luxury_drops"],
    luxury_drops: ["luxuryDrops", "luxury_drops"],
    bulkQuotes: ["bulkQuotes", "bulk_quotes"],
    bulk_quotes: ["bulkQuotes", "bulk_quotes"],
    insights: ["insights"],
    agentsMarketplace: ["agentsMarketplace"],
    map: ["map"],
  };

  const candidates = aliasesByKey[moduleKey] || [moduleKey];
  if (config.modulesDisabled.some((entry) => candidates.includes(entry))) return false;
  return config.modulesEnabled.some((entry) => candidates.includes(entry));
}

export function getTenantDefaultRoute(tenantKey: TenantKeyInput | string) {
  const key = normalizeTenantKey(tenantKey);
  if (key === "agoojye") return "/admin/agoojye";
  if (key === "mindbase") return "/mindbase";
  if (key === "met") return "/admin/met";
  if (key === "vs") return "/admin/vs";
  if (key === "hoz") return "/admin/hoz";
  if (key === "rayon1km") return "/admin/rayon1km";
  if (key === "zone") return "/zone";
  if (key === "zogueland") return "/admin/zogueland";
  if (key === "madd") return "/admin/madd";
  if (key === "xportcard") return "/admin/xportcard";
  if (key === "exportunity") return "/";
  return "/dashboard";
}

/**
 * Public tenant homes and signed-in operational homes are intentionally
 * different for Exportunity. The global trade network is public;
 * administrators return to the existing AI operations workspace.
 */
export function getTenantAdminHomeRoute(tenantKey: TenantKeyInput | string) {
  const key = normalizeTenantKey(tenantKey);
  if (key === "exportunity") return "/ai-team";
  if (key === "mindbase") return "/admin/mindbase";
  return getTenantDefaultRoute(key || "");
}

export function getTenantHomeRoute(tenantKey: TenantKeyInput | string) {
  const config = getTenantConfigByKey(tenantKey);
  if (!config) return "/zone";

  if (config.homeMode === "marketing") return "/";
  if (typeof config.homeRedirectTo === "string" && config.homeRedirectTo.startsWith("/")) {
    return config.homeRedirectTo;
  }

  return "/store";
}
