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
