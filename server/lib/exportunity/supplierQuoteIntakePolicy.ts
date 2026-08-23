export const EXPORTUNITY_SUPPLIER_QUOTE_NORMALIZATION_VERSION =
  "deterministic-v1";

export const EXPORTUNITY_SUPPLIER_QUOTE_FIELD_KEYS = [
  "supplierQuoteReference",
  "productName",
  "specification",
  "offeredQuantity",
  "unitOfMeasure",
  "currencyCode",
  "unitPrice",
  "totalAmount",
  "minimumOrderQuantity",
  "packaging",
  "leadTime",
  "incoterm",
  "paymentTerms",
  "validity",
  "countryOfOrigin",
  "certifications",
  "warranty",
  "supplierNotes",
] as const;

export const EXPORTUNITY_SUPPLIER_QUOTE_REVIEW_CHECKLIST = [
  "sourceMessageReviewed",
  "correlationReviewed",
  "noInventedFields",
  "missingFieldsAcknowledged",
] as const;

export type SupplierQuoteFieldKey =
  (typeof EXPORTUNITY_SUPPLIER_QUOTE_FIELD_KEYS)[number];
export type SupplierQuoteFieldState = "provided" | "missing" | "ambiguous";
export type SupplierQuoteCorrelationStatus =
  | "exact"
  | "inferred"
  | "ambiguous"
  | "unmatched";
export type SupplierQuoteReviewDecision =
  | "needs_review"
  | "qualified"
  | "rejected";

export type NormalizedSupplierQuoteField = {
  state: SupplierQuoteFieldState;
  value: string | null;
  sourceLocator: string | null;
  evidenceExcerpt: string | null;
};

export type NormalizedSupplierQuote = Record<
  SupplierQuoteFieldKey,
  NormalizedSupplierQuoteField
>;

export type SupplierQuoteDispatchCandidate = {
  id: string;
  status: string;
  providerMessageId: string | null;
  referenceCode: string;
  recipientHash: string;
  attemptedAt: Date | null;
  responseDeadline: Date;
};

export type SupplierQuoteCorrelationInput = {
  providerReplyIds?: Array<string | null | undefined>;
  referenceText?: string | null;
  contactHash: string;
  receivedAt: Date;
  candidates: SupplierQuoteDispatchCandidate[];
};

export type SupplierQuoteCorrelationResult = {
  status: SupplierQuoteCorrelationStatus;
  method:
    | "provider_reply_reference"
    | "rfq_reference"
    | "recipient_response_window"
    | "multiple_candidates"
    | "no_candidate";
  dispatchId: string | null;
  candidateDispatchIds: string[];
};

export class SupplierQuoteIntakePolicyError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SupplierQuoteIntakePolicyError";
    this.code = code;
  }
}

function compactText(value: unknown, maximum = 4_000) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, maximum);
}

function redactEvidence(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(?:whatsapp:)?\+?[1-9][0-9\s().-]{7,20}/gi, "[redacted-phone]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function sourceLines(input: {
  subject?: string | null;
  body?: string | null;
  attachmentNames?: string[];
}) {
  const rows: Array<{ locator: string; text: string }> = [];
  const subject = compactText(input.subject, 500);
  if (subject) rows.push({ locator: "subject", text: subject });
  compactText(input.body, 24_000)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 400)
    .forEach((line, index) =>
      rows.push({ locator: `body.line.${index + 1}`, text: line }),
    );
  (input.attachmentNames || [])
    .slice(0, 50)
    .forEach((name, index) => {
      const text = compactText(name, 300);
      if (text) rows.push({ locator: `attachment.${index + 1}.name`, text });
    });
  return rows;
}

type FieldCandidate = {
  value: string;
  sourceLocator: string;
  evidenceExcerpt: string;
};

function normalizedCandidateKey(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function fieldFromCandidates(
  candidates: FieldCandidate[],
): NormalizedSupplierQuoteField {
  const unique = new Map<string, FieldCandidate>();
  for (const candidate of candidates) {
    const key = normalizedCandidateKey(candidate.value);
    if (key && !unique.has(key)) unique.set(key, candidate);
  }
  const values = [...unique.values()];
  if (!values.length) {
    return {
      state: "missing",
      value: null,
      sourceLocator: null,
      evidenceExcerpt: null,
    };
  }
  if (values.length > 1) {
    return {
      state: "ambiguous",
      value: null,
      sourceLocator: values.map((entry) => entry.sourceLocator).join(", "),
      evidenceExcerpt: values
        .slice(0, 3)
        .map((entry) => entry.evidenceExcerpt)
        .join(" | ")
        .slice(0, 720),
    };
  }
  return { state: "provided", ...values[0] };
}

function collectByPattern(
  rows: Array<{ locator: string; text: string }>,
  patterns: RegExp[],
  normalize: (value: string) => string = (value) => value.trim(),
) {
  const candidates: FieldCandidate[] = [];
  for (const row of rows) {
    for (const pattern of patterns) {
      const match = row.text.match(pattern);
      const raw = String(match?.[1] || "").trim();
      if (!raw) continue;
      const value = normalize(raw).slice(0, 500);
      if (!value) continue;
      candidates.push({
        value,
        sourceLocator: row.locator,
        evidenceExcerpt: redactEvidence(row.text),
      });
    }
  }
  return fieldFromCandidates(candidates);
}

const SUPPLIER_QUOTE_CURRENCY_CODES =
  "USD|EUR|XOF|GBP|CNY|RMB|JPY|AED|CAD|AUD|CHF|ZAR|NGN|GHS|KES|MAD|BRL|INR";

function collectCurrency(rows: Array<{ locator: string; text: string }>) {
  const supported = new RegExp(`\\b(${SUPPLIER_QUOTE_CURRENCY_CODES})\\b`, "i");
  return collectByPattern(rows, [supported], (value) =>
    value.toUpperCase() === "RMB" ? "CNY" : value.toUpperCase(),
  );
}

function collectIncoterm(rows: Array<{ locator: string; text: string }>) {
  const candidates: FieldCandidate[] = [];
  for (const row of rows) {
    const matches = row.text.matchAll(
      /\b(EXW|FCA|CPT|CIP|DAP|DPU|DDP|FAS|FOB|CFR|CIF)\b/gi,
    );
    for (const match of matches) {
      candidates.push({
        value: String(match[1]).toUpperCase(),
        sourceLocator: row.locator,
        evidenceExcerpt: redactEvidence(row.text),
      });
    }
  }
  return fieldFromCandidates(candidates);
}

function collectLabeledRemainder(
  rows: Array<{ locator: string; text: string }>,
  labels: string,
) {
  return collectByPattern(rows, [
    new RegExp(
      `(?:${labels})\\s*(?:(?:[:=-]|is)\\s*)?(.{2,300})$`,
      "i",
    ),
  ]);
}

function collectStrictLabeledRemainder(
  rows: Array<{ locator: string; text: string }>,
  labels: string,
) {
  return collectByPattern(rows, [
    new RegExp(`(?:${labels})\\s*(?:[:=-]|is)\\s*(.{2,300})$`, "i"),
  ]);
}

function collectUnitPrice(rows: Array<{ locator: string; text: string }>) {
  return collectByPattern(rows, [
    new RegExp(
      "(?:unit price|price per (?:unit|piece|item|kg|tonne|ton|meter|metre))\\s*(?:(?:[:=-]|is)\\s*)?(.{2,300})$",
      "i",
    ),
    new RegExp(
      `\\b((${SUPPLIER_QUOTE_CURRENCY_CODES})\\s*[0-9][0-9., ]{0,24}\\s*(?:/|per\\s+)(?:MT|metric\\s+tons?|tonnes?|tons?|kg|kilograms?|g|grams?|l|litres?|liters?|m|meters?|metres?|pieces?|pcs|units?|bags?|drums?|jerrycans?))\\b`,
      "i",
    ),
  ]);
}

function collectPackaging(rows: Array<{ locator: string; text: string }>) {
  return collectByPattern(rows, [
    new RegExp(
      "(?:packaging|packing|pack size|container type)\\s*(?:(?:[:=-]|is)\\s*)?(.{2,300})$",
      "i",
    ),
    /\b((?:[0-9]+(?:[.,][0-9]+)?\s*(?:kg|g|l|litres?|liters?|ml)\s*)?(?:jerrycans?|drums?|bags?|sacks?|cartons?|boxes?|bottles?|containers?|pallets?|totes?|ibcs?))\b/i,
  ]);
}

function collectCertifications(rows: Array<{ locator: string; text: string }>) {
  const labeled = collectByPattern(rows, [
    new RegExp(
      "(?:certifications?|certificates?|quality certificates?|compliance documents?)\\s*(?:(?:[:=-]|is)\\s*)(.{2,300})$",
      "i",
    ),
  ]);
  if (labeled.state !== "missing") return labeled;
  return collectByPattern(rows, [
    /\b((?:ISO[\s_-]*[0-9]{4,5}(?::[0-9]{4})?|HACCP|HALAL|KOSHER|GLOBALG\.?A\.?P\.?|ORGANIC|FAIRTRADE)(?:[\s_-]+(?:certified|certificate))?)\b/i,
  ]);
}

function collectMinimumOrderQuantity(
  rows: Array<{ locator: string; text: string }>,
) {
  const structured = collectByPattern(rows, [
    /(?:MOQ|minimum order quantity|minimum quantity)\s*(?:[:=-]|is)?\s*([0-9][0-9., ]{0,20}\s*(?:MT|metric\s+tons?|tonnes?|tons?|kg|kilograms?|g|grams?|l|litres?|liters?|m|meters?|metres?|pieces?|pcs|units?|bags?|drums?|jerrycans?))/i,
  ]);
  if (structured.state !== "missing") return structured;
  return collectByPattern(rows, [
    new RegExp(
      "(?:MOQ|minimum order quantity|minimum quantity)\\s*(?:(?:[:=-]|is)\\s*)?(.{2,300})$",
      "i",
    ),
  ]);
}

export function detectSupplierQuoteOptOut(value: unknown) {
  const normalized = compactText(value, 5_000)
    .toLowerCase()
    .replace(/[.!?,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return false;
  if (
    new Set([
      "stop",
      "stopall",
      "unsubscribe",
      "cancel",
      "quit",
      "end",
      "opt out",
      "remove me",
      "do not contact me",
      "do not contact us",
      "no more messages",
    ]).has(normalized)
  ) {
    return true;
  }
  return [
    /\bplease unsubscribe\b/,
    /\bunsubscribe (?:me|us)(?:\s|$)/,
    /\bunsubscribe (?:me|us )?from\b/,
    /\bopt (?:me|us) out\b/,
    /\bremove (?:me|us) from (?:your )?(?:mailing|contact|message) list\b/,
    /\bdo not contact (?:me|us) again\b/,
    /\bstop (?:sending|contacting|messaging) (?:me|us)\b/,
    /\bwe (?:withdraw|revoke) (?:our )?consent\b/,
  ].some((pattern) => pattern.test(normalized));
}

export function normalizeSupplierQuoteMessage(input: {
  subject?: string | null;
  body?: string | null;
  attachmentNames?: string[];
}) {
  const rows = sourceLines(input);
  const fields: NormalizedSupplierQuote = {
    supplierQuoteReference: collectByPattern(rows, [
      /(?:quotation|quote|offer)\s*(?:reference|ref\.?|number|no\.?)\s*[:#=-]?\s*([A-Z0-9][A-Z0-9._/-]{2,80})/i,
    ]),
    productName: collectStrictLabeledRemainder(
      rows,
      "product(?: name)?|quoted product|item(?: description)?|commodity",
    ),
    specification: collectStrictLabeledRemainder(
      rows,
      "product specification|specification|spec\\.?|grade|model",
    ),
    offeredQuantity: collectLabeledRemainder(
      rows,
      "offered quantity|quantity offered|available quantity|quoted quantity",
    ),
    unitOfMeasure: collectStrictLabeledRemainder(
      rows,
      "unit of measure|UOM|pricing unit|quantity unit",
    ),
    currencyCode: collectCurrency(rows),
    unitPrice: collectUnitPrice(rows),
    totalAmount: collectLabeledRemainder(
      rows,
      "grand total|total amount|quotation total|quote total|offer total",
    ),
    minimumOrderQuantity: collectMinimumOrderQuantity(rows),
    packaging: collectPackaging(rows),
    leadTime: collectLabeledRemainder(
      rows,
      "lead time|production time|delivery lead time|dispatch time",
    ),
    incoterm: collectIncoterm(rows),
    paymentTerms: collectLabeledRemainder(
      rows,
      "payment terms?|terms? of payment",
    ),
    validity: collectLabeledRemainder(
      rows,
      "valid until|validity|offer validity|quote validity",
    ),
    countryOfOrigin: collectLabeledRemainder(
      rows,
      "country of origin|origin country|made in|origin",
    ),
    certifications: collectCertifications(rows),
    warranty: collectLabeledRemainder(
      rows,
      "warranty|guarantee period|guarantee",
    ),
    supplierNotes: collectStrictLabeledRemainder(
      rows,
      "supplier notes?|commercial notes?|remarks?|comments?",
    ),
  };

  const missingFields = EXPORTUNITY_SUPPLIER_QUOTE_FIELD_KEYS.filter(
    (key) => fields[key].state === "missing",
  );
  const ambiguousFields = EXPORTUNITY_SUPPLIER_QUOTE_FIELD_KEYS.filter(
    (key) => fields[key].state === "ambiguous",
  );
  const bodyAndSubject = `${input.subject || ""}\n${input.body || ""}`;
  const attachmentNames = (input.attachmentNames || []).map((name) =>
    compactText(name, 300),
  );
  const signals = [
    /\b(?:quotation|quote|commercial offer|proforma|pricing)\b/i.test(bodyAndSubject)
      ? "quote_language"
      : null,
    attachmentNames.some((name) =>
      /(?:quote|quotation|offer|proforma|pricing)/i.test(name),
    )
      ? "quote_attachment_name"
      : null,
    EXPORTUNITY_SUPPLIER_QUOTE_FIELD_KEYS.filter(
      (key) => fields[key].state !== "missing",
    ).length >= 2
      ? "multiple_commercial_fields"
      : null,
  ].filter((value): value is string => Boolean(value));

  return {
    normalizationVersion: EXPORTUNITY_SUPPLIER_QUOTE_NORMALIZATION_VERSION,
    fields,
    missingFields,
    ambiguousFields,
    quoteLikeSignals: signals,
    quoteLike: signals.length > 0,
  };
}

function normalizedProviderId(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/^<|>$/g, "")
    .slice(0, 300)
    .toLowerCase();
}

function uniqueIds(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort();
}

export function correlateSupplierQuoteReply(
  input: SupplierQuoteCorrelationInput,
): SupplierQuoteCorrelationResult {
  const receivedAt = input.receivedAt.getTime();
  const exactEligible = input.candidates.filter((candidate) => {
    const attemptedAt = candidate.attemptedAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return candidate.status === "accepted" && attemptedAt <= receivedAt;
  });
  const windowEligible = exactEligible.filter((candidate) => {
    const graceDeadline = candidate.responseDeadline.getTime() + 14 * 24 * 60 * 60_000;
    return receivedAt <= graceDeadline;
  });

  const replyIds = new Set(
    (input.providerReplyIds || [])
      .map(normalizedProviderId)
      .filter(Boolean),
  );
  if (replyIds.size) {
    const matched = exactEligible.filter((candidate) =>
      replyIds.has(normalizedProviderId(candidate.providerMessageId)),
    );
    if (matched.length === 1) {
      return {
        status: "exact",
        method: "provider_reply_reference",
        dispatchId: matched[0].id,
        candidateDispatchIds: [matched[0].id],
      };
    }
    if (matched.length > 1) {
      return {
        status: "ambiguous",
        method: "multiple_candidates",
        dispatchId: null,
        candidateDispatchIds: uniqueIds(matched.map((candidate) => candidate.id)),
      };
    }
  }

  const referenceText = compactText(input.referenceText, 30_000).toUpperCase();
  if (referenceText) {
    const matched = exactEligible.filter((candidate) => {
      const referenceCode = compactText(candidate.referenceCode, 100).toUpperCase();
      return referenceCode.length >= 3 && referenceText.includes(referenceCode);
    });
    if (matched.length === 1) {
      return {
        status: "exact",
        method: "rfq_reference",
        dispatchId: matched[0].id,
        candidateDispatchIds: [matched[0].id],
      };
    }
    if (matched.length > 1) {
      return {
        status: "ambiguous",
        method: "multiple_candidates",
        dispatchId: null,
        candidateDispatchIds: uniqueIds(matched.map((candidate) => candidate.id)),
      };
    }
  }

  const recipientMatches = windowEligible.filter(
    (candidate) => candidate.recipientHash === input.contactHash,
  );
  if (recipientMatches.length === 1) {
    return {
      status: "inferred",
      method: "recipient_response_window",
      dispatchId: recipientMatches[0].id,
      candidateDispatchIds: [recipientMatches[0].id],
    };
  }
  if (recipientMatches.length > 1) {
    return {
      status: "ambiguous",
      method: "multiple_candidates",
      dispatchId: null,
      candidateDispatchIds: uniqueIds(
        recipientMatches.map((candidate) => candidate.id),
      ),
    };
  }
  return {
    status: "unmatched",
    method: "no_candidate",
    dispatchId: null,
    candidateDispatchIds: [],
  };
}

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SupplierQuoteIntakePolicyError(
      "SUPPLIER_QUOTE_REVIEW_INPUT_INVALID",
      "A JSON object is required.",
    );
  }
  return value as Record<string, unknown>;
}

export function parseSupplierQuoteReviewInput(value: unknown) {
  const input = asObject(value);
  const decision = String(input.decision || "").trim().toLowerCase();
  if (
    decision !== "needs_review" &&
    decision !== "qualified" &&
    decision !== "rejected"
  ) {
    throw new SupplierQuoteIntakePolicyError(
      "SUPPLIER_QUOTE_REVIEW_DECISION_INVALID",
      "decision must be needs_review, qualified, or rejected.",
    );
  }
  const reviewNotes = compactText(input.reviewNotes, 2_000);
  const minimumNotes = decision === "needs_review" ? 12 : 24;
  if (reviewNotes.length < minimumNotes) {
    throw new SupplierQuoteIntakePolicyError(
      "SUPPLIER_QUOTE_REVIEW_NOTES_INVALID",
      `reviewNotes must contain at least ${minimumNotes} characters.`,
    );
  }

  const rawChecklist = asObject(input.checklist || {});
  const checklist = Object.fromEntries(
    EXPORTUNITY_SUPPLIER_QUOTE_REVIEW_CHECKLIST.map((key) => [
      key,
      rawChecklist[key] === true,
    ]),
  ) as Record<
    (typeof EXPORTUNITY_SUPPLIER_QUOTE_REVIEW_CHECKLIST)[number],
    boolean
  >;
  if (
    decision === "qualified" &&
    EXPORTUNITY_SUPPLIER_QUOTE_REVIEW_CHECKLIST.some(
      (key) => checklist[key] !== true,
    )
  ) {
    throw new SupplierQuoteIntakePolicyError(
      "SUPPLIER_QUOTE_REVIEW_CHECKLIST_INCOMPLETE",
      "Every qualification attestation must be explicitly confirmed.",
    );
  }

  return {
    decision: decision as SupplierQuoteReviewDecision,
    reviewNotes,
    checklist,
  };
}
