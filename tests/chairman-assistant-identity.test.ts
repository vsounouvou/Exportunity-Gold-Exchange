import assert from "node:assert/strict";
import test from "node:test";
import { getChairmanAssistantIdentity } from "../server/lib/chairman-assistant-identity";

test("Exportunity uses Fenou for internal operations", () => {
  const identity = getChairmanAssistantIdentity("exportunity");
  assert.equal(identity.name, "Fenou");
  assert.equal(identity.organizationKey, "fenou");
  assert.ok(identity.capabilities.includes("meeting_support"));
  assert.ok(identity.capabilities.includes("task_orchestration"));
});

test("other tenants preserve the shared assistant identity", () => {
  const identity = getChairmanAssistantIdentity("zone");
  assert.equal(identity.name, "Tassi Hangbe");
  assert.equal(identity.organizationKey, "chairman-assistant");
});
