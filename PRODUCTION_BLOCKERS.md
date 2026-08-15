# Exportunity Production Blockers

Date: 2026-08-15

## Release Gate

- Deploy the root canonical/indexing correction and confirm that `https://exportunity.net/` no longer sends `X-Robots-Tag: noindex`.
- Confirm unknown `/api/*` requests return JSON 404 instead of the application HTML shell.
- Run type validation, the focused test suite, and the production build.
- Verify the deployed build ID, commit, root identity, public industrial routes, and production feature flags after container recreation.

## Promotion And Operations Gaps

- Authenticated Operations Center browser smoke cannot be rerun without a dedicated test login or supplied authenticated session. Existing database and automated lifecycle evidence confirms persistence, but this does not replace a release-browser check.
- The local in-app browser test runtime is unavailable. Desktop, tablet, and mobile visual acceptance must be rerun when that runtime is repaired.
- Google Workspace OAuth credentials are missing. Evidence sync from Gmail, Drive, and Contacts is therefore not active.
- Google Maps has no Map ID and Google Places has no server import key. The public map must continue to use the polished Leaflet/OpenStreetMap and curated industrial-data fallback.

## Transaction Gaps

- Tenant-aware Flutterwave v4 configuration is present and contract-tested, but no real charge was made during audit.
- Exportunity-specific KKiaPay credentials are absent. Do not display KKiaPay as available for Exportunity until configured and tested.
- The old generic `/api/payment/*` orchestrator is intentionally disabled unless its legacy v3 adapter is configured. Current checkout work should use `/api/payments/flutterwave/*`.

## Communication And Compliance Gates

- `FEATURE_EXTERNAL_COMMUNICATIONS=false` must remain the production default.
- No email, WhatsApp, SMS, voice, LinkedIn, or social campaign may send without explicit human approval.
- First-contact WhatsApp outreach requires consent or an approved template, opt-out processing, quiet hours, duplicate suppression, daily limits, and an immutable audit trail.
- Public financing, royalty, or investment offers remain disabled until legal and compliance approval.

## Safe Current Defaults

- Demand-driven roles remain available rather than creating 100 idle runtime agents.
- Specialist findings return to the Commercial Director for customer-facing review.
- Agent-created tasks and external actions remain approval-gated.
- Curated industrial data remains available when Google providers are unavailable.
- Synthetic production QA records have been removed through an exact, tenant-scoped cleanup.
