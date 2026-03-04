import test from "node:test";
import assert from "node:assert/strict";

import { renderActionDispatchFeedback } from "../server/lib/actions/agentActionIntents";
import { toLifecycleStateFromLegacyStatus, toPublicActionId } from "../server/lib/actions/lifecycle";
import { ActionExecutionError, executeAction } from "../server/lib/actions/executeAction";

test("action id mapping: deterministic public action id", () => {
  assert.equal(toPublicActionId(57), "ACT-000057");
  assert.equal(toPublicActionId(203), "ACT-000203");
});

test("action lifecycle mapping: legacy status to lifecycle state", () => {
  assert.equal(toLifecycleStateFromLegacyStatus("QUEUED"), "QUEUED");
  assert.equal(toLifecycleStateFromLegacyStatus("RUNNING"), "RUNNING");
  assert.equal(toLifecycleStateFromLegacyStatus("DONE"), "SUCCEEDED");
  assert.equal(toLifecycleStateFromLegacyStatus("FAILED"), "FAILED");
  assert.equal(toLifecycleStateFromLegacyStatus("CANCELLED"), "CANCELED");
});

test("dispatch feedback uses public action id labels", () => {
  const text = renderActionDispatchFeedback({
    intentsDetected: 1,
    created: [
      {
        id: 57,
        status: "QUEUED",
        state: "QUEUED",
        actionType: "CREATE_TASK",
        correlationId: "cid-57",
        publicActionId: "ACT-000057",
      },
    ],
    blocked: [],
  });
  assert.equal(text.includes("ACT-000057"), true);
  assert.equal(text.includes("#57"), false);
});

test("evidence gating: OBJECTIVE_CREATE succeeds without evidence by default", async () => {
  const prev = process.env.FEATURE_ACCOUNTABILITY_ENFORCEMENT;
  process.env.FEATURE_ACCOUNTABILITY_ENFORCEMENT = "1";
  try {
    const out = await executeAction("OBJECTIVE_CREATE", { title: "Test objective" }, {
      tenantId: 1,
      actor: { currentMode: "admin", roles: ["admin"], permissions: ["*"] },
      mode: "LIVE",
    });
    assert.equal(out.ok, true);
    assert.equal(out.status, "SUCCEEDED");
  } finally {
    if (prev == null) delete process.env.FEATURE_ACCOUNTABILITY_ENFORCEMENT;
    else process.env.FEATURE_ACCOUNTABILITY_ENFORCEMENT = prev;
  }
});

test("evidence gating: explicit evidenceRequired=true blocks missing evidence", async () => {
  const prev = process.env.FEATURE_ACCOUNTABILITY_ENFORCEMENT;
  process.env.FEATURE_ACCOUNTABILITY_ENFORCEMENT = "1";
  try {
    await assert.rejects(
      executeAction("OBJECTIVE_CREATE", { title: "Needs evidence" }, {
        tenantId: 1,
        actor: { currentMode: "admin", roles: ["admin"], permissions: ["*"] },
        mode: "LIVE",
        metadata: { evidenceRequired: true },
      }),
      (error: any) => {
        assert.ok(error instanceof ActionExecutionError);
        assert.equal(error.code, "MISSING_EVIDENCE");
        return true;
      },
    );
  } finally {
    if (prev == null) delete process.env.FEATURE_ACCOUNTABILITY_ENFORCEMENT;
    else process.env.FEATURE_ACCOUNTABILITY_ENFORCEMENT = prev;
  }
});

