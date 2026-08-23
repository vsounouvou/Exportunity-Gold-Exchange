import { evaluateMediaPublicationEligibility } from "../territory-media/mediaRightsPolicy";

export const GROUP_BUYING_CAMPAIGN_STATUSES = [
  "draft",
  "verification_required",
  "live",
  "threshold_pending",
  "moq_reached",
  "payment_confirmed",
  "production",
  "ready_for_pickup",
  "in_transit",
  "delivered",
  "settled",
  "failed",
  "refunding",
  "refunded",
] as const;

export const GROUP_BUYING_COMMITMENT_STATUSES = [
  "interest_recorded",
  "order_required",
  "payment_pending",
  "payment_confirmed",
  "allocated_to_batch",
  "fulfilled",
  "cancelled",
  "refund_pending",
  "refunded",
] as const;

export const PRODUCTION_BATCH_STATUSES = [
  "planned",
  "capacity_confirmed",
  "funded_by_orders",
  "production",
  "quality_review",
  "ready_for_pickup",
  "in_transit",
  "delivered",
  "settlement_pending",
  "settled",
  "failed",
  "refunding",
  "refunded",
] as const;

export const GROUP_SETTLEMENT_STATUSES = [
  "draft",
  "approval_required",
  "approved_submission_ready",
  "submitted",
  "provider_confirmed",
  "reconciled",
  "reversed",
] as const;

export const GROUP_SETTLEMENT_ROLES = [
  "producer_proceeds",
  "creator_affiliate_commission",
  "salesperson_commission",
  "territory_operator_commission",
  "carrier_fee",
  "taxes",
  "payment_provider_fee",
  "exportunity_commission",
  "reserve",
  "refund_exposure",
] as const;

export type GroupBuyingCampaignStatus = (typeof GROUP_BUYING_CAMPAIGN_STATUSES)[number];
export type ProductionBatchStatus = (typeof PRODUCTION_BATCH_STATUSES)[number];
export type GroupSettlementRole = (typeof GROUP_SETTLEMENT_ROLES)[number];

export const GROUP_BUYING_CAMPAIGN_TRANSITIONS: Record<
  GroupBuyingCampaignStatus,
  readonly GroupBuyingCampaignStatus[]
> = {
  draft: ["verification_required", "failed"],
  verification_required: ["draft", "live", "failed"],
  live: ["threshold_pending", "moq_reached", "failed", "refunding"],
  threshold_pending: ["moq_reached", "failed", "refunding"],
  moq_reached: ["payment_confirmed", "failed", "refunding"],
  payment_confirmed: ["production", "failed", "refunding"],
  production: ["ready_for_pickup", "failed", "refunding"],
  ready_for_pickup: ["in_transit", "failed", "refunding"],
  in_transit: ["delivered", "failed", "refunding"],
  delivered: ["settled", "refunding"],
  settled: [],
  failed: ["refunding", "refunded"],
  refunding: ["refunded"],
  refunded: [],
};

export const PRODUCTION_BATCH_TRANSITIONS: Record<
  ProductionBatchStatus,
  readonly ProductionBatchStatus[]
> = {
  planned: ["capacity_confirmed", "failed"],
  capacity_confirmed: ["funded_by_orders", "failed", "refunding"],
  funded_by_orders: ["production", "failed", "refunding"],
  production: ["quality_review", "failed", "refunding"],
  quality_review: ["ready_for_pickup", "failed", "refunding"],
  ready_for_pickup: ["in_transit", "failed", "refunding"],
  in_transit: ["delivered", "failed", "refunding"],
  delivered: ["settlement_pending", "refunding"],
  settlement_pending: ["settled", "refunding"],
  settled: [],
  failed: ["refunding", "refunded"],
  refunding: ["refunded"],
  refunded: [],
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)))
    : [];
}

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function hasCredentialKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasCredentialKey);
  return Object.entries(value as JsonRecord).some(
    ([key, child]) =>
      /(?:password|passwd|secret|access.?token|refresh.?token|authorization|cookie|private.?key|api.?key|client.?secret)/i.test(
        key,
      ) || hasCredentialKey(child),
  );
}

const REGULATED_CAPITAL_LANGUAGE =
  /\b(?:invest(?:ment|or|ing)?|equity|shareholder|dividend|securit(?:y|ies)|bondholder|token(?:ized)?\s+(?:asset|offering)|annual\s+yield|guaranteed\s+return|return\s+on\s+investment|profit\s*share|revenue\s*share|capital\s+raise|crowdfunding\s+investment)\b/i;

function stringsIn(value: unknown, result: string[] = []): string[] {
  if (typeof value === "string") result.push(value);
  else if (Array.isArray(value)) value.forEach((child) => stringsIn(child, result));
  else if (value && typeof value === "object") {
    Object.values(value as JsonRecord).forEach((child) => stringsIn(child, result));
  }
  return result;
}

export function containsRegulatedCapitalLanguage(value: unknown) {
  return stringsIn(value).some((text) => REGULATED_CAPITAL_LANGUAGE.test(text));
}

export function sanitizeGroupBuyingEvidence(value: unknown): JsonRecord {
  const record = asRecord(value);
  if (hasCredentialKey(record)) {
    throw new Error(
      "Group-buying evidence must not contain passwords, tokens, secrets, cookies, or API keys",
    );
  }
  const serialized = JSON.stringify(record);
  if (serialized.length > 100_000) throw new Error("Group-buying evidence exceeds 100 KB");
  return JSON.parse(serialized || "{}") as JsonRecord;
}

export function assertCommerceOnlyLanguage(value: unknown) {
  if (containsRegulatedCapitalLanguage(value)) {
    throw new Error(
      "Group-buying content must describe product commerce only and must not use investment, securities, equity, yield, dividend, or profit-share language",
    );
  }
}

export function exactMinorAmount(quantityValue: unknown, unitPriceMinorValue: unknown) {
  const quantity = asNumber(quantityValue);
  const unitPriceMinor = asNumber(unitPriceMinorValue);
  if (
    !quantity ||
    quantity <= 0 ||
    unitPriceMinor === null ||
    !Number.isSafeInteger(unitPriceMinor) ||
    unitPriceMinor < 0
  ) {
    return null;
  }
  const raw = quantity * unitPriceMinor;
  const rounded = Math.round(raw);
  if (!Number.isSafeInteger(rounded) || Math.abs(raw - rounded) > 0.000_001) return null;
  return rounded;
}

export type GroupBuyingPriceTierSnapshot = {
  id: string;
  tenantId: number;
  campaignId?: string;
  minimumQuantity: unknown;
  maximumQuantity?: unknown;
  unitPriceMinor: number;
  currencyCode: string;
  label?: string | null;
  status: string;
  evidence?: unknown;
  verifiedByUserId?: number | null;
  verifiedAt?: unknown;
};

export function evaluatePriceTiers(input: {
  tenantId: number;
  campaignId?: string;
  minimumQuantity: unknown;
  currencyCode: string;
  tiers: GroupBuyingPriceTierSnapshot[];
}) {
  const blockers: string[] = [];
  const normalized = [...input.tiers]
    .filter((tier) => ["verified", "active"].includes(String(tier.status)))
    .sort((a, b) => Number(a.minimumQuantity) - Number(b.minimumQuantity));
  if (!normalized.length) blockers.push("verified_price_tier_required");
  let previousMaximum: number | null = null;
  let openEndedSeen = false;
  for (const [index, tier] of normalized.entries()) {
    const minimum = asNumber(tier.minimumQuantity);
    const maximum = tier.maximumQuantity == null ? null : asNumber(tier.maximumQuantity);
    if (tier.tenantId !== input.tenantId) blockers.push("cross_tenant_price_tier_forbidden");
    if (input.campaignId && tier.campaignId && tier.campaignId !== input.campaignId) {
      blockers.push("price_tier_campaign_mismatch");
    }
    if (!minimum || minimum <= 0 || (maximum !== null && maximum < minimum)) {
      blockers.push(`price_tier_range_invalid:${tier.id}`);
    }
    if (!Number.isSafeInteger(tier.unitPriceMinor) || tier.unitPriceMinor < 0) {
      blockers.push(`price_tier_amount_invalid:${tier.id}`);
    }
    if (tier.currencyCode !== input.currencyCode) blockers.push(`price_tier_currency_mismatch:${tier.id}`);
    const evidence = asRecord(tier.evidence);
    if (evidence.verified !== true || !tier.verifiedByUserId || !asDate(tier.verifiedAt)) {
      blockers.push(`price_tier_verification_required:${tier.id}`);
    }
    if (openEndedSeen) blockers.push(`price_tier_after_open_range:${tier.id}`);
    if (index > 0 && previousMaximum !== null && minimum !== null && minimum <= previousMaximum) {
      blockers.push(`price_tier_overlap:${tier.id}`);
    }
    if (maximum === null) openEndedSeen = true;
    previousMaximum = maximum;
  }
  const campaignMinimum = asNumber(input.minimumQuantity);
  if (
    campaignMinimum &&
    normalized.length &&
    !normalized.some((tier) => {
      const minimum = Number(tier.minimumQuantity);
      const maximum = tier.maximumQuantity == null ? null : Number(tier.maximumQuantity);
      return campaignMinimum >= minimum && (maximum === null || campaignMinimum <= maximum);
    })
  ) {
    blockers.push("minimum_quantity_has_no_price_tier");
  }
  return { valid: blockers.length === 0, blockers: unique(blockers), tiers: normalized };
}

export function resolvePriceTierForQuantity(
  tiers: GroupBuyingPriceTierSnapshot[],
  quantityValue: unknown,
) {
  const quantity = asNumber(quantityValue);
  if (!quantity || quantity <= 0) return null;
  return (
    [...tiers]
      .filter((tier) => ["verified", "active"].includes(String(tier.status)))
      .sort((a, b) => Number(b.minimumQuantity) - Number(a.minimumQuantity))
      .find((tier) => {
        const minimum = Number(tier.minimumQuantity);
        const maximum = tier.maximumQuantity == null ? null : Number(tier.maximumQuantity);
        return quantity >= minimum && (maximum === null || quantity <= maximum);
      }) || null
  );
}

export type GroupCampaignReadinessInput = {
  tenantId: number;
  campaign: {
    id?: string;
    catalogItemId: string;
    producerFactoryId: string;
    supplierProfileId?: string | null;
    territoryId: number;
    campaignMediaItemId?: string | null;
    mediaRightsGrantId?: number | null;
    title: string;
    publicSummary: string;
    unitOfMeasure: string;
    minimumQuantity: unknown;
    currencyCode: string;
    baseUnitPriceMinor: number;
    deadline: unknown;
    productionLeadTimeDays: number;
    deliveryOptions: unknown;
    paymentTerms: string;
    refundConditions: string;
    capacityEvidence: unknown;
    campaignContent: unknown;
    commerceRail?: string;
    regulatedCapitalEnabled?: boolean;
    externalPaymentCollectionExecuted?: boolean;
    externalSettlementExecuted?: boolean;
  };
  catalog: {
    id: string;
    tenantId: number;
    factoryId: string;
    approvalStatus: string;
    visibility: string;
    currencyCode?: string | null;
    unitOfMeasure?: string | null;
  } | null;
  factory: {
    id: string;
    tenantId: number;
    factoryStatus: string;
    verificationStatus: string;
    publicVisibility: string;
    verifiedAt?: unknown;
  } | null;
  supplier?: {
    id: string;
    tenantId: number;
    linkedFactoryId?: string | null;
    supplierStatus: string;
    verificationStatus: string;
    verifiedAt?: unknown;
  } | null;
  territory: {
    id: number;
    tenantId: number;
    status: string;
    source?: string | null;
    sourceRef?: string | null;
  } | null;
  tiers: GroupBuyingPriceTierSnapshot[];
  sourceReference?: {
    mediaItemId?: string | null;
    sourceUrl?: unknown;
    reuseStatus?: unknown;
    takedownState?: unknown;
  } | null;
  rightsGrant?: JsonRecord | null;
  humanConfirmed: boolean;
  now?: Date;
};

export function evaluateGroupCampaignReadiness(input: GroupCampaignReadinessInput) {
  const now = input.now || new Date();
  const { campaign, catalog, factory, supplier, territory } = input;
  const blockers: string[] = [];
  if (!catalog || catalog.tenantId !== input.tenantId || catalog.id !== campaign.catalogItemId) {
    blockers.push("tenant_catalog_item_required");
  }
  if (catalog && (catalog.approvalStatus !== "approved" || catalog.visibility !== "public")) {
    blockers.push("approved_public_catalog_item_required");
  }
  if (catalog && catalog.factoryId !== campaign.producerFactoryId) {
    blockers.push("catalog_producer_factory_mismatch");
  }
  if (catalog?.currencyCode && catalog.currencyCode.toUpperCase() !== campaign.currencyCode) {
    blockers.push("catalog_currency_mismatch");
  }
  if (catalog?.unitOfMeasure && catalog.unitOfMeasure !== campaign.unitOfMeasure) {
    blockers.push("catalog_unit_of_measure_mismatch");
  }
  if (!factory || factory.tenantId !== input.tenantId || factory.id !== campaign.producerFactoryId) {
    blockers.push("tenant_producer_factory_required");
  }
  if (
    factory &&
    (factory.factoryStatus !== "active" ||
      factory.verificationStatus !== "verified" ||
      factory.publicVisibility !== "public" ||
      !asDate(factory.verifiedAt))
  ) {
    blockers.push("verified_public_active_factory_required");
  }
  if (campaign.supplierProfileId) {
    if (!supplier || supplier.id !== campaign.supplierProfileId || supplier.tenantId !== input.tenantId) {
      blockers.push("tenant_supplier_profile_required");
    } else {
      if (supplier.supplierStatus !== "active" || supplier.verificationStatus !== "verified" || !asDate(supplier.verifiedAt)) {
        blockers.push("verified_active_supplier_required");
      }
      if (supplier.linkedFactoryId && supplier.linkedFactoryId !== campaign.producerFactoryId) {
        blockers.push("supplier_factory_mismatch");
      }
    }
  }
  if (!territory || territory.id !== campaign.territoryId || territory.tenantId !== input.tenantId) {
    blockers.push("tenant_territory_required");
  } else {
    if (territory.status !== "active") blockers.push("active_territory_required");
    if (!String(territory.source || "").trim() || !String(territory.sourceRef || "").trim()) {
      blockers.push("sourced_territory_required");
    }
  }
  if (!String(campaign.title || "").trim()) blockers.push("campaign_title_required");
  if (String(campaign.publicSummary || "").trim().length < 20) blockers.push("campaign_summary_required");
  if (!String(campaign.unitOfMeasure || "").trim()) blockers.push("unit_of_measure_required");
  if (!/^[A-Z]{3}$/.test(campaign.currencyCode)) blockers.push("campaign_currency_invalid");
  if (!asNumber(campaign.minimumQuantity) || Number(campaign.minimumQuantity) <= 0) blockers.push("minimum_quantity_invalid");
  if (!Number.isSafeInteger(campaign.baseUnitPriceMinor) || campaign.baseUnitPriceMinor < 0) blockers.push("base_unit_price_invalid");
  const deadline = asDate(campaign.deadline);
  if (!deadline || deadline.getTime() <= now.getTime()) blockers.push("future_campaign_deadline_required");
  if (!Number.isSafeInteger(campaign.productionLeadTimeDays) || campaign.productionLeadTimeDays < 0) {
    blockers.push("production_lead_time_invalid");
  }
  if (!Array.isArray(campaign.deliveryOptions) || !campaign.deliveryOptions.length) {
    blockers.push("delivery_option_required");
  }
  if (String(campaign.paymentTerms || "").trim().length < 8) blockers.push("payment_terms_required");
  if (String(campaign.refundConditions || "").trim().length < 8) blockers.push("refund_conditions_required");
  const capacityEvidence = asRecord(campaign.capacityEvidence);
  if (capacityEvidence.verified !== true || !asStringArray(capacityEvidence.sourceReferences).length) {
    blockers.push("verified_capacity_evidence_required");
  }
  if (hasCredentialKey(campaign.capacityEvidence) || hasCredentialKey(campaign.campaignContent)) {
    blockers.push("credential_material_forbidden");
  }
  if (
    campaign.commerceRail !== undefined &&
    campaign.commerceRail !== "preorder_or_group_purchase"
  ) blockers.push("commerce_rail_required");
  if (campaign.regulatedCapitalEnabled === true) blockers.push("regulated_capital_forbidden");
  if (campaign.externalPaymentCollectionExecuted === true) blockers.push("campaign_preparation_cannot_collect_payment");
  if (campaign.externalSettlementExecuted === true) blockers.push("campaign_preparation_cannot_execute_settlement");
  if (
    containsRegulatedCapitalLanguage({
      title: campaign.title,
      publicSummary: campaign.publicSummary,
      paymentTerms: campaign.paymentTerms,
      refundConditions: campaign.refundConditions,
      campaignContent: campaign.campaignContent,
    })
  ) blockers.push("regulated_capital_language_forbidden");

  blockers.push(
    ...evaluatePriceTiers({
      tenantId: input.tenantId,
      campaignId: campaign.id,
      minimumQuantity: campaign.minimumQuantity,
      currencyCode: campaign.currencyCode,
      tiers: input.tiers,
    }).blockers,
  );

  const mediaPresent = Boolean(campaign.campaignMediaItemId);
  const grantPresent = Boolean(campaign.mediaRightsGrantId);
  if (mediaPresent !== grantPresent) blockers.push("campaign_media_rights_pair_required");
  if (mediaPresent && grantPresent) {
    if (input.sourceReference?.mediaItemId !== campaign.campaignMediaItemId) {
      blockers.push("campaign_media_source_mismatch");
    }
    if (Number(input.rightsGrant?.id || 0) !== Number(campaign.mediaRightsGrantId)) {
      blockers.push("campaign_rights_grant_mismatch");
    }
    const rights = evaluateMediaPublicationEligibility({
      sourceReference: input.sourceReference || null,
      grants: input.rightsGrant ? [input.rightsGrant] : [],
      usageType: "organic_publication",
      channel: "web",
      territoryId: campaign.territoryId,
      now,
    });
    blockers.push(...rights.blockers);
  }
  if (!input.humanConfirmed) blockers.push("human_campaign_approval_required");
  return {
    readyForLive: blockers.length === 0,
    blockers: unique(blockers),
    commerceRail: "preorder_or_group_purchase" as const,
    regulatedCapitalEnabled: false,
    externalPaymentCollectionExecuted: false,
    externalSettlementExecuted: false,
  };
}

export function evaluateBuyingInterest(input: {
  campaign: { status: string; deadline: unknown; currencyCode: string };
  tiers: GroupBuyingPriceTierSnapshot[];
  quantity: unknown;
  now?: Date;
}) {
  const blockers: string[] = [];
  const now = input.now || new Date();
  if (!["live", "threshold_pending"].includes(input.campaign.status)) blockers.push("campaign_not_accepting_interest");
  const deadline = asDate(input.campaign.deadline);
  if (!deadline || deadline.getTime() <= now.getTime()) blockers.push("campaign_deadline_passed");
  const quantity = asNumber(input.quantity);
  if (!quantity || quantity <= 0 || quantity > 1_000_000_000) blockers.push("interest_quantity_invalid");
  const tier = resolvePriceTierForQuantity(input.tiers, input.quantity);
  if (!tier) blockers.push("verified_price_tier_not_available");
  const totalAmountMinor = tier ? exactMinorAmount(input.quantity, tier.unitPriceMinor) : null;
  if (tier && totalAmountMinor === null) blockers.push("interest_amount_not_exact_minor_units");
  if (tier && tier.currencyCode !== input.campaign.currencyCode) blockers.push("interest_currency_mismatch");
  return {
    valid: blockers.length === 0,
    blockers: unique(blockers),
    quantity: quantity || 0,
    priceTier: tier,
    unitPriceMinor: tier?.unitPriceMinor ?? 0,
    totalAmountMinor,
    bindingCommitmentCreated: false,
    paymentCollected: false,
    inventoryReserved: false,
  };
}

export function evaluatePaidOrderBinding(input: {
  tenantId: number;
  campaign: { id: string; catalogItemId: string; producerFactoryId: string; currencyCode: string };
  commitment: {
    id: string;
    tenantId: number;
    campaignId: string;
    status: string;
    quantity: unknown;
    priceTierId?: string | null;
    unitPriceMinor: number;
    totalAmountMinor: number;
    currencyCode: string;
    industrialOrderId?: string | null;
    paymentId?: string | null;
    refundConditionsAcceptedAt?: unknown;
  };
  order: {
    id: string;
    tenantId: number;
    catalogItemId?: string | null;
    factoryId?: string | null;
    paymentStatus: string;
    totalAmount?: unknown;
    paidAmount?: unknown;
    currencyCode: string;
    paidCurrencyCode?: string | null;
    paidAt?: unknown;
    lastPaymentId?: string | null;
    sourceQuoteSnapshot?: unknown;
  } | null;
  payment: {
    id: string;
    tenantId: number;
    status: string;
    purpose: string;
    targetType: string;
    targetId: string;
    amount: number;
    currency: string;
    provider?: string | null;
    providerTransactionId?: string | null;
    providerTransactionRef?: string | null;
    creditedAt?: unknown;
  } | null;
}) {
  const blockers: string[] = [];
  const { campaign, commitment, order, payment } = input;
  if (commitment.tenantId !== input.tenantId || commitment.campaignId !== campaign.id) {
    blockers.push("tenant_commitment_required");
  }
  if (!["interest_recorded", "order_required", "payment_pending"].includes(commitment.status)) {
    blockers.push("commitment_not_bindable");
  }
  if (commitment.industrialOrderId || commitment.paymentId) blockers.push("commitment_already_bound");
  if (!asDate(commitment.refundConditionsAcceptedAt)) blockers.push("refund_conditions_acceptance_required");
  if (!order || order.tenantId !== input.tenantId) blockers.push("tenant_industrial_order_required");
  if (order && order.catalogItemId !== campaign.catalogItemId) blockers.push("order_catalog_item_mismatch");
  if (order && order.factoryId !== campaign.producerFactoryId) blockers.push("order_factory_mismatch");
  if (order && order.paymentStatus !== "paid") blockers.push("paid_industrial_order_required");
  if (order && (!asDate(order.paidAt) || !order.lastPaymentId)) blockers.push("canonical_order_payment_evidence_required");
  if (order && order.currencyCode !== campaign.currencyCode) blockers.push("order_currency_mismatch");
  if (order && Number(order.totalAmount) !== commitment.totalAmountMinor) blockers.push("order_total_mismatch");
  if (order && Number(order.paidAmount) !== commitment.totalAmountMinor) blockers.push("order_paid_amount_mismatch");
  if (order && String(order.paidCurrencyCode || "").toUpperCase() !== campaign.currencyCode) blockers.push("order_paid_currency_mismatch");
  const snapshot = asRecord(asRecord(order?.sourceQuoteSnapshot).groupBuying);
  if (String(snapshot.campaignId || "") !== campaign.id) blockers.push("order_campaign_snapshot_mismatch");
  if (Number(snapshot.quantity) !== Number(commitment.quantity)) blockers.push("order_quantity_snapshot_mismatch");
  if (Number(snapshot.unitPriceMinor) !== commitment.unitPriceMinor) blockers.push("order_unit_price_snapshot_mismatch");
  if (String(snapshot.priceTierId || "") !== String(commitment.priceTierId || "")) blockers.push("order_price_tier_snapshot_mismatch");
  if (!payment || payment.tenantId !== input.tenantId) blockers.push("tenant_payment_required");
  if (payment && payment.status !== "succeeded") blockers.push("provider_confirmed_payment_required");
  if (payment && payment.purpose !== "INDUSTRIAL_ORDER_PAYMENT") blockers.push("industrial_payment_purpose_mismatch");
  if (payment && payment.targetType !== "INDUSTRIAL_ORDER") blockers.push("industrial_payment_target_type_mismatch");
  if (payment && payment.targetId !== order?.id) blockers.push("industrial_payment_target_mismatch");
  if (payment && payment.amount !== commitment.totalAmountMinor) blockers.push("payment_amount_mismatch");
  if (payment && payment.currency.toUpperCase() !== campaign.currencyCode) blockers.push("payment_currency_mismatch");
  if (payment && order?.lastPaymentId !== payment.id) blockers.push("order_last_payment_mismatch");
  if (payment && !asDate(payment.creditedAt)) blockers.push("payment_not_credited");
  if (payment && !String(payment.providerTransactionId || payment.providerTransactionRef || "").trim()) {
    blockers.push("provider_transaction_reference_required");
  }
  const exact = exactMinorAmount(commitment.quantity, commitment.unitPriceMinor);
  if (exact === null || exact !== commitment.totalAmountMinor) blockers.push("commitment_amount_mismatch");
  return {
    verified: blockers.length === 0,
    blockers: unique(blockers),
    providerVerified: blockers.length === 0,
    paymentId: payment?.id || null,
    industrialOrderId: order?.id || null,
  };
}

export function evaluateCampaignTransition(current: string, next: string) {
  const blockers: string[] = [];
  if (!GROUP_BUYING_CAMPAIGN_STATUSES.includes(current as GroupBuyingCampaignStatus)) blockers.push("campaign_status_invalid");
  if (!GROUP_BUYING_CAMPAIGN_STATUSES.includes(next as GroupBuyingCampaignStatus)) blockers.push("next_campaign_status_invalid");
  if (
    !blockers.length &&
    !GROUP_BUYING_CAMPAIGN_TRANSITIONS[current as GroupBuyingCampaignStatus].includes(
      next as GroupBuyingCampaignStatus,
    )
  ) blockers.push(`campaign_transition_forbidden:${current}:${next}`);
  return { valid: blockers.length === 0, blockers };
}

export function evaluateProductionBatchTransition(input: {
  tenantId: number;
  currentStatus: string;
  nextStatus: string;
  campaign: { id: string; tenantId: number; minimumQuantity: unknown; committedQuantity: unknown };
  batch: {
    campaignId: string;
    tenantId: number;
    targetQuantity: unknown;
    allocatedQuantity: unknown;
    producedQuantity: unknown;
    passedInspectionQuantity: unknown;
    readyQuantity: unknown;
    handedToCarrierQuantity: unknown;
    deliveredQuantity: unknown;
    capacityEvidence: unknown;
    productionEvidence: unknown;
    inspectionEvidence: unknown;
    handoffEvidence: unknown;
    deliveryEvidence: unknown;
    settlementEvidence: unknown;
    externalProductionExecuted: boolean;
    externalCarrierHandoffExecuted: boolean;
    externalSettlementExecuted: boolean;
    carrierBookingAuthorizationId?: string | null;
    approvedByUserId?: number | null;
    startedAt?: unknown;
    readyAt?: unknown;
    handedToCarrierAt?: unknown;
    deliveredAt?: unknown;
    settledAt?: unknown;
    failedAt?: unknown;
  };
  commitments: Array<{ id: string; status: string; quantity: unknown; industrialOrderId?: string | null; canonicalPaymentVerified?: boolean }>;
  allocations: Array<{ commitmentId: string; industrialOrderId: string; quantity: unknown; status: string }>;
  carrierBooking?: {
    id: string;
    tenantId: number;
    status: string;
    externalBookingExecuted: boolean;
    providerBookingReference?: string | null;
    providerConfirmedAt?: unknown;
    providerConfirmationEvidence?: unknown;
  } | null;
  settlementPlan?: {
    tenantId: number;
    status: string;
    externalSettlementExecuted: boolean;
    providerSettlementReference?: string | null;
    providerConfirmedAt?: unknown;
    providerEvidence?: unknown;
  } | null;
}) {
  const blockers: string[] = [];
  const { batch, campaign } = input;
  if (batch.tenantId !== input.tenantId || campaign.tenantId !== input.tenantId || batch.campaignId !== campaign.id) {
    blockers.push("tenant_production_batch_required");
  }
  if (!PRODUCTION_BATCH_STATUSES.includes(input.currentStatus as ProductionBatchStatus)) blockers.push("production_batch_status_invalid");
  if (!PRODUCTION_BATCH_STATUSES.includes(input.nextStatus as ProductionBatchStatus)) blockers.push("next_production_batch_status_invalid");
  if (
    !blockers.length &&
    !PRODUCTION_BATCH_TRANSITIONS[input.currentStatus as ProductionBatchStatus].includes(
      input.nextStatus as ProductionBatchStatus,
    )
  ) blockers.push(`production_batch_transition_forbidden:${input.currentStatus}:${input.nextStatus}`);
  const capacity = asRecord(batch.capacityEvidence);
  if (input.nextStatus !== "failed" && (capacity.verified !== true || !batch.approvedByUserId)) {
    blockers.push("verified_batch_capacity_required");
  }
  const target = Number(batch.targetQuantity);
  const allocated = Number(batch.allocatedQuantity);
  const paidCommitments = input.commitments.filter((row) =>
    ["payment_confirmed", "allocated_to_batch", "fulfilled"].includes(row.status) &&
    row.canonicalPaymentVerified === true && Boolean(row.industrialOrderId),
  );
  const paidQuantity = paidCommitments.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const allocationQuantity = input.allocations
    .filter((row) => !["cancelled", "refunded"].includes(row.status))
    .reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const allocationByCommitment = new Map(input.allocations.map((row) => [row.commitmentId, row]));
  const allocationsExact = paidCommitments.every((commitment) => {
    const allocation = allocationByCommitment.get(commitment.id);
    return Boolean(
      allocation &&
        allocation.industrialOrderId === commitment.industrialOrderId &&
        Number(allocation.quantity) === Number(commitment.quantity),
    );
  });
  const requiresFunding = [
    "funded_by_orders",
    "production",
    "quality_review",
    "ready_for_pickup",
    "in_transit",
    "delivered",
    "settlement_pending",
    "settled",
  ].includes(input.nextStatus);
  if (requiresFunding) {
    if (paidQuantity < Number(campaign.minimumQuantity)) blockers.push("paid_quantity_below_campaign_moq");
    if (paidQuantity !== target || allocated !== target || allocationQuantity !== target || !allocationsExact) {
      blockers.push("production_batch_allocation_not_exact");
    }
  }
  const requiresProduction = [
    "production",
    "quality_review",
    "ready_for_pickup",
    "in_transit",
    "delivered",
    "settlement_pending",
    "settled",
  ].includes(input.nextStatus);
  if (requiresProduction && (!batch.externalProductionExecuted || !asDate(batch.startedAt) || !asArray(batch.productionEvidence).length)) {
    blockers.push("verified_external_production_evidence_required");
  }
  if (["quality_review", "ready_for_pickup", "in_transit", "delivered", "settlement_pending", "settled"].includes(input.nextStatus)) {
    if (Number(batch.producedQuantity) !== target) blockers.push("produced_quantity_must_equal_batch_target");
  }
  if (["ready_for_pickup", "in_transit", "delivered", "settlement_pending", "settled"].includes(input.nextStatus)) {
    if (
      !asDate(batch.readyAt) ||
      Number(batch.passedInspectionQuantity) !== target ||
      Number(batch.readyQuantity) !== target ||
      !asArray(batch.inspectionEvidence).length
    ) {
      blockers.push("inspection_and_ready_evidence_required");
    }
  }
  if (["in_transit", "delivered", "settlement_pending", "settled"].includes(input.nextStatus)) {
    const booking = input.carrierBooking;
    const providerEvidence = asRecord(booking?.providerConfirmationEvidence);
    if (
      !booking || booking.tenantId !== input.tenantId || booking.id !== batch.carrierBookingAuthorizationId ||
      !["provider_confirmed", "in_progress", "completed"].includes(booking.status) ||
      booking.externalBookingExecuted !== true || !booking.providerBookingReference ||
      !asDate(booking.providerConfirmedAt) || providerEvidence.providerConfirmed !== true ||
      !batch.externalCarrierHandoffExecuted || !asDate(batch.handedToCarrierAt) ||
      !asArray(batch.handoffEvidence).length || Number(batch.handedToCarrierQuantity) !== target
    ) blockers.push("provider_confirmed_carrier_handoff_required");
  }
  if (["delivered", "settlement_pending", "settled"].includes(input.nextStatus)) {
    if (!asDate(batch.deliveredAt) || Number(batch.deliveredQuantity) !== target || !asArray(batch.deliveryEvidence).length) {
      blockers.push("verified_delivery_evidence_required");
    }
  }
  if (input.nextStatus === "settled") {
    const plan = input.settlementPlan;
    const providerEvidence = asRecord(plan?.providerEvidence);
    if (
      !plan || plan.tenantId !== input.tenantId ||
      !["provider_confirmed", "reconciled"].includes(plan.status) ||
      plan.externalSettlementExecuted !== true || !plan.providerSettlementReference ||
      !asDate(plan.providerConfirmedAt) || providerEvidence.providerConfirmed !== true ||
      !batch.externalSettlementExecuted || !asDate(batch.settledAt) ||
      !asArray(batch.settlementEvidence).length
    ) blockers.push("provider_confirmed_settlement_required");
  }
  if (input.nextStatus === "failed" && !asDate(batch.failedAt)) blockers.push("batch_failure_timestamp_required");
  if (hasCredentialKey({
    capacity: batch.capacityEvidence,
    production: batch.productionEvidence,
    inspection: batch.inspectionEvidence,
    handoff: batch.handoffEvidence,
    delivery: batch.deliveryEvidence,
    settlement: batch.settlementEvidence,
  })) blockers.push("credential_material_forbidden");
  return {
    valid: blockers.length === 0,
    blockers: unique(blockers),
    paidQuantity,
    allocationQuantity,
    externalProviderActionExecuted: false,
  };
}

export type GroupSettlementAllocationInput = {
  commitmentId?: string | null;
  recipientRole: string;
  recipientReference?: string | null;
  amountMinor: number;
  currencyCode: string;
  calculationBasis: string;
  evidence?: Record<string, unknown>;
};

export function evaluateSettlementPlan(input: {
  grossCollectedMinor: number;
  refundExposureMinor: number;
  currencyCode: string;
  paidCommitments: Array<{ id: string; totalAmountMinor: number; currencyCode: string; canonicalPaymentVerified: boolean }>;
  allocations: GroupSettlementAllocationInput[];
  calculationEvidence: unknown;
}) {
  const blockers: string[] = [];
  if (!Number.isSafeInteger(input.grossCollectedMinor) || input.grossCollectedMinor < 0) blockers.push("settlement_gross_invalid");
  if (!Number.isSafeInteger(input.refundExposureMinor) || input.refundExposureMinor < 0 || input.refundExposureMinor > input.grossCollectedMinor) {
    blockers.push("settlement_refund_exposure_invalid");
  }
  if (!/^[A-Z]{3}$/.test(input.currencyCode)) blockers.push("settlement_currency_invalid");
  const canonicalGross = input.paidCommitments.reduce((sum, row) => {
    if (!row.canonicalPaymentVerified) blockers.push(`unverified_paid_commitment:${row.id}`);
    if (row.currencyCode !== input.currencyCode) blockers.push(`paid_commitment_currency_mismatch:${row.id}`);
    return sum + Number(row.totalAmountMinor || 0);
  }, 0);
  if (canonicalGross !== input.grossCollectedMinor) blockers.push("settlement_gross_does_not_match_paid_orders");
  const seen = new Set<string>();
  let allocationTotal = 0;
  let refundAllocationTotal = 0;
  for (const [index, allocation] of input.allocations.entries()) {
    if (!GROUP_SETTLEMENT_ROLES.includes(allocation.recipientRole as GroupSettlementRole)) {
      blockers.push(`settlement_role_invalid:${index}`);
    }
    if (!Number.isSafeInteger(allocation.amountMinor) || allocation.amountMinor < 0) blockers.push(`settlement_allocation_amount_invalid:${index}`);
    if (allocation.currencyCode !== input.currencyCode) blockers.push(`settlement_allocation_currency_mismatch:${index}`);
    if (String(allocation.calculationBasis || "").trim().length < 8) blockers.push(`settlement_calculation_basis_required:${index}`);
    if (!Object.keys(asRecord(allocation.evidence)).length || hasCredentialKey(allocation.evidence)) blockers.push(`settlement_allocation_evidence_required:${index}`);
    const key = `${allocation.recipientRole}:${allocation.commitmentId || "_"}`;
    if (seen.has(key)) blockers.push(`settlement_allocation_duplicate:${key}`);
    seen.add(key);
    allocationTotal += Number(allocation.amountMinor || 0);
    if (allocation.recipientRole === "refund_exposure") refundAllocationTotal += Number(allocation.amountMinor || 0);
  }
  if (!input.allocations.length) blockers.push("settlement_allocation_required");
  if (allocationTotal !== input.grossCollectedMinor) blockers.push("settlement_allocations_do_not_balance");
  if (refundAllocationTotal !== input.refundExposureMinor) blockers.push("refund_exposure_allocation_mismatch");
  const calculationEvidence = asRecord(input.calculationEvidence);
  if (calculationEvidence.verified !== true || !asStringArray(calculationEvidence.sourceReferences).length || hasCredentialKey(calculationEvidence)) {
    blockers.push("settlement_calculation_evidence_required");
  }
  return {
    valid: blockers.length === 0,
    blockers: unique(blockers),
    canonicalGross,
    allocationTotal,
    distributableMinor: input.grossCollectedMinor - input.refundExposureMinor,
    externalSettlementExecuted: false,
    providerSettlementConfirmed: false,
  };
}
