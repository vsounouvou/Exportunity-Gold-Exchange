import { getSetting, setSetting } from "./settings";

export const FX_SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "XOF", "GHS", "NGN", "KES", "AED"] as const;
export type FxCurrency = (typeof FX_SUPPORTED_CURRENCIES)[number];

export type FxRates = Record<FxCurrency, number>;

export type FxSnapshot = {
  base: "USD";
  baseRates: FxRates;
  effectiveRates: FxRates;
  overrides: Partial<FxRates>;
  rates: FxRates;
  updatedAt: string;
  refreshedAt: string;
  providerTimestamp: string;
  isStale: boolean;
  source: string;
  overrideApplied: boolean;
};

type CachedBaseRates = {
  rates: FxRates;
  refreshedAt: number;
  providerTimestamp: string;
  source: string;
};

const FX_PROVIDER_URL = String(process.env.FX_PROVIDER_URL || "https://open.er-api.com/v6/latest/USD").trim();
const FX_CACHE_DURATION_MS = Number(process.env.FX_CACHE_DURATION_MS || 30 * 60_000);
const FX_STALE_AFTER_MS = Number(process.env.FX_STALE_AFTER_MS || 2 * 60 * 60_000);
const LAST_KNOWN_GOOD_SCOPE = "global";
const LAST_KNOWN_GOOD_KEY = "fx.base.last_known_good";

const FALLBACK_RATES: FxRates = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  XOF: 615.5,
  GHS: 12.5,
  NGN: 1500,
  KES: 128,
  AED: 3.67,
};

let cachedBaseRates: CachedBaseRates | null = null;

function safeNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeFxRates(input: unknown, fallback: FxRates): FxRates {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out = { ...fallback };
  for (const currency of FX_SUPPORTED_CURRENCIES) {
    if (currency === "USD") {
      out.USD = 1;
      continue;
    }
    const next = safeNumber(src[currency]);
    if (next != null) out[currency] = next;
  }
  return out;
}

function normalizeFxOverrides(input: unknown): Partial<FxRates> {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Partial<FxRates> = {};
  for (const currency of FX_SUPPORTED_CURRENCIES) {
    if (currency === "USD") continue;
    const next = safeNumber(src[currency]);
    if (next != null) out[currency] = next;
  }
  return out;
}

export function mergeEffectiveFxRates(baseRates: FxRates, overrides: Partial<FxRates>): FxRates {
  const effectiveRates: FxRates = { ...baseRates };
  for (const currency of FX_SUPPORTED_CURRENCIES) {
    if (currency === "USD") {
      effectiveRates.USD = 1;
      continue;
    }
    if (overrides[currency] != null) {
      effectiveRates[currency] = Number(overrides[currency]);
    }
  }
  return effectiveRates;
}

async function fetchProviderRates(): Promise<CachedBaseRates> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 6_000) : null;
  try {
    const res = await fetch(FX_PROVIDER_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller?.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as any;
    const normalized = normalizeFxRates(data?.rates, FALLBACK_RATES);
    const providerTimestamp = data?.time_last_update_unix
      ? new Date(Number(data.time_last_update_unix) * 1000).toISOString()
      : new Date().toISOString();
    return {
      rates: normalized,
      refreshedAt: Date.now(),
      providerTimestamp,
      source: "open.er-api",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readLastKnownGood(): Promise<CachedBaseRates | null> {
  const stored = await getSetting<any>(LAST_KNOWN_GOOD_SCOPE, LAST_KNOWN_GOOD_KEY, null).catch(() => null);
  if (!stored || typeof stored !== "object") return null;
  const rates = normalizeFxRates((stored as any).rates, FALLBACK_RATES);
  const providerTimestamp = String((stored as any).providerTimestamp || "").trim() || new Date().toISOString();
  const refreshedAt = safeNumber((stored as any).refreshedAt) || Date.now();
  return {
    rates,
    providerTimestamp,
    refreshedAt,
    source: String((stored as any).source || "last_known_good"),
  };
}

async function persistLastKnownGood(snapshot: CachedBaseRates) {
  await setSetting(
    LAST_KNOWN_GOOD_SCOPE,
    LAST_KNOWN_GOOD_KEY,
    {
      rates: snapshot.rates,
      providerTimestamp: snapshot.providerTimestamp,
      refreshedAt: snapshot.refreshedAt,
      source: snapshot.source,
    },
    "fx-service",
  ).catch(() => undefined);
}

async function getBaseRates(options?: { forceRefresh?: boolean }): Promise<CachedBaseRates> {
  const forceRefresh = Boolean(options?.forceRefresh);
  if (!forceRefresh && cachedBaseRates && Date.now() - cachedBaseRates.refreshedAt < FX_CACHE_DURATION_MS) {
    return cachedBaseRates;
  }

  try {
    const fetched = await fetchProviderRates();
    cachedBaseRates = fetched;
    void persistLastKnownGood(fetched);
    return fetched;
  } catch {
    if (cachedBaseRates) return cachedBaseRates;

    const lastKnownGood = await readLastKnownGood();
    if (lastKnownGood) {
      cachedBaseRates = lastKnownGood;
      return lastKnownGood;
    }

    const fallback: CachedBaseRates = {
      rates: { ...FALLBACK_RATES },
      refreshedAt: Date.now(),
      providerTimestamp: new Date().toISOString(),
      source: "fallback",
    };
    cachedBaseRates = fallback;
    return fallback;
  }
}

export function tenantFxScopeFromRequest(req: any): string {
  const tenantKey = String(req?.tenant?.key || "")
    .trim()
    .toLowerCase();
  if (tenantKey) return `tenant:${tenantKey}`;
  const tenantId = safeNumber(req?.tenant?.id);
  if (tenantId != null) return `tenant:${Math.trunc(tenantId)}`;
  return "tenant:default";
}

export async function getFxSnapshot(scope: string, options?: { forceRefresh?: boolean }): Promise<FxSnapshot> {
  const base = await getBaseRates(options);
  const overridesRaw = await getSetting<any>(scope, "fx.overrides", {}).catch(() => ({}));
  const overrides = normalizeFxOverrides(overridesRaw);

  const effectiveRates = mergeEffectiveFxRates(base.rates, overrides);

  const providerTime = new Date(base.providerTimestamp).getTime();
  const freshnessBase = Number.isFinite(providerTime) ? providerTime : base.refreshedAt;
  const isStale = Date.now() - freshnessBase > FX_STALE_AFTER_MS;

  return {
    base: "USD",
    baseRates: { ...base.rates },
    effectiveRates,
    overrides,
    rates: effectiveRates,
    updatedAt: new Date(base.refreshedAt).toISOString(),
    refreshedAt: new Date(base.refreshedAt).toISOString(),
    providerTimestamp: base.providerTimestamp,
    isStale,
    source: base.source,
    overrideApplied: Object.keys(overrides).length > 0,
  };
}

export function normalizeAndValidateOverrides(
  overridesRaw: unknown,
  baseRates: FxRates,
  options?: { maxDriftPercent?: number },
): Partial<FxRates> {
  const normalized = normalizeFxOverrides(overridesRaw);
  const maxDriftPercent = Number.isFinite(options?.maxDriftPercent as number)
    ? Number(options?.maxDriftPercent)
    : Number(process.env.FX_OVERRIDE_MAX_DRIFT_PERCENT || 50);

  for (const [currency, value] of Object.entries(normalized)) {
    const code = currency as FxCurrency;
    const base = Number(baseRates[code]);
    if (!Number.isFinite(base) || base <= 0) {
      throw new Error(`Missing base rate for ${code}`);
    }
    if (!Number.isFinite(value as number) || Number(value) <= 0) {
      throw new Error(`Invalid override for ${code}`);
    }
    if (Number.isFinite(maxDriftPercent) && maxDriftPercent > 0) {
      const drift = (Math.abs(Number(value) - base) / base) * 100;
      if (drift > maxDriftPercent) {
        throw new Error(`${code} override drift ${drift.toFixed(2)}% exceeds limit ${maxDriftPercent}%`);
      }
    }
  }

  return normalized;
}

export function getUsdConversionRateForCurrency(rates: FxRates, currency: string): number {
  const code = String(currency || "USD").trim().toUpperCase();
  if (code === "USD") return 1;
  if ((FX_SUPPORTED_CURRENCIES as readonly string[]).includes(code)) {
    const value = Number((rates as any)[code]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  throw new Error(`Unsupported currency: ${code}`);
}
