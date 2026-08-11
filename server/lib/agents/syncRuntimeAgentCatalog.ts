import { db } from "@db";
import { sql } from "drizzle-orm";
import { ensureAgentsOsMarketplaceTables } from "../agent-os/ensureMarketplaceCatalog";
import { filterProductionAgentIds } from "./productionAllowlist";
import { resolveAgentRuntimeEnv } from "./visibility";

export type RuntimeAgentCatalogRow = {
  id: number;
  tenant_id: number | null;
  name: string;
  role: string | null;
  status: string | null;
  avatar: string | null;
  avatar_url: string | null;
  manager_id: number | null;
  department_id: number | null;
  is_department_head: boolean | null;
  base_budget: number | string | null;
  mission: string | null;
  cv: string | null;
};

type SyncRuntimeAgentInput = {
  tenantId: number;
  runtime: RuntimeAgentCatalogRow;
  actorUserId?: number | null;
  ensureTables?: boolean;
};

type SyncRuntimeAgentResult = {
  created: number;
  updated: number;
  skipped: number;
  runtimeAgentId: number;
  reason?: string;
};

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function slugify(value: unknown) {
  return asString(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function toNumber(value: unknown, fallback: number) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getRows<T = any>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

export function inferRuntimeAgentCategory(role: unknown) {
  const value = asString(role).toLowerCase();
  if (!value) return "operations";
  if (value.includes("compliance") || value.includes("legal")) return "compliance";
  if (value.includes("finance") || value.includes("treasury") || value.includes("payment")) return "finance";
  if (value.includes("support") || value.includes("customer")) return "support";
  if (value.includes("market") || value.includes("growth") || value.includes("sales") || value.includes("hunter")) return "marketing";
  if (value.includes("chairman") || value.includes("executive")) return "executive";
  return "operations";
}

export function mapRuntimeAgentStatus(status: unknown) {
  const value = asString(status).toLowerCase();
  if (value === "active") return "active";
  if (value === "archived" || value === "inactive") return "retired";
  return "draft";
}

export function buildRuntimeAgentCatalogIdentity(runtime: RuntimeAgentCatalogRow, tenantId: number) {
  const runtimeAgentId = Number(runtime.id);
  const displayName = asString(runtime.name) || `Runtime Agent ${runtimeAgentId}`;
  const roleTitle = asString(runtime.role) || displayName;
  const status = mapRuntimeAgentStatus(runtime.status);

  return {
    runtimeAgentId,
    code: `runtime-${tenantId}-${runtimeAgentId}`,
    slug: `runtime-${slugify(displayName || `agent-${runtimeAgentId}`)}-${runtimeAgentId}`,
    displayName,
    roleTitle,
    category: inferRuntimeAgentCategory(runtime.role),
    shortPitch: asString(runtime.mission).slice(0, 300),
    longDescription: asString(runtime.cv),
    avatarUrl: asString(runtime.avatar_url || runtime.avatar) || null,
    status,
    isActive: status !== "retired",
    baseSalary: Math.max(0, toNumber(runtime.base_budget, 0)),
  };
}

export async function listRuntimeAgentsForCatalog(tenantId: number) {
  const runtimeEnv = resolveAgentRuntimeEnv();
  const rows = getRows<RuntimeAgentCatalogRow>(
    await db.execute(sql`
      select
        id,
        tenant_id,
        name,
        role,
        status::text as status,
        avatar,
        avatar_url,
        manager_id,
        department_id,
        is_department_head,
        base_budget,
        mission,
        cv
      from agents
      where tenant_id = ${tenantId}
        and env = ${runtimeEnv}
        and coalesce(is_visible, true) = true
        and coalesce(status::text, 'active') <> 'archived'
      order by name asc
    `),
  ).map((row) => ({
    ...row,
    id: Number(row.id),
    tenant_id: row.tenant_id == null ? null : Number(row.tenant_id),
    manager_id: row.manager_id == null ? null : Number(row.manager_id),
    department_id: row.department_id == null ? null : Number(row.department_id),
  }));

  const allowedAgentIds = await filterProductionAgentIds({
    tenantId,
    agentIds: rows.map((row) => row.id),
    context: "admin:agents-os:runtime-sync",
  });
  const allowed = new Set(allowedAgentIds.map(Number));
  return rows.filter((row) => allowed.has(row.id));
}

export async function loadRuntimeAgentForCatalog(tenantId: number, runtimeAgentId: number) {
  const rows = getRows<RuntimeAgentCatalogRow>(
    await db.execute(sql`
      select
        id,
        tenant_id,
        name,
        role,
        status::text as status,
        avatar,
        avatar_url,
        manager_id,
        department_id,
        is_department_head,
        base_budget,
        mission,
        cv
      from agents
      where id = ${runtimeAgentId} and tenant_id = ${tenantId}
      limit 1
    `),
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    tenant_id: row.tenant_id == null ? null : Number(row.tenant_id),
    manager_id: row.manager_id == null ? null : Number(row.manager_id),
    department_id: row.department_id == null ? null : Number(row.department_id),
  };
}

export async function syncRuntimeAgentToCatalog(input: SyncRuntimeAgentInput): Promise<SyncRuntimeAgentResult> {
  const tenantId = Number(input.tenantId);
  const runtimeAgentId = Number(input.runtime.id);
  if (!Number.isInteger(tenantId) || tenantId <= 0 || !Number.isInteger(runtimeAgentId) || runtimeAgentId <= 0) {
    return { created: 0, updated: 0, skipped: 1, runtimeAgentId, reason: "invalid_identity" };
  }
  if (Number(input.runtime.tenant_id) !== tenantId) {
    return { created: 0, updated: 0, skipped: 1, runtimeAgentId, reason: "tenant_mismatch" };
  }

  const allowed = await filterProductionAgentIds({
    tenantId,
    agentIds: [runtimeAgentId],
    context: "agent-profile:catalog-sync",
  });
  if (!allowed.includes(runtimeAgentId)) {
    return { created: 0, updated: 0, skipped: 1, runtimeAgentId, reason: "not_production_enabled" };
  }

  if (input.ensureTables !== false) await ensureAgentsOsMarketplaceTables();

  const identity = buildRuntimeAgentCatalogIdentity(input.runtime, tenantId);
  const existing = getRows<{ id: number; approval_policy: Record<string, unknown> | null }>(
    await db.execute(sql`
      select id, approval_policy
      from ece_agent_templates
      where tenant_id = ${tenantId} and code = ${identity.code}
      limit 1
    `),
  )[0];
  const approvalPolicy = {
    ...(existing?.approval_policy && typeof existing.approval_policy === "object" ? existing.approval_policy : {}),
    runtimeAgentId,
    runtimeManagerId: input.runtime.manager_id ?? null,
    runtimeDepartmentId: input.runtime.department_id ?? null,
    runtimeDepartmentHead: Boolean(input.runtime.is_department_head),
    source: "runtime_agents",
    syncedAt: new Date().toISOString(),
  };
  const actorUserId = input.actorUserId ? Number(input.actorUserId) : null;

  if (existing?.id) {
    await db.execute(sql`
      update ece_agent_templates
      set
        title = ${identity.displayName},
        role_title = ${identity.roleTitle},
        category = ${identity.category},
        short_pitch = ${identity.shortPitch || null},
        long_description = ${identity.longDescription || null},
        description = ${identity.shortPitch || null},
        base_model = coalesce(nullif(base_model, ''), 'gpt-5'),
        autonomy_level = coalesce(autonomy_level, 2),
        approval_policy = ${JSON.stringify(approvalPolicy)}::jsonb,
        avatar_url = ${identity.avatarUrl},
        status = ${identity.status},
        is_active = ${identity.isActive},
        updated_by_user_id = ${actorUserId},
        updated_at = now()
      where id = ${Number(existing.id)} and tenant_id = ${tenantId}
    `);
  } else {
    await db.execute(sql`
      insert into ece_agent_templates (
        tenant_id, code, slug, title, description, category, role_title, short_pitch, long_description,
        base_model, personality_profile, autonomy_level, approval_policy, knowledge_base_id, avatar_url,
        status, visibility, is_active, base_salary_monthly, created_by_user_id, updated_by_user_id, created_at, updated_at
      )
      values (
        ${tenantId}, ${identity.code}, ${identity.slug}, ${identity.displayName}, ${identity.shortPitch || null},
        ${identity.category}, ${identity.roleTitle}, ${identity.shortPitch || null}, ${identity.longDescription || null},
        'gpt-5', '{}'::jsonb, 2, ${JSON.stringify(approvalPolicy)}::jsonb, null, ${identity.avatarUrl},
        ${identity.status}, 'private', ${identity.isActive}, ${identity.baseSalary}, ${actorUserId}, ${actorUserId}, now(), now()
      )
    `);
  }

  await db.execute(sql`
    insert into agent_marketplace_profiles (
      agent_id, tenant_id, is_visible, price_monthly, currency, tags, is_featured, sort_rank, availability, created_at, updated_at
    )
    select id, ${tenantId}, false, ${identity.baseSalary}, 'USD', '[]'::jsonb, false, 0, 'available', now(), now()
    from ece_agent_templates
    where tenant_id = ${tenantId} and code = ${identity.code}
    on conflict (tenant_id, agent_id) do nothing
  `);

  return {
    created: existing?.id ? 0 : 1,
    updated: existing?.id ? 1 : 0,
    skipped: 0,
    runtimeAgentId,
  };
}

export async function syncRuntimeAgentByIdToCatalog(input: {
  tenantId: number;
  runtimeAgentId: number;
  actorUserId?: number | null;
}) {
  const runtime = await loadRuntimeAgentForCatalog(input.tenantId, input.runtimeAgentId);
  if (!runtime) {
    return {
      created: 0,
      updated: 0,
      skipped: 1,
      runtimeAgentId: Number(input.runtimeAgentId),
      reason: "runtime_agent_not_found",
    } satisfies SyncRuntimeAgentResult;
  }
  return syncRuntimeAgentToCatalog({
    tenantId: input.tenantId,
    runtime,
    actorUserId: input.actorUserId,
  });
}

export async function syncRuntimeAgentsToCatalog(input: {
  tenantId: number;
  actorUserId?: number | null;
}) {
  await ensureAgentsOsMarketplaceTables();
  const runtimeAgents = await listRuntimeAgentsForCatalog(input.tenantId);
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const runtime of runtimeAgents) {
    const result = await syncRuntimeAgentToCatalog({
      tenantId: input.tenantId,
      runtime,
      actorUserId: input.actorUserId,
      ensureTables: false,
    });
    created += result.created;
    updated += result.updated;
    skipped += result.skipped;
  }

  return { runtimeCount: runtimeAgents.length, created, updated, skipped };
}
