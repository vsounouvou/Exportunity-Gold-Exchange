import type { CommercialIntentResult } from "../commercialIntentEngine";

export type CanonicalProductRequirementProjection = {
  sourceMessageId: number | null;
  intent: string;
  intentConfidence: string;
  suggestedAction: CommercialIntentResult["suggestedAction"];
  productName: string | null;
  productCategory: string | null;
  specification: string | null;
  quantity: string | null;
  quantityText: string | null;
  unit: string | null;
  origin: string | null;
  destination: string | null;
  targetPrice: string | null;
  currency: string | null;
  deadlineText: string | null;
  frequency: string | null;
  incoterm: string | null;
  customerType: string | null;
  missingFields: string[];
  metadata: Record<string, unknown>;
};

function clean(value: unknown, maxLength = 240) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function decimal(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : null;
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function confidence(value: unknown) {
  const parsed = Number(value);
  const bounded = Number.isFinite(parsed)
    ? Math.max(0, Math.min(1, parsed))
    : 0;
  return bounded.toFixed(3);
}

export function projectCanonicalProductRequirement(input: {
  commercial: CommercialIntentResult;
  sourceMessageId?: number | null;
  sourceChatLeadId?: string | null;
  requirementReferenceCode?: string | null;
}): CanonicalProductRequirementProjection {
  const quantity = decimal(input.commercial.product?.quantity);
  const unit = clean(input.commercial.product?.unit, 40);
  const quantityText = quantity
    ? `${quantity}${unit ? ` ${unit}` : ""}`
    : null;
  const missingFields = Array.from(
    new Set(
      (Array.isArray(input.commercial.missingFields)
        ? input.commercial.missingFields
        : []
      )
        .map((value) => clean(value, 80))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const sourceMessageId = positiveInteger(input.sourceMessageId);

  return {
    sourceMessageId,
    intent: clean(input.commercial.intent, 100) || "other",
    intentConfidence: confidence(input.commercial.confidence),
    suggestedAction: input.commercial.suggestedAction,
    productName: clean(input.commercial.product?.name),
    productCategory: clean(input.commercial.product?.category),
    specification: clean(input.commercial.product?.specification, 500),
    quantity,
    quantityText,
    unit,
    origin: clean(input.commercial.origin),
    destination: clean(input.commercial.destination),
    targetPrice: decimal(input.commercial.targetPrice),
    currency: clean(input.commercial.currency, 12)?.toUpperCase() || null,
    deadlineText: clean(input.commercial.deadline),
    frequency: clean(input.commercial.frequency),
    incoterm: clean(input.commercial.incoterm, 20)?.toUpperCase() || null,
    customerType: clean(input.commercial.customerType, 100),
    missingFields,
    metadata: {
      source: "exportunity_talk",
      canonical: true,
      sourceChatLeadId: clean(input.sourceChatLeadId, 200),
      sourceMessageId,
      requirementReferenceCode: clean(input.requirementReferenceCode, 120),
      language: input.commercial.language,
      qualificationAction: input.commercial.suggestedAction,
    },
  };
}
