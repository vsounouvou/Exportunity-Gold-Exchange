import type { TenantConfig } from "../types";
import { exportunityModulesDisabled, exportunityModulesEnabled } from "./modules";
import { exportunityThemeTokens } from "./theme";

export const exportunityTenantConfig: TenantConfig = {
  slug: "exportunity",
  brandName: "Exportunity",
  tagline: "Trade, source, manage supply, and expand across markets",
  primaryDomain: "exportunity.net",
  domains: [
    "exportunity.com",
    "www.exportunity.com",
    "exportunity.net",
    "www.exportunity.net",
    "com.exportunity.net",
    "www.com.exportunity.net",
  ],
  defaultLocale: "fr",
  uiMode: "industrial",
  categoryPreset: "industrial_factory_export",
  homeMode: "platform",
  homeRedirectTo: "/",
  storefrontMarketType: "EXPORT_READY",
  modulesEnabled: exportunityModulesEnabled,
  modulesDisabled: exportunityModulesDisabled,
  themeTokens: exportunityThemeTokens,
  storefrontHero: {
    eyebrow: "Global trade operating network",
    title: "Trade. Source. Expand. Operate.",
    subtitle: "Turn a commercial need into a governed sourcing, selling, supply, or market-expansion mission.",
    ctaPrimary: { label: "Tell Us What You Need", href: "/" },
    ctaSecondary: { label: "Explore Industries", href: "/industrial" },
    backgroundStyle: "from-[#07111F] via-[#0A1628] to-[#14243B]",
  },
  storefrontTheme: {
    colors: {
      bg: "#F7F8FA",
      surface: "#FFFFFF",
      text: "#111827",
      primary: "#F5A623",
      accent: "#07111F",
    },
    accent: "#F5A623",
    background: "radial-gradient(1200px 420px at 50% -10%, rgba(245,166,35,0.14), transparent 60%), #F7F8FA",
    typography: "Manrope, system-ui, sans-serif",
    heroBanner: {
      gradientFrom: "#07111F",
      gradientTo: "#0A1628",
    },
  },
  storefrontIdentity: {
    platformLabel: "Global Trade Operating Platform",
    retailModeLabel: "Trade Network",
    sections: [
      { slug: "factories", title: "Verified Factories", subtitle: "Public factory profiles approved by Exportunity", limit: 24 },
      { slug: "export-products", title: "Export-Ready Products", subtitle: "Approved B2B factory production", limit: 24 },
      { slug: "industrial-supply", title: "Industrial Supply", subtitle: "Requirements for inputs, parts, and services", limit: 24 },
      { slug: "machinery", title: "Exportunity Machinery", subtitle: "Machinery, lines, and technical requirements", limit: 24 },
    ],
    categoryVisuals: [
      { slug: "export-ready-factory-products", label: "Export-Ready Factory Products", icon: "factory", accent: "#F5A623" },
      { slug: "machinery", label: "Machinery and Production Equipment", icon: "settings", accent: "#F5A623" },
      { slug: "raw-materials", label: "Raw Materials", icon: "layers", accent: "#F5A623" },
      { slug: "spare-parts", label: "Spare Parts and Components", icon: "cog", accent: "#F5A623" },
    ],
  },
  assets: {
    logoPath: "/tenants/exportunity/official/logo-long-transparent.png",
    faviconPath: "/tenants/exportunity/official/favicon-64.png",
    heroImages: ["/tenants/exportunity/industrial/machinery-team.png"],
  },
};
