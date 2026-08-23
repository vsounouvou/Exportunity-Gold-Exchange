import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  CommercialOfferPolicyError,
  parseCommercialOfferCustomerResponseInput,
  parseCommercialOrderCreateInput,
} from "../server/lib/exportunity/commercialOfferPolicy";

const pricingHash = "a".repeat(64);
const responseHash = "b".repeat(64);
const now = new Date("2026-08-21T12:00:00.000Z");

function responseChecklist() {
  return {
    pricingHashRechecked: true,
    customerIdentityConfirmed: true,
    customerResponseEvidenceReviewed: true,
    responseRecordedWithoutExternalContact: true,
    separateOrderActionRequired: true,
  };
}

function orderChecklist() {
  return {
    customerAcceptanceRechecked: true,
    exactPriceRechecked: true,
    noPaymentCollected: true,
    procurementNotStarted: true,
    separatePaymentActionRequired: true,
    separateFulfillmentActionRequired: true,
  };
}

test("customer response evidence is pricing-hash-bound and deterministic", () => {
  const payload = {
    expectedPricingHash: pricingHash,
    response: "accepted",
    responseReceivedAt: "2026-08-21T11:58:00.000Z",
    channel: "email",
    evidenceReference: "gmail-message:18f4c09",
    customerStatement: "We accept this exact offer and its stated terms.",
    decisionNotes:
      "The tenant-scoped customer identity and original response evidence were reviewed.",
    checklist: responseChecklist(),
  };
  const first = parseCommercialOfferCustomerResponseInput(payload, { now });
  const second = parseCommercialOfferCustomerResponseInput(payload, { now });
  assert.equal(first.response, "accepted");
  assert.equal(first.responseHash, second.responseHash);
  assert.match(first.responseHash, /^[0-9a-f]{64}$/);
  assert.equal(first.responseReceivedAt.toISOString(), payload.responseReceivedAt);
});

test("customer response rejects unsupported channels, future evidence, and incomplete attestations", () => {
  const base = {
    expectedPricingHash: pricingHash,
    response: "accepted",
    responseReceivedAt: "2026-08-21T11:58:00.000Z",
    channel: "email",
    evidenceReference: "gmail-message:18f4c09",
    customerStatement: "We accept this exact offer and its stated terms.",
    decisionNotes:
      "The tenant-scoped customer identity and original response evidence were reviewed.",
    checklist: responseChecklist(),
  };
  assert.throws(
    () =>
      parseCommercialOfferCustomerResponseInput(
        { ...base, channel: "telegram" },
        { now },
      ),
    (error: unknown) =>
      error instanceof CommercialOfferPolicyError &&
      error.code === "COMMERCIAL_OFFER_RESPONSE_CHANNEL_INVALID",
  );
  assert.throws(
    () =>
      parseCommercialOfferCustomerResponseInput(
        { ...base, responseReceivedAt: "2026-08-21T12:10:00.000Z" },
        { now },
      ),
    /materially in the future/,
  );
  assert.throws(
    () =>
      parseCommercialOfferCustomerResponseInput(
        {
          ...base,
          checklist: {
            ...responseChecklist(),
            separateOrderActionRequired: false,
          },
        },
        { now },
      ),
    /separateOrderActionRequired must be explicitly confirmed/,
  );
});

test("order confirmation binds pricing and acceptance without creating payment or fulfilment", () => {
  const payload = {
    expectedPricingHash: pricingHash,
    expectedCustomerResponseHash: responseHash,
    confirmationNote:
      "The accepted price and response evidence were rechecked for exact order creation.",
    plannedDeliveryAt: "2026-09-15T12:00:00.000Z",
    checklist: orderChecklist(),
  };
  const first = parseCommercialOrderCreateInput(payload, { now });
  const second = parseCommercialOrderCreateInput(payload, { now });
  assert.equal(first.confirmationHash, second.confirmationHash);
  assert.match(first.confirmationHash, /^[0-9a-f]{64}$/);
  assert.equal(first.expectedCustomerResponseHash, responseHash);
  assert.equal(first.checklist.noPaymentCollected, true);
  assert.equal(first.checklist.separateFulfillmentActionRequired, true);
  assert.throws(
    () =>
      parseCommercialOrderCreateInput(
        { ...payload, expectedCustomerResponseHash: "invalid" },
        { now },
      ),
    /valid customer response hash/,
  );
});

test("Phase G uses canonical Actions, exact minor units, and retires duplicate write controls", () => {
  const service = readFileSync(
    path.join(process.cwd(), "server/lib/exportunity/commercialOffer.ts"),
    "utf8",
  );
  const route = readFileSync(
    path.join(process.cwd(), "server/routes/exportunity-commercial-offers.ts"),
    "utf8",
  );
  const registry = readFileSync(
    path.join(process.cwd(), "server/lib/actions/actionRegistry.ts"),
    "utf8",
  );
  const industrialRoute = readFileSync(
    path.join(process.cwd(), "server/routes/industrial.ts"),
    "utf8",
  );
  const workbench = readFileSync(
    path.join(
      process.cwd(),
      "client/src/components/exportunity/CommercialOfferWorkbench.tsx",
    ),
    "utf8",
  );
  const dealRoom = readFileSync(
    path.join(
      process.cwd(),
      "client/src/components/exportunity/IndustrialCommercialDealRoom.tsx",
    ),
    "utf8",
  );
  const schema = readFileSync(
    path.join(process.cwd(), "db/schema/industrial.ts"),
    "utf8",
  );
  const ensureTables = readFileSync(
    path.join(process.cwd(), "server/lib/industrial/ensureTables.ts"),
    "utf8",
  );
  const migration = readFileSync(
    path.join(
      process.cwd(),
      "db/migrations/20270523_exportunity_offer_acceptance_orders.sql",
    ),
    "utf8",
  );

  assert.match(service, /recordCommercialOfferCustomerResponse/);
  assert.match(service, /createCommercialOrderFromAcceptedOffer/);
  assert.match(service, /customerResponseHash: parsed\.responseHash/);
  assert.match(service, /totalAmountMinor: current\.offer\.customerPriceMinor/);
  assert.match(service, /paymentStatus: "unpaid"/);
  assert.match(service, /paymentCreated: false/);
  assert.match(service, /procurementStarted: false/);
  assert.doesNotMatch(service, /parseFloat|sendMail|sendSms|sendWhatsApp|twilio/i);

  assert.match(route, /COMMERCIAL_OFFER_CUSTOMER_RESPONSE_RECORD/);
  assert.match(route, /COMMERCIAL_ORDER_CREATE_FROM_ACCEPTED_OFFER/);
  assert.match(route, /"\/:id\/customer-response"/);
  assert.match(route, /"\/:id\/order"/);
  assert.equal(
    [...route.matchAll(/\{ \.\.\.\(req\.body \|\| \{\}\), offerId \}/g)].length,
    6,
  );
  assert.doesNotMatch(route, /\{ offerId, \.\.\.\(req\.body \|\| \{\}\) \}/);
  assert.match(registry, /COMMERCIAL_OFFER_CUSTOMER_RESPONSE_RECORD/);
  assert.match(registry, /COMMERCIAL_ORDER_CREATE_FROM_ACCEPTED_OFFER/);

  assert.match(
    industrialRoute,
    /"\/admin\/quotes\/:quoteId\/status",\s*ensureTenantStaff,\s*retiredLegacyCommercialWrite/,
  );
  assert.match(
    industrialRoute,
    /"\/admin\/quotes\/:quoteId\/orders",\s*ensureTenantStaff,\s*retiredLegacyCommercialWrite/,
  );
  assert.doesNotMatch(dealRoom, /quoteStatusMutation|orderMutation/);
  assert.doesNotMatch(
    dealRoom,
    /\/api\/industrial\/admin\/quotes\/\$\{[^}]+\}\/(?:status|orders)/,
  );
  assert.match(workbench, /\/customer-response/);
  assert.match(workbench, /\/order/);

  assert.match(schema, /customerResponseHash: text\("customer_response_hash"\)/);
  assert.match(schema, /totalAmountMinor: decimal\("total_amount_minor"/);
  assert.match(schema, /orderConfirmationHash: text\("order_confirmation_hash"\)/);
  for (const source of [schema, ensureTables, migration]) {
    assert.match(source, /industrial_quotes_tenant_customer_response_hash_unique/);
    assert.match(source, /industrial_orders_tenant_confirmation_hash_unique/);
    assert.match(source, /industrial_orders_tenant_source_pricing_hash_idx/);
  }
  assert.match(migration, /industrial_quotes_exact_customer_response_check/);
  assert.match(migration, /industrial_orders_exact_confirmation_check/);
  assert.match(migration, /total_amount_minor numeric\(30,0\)/);
  assert.match(migration, /do not drop these columns/i);
});
