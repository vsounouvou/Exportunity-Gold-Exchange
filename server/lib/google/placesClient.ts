import { assertGooglePlacesImportAllowed, getGooglePlacesImportLimits } from "./placeImportLimiter";
import { getSavedGooglePlacesSettings } from "./placesSettings";

const PLACES_BASE = "https://places.googleapis.com/v1";

const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.businessStatus",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.rating",
  "places.userRatingCount",
  "places.primaryType",
  "places.types",
  "places.regularOpeningHours",
].join(",");

const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "businessStatus",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "googleMapsUri",
  "rating",
  "userRatingCount",
  "primaryType",
  "types",
  "regularOpeningHours",
  "photos",
].join(",");

export type GooglePlacesConfig = {
  enabled: boolean;
  apiKeyPresent: boolean;
  browserMapKeyPresent: boolean;
  mapIdPresent: boolean;
  placesApiKey?: string;
  browserMapKey?: string;
  mapId?: string;
  mapIdLight?: string;
  mapIdDark?: string;
  defaultCountry: string;
  defaultCity: string;
  defaultLanguage: string;
  radiusMeters: number;
  dailyImportLimit: number;
  rateLimitPerMinute: number;
  source: "environment" | "admin_settings" | "none";
};

export function getGooglePlacesConfig(): GooglePlacesConfig {
  const placesKey = String(process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "").trim();
  const browserMapKey = String(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_BROWSER_API_KEY || "").trim();
  const mapId = String(process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || process.env.GOOGLE_MAPS_MAP_ID || process.env.GOOGLE_MAPS_MAP_ID_LIGHT || "").trim();
  const mapIdDark = String(process.env.NEXT_PUBLIC_GOOGLE_MAP_ID_DARK || process.env.GOOGLE_MAPS_MAP_ID_DARK || mapId || "").trim();
  const enabledFlag = String(process.env.GOOGLE_IMPORT_ENABLED ?? process.env.GOOGLE_PLACES_ENABLED ?? "false").toLowerCase();
  return {
    enabled: enabledFlag === "true" && !!placesKey,
    apiKeyPresent: !!placesKey,
    browserMapKeyPresent: !!browserMapKey,
    mapIdPresent: !!mapId,
    placesApiKey: placesKey || undefined,
    browserMapKey: browserMapKey || undefined,
    mapId: mapId || undefined,
    mapIdLight: mapId || undefined,
    mapIdDark: mapIdDark || undefined,
    defaultCountry: String(process.env.GOOGLE_PLACES_DEFAULT_COUNTRY || "CI").trim(),
    defaultCity: String(process.env.GOOGLE_PLACES_DEFAULT_CITY || "Abidjan").trim(),
    defaultLanguage: String(process.env.GOOGLE_PLACES_DEFAULT_LANGUAGE || "fr").trim(),
    radiusMeters: Math.max(250, Number(process.env.GOOGLE_PLACES_SEARCH_RADIUS_METERS || 7500)),
    dailyImportLimit: Math.max(1, Number(process.env.GOOGLE_PLACES_DAILY_IMPORT_LIMIT || 500)),
    rateLimitPerMinute: Math.max(1, Number(process.env.GOOGLE_PLACES_RATE_LIMIT_PER_MINUTE || 20)),
    source: placesKey || browserMapKey || mapId ? "environment" : "none",
  };
}

export async function getGooglePlacesRuntimeConfig(scope?: string): Promise<GooglePlacesConfig> {
  const env = getGooglePlacesConfig();
  if (env.enabled || !scope) return env;
  const saved = await getSavedGooglePlacesSettings(scope);
  const placesApiKey = String(saved.placesApiKey || "").trim();
  const browserMapKey = String(saved.browserApiKey || "").trim();
  const mapId = String(saved.mapId || saved.mapIdLight || "").trim();
  const mapIdDark = String(saved.mapIdDark || mapId || "").trim();
  const savedEnabled = Boolean(saved.enabled);
  return {
    enabled: savedEnabled && Boolean(placesApiKey),
    apiKeyPresent: Boolean(placesApiKey),
    browserMapKeyPresent: Boolean(browserMapKey),
    mapIdPresent: Boolean(mapId),
    placesApiKey: placesApiKey || undefined,
    browserMapKey: browserMapKey || undefined,
    mapId: mapId || undefined,
    mapIdLight: mapId || undefined,
    mapIdDark: mapIdDark || undefined,
    defaultCountry: String(saved.defaultCountry || env.defaultCountry || "CI").trim(),
    defaultCity: String(saved.defaultCity || env.defaultCity || "Abidjan").trim(),
    defaultLanguage: String(saved.defaultLanguage || env.defaultLanguage || "fr").trim(),
    radiusMeters: Math.max(250, Number(saved.radiusMeters || env.radiusMeters || 7500)),
    dailyImportLimit: Math.max(1, Number(saved.dailyImportLimit || env.dailyImportLimit || 500)),
    rateLimitPerMinute: Math.max(1, Number(saved.rateLimitPerMinute || env.rateLimitPerMinute || 20)),
    source: placesApiKey || browserMapKey || mapId ? "admin_settings" : env.source,
  };
}

async function googlePlacesFetch(path: string, input: { method?: string; body?: Record<string, unknown>; fieldMask: string; scope?: string }) {
  const cfg = await getGooglePlacesRuntimeConfig(input.scope);
  const apiKey = cfg.placesApiKey || "";
  if (!apiKey) {
    const error = new Error("Google Places API key is not configured");
    (error as any).statusCode = 424;
    throw error;
  }
  const enabledFlag = String(process.env.GOOGLE_IMPORT_ENABLED ?? process.env.GOOGLE_PLACES_ENABLED ?? "false").toLowerCase();
  if (cfg.source === "environment" && enabledFlag !== "true") {
    const error = new Error("Google Places integration is disabled");
    (error as any).statusCode = 424;
    throw error;
  }
  if (cfg.source === "admin_settings" && !cfg.enabled) {
    const error = new Error("Google Places integration is disabled in admin settings");
    (error as any).statusCode = 424;
    throw error;
  }

  assertGooglePlacesImportAllowed("places");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${PLACES_BASE}${path}`, {
      method: input.method || "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": input.fieldMask,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const error = new Error(data?.error?.message || data?.message || `Google Places request failed with ${response.status}`);
      (error as any).statusCode = response.status;
      (error as any).details = data;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function googleTextSearch(input: { query: string; city?: string; country?: string; limit?: number; scope?: string }) {
  const cfg = await getGooglePlacesRuntimeConfig(input.scope);
  const query = [input.query, input.city, input.country].filter(Boolean).join(" ").trim();
  if (!query) throw new Error("query is required");
  const data = await googlePlacesFetch("/places:searchText", {
    scope: input.scope,
    fieldMask: SEARCH_FIELD_MASK,
    body: {
      textQuery: query,
      maxResultCount: Math.min(Math.max(Number(input.limit || 20), 1), 20),
      languageCode: cfg.defaultLanguage || "fr",
      regionCode: input.country || cfg.defaultCountry,
    },
  });
  return Array.isArray(data?.places) ? data.places : [];
}

export async function googleNearbySearch(input: {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  includedTypes?: string[];
  limit?: number;
  scope?: string;
}) {
  const cfg = await getGooglePlacesRuntimeConfig(input.scope);
  const includedTypes = Array.isArray(input.includedTypes) ? input.includedTypes.filter(Boolean).slice(0, 8) : [];
  const body: Record<string, unknown> = {
    maxResultCount: Math.min(Math.max(Number(input.limit || 20), 1), 20),
    locationRestriction: {
      circle: {
        center: { latitude: input.latitude, longitude: input.longitude },
        radius: Math.min(Math.max(Number(input.radiusMeters || cfg.radiusMeters), 250), 50_000),
      },
    },
  };
  if (includedTypes.length) body.includedTypes = includedTypes;

  const data = await googlePlacesFetch("/places:searchNearby", {
    scope: input.scope,
    fieldMask: SEARCH_FIELD_MASK,
    body,
  });
  return Array.isArray(data?.places) ? data.places : [];
}

export async function googlePlaceDetails(placeId: string, scope?: string) {
  const id = String(placeId || "").trim();
  if (!id) throw new Error("placeId is required");
  return googlePlacesFetch(`/places/${encodeURIComponent(id)}`, {
    scope,
    method: "GET",
    fieldMask: DETAILS_FIELD_MASK,
  });
}

export async function googlePlacesRuntimeStatus(scope?: string) {
  const cfg = await getGooglePlacesRuntimeConfig(scope);
  return {
    ...cfg,
    provider: cfg.enabled ? "google_places" : "seeded",
    limits: getGooglePlacesImportLimits("places"),
    setupRequired: !cfg.enabled,
    requiredEnv: [
      "GOOGLE_IMPORT_ENABLED=true or GOOGLE_PLACES_ENABLED=true",
      "GOOGLE_PLACES_API_KEY",
      "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_BROWSER_API_KEY",
      "NEXT_PUBLIC_GOOGLE_MAP_ID or GOOGLE_MAPS_MAP_ID",
      "GOOGLE_PLACES_DEFAULT_COUNTRY",
      "GOOGLE_PLACES_DEFAULT_LANGUAGE",
      "GOOGLE_PLACES_DEFAULT_CITY",
      "GOOGLE_PLACES_SEARCH_RADIUS_METERS",
      "GOOGLE_PLACES_DAILY_QUOTA_SOFT_LIMIT",
      "GOOGLE_PLACES_DAILY_IMPORT_LIMIT",
      "GOOGLE_PLACES_RATE_LIMIT_PER_MINUTE",
      "STREET_VIEW_ENABLED",
    ],
  };
}
