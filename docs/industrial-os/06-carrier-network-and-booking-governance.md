# Carrier Network and Booking Governance

**Source status:** implemented locally. Migration, provider account verification, official adapters, provider requests, bookings, callbacks, and live tracking remain release-gated.

## Purpose and canonical boundary

This package adds the evidence and authority layer needed to choose a logistics provider without creating a second order, payment, fulfillment, or delivery system. The existing industrial order and `industrial_fulfillment_plans` remain canonical. A selected carrier quote and its booking authority are linked to the matching freight, customs, or last-mile service slot.

The truth states are intentionally separate:

`candidate → verified provider → contracted partner → quote verified → quote selected → approval required → approved submission ready → provider submitted → provider confirmed → in progress → completed`

Only the first seven states can be produced by the current source path. `Approved submission ready` means an authorized package may later be sent through an approved official adapter. It does not mean a carrier was contacted, a booking exists, or a tracking reference is real.

## Evidence model

Migrations `20270417_exportunity_carrier_network_foundation.sql` and
`20270418_exportunity_carrier_connection_isolation.sql`, plus runtime parity,
add:

- `carrier_profiles`: candidate, verification, partnership, restriction, provenance, insurance, and compliance truth;
- `carrier_coverages`: exact tenant carrier, origin/destination country, service, mode, cargo category, capacity, special handling, capability, source, and freshness evidence;
- `carrier_adapter_connections`: non-secret provider/account references, capabilities, callback/restriction state, and verification evidence;
- `carrier_quote_requests`: canonical order/fulfillment context, route/cargo snapshots, matched coverage, and accurate provider-execution state;
- `carrier_delivery_quotes`: structured private cost, optional customer price, transit estimate, validity, terms, and evidence;
- `carrier_booking_authorizations`: selected quote, paid order, fulfillment service, contract/connection gate, human approval, and provider-execution truth;
- `carrier_provider_receipts`: idempotent provider events with signature-verification state for future official adapters;
- `carrier_incidents`: account, safety, service, restriction, or booking incidents that can block new authority.

Passwords, tokens, API keys, cookies, and private keys are rejected from
evidence. The active connection record may contain only an Exportunity-native
integration ID or a secret-manager reference. Admin list responses omit both
the identifier and the secret-manager reference, exposing only presence flags.
The forward-fix retires any historical cross-product reference, preserves its
audit evidence, restricts the affected connection, and requires fresh
Exportunity-native verification before reuse.

## Exact readiness gates

A profile is usable only when its tenant, verified state, evidence, verifier, freshness, expiry, and restriction state pass. Calling it a contracted partner additionally requires contract evidence.

Coverage matching is fail-closed across:

1. tenant and carrier identity;
2. verified/current status and precise evidence;
3. origin and destination country;
4. freight, customs, or last-mile service type;
5. transport mode and optional product category;
6. maximum weight and volume;
7. hazardous-goods and cold-chain support;
8. every required capability.

A quote request is prepared internally. If no verified connection has `quote_request`, the result is `manual_required`; otherwise it is only `submission_ready`. Both retain `provider_request_executed = false`.

A quote can be marked verified only from bounded credential-free evidence, a current valid-until time, coherent integer minor-unit prices, and a ready carrier profile. Selecting it requires a paid tenant order and its existing fulfillment plan/service.

Internal booking approval additionally requires:

- the exact selected/current quote and matching order currency;
- a contracted partner or internal network profile;
- a current unrestricted connection with `booking_create`;
- no unresolved high/critical carrier incident;
- an authenticated human, authority reference, and rationale.

Approval writes `approved_submission_ready` and `external_booking_executed = false`. An external carrier fulfillment service cannot move to `in_progress` until a future official adapter records a provider-confirmed booking reference, verified receipt, and `external_booking_executed = true`.

## Provider-neutral adapter contract

`server/lib/industrial/carrierAdapter.ts` defines connection verification, quote request, booking creation/cancellation, tracking, proof-of-delivery projection, and webhook-signature verification. No implementation is registered. The current application service does not call `requestQuote`, `createBooking`, or `cancelBooking`.

Future adapters must resolve credentials at the canonical private boundary, verify tenant/account ownership and scopes, use deterministic idempotency, persist raw-body signature evidence safely, create provider receipts, and update states only from provider-confirmed responses. Adding an adapter does not authorize its production use.

`server/lib/industrial/carrierProviderRelease.ts` adds a second, independent
release boundary. A registered adapter and a verified connection are still
insufficient. The exact provider action also requires an explicit disabled-by-
default feature flag, a provider contract manifest, written-agreement evidence,
current legal and operations approvals, action-specific data rights, the exact
environment and capability, fresh connection verification, and production
sandbox receipts. Webhooks additionally require a verified callback and
security approval. The current code has no execution
surface, so every provider gate remains blocked even if a flag is changed.
Approval timestamps must be accompanied by precise approval references, and an
executed agreement must have a current evidenced term; free-form or expired
claims do not pass.

The DHL Express MyDHL API appears only as a contract manifest, not as a carrier
partner, verified provider, connected account, or registered adapter. Its
official API/terms reference is
`https://developer.dhl.com/api-reference/dhl-express-mydhl-api?lang=en`. Because
the Exportunity workflow stores and normalizes quote data, the manifest requires
separate written rights for quote submission, response persistence,
transformation, and commercial use before an adapter release can pass. No such
agreement or provider capability is claimed by this source package.

## Disposable migration proof — 2026-08-21

The checksum-verified production backup
`exportunity-pre-native-social-e42fe19-20260821T154934Z.dump` was restored to a
uniquely named disposable PostgreSQL database. The exact isolation migration
was applied twice with `ON_ERROR_STOP`. Verification returned one
`exportunity_integration_connection_id` column, one Exportunity-native foreign
key, one partial native index, the updated verified-state check, the legacy
reference retirement check, zero foreign keys on the retired legacy column,
zero non-null legacy references, and zero existing carrier connection rows.
The disposable database and uploaded SQL copy were removed immediately. No
production schema or provider state was changed by this proof.

## Admin workflow and API

The protected `/admin/carrier-network` workspace exposes record-only controls for candidates, verification, coverage, connection evidence, quote preparation, quote receipts, selection, internal booking authority, and incidents. It deliberately has no **Book carrier** control. The industrial deal room links paid freight/customs/last-mile services to this workspace and blocks free-text external-carrier configuration.

The tenant-admin API is mounted at `/api/admin/carrier-network`. It has no quote-submission, booking-submission, cancellation, tracking-poll, or webhook route.

## Release verification

Before any production provider action:

1. apply and verify migrations `20270417` and `20270418` after the industrial
   fulfillment and Exportunity integration migrations;
2. run cross-tenant, stale/expired, restriction, capacity, hazardous/cold-chain, currency, unpaid-order, incident, and replay tests;
3. privately verify the intended carrier account, ownership, environment, capabilities, callback URL, webhook signature scheme, and restrictions;
4. implement one official adapter and retain controlled sandbox receipts for connection, quote, booking, cancellation, and tracking;
5. attach the executed written agreement, immutable terms snapshot, and explicit
   data-use rights to the Exportunity-native connection evidence;
6. record legal, operations, and—where callbacks are used—security approval;
7. confirm provider idempotency and application replay behavior;
8. approve a rollback/disable plan and an action-time human confirmation policy;
9. run a no-spend/no-commitment dry run, then a separately authorized bounded sandbox or production pilot.

Do not seed carrier partners or country coverage from narrative claims. Unknown coverage remains unknown, and a discovered carrier remains a candidate until evidence changes its state.
