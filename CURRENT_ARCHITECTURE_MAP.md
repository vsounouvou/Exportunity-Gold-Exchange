# Current Architecture Map

## Buyer Routes

- `client/src/App.tsx`
  - `/marketplace` -> Exportunity retail commerce shell
  - `/map` and `/marketplace/map` -> same shell with map-dominant mode
  - `/wholesale` -> wholesale supplier context
  - `/pme-exchange` and `/ready-for-export` -> Bourse de PME / ready-for-export context
- `client/src/pages/store/StorePage.tsx` passes route state into `ZoneInterface`.
- `client/src/ui/core/ZoneInterface.tsx` passes Exportunity state into `BuyerHomePage`.
- `client/src/pages/BuyerHomePage.tsx` selects the Exportunity shell for the commerce routes.

## Exportunity Commerce UI

- Primary live component: `client/src/components/exportunity/ExportunityNeighbourhoodCommerce.tsx`.
- Legacy fallback/type source: `client/src/components/exportunity/ExportunityConversationalCommerce.tsx`.
- Seeded Abidjan/Cotonou commerce data: `client/src/components/exportunity/seededBusinessData.ts`.
- Conversation scenario config: `client/src/components/exportunity/conversationFlows.ts`.

## Backend Surfaces Observed

- Marketplace/admin routes: `server/routes/marketplace.ts`, `server/routes/admin-marketplace.ts`, seller routes, and related schemas.
- WhatsApp/Twilio routes: `server/routes/whatsapp.ts`, `server/routes/twilio-webhooks.ts`, `server/routes/admin-twilio.ts`.
- Agent OS routes/libs: `server/routes/agent-os.ts`, `server/routes/admin-agents-os.ts`, `server/lib/agent-os/*`.
- Payment/wallet routes/libs: `server/lib/payment/*`, `server/lib/wallet/*`, `db/schema/payments.ts`, `db/schema/wallet-os.ts`.

## Missing Or Thin Surfaces

- PME Exchange lead schema and migrations.
- Server Google Places client and import limiter.
- Admin PME Exchange pages.
- Public map config and nearby places routes were referenced by the UI but not found in the searched server route set.
