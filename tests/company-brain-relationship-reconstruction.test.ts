import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildRelationshipCandidate,
  RELATIONSHIP_RECONSTRUCTION_MODE,
  summarizeRelationshipCandidates,
} from "../server/lib/company-brain/relationshipReconstruction";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
const now = new Date("2026-08-14T12:00:00.000Z");

test("relationship reconstruction remains read-only and blocks external communication", () => {
  const candidate = buildRelationshipCandidate({
    id: "requirement:req-1",
    kind: "stalled_requirement",
    title: "Refined palm oil",
    organization: "Buyer SA",
    stage: "supplier_matching",
    lastActivityAt: "2026-07-01T09:00:00.000Z",
    facts: ["The recorded requirement remains open."],
    evidence: [{ entityType: "industrial_requirement", entityId: "req-1", label: "REQ-001" }],
    consentStatus: "opt_in",
    commercialEvidenceCount: 2,
  }, now);

  assert.equal(RELATIONSHIP_RECONSTRUCTION_MODE, "read_only");
  assert.equal(candidate.restrictions.externalCommunicationAllowed, false);
  assert.ok(candidate.restrictions.blockers.includes("human_approval_required"));
  assert.match(candidate.recommendedAction, /Review the requirement evidence/);
  assert.doesNotMatch(candidate.recommendedAction, /send|contact now|message now/i);
  assert.equal(candidate.evidence[0]?.entityId, "req-1");
});

test("do-not-contact and opt-out records are always restricted", () => {
  const candidate = buildRelationshipCandidate({
    id: "email-thread:42",
    kind: "awaiting_email_reply",
    title: "Previous proposal",
    lastActivityAt: "2026-01-01T00:00:00.000Z",
    facts: ["The latest stored message is a sent outbound email."],
    evidence: [{ entityType: "email_thread", entityId: "42", label: "Recorded email thread" }],
    consentStatus: "opt_out",
    isDnc: false,
  }, now);

  assert.equal(candidate.priority, "restricted");
  assert.equal(candidate.restrictions.isDnc, true);
  assert.ok(candidate.restrictions.blockers.includes("do_not_contact"));
  assert.match(candidate.recommendedAction, /External contact is prohibited/);
});

test("relationship summaries preserve candidate kinds without inventing records", () => {
  const stalled = buildRelationshipCandidate({
    id: "requirement:req-2",
    kind: "stalled_requirement",
    title: "Bearing requirement",
    facts: ["The requirement remains submitted."],
    evidence: [{ entityType: "industrial_requirement", entityId: "req-2", label: "REQ-002" }],
  }, now);
  const dormant = buildRelationshipCandidate({
    id: "factory-relationship:rel-1",
    kind: "dormant_factory_relationship",
    title: "Factory relationship review",
    facts: ["The relationship record is marked dormant."],
    evidence: [{ entityType: "industrial_factory_relationship", entityId: "rel-1", label: "Relationship record" }],
  }, now);

  const summary = summarizeRelationshipCandidates([stalled, dormant]);
  assert.equal(summary.total, 2);
  assert.equal(summary.byKind.stalled_requirement, 1);
  assert.equal(summary.byKind.dormant_factory_relationship, 1);
  assert.equal(summary.byKind.awaiting_email_reply, 0);
});

test("the admin route reconstructs only from canonical records and exposes no send mutation", () => {
  const route = read("server/routes/company-brain-governance.ts");
  const page = read("client/src/pages/AdminCompanyBrainPage.tsx");
  const start = route.indexOf('router.get("/relationship-reconstruction"');
  const end = route.indexOf('router.get("/sources"', start);
  const reconstructionRoute = route.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(reconstructionRoute, /from industrial_requirements/);
  assert.match(reconstructionRoute, /from industrial_factory_relationships/);
  assert.match(reconstructionRoute, /from email_messages/);
  assert.match(reconstructionRoute, /from chat_leads/);
  assert.match(reconstructionRoute, /externalCommunicationAllowed: false/);
  assert.doesNotMatch(reconstructionRoute, /router\.(post|put|patch|delete)/);
  assert.doesNotMatch(reconstructionRoute, /\b(insert into|update|delete from)\b/i);
  assert.match(page, /Relationship intelligence/);
  assert.match(page, /External communication disabled/);
});
