import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildIndustrialActualCostEntryDraft,
  buildIndustrialRevenueRecognitionDraft,
  INDUSTRIAL_REVENUE_RECOGNITION_CHECKLIST,
  IndustrialDeliveryAccountingPolicyError,
  parseIndustrialRevenueRecognitionApproval,
} from "../server/lib/industrial/deliveryAccountingPolicy";

const ids = {
  order: "11111111-1111-4111-8111-111111111111",
  quote: "22222222-2222-4222-8222-222222222222",
  payment: "33333333-3333-4333-8333-333333333333",
  authorization: "44444444-4444-4444-8444-444444444444",
  package: "55555555-5555-4555-8555-555555555555",
  plan: "66666666-6666-4666-8666-666666666666",
  supplierCost: "77777777-7777-4777-8777-777777777777",
  freightCost: "88888888-8888-4888-8888-888888888888",
  reversal: "99999999-9999-4999-8999-999999999999",
  deliveryProof: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  freightService: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

function validActualCostInput() {
  return {
    tenantId: 9,
    order: {
      id: ids.order,
      tenantId: 9,
      currencyCode: "XOF",
      paymentStatus: "paid",
      status: "procurement",
    },
    fulfillmentPlan: {
      id: ids.plan,
      tenantId: 9,
      orderId: ids.order,
      status: "procurement",
    },
    fulfillmentService: null,
    supplierPurchaseOrderPackage: {
      id: ids.package,
      tenantId: 9,
      orderId: ids.order,
      fulfillmentPlanId: ids.plan,
      status: "approved_for_submission",
    },
    entry: {
      direction: "cost",
      category: "supplier",
      currencyCode: "XOF",
      amountMinor: "10000",
      costReference: "SUP-INV-2026-42",
      description: "Final supplier invoice evidenced against delivered goods",
      evidence: [
        {
          kind: "invoice_reference",
          reference: "SUP-INV-2026-42",
          digest: "c".repeat(64),
        },
      ],
      incurredAt: "2026-08-22T10:00:00.000Z",
      reason: "Recorded after reconciling the final supplier invoice evidence.",
      reversesCostEntryId: null,
    },
  };
}

function validRecognitionInput() {
  const pricingHash = "a".repeat(64);
  return {
    tenantId: 9,
    order: {
      id: ids.order,
      tenantId: 9,
      quoteId: ids.quote,
      status: "completed",
      paymentStatus: "paid",
      lastPaymentId: ids.payment,
      currencyCode: "XOF",
      totalAmountMinor: "15000",
      sourcePricingHash: pricingHash,
      orderConfirmationHash: "b".repeat(64),
    },
    customerQuote: {
      id: ids.quote,
      tenantId: 9,
      status: "accepted",
      currencyCode: "XOF",
      customerPriceMinor: "15000",
      totalCostMinor: "10500",
      marginMinor: "4500",
      pricingHash,
    },
    payment: {
      id: ids.payment,
      tenantId: 9,
      status: "succeeded",
      purpose: "INDUSTRIAL_ORDER_PAYMENT",
      targetId: ids.order,
      amount: "15000",
      currency: "XOF",
    },
    procurementAuthorization: {
      id: ids.authorization,
      tenantId: 9,
      orderId: ids.order,
      customerQuoteId: ids.quote,
      sourcePaymentId: ids.payment,
      fulfillmentPlanId: ids.plan,
      status: "approved",
    },
    supplierPurchaseOrderPackage: {
      id: ids.package,
      tenantId: 9,
      orderId: ids.order,
      procurementAuthorizationId: ids.authorization,
      fulfillmentPlanId: ids.plan,
      status: "approved_for_submission",
    },
    fulfillmentPlan: {
      id: ids.plan,
      tenantId: 9,
      orderId: ids.order,
      status: "delivered",
      deliveredAt: "2026-08-22T15:00:00.000Z",
    },
    deliveryProofEvent: {
      id: ids.deliveryProof,
      tenantId: 9,
      orderId: ids.order,
      planId: ids.plan,
      eventType: "delivery_proof_recorded",
      proof: {
        method: "signature",
        deliveredAt: "2026-08-22T14:58:00.000Z",
        reference: "POD-2026-42",
      },
      occurredAt: "2026-08-22T15:00:00.000Z",
    },
    actualCostEntries: [
      {
        id: ids.supplierCost,
        tenantId: 9,
        orderId: ids.order,
        direction: "cost",
        category: "supplier",
        currencyCode: "XOF",
        amountMinor: "10000",
        entryHash: "d".repeat(64),
      },
      {
        id: ids.freightCost,
        tenantId: 9,
        orderId: ids.order,
        direction: "cost",
        category: "freight",
        currencyCode: "XOF",
        amountMinor: "1200",
        entryHash: "e".repeat(64),
      },
      {
        id: ids.reversal,
        tenantId: 9,
        orderId: ids.order,
        direction: "reversal",
        category: "freight",
        currencyCode: "XOF",
        amountMinor: "200",
        entryHash: "f".repeat(64),
      },
    ],
  };
}

test("actual-cost entries are deterministic, exact, private, and immutable by design", () => {
  const first = buildIndustrialActualCostEntryDraft(validActualCostInput());
  const second = buildIndustrialActualCostEntryDraft(validActualCostInput());
  assert.equal(first.entryHash, second.entryHash);
  assert.match(first.entryHash, /^[a-f0-9]{64}$/);
  assert.equal(first.amountMinor, "10000");
  assert.equal(first.currencyCode, "XOF");
  assert.equal(first.externalAccountingPosted, false);
  assert.equal(first.externalAccountingReference, null);

  const floating = validActualCostInput();
  floating.entry.amountMinor = "100.50";
  assert.throws(
    () => buildIndustrialActualCostEntryDraft(floating),
    (error: unknown) =>
      error instanceof IndustrialDeliveryAccountingPolicyError &&
      error.code === "industrial_delivery_accounting_exact_amount_required",
  );
});

test("service costs require matching fulfillment lineage and supplier cost requires the approved internal package", () => {
  const supplier = validActualCostInput();
  supplier.supplierPurchaseOrderPackage.status = "approval_required";
  assert.throws(
    () => buildIndustrialActualCostEntryDraft(supplier),
    (error: unknown) =>
      error instanceof IndustrialDeliveryAccountingPolicyError &&
      error.code === "industrial_actual_cost_supplier_package_invalid",
  );

  const freight = validActualCostInput() as any;
  freight.entry.category = "freight";
  freight.fulfillmentService = {
    id: ids.freightService,
    tenantId: 9,
    orderId: ids.order,
    planId: ids.plan,
    serviceType: "inspection",
  };
  assert.throws(
    () => buildIndustrialActualCostEntryDraft(freight),
    (error: unknown) =>
      error instanceof IndustrialDeliveryAccountingPolicyError &&
      error.code === "industrial_actual_cost_service_lineage_invalid",
  );
});

test("recognition calculates exact actual margin and variances only after proof-backed delivery", () => {
  const first = buildIndustrialRevenueRecognitionDraft(validRecognitionInput());
  const second = buildIndustrialRevenueRecognitionDraft(validRecognitionInput());
  assert.equal(first.recognitionHash, second.recognitionHash);
  assert.equal(first.revenueMinor, "15000");
  assert.equal(first.actualCostMinor, "11000");
  assert.equal(first.actualGrossMarginMinor, "4000");
  assert.equal(first.costVarianceMinor, "500");
  assert.equal(first.marginVarianceMinor, "-500");
  assert.equal(first.externalJournalPosted, false);

  const notDelivered = validRecognitionInput();
  notDelivered.fulfillmentPlan.status = "last_mile";
  notDelivered.fulfillmentPlan.deliveredAt = null as any;
  assert.throws(
    () => buildIndustrialRevenueRecognitionDraft(notDelivered),
    (error: unknown) =>
      error instanceof IndustrialDeliveryAccountingPolicyError &&
      error.code === "industrial_revenue_recognition_delivery_required",
  );
});

test("recognition fails closed on payment, currency, supplier-cost, and delivery-proof mismatches", () => {
  const mutations: Array<
    [string, (input: ReturnType<typeof validRecognitionInput>) => void]
  > = [
    ["industrial_revenue_recognition_revenue_mismatch", (input) => {
      input.payment.amount = "14999";
    }],
    ["industrial_revenue_recognition_currency_mismatch", (input) => {
      input.actualCostEntries[0].currencyCode = "USD";
    }],
    ["industrial_revenue_recognition_cost_ledger_incomplete", (input) => {
      input.actualCostEntries[0].category = "other";
    }],
    ["industrial_revenue_recognition_delivery_proof_invalid", (input) => {
      input.deliveryProofEvent.proof = {};
    }],
  ];
  for (const [code, mutate] of mutations) {
    const input = validRecognitionInput();
    mutate(input);
    assert.throws(
      () => buildIndustrialRevenueRecognitionDraft(input),
      (error: unknown) =>
        error instanceof IndustrialDeliveryAccountingPolicyError &&
        error.code === code,
      code,
    );
  }
});

test("recognition approval requires every evidence and separation control", () => {
  const draft = buildIndustrialRevenueRecognitionDraft(validRecognitionInput());
  const checklist = Object.fromEntries(
    INDUSTRIAL_REVENUE_RECOGNITION_CHECKLIST.map((key) => [key, true]),
  );
  const parsed = parseIndustrialRevenueRecognitionApproval({
    expectedRecognitionHash: draft.recognitionHash,
    reason:
      "Approved after reconciling exact payment, actual costs, delivery proof, revenue, and margin.",
    checklist,
  });
  assert.equal(parsed.expectedRecognitionHash, draft.recognitionHash);
  assert.equal(Object.values(parsed.checklist).every(Boolean), true);
  assert.throws(
    () =>
      parseIndustrialRevenueRecognitionApproval({
        expectedRecognitionHash: draft.recognitionHash,
        reason: "This recognition reason is sufficiently documented.",
        checklist: { ...checklist, externalJournalSeparated: false },
      }),
    (error: unknown) =>
      error instanceof IndustrialDeliveryAccountingPolicyError &&
      error.code === "industrial_revenue_recognition_checklist_incomplete",
  );
});

test("schema, migration, routes, and native deal room enforce delivery-bound private accounting", async () => {
  const [schema, migration, service, routes, dealRoom] = await Promise.all([
    readFile(
      new URL("../db/schema/exportunity-delivery-accounting.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../db/migrations/20270605_exportunity_delivery_accounting.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../server/lib/industrial/deliveryAccounting.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../server/routes/industrial.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../client/src/components/exportunity/IndustrialCommercialDealRoom.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  for (const source of [schema, migration]) {
    assert.match(source, /actual_cost_minor/);
    assert.match(source, /actual_gross_margin_minor/);
    assert.match(source, /delivery_proof_event_id/);
    assert.match(source, /external_journal_posted/);
    assert.match(source, /external_journal_reference/);
  }
  assert.match(migration, /industrial_actual_cost_entries_are_immutable/);
  assert.match(migration, /fp\.status = 'delivered'/);
  assert.match(migration, /fe\.event_type = 'delivery_proof_recorded'/);
  assert.match(service, /industrial_delivery_accounting\.revenue_recognized/);
  assert.match(service, /externalJournalPosted: false/);
  assert.doesNotMatch(
    service,
    /sendMail|sendSms|sendWhatsApp|createCharge|postJournal|createBooking/,
  );
  assert.match(routes, /\/accounting\/actual-costs/);
  assert.match(routes, /\/accounting\/recognition\/prepare/);
  assert.match(
    routes,
    /\/accounting\/recognition\/:recognitionId\/approve"[\s\S]{0,120}ensureTenantAdmin/,
  );
  assert.match(dealRoom, /Actual cost and delivery accounting/);
  assert.match(dealRoom, /No external journal/);
  assert.match(dealRoom, /Prepare recognition/);
});
