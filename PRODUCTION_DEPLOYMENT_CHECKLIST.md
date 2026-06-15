# Production Deployment Checklist

## Verification

- Run `npm run check`.
- Run `npm run build`.
- Confirm route verification includes `/admin/pme-exchange` and child routes.
- Confirm `/api/places/nearby` works without Google keys by returning curated city data.
- Confirm `/api/admin/pme-exchange/status` works for an authenticated admin.

## Environment

- `PME_EXCHANGE_ENABLED=true`
- `GOOGLE_PLACES_ENABLED=true` only after server key restrictions are configured.
- `GOOGLE_PLACES_IMPORT_ENABLED=true` only after quota/spend controls are configured.
- `GOOGLE_PLACES_API_KEY` or `GOOGLE_MAPS_API_KEY`
- `GOOGLE_MAPS_BROWSER_API_KEY` if browser Google Maps is enabled.
- `GOOGLE_MAPS_MAP_ID` or `GOOGLE_MAPS_MAP_ID_LIGHT` if Google Advanced Markers/styling are used.
- `PME_OUTREACH_ENABLED=false` until production approval flow is verified.
- `PME_OUTREACH_TEST_MODE=true`
- `PME_INVESTMENT_FEATURES_ENABLED=false`
- Twilio sender env vars only after approved sender/template setup.

## Database

- Apply `db/migrations/20270317_pme_exchange.sql`.
- Confirm `pme_leads`, `pme_outreach_campaigns`, `pme_outreach_messages`, `pme_agent_conversations`, and `pme_exchange_profiles` exist.
- Confirm runtime schema guard does not report errors in server logs.

## Smoke Routes

- `/marketplace`
- `/map`
- `/wholesale`
- `/pme-exchange`
- `/admin/pme-exchange`
- `/admin/pme-exchange/map`
- `/admin/pme-exchange/import`
- `/admin/pme-exchange/leads`

## Rollback

- Disable PME Exchange route exposure by hiding the admin nav and turning off `PME_EXCHANGE_ENABLED`.
- Keep public marketplace fallback active through curated city data.
- Revert to previous deploy artifact if route load or server startup fails.
