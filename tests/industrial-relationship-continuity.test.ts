import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildIndustrialRelationshipMemoryDraft,
  INDUSTRIAL_RELATIONSHIP_CONTINUITY_CHECKLIST,
  IndustrialRelationshipContinuityPolicyError,
  parseIndustrialRelationshipContinuityApproval,
} from "../server/lib/industrial/relationshipContinuityPolicy";

const ids = {
  recognition: "11111111-1111-4111-8111-111111111111",
  order: "22222222-2222-4222-8222-222222222222",
  requirement: "33333333-3333-4333-8333-333333333333",
  plan: "44444444-4444-4444-8444-444444444444",
  package: "55555555-5555-4555-8555-555555555555",
  supplier: "66666666-6666-4666-8666-666666666666",
};

function validInput() {
  return {
    tenantId: 9,
    recognition: {
      id: ids.recognition,
      tenantId: 9,
      orderId: ids.order,
      fulfillmentPlanId: ids.plan,
      supplierPurchaseOrderPackageId: ids.package,
      status: "recognized",
      currencyCode: "XOF",
      revenueMinor: "15000",
      actualCostMinor: "11000",
      actualGrossMarginMinor: "4000",
      recognitionHash: "a".repeat(64),
    },
    order: {
      id: ids.order,
      tenantId: 9,
      requirementId: ids.requirement,
      orderConfirmationHash: "b".repeat(64),
    },
    requirement: {
      id: ids.requirement,
      tenantId: 9,
      customerContactId: 42,
      requesterCompany: "Buyer SA",
    },
    productRequirement: {
      frequency: "monthly",
    },
    fulfillmentPlan: {
      id: ids.plan,
      tenantId: 9,
      orderId: ids.order,
      status: "delivered",
      deliveredAt: "2026-08-22T15:00:00.000Z",
    },
    supplierPurchaseOrderPackage: {
      id: ids.package,
      tenantId: 9,
      orderId: ids.order,
      supplierProfileId: ids.supplier,
      productName: "Refined palm oil",
      specification: "Food-grade refined palm oil",
      offeredQuantity: "100",
      unitOfMeasure: "MT",
      destination: "Abidjan, Côte d'Ivoire",
      countryOfOrigin: "GH",
      supplierQuoteReference: "SUP-Q-2026-42",
      packageHash: "c".repeat(64),
    },
    supplierProfile: {
      id: ids.supplier,
      tenantId: 9,
      displayName: "Verified Supplier Ltd",
    },
    customerContact: {
      id: 42,
      displayName: "Awa Buyer",
      company: "Buyer SA",
    },
    consentStatus: "opt_in",
    isDnc: false,
  };
}

test("recognized delivery produces deterministic exact customer and supplier memory", () => {
  const first = buildIndustrialRelationshipMemoryDraft(validInput());
  const second = buildIndustrialRelationshipMemoryDraft(validInput());
  assert.equal(first.memoryHash, second.memoryHash);
  assert.match(first.memoryHash, /^[a-f0-9]{64}$/);
  assert.match(first.evidenceHash, /^[a-f0-9]{64}$/);
  assert.equal(first.revenueMinor, "15000");
  assert.equal(first.actualCostMinor, "11000");
  assert.equal(first.actualGrossMarginMinor, "4000");
  assert.equal(first.proposedNextReviewAt, "2026-09-21T15:00:00.000Z");
  assert.equal(first.customerMemory.completedOrderId, ids.order);
  assert.equal(first.supplierMemory.supplierProfileId, ids.supplier);
  assert.equal(first.externalCommunicationAuthorized, false);
  assert.equal(first.externalCommunicationExecuted, false);
});

test("relationship memory fails closed on unrecognized, lineage, and exact-margin mismatches", () => {
  const cases: Array<
    [string, (input: ReturnType<typeof validInput>) => void]
  > = [
    ["industrial_relationship_continuity_lineage_mismatch", (input) => {
      input.recognition.status = "approval_required";
    }],
    ["industrial_relationship_continuity_lineage_mismatch", (input) => {
      input.supplierPurchaseOrderPackage.supplierProfileId = ids.order;
    }],
    ["industrial_relationship_continuity_margin_mismatch", (input) => {
      input.recognition.actualGrossMarginMinor = "3999";
    }],
  ];
  for (const [code, mutate] of cases) {
    const input = validInput();
    mutate(input);
    assert.throws(
      () => buildIndustrialRelationshipMemoryDraft(input),
      (error: unknown) =>
        error instanceof IndustrialRelationshipContinuityPolicyError &&
        error.code === code,
      code,
    );
  }
});

test("do-not-contact memory remains useful but explicitly prohibits outreach", () => {
  const input = validInput();
  input.consentStatus = "opt_out";
  const draft = buildIndustrialRelationshipMemoryDraft(input);
  assert.equal(draft.isDnc, true);
  assert.match(draft.recommendedAction, /do not contact/i);
  assert.equal(draft.externalCommunicationAuthorized, false);
});

test("internal continuity approval requires a future review, complete evidence, and no-message separation", () => {
  const draft = buildIndustrialRelationshipMemoryDraft(validInput());
  const checklist = Object.fromEntries(
    INDUSTRIAL_RELATIONSHIP_CONTINUITY_CHECKLIST.map((key) => [key, true]),
  );
  const parsed = parseIndustrialRelationshipContinuityApproval(
    {
      expectedMemoryHash: draft.memoryHash,
      reason:
        "Approved as an internal repeat-business review after checking the delivered trade and consent state.",
      nextReviewAt: "2026-09-21T15:00:00.000Z",
      checklist,
    },
    new Date("2026-08-22T16:00:00.000Z"),
  );
  assert.equal(parsed.expectedMemoryHash, draft.memoryHash);
  assert.equal(Object.values(parsed.checklist).every(Boolean), true);
  assert.throws(
    () =>
      parseIndustrialRelationshipContinuityApproval(
        {
          expectedMemoryHash: draft.memoryHash,
          reason: "This internal review reason is long enough to be retained.",
          nextReviewAt: "2026-09-21T15:00:00.000Z",
          checklist: { ...checklist, noExternalCommunication: false },
        },
        new Date("2026-08-22T16:00:00.000Z"),
      ),
    (error: unknown) =>
      error instanceof IndustrialRelationshipContinuityPolicyError &&
      error.code ===
        "industrial_relationship_continuity_checklist_incomplete",
  );
});

test("schema, migration, service, routes, Company Brain, and native deal room enforce Phase H continuity", async () => {
  const [schema, migration, service, accounting, routes, brain, dealRoom] =
    await Promise.all([
      readFile(
        new URL(
          "../db/schema/exportunity-relationship-continuity.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../db/migrations/20270606_exportunity_relationship_continuity.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../server/lib/industrial/relationshipContinuity.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../server/lib/industrial/deliveryAccounting.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../server/routes/industrial.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../server/routes/company-brain-governance.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../client/src/components/exportunity/IndustrialCommercialDealRoom.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);
  for (const source of [schema, migration]) {
    assert.match(source, /industrial_transaction_relationship_memories/);
    assert.match(source, /industrial_relationship_continuity_reviews/);
    assert.match(source, /actual_gross_margin_minor/);
    assert.match(source, /external_communication_authorized/);
    assert.match(source, /external_communication_executed/);
  }
  assert.match(migration, /industrial relationship memories are immutable/);
  assert.match(migration, /permits only review_required to approved_internal/);
  assert.match(migration, /status <> 'recognized'/);
  assert.match(accounting, /ensureIndustrialRelationshipContinuity/);
  assert.match(service, /industrial_relationship_continuity\.memory_recorded/);
  assert.match(service, /industrial_relationship_continuity\.internal_plan_approved/);
  assert.doesNotMatch(
    service,
    /sendMail|sendSms|sendWhatsApp|createCharge|createOrder|createBooking/,
  );
  assert.match(
    routes,
    /\/relationship-continuity\/:reviewId\/approve"[\s\S]{0,120}ensureTenantAdmin/,
  );
  assert.match(brain, /delivered_order_continuity/);
  assert.match(brain, /industrial_transaction_relationship_memories/);
  assert.match(dealRoom, /Relationship continuity and repeat business/);
  assert.match(dealRoom, /No message/);
  assert.match(dealRoom, /Approves only an internal reminder|approves only an internal reminder/i);
});
