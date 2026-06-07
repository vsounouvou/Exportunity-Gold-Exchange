import type { TenantConfig } from "../types";
import { mindbaseModulesDisabled, mindbaseModulesEnabled } from "./modules";
import { mindbaseThemeTokens } from "./theme";

export const mindbaseTenantConfig: TenantConfig = {
  slug: "mindbase",
  brandName: "MindBase",
  tagline: "Own your intelligence. Deploy your Mind.",
  primaryDomain: "mindbase.cloud",
  domains: ["mindbase.cloud", "www.mindbase.cloud"],
  defaultLocale: "en",
  uiMode: "default",
  categoryPreset: "legacy",
  homeMode: "platform",
  homeRedirectTo: "/mindbase",
  storefrontMarketType: "ALL",
  modulesEnabled: mindbaseModulesEnabled,
  modulesDisabled: mindbaseModulesDisabled,
  themeTokens: mindbaseThemeTokens,
  storefrontHero: {
    eyebrow: "Agents marketplace",
    title: "Build, publish, and hire deployed intelligence",
    subtitle: "A unified storefront for agent products, workspaces, and deployable intelligence modules.",
    ctaPrimary: { label: "Explore Agents", href: "/store" },
    ctaSecondary: { label: "Build", href: "/build" },
    backgroundStyle: "from-[#0c1732] via-[#1f3d7a] to-[#2563eb]",
  },
  storefrontTheme: {
    colors: {
      bg: "#f8fafc",
      surface: "#ffffff",
      text: "#0f172a",
      primary: "#2563eb",
      accent: "#0ea5e9",
    },
    accent: "#2563eb",
    background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
    typography: "Urbanist, system-ui, sans-serif",
    heroBanner: {
      gradientFrom: "#0c1732",
      gradientTo: "#2563eb",
    },
  },
  storefrontIdentity: {
    platformLabel: "MindBase Intelligence Marketplace",
    retailModeLabel: "Marketplace",
    sections: [
      { slug: "featured-agents", title: "Featured Agents", subtitle: "Deployable specialized intelligence", limit: 24 },
      { slug: "prompt-packs", title: "Prompt Packs", subtitle: "Production-ready cognitive templates", limit: 24 },
      { slug: "knowledge-kits", title: "Knowledge Kits", subtitle: "Structured expertise bundles", limit: 24 },
      { slug: "workflows", title: "Automation Workflows", subtitle: "Reusable action systems", limit: 24 },
    ],
    categoryVisuals: [
      { slug: "agents", label: "Featured Agents", icon: "🤖", accent: "#6B4EFF", image: "/tenants/mindbase/placeholder-product.svg" },
      { slug: "prompt-packs", label: "Prompt Packs", icon: "🧠", accent: "#22D3EE", image: "/tenants/mindbase/placeholder-product.svg" },
      { slug: "knowledge-kits", label: "Knowledge Kits", icon: "📚", accent: "#60a5fa", image: "/tenants/mindbase/placeholder-product.svg" },
      { slug: "workflows", label: "Automation Workflows", icon: "⚙️", accent: "#8b5cf6", image: "/tenants/mindbase/placeholder-product.svg" },
      { slug: "templates", label: "Templates", icon: "🧩", accent: "#38bdf8", image: "/tenants/mindbase/placeholder-product.svg" },
    ],
  },
  assets: {
    logoPath: "/tenants/mindbase/logo.svg",
    faviconPath: "/tenants/mindbase/favicon.svg",
    placeholderProduct: "/tenants/mindbase/placeholder-product.svg",
    heroImages: ["/tenants/mindbase/hero-1.svg"],
  },
};
