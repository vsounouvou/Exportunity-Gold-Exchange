import type { TenantConfig } from "../types";
import { rayon1kmModulesDisabled, rayon1kmModulesEnabled } from "./modules";
import { rayon1kmThemeTokens } from "./theme";

export const rayon1kmTenantConfig: TenantConfig = {
  slug: "rayon1km",
  brandName: "Rayon 1km",
  tagline: "Everything within 1 km.",
  primaryDomain: "rayon1km.com",
  domains: ["rayon1km.com", "www.rayon1km.com", "api.rayon1km.com", "admin.rayon1km.com"],
  defaultLocale: "fr",
  uiMode: "proximity",
  categoryPreset: "core_trade",
  homeMode: "platform",
  homeRedirectTo: "/zone",
  storefrontMarketType: "PROXIMITY",
  defaultRadiusKm: 1,
  radiusOptionsKm: [1, 2, 5, 10],
  modulesEnabled: rayon1kmModulesEnabled,
  modulesDisabled: rayon1kmModulesDisabled,
  themeTokens: rayon1kmThemeTokens,
  storefrontHero: {
    eyebrow: "Proximity-first commerce",
    title: "Everything within 1 km",
    subtitle: "Discover nearby inventory instantly with category rails, quick add, and distance-aware discovery.",
    ctaPrimary: { label: "Nearby Store", href: "/zone" },
    ctaSecondary: { label: "Admin", href: "/admin/rayon1km" },
    backgroundStyle: "from-[#0b1324] via-[#15283f] to-[#26401f]",
  },
  storefrontTheme: {
    colors: {
      bg: "#020817",
      surface: "#0f172a",
      text: "#e2e8f0",
      primary: "#22c55e",
      accent: "#f59e0b",
    },
    accent: "#22c55e",
    background: "radial-gradient(1100px 420px at 50% -10%, rgba(34,197,94,0.2), transparent 60%), #020817",
    typography: "Sora, system-ui, sans-serif",
    heroBanner: {
      gradientFrom: "#0b1324",
      gradientTo: "#26401f",
    },
  },
  storefrontIdentity: {
    platformLabel: "Rayon 1km",
    retailModeLabel: "Nearby",
    sections: [
      { slug: "fresh", title: "Fresh Food Nearby", subtitle: "Daily essentials in your radius", limit: 24 },
      { slug: "meals", title: "Ready Meals", subtitle: "Fast delivery around you", limit: 24 },
      { slug: "services", title: "Services Nearby", subtitle: "Repairs, logistics, and local services", limit: 24 },
      { slug: "trending", title: "Trending Nearby", subtitle: "Popular local picks", limit: 24 },
    ],
    categoryVisuals: [
      { slug: "groceries", label: "Fresh Food", icon: "🥬", accent: "#22c55e", image: "/tenants/rayon1km/placeholder-product.svg" },
      { slug: "restaurants", label: "Ready Meals", icon: "🍲", accent: "#f59e0b", image: "/tenants/rayon1km/placeholder-product.svg" },
      { slug: "services", label: "Services", icon: "🛠️", accent: "#38bdf8", image: "/tenants/rayon1km/placeholder-product.svg" },
      { slug: "shops", label: "Shops", icon: "🏪", accent: "#facc15", image: "/tenants/rayon1km/placeholder-product.svg" },
    ],
  },
  assets: {
    logoPath: "/tenants/rayon1km/logo.svg",
    faviconPath: "/tenants/rayon1km/favicon.svg",
    placeholderProduct: "/tenants/rayon1km/placeholder-product.svg",
    heroImages: ["/tenants/rayon1km/hero-1.svg"],
  },
};
