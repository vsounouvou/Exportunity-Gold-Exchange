# Non-Breaking Dependencies

## Keep Stable

- Tenant routing and host/port config in `ops/tenants.config.json`.
- Existing product/catalog surfaces that may still be used as fallback or admin inventory tooling.
- Existing payment/wallet modules and order/payment test coverage.
- Existing WhatsApp/Twilio routes and tests.
- Existing Agent OS and action/task foundations.
- Existing brand assets under `/tenants/exportunity/logo.svg`.

## Safe Frontend Changes

- The new `ExportunityNeighbourhoodCommerce` component is additive.
- `BuyerHomePage` now imports the new component for Exportunity commerce routes.
- Legacy `ExportunityConversationalCommerce` remains available for types and fallback.

## Integration Boundaries

- Google Places import must be server-side for sensitive API keys.
- Browser map keys must be browser-restricted and never reused for server Places calls.
- WhatsApp outreach must go through existing Twilio/WhatsApp approval and logging surfaces.
- Investment-related language must stay compliance-gated and admin-only until legal approval.
