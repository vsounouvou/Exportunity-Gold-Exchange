import type { TenantConfig } from "../types";
import { zoneModulesDisabled, zoneModulesEnabled } from "./modules";
import { zoneThemeTokens } from "./theme";

export const zoneTenantConfig: TenantConfig = {
  slug: "zone",
  brandName: "Exportunity Zone",
  tagline: "Retail and wholesale marketplace",
  primaryDomain: "exportunity.zone",
  domains: ["exportunity.zone", "www.exportunity.zone"],
  defaultLocale: "en",
  uiMode: "default",
  categoryPreset: "core_trade",
  homeMode: "platform",
  homeRedirectTo: "/zone",
  storefrontMarketType: "ALL",
  modulesEnabled: zoneModulesEnabled,
  modulesDisabled: zoneModulesDisabled,
  themeTokens: zoneThemeTokens,
  storefrontHero: {
    eyebrow: "Zone retail interface",
    title: "Nearby commerce with real-time rails",
    subtitle: "Browse by category, add quickly, and act from one shared tenant storefront.",
    ctaPrimary: { label: "Browse Zone", href: "/zone" },
    ctaSecondary: { label: "Admin", href: "/admin" },
    backgroundStyle: "from-[#0b1324] via-[#142548] to-[#1b3a70]",
  },
  storefrontTheme: {
    colors: {
      bg: "#020817",
      surface: "#0f172a",
      text: "#e2e8f0",
      primary: "#0ea5e9",
      accent: "#22c55e",
    },
    accent: "#22c55e",
    background: "radial-gradient(1200px 420px at 50% -10%, rgba(14,165,233,0.18), transparent 60%), #020817",
    typography: "Manrope, system-ui, sans-serif",
    heroBanner: {
      gradientFrom: "#0b1324",
      gradientTo: "#1b3a70",
    },
  },
  storefrontIdentity: {
    platformLabel: "Global Export Marketplace",
    retailModeLabel: "Marketplace",
    sections: [
      { slug: "nearby", title: "Nearby Retail", subtitle: "Local catalog and quick checkout", limit: 24 },
      { slug: "wholesale", title: "Wholesale", subtitle: "Bulk sourcing and supplier flows", limit: 24 },
      { slug: "collections", title: "Collections", subtitle: "Curated tenant inventory", limit: 24 },
    ],
    categoryVisuals: [
      { slug: "groceries", label: "Groceries", icon: "🥬", accent: "#22c55e", image: "/tenants/zone/placeholder-product.svg" },
      { slug: "fashion", label: "Fashion", icon: "👗", accent: "#8b5cf6", image: "/tenants/zone/placeholder-product.svg" },
      { slug: "electronics", label: "Electronics", icon: "🔌", accent: "#38bdf8", image: "/tenants/zone/placeholder-product.svg" },
      { slug: "services", label: "Services", icon: "🧰", accent: "#f59e0b", image: "/tenants/zone/placeholder-product.svg" },
    ],
  },
  assets: {
    logoPath: "/tenants/zone/logo.svg",
    faviconPath: "/tenants/zone/favicon.svg",
    placeholderProduct: "/tenants/zone/placeholder-product.svg",
    heroImages: ["/tenants/zone/hero-1.svg"],
  },
};
