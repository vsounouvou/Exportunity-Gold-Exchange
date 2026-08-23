import type { CommercialIntentResult } from "../commercialIntentEngine";

export const EXPORTUNITY_SUPPLIER_CANDIDATE_THRESHOLD = 0.78;
export const EXPORTUNITY_SUPPLIER_CANDIDATE_LIMIT = 20;

const STOP_WORDS = new Set([
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

const PRODUCT_EQUIVALENT_GROUPS = [
  ["palm oil", "huile de palme"],
  ["refined palm oil", "huile de palme raffinee", "rbd palm oil"],
  ["crude palm oil", "huile de palme brute", "cpo"],
  ["cashew", "anacarde", "noix de cajou"],
  ["cocoa", "cacao"],
  ["coffee", "cafe"],
  ["rice", "riz"],
  ["fertilizer", "engrais"],
] as const;

export type SupplierCandidateProfile = {
  id: string;
  legalName?: string | null;
  displayName?: string | null;
  supplierStatus: string;
  verificationStatus: string;
  visibility: string;
  categoryCodes?: unknown;
  capabilities?: unknown;
  materialsHandled?: unknown;
  industriesServed?: unknown;
  certifications?: unknown;
};

export type SupplierCandidateRequirement = {
  id: string;
  requirementType: string;
  categoryCode: string;
  title?: string | null;
  details?: string | null;
};

export type RankedSupplierCandidate = {
  supplierProfileId: string;
  eligible: boolean;
  relevanceScore: number;
  productMatch: boolean;
  categoryMatch: boolean;
  specificationMatch: boolean;
  conflictingSpecification: boolean;
  matchReason: string;
};

export type SupplierCandidateScreeningPlan = {
  idempotencyKey: string;
  threshold: typeof EXPORTUNITY_SUPPLIER_CANDIDATE_THRESHOLD;
  maximumCandidates: typeof EXPORTUNITY_SUPPLIER_CANDIDATE_LIMIT;
  requirementId: string;
  sourcingTaskId: number;
  sourcingTaskPublicId: string | null;
  governance: {
    internalVerifiedSuppliersOnly: true;
    humanReviewRequired: true;
    supplierIdentityPublic: false;
    supplierContactAllowed: false;
    quoteCreationAllowed: false;
    externalDiscoveryAllowed: false;
  };
};

function normalize(value: unknown) {
  return String(value || "")
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(normalize).filter(Boolean);
}

function tokens(value: unknown) {
  return Array.from(
    new Set(
      normalize(value)
        .split(/\s+/)
        .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
    ),
  );
}

function productPhrases(intent: CommercialIntentResult) {
  const requested = [intent.product?.name, intent.product?.category]
    .map(normalize)
    .filter(Boolean);
  const phrases = new Set(requested);

  for (const group of PRODUCT_EQUIVALENT_GROUPS) {
    if (
      requested.some((value) =>
        group.some(
          (equivalent) =>
            value === equivalent ||
            value.includes(equivalent) ||
            equivalent.includes(value),
        ),
      )
    ) {
      for (const equivalent of group) phrases.add(equivalent);
    }
  }

  return [...phrases].filter((phrase) => phrase.length >= 3);
}

function containsPhrase(haystack: string, phrase: string) {
  return new RegExp(`(?:^|\\s)${phrase.replace(/\s+/g, "\\s+")}(?:$|\\s)`).test(
    haystack,
  );
}

function specificationSignals(value: unknown) {
  const normalized = normalize(value);
  return {
    refined: /\b(refin\w*|raffin\w*|rbd)\b/.test(normalized),
    crude: /\b(crude|brut\w*|cpo)\b/.test(normalized),
  };
}

export function buildSupplierCandidateScreeningPlan(input: {
  tenantKey: string;
  crmStatus: string;
  crmStage: string | null;
  requirementId: string | null;
  productName: string | null;
  sourcingTaskStatus: string | null;
  sourcingTaskId: number | null;
  sourcingTaskPublicId: string | null;
}): SupplierCandidateScreeningPlan | null {
  const tenantKey = normalize(input.tenantKey);
  const crmStatus = normalize(input.crmStatus);
  const crmStage = normalize(input.crmStage);
  const requirementId = String(input.requirementId || "").trim();
  const productName = normalize(input.productName);
  const sourcingTaskStatus = normalize(input.sourcingTaskStatus);
  const sourcingTaskId = Number(input.sourcingTaskId);

  if (
    tenantKey !== "exportunity" ||
    crmStatus !== "opportunity opened" ||
    crmStage !== "qualified" ||
    !requirementId ||
    !productName ||
    sourcingTaskStatus !== "review task ready" ||
    !Number.isInteger(sourcingTaskId) ||
    sourcingTaskId <= 0
  ) {
    return null;
  }

  return {
    idempotencyKey: `exportunity:talk:supplier-screening:${requirementId}`.slice(
      0,
      240,
    ),
    threshold: EXPORTUNITY_SUPPLIER_CANDIDATE_THRESHOLD,
    maximumCandidates: EXPORTUNITY_SUPPLIER_CANDIDATE_LIMIT,
    requirementId,
    sourcingTaskId,
    sourcingTaskPublicId:
      String(input.sourcingTaskPublicId || "").trim() || null,
    governance: {
      internalVerifiedSuppliersOnly: true,
      humanReviewRequired: true,
      supplierIdentityPublic: false,
      supplierContactAllowed: false,
      quoteCreationAllowed: false,
      externalDiscoveryAllowed: false,
    },
  };
}

export function rankVerifiedInternalSupplierCandidate(input: {
  supplier: SupplierCandidateProfile;
  requirement: SupplierCandidateRequirement;
  intent: CommercialIntentResult;
}): RankedSupplierCandidate {
  const { supplier, requirement, intent } = input;
  const eligible =
    supplier.supplierStatus === "active" &&
    supplier.verificationStatus === "verified" &&
    supplier.visibility === "exportunity_internal";
  const empty = {
    supplierProfileId: supplier.id,
    eligible,
    relevanceScore: 0,
    productMatch: false,
    categoryMatch: false,
    specificationMatch: false,
    conflictingSpecification: false,
    matchReason: eligible
      ? "No sufficiently specific product evidence matched the requirement."
      : "Supplier is not active, verified, and restricted to Exportunity internal review.",
  };
  if (!eligible) return empty;

  const categoryCodes = normalizedList(supplier.categoryCodes);
  const expectedCategory = normalize(requirement.categoryCode);
  const categoryMatch = categoryCodes.includes(expectedCategory);
  const explicitCategoryConflict =
    categoryCodes.length > 0 && !categoryMatch;
  if (explicitCategoryConflict) {
    return {
      ...empty,
      categoryMatch: false,
      matchReason:
        "The supplier's declared categories do not include the requirement category.",
    };
  }

  const evidence = normalize(
    [
      supplier.legalName,
      supplier.displayName,
      ...categoryCodes,
      ...normalizedList(supplier.capabilities),
      ...normalizedList(supplier.materialsHandled),
      ...normalizedList(supplier.industriesServed),
    ].join(" "),
  );
  const phrases = productPhrases(intent);
  const requestedProduct = intent.product?.name || intent.product?.category || "";
  const requestedTokens = tokens(requestedProduct);
  const evidenceTokens = new Set(tokens(evidence));
  const exactPhraseMatch = phrases.some((phrase) =>
    containsPhrase(evidence, phrase),
  );
  const fullTokenCoverage =
    requestedTokens.length > 0 &&
    requestedTokens.every((token) => evidenceTokens.has(token));
  const productMatch = exactPhraseMatch || fullTokenCoverage;
  if (!productMatch) {
    return {
      ...empty,
      categoryMatch,
    };
  }

  const requestedSpecification = normalize(intent.product?.specification);
  const requestedSignals = specificationSignals(
    `${requestedProduct} ${requestedSpecification}`,
  );
  const evidenceSignals = specificationSignals(evidence);
  const conflictingSpecification =
    (requestedSignals.refined && evidenceSignals.crude && !evidenceSignals.refined) ||
    (requestedSignals.crude && evidenceSignals.refined && !evidenceSignals.crude);
  if (conflictingSpecification) {
    return {
      ...empty,
      productMatch: true,
      categoryMatch,
      conflictingSpecification: true,
      matchReason:
        "The internal supplier evidence conflicts with the requested product specification.",
    };
  }

  const specificationTokens = tokens(requestedSpecification);
  const specificationMatch =
    specificationTokens.length === 0 ||
    specificationTokens.every((token) =>
      [...evidenceTokens].some(
        (evidenceToken) =>
          evidenceToken === token ||
          (token.length >= 5 && evidenceToken.startsWith(token.slice(0, 5))),
      ),
    ) ||
    (requestedSignals.refined && evidenceSignals.refined) ||
    (requestedSignals.crude && evidenceSignals.crude);

  let score = exactPhraseMatch ? 0.84 : 0.8;
  if (categoryMatch) score += 0.05;
  if (requestedSpecification && specificationMatch) score += 0.08;
  const relevanceScore = Number(Math.min(1, score).toFixed(2));
  const matchReason = [
    "Active, verified Exportunity-internal supplier evidence matches the requested product.",
    categoryMatch ? "The declared supplier category also matches." : null,
    requestedSpecification
      ? specificationMatch
        ? "The requested specification is supported by the internal evidence."
        : "The requested specification still requires human confirmation."
      : null,
    "No outreach or quotation was created.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    supplierProfileId: supplier.id,
    eligible: true,
    relevanceScore,
    productMatch: true,
    categoryMatch,
    specificationMatch,
    conflictingSpecification: false,
    matchReason,
  };
}
