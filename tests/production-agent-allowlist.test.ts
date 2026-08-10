import assert from "node:assert/strict";
import test from "node:test";

import { resolveAllowedProductionAgentIds } from "../server/lib/agents/productionAllowlistResolution";

test("keeps an approved agent when its database id still matches", () => {
  const allowed = resolveAllowedProductionAgentIds({
    requestedIds: [11, 12],
    candidates: [
      { id: 11, name: "Tassi Hangbe", metadata: { organizationKey: "tassi" } },
      { id: 12, name: "Unapproved Agent", metadata: { organizationKey: "unapproved" } },
    ],
    enabledRows: [{ agentId: 11, agentKey: "tassi" }],
  });

  assert.deepEqual(allowed, [11]);
});

test("resolves an approved stable organization key after an agent id changes", () => {
  const allowed = resolveAllowedProductionAgentIds({
    requestedIds: [205, 206],
    candidates: [
      { id: 205, name: "Tassi Hangbe", metadata: { organizationKey: "tassi" } },
      { id: 206, name: "Mariam Diallo", metadata: { organizationKey: "technical" } },
    ],
    enabledRows: [
      { agentId: 5, agentKey: "tassi" },
      { agentId: 6, agentKey: "technical" },
    ],
  });

  assert.deepEqual(allowed, [205, 206]);
});

test("does not bypass a disabled or absent production identity", () => {
  const allowed = resolveAllowedProductionAgentIds({
    requestedIds: [301],
    candidates: [{ id: 301, name: "Tassi Hangbe", metadata: { organizationKey: "tassi" } }],
    enabledRows: [],
  });

  assert.deepEqual(allowed, []);
});
