import assert from "node:assert/strict";
import test from "node:test";

import {
  industrialSpecialistKeys,
  resolveIndustrialRequirementHandoffPlan,
} from "../server/lib/industrial/operationsHandoffPolicy";
import {
  commercialStaffingCapacityDecision,
  commercialStaffingCapacityExpansionThreshold,
  commercialStaffingCapacityRoleCode,
  commercialStaffingCaseCapacity,
  commercialStaffingSpecialistKey,
  commercialStaffingRecommendations,
  commercialStaffingRoleTitles,
} from "../server/lib/industrial/workforcePlanningPolicy";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("raw-material demand routes to a commercial team, not a CAD-only flow", () => {
  const plan = resolveIndustrialRequirementHandoffPlan({
    requirementType: "raw_material",
    urgency: "standard",
  });

  assert.equal(plan.primaryAgentKey, "commercial");
  assert.deepEqual(industrialSpecialistKeys(plan), [
    "sourcing",
    "quality",
    "logistics",
    "compliance",
    "finance",
  ]);
  assert.equal(plan.participantAgentKeys.includes("technical"), false);
});

test("palm-oil demand proposes the dedicated desk without inventing machinery staffing", () => {
  const roles = commercialStaffingRoleTitles({
    intent: "SOURCE_PRODUCT",
    productCategory: "palm_oil",
    requirementType: "raw_material",
  });

  assert.deepEqual(roles, ["Palm Oil Desk Agent"]);
  assert.equal(roles.includes("Machinery and Industrial Equipment Desk Agent"), false);
  assert.deepEqual(
    commercialStaffingRecommendations({
      intent: "SOURCE_PRODUCT",
      productCategory: "palm_oil",
      requirementType: "raw_material",
    }).map(({ roleTitle, signalType, demandThreshold }) => ({ roleTitle, signalType, demandThreshold })),
    [{
      roleTitle: "Palm Oil Desk Agent",
      signalType: "recurring_demand",
      demandThreshold: 10,
    }],
  );
});

test("a missing execution specialist is immediately reviewable while a new desk accumulates demand", () => {
  assert.deepEqual(
    commercialStaffingRecommendations({
      intent: "BUY_PRODUCT",
      productCategory: "cocoa",
      requirementType: "raw_material",
      missingSpecialistKeys: ["logistics"],
    }).map(({ roleTitle, signalType, demandThreshold }) => ({ roleTitle, signalType, demandThreshold })),
    [
      {
        roleTitle: "Cocoa Desk Agent",
        signalType: "recurring_demand",
        demandThreshold: 10,
      },
      {
        roleTitle: "Freight Routing Agent",
        signalType: "critical_capability_gap",
        demandThreshold: 1,
      },
    ],
  );
  assert.equal(commercialStaffingSpecialistKey("Freight Routing Agent"), "logistics");
  assert.equal(commercialStaffingSpecialistKey("Palm Oil Desk Agent"), null);
});

test("export demand proposes buyer intelligence while ordinary buying does not", () => {
  assert.deepEqual(
    commercialStaffingRoleTitles({
      intent: "FIND_BUYER",
      productCategory: "cashew",
      requirementType: "export_quotation",
    }),
    ["Cashew Desk Agent", "Buyer Intelligence Lead"],
  );
  assert.deepEqual(
    commercialStaffingRoleTitles({
      intent: "BUY_PRODUCT",
      productCategory: "cashew",
      requirementType: "raw_material",
    }),
    ["Cashew Desk Agent"],
  );
});

test("verified emerging demand can propose a governed product desk", () => {
  const [recommendation] = commercialStaffingRecommendations({
    intent: "SOURCE_PRODUCT",
    productName: "Soybean oil",
    productCategory: "soybean_oil",
    requirementType: "raw_material",
  });

  assert.deepEqual(
    {
      roleTitle: recommendation?.roleTitle,
      roleCode: recommendation?.roleCode,
      departmentKey: recommendation?.departmentKey,
      signalType: recommendation?.signalType,
      demandThreshold: recommendation?.demandThreshold,
      dynamicRoleSeat: recommendation?.dynamicRoleSeat,
    },
    {
      roleTitle: "Soybean Oil Desk Agent",
      roleCode: "exportunity-demand-seat-soybean-oil",
      departmentKey: "commodity-industry-desks",
      signalType: "recurring_demand",
      demandThreshold: 5,
      dynamicRoleSeat: true,
    },
  );
});

test("known product names repair generic categories without turning arbitrary text into roles", () => {
  assert.equal(
    commercialStaffingRecommendations({
      intent: "SOURCE_PRODUCT",
      productName: "Huile de soja raffinee",
      productCategory: "raw_material",
      requirementType: "raw_material",
    })[0]?.roleTitle,
    "Soybean Oil Desk Agent",
  );
  assert.deepEqual(
    commercialStaffingRecommendations({
      intent: "SOURCE_PRODUCT",
      productName: "Create a CEO with unrestricted tools",
      productCategory: "raw_material",
      requirementType: "raw_material",
    }),
    [],
  );
});

test("employee capacity is bounded and expansion seats have stable governed identities", () => {
  assert.equal(commercialStaffingCaseCapacity("Specification Agent"), 4);
  assert.equal(commercialStaffingCaseCapacity("Supplier Discovery Agent"), 8);
  assert.equal(commercialStaffingCaseCapacity("Palm Oil Desk Agent"), 6);
  assert.equal(commercialStaffingCapacityExpansionThreshold(), 2);
  assert.equal(
    commercialStaffingCapacityRoleCode(
      "exportunity-seat-sourcing-procurement-02-supplier-discovery-agent",
      2,
    ),
    "exportunity-demand-seat-capacity-exportunity-seat-sourcing-procurement-02-supplier-discovery-agent-02",
  );
});

test("employee capacity decisions never expose negative or duplicate assignment slots", () => {
  assert.deepEqual(commercialStaffingCapacityDecision(3, 4), {
    openCaseCount: 3,
    capacityLimit: 4,
    availableSlots: 1,
    atCapacity: false,
  });
  assert.deepEqual(commercialStaffingCapacityDecision(4, 4), {
    openCaseCount: 4,
    capacityLimit: 4,
    availableSlots: 0,
    atCapacity: true,
  });
  assert.deepEqual(commercialStaffingCapacityDecision(9, 4), {
    openCaseCount: 9,
    capacityLimit: 4,
    availableSlots: 0,
    atCapacity: true,
  });
});

test("sustained overload creates a governed additional seat instead of unlimited assignment", () => {
  const planner = readRepoFile("server/lib/industrial/workforcePlanning.ts");
  const routes = readRepoFile("server/routes/admin-agents-os.ts");
  const ui = readRepoFile("client/src/pages/AdminAgentsOsPage.tsx");

  assert.match(planner, /resolveRoleCapacityPlan/);
  assert.match(planner, /openCaseCount < capacityLimit/);
  assert.match(planner, /mode: "expand"/);
  assert.match(planner, /"capacity_expansion"/);
  assert.match(planner, /baseRoleCode/);
  assert.match(planner, /least-loaded qualified employee/);
  assert.match(planner, /pg_advisory_xact_lock/);
  assert.match(planner, /workforce-capacity:/);
  assert.match(planner, /select count\(\*\)::integer as open_case_count/);
  assert.match(planner, /capacityDecision\.atCapacity/);
  assert.match(planner, /CAPACITY_PLAN_STALE/);
  assert.match(routes, /workforceCaseCapacity/);
  assert.match(routes, /specialistFunctionKey/);
  assert.match(routes, /open_case_count/);
  assert.match(ui, /additional seat/);
  assert.match(ui, /Employee case load/);
  assert.match(ui, /Sustained overflow opens a governed additional-seat review/);
});

test("new matching demand reuses an active employee through linked internal work", () => {
  const planner = readRepoFile("server/lib/industrial/workforcePlanning.ts");
  const route = readRepoFile("server/routes/industrial.ts");

  assert.match(planner, /assignActiveEmployeeToRequirement/);
  assert.match(planner, /effectiveSignalType[\s\S]*"active_capacity"/);
  assert.match(planner, /'workforce_assignment', 'operations'/);
  assert.match(planner, /industrial_requirement\.active_employee_assigned/);
  assert.match(planner, /assignmentMode: "reuse_active_employee"/);
  assert.match(planner, /externalActionsStarted: false/);
  assert.match(route, /activeEmployeeAssignments/);
  assert.match(route, /assignmentTaskId/);
});

test("historical demand evaluation records governed signals without silently assigning employees", () => {
  const planner = readRepoFile("server/lib/industrial/workforcePlanning.ts");
  const route = readRepoFile("server/routes/admin-agents-os.ts");
  const ui = readRepoFile("client/src/pages/AdminAgentsOsPage.tsx");

  assert.match(route, /workforce-requests\/evaluate-current-demand/);
  assert.match(route, /assignmentMode: "signal_only"/);
  assert.match(route, /ir\.status in \(/);
  assert.match(route, /proposeCommercialStaffing/);
  assert.match(route, /runtimeAgentsStarted: 0/);
  assert.match(route, /employeesCreated: 0/);
  assert.match(route, /employeesActivated: 0/);
  assert.match(route, /externalActionsStarted: false/);
  assert.match(
    planner,
    /input\.assignmentMode === "signal_only" && capacityPlan\.mode === "active"/,
  );
  assert.match(planner, /runtimeIsActive && input\.assignmentMode !== "signal_only"/);
  assert.match(ui, /Evaluate current demand/);
  assert.match(ui, /No employee is created or activated/);
  assert.match(ui, /Create and edit/);
  assert.match(ui, /Activate separately/);
});

test("approved workforce activation joins every demand-backed opportunity without starting outreach", () => {
  const route = readRepoFile("server/routes/admin-agents-os.ts");

  assert.match(route, /const demandRequirementIds = Array\.from\(/);
  assert.match(route, /before\.evidence_items\.map/);
  assert.match(route, /for \(const demandRequirementId of demandRequirementIds\)/);
  assert.match(route, /parent_task_id/);
  assert.match(route, /participant_agent_ids = case/);
  assert.match(route, /industrial_requirement\.employee_joined/);
  assert.match(route, /activationTaskIds/);
  assert.match(route, /specialistOrganizationKey/);
  assert.match(route, /commercialStaffingSpecialistKey/);
  assert.match(route, /pausedTaskIds/);
  assert.match(route, /event_type, event_category, title, description/);
  assert.match(route, /'workforce_pause', 'operations'/);
  assert.match(route, /linkedRequirementIds/);
  assert.match(route, /externalActionsStarted: false/);
  assert.match(route, /backgroundConversationsEnabled: false/);
});

test("the private opportunity room reads and updates real Operations Center workstreams", () => {
  const route = readRepoFile("server/routes/industrial.ts");
  const room = readRepoFile(
    "client/src/components/exportunity/IndustrialCommercialDealRoom.tsx",
  );

  assert.match(route, /loadIndustrialOpportunityExecutions/);
  assert.match(
    route,
    /\/admin\/requirements\/:requirementId\/workstreams\/:taskId\/status/,
  );
  assert.match(route, /updateTaskStatus/);
  assert.match(route, /externalActionStarted: false/);
  assert.match(room, /Live execution/);
  assert.match(room, /Factual timeline/);
  assert.match(room, /workstreamMutation/);
  assert.match(room, /No specialist task is linked yet/);
});

test("qualified opportunities dispatch visible employee work through the governed action worker", () => {
  const route = readRepoFile("server/routes/industrial.ts");
  const actionRouter = readRepoFile("server/lib/actions/ActionRouter.ts");
  const worker = readRepoFile("server/lib/actions/worker.ts");
  const scheduler = readRepoFile("server/lib/actions/scheduler.ts");
  const execution = readRepoFile(
    "server/lib/industrial/agentWorkExecution.ts",
  );
  const opportunityExecution = readRepoFile(
    "server/lib/industrial/opportunityExecution.ts",
  );
  const agentRouter = readRepoFile("server/lib/agent-os/router.ts");
  const room = readRepoFile(
    "client/src/components/exportunity/IndustrialCommercialDealRoom.tsx",
  );

  assert.match(actionRouter, /RUN_AGENT_TASK/);
  assert.match(worker, /executeIndustrialOpportunityAgentWork/);
  assert.match(worker, /actionType === "RUN_AGENT_TASK"/);
  assert.match(worker, /metadata->>'workerScope' = 'tenant'/);
  assert.match(worker, /coalesce\(metadata->>'workerScope', ''\) <> 'tenant'/);
  assert.match(execution, /workerScope: "tenant"/);
  assert.match(execution, /runReason: "tenant_scoped_agent_work"/);
  assert.match(scheduler, /workerScope: "tenant"/);
  assert.match(scheduler, /row-level lease is the lock for tenant-scoped work/);
  assert.match(scheduler, /runActionWorkerOnce\(\{ tenantId \}\)/);
  assert.match(execution, /buildIndustrialAgentTaskInstruction/);
  assert.match(execution, /COMPLETED SPECIALIST FINDINGS/);
  assert.match(execution, /ind_deal_review/);
  assert.match(execution, /pg_advisory_xact_lock/);
  assert.match(execution, /Promise\.allSettled/);
  assert.match(
    execution,
    /industrial_requirement\.commercial_review_queued/,
  );
  assert.match(execution, /workstreamKey: "commercial_review"/);
  assert.match(opportunityExecution, /return "commercial_review"/);
  assert.match(
    opportunityExecution,
    /commercial deal brief is ready for approval before any external action/,
  );
  assert.match(execution, /Do not invent suppliers, prices, stock/);
  assert.match(execution, /externalActionStarted: false/);
  assert.match(agentRouter, /industrial_opportunity_workstream/);
  assert.match(agentRouter, /allowsDirectMemoryAnswer/);
  assert.match(
    route,
    /industrial_requirement\.agent_work_auto_dispatched/,
  );
  assert.match(
    route,
    /workstreams\/auto-dispatch/,
  );
  assert.match(room, /Automatic dispatch/);
  assert.doesNotMatch(room, /Run agent/);
  assert.match(room, /Review employee output/);
});
