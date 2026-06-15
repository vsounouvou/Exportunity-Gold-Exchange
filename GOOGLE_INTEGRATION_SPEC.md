# Google Maps and Places Integration Spec

## Required Environment Variables

- `GOOGLE_MAPS_API_KEY` server or browser key, depending on deployment restrictions.
- `GOOGLE_PLACES_API_KEY` preferred server-restricted key for Places API.
- `GOOGLE_MAPS_BROWSER_API_KEY` optional browser-restricted Maps JavaScript key.
- `GOOGLE_MAPS_MAP_ID` or `GOOGLE_MAP_ID_LIGHT` browser map ID for Advanced Markers/styling.
- `GOOGLE_PLACES_ENABLED=true`
- `GOOGLE_PLACES_IMPORT_ENABLED=true`
- `GOOGLE_PLACES_DEFAULT_COUNTRY=CI`
- `GOOGLE_PLACES_DEFAULT_CITY=Abidjan`
- `GOOGLE_PLACES_SEARCH_RADIUS_METERS`
- `GOOGLE_PLACES_DAILY_IMPORT_LIMIT`
- `GOOGLE_PLACES_RATE_LIMIT_PER_MINUTE`

## Required Server Services

- `server/lib/google/placesClient.ts`
- `server/lib/google/placesMapper.ts`
- `server/lib/google/placeEnrichment.ts`
- `server/lib/google/placeImportLimiter.ts`

## API Rules

- Use official Google Places APIs only.
- Do not scrape Google.
- Use Text Search, Nearby Search, Place Details, and Place Photos.
- Use field masks; never request wildcard fields in production.
- Store `google_place_id` as the durable dedupe key.
- Dedupe by place id, phone, website, normalized name, and normalized address.
- Cache Places results using the configured TTL and respect Google attribution requirements.

## Public Frontend Contract

- `/api/maps/public-config` returns only browser-safe map configuration.
- `/api/places/nearby` returns normalized public business records.
- No unrestricted server key is ever exposed to the browser.
- Google Maps rendering and Google Places import are separate. A browser key plus map ID can render Google Maps with curated city markers before server Places import is enabled.

## Current Implementation

- `server/routes/places.ts` implements public config and nearby discovery.
- `server/routes/admin-pme-exchange.ts` implements admin Google test search and Place Details tests.
- `server/lib/google/placesClient.ts` merges environment and saved admin settings by scope, uses field masks, and applies in-memory rate/day limiting.
- If Google is disabled or fails, API responses return curated Abidjan/Cotonou business data with `setupRequired`.
- Current live config has a browser key present, no Map ID, and no server Places key/import flag, so Leaflet/OpenStreetMap plus curated data is the correct live fallback.
- Curated fallback search includes commerce intent matching for breakfast, bread, coffee, groceries, pharmacy, building materials, cement, wholesale suppliers, machinery, packaging, agricultural inputs, logistics, cold storage, manufacturers, and textiles.

## Remaining Gap

- Durable Places cache with TTL is not yet implemented.
- Place Photos are available through Details helpers but not yet rendered in the PME admin map/table.
