import type { TenantConfig } from "../types";
import { metModulesDisabled, metModulesEnabled } from "./modules";
import { metThemeTokens } from "./theme";

export const metTenantConfig: TenantConfig = {
  slug: "met",
  brandName: "Maison en Terre",
  tagline: "Construction marketplace for durable materials",
  primaryDomain: "maisonenterre.com",
  domains: [
    "maisonenterre.com",
    "www.maisonenterre.com",
    "maisonsenterre.com",
    "www.maisonsenterre.com",
  ],
  defaultLocale: "fr",
  uiMode: "industrial",
  categoryPreset: "construction",
  homeMode: "platform",
  homeRedirectTo: "/store",
  storefrontMarketType: "ALL",
  modulesEnabled: metModulesEnabled,
  modulesDisabled: metModulesDisabled,
  themeTokens: metThemeTokens,
  storefrontHero: {
    eyebrow: "Construction marketplace",
    title: "Build with durable earth-first materials",
    subtitle: "Compare materials, plans, and contractor offers in one standardized storefront.",
    ctaPrimary: { label: "Browse Materials", href: "/store" },
    ctaSecondary: { label: "Request Quote", href: "/devis" },
    backgroundStyle: "from-[#2e1a09] via-[#553018] to-[#7a3e12]",
  },
  storefrontTheme: {
    colors: {
      bg: "#f5efd9",
      surface: "#ffffff",
      text: "#1f2937",
      primary: "#7a3e12",
      accent: "#0f6b4e",
    },
    accent: "#0f6b4e",
    background: "linear-gradient(180deg, #f5efd9 0%, #f0ead4 100%)",
    typography: "Cabin, system-ui, sans-serif",
    heroBanner: {
      gradientFrom: "#2e1a09",
      gradientTo: "#7a3e12",
    },
  },
  storefrontIdentity: {
    platformLabel: "Maison en Terre Materials",
    retailModeLabel: "Materials",
    sections: [
      { slug: "earth-bricks", title: "Earth Bricks", subtitle: "CSEB and BTC blocks", limit: 24 },
      { slug: "house-plans", title: "House Plans", subtitle: "Model plans and guides", limit: 24 },
      { slug: "contractors", title: "Contractor Network", subtitle: "Local builders and experts", limit: 24 },
      { slug: "tools", title: "Tools & Equipment", subtitle: "Build kits and tools", limit: 24 },
    ],
    categoryVisuals: [
      { slug: "earth-bricks", label: "Earth Bricks", icon: "🧱", accent: "#c19a6b", image: "/tenants/met/placeholder-product.svg" },
      { slug: "lime-plaster", label: "Lime / Plaster", icon: "🏗️", accent: "#7a3e12", image: "/tenants/met/placeholder-product.svg" },
      { slug: "bamboo", label: "Bamboo", icon: "🎋", accent: "#6b8e23", image: "/tenants/met/placeholder-product.svg" },
      { slug: "solar-lighting", label: "Solar Lighting", icon: "🔆", accent: "#0f6b4e", image: "/tenants/met/placeholder-product.svg" },
      { slug: "contractor-services", label: "Contractor Services", icon: "🛠️", accent: "#8b5e34", image: "/tenants/met/placeholder-product.svg" },
    ],
  },
  assets: {
    logoPath: "/tenants/met/logo.svg",
    faviconPath: "/tenants/met/favicon.svg",
    placeholderProduct: "/tenants/met/placeholder-product.svg",
    heroImages: ["/tenants/met/hero-1.svg"],
  },
};
