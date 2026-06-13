import type { TenantConfig } from "../types";
import { xportcardModulesDisabled, xportcardModulesEnabled } from "./modules";
import { xportcardThemeTokens } from "./theme";

export const xportcardTenantConfig: TenantConfig = {
  slug: "xportcard",
  brandName: "XportCARD",
  tagline: "Territory, identity, and trade access infrastructure",
  primaryDomain: "xportcard.com",
  domains: ["xportcard.com", "www.xportcard.com"],
  defaultLocale: "en",
  uiMode: "default",
  categoryPreset: "core_trade",
  homeMode: "platform",
  homeRedirectTo: "/territories",
  storefrontMarketType: "EXPORT_READY",
  modulesEnabled: xportcardModulesEnabled,
  modulesDisabled: xportcardModulesDisabled,
  themeTokens: xportcardThemeTokens,
  storefrontHero: {
    eyebrow: "XportCARD",
    title: "Territory access for trade operators.",
    subtitle: "Structure territories, approved partners, logistics coverage, and trade access workflows.",
    ctaPrimary: { label: "Open Territories", href: "/territories" },
    ctaSecondary: { label: "Admin", href: "/admin/xportcard" },
    backgroundStyle: "from-[#020817] via-[#0f172a] to-[#172554]",
  },
  storefrontTheme: {
    colors: {
      bg: "#020817",
      surface: "#0f172a",
      text: "#e2e8f0",
      primary: "#0ea5e9",
      accent: "#f59e0b",
    },
    accent: "#f59e0b",
    background: "radial-gradient(1200px 420px at 50% -10%, rgba(14,165,233,0.18), transparent 60%), #020817",
    typography: "Manrope, system-ui, sans-serif",
    heroBanner: {
      gradientFrom: "#020817",
      gradientTo: "#172554",
    },
  },
  storefrontIdentity: {
    platformLabel: "XportCARD Territory Network",
    retailModeLabel: "Territory Access",
    sections: [
      { slug: "territories", title: "Territories", subtitle: "Coverage zones and operator access", limit: 24 },
      { slug: "partners", title: "Partners", subtitle: "Approved partner network", limit: 24 },
    ],
    categoryVisuals: [
      { slug: "territories", label: "Territories", icon: "map", accent: "#0ea5e9", image: "/tenants/exportunity/placeholder-product.svg" },
      { slug: "partners", label: "Partners", icon: "shield", accent: "#f59e0b", image: "/tenants/exportunity/placeholder-product.svg" },
    ],
  },
  assets: {
    logoPath: "/tenants/exportunity/logo.svg",
    faviconPath: "/tenants/exportunity/favicon.svg",
    placeholderProduct: "/tenants/exportunity/placeholder-product.svg",
    heroImages: ["/tenants/exportunity/hero-1.svg"],
  },
};
