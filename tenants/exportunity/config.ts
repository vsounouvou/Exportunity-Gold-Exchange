import type { TenantConfig } from "../types";
import { exportunityModulesDisabled, exportunityModulesEnabled } from "./modules";
import { exportunityThemeTokens } from "./theme";

export const exportunityTenantConfig: TenantConfig = {
  slug: "exportunity",
  brandName: "Exportunity",
  tagline: "One engine for trade, operations, and AI execution",
  primaryDomain: "exportunity.net",
  domains: [
    "exportunity.com",
    "www.exportunity.com",
    "exportunity.net",
    "www.exportunity.net",
    "com.exportunity.net",
    "www.com.exportunity.net",
  ],
  defaultLocale: "en",
  uiMode: "default",
  categoryPreset: "core_trade",
  homeMode: "platform",
  homeRedirectTo: "/zone",
  storefrontMarketType: "EXPORT_READY",
  modulesEnabled: exportunityModulesEnabled,
  modulesDisabled: exportunityModulesDisabled,
  themeTokens: exportunityThemeTokens,
  storefrontHero: {
    eyebrow: "Export-ready marketplace",
    title: "Trade products ready for cross-border delivery",
    subtitle: "Source export-ready inventory, compare collections, and execute faster with a shared operating stack.",
    ctaPrimary: { label: "Browse Store", href: "/store" },
    ctaSecondary: { label: "Admin", href: "/admin" },
    backgroundStyle: "from-[#0b1324] via-[#10213e] to-[#173a2b]",
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
      gradientTo: "#173a2b",
    },
  },
  storefrontIdentity: {
    platformLabel: "Exportunity Marketplace",
    retailModeLabel: "Marketplace",
    sections: [
      { slug: "export-ready", title: "Export Ready Products", subtitle: "Cross-border compliant listings", limit: 24 },
      { slug: "suppliers", title: "Global Suppliers", subtitle: "Verified sellers and producer networks", limit: 24 },
      { slug: "trade-requests", title: "Trade Requests", subtitle: "RFQs and contract opportunities", limit: 24 },
      { slug: "logistics", title: "Logistics", subtitle: "Shipping and fulfillment partners", limit: 24 },
    ],
    categoryVisuals: [
      { slug: "agriculture", label: "Agriculture", icon: "🌾", accent: "#22c55e", image: "/tenants/exportunity/placeholder-product.svg" },
      { slug: "textiles", label: "Textiles", icon: "🧵", accent: "#0ea5e9", image: "/tenants/exportunity/placeholder-product.svg" },
      { slug: "minerals", label: "Minerals", icon: "⛏️", accent: "#38bdf8", image: "/tenants/exportunity/placeholder-product.svg" },
      { slug: "processed-food", label: "Processed Foods", icon: "📦", accent: "#16a34a", image: "/tenants/exportunity/placeholder-product.svg" },
    ],
  },
  assets: {
    logoPath: "/tenants/exportunity/logo.svg",
    faviconPath: "/tenants/exportunity/favicon.svg",
    placeholderProduct: "/tenants/exportunity/placeholder-product.svg",
    heroImages: ["/tenants/exportunity/hero-1.svg"],
  },
};
