import crypto from "node:crypto";

export const EXPORTUNITY_DISCOVERY_MINIMUM_RELEVANCE = 60;
export const EXPORTUNITY_DISCOVERY_MAX_EVIDENCE_BYTES = 16_000;

export const EXPORTUNITY_DISCOVERY_SOURCE_TYPES = [
  "official_website",
  "government_registry",
  "trade_directory",
  "marketplace",
  "search_result",
  "manual_research",
] as const;

export type SupplierDiscoverySourceType =
  (typeof EXPORTUNITY_DISCOVERY_SOURCE_TYPES)[number];

export const EXPORTUNITY_DISCOVERY_REVIEW_STATUSES = [
  "under_review",
  "verification_pending",
  "rejected",
] as const;

export type SupplierDiscoveryReviewStatus =
  (typeof EXPORTUNITY_DISCOVERY_REVIEW_STATUSES)[number];

export type SupplierDiscoveryCandidateStatus =
  | "discovered"
  | SupplierDiscoveryReviewStatus
  | "promoted";

export type SupplierDiscoveryEvidence = {
  summary: string;
  excerpt?: string;
  signals: string[];
  searchQuery?: string;
  registryNumber?: string;
};

export type ParsedSupplierDiscoveryIntake = {
  requirementId: string;
  candidateKey: string;
  company: {
    name: string;
    normalizedName: string;
    website: string | null;
    city: string | null;
    countryCode: string | null;
    address: string | null;
    primaryIndustry: string | null;
    googlePlaceId: string | null;
    googleMapsUrl: string | null;
  };
  relevance: {
    score: number;
    rationale: string;
  };
  source: {
    type: SupplierDiscoverySourceType;
    name: string;
    url: string;
    retrievedAt: Date;
    contentHash: string;
    evidence: SupplierDiscoveryEvidence;
  };
};

export class SupplierDiscoveryPolicyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SupplierDiscoveryPolicyError";
    this.code = code;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function boundedText(
  value: unknown,
  field: string,
  maximum: number,
  options: { required?: boolean } = {},
) {
  const normalized = String(value ?? "").trim();
  if (options.required && !normalized) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_VALIDATION_FAILED",
      `${field} is required.`,
    );
  }
  if (normalized.length > maximum) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_VALIDATION_FAILED",
      `${field} must be ${maximum} characters or fewer.`,
    );
  }
  return normalized || null;
}

export function normalizeSupplierDiscoveryText(value: unknown) {
  return String(value ?? "")
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function canonicalHttpUrl(value: unknown, field: string) {
  const raw = boundedText(value, field, 2_048, { required: true }) as string;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_VALIDATION_FAILED",
      `${field} must be a valid HTTP(S) URL.`,
    );
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_VALIDATION_FAILED",
      `${field} must be a credential-free HTTP(S) URL.`,
    );
  }
  parsed.hash = "";
  return parsed.toString();
}

function optionalHttpUrl(value: unknown, field: string) {
  if (!String(value ?? "").trim()) return null;
  return canonicalHttpUrl(value, field);
}

function parseCountryCode(value: unknown) {
  const countryCode = String(value ?? "").trim().toUpperCase();
  if (!countryCode) return null;
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_VALIDATION_FAILED",
      "company.countryCode must be a two-letter ISO country code.",
    );
  }
  return countryCode;
}

function parseRetrievedAt(value: unknown) {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.valueOf())) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_VALIDATION_FAILED",
      "source.retrievedAt must be a valid timestamp.",
    );
  }
  if (date.valueOf() > Date.now() + 5 * 60_000) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_VALIDATION_FAILED",
      "source.retrievedAt cannot be in the future.",
    );
  }
  return date;
}

function parseContentHash(value: unknown) {
  const contentHash = String(value ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(contentHash)) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_VALIDATION_FAILED",
      "source.contentHash must be a SHA-256 hex digest of the retrieved source snapshot.",
    );
  }
  return contentHash;
}

function parseSignals(value: unknown) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 20) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_VALIDATION_FAILED",
      "source.evidence.signals must be an array of at most 20 strings.",
    );
  }
  return Array.from(
    new Set(
      value.map((item, index) =>
        boundedText(item, `source.evidence.signals[${index}]`, 240, {
          required: true,
        }) as string,
      ),
    ),
  );
}

function parseEvidence(value: unknown): SupplierDiscoveryEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_VALIDATION_FAILED",
      "source.evidence is required and must be an object.",
    );
  }
  const raw = value as Record<string, unknown>;
  const evidence: SupplierDiscoveryEvidence = {
    summary: boundedText(raw.summary, "source.evidence.summary", 1_000, {
      required: true,
    }) as string,
    signals: parseSignals(raw.signals),
  };
  const excerpt = boundedText(raw.excerpt, "source.evidence.excerpt", 2_000);
  const searchQuery = boundedText(
    raw.searchQuery,
    "source.evidence.searchQuery",
    500,
  );
  const registryNumber = boundedText(
    raw.registryNumber,
    "source.evidence.registryNumber",
    200,
  );
  if (excerpt) evidence.excerpt = excerpt;
  if (searchQuery) evidence.searchQuery = searchQuery;
  if (registryNumber) evidence.registryNumber = registryNumber;

  if (Buffer.byteLength(JSON.stringify(evidence), "utf8") > EXPORTUNITY_DISCOVERY_MAX_EVIDENCE_BYTES) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_VALIDATION_FAILED",
      `source.evidence must be ${EXPORTUNITY_DISCOVERY_MAX_EVIDENCE_BYTES} bytes or smaller.`,
    );
  }
  return evidence;
}

function buildCandidateKey(input: {
  name: string;
  normalizedName: string;
  website: string | null;
  city: string | null;
  countryCode: string | null;
  googlePlaceId: string | null;
}) {
  let identity: string;
  if (input.googlePlaceId) {
    identity = `google:${input.googlePlaceId.toLowerCase()}`;
  } else if (input.website) {
    const host = new URL(input.website).hostname.toLowerCase().replace(/^www\./, "");
    identity = `web:${host}:${input.normalizedName}`;
  } else {
    if (!input.countryCode) {
      throw new SupplierDiscoveryPolicyError(
        "DISCOVERY_VALIDATION_FAILED",
        "company.countryCode is required when no website or Google Place ID is supplied.",
      );
    }
    identity = [
      "name",
      input.normalizedName,
      input.countryCode,
      normalizeSupplierDiscoveryText(input.city),
    ].join(":");
  }
  return `discovery:${crypto.createHash("sha256").update(identity).digest("hex")}`;
}

export function parseSupplierDiscoveryIntake(
  value: unknown,
): ParsedSupplierDiscoveryIntake {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_VALIDATION_FAILED",
      "A supplier discovery payload is required.",
    );
  }
  const raw = value as Record<string, any>;
  const requirementId = boundedText(raw.requirementId, "requirementId", 64, {
    required: true,
  }) as string;
  if (!UUID_PATTERN.test(requirementId)) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_VALIDATION_FAILED",
      "requirementId must be a UUID.",
    );
  }

  const companyRaw = raw.company;
  if (!companyRaw || typeof companyRaw !== "object" || Array.isArray(companyRaw)) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_VALIDATION_FAILED",
      "company is required.",
    );
  }
  const name = boundedText(companyRaw.name, "company.name", 180, {
    required: true,
  }) as string;
  const normalizedName = normalizeSupplierDiscoveryText(name);
  if (normalizedName.length < 2) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_VALIDATION_FAILED",
      "company.name is not specific enough.",
    );
  }
  const company = {
    name,
    normalizedName,
    website: optionalHttpUrl(companyRaw.website, "company.website"),
    city: boundedText(companyRaw.city, "company.city", 120),
    countryCode: parseCountryCode(companyRaw.countryCode),
    address: boundedText(companyRaw.address, "company.address", 400),
    primaryIndustry: boundedText(
      companyRaw.primaryIndustry,
      "company.primaryIndustry",
      180,
    ),
    googlePlaceId: boundedText(
      companyRaw.googlePlaceId,
      "company.googlePlaceId",
      300,
    ),
    googleMapsUrl: optionalHttpUrl(
      companyRaw.googleMapsUrl,
      "company.googleMapsUrl",
    ),
  };

  const relevanceRaw = raw.relevance;
  if (!relevanceRaw || typeof relevanceRaw !== "object" || Array.isArray(relevanceRaw)) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_VALIDATION_FAILED",
      "relevance is required.",
    );
  }
  const score = Number(relevanceRaw.score);
  if (
    !Number.isInteger(score) ||
    score < EXPORTUNITY_DISCOVERY_MINIMUM_RELEVANCE ||
    score > 100
  ) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_VALIDATION_FAILED",
      `relevance.score must be an integer from ${EXPORTUNITY_DISCOVERY_MINIMUM_RELEVANCE} to 100.`,
    );
  }
  const relevance = {
    score,
    rationale: boundedText(
      relevanceRaw.rationale,
      "relevance.rationale",
      1_500,
      { required: true },
    ) as string,
  };

  const sourceRaw = raw.source;
  if (!sourceRaw || typeof sourceRaw !== "object" || Array.isArray(sourceRaw)) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_VALIDATION_FAILED",
      "source is required.",
    );
  }
  const sourceType = String(sourceRaw.type ?? "").trim() as SupplierDiscoverySourceType;
  if (!EXPORTUNITY_DISCOVERY_SOURCE_TYPES.includes(sourceType)) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_VALIDATION_FAILED",
      "source.type is not an allowed provenance source.",
    );
  }
  const source = {
    type: sourceType,
    name: boundedText(sourceRaw.name, "source.name", 180, {
      required: true,
    }) as string,
    url: canonicalHttpUrl(sourceRaw.url, "source.url"),
    retrievedAt: parseRetrievedAt(sourceRaw.retrievedAt),
    contentHash: parseContentHash(sourceRaw.contentHash),
    evidence: parseEvidence(sourceRaw.evidence),
  };

  return {
    requirementId,
    candidateKey: buildCandidateKey({ ...company, name }),
    company,
    relevance,
    source,
  };
}

const DISCOVERY_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "de",
  "des",
  "du",
  "for",
  "l",
  "la",
  "le",
  "les",
  "of",
  "product",
  "produit",
  "the",
]);

function meaningfulTokens(value: unknown) {
  return normalizeSupplierDiscoveryText(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !DISCOVERY_STOP_WORDS.has(token));
}

function specificationSignals(value: unknown) {
  const normalized = normalizeSupplierDiscoveryText(value);
  return {
    refined: /\b(refin\w*|raffin\w*|rbd)\b/.test(normalized),
    crude: /\b(crude|brut\w*|cpo)\b/.test(normalized),
  };
}

export function assessSupplierDiscoveryRelevance(input: {
  productName: string;
  specification?: string | null;
  candidate: ParsedSupplierDiscoveryIntake;
}) {
  const productName = normalizeSupplierDiscoveryText(input.productName);
  const productTokens = meaningfulTokens(productName);
  if (!productName || productTokens.length === 0) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_REQUIREMENT_INCOMPLETE",
      "The requirement has no specific product evidence for supplier discovery.",
    );
  }
  const evidenceText = normalizeSupplierDiscoveryText(
    [
      input.candidate.company.primaryIndustry,
      input.candidate.source.evidence.summary,
      input.candidate.source.evidence.excerpt,
      ...input.candidate.source.evidence.signals,
    ].join(" "),
  );
  const evidenceTokens = new Set(meaningfulTokens(evidenceText));
  const productMatch = productTokens.every((token) => evidenceTokens.has(token));
  const requestedSignals = specificationSignals(
    `${productName} ${input.specification || ""}`,
  );
  const evidenceSignals = specificationSignals(evidenceText);
  const conflictingSpecification =
    (requestedSignals.refined && evidenceSignals.crude && !evidenceSignals.refined) ||
    (requestedSignals.crude && evidenceSignals.refined && !evidenceSignals.crude);

  if (!productMatch || conflictingSpecification) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_IRRELEVANT_CANDIDATE",
      conflictingSpecification
        ? "The source evidence conflicts with the requested product specification."
        : "The source evidence does not explicitly match the requested product.",
    );
  }

  return {
    productMatch: true as const,
    conflictingSpecification: false as const,
    productTokens,
    evidenceFingerprint: crypto
      .createHash("sha256")
      .update(evidenceText)
      .digest("hex"),
  };
}

const REVIEW_TRANSITIONS: Record<
  SupplierDiscoveryCandidateStatus,
  SupplierDiscoveryReviewStatus[]
> = {
  discovered: ["under_review", "rejected"],
  under_review: ["verification_pending", "rejected"],
  verification_pending: ["under_review", "rejected"],
  rejected: [],
  promoted: [],
};

export function parseSupplierDiscoveryReview(input: {
  currentStatus: SupplierDiscoveryCandidateStatus;
  nextStatus: unknown;
  notes: unknown;
}) {
  const nextStatus = String(input.nextStatus ?? "").trim() as SupplierDiscoveryReviewStatus;
  if (!EXPORTUNITY_DISCOVERY_REVIEW_STATUSES.includes(nextStatus)) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_REVIEW_INVALID",
      "Review status must be under_review, verification_pending, or rejected.",
    );
  }
  if (!REVIEW_TRANSITIONS[input.currentStatus]?.includes(nextStatus)) {
    throw new SupplierDiscoveryPolicyError(
      "DISCOVERY_REVIEW_INVALID",
      `Cannot move a discovery candidate from ${input.currentStatus} to ${nextStatus}.`,
    );
  }
  const notes = boundedText(input.notes, "notes", 2_000, { required: true }) as string;
  return { nextStatus, notes };
}
