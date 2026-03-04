import assert from "node:assert/strict";
import test from "node:test";

import {
  assertGovernedTaskTransition,
  canTransitionGovernedTaskState,
  getAllowedGovernedTransitions,
  normalizeGovernedTaskState,
} from "../server/lib/intelligence/stateMachine";
import {
  computeStableJsonHash,
  signWorkflowSpec,
  verifyWorkflowSpecSignature,
} from "../server/lib/intelligence/signing";
import {
  computeNextScheduledRun,
  intervalMinutesFromCronExpression,
} from "../server/lib/intelligence/cronUtils";

test("governed state machine allows strict forward transitions", () => {
  assert.equal(canTransitionGovernedTaskState("CREATED", "PLANNED"), true);
  assert.equal(canTransitionGovernedTaskState("PLANNED", "SCRIPTED"), true);
  assert.equal(canTransitionGovernedTaskState("RUNNING", "VERIFIED"), true);
  assert.deepEqual(getAllowedGovernedTransitions("FAILED"), ["PLANNED", "QUEUED", "CANCELLED"]);
});

test("governed state machine rejects invalid transitions", () => {
  assert.equal(canTransitionGovernedTaskState("CREATED", "RUNNING"), false);
  assert.throws(
    () => assertGovernedTaskTransition("CREATED", "RUNNING"),
    /INVALID_TASK_TRANSITION: CREATED -> RUNNING/,
  );
  assert.equal(normalizeGovernedTaskState(" queued "), "QUEUED");
  assert.equal(normalizeGovernedTaskState("not-a-state"), null);
});

test("workflow signing is stable, order-insensitive, and tamper-detecting", () => {
  const secret = "test-intelligence-secret";
  const specA = {
    steps: [
      { id: "fetch-price", scriptId: "gold.fetch", params: { market: "xauusd" } },
      { id: "store", scriptId: "db.write", params: { table: "prices" } },
    ],
    retry: 2,
    metadata: { owner: "ops", critical: true },
  };

  const sameMeaningDifferentOrder = {
    metadata: { critical: true, owner: "ops" },
    retry: 2,
    steps: [
      { params: { market: "xauusd" }, scriptId: "gold.fetch", id: "fetch-price" },
      { params: { table: "prices" }, id: "store", scriptId: "db.write" },
    ],
  };

  const hashA = computeStableJsonHash(specA);
  const hashB = computeStableJsonHash(sameMeaningDifferentOrder);
  assert.equal(hashA, hashB);

  const signed = signWorkflowSpec(specA, secret);
  assert.equal(verifyWorkflowSpecSignature(specA, signed.signature, secret), true);
  assert.equal(verifyWorkflowSpecSignature(sameMeaningDifferentOrder, signed.signature, secret), true);

  const tampered = { ...specA, retry: 3 };
  assert.equal(verifyWorkflowSpecSignature(tampered, signed.signature, secret), false);
});

test("cron interval parsing and next-run scheduling works with metadata override", () => {
  assert.equal(intervalMinutesFromCronExpression("*/15 * * * *"), 15);
  assert.equal(intervalMinutesFromCronExpression("0 * * * *"), 60);
  assert.equal(intervalMinutesFromCronExpression("0 0 * * 0"), 10080);
  assert.equal(intervalMinutesFromCronExpression("invalid"), 60);

  const from = new Date("2026-03-02T12:00:00.000Z");
  const nextFromCron = computeNextScheduledRun({ from, scheduleCron: "*/15 * * * *" });
  assert.equal(nextFromCron.toISOString(), "2026-03-02T12:15:00.000Z");

  const nextFromMetadata = computeNextScheduledRun({
    from,
    scheduleCron: "*/15 * * * *",
    metadata: { intervalMinutes: 3 },
  });
  assert.equal(nextFromMetadata.toISOString(), "2026-03-02T12:03:00.000Z");
});

