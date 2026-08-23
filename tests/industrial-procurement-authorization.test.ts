import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildIndustrialProcurementAuthorizationDraft,
  INDUSTRIAL_PROCUREMENT_APPROVAL_CHECKLIST,
  IndustrialProcurementPolicyError,
  parseIndustrialProcurementApprovalInput,
} from "../server/lib/industrial/procurementAuthorizationPolicy";

const orderId = "11111111-1111-4111-8111-111111111111";
const customerQuoteId = "22222222-2222-4222-8222-222222222222";
const supplierQuoteId = "33333333-3333-4333-8333-333333333333";
const supplierProfileId = "44444444-4444-4444-8444-444444444444";
const planId = "55555555-5555-4555-8555-555555555555";
const serviceId = "66666666-6666-4666-8666-666666666666";
const paymentId = "77777777-7777-4777-8777-777777777777";
const pricingHash = "a".repeat(64);
const supplierHash = "b".repeat(64);
const confirmationHash = "c".repeat(64);

function validInput() {
  return {
    now: new Date("2026-08-22T10:00:00.000Z"),
    tenantId: 2,
    order: {
      id: orderId,
      tenantId: 2,
      quoteId: customerQuoteId,
      status: "confirmed",
      paymentStatus: "paid",
      lastPaymentId: paymentId,
      currencyCode: "USD",
      totalAmountMinor: "15125",
      sourcePricingHash: pricingHash,
      orderConfirmationHash: confirmationHash,
    },
    payment: {
      id: paymentId,
      tenantId: 2,
      status: "succeeded",
      amount: 15125,
      currency: "USD",
      purpose: "INDUSTRIAL_ORDER_PAYMENT",
      targetId: orderId,
    },
    customerQuote: {
      id: customerQuoteId,
      tenantId: 2,
      status: "accepted",
      pricingHash,
      sourceSupplierQuoteId: supplierQuoteId,
      supplierCostMinor: "10001",
      additionalCostsMinor: "1999",
      totalCostMinor: "12000",
      marginMinor: "3125",
      customerPriceMinor: "15125",
      currencyCode: "USD",
      costStack: [
        {
          code: "supplier_base",
          amountMinor: "10001",
          evidenceReference: `supplier_quote:${supplierQuoteId}:${supplierHash}`,
        },
      ],
    },
    supplierQuote: {
      id: supplierQuoteId,
      tenantId: 2,
      supplierProfileId,
      status: "qualified",
      offerPreparationReady: true,
      quoteHash: supplierHash,
      referenceCode: "EXP-SQ-001",
      supplierQuoteReference: "SUP-2026-17",
      legacyValidUntil: "2026-09-30T00:00:00.000Z",
      validity: "Valid through 30 September 2026",
      paymentTerms: "30 percent deposit, balance before dispatch",
      incoterm: "FCA",
    },
    supplierProfile: {
      id: supplierProfileId,
      tenantId: 2,
      supplierStatus: "active",
      verificationStatus: "verified",
      visibility: "exportunity_internal",
    },
    fulfillmentPlan: {
      id: planId,
      tenantId: 2,
      orderId,
      status: "release_review",
    },
    procurementService: {
      id: serviceId,
      tenantId: 2,
      orderId,
      planId,
      serviceType: "procurement",
      status: "approved",
    },
  };
}

test("procurement draft binds paid order, accepted price, qualified supplier quote, and exact minor units", () => {
  const first = buildIndustrialProcurementAuthorizationDraft(validInput());
  const second = buildIndustrialProcurementAuthorizationDraft(validInput());
  assert.equal(first.releaseHash, second.releaseHash);
  assert.match(first.releaseHash, /^[a-f0-9]{64}$/);
  assert.equal(first.supplierCostMinor, "10001");
  assert.equal(first.additionalCostsMinor, "1999");
  assert.equal(first.totalCostMinor, "12000");
  assert.equal(first.marginMinor, "3125");
  assert.equal(first.customerPriceMinor, "15125");
  assert.equal(first.sourcePaymentId, paymentId);
  assert.equal(first.supplierTermsRequireReconfirmation, false);
  assert.equal(first.externalActionExecuted, false);
  assert.equal(first.supplierContacted, false);
  assert.equal(first.supplierCommitmentCreated, false);
});

test("procurement draft requires human reconfirmation when supplier validity is absent or expired", () => {
  const missing = validInput();
  missing.supplierQuote.legacyValidUntil = undefined as any;
  assert.equal(
    buildIndustrialProcurementAuthorizationDraft(missing)
      .supplierTermsRequireReconfirmation,
    true,
  );

  const expired = validInput();
  expired.supplierQuote.legacyValidUntil = "2026-08-21T00:00:00.000Z";
  assert.equal(
    buildIndustrialProcurementAuthorizationDraft(expired)
      .supplierTermsRequireReconfirmation,
    true,
  );
});

test("procurement draft fails closed on payment, currency, algebra, tenant, and supplier-evidence mismatches", () => {
  const mutations: Array<[string, (input: ReturnType<typeof validInput>) => void]> = [
    ["industrial_procurement_payment_amount_mismatch", (input) => {
      input.payment.amount = 15124;
    }],
    ["industrial_procurement_currency_mismatch", (input) => {
      input.payment.currency = "XOF";
    }],
    ["industrial_procurement_cost_stack_mismatch", (input) => {
      input.customerQuote.totalCostMinor = "11999";
    }],
    ["industrial_procurement_cross_tenant_forbidden", (input) => {
      input.supplierProfile.tenantId = 3;
    }],
    ["industrial_procurement_lineage_mismatch", (input) => {
      input.supplierProfile.id = "88888888-8888-4888-8888-888888888888";
    }],
    ["industrial_procurement_supplier_profile_not_ready", (input) => {
      input.supplierProfile.verificationStatus = "suspended";
    }],
    ["industrial_procurement_supplier_evidence_stale", (input) => {
      input.supplierQuote.quoteHash = "d".repeat(64);
    }],
  ];

  for (const [code, mutate] of mutations) {
    const input = validInput();
    mutate(input);
    assert.throws(
      () => buildIndustrialProcurementAuthorizationDraft(input),
      (error: unknown) =>
        error instanceof IndustrialProcurementPolicyError && error.code === code,
      code,
    );
  }
});

test("procurement approval requires the exact release hash, documented reason, and every separation control", () => {
  const draft = buildIndustrialProcurementAuthorizationDraft(validInput());
  const checklist = Object.fromEntries(
    INDUSTRIAL_PROCUREMENT_APPROVAL_CHECKLIST.map((key) => [key, true]),
  );
  const parsed = parseIndustrialProcurementApprovalInput({
    expectedReleaseHash: draft.releaseHash,
    reason:
      "Approved after reconciling paid customer amount, supplier evidence, and procurement responsibility.",
    checklist,
  });
  assert.equal(parsed.expectedReleaseHash, draft.releaseHash);
  assert.equal(
    Object.values(parsed.checklist).every((value) => value === true),
    true,
  );

  assert.throws(
    () =>
      parseIndustrialProcurementApprovalInput({
        expectedReleaseHash: draft.releaseHash,
        reason: "Long enough documented reason",
        checklist: { ...checklist, externalSupplierActionSeparated: false },
      }),
    (error: unknown) =>
      error instanceof IndustrialProcurementPolicyError &&
      error.code === "industrial_procurement_approval_checklist_incomplete",
  );
});

test("procurement schema, migration, service, routes, and native deal room preserve the non-executing boundary", async () => {
  const [schema, migration, service, routes, dealRoom] = await Promise.all([
    readFile(new URL("../db/schema/exportunity-procurement.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../db/migrations/20270524_exportunity_procurement_authorizations.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../server/lib/industrial/procurementAuthorization.ts",
        import.meta.url,
      ),
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
    assert.match(source, /supplier_cost_minor/);
    assert.match(source, /customer_price_minor/);
    assert.match(source, /no_external/);
    assert.match(source, /supplier_contacted/);
    assert.match(source, /supplier_commitment_created/);
  }
  assert.match(service, /industrial_procurement\.authorization_prepared/);
  assert.match(service, /industrial_procurement\.authorization_approved/);
  assert.match(service, /eventType: "procurement_released"/);
  assert.match(service, /externalActionExecuted: false/);
  assert.doesNotMatch(service, /sendMail|sendSms|sendWhatsApp|requestQuote|createBooking/);
  assert.match(routes, /\/admin\/orders\/:orderId\/procurement\/prepare/);
  assert.match(
    routes,
    /\/admin\/orders\/:orderId\/procurement\/:authorizationId\/approve/,
  );
  assert.match(routes, /ensureTenantAdmin/);
  assert.match(dealRoom, /procurementAuthorization/);
});
