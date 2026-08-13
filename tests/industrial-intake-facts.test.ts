import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyIndustrialIntake,
  extractIndustrialIntakeFacts,
} from "../server/lib/industrial/intakeAssistant";
import { resolveCommercialQualification } from "../server/lib/industrial/commercialIntentEngine";
import { scoreIndustrialSupplierCapabilityMatch } from "../server/lib/industrial/supplierCapabilities";
import {
  buildCustomerQuoteSnapshot,
  buildIndustrialRfqMessage,
  calculateIndustrialCommercialPricing,
} from "../server/lib/industrial/commercialPricing";
import {
  externalCommunicationsEnabled,
  isExternalCommunicationAction,
} from "../server/lib/actions/externalCommunications";

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

test("server qualification trusts completed conversation answers, not stale preview gaps", () => {
  const qualification = resolveCommercialQualification({
    analysis: {
      intent: "SOURCE_PRODUCT",
      confidence: 0.94,
      commercial: true,
      product: {
        name: "Huile de palme",
        category: "palm_oil",
        specification: "raffinee",
        quantity: "100",
        unit: "tonnes",
      },
      destination: "Abidjan",
      frequency: "Achat ponctuel",
      incoterm: "CIF",
      suggestedAction: "ASK",
    },
  });

  assert.deepEqual(qualification.missingFields, []);
  assert.equal(qualification.suggestedAction, "ACT");
  assert.equal(qualification.destination, "Abidjan");
});

test("supplier scoring uses product and material evidence and rejects unrelated capacity", () => {
  const requirement = {
    categoryCode: "raw_materials",
    requirementType: "raw_material",
    title: "100 tonnes d'huile de palme raffinee",
    details: "Livraison a Abidjan sous CIF",
    productName: "Huile de palme",
    productCategory: "palm_oil",
    specification: "raffinee",
  };
  const palmSupplier = scoreIndustrialSupplierCapabilityMatch(
    {
      supplierStatus: "active",
      verificationStatus: "verified",
      categoryCodes: ["palm_oil"],
      capabilities: ["food commodity export"],
      industriesServed: ["food processing"],
      materialsHandled: ["refined palm oil"],
      email: "sales@example.test",
      verifiedAt: new Date(),
    },
    requirement,
  );
  const cncSupplier = scoreIndustrialSupplierCapabilityMatch(
    {
      supplierStatus: "active",
      verificationStatus: "verified",
      categoryCodes: ["spare_parts"],
      capabilities: ["CNC machining"],
      industriesServed: ["metal fabrication"],
      materialsHandled: ["steel"],
      email: "sales@example.test",
      verifiedAt: new Date(),
    },
    requirement,
  );

  assert.equal(palmSupplier.matchedCategory, true);
  assert.equal(palmSupplier.matchedMaterial, true);
  assert.ok(palmSupplier.score >= 70);
  assert.equal(cncSupplier.matchedCategory, false);
  assert.equal(cncSupplier.matchedMaterial, false);
  assert.equal(cncSupplier.relevanceScore, 0);
});

test("commercial pricing is calculated from reviewed costs on the server", () => {
  const pricing = calculateIndustrialCommercialPricing({
    supplierCosts: [50_000],
    additionalCosts: { logistics: 5_000 },
    customerPrice: 70_000,
  });

  assert.equal(pricing.supplierCost, 50_000);
  assert.equal(pricing.additionalCost, 5_000);
  assert.equal(pricing.totalCost, 55_000);
  assert.equal(pricing.internalMargin, 15_000);
  assert.equal(pricing.marginPercent, 21.429);
  assert.deepEqual(pricing.costStack, {
    supplier_cost: "50000.00",
    logistics: "5000.00",
    additional_cost: "5000.00",
    total_cost: "55000.00",
  });
});

test("commercial pricing refuses a loss-making or zero-margin offer", () => {
  assert.throws(
    () =>
      calculateIndustrialCommercialPricing({
        supplierCosts: [55_000],
        customerPrice: 55_000,
      }),
    /must exceed/i,
  );
});

test("customer quote snapshot excludes supplier cost and margin fields", () => {
  const snapshot = buildCustomerQuoteSnapshot({
    product: "Refined palm oil",
    specification: "Food grade",
    quantity: "20",
    unit: "tonnes",
    customerPrice: 70_000,
  });
  const serialized = JSON.stringify(snapshot);

  assert.deepEqual(snapshot, [
    {
      description: "Refined palm oil - Food grade",
      quantity: "20",
      unit: "tonnes",
      amount: "70000.00",
    },
  ]);
  assert.doesNotMatch(serialized, /supplier|cost|margin/i);
});

test("RFQ draft carries the requirement facts and a non-commitment disclaimer", () => {
  const message = buildIndustrialRfqMessage({
    language: "fr",
    supplierName: "Cooperative du Sud",
    referenceCode: "REQ-2026-0042",
    product: "Huile de palme raffinee",
    specification: "Qualite alimentaire",
    quantity: "20",
    unit: "tonnes",
    destination: "Abidjan",
    incoterm: "CIF",
    requiredBy: "30 septembre 2026",
  });

  assert.match(message, /REQ-2026-0042/);
  assert.match(message, /20 tonnes/);
  assert.match(message, /Abidjan/);
  assert.match(message, /CIF/);
  assert.match(message, /Exportunity étudie un besoin industriel documenté/);
  assert.match(message, /Équipe Sourcing Exportunity/);
  assert.match(message, /ne constitue ni une commande ni un engagement/i);
});

test("external communication remains disabled unless explicitly activated", () => {
  assert.equal(externalCommunicationsEnabled(undefined), false);
  assert.equal(externalCommunicationsEnabled("false"), false);
  assert.equal(externalCommunicationsEnabled("enabled"), false);
  assert.equal(externalCommunicationsEnabled("true"), true);
  assert.equal(externalCommunicationsEnabled("1"), true);
});

test("the outbound execution boundary includes meeting invitations", () => {
  assert.equal(isExternalCommunicationAction("SEND_EMAIL"), true);
  assert.equal(isExternalCommunicationAction("send_whatsapp"), true);
  assert.equal(isExternalCommunicationAction("SEND_MEETING_INVITE"), true);
  assert.equal(isExternalCommunicationAction("CREATE_MEETING_LINK"), false);
  assert.equal(isExternalCommunicationAction("CREATE_TASK"), false);
});
