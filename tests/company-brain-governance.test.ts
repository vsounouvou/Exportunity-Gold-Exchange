import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  evaluateCompanyBrainClaimReview,
  isCompanyBrainEvidenceEligible,
} from "../server/lib/company-brain/governancePolicy";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

test("only active, clean, extracted supporting evidence is eligible for agent context", () => {
  const clean = {
    supportType: "supports",
    sourceStatus: "active",
    securityStatus: "clean",
    extractionStatus: "extracted",
    extractedText: "A verified supplier relationship is recorded in this source.",
  };
  assert.equal(isCompanyBrainEvidenceEligible(clean), true);
  assert.equal(isCompanyBrainEvidenceEligible({ ...clean, securityStatus: "quarantined" }), false);
  assert.equal(isCompanyBrainEvidenceEligible({ ...clean, securityStatus: "review_required" }), false);
  assert.equal(isCompanyBrainEvidenceEligible({ ...clean, sourceStatus: "deleted" }), false);
  assert.equal(isCompanyBrainEvidenceEligible({ ...clean, extractionStatus: "tombstone" }), false);
  assert.equal(isCompanyBrainEvidenceEligible({ ...clean, supportType: "contradicts" }), false);
  assert.equal(isCompanyBrainEvidenceEligible({ ...clean, extractedText: "" }), false);
});

test("external claim approval requires clean evidence, resolved conflicts, wording, and a pending human approval", () => {
  const evidence = [{
    supportType: "supports",
    sourceStatus: "active",
    securityStatus: "clean",
    extractionStatus: "manual",
    excerpt: "Founder-authorized company proposition.",
  }];
  const ready = evaluateCompanyBrainClaimReview({
    evidence,
    openConflictCount: 0,
    claimStatus: "verified_internal_only",
    approvedWording: "Approved public wording",
    pendingExternalApprovalCount: 1,
  });
  assert.equal(ready.canVerifyInternal, true);
  assert.equal(ready.canRequestExternalApproval, true);
  assert.equal(ready.canApproveExternal, true);

  assert.equal(evaluateCompanyBrainClaimReview({ ...readyInput(evidence), openConflictCount: 1 }).canApproveExternal, false);
  assert.equal(evaluateCompanyBrainClaimReview({ ...readyInput(evidence), approvedWording: "" }).canApproveExternal, false);
  assert.equal(evaluateCompanyBrainClaimReview({ ...readyInput(evidence), pendingExternalApprovalCount: 0 }).canApproveExternal, false);
  assert.equal(evaluateCompanyBrainClaimReview({ ...readyInput([]) }).canApproveExternal, false);
  assert.equal(evaluateCompanyBrainClaimReview({ ...readyInput(evidence), claimStatus: "proposed" }).canRequestExternalApproval, false);
});

test("the founder charter is internal, idempotent, and never publishes automatically", () => {
  const source = read("server/lib/company-brain/founderCharter.ts");
  const claimKeys = Array.from(source.matchAll(/canonicalKey:\s*"([^"]+)"/g), (match) => match[1]);
  assert.equal(new Set(claimKeys).size, claimKeys.length);
  assert.ok(claimKeys.includes("company.identity.strategic_proposition"));
  assert.ok(claimKeys.includes("company.policy.external_communications_default"));
  assert.match(source, /providerSourceId: FOUNDER_DIRECTIVE_SOURCE_ID/);
  assert.match(source, /status: "verified_internal_only"/);
  assert.doesNotMatch(source, /status: "approved_external"/);
  assert.match(source, /externalPublication: false/);
  assert.match(source, /founder_directive_mismatch/);
  assert.match(source, /supportType: "contradicts"/);
  assert.match(source, /conflictedClaims/);
  assert.match(source, /\.onConflictDoNothing\(\)/);
  assert.match(source, /pg_advisory_xact_lock/);
});

test("the Company Brain governance route is admin-only and audits every mutation class", () => {
  const route = read("server/routes/company-brain-governance.ts");
  assert.match(route, /router\.use\(ensureTenantAdmin\)/);
  assert.match(route, /sv\.source_id = s\.id/);
  assert.match(route, /bootstrap-founder-charter/);
  assert.match(route, /claim_verified_internal/);
  assert.match(route, /claim_external_approval_requested/);
  assert.match(route, /claim_approved_external/);
  assert.match(route, /claim_conflict_opened/);
  assert.match(route, /claim_conflict_resolved/);
  assert.match(route, /source_version_\$\{nextStatus\}/);
  assert.match(route, /Review notes are required/);
  assert.match(route, /as review_preview/);
  assert.match(route, /pg_advisory_xact_lock\(hashtext\('company_brain_external_approval'\)/);
  assert.match(route, /Explicit confirmation is required/);
});

test("the Workspace OAuth callback router is mounted before the authenticated governance router", () => {
  const routes = read("server/routes.ts");
  assert.ok(
    routes.indexOf('app.use("/api/admin/company-brain/workspace", companyBrainWorkspaceRouter)') <
      routes.indexOf('app.use("/api/admin/company-brain", companyBrainGovernanceRouter)'),
  );
});

test("context assembly requires an evidence version to belong to its cited source", () => {
  const assembler = read("server/lib/company-brain/contextAssembler.ts");
  assert.match(
    assembler,
    /eq\(companyBrainSourceVersions\.sourceId, companyBrainSources\.id\)/,
  );
  assert.match(assembler, /eq\(companyBrainSources\.tenantId, input\.tenantId\)/);
});

function readyInput(evidence: Parameters<typeof evaluateCompanyBrainClaimReview>[0]["evidence"]) {
  return {
    evidence,
    openConflictCount: 0,
    claimStatus: "verified_internal_only",
    approvedWording: "Approved public wording",
    pendingExternalApprovalCount: 1,
  };
}
