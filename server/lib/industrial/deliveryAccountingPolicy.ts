import { createHash } from "node:crypto";

export const INDUSTRIAL_ACTUAL_COST_DIRECTIONS = ["cost", "reversal"] as const;
export const INDUSTRIAL_ACTUAL_COST_CATEGORIES = [
  "supplier",
  "inspection",
  "freight",
  "customs",
  "last_mile",
  "duties_taxes",
  "banking_provider_fees",
  "other",
] as const;

export const INDUSTRIAL_REVENUE_RECOGNITION_CHECKLIST = [
  "successfulPaymentMatches",
  "acceptedCustomerPriceMatches",
  "actualCostEvidenceComplete",
  "supplierCostEvidencePresent",
  "deliveryPlanCompleted",
  "deliveryProofVerified",
  "tenantAndOrderLineageConfirmed",
  "revenueAndMarginReconciled",
  "privateAccountingOnly",
  "externalJournalSeparated",
] as const;

export class IndustrialDeliveryAccountingPolicyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 409,
  ) {
    super(message);
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonical(nested)]),
    );
  }
  return value;
}

function stableHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function requiredText(value: unknown, field: string, maximum = 1200) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_delivery_accounting_evidence_incomplete",
      `${field} is required.`,
      422,
    );
  }
  if (normalized.length > maximum) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_delivery_accounting_evidence_invalid",
      `${field} exceeds the supported length.`,
      422,
    );
  }
  return normalized;
}

function hash(value: unknown, field: string) {
  const normalized = requiredText(value, field, 64);
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_delivery_accounting_hash_invalid",
      `${field} must be a canonical SHA-256 hash.`,
      422,
    );
  }
  return normalized;
}

function exactMinor(value: unknown, field: string, allowSigned = false) {
  const normalized = String(value ?? "").trim();
  const pattern = allowSigned ? /^-?(?:0|[1-9]\d*)$/ : /^(?:0|[1-9]\d*)$/;
  if (!pattern.test(normalized)) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_delivery_accounting_exact_amount_required",
      `${field} must be an exact integer minor-unit amount.`,
      422,
    );
  }
  return { text: normalized, value: BigInt(normalized) };
}

function positiveMinor(value: unknown, field: string) {
  const parsed = exactMinor(value, field);
  if (parsed.value <= 0n) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_actual_cost_positive_amount_required",
      `${field} must be greater than zero.`,
      422,
    );
  }
  return parsed;
}

function currency(value: unknown) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_delivery_accounting_currency_invalid",
      "A three-letter currency code is required.",
      422,
    );
  }
  return normalized;
}

function date(value: unknown, field: string) {
  const parsed = value ? new Date(String(value)) : null;
  if (!parsed || !Number.isFinite(parsed.getTime())) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_delivery_accounting_date_invalid",
      `${field} must be a valid date.`,
      422,
    );
  }
  return parsed;
}

function evidence(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_actual_cost_evidence_required",
      "At least one attributable actual-cost evidence item is required.",
      422,
    );
  }
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new IndustrialDeliveryAccountingPolicyError(
        "industrial_actual_cost_evidence_invalid",
        "Each actual-cost evidence item must be a structured record.",
        422,
      );
    }
    const normalized = canonical(entry) as Record<string, unknown>;
    const reference = String(
      normalized.reference || normalized.digest || normalized.url || "",
    ).trim();
    if (!reference || reference.length > 1000) {
      throw new IndustrialDeliveryAccountingPolicyError(
        "industrial_actual_cost_evidence_invalid",
        "Each actual-cost evidence item needs a bounded reference, digest, or HTTPS URL.",
        422,
      );
    }
    if (normalized.url && !/^https:\/\//i.test(String(normalized.url))) {
      throw new IndustrialDeliveryAccountingPolicyError(
        "industrial_actual_cost_evidence_url_invalid",
        "Actual-cost evidence URLs must use HTTPS.",
        422,
      );
    }
    return normalized;
  });
}

const serviceCategory = new Map<string, string>([
  ["inspection", "inspection"],
  ["freight", "freight"],
  ["customs", "customs"],
  ["last_mile", "last_mile"],
]);

export function buildIndustrialActualCostEntryDraft(input: {
  tenantId: number;
  order: {
    id: unknown;
    tenantId: unknown;
    currencyCode: unknown;
    paymentStatus: unknown;
    status: unknown;
  };
  fulfillmentPlan: {
    id: unknown;
    tenantId: unknown;
    orderId: unknown;
    status: unknown;
  };
  fulfillmentService?: {
    id: unknown;
    tenantId: unknown;
    orderId: unknown;
    planId: unknown;
    serviceType: unknown;
  } | null;
  supplierPurchaseOrderPackage?: {
    id: unknown;
    tenantId: unknown;
    orderId: unknown;
    fulfillmentPlanId: unknown;
    status: unknown;
  } | null;
  originalCostEntry?: {
    id: unknown;
    tenantId: unknown;
    orderId: unknown;
    direction: unknown;
    category: unknown;
    currencyCode: unknown;
    amountMinor: unknown;
  } | null;
  alreadyReversedMinor?: unknown;
  entry: {
    direction?: unknown;
    category: unknown;
    currencyCode: unknown;
    amountMinor: unknown;
    costReference: unknown;
    description: unknown;
    evidence: unknown;
    incurredAt: unknown;
    reason: unknown;
    reversesCostEntryId?: unknown;
  };
}) {
  const tenantId = Number(input.tenantId);
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_delivery_accounting_tenant_invalid",
      "A valid Exportunity tenant is required.",
      400,
    );
  }
  if (
    Number(input.order.tenantId) !== tenantId ||
    Number(input.fulfillmentPlan.tenantId) !== tenantId ||
    String(input.fulfillmentPlan.orderId || "") !== String(input.order.id || "")
  ) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_actual_cost_lineage_invalid",
      "The actual cost must belong to the same tenant, order, and fulfillment plan.",
    );
  }
  if (String(input.order.paymentStatus || "") !== "paid") {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_actual_cost_payment_required",
      "Verified customer payment is required before actual costs can be recorded.",
    );
  }
  if (["release_review", "cancelled"].includes(String(input.fulfillmentPlan.status || ""))) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_actual_cost_fulfillment_not_active",
      "The governed fulfillment workstream must be active before actual costs are recorded.",
    );
  }

  const direction = String(input.entry.direction || "cost");
  const category = String(input.entry.category || "");
  if (!(INDUSTRIAL_ACTUAL_COST_DIRECTIONS as readonly string[]).includes(direction)) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_actual_cost_direction_invalid",
      "The actual-cost direction is invalid.",
      422,
    );
  }
  if (!(INDUSTRIAL_ACTUAL_COST_CATEGORIES as readonly string[]).includes(category)) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_actual_cost_category_invalid",
      "The actual-cost category is invalid.",
      422,
    );
  }
  const orderCurrency = currency(input.order.currencyCode);
  const entryCurrency = currency(input.entry.currencyCode);
  if (entryCurrency !== orderCurrency) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_actual_cost_currency_mismatch",
      "Actual costs must use the paid order currency until an exact governed FX ledger exists.",
    );
  }
  const amount = positiveMinor(input.entry.amountMinor, "amountMinor");
  const costReference = requiredText(input.entry.costReference, "costReference", 500);
  const description = requiredText(input.entry.description, "description", 1600);
  const recordedReason = requiredText(input.entry.reason, "reason", 1200);
  if (recordedReason.length < 12) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_actual_cost_reason_required",
      "Document an actual-cost recording reason of at least 12 characters.",
      422,
    );
  }
  const incurredAt = date(input.entry.incurredAt, "incurredAt");
  const normalizedEvidence = evidence(input.entry.evidence);

  const expectedServiceType = serviceCategory.get(category);
  if (expectedServiceType) {
    const service = input.fulfillmentService;
    if (
      !service ||
      Number(service.tenantId) !== tenantId ||
      String(service.orderId || "") !== String(input.order.id || "") ||
      String(service.planId || "") !== String(input.fulfillmentPlan.id || "") ||
      String(service.serviceType || "") !== expectedServiceType
    ) {
      throw new IndustrialDeliveryAccountingPolicyError(
        "industrial_actual_cost_service_lineage_invalid",
        `The ${category} cost requires its matching fulfillment service.`,
      );
    }
  }

  const supplierPackage = input.supplierPurchaseOrderPackage;
  if (
    category === "supplier" &&
    (!supplierPackage ||
      Number(supplierPackage.tenantId) !== tenantId ||
      String(supplierPackage.orderId || "") !== String(input.order.id || "") ||
      String(supplierPackage.fulfillmentPlanId || "") !==
        String(input.fulfillmentPlan.id || "") ||
      String(supplierPackage.status || "") !== "approved_for_submission")
  ) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_actual_cost_supplier_package_invalid",
      "Supplier cost needs the approved internal supplier package plus independent actual-cost evidence.",
    );
  }

  const reversesCostEntryId = String(input.entry.reversesCostEntryId || "").trim() || null;
  if (direction === "cost" && reversesCostEntryId) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_actual_cost_reversal_shape_invalid",
      "A forward cost entry cannot reference a reversal target.",
      422,
    );
  }
  if (direction === "reversal") {
    const original = input.originalCostEntry;
    if (
      !reversesCostEntryId ||
      !original ||
      String(original.id || "") !== reversesCostEntryId ||
      Number(original.tenantId) !== tenantId ||
      String(original.orderId || "") !== String(input.order.id || "") ||
      String(original.direction || "") !== "cost" ||
      String(original.category || "") !== category ||
      currency(original.currencyCode) !== entryCurrency
    ) {
      throw new IndustrialDeliveryAccountingPolicyError(
        "industrial_actual_cost_reversal_lineage_invalid",
        "A reversal must reference a matching immutable original cost entry.",
      );
    }
    const originalAmount = positiveMinor(original.amountMinor, "originalAmountMinor");
    const alreadyReversed = exactMinor(
      input.alreadyReversedMinor ?? "0",
      "alreadyReversedMinor",
    );
    if (alreadyReversed.value + amount.value > originalAmount.value) {
      throw new IndustrialDeliveryAccountingPolicyError(
        "industrial_actual_cost_reversal_exceeds_original",
        "The reversal would exceed the original actual cost.",
      );
    }
  }

  const evidenceHash = stableHash(normalizedEvidence);
  const hashSource = {
    version: "exportunity-actual-cost-v1",
    tenantId,
    orderId: String(input.order.id),
    fulfillmentPlanId: String(input.fulfillmentPlan.id),
    fulfillmentServiceId: input.fulfillmentService
      ? String(input.fulfillmentService.id)
      : null,
    supplierPurchaseOrderPackageId: supplierPackage
      ? String(supplierPackage.id)
      : null,
    reversesCostEntryId,
    direction,
    category,
    currencyCode: entryCurrency,
    amountMinor: amount.text,
    costReference,
    description,
    evidenceHash,
    incurredAt: incurredAt.toISOString(),
  };
  return {
    ...hashSource,
    evidence: normalizedEvidence,
    recordedReason,
    entryHash: stableHash(hashSource),
    externalAccountingPosted: false as const,
    externalAccountingReference: null,
  };
}

export function buildIndustrialRevenueRecognitionDraft(input: {
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
  customerQuote: {
    id: unknown;
    tenantId: unknown;
    status: unknown;
    currencyCode: unknown;
    customerPriceMinor: unknown;
    totalCostMinor: unknown;
    marginMinor: unknown;
    pricingHash: unknown;
  };
  payment: {
    id: unknown;
    tenantId: unknown;
    status: unknown;
    purpose: unknown;
    targetId: unknown;
    amount: unknown;
    currency: unknown;
  };
  procurementAuthorization: {
    id: unknown;
    tenantId: unknown;
    orderId: unknown;
    customerQuoteId: unknown;
    sourcePaymentId: unknown;
    fulfillmentPlanId: unknown;
    status: unknown;
  };
  supplierPurchaseOrderPackage: {
    id: unknown;
    tenantId: unknown;
    orderId: unknown;
    procurementAuthorizationId: unknown;
    fulfillmentPlanId: unknown;
    status: unknown;
  };
  fulfillmentPlan: {
    id: unknown;
    tenantId: unknown;
    orderId: unknown;
    status: unknown;
    deliveredAt: unknown;
  };
  deliveryProofEvent: {
    id: unknown;
    tenantId: unknown;
    orderId: unknown;
    planId: unknown;
    eventType: unknown;
    proof: unknown;
    occurredAt: unknown;
  };
  actualCostEntries: Array<{
    id: unknown;
    tenantId: unknown;
    orderId: unknown;
    direction: unknown;
    category: unknown;
    currencyCode: unknown;
    amountMinor: unknown;
    entryHash: unknown;
  }>;
}) {
  const tenantId = Number(input.tenantId);
  const orderId = requiredText(input.order.id, "orderId");
  const quoteId = requiredText(input.customerQuote.id, "customerQuoteId");
  const paymentId = requiredText(input.payment.id, "sourcePaymentId");
  const authorizationId = requiredText(
    input.procurementAuthorization.id,
    "procurementAuthorizationId",
  );
  const packageId = requiredText(
    input.supplierPurchaseOrderPackage.id,
    "supplierPurchaseOrderPackageId",
  );
  const planId = requiredText(input.fulfillmentPlan.id, "fulfillmentPlanId");
  const deliveryProofEventId = requiredText(
    input.deliveryProofEvent.id,
    "deliveryProofEventId",
  );
  const tenantValues = [
    input.order.tenantId,
    input.customerQuote.tenantId,
    input.payment.tenantId,
    input.procurementAuthorization.tenantId,
    input.supplierPurchaseOrderPackage.tenantId,
    input.fulfillmentPlan.tenantId,
    input.deliveryProofEvent.tenantId,
    ...input.actualCostEntries.map((entry) => entry.tenantId),
  ].map(Number);
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0 || tenantValues.some((value) => value !== tenantId)) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_revenue_recognition_cross_tenant_forbidden",
      "Every recognition source must belong to the same Exportunity tenant.",
      403,
    );
  }
  const lineagePairs: Array<[unknown, string]> = [
    [input.order.quoteId, quoteId],
    [input.order.lastPaymentId, paymentId],
    [input.payment.targetId, orderId],
    [input.procurementAuthorization.orderId, orderId],
    [input.procurementAuthorization.customerQuoteId, quoteId],
    [input.procurementAuthorization.sourcePaymentId, paymentId],
    [input.procurementAuthorization.fulfillmentPlanId, planId],
    [input.supplierPurchaseOrderPackage.orderId, orderId],
    [input.supplierPurchaseOrderPackage.procurementAuthorizationId, authorizationId],
    [input.supplierPurchaseOrderPackage.fulfillmentPlanId, planId],
    [input.fulfillmentPlan.orderId, orderId],
    [input.deliveryProofEvent.orderId, orderId],
    [input.deliveryProofEvent.planId, planId],
  ];
  if (lineagePairs.some(([actual, expected]) => String(actual || "") !== expected)) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_revenue_recognition_lineage_invalid",
      "The payment, offer, procurement, fulfillment, and delivery-proof lineage does not match.",
    );
  }
  if (
    String(input.order.status || "") !== "completed" ||
    String(input.order.paymentStatus || "") !== "paid" ||
    String(input.customerQuote.status || "") !== "accepted" ||
    String(input.payment.status || "") !== "succeeded" ||
    String(input.payment.purpose || "") !== "INDUSTRIAL_ORDER_PAYMENT" ||
    String(input.procurementAuthorization.status || "") !== "approved" ||
    String(input.supplierPurchaseOrderPackage.status || "") !==
      "approved_for_submission"
  ) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_revenue_recognition_commercial_source_invalid",
      "Recognition requires the accepted offer, successful payment, approved procurement, and approved supplier package.",
    );
  }
  if (
    String(input.fulfillmentPlan.status || "") !== "delivered" ||
    !input.fulfillmentPlan.deliveredAt ||
    String(input.deliveryProofEvent.eventType || "") !==
      "delivery_proof_recorded"
  ) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_revenue_recognition_delivery_required",
      "Revenue cannot be recognized before proof-backed delivery is complete.",
    );
  }
  const proof =
    input.deliveryProofEvent.proof &&
    typeof input.deliveryProofEvent.proof === "object" &&
    !Array.isArray(input.deliveryProofEvent.proof)
      ? canonical(input.deliveryProofEvent.proof) as Record<string, unknown>
      : {};
  if (!String(proof.method || "").trim() || !String(proof.deliveredAt || "").trim()) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_revenue_recognition_delivery_proof_invalid",
      "The delivery event needs an attributable proof method and delivery time.",
    );
  }

  const orderCurrency = currency(input.order.currencyCode);
  const currencies = [
    input.customerQuote.currencyCode,
    input.payment.currency,
    ...input.actualCostEntries.map((entry) => entry.currencyCode),
  ].map(currency);
  if (currencies.some((value) => value !== orderCurrency)) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_revenue_recognition_currency_mismatch",
      "Revenue and every actual cost must use the paid order currency.",
    );
  }
  const revenue = positiveMinor(input.order.totalAmountMinor, "revenueMinor");
  const quoteRevenue = positiveMinor(input.customerQuote.customerPriceMinor, "customerPriceMinor");
  const paid = positiveMinor(input.payment.amount, "paymentAmountMinor");
  if (revenue.value !== quoteRevenue.value || revenue.value !== paid.value) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_revenue_recognition_revenue_mismatch",
      "The recognized revenue must match the accepted exact price and successful payment.",
    );
  }
  const plannedCost = exactMinor(input.customerQuote.totalCostMinor, "plannedCostMinor");
  const plannedMargin = exactMinor(input.customerQuote.marginMinor, "plannedMarginMinor", true);
  const sourcePricingHash = hash(input.customerQuote.pricingHash, "sourcePricingHash");
  const orderPricingHash = hash(input.order.sourcePricingHash, "orderSourcePricingHash");
  const sourceOrderConfirmationHash = hash(
    input.order.orderConfirmationHash,
    "sourceOrderConfirmationHash",
  );
  if (sourcePricingHash !== orderPricingHash) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_revenue_recognition_pricing_hash_mismatch",
      "The completed order no longer matches the accepted pricing evidence.",
    );
  }
  if (!input.actualCostEntries.length) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_revenue_recognition_actual_costs_required",
      "At least one actual-cost entry is required before recognition.",
    );
  }
  let actualCost = 0n;
  let supplierCostPresent = false;
  const normalizedEntries = input.actualCostEntries
    .map((entry) => {
      if (String(entry.orderId || "") !== orderId) {
        throw new IndustrialDeliveryAccountingPolicyError(
          "industrial_revenue_recognition_cost_lineage_invalid",
          "Every actual-cost entry must belong to the completed order.",
        );
      }
      const amount = positiveMinor(entry.amountMinor, "actualCostEntry.amountMinor");
      const direction = String(entry.direction || "");
      if (!(INDUSTRIAL_ACTUAL_COST_DIRECTIONS as readonly string[]).includes(direction)) {
        throw new IndustrialDeliveryAccountingPolicyError(
          "industrial_revenue_recognition_cost_direction_invalid",
          "An actual-cost ledger direction is invalid.",
        );
      }
      if (direction === "cost") actualCost += amount.value;
      else actualCost -= amount.value;
      if (direction === "cost" && String(entry.category || "") === "supplier") {
        supplierCostPresent = true;
      }
      return {
        id: requiredText(entry.id, "actualCostEntry.id"),
        entryHash: hash(entry.entryHash, "actualCostEntry.entryHash"),
      };
    })
    .sort((left, right) => left.entryHash.localeCompare(right.entryHash));
  if (actualCost <= 0n || !supplierCostPresent) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_revenue_recognition_cost_ledger_incomplete",
      "A positive net actual cost and attributable supplier cost are required.",
    );
  }

  const actualMargin = revenue.value - actualCost;
  const costVariance = actualCost - plannedCost.value;
  const marginVariance = actualMargin - plannedMargin.value;
  const costEntryIds = normalizedEntries.map((entry) => entry.id);
  const costEvidenceHash = stableHash(normalizedEntries);
  const deliveryProofHash = stableHash({
    eventId: deliveryProofEventId,
    proof,
    occurredAt: new Date(String(input.deliveryProofEvent.occurredAt)).toISOString(),
  });
  const recognitionSource = {
    version: "exportunity-delivery-accounting-v1",
    tenantId,
    orderId,
    customerQuoteId: quoteId,
    sourcePaymentId: paymentId,
    procurementAuthorizationId: authorizationId,
    supplierPurchaseOrderPackageId: packageId,
    fulfillmentPlanId: planId,
    deliveryProofEventId,
    currencyCode: orderCurrency,
    revenueMinor: revenue.text,
    actualCostMinor: actualCost.toString(),
    actualGrossMarginMinor: actualMargin.toString(),
    plannedCostMinor: plannedCost.text,
    plannedMarginMinor: plannedMargin.text,
    costVarianceMinor: costVariance.toString(),
    marginVarianceMinor: marginVariance.toString(),
    costEntryIds,
    costEvidenceHash,
    deliveryProofHash,
    sourcePricingHash,
    sourceOrderConfirmationHash,
  };
  return {
    ...recognitionSource,
    recognitionHash: stableHash(recognitionSource),
    sourceSnapshot: {
      ...recognitionSource,
      deliveryProof: proof,
      deliveredAt: new Date(String(input.fulfillmentPlan.deliveredAt)).toISOString(),
    },
    externalJournalPosted: false as const,
    externalJournalReference: null,
  };
}

export function parseIndustrialRevenueRecognitionApproval(value: unknown) {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const expectedRecognitionHash = hash(
    input.expectedRecognitionHash,
    "expectedRecognitionHash",
  );
  const reason = requiredText(input.reason, "recognition reason", 1200);
  if (reason.length < 12) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_revenue_recognition_reason_required",
      "Document a recognition reason of at least 12 characters.",
      422,
    );
  }
  const checklistInput =
    input.checklist && typeof input.checklist === "object" && !Array.isArray(input.checklist)
      ? (input.checklist as Record<string, unknown>)
      : {};
  const checklist = Object.fromEntries(
    INDUSTRIAL_REVENUE_RECOGNITION_CHECKLIST.map((key) => [
      key,
      checklistInput[key] === true,
    ]),
  ) as Record<(typeof INDUSTRIAL_REVENUE_RECOGNITION_CHECKLIST)[number], boolean>;
  if (Object.values(checklist).some((checked) => !checked)) {
    throw new IndustrialDeliveryAccountingPolicyError(
      "industrial_revenue_recognition_checklist_incomplete",
      "Every payment, cost, delivery, privacy, and journal-separation control must be confirmed.",
      422,
    );
  }
  return { expectedRecognitionHash, reason, checklist };
}
