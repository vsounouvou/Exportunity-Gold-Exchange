# Group Buying, Preorders, and Production Batches

**Source status:** `SOURCE_COMPLETE` for the local schema, migration/runtime parity, policy, service, central Actions, APIs, public Producer Exchange, administration workspace, and focused tests. The intended database migration, deployed data, provider accounts, callbacks, payment receipts, carrier receipts, production evidence, refund execution, and settlement receipts remain `UNKNOWN_REQUIRES_PRODUCTION_ACCESS`.

## Commerce-only doctrine

This rail supports ordinary product purchases: group buying, preorders, minimum-order-quantity aggregation, and evidence-backed factory production batches. It is not an investment, security, equity, dividend, yield, profit-share, revenue-share, bond, tokenized asset, or capital-raising product. Campaign content and evidence are rejected when they contain regulated-capital claims or credential material.

A recorded interest is deliberately non-binding:

- it does not collect payment;
- it does not reserve stock or production capacity;
- it does not create a binding order;
- it does not count toward the paid minimum-order threshold.

The canonical industrial catalog, factory, supplier, customer order, payment, fulfillment plan, carrier authority, and delivery evidence remain authoritative. This package does not create competing payment, fulfillment, carrier, or refund ledgers.

## Exact states

Campaigns use:

`draft → verification_required → live → threshold_pending → moq_reached → payment_confirmed → production → ready_for_pickup → in_transit → delivered → settled`

They may also move through `failed → refunding → refunded` where allowed. A campaign cannot skip from `live` to `settled`, and ready goods cannot become delivered without the in-transit path.

Commitments use:

`interest_recorded → order_required → payment_pending → payment_confirmed → allocated_to_batch → fulfilled`

Cancellation and refund states are separate: `cancelled`, `refund_pending`, and `refunded`.

Production batches use:

`planned → capacity_confirmed → funded_by_orders → production → quality_review → ready_for_pickup → in_transit → delivered → settlement_pending → settled`

They also expose `failed`, `refunding`, and `refunded`. Settlement plans use `draft`, `approval_required`, `approved_submission_ready`, `submitted`, `provider_confirmed`, `reconciled`, and `reversed`. The current source path stops at `approved_submission_ready`; that state is internal authority, not provider submission or settlement.

## Evidence model

Migration `20270418_exportunity_group_buying_foundation.sql` and its runtime-parity initializer add:

- `group_buying_campaigns` for the verified product, factory or supplier, territory, media/rights, capacity, MOQ, commercial terms, deadline, and exact truth state;
- `group_buying_price_tiers` for non-overlapping, currency-consistent, evidence-backed price breaks;
- `group_buying_commitments` for non-binding interest and later exact canonical-order/payment binding;
- `group_buying_updates` for local campaign and production updates with accurate publication truth;
- `group_buying_events` for idempotent append-only evidence and state history;
- `production_batches` and `production_batch_allocations` for capacity, paid-order allocation, production, inspection, carrier handoff, delivery, and settlement evidence;
- `group_settlement_plans` and `group_settlement_allocations` for balanced, role-specific, approval-gated settlement preparation.

Evidence rejects passwords, tokens, cookies, private keys, client secrets, and API keys. Public readiness requires an approved public catalog item, verified factory or supplier, sourced territory, current capacity evidence, verified non-overlapping price tiers, current terms/deadline, required media rights, and a human confirmation.

## Canonical order and payment boundary

Only a canonical industrial order can convert an interest record into a paid commitment. Binding fails closed unless tenant, campaign, catalog item, factory, quantity, tier, unit price, total, and currency exactly match the order snapshot. The order must be paid and must reference a canonical successful industrial-order payment with the exact target, purpose, amount, currency, credited timestamp, and provider transaction reference.

The public Producer Exchange can record interest. It does not expose a second checkout, create a payment, claim funds are reserved, or fabricate threshold progress. Campaign paid quantity is derived only from commitments that passed the canonical payment gate.

## Production and carrier boundary

A batch becomes `funded_by_orders` only when allocations point to exact provider-reconciled paid commitments and cover the required quantity. Production, inspection, ready quantity, handoff quantity, and delivered quantity each need explicit evidence and timestamps.

Moving from `ready_for_pickup` to `in_transit` requires the canonical Carrier Network authority to be provider-confirmed, with an external booking flag, provider booking reference, confirmation timestamp, and evidence. The batch service itself never requests a quote, creates a booking, or claims a carrier handoff. Full delivery evidence is required before settlement preparation.

## Settlement and refund boundary

Settlement is calculation and authority preparation only. Gross collected value must reconcile to exact paid commitments; every allocation uses one allowed role and currency; the allocations must balance; and refund exposure is isolated explicitly. Approval writes `approved_submission_ready` while `external_settlement_executed` remains false.

No settlement adapter or provider-submission route exists. No provider-confirmed or reconciled state may be claimed without a future official adapter and receipt. The current service also blocks refund batch transitions until the canonical provider refund workflow and receipts are implemented; it does not invent refunds or held funds.

## Surfaces and authority

- Public routes: `/producer-exchange` and `/producer-exchange/:slug`.
- Tenant-authenticated interest API: `/api/group-buying/campaigns/:campaignId/interest`.
- Tenant-admin workspace: `/admin/group-buying`.
- Tenant-admin API namespace: `/api/group-buying/admin`.

The admin workspace prepares and authorizes campaigns, binds a previously paid canonical order, records production evidence, publishes local campaign updates, and prepares settlement allocations. These controls do not start factory production, submit a carrier booking, release funds, execute refunds, or submit settlement to a provider.

## Production release checklist

Before claiming the rail is live:

1. apply migration `20270418` after the industrial, payment, fulfillment, carrier, territory/media, CRM, and Mindbase dependencies;
2. verify all tenant foreign keys, enum and amount constraints, tier non-overlap, one canonical order/payment binding, event idempotency, paid-threshold truth, exact allocation totals, and campaign/batch state constraints;
3. run cross-tenant, expired deadline, invalid tier, amount/currency mismatch, unpaid order, replay, partial allocation, insufficient production, failed inspection, missing carrier receipt, incomplete delivery, unbalanced settlement, and refund-exposure tests in a non-production tenant;
4. verify the intended Flutterwave environment and callback receipts without an ordinary live charge;
5. verify one official carrier adapter and signed provider-confirmed handoff path separately;
6. implement and verify canonical refund and settlement adapters with idempotent provider receipts, rollback/disable controls, and separate action-time human authority;
7. run a bounded pilot using a real product, verified factory capacity, approved price tiers, current terms, rights-cleared media, and a serviceable territory.

No production migration, provider call, payment collection, factory instruction, carrier booking, refund, settlement, public campaign, or external publication was performed while implementing this package.
