export const INDUSTRIAL_ATTACHMENT_REVIEW_KINDS = [
  "image_vision",
  "scanned_document_ocr",
  "cad_technical",
  "manual",
] as const;

export const INDUSTRIAL_ATTACHMENT_REVIEW_STATUSES = [
  "pending_analysis",
  "analysis_ready",
  "analysis_failed",
  "under_review",
  "approved",
  "rejected",
  "applied",
] as const;

export const INDUSTRIAL_ATTACHMENT_APPLY_FIELDS = [
  "productName",
  "productCategory",
  "specification",
] as const;

export type IndustrialAttachmentReviewKind =
  (typeof INDUSTRIAL_ATTACHMENT_REVIEW_KINDS)[number];
export type IndustrialAttachmentReviewStatus =
  (typeof INDUSTRIAL_ATTACHMENT_REVIEW_STATUSES)[number];
export type IndustrialAttachmentApplyField =
  (typeof INDUSTRIAL_ATTACHMENT_APPLY_FIELDS)[number];

export type IndustrialAttachmentSpecification = {
  field: string;
  value: string;
  evidence: string;
  confidence: number;
};

export type IndustrialAttachmentProposal = {
  objectIdentified: boolean;
  likelyProduct: string | null;
  productCategory: string | null;
  brand: string | null;
  model: string | null;
  specificationSummary: string | null;
  visibleText: string[];
  observableCharacteristics: string[];
  proposedSpecifications: IndustrialAttachmentSpecification[];
  clarificationQuestions: string[];
  limitations: string[];
  internalSearchTerms: string[];
  overallConfidence: number;
};

const ALLOWED_TRANSITIONS: Record<
  IndustrialAttachmentReviewStatus,
  readonly IndustrialAttachmentReviewStatus[]
> = {
  pending_analysis: ["analysis_ready", "analysis_failed"],
  analysis_ready: ["under_review", "rejected"],
  analysis_failed: ["pending_analysis", "under_review", "rejected"],
  under_review: ["approved", "rejected"],
  approved: ["under_review", "applied"],
  rejected: ["under_review"],
  applied: [],
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanOptionalString(value: unknown, maxLength: number) {
  const result = String(value ?? "").replace(/\s+/g, " ").trim();
  return result ? result.slice(0, maxLength) : null;
}

function cleanStringList(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((entry) => cleanOptionalString(entry, maxLength))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  ].slice(0, maxItems);
}

function normalizedConfidence(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

export function emptyIndustrialAttachmentProposal(): IndustrialAttachmentProposal {
  return {
    objectIdentified: false,
    likelyProduct: null,
    productCategory: null,
    brand: null,
    model: null,
    specificationSummary: null,
    visibleText: [],
    observableCharacteristics: [],
    proposedSpecifications: [],
    clarificationQuestions: [],
    limitations: [],
    internalSearchTerms: [],
    overallConfidence: 0,
  };
}

export function normalizeIndustrialAttachmentProposal(
  value: unknown,
): IndustrialAttachmentProposal {
  const input = record(value);
  const proposedSpecifications = Array.isArray(input.proposedSpecifications)
    ? input.proposedSpecifications
        .map((entry) => {
          const specification = record(entry);
          const field = cleanOptionalString(specification.field, 120);
          const specificationValue = cleanOptionalString(specification.value, 500);
          const evidence = cleanOptionalString(specification.evidence, 500);
          if (!field || !specificationValue || !evidence) return null;
          return {
            field,
            value: specificationValue,
            evidence,
            confidence: normalizedConfidence(specification.confidence),
          };
        })
        .filter(
          (entry): entry is IndustrialAttachmentSpecification => Boolean(entry),
        )
        .slice(0, 20)
    : [];

  return {
    objectIdentified: input.objectIdentified === true,
    likelyProduct: cleanOptionalString(input.likelyProduct, 240),
    productCategory: cleanOptionalString(input.productCategory, 160),
    brand: cleanOptionalString(input.brand, 120),
    model: cleanOptionalString(input.model, 120),
    specificationSummary: cleanOptionalString(input.specificationSummary, 4000),
    visibleText: cleanStringList(input.visibleText, 30, 300),
    observableCharacteristics: cleanStringList(
      input.observableCharacteristics,
      30,
      300,
    ),
    proposedSpecifications,
    clarificationQuestions: cleanStringList(
      input.clarificationQuestions,
      15,
      400,
    ),
    limitations: cleanStringList(input.limitations, 15, 400),
    internalSearchTerms: cleanStringList(input.internalSearchTerms, 15, 180),
    overallConfidence: normalizedConfidence(input.overallConfidence),
  };
}

export function assertIndustrialAttachmentReviewTransition(
  from: IndustrialAttachmentReviewStatus,
  to: IndustrialAttachmentReviewStatus,
) {
  if (from === to || !ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`The attachment review transition ${from} -> ${to} is not allowed.`);
  }
}

export function nextIndustrialAttachmentReviewStatuses(
  status: IndustrialAttachmentReviewStatus,
) {
  return [...(ALLOWED_TRANSITIONS[status] || [])];
}

export function evaluateIndustrialAttachmentApproval(input: {
  proposal: IndustrialAttachmentProposal;
  reviewNotes?: string | null;
  humanConfirmed: boolean;
}) {
  const reasons: string[] = [];
  const proposal = normalizeIndustrialAttachmentProposal(input.proposal);
  if (
    !proposal.likelyProduct &&
    !proposal.productCategory &&
    !proposal.specificationSummary
  ) {
    reasons.push(
      "Verify at least a product name, category, or specification summary.",
    );
  }
  if (String(input.reviewNotes || "").trim().length < 8) {
    reasons.push("Add reviewer notes explaining the evidence check.");
  }
  if (!input.humanConfirmed) {
    reasons.push("An accountable human must confirm the evidence review.");
  }
  return { eligible: reasons.length === 0, reasons, proposal };
}

export function proposalApplicationValues(
  proposalInput: IndustrialAttachmentProposal,
) {
  const proposal = normalizeIndustrialAttachmentProposal(proposalInput);
  return {
    productName: proposal.likelyProduct,
    productCategory: proposal.productCategory,
    specification: proposal.specificationSummary,
  } satisfies Record<IndustrialAttachmentApplyField, string | null>;
}

export function inferIndustrialAttachmentReviewKind(input: {
  mimeType?: string | null;
  fileName?: string | null;
  extractionStatus?: string | null;
}): IndustrialAttachmentReviewKind {
  const mimeType = String(input.mimeType || "").toLowerCase();
  const fileName = String(input.fileName || "").toLowerCase();
  if (mimeType.startsWith("image/")) return "image_vision";
  if (String(input.extractionStatus || "") === "ocr_required") {
    return "scanned_document_ocr";
  }
  if (
    /\.(?:dxf|dwg|step|stp|stl|iges|igs)$/.test(fileName) ||
    /^(?:model\/|application\/(?:dxf|x-dxf|acad|x-acad|x-autocad|step|sla))/.test(
      mimeType,
    )
  ) {
    return "cad_technical";
  }
  return "manual";
}

export const INDUSTRIAL_ATTACHMENT_PROPOSAL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    objectIdentified: { type: "boolean" },
    likelyProduct: { type: ["string", "null"] },
    productCategory: { type: ["string", "null"] },
    brand: { type: ["string", "null"] },
    model: { type: ["string", "null"] },
    specificationSummary: { type: ["string", "null"] },
    visibleText: { type: "array", items: { type: "string" } },
    observableCharacteristics: { type: "array", items: { type: "string" } },
    proposedSpecifications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          field: { type: "string" },
          value: { type: "string" },
          evidence: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["field", "value", "evidence", "confidence"],
      },
    },
    clarificationQuestions: { type: "array", items: { type: "string" } },
    limitations: { type: "array", items: { type: "string" } },
    internalSearchTerms: { type: "array", items: { type: "string" } },
    overallConfidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: [
    "objectIdentified",
    "likelyProduct",
    "productCategory",
    "brand",
    "model",
    "specificationSummary",
    "visibleText",
    "observableCharacteristics",
    "proposedSpecifications",
    "clarificationQuestions",
    "limitations",
    "internalSearchTerms",
    "overallConfidence",
  ],
} as const;
