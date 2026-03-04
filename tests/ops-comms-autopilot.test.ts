import test from "node:test";
import assert from "node:assert/strict";

import { pickOpsCommsAutopilotSenderKey, shouldAutopostThread } from "../server/lib/ops-comms/autopilot";

test("pickOpsCommsAutopilotSenderKey chooses a stable agent key", () => {
  assert.equal(pickOpsCommsAutopilotSenderKey("#board"), "chairman_assistant");
  assert.equal(pickOpsCommsAutopilotSenderKey("#execution"), "coordinator");
  assert.equal(pickOpsCommsAutopilotSenderKey("#dept-compliance"), "compliance");
  assert.equal(pickOpsCommsAutopilotSenderKey("#dept-finance"), "wallet");
  assert.equal(pickOpsCommsAutopilotSenderKey("#dept-growth"), "marketing");
  assert.equal(pickOpsCommsAutopilotSenderKey("#dept-platform"), "data");
  assert.equal(pickOpsCommsAutopilotSenderKey("#dept-operations"), "ops");
});

test("shouldAutopostThread respects cooldown", () => {
  const nowMs = Date.now();
  const cooldownMs = 10_000;
  assert.equal(shouldAutopostThread(null, nowMs, cooldownMs), true);
  assert.equal(shouldAutopostThread(new Date(nowMs - 30_000), nowMs, cooldownMs), true);
  assert.equal(shouldAutopostThread(new Date(nowMs - 1_000), nowMs, cooldownMs), false);
});

