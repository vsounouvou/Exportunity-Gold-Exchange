import type { TenantConfig } from "../types";
import { maddModulesDisabled, maddModulesEnabled } from "./modules";
import { maddThemeTokens } from "./theme";

export const maddTenantConfig: TenantConfig = {
  slug: "madd",
  brandName: "MADD Academy",
  tagline: "Learning, creativity, and safe AI for children",
  primaryDomain: "maddacademy.com",
  domains: ["maddacademy.com", "www.maddacademy.com"],
  defaultLocale: "en",
  uiMode: "kids",
  categoryPreset: "core_trade",
  homeMode: "platform",
  homeRedirectTo: "/madd-world",
  storefrontMarketType: "ALL",
  modulesEnabled: maddModulesEnabled,
  modulesDisabled: maddModulesDisabled,
  themeTokens: maddThemeTokens,
  storefrontHero: {
    eyebrow: "MADD Academy",
    title: "A guided learning world for children.",
    subtitle: "Stories, creative activities, family controls, and safe AI tools in one governed learning space.",
    ctaPrimary: { label: "Enter MADD World", href: "/madd-world" },
    ctaSecondary: { label: "Parent Dashboard", href: "/family" },
    backgroundStyle: "from-[#fff7ed] via-[#ffffff] to-[#e0f2fe]",
  },
  storefrontTheme: {
    colors: {
      bg: "#fff7ed",
      surface: "#ffffff",
      text: "#1f2937",
      primary: "#f97316",
      accent: "#2563eb",
    },
    accent: "#2563eb",
    background: "linear-gradient(180deg, #fff7ed 0%, #ffffff 100%)",
    typography: "Inter, system-ui, sans-serif",
    heroBanner: {
      gradientFrom: "#fff7ed",
      gradientTo: "#e0f2fe",
    },
  },
  storefrontIdentity: {
    platformLabel: "MADD Academy",
    retailModeLabel: "Learning Shop",
    sections: [
      { slug: "stories", title: "Stories", subtitle: "Children-first stories and audio", limit: 24 },
      { slug: "activities", title: "Activities", subtitle: "Creative learning tools", limit: 24 },
    ],
    categoryVisuals: [
      { slug: "stories", label: "Stories", icon: "book", accent: "#f97316", image: "/tenants/exportunity/placeholder-product.svg" },
      { slug: "activities", label: "Activities", icon: "sparkles", accent: "#2563eb", image: "/tenants/exportunity/placeholder-product.svg" },
    ],
  },
  assets: {
    logoPath: "/tenants/exportunity/official/logo-long-transparent.png",
    faviconPath: "/tenants/exportunity/official/favicon-64.png",
    placeholderProduct: "/tenants/exportunity/placeholder-product.svg",
    heroImages: ["/tenants/exportunity/hero-1.svg"],
  },
};
