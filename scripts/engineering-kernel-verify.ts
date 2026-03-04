import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { desc } from "drizzle-orm";

import { db } from "@db";
import { tenants } from "@db/schema";

import { ensureEngineeringKernelTables } from "../server/lib/engineering/ensureTables";
import { compileEngineeringRequest, createEngineeringRequest } from "../server/lib/engineering/kernel";
import { executeMachineRevision } from "../server/lib/engineering/executor";

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

async function main() {
  const artifactRoot = path.join(process.cwd(), "tmp", "engineering-kernel-verify-artifacts");
  process.env.ENGINEERING_ARTIFACTS_ROOT = artifactRoot;
  await fs.mkdir(artifactRoot, { recursive: true });

  await ensureEngineeringKernelTables();
  const tenant = await ensureTenant();

  const created = await createEngineeringRequest({
    tenantId: tenant.id,
    projectId: `verify-project-${nanoid(6)}`,
    intent: "Dry gold recovery for 1-2 t/h artisanal mine, minimal water, West Africa.",
    input: { budgetUsd: 150000, geography: "West Africa", timelineDays: 30 },
  });

  const compiled = await compileEngineeringRequest({ tenantId: tenant.id, requestId: created.id });
  if (!compiled.ok) {
    console.error("[engineering:verify] compile failed:", compiled);
    process.exit(1);
  }

  const executed = await executeMachineRevision({
    tenantId: tenant.id,
    revisionId: compiled.revisionId,
    nodeId: "local-sim",
  });

  if (!executed.ok) {
    console.error("[engineering:verify] execute failed:", executed);
    process.exit(1);
  }

  const requiredFiles = [
    "bom.json",
    "cut_list.csv",
    "weld_map.txt",
    "assembly_instructions.md",
    "model.step",
    "model.dxf",
    "model.stl",
  ];

  for (const file of requiredFiles) {
    const target = path.join(executed.artifactsLocation, file);
    if (!(await pathExists(target))) {
      console.error("[engineering:verify] missing artifact:", target);
      process.exit(1);
    }
  }

  console.log("[engineering:verify] ok", {
    tenantId: tenant.id,
    requestId: created.id,
    machineId: compiled.machineId,
    revisionId: compiled.revisionId,
    jobId: executed.jobId,
    artifactsLocation: executed.artifactsLocation,
  });
}

main().catch((err) => {
  console.error("[engineering:verify] failed:", err?.message || err);
  process.exit(1);
});

