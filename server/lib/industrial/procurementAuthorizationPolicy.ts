import { createHash } from "node:crypto";

import { commercialOfferSourceEvidenceMatches } from "../exportunity/commercialOfferPolicy";

export const INDUSTRIAL_PROCUREMENT_APPROVAL_CHECKLIST = [
  "paymentEvidenceMatches",
  "supplierQuoteEvidenceMatches",
  "supplierTermsReconfirmed",
  "amountsReconciled",
  "tenantScopeConfirmed",
  "internalProcurementOnly",
  "externalSupplierActionSeparated",
] as const;

export type IndustrialProcurementApprovalChecklistKey =
  (typeof INDUSTRIAL_PROCUREMENT_APPROVAL_CHECKLIST)[number];

export class IndustrialProcurementPolicyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 409,
  ) {
    super(message);
  }
}

function requiredText(value: unknown, field: string, maximum = 500) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_source_incomplete",
      `${field} is required before procurement can be prepared.`,
    );
  }
  if (normalized.length > maximum) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_source_invalid",
      `${field} exceeds the supported length.`,
      422,
    );
  }
  return normalized;
}

function exactMinor(value: unknown, field: string) {
  const normalized = String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d*)$/.test(normalized)) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_exact_amount_required",
      `${field} must be a non-negative integer minor-unit amount.`,
      422,
    );
  }
  return { text: normalized, value: BigInt(normalized) };
}

function currency(value: unknown) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_currency_invalid",
      "A three-letter currency code is required.",
      422,
    );
  }
  return normalized;
}

function dateOrNull(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function stableHash(value: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function buildIndustrialProcurementAuthorizationDraft(input: {
  now?: Date;
  tenantId: number;
  order: {
    id: unknown;
    tenantId: unknown;
    quoteId: unknown;
    status: unknown;
    paymentStatus: unknown;
    lastPaymentId: unknown;
    currencyCode: unknown;
    totalAmountMinor: unknown;
    sourcePricingHash: unknown;
    orderConfirmationHash: unknown;
  };
  payment: {
    id: unknown;
    tenantId: unknown;
    status: unknown;
    amount: unknown;
    currency: unknown;
    purpose: unknown;
    targetId: unknown;
  };
  customerQuote: {
    id: unknown;
    tenantId: unknown;
    status: unknown;
    pricingHash: unknown;
    sourceSupplierQuoteId: unknown;
    supplierCostMinor: unknown;
    additionalCostsMinor: unknown;
    totalCostMinor: unknown;
    marginMinor: unknown;
    customerPriceMinor: unknown;
    currencyCode: unknown;
    costStack: unknown;
  };
  supplierQuote: {
    id: unknown;
    tenantId: unknown;
    supplierProfileId: unknown;
    status: unknown;
    offerPreparationReady: unknown;
    quoteHash: unknown;
    referenceCode: unknown;
    supplierQuoteReference?: unknown;
    legacyValidUntil?: unknown;
    validity?: unknown;
    paymentTerms?: unknown;
    incoterm?: unknown;
  };
  supplierProfile: {
    id: unknown;
    tenantId: unknown;
    supplierStatus: unknown;
    verificationStatus: unknown;
    visibility: unknown;
  };
  fulfillmentPlan: {
    id: unknown;
    tenantId: unknown;
    orderId: unknown;
    status: unknown;
  };
  procurementService: {
    id: unknown;
    tenantId: unknown;
    orderId: unknown;
    planId: unknown;
    serviceType: unknown;
    status: unknown;
  };
}) {
  const now = input.now || new Date();
  const tenantId = Number(input.tenantId);
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_tenant_invalid",
      "A valid Exportunity tenant is required.",
      400,
    );
  }

  const tenantValues = [
    input.order.tenantId,
    input.payment.tenantId,
    input.customerQuote.tenantId,
    input.supplierQuote.tenantId,
    input.supplierProfile.tenantId,
    input.fulfillmentPlan.tenantId,
    input.procurementService.tenantId,
  ].map(Number);
  if (tenantValues.some((value) => value !== tenantId)) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_cross_tenant_forbidden",
      "Procurement evidence must belong to the same Exportunity tenant.",
      403,
    );
  }

  const orderId = requiredText(input.order.id, "orderId");
  const customerQuoteId = requiredText(input.customerQuote.id, "customerQuoteId");
  const supplierQuoteId = requiredText(input.supplierQuote.id, "supplierQuoteId");
  const supplierProfileId = requiredText(
    input.supplierQuote.supplierProfileId,
    "supplierProfileId",
  );
  const currentSupplierProfileId = requiredText(
    input.supplierProfile.id,
    "currentSupplierProfileId",
  );
  const planId = requiredText(input.fulfillmentPlan.id, "fulfillmentPlanId");
  const serviceId = requiredText(
    input.procurementService.id,
    "procurementServiceId",
  );
  const paymentId = requiredText(input.payment.id, "sourcePaymentId");

  if (
    String(input.order.quoteId || "") !== customerQuoteId ||
    String(input.customerQuote.sourceSupplierQuoteId || "") !== supplierQuoteId ||
    supplierProfileId !== currentSupplierProfileId ||
    String(input.fulfillmentPlan.orderId || "") !== orderId ||
    String(input.procurementService.orderId || "") !== orderId ||
    String(input.procurementService.planId || "") !== planId ||
    String(input.payment.targetId || "") !== orderId
  ) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_lineage_mismatch",
      "The order, payment, quote, supplier, and fulfillment lineage does not match.",
    );
  }

  if (!['confirmed', 'procurement'].includes(String(input.order.status || ""))) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_order_status_invalid",
      "Only a confirmed paid industrial order can enter procurement.",
    );
  }
  if (String(input.order.paymentStatus || "").toLowerCase() !== "paid") {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_payment_required",
      "Verified customer payment is required before procurement can be prepared.",
    );
  }
  if (
    String(input.payment.status || "").toLowerCase() !== "succeeded" ||
    String(input.payment.purpose || "").toUpperCase() !==
      "INDUSTRIAL_ORDER_PAYMENT" ||
    String(input.order.lastPaymentId || "") !== paymentId
  ) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_payment_evidence_invalid",
      "The canonical successful industrial payment record is required.",
    );
  }
  if (String(input.customerQuote.status || "") !== "accepted") {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_customer_offer_invalid",
      "The customer offer must remain accepted before procurement is prepared.",
    );
  }
  if (
    String(input.supplierQuote.status || "") !== "qualified" ||
    input.supplierQuote.offerPreparationReady !== true
  ) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_supplier_quote_not_qualified",
      "The source supplier quote is not qualified for procurement.",
    );
  }
  if (
    String(input.supplierProfile.supplierStatus || "") !== "active" ||
    String(input.supplierProfile.verificationStatus || "") !== "verified" ||
    String(input.supplierProfile.visibility || "") !== "exportunity_internal"
  ) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_supplier_profile_not_ready",
      "The quoted supplier profile must remain active, verified, and Exportunity-internal before procurement can be prepared.",
    );
  }
  if (
    !["release_review", "procurement"].includes(
      String(input.fulfillmentPlan.status || ""),
    )
  ) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_fulfillment_status_invalid",
      "The fulfillment plan is not at the procurement-release boundary.",
    );
  }
  if (
    String(input.procurementService.serviceType || "") !== "procurement" ||
    !["approved", "in_progress"].includes(
      String(input.procurementService.status || ""),
    )
  ) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_service_approval_required",
      "The accountable procurement service must be approved first.",
    );
  }

  const sourcePricingHash = requiredText(
    input.customerQuote.pricingHash,
    "sourcePricingHash",
  );
  const orderPricingHash = requiredText(
    input.order.sourcePricingHash,
    "orderSourcePricingHash",
  );
  const sourceSupplierQuoteHash = requiredText(
    input.supplierQuote.quoteHash,
    "sourceSupplierQuoteHash",
  );
  const sourceOrderConfirmationHash = requiredText(
    input.order.orderConfirmationHash,
    "sourceOrderConfirmationHash",
  );
  if (sourcePricingHash !== orderPricingHash) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_pricing_hash_mismatch",
      "The accepted order no longer matches the canonical pricing hash.",
    );
  }
  if (
    !commercialOfferSourceEvidenceMatches(
      input.customerQuote.costStack,
      supplierQuoteId,
      sourceSupplierQuoteHash,
    )
  ) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_supplier_evidence_stale",
      "The supplier quote evidence changed after customer pricing was approved.",
    );
  }

  const orderCurrency = currency(input.order.currencyCode);
  const quoteCurrency = currency(input.customerQuote.currencyCode);
  const paymentCurrency = currency(input.payment.currency);
  if (orderCurrency !== quoteCurrency || orderCurrency !== paymentCurrency) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_currency_mismatch",
      "Order, payment, and pricing currency must match exactly.",
    );
  }

  const supplierCost = exactMinor(
    input.customerQuote.supplierCostMinor,
    "supplierCostMinor",
  );
  const additionalCosts = exactMinor(
    input.customerQuote.additionalCostsMinor,
    "additionalCostsMinor",
  );
  const totalCost = exactMinor(
    input.customerQuote.totalCostMinor,
    "totalCostMinor",
  );
  const margin = exactMinor(input.customerQuote.marginMinor, "marginMinor");
  const customerPrice = exactMinor(
    input.customerQuote.customerPriceMinor,
    "customerPriceMinor",
  );
  const orderTotal = exactMinor(input.order.totalAmountMinor, "orderTotalMinor");
  const paymentTotal = exactMinor(input.payment.amount, "paymentAmountMinor");
  if (supplierCost.value + additionalCosts.value !== totalCost.value) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_cost_stack_mismatch",
      "Supplier and additional costs do not equal the canonical total cost.",
    );
  }
  if (totalCost.value + margin.value !== customerPrice.value) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_margin_mismatch",
      "The canonical total cost and margin do not equal the customer price.",
    );
  }
  if (
    customerPrice.value <= 0n ||
    orderTotal.value !== customerPrice.value ||
    paymentTotal.value !== customerPrice.value
  ) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_payment_amount_mismatch",
      "The successful payment must equal the exact accepted customer price.",
    );
  }

  const validUntil = dateOrNull(input.supplierQuote.legacyValidUntil);
  const supplierTermsRequireReconfirmation =
    !validUntil || validUntil.getTime() <= now.getTime();
  const sourceSnapshot = {
    orderId,
    customerQuoteId,
    supplierQuoteId,
    supplierProfileId,
    fulfillmentPlanId: planId,
    procurementServiceId: serviceId,
    sourcePaymentId: paymentId,
    currencyCode: orderCurrency,
    supplierCostMinor: supplierCost.text,
    additionalCostsMinor: additionalCosts.text,
    totalCostMinor: totalCost.text,
    marginMinor: margin.text,
    customerPriceMinor: customerPrice.text,
    sourcePricingHash,
    sourceSupplierQuoteHash,
    sourceOrderConfirmationHash,
    supplierQuoteReference:
      String(
        input.supplierQuote.supplierQuoteReference ||
          input.supplierQuote.referenceCode ||
          "",
      ).trim() || null,
    supplierQuoteValidUntil: validUntil?.toISOString() || null,
    supplierQuoteValidityText:
      String(input.supplierQuote.validity || "").trim() || null,
    supplierPaymentTerms:
      String(input.supplierQuote.paymentTerms || "").trim() || null,
    supplierIncoterm:
      String(input.supplierQuote.incoterm || "").trim() || null,
    supplierTermsRequireReconfirmation,
    externalActionExecuted: false,
    supplierContacted: false,
    supplierCommitmentCreated: false,
  };

  return {
    ...sourceSnapshot,
    releaseHash: stableHash(sourceSnapshot),
  };
}

export function parseIndustrialProcurementApprovalInput(value: unknown) {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const expectedReleaseHash = String(source.expectedReleaseHash || "").trim();
  const reason = String(source.reason || "").trim();
  const checklistSource =
    source.checklist &&
    typeof source.checklist === "object" &&
    !Array.isArray(source.checklist)
      ? (source.checklist as Record<string, unknown>)
      : {};
  if (!/^[a-f0-9]{64}$/.test(expectedReleaseHash)) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_release_hash_required",
      "The current procurement release hash is required.",
      422,
    );
  }
  if (reason.length < 12 || reason.length > 1200) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_approval_reason_required",
      "Document an approval reason between 12 and 1200 characters.",
      422,
    );
  }
  const checklist = Object.fromEntries(
    INDUSTRIAL_PROCUREMENT_APPROVAL_CHECKLIST.map((key) => [
      key,
      checklistSource[key] === true,
    ]),
  ) as Record<IndustrialProcurementApprovalChecklistKey, boolean>;
  const missing = INDUSTRIAL_PROCUREMENT_APPROVAL_CHECKLIST.filter(
    (key) => checklist[key] !== true,
  );
  if (missing.length) {
    throw new IndustrialProcurementPolicyError(
      "industrial_procurement_approval_checklist_incomplete",
      `Complete the procurement approval checklist: ${missing.join(", ")}.`,
      422,
    );
  }
  return { expectedReleaseHash, reason, checklist };
}
