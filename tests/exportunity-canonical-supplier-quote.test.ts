import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { normalizeSupplierQuoteMessage } from "../server/lib/exportunity/supplierQuoteIntakePolicy";
import {
  buildCanonicalSupplierQuoteComparisons,
  projectCanonicalSupplierQuote,
  type CanonicalSupplierQuoteComparisonItem,
} from "../server/lib/exportunity/supplierQuotePolicy";

function completeNormalizedQuote(currency = "USD") {
  return normalizeSupplierQuoteMessage({
    body: [
      "Quotation reference: Q-882",
      "Product: Refined palm oil",
      "Specification: RBD, food grade",
      "Offered quantity: 100 metric tonnes",
      "Unit of measure: MT",
      `Currency: ${currency}`,
      `Unit price: ${currency} 920/MT`,
      `Total amount: ${currency} 92,000`,
      "MOQ: 50 MT",
      "Packaging: 50 kg jerrycans",
      "Lead time: 21 calendar days",
      "Incoterm: FOB Cotonou",
      "Payment terms: 30% deposit, 70% before shipment",
      "Valid until: 30 September 2026",
      "Country of origin: Benin",
      "Certifications: ISO 9001 and HACCP",
    ].join("\n"),
  });
}

test("canonical supplier quote projection is source-backed, hashed, and offer-preparation ready only with sufficient evidence", () => {
  const normalized = completeNormalizedQuote();
  const projection = projectCanonicalSupplierQuote({
    normalizedQuote: normalized.fields,
    normalizationVersion: "deterministic-v1",
  });

  assert.equal(projection.values.productName, "Refined palm oil");
  assert.equal(projection.values.currencyCode, "USD");
  assert.equal(projection.fields.unitPrice.sourceLocator?.startsWith("body.line."), true);
  assert.match(projection.quoteHash, /^[0-9a-f]{64}$/);
  assert.equal(projection.readiness.comparison.ready, true);
  assert.deepEqual(projection.readiness.comparison.blockers, []);
  assert.equal(projection.readiness.offerPreparation.ready, true);
  assert.deepEqual(projection.readiness.offerPreparation.blockers, []);
});

test("canonical projection preserves ambiguous and missing facts as blockers instead of inventing values", () => {
  const normalized = normalizeSupplierQuoteMessage({
    body: [
      "Product: Refined palm oil",
      "Offered quantity: 100 MT",
      "Unit of measure: MT",
      "Currency: USD",
      "Currency: EUR",
    ].join("\n"),
  });
  const projection = projectCanonicalSupplierQuote({
    normalizedQuote: normalized.fields,
    normalizationVersion: "deterministic-v1",
  });

  assert.equal(projection.values.currencyCode, null);
  assert.equal(projection.fields.currencyCode.state, "ambiguous");
  assert.ok(projection.ambiguousFields.includes("currencyCode"));
  assert.ok(projection.missingFields.includes("specification"));
  assert.equal(projection.readiness.comparison.ready, false);
  assert.ok(
    projection.readiness.comparison.blockers.includes(
      "currencyCode:ambiguous",
    ),
  );
  assert.ok(
    projection.readiness.comparison.blockers.some((value) =>
      value.startsWith("price:"),
    ),
  );
  assert.equal(projection.readiness.offerPreparation.ready, false);
});

function comparisonItem(
  id: string,
  currency: string,
): CanonicalSupplierQuoteComparisonItem {
  const projection = projectCanonicalSupplierQuote({
    normalizedQuote: completeNormalizedQuote(currency).fields,
    normalizationVersion: "deterministic-v1",
  });
  return {
    id,
    quoteIntakeId: `${id}-intake`,
    requirementId: "f3f3243a-c8b9-43e4-bbd9-5d4b25c5d5cf",
    supplierProfileId: `${id}-supplier`,
    supplierLegalName: `Supplier ${id}`,
    rfqReferenceCode: "RFQ-2026-0042",
    referenceCode: `SUPQ-${id}`,
    supplierQuoteReference: projection.values.supplierQuoteReference,
    status: "qualified",
    values: projection.values,
    missingFields: projection.missingFields,
    ambiguousFields: projection.ambiguousFields,
    comparisonReady: projection.readiness.comparison.ready,
    comparisonBlockers: projection.readiness.comparison.blockers,
    offerPreparationReady: projection.readiness.offerPreparation.ready,
    offerPreparationBlockers:
      projection.readiness.offerPreparation.blockers,
  };
}

test("canonical comparison never converts currencies or ranks suppliers", () => {
  const comparisons = buildCanonicalSupplierQuoteComparisons([
    comparisonItem("quote-a", "USD"),
    comparisonItem("quote-b", "EUR"),
  ]);
  assert.equal(comparisons.length, 1);
  assert.equal(comparisons[0].qualifiedCount, 2);
  assert.equal(comparisons[0].comparisonReadyCount, 2);
  assert.equal(comparisons[0].offerPreparationReadyCount, 2);
  assert.equal(comparisons[0].sameCurrency, false);
  assert.equal(comparisons[0].rankingPerformed, false);
  assert.match(comparisons[0].warning, /No conversion or price ranking/);
});

test("qualification promotes exactly one canonical supplier quote without duplicating the customer offer model", () => {
  const migration = readFileSync(
    path.join(
      process.cwd(),
      "db/migrations/20270514_exportunity_canonical_supplier_quotes.sql",
    ),
    "utf8",
  );
  const schema = readFileSync(
    path.join(process.cwd(), "db/schema/exportunity-supplier-quotes.ts"),
    "utf8",
  );
  const industrialSchema = readFileSync(
    path.join(process.cwd(), "db/schema/industrial.ts"),
    "utf8",
  );
  const service = readFileSync(
    path.join(
      process.cwd(),
      "server/lib/exportunity/supplierQuoteIntake.ts",
    ),
    "utf8",
  );
  const ui = readFileSync(
    path.join(
      process.cwd(),
      "client/src/pages/AdminExportunitySupplierRfqsPage.tsx",
    ),
    "utf8",
  );

  assert.match(schema, /export const industrialSupplierQuotes = pgTable/);
  assert.match(migration, /industrial_supplier_quotes_intake_unique/);
  assert.match(migration, /Extend the pre-existing internal supplier-cost ledger/);
  assert.match(migration, /ALTER TABLE industrial_supplier_quotes/);
  assert.match(migration, /WHERE intake\.review_status = 'qualified'/);
  assert.match(migration, /No offer, price conversion, ranking, order, payment/);
  assert.match(migration, /source-backed-sql-v1/);
  assert.match(service, /projectCanonicalSupplierQuote\(\{/);
  assert.match(service, /target: industrialSupplierQuotes\.quoteIntakeId/);
  assert.match(service, /buildCanonicalSupplierQuoteComparisons/);
  assert.match(schema, /productName: text\("product"\)/);
  assert.match(schema, /unitPrice: text\("unit_price_text"\)/);
  assert.match(industrialSchema, /export const industrialQuotes = pgTable/);
  assert.match(
    schema,
    /industrial_quotes remains the separate,[\s\S]*customer-facing Exportunity offer/,
  );
  assert.match(ui, /canonical source-backed supplier quote/);
  assert.match(ui, /offer prep blocked/);
});
