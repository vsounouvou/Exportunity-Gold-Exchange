# Industrial Fulfillment Orchestration

**Source status:** implemented locally; migration, deployment, provider connections, and live operational evidence remain release-gated.

## Purpose

This is the canonical post-payment record for an Exportunity industrial transaction. It extends the existing industrial order, Agent OS task, audit, and delivery-network primitives. It does not create a competing delivery product.

Verified payment initializes one tenant-scoped fulfillment plan and five accountable service slots:

1. procurement;
2. inspection;
3. freight;
4. customs;
5. last mile.

The plan supports `standard_order`, `sample`, and `prototype` fulfillment kinds. A dedicated sample checkout remains future work.

## State and evidence model

The normal plan path is:

`release_review → procurement → inspection → ready_to_ship → in_transit → customs/last_mile → delivered`

`exception` is an explicit recovery state. `delivered` and `cancelled` are final. Invalid jumps are rejected.

Operational prerequisites are server-enforced:

- payment must be `paid` before the plan advances;
- procurement must have an approved accountable service;
- procurement must complete before inspection;
- inspection must complete and have persisted evidence before `ready_to_ship`;
- freight must be active and have an existing carrier/tracking reference before `in_transit`;
- customs must complete before moving from customs to last mile;
- last mile must be active before the final-delivery stage;
- last mile must complete and a delivery proof must exist before `delivered`.

Milestones are append-only, sequence-controlled, and tenant-idempotent. A replayed idempotency key returns the existing event. There is no event-update or event-delete route.

## Human authority and external actions

Provider configuration records a candidate or an already existing real-world reference. It never sends a supplier message, books an inspector/carrier/broker, files customs data, moves money, or offers a job to a delivery agent.

External service approval requires a visible human confirmation and verified provider identity. Recording an external service as `in_progress` requires an existing provider, booking, carrier, customs, or delivery reference plus human confirmation. The endpoint records that evidence; it does not create the external commitment.

The last-mile bridge creates an idempotent `delivery_orders` job with tenant/order metadata and QR material. It deliberately leaves the job `pending` with:

- `assignmentOffersCreated: false`;
- no delivery agent assigned;
- no external provider call;
- no automatic wallet hold or commission.

## Visibility boundary

Staff receive the private plan, service providers, references, quoted costs, internal notes, performance fields, all milestones, and allowed next states.

Customers receive only:

- tracking code, fulfillment kind, public status, and public ETA;
- public service labels and service status;
- milestones explicitly marked customer-visible;
- evidence explicitly marked `public: true`;
- a restricted delivery-proof projection (method, recipient, condition, time, and reference).

Payment/provider IDs, private costs, provider names, internal notes, non-public evidence, signature/photo storage locations, and service metadata are not returned in the customer projection.

## Staff API

All routes require tenant-staff authentication and tenant ownership:

- `POST /api/industrial/admin/orders/:orderId/fulfillment/initialize`
- `PUT /api/industrial/admin/orders/:orderId/fulfillment/services/:serviceType`
- `POST /api/industrial/admin/orders/:orderId/fulfillment/services/:serviceId/status`
- `POST /api/industrial/admin/orders/:orderId/fulfillment/status`
- `POST /api/industrial/admin/orders/:orderId/fulfillment/milestones`
- `POST /api/industrial/admin/orders/:orderId/fulfillment/last-mile-job`

The private commercial room exposes these records and controls. The existing authorized customer order endpoint returns the customer-safe projection, and the paid-order page renders it as the tracking timeline.

## Migration and release verification

Apply `db/migrations/20270410_exportunity_industrial_fulfillment_orchestration.sql` only in the intended environment. Then verify:

1. one plan per tenant/order and one tracking code per tenant;
2. one service slot per plan/service type;
3. positive event sequences and uniqueness per plan;
4. tenant-wide event idempotency uniqueness;
5. performance rating/cost/currency constraints;
6. optional `action_requests` and `delivery_orders` foreign keys when those tables exist;
7. paid-order initialization and replay behavior;
8. every blocked transition code and required evidence path;
9. customer responses contain no private provider/cost/internal fields;
10. cross-tenant delivery-job links are rejected;
11. a last-mile job creates no offer or assignment;
12. no external provider is contacted during ordinary verification.

Do not enable a provider worker simply because this migration is applied. Each provider needs its own approved adapter, secret/callback configuration, idempotent receipt, sandbox evidence, rollback plan, and explicit release decision.
