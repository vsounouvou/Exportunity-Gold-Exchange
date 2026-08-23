import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import type { CommercialIntentResult } from "../server/lib/commercialIntentEngine";
import { projectCommercialCrmState } from "../server/lib/exportunity/commercialCrmPolicy";

function commercial(
  overrides: Partial<CommercialIntentResult> = {},
): CommercialIntentResult {
  return {
    intent: "source_product",
    confidence: 0.94,
    commercial: true,
    language: "en",
    product: {
      name: "refined palm oil",
      category: "palm oil",
      quantity: 20,
      unit: "t",
    },
    destination: "Cotonou, BJ",
    targetPrice: 900,
    missingFields: [],
    suggestedAction: "ACT",
    rationale: ["sourcing cue"],
    ...overrides,
  };
}

test("commercial CRM captures an anonymous lead before contact is supplied", () => {
  const projection = projectCommercialCrmState({
    commercial: commercial(),
    hasContact: false,
    requirementId: "84e587ca-a90a-4c82-9ccf-35fe279e6fd4",
    requirementReferenceCode: "TREQ-20260821-ABC123",
  });

  assert.equal(projection.leadStatus, "new");
  assert.equal(projection.shouldOpenOpportunity, false);
  assert.equal(projection.leadName, "Buyer inquiry • refined palm oil");
});

test("commercial CRM opens only a qualified opportunity after contact and requirement capture", () => {
  const projection = projectCommercialCrmState({
    commercial: commercial(),
    contactName: "Awa",
    hasContact: true,
    requirementId: "84e587ca-a90a-4c82-9ccf-35fe279e6fd4",
    requirementReferenceCode: "TREQ-20260821-ABC123",
  });

  assert.equal(projection.leadStatus, "qualified");
  assert.equal(projection.shouldOpenOpportunity, true);
  assert.equal(projection.opportunityReferenceCode, "OPP-TREQ-20260821-ABC123");
  assert.equal(projection.value, null);
  assert.equal(projection.currency, null);
});

test("a target unit price never becomes a fabricated deal value or currency", () => {
  const projection = projectCommercialCrmState({
    commercial: commercial({ targetPrice: 875, currency: undefined }),
    hasContact: true,
    requirementId: "84e587ca-a90a-4c82-9ccf-35fe279e6fd4",
    requirementReferenceCode: "TREQ-20260821-ABC123",
  });

  assert.equal(projection.value, null);
  assert.equal(projection.currency, null);
});

test("the migration extends existing CRM tables and remains Exportunity-native", () => {
  const migration = readFileSync(
    path.join(
      process.cwd(),
      "db/migrations/20260821_exportunity_commercial_crm_links.sql",
    ),
    "utf8",
  );
  const repository = readFileSync(
    path.join(process.cwd(), "server/lib/exportunity/commercialCrm.ts"),
    "utf8",
  );

  assert.match(migration, /ALTER TABLE sales_leads/i);
  assert.match(migration, /ALTER TABLE deals/i);
  assert.match(migration, /industrial_requirement_id/i);
  assert.match(migration, /source_chat_lead_id/i);
  assert.doesNotMatch(migration, /CREATE TABLE\s+commercial_opportunities/i);
  assert.doesNotMatch(`${migration}\n${repository}`, /mindbase/i);
  assert.match(repository, /value:\s*projection\.value/);
  assert.match(repository, /currency:\s*projection\.currency/);
});
