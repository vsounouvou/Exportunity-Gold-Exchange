import type { TenantConfig } from "../types";
import { agoojyeModulesDisabled, agoojyeModulesEnabled } from "./modules";
import { agoojyeThemeTokens } from "./theme";

export const agoojyeTenantConfig: TenantConfig = {
  slug: "agoojye",
  brandName: "AGOOJYÉ Electric Mobility",
  tagline: "Fait au Bénin. Conçu pour l'Afrique. Regardé par le monde.",
  primaryDomain: "agoojye.com",
  domains: [
    "agoojye.com",
    "www.agoojye.com",
    "app.agoojye.com",
    "admin.agoojye.com",
    "agojye.com",
    "www.agojye.com",
  ],
  defaultLocale: "fr",
  uiMode: "industrial",
  categoryPreset: "agoojye_mobility",
  homeMode: "marketing",
  storefrontMarketType: "EXPORT_READY",
  modulesEnabled: agoojyeModulesEnabled,
  modulesDisabled: agoojyeModulesDisabled,
  themeTokens: agoojyeThemeTokens,
  storefrontHero: {
    eyebrow: "Mobilite electrique nee au Benin",
    title: "AGOOJYÉ",
    subtitle: "Un mouvement industriel béninois pour construire la mobilité électrique africaine.",
    ctaPrimary: { label: "Rejoindre le mouvement", href: "/contact" },
    ctaSecondary: { label: "Devenir partenaire", href: "/partners" },
    backgroundStyle: "from-[#080808] via-[#123C2F] to-[#171717]",
  },
  storefrontTheme: {
    colors: {
      bg: "#080808",
      surface: "#1A1A1A",
      text: "#F7F2E8",
      primary: "#C99A36",
      accent: "#123C2F",
    },
    accent: "#C99A36",
    background: "radial-gradient(900px 420px at 50% -10%, rgba(201,154,54,0.22), transparent 60%), #080808",
    typography: "Inter, Manrope, system-ui, sans-serif",
    heroBanner: {
      gradientFrom: "#080808",
      gradientTo: "#123C2F",
    },
  },
  assets: {
    logoPath: "/tenants/agoojye/logo-full.svg",
    faviconPath: "/tenants/agoojye/favicon.svg",
    placeholderProduct: "/tenants/agoojye/bus-placeholder.svg",
    heroImages: ["/tenants/agoojye/hero-bus.svg"],
  },
};
