import type { TenantConfig } from "../types";
import { bdoModulesDisabled, bdoModulesEnabled } from "./modules";
import { bdoThemeTokens } from "./theme";

export const bdoTenantConfig: TenantConfig = {
  slug: "bdo",
  brandName: "Bourse de l'Or",
  tagline: "Valeur - Confiance - Pérennité",
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
    title: "Acheter de l'or physique certifié.",
    subtitle:
      "BOURSE DE L'OR est une plateforme digitale structurée pour acheter, documenter et vérifier l'or physique, les lingots issus de partenaires raffinerie, les bijoux vérifiés et les pièces de collection.",
    ctaPrimary: { label: "Produits en or", href: "/store" },
    ctaSecondary: { label: "Espace Pro", href: "/espace-pro" },
    backgroundStyle: "from-[#0B0B0D] via-[#0D1B2A] to-[#0B0B0D]",
  },
  storefrontTheme: {
    colors: {
      bg: "#0B0B0D",
      surface: "#0D1B2A",
      text: "#F5F3EC",
      primary: "#D4AF37",
      accent: "#E8C873",
    },
    accent: "#D4AF37",
    background: "radial-gradient(1200px 420px at 50% -10%, rgba(212,175,55,0.22), transparent 60%), linear-gradient(180deg, #0B0B0D 0%, #050505 100%)",
    typography: "Montserrat, system-ui, sans-serif",
    heroBanner: {
      gradientFrom: "#0B0B0D",
      gradientTo: "#0D1B2A",
    },
  },
  marketplaceDefaults: {
    defaultCurrency: "XOF",
    distanceUnit: "km",
    deliveryRadiusKm: 150,
  },
  storefrontIdentity: {
    platformLabel: "Bourse de l'Or - Or physique documenté",
    retailModeLabel: "Or physique documenté",
    sections: [
      { slug: "stamped", title: "Or physique documenté", subtitle: "Lingots et pièces soumis à disponibilité, vérification et confirmation finale", limit: 40 },
      { slug: "jewelry", title: "Bijoux en or", subtitle: "Bijoux vérifiés ou réalisés sur commande par des partenaires approuvés", limit: 40 },
      { slug: "gold-art", title: "Pièces de collection", subtitle: "Créations patrimoniales et collections documentées selon les informations disponibles", limit: 24 },
    ],
    categoryVisuals: [
      { slug: "dore", label: "Doré", icon: "gem", accent: "#D4AF37", image: "/product-images/dore-nuggets-01.png" },
      { slug: "stamped", label: "Or documenté", icon: "shield", accent: "#E8C873", image: "/product-images/stamped-bar-01.png" },
      { slug: "jewelry", label: "Bijoux en or", icon: "sparkles", accent: "#D4AF37", image: "/product-images/jewelry-chain.png" },
      { slug: "gold-art", label: "Or d'art", icon: "palette", accent: "#E8C873", image: "/product-images/art-medallion.png" },
    ],
  },
  assets: {
    logoPath: "/tenants/bdo/logo.svg",
    faviconPath: "/tenants/bdo/official/brand/favicon-512.png",
    placeholderProduct: "/tenants/bdo/placeholder-product.svg",
    heroImages: ["/tenants/bdo/hero-1.svg"],
  },
};
