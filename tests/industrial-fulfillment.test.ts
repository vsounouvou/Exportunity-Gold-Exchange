import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  canTransitionIndustrialFulfillment,
  canTransitionIndustrialFulfillmentService,
  industrialFulfillmentTransitionBlock,
} from "../server/lib/industrial/fulfillmentPolicy";

const repoRoot = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const services = [
  { serviceType: "procurement" as const, status: "completed" as const },
  { serviceType: "inspection" as const, status: "completed" as const },
  {
    serviceType: "freight" as const,
    status: "in_progress" as const,
    externalReference: "CARRIER-TRACK-42",
  },
  { serviceType: "customs" as const, status: "completed" as const },
  { serviceType: "last_mile" as const, status: "completed" as const },
];

const events = [
  {
    eventType: "inspection_passed",
    evidence: [{ reference: "QA-REPORT-42" }],
  },
  {
    eventType: "delivery_proof_recorded",
    proof: { method: "document", reference: "POD-42" },
  },
];

test("industrial fulfillment uses a strict operational state machine", () => {
  assert.equal(canTransitionIndustrialFulfillment("release_review", "procurement"), true);
  assert.equal(canTransitionIndustrialFulfillment("release_review", "in_transit"), false);
  assert.equal(canTransitionIndustrialFulfillment("delivered", "last_mile"), false);
  assert.equal(canTransitionIndustrialFulfillment("exception", "customs"), true);

  assert.equal(canTransitionIndustrialFulfillmentService("candidate", "approved"), true);
  assert.equal(canTransitionIndustrialFulfillmentService("candidate", "completed"), false);
  assert.equal(canTransitionIndustrialFulfillmentService("completed", "in_progress"), false);
});

test("verified payment and accountable procurement approval gate release", () => {
  assert.equal(
    industrialFulfillmentTransitionBlock({
      from: "release_review",
      to: "procurement",
      paymentStatus: "pending",
      services: [{ serviceType: "procurement", status: "approved" }],
      events: [],
    })?.code,
    "industrial_fulfillment_payment_required",
  );
  assert.equal(
    industrialFulfillmentTransitionBlock({
      from: "release_review",
      to: "procurement",
      paymentStatus: "paid",
      services: [{ serviceType: "procurement", status: "candidate" }],
      events: [],
    })?.code,
    "industrial_fulfillment_procurement_approval_required",
  );
  assert.equal(
    industrialFulfillmentTransitionBlock({
      from: "release_review",
      to: "procurement",
      paymentStatus: "paid",
      services: [{ serviceType: "procurement", status: "approved" }],
      events: [],
    })?.code,
    "industrial_fulfillment_procurement_authorization_required",
  );
  assert.equal(
    industrialFulfillmentTransitionBlock({
      from: "release_review",
      to: "procurement",
      paymentStatus: "paid",
      services: [{ serviceType: "procurement", status: "approved" }],
      events: [
        {
          eventType: "procurement_released",
          evidence: [{ authorizationId: "procurement-auth-1" }],
        },
      ],
    }),
    null,
  );
});

test("inspection evidence and carrier references gate shipment movement", () => {
  assert.equal(
    industrialFulfillmentTransitionBlock({
      from: "inspection",
      to: "ready_to_ship",
      paymentStatus: "paid",
      services,
      events: [],
    })?.code,
    "industrial_fulfillment_inspection_evidence_required",
  );
  assert.equal(
    industrialFulfillmentTransitionBlock({
      from: "inspection",
      to: "ready_to_ship",
      paymentStatus: "paid",
      services,
      events,
    }),
    null,
  );
  assert.equal(
    industrialFulfillmentTransitionBlock({
      from: "ready_to_ship",
      to: "in_transit",
      paymentStatus: "paid",
      services: services.map((service) =>
        service.serviceType === "freight"
          ? { ...service, externalReference: null, providerReference: null }
          : service,
      ),
      events,
    })?.code,
    "industrial_fulfillment_freight_reference_required",
  );
  assert.equal(
    industrialFulfillmentTransitionBlock({
      from: "ready_to_ship",
      to: "in_transit",
      paymentStatus: "paid",
      services,
      events,
    }),
    null,
  );
});

test("delivery cannot close without completed last mile and proof", () => {
  assert.equal(
    industrialFulfillmentTransitionBlock({
      from: "last_mile",
      to: "delivered",
      paymentStatus: "paid",
      services,
      events: events.filter((event) => event.eventType !== "delivery_proof_recorded"),
    })?.code,
    "industrial_fulfillment_delivery_proof_required",
  );
  assert.equal(
    industrialFulfillmentTransitionBlock({
      from: "last_mile",
      to: "delivered",
      paymentStatus: "paid",
      services,
      events,
    }),
    null,
  );
});

test("fulfillment is wired from verified payment through governed staff and customer views", () => {
  const payments = read("server/lib/industrial/orderPayments.ts");
  const routes = read("server/routes/industrial.ts");
  const fulfillment = read("server/lib/industrial/fulfillment.ts");
  const dealRoom = read(
    "client/src/components/exportunity/IndustrialCommercialDealRoom.tsx",
  );
  const customer = read(
    "client/src/pages/exportunity/IndustrialOrderPaymentPage.tsx",
  );
  const migration = read(
    "db/migrations/20270410_exportunity_industrial_fulfillment_orchestration.sql",
  );

  assert.match(payments, /ensureIndustrialFulfillmentPlan/);
  assert.match(routes, /customerIndustrialFulfillmentSummary/);
  assert.match(routes, /fulfillment\/last-mile-job/);
  assert.match(routes, /assignmentOffersCreated:\s*false/);
  assert.match(fulfillment, /providerAutomationEnabled:\s*false/);
  assert.match(fulfillment, /providerBookingExecuted:\s*false/);
  assert.match(dealRoom, /Procurement-to-delivery control/);
  assert.match(customer, /query\.data\.fulfillment\.timeline/);
  assert.match(migration, /industrial_fulfillment_events_tenant_idempotency_unique/);
  assert.match(migration, /REFERENCES delivery_orders\(id\)/);
});
