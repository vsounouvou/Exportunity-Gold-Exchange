import { createHash } from "node:crypto";

import {
  inferAfricaDestinationCountryCode,
  normalizeCountryCode,
  normalizeTradeKey,
} from "./foundation";

export type TradeSourceSnapshotComparable = {
  contentHash?: string | null;
  sourceUrl?: string | null;
  documentTitle?: string | null;
  issuingInstitution?: string | null;
  versionLabel?: string | null;
  contentText?: string | null;
  structuredData?: Record<string, unknown> | null;
  publishedAt?: Date | string | null;
  effectiveAt?: Date | string | null;
  affectedProducts?: string[] | null;
  affectedIndustries?: string[] | null;
  affectedHsCodes?: string[] | null;
  affectedCountryCodes?: string[] | null;
  affectedRoutes?: string[] | null;
};

export type TradeRequirementImpactCandidate = {
  id: string;
  requirementType?: string | null;
  categoryCode?: string | null;
  title?: string | null;
  details?: string | null;
  deliveryCountryCode?: string | null;
  deliveryCity?: string | null;
  productName?: string | null;
  productCategory?: string | null;
  specification?: string | null;
  origin?: string | null;
  destination?: string | null;
};

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

function asIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

export function normalizeTradeSnapshotText(value: unknown, maxChars = 200_000) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, Math.max(1_000, Math.min(500_000, maxChars)));
}

export function normalizeTradeSnapshotList(
  values: unknown,
  options: { countryCodes?: boolean; limit?: number } = {},
) {
  const limit = Math.max(1, Math.min(250, options.limit || 100));
  if (!Array.isArray(values)) return [];
  const normalized = values
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((value) =>
      options.countryCodes
        ? normalizeCountryCode(value) ||
          inferAfricaDestinationCountryCode(value) ||
          ""
        : value.slice(0, 500),
    )
    .filter(Boolean);
  return Array.from(new Set(normalized)).slice(0, limit);
}

export function buildTradeSourceDocumentKey(input: {
  documentKey?: string | null;
  sourceUrl?: string | null;
  documentTitle?: string | null;
}) {
  const explicit = normalizeTradeKey(input.documentKey);
  if (explicit) return explicit;
  try {
    const url = new URL(String(input.sourceUrl || ""));
    const pathKey = normalizeTradeKey(`${url.hostname} ${url.pathname}`);
    if (pathKey) return pathKey;
  } catch {
    // The route/service performs strict URL validation.
  }
  return normalizeTradeKey(input.documentTitle) || "source-document";
}

export function buildTradeSourceSnapshotHash(
  input: TradeSourceSnapshotComparable,
) {
  return createHash("sha256")
    .update(
      stableSerialize({
        sourceUrl: String(input.sourceUrl || "").trim(),
        documentTitle: String(input.documentTitle || "").trim(),
        issuingInstitution: String(input.issuingInstitution || "").trim(),
        versionLabel: String(input.versionLabel || "").trim(),
        contentText: normalizeTradeSnapshotText(input.contentText),
        structuredData: input.structuredData || {},
        publishedAt: asIso(input.publishedAt),
        effectiveAt: asIso(input.effectiveAt),
        affectedProducts: normalizeTradeSnapshotList(input.affectedProducts),
        affectedIndustries: normalizeTradeSnapshotList(
          input.affectedIndustries,
        ),
        affectedHsCodes: normalizeTradeSnapshotList(input.affectedHsCodes),
        affectedCountryCodes: normalizeTradeSnapshotList(
          input.affectedCountryCodes,
          { countryCodes: true },
        ),
        affectedRoutes: normalizeTradeSnapshotList(input.affectedRoutes),
      }),
    )
    .digest("hex");
}

function normalizedForComparison(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitPassages(value: unknown) {
  const text = normalizeTradeSnapshotText(value);
  if (!text) return [];
  const parts = text
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ0-9])/u)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 8)
    .map((part) => part.slice(0, 1_000));
  return Array.from(new Set(parts)).slice(0, 300);
}

function tokenSet(value: unknown) {
  const tokens = normalizedForComparison(value)
    .split(" ")
    .filter((token) => token.length >= 3);
  return new Set(tokens.slice(0, 20_000));
}

function jaccardSimilarity(left: Set<string>, right: Set<string>) {
  if (!left.size && !right.size) return 1;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 1;
}

function flattenValues(
  value: unknown,
  prefix = "structuredData",
  depth = 0,
  output = new Map<string, string>(),
) {
  if (depth > 7 || output.size >= 500) return output;
  if (value === null || typeof value !== "object") {
    output.set(prefix, stableSerialize(value));
    return output;
  }
  if (Array.isArray(value)) {
    output.set(prefix, stableSerialize(value));
    return output;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) output.set(prefix, "{}");
  for (const [key, nested] of entries) {
    flattenValues(nested, `${prefix}.${key}`, depth + 1, output);
  }
  return output;
}

function listChanges(previous: unknown, current: unknown) {
  const before = normalizeTradeSnapshotList(previous);
  const after = normalizeTradeSnapshotList(current);
  const beforeKeys = new Map(
    before.map((value) => [normalizedForComparison(value), value]),
  );
  const afterKeys = new Map(
    after.map((value) => [normalizedForComparison(value), value]),
  );
  return {
    added: [...afterKeys.entries()]
      .filter(([key]) => !beforeKeys.has(key))
      .map(([, value]) => value),
    removed: [...beforeKeys.entries()]
      .filter(([key]) => !afterKeys.has(key))
      .map(([, value]) => value),
  };
}

export function compareTradeSourceSnapshots(
  previous: TradeSourceSnapshotComparable,
  current: TradeSourceSnapshotComparable,
) {
  const previousText = normalizeTradeSnapshotText(previous.contentText);
  const currentText = normalizeTradeSnapshotText(current.contentText);
  const previousPassages = splitPassages(previousText);
  const currentPassages = splitPassages(currentText);
  const previousPassageKeys = new Map(
    previousPassages.map((passage) => [normalizedForComparison(passage), passage]),
  );
  const currentPassageKeys = new Map(
    currentPassages.map((passage) => [normalizedForComparison(passage), passage]),
  );
  const addedPassages = [...currentPassageKeys.entries()]
    .filter(([key]) => !previousPassageKeys.has(key))
    .map(([, passage]) => passage)
    .slice(0, 80);
  const removedPassages = [...previousPassageKeys.entries()]
    .filter(([key]) => !currentPassageKeys.has(key))
    .map(([, passage]) => passage)
    .slice(0, 80);

  const previousFields = flattenValues(previous.structuredData || {});
  const currentFields = flattenValues(current.structuredData || {});
  const metadataFields: Array<[
    string,
    unknown,
    unknown,
  ]> = [
    ["sourceUrl", previous.sourceUrl, current.sourceUrl],
    ["documentTitle", previous.documentTitle, current.documentTitle],
    [
      "issuingInstitution",
      previous.issuingInstitution,
      current.issuingInstitution,
    ],
    ["versionLabel", previous.versionLabel, current.versionLabel],
    ["publishedAt", asIso(previous.publishedAt), asIso(current.publishedAt)],
    ["effectiveAt", asIso(previous.effectiveAt), asIso(current.effectiveAt)],
  ];
  const changedFields = new Set<string>();
  for (const key of new Set([...previousFields.keys(), ...currentFields.keys()])) {
    if (previousFields.get(key) !== currentFields.get(key)) changedFields.add(key);
  }
  for (const [key, before, after] of metadataFields) {
    if (stableSerialize(before ?? null) !== stableSerialize(after ?? null)) {
      changedFields.add(key);
    }
  }

  const affectedScopeChanges = {
    products: listChanges(previous.affectedProducts, current.affectedProducts),
    industries: listChanges(
      previous.affectedIndustries,
      current.affectedIndustries,
    ),
    hsCodes: listChanges(previous.affectedHsCodes, current.affectedHsCodes),
    countryCodes: listChanges(
      previous.affectedCountryCodes,
      current.affectedCountryCodes,
    ),
    routes: listChanges(previous.affectedRoutes, current.affectedRoutes),
  };
  const scopeChangeCount = Object.values(affectedScopeChanges).reduce(
    (sum, change) => sum + change.added.length + change.removed.length,
    0,
  );
  const textSimilarity = jaccardSimilarity(
    tokenSet(previousText),
    tokenSet(currentText),
  );
  const criticalFieldChange = [...changedFields].some((field) =>
    /(effective|tariff|duty|rate|ban|prohibit|certificate|conform|requirement|deadline|hs.?code|quota|permit)/i.test(
      field,
    ),
  );
  const hasAnyChange = Boolean(
    changedFields.size ||
      addedPassages.length ||
      removedPassages.length ||
      scopeChangeCount,
  );
  const materialityScore = hasAnyChange
    ? Math.min(
        100,
        Math.round(
          Math.min(40, changedFields.size * 6) +
            Math.min(35, (1 - textSimilarity) * 35) +
            Math.min(20, scopeChangeCount * 4) +
            (criticalFieldChange ? 15 : 0),
        ),
      )
    : 0;
  const isSubstantive =
    hasAnyChange &&
    (materialityScore >= 30 ||
      (criticalFieldChange && materialityScore >= 20));
  const deterministicSummary = hasAnyChange
    ? [
        `Deterministic comparison found ${changedFields.size} changed structured/date fields, ${addedPassages.length} added passages, and ${removedPassages.length} removed passages.`,
        `Materiality score: ${materialityScore}/100; text similarity: ${Math.round(textSimilarity * 100)}%.`,
        isSubstantive
          ? "The candidate may be substantive and requires accountable review before publication or notification."
          : "The difference remains review-pending and is not treated as a substantive public change.",
      ].join(" ")
    : "The normalized source contents are unchanged.";
  const previousHash =
    previous.contentHash || buildTradeSourceSnapshotHash(previous);
  const currentHash = current.contentHash || buildTradeSourceSnapshotHash(current);
  const comparisonHash = createHash("sha256")
    .update(
      stableSerialize({
        previousHash,
        currentHash,
        changedFields: [...changedFields].sort(),
        affectedScopeChanges,
      }),
    )
    .digest("hex");

  return {
    comparisonHash,
    changedFields: [...changedFields].sort(),
    addedPassages,
    removedPassages,
    affectedScopeChanges,
    textSimilarity: Number(textSimilarity.toFixed(3)),
    materialityScore,
    isSubstantive,
    deterministicSummary,
    hasAnyChange,
  };
}

const IMPACT_STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "dans",
  "avec",
  "pour",
  "les",
  "des",
  "une",
  "sur",
  "product",
  "produit",
  "service",
  "requirement",
  "besoin",
]);

function keywords(value: unknown) {
  return new Set(
    normalizedForComparison(value)
      .split(" ")
      .filter((token) => token.length >= 3 && !IMPACT_STOP_WORDS.has(token)),
  );
}

function overlapCount(left: Set<string>, right: Set<string>) {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

function countryCodesFromText(value: unknown) {
  const text = String(value || "");
  const codes = new Set<string>();
  const direct = normalizeCountryCode(text);
  if (direct) codes.add(direct);
  const inferred = inferAfricaDestinationCountryCode(text);
  if (inferred) codes.add(inferred);
  return codes;
}

export function matchTradeRequirementImpact(
  scope: Pick<
    TradeSourceSnapshotComparable,
    | "affectedProducts"
    | "affectedIndustries"
    | "affectedHsCodes"
    | "affectedCountryCodes"
    | "affectedRoutes"
  >,
  requirement: TradeRequirementImpactCandidate,
) {
  const requirementText = [
    requirement.requirementType,
    requirement.categoryCode,
    requirement.title,
    requirement.details,
    requirement.productName,
    requirement.productCategory,
    requirement.specification,
    requirement.origin,
    requirement.destination,
    requirement.deliveryCity,
  ]
    .filter(Boolean)
    .join(" ");
  const requirementKeywords = keywords(requirementText);
  const requirementNormalized = normalizedForComparison(requirementText);
  const reasons: string[] = [];
  let score = 0;

  const affectedCountries = normalizeTradeSnapshotList(
    scope.affectedCountryCodes,
    { countryCodes: true },
  );
  const requirementCountries = new Set<string>();
  for (const value of [
    requirement.deliveryCountryCode,
    requirement.destination,
    requirement.origin,
    requirement.deliveryCity,
    requirementText,
  ]) {
    for (const code of countryCodesFromText(value)) requirementCountries.add(code);
  }
  const countryMatches = affectedCountries.filter((code) =>
    requirementCountries.has(code),
  );
  if (countryMatches.length) {
    score += 35;
    reasons.push(`Affected market or route country: ${countryMatches.join(", ")}.`);
  }

  let productMatched = false;
  for (const product of normalizeTradeSnapshotList(scope.affectedProducts)) {
    const productNormalized = normalizedForComparison(product);
    const productKeywords = keywords(product);
    const overlap = overlapCount(productKeywords, requirementKeywords);
    if (
      (productNormalized && requirementNormalized.includes(productNormalized)) ||
      (productKeywords.size && overlap >= Math.min(2, productKeywords.size))
    ) {
      score += Math.min(50, 30 + overlap * 8);
      reasons.push(`Affected product match: ${product}.`);
      productMatched = true;
      break;
    }
  }

  let industryMatched = false;
  for (const industry of normalizeTradeSnapshotList(scope.affectedIndustries)) {
    const industryKeywords = keywords(industry);
    if (overlapCount(industryKeywords, requirementKeywords) > 0) {
      score += 15;
      reasons.push(`Affected industry match: ${industry}.`);
      industryMatched = true;
      break;
    }
  }

  let hsCodeMatched = false;
  const compactRequirement = requirementText.replace(/[^0-9]/g, "");
  for (const hsCode of normalizeTradeSnapshotList(scope.affectedHsCodes)) {
    const compactCode = hsCode.replace(/[^0-9]/g, "");
    if (compactCode.length >= 4 && compactRequirement.includes(compactCode)) {
      score += 45;
      reasons.push(`Affected HS code match: ${hsCode}.`);
      hsCodeMatched = true;
      break;
    }
  }

  let routeMatched = false;
  for (const route of normalizeTradeSnapshotList(scope.affectedRoutes)) {
    const routeKeywords = keywords(route);
    if (overlapCount(routeKeywords, requirementKeywords) >= 2) {
      score += 20;
      reasons.push(`Affected route match: ${route}.`);
      routeMatched = true;
      break;
    }
  }

  if (affectedCountries.length && !countryMatches.length && !routeMatched) {
    return null;
  }
  if (
    !countryMatches.length &&
    !productMatched &&
    !industryMatched &&
    !hsCodeMatched &&
    !routeMatched
  ) {
    return null;
  }
  const matchScore = Math.min(100, score);
  if (matchScore < 35) return null;
  return { matchScore, matchReasons: reasons };
}
