import test from "node:test";
import assert from "node:assert/strict";
import { desc, eq } from "drizzle-orm";

import { db } from "@db";
import { agents, companies, tenants } from "@db/schema";
import { ensureAgentVisibilityColumns } from "../server/lib/agents/ensureVisibilityColumns";
import { createActionRequest } from "../server/lib/actions/ActionRouter";

async function ensureTenantId() {
  const row = await db.query.tenants.findFirst({ orderBy: desc(tenants.id), columns: { id: true } });
  if (!row) throw new Error("No tenant found");
  return Number(row.id);
}

async function ensureCompanyId() {
  const existing = await db.query.companies.findFirst({ orderBy: desc(companies.id), columns: { id: true } });
  if (existing) return Number(existing.id);
  const [created] = await db
    .insert(companies)
    .values({
      name: "Action Visibility Test Company",
      metadata: { test: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: companies.id });
  return Number(created.id);
}

async function createAgentRow(input: { companyId: number; name: string; status: "active" | "archived"; isTest: boolean; isVisible: boolean }) {
  const [created] = await db
    .insert(agents)
    .values({
      companyId: input.companyId,
      name: input.name,
      role: "Tester",
      env: "prod",
      status: input.status,
      isTest: input.isTest,
      isVisible: input.isVisible,
      permissions: { email: true, crm: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: agents.id });
  return Number(created.id);
}

test("createActionRequest blocks archived/test agents", async () => {
  await ensureAgentVisibilityColumns();
  const tenantId = await ensureTenantId();
  const companyId = await ensureCompanyId();
  const archivedAgentId = await createAgentRow({
    companyId,
    name: "Visibility Archived Test Agent",
    status: "archived",
    isTest: true,
    isVisible: false,
  });

  await assert.rejects(
    () =>
      createActionRequest({
        tenantId,
        requestedByUserId: null,
        requestedByAgentKey: "support",
        actionType: "CREATE_TASK",
        payload: { agentId: archivedAgentId, title: "Should fail" },
      }),
    /not runnable|blocked/i,
  );
  await db.delete(agents).where(eq(agents.id, archivedAgentId));
});

test("createActionRequest allows active visible non-test agents", async () => {
  await ensureAgentVisibilityColumns();
  const tenantId = await ensureTenantId();
  const companyId = await ensureCompanyId();
  const activeAgentId = await createAgentRow({
    companyId,
    name: "Visibility Active Agent",
    status: "active",
    isTest: false,
    isVisible: true,
  });

  const row = await createActionRequest({
    tenantId,
    requestedByUserId: null,
    requestedByAgentKey: "support",
    actionType: "CREATE_TASK",
    payload: { agentId: activeAgentId, title: "Should pass" },
  });

  assert.equal(Number((row as any).id) > 0, true);
  assert.equal(String((row as any).status), "QUEUED");
  await db.delete(agents).where(eq(agents.id, activeAgentId));
});
