import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluateInterviewReadiness,
  evaluateRenderPreparation,
  evaluateStudioProjectReadiness,
  MEDIA_FACT_STATUSES,
  MEDIA_INTERVIEW_MODES,
  MEDIA_RENDER_OUTPUT_FORMATS,
  MEDIA_RENDER_STATUSES,
  MEDIA_STUDIO_PROJECT_STATUSES,
  sanitizeMediaStudioEvidence,
} from "../server/lib/territory-media/mediaStudioPolicy";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const consentedPublicSession = {
  intervieweeName: "Ada Producer",
  intervieweeRole: "Managing Director",
  organizationName: "Example Cooperative",
  intendedUses: ["organic_publication", "sales"],
  recordingConsentStatus: "granted",
  publicationConsentStatus: "granted",
  aiProcessingConsentStatus: "granted",
  consentEvidence: { explanationReference: "consent-form:2026-08-17:ada" },
};

const documentClaim = {
  id: "claim-1",
  factStatus: "SUPPORTED_BY_DOCUMENT",
  isMaterial: true,
  evidenceReferences: ["inspection-report:42"],
  evidence: {},
};

test("the directive vocabularies remain exact and provider-neutral", () => {
  assert.deepEqual(MEDIA_FACT_STATUSES, [
    "VERIFIED",
    "SUPPORTED_BY_DOCUMENT",
    "PRODUCER_CLAIM",
    "CREATOR_CLAIM",
    "INFERENCE",
    "UNVERIFIED",
    "OUTDATED",
  ]);
  assert.equal(MEDIA_INTERVIEW_MODES.length, 7);
  assert.ok(MEDIA_INTERVIEW_MODES.includes("guided_self_recording"));
  assert.ok(MEDIA_STUDIO_PROJECT_STATUSES.includes("awaiting_producer_consent"));
  assert.deepEqual(MEDIA_RENDER_STATUSES.slice(0, 2), ["prepared", "provider_submission_approved"]);
  assert.ok(MEDIA_RENDER_OUTPUT_FORMATS.includes("long_form_interview"));
  assert.ok(MEDIA_RENDER_OUTPUT_FORMATS.includes("subtitle_file"));
});

test("credential-shaped interview and asset evidence is detected and removed from the safe copy", () => {
  const result = sanitizeMediaStudioEvidence({
    sourceReference: "drive-file:123",
    nested: {
      access_token: "provider-secret-token",
      note: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
    },
  });
  assert.equal(result.containsCredentials, true);
  assert.equal(result.credentialsStored, false);
  assert.ok(result.redactedPaths.includes("nested.access_token"));
  const serialized = JSON.stringify(result.sanitized);
  assert.doesNotMatch(serialized, /provider-secret-token/);
  assert.doesNotMatch(serialized, /abcdefghijklmnopqrstuvwxyz/);
  assert.match(serialized, /\[REDACTED\]/);
});

test("interview review and production gates preserve consent and material fact truth", () => {
  const ready = evaluateInterviewReadiness({ session: consentedPublicSession, claims: [documentClaim] });
  assert.equal(ready.reviewReady, true);
  assert.equal(ready.productionReady, true);

  const producerClaim = evaluateInterviewReadiness({
    session: consentedPublicSession,
    claims: [{ ...documentClaim, factStatus: "PRODUCER_CLAIM", evidenceReferences: [] }],
  });
  assert.equal(producerClaim.reviewReady, true);
  assert.equal(producerClaim.productionReady, false);
  assert.ok(producerClaim.productionBlockers.includes("claim:claim-1:material_producer_claim_not_publishable"));

  const noPublicationConsent = evaluateInterviewReadiness({
    session: { ...consentedPublicSession, publicationConsentStatus: "pending" },
    claims: [documentClaim],
  });
  assert.equal(noPublicationConsent.reviewReady, true);
  assert.equal(noPublicationConsent.productionReady, false);
  assert.ok(noPublicationConsent.productionBlockers.includes("publication_consent_required_for_intended_use"));
});

test("VERIFIED means accountable verifier, time, and evidence rather than a label alone", () => {
  const labelOnly = evaluateInterviewReadiness({
    session: consentedPublicSession,
    claims: [{ ...documentClaim, factStatus: "VERIFIED", evidenceReferences: [], evidence: {} }],
  });
  assert.equal(labelOnly.productionReady, false);
  assert.ok(labelOnly.productionBlockers.includes("claim:claim-1:verification_evidence_required"));

  const evidenced = evaluateInterviewReadiness({
    session: consentedPublicSession,
    claims: [{
      ...documentClaim,
      factStatus: "VERIFIED",
      evidenceReferences: [],
      verifiedByUserId: 12,
      verifiedAt: "2026-08-17T12:00:00.000Z",
      evidence: { reference: "qa-review:12" },
    }],
  });
  assert.equal(evidenced.productionReady, true);
});

test("studio approval fails closed on rights, takedowns, asset consent, and credential material", () => {
  const base = {
    project: { status: "compliance_review", sourceReferenceId: 1, rightsGrantId: 2 },
    interview: { status: "approved", readiness: { productionReady: true, productionBlockers: [] } },
    sourceReference: { id: 1, sourceUrl: "https://example.test/source", reuseStatus: "rights_granted", takedownState: "clear" },
    rightsGrant: {
      id: 2,
      status: "granted",
      producerConsentStatus: "granted",
      subjectReleaseStatus: "granted",
      musicLicenseStatus: "not_required",
      evidence: { grantReference: "release:22" },
    },
    assets: [{
      id: "asset-1",
      assetRole: "interview_recording",
      storageReference: "media://interviews/source.mp4",
      originalSource: "field-recording:22",
      ownerName: "Example Cooperative",
      rightsStatus: "granted",
      subjectConsentStatus: "granted",
      musicLicenseStatus: "not_applicable",
      takedownState: "clear",
      metadata: { provenanceReference: "camera-card:2" },
    }],
  };
  assert.equal(evaluateStudioProjectReadiness(base).readyForApproval, true);

  const blocked = evaluateStudioProjectReadiness({
    ...base,
    sourceReference: { ...base.sourceReference, takedownState: "requested" },
    assets: [{ ...base.assets[0], subjectConsentStatus: "pending", metadata: { api_key: "secret" } }],
  });
  assert.equal(blocked.readyForApproval, false);
  assert.ok(blocked.blockers.includes("source_takedown_or_dispute_active"));
  assert.ok(blocked.blockers.includes("asset:asset-1:subject_consent_not_cleared"));
  assert.ok(blocked.blockers.includes("asset:asset-1:credential_material_forbidden"));
});

test("render preparation can only truthfully return prepared with no provider execution", () => {
  const gate = evaluateRenderPreparation({
    project: { status: "approved" },
    version: { status: "approved", contentHash: "abc123" },
    projectReadiness: { readyForApproval: true, blockers: [] },
    outputFormat: "vertical_9_16",
    inputAssetHashes: ["a".repeat(64)],
  });
  assert.equal(gate.ready, true);
  assert.equal(gate.renderStatus, "prepared");
  assert.equal(gate.externalRenderExecuted, false);
  assert.equal(gate.providerSubmissionExecuted, false);
  assert.equal(gate.providerJobReference, null);

  const blocked = evaluateRenderPreparation({
    project: { status: "compliance_review" },
    version: { status: "review_required", contentHash: null },
    projectReadiness: { readyForApproval: false, blockers: ["rights_grant_expired"] },
    outputFormat: "feature_3m",
    inputAssetHashes: [],
  });
  assert.equal(blocked.ready, false);
  assert.ok(blocked.blockers.includes("approved_project_required"));
  assert.ok(blocked.blockers.includes("project:rights_grant_expired"));
  assert.equal(blocked.externalRenderExecuted, false);
});

test("schema, migration, runtime parity, Action Runs, tenant routes, UI, and docs stay connected", async () => {
  const [schema, migration, ensure, service, routes, actions, app, nav, ui, docs] = await Promise.all([
    read("db/schema/media-studio.ts"),
    read("db/migrations/20270419_exportunity_media_interview_studio.sql"),
    read("server/lib/territory-media/ensureMediaStudioTables.ts"),
    read("server/lib/territory-media/mediaStudio.ts"),
    read("server/routes/admin-marketing.ts"),
    read("server/lib/actions/actionDefinitions.ts"),
    read("client/src/App.tsx"),
    read("client/src/lib/adminNavRegistry.ts"),
    read("client/src/pages/AdminMediaStudioPage.tsx"),
    read("docs/territory-media-commerce/04-interview-and-studio-workflow.md"),
  ]);

  const tables = [
    "media_interview_sessions",
    "media_interview_claims",
    "media_interview_events",
    "media_studio_projects",
    "media_studio_assets",
    "media_studio_versions",
    "media_render_jobs",
    "media_studio_events",
  ];
  for (const table of tables) {
    assert.match(schema, new RegExp(`"${table}"`));
    assert.match(migration, new RegExp(table));
    assert.match(ensure, new RegExp(table));
  }
  assert.match(migration, /prevent_media_studio_event_mutation/);
  assert.match(migration, /media_render_jobs_submission_truth_check/);
  assert.match(service, /status: "paused"/);
  assert.match(service, /budgetUsdCap: "0\.00"/);
  assert.match(service, /externalActionsForbidden: true/);
  assert.match(service, /status: "prepared"/);
  assert.match(service, /providerJobReference: null/);
  assert.doesNotMatch(service, /messages\.create|calls\.create|verifications\.create/);
  for (const path of [
    "/marketing/studio/workspace",
    "/marketing/studio/interviews",
    "/marketing/studio/projects",
    "/marketing/studio/renders/prepare",
  ]) assert.match(routes, new RegExp(path.replace(/\//g, "\\/")));
  for (const key of ["MEDIA_INTERVIEW_PREPARE", "MEDIA_INTERVIEW_REVIEW", "MEDIA_STUDIO_PROJECT_PREPARE", "MEDIA_RENDER_PREPARE"]) {
    assert.match(actions, new RegExp(key));
  }
  assert.match(app, /path="\/admin\/media\/studio"/);
  assert.match(nav, /Interview & Media Studio/);
  assert.match(ui, /A prepared render is not a rendered asset/);
  assert.match(ui, /never asks for credentials/i);
  assert.match(docs, /provider adapter is intentionally absent/i);
});
