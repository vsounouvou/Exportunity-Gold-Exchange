import type { TenantConfig } from "../types";
import { vsModulesDisabled, vsModulesEnabled } from "./modules";
import { vsThemeTokens } from "./theme";

export const vsTenantConfig: TenantConfig = {
  slug: "vs",
  brandName: "Vital Sounouvou",
  tagline: "Strategic narrative and reputation infrastructure",
  primaryDomain: "vitalsounouvou.com",
  domains: [
    "vitalsounouvou.com",
    "www.vitalsounouvou.com",
    "vss.vitalsounouvou.com",
    "www.vss.vitalsounouvou.com",
  ],
  defaultLocale: "en",
  uiMode: "default",
  categoryPreset: "legacy",
  homeMode: "platform",
  homeRedirectTo: "/store",
  storefrontMarketType: "ALL",
  modulesEnabled: vsModulesEnabled,
  modulesDisabled: vsModulesDisabled,
  themeTokens: vsThemeTokens,
  storefrontHero: {
    eyebrow: "Reputation and insight studio",
    title: "Strategic products and narrative assets",
    subtitle: "Operate content, knowledge, and publishing workflows from one consistent tenant storefront.",
    ctaPrimary: { label: "Browse Store", href: "/store" },
    ctaSecondary: { label: "Insights", href: "/insights" },
    backgroundStyle: "from-[#1a2b18] via-[#2e4a2a] to-[#4d6a3e]",
  },
  storefrontTheme: {
    colors: {
      bg: "#f5f1e8",
      surface: "#ffffff",
      text: "#1f2937",
      primary: "#2e3a2f",
      accent: "#b6862c",
    },
    accent: "#b6862c",
    background: "linear-gradient(180deg, #f5f1e8 0%, #f2eee4 100%)",
    typography: "Instrument Sans, system-ui, sans-serif",
    heroBanner: {
      gradientFrom: "#1a2b18",
      gradientTo: "#4d6a3e",
    },
  },
  storefrontIdentity: {
    platformLabel: "Vital Sounouvou Studio",
    retailModeLabel: "Studio",
    sections: [
      { slug: "books", title: "Books", subtitle: "Editorial releases and catalog", limit: 24 },
      { slug: "courses", title: "Courses", subtitle: "Structured learning programs", limit: 24 },
      { slug: "talks", title: "Talks", subtitle: "Conferences and keynote assets", limit: 24 },
      { slug: "digital-assets", title: "Digital Assets", subtitle: "Reports, playbooks, and media kits", limit: 24 },
      { slug: "insights", title: "Latest Insights", subtitle: "Strategic narrative feed", limit: 24 },
    ],
    categoryVisuals: [
      { slug: "books", label: "Books", icon: "📚", accent: "#8B0000", image: "/tenants/vs/placeholder-product.svg" },
      { slug: "courses", label: "Courses", icon: "🎓", accent: "#F59E0B", image: "/tenants/vs/placeholder-product.svg" },
      { slug: "speaking", label: "Talks", icon: "🎤", accent: "#b45309", image: "/tenants/vs/placeholder-product.svg" },
      { slug: "consulting", label: "Consulting", icon: "🧭", accent: "#7c2d12", image: "/tenants/vs/placeholder-product.svg" },
      { slug: "digital-assets", label: "Digital Assets", icon: "🗂️", accent: "#d97706", image: "/tenants/vs/placeholder-product.svg" },
    ],
  },
  assets: {
    logoPath: "/tenants/vs/logo.svg",
    faviconPath: "/tenants/vs/favicon.svg",
    placeholderProduct: "/tenants/vs/placeholder-product.svg",
    heroImages: ["/tenants/vs/hero-1.svg"],
  },
};
