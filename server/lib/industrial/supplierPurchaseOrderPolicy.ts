import { createHash } from "node:crypto";

import { parseQuotedMoneyToMinorUnits } from "../exportunity/commercialOfferPolicy";

export const INDUSTRIAL_SUPPLIER_PO_APPROVAL_CHECKLIST = [
  "paidOrderEvidenceMatches",
  "procurementAuthorizationMatches",
  "supplierQuoteCurrentAndValid",
  "productQuantityDestinationReviewed",
  "supplierTermsReviewed",
  "exactSupplierTotalReconciled",
  "tenantScopeConfirmed",
  "internalPackageOnly",
  "externalSubmissionSeparated",
] as const;

export type IndustrialSupplierPoApprovalChecklistKey =
  (typeof INDUSTRIAL_SUPPLIER_PO_APPROVAL_CHECKLIST)[number];

export class IndustrialSupplierPurchaseOrderPolicyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 409,
  ) {
    super(message);
  }
}

function requiredText(value: unknown, field: string, maximum = 1000) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_source_incomplete",
      `${field} is required before a supplier purchase-order package can be prepared.`,
    );
  }
  if (normalized.length > maximum) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_source_invalid",
      `${field} exceeds the supported length.`,
      422,
    );
  }
  return normalized;
}

function optionalText(value: unknown, maximum = 1000) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length > maximum) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_source_invalid",
      "A supplier purchase-order field exceeds the supported length.",
      422,
    );
  }
  return normalized;
}

function exactMinor(value: unknown, field: string) {
  const normalized = String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d*)$/.test(normalized)) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_exact_amount_required",
      `${field} must be a non-negative integer minor-unit amount.`,
      422,
    );
  }
  return { text: normalized, value: BigInt(normalized) };
}

function currency(value: unknown) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_currency_invalid",
      "A three-letter supplier currency is required.",
      422,
    );
  }
  return normalized;
}

function hash(value: unknown, field: string) {
  const normalized = requiredText(value, field, 64);
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_hash_invalid",
      `${field} must be a canonical SHA-256 hash.`,
      422,
    );
  }
  return normalized;
}

function stableHash(value: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validFutureDate(value: unknown, now: Date) {
  const parsed = value ? new Date(String(value)) : null;
  if (!parsed || !Number.isFinite(parsed.getTime())) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_supplier_validity_required",
      "A source-backed supplier quote expiry date is required before preparing a purchase-order package.",
    );
  }
  if (parsed.getTime() <= now.getTime()) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_supplier_terms_expired",
      "The supplier quote has expired. Reconfirm it through canonical supplier evidence before preparing a purchase-order package.",
    );
  }
  return parsed;
}

export function buildIndustrialSupplierPurchaseOrderPackageDraft(input: {
  now?: Date;
  tenantId: number;
  procurementAuthorization: {
    id: unknown;
    tenantId: unknown;
    orderId: unknown;
    customerQuoteId: unknown;
    supplierQuoteId: unknown;
    supplierProfileId: unknown;
    fulfillmentPlanId: unknown;
    procurementServiceId: unknown;
    sourcePaymentId: unknown;
    status: unknown;
    currencyCode: unknown;
    supplierCostMinor: unknown;
    sourcePricingHash: unknown;
    sourceSupplierQuoteHash: unknown;
    sourceOrderConfirmationHash: unknown;
    releaseHash: unknown;
    externalActionExecuted: unknown;
    supplierContacted: unknown;
    supplierCommitmentCreated: unknown;
    externalReference?: unknown;
  };
  procurementDraft: {
    orderId: unknown;
    customerQuoteId: unknown;
    supplierQuoteId: unknown;
    supplierProfileId: unknown;
    fulfillmentPlanId: unknown;
    procurementServiceId: unknown;
    sourcePaymentId: unknown;
    currencyCode: unknown;
    supplierCostMinor: unknown;
    sourcePricingHash: unknown;
    sourceSupplierQuoteHash: unknown;
    sourceOrderConfirmationHash: unknown;
    releaseHash: unknown;
  };
  order: { id: unknown; tenantId: unknown; status: unknown };
  supplierQuote: {
    id: unknown;
    tenantId: unknown;
    supplierProfileId: unknown;
    status: unknown;
    offerPreparationReady: unknown;
    currencyCode: unknown;
    totalAmount: unknown;
    productName: unknown;
    specification: unknown;
    offeredQuantity: unknown;
    unitOfMeasure: unknown;
    unitPrice?: unknown;
    packaging?: unknown;
    leadTime: unknown;
    incoterm: unknown;
    paymentTerms: unknown;
    destination: unknown;
    countryOfOrigin?: unknown;
    warranty?: unknown;
    supplierQuoteReference: unknown;
    legacyValidUntil: unknown;
    quoteHash: unknown;
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
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_tenant_invalid",
      "A valid Exportunity tenant is required.",
      400,
    );
  }
  const tenantValues = [
    input.procurementAuthorization.tenantId,
    input.order.tenantId,
    input.supplierQuote.tenantId,
    input.supplierProfile.tenantId,
    input.fulfillmentPlan.tenantId,
    input.procurementService.tenantId,
  ].map(Number);
  if (tenantValues.some((value) => value !== tenantId)) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_cross_tenant_forbidden",
      "The purchase-order package evidence must belong to one Exportunity tenant.",
      403,
    );
  }

  const authorizationId = requiredText(
    input.procurementAuthorization.id,
    "procurementAuthorizationId",
  );
  const orderId = requiredText(input.order.id, "orderId");
  const customerQuoteId = requiredText(
    input.procurementAuthorization.customerQuoteId,
    "customerQuoteId",
  );
  const supplierQuoteId = requiredText(input.supplierQuote.id, "supplierQuoteId");
  const supplierProfileId = requiredText(
    input.supplierProfile.id,
    "supplierProfileId",
  );
  const planId = requiredText(input.fulfillmentPlan.id, "fulfillmentPlanId");
  const serviceId = requiredText(
    input.procurementService.id,
    "procurementServiceId",
  );
  const paymentId = requiredText(
    input.procurementAuthorization.sourcePaymentId,
    "sourcePaymentId",
  );

  if (
    String(input.procurementAuthorization.orderId || "") !== orderId ||
    String(input.procurementAuthorization.supplierQuoteId || "") !==
      supplierQuoteId ||
    String(input.procurementAuthorization.supplierProfileId || "") !==
      supplierProfileId ||
    String(input.procurementAuthorization.fulfillmentPlanId || "") !== planId ||
    String(input.procurementAuthorization.procurementServiceId || "") !==
      serviceId ||
    String(input.supplierQuote.supplierProfileId || "") !== supplierProfileId ||
    String(input.fulfillmentPlan.orderId || "") !== orderId ||
    String(input.procurementService.orderId || "") !== orderId ||
    String(input.procurementService.planId || "") !== planId
  ) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_lineage_mismatch",
      "The order, authorization, supplier quote, supplier, and fulfillment lineage does not match.",
    );
  }
  const draftPairs: Array<[unknown, unknown]> = [
    [input.procurementDraft.orderId, orderId],
    [input.procurementDraft.customerQuoteId, customerQuoteId],
    [input.procurementDraft.supplierQuoteId, supplierQuoteId],
    [input.procurementDraft.supplierProfileId, supplierProfileId],
    [input.procurementDraft.fulfillmentPlanId, planId],
    [input.procurementDraft.procurementServiceId, serviceId],
    [input.procurementDraft.sourcePaymentId, paymentId],
  ];
  if (draftPairs.some(([actual, expected]) => String(actual || "") !== expected)) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_procurement_evidence_mismatch",
      "The approved procurement authorization no longer matches the current paid-order evidence.",
    );
  }

  if (String(input.procurementAuthorization.status || "") !== "approved") {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_procurement_approval_required",
      "Approved exact procurement authorization is required first.",
    );
  }
  if (
    input.procurementAuthorization.externalActionExecuted !== false ||
    input.procurementAuthorization.supplierContacted !== false ||
    input.procurementAuthorization.supplierCommitmentCreated !== false ||
    input.procurementAuthorization.externalReference
  ) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_procurement_boundary_invalid",
      "The procurement authorization must remain internal and non-executing.",
    );
  }
  if (
    String(input.order.status || "") !== "procurement" ||
    String(input.fulfillmentPlan.status || "") !== "procurement" ||
    String(input.procurementService.serviceType || "") !== "procurement" ||
    String(input.procurementService.status || "") !== "in_progress"
  ) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_workstream_not_ready",
      "The governed procurement workstream must be active first.",
    );
  }
  if (
    String(input.supplierQuote.status || "") !== "qualified" ||
    input.supplierQuote.offerPreparationReady !== true
  ) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_supplier_quote_not_qualified",
      "The supplier quote is no longer qualified for order preparation.",
    );
  }
  if (
    String(input.supplierProfile.supplierStatus || "") !== "active" ||
    String(input.supplierProfile.verificationStatus || "") !== "verified" ||
    String(input.supplierProfile.visibility || "") !== "exportunity_internal"
  ) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_supplier_profile_not_ready",
      "The supplier profile must remain active, verified, and Exportunity-internal.",
    );
  }

  const authorizationReleaseHash = hash(
    input.procurementAuthorization.releaseHash,
    "procurementReleaseHash",
  );
  if (
    authorizationReleaseHash !==
    hash(input.procurementDraft.releaseHash, "currentProcurementReleaseHash")
  ) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_procurement_release_stale",
      "The approved procurement authorization is stale.",
    );
  }
  const sourcePricingHash = hash(
    input.procurementAuthorization.sourcePricingHash,
    "sourcePricingHash",
  );
  const sourceSupplierQuoteHash = hash(
    input.procurementAuthorization.sourceSupplierQuoteHash,
    "sourceSupplierQuoteHash",
  );
  const sourceOrderConfirmationHash = hash(
    input.procurementAuthorization.sourceOrderConfirmationHash,
    "sourceOrderConfirmationHash",
  );
  if (
    sourcePricingHash !== input.procurementDraft.sourcePricingHash ||
    sourceSupplierQuoteHash !== input.procurementDraft.sourceSupplierQuoteHash ||
    sourceOrderConfirmationHash !==
      input.procurementDraft.sourceOrderConfirmationHash ||
    sourceSupplierQuoteHash !== String(input.supplierQuote.quoteHash || "")
  ) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_source_hash_mismatch",
      "The accepted price, supplier quote, or order confirmation evidence changed.",
    );
  }

  const authorizationCurrency = currency(
    input.procurementAuthorization.currencyCode,
  );
  const currentCurrency = currency(input.procurementDraft.currencyCode);
  const supplierCurrency = currency(input.supplierQuote.currencyCode);
  if (
    authorizationCurrency !== currentCurrency ||
    authorizationCurrency !== supplierCurrency
  ) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_currency_mismatch",
      "Procurement authorization and supplier quote currency must match exactly.",
    );
  }
  const supplierTotal = exactMinor(
    input.procurementAuthorization.supplierCostMinor,
    "supplierTotalMinor",
  );
  const currentSupplierTotal = exactMinor(
    input.procurementDraft.supplierCostMinor,
    "currentSupplierTotalMinor",
  );
  let quotedSupplierTotal: string;
  try {
    quotedSupplierTotal = parseQuotedMoneyToMinorUnits(
      input.supplierQuote.totalAmount,
      authorizationCurrency,
    );
  } catch {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_supplier_total_invalid",
      "The canonical supplier total is not an unambiguous exact amount.",
      422,
    );
  }
  if (
    supplierTotal.value <= 0n ||
    supplierTotal.text !== currentSupplierTotal.text ||
    supplierTotal.text !== quotedSupplierTotal
  ) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_supplier_total_mismatch",
      "The exact supplier total no longer matches the approved source quote.",
    );
  }

  const validUntil = validFutureDate(
    input.supplierQuote.legacyValidUntil,
    now,
  );
  const productName = requiredText(input.supplierQuote.productName, "productName");
  const specification = requiredText(
    input.supplierQuote.specification,
    "specification",
  );
  const offeredQuantity = requiredText(
    input.supplierQuote.offeredQuantity,
    "offeredQuantity",
  );
  const unitOfMeasure = requiredText(
    input.supplierQuote.unitOfMeasure,
    "unitOfMeasure",
  );
  const leadTime = requiredText(input.supplierQuote.leadTime, "leadTime");
  const incoterm = requiredText(input.supplierQuote.incoterm, "incoterm", 100);
  const paymentTerms = requiredText(
    input.supplierQuote.paymentTerms,
    "paymentTerms",
  );
  const destination = requiredText(
    input.supplierQuote.destination,
    "destination",
  );
  const supplierQuoteReference = requiredText(
    input.supplierQuote.supplierQuoteReference,
    "supplierQuoteReference",
  );
  const unitPriceText = optionalText(input.supplierQuote.unitPrice);
  const packaging = optionalText(input.supplierQuote.packaging);
  const countryOfOrigin = optionalText(input.supplierQuote.countryOfOrigin);
  const warranty = optionalText(input.supplierQuote.warranty);
  const lineItems = [
    {
      productName,
      specification,
      offeredQuantity,
      unitOfMeasure,
      unitPriceText,
      supplierTotalMinor: supplierTotal.text,
      currencyCode: authorizationCurrency,
      packaging,
    },
  ];
  const sourceSnapshot = {
    procurementAuthorizationId: authorizationId,
    orderId,
    customerQuoteId,
    supplierQuoteId,
    supplierProfileId,
    fulfillmentPlanId: planId,
    procurementServiceId: serviceId,
    sourcePaymentId: paymentId,
    currencyCode: authorizationCurrency,
    supplierTotalMinor: supplierTotal.text,
    productName,
    specification,
    offeredQuantity,
    unitOfMeasure,
    unitPriceText,
    packaging,
    leadTime,
    incoterm,
    paymentTerms,
    destination,
    countryOfOrigin,
    warranty,
    supplierQuoteReference,
    supplierQuoteValidUntil: validUntil.toISOString(),
    lineItems,
    sourcePricingHash,
    sourceSupplierQuoteHash,
    sourceOrderConfirmationHash,
    procurementReleaseHash: authorizationReleaseHash,
    externalActionExecuted: false,
    transmittedToSupplier: false,
    supplierAccepted: false,
    externalPurchaseOrderReference: null,
  };
  return { ...sourceSnapshot, packageHash: stableHash(sourceSnapshot) };
}

export function parseIndustrialSupplierPurchaseOrderApproval(value: unknown) {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const expectedPackageHash = String(source.expectedPackageHash || "").trim();
  const reason = String(source.reason || "").trim();
  if (!/^[a-f0-9]{64}$/.test(expectedPackageHash)) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_package_hash_required",
      "The current purchase-order package hash is required.",
      422,
    );
  }
  if (reason.length < 12 || reason.length > 1200) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_approval_reason_required",
      "Document an approval reason between 12 and 1200 characters.",
      422,
    );
  }
  const checklistSource =
    source.checklist &&
    typeof source.checklist === "object" &&
    !Array.isArray(source.checklist)
      ? (source.checklist as Record<string, unknown>)
      : {};
  const checklist = Object.fromEntries(
    INDUSTRIAL_SUPPLIER_PO_APPROVAL_CHECKLIST.map((key) => [
      key,
      checklistSource[key] === true,
    ]),
  ) as Record<IndustrialSupplierPoApprovalChecklistKey, boolean>;
  const missing = INDUSTRIAL_SUPPLIER_PO_APPROVAL_CHECKLIST.filter(
    (key) => checklist[key] !== true,
  );
  if (missing.length) {
    throw new IndustrialSupplierPurchaseOrderPolicyError(
      "industrial_supplier_po_approval_checklist_incomplete",
      `Complete the purchase-order package checklist: ${missing.join(", ")}.`,
      422,
    );
  }
  return { expectedPackageHash, reason, checklist };
}
