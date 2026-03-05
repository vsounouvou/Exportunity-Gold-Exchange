import type { TenantConfig } from "../types";
import { hozModulesDisabled, hozModulesEnabled } from "./modules";
import { hozThemeTokens } from "./theme";

export const hozTenantConfig: TenantConfig = {
  slug: "hoz",
  brandName: "House of Zogue",
  tagline: "Afrocentric luxury creative house",
  primaryDomain: "houseofzogue.com",
  domains: ["houseofzogue.com", "www.houseofzogue.com"],
  defaultLocale: "en",
  uiMode: "luxury",
  categoryPreset: "luxury",
  homeMode: "platform",
  homeRedirectTo: "/store",
  storefrontMarketType: "ALL",
  modulesEnabled: hozModulesEnabled,
  modulesDisabled: hozModulesDisabled,
  themeTokens: hozThemeTokens,
  storefrontHero: {
    eyebrow: "Luxury creative house",
    title: "Limited drops, stories, and collectible craft",
    subtitle: "Curated creative products with premium presentation and one shared commerce engine.",
    ctaPrimary: { label: "Explore Store", href: "/store" },
    ctaSecondary: { label: "Admin", href: "/admin/hoz" },
    backgroundStyle: "from-[#311708] via-[#4b240e] to-[#7a4a1f]",
  },
  storefrontTheme: {
    colors: {
      bg: "#f7f4ee",
      surface: "#ffffff",
      text: "#1f2937",
      primary: "#1f2a44",
      accent: "#9a7d4f",
    },
    accent: "#9a7d4f",
    background: "linear-gradient(180deg, #f7f4ee 0%, #f3efe6 100%)",
    typography: "Fraunces, Georgia, serif",
    heroBanner: {
      gradientFrom: "#311708",
      gradientTo: "#7a4a1f",
    },
  },
  storefrontIdentity: {
    platformLabel: "Collections",
    retailModeLabel: "Collections",
    sections: [
      { slug: "jewelry", title: "Jewelry", subtitle: "Signature pieces and ateliers", limit: 24 },
      { slug: "luxury-drops", title: "Limited Drops", subtitle: "Curated luxury capsules", limit: 24 },
      { slug: "art-objects", title: "Art Objects", subtitle: "Collectible heritage pieces", limit: 24 },
      { slug: "books", title: "Books", subtitle: "Narrative and culture catalog", limit: 24 },
    ],
    categoryVisuals: [
      { slug: "jewelry", label: "Jewelry", icon: "💎", accent: "#9a7d4f", image: "/product-images/jewelry-chain.png" },
      { slug: "gold-art", label: "Art Objects", icon: "🎭", accent: "#8b5cf6", image: "/product-images/art-bust.png" },
      { slug: "books", label: "Books", icon: "📚", accent: "#f59e0b", image: "/tenants/hoz/placeholder-product.svg" },
      { slug: "luxury-drops", label: "Limited Drops", icon: "✨", accent: "#c084fc", image: "/tenants/hoz/placeholder-product.svg" },
    ],
  },
  assets: {
    logoPath: "/tenants/hoz/logo.svg",
    faviconPath: "/tenants/hoz/favicon.svg",
    placeholderProduct: "/tenants/hoz/placeholder-product.svg",
    heroImages: ["/tenants/hoz/hero-1.svg"],
  },
};
