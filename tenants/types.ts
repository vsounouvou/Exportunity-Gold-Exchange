export const PLATFORM_MODULE_KEYS = [
  "products",
  "collections",
  "cart",
  "checkout",
  "wallet",
  "agents",
  "analytics",
  "map",
  "stories",
  "audio",
  "insights",
  "agentsMarketplace",
  "parent_dashboard",
  "child_profiles",
  "safe_ai_chat",
  "character_creator",
  "print_on_demand",
  "luxuryDrops",
  "bulkQuotes",
  "luxury_drops",
  "wholesale",
  "bulk_quotes",
  "suppliers",
  "image_gen",
] as const;

export type PlatformModuleKey = (typeof PLATFORM_MODULE_KEYS)[number];

export type TenantSlug =
  | "bdo"
  | "exportunity"
  | "zone"
  | "mindbase"
  | "met"
  | "vs"
  | "hoz"
  | "zogueland"
  | "rayon1km";

export type TenantKeyInput = TenantSlug | "vss" | "rayon";

export type TenantUiMode = "default" | "luxury" | "kids" | "industrial" | "proximity";
export type TenantHomeMode = "platform" | "marketing" | "hybrid";
export type TenantStorefrontMarketType = "ALL" | "PROXIMITY" | "EXPORT_READY";
export type TenantStorefrontHeroAction = {
  label: string;
  href: string;
};

export type TenantStorefrontHero = {
  eyebrow?: string;
  title: string;
  subtitle: string;
  ctaPrimary?: TenantStorefrontHeroAction;
  ctaSecondary?: TenantStorefrontHeroAction;
  backgroundStyle?: string;
};

export type TenantBrandAssets = {
  logoPath?: string;
  faviconPath?: string;
  placeholderProduct?: string;
  heroImages?: string[];
};

export type TenantCategoryVisual = {
  slug: string;
  label?: string;
  icon?: string;
  image?: string;
  accent?: string;
};

export type TenantRailConfig = {
  slug: string;
  title: string;
  subtitle?: string;
  limit?: number;
};

export type TenantStorefrontIdentity = {
  platformLabel: string;
  retailModeLabel: string;
  sections: TenantRailConfig[];
  categoryVisuals: TenantCategoryVisual[];
};

export type TenantThemeModel = {
  colors: {
    bg: string;
    surface: string;
    text: string;
    primary: string;
    accent: string;
  };
  accent: string;
  background: string;
  typography: string;
  heroBanner: {
    gradientFrom: string;
    gradientTo: string;
  };
};

export type TenantConfig = {
  slug: TenantSlug;
  brandName: string;
  tagline: string;
  primaryDomain: string;
  domains: string[];
  defaultLocale: string;
  uiMode: TenantUiMode;
  categoryPreset: string;
  homeMode: TenantHomeMode;
  homeRedirectTo?: string;
  storefrontMarketType?: TenantStorefrontMarketType;
  defaultRadiusKm?: number;
  radiusOptionsKm?: number[];
  modulesEnabled: PlatformModuleKey[];
  modulesDisabled: PlatformModuleKey[];
  themeTokens: Record<string, string>;
  storefrontHero?: TenantStorefrontHero;
  storefrontTheme?: TenantThemeModel;
  storefrontIdentity?: TenantStorefrontIdentity;
  assets?: TenantBrandAssets;
  navOverrides?: Record<string, unknown>;
};

export type TenantRegistry = Record<TenantSlug, TenantConfig>;
