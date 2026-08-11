import assert from "node:assert/strict";
import test from "node:test";
import { buildApprovedTaskActionLink } from "../server/lib/task-action-link";

test("approved meeting task creates a stable, existing-task execution link", () => {
  const result = buildApprovedTaskActionLink(
    {
      id: 42,
      title: "Validate the meeting workflow",
      description: "Verify persistence and report the result.",
      agentId: 7,
      companyId: 3,
      goalId: 9,
      objectiveId: 9,
      priority: "high",
      sourceMeetingId: 88,
    },
    4,
  );

  assert.equal(result.actionType, "CREATE_TASK");
  assert.equal(result.idempotencyKey, "task-approval:42");
  assert.equal(result.relatedThreadId, 88);
  assert.equal(result.payload.existingTaskId, 42);
  assert.equal(result.payload.taskId, 42);
  assert.equal(result.payload.status, "ready");
  assert.equal(result.payload.source, "meeting_task_approval");
  assert.equal(result.payload.approvedByAgentId, 4);
});

test("approved task action rejects missing persisted identity", () => {
  assert.throws(
    () => buildApprovedTaskActionLink({ id: 0, title: "No task", description: "No task" }, 4),
    /persisted task/i,
  );
});
