import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { desc, eq } from "drizzle-orm";

import { db } from "@db";
import { engineeringRequests, fabricationJobs, machines, tenants } from "@db/schema";

import { ensureEngineeringKernelTables } from "../server/lib/engineering/ensureTables";
import { compileEngineeringRequest, createEngineeringRequest } from "../server/lib/engineering/kernel";
import { executeMachineRevision } from "../server/lib/engineering/executor";

const ARTIFACT_ROOT = path.join(process.cwd(), "tmp", "test-engineering-artifacts");

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureTenant() {
  const existing = await db.query.tenants.findFirst({ orderBy: desc(tenants.id) });
  if (existing) return existing;
  const [created] = await db
    .insert(tenants)
    .values({
      key: `test-${nanoid(6)}`.toLowerCase(),
      name: "Test Tenant",
      domains: [],
      themeConfig: {},
      featureFlags: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

test.before(async () => {
  process.env.ENGINEERING_ARTIFACTS_ROOT = ARTIFACT_ROOT;
  await ensureEngineeringKernelTables();
  await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
});

test.after(async () => {
  try {
    await fs.rm(ARTIFACT_ROOT, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

test("Engineering Kernel: intent -> compile -> execute (no human)", async () => {
  const tenant = await ensureTenant();
  const intent =
    "Dry gold recovery for 1-2 t/h artisanal mine, minimal water, West Africa. Portable skid preferred.";

  const created = await createEngineeringRequest({
    tenantId: tenant.id,
    projectId: `test-project-${nanoid(6)}`,
    intent,
    input: { budgetUsd: 150000, geography: "West Africa", timelineDays: 30 },
  });

  const compiled = await compileEngineeringRequest({ tenantId: tenant.id, requestId: created.id });
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;

  assert.equal(compiled.status, "compiled");
  assert.equal(compiled.machineFamily, "dry_gold_recovery_system");
  assert.ok(compiled.revisionId > 0);

  const executed = await executeMachineRevision({
    tenantId: tenant.id,
    revisionId: compiled.revisionId,
    nodeId: "test-node",
  });

  assert.equal(executed.ok, true);
  if (!executed.ok) return;

  assert.ok(await pathExists(executed.artifactsLocation));
  assert.ok(await pathExists(path.join(executed.artifactsLocation, "bom.json")));
  assert.ok(await pathExists(path.join(executed.artifactsLocation, "cut_list.csv")));
  assert.ok(await pathExists(path.join(executed.artifactsLocation, "weld_map.txt")));
  assert.ok(await pathExists(path.join(executed.artifactsLocation, "assembly_instructions.md")));
  assert.ok(await pathExists(path.join(executed.artifactsLocation, "model.step")));
  assert.ok(await pathExists(path.join(executed.artifactsLocation, "model.dxf")));
  assert.ok(await pathExists(path.join(executed.artifactsLocation, "model.stl")));

  const reqRow = await db.query.engineeringRequests.findFirst({ where: eq(engineeringRequests.id, created.id) });
  assert.ok(reqRow);
  assert.equal(reqRow!.status, "executed");

  const machineRow = await db.query.machines.findFirst({ where: eq(machines.id, compiled.machineId) });
  assert.ok(machineRow);
  assert.equal(machineRow!.status, "executed");

  const jobRow = await db.query.fabricationJobs.findFirst({ where: eq(fabricationJobs.id, executed.jobId) });
  assert.ok(jobRow);
  assert.equal(jobRow!.status, "completed");
});

