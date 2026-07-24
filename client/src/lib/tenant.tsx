import { createContext, ReactNode, useContext, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { BRAND_MAP, type BrandInfo } from "@/lib/brand";
import type { TenantKey } from "@/types/tenant";
import { resolveTenantKey } from "@/lib/tenantResolution";
import { getTenantConfigByKey, listTenantConfigs } from "../../../tenants/index";

export type TenantInfo = {
  id?: number;
  key: TenantKey;
  name: string;
  domains: string[];
  themeConfig: Record<string, unknown>;
  featureFlags: Record<string, boolean>;
};

function buildFallbackTenant(key: TenantKey): TenantInfo {
  const config = getTenantConfigByKey(key);
  if (!config) {
    return {
      key,
      name: key,
      domains: [],
      themeConfig: { brand: key },
      featureFlags: {},
    };
  }

  const featureFlags: Record<string, boolean> = {};
  for (const moduleKey of config.modulesEnabled) featureFlags[`module.${moduleKey}`] = true;
  for (const moduleKey of config.modulesDisabled) featureFlags[`module.${moduleKey}`] = false;

  return {
    key: config.slug as TenantKey,
    name: config.brandName,
    domains: config.domains,
    themeConfig: {
      brand: config.slug,
      uiMode: config.uiMode,
      categoryPreset: config.categoryPreset,
      themeTokens: config.themeTokens,
      storefrontHero: config.storefrontHero || null,
      storefrontTheme: config.storefrontTheme || null,
      storefrontIdentity: config.storefrontIdentity || null,
      assets: config.assets || null,
    },
    featureFlags,
  };
}

const FALLBACK_TENANTS = Object.fromEntries(
  listTenantConfigs().map((config) => [config.slug, buildFallbackTenant(config.slug as TenantKey)]),
) as Record<TenantKey, TenantInfo>;

function resolveFallbackTenant(): TenantInfo {
  if (typeof window === "undefined") return FALLBACK_TENANTS.exportunity;
  const sessionToken = window.localStorage.getItem("ece_session");
  const resolved = resolveTenantKey({
    host: window.location.hostname,
    sessionToken,
  });
  return FALLBACK_TENANTS[resolved] || FALLBACK_TENANTS.exportunity;
}

interface TenantContextValue {
  tenant: TenantInfo;
  brand: BrandInfo;
  loading: boolean;
  error: string | null;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export const TENANT_FETCH_TIMEOUT_MS = 8_000;

async function fetchTenant(): Promise<TenantInfo> {
  const url = resolveApiUrl("/api/tenant");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TENANT_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error("Unable to resolve current tenant");
    }
    const payload = (await response.json()) as TenantInfo;
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["tenant"],
    queryFn: fetchTenant,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const fallback = resolveFallbackTenant();
  const sessionToken = typeof window !== "undefined" ? window.localStorage.getItem("ece_session") : null;
  const resolvedKey = resolveTenantKey({
    host: typeof window !== "undefined" ? window.location.hostname : undefined,
    sessionToken,
    apiTenantKey: data?.key ?? null,
  });
  const tenant = data && data.key === resolvedKey ? data : FALLBACK_TENANTS[resolvedKey] || fallback;
  const brand = BRAND_MAP[tenant.key] ?? BRAND_MAP.exportunity;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const themeTokens =
      tenant?.themeConfig && typeof tenant.themeConfig === "object"
        ? ((tenant.themeConfig as any).themeTokens as Record<string, string> | undefined)
        : undefined;
    const entries = themeTokens && typeof themeTokens === "object" ? Object.entries(themeTokens) : [];
    for (const [key, value] of entries) {
      if (!key.startsWith("--")) continue;
      root.style.setProperty(key, String(value));
    }
    root.setAttribute("data-tenant-key", tenant.key);
  }, [tenant]);

  return (
    <TenantContext.Provider
      value={{
        tenant,
        brand,
        loading: isLoading,
        error: error ? String(error) : null,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant must be used within TenantProvider");
  }
  return context;
}

export function useTenantBrand() {
  return useTenant().brand;
}
