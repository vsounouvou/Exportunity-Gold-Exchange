export const CANONICAL_COMMERCE_ATTRIBUTION_MIGRATION =
  "20270423_exportunity_canonical_commerce_attribution.sql";

export const CANONICAL_ATTRIBUTION_EVIDENCE_TYPES = [
  "tracking_code",
  "provider_receipt",
  "approved_manual_review",
] as const;

export type CanonicalCommerceSourceKind = "ad_campaign" | "social_publication";

type RowLike = Record<string, unknown> | null | undefined;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return text(value).toLowerCase();
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function date(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sameTenant(tenantId: number, ...rows: RowLike[]) {
  return rows.every((row) => row && Number(row.tenantId) === tenantId);
}

function credentialsPresent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(credentialsPresent);
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => {
    if (/(?:password|passwd|secret|access.?token|refresh.?token|authorization|cookie|private.?key)/i.test(key)) {
      return true;
    }
    return credentialsPresent(child);
  });
}

export function assertCredentialFreeAttributionReference(value: unknown) {
  const reference = text(value);
  if (!reference) throw new Error("attributionEvidence.reference is required");
  if (reference.length > 500) throw new Error("attributionEvidence.reference is too long");
  if (
    /(?:access[_ -]?token|refresh[_ -]?token|api[_ -]?key|client[_ -]?secret|password|authorization\s*:|bearer\s+|[?&](?:token|key|secret)=)/i.test(
      reference,
    )
  ) {
    throw new Error("Attribution evidence references must not contain credentials or secrets");
  }
  return reference;
}

export function normalizeCanonicalAttributionEvidence(value: unknown) {
  const evidence = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const type = normalized(evidence.type);
  if (!(CANONICAL_ATTRIBUTION_EVIDENCE_TYPES as readonly string[]).includes(type)) {
    throw new Error("attributionEvidence.type is invalid");
  }
  if (evidence.verified !== true) {
    throw new Error("Verified attribution evidence is required");
  }
  if (evidence.credentialsExcluded !== true || credentialsPresent(evidence)) {
    throw new Error("Attribution evidence must be credential-free");
  }
  return {
    type: type as (typeof CANONICAL_ATTRIBUTION_EVIDENCE_TYPES)[number],
    reference: assertCredentialFreeAttributionReference(evidence.reference),
    verified: true as const,
    credentialsExcluded: true as const,
  };
}

export function evaluateCanonicalFulfilledOrderAttribution(input: {
  tenantId: number;
  sourceKind: unknown;
  order: RowLike;
  payment: RowLike;
  fulfillmentPlan: RowLike;
  campaign?: RowLike;
  creative?: RowLike;
  publicationAttempt?: RowLike;
  rightsEligibility?: RowLike;
  attributionEvidence: unknown;
}) {
  const sourceKind = normalized(input.sourceKind) as CanonicalCommerceSourceKind;
  const blockers: string[] = [];
  const order = input.order || {};
  const payment = input.payment || {};
  const fulfillmentPlan = input.fulfillmentPlan || {};
  const campaign = input.campaign || null;
  const creative = input.creative || null;
  const publication = input.publicationAttempt || null;

  let attributionEvidence: ReturnType<typeof normalizeCanonicalAttributionEvidence> | null = null;
  try {
    attributionEvidence = normalizeCanonicalAttributionEvidence(input.attributionEvidence);
  } catch (error: any) {
    blockers.push(`attribution_evidence_invalid:${String(error?.message || error)}`);
  }

  if (!Number.isInteger(input.tenantId) || input.tenantId <= 0) blockers.push("tenant_required");
  if (!sameTenant(input.tenantId, order, payment, fulfillmentPlan)) blockers.push("canonical_rows_cross_tenant_or_missing");
  if (normalized(order.status) !== "completed" || !date(order.completedAt)) {
    blockers.push("completed_industrial_order_required");
  }
  if (normalized(order.paymentStatus) !== "paid") blockers.push("paid_industrial_order_required");
  if (!text(order.lastPaymentId) || text(order.lastPaymentId) !== text(payment.id)) {
    blockers.push("order_last_payment_mismatch");
  }

  const paymentAmount = number(payment.amount);
  if (!Number.isSafeInteger(paymentAmount) || Number(paymentAmount) < 0) {
    blockers.push("canonical_payment_amount_invalid");
  }
  if (normalized(payment.status) !== "succeeded" || !date(payment.creditedAt)) {
    blockers.push("credited_succeeded_payment_required");
  }
  if (text(payment.purpose) !== "INDUSTRIAL_ORDER_PAYMENT") blockers.push("industrial_payment_purpose_mismatch");
  if (text(payment.targetType) !== "INDUSTRIAL_ORDER") blockers.push("industrial_payment_target_type_mismatch");
  if (text(payment.targetId) !== text(order.id)) blockers.push("industrial_payment_target_id_mismatch");
  if (text(order.paidCurrencyCode || order.currencyCode).toUpperCase() !== text(payment.currency).toUpperCase()) {
    blockers.push("order_payment_currency_mismatch");
  }
  if (number(order.paidAmount ?? order.totalAmount) !== paymentAmount) blockers.push("order_payment_amount_mismatch");

  if (text(fulfillmentPlan.orderId) !== text(order.id)) blockers.push("fulfillment_order_mismatch");
  if (normalized(fulfillmentPlan.status) !== "delivered" || !date(fulfillmentPlan.deliveredAt)) {
    blockers.push("delivered_fulfillment_plan_required");
  }

  let territoryId: number | null = null;
  let mediaItemId: string | null = null;
  let sourceReferenceId: number | null = null;
  let rightsGrantId: number | null = null;
  let sourceOccurredAt: Date | null = null;
  let touchpointReference: string | null = null;

  if (sourceKind === "ad_campaign") {
    if (!sameTenant(input.tenantId, campaign, creative)) blockers.push("ad_source_cross_tenant_or_missing");
    territoryId = Number(campaign?.territoryId || 0) || null;
    if (!territoryId) blockers.push("campaign_territory_required");
    if (!["active", "completed"].includes(normalized(campaign?.status)) || !date(campaign?.providerConfirmedAt)) {
      blockers.push("provider_confirmed_active_or_completed_campaign_required");
    }
    if (text(creative?.campaignId) !== text(campaign?.id)) blockers.push("creative_campaign_mismatch");
    if (normalized(creative?.status) !== "approved") blockers.push("approved_creative_required");
    mediaItemId = text(creative?.mediaItemId) || null;
    sourceReferenceId = Number(creative?.sourceReferenceId || 0) || null;
    rightsGrantId = Number(creative?.rightsGrantId || 0) || null;
    sourceOccurredAt = date(campaign?.activatedAt || campaign?.providerConfirmedAt);
    touchpointReference = text(campaign?.trackingCode) || null;
  } else if (sourceKind === "social_publication") {
    if (!sameTenant(input.tenantId, publication)) blockers.push("publication_source_cross_tenant_or_missing");
    territoryId = Number(publication?.territoryId || 0) || null;
    if (!territoryId) blockers.push("publication_territory_required");
    if (
      normalized(publication?.status) !== "published" ||
      !date(publication?.providerConfirmedAt) ||
      !date(publication?.publishedAt)
    ) {
      blockers.push("provider_confirmed_publication_required");
    }
    mediaItemId = text(publication?.mediaItemId) || null;
    sourceReferenceId = Number(publication?.sourceReferenceId || 0) || null;
    rightsGrantId = Number(publication?.rightsGrantId || 0) || null;
    sourceOccurredAt = date(publication?.publishedAt);
    touchpointReference = publication?.id ? `social-publication:${text(publication.id)}` : null;
  } else {
    blockers.push("source_kind_invalid");
  }

  if (!mediaItemId || !sourceReferenceId || !rightsGrantId) blockers.push("source_provenance_incomplete");
  if (input.rightsEligibility?.eligible !== true) blockers.push("current_media_rights_required");
  if (Number(input.rightsEligibility?.grantId || 0) !== rightsGrantId) blockers.push("rights_grant_mismatch");

  const deliveredAt = date(fulfillmentPlan.deliveredAt);
  if (sourceOccurredAt && deliveredAt && sourceOccurredAt > deliveredAt) blockers.push("touchpoint_after_delivery");

  return {
    eligible: blockers.length === 0,
    blockers: Array.from(new Set(blockers)),
    sourceKind,
    territoryId,
    mediaItemId,
    sourceReferenceId,
    rightsGrantId,
    amountMinor: Number.isSafeInteger(paymentAmount) ? Number(paymentAmount) : null,
    currencyCode: text(payment.currency).toUpperCase() || null,
    occurredAt: deliveredAt,
    sourceOccurredAt,
    touchpointReference,
    attributionEvidence,
    credentialsExcluded: true as const,
    externalActionPerformed: false as const,
    backgroundExecutionStarted: false as const,
  };
}
