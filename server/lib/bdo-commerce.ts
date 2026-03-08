import { getSetting, setSetting } from "./settings";

export const BDO_COMMERCE_SETTING_KEYS = {
  defaultCurrency: "default_currency",
  defaultLanguage: "default_language",
  platformGoldMarginPercent: "platform_gold_margin_percent",
  stampedGoldMintFeeFixed: "stamped_gold_mint_fee_fixed",
  jewelryDesignFeeFixed: "jewelry_design_fee_fixed",
  dynamicPricingEnabled: "dynamic_pricing_enabled",
  accumulationModeEnabled: "accumulation_mode_enabled",
  proMapPaywallEnabled: "pro_map_paywall_enabled",
  associationFreeAccessEnabled: "association_free_access_enabled",
  minerFreeAccessEnabled: "miner_free_access_enabled",
  bureauAchatPartnerAccessEnabled: "bureau_achat_partner_access_enabled",
} as const;

export type BdoCommerceSettings = {
  defaultCurrency: "XOF" | "USD" | "EUR" | "AED";
  defaultLanguage: "fr" | "en";
  platformGoldMarginPercent: number;
  stampedGoldMintFeeFixed: number;
  jewelryDesignFeeFixed: number;
  dynamicPricingEnabled: boolean;
  accumulationModeEnabled: boolean;
  proMapPaywallEnabled: boolean;
  associationFreeAccessEnabled: boolean;
  minerFreeAccessEnabled: boolean;
  bureauAchatPartnerAccessEnabled: boolean;
};

export const BDO_COMMERCE_DEFAULTS: BdoCommerceSettings = {
  defaultCurrency: "XOF",
  defaultLanguage: "fr",
  platformGoldMarginPercent: 0.05,
  stampedGoldMintFeeFixed: 0,
  jewelryDesignFeeFixed: 0,
  dynamicPricingEnabled: true,
  accumulationModeEnabled: true,
  proMapPaywallEnabled: true,
  associationFreeAccessEnabled: true,
  minerFreeAccessEnabled: true,
  bureauAchatPartnerAccessEnabled: true,
};

function toObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizePercent(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = parsed > 1 ? parsed / 100 : parsed;
  return Math.min(Math.max(normalized, 0), 1);
}

function normalizeMinor(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeCurrency(value: unknown, fallback: BdoCommerceSettings["defaultCurrency"]) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (normalized === "XOF" || normalized === "USD" || normalized === "EUR" || normalized === "AED") {
    return normalized;
  }
  return fallback;
}

function normalizeLanguage(value: unknown, fallback: BdoCommerceSettings["defaultLanguage"]) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "fr" || normalized === "en") return normalized;
  return fallback;
}

function unwrapValue(raw: unknown) {
  const obj = toObject(raw);
  if (!obj) return raw;
  if ("value" in obj) return obj.value;
  if ("enabled" in obj) return obj.enabled;
  if ("percent" in obj) return obj.percent;
  return raw;
}

export async function getBdoCommerceSettings(scope = "tenant:bdo"): Promise<BdoCommerceSettings> {
  const defaults = BDO_COMMERCE_DEFAULTS;
  const [
    defaultCurrencyRaw,
    defaultLanguageRaw,
    platformGoldMarginPercentRaw,
    stampedGoldMintFeeFixedRaw,
    jewelryDesignFeeFixedRaw,
    dynamicPricingEnabledRaw,
    accumulationModeEnabledRaw,
    proMapPaywallEnabledRaw,
    associationFreeAccessEnabledRaw,
    minerFreeAccessEnabledRaw,
    bureauAchatPartnerAccessEnabledRaw,
  ] = await Promise.all([
    getSetting(scope, BDO_COMMERCE_SETTING_KEYS.defaultCurrency, defaults.defaultCurrency).catch(() => defaults.defaultCurrency),
    getSetting(scope, BDO_COMMERCE_SETTING_KEYS.defaultLanguage, defaults.defaultLanguage).catch(() => defaults.defaultLanguage),
    getSetting(scope, BDO_COMMERCE_SETTING_KEYS.platformGoldMarginPercent, defaults.platformGoldMarginPercent).catch(
      () => defaults.platformGoldMarginPercent,
    ),
    getSetting(scope, BDO_COMMERCE_SETTING_KEYS.stampedGoldMintFeeFixed, defaults.stampedGoldMintFeeFixed).catch(
      () => defaults.stampedGoldMintFeeFixed,
    ),
    getSetting(scope, BDO_COMMERCE_SETTING_KEYS.jewelryDesignFeeFixed, defaults.jewelryDesignFeeFixed).catch(
      () => defaults.jewelryDesignFeeFixed,
    ),
    getSetting(scope, BDO_COMMERCE_SETTING_KEYS.dynamicPricingEnabled, defaults.dynamicPricingEnabled).catch(
      () => defaults.dynamicPricingEnabled,
    ),
    getSetting(scope, BDO_COMMERCE_SETTING_KEYS.accumulationModeEnabled, defaults.accumulationModeEnabled).catch(
      () => defaults.accumulationModeEnabled,
    ),
    getSetting(scope, BDO_COMMERCE_SETTING_KEYS.proMapPaywallEnabled, defaults.proMapPaywallEnabled).catch(
      () => defaults.proMapPaywallEnabled,
    ),
    getSetting(scope, BDO_COMMERCE_SETTING_KEYS.associationFreeAccessEnabled, defaults.associationFreeAccessEnabled).catch(
      () => defaults.associationFreeAccessEnabled,
    ),
    getSetting(scope, BDO_COMMERCE_SETTING_KEYS.minerFreeAccessEnabled, defaults.minerFreeAccessEnabled).catch(
      () => defaults.minerFreeAccessEnabled,
    ),
    getSetting(
      scope,
      BDO_COMMERCE_SETTING_KEYS.bureauAchatPartnerAccessEnabled,
      defaults.bureauAchatPartnerAccessEnabled,
    ).catch(() => defaults.bureauAchatPartnerAccessEnabled),
  ]);

  return {
    defaultCurrency: normalizeCurrency(unwrapValue(defaultCurrencyRaw), defaults.defaultCurrency),
    defaultLanguage: normalizeLanguage(unwrapValue(defaultLanguageRaw), defaults.defaultLanguage),
    platformGoldMarginPercent: normalizePercent(unwrapValue(platformGoldMarginPercentRaw), defaults.platformGoldMarginPercent),
    stampedGoldMintFeeFixed: normalizeMinor(unwrapValue(stampedGoldMintFeeFixedRaw), defaults.stampedGoldMintFeeFixed),
    jewelryDesignFeeFixed: normalizeMinor(unwrapValue(jewelryDesignFeeFixedRaw), defaults.jewelryDesignFeeFixed),
    dynamicPricingEnabled: normalizeBoolean(unwrapValue(dynamicPricingEnabledRaw), defaults.dynamicPricingEnabled),
    accumulationModeEnabled: normalizeBoolean(unwrapValue(accumulationModeEnabledRaw), defaults.accumulationModeEnabled),
    proMapPaywallEnabled: normalizeBoolean(unwrapValue(proMapPaywallEnabledRaw), defaults.proMapPaywallEnabled),
    associationFreeAccessEnabled: normalizeBoolean(
      unwrapValue(associationFreeAccessEnabledRaw),
      defaults.associationFreeAccessEnabled,
    ),
    minerFreeAccessEnabled: normalizeBoolean(unwrapValue(minerFreeAccessEnabledRaw), defaults.minerFreeAccessEnabled),
    bureauAchatPartnerAccessEnabled: normalizeBoolean(
      unwrapValue(bureauAchatPartnerAccessEnabledRaw),
      defaults.bureauAchatPartnerAccessEnabled,
    ),
  };
}

export async function saveBdoCommerceSettings(
  scope: string,
  input: Partial<BdoCommerceSettings>,
  actor: string,
): Promise<BdoCommerceSettings> {
  const current = await getBdoCommerceSettings(scope);
  const next: BdoCommerceSettings = {
    defaultCurrency: normalizeCurrency(input.defaultCurrency, current.defaultCurrency),
    defaultLanguage: normalizeLanguage(input.defaultLanguage, current.defaultLanguage),
    platformGoldMarginPercent: normalizePercent(
      input.platformGoldMarginPercent,
      current.platformGoldMarginPercent,
    ),
    stampedGoldMintFeeFixed: normalizeMinor(input.stampedGoldMintFeeFixed, current.stampedGoldMintFeeFixed),
    jewelryDesignFeeFixed: normalizeMinor(input.jewelryDesignFeeFixed, current.jewelryDesignFeeFixed),
    dynamicPricingEnabled: normalizeBoolean(input.dynamicPricingEnabled, current.dynamicPricingEnabled),
    accumulationModeEnabled: normalizeBoolean(input.accumulationModeEnabled, current.accumulationModeEnabled),
    proMapPaywallEnabled: normalizeBoolean(input.proMapPaywallEnabled, current.proMapPaywallEnabled),
    associationFreeAccessEnabled: normalizeBoolean(
      input.associationFreeAccessEnabled,
      current.associationFreeAccessEnabled,
    ),
    minerFreeAccessEnabled: normalizeBoolean(input.minerFreeAccessEnabled, current.minerFreeAccessEnabled),
    bureauAchatPartnerAccessEnabled: normalizeBoolean(
      input.bureauAchatPartnerAccessEnabled,
      current.bureauAchatPartnerAccessEnabled,
    ),
  };

  await Promise.all([
    setSetting(scope, BDO_COMMERCE_SETTING_KEYS.defaultCurrency, next.defaultCurrency, actor),
    setSetting(scope, BDO_COMMERCE_SETTING_KEYS.defaultLanguage, next.defaultLanguage, actor),
    setSetting(scope, BDO_COMMERCE_SETTING_KEYS.platformGoldMarginPercent, next.platformGoldMarginPercent, actor),
    setSetting(scope, BDO_COMMERCE_SETTING_KEYS.stampedGoldMintFeeFixed, next.stampedGoldMintFeeFixed, actor),
    setSetting(scope, BDO_COMMERCE_SETTING_KEYS.jewelryDesignFeeFixed, next.jewelryDesignFeeFixed, actor),
    setSetting(scope, BDO_COMMERCE_SETTING_KEYS.dynamicPricingEnabled, next.dynamicPricingEnabled, actor),
    setSetting(scope, BDO_COMMERCE_SETTING_KEYS.accumulationModeEnabled, next.accumulationModeEnabled, actor),
    setSetting(scope, BDO_COMMERCE_SETTING_KEYS.proMapPaywallEnabled, next.proMapPaywallEnabled, actor),
    setSetting(scope, BDO_COMMERCE_SETTING_KEYS.associationFreeAccessEnabled, next.associationFreeAccessEnabled, actor),
    setSetting(scope, BDO_COMMERCE_SETTING_KEYS.minerFreeAccessEnabled, next.minerFreeAccessEnabled, actor),
    setSetting(
      scope,
      BDO_COMMERCE_SETTING_KEYS.bureauAchatPartnerAccessEnabled,
      next.bureauAchatPartnerAccessEnabled,
      actor,
    ),
  ]);

  return next;
}

export function computeBdoStampedGoldPriceMinor(args: {
  spotPricePerGramMinor: number;
  weightGrams: number;
  marginPercent: number;
  mintFeeMinor?: number;
}) {
  const spot = Math.max(0, Math.round(args.spotPricePerGramMinor));
  const grams = Math.max(0, Number(args.weightGrams) || 0);
  const marginPercent = normalizePercent(args.marginPercent, BDO_COMMERCE_DEFAULTS.platformGoldMarginPercent);
  const mintFeeMinor = Math.max(0, Math.round(Number(args.mintFeeMinor || 0)));
  const subtotal = spot * grams;
  const total = Math.max(0, Math.round(subtotal * (1 + marginPercent)) + mintFeeMinor);
  return {
    totalMinor: total,
    subtotalMinor: subtotal,
    marginPercent,
    mintFeeMinor,
  };
}
