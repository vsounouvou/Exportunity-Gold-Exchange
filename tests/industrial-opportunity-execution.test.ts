import assert from "node:assert/strict";
import test from "node:test";

import {
  allowedIndustrialTaskStatuses,
  buildIndustrialOpportunityExecution,
  industrialSpecialistKeyForRole,
  nextActionForIndustrialExecution,
  type IndustrialOpportunityExecutionTask,
} from "../server/lib/industrial/opportunityExecution";

type RawTask = Omit<
  IndustrialOpportunityExecutionTask,
  "key" | "allowedNextStatuses"
>;

function task(overrides: Partial<RawTask> & Pick<RawTask, "id">): RawTask {
  return {
    id: overrides.id,
    parentTaskId: null,
    agentId: null,
    agentName: null,
    agentRole: null,
    agentAvatarUrl: null,
    title: `Task ${overrides.id}`,
    description: "Evidence-backed work",
    status: "backlog",
    priority: "high",
    executionType: "ind_workstream",
    approvalStatus: "pending",
    createdAt: new Date("2026-08-13T08:00:00.000Z"),
    updatedAt: new Date("2026-08-13T08:00:00.000Z"),
    completedAt: null,
    ...overrides,
  };
}

test("opportunity execution derives employee progress from real tasks", () => {
  const execution = buildIndustrialOpportunityExecution({
    requirementId: "1c02283d-c410-4b26-9235-821306bf96bc",
    parentTaskId: 100,
    taskRows: [
      task({
        id: 100,
        agentId: 1,
        agentName: "Awa Kouadio",
        agentRole: "Commercial Director",
        title: "IND-100 - Commercial intake",
        executionType: "industrial_intake",
      }),
      task({
        id: 101,
        parentTaskId: 100,
        agentId: 2,
        agentName: "Kossi Mensah",
        agentRole: "Supplier Discovery Agent",
        title: "IND-100 - Supplier discovery",
        status: "done",
        completedAt: new Date("2026-08-13T09:00:00.000Z"),
      }),
      task({
        id: 102,
        parentTaskId: 100,
        agentId: 3,
        agentName: "Safi Adama",
        agentRole: "Commercial Finance Agent",
        title: "IND-100 - Commercial finance",
        status: "in_progress",
      }),
    ],
    activityRows: [
      {
        id: 501,
        eventType: "task_status_changed",
        title: "Sourcing evidence completed",
        description: "Supplier shortlist recorded in the shared case.",
        agentId: 2,
        agentName: "Kossi Mensah",
        metadata: { taskId: 101 },
        createdAt: new Date("2026-08-13T09:00:00.000Z"),
      },
    ],
    fallbackParticipants: [
      {
        key: "commercial",
        agentId: 1,
        agentName: "Awa Kouadio",
        role: "Commercial Director",
      },
    ],
    missingSpecialistKeys: ["sourcing", "finance", "compliance"],
  });

  assert.equal(execution.status, "working");
  assert.deepEqual(execution.progress, {
    total: 2,
    completed: 1,
    inProgress: 1,
    blocked: 0,
    backlog: 0,
    percent: 50,
  });
  assert.deepEqual(execution.missingSpecialistKeys, ["compliance"]);
  assert.deepEqual(
    execution.workstreams.map(({ key, status }) => ({ key, status })),
    [
      { key: "finance", status: "in_progress" },
      { key: "sourcing", status: "done" },
    ],
  );
  assert.equal(
    nextActionForIndustrialExecution(execution),
    "Safi Adama is working on IND-100 - Commercial finance.",
  );
  assert.equal(execution.timeline[0]?.title, "Sourcing evidence completed");
  assert.ok(
    execution.timeline.every(
      (event) => event.type !== "agent_thinking" && event.type !== "simulated_work",
    ),
  );
});

test("demand-driven employees resolve the missing capability they were hired for", () => {
  const execution = buildIndustrialOpportunityExecution({
    requirementId: "d8af8822-0ce9-4fe3-83c6-6d0f486ad693",
    parentTaskId: 200,
    taskRows: [
      task({
        id: 200,
        agentId: 1,
        agentName: "Awa Kouadio",
        agentRole: "Commercial Director",
        executionType: "industrial_intake",
      }),
      task({
        id: 201,
        parentTaskId: 200,
        agentId: 9,
        agentName: "Nadia Ahouansou",
        agentRole: "Trade Compliance Agent",
        executionType: "workforce_activation",
      }),
    ],
    missingSpecialistKeys: ["compliance"],
  });

  assert.equal(execution.workstreams[0]?.key, "compliance");
  assert.deepEqual(execution.missingSpecialistKeys, []);
  assert.equal(execution.status, "assigned");
  assert.equal(execution.team.some((member) => member.agentId === 9), true);
});

test("blocked work is explicit and only valid lifecycle transitions are offered", () => {
  const execution = buildIndustrialOpportunityExecution({
    requirementId: "66a6fca2-3e58-442f-bfbb-061f7a54a4fb",
    parentTaskId: 300,
    taskRows: [
      task({ id: 300, executionType: "industrial_intake" }),
      task({
        id: 301,
        parentTaskId: 300,
        agentId: 4,
        agentName: "Mariam Diallo",
        agentRole: "Freight Routing Agent",
        status: "blocked",
        title: "IND-300 - Freight routing",
      }),
    ],
  });

  assert.equal(execution.status, "blocked");
  assert.equal(
    nextActionForIndustrialExecution(execution),
    "Resolve blocked workstream: IND-300 - Freight routing",
  );
  assert.deepEqual(allowedIndustrialTaskStatuses("blocked"), [
    "in_progress",
    "backlog",
    "canceled",
  ]);
  assert.deepEqual(allowedIndustrialTaskStatuses("unknown"), []);
});

test("role classification covers the commercial execution specialists", () => {
  assert.equal(industrialSpecialistKeyForRole("Account Executive"), "commercial");
  assert.equal(industrialSpecialistKeyForRole("Supplier Discovery Agent"), "sourcing");
  assert.equal(industrialSpecialistKeyForRole("Specification Agent"), "technical");
  assert.equal(industrialSpecialistKeyForRole("Freight Routing Agent"), "logistics");
  assert.equal(industrialSpecialistKeyForRole("Commercial Finance Agent"), "finance");
  assert.equal(industrialSpecialistKeyForRole("Quality Documentation Agent"), "quality");
  assert.equal(industrialSpecialistKeyForRole("Trade Compliance Agent"), "compliance");
});
