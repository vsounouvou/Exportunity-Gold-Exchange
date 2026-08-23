export const AD_BUDGET_SCOPE_TYPES = [
  "global",
  "brand",
  "tenant",
  "country",
  "city",
  "neighborhood",
  "channel",
  "campaign",
  "test",
  "production",
  "rights",
] as const;

export const AD_CAMPAIGN_STATUSES = [
  "DRAFT",
  "AWAITING_ACCOUNT",
  "AWAITING_RIGHTS",
  "AWAITING_STOCK",
  "AWAITING_DELIVERY",
  "AWAITING_BUDGET",
  "NEEDS_REVIEW",
  "APPROVED",
  "SUBMISSION_READY",
  "ACTIVE",
  "PAUSED",
  "RESTRICTED",
  "COMPLETED",
  "FAILED",
  "REMOVED",
] as const;

type JsonRecord = Record<string, unknown>;

type AdAccountReadinessInput = {
  tenantId?: number | null;
  ownershipStatus?: unknown;
  billingOwnershipStatus?: unknown;
  authorizationStatus?: unknown;
  healthStatus?: unknown;
  restrictionStatus?: unknown;
  capabilities?: unknown;
  permissions?: unknown;
  verificationEvidence?: unknown;
  lastVerifiedAt?: unknown;
};

type BudgetEnvelopeInput = {
  tenantId?: number | null;
  id?: string | null;
  parentEnvelopeId?: string | null;
  scopeType?: string | null;
  currencyCode?: string | null;
  status?: string | null;
  periodStart?: unknown;
  periodEnd?: unknown;
  totalCapMinor?: number | null;
  dailyCapMinor?: number | null;
  weeklyCapMinor?: number | null;
  monthlyCapMinor?: number | null;
  committedMinor?: number | null;
  spentMinor?: number | null;
  maximumCacMinor?: number | null;
  minimumMarginBps?: number | null;
  agentReallocationAllowed?: boolean | null;
  maximumReallocationBps?: number | null;
  approvedByUserId?: number | null;
  approvedAt?: unknown;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean))) : [];
}

function normalized(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function validDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date : null;
}

function hasMaterialEvidence(value: unknown) {
  const evidence = asRecord(value);
  return Boolean(
    String(evidence.evidenceId || evidence.referenceId || evidence.sourceUrl || evidence.providerReference || "").trim() &&
      validDate(evidence.verifiedAt || evidence.capturedAt),
  );
}

function validHttpUrl(value: unknown) {
  try {
    const parsed = new URL(String(value || "").trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function sanitizeAdAccountVerificationEvidence(value: unknown, now = new Date()) {
  const source = asRecord(value);
  if (source.verified !== true) throw new Error("verified ad-account evidence is required");
  if (source.businessOwned !== true) throw new Error("business-owned ad account evidence is required");
  if (source.billingTenantOwned !== true) throw new Error("tenant-owned billing evidence is required");
  if (source.credentialsExcluded !== true) throw new Error("verification must exclude passwords and credentials");
  const verifiedAt = validDate(source.verifiedAt);
  if (!verifiedAt) throw new Error("verification verifiedAt is required");
  if (verifiedAt.getTime() > now.getTime() + 5 * 60_000) throw new Error("verification timestamp cannot be in the future");
  const providerReference = String(source.providerReference || "").trim().slice(0, 240);
  if (!providerReference) throw new Error("verification providerReference is required");
  return {
    verified: true,
    businessOwned: true,
    billingTenantOwned: true,
    credentialsExcluded: true,
    verifiedAt: verifiedAt.toISOString(),
    providerReference,
    businessOwnerReference: String(source.businessOwnerReference || "").trim().slice(0, 240) || null,
    verificationMethod: String(source.verificationMethod || "provider_api").trim().slice(0, 120),
  };
}

export function evaluateAdAccountReadiness(account: AdAccountReadinessInput | null | undefined, now = new Date()) {
  const blockers: string[] = [];
  if (!account) {
    blockers.push("tenant_ad_account_connection_required");
    return { ready: false, blockers, credentialFieldsExposed: false };
  }
  if (normalized(account.ownershipStatus) !== "business_owned") blockers.push("business_owned_account_required");
  if (normalized(account.billingOwnershipStatus) !== "tenant_owned") blockers.push("tenant_owned_billing_method_required");
  if (!["authorized", "connected", "active", "verified"].includes(normalized(account.authorizationStatus))) {
    blockers.push("ad_account_authorization_required");
  }
  if (!["healthy", "active", "verified"].includes(normalized(account.healthStatus))) {
    blockers.push(`ad_account_health_${normalized(account.healthStatus) || "unknown"}`);
  }
  if (!["none", "clear", "unrestricted"].includes(normalized(account.restrictionStatus))) {
    blockers.push(`ad_account_restriction_${normalized(account.restrictionStatus) || "unknown"}`);
  }
  const capabilities = stringArray(account.capabilities);
  if (!capabilities.includes("create_advertisement")) blockers.push("create_advertisement_capability_required");
  if (!stringArray(account.permissions).length) blockers.push("scoped_ad_permissions_required");
  const lastVerifiedAt = validDate(account.lastVerifiedAt);
  if (!lastVerifiedAt || lastVerifiedAt.getTime() > now.getTime() + 5 * 60_000 || now.getTime() - lastVerifiedAt.getTime() > 30 * 24 * 60 * 60_000) {
    blockers.push("recent_account_verification_required");
  }
  const verification = asRecord(account.verificationEvidence);
  if (
    verification.verified !== true ||
    verification.businessOwned !== true ||
    verification.billingTenantOwned !== true ||
    verification.credentialsExcluded !== true
  ) {
    blockers.push("ownership_and_billing_verification_evidence_required");
  }
  return { ready: blockers.length === 0, blockers, credentialFieldsExposed: false };
}

export function evaluateHierarchicalBudgetAvailability(input: {
  tenantId: number;
  currencyCode: string;
  requestedMinor: number;
  envelope: BudgetEnvelopeInput | null | undefined;
  ancestors?: BudgetEnvelopeInput[];
  spentTodayMinor?: number;
  spentWeekMinor?: number;
  spentMonthMinor?: number;
  spendWindowsByEnvelopeId?: Record<
    string,
    { spentTodayMinor?: number; spentWeekMinor?: number; spentMonthMinor?: number }
  >;
  now?: Date;
}) {
  const blockers: string[] = [];
  const requestedMinor = positiveInteger(input.requestedMinor);
  if (requestedMinor <= 0) blockers.push("positive_requested_budget_required");
  const chain = [input.envelope, ...(input.ancestors || [])].filter(Boolean) as BudgetEnvelopeInput[];
  if (!chain.length) blockers.push("approved_budget_envelope_required");
  const now = input.now || new Date();
  let effectiveAvailableMinor = Number.MAX_SAFE_INTEGER;

  for (const envelope of chain) {
    const label = String(envelope.scopeType || envelope.id || "unknown");
    if (Number(envelope.tenantId) !== Number(input.tenantId)) blockers.push(`cross_tenant_envelope_forbidden:${label}`);
    if (String(envelope.currencyCode || "").toUpperCase() !== String(input.currencyCode || "").toUpperCase()) {
      blockers.push(`currency_mismatch:${label}`);
    }
    if (normalized(envelope.status) !== "active" || !envelope.approvedByUserId || !validDate(envelope.approvedAt)) {
      blockers.push(`active_approved_envelope_required:${label}`);
    }
    const start = validDate(envelope.periodStart);
    const end = validDate(envelope.periodEnd);
    if (!start || !end || now < start || now >= end) blockers.push(`envelope_outside_active_period:${label}`);

    const totalCap = positiveInteger(envelope.totalCapMinor);
    const totalUsed = positiveInteger(envelope.spentMinor) + positiveInteger(envelope.committedMinor);
    const totalAvailable = Math.max(0, totalCap - totalUsed);
    effectiveAvailableMinor = Math.min(effectiveAvailableMinor, totalAvailable);
    if (totalCap <= 0) blockers.push(`positive_total_cap_required:${label}`);
    if (requestedMinor > totalAvailable) blockers.push(`total_cap_exceeded:${label}`);

    const window = (envelope.id && input.spendWindowsByEnvelopeId?.[envelope.id]) || input;
    const periodChecks = [
      ["daily", positiveInteger(envelope.dailyCapMinor), positiveInteger(window.spentTodayMinor)],
      ["weekly", positiveInteger(envelope.weeklyCapMinor), positiveInteger(window.spentWeekMinor)],
      ["monthly", positiveInteger(envelope.monthlyCapMinor), positiveInteger(window.spentMonthMinor)],
    ] as const;
    for (const [period, cap, spent] of periodChecks) {
      if (cap <= 0) {
        blockers.push(`${period}_cap_required:${label}`);
        effectiveAvailableMinor = 0;
      } else {
        const available = Math.max(0, cap - spent);
        effectiveAvailableMinor = Math.min(effectiveAvailableMinor, available);
        if (requestedMinor > available) blockers.push(`${period}_cap_exceeded:${label}`);
      }
    }
  }

  if (effectiveAvailableMinor === Number.MAX_SAFE_INTEGER) effectiveAvailableMinor = 0;
  return {
    ready: blockers.length === 0,
    blockers: Array.from(new Set(blockers)),
    requestedMinor,
    effectiveAvailableMinor,
    externalSpendAuthorized: false,
  };
}

export function evaluateAdPreSpendReadiness(input: {
  tenantId: number;
  currencyCode: string;
  objective: unknown;
  account: AdAccountReadinessInput | null | undefined;
  envelope: BudgetEnvelopeInput | null | undefined;
  ancestors?: BudgetEnvelopeInput[];
  requestedBudgetMinor: number;
  spentTodayMinor?: number;
  spentWeekMinor?: number;
  spentMonthMinor?: number;
  spendWindowsByEnvelopeId?: Record<
    string,
    { spentTodayMinor?: number; spentWeekMinor?: number; spentMonthMinor?: number }
  >;
  eligibleProducts: unknown;
  stockCapacityEvidence: unknown;
  territoryId: number;
  territoryEvidence: unknown;
  deliveryCoverageEvidence: unknown;
  landingPageUrl: unknown;
  landingPageEvidence: unknown;
  trackingPlan: unknown;
  marginBps: number;
  maximumCacMinor: number;
  paidRightsEligible: boolean;
  rightsEvidence: unknown;
  policyStatus: unknown;
  stoppingConditions: unknown;
  now?: Date;
}) {
  const blockers: string[] = [];
  if (!String(input.objective || "").trim()) blockers.push("campaign_objective_required");

  const accountReadiness = evaluateAdAccountReadiness(input.account, input.now);
  blockers.push(...accountReadiness.blockers);
  const budget = evaluateHierarchicalBudgetAvailability({
    tenantId: input.tenantId,
    currencyCode: input.currencyCode,
    requestedMinor: input.requestedBudgetMinor,
    envelope: input.envelope,
    ancestors: input.ancestors,
    spentTodayMinor: input.spentTodayMinor,
    spentWeekMinor: input.spentWeekMinor,
    spentMonthMinor: input.spentMonthMinor,
    spendWindowsByEnvelopeId: input.spendWindowsByEnvelopeId,
    now: input.now,
  });
  blockers.push(...budget.blockers);

  const products = Array.isArray(input.eligibleProducts) ? input.eligibleProducts.map(asRecord) : [];
  if (!products.length) blockers.push("eligible_product_required");
  for (const product of products) {
    const reference = String(product.productId || product.reference || "unknown").trim();
    if (product.orderable !== true) blockers.push(`product_not_orderable:${reference}`);
    if (!String(product.evidenceRef || "").trim()) blockers.push(`product_eligibility_evidence_required:${reference}`);
    if (!String(product.approvedFactRef || "").trim()) blockers.push(`approved_product_fact_reference_required:${reference}`);
  }

  const stock = asRecord(input.stockCapacityEvidence);
  if (stock.verified !== true || positiveInteger(stock.availableUnits || stock.capacityUnits) <= 0 || !hasMaterialEvidence(stock)) {
    blockers.push("verified_stock_or_capacity_required");
  }
  if (!Number.isFinite(Number(input.territoryId)) || Number(input.territoryId) <= 0 || !hasMaterialEvidence(input.territoryEvidence)) {
    blockers.push("verified_territory_required");
  }
  const delivery = asRecord(input.deliveryCoverageEvidence);
  if (delivery.verified !== true || delivery.serviceable !== true || !hasMaterialEvidence(delivery)) {
    blockers.push("verified_delivery_coverage_required");
  }
  if (!validHttpUrl(input.landingPageUrl) || !hasMaterialEvidence(input.landingPageEvidence)) {
    blockers.push("verified_landing_page_required");
  }
  const tracking = asRecord(input.trackingPlan);
  if (!String(tracking.trackingCode || "").trim() || !String(tracking.conversionEvent || "").trim()) {
    blockers.push("conversion_tracking_plan_required");
  }

  const marginBps = positiveInteger(input.marginBps);
  const minimumMarginBps = positiveInteger(input.envelope?.minimumMarginBps);
  if (marginBps <= 0 || marginBps < minimumMarginBps) blockers.push("minimum_margin_not_met");
  const maximumCacMinor = positiveInteger(input.maximumCacMinor);
  const envelopeMaxCacMinor = positiveInteger(input.envelope?.maximumCacMinor);
  if (maximumCacMinor <= 0) blockers.push("positive_maximum_cac_required");
  if (envelopeMaxCacMinor > 0 && maximumCacMinor > envelopeMaxCacMinor) blockers.push("maximum_cac_exceeds_envelope");

  if (input.paidRightsEligible !== true || !hasMaterialEvidence(input.rightsEvidence)) {
    blockers.push("paid_ad_rights_required");
  }
  if (normalized(input.policyStatus) !== "approved") blockers.push("platform_and_brand_policy_approval_required");

  const stops = asRecord(input.stoppingConditions);
  for (const key of [
    "maxSpendMinor",
    "maxCacMinor",
    "pauseOnAccountRestriction",
    "pauseWhenProductUnavailable",
    "pauseWhenDeliveryUnavailable",
  ]) {
    if (!(key in stops)) blockers.push(`stopping_condition_required:${key}`);
  }
  if (positiveInteger(stops.maxSpendMinor) > positiveInteger(input.requestedBudgetMinor)) {
    blockers.push("stopping_max_spend_exceeds_requested_budget");
  }

  const uniqueBlockers = Array.from(new Set(blockers));
  return {
    readyForApproval: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    accountReadiness,
    budget,
    externalCampaignCreated: false,
    externalSpendAuthorized: false,
    policyVersion: "ad-pre-spend-governance-v1",
  };
}

export function campaignStatusForBlockers(blockers: string[]) {
  if (blockers.some((item) => item.startsWith("ad_account_restriction_") || item.startsWith("ad_account_health_"))) {
    return "RESTRICTED" as const;
  }
  if (blockers.some((item) => item.includes("rights"))) return "AWAITING_RIGHTS" as const;
  if (blockers.some((item) => item.includes("account") || item.includes("billing") || item.includes("permission"))) {
    return "AWAITING_ACCOUNT" as const;
  }
  if (blockers.some((item) => item.includes("stock") || item.includes("orderable") || item.includes("product_"))) {
    return "AWAITING_STOCK" as const;
  }
  if (blockers.some((item) => item.includes("delivery") || item.includes("territory"))) {
    return "AWAITING_DELIVERY" as const;
  }
  if (blockers.some((item) => item.includes("cap") || item.includes("budget") || item.includes("envelope"))) {
    return "AWAITING_BUDGET" as const;
  }
  return "NEEDS_REVIEW" as const;
}

export function evaluateAgentBudgetReallocation(input: {
  tenantId: number;
  source: BudgetEnvelopeInput;
  target: BudgetEnvelopeInput;
  amountMinor: number;
}) {
  const blockers: string[] = [];
  const amountMinor = positiveInteger(input.amountMinor);
  if (amountMinor <= 0) blockers.push("positive_reallocation_amount_required");
  if (Number(input.source.tenantId) !== input.tenantId || Number(input.target.tenantId) !== input.tenantId) {
    blockers.push("cross_tenant_reallocation_forbidden");
  }
  if (String(input.source.currencyCode || "").toUpperCase() !== String(input.target.currencyCode || "").toUpperCase()) {
    blockers.push("cross_currency_reallocation_forbidden");
  }
  if (normalized(input.source.status) !== "active" || normalized(input.target.status) !== "active") {
    blockers.push("active_envelopes_required");
  }
  if (input.source.agentReallocationAllowed !== true) blockers.push("agent_reallocation_not_authorized");
  if (input.source.parentEnvelopeId !== input.target.parentEnvelopeId) blockers.push("reallocation_must_stay_within_parent_boundary");
  if (input.source.scopeType === "rights" || input.target.scopeType === "rights") blockers.push("rights_budget_reallocation_requires_human_approval");
  const available = Math.max(
    0,
    positiveInteger(input.source.totalCapMinor) -
      positiveInteger(input.source.spentMinor) -
      positiveInteger(input.source.committedMinor),
  );
  if (amountMinor > available) blockers.push("reallocation_exceeds_source_available_budget");
  const maximum = Math.floor(
    (positiveInteger(input.source.totalCapMinor) * positiveInteger(input.source.maximumReallocationBps)) / 10_000,
  );
  if (amountMinor > maximum) blockers.push("reallocation_exceeds_approved_percentage");
  return {
    eligible: blockers.length === 0,
    blockers,
    amountMinor,
    externalSpendPerformed: false,
  };
}

export function buildManualAdHandoffPackage(input: {
  mediaPlanId: string;
  campaignId: string;
  accountReference: string;
  objective: string;
  territoryId: number;
  requestedBudgetMinor: number;
  currencyCode: string;
  trackingCode: string;
  stoppingConditions: JsonRecord;
}) {
  return {
    status: "NEEDS_REVIEW" as const,
    mediaPlanId: input.mediaPlanId,
    campaignId: input.campaignId,
    accountReference: input.accountReference,
    objective: input.objective,
    territoryId: input.territoryId,
    requestedBudgetMinor: input.requestedBudgetMinor,
    currencyCode: input.currencyCode,
    trackingCode: input.trackingCode,
    stoppingConditions: input.stoppingConditions,
    instructions: [
      "Re-verify the business-owned account, tenant-owned billing, permissions, health, and restrictions.",
      "Confirm the approved envelope and spend authorization remain current and unexhausted.",
      "Re-check orderability, stock/capacity, delivery coverage, landing page, paid rights, policy, margin, CAC, and stop rules.",
      "Submit only through an official provider adapter after accountable approval and reconcile every provider charge.",
    ],
    externalCampaignCreated: false,
    externalSpendPerformed: false,
  };
}
