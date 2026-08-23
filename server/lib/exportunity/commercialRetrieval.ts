import { and, eq } from "drizzle-orm";

import { db } from "@db";
import { industrialCatalogItems, industrialFactories } from "@db/schema";
import type {
  CommercialIntentResult,
  CommercialIntentType,
} from "../commercialIntentEngine";

export const COMMERCIAL_RELEVANCE_THRESHOLD = 0.78;

const PRODUCT_STOP_WORDS = new Set([
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
  "of",
  "the",
]);

const PRODUCT_EQUIVALENTS: Record<string, string[]> = {
  "palm oil": ["huile de palme"],
  "refined palm oil": ["huile de palme raffinee", "rbd palm oil"],
  "crude palm oil": ["huile de palme brute", "cpo"],
  cashew: ["anacarde", "noix de cajou"],
  cocoa: ["cacao"],
  coffee: ["cafe"],
  rice: ["riz"],
  fertilizer: ["engrais"],
};

export type CommercialCatalogCandidate = {
  id: string;
  name: string;
  classification: string;
  publicDescription?: string | null;
  availabilityStatus?: string | null;
  countryOfOrigin?: string | null;
  unitOfMeasure?: string | null;
  minimumOrderQuantity?: string | null;
  availableQuantityText?: string | null;
  leadTimeText?: string | null;
  priceMode?: string | null;
  priceText?: string | null;
  currencyCode?: string | null;
  certifications?: string[] | null;
  visibility?: string | null;
  updatedAt?: Date | string | null;
};

export type RankedCommercialCatalogCandidate = CommercialCatalogCandidate & {
  relevanceScore: number;
  productMatch: boolean;
  specificationMatch: boolean;
};

export type PublicCommercialCatalogMatch = {
  id: string;
  name: string;
  classification: string;
  relevanceScore: number;
  availabilityStatus: string | null;
  countryOfOrigin: string | null;
  unitOfMeasure: string | null;
  minimumOrderQuantity: string | null;
  availableQuantityText: string | null;
  leadTimeText: string | null;
  priceMode: string | null;
  priceText: string | null;
  currencyCode: string | null;
  certifications: string[];
  freshnessAt: string | null;
};

export type CommercialRetrievalResult = {
  status:
    | "not_applicable"
    | "clarification_required"
    | "verified_matches"
    | "internal_matches_require_review"
    | "no_verified_match";
  searched: boolean;
  searchedAt: string;
  source: "industrial_catalog";
  threshold: number;
  query: {
    productName: string | null;
    category: string | null;
    specification: string | null;
    classifications: string[];
  };
  verifiedMatchCount: number;
  publicMatchCount: number;
  matches: PublicCommercialCatalogMatch[];
};

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: unknown) {
  return Array.from(
    new Set(
      normalize(value)
        .split(/\s+/)
        .filter((token) => token.length > 1 && !PRODUCT_STOP_WORDS.has(token)),
    ),
  );
}

function expectedClassifications(intent: CommercialIntentType) {
  if (intent === "find_machinery") return ["machinery"];
  if (intent === "find_raw_material") {
    return ["raw_material", "industrial_input", "export_ready_factory_product"];
  }
  if (intent === "request_logistics") return ["industrial_service"];
  if (
    [
      "source_product",
      "request_quote",
      "compare_suppliers",
      "request_price",
      "place_order",
    ].includes(intent)
  ) {
    return [
      "export_ready_factory_product",
      "raw_material",
      "industrial_input",
    ];
  }
  return [];
}

function productPhrases(result: CommercialIntentResult) {
  const values = [result.product?.name, result.product?.category]
    .map(normalize)
    .filter(Boolean);
  for (const value of [...values]) {
    values.push(...(PRODUCT_EQUIVALENTS[value] || []).map(normalize));
  }
  return Array.from(new Set(values));
}

export function rankCommercialCatalogCandidate(
  candidate: CommercialCatalogCandidate,
  result: CommercialIntentResult,
): RankedCommercialCatalogCandidate {
  const classifications = expectedClassifications(result.intent);
  if (!classifications.includes(candidate.classification)) {
    return {
      ...candidate,
      relevanceScore: 0,
      productMatch: false,
      specificationMatch: false,
    };
  }

  const haystack = normalize(
    [
      candidate.name,
      candidate.publicDescription,
      candidate.classification,
      candidate.countryOfOrigin,
    ].join(" "),
  );
  const phrases = productPhrases(result);
  const productTokens = tokens(
    result.product?.category || result.product?.name || "",
  );
  const exactPhraseMatch = phrases.some(
    (phrase) => phrase.length >= 3 && haystack.includes(phrase),
  );
  const matchingTokens = productTokens.filter((token) =>
    new RegExp(`(?:^|\\s)${token}(?:$|\\s)`).test(haystack),
  );
  const tokenCoverage = productTokens.length
    ? matchingTokens.length / productTokens.length
    : 0;
  const productMatch = exactPhraseMatch || tokenCoverage === 1;

  const specification = normalize(result.product?.specification);
  const specificationMatch = !specification || haystack.includes(specification);
  if (!productMatch) {
    return {
      ...candidate,
      relevanceScore: 0,
      productMatch: false,
      specificationMatch,
    };
  }

  let score = exactPhraseMatch ? 0.88 : 0.8;
  if (candidate.classification === "export_ready_factory_product") score += 0.03;
  if (specification) score += specificationMatch ? 0.09 : -0.14;
  if (normalize(candidate.availabilityStatus) === "available") score += 0.02;

  return {
    ...candidate,
    relevanceScore: Math.max(0, Math.min(1, Number(score.toFixed(2)))),
    productMatch,
    specificationMatch,
  };
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function publicProjection(
  candidate: RankedCommercialCatalogCandidate,
): PublicCommercialCatalogMatch {
  return {
    id: candidate.id,
    name: candidate.name,
    classification: candidate.classification,
    relevanceScore: candidate.relevanceScore,
    availabilityStatus: candidate.availabilityStatus || null,
    countryOfOrigin: candidate.countryOfOrigin || null,
    unitOfMeasure: candidate.unitOfMeasure || null,
    minimumOrderQuantity: candidate.minimumOrderQuantity || null,
    availableQuantityText: candidate.availableQuantityText || null,
    leadTimeText: candidate.leadTimeText || null,
    priceMode: candidate.priceMode || null,
    priceText: candidate.priceText || null,
    currencyCode: candidate.currencyCode || null,
    certifications: Array.isArray(candidate.certifications)
      ? candidate.certifications
      : [],
    freshnessAt: iso(candidate.updatedAt),
  };
}

function emptyResult(
  result: CommercialIntentResult,
  status: CommercialRetrievalResult["status"],
): CommercialRetrievalResult {
  return {
    status,
    searched: false,
    searchedAt: new Date().toISOString(),
    source: "industrial_catalog",
    threshold: COMMERCIAL_RELEVANCE_THRESHOLD,
    query: {
      productName: result.product?.name || null,
      category: result.product?.category || null,
      specification: result.product?.specification || null,
      classifications: expectedClassifications(result.intent),
    },
    verifiedMatchCount: 0,
    publicMatchCount: 0,
    matches: [],
  };
}

export async function retrieveExportunityInternalSupply(input: {
  tenantId: number;
  intent: CommercialIntentResult;
}): Promise<CommercialRetrievalResult> {
  const classifications = expectedClassifications(input.intent.intent);
  if (!classifications.length) {
    return emptyResult(input.intent, "not_applicable");
  }
  if (
    !input.intent.product?.name ||
    input.intent.confidence < 0.65 ||
    !tokens(input.intent.product.category || input.intent.product.name).length
  ) {
    return emptyResult(input.intent, "clarification_required");
  }

  const rows = await db
    .select({
      id: industrialCatalogItems.id,
      name: industrialCatalogItems.name,
      classification: industrialCatalogItems.classification,
      publicDescription: industrialCatalogItems.publicDescription,
      availabilityStatus: industrialCatalogItems.availabilityStatus,
      countryOfOrigin: industrialCatalogItems.countryOfOrigin,
      unitOfMeasure: industrialCatalogItems.unitOfMeasure,
      minimumOrderQuantity: industrialCatalogItems.minimumOrderQuantity,
      availableQuantityText: industrialCatalogItems.availableQuantityText,
      leadTimeText: industrialCatalogItems.leadTimeText,
      priceMode: industrialCatalogItems.priceMode,
      priceText: industrialCatalogItems.priceText,
      currencyCode: industrialCatalogItems.currencyCode,
      certifications: industrialCatalogItems.certifications,
      visibility: industrialCatalogItems.visibility,
      updatedAt: industrialCatalogItems.updatedAt,
    })
    .from(industrialCatalogItems)
    .innerJoin(
      industrialFactories,
      and(
        eq(industrialFactories.id, industrialCatalogItems.factoryId),
        eq(industrialFactories.tenantId, input.tenantId),
        eq(industrialFactories.factoryStatus, "active"),
        eq(industrialFactories.verificationStatus, "verified"),
      ),
    )
    .where(
      and(
        eq(industrialCatalogItems.tenantId, input.tenantId),
        eq(industrialCatalogItems.approvalStatus, "approved"),
      ),
    )
    .limit(200);

  const ranked = rows
    .map((row) => rankCommercialCatalogCandidate(row, input.intent))
    .filter(
      (row) =>
        row.productMatch &&
        row.specificationMatch &&
        row.relevanceScore >= COMMERCIAL_RELEVANCE_THRESHOLD,
    )
    .sort((left, right) => right.relevanceScore - left.relevanceScore);
  const publicMatches = ranked
    .filter((row) => row.visibility === "public")
    .slice(0, 5)
    .map(publicProjection);

  return {
    status: publicMatches.length
      ? "verified_matches"
      : ranked.length
        ? "internal_matches_require_review"
        : "no_verified_match",
    searched: true,
    searchedAt: new Date().toISOString(),
    source: "industrial_catalog",
    threshold: COMMERCIAL_RELEVANCE_THRESHOLD,
    query: {
      productName: input.intent.product.name || null,
      category: input.intent.product.category || null,
      specification: input.intent.product.specification || null,
      classifications,
    },
    verifiedMatchCount: ranked.length,
    publicMatchCount: publicMatches.length,
    matches: publicMatches,
  };
}
