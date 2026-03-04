import type { TenantConfig } from "../types";
import { zoguelandModulesDisabled, zoguelandModulesEnabled } from "./modules";
import { zoguelandThemeTokens } from "./theme";

export const zoguelandTenantConfig: TenantConfig = {
  slug: "zogueland",
  brandName: "Zogueland",
  tagline: "Children ecosystem for stories, learning, and creation",
  primaryDomain: "zogueland.com",
  domains: ["zogueland.com", "www.zogueland.com", "api.zogueland.com", "admin.zogueland.com"],
  defaultLocale: "en",
  uiMode: "kids",
  categoryPreset: "children",
  homeMode: "platform",
  homeRedirectTo: "/store",
  storefrontMarketType: "ALL",
  modulesEnabled: zoguelandModulesEnabled,
  modulesDisabled: zoguelandModulesDisabled,
  themeTokens: zoguelandThemeTokens,
  storefrontHero: {
    eyebrow: "Kids learning ecosystem",
    title: "Stories, audio, and printable adventures",
    subtitle: "Discover child-safe learning products built for families, creators, and schools.",
    ctaPrimary: { label: "Explore Stories", href: "/store" },
    ctaSecondary: { label: "Parent Dashboard", href: "/admin/zogueland" },
    backgroundStyle: "from-[#172554] via-[#1e3a8a] to-[#0f766e]",
  },
  storefrontTheme: {
    colors: {
      bg: "#ecfeff",
      surface: "#ffffff",
      text: "#0f172a",
      primary: "#1d4ed8",
      accent: "#0f766e",
    },
    accent: "#0f766e",
    background: "linear-gradient(180deg, #ecfeff 0%, #e0f2fe 100%)",
    typography: "Baloo 2, system-ui, sans-serif",
    heroBanner: {
      gradientFrom: "#172554",
      gradientTo: "#0f766e",
    },
  },
  storefrontIdentity: {
    platformLabel: "Zogueland Marketplace",
    retailModeLabel: "Marketplace",
    sections: [
      { slug: "stories", title: "Stories", subtitle: "Interactive and bedtime stories", limit: 24 },
      { slug: "audio", title: "Audiobooks", subtitle: "Listen and learn", limit: 24 },
      { slug: "learning-games", title: "Learning Games", subtitle: "Play-based learning tools", limit: 24 },
      { slug: "character-worlds", title: "Character Worlds", subtitle: "Explore story universes", limit: 24 },
    ],
    categoryVisuals: [
      { slug: "stories", label: "Stories", icon: "📖", accent: "#FF6B6B", image: "/tenants/zogueland/placeholder-product.svg" },
      { slug: "audio", label: "Audiobooks", icon: "🎧", accent: "#FFD93D", image: "/tenants/zogueland/placeholder-product.svg" },
      { slug: "learning-games", label: "Learning Games", icon: "🧩", accent: "#6BCB77", image: "/tenants/zogueland/placeholder-product.svg" },
      { slug: "creative-studio", label: "Creative Studio", icon: "🎨", accent: "#22D3EE", image: "/tenants/zogueland/placeholder-product.svg" },
      { slug: "character-worlds", label: "Character Worlds", icon: "🦄", accent: "#a855f7", image: "/tenants/zogueland/placeholder-product.svg" },
    ],
  },
  assets: {
    logoPath: "/tenants/zogueland/logo.svg",
    faviconPath: "/tenants/zogueland/favicon.svg",
    placeholderProduct: "/tenants/zogueland/placeholder-product.svg",
    heroImages: ["/tenants/zogueland/hero-1.svg"],
  },
};
