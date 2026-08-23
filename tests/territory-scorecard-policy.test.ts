import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  normalizeTerritoryScorecardEvidence,
  territoryScorecardDerivedMetrics,
  territoryScorecardView,
} from "../server/lib/territory-media/territoryScorecardPolicy";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function verifiedEvidence() {
  return {
    sourceType: "canonical_ledger",
    sourceReference: "industrial-ledger-audit:territory-7:2026-08",
    observedAt: "2026-08-31T23:59:59.999Z",
    verified: true,
    credentialsExcluded: true,
  };
}

test("scorecard normalization preserves unknown versus zero and field-level provenance", () => {
  const normalized = normalizeTerritoryScorecardEvidence({
    month: "2026-08",
    currencyCode: "xof",
    sourceWindowStart: "2026-08-01T00:00:00.000Z",
    sourceWindowEnd: "2026-08-31T23:59:59.999Z",
    metrics: {
      fulfilledGmvMinor: 12_500_000,
      producerIncomeMinor: 0,
      successfulDeliveries: 8,
      deliveryAttempts: 10,
    },
    evidence: verifiedEvidence(),
  });

  assert.equal(normalized.currencyCode, "XOF");
  assert.equal(normalized.metrics.producerIncomeMinor, 0);
  assert.equal(normalized.metrics.qualifiedLeads, undefined);
  assert.equal(normalized.evidenceStatus, "verified");
  assert.equal(normalized.metricEvidence.fulfilledGmvMinor.credentialsExcluded, true);
  assert.equal(normalized.metricEvidence.successfulDeliveries.sourceReference, verifiedEvidence().sourceReference);

  const view = territoryScorecardView(normalized.metrics);
  assert.ok(view.unknownMetrics.includes("qualifiedLeads"));
  assert.equal(view.unknownMetrics.includes("producerIncomeMinor"), false);
});

test("derived scorecard metrics use raw numerators and never divide unknown or zero denominators", () => {
  const derived = territoryScorecardDerivedMetrics({
    mediaSpendMinor: 90_000,
    acquiredCustomers: 3,
    attributableCompletedOrders: 6,
    productPageSessions: 120,
    paymentAttempts: 10,
    paymentSuccesses: 9,
    deliveryAttempts: 8,
    successfulDeliveries: 6,
    onTimeDeliveries: 3,
    activeBuyers: 0,
    repeatBuyers: 0,
  });
  assert.equal(derived.customerAcquisitionCostMinor, 30_000);
  assert.equal(derived.costPerCompletedOrderMinor, 15_000);
  assert.equal(derived.productPageConversionRate, 5);
  assert.equal(derived.paymentSuccessRate, 90);
  assert.equal(derived.deliverySuccessRate, 75);
  assert.equal(derived.onTimeDeliveryRate, 50);
  assert.equal(derived.repeatPurchaseRate, null);
});

test("scorecard evidence rejects impossible bounds, ordinary negative counts, and credential-like references", () => {
  const base = {
    month: "2026-08",
    currencyCode: "XOF",
    sourceWindowStart: "2026-08-01T00:00:00.000Z",
    sourceWindowEnd: "2026-08-31T23:59:59.999Z",
    evidence: verifiedEvidence(),
  };
  assert.throws(
    () => normalizeTerritoryScorecardEvidence({ ...base, metrics: { paymentAttempts: 2, paymentSuccesses: 3 } }),
    /paymentSuccesses cannot exceed paymentAttempts/,
  );
  assert.throws(
    () => normalizeTerritoryScorecardEvidence({ ...base, metrics: { qualifiedLeads: -1 } }),
    /qualifiedLeads cannot be negative/,
  );
  assert.doesNotThrow(() =>
    normalizeTerritoryScorecardEvidence({ ...base, metrics: { contributionMarginMinor: -500 } }),
  );
  assert.throws(
    () =>
      normalizeTerritoryScorecardEvidence({
        ...base,
        metrics: { qualifiedLeads: 2 },
        evidence: { ...verifiedEvidence(), sourceReference: "access_token=must-not-be-stored" },
      }),
    /must not contain credentials/,
  );
});

test("canonical schema, runtime parity, Action, route, service, and Territory Hub stay connected", async () => {
  const [schema, migration, ensure, actionDefinitions, service, routes, operatingLayer, ui, report] =
    await Promise.all([
      read("db/schema/territories.ts"),
      read("db/migrations/20270422_exportunity_territory_media_commerce_scorecards.sql"),
      read("server/lib/territory-media/ensureTables.ts"),
      read("server/lib/actions/actionDefinitions.ts"),
      read("server/lib/territory-media/territoryScorecard.ts"),
      read("server/routes/territories.ts"),
      read("server/lib/territory-media/territoryOperatingLayer.ts"),
      read("client/src/components/exportunity/TerritoryOperatingLayerPanel.tsx"),
      read("docs/territory-media-commerce/01-truth-gap-matrix.md"),
    ]);

  for (const source of [schema, migration, ensure]) {
    assert.match(source, /fulfilled_gmv_minor/);
    assert.match(source, /metric_evidence/);
    assert.match(source, /evidence_status/);
  }
  assert.match(migration, /ALTER TABLE IF EXISTS territory_kpis/i);
  assert.doesNotMatch(migration, /CREATE TABLE[^;]*territory.*scorecard/is);
  assert.match(actionDefinitions, /TERRITORY_SCORECARD_RECORD/);
  assert.match(service, /createActionRun/);
  assert.match(service, /externalActionPerformed: false/);
  assert.match(routes, /operating-layer\/scorecards/);
  assert.match(operatingLayer, /adBudgetEnvelopes/);
  assert.match(operatingLayer, /advertisingBudgetTableReused/);
  assert.match(ui, /Media-to-commerce scorecard/);
  assert.match(ui, /Record scorecard evidence/);
  assert.match(ui, /Missing evidence remains unknown/);
  assert.match(report, /Territory scorecard/);
});
