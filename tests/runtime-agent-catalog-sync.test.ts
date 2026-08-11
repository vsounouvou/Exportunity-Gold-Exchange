import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRuntimeAgentCatalogIdentity,
  inferRuntimeAgentCategory,
  mapRuntimeAgentStatus,
  type RuntimeAgentCatalogRow,
} from "../server/lib/agents/syncRuntimeAgentCatalog";

const runtimeAgent: RuntimeAgentCatalogRow = {
  id: 170,
  tenant_id: 26,
  name: "Fenou",
  role: "Industrial Operations Assistant",
  status: "active",
  avatar: "/legacy-avatar.png",
  avatar_url: "/agents/fenou-active.png",
  manager_id: 159,
  department_id: 14,
  is_department_head: false,
  base_budget: "1250.50",
  mission: "Coordinate approved industrial execution across the operating company.",
  cv: "Industrial operations and controlled execution context.",
};

test("runtime agent identity maps to one tenant-scoped catalog record", () => {
  const identity = buildRuntimeAgentCatalogIdentity(runtimeAgent, 26);

  assert.equal(identity.code, "runtime-26-170");
  assert.equal(identity.slug, "runtime-fenou-170");
  assert.equal(identity.displayName, "Fenou");
  assert.equal(identity.roleTitle, "Industrial Operations Assistant");
  assert.equal(identity.category, "operations");
  assert.equal(identity.avatarUrl, "/agents/fenou-active.png");
  assert.equal(identity.shortPitch, runtimeAgent.mission);
  assert.equal(identity.longDescription, runtimeAgent.cv);
  assert.equal(identity.baseSalary, 1250.5);
  assert.equal(identity.status, "active");
  assert.equal(identity.isActive, true);
});

test("runtime categories and lifecycle states remain deterministic", () => {
  assert.equal(inferRuntimeAgentCategory("Legal & Compliance Director"), "compliance");
  assert.equal(inferRuntimeAgentCategory("Finance and Treasury Lead"), "finance");
  assert.equal(inferRuntimeAgentCategory("Customer Support"), "support");
  assert.equal(inferRuntimeAgentCategory("Sales Growth Hunter"), "marketing");
  assert.equal(inferRuntimeAgentCategory("Executive Assistant"), "executive");

  assert.equal(mapRuntimeAgentStatus("active"), "active");
  assert.equal(mapRuntimeAgentStatus("inactive"), "retired");
  assert.equal(mapRuntimeAgentStatus("archived"), "retired");
  assert.equal(mapRuntimeAgentStatus("paused"), "draft");
});
