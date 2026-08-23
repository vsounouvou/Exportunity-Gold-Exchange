import { createHash } from "node:crypto";

import {
  EXPORTUNITY_SUPPLIER_QUOTE_FIELD_KEYS,
  type NormalizedSupplierQuoteField,
  type SupplierQuoteFieldKey,
} from "./supplierQuoteIntakePolicy";

export const EXPORTUNITY_SUPPLIER_QUOTE_PROJECTION_VERSION =
  "source-backed-v1";

export const EXPORTUNITY_SUPPLIER_QUOTE_COMPARISON_FIELDS = [
  "productName",
  "offeredQuantity",
  "unitOfMeasure",
  "currencyCode",
] as const satisfies readonly SupplierQuoteFieldKey[];

export const EXPORTUNITY_SUPPLIER_QUOTE_OFFER_FIELDS = [
  ...EXPORTUNITY_SUPPLIER_QUOTE_COMPARISON_FIELDS,
  "specification",
  "leadTime",
  "incoterm",
  "paymentTerms",
  "validity",
  "countryOfOrigin",
] as const satisfies readonly SupplierQuoteFieldKey[];

export type CanonicalSupplierQuoteProjection = {
  projectionVersion: string;
  normalizationVersion: string;
  quoteHash: string;
  fields: Record<SupplierQuoteFieldKey, NormalizedSupplierQuoteField>;
  values: Record<SupplierQuoteFieldKey, string | null>;
  providedFields: SupplierQuoteFieldKey[];
  missingFields: SupplierQuoteFieldKey[];
  ambiguousFields: SupplierQuoteFieldKey[];
  readiness: {
    comparison: { ready: boolean; blockers: string[] };
    offerPreparation: { ready: boolean; blockers: string[] };
  };
};

const FIELD_STATES = new Set(["provided", "missing", "ambiguous"]);

function compactText(value: unknown, maximum: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function canonicalField(value: unknown): NormalizedSupplierQuoteField {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      state: "missing",
      value: null,
      sourceLocator: null,
      evidenceExcerpt: null,
    };
  }
  const record = value as Record<string, unknown>;
  const requestedState = compactText(record.state, 20);
  const state = FIELD_STATES.has(requestedState)
    ? (requestedState as NormalizedSupplierQuoteField["state"])
    : "missing";
  const providedValue = compactText(record.value, 500);
  if (state !== "provided" || !providedValue) {
    return {
      state: state === "provided" ? "missing" : state,
      value: null,
      sourceLocator: compactText(record.sourceLocator, 500) || null,
      evidenceExcerpt: compactText(record.evidenceExcerpt, 720) || null,
    };
  }
  return {
    state: "provided",
    value: providedValue,
    sourceLocator: compactText(record.sourceLocator, 500) || null,
    evidenceExcerpt: compactText(record.evidenceExcerpt, 720) || null,
  };
}

function unavailableBlockers(
  fields: Record<SupplierQuoteFieldKey, NormalizedSupplierQuoteField>,
  required: readonly SupplierQuoteFieldKey[],
) {
  return required
    .filter((key) => fields[key].state !== "provided")
    .map((key) => `${key}:${fields[key].state}`);
}

function canonicalHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function projectCanonicalSupplierQuote(input: {
  normalizedQuote: Record<string, unknown>;
  normalizationVersion: string;
}): CanonicalSupplierQuoteProjection {
  const fields = Object.fromEntries(
    EXPORTUNITY_SUPPLIER_QUOTE_FIELD_KEYS.map((key) => [
      key,
      canonicalField(input.normalizedQuote[key]),
    ]),
  ) as Record<SupplierQuoteFieldKey, NormalizedSupplierQuoteField>;
  const values = Object.fromEntries(
    EXPORTUNITY_SUPPLIER_QUOTE_FIELD_KEYS.map((key) => [
      key,
      fields[key].state === "provided" ? fields[key].value : null,
    ]),
  ) as Record<SupplierQuoteFieldKey, string | null>;
  const providedFields = EXPORTUNITY_SUPPLIER_QUOTE_FIELD_KEYS.filter(
    (key) => fields[key].state === "provided",
  );
  const missingFields = EXPORTUNITY_SUPPLIER_QUOTE_FIELD_KEYS.filter(
    (key) => fields[key].state === "missing",
  );
  const ambiguousFields = EXPORTUNITY_SUPPLIER_QUOTE_FIELD_KEYS.filter(
    (key) => fields[key].state === "ambiguous",
  );
  const priceBlocker =
    fields.unitPrice.state === "provided" ||
    fields.totalAmount.state === "provided"
      ? []
      : [
          `price:unitPrice_${fields.unitPrice.state}_and_totalAmount_${fields.totalAmount.state}`,
        ];
  const comparisonBlockers = [
    ...unavailableBlockers(
      fields,
      EXPORTUNITY_SUPPLIER_QUOTE_COMPARISON_FIELDS,
    ),
    ...priceBlocker,
  ];
  const offerPreparationBlockers = [
    ...comparisonBlockers,
    ...unavailableBlockers(fields, EXPORTUNITY_SUPPLIER_QUOTE_OFFER_FIELDS).filter(
      (blocker) => !comparisonBlockers.includes(blocker),
    ),
  ];
  const normalizationVersion =
    compactText(input.normalizationVersion, 80) || "unknown";
  const hashInput = {
    projectionVersion: EXPORTUNITY_SUPPLIER_QUOTE_PROJECTION_VERSION,
    normalizationVersion,
    fields: Object.fromEntries(
      EXPORTUNITY_SUPPLIER_QUOTE_FIELD_KEYS.map((key) => [key, fields[key]]),
    ),
  };

  return {
    projectionVersion: EXPORTUNITY_SUPPLIER_QUOTE_PROJECTION_VERSION,
    normalizationVersion,
    quoteHash: canonicalHash(hashInput),
    fields,
    values,
    providedFields: [...providedFields],
    missingFields: [...missingFields],
    ambiguousFields: [...ambiguousFields],
    readiness: {
      comparison: {
        ready: comparisonBlockers.length === 0,
        blockers: comparisonBlockers,
      },
      offerPreparation: {
        ready: offerPreparationBlockers.length === 0,
        blockers: offerPreparationBlockers,
      },
    },
  };
}

export type CanonicalSupplierQuoteComparisonItem = {
  id: string;
  quoteIntakeId: string;
  requirementId: string;
  supplierProfileId: string;
  supplierLegalName: string | null;
  rfqReferenceCode: string | null;
  referenceCode: string;
  supplierQuoteReference: string | null;
  status: string;
  values: Record<SupplierQuoteFieldKey, string | null>;
  missingFields: string[];
  ambiguousFields: string[];
  comparisonReady: boolean;
  comparisonBlockers: string[];
  offerPreparationReady: boolean;
  offerPreparationBlockers: string[];
};

export function buildCanonicalSupplierQuoteComparisons(
  quotes: CanonicalSupplierQuoteComparisonItem[],
  intakeCountByRequirement: Map<string, number> = new Map(),
) {
  const grouped = new Map<string, CanonicalSupplierQuoteComparisonItem[]>();
  for (const quote of quotes) {
    if (quote.status !== "qualified") continue;
    const current = grouped.get(quote.requirementId) || [];
    current.push(quote);
    grouped.set(quote.requirementId, current);
  }

  return [...grouped.entries()].map(([requirementId, items]) => {
    const currencies = [
      ...new Set(
        items
          .map((item) => item.values.currencyCode)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const sameCurrency = currencies.length <= 1;
    return {
      requirementId,
      intakeCount: intakeCountByRequirement.get(requirementId) || items.length,
      qualifiedCount: items.length,
      comparisonReadyCount: items.filter((item) => item.comparisonReady).length,
      offerPreparationReadyCount: items.filter(
        (item) => item.offerPreparationReady,
      ).length,
      currencies,
      sameCurrency,
      rankingPerformed: false as const,
      warning: !sameCurrency
        ? "Canonical quotes use different currencies. No conversion or price ranking was performed."
        : "Canonical source-backed values are comparable only as displayed; no supplier ranking was performed.",
      items,
    };
  });
}
