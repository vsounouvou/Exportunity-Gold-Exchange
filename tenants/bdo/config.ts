import type { TenantConfig } from "../types";
import { bdoModulesDisabled, bdoModulesEnabled } from "./modules";
import { bdoThemeTokens } from "./theme";

export const bdoTenantConfig: TenantConfig = {
  slug: "bdo",
  brandName: "Bourse de l'Or",
  tagline: "Or africain certifié, des mines africaines jusqu'à votre porte",
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
    eyebrow: "Bourse de l'Or",
    title: "Or africain certifié, des mines africaines jusqu'à votre porte",
    subtitle:
      "Or tracé, conforme et certifié, provenant d'Afrique et préparé à la demande pour livraison sécurisée.",
    ctaPrimary: { label: "Or Estampillé", href: "/store" },
    ctaSecondary: { label: "Espace Pro", href: "/espace-pro" },
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
    platformLabel: "Bourse de l'Or - Or Estampillé",
    retailModeLabel: "Or Estampillé",
    sections: [
      { slug: "stamped", title: "Or Estampillé", subtitle: "Pièces et lingots certifiés, frappés à la demande", limit: 40 },
      { slug: "jewelry", title: "Bijoux en or", subtitle: "Pièces certifiées, réalisées sur commande", limit: 40 },
      { slug: "gold-art", title: "Or d'art", subtitle: "Créations patrimoniales et pièces de collection", limit: 24 },
    ],
    categoryVisuals: [
      { slug: "dore", label: "Doré", icon: "gem", accent: "#EA580C", image: "/product-images/dore-nuggets-01.png" },
      { slug: "stamped", label: "Or Estampillé", icon: "shield", accent: "#10B981", image: "/product-images/stamped-bar-01.png" },
      { slug: "jewelry", label: "Bijoux en or", icon: "sparkles", accent: "#A855F7", image: "/product-images/jewelry-chain.png" },
      { slug: "gold-art", label: "Or d'art", icon: "palette", accent: "#F97316", image: "/product-images/art-medallion.png" },
    ],
  },
  assets: {
    logoPath: "/tenants/bdo/logo.svg",
    faviconPath: "/tenants/bdo/favicon.svg",
    placeholderProduct: "/tenants/bdo/placeholder-product.svg",
    heroImages: ["/tenants/bdo/hero-1.svg"],
  },
};
