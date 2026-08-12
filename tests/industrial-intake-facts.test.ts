import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyIndustrialIntake,
  extractIndustrialIntakeFacts,
} from "../server/lib/industrial/intakeAssistant";

test("French intake reuses quantity and timing without confusing a part number", () => {
  const preview = classifyIndustrialIntake(
    "Je dois acheter 200 roulements 6205 pour remettre une ligne en service sous dix jours.",
    "fr",
  );

  assert.equal(preview.requirementType, "spare_part");
  assert.equal(preview.facts.quantityText, "200 roulements");
  assert.equal(preview.facts.requiredBy, "sous dix jours");
});

test("homepage spare-part action stays in the unit-based parts workflow", () => {
  const preview = classifyIndustrialIntake("Order a spare part", "en");

  assert.equal(preview.requirementType, "spare_part");
  assert.equal(preview.categoryCode, "spare_parts_and_components");
});

test("English intake extracts explicit quantity, destination, and timing", () => {
  const facts = extractIndustrialIntakeFacts(
    "We need 50 motors delivered to Lagos within three weeks.",
    "en",
  );

  assert.equal(facts.quantityText, "50 motors");
  assert.equal(facts.deliveryDestination, "Lagos");
  assert.equal(facts.requiredBy, "within three weeks");
});

test("commercial intake recognizes an explicit buying criterion", () => {
  const facts = extractIndustrialIntakeFacts(
    "Je cherche 3 tonnes d'acier avec la certification prioritaire.",
    "fr",
  );

  assert.equal(facts.quantityText, "3 tonnes");
  assert.equal(facts.purchasePriority, "Qualite et certifications");
});

test("palm-oil sourcing is a commercial raw-material request, never a CAD workflow", () => {
  const preview = classifyIndustrialIntake(
    "Je veux sourcer de l'huile de palme.",
    "fr",
  );

  assert.equal(preview.requirementType, "raw_material");
  assert.equal(preview.categoryCode, "raw_materials");
  assert.equal(preview.intent, "SOURCE_PRODUCT");
  assert.equal(preview.commercial, true);
  assert.equal(preview.product.name, "Huile de palme");
  assert.equal(preview.product.category, "palm_oil");
  assert.equal(preview.suggestedAction, "ASK");
  assert.deepEqual(preview.missingFields, [
    "product.quantity",
    "destination",
    "product.specification",
    "frequency",
    "incoterm",
  ]);
  assert.doesNotMatch(preview.response, /CAD|plan|photo/i);
  assert.match(preview.response, /approvisionnement|sourcing/i);
});

test("qualified palm-oil sourcing captures commercial terms already supplied", () => {
  const preview = classifyIndustrialIntake(
    "Je veux acheter 20 tonnes d'huile de palme raffinee, livrer a Abidjan, chaque mois, CIF.",
    "fr",
  );

  assert.equal(preview.intent, "BUY_PRODUCT");
  assert.equal(preview.product.quantity, "20");
  assert.equal(preview.product.unit, "tonnes");
  assert.equal(preview.product.specification, "refined");
  assert.equal(preview.facts.deliveryDestination, "Abidjan");
  assert.equal(preview.frequency, "Chaque mois");
  assert.equal(preview.incoterm, "CIF");
  assert.deepEqual(preview.missingFields, []);
  assert.equal(preview.suggestedAction, "ACT");
});
