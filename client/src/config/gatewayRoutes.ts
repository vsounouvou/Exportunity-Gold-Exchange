import type { TenantKey } from "@/types/tenant";

export type GatewayRoleKey = "miner" | "wholesaler" | "buyer" | "investor" | "explore";

export type GatewayDestinations = {
  enterEcosystemUrl: string;
  demoUrl: string;
  roleUrls: Record<GatewayRoleKey, string>;
};

const TENANT_ENTRY_URLS: Record<TenantKey, string> = {
  bdo: "/marketplace?mode=retail",
  exportunity: "/marketplace?mode=retail",
  zone: "/marketplace?mode=retail",
  mindbase: "/mindbase",
  met: "/",
  vs: "/",
  hoz: "/",
  zogueland: "/store",
  madd: "/madd-world",
  rayon1km: "/zone",
  xportcard: "/territories",
};

const TENANT_ROLE_URLS: Record<TenantKey, Record<GatewayRoleKey, string>> = {
  bdo: {
    miner: "/seller-dashboard",
    wholesaler: "/marketplace?mode=wholesale",
    buyer: "/marketplace?mode=retail",
    investor: "/marketplace?mode=invest",
    explore: "/marketplace?mode=demo",
  },
  exportunity: {
    miner: "/apply/shop",
    wholesaler: "/marketplace?mode=wholesale",
    buyer: "/marketplace?mode=retail",
    investor: "/marketplace?mode=invest",
    explore: "/marketplace?mode=demo",
  },
  zone: {
    miner: "/apply/shop",
    wholesaler: "/marketplace?mode=wholesale",
    buyer: "/marketplace?mode=retail",
    investor: "/marketplace?mode=invest",
    explore: "/marketplace?mode=demo",
  },
  mindbase: {
    miner: "/mindbase/studio",
    wholesaler: "/mindbase/discover",
    buyer: "/mindbase/discover",
    investor: "/mindbase/discover?category=invest",
    explore: "/mindbase/discover",
  },
  met: {
    miner: "/briques",
    wholesaler: "/briques",
    buyer: "/briques",
    investor: "/devis",
    explore: "/",
  },
  vs: {
    miner: "/admin/vs/studio",
    wholesaler: "/admin/vs/pr",
    buyer: "/",
    investor: "/admin/vs/dashboard",
    explore: "/",
  },
  hoz: {
    miner: "/admin/hoz/media",
    wholesaler: "/admin/hoz/collections",
    buyer: "/",
    investor: "/admin/hoz/dashboard",
    explore: "/",
  },
  zogueland: {
    miner: "/admin/zogueland",
    wholesaler: "/collections",
    buyer: "/store",
    investor: "/admin/zogueland",
    explore: "/store",
  },
  madd: {
    miner: "/madd-world",
    wholesaler: "/collections",
    buyer: "/madd-world",
    investor: "/admin/madd",
    explore: "/madd-world",
  },
  rayon1km: {
    miner: "/dashboard",
    wholesaler: "/collections",
    buyer: "/zone",
    investor: "/dashboard",
    explore: "/zone",
  },
  xportcard: {
    miner: "/territories",
    wholesaler: "/marketplace?mode=wholesale",
    buyer: "/territories",
    investor: "/admin/xportcard",
    explore: "/territories",
  },
};

export function getGatewayDestinations(
  tenantKey: TenantKey,
  role: GatewayRoleKey | null | undefined,
  demoMode: boolean,
): GatewayDestinations {
  const roleUrls = TENANT_ROLE_URLS[tenantKey] ?? TENANT_ROLE_URLS.bdo;
  const demoUrl = roleUrls.explore;
  const entryUrl = TENANT_ENTRY_URLS[tenantKey] ?? TENANT_ENTRY_URLS.bdo;

  if (demoMode) {
    return {
      enterEcosystemUrl: demoUrl,
      demoUrl,
      roleUrls,
    };
  }

  return {
    enterEcosystemUrl: entryUrl,
    demoUrl,
    roleUrls,
  };
}
