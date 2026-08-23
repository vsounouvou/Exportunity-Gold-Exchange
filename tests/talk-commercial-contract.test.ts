import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const talkRoute = readFileSync(
  path.join(process.cwd(), "server/routes/talk.ts"),
  "utf8",
);

test("talk commerce records a reviewable requirement and a qualified CRM opportunity without claiming fulfillment", () => {
  assert.match(talkRoute, /status:\s*"submitted"/);
  assert.match(talkRoute, /nextStage:\s*"supplier_research_review"/);
  assert.match(talkRoute, /requiresHumanReview:\s*true/);
  assert.match(talkRoute, /action:\s*"CREATE_REQUIREMENT"/);
  assert.match(talkRoute, /action:\s*"UPDATE_REQUIREMENT"/);

  assert.match(talkRoute, /syncTalkCommercialCrm\(/);
  assert.match(talkRoute, /eventType:\s*"commercial_crm"/);
  assert.match(talkRoute, /syncQualifiedSourcingTask\(/);
  assert.match(talkRoute, /eventType:\s*"sourcing_review_task"/);
  assert.match(talkRoute, /syncVerifiedInternalSupplierCandidates\(/);
  assert.match(talkRoute, /eventType:\s*"supplier_candidate_screening"/);
  assert.match(talkRoute, /supplierIdentityPublic:\s*false/);
  assert.match(talkRoute, /externalDiscoveryStarted:\s*false/);
  assert.match(talkRoute, /quoteCreated:\s*false/);
  assert.match(talkRoute, /no supplier has been contacted/i);
  assert.match(talkRoute, /Supplier research and commercial review are still pending/);
  assert.doesNotMatch(talkRoute, /stage:\s*"won"/);
  assert.doesNotMatch(talkRoute, /executionStatus:\s*"fulfilled"/);
});

test("talk commerce preserves unknown currency and logs bounded retrieval evidence", () => {
  assert.match(talkRoute, /\(currency unspecified\)/);
  assert.doesNotMatch(talkRoute, /currency:\s*[^\n]*\|\|\s*["']USD["']/);
  assert.match(talkRoute, /eventType:\s*"commercial_retrieval"/);
  assert.match(talkRoute, /threshold:\s*commercialRetrieval\.threshold/);
  assert.match(talkRoute, /verifiedMatchCount:\s*commercialRetrieval\.verifiedMatchCount/);
  assert.match(talkRoute, /publicMatchCount:\s*commercialRetrieval\.publicMatchCount/);
});
