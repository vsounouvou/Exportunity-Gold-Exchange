import { createHash } from "node:crypto";

export const INDUSTRIAL_RELATIONSHIP_CONTINUITY_CHECKLIST = [
  "transactionOutcomeReviewed",
  "customerIdentityAndConsentReviewed",
  "supplierEvidenceReviewed",
  "reviewTimingConfirmed",
  "noExternalCommunication",
] as const;

export class IndustrialRelationshipContinuityPolicyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 422,
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
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

function stableHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function requiredText(value: unknown, label: string, max = 1200) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > max) {
    throw new IndustrialRelationshipContinuityPolicyError(
      "industrial_relationship_continuity_text_invalid",
      `${label} is required and must not exceed ${max} characters.`,
    );
  }
  return normalized;
}

function optionalText(value: unknown, max = 1200) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length > max) {
    throw new IndustrialRelationshipContinuityPolicyError(
      "industrial_relationship_continuity_text_invalid",
      `Optional relationship evidence must not exceed ${max} characters.`,
    );
  }
  return normalized || null;
}

function exactMinor(value: unknown, label: string, allowSigned = false) {
  const normalized = String(value ?? "").trim();
  const pattern = allowSigned ? /^-?\d+$/ : /^\d+$/;
  if (!pattern.test(normalized)) {
    throw new IndustrialRelationshipContinuityPolicyError(
      "industrial_relationship_continuity_exact_amount_required",
      `${label} must use exact integer minor units.`,
    );
  }
  return BigInt(normalized).toString();
}

function isoDate(value: unknown, label: string) {
  const parsed = new Date(String(value || ""));
  if (!Number.isFinite(parsed.getTime())) {
    throw new IndustrialRelationshipContinuityPolicyError(
      "industrial_relationship_continuity_date_invalid",
      `${label} must be a valid date.`,
    );
  }
  return parsed.toISOString();
}

function cadenceDays(value: string | null) {
  if (!value) return null;
  const cadence = value.toLowerCase();
  if (/daily|every day|quotidien/.test(cadence)) return 1;
  if (/fortnight|biweekly|every two weeks|quinz/.test(cadence)) return 14;
  if (/weekly|every week|hebdomad/.test(cadence)) return 7;
  if (/monthly|every month|mensuel/.test(cadence)) return 30;
  if (/quarterly|every quarter|trimestr/.test(cadence)) return 90;
  if (/semi.?annual|twice a year|semestr/.test(cadence)) return 182;
  if (/annual|yearly|every year|annuel/.test(cadence)) return 365;
  return null;
}

function suggestedReviewAt(deliveredAt: string, cadenceText: string | null) {
  const days = cadenceDays(cadenceText);
  if (!days) return null;
  const date = new Date(deliveredAt);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

type RelationshipMemoryInput = {
  tenantId: number;
  recognition: Record<string, any>;
  order: Record<string, any>;
  requirement: Record<string, any>;
  productRequirement?: Record<string, any> | null;
  fulfillmentPlan: Record<string, any>;
  supplierPurchaseOrderPackage: Record<string, any>;
  supplierProfile: Record<string, any>;
  customerContact?: Record<string, any> | null;
  consentStatus?: unknown;
  isDnc?: unknown;
};

export function buildIndustrialRelationshipMemoryDraft(
  input: RelationshipMemoryInput,
) {
  const tenantId = Number(input.tenantId);
  const orderId = requiredText(input.order.id, "order id", 80);
  const recognitionId = requiredText(
    input.recognition.id,
    "recognition id",
    80,
  );
  if (
    !Number.isInteger(tenantId) ||
    tenantId <= 0 ||
    Number(input.order.tenantId) !== tenantId ||
    Number(input.recognition.tenantId) !== tenantId ||
    Number(input.requirement.tenantId) !== tenantId ||
    Number(input.fulfillmentPlan.tenantId) !== tenantId ||
    Number(input.supplierPurchaseOrderPackage.tenantId) !== tenantId ||
    Number(input.supplierProfile.tenantId) !== tenantId
  ) {
    throw new IndustrialRelationshipContinuityPolicyError(
      "industrial_relationship_continuity_tenant_mismatch",
      "The relationship memory sources do not belong to one tenant.",
      409,
    );
  }
  if (
    input.recognition.status !== "recognized" ||
    String(input.recognition.orderId) !== orderId ||
    String(input.order.requirementId) !== String(input.requirement.id) ||
    String(input.recognition.fulfillmentPlanId) !==
      String(input.fulfillmentPlan.id) ||
    String(input.recognition.supplierPurchaseOrderPackageId) !==
      String(input.supplierPurchaseOrderPackage.id) ||
    String(input.supplierPurchaseOrderPackage.supplierProfileId) !==
      String(input.supplierProfile.id)
  ) {
    throw new IndustrialRelationshipContinuityPolicyError(
      "industrial_relationship_continuity_lineage_mismatch",
      "Recognized transaction, order, requirement, delivery, and supplier evidence must share one lineage.",
      409,
    );
  }
  if (
    input.fulfillmentPlan.status !== "delivered" ||
    !input.fulfillmentPlan.deliveredAt
  ) {
    throw new IndustrialRelationshipContinuityPolicyError(
      "industrial_relationship_continuity_delivery_required",
      "Delivered fulfillment evidence is required before relationship memory can be recorded.",
      409,
    );
  }
  const deliveredAt = isoDate(
    input.fulfillmentPlan.deliveredAt,
    "delivery timestamp",
  );
  const currencyCode = requiredText(
    input.recognition.currencyCode,
    "currency code",
    3,
  ).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new IndustrialRelationshipContinuityPolicyError(
      "industrial_relationship_continuity_currency_invalid",
      "Relationship memory requires a three-letter currency code.",
    );
  }
  const revenueMinor = exactMinor(input.recognition.revenueMinor, "revenue");
  const actualCostMinor = exactMinor(
    input.recognition.actualCostMinor,
    "actual cost",
  );
  const actualGrossMarginMinor = exactMinor(
    input.recognition.actualGrossMarginMinor,
    "actual gross margin",
    true,
  );
  if (
    BigInt(actualGrossMarginMinor) !==
    BigInt(revenueMinor) - BigInt(actualCostMinor)
  ) {
    throw new IndustrialRelationshipContinuityPolicyError(
      "industrial_relationship_continuity_margin_mismatch",
      "The relationship outcome does not match the exact recognized margin.",
      409,
    );
  }

  const packageRecord = input.supplierPurchaseOrderPackage;
  const productName = requiredText(packageRecord.productName, "product name", 240);
  const specification = optionalText(packageRecord.specification, 2000);
  const quantityText = requiredText(
    packageRecord.offeredQuantity,
    "offered quantity",
    240,
  );
  const unitOfMeasure = requiredText(
    packageRecord.unitOfMeasure,
    "unit of measure",
    120,
  );
  const destination = requiredText(
    packageRecord.destination,
    "destination",
    500,
  );
  const countryOfOrigin = optionalText(packageRecord.countryOfOrigin, 120);
  const cadenceText = optionalText(input.productRequirement?.frequency, 240);
  const customerContactId = input.requirement.customerContactId
    ? Number(input.requirement.customerContactId)
    : null;
  if (
    customerContactId !== null &&
    (!Number.isInteger(customerContactId) || customerContactId <= 0)
  ) {
    throw new IndustrialRelationshipContinuityPolicyError(
      "industrial_relationship_continuity_customer_invalid",
      "The canonical customer contact is invalid.",
    );
  }
  if (
    input.customerContact &&
    Number(input.customerContact.id) !== customerContactId
  ) {
    throw new IndustrialRelationshipContinuityPolicyError(
      "industrial_relationship_continuity_customer_mismatch",
      "The customer memory does not match the requirement contact.",
      409,
    );
  }
  const consentStatus = requiredText(
    input.consentStatus || "unknown",
    "consent status",
    40,
  ).toLowerCase();
  const isDnc = Boolean(input.isDnc) || consentStatus === "opt_out";
  const recognitionHash = requiredText(
    input.recognition.recognitionHash,
    "recognition hash",
    64,
  );
  if (!/^[a-f0-9]{64}$/.test(recognitionHash)) {
    throw new IndustrialRelationshipContinuityPolicyError(
      "industrial_relationship_continuity_recognition_hash_invalid",
      "The recognized transaction hash is invalid.",
      409,
    );
  }

  const customerMemory = {
    contactId: customerContactId,
    displayName: optionalText(input.customerContact?.displayName, 240),
    company: optionalText(
      input.customerContact?.company || input.requirement.requesterCompany,
      240,
    ),
    productName,
    quantityText,
    unitOfMeasure,
    destination,
    cadenceText,
    completedOrderId: orderId,
    deliveredAt,
  };
  const supplierMemory = {
    supplierProfileId: String(input.supplierProfile.id),
    supplierName: requiredText(
      input.supplierProfile.displayName || input.supplierProfile.legalName,
      "supplier name",
      240,
    ),
    productName,
    specification,
    quantityText,
    unitOfMeasure,
    countryOfOrigin,
    supplierQuoteReference: requiredText(
      packageRecord.supplierQuoteReference,
      "supplier quote reference",
      240,
    ),
    deliveredAt,
  };
  const evidence = {
    recognitionId,
    recognitionHash,
    orderId,
    orderConfirmationHash: requiredText(
      input.order.orderConfirmationHash,
      "order confirmation hash",
      64,
    ),
    requirementId: String(input.requirement.id),
    fulfillmentPlanId: String(input.fulfillmentPlan.id),
    supplierPurchaseOrderPackageId: String(packageRecord.id),
    supplierPackageHash: requiredText(
      packageRecord.packageHash,
      "supplier package hash",
      64,
    ),
    supplierProfileId: String(input.supplierProfile.id),
    customerContactId,
    deliveredAt,
    currencyCode,
    revenueMinor,
    actualCostMinor,
    actualGrossMarginMinor,
    productName,
    specification,
    quantityText,
    unitOfMeasure,
    destination,
    countryOfOrigin,
    cadenceText,
  };
  const evidenceHash = stableHash(evidence);
  const memorySource = {
    version: "exportunity-relationship-continuity-v1",
    tenantId,
    ...evidence,
    evidenceHash,
    customerMemory,
    supplierMemory,
  };
  const memoryHash = stableHash(memorySource);
  const proposedNextReviewAt = suggestedReviewAt(deliveredAt, cadenceText);
  const recommendedAction = isDnc
    ? `Review the completed ${productName} transaction internally. This customer is marked do not contact; no external follow-up is permitted.`
    : `Review the completed ${productName} transaction and decide whether the customer wants to repeat or amend the requirement. External contact remains separately approval-gated.`;

  return {
    tenantId,
    recognitionId,
    orderId,
    requirementId: String(input.requirement.id),
    fulfillmentPlanId: String(input.fulfillmentPlan.id),
    supplierPurchaseOrderPackageId: String(packageRecord.id),
    supplierProfileId: String(input.supplierProfile.id),
    customerContactId,
    productName,
    specification,
    quantityText,
    unitOfMeasure,
    destination,
    countryOfOrigin,
    cadenceText,
    deliveredAt,
    currencyCode,
    revenueMinor,
    actualCostMinor,
    actualGrossMarginMinor,
    customerMemory,
    supplierMemory,
    sourceSnapshot: memorySource,
    evidenceHash,
    memoryHash,
    consentStatus,
    isDnc,
    recommendedAction,
    proposedNextReviewAt,
    externalCommunicationAuthorized: false as const,
    externalCommunicationExecuted: false as const,
    externalMessageReference: null,
  };
}

export function parseIndustrialRelationshipContinuityApproval(
  value: unknown,
  now = new Date(),
) {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const expectedMemoryHash = requiredText(
    input.expectedMemoryHash,
    "expected memory hash",
    64,
  );
  if (!/^[a-f0-9]{64}$/.test(expectedMemoryHash)) {
    throw new IndustrialRelationshipContinuityPolicyError(
      "industrial_relationship_continuity_memory_hash_invalid",
      "The expected relationship-memory hash is invalid.",
    );
  }
  const reason = requiredText(input.reason, "continuity decision reason", 1200);
  if (reason.length < 12) {
    throw new IndustrialRelationshipContinuityPolicyError(
      "industrial_relationship_continuity_reason_required",
      "Document an internal continuity decision reason of at least 12 characters.",
    );
  }
  const nextReviewAt = isoDate(input.nextReviewAt, "next internal review date");
  const nextReviewTime = new Date(nextReviewAt).getTime();
  if (nextReviewTime < now.getTime() || nextReviewTime > now.getTime() + 5 * 366 * 86_400_000) {
    throw new IndustrialRelationshipContinuityPolicyError(
      "industrial_relationship_continuity_review_date_invalid",
      "The next internal review must be between now and five years from now.",
    );
  }
  const checklistInput =
    input.checklist &&
    typeof input.checklist === "object" &&
    !Array.isArray(input.checklist)
      ? (input.checklist as Record<string, unknown>)
      : {};
  const checklist = Object.fromEntries(
    INDUSTRIAL_RELATIONSHIP_CONTINUITY_CHECKLIST.map((key) => [
      key,
      checklistInput[key] === true,
    ]),
  ) as Record<
    (typeof INDUSTRIAL_RELATIONSHIP_CONTINUITY_CHECKLIST)[number],
    boolean
  >;
  if (Object.values(checklist).some((checked) => !checked)) {
    throw new IndustrialRelationshipContinuityPolicyError(
      "industrial_relationship_continuity_checklist_incomplete",
      "Every transaction, relationship, consent, timing, and communication-separation control must be confirmed.",
    );
  }
  return { expectedMemoryHash, reason, nextReviewAt, checklist };
}
