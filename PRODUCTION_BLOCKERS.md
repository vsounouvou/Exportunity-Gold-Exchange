# Production Blockers

Date: 2026-06-14

## Critical

- Google Places is not live until `GOOGLE_PLACES_ENABLED=true` and a server-side `GOOGLE_PLACES_API_KEY` or `GOOGLE_MAPS_API_KEY` is configured with correct API restrictions.
- The current live Google Maps browser key is present but Google returns `InvalidKeyMapError` on `exportunity.net`. The public map now falls back safely to OpenStreetMap/curated markers, but the Google Cloud Maps JavaScript API key must be replaced or corrected before Google Maps can visibly render.
- PME outreach must not send bulk WhatsApp/SMS messages until Twilio sender verification, approved templates, opt-out handling, and admin approval are confirmed in production.
- Public investment/royalty listing remains disabled unless `PME_INVESTMENT_FEATURES_ENABLED=true` after legal/compliance approval.

## High

- Migrations should be applied cleanly in production; the PME route also has guarded runtime schema creation to avoid a hard outage, but migrations remain the source of truth.
- Google quota and spend controls must be configured in Google Cloud before high-volume import.
- Do-not-contact and duplicate outreach suppression must be reviewed before live outreach.

## Medium

- Admin Twilio screens still need a full light-mode refresh outside the PME Exchange page.
- Operations Center attachment intelligence and deep agent autonomy remain broader platform work.
- The public homepage currently uses Leaflet/OpenStreetMap unless Google browser map config is provided and the Google map renderer is selected.

## Current Safe Defaults

- Google disabled or rejected falls back to OpenStreetMap plus curated city data.
- PME campaigns default to test/draft mode.
- Outreach messages are logged as approval-required drafts.
- Investment features are internal-review-only.
