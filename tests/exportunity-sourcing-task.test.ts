import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildQualifiedSourcingTaskPlan } from "../server/lib/exportunity/sourcingTaskPolicy";

const qualifiedInput = {
  tenantKey: "exportunity",
  crmStatus: "opportunity_opened",
  crmStage: "qualified",
  chatLeadId: "lead-123",
  commercialLeadId: 41,
  opportunityId: 73,
  opportunityReferenceCode: "OPP-TREQ-20260821-ABC123",
  requirementId: "84e587ca-a90a-4c82-9ccf-35fe279e6fd4",
  requirementReferenceCode: "TREQ-20260821-ABC123",
};

test("a qualified Exportunity opportunity creates a zero-budget review-only sourcing plan", () => {
  const plan = buildQualifiedSourcingTaskPlan(qualifiedInput);

  assert.ok(plan);
  assert.equal(plan.moduleId, "industrial_sourcing");
  assert.equal(plan.initialState, "CREATED");
  assert.equal(plan.tokenBudget, 0);
  assert.equal(plan.managerAgentKey, "commercial");
  assert.equal(plan.executionAgentKey, "sourcing");
  assert.equal(
    plan.idempotencyKey,
    "exportunity:talk:sourcing-review:84e587ca-a90a-4c82-9ccf-35fe279e6fd4",
  );
  assert.match(plan.instruction, /verified internal supplier registry/i);
  assert.match(plan.instruction, /Do not contact suppliers or buyers/i);
  assert.match(plan.instruction, /human manager explicitly plans and approves/i);
  assert.deepEqual(plan.metadata.governance, {
    initialState: "CREATED",
    humanApprovalRequired: true,
    autoQueueAllowed: false,
    externalCommunicationAllowed: false,
    supplierContactAllowed: false,
    quoteRequestAllowed: false,
    pricingCommitmentAllowed: false,
    orderPlacementAllowed: false,
  });
});

test("the sourcing task is stable and idempotent across repeated Talk messages", () => {
  const first = buildQualifiedSourcingTaskPlan(qualifiedInput);
  const repeated = buildQualifiedSourcingTaskPlan({
    ...qualifiedInput,
    opportunityReferenceCode: "OPP-TREQ-20260821-ABC123",
  });

  assert.equal(first?.idempotencyKey, repeated?.idempotencyKey);
  assert.equal(first?.idempotencyKey.includes(qualifiedInput.chatLeadId), false);
});

test("non-Exportunity or incomplete CRM states cannot create a sourcing task", () => {
  assert.equal(
    buildQualifiedSourcingTaskPlan({ ...qualifiedInput, tenantKey: "mindbase" }),
    null,
  );
  assert.equal(
    buildQualifiedSourcingTaskPlan({ ...qualifiedInput, crmStage: "warm" }),
    null,
  );
  assert.equal(
    buildQualifiedSourcingTaskPlan({ ...qualifiedInput, opportunityId: null }),
    null,
  );
});

test("the persisted task uses existing governance and remains Exportunity-native", () => {
  const policySource = readFileSync(
    path.join(process.cwd(), "server/lib/exportunity/sourcingTaskPolicy.ts"),
    "utf8",
  );
  const repositorySource = readFileSync(
    path.join(process.cwd(), "server/lib/exportunity/sourcingTask.ts"),
    "utf8",
  );
  const governanceServiceSource = readFileSync(
    path.join(process.cwd(), "server/lib/intelligence/service.ts"),
    "utf8",
  );
  const governanceSchemaSource = readFileSync(
    path.join(process.cwd(), "db/schema/intelligence-governance.ts"),
    "utf8",
  );
  const governanceEnsureSource = readFileSync(
    path.join(process.cwd(), "server/lib/intelligence/ensureTables.ts"),
    "utf8",
  );
  const migrationSource = readFileSync(
    path.join(
      process.cwd(),
      "db/migrations/20260821_exportunity_sourcing_task_idempotency.sql",
    ),
    "utf8",
  );

  assert.match(repositorySource, /createGovernedTask\(/);
  assert.match(repositorySource, /tokenBudget:\s*plan\.tokenBudget/);
  assert.match(repositorySource, /managerAgentId/);
  assert.match(repositorySource, /executionAgentId/);
  assert.match(governanceServiceSource, /idempotencyKey\?:\s*string/);
  assert.match(governanceServiceSource, /onConflictDoNothing\(/);
  assert.match(governanceSchemaSource, /idempotencyKey:\s*text\("idempotency_key"\)/);
  assert.match(
    `${governanceEnsureSource}\n${migrationSource}`,
    /intelligence_tasks_tenant_idempotency_key_idx/,
  );
  assert.doesNotMatch(`${policySource}\n${repositorySource}`, /mindbase/i);
});
