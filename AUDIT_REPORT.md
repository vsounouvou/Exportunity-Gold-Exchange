# Exportunity Audit Report

Date: 2026-06-14

## Scope

This audit covers the Exportunity marketplace entry, route wiring, map/commerce component, Google Places surface, WhatsApp/Twilio surface, agent/task foundations, and deployment path visible in this repository.

## Current Architecture Observed

- `/marketplace`, `/map`, `/marketplace/map`, `/wholesale`, `/pme-exchange`, and `/ready-for-export` route through `StoreRoute` in `client/src/App.tsx`.
- `StoreRoute` passes `initialSpace` and `shellMode` into `StorePage`, then `ZoneInterface`, then `BuyerHomePage`.
- `BuyerHomePage` now renders `ExportunityNeighbourhoodCommerce` for the Exportunity commerce routes.
- Legacy `ExportunityConversationalCommerce` remains in the codebase as fallback and type source.
- Seeded business data exists in `client/src/components/exportunity/seededBusinessData.ts`.
- PME Exchange now has a backend vertical slice: schema, migration, server-side Google Places client, public places endpoint, admin PME routes, and an admin control page.

## Findings

1. Marketplace UX was too map-first for buyer intent. The live route now uses a product-first center, left Tassi/shop-agent pane, and right contextual map.
2. `/api/maps/public-config` and `/api/places/nearby` are now backed by `server/routes/places.ts`, using Google Places when configured and curated city data otherwise.
3. Wholesale and Bourse de PME are routeable states; the backend now stores PME leads and drafts outreach campaigns, but deeper supplier quote automation remains staged behind approval.
4. WhatsApp/Twilio code exists, including webhook and production messaging tests; PME outreach drafts are created with approval required and no automatic blast path.
5. The agent system has task/action foundations. The PME Acquisition Agent context is represented in workflow and docs, but deeper autonomous reply handling still needs production hardening.

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

- `npm run check` passed after the new shell was added.
- Live build `1781491358250` was deployed to `https://exportunity.net`.
- Live smoke check confirmed `/marketplace`, `/map`, `/wholesale`, and `/pme-exchange` render interactive OpenStreetMap/Leaflet maps with curated markers when Google Maps is rejected.
- Live smoke check confirmed shop entry shows `PRODUCTS INSIDE SHOP`, quantity controls, order panel, owner/trust layer, and the shop Front Desk agent.

## Remaining Risks

- Google Places requires server env configuration before live Google business discovery is active; otherwise the platform intentionally uses curated city data.
- The live browser Google Maps key currently returns `InvalidKeyMapError`; the UI falls back safely, but Google Maps will not visibly render until the key/API/domain configuration is corrected in Google Cloud.
- Public investment/royalty features remain internal-review-only until legal/compliance approval.
- Automated Twilio/WhatsApp sending is not enabled from PME campaigns; drafts require approval and existing Twilio setup.
- Live visual verification and deployment smoke checks must be run after build/deploy.
