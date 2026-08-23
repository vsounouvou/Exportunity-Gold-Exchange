import assert from "node:assert/strict";
import test from "node:test";

import { detectCommercialIntent } from "../server/lib/commercialIntentEngine";
import {
  COMMERCIAL_RELEVANCE_THRESHOLD,
  rankCommercialCatalogCandidate,
} from "../server/lib/exportunity/commercialRetrieval";

const palmOilIntent = detectCommercialIntent(
  "Je cherche 100 tonnes d'huile de palme raffinée à livrer à Abidjan.",
);

test("strict commercial retrieval accepts an exact refined palm-oil catalog match", () => {
  const ranked = rankCommercialCatalogCandidate(
    {
      id: "catalog-refined-palm-oil",
      name: "Refined Palm Oil RBD",
      classification: "raw_material",
      publicDescription: "Food-grade refined palm oil for bulk export.",
      availabilityStatus: "subject_to_confirmation",
      visibility: "public",
    },
    palmOilIntent,
  );

  assert.equal(ranked.productMatch, true);
  assert.equal(ranked.specificationMatch, true);
  assert.ok(ranked.relevanceScore >= COMMERCIAL_RELEVANCE_THRESHOLD);
});

test("strict commercial retrieval rejects a crude product for a refined requirement", () => {
  const ranked = rankCommercialCatalogCandidate(
    {
      id: "catalog-crude-palm-oil",
      name: "Crude Palm Oil CPO",
      classification: "raw_material",
      visibility: "public",
    },
    palmOilIntent,
  );

  assert.equal(ranked.productMatch, true);
  assert.equal(ranked.specificationMatch, false);
  assert.ok(ranked.relevanceScore < COMMERCIAL_RELEVANCE_THRESHOLD);
});

test("strict commercial retrieval blocks machinery and CAD-like records from a palm-oil request", () => {
  for (const candidate of [
    {
      id: "palm-oil-press",
      name: "Palm Oil Press Machine",
      classification: "machinery",
      publicDescription: "Industrial press with CAD drawing package",
    },
    {
      id: "cad-file",
      name: "Palm Oil Plant CAD Files",
      classification: "machinery",
      publicDescription: "Technical drawings",
    },
  ]) {
    const ranked = rankCommercialCatalogCandidate(candidate, palmOilIntent);
    assert.equal(ranked.productMatch, false);
    assert.equal(ranked.relevanceScore, 0);
  }
});

test("strict commercial retrieval does not treat generic oil as palm oil", () => {
  const ranked = rankCommercialCatalogCandidate(
    {
      id: "lubricant-oil",
      name: "Industrial Lubricant Oil",
      classification: "industrial_input",
      publicDescription: "Generator lubricant",
    },
    palmOilIntent,
  );

  assert.equal(ranked.productMatch, false);
  assert.equal(ranked.relevanceScore, 0);
});
