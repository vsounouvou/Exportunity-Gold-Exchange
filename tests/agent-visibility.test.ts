import test from "node:test";
import assert from "node:assert/strict";
import { isAgentRunnableStatus, normalizeAgentEnv, sanitizeAgentVisibilityInput } from "../server/lib/agents/visibility";

test("test_prod_ui_agent_list_excludes_test_agents", () => {
  assert.equal(normalizeAgentEnv("production"), "prod");

  const realAgent = sanitizeAgentVisibilityInput({
    env: "prod",
    status: "active",
    name: "Awa Bamba",
    role: "Coordinator",
    isTest: false,
    isVisible: true,
  });

  const testAgent = sanitizeAgentVisibilityInput({
    env: "prod",
    status: "active",
    name: "LLM Test Agent",
    role: "Tester",
    isTest: true,
    isVisible: true,
  });

  assert.equal(realAgent.isTest, false);
  assert.equal(realAgent.isVisible, true);
  assert.equal(realAgent.status, "active");

  assert.equal(testAgent.isTest, true);
  assert.equal(testAgent.isVisible, false);
  assert.equal(testAgent.status, "archived");
});

test("test_bulk_archive_hides_all_test_agents", () => {
  const candidates = [
    { name: "Test Bot 1", role: "Assistant", status: "active" },
    { name: "QA Agent", role: "Test Runner", status: "active" },
    { name: "Smoke Worker", role: "Ops", status: "active", metadata: { isTest: true } },
  ];

  const archived = candidates.map((row) =>
    sanitizeAgentVisibilityInput({
      env: "prod",
      status: row.status,
      name: row.name,
      role: row.role,
      metadata: row.metadata,
    }),
  );

  for (const row of archived) {
    assert.equal(row.isTest, true);
    assert.equal(row.isVisible, false);
    assert.equal(row.status, "archived");
  }
});

test("test_archived_agents_cannot_execute_actions", () => {
  assert.equal(isAgentRunnableStatus("active"), true);
  assert.equal(isAgentRunnableStatus("testing"), true);
  assert.equal(isAgentRunnableStatus("inactive"), false);
  assert.equal(isAgentRunnableStatus("paused"), false);
  assert.equal(isAgentRunnableStatus("archived"), false);
});
