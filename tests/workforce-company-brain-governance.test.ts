import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertWorkforceGovernanceReady,
  summarizeWorkforceGovernancePack,
} from "../server/lib/industrial/workforceGovernancePolicy";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

function contextPack(overrides: Record<string, unknown> = {}) {
  return {
    version: "company-brain-context-v1",
    contextPackId: 88,
    tenantId: 3,
    companyId: 7,
    agentId: 12,
    task: {
      key: "workforce.staffing:buyer:req-1",
      purpose: "internal",
      conversationId: null,
      correlationId: "correlation-1",
    },
    agent_identity: { agentId: 12, organizationKey: "tassi", role: "AI Chief of Staff", roleLevel: 5 },
    taskKey: "workforce.staffing:buyer:req-1",
    purpose: "internal",
    authority: { role: "AI Chief of Staff", decisionAuthority: "high", permissions: [] },
    company_charter: [],
    current_strategy: [],
    verified_facts: [],
    related_entities: [],
    relationship_history: [],
    project_or_opportunity_state: [],
    approved_playbooks: [],
    applicable_policies: [],
    available_tools: [],
    required_approvals: [{ action: "external_communication", requirement: "recorded_human_approval" }],
    known_conflicts: [],
    open_questions: [],
    source_citations: [{ sourceId: 1, sourceVersionId: 2, title: "Founder charter" }],
    freshness: {
      assembledAt: "2026-08-13T10:00:00.000Z",
      expiresAt: "2026-08-13T10:15:00.000Z",
    },
    redactions: [],
    claims: [],
    conflicts: [],
    citations: [{ sourceId: 1, sourceVersionId: 2, title: "Founder charter" }],
    assembledAt: "2026-08-13T10:00:00.000Z",
    expiresAt: "2026-08-13T10:15:00.000Z",
    ...overrides,
  } as any;
}

test("staffing governance freezes cited Company Brain context and passes only while fresh", () => {
  const snapshot = summarizeWorkforceGovernancePack(contextPack());
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.contextPackId, 88);
  assert.equal(snapshot.citationCount, 1);
  assert.equal(snapshot.externalActionsStarted, false);
  assert.doesNotThrow(() =>
    assertWorkforceGovernanceReady(snapshot, new Date("2026-08-13T10:10:00.000Z")),
  );
  assert.throws(
    () => assertWorkforceGovernanceReady(snapshot, new Date("2026-08-13T10:16:00.000Z")),
    /expired/i,
  );
});

test("staffing governance fails closed for missing citations, conflicts, and evidence questions", () => {
  const missingCitation = summarizeWorkforceGovernancePack(contextPack({ source_citations: [] }));
  assert.equal(missingCitation.status, "review_required");
  assert.throws(() => assertWorkforceGovernanceReady(missingCitation), /citation|evidence/i);

  const conflict = summarizeWorkforceGovernancePack(contextPack({
    known_conflicts: [{ claimId: 4, canonicalKey: "company.scope", type: "value_mismatch", summary: "Scope differs" }],
  }));
  assert.equal(conflict.status, "review_required");
  assert.throws(() => assertWorkforceGovernanceReady(conflict), /conflict/i);

  const openQuestion = summarizeWorkforceGovernancePack(contextPack({
    open_questions: [{ reason: "missing_evidence", claimId: 5, question: "Attach the strategy source" }],
  }));
  assert.equal(openQuestion.status, "review_required");
  assert.throws(() => assertWorkforceGovernanceReady(openQuestion), /evidence/i);
});

test("the staffing lifecycle preserves approval evidence and keeps execution gates separate", () => {
  const planner = read("server/lib/industrial/workforcePlanning.ts");
  const routes = read("server/routes/admin-agents-os.ts");
  const page = read("client/src/pages/AdminAgentsOsPage.tsx");

  assert.match(planner, /company_brain_context_pack_id/);
  assert.match(planner, /governance_snapshot/);
  assert.match(planner, /latestDemandSignal/);
  assert.match(routes, /assertWorkforceGovernanceReady/);
  assert.match(routes, /workforce-decision-v1/);
  assert.match(routes, /risk:[\s\S]{0,160}class: "L2"/);
  assert.match(routes, /roleSeatCreated/);
  assert.match(routes, /runtimeAgentsStarted: 0/);
  assert.match(routes, /productionEnabled: false/);
  assert.match(routes, /Re-review this staffing need with Company Brain evidence/);
  assert.match(page, /Decision rationale/);
  assert.match(page, /Approve role blueprint/);
  assert.match(page, /No employee is created, activated, or allowed to contact anyone/);
});
