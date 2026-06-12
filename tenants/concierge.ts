import { getTenantConfigByKey } from "./registry";
import type { TenantConfig, TenantFrontOfficeAgent, TenantKeyInput } from "./types";

export type TenantConciergeProfile = {
  tenantKey: string;
  brandName: string;
  agentKey: string;
  displayName: string;
  shortName: string;
  roleLabel: string;
  retailSummary: string;
  wholesaleSummary: string;
  retailPrompt: string;
  retailAdvicePrompt: string;
  wholesalePrompt: string;
  wholesaleAdvicePrompt: string;
  logisticsPrompt: string;
  paymentSeed: string;
  retailActionLabel: string;
  wholesaleActionLabel: string;
  inputPlaceholder: string;
  voiceHint: string;
  adminPath: string;
};

type WelcomeInput = {
  displayName?: string | null;
  buyerMode?: string | null;
  marketMode?: string | null;
};

function toSlugToken(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function firstWord(value: string) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  return parts[0] || String(value || "").trim() || "Concierge";
}

function withDefaults(tenant: TenantConfig, overrides?: TenantFrontOfficeAgent | null): TenantConciergeProfile {
  const brandName = String(tenant?.brandName || "Marketplace").trim();
  const brandToken = toSlugToken(tenant?.slug || brandName || "marketplace");
  const fallbackShortName = `${brandName} Concierge`;
  const displayName = String(overrides?.displayName || fallbackShortName).trim();
  const shortName = String(overrides?.shortName || firstWord(displayName)).trim();

  return {
    tenantKey: String(tenant?.slug || brandToken || "marketplace"),
    brandName,
    agentKey: String(overrides?.agentKey || `${brandToken}_front_concierge`).trim(),
    displayName,
    shortName,
    roleLabel: String(overrides?.roleLabel || `Agent front-office ${brandName}`).trim(),
    retailSummary: String(
      overrides?.retailSummary || "Conseil privé pour catalogue, panier et paiement sécurisé.",
    ).trim(),
    wholesaleSummary: String(
      overrides?.wholesaleSummary || "Conseil privé pour offres, sourcing et demandes professionnelles.",
    ).trim(),
    retailPrompt: String(overrides?.retailPrompt || "Je veux acheter un produit.").trim(),
    retailAdvicePrompt: String(
      overrides?.retailAdvicePrompt || "Que recommandes-tu pour commencer ?",
    ).trim(),
    wholesalePrompt: String(
      overrides?.wholesalePrompt || "Montre-moi les offres professionnelles disponibles.",
    ).trim(),
    wholesaleAdvicePrompt: String(
      overrides?.wholesaleAdvicePrompt || "Quel fournisseur vérifié recommandes-tu ?",
    ).trim(),
    logisticsPrompt: String(
      overrides?.logisticsPrompt || "Comment sont organisés le paiement, la livraison ou le retrait ?",
    ).trim(),
    paymentSeed: String(
      overrides?.paymentSeed || "Très bien. Je prépare votre paiement sécurisé et j'ouvre la suite sans détour.",
    ).trim(),
    retailActionLabel: String(overrides?.retailActionLabel || "Catalogue").trim(),
    wholesaleActionLabel: String(overrides?.wholesaleActionLabel || "Offres pro").trim(),
    inputPlaceholder: String(
      overrides?.inputPlaceholder || "Écrivez, dictez ou joignez une image...",
    ).trim(),
    voiceHint: String(overrides?.voiceHint || "Touchez pour dicter").trim(),
    adminPath: String(
      overrides?.adminPath || `/admin/agents-os?surface=front-office&agent=${encodeURIComponent(String(overrides?.agentKey || `${brandToken}_front_concierge`))}`,
    ).trim(),
  };
}

export function getTenantFrontOfficeAgentProfile(input: TenantKeyInput | string | TenantConfig | null | undefined) {
  const tenant =
    input && typeof input === "object" && "brandName" in input
      ? (input as TenantConfig)
      : getTenantConfigByKey(input as TenantKeyInput | string | null | undefined);

  if (!tenant) {
    return withDefaults(
      {
        slug: "exportunity",
        brandName: "Exportunity",
        tagline: "",
        primaryDomain: "",
        domains: [],
        defaultLocale: "en",
        uiMode: "default",
        categoryPreset: "core_trade",
        homeMode: "platform",
        modulesEnabled: [],
        modulesDisabled: [],
        themeTokens: {},
      },
      null,
    );
  }

  return withDefaults(tenant, tenant.frontOfficeAgent || null);
}

export function buildTenantConciergeWelcome(profile: TenantConciergeProfile, input: WelcomeInput) {
  const firstName = String(input.displayName || "").trim().split(/\s+/)[0] || "";
  const greeting = firstName ? `Bonjour ${firstName},` : "Bonjour,";
  const isWholesale = input.buyerMode === "wholesale" || input.marketMode === "dore";

  if (profile.tenantKey === "bdo") {
    if (isWholesale) {
      return `${greeting} je suis ${profile.displayName}. Je peux vous guider sur le sourcing africain, les bureaux d'achat, les mines et le paiement quand vous êtes prêt.`;
    }

    return `${greeting} je suis ${profile.displayName}. Je peux vous aider à choisir une pièce, répondre à vos questions, ouvrir Flutterwave ou préparer votre commande sans détour.`;
  }

  if (isWholesale) {
    return `${greeting} je suis ${profile.displayName}. Je peux vous guider sur les offres, les fournisseurs vérifiés et le paiement quand vous êtes prêt.`;
  }

  return `${greeting} je suis ${profile.displayName}. Je peux vous aider à choisir un produit, répondre à vos questions et préparer votre commande sans détour.`;
}
