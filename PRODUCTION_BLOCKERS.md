# Production Blockers

Date: 2026-06-15

## Critical

- Google Maps is not visibly live until a browser-restricted Maps JavaScript API key and Google Map ID are configured. Current live config has the browser key present but no Map ID.
- Google Places import is not live until `GOOGLE_PLACES_ENABLED=true` or `GOOGLE_IMPORT_ENABLED=true` and a server-side `GOOGLE_PLACES_API_KEY` is configured with correct API restrictions.
- PME outreach must not send bulk WhatsApp/SMS messages until Twilio sender verification, approved templates, opt-out handling, and admin approval are confirmed in production.
- Public investment/royalty listing remains disabled unless `PME_INVESTMENT_FEATURES_ENABLED=true` after legal/compliance approval.

## High

- Migrations should be applied cleanly in production; the PME route also has guarded runtime schema creation to avoid a hard outage, but migrations remain the source of truth.
- Google quota and spend controls must be configured in Google Cloud before high-volume import.
- Do-not-contact and duplicate outreach suppression must be reviewed before live outreach.

## Medium

- Admin Twilio screens still need a full light-mode refresh outside the PME Exchange page.
- Operations Center attachment intelligence and deep agent autonomy remain broader platform work.
- The public homepage currently uses Leaflet/OpenStreetMap plus curated city data until Google browser map config and Places import config are complete.

## Current Safe Defaults

- Google disabled or rejected falls back to OpenStreetMap plus curated city data.
- Seeded intent matching returns relevant marketplace/wholesale businesses for breakfast, bread, mixed category, cement, and supplier queries.
- PME campaigns default to test/draft mode.
- Outreach messages are logged as approval-required drafts.
- Investment features are internal-review-only.
