import assert from "node:assert/strict";
import test from "node:test";

import { detectCommercialIntent } from "../server/lib/commercialIntentEngine";

test("detects palm oil sourcing with quantity and destination", () => {
  const result = detectCommercialIntent("Je cherche 100 tonnes d'huile de palme raffinée à livrer à Abidjan.");
  assert.equal(result.commercial, true);
  assert.equal(result.intent, "source_product");
  assert.equal(result.language, "fr");
  assert.equal(result.product?.name, "refined palm oil");
  assert.equal(result.product?.category, "palm oil");
  assert.equal(result.product?.specification, "refined");
  assert.equal(result.product?.quantity, 100);
  assert.equal(result.product?.unit, "t");
  assert.equal(result.destination?.toLowerCase(), "abidjan");
  assert.equal(result.origin, undefined);
  assert.equal(result.suggestedAction, "ACT");
  assert.equal(result.missingFields.length, 0);
});

test("does not treat generic oil as palm oil", () => {
  const result = detectCommercialIntent("I need industrial lubricant oil for a generator.");
  assert.notEqual(result.product?.category, "palm oil");
});

test("detects non-commercial informational query as non-commercial", () => {
  const result = detectCommercialIntent("Quels sont les avantages de l'intelligence artificielle ?");
  assert.equal(result.commercial, false);
  assert.equal(result.intent, "other");
});

test("asks for missing fields when sourcing details are partial", () => {
  const result = detectCommercialIntent("Je veux sourcer de l’huile de palme.");
  assert.equal(result.commercial, true);
  assert.equal(result.intent, "source_product");
  assert.equal(result.suggestedAction, "ASK");
  assert.equal(result.missingFields.includes("quantity"), true);
  assert.equal(result.missingFields.includes("destination"), true);
});

test("merges progressive qualification before acting", () => {
  const first = detectCommercialIntent("Je veux sourcer de l’huile de palme.");
  const second = detectCommercialIntent("100 tonnes", { priorResult: first });
  assert.equal(second.intent, "source_product");
  assert.equal(second.product?.name, "palm oil");
  assert.equal(second.product?.quantity, 100);
  assert.equal(second.suggestedAction, "ASK");
  assert.deepEqual(second.missingFields, ["destination"]);

  const third = detectCommercialIntent("À livrer à Abidjan.", { priorResult: second });
  assert.equal(third.destination, "abidjan");
  assert.equal(third.product?.quantity, 100);
  assert.equal(third.suggestedAction, "ACT");
  assert.deepEqual(third.missingFields, []);
});

test("extracts an unlisted product from a strong sourcing request", () => {
  const result = detectCommercialIntent("Je cherche 50 tonnes de farine de manioc à livrer à Cotonou.");
  assert.equal(result.intent, "source_product");
  assert.equal(result.product?.name, "farine de manioc");
  assert.equal(result.product?.quantity, 50);
  assert.equal(result.destination, "cotonou");
  assert.equal(result.suggestedAction, "ACT");
});

test("does not invent a currency when only a target price is stated", () => {
  const result = detectCommercialIntent("I am sourcing 10 tonnes of coffee to Accra for 2500");

  assert.equal(result.targetPrice, 2500);
  assert.equal(result.currency, undefined);
});

test("preserves the canonical requirement across later qualification messages", () => {
  const prior = {
    ...detectCommercialIntent("I am sourcing 10 tonnes of coffee to Accra"),
    requirementId: "req-123",
    requirementReferenceCode: "TREQ-123",
    productRequirementId: "product-req-123",
  };

  const result = detectCommercialIntent("monthly", { priorResult: prior });

  assert.equal(result.requirementId, "req-123");
  assert.equal(result.requirementReferenceCode, "TREQ-123");
  assert.equal(result.productRequirementId, "product-req-123");
  assert.equal("opportunityId" in result, false);
  assert.equal("opportunityReferenceCode" in result, false);
});
