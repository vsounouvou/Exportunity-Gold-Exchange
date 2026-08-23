export const TERRITORY_SCORECARD_MIGRATION =
  "20270422_exportunity_territory_media_commerce_scorecards.sql";

export const TERRITORY_MEDIA_COMMERCE_METRIC_KEYS = [
  "fulfilledGmvMinor",
  "producerIncomeMinor",
  "contributionMarginMinor",
  "creatorAttributedSalesMinor",
  "mediaSpendMinor",
  "productPageSessions",
  "qualifiedLeads",
  "acquiredCustomers",
  "attributableCompletedOrders",
  "groupOrderCampaigns",
  "groupOrderThresholdsReached",
  "paymentAttempts",
  "paymentSuccesses",
  "deliveryAttempts",
  "successfulDeliveries",
  "onTimeDeliveries",
  "disputes",
  "refunds",
  "repeatBuyers",
  "rightsClearedAssets",
  "publishedContentAssets",
] as const;

export type TerritoryMediaCommerceMetricKey =
  (typeof TERRITORY_MEDIA_COMMERCE_METRIC_KEYS)[number];

type JsonRecord = Record<string, unknown>;

const EVIDENCE_SOURCE_TYPES = new Set([
  "canonical_ledger",
  "provider_receipt",
  "approved_report",
  "manual_review",
]);

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function boundedText(value: unknown, field: string, max = 500) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} is required`);
  if (normalized.length > max) throw new Error(`${field} is too long`);
  return normalized;
}

function safeInteger(value: unknown, field: string, allowNegative = false) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${field} must be a safe integer`);
  if (!allowNegative && parsed < 0) throw new Error(`${field} cannot be negative`);
  return parsed;
}

function parseDate(value: unknown, field: string) {
  const parsed = new Date(String(value || ""));
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} must be a valid date`);
  return parsed;
}

function normalizeCurrency(value: unknown) {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("currencyCode must be a three-letter code");
  return code;
}

function rejectCredentialLikeReference(reference: string) {
  if (
    /(?:access[_ -]?token|refresh[_ -]?token|api[_ -]?key|client[_ -]?secret|password|authorization\s*:|bearer\s+|[?&](?:token|key|secret)=)/i.test(
      reference,
    )
  ) {
    throw new Error("Evidence references must not contain credentials or secrets");
  }
}

function normalizeEvidence(value: unknown, metricKey: TerritoryMediaCommerceMetricKey) {
  const evidence = asRecord(value);
  const sourceType = String(evidence.sourceType || "")
    .trim()
    .toLowerCase();
  if (!EVIDENCE_SOURCE_TYPES.has(sourceType)) {
    throw new Error(`${metricKey} evidence sourceType is invalid`);
  }
  const sourceReference = boundedText(
    evidence.sourceReference,
    `${metricKey} evidence sourceReference`,
  );
  rejectCredentialLikeReference(sourceReference);
  const observedAt = parseDate(
    evidence.observedAt,
    `${metricKey} evidence observedAt`,
  );
  if (evidence.credentialsExcluded !== true) {
    throw new Error(`${metricKey} evidence must confirm credentialsExcluded`);
  }
  return {
    sourceType,
    sourceReference,
    observedAt: observedAt.toISOString(),
    verified: evidence.verified === true,
    credentialsExcluded: true as const,
  };
}

function assertBoundedCounts(metrics: Partial<Record<TerritoryMediaCommerceMetricKey, number>>) {
  const atMost = (
    numerator: TerritoryMediaCommerceMetricKey,
    denominator: TerritoryMediaCommerceMetricKey,
  ) => {
    const left = metrics[numerator];
    const right = metrics[denominator];
    if (left != null && right != null && left > right) {
      throw new Error(`${numerator} cannot exceed ${denominator}`);
    }
  };
  atMost("groupOrderThresholdsReached", "groupOrderCampaigns");
  atMost("paymentSuccesses", "paymentAttempts");
  atMost("successfulDeliveries", "deliveryAttempts");
  atMost("onTimeDeliveries", "successfulDeliveries");
  atMost("disputes", "attributableCompletedOrders");
  atMost("refunds", "attributableCompletedOrders");
  atMost("acquiredCustomers", "qualifiedLeads");
}

function rate(numerator: unknown, denominator: unknown) {
  const left = Number(numerator);
  const right = Number(denominator);
  if (!Number.isFinite(left) || !Number.isFinite(right) || right <= 0) return null;
  return Number(((left / right) * 100).toFixed(2));
}

function unitCost(amount: unknown, count: unknown) {
  const value = Number(amount);
  const units = Number(count);
  if (!Number.isFinite(value) || !Number.isFinite(units) || units <= 0) return null;
  return Math.round(value / units);
}

export function normalizeTerritoryScorecardEvidence(input: {
  month: unknown;
  currencyCode: unknown;
  sourceWindowStart: unknown;
  sourceWindowEnd: unknown;
  metrics: unknown;
  evidence: unknown;
  perMetricEvidence?: unknown;
}) {
  const month = String(input.month || "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("month must use YYYY-MM");
  }
  const currencyCode = normalizeCurrency(input.currencyCode);
  const sourceWindowStart = parseDate(input.sourceWindowStart, "sourceWindowStart");
  const sourceWindowEnd = parseDate(input.sourceWindowEnd, "sourceWindowEnd");
  if (sourceWindowEnd < sourceWindowStart) {
    throw new Error("sourceWindowEnd must be on or after sourceWindowStart");
  }

  const rawMetrics = asRecord(input.metrics);
  const metrics: Partial<Record<TerritoryMediaCommerceMetricKey, number>> = {};
  for (const key of TERRITORY_MEDIA_COMMERCE_METRIC_KEYS) {
    if (rawMetrics[key] === undefined || rawMetrics[key] === null || rawMetrics[key] === "") continue;
    metrics[key] = safeInteger(
      rawMetrics[key],
      key,
      key === "contributionMarginMinor",
    );
  }
  const metricKeys = Object.keys(metrics) as TerritoryMediaCommerceMetricKey[];
  if (!metricKeys.length) throw new Error("At least one scorecard metric is required");
  assertBoundedCounts(metrics);

  const sharedEvidence = asRecord(input.evidence);
  const perMetricEvidence = asRecord(input.perMetricEvidence);
  const metricEvidence = Object.fromEntries(
    metricKeys.map((key) => [
      key,
      normalizeEvidence(perMetricEvidence[key] || sharedEvidence, key),
    ]),
  ) as Record<TerritoryMediaCommerceMetricKey, ReturnType<typeof normalizeEvidence>>;
  const evidenceStatus = metricKeys.every((key) => metricEvidence[key].verified)
    ? "verified"
    : "partial";

  return {
    month,
    currencyCode,
    sourceWindowStart,
    sourceWindowEnd,
    metrics,
    metricKeys,
    metricEvidence,
    evidenceStatus,
    credentialsExcluded: true as const,
  };
}

export function territoryScorecardDerivedMetrics(
  row: Partial<Record<TerritoryMediaCommerceMetricKey, unknown>> & {
    activeBuyers?: unknown;
  },
) {
  return {
    productPageConversionRate: rate(
      row.attributableCompletedOrders,
      row.productPageSessions,
    ),
    groupOrderThresholdRate: rate(
      row.groupOrderThresholdsReached,
      row.groupOrderCampaigns,
    ),
    paymentSuccessRate: rate(row.paymentSuccesses, row.paymentAttempts),
    deliverySuccessRate: rate(row.successfulDeliveries, row.deliveryAttempts),
    onTimeDeliveryRate: rate(row.onTimeDeliveries, row.successfulDeliveries),
    disputeRate: rate(row.disputes, row.attributableCompletedOrders),
    refundRate: rate(row.refunds, row.attributableCompletedOrders),
    repeatPurchaseRate: rate(row.repeatBuyers, row.activeBuyers),
    customerAcquisitionCostMinor: unitCost(row.mediaSpendMinor, row.acquiredCustomers),
    costPerCompletedOrderMinor: unitCost(
      row.mediaSpendMinor,
      row.attributableCompletedOrders,
    ),
  } as const;
}

export function territoryScorecardView<T extends JsonRecord>(row: T) {
  return {
    ...row,
    derivedMetrics: territoryScorecardDerivedMetrics(row),
    unknownMetrics: TERRITORY_MEDIA_COMMERCE_METRIC_KEYS.filter(
      (key) => row[key] === null || row[key] === undefined,
    ),
  };
}
