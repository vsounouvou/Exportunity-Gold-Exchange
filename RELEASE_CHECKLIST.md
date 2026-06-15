# Release Checklist

## Before Deploy

- `npm run check` passes.
- `npm run build` passes.
- No duplicate homepage chat composer.
- No visible `Main City Conversation` label.
- `/marketplace` is product-first.
- `/map` is map-dominant.
- `/wholesale` is supplier-first.
- `/pme-exchange` and `/ready-for-export` are PME-profile contexts.
- `/admin/pme-exchange` loads the PME Exchange admin dashboard.
- `/admin/pme-exchange/import` can preview Google/curated PME leads.
- `/admin/pme-exchange/leads` can select leads and draft a test outreach campaign.
- `/api/places/nearby` returns provider status and places.
- `/api/admin/pme-exchange/status` returns Google/Twilio/compliance status.
- Shop entry shows products immediately.
- Shop Front Desk agent replaces Tassi in shop context.
- Tassi remains discovery concierge, not omnipresent.

## Environment

- Confirm Exportunity tenant host/port and proxy alias.
- Confirm Google env vars if Google Maps/Places should be live.
- Confirm Twilio/WhatsApp env vars before outreach testing.
- Keep `PME_OUTREACH_TEST_MODE=true` until opt-out and approval workflows are fully verified.
- Keep `PME_INVESTMENT_FEATURES_ENABLED=false` unless legal/compliance approve public investment states.
- Keep PME investment features disabled until compliance approval.

## Deploy

- Build artifact.
- Run the approved deployment script for the Exportunity tenant.
- Check `/api/system/version`.
- Smoke test live routes.

## Rollback

- Revert the import in `BuyerHomePage.tsx` to the legacy `ExportunityConversationalCommerce` component if the new shell causes a critical production issue.
- Redeploy the prior build artifact if needed.
