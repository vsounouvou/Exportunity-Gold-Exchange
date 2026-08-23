import test from "node:test";
import assert from "node:assert/strict";

import {
  isolateActionForDeploymentTenant,
  LEGACY_ACTION_WORKER_BARRIER_RUN_AT,
} from "../server/lib/actions/tenantWorkerIsolation";

test("deployment tenant actions are hidden from legacy global workers", () => {
  const metadata = isolateActionForDeploymentTenant({
    tenantId: 2,
    tenantKey: "exportunity",
    deployTenantKey: "exportunity",
    metadata: { ownerOnlyTest: true },
  });

  assert.equal(metadata.workerScope, "tenant");
  assert.equal(metadata.workerTenantId, 2);
  assert.equal(metadata.workerTenantKey, "exportunity");
  assert.equal(metadata.runAt, LEGACY_ACTION_WORKER_BARRIER_RUN_AT);
  assert.equal(metadata.legacyWorkerBarrier, true);
  assert.equal(metadata.ownerOnlyTest, true);
});

test("tenant worker isolation preserves a real scheduled execution time", () => {
  const scheduledFor = "2026-08-23T09:30:00.000Z";
  const metadata = isolateActionForDeploymentTenant({
    tenantId: 2,
    tenantKey: "exportunity",
    deployTenantKey: "exportunity",
    metadata: { runAt: scheduledFor, runReason: "warmup_interval" },
  });

  assert.equal(metadata.tenantRunAt, scheduledFor);
  assert.equal(metadata.runAt, LEGACY_ACTION_WORKER_BARRIER_RUN_AT);
  assert.equal(metadata.runReason, "warmup_interval");
});

test("another tenant is not relabeled by this deployment", () => {
  const source = { runAt: "2026-08-23T09:30:00.000Z", custom: true };
  const metadata = isolateActionForDeploymentTenant({
    tenantId: 1,
    tenantKey: "bdo",
    deployTenantKey: "exportunity",
    metadata: source,
  });

  assert.deepEqual(metadata, source);
});
