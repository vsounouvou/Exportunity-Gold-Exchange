# PME Exchange Gap Analysis

## Built In This Pass

- PME lead database schema and migration.
- Runtime schema guard for live environments that do not auto-run migrations.
- Google Places client with field masks, rate/day limiter, Text Search, Nearby Search, and Details helper.
- Google Places mapper/enrichment layer.
- Curated Abidjan/Cotonou data engine with 200 realistic marketplace/wholesale leads.
- Intent-aware curated fallback search for buyer and sourcing queries such as breakfast, bread, coffee, groceries, pharmacy, building materials, cement, wholesale suppliers, machinery, packaging, agricultural inputs, logistics, cold storage, manufacturers, and textiles.
- Public `/api/maps/public-config` and `/api/places/nearby`.
- Admin `/api/admin/pme-exchange/*` routes for status, summary, leads, map, import, Google tests, campaigns, conversations, profiles, and audit.
- Admin PME Exchange UI with light-mode dashboard, map, import preview, lead selection, and approval-gated campaign drafts.
- Public commerce copy now uses Retail marketplace, Wholesale, and Ready for export rather than public-facing PME Exchange language.

## Remaining Gaps

- Real Google Place Photos are not yet rendered in the PME admin table/map.
- Durable cache table for Google Places responses is not yet implemented; the importer uses live API calls plus in-memory rate limiting.
- Production Twilio send/approve flow for PME campaigns is not connected to a send button; only approval-required drafts are created.
- Inbound WhatsApp replies are not yet automatically linked back to `pme_agent_conversations`.
- PME Acquisition Agent can be represented in the workflow, but autonomous reply handling and structured answer extraction need a follow-up implementation.
- Public investment listing is intentionally not enabled.
- Back-office global color cleanup is still incomplete outside the new PME Exchange page.
- Current live Google Maps renderer still needs a Google Map ID; current live Google Places import still needs a server Places API key and enable flag.

## Recommended Next Slice

1. Add `google_places_cache` or reuse an existing cache/settings table with TTL and attribution.
2. Link Twilio inbound webhook payloads to `pme_outreach_messages` and `pme_agent_conversations` by phone/campaign.
3. Add an approval page action: approve one drafted outreach message, then send through the existing Twilio tenant sender.
4. Add opt-out suppression table or reuse contact suppression records.
5. Add PME profile promotion from qualified lead to internal review profile.
6. Add agent extraction of activity, products/services, monthly sales estimate, delivery capability, and financing interest from replies.
