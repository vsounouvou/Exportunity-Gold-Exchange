import type { TenantKey } from "@/types/tenant";

export type StoreMode = "GOLD" | "MATERIALS" | "GENERAL";
export type CategoryMode = "WEIGHT_TIERS" | "NORMAL";
export type HeroMode = "NONE" | "BANNER";

export type TenantUXConfig = {
  showMap: boolean;
  showGoldChart: boolean;
  showNewsBanner: boolean;
  storeMode: StoreMode;
  categoryMode: CategoryMode;
  heroMode: HeroMode;
  adaptiveRailThreshold: number;
  nonMapFlowLayout: boolean;
};

const DEFAULT_UX: TenantUXConfig = {
  showMap: false,
  showGoldChart: false,
  showNewsBanner: false,
  storeMode: "GENERAL",
  categoryMode: "NORMAL",
  heroMode: "NONE",
  adaptiveRailThreshold: 4,
  nonMapFlowLayout: true,
};

const TENANT_UX: Record<TenantKey, TenantUXConfig> = {
  bdo: {
    showMap: false,
    showGoldChart: true,
    showNewsBanner: true,
    storeMode: "GOLD",
    categoryMode: "WEIGHT_TIERS",
    heroMode: "BANNER",
    adaptiveRailThreshold: 4,
    nonMapFlowLayout: true,
  },
  met: {
    showMap: false,
    showGoldChart: false,
    showNewsBanner: false,
    storeMode: "MATERIALS",
    categoryMode: "NORMAL",
    heroMode: "NONE",
    adaptiveRailThreshold: 4,
    nonMapFlowLayout: true,
  },
  rayon1km: {
    showMap: true,
    showGoldChart: false,
    showNewsBanner: false,
    storeMode: "GENERAL",
    categoryMode: "NORMAL",
    heroMode: "NONE",
    adaptiveRailThreshold: 4,
    nonMapFlowLayout: false,
  },
  exportunity: {
    showMap: false,
    showGoldChart: false,
    showNewsBanner: false,
    storeMode: "GENERAL",
    categoryMode: "NORMAL",
    heroMode: "NONE",
    adaptiveRailThreshold: 4,
    nonMapFlowLayout: true,
  },
  zone: {
    showMap: false,
    showGoldChart: false,
    showNewsBanner: false,
    storeMode: "GENERAL",
    categoryMode: "NORMAL",
    heroMode: "NONE",
    adaptiveRailThreshold: 4,
    nonMapFlowLayout: true,
  },
  hoz: {
    showMap: false,
    showGoldChart: false,
    showNewsBanner: false,
    storeMode: "GENERAL",
    categoryMode: "NORMAL",
    heroMode: "NONE",
    adaptiveRailThreshold: 4,
    nonMapFlowLayout: true,
  },
  vs: {
    showMap: false,
    showGoldChart: false,
    showNewsBanner: false,
    storeMode: "GENERAL",
    categoryMode: "NORMAL",
    heroMode: "NONE",
    adaptiveRailThreshold: 4,
    nonMapFlowLayout: true,
  },
  mindbase: {
    showMap: false,
    showGoldChart: false,
    showNewsBanner: false,
    storeMode: "GENERAL",
    categoryMode: "NORMAL",
    heroMode: "NONE",
    adaptiveRailThreshold: 4,
    nonMapFlowLayout: true,
  },
  zogueland: {
    showMap: false,
    showGoldChart: false,
    showNewsBanner: false,
    storeMode: "GENERAL",
    categoryMode: "NORMAL",
    heroMode: "NONE",
    adaptiveRailThreshold: 4,
    nonMapFlowLayout: true,
  },
  madd: {
    showMap: false,
    showGoldChart: false,
    showNewsBanner: false,
    storeMode: "GENERAL",
    categoryMode: "NORMAL",
    heroMode: "NONE",
    adaptiveRailThreshold: 4,
    nonMapFlowLayout: true,
  },
  xportcard: {
    showMap: true,
    showGoldChart: false,
    showNewsBanner: false,
    storeMode: "GENERAL",
    categoryMode: "NORMAL",
    heroMode: "NONE",
    adaptiveRailThreshold: 4,
    nonMapFlowLayout: false,
  },
};

export function getTenantUXConfig(tenantKey: TenantKey): TenantUXConfig {
  return TENANT_UX[tenantKey] || DEFAULT_UX;
}
