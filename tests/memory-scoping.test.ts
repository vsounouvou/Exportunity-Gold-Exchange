import test from "node:test";
import assert from "node:assert/strict";

import { deriveAgentMemoryAccessPolicy, isTassiGlobalAgent } from "../server/lib/memory/scoping";

test("memory scoping: non-Tassi cannot access other tenant", () => {
  const policy = deriveAgentMemoryAccessPolicy({
    tenantId: 4,
    agentTenantId: 7,
    isTassi: false,
    conversationId: "conv-1",
    includeTenantMemory: true,
  });
  assert.equal(policy.valid, false);
  assert.equal(policy.reason, "agent_outside_tenant_scope");
});

test("memory scoping: non-Tassi conversation + optional tenant scopes only", () => {
  const policy = deriveAgentMemoryAccessPolicy({
    tenantId: 4,
    agentTenantId: 4,
    isTassi: false,
    conversationId: "conv-1",
    includeTenantMemory: true,
  });
  assert.equal(policy.valid, true);
  assert.deepEqual(policy.allowedScopes, ["CONVERSATION", "TENANT"]);
});

test("memory scoping: Tassi can access GLOBAL and current conversation", () => {
  const policy = deriveAgentMemoryAccessPolicy({
    tenantId: 9,
    agentTenantId: 2,
    isTassi: true,
    conversationId: "conv-9",
    includeTenantMemory: true,
  });
  assert.equal(policy.valid, true);
  assert.deepEqual(policy.allowedScopes, ["CONVERSATION", "GLOBAL"]);
});

test("memory scoping: Tassi without conversation gets GLOBAL only", () => {
  const policy = deriveAgentMemoryAccessPolicy({
    tenantId: 9,
    agentTenantId: 2,
    isTassi: true,
    conversationId: null,
    includeTenantMemory: true,
  });
  assert.equal(policy.valid, true);
  assert.deepEqual(policy.allowedScopes, ["GLOBAL"]);
});

test("identity: Tassi detection from assistant identity", () => {
  const tassi = isTassiGlobalAgent({
    name: "Tassi Hangbe",
    role: "Chairman Assistant",
    metadata: {},
  });
  const nonTassi = isTassiGlobalAgent({
    name: "Awa Bamba",
    role: "Coordinator",
    metadata: {},
  });
  assert.equal(tassi, true);
  assert.equal(nonTassi, false);
});

