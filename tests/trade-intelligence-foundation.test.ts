import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTradeIntelligenceCoverageTargets,
  buildTradeDemandRadar,
  buildZeroResultResearchMission,
  calculateTradePublicationEligibility,
  deriveTradeCoverage,
  inferAfricaDestinationCountryCode,
  inferTradeSectorCode,
  inferPhaseOneDestinationCountryCode,
  normalizeTradeKey,
  normalizeTradeSectorCode,
  resolveTradeIndustrySectorTransition,
  shouldProposeZeroResultMission,
  TRADE_INTELLIGENCE_AFRICA_COUNTRIES,
  TRADE_INTELLIGENCE_PRIORITY_COUNTRIES,
  TRADE_INTELLIGENCE_PRIORITY_SECTORS,
} from "../server/lib/trade-intelligence/foundation";

test("five launch priorities remain explicit inside the 54-country Africa catalog", () => {
  assert.equal(TRADE_INTELLIGENCE_AFRICA_COUNTRIES.length, 54);
  assert.equal(
    new Set(TRADE_INTELLIGENCE_AFRICA_COUNTRIES.map((country) => country.code)).size,
    54,
  );
  assert.deepEqual(
    TRADE_INTELLIGENCE_PRIORITY_COUNTRIES.map((country) => country.code),
    ["BJ", "CI", "GH", "NG", "SN"],
  );
  assert.equal(TRADE_INTELLIGENCE_PRIORITY_SECTORS.length, 7);
});

test("Africa completion targets are empty governed backlog rows, never fabricated facts", () => {
  const targets = buildTradeIntelligenceCoverageTargets(17);
  assert.equal(targets.length, 54 * (9 + 7));
  assert.equal(
    targets.filter((target) => target.metadata.coverageTier === "priority").length,
    5 * (9 + 7),
  );
  assert.equal(
    targets.filter((target) => target.metadata.coverageTier === "research_backlog").length,
    49 * (9 + 7),
  );
  assert.ok(
    targets.every(
      (target) =>
        target.metadata.coverageScope === "africa_54" &&
        target.metadata.emptyCoverageIsNotEvidence === true &&
        !("factCount" in target) &&
        !("coveragePercent" in target),
    ),
  );
});

test("trade keys are stable across accents and punctuation", () => {
  assert.equal(normalizeTradeKey("Côte d’Ivoire / Palm Oil"), "cote-d-ivoire-palm-oil");
});

test("sector codes use one underscore convention across filters, events, and coverage", () => {
  assert.equal(normalizeTradeSectorCode("Energy Solar"), "energy_solar");
  assert.equal(normalizeTradeSectorCode("spare-parts-and-components"), "spare_parts_and_components");
  assert.equal(normalizeTradeSectorCode("__all__"), "__all__");
});

test("an activated catalog sector expands to 54 empty sector targets", () => {
  const targets = buildTradeIntelligenceCoverageTargets(17, [
    {
      code: "textiles_apparel",
      name: "Textiles and apparel",
      nameFr: "Textile et habillement",
      description: "Textile inputs, production, and export-ready apparel.",
      canonicalCategoryCodes: [
        "raw_materials",
        "machinery_and_production_equipment",
        "export_ready_factory_products",
      ],
      coverageTier: "research_backlog",
    },
  ]);
  const sectorTargets = targets.filter(
    (target) => target.dimension === "sector_profile",
  );
  assert.equal(sectorTargets.length, 54);
  assert.ok(
    sectorTargets.every(
      (target) =>
        target.sectorCode === "textiles_apparel" &&
        target.metadata.sectorCoverageTier === "research_backlog" &&
        target.metadata.emptyCoverageIsNotEvidence === true,
    ),
  );
});

test("industry-sector governance has no activation or retirement shortcuts", () => {
  assert.equal(
    resolveTradeIndustrySectorTransition("draft", "submit_for_review"),
    "review",
  );
  assert.equal(resolveTradeIndustrySectorTransition("review", "activate"), "active");
  assert.equal(resolveTradeIndustrySectorTransition("active", "retire"), "retired");
  assert.equal(resolveTradeIndustrySectorTransition("draft", "activate"), null);
  assert.equal(resolveTradeIndustrySectorTransition("review", "retire"), null);
  assert.equal(resolveTradeIndustrySectorTransition("retired", "activate"), null);
});

test("refined palm-oil demand maps to agricultural commodities, never an unrelated sector", () => {
  assert.equal(
    inferTradeSectorCode({
      categoryCode: "raw_materials",
      requirementType: "raw_material",
      productName: "huile de palme raffinée",
      details: "100 tonnes à livrer à Abidjan",
    }),
    "agricultural_commodities",
  );
});

test("Abidjan demand resolves to Côte d’Ivoire without inventing a broader location", () => {
  assert.equal(inferPhaseOneDestinationCountryCode("livrer à Abidjan"), "CI");
});

test("free-text demand resolves destinations across the 54-country scope in English and French", () => {
  assert.equal(inferAfricaDestinationCountryCode("deliver machinery to Kenya"), "KE");
  assert.equal(inferAfricaDestinationCountryCode("expédier vers la Tanzanie"), "TZ");
  assert.equal(inferAfricaDestinationCountryCode("corridor Maroc–Mauritanie"), "MR");
  assert.equal(inferAfricaDestinationCountryCode("opération au Soudan du Sud"), "SS");
  assert.equal(inferAfricaDestinationCountryCode("Congo"), null);
});

test("publication eligibility refuses single-source and conflicting claims", () => {
  const singleSource = calculateTradePublicationEligibility({
    factCount: 4,
    verifiedFactCount: 4,
    independentSourceCount: 1,
    sourceTrustScores: [0.95],
    freshestVerifiedAt: new Date("2026-08-01T00:00:00Z"),
    now: new Date("2026-08-17T00:00:00Z"),
  });
  assert.equal(singleSource.eligible, false);
  assert.match(singleSource.reasons.join(" "), /independent sources/i);

  const conflicted = calculateTradePublicationEligibility({
    factCount: 5,
    verifiedFactCount: 5,
    independentSourceCount: 3,
    sourceTrustScores: [0.95, 0.9, 0.8],
    freshestVerifiedAt: new Date("2026-08-01T00:00:00Z"),
    now: new Date("2026-08-17T00:00:00Z"),
    hasConflicts: true,
  });
  assert.equal(conflicted.eligible, false);
});

test("publication eligibility accepts fresh multi-source verified evidence", () => {
  const result = calculateTradePublicationEligibility({
    factCount: 5,
    verifiedFactCount: 5,
    independentSourceCount: 3,
    sourceTrustScores: [0.95, 0.9, 0.8],
    freshestVerifiedAt: new Date("2026-08-01T00:00:00Z"),
    now: new Date("2026-08-17T00:00:00Z"),
  });
  assert.equal(result.eligible, true);
  assert.ok(result.score >= 75);
});

test("coverage stays partial until all expected facts are verified from diverse sources", () => {
  assert.deepEqual(
    deriveTradeCoverage({
      expectedFacts: 10,
      factCount: 5,
      verifiedFactCount: 4,
      sourceCount: 2,
    }),
    { status: "partial", coveragePercent: 50, qualityScore: 72 },
  );
  assert.equal(
    deriveTradeCoverage({
      expectedFacts: 5,
      factCount: 5,
      verifiedFactCount: 5,
      sourceCount: 2,
    }).status,
    "verified",
  );
});

test("demand radar ranks transactions above searches and keeps currencies separate", () => {
  const radar = buildTradeDemandRadar([
    {
      eventType: "search",
      normalizedProduct: "refined palm oil",
      destinationCountryCode: "ci",
      resultCount: 0,
    },
    {
      eventType: "order",
      normalizedProduct: "refined palm oil",
      destinationCountryCode: "CI",
      estimatedValue: "100000",
      currencyCode: "USD",
    },
    {
      eventType: "search",
      normalizedProduct: "solar panels",
      destinationCountryCode: "SN",
    },
  ]);
  assert.equal(radar[0]?.product, "refined-palm-oil");
  assert.equal(radar[0]?.eventCount, 2);
  assert.deepEqual(radar[0]?.estimatedValues, { USD: 100000 });
});

test("zero-result commercial demand becomes a governed research mission draft", () => {
  assert.equal(
    shouldProposeZeroResultMission({
      eventType: "zero_result",
      resultCount: 0,
      queryText: "100 tonnes refined palm oil",
    }),
    true,
  );
  const mission = buildZeroResultResearchMission({
    normalizedProduct: "refined palm oil",
    destinationCountryCode: "CI",
    sectorCode: "agricultural_commodities",
    difficultyScore: 80,
  });
  assert.equal(mission.priority, "urgent");
  assert.match(mission.objective, /do not publish or contact external parties/i);
});
