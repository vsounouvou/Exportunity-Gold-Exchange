import { createHash } from "node:crypto";

export const EXPORTUNITY_COMMERCIAL_OFFER_PRICING_VERSION =
  "exact-minor-cost-stack-v1";
export const EXPORTUNITY_COMMERCIAL_OFFER_MAX_MARGIN_BPS = 5_000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/i;
const ISO_CURRENCY_PATTERN = /^[A-Z]{3}$/;
const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "ISK",
  "JPY",
  "KMF",
  "KRW",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);
const THREE_DECIMAL_CURRENCIES = new Set([
  "BHD",
  "IQD",
  "JOD",
  "KWD",
  "LYD",
  "OMR",
  "TND",
]);

export const EXPORTUNITY_COMMERCIAL_COST_CODES = [
  "logistics",
  "customs_duties",
  "insurance",
  "inspection",
  "payment_provider",
  "handling",
  "taxes",
  "other",
] as const;

export const EXPORTUNITY_COMMERCIAL_OFFER_SUBMISSION_CHECKLIST = [
  "sourceQuoteReviewed",
  "costEvidenceReviewed",
  "currencyAndNoConversionReviewed",
  "marginPolicyReviewed",
  "validityReviewed",
  "separateIssueRequired",
] as const;

export const EXPORTUNITY_COMMERCIAL_OFFER_APPROVAL_CHECKLIST = [
  "sourceLineageApproved",
  "costStackApproved",
  "marginApproved",
  "customerTermsApproved",
  "validityApproved",
  "separateIssueRequired",
] as const;

export const EXPORTUNITY_COMMERCIAL_OFFER_ISSUE_CHECKLIST = [
  "sourceQualificationRechecked",
  "approvedPricingHashRechecked",
  "customerTermsAndPriceRechecked",
  "validityWindowRechecked",
  "customerContextConfirmed",
  "separateDeliveryRequired",
] as const;

export const EXPORTUNITY_COMMERCIAL_OFFER_RESPONSE_CHECKLIST = [
  "pricingHashRechecked",
  "customerIdentityConfirmed",
  "customerResponseEvidenceReviewed",
  "responseRecordedWithoutExternalContact",
  "separateOrderActionRequired",
] as const;

export const EXPORTUNITY_COMMERCIAL_ORDER_CHECKLIST = [
  "customerAcceptanceRechecked",
  "exactPriceRechecked",
  "noPaymentCollected",
  "procurementNotStarted",
  "separatePaymentActionRequired",
  "separateFulfillmentActionRequired",
] as const;

export const EXPORTUNITY_COMMERCIAL_RESPONSE_CHANNELS = [
  "email",
  "whatsapp",
  "phone",
  "platform",
  "signed_document",
  "in_person",
  "other",
] as const;

export type CommercialCostCode =
  (typeof EXPORTUNITY_COMMERCIAL_COST_CODES)[number];
export type CommercialOfferSubmissionChecklistKey =
  (typeof EXPORTUNITY_COMMERCIAL_OFFER_SUBMISSION_CHECKLIST)[number];
export type CommercialOfferApprovalChecklistKey =
  (typeof EXPORTUNITY_COMMERCIAL_OFFER_APPROVAL_CHECKLIST)[number];
export type CommercialOfferIssueChecklistKey =
  (typeof EXPORTUNITY_COMMERCIAL_OFFER_ISSUE_CHECKLIST)[number];
export type CommercialOfferResponseChecklistKey =
  (typeof EXPORTUNITY_COMMERCIAL_OFFER_RESPONSE_CHECKLIST)[number];
export type CommercialOrderChecklistKey =
  (typeof EXPORTUNITY_COMMERCIAL_ORDER_CHECKLIST)[number];
export type CommercialResponseChannel =
  (typeof EXPORTUNITY_COMMERCIAL_RESPONSE_CHANNELS)[number];

export class CommercialOfferPolicyError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CommercialOfferPolicyError";
    this.code = code;
  }
}

function compactText(value: unknown, maximum: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function inputRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_INPUT_INVALID",
      "Commercial offer input must be an object.",
    );
  }
  return value as Record<string, unknown>;
}

function boundedRequiredText(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  const normalized = compactText(value, maximum + 1);
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_TEXT_INVALID",
      `${label} must contain between ${minimum} and ${maximum} characters.`,
    );
  }
  return normalized;
}

function boundedOptionalText(value: unknown, label: string, maximum: number) {
  const normalized = compactText(value, maximum + 1);
  if (normalized.length > maximum) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_TEXT_INVALID",
      `${label} must not exceed ${maximum} characters.`,
    );
  }
  return normalized || null;
}

export function currencyMinorUnitScale(value: unknown) {
  const currencyCode = String(value || "").trim().toUpperCase();
  if (!ISO_CURRENCY_PATTERN.test(currencyCode)) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_CURRENCY_INVALID",
      "A three-letter ISO currency code is required.",
    );
  }
  if (ZERO_DECIMAL_CURRENCIES.has(currencyCode)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(currencyCode)) return 3;
  return 2;
}

function assertMinorMagnitude(value: bigint) {
  if (value < 0n || value.toString().length > 27) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_AMOUNT_OUT_OF_RANGE",
      "The amount is outside the supported exact-money range.",
    );
  }
  return value;
}

export function parseExactDecimalToMinorUnits(
  value: unknown,
  currencyCode: string,
) {
  const scale = currencyMinorUnitScale(currencyCode);
  const normalized = String(value ?? "").trim();
  const match = normalized.match(/^(0|[1-9]\d{0,23})(?:\.(\d{1,3}))?$/);
  if (!match) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_AMOUNT_INVALID",
      "Amounts must use an unsigned exact decimal string without grouping separators.",
    );
  }
  const fraction = match[2] || "";
  if (fraction.length > scale || (scale === 0 && fraction)) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_AMOUNT_SCALE_INVALID",
      `${currencyCode} supports ${scale} minor decimal places.`,
    );
  }
  const factor = 10n ** BigInt(scale);
  const paddedFraction = fraction.padEnd(scale, "0");
  return assertMinorMagnitude(
    BigInt(match[1]) * factor + BigInt(paddedFraction || "0"),
  ).toString();
}

function groupedInteger(value: string, separatorPattern: RegExp) {
  if (/^\d+$/.test(value)) return value;
  const groups = value.split(separatorPattern);
  if (
    groups.length < 2 ||
    !/^\d{1,3}$/.test(groups[0]) ||
    groups.slice(1).some((group) => !/^\d{3}$/.test(group))
  ) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_SOURCE_AMOUNT_AMBIGUOUS",
      "The supplier total uses ambiguous numeric separators and requires source correction.",
    );
  }
  return groups.join("");
}

function canonicalQuotedDecimal(numberText: string, scale: number) {
  const compact = numberText
    .replace(/[\s\u00a0'’]/g, "")
    .replace(/^\+/, "");
  if (!compact || /[^\d.,]/.test(compact)) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_SOURCE_AMOUNT_INVALID",
      "The supplier total does not contain a supported exact amount.",
    );
  }
  const dots = [...compact.matchAll(/\./g)].map((match) => match.index || 0);
  const commas = [...compact.matchAll(/,/g)].map((match) => match.index || 0);

  if (dots.length && commas.length) {
    if (scale === 0) {
      return groupedInteger(compact, /[.,]/);
    }
    const decimalSeparator =
      dots[dots.length - 1] > commas[commas.length - 1] ? "." : ",";
    const decimalIndex = compact.lastIndexOf(decimalSeparator);
    const fraction = compact.slice(decimalIndex + 1);
    if (!/^\d+$/.test(fraction) || fraction.length < 1 || fraction.length > scale) {
      throw new CommercialOfferPolicyError(
        "COMMERCIAL_OFFER_SOURCE_AMOUNT_AMBIGUOUS",
        "The supplier total has an ambiguous decimal portion.",
      );
    }
    const whole = groupedInteger(compact.slice(0, decimalIndex), /[.,]/);
    return `${whole}.${fraction}`;
  }

  const separator = dots.length ? "." : commas.length ? "," : null;
  if (!separator) return compact;
  const parts = compact.split(separator);
  const tail = parts[parts.length - 1];

  if (scale === 0) return groupedInteger(compact, /[.,]/);

  if (parts.length === 2) {
    if (tail.length === 3) {
      if (scale === 3) {
        throw new CommercialOfferPolicyError(
          "COMMERCIAL_OFFER_SOURCE_AMOUNT_AMBIGUOUS",
          "The supplier total is ambiguous for a three-decimal currency.",
        );
      }
      return groupedInteger(compact, /[.,]/);
    }
    if (tail.length >= 1 && tail.length <= scale) {
      if (!/^\d+$/.test(parts[0]) || !/^\d+$/.test(tail)) {
        throw new CommercialOfferPolicyError(
          "COMMERCIAL_OFFER_SOURCE_AMOUNT_INVALID",
          "The supplier total does not contain a supported exact amount.",
        );
      }
      return `${parts[0]}.${tail}`;
    }
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_SOURCE_AMOUNT_AMBIGUOUS",
      "The supplier total uses an ambiguous numeric separator.",
    );
  }

  const allGrouped =
    /^\d{1,3}$/.test(parts[0]) &&
    parts.slice(1).every((part) => /^\d{3}$/.test(part));
  if (allGrouped) return parts.join("");

  if (
    tail.length >= 1 &&
    tail.length <= scale &&
    /^\d{1,3}$/.test(parts[0]) &&
    parts.slice(1, -1).every((part) => /^\d{3}$/.test(part))
  ) {
    return `${parts.slice(0, -1).join("")}.${tail}`;
  }
  throw new CommercialOfferPolicyError(
    "COMMERCIAL_OFFER_SOURCE_AMOUNT_AMBIGUOUS",
    "The supplier total uses ambiguous numeric separators and requires source correction.",
  );
}

export function parseQuotedMoneyToMinorUnits(
  value: unknown,
  currencyCode: string,
) {
  const code = String(currencyCode || "").trim().toUpperCase();
  const scale = currencyMinorUnitScale(code);
  const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withoutCurrency = String(value ?? "")
    .replace(new RegExp(`\\b${escapedCode}\\b`, "gi"), " ")
    .replace(/[€£$₦₵]/g, " ")
    .replace(/\u00a0/g, " ");
  if (/[+-]\s*\d|\d\s*[eE][+-]?\d/.test(withoutCurrency)) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_SOURCE_AMOUNT_INVALID",
      "Negative and scientific-notation supplier totals are not accepted.",
    );
  }
  const candidates = (withoutCurrency.match(/\d(?:[\d\s.,'’]*\d)?/g) || [])
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  if (candidates.length !== 1) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_SOURCE_AMOUNT_AMBIGUOUS",
      "The supplier total must contain exactly one unambiguous amount.",
    );
  }
  const canonical = canonicalQuotedDecimal(candidates[0], scale);
  return parseExactDecimalToMinorUnits(canonical, code);
}

export function formatMinorUnits(value: string | bigint, currencyCode: string) {
  const scale = currencyMinorUnitScale(currencyCode);
  const minor = assertMinorMagnitude(BigInt(value));
  if (scale === 0) return minor.toString();
  const factor = 10n ** BigInt(scale);
  const whole = minor / factor;
  const fraction = (minor % factor).toString().padStart(scale, "0");
  return `${whole.toString()}.${fraction}`;
}

export function calculateGrossMarginPrice(
  totalCostMinor: string | bigint,
  targetGrossMarginBps: number,
) {
  if (
    !Number.isInteger(targetGrossMarginBps) ||
    targetGrossMarginBps < 0 ||
    targetGrossMarginBps > EXPORTUNITY_COMMERCIAL_OFFER_MAX_MARGIN_BPS
  ) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_MARGIN_INVALID",
      `Target gross margin must be an integer from 0 to ${EXPORTUNITY_COMMERCIAL_OFFER_MAX_MARGIN_BPS} basis points.`,
    );
  }
  const cost = assertMinorMagnitude(BigInt(totalCostMinor));
  if (cost <= 0n) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_COST_INVALID",
      "The exact total cost must be greater than zero.",
    );
  }
  const denominator = BigInt(10_000 - targetGrossMarginBps);
  const customerPrice = assertMinorMagnitude(
    (cost * 10_000n + denominator - 1n) / denominator,
  );
  return {
    totalCostMinor: cost.toString(),
    marginMinor: (customerPrice - cost).toString(),
    customerPriceMinor: customerPrice.toString(),
  };
}

type DraftCostInput = {
  code: CommercialCostCode;
  label: string;
  amount: string;
  evidenceReference: string;
};

export function parseCommercialOfferDraftInput(
  payload: unknown,
  options: { now?: Date } = {},
) {
  const record = inputRecord(payload);
  const sourceSupplierQuoteId = String(record.sourceSupplierQuoteId || "")
    .trim()
    .toLowerCase();
  if (!UUID_PATTERN.test(sourceSupplierQuoteId)) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_SOURCE_QUOTE_INVALID",
      "sourceSupplierQuoteId must be a valid canonical supplier quote UUID.",
    );
  }
  const targetGrossMarginBpsText = String(
    record.targetGrossMarginBps ?? "",
  ).trim();
  if (!/^\d{1,4}$/.test(targetGrossMarginBpsText)) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_MARGIN_INVALID",
      "targetGrossMarginBps must be an integer basis-point value.",
    );
  }
  const targetGrossMarginBps = Number(targetGrossMarginBpsText);
  if (targetGrossMarginBps > EXPORTUNITY_COMMERCIAL_OFFER_MAX_MARGIN_BPS) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_MARGIN_INVALID",
      `Target gross margin cannot exceed ${EXPORTUNITY_COMMERCIAL_OFFER_MAX_MARGIN_BPS} basis points.`,
    );
  }
  const rawCosts = Array.isArray(record.additionalCosts)
    ? record.additionalCosts
    : [];
  if (rawCosts.length > EXPORTUNITY_COMMERCIAL_COST_CODES.length) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_COST_STACK_INVALID",
      "The bounded cost stack contains too many entries.",
    );
  }
  const seen = new Set<string>();
  const additionalCosts: DraftCostInput[] = rawCosts.map((rawCost) => {
    const cost = inputRecord(rawCost);
    const code = String(cost.code || "").trim() as CommercialCostCode;
    if (!EXPORTUNITY_COMMERCIAL_COST_CODES.includes(code) || seen.has(code)) {
      throw new CommercialOfferPolicyError(
        "COMMERCIAL_OFFER_COST_STACK_INVALID",
        "Every additional cost must use one unique governed cost code.",
      );
    }
    seen.add(code);
    return {
      code,
      label: boundedRequiredText(cost.label, "Cost label", 3, 80),
      amount: String(cost.amount ?? "").trim(),
      evidenceReference: boundedRequiredText(
        cost.evidenceReference,
        "Cost evidence reference",
        8,
        500,
      ),
    };
  });
  const now = options.now || new Date();
  const validUntil = new Date(String(record.validUntil || ""));
  const validityHours = (validUntil.getTime() - now.getTime()) / 3_600_000;
  if (
    Number.isNaN(validUntil.getTime()) ||
    validityHours < 1 ||
    validityHours > 24 * 180
  ) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_VALIDITY_INVALID",
      "Offer validity must be between 1 hour and 180 days from now.",
    );
  }
  return {
    sourceSupplierQuoteId,
    targetGrossMarginBps,
    additionalCosts,
    validUntil,
    commercialTerms: boundedRequiredText(
      record.commercialTerms,
      "Commercial terms",
      24,
      4_000,
    ),
    customerNotes: boundedOptionalText(
      record.customerNotes,
      "Customer notes",
      2_000,
    ),
    internalNotes: boundedOptionalText(
      record.internalNotes,
      "Internal notes",
      2_000,
    ),
  };
}

export function buildCommercialOfferPricing(input: {
  request: ReturnType<typeof parseCommercialOfferDraftInput>;
  sourceQuote: {
    id: string;
    quoteHash: string;
    referenceCode: string;
    currencyCode: string | null;
    totalAmount: string | null;
    productName: string | null;
    specification: string | null;
    offeredQuantity: string | null;
    unitOfMeasure: string | null;
    leadTime: string | null;
    incoterm: string | null;
  };
}) {
  const currencyCode = String(input.sourceQuote.currencyCode || "")
    .trim()
    .toUpperCase();
  currencyMinorUnitScale(currencyCode);
  if (!input.sourceQuote.totalAmount) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_SUPPLIER_TOTAL_REQUIRED",
      "A source-backed supplier total is required before an Exportunity offer can be prepared.",
    );
  }
  const supplierCostMinor = parseQuotedMoneyToMinorUnits(
    input.sourceQuote.totalAmount,
    currencyCode,
  );
  const parsedAdditionalCosts = input.request.additionalCosts
    .map((cost) => ({
      code: cost.code,
      label: cost.label,
      amountMinor: parseExactDecimalToMinorUnits(cost.amount, currencyCode),
      evidenceReference: cost.evidenceReference,
    }))
    .filter((cost) => BigInt(cost.amountMinor) > 0n)
    .sort((left, right) => left.code.localeCompare(right.code));
  const additionalCostsMinor = parsedAdditionalCosts.reduce(
    (sum, cost) => sum + BigInt(cost.amountMinor),
    0n,
  );
  const totalCostMinor = assertMinorMagnitude(
    BigInt(supplierCostMinor) + additionalCostsMinor,
  );
  const price = calculateGrossMarginPrice(
    totalCostMinor,
    input.request.targetGrossMarginBps,
  );
  const databaseTotalAmount = formatMinorUnits(
    price.customerPriceMinor,
    currencyCode,
  );
  if (databaseTotalAmount.split(".")[0].length > 21) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_AMOUNT_OUT_OF_RANGE",
      "The customer price exceeds the industrial offer ledger range.",
    );
  }
  const costStack = [
    {
      code: "supplier_base",
      label: "Qualified supplier quote",
      amountMinor: supplierCostMinor,
      currencyCode,
      evidenceReference: `supplier_quote:${input.sourceQuote.id}:${input.sourceQuote.quoteHash}`,
    },
    ...parsedAdditionalCosts.map((cost) => ({ ...cost, currencyCode })),
  ];
  const hashInput = {
    pricingVersion: EXPORTUNITY_COMMERCIAL_OFFER_PRICING_VERSION,
    sourceSupplierQuoteId: input.sourceQuote.id,
    sourceSupplierQuoteHash: input.sourceQuote.quoteHash,
    currencyCode,
    supplierCostMinor,
    additionalCosts: parsedAdditionalCosts,
    targetGrossMarginBps: input.request.targetGrossMarginBps,
    totalCostMinor: price.totalCostMinor,
    marginMinor: price.marginMinor,
    customerPriceMinor: price.customerPriceMinor,
    validUntil: input.request.validUntil.toISOString(),
    commercialTerms: input.request.commercialTerms,
    customerNotes: input.request.customerNotes,
  };
  const pricingHash = createHash("sha256")
    .update(JSON.stringify(hashInput))
    .digest("hex");
  return {
    pricingVersion: EXPORTUNITY_COMMERCIAL_OFFER_PRICING_VERSION,
    pricingHash,
    currencyCode,
    supplierCostMinor,
    additionalCostsMinor: additionalCostsMinor.toString(),
    totalCostMinor: price.totalCostMinor,
    targetGrossMarginBps: input.request.targetGrossMarginBps,
    marginMinor: price.marginMinor,
    customerPriceMinor: price.customerPriceMinor,
    databaseTotalAmount,
    costStack,
    lineItems: [
      {
        type: "supply_offer",
        product: input.sourceQuote.productName || "Qualified supply",
        specification: input.sourceQuote.specification || "",
        quantity: input.sourceQuote.offeredQuantity || "",
        unit: input.sourceQuote.unitOfMeasure || "",
        amountMinor: price.customerPriceMinor,
        currencyCode,
      },
    ],
    display: {
      supplierCost: `${currencyCode} ${formatMinorUnits(supplierCostMinor, currencyCode)}`,
      additionalCosts: `${currencyCode} ${formatMinorUnits(additionalCostsMinor, currencyCode)}`,
      totalCost: `${currencyCode} ${formatMinorUnits(price.totalCostMinor, currencyCode)}`,
      margin: `${currencyCode} ${formatMinorUnits(price.marginMinor, currencyCode)}`,
      customerPrice: `${currencyCode} ${databaseTotalAmount}`,
    },
  };
}

function parseChecklist<const T extends readonly string[]>(
  value: unknown,
  requiredKeys: T,
) {
  const checklist = inputRecord(value);
  for (const key of requiredKeys) {
    if (checklist[key] !== true) {
      throw new CommercialOfferPolicyError(
        "COMMERCIAL_OFFER_CHECKLIST_INCOMPLETE",
        `${key} must be explicitly confirmed.`,
      );
    }
  }
  return Object.fromEntries(requiredKeys.map((key) => [key, true])) as Record<
    T[number],
    true
  >;
}

function expectedPricingHash(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!HASH_PATTERN.test(normalized)) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_HASH_INVALID",
      "A valid expected pricing hash is required.",
    );
  }
  return normalized;
}

export function parseCommercialOfferSubmissionInput(payload: unknown) {
  const record = inputRecord(payload);
  return {
    expectedPricingHash: expectedPricingHash(record.expectedPricingHash),
    decisionNotes: boundedRequiredText(
      record.decisionNotes,
      "Submission rationale",
      24,
      2_000,
    ),
    checklist: parseChecklist(
      record.checklist,
      EXPORTUNITY_COMMERCIAL_OFFER_SUBMISSION_CHECKLIST,
    ),
  };
}

export function parseCommercialOfferApprovalInput(payload: unknown) {
  const record = inputRecord(payload);
  return {
    expectedPricingHash: expectedPricingHash(record.expectedPricingHash),
    decisionNotes: boundedRequiredText(
      record.decisionNotes,
      "Approval rationale",
      24,
      2_000,
    ),
    checklist: parseChecklist(
      record.checklist,
      EXPORTUNITY_COMMERCIAL_OFFER_APPROVAL_CHECKLIST,
    ),
  };
}

export function parseCommercialOfferRejectionInput(payload: unknown) {
  const record = inputRecord(payload);
  return {
    expectedPricingHash: expectedPricingHash(record.expectedPricingHash),
    decisionNotes: boundedRequiredText(
      record.decisionNotes,
      "Rejection rationale",
      24,
      2_000,
    ),
  };
}

function expectedEvidenceHash(value: unknown, label: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!HASH_PATTERN.test(normalized)) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_EVIDENCE_HASH_INVALID",
      `A valid ${label} hash is required.`,
    );
  }
  return normalized;
}

function parseBoundedEventDate(
  value: unknown,
  label: string,
  options: { now?: Date; allowFuture?: boolean; maximumFutureDays?: number } = {},
) {
  const now = options.now || new Date();
  const parsed = new Date(String(value || ""));
  if (Number.isNaN(parsed.getTime())) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_EVENT_DATE_INVALID",
      `${label} must be a valid timestamp.`,
    );
  }
  const earliest = now.getTime() - 366 * 24 * 60 * 60 * 1_000;
  const latest = options.allowFuture
    ? now.getTime() + (options.maximumFutureDays || 730) * 24 * 60 * 60 * 1_000
    : now.getTime() + 5 * 60 * 1_000;
  if (parsed.getTime() < earliest || parsed.getTime() > latest) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_EVENT_DATE_INVALID",
      options.allowFuture
        ? `${label} must be within the supported planning window.`
        : `${label} cannot be older than one year or materially in the future.`,
    );
  }
  return parsed;
}

export function parseCommercialOfferIssueInput(payload: unknown) {
  const record = inputRecord(payload);
  return {
    expectedPricingHash: expectedPricingHash(record.expectedPricingHash),
    decisionNotes: boundedRequiredText(
      record.decisionNotes,
      "Issuance rationale",
      24,
      2_000,
    ),
    checklist: parseChecklist(
      record.checklist,
      EXPORTUNITY_COMMERCIAL_OFFER_ISSUE_CHECKLIST,
    ),
  };
}

export function parseCommercialOfferCustomerResponseInput(
  payload: unknown,
  options: { now?: Date } = {},
) {
  const record = inputRecord(payload);
  const rawResponse = String(record.response || "").trim().toLowerCase();
  if (rawResponse !== "accepted" && rawResponse !== "declined") {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_RESPONSE_INVALID",
      "Customer response must be accepted or declined.",
    );
  }
  const response: "accepted" | "declined" = rawResponse;
  const channel = String(record.channel || "")
    .trim()
    .toLowerCase() as CommercialResponseChannel;
  if (!EXPORTUNITY_COMMERCIAL_RESPONSE_CHANNELS.includes(channel)) {
    throw new CommercialOfferPolicyError(
      "COMMERCIAL_OFFER_RESPONSE_CHANNEL_INVALID",
      "A governed customer-response channel is required.",
    );
  }
  const parsed = {
    expectedPricingHash: expectedPricingHash(record.expectedPricingHash),
    response,
    responseReceivedAt: parseBoundedEventDate(
      record.responseReceivedAt,
      "Customer response time",
      { now: options.now },
    ),
    channel,
    evidenceReference: boundedRequiredText(
      record.evidenceReference,
      "Customer response evidence reference",
      8,
      500,
    ),
    customerStatement: boundedRequiredText(
      record.customerStatement,
      "Customer statement",
      4,
      1_000,
    ),
    decisionNotes: boundedRequiredText(
      record.decisionNotes,
      "Customer response rationale",
      24,
      2_000,
    ),
    checklist: parseChecklist(
      record.checklist,
      EXPORTUNITY_COMMERCIAL_OFFER_RESPONSE_CHECKLIST,
    ),
  };
  const responseHash = createHash("sha256")
    .update(
      JSON.stringify({
        expectedPricingHash: parsed.expectedPricingHash,
        response: parsed.response,
        responseReceivedAt: parsed.responseReceivedAt.toISOString(),
        channel: parsed.channel,
        evidenceReference: parsed.evidenceReference,
        customerStatement: parsed.customerStatement,
      }),
    )
    .digest("hex");
  return { ...parsed, responseHash };
}

export function parseCommercialOrderCreateInput(
  payload: unknown,
  options: { now?: Date } = {},
) {
  const record = inputRecord(payload);
  const plannedDeliveryAt = record.plannedDeliveryAt
    ? parseBoundedEventDate(record.plannedDeliveryAt, "Planned delivery", {
        now: options.now,
        allowFuture: true,
        maximumFutureDays: 730,
      })
    : null;
  const parsed = {
    expectedPricingHash: expectedPricingHash(record.expectedPricingHash),
    expectedCustomerResponseHash: expectedEvidenceHash(
      record.expectedCustomerResponseHash,
      "customer response",
    ),
    confirmationNote: boundedRequiredText(
      record.confirmationNote,
      "Order confirmation rationale",
      24,
      2_000,
    ),
    plannedDeliveryAt,
    checklist: parseChecklist(
      record.checklist,
      EXPORTUNITY_COMMERCIAL_ORDER_CHECKLIST,
    ),
  };
  const confirmationHash = createHash("sha256")
    .update(
      JSON.stringify({
        expectedPricingHash: parsed.expectedPricingHash,
        expectedCustomerResponseHash: parsed.expectedCustomerResponseHash,
        confirmationNote: parsed.confirmationNote,
        plannedDeliveryAt: parsed.plannedDeliveryAt?.toISOString() || null,
      }),
    )
    .digest("hex");
  return { ...parsed, confirmationHash };
}

export function commercialOfferSourceEvidenceMatches(
  costStack: unknown,
  sourceSupplierQuoteId: unknown,
  sourceSupplierQuoteHash: unknown,
) {
  const sourceId = String(sourceSupplierQuoteId || "").trim().toLowerCase();
  const sourceHash = String(sourceSupplierQuoteHash || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(sourceId) || !HASH_PATTERN.test(sourceHash)) return false;
  const expectedReference = `supplier_quote:${sourceId}:${sourceHash}`;
  return (
    Array.isArray(costStack) &&
    costStack.some((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      const record = entry as Record<string, unknown>;
      return (
        record.code === "supplier_base" &&
        String(record.evidenceReference || "").trim().toLowerCase() ===
          expectedReference
      );
    })
  );
}
