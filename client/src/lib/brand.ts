import type { TenantKey } from "@/types/tenant";

export type ProductScope = "GOLD_ONLY" | "MULTI_CATEGORY";
export type ConciergeScope = "GOLD_ONLY" | "MULTI_CATEGORY";
export type LandingMode = "map-first" | "browse-first";

export type BrandTheme = {
  primary: string;
  accent: string;
  secondary?: string;
  background?: string;
  logo?: string;
};

export type BrandInfo = {
  name: string;
  shortName?: string;
  nameAscii: string;
  domain: string;
  canonicalUrl?: string;
  metaTitle: string;
  metaDescription: string;
  complianceNotice: string;
  tagline: string;
  subtitle?: string;
  faviconPath?: string;
  productScope: ProductScope;
  conciergeScope: ConciergeScope;
  landing: LandingMode;
  theme: BrandTheme;
};

export const BRAND_MAP: Record<TenantKey, BrandInfo> = {
  bdo: {
    name: "Bourse de l'Or",
    nameAscii: "Bourse de l'Or",
    domain: "boursedelor.com",
    metaTitle: "Bourse de l'Or by Exportunity",
    metaDescription:
      "Wallet-centric gold platform focused on verified supply, virtual vaulting, and compliant settlement.",
    complianceNotice: "Access subject to applicable compliance requirements.",
    tagline: "Or africain certifie, des mines africaines jusqu'a votre porte",
    subtitle: "Or trace, conforme et certifie",
    productScope: "GOLD_ONLY",
    conciergeScope: "GOLD_ONLY",
    landing: "map-first",
    theme: {
      primary: "#f59e0b",
      accent: "#fbbf24",
    },
  },
  exportunity: {
    name: "Exportunity",
    nameAscii: "Exportunity",
    domain: "exportunity.net",
    metaTitle: "Marketplace - Exportunity",
    metaDescription:
      "Exportunity marketplace combines export-ready catalogs with wholesale sourcing on a shared wallet foundation.",
    complianceNotice: "Access subject to Exportunity compliance controls.",
    tagline: "Marketplace + Wholesale",
    productScope: "MULTI_CATEGORY",
    conciergeScope: "MULTI_CATEGORY",
    landing: "browse-first",
    theme: {
      primary: "#0ea5e9",
      accent: "#22c55e",
    },
  },
  zone: {
    name: "Exportunity Marketplace",
    nameAscii: "Exportunity Marketplace",
    domain: "exportunity.zone",
    metaTitle: "Marketplace - Exportunity",
    metaDescription:
      "Marketplace is the retail and wholesale layer of Exportunity.",
    complianceNotice: "Access subject to Exportunity compliance controls.",
    tagline: "Marketplace + wholesale",
    productScope: "MULTI_CATEGORY",
    conciergeScope: "MULTI_CATEGORY",
    landing: "browse-first",
    theme: {
      primary: "#0ea5e9",
      accent: "#22c55e",
    },
  },
  mindbase: {
    name: "MindBase",
    nameAscii: "MindBase",
    domain: "mindbase.cloud",
    metaTitle: "MindBase - Own your intelligence. Deploy your Mind.",
    metaDescription:
      "MindBase is the intelligence exchange where creators deploy expertise as human-owned agents.",
    complianceNotice: "Knowledge stays private unless explicitly published by the creator.",
    tagline: "Own your intelligence. Deploy your Mind.",
    subtitle: "Build, publish, and monetize your MindBase",
    productScope: "MULTI_CATEGORY",
    conciergeScope: "MULTI_CATEGORY",
    landing: "browse-first",
    theme: {
      primary: "#007BFF",
      accent: "#64748B",
    },
  },
  met: {
    name: "Maison en Terre",
    shortName: "MET",
    nameAscii: "Maison en Terre",
    domain: "maisonsenterre.com",
    canonicalUrl: "https://maisonsenterre.com",
    metaTitle: "Maison en Terre — Construisez en terre, durablement",
    metaDescription:
      "Maison en Terre concoit, construit et fournit des briques BTC/CEB pour des maisons durables en Afrique.",
    complianceNotice: "Devis et commandes soumis a validation technique et logistique.",
    tagline: "Briques BTC/CEB, maison modele et livraison chantier",
    subtitle: "Briques BTC/CEB, maison modele et livraison chantier",
    faviconPath: "/tenants/met/favicon.ico",
    productScope: "MULTI_CATEGORY",
    conciergeScope: "MULTI_CATEGORY",
    landing: "browse-first",
    theme: {
      primary: "#7A3E12",
      secondary: "#0F6B4E",
      accent: "#E8DCC2",
      background: "#F5EFD9",
    },
  },
  vs: {
    name: "Vital Sounouvou",
    shortName: "VS",
    nameAscii: "Vital Sounouvou",
    domain: "vitalsounouvou.com",
    canonicalUrl: "https://vitalsounouvou.com",
    metaTitle: "Vital Sounouvou - Reputation, Media, and Strategic Narrative",
    metaDescription:
      "Official platform of Vital Sounouvou for reputation strategy, media outreach, and social intelligence.",
    complianceNotice: "Publishing and outreach actions are controlled by role-based approval gates.",
    tagline: "Strategic narrative and reputation infrastructure",
    subtitle: "Press, insights, studio, and governed social operations",
    productScope: "MULTI_CATEGORY",
    conciergeScope: "MULTI_CATEGORY",
    landing: "browse-first",
    theme: {
      primary: "#2E3A2F",
      secondary: "#B6862C",
      accent: "#7E9A5A",
      background: "#F5F1E8",
    },
  },
  hoz: {
    name: "House of Zogue",
    shortName: "HOZ",
    nameAscii: "House of Zogue",
    domain: "houseofzogue.com",
    canonicalUrl: "https://houseofzogue.com",
    metaTitle: "House of Zogue - Books, Jewelry, and Cultural Media",
    metaDescription:
      "House of Zogue curates books, jewelry, and media narratives rooted in modern African luxury and heritage.",
    complianceNotice: "Editorial and product updates are managed by tenant-approved administrators.",
    tagline: "Afrocentric luxury narrative studio",
    subtitle: "Luxury jewelry, couture, and cultural collectibles",
    productScope: "MULTI_CATEGORY",
    conciergeScope: "MULTI_CATEGORY",
    landing: "browse-first",
    theme: {
      primary: "#1F2A44",
      secondary: "#9A7D4F",
      accent: "#D5C4A1",
      background: "#F7F4EE",
    },
  },
  zogueland: {
    name: "Zogueland",
    shortName: "ZL",
    nameAscii: "Zogueland",
    domain: "zogueland.com",
    canonicalUrl: "https://zogueland.com",
    metaTitle: "Zogueland - Stories, Learning, and Safe AI for Children",
    metaDescription:
      "Zogueland is the children ecosystem for stories, audiobooks, printable learning, and safe AI creation.",
    complianceNotice: "Parent controls and child-safe policy gates are enabled by default.",
    tagline: "A children-first learning and creativity ecosystem",
    subtitle: "Stories, audio, STEM, avatars, and printable learning tools",
    productScope: "MULTI_CATEGORY",
    conciergeScope: "MULTI_CATEGORY",
    landing: "browse-first",
    theme: {
      primary: "#14b8a6",
      secondary: "#0ea5e9",
      accent: "#f59e0b",
      background: "#f8fafc",
    },
  },
  rayon1km: {
    name: "Rayon 1km",
    shortName: "Rayon",
    nameAscii: "Rayon 1km",
    domain: "rayon1km.com",
    canonicalUrl: "https://rayon1km.com",
    metaTitle: "Rayon 1km - Everything within 1 km",
    metaDescription:
      "Rayon 1km is a proximity-first marketplace for nearby products, services, and daily essentials.",
    complianceNotice: "Availability and delivery radius depend on local seller coverage and compliance controls.",
    tagline: "Everything within 1 km.",
    subtitle: "Proximity-first commerce with map-driven discovery",
    productScope: "MULTI_CATEGORY",
    conciergeScope: "MULTI_CATEGORY",
    landing: "map-first",
    theme: {
      primary: "#22c55e",
      secondary: "#0f172a",
      accent: "#f59e0b",
      background: "#020817",
    },
  },
};

export const BRAND = BRAND_MAP.bdo;

export function formatPageTitle(pageTitle?: string, brand: BrandInfo = BRAND) {
  if (!pageTitle) return brand.metaTitle;
  return `${brand.name} - ${pageTitle}`;
}

