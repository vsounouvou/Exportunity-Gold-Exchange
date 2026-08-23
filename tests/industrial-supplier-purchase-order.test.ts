import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildIndustrialSupplierPurchaseOrderPackageDraft,
  INDUSTRIAL_SUPPLIER_PO_APPROVAL_CHECKLIST,
  IndustrialSupplierPurchaseOrderPolicyError,
  parseIndustrialSupplierPurchaseOrderApproval,
} from "../server/lib/industrial/supplierPurchaseOrderPolicy";

const ids = {
  authorization: "11111111-1111-4111-8111-111111111111",
  order: "22222222-2222-4222-8222-222222222222",
  customerQuote: "33333333-3333-4333-8333-333333333333",
  supplierQuote: "44444444-4444-4444-8444-444444444444",
  supplierProfile: "55555555-5555-4555-8555-555555555555",
  plan: "66666666-6666-4666-8666-666666666666",
  service: "77777777-7777-4777-8777-777777777777",
  payment: "88888888-8888-4888-8888-888888888888",
};
const pricingHash = "a".repeat(64);
const supplierHash = "b".repeat(64);
const confirmationHash = "c".repeat(64);
const releaseHash = "d".repeat(64);

function validInput() {
  const commonDraft = {
    orderId: ids.order,
    customerQuoteId: ids.customerQuote,
    supplierQuoteId: ids.supplierQuote,
    supplierProfileId: ids.supplierProfile,
    fulfillmentPlanId: ids.plan,
    procurementServiceId: ids.service,
    sourcePaymentId: ids.payment,
    currencyCode: "USD",
    supplierCostMinor: "10001",
    sourcePricingHash: pricingHash,
    sourceSupplierQuoteHash: supplierHash,
    sourceOrderConfirmationHash: confirmationHash,
    releaseHash,
  };
  return {
    now: new Date("2026-08-22T12:00:00.000Z"),
    tenantId: 2,
    procurementAuthorization: {
      id: ids.authorization,
      tenantId: 2,
      ...commonDraft,
      status: "approved",
      externalActionExecuted: false,
      supplierContacted: false,
      supplierCommitmentCreated: false,
      externalReference: null,
    },
    procurementDraft: commonDraft,
    order: { id: ids.order, tenantId: 2, status: "procurement" },
    supplierQuote: {
      id: ids.supplierQuote,
      tenantId: 2,
      supplierProfileId: ids.supplierProfile,
      status: "qualified",
      offerPreparationReady: true,
      currencyCode: "USD",
      totalAmount: "USD 100.01",
      productName: "Refined palm oil",
      specification: "RBD palm olein, food grade",
      offeredQuantity: "100 t",
      unitOfMeasure: "metric tonne",
      unitPrice: "USD 1.0001/kg",
      packaging: "Flexitank",
      leadTime: "21 days after order acceptance",
      incoterm: "CIF",
      paymentTerms: "30% deposit, 70% before dispatch",
      destination: "Port of Cotonou, Benin",
      countryOfOrigin: "Côte d'Ivoire",
      warranty: "Conformity to attached specification",
      supplierQuoteReference: "SUP-2026-17",
      legacyValidUntil: "2026-09-30T00:00:00.000Z",
      quoteHash: supplierHash,
    },
    supplierProfile: {
      id: ids.supplierProfile,
      tenantId: 2,
      supplierStatus: "active",
      verificationStatus: "verified",
      visibility: "exportunity_internal",
    },
    fulfillmentPlan: {
      id: ids.plan,
      tenantId: 2,
      orderId: ids.order,
      status: "procurement",
    },
    procurementService: {
      id: ids.service,
      tenantId: 2,
      orderId: ids.order,
      planId: ids.plan,
      serviceType: "procurement",
      status: "in_progress",
    },
  };
}

test("supplier purchase-order package binds the approved procurement release and exact supplier total", () => {
  const first = buildIndustrialSupplierPurchaseOrderPackageDraft(validInput());
  const second = buildIndustrialSupplierPurchaseOrderPackageDraft(validInput());
  assert.equal(first.packageHash, second.packageHash);
  assert.match(first.packageHash, /^[a-f0-9]{64}$/);
  assert.equal(first.supplierTotalMinor, "10001");
  assert.equal(first.productName, "Refined palm oil");
  assert.equal(first.offeredQuantity, "100 t");
  assert.equal(first.destination, "Port of Cotonou, Benin");
  assert.equal(first.sourcePaymentId, ids.payment);
  assert.equal(first.procurementReleaseHash, releaseHash);
  assert.equal(first.externalActionExecuted, false);
  assert.equal(first.transmittedToSupplier, false);
  assert.equal(first.supplierAccepted, false);
  assert.equal(first.externalPurchaseOrderReference, null);
});

test("supplier purchase-order preparation requires a current source-backed expiry date", () => {
  const missing = validInput();
  missing.supplierQuote.legacyValidUntil = null as any;
  assert.throws(
    () => buildIndustrialSupplierPurchaseOrderPackageDraft(missing),
    (error: unknown) =>
      error instanceof IndustrialSupplierPurchaseOrderPolicyError &&
      error.code === "industrial_supplier_po_supplier_validity_required",
  );

  const expired = validInput();
  expired.supplierQuote.legacyValidUntil = "2026-08-21T00:00:00.000Z";
  assert.throws(
    () => buildIndustrialSupplierPurchaseOrderPackageDraft(expired),
    (error: unknown) =>
      error instanceof IndustrialSupplierPurchaseOrderPolicyError &&
      error.code === "industrial_supplier_po_supplier_terms_expired",
  );
});

test("supplier purchase-order preparation fails closed on amount, currency, tenant, lineage, and external-state mismatches", () => {
  const mutations: Array<
    [string, (input: ReturnType<typeof validInput>) => void]
  > = [
    ["industrial_supplier_po_supplier_total_mismatch", (input) => {
      input.supplierQuote.totalAmount = "USD 100.02";
    }],
    ["industrial_supplier_po_currency_mismatch", (input) => {
      input.supplierQuote.currencyCode = "XOF";
    }],
    ["industrial_supplier_po_cross_tenant_forbidden", (input) => {
      input.supplierProfile.tenantId = 3;
    }],
    ["industrial_supplier_po_lineage_mismatch", (input) => {
      input.supplierQuote.supplierProfileId = ids.order;
    }],
    ["industrial_supplier_po_procurement_boundary_invalid", (input) => {
      input.procurementAuthorization.supplierContacted = true;
    }],
    ["industrial_supplier_po_supplier_profile_not_ready", (input) => {
      input.supplierProfile.supplierStatus = "suspended";
    }],
  ];
  for (const [code, mutate] of mutations) {
    const input = validInput();
    mutate(input);
    assert.throws(
      () => buildIndustrialSupplierPurchaseOrderPackageDraft(input),
      (error: unknown) =>
        error instanceof IndustrialSupplierPurchaseOrderPolicyError &&
        error.code === code,
      code,
    );
  }
});

test("supplier purchase-order approval requires the exact package hash and every separation control", () => {
  const draft = buildIndustrialSupplierPurchaseOrderPackageDraft(validInput());
  const checklist = Object.fromEntries(
    INDUSTRIAL_SUPPLIER_PO_APPROVAL_CHECKLIST.map((key) => [key, true]),
  );
  const parsed = parseIndustrialSupplierPurchaseOrderApproval({
    expectedPackageHash: draft.packageHash,
    reason:
      "Approved after reviewing current supplier terms, exact total, product, quantity, and destination.",
    checklist,
  });
  assert.equal(parsed.expectedPackageHash, draft.packageHash);
  assert.equal(Object.values(parsed.checklist).every(Boolean), true);
  assert.throws(
    () =>
      parseIndustrialSupplierPurchaseOrderApproval({
        expectedPackageHash: draft.packageHash,
        reason: "Documented approval reason is long enough",
        checklist: { ...checklist, externalSubmissionSeparated: false },
      }),
    (error: unknown) =>
      error instanceof IndustrialSupplierPurchaseOrderPolicyError &&
      error.code === "industrial_supplier_po_approval_checklist_incomplete",
  );
});

test("supplier purchase-order schema, migration, routes, and native workbench cannot claim external execution", async () => {
  const [schema, migration, service, routes, dealRoom] = await Promise.all([
    readFile(
      new URL(
        "../db/schema/exportunity-supplier-purchase-orders.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../db/migrations/20270525_exportunity_supplier_purchase_order_packages.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../server/lib/industrial/supplierPurchaseOrder.ts",
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
    assert.match(source, /supplier_total_minor/);
    assert.match(source, /no_external/);
    assert.match(source, /transmitted_to_supplier/);
    assert.match(source, /supplier_accepted/);
    assert.match(source, /external_purchase_order_reference/);
  }
  assert.match(
    service,
    /industrial_supplier_purchase_order\.package_prepared/,
  );
  assert.match(
    service,
    /industrial_supplier_purchase_order\.package_approved/,
  );
  assert.match(service, /externalActionExecuted: false/);
  assert.match(service, /transmittedToSupplier: false/);
  assert.match(service, /supplierAccepted: false/);
  assert.doesNotMatch(
    service,
    /sendMail|sendSms|sendWhatsApp|createCharge|requestQuote|createBooking/,
  );
  assert.match(
    routes,
    /\/procurement\/purchase-order-package\/prepare/,
  );
  assert.match(
    routes,
    /\/procurement\/purchase-order-package\/:packageId\/approve/,
  );
  assert.match(
    routes,
    /purchase-order-package\/:packageId\/approve"[\s\S]{0,120}ensureTenantAdmin/,
  );
  assert.match(dealRoom, /supplierPurchaseOrderPackage/);
  assert.match(dealRoom, /Internal package — not issued/);
  assert.match(dealRoom, /Not transmitted/);
  assert.match(dealRoom, /No supplier acceptance/);
});
