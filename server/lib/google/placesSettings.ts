import { getSetting, setSetting } from "../settings";

export const GOOGLE_PLACES_SETTINGS_KEY = "integrations.google_places";

export type GooglePlacesSavedSettings = {
  enabled?: boolean;
  placesApiKey?: string;
  browserApiKey?: string;
  mapId?: string;
  mapIdLight?: string;
  mapIdDark?: string;
  defaultCountry?: string;
  defaultCity?: string;
  defaultLanguage?: string;
  radiusMeters?: number;
  dailyImportLimit?: number;
  rateLimitPerMinute?: number;
  updatedAt?: string;
};

export function resolveGoogleSettingsScope(req: any) {
  const tenantKey = String(req?.tenant?.key || "").trim().toLowerCase();
  if (tenantKey) return `tenant:${tenantKey}`;
  const tenantId = Number(req?.tenant?.id || 0);
  if (Number.isFinite(tenantId) && tenantId > 0) return `tenant:${Math.trunc(tenantId)}`;
  return "tenant:exportunity";
}

export function maskSecret(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.length <= 10) return "configured";
  return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
}

function cleanString(value: unknown) {
  return String(value || "").trim();
}

function cleanPositiveNumber(value: unknown, fallback?: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

export async function getSavedGooglePlacesSettings(scope: string): Promise<GooglePlacesSavedSettings> {
  return (await getSetting<GooglePlacesSavedSettings>(scope, GOOGLE_PLACES_SETTINGS_KEY, {})) || {};
}

export async function saveGooglePlacesSettings(scope: string, input: Record<string, unknown>, updatedBy?: string) {
  const existing = await getSavedGooglePlacesSettings(scope);
  const keepSecret = (next: unknown, previous?: string) => {
    const value = cleanString(next);
    if (!value || /^(\*+|configured)$/i.test(value)) return previous || "";
    return value;
  };
  const settings: GooglePlacesSavedSettings = {
    ...existing,
    enabled: Boolean(input.enabled),
    placesApiKey: keepSecret(input.placesApiKey, existing.placesApiKey),
    browserApiKey: keepSecret(input.browserApiKey, existing.browserApiKey),
    mapId: cleanString(input.mapId) || existing.mapId || "",
    mapIdLight: cleanString(input.mapIdLight) || cleanString(input.mapId) || existing.mapIdLight || existing.mapId || "",
    mapIdDark: cleanString(input.mapIdDark) || cleanString(input.mapId) || existing.mapIdDark || existing.mapId || "",
    defaultCountry: cleanString(input.defaultCountry) || existing.defaultCountry || "CI",
    defaultCity: cleanString(input.defaultCity) || existing.defaultCity || "Abidjan",
    defaultLanguage: cleanString(input.defaultLanguage) || existing.defaultLanguage || "fr",
    radiusMeters: cleanPositiveNumber(input.radiusMeters, existing.radiusMeters || 7500),
    dailyImportLimit: cleanPositiveNumber(input.dailyImportLimit, existing.dailyImportLimit || 500),
    rateLimitPerMinute: cleanPositiveNumber(input.rateLimitPerMinute, existing.rateLimitPerMinute || 20),
    updatedAt: new Date().toISOString(),
  };
  await setSetting(scope, GOOGLE_PLACES_SETTINGS_KEY, settings, updatedBy);
  return settings;
}

export function publicGooglePlacesSettings(settings: GooglePlacesSavedSettings) {
  return {
    enabled: Boolean(settings.enabled),
    placesApiKeyPresent: Boolean(settings.placesApiKey),
    browserApiKeyPresent: Boolean(settings.browserApiKey),
    mapIdPresent: Boolean(settings.mapId || settings.mapIdLight),
    placesApiKeyMasked: maskSecret(settings.placesApiKey),
    browserApiKeyMasked: maskSecret(settings.browserApiKey),
    mapId: settings.mapId || settings.mapIdLight || null,
    mapIdLight: settings.mapIdLight || settings.mapId || null,
    mapIdDark: settings.mapIdDark || settings.mapId || null,
    defaultCountry: settings.defaultCountry || "CI",
    defaultCity: settings.defaultCity || "Abidjan",
    defaultLanguage: settings.defaultLanguage || "fr",
    radiusMeters: settings.radiusMeters || 7500,
    dailyImportLimit: settings.dailyImportLimit || 500,
    rateLimitPerMinute: settings.rateLimitPerMinute || 20,
    updatedAt: settings.updatedAt || null,
  };
}
