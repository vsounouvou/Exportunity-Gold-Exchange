import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  assessSupplierDiscoveryRelevance,
  EXPORTUNITY_DISCOVERY_MINIMUM_RELEVANCE,
  parseSupplierDiscoveryIntake,
  parseSupplierDiscoveryReview,
  SupplierDiscoveryPolicyError,
} from "../server/lib/exportunity/supplierDiscoveryPolicy";

const requirementId = "84e587ca-a90a-4c82-9ccf-35fe279e6fd4";

function validPayload() {
  return {
    requirementId,
    company: {
      name: "West Africa Edible Oils SA",
      website: "https://www.example-oils.test/products/refined-palm-oil",
      city: "San-Pedro",
      countryCode: "CI",
      primaryIndustry: "Refined palm oil production",
    },
    relevance: {
      score: 86,
      rationale:
        "The retrieved company page explicitly describes bulk RBD refined palm oil production.",
    },
    source: {
      type: "official_website",
      name: "West Africa Edible Oils product page",
      url: "https://www.example-oils.test/products/refined-palm-oil#bulk",
      retrievedAt: "2026-08-21T01:15:00.000Z",
      contentHash: "a".repeat(64),
      evidence: {
        summary: "Producer of RBD refined palm oil for bulk food-industry buyers.",
        excerpt: "RBD refined palm oil is available in bulk export formats.",
        signals: ["RBD refined palm oil", "bulk export"],
      },
    },
  };
}

test("discovery intake requires bounded provenance and creates a stable company identity", () => {
  const first = parseSupplierDiscoveryIntake(validPayload());
  const second = parseSupplierDiscoveryIntake(validPayload());
  const differentCompanyPayload = validPayload();
  differentCompanyPayload.company.name = "Another Company On A Shared Directory";
  const differentCompany = parseSupplierDiscoveryIntake(
    differentCompanyPayload,
  );

  assert.equal(first.requirementId, requirementId);
  assert.equal(first.candidateKey, second.candidateKey);
  assert.notEqual(first.candidateKey, differentCompany.candidateKey);
  assert.match(first.candidateKey, /^discovery:[a-f0-9]{64}$/);
  assert.equal(first.company.countryCode, "CI");
  assert.equal(first.company.normalizedName, "west africa edible oils sa");
  assert.equal(first.source.contentHash, "a".repeat(64));
  assert.equal(
    first.source.url,
    "https://www.example-oils.test/products/refined-palm-oil",
  );
  assert.equal(
    first.relevance.score >= EXPORTUNITY_DISCOVERY_MINIMUM_RELEVANCE,
    true,
  );
});

test("official product evidence passes strict relevance screening", () => {
  const candidate = parseSupplierDiscoveryIntake(validPayload());
  const result = assessSupplierDiscoveryRelevance({
    productName: "palm oil",
    specification: "refined RBD",
    candidate,
  });

  assert.equal(result.productMatch, true);
  assert.equal(result.conflictingSpecification, false);
  assert.deepEqual(result.productTokens, ["palm", "oil"]);
  assert.match(result.evidenceFingerprint, /^[a-f0-9]{64}$/);
});

test("irrelevant CAD evidence cannot be attached to a palm-oil requirement", () => {
  const payload = validPayload();
  payload.company.primaryIndustry = "Computer-aided design software";
  payload.source.evidence = {
    summary: "Cloud CAD and 3D product-design software for engineering teams.",
    excerpt: "Create mechanical drawings and product assemblies online.",
    signals: ["CAD software", "3D modelling"],
  };
  const candidate = parseSupplierDiscoveryIntake(payload);

  assert.throws(
    () =>
      assessSupplierDiscoveryRelevance({
        productName: "palm oil",
        specification: "refined",
        candidate,
      }),
    (error: unknown) =>
      error instanceof SupplierDiscoveryPolicyError &&
      error.code === "DISCOVERY_IRRELEVANT_CANDIDATE",
  );
});

test("crude-only evidence cannot satisfy a refined palm-oil requirement", () => {
  const payload = validPayload();
  payload.company.primaryIndustry = "Crude palm oil production";
  payload.source.evidence = {
    summary: "CPO crude palm oil producer and exporter.",
    excerpt: "Bulk crude palm oil only.",
    signals: ["crude palm oil", "CPO"],
  };
  const candidate = parseSupplierDiscoveryIntake(payload);

  assert.throws(
    () =>
      assessSupplierDiscoveryRelevance({
        productName: "palm oil",
        specification: "refined RBD",
        candidate,
      }),
    /conflicts with the requested product specification/,
  );
});

test("a URL alone is not provenance and a weak score is rejected", () => {
  const missingHash = validPayload();
  missingHash.source.contentHash = "";
  assert.throws(
    () => parseSupplierDiscoveryIntake(missingHash),
    /SHA-256 hex digest/,
  );

  const weak = validPayload();
  weak.relevance.score = EXPORTUNITY_DISCOVERY_MINIMUM_RELEVANCE - 1;
  assert.throws(
    () => parseSupplierDiscoveryIntake(weak),
    new RegExp(`integer from ${EXPORTUNITY_DISCOVERY_MINIMUM_RELEVANCE} to 100`),
  );
});

test("human review cannot claim verification or skip the governed transition", () => {
  assert.deepEqual(
    parseSupplierDiscoveryReview({
      currentStatus: "discovered",
      nextStatus: "under_review",
      notes: "Identity and provenance review started.",
    }),
    {
      nextStatus: "under_review",
      notes: "Identity and provenance review started.",
    },
  );
  assert.throws(
    () =>
      parseSupplierDiscoveryReview({
        currentStatus: "discovered",
        nextStatus: "verification_pending",
        notes: "Skip review",
      }),
    /Cannot move a discovery candidate/,
  );
  assert.throws(
    () =>
      parseSupplierDiscoveryReview({
        currentStatus: "under_review",
        nextStatus: "verified",
        notes: "Pretend this is verified",
      }),
    /under_review, verification_pending, or rejected/,
  );
  assert.throws(
    () =>
      parseSupplierDiscoveryReview({
        currentStatus: "promoted",
        nextStatus: "under_review",
        notes: "Attempt to reopen an immutable promotion",
      }),
    /Cannot move a discovery candidate from promoted/,
  );
});

test("persistence and routes enforce an Exportunity-only no-outreach evidence queue", () => {
  const service = readFileSync(
    path.join(process.cwd(), "server/lib/exportunity/supplierDiscovery.ts"),
    "utf8",
  );
  const route = readFileSync(
    path.join(
      process.cwd(),
      "server/routes/exportunity-supplier-discovery.ts",
    ),
    "utf8",
  );
  const migration = readFileSync(
    path.join(
      process.cwd(),
      "db/migrations/20270330_exportunity_supplier_discovery.sql",
    ),
    "utf8",
  );
  const registry = readFileSync(
    path.join(process.cwd(), "server/lib/actions/actionRegistry.ts"),
    "utf8",
  );

  assert.match(service, /industrialFactoryLeads/);
  assert.match(service, /industrialRequirementDiscoveryCandidates/);
  assert.match(service, /industrialDiscoveryEvidence/);
  assert.match(service, /onConflictDoNothing\(\)/);
  assert.match(service, /verificationState: "unverified"/);
  assert.match(service, /supplierProfileCreated: false/);
  assert.match(service, /outreachAllowed: false/);
  assert.match(service, /outreachCreated: false/);
  assert.doesNotMatch(service, /sendMail|sendSms|sendWhatsApp|fetch\(/);
  assert.doesNotMatch(service, /industrialSupplierProfiles/);
  assert.doesNotMatch(service, /mindbase/i);

  assert.match(route, /ensureTenantStaff/);
  assert.match(route, /ensureTenantAdmin/);
  assert.match(route, /SUPPLIER_DISCOVERY_RECORD/);
  assert.match(route, /SUPPLIER_DISCOVERY_REVIEW/);
  assert.match(registry, /requiresEvidence: true/);

  assert.match(migration, /industrial_discovery_evidence/);
  assert.match(migration, /content_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /contact_status = 'not_contacted'/);
  assert.match(migration, /outreach_allowed = false/);
  assert.match(migration, /human_approval_required = true/);
});
