# Exportunity Audit Report

Date: 2026-06-15

## Scope

This audit covers the Exportunity marketplace entry, route wiring, map/commerce component, Google Places surface, WhatsApp/Twilio surface, agent/task foundations, and deployment path visible in this repository.

## Current Architecture Observed

- `/marketplace`, `/map`, `/marketplace/map`, `/wholesale`, and `/ready-for-export` route through `StoreRoute` in `client/src/App.tsx`.
- `StoreRoute` passes `initialSpace` and `shellMode` into `StorePage`, then `ZoneInterface`, then `BuyerHomePage`.
- `BuyerHomePage` now renders `ExportunityNeighbourhoodCommerce` for the Exportunity commerce routes.
- Legacy `ExportunityConversationalCommerce` remains in the codebase as fallback and type source.
- Seeded business data exists in `client/src/components/exportunity/seededBusinessData.ts`.
- PME Exchange now has a backend vertical slice: schema, migration, server-side Google Places client, public places endpoint, admin PME routes, and an admin control page.

## Findings

1. Marketplace UX was too map-first for buyer intent. The live route now uses a product-first center, contextual map, and fixed assistant/shop-agent pane.
2. `/api/maps/public-config` and `/api/places/nearby` are now backed by `server/routes/places.ts`, using Google Places when configured and curated city data otherwise.
3. Wholesale and Ready for export are routeable states; the backend stores PME/seller leads and drafts outreach campaigns, but deeper supplier quote automation remains staged behind approval.
4. WhatsApp/Twilio code exists, including webhook and production messaging tests; PME outreach drafts are created with approval required and no automatic blast path.
5. The agent system has task/action foundations. The PME Acquisition Agent context is represented in workflow and docs, but deeper autonomous reply handling still needs production hardening.
6. Retail shop selection now hands context to the shop Front Desk and the full shop view prioritizes product shelves, quantity controls, the order panel, owner/trust proof, and `Place order`.

## Files Changed In This Pass

- `client/src/components/exportunity/ExportunityNeighbourhoodCommerce.tsx`
- `client/src/pages/BuyerHomePage.tsx`
- `client/src/pages/AdminPmeExchangePage.tsx`
- `server/routes/admin-pme-exchange.ts`
- `server/routes/places.ts`
- `server/lib/google/placesClient.ts`
- `server/lib/google/placesMapper.ts`
- `server/lib/google/placeEnrichment.ts`
- `server/lib/google/placeImportLimiter.ts`
- `server/lib/pme-exchange/repository.ts`
- `server/lib/pme-exchange/seed.ts`
- `db/schema/pme-exchange.ts`
- `db/migrations/20270317_pme_exchange.sql`
- Audit and release docs listed in the release checklist.

## Verification

- `npm run check` passed after the current marketplace/shop changes.
- Live build `1781556326659` / git `e37ed6552d03` was deployed to `https://exportunity.net`.
- Live smoke check confirmed `/marketplace`, `/map`, `/wholesale`, and `/ready-for-export` render interactive Leaflet/OpenStreetMap maps with curated markers while Google setup is incomplete.
- Live API smoke confirmed seeded fallback searches return relevant results for `breakfast`, `bread`, mixed marketplace categories, `cement`, and wholesale supplier queries.
- Live smoke check confirmed shop entry shows product shelves, quantity controls, order panel, owner/trust layer, and the shop Front Desk agent; `Quick add` public wording was removed.

## Remaining Risks

- Google Places requires server env configuration before live Google business discovery is active; otherwise the platform intentionally uses curated city data.
- Current live config has a browser key present, but no Google Map ID and no server Places key/import flag. Google Maps will not visibly render until a browser-restricted key plus Map ID are configured; official Places import additionally requires the server Places key and enable flag.
- Public investment/royalty features remain internal-review-only until legal/compliance approval.
- Automated Twilio/WhatsApp sending is not enabled from PME campaigns; drafts require approval and existing Twilio setup.
- Live visual verification and deployment smoke checks must be run after build/deploy.
