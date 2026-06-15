import { Router } from "express";

import { enrichPmeLeads } from "../lib/google/placeEnrichment";
import { googlePlacesRuntimeStatus, googleTextSearch } from "../lib/google/placesClient";
import { mapGooglePlacesToPmeLeads } from "../lib/google/placesMapper";
import { resolveGoogleSettingsScope } from "../lib/google/placesSettings";
import { filterSeedPmeLeads } from "../lib/pme-exchange/seed";

const router = Router();

function toPublicPlace(lead: any) {
  return {
    id: lead.googlePlaceId || lead.id,
    name: lead.name,
    category: lead.category,
    type: lead.kind || "marketplace",
    city: lead.city,
    district: lead.district || lead.metadata?.district || null,
    lat: Number(lead.latitude),
    lng: Number(lead.longitude),
    address: lead.address,
    phone: lead.phone,
    website: lead.website,
    rating: Number(lead.rating || 0),
    reviewCount: Number(lead.reviewCount || 0),
    openStatus: lead.openingHours?.openNow === false ? "Contact first" : "Open now",
    verificationStatus: lead.source === "google_places" ? "Public listing" : lead.verificationStatus || "Curated signal",
    contactStatus: lead.contactStatus || "contact_required",
    source: lead.source === "google_places" ? "google" : "curated",
    moq: lead.moq || lead.metadata?.moq || undefined,
    leadTime: lead.leadTime || lead.metadata?.leadTime || undefined,
  };
}

function publicGoogleStatus(status: any) {
  return {
    enabled: Boolean(status.enabled),
    provider: status.provider,
    source: status.source,
    placesApiKeyPresent: Boolean(status.apiKeyPresent),
    browserApiKeyPresent: Boolean(status.browserMapKeyPresent),
    mapIdPresent: Boolean(status.mapIdPresent),
    mapId: status.mapId || null,
    setupRequired: Boolean(status.setupRequired),
    placesSetupRequired: Boolean(status.placesSetupRequired),
    mapSetupRequired: Boolean(status.mapSetupRequired),
    advancedMapSetupRequired: Boolean(status.advancedMapSetupRequired),
    requiredEnv: status.requiredEnv,
    limits: status.limits,
  };
}

async function getPublicMapsConfig(req?: any) {
  const status = await googlePlacesRuntimeStatus(resolveGoogleSettingsScope(req));
  const browserApiKey = String(status.browserMapKey || "").trim();
  const mapIdLight = String(status.mapIdLight || status.mapId || "").trim();
  const mapIdDark = String(status.mapIdDark || status.mapId || mapIdLight || "").trim();
  const canRenderGoogleMap = Boolean(browserApiKey);
  return {
    provider: canRenderGoogleMap ? "google" : "leaflet",
    enabled: canRenderGoogleMap,
    browserApiKey: canRenderGoogleMap ? browserApiKey : null,
    mapRenderer: canRenderGoogleMap ? "google_maps" : "leaflet_openstreetmap",
    businessDataProvider: status.enabled ? "google_places" : "curated_city_data",
    placesImportEnabled: status.enabled,
    mapId: mapIdLight || null,
    mapIdLight: mapIdLight || null,
    mapIdDark: mapIdDark || null,
    google: publicGoogleStatus(status),
    fallback: "leaflet_openstreetmap",
    message: canRenderGoogleMap
      ? status.enabled
        ? "Google Maps can render in the browser and Google Places is configured for public business discovery."
        : mapIdLight
          ? "Google Maps can render in the browser with curated city business markers. Add GOOGLE_PLACES_API_KEY and enable Google Places import when you are ready to use official live business discovery."
          : "Google Maps can render in the browser with default styling and curated city business markers. Add a Google Map ID for cloud styling and Advanced Markers; add GOOGLE_PLACES_API_KEY for official live business discovery."
      : "Google Maps renderer setup is incomplete. Leaflet/OpenStreetMap and curated Abidjan/Cotonou data are active until a browser-safe Maps key is configured; Places import additionally requires a server Places key.",
  };
}

router.get("/api/maps/public-config", (_req, res) => {
  getPublicMapsConfig(_req).then((config) => res.json(config)).catch((err) => res.status(500).json({ message: err?.message || "Failed to load maps config" }));
});

router.get("/api/places/config", (_req, res) => {
  getPublicMapsConfig(_req).then((config) => res.json(config)).catch((err) => res.status(500).json({ message: err?.message || "Failed to load Places config" }));
});

router.get("/api/places/nearby", async (req, res) => {
  const city = String(req.query.city || "Abidjan").trim();
  const kind = String(req.query.type || req.query.kind || "marketplace").trim();
  const query = String(req.query.q || req.query.query || "").trim();
  const limit = Math.min(Math.max(Number(req.query.limit || 40), 1), 80);
  const scope = resolveGoogleSettingsScope(req);
  const status = await googlePlacesRuntimeStatus(scope);

  if (status.enabled) {
    try {
      const googlePlaces = await googleTextSearch({
        scope,
        query: query || (kind === "wholesale" ? "wholesale supplier distributor warehouse logistics" : "bakery cafe grocery pharmacy hardware store"),
        city,
        country: status.defaultCountry,
        limit: Math.min(limit, 20),
      });
      const leads = enrichPmeLeads(mapGooglePlacesToPmeLeads(googlePlaces, { city, country: status.defaultCountry }));
      return res.json({
        ok: true,
        provider: "google",
        items: leads.map(toPublicPlace),
        lastSyncTime: new Date().toISOString(),
        message: "Google Places returned public business listings. Inventory still requires merchant verification.",
      });
    } catch (err: any) {
      return res.json({
        ok: true,
        provider: "curated",
        items: filterSeedPmeLeads({ city, kind, query, limit }).map(toPublicPlace),
        message: err?.message || "Google Places failed; curated city data is active.",
        google: { attempted: true, error: err?.statusCode || "places_error" },
      });
    }
  }

  return res.json({
    ok: true,
    provider: "curated",
    items: filterSeedPmeLeads({ city, kind, query, limit }).map(toPublicPlace),
    message: "Google Places is not configured. Curated Abidjan/Cotonou city data is active.",
    setupRequired: true,
    requiredEnv: status.requiredEnv,
  });
});

export default router;
