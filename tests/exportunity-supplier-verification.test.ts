import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  assessSupplierPromotionEvidence,
  EXPORTUNITY_SUPPLIER_VERIFICATION_SCOPE,
  parseSupplierPromotionDecision,
  SupplierVerificationPolicyError,
} from "../server/lib/exportunity/supplierVerificationPolicy";

const candidateId = "84e587ca-a90a-4c82-9ccf-35fe279e6fd4";
const registryEvidenceId = "71e090d4-1027-4ca7-9c1b-f10f8af1acc1";
const contactEvidenceId = "03bfb7f8-b1c2-4768-9bd8-845749087178";

function validDecision() {
  return {
    candidateId,
    legalName: "West Africa Edible Oils SA",
    countryCode: "CI",
    selectedEvidenceIds: [registryEvidenceId, contactEvidenceId],
    officialEvidenceId: registryEvidenceId,
    contactEvidenceId,
    contact: {
      type: "website",
      value: "https://supplier.example",
    },
    checklist: {
      legalIdentityConfirmed: true,
      countryOfRegistrationConfirmed: true,
      requirementProductRelevanceConfirmed: true,
      publicBusinessContactConfirmed: true,
      evidenceReviewedByHuman: true,
      noOutreachAuthorized: true,
    },
    decisionNotes:
      "Government registry identity and official company website were reviewed against the palm-oil requirement.",
  };
}

function validEvidence() {
  return [
    {
      id: registryEvidenceId,
      sourceType: "government_registry",
      sourceUrl: "https://registry.example/entities/waeo-7788",
      retrievedAt: "2026-08-20T10:00:00.000Z",
      contentHash: "a".repeat(64),
      evidence: {
        summary:
          "West Africa Edible Oils SA is an active registered edible-oils manufacturer.",
        registryNumber: "WAEO-7788",
        signals: ["refined palm oil"],
      },
    },
    {
      id: contactEvidenceId,
      sourceType: "official_website",
      sourceUrl: "https://supplier.example/contact",
      retrievedAt: "2026-08-20T10:05:00.000Z",
      contentHash: "b".repeat(64),
      evidence: {
        summary:
          "Official West Africa Edible Oils SA contact page and refined palm-oil product catalogue.",
        signals: ["RBD palm oil", "bulk export"],
      },
    },
  ];
}

test("promotion decision requires explicit bounded human attestations", () => {
  const parsed = parseSupplierPromotionDecision(validDecision());

  assert.equal(parsed.candidateId, candidateId);
  assert.equal(parsed.normalizedLegalName, "west africa edible oils sa");
  assert.equal(parsed.countryCode, "CI");
  assert.equal(parsed.verificationScope, EXPORTUNITY_SUPPLIER_VERIFICATION_SCOPE);
  assert.equal(parsed.contact.value, "https://supplier.example");
  assert.equal(parsed.checklist.noOutreachAuthorized, true);

  const missingAttestation = validDecision();
  missingAttestation.checklist.noOutreachAuthorized = false;
  assert.throws(
    () => parseSupplierPromotionDecision(missingAttestation),
    /noOutreachAuthorized must be explicitly confirmed/,
  );

  const reusedEvidence = validDecision();
  reusedEvidence.contactEvidenceId = registryEvidenceId;
  assert.throws(
    () => parseSupplierPromotionDecision(reusedEvidence),
    /require two different official evidence snapshots/,
  );
});

test("fresh registry identity plus a separate official contact can support promotion", () => {
  const decision = parseSupplierPromotionDecision(validDecision());
  const assessment = assessSupplierPromotionEvidence({
    decision,
    evidence: validEvidence(),
    now: new Date("2026-08-21T12:00:00.000Z"),
  });

  assert.equal(assessment.evidenceCount, 2);
  assert.equal(assessment.registryNumber, "WAEO-7788");
  assert.deepEqual(assessment.contentHashes, ["a".repeat(64), "b".repeat(64)]);
});

test("search results, stale snapshots, and unsupported contacts cannot verify a supplier", () => {
  const decision = parseSupplierPromotionDecision(validDecision());
  const searchEvidence = validEvidence();
  searchEvidence[0].sourceType = "search_result";
  assert.throws(
    () =>
      assessSupplierPromotionEvidence({
        decision,
        evidence: searchEvidence,
        now: new Date("2026-08-21T12:00:00.000Z"),
      }),
    /must be a government_registry snapshot/,
  );

  const staleEvidence = validEvidence();
  staleEvidence[0].retrievedAt = "2025-01-01T00:00:00.000Z";
  assert.throws(
    () =>
      assessSupplierPromotionEvidence({
        decision,
        evidence: staleEvidence,
        now: new Date("2026-08-21T12:00:00.000Z"),
      }),
    /is stale or has an invalid retrieval time/,
  );

  const duplicatedSource = validEvidence();
  duplicatedSource[1].sourceUrl = duplicatedSource[0].sourceUrl;
  assert.throws(
    () =>
      assessSupplierPromotionEvidence({
        decision,
        evidence: duplicatedSource,
        now: new Date("2026-08-21T12:00:00.000Z"),
      }),
    /two distinct source URLs and content snapshots/,
  );

  const unsupportedContact = validDecision();
  unsupportedContact.contact.value = "https://unrelated.example";
  assert.throws(
    () =>
      assessSupplierPromotionEvidence({
        decision: parseSupplierPromotionDecision(unsupportedContact),
        evidence: validEvidence(),
        now: new Date("2026-08-21T12:00:00.000Z"),
      }),
    /does not support the confirmed business contact/,
  );
});

test("promotion persistence is Exportunity-only, private, idempotent, and outbound-free", () => {
  const service = readFileSync(
    path.join(process.cwd(), "server/lib/exportunity/supplierVerification.ts"),
    "utf8",
  );
  const route = readFileSync(
    path.join(process.cwd(), "server/routes/exportunity-supplier-discovery.ts"),
    "utf8",
  );
  const migration = readFileSync(
    path.join(
      process.cwd(),
      "db/migrations/20270410_exportunity_supplier_verification.sql",
    ),
    "utf8",
  );
  const registry = readFileSync(
    path.join(process.cwd(), "server/lib/actions/actionRegistry.ts"),
    "utf8",
  );
  const ensureTables = readFileSync(
    path.join(process.cwd(), "server/lib/industrial/ensureTables.ts"),
    "utf8",
  );
  const discoveryService = readFileSync(
    path.join(process.cwd(), "server/lib/exportunity/supplierDiscovery.ts"),
    "utf8",
  );
  const adminPage = readFileSync(
    path.join(
      process.cwd(),
      "client/src/pages/AdminExportunitySupplierDiscoveryPage.tsx",
    ),
    "utf8",
  );

  assert.match(service, /industrialSupplierPromotions/);
  assert.match(service, /industrialSupplierProfiles/);
  assert.match(service, /industrialRequirementSupplierMatches/);
  assert.match(service, /supplierStatus: "active"/);
  assert.match(service, /verificationStatus: "verified"/);
  assert.match(service, /visibility: "exportunity_internal"/);
  assert.match(service, /status: "promoted"/);
  assert.match(service, /city: null/);
  assert.match(service, /address: null/);
  assert.match(service, /onConflictDoNothing\(\)/);
  assert.match(service, /outreachAllowed: false/);
  assert.match(service, /rfqCreated: false/);
  assert.match(service, /capacityVerified: false/);
  assert.match(service, /certificationVerified: false/);
  assert.doesNotMatch(
    service,
    /sendMail|sendSms|sendWhatsApp|twilio|nodemailer|fetch\(/i,
  );
  assert.doesNotMatch(service, /mindbase/i);

  assert.match(route, /ensureTenantAdmin/);
  assert.match(route, /SUPPLIER_VERIFICATION_APPROVE/);
  assert.match(registry, /SUPPLIER_VERIFICATION_APPROVE/);
  assert.match(registry, /approvalRequired: true, requiresEvidence: true/);

  assert.match(migration, /industrial_supplier_promotions/);
  assert.match(migration, /ADD VALUE IF NOT EXISTS 'promoted'/);
  assert.match(migration, /government_registry|official_evidence_id/);
  assert.match(migration, /jsonb_array_length\(evidence_ids\) BETWEEN 2 AND 10/);
  assert.match(migration, /official_evidence_id <> contact_evidence_id/);
  assert.match(migration, /noOutreachAuthorized/);
  assert.match(migration, /outreach_allowed = false/);
  assert.match(ensureTables, /CREATE TABLE IF NOT EXISTS industrial_supplier_promotions/);
  assert.match(discoveryService, /DISCOVERY_CANDIDATE_ALREADY_PROMOTED/);
  assert.match(discoveryService, /promotionByCandidate/);

  assert.match(adminPage, /Human supplier verification and promotion/);
  assert.match(adminPage, /This decision does not authorize outreach or an RFQ/);
  assert.match(adminPage, /Government registry number/);
  assert.doesNotMatch(adminPage, /mindbase/i);
});
