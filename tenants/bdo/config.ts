import type { TenantConfig } from "../types";
import { bdoModulesDisabled, bdoModulesEnabled } from "./modules";
import { bdoThemeTokens } from "./theme";

export const bdoTenantConfig: TenantConfig = {
  slug: "bdo",
  brandName: "Bourse de l'Or",
  tagline: "Gold operations platform",
  primaryDomain: "boursedelor.com",
  domains: ["boursedelor.com", "www.boursedelor.com"],
  defaultLocale: "fr",
  uiMode: "default",
  categoryPreset: "core_trade",
  homeMode: "platform",
  homeRedirectTo: "/store",
  storefrontMarketType: "ALL",
  modulesEnabled: bdoModulesEnabled,
  modulesDisabled: bdoModulesDisabled,
  themeTokens: bdoThemeTokens,
  storefrontHero: {
    eyebrow: "Gold operations network",
    title: "Source, verify, and execute gold flows",
    subtitle: "Structured rails for stamped gold, operations, logistics, and buyer execution.",
    ctaPrimary: { label: "Open Store", href: "/store" },
    ctaSecondary: { label: "Operations", href: "/ai-team" },
    backgroundStyle: "from-[#1f1408] via-[#3b2a10] to-[#5e4a1e]",
  },
  storefrontTheme: {
    colors: {
      bg: "#020817",
      surface: "#0f172a",
      text: "#e2e8f0",
      primary: "#f59e0b",
      accent: "#facc15",
    },
    accent: "#f59e0b",
    background: "radial-gradient(1200px 420px at 50% -10%, rgba(245,158,11,0.18), transparent 60%), #020817",
    typography: "Manrope, system-ui, sans-serif",
    heroBanner: {
      gradientFrom: "#1f1408",
      gradientTo: "#5e4a1e",
    },
  },
  storefrontIdentity: {
    platformLabel: "Bourse de l'Or Retail",
    retailModeLabel: "Retail",
    sections: [
      { slug: "stamped", title: "Stamped Gold", subtitle: "Retail-ready stamped units", limit: 40 },
      { slug: "verified", title: "Verified Inventory", subtitle: "Hallmarked and traceable", limit: 40 },
    ],
    categoryVisuals: [
      { slug: "dore", label: "Doré", icon: "🪨", accent: "#EA580C", image: "/product-images/dore-nuggets-01.png" },
      { slug: "stamped", label: "Stamped Gold", icon: "🪙", accent: "#10B981", image: "/product-images/stamped-bar-01.png" },
    ],
  },
  assets: {
    logoPath: "/tenants/bdo/logo.svg",
    faviconPath: "/tenants/bdo/favicon.svg",
    placeholderProduct: "/tenants/bdo/placeholder-product.svg",
    heroImages: ["/tenants/bdo/hero-1.svg"],
  },
};
