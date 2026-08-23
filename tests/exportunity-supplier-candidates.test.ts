import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { detectCommercialIntent } from "../server/lib/commercialIntentEngine";
import {
  buildSupplierCandidateScreeningPlan,
  EXPORTUNITY_SUPPLIER_CANDIDATE_THRESHOLD,
  rankVerifiedInternalSupplierCandidate,
} from "../server/lib/exportunity/supplierCandidatePolicy";

const palmOilIntent = detectCommercialIntent(
  "Je cherche 100 tonnes d'huile de palme raffinée à livrer à Abidjan.",
);

const requirement = {
  id: "84e587ca-a90a-4c82-9ccf-35fe279e6fd4",
  requirementType: "raw_material",
  categoryCode: "raw_materials",
  title: "Talk commercial request • palm oil",
  details: "palm oil | refined | to Abidjan | quantity 100 tonnes",
};

test("qualified Exportunity sourcing creates a governed internal screening plan", () => {
  const plan = buildSupplierCandidateScreeningPlan({
    tenantKey: "exportunity",
    crmStatus: "opportunity_opened",
    crmStage: "qualified",
    requirementId: requirement.id,
    productName: palmOilIntent.product?.name || null,
    sourcingTaskStatus: "review_task_ready",
    sourcingTaskId: 812,
    sourcingTaskPublicId: "INT-20260821-001",
  });

  assert.ok(plan);
  assert.equal(plan.threshold, EXPORTUNITY_SUPPLIER_CANDIDATE_THRESHOLD);
  assert.equal(plan.maximumCandidates, 20);
  assert.equal(
    plan.idempotencyKey,
    `exportunity:talk:supplier-screening:${requirement.id}`,
  );
  assert.deepEqual(plan.governance, {
    internalVerifiedSuppliersOnly: true,
    humanReviewRequired: true,
    supplierIdentityPublic: false,
    supplierContactAllowed: false,
    quoteCreationAllowed: false,
    externalDiscoveryAllowed: false,
  });
});

test("screening requires Exportunity, a qualified CRM opportunity, and a real governed task", () => {
  const base = {
    tenantKey: "exportunity",
    crmStatus: "opportunity_opened",
    crmStage: "qualified",
    requirementId: requirement.id,
    productName: "palm oil",
    sourcingTaskStatus: "review_task_ready",
    sourcingTaskId: 812,
    sourcingTaskPublicId: "INT-20260821-001",
  };

  assert.equal(
    buildSupplierCandidateScreeningPlan({ ...base, tenantKey: "mindbase" }),
    null,
  );
  assert.equal(
    buildSupplierCandidateScreeningPlan({ ...base, crmStage: "warm" }),
    null,
  );
  assert.equal(
    buildSupplierCandidateScreeningPlan({
      ...base,
      sourcingTaskStatus: "agent_assignment_missing",
    }),
    null,
  );
});

test("strict screening records a relevant verified refined-palm-oil supplier", () => {
  const ranked = rankVerifiedInternalSupplierCandidate({
    supplier: {
      id: "60d44576-b2ed-4bd1-a8f6-488315746cd3",
      legalName: "West Africa Edible Oils",
      displayName: "West Africa Edible Oils",
      supplierStatus: "active",
      verificationStatus: "verified",
      visibility: "exportunity_internal",
      categoryCodes: ["raw_materials"],
      capabilities: ["RBD refined palm oil for bulk export"],
      materialsHandled: ["Palm oil"],
      industriesServed: ["Food processing"],
      certifications: ["ISO 9001"],
    },
    requirement,
    intent: palmOilIntent,
  });

  assert.equal(ranked.eligible, true);
  assert.equal(ranked.productMatch, true);
  assert.equal(ranked.categoryMatch, true);
  assert.equal(ranked.specificationMatch, true);
  assert.equal(ranked.conflictingSpecification, false);
  assert.ok(ranked.relevanceScore >= EXPORTUNITY_SUPPLIER_CANDIDATE_THRESHOLD);
  assert.match(ranked.matchReason, /No outreach or quotation was created/);
});

test("strict screening rejects a broad-category supplier without product evidence", () => {
  const ranked = rankVerifiedInternalSupplierCandidate({
    supplier: {
      id: "0100d4bd-dff8-40e4-94c4-271552701feb",
      legalName: "Steel and Minerals Trading",
      displayName: "Steel and Minerals Trading",
      supplierStatus: "active",
      verificationStatus: "verified",
      visibility: "exportunity_internal",
      categoryCodes: ["raw_materials"],
      capabilities: ["Steel billet distribution"],
      materialsHandled: ["Steel", "aluminium"],
      industriesServed: ["Construction"],
    },
    requirement,
    intent: palmOilIntent,
  });

  assert.equal(ranked.eligible, true);
  assert.equal(ranked.categoryMatch, true);
  assert.equal(ranked.productMatch, false);
  assert.equal(ranked.relevanceScore, 0);
});

test("strict screening rejects explicit crude evidence for a refined requirement", () => {
  const ranked = rankVerifiedInternalSupplierCandidate({
    supplier: {
      id: "568df3ea-410a-418c-a50f-e8721ab3d41e",
      legalName: "CPO Export Cooperative",
      displayName: "CPO Export Cooperative",
      supplierStatus: "active",
      verificationStatus: "verified",
      visibility: "exportunity_internal",
      categoryCodes: ["raw_materials"],
      capabilities: ["Crude palm oil CPO export"],
      materialsHandled: ["Crude palm oil"],
      industriesServed: ["Edible oils"],
    },
    requirement,
    intent: palmOilIntent,
  });

  assert.equal(ranked.productMatch, true);
  assert.equal(ranked.conflictingSpecification, true);
  assert.equal(ranked.relevanceScore, 0);
});

test("persistence reuses canonical supplier-match and audit tables without outreach", () => {
  const source = readFileSync(
    path.join(
      process.cwd(),
      "server/lib/exportunity/supplierCandidateScreening.ts",
    ),
    "utf8",
  );

  assert.match(source, /industrialRequirementSupplierMatches/);
  assert.match(source, /industrialSupplierProfiles/);
  assert.match(source, /industrialAuditLogs/);
  assert.match(source, /onConflictDoNothing\(\)/);
  assert.match(
    source,
    /industrial_requirement_supplier_candidates\.screened/,
  );
  assert.match(source, /supplierIdentityExposed:\s*false/);
  assert.match(source, /outreachCreated:\s*false/);
  assert.match(source, /externalDiscoveryStarted:\s*false/);
  assert.match(source, /quoteCreated:\s*false/);
  assert.doesNotMatch(source, /sendContactNotification|sendMail|sendSms/);
  assert.doesNotMatch(source, /mindbase/i);
});
