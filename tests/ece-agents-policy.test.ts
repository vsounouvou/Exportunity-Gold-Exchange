import test from "node:test";
import assert from "node:assert/strict";

import {
  canManageAgents,
  canOperateAgents,
  detectsHighImpactAction,
  resolveTenantScope,
} from "../server/lib/ece-agents/policy";

test("resolveTenantScope returns platform_admin for elevated roles", () => {
  const scope = resolveTenantScope({
    roles: ["Platform Admin"],
    permissions: [],
  });
  assert.equal(scope, "platform_admin");
});

test("resolveTenantScope returns tenant_owner for owner-like roles", () => {
  const scope = resolveTenantScope({
    roles: ["Mine Owner"],
    permissions: [],
  });
  assert.equal(scope, "tenant_owner");
});

test("resolveTenantScope returns agent_operator for operational permissions", () => {
  const scope = resolveTenantScope({
    roles: ["Staff"],
    permissions: ["manage_orders"],
  });
  assert.equal(scope, "agent_operator");
});

test("scope helpers enforce management and operation boundaries", () => {
  assert.equal(canManageAgents("platform_admin"), true);
  assert.equal(canManageAgents("tenant_owner"), true);
  assert.equal(canManageAgents("tenant_member"), false);
  assert.equal(canOperateAgents("agent_operator"), true);
  assert.equal(canOperateAgents("tenant_member"), false);
});

test("detectsHighImpactAction flags external outreach and payments", () => {
  assert.equal(detectsHighImpactAction("Send email to prospect@example.com now"), true);
  assert.equal(detectsHighImpactAction("Please pay supplier invoice 194 today"), true);
  assert.equal(detectsHighImpactAction("Summarize yesterday operations log"), false);
});
