import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@db";
import { ensureTenantAdmin } from "./utils/auth";
import { ensureAgentsOsMarketplaceTables } from "../lib/agent-os/ensureMarketplaceCatalog";
import { filterProductionAgentIds } from "../lib/agents/productionAllowlist";
import { resolveAgentRuntimeEnv } from "../lib/agents/visibility";

const router = Router();
const RUNTIME_SYNC_TTL_MS = 60_000;
const runtimeSyncAt = new Map<number, number>();

type RuntimeAgentRow = {
  id: number;
  name: string;
  role: string | null;
  status: string | null;
  avatar: string | null;
  manager_id: number | null;
  department_id: number | null;
  is_department_head: boolean | null;
  base_budget: number | string | null;
  metadata: any;
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

function toInt(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function toNumber(value: unknown, fallback: number) {
  const parsed = Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function getRows<T = any>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((x) => asString(x)).filter(Boolean).slice(0, 50);
  if (typeof value === "string") return value.split(",").map((x) => asString(x)).filter(Boolean).slice(0, 50);
  return [];
}

function normalizeCategory(value: unknown) {
  const raw = asString(value).toLowerCase();
  return raw || "operations";
}

function resolveTenant(req: any, res: any) {
  const tenant = req?.tenant;
  if (!tenant?.id) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return { tenantId: Number(tenant.id), tenantKey: String(tenant.key || "tenant") };
}

export function resolveActorRole(user: any) {
  const role = asString(user?.role).toLowerCase();
  const roles = Array.isArray(user?.roles) ? user.roles.map((x: any) => asString(x).toLowerCase()) : [];
  if (roles.includes("super_admin") || role === "super_admin") return "super_admin";
  if (roles.includes("chairman") || role === "chairman") return "chairman";
  if (roles.includes("admin") || role === "admin") return "admin";
  if (roles.includes("operator") || role === "operator") return "operator";
  return role || "viewer";
}

export function canPublishMarketplace(user: any) {
  const role = resolveActorRole(user);
  if (role === "chairman" || role === "super_admin") return true;
  const perms = Array.isArray(user?.permissions) ? user.permissions.map((x: any) => asString(x)) : [];
  return perms.includes("*") || perms.includes("admin:*") || perms.includes("agents.publish_marketplace");
}

async function writeAudit(input: {
  tenantId: number;
  actor: any;
  action: string;
  entityType: string;
  entityId: number | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  req: any;
}) {
  const actorRole = resolveActorRole(input.actor);
  await db.execute(sql`
    insert into ece_audit_logs (
      tenant_id, user_id, user_role, action, entity_type, entity_id, previous_state, new_state, ip_address, user_agent, metadata, created_at
    )
    values (
      ${input.tenantId},
      ${input.actor?.id ? Number(input.actor.id) : null},
      ${actorRole},
      ${input.action},
      ${input.entityType},
      ${input.entityId},
      ${JSON.stringify(input.before ?? null)}::jsonb,
      ${JSON.stringify(input.after ?? null)}::jsonb,
      ${String(input.req?.ip || input.req?.headers?.["x-forwarded-for"] || "")},
      ${String(input.req?.headers?.["user-agent"] || "")},
      ${JSON.stringify(input.metadata ?? {})}::jsonb,
      now()
    )
  `);
}

async function buildUniqueSlug(tenantId: number, initial: string) {
  const base = slugify(initial) || `agent-${Date.now().toString(36)}`;
  let candidate = base;
  for (let i = 0; i < 50; i += 1) {
    const exists = await db.execute(sql`
      select id
      from ece_agent_templates
      where tenant_id = ${tenantId} and slug = ${candidate}
      limit 1
    `);
    if (!getRows(exists).length) return candidate;
    candidate = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function normalizeVisibility(value: unknown) {
  const raw = asString(value).toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes" || raw === "public") return true;
  if (raw === "false" || raw === "0" || raw === "no" || raw === "private") return false;
  if (typeof value === "boolean") return value;
  return false;
}

function normalizeStatus(value: unknown) {
  const raw = asString(value).toLowerCase();
  if (raw === "active" || raw === "retired" || raw === "draft") return raw;
  return "draft";
}

function normalizeAvailability(value: unknown) {
  const raw = asString(value).toLowerCase();
  if (raw === "available" || raw === "paused" || raw === "waitlist") return raw;
  return "available";
}

function normalizeSort(value: unknown, fallback: "new" | "featured" | "trending") {
  const raw = asString(value).toLowerCase();
  if (raw === "new" || raw === "featured" || raw === "trending") return raw as typeof fallback;
  return fallback;
}

function shouldSyncRuntimeOnRead(req: any) {
  const flag = asString(req?.query?.syncRuntime || req?.query?.sync || req?.query?.refreshRuntime).toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

async function maybeSyncRuntimeOnRead(input: {
  tenantId: number;
  tenantKey: string;
  actor?: any;
  req?: any;
}) {
  if (shouldSyncRuntimeOnRead(input.req)) {
    return syncRuntimeAgentsIntoCatalog({
      tenantId: input.tenantId,
      tenantKey: input.tenantKey,
      actor: input.actor,
      req: input.req,
    });
  }

  const rows = getRows<{ total: number }>(
    await db.execute(sql`
      select count(*)::int as total
      from ece_agent_templates
      where tenant_id = ${input.tenantId}
    `),
  );
  const total = Number(rows[0]?.total || 0);
  if (total > 0) {
    return {
      runtimeCount: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      throttled: true,
      reason: "catalog_not_empty",
    };
  }

  return syncRuntimeAgentsIntoCatalog({
    tenantId: input.tenantId,
    tenantKey: input.tenantKey,
    actor: input.actor,
    req: input.req,
  });
}

function inferCategoryFromRole(role: unknown) {
  const value = asString(role).toLowerCase();
  if (!value) return "operations";
  if (value.includes("compliance") || value.includes("legal")) return "compliance";
  if (value.includes("finance") || value.includes("treasury") || value.includes("payment")) return "finance";
  if (value.includes("support") || value.includes("customer")) return "support";
  if (value.includes("market") || value.includes("growth") || value.includes("sales") || value.includes("hunter")) return "marketing";
  if (value.includes("chairman") || value.includes("executive")) return "executive";
  return "operations";
}

function mapRuntimeStatusToCatalogStatus(status: unknown) {
  const value = asString(status).toLowerCase();
  if (value === "active") return "active";
  if (value === "archived") return "retired";
  if (value === "inactive") return "retired";
  return "draft";
}

async function listRuntimeAgentsForTenant(tenantId: number) {
  const runtimeEnv = resolveAgentRuntimeEnv();
  const rows = getRows<RuntimeAgentRow>(
    await db.execute(sql`
      select
        id,
        name,
        role,
        status::text as status,
        avatar,
        manager_id,
        department_id,
        is_department_head,
        base_budget,
        metadata
      from agents
      where env = ${runtimeEnv}
        and coalesce(is_visible, true) = true
        and coalesce(status::text, 'active') <> 'archived'
      order by name asc
    `),
  ).map((row) => ({
    ...row,
    id: Number(row.id),
    manager_id: row.manager_id == null ? null : Number(row.manager_id),
    department_id: row.department_id == null ? null : Number(row.department_id),
  }));

  const allowedAgentIds = await filterProductionAgentIds({
    tenantId,
    agentIds: rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0),
    context: "admin:agents-os:runtime-sync",
  });
  const allowed = new Set(allowedAgentIds.map((id) => Number(id)));
  return rows.filter((row) => allowed.has(Number(row.id)));
}

async function syncRuntimeAgentsIntoCatalog(input: {
  tenantId: number;
  tenantKey: string;
  actor?: any;
  req?: any;
  force?: boolean;
}) {
  const nowMs = Date.now();
  if (!input.force) {
    const lastSyncAt = runtimeSyncAt.get(input.tenantId) || 0;
    if (nowMs - lastSyncAt < RUNTIME_SYNC_TTL_MS) {
      return {
        runtimeCount: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        throttled: true,
      };
    }
  }

  const runtimeAgents = await listRuntimeAgentsForTenant(input.tenantId);
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const runtime of runtimeAgents) {
    const runtimeId = Number(runtime.id);
    if (!Number.isInteger(runtimeId) || runtimeId <= 0) {
      skipped += 1;
      continue;
    }

    const code = `runtime-${input.tenantId}-${runtimeId}`;
    const slug = `runtime-${slugify(runtime.name || `agent-${runtimeId}`)}-${runtimeId}`;
    const displayName = asString(runtime.name) || `Runtime Agent ${runtimeId}`;
    const roleTitle = asString(runtime.role) || displayName;
    const category = inferCategoryFromRole(runtime.role);
    const runtimeStatus = mapRuntimeStatusToCatalogStatus(runtime.status);
    const shortPitch = asString((runtime as any)?.metadata?.mission || "").slice(0, 300);
    const longDescription = asString((runtime as any)?.metadata?.cv || "");
    const approvalPolicy = {
      runtimeAgentId: runtimeId,
      runtimeManagerId: runtime.manager_id ?? null,
      runtimeDepartmentId: runtime.department_id ?? null,
      runtimeDepartmentHead: Boolean(runtime.is_department_head),
      source: "runtime_agents",
      syncedAt: new Date().toISOString(),
    };
    const baseSalary = Math.max(0, toNumber(runtime.base_budget, 0));

    const existing = getRows<any>(
      await db.execute(sql`
        select id
        from ece_agent_templates
        where code = ${code}
        limit 1
      `),
    )[0];

    if (existing?.id) {
      await db.execute(sql`
        update ece_agent_templates
        set
          tenant_id = ${input.tenantId},
          title = ${displayName},
          role_title = ${roleTitle},
          category = ${category},
          short_pitch = ${shortPitch || null},
          long_description = ${longDescription || null},
          description = ${shortPitch || null},
          base_model = coalesce(nullif(base_model, ''), 'gpt-5'),
          autonomy_level = coalesce(autonomy_level, 2),
          approval_policy = ${JSON.stringify(approvalPolicy)}::jsonb,
          avatar_url = ${asString(runtime.avatar) || null},
          status = ${runtimeStatus},
          is_active = ${runtimeStatus !== "retired"},
          updated_by_user_id = ${input.actor?.id ? Number(input.actor.id) : null},
          updated_at = now()
        where id = ${Number(existing.id)}
      `);
      updated += 1;
    } else {
      await db.execute(sql`
        insert into ece_agent_templates (
          tenant_id, code, slug, title, description, category, role_title, short_pitch, long_description,
          base_model, personality_profile, autonomy_level, approval_policy, knowledge_base_id, avatar_url,
          status, visibility, is_active, base_salary_monthly, created_by_user_id, updated_by_user_id, created_at, updated_at
        )
        values (
          ${input.tenantId},
          ${code},
          ${slug},
          ${displayName},
          ${shortPitch || null},
          ${category},
          ${roleTitle},
          ${shortPitch || null},
          ${longDescription || null},
          'gpt-5',
          '{}'::jsonb,
          2,
          ${JSON.stringify(approvalPolicy)}::jsonb,
          null,
          ${asString(runtime.avatar) || null},
          ${runtimeStatus},
          'private',
          ${runtimeStatus !== "retired"},
          ${baseSalary},
          ${input.actor?.id ? Number(input.actor.id) : null},
          ${input.actor?.id ? Number(input.actor.id) : null},
          now(),
          now()
        )
      `);
      created += 1;
    }

    await db.execute(sql`
      insert into agent_marketplace_profiles (
        agent_id, tenant_id, is_visible, price_monthly, currency, tags, is_featured, sort_rank, availability, created_at, updated_at
      )
      select id, ${input.tenantId}, false, ${baseSalary}, 'USD', '[]'::jsonb, false, 0, 'available', now(), now()
      from ece_agent_templates
      where code = ${code}
      on conflict (tenant_id, agent_id) do nothing
    `);
  }

  runtimeSyncAt.set(input.tenantId, nowMs);

  return {
    runtimeCount: runtimeAgents.length,
    created,
    updated,
    skipped,
    throttled: false,
  };
}

const AGENTS_OS_SEED_PRESET = [
  { name: "Chairman Assistant", role: "Executive Assistant", category: "executive", pitch: "Coordinates executive priorities, schedules, and follow-ups." },
  { name: "Operations Coordinator", role: "Operations Coordinator", category: "operations", pitch: "Runs daily execution, escalations, and cross-team coordination." },
  { name: "Marketplace Ops Lead", role: "Marketplace Operations Lead", category: "operations", pitch: "Monitors supply quality, catalog readiness, and fulfillment flow." },
  { name: "Compliance & AML Officer", role: "Compliance Officer", category: "compliance", pitch: "Tracks KYC/KYB compliance, AML checks, and audit trails." },
  { name: "Treasury & Payments Controller", role: "Treasury Controller", category: "finance", pitch: "Oversees liquidity, payouts, and payment reconciliations." },
  { name: "Client Hunter / Partnerships", role: "Partnerships Lead", category: "marketing", pitch: "Sources strategic accounts and negotiates partnerships." },
  { name: "Customer Support & Disputes", role: "Support Lead", category: "support", pitch: "Handles support escalations and dispute resolution workflows." },
  { name: "HR Specialist", role: "HR Specialist", category: "operations", pitch: "Manages staffing, onboarding, and internal policy alignment." },
  { name: "Finance Manager", role: "Finance Manager", category: "finance", pitch: "Tracks performance, budgets, and financial reporting cadence." },
  { name: "Product Manager (Agents OS)", role: "Product Manager", category: "operations", pitch: "Owns agent roadmap, release quality, and operational fit." },
  { name: "DevOps / Platform Reliability", role: "Platform Reliability Engineer", category: "operations", pitch: "Maintains deployment reliability, monitoring, and incident response." },
];

router.get("/marketplace/agents", async (req: any, res) => {
  try {
    await ensureAgentsOsMarketplaceTables();
    const tenant = resolveTenant(req, res);
    if (!tenant) return;

    const page = Math.max(1, toInt(req.query?.page, 1));
    const pageSize = Math.max(1, Math.min(50, toInt(req.query?.pageSize, 12)));
    const offset = (page - 1) * pageSize;

    const category = asString(req.query?.category).toLowerCase();
    const q = asString(req.query?.q);
    const sort = normalizeSort(req.query?.sort, "trending");

    const whereParts: any[] = [
      sql`mp.tenant_id = ${tenant.tenantId}`,
      sql`coalesce(mp.is_visible, false) = true`,
      sql`coalesce(t.status::text, 'draft') = 'active'`,
      sql`coalesce(t.is_active, true) = true`,
      sql`(t.tenant_id = ${tenant.tenantId} or t.tenant_id is null)`,
    ];
    if (category) whereParts.push(sql`lower(coalesce(t.category, '')) = ${category}`);
    if (q) {
      const like = `%${q}%`;
      whereParts.push(
        sql`(
          t.title ilike ${like}
          or coalesce(t.role_title, '') ilike ${like}
          or coalesce(t.short_pitch, '') ilike ${like}
          or coalesce(t.long_description, '') ilike ${like}
        )`,
      );
    }
    const whereClause = sql`where ${sql.join(whereParts, sql` and `)}`;

    const orderBy =
      sort === "featured"
        ? sql`mp.is_featured desc, mp.sort_rank asc, mp.updated_at desc`
        : sort === "new"
          ? sql`t.created_at desc`
          : sql`mp.sort_rank asc, mp.updated_at desc, t.created_at desc`;

    const listResult = await db.execute(sql`
      select
        t.id,
        t.slug,
        t.title as display_name,
        coalesce(nullif(t.role_title, ''), t.title) as role_title,
        coalesce(t.short_pitch, t.description, '') as short_pitch,
        coalesce(t.long_description, t.description, '') as long_description,
        coalesce(t.category, 'operations') as category,
        coalesce(t.avatar_url, '') as avatar_url,
        coalesce(mp.price_monthly, t.base_salary_monthly, 0) as price_monthly,
        coalesce(mp.currency, 'USD') as currency,
        coalesce(mp.tags, '[]'::jsonb) as tags,
        coalesce(mp.is_featured, false) as is_featured,
        coalesce(mp.availability, 'available') as availability
      from ece_agent_templates t
      join agent_marketplace_profiles mp
        on mp.agent_id = t.id and mp.tenant_id = ${tenant.tenantId}
      ${whereClause}
      order by ${orderBy}
      limit ${pageSize}
      offset ${offset}
    `);

    const countResult = await db.execute(sql`
      select count(*)::int as total
      from ece_agent_templates t
      join agent_marketplace_profiles mp
        on mp.agent_id = t.id and mp.tenant_id = ${tenant.tenantId}
      ${whereClause}
    `);

    const total = Number(getRows<{ total: number }>(countResult)[0]?.total || 0);
    const items = getRows<any>(listResult).map((row) => ({
      id: String(row.id),
      displayName: row.display_name,
      roleTitle: row.role_title,
      shortPitch: row.short_pitch,
      longDescription: row.long_description,
      category: row.category,
      priceMonthly: Number(row.price_monthly || 0),
      currency: row.currency || "USD",
      tags: Array.isArray(row.tags) ? row.tags : [],
      avatarUrl: row.avatar_url || null,
      featured: Boolean(row.is_featured),
      availability: row.availability || "available",
    }));

    res.json({ items, page, pageSize, total });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list marketplace agents" });
  }
});

router.use("/admin", ensureTenantAdmin);

router.get("/admin/agents-os/summary", async (req: any, res) => {
  try {
    await ensureAgentsOsMarketplaceTables();
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    await maybeSyncRuntimeOnRead({
      tenantId: tenant.tenantId,
      tenantKey: tenant.tenantKey,
      actor: req.adminUser,
      req,
    });

    const totals = await db.execute(sql`
      select
        count(*)::int as total_agents,
        count(*) filter (where coalesce(status::text, 'draft') = 'active')::int as active_agents,
        count(*) filter (where coalesce(status::text, 'draft') = 'draft')::int as draft_agents
      from ece_agent_templates
      where tenant_id = ${tenant.tenantId}
    `);

    const market = await db.execute(sql`
      select
        count(*)::int as marketplace_agents,
        count(*) filter (where is_visible = true)::int as marketplace_visible,
        coalesce(sum(price_monthly) filter (where is_visible = true), 0)::numeric as visible_monthly_revenue
      from agent_marketplace_profiles
      where tenant_id = ${tenant.tenantId}
    `);

    const summary = {
      totalAgents: Number(getRows<any>(totals)[0]?.total_agents || 0),
      activeAgents: Number(getRows<any>(totals)[0]?.active_agents || 0),
      draftAgents: Number(getRows<any>(totals)[0]?.draft_agents || 0),
      marketplaceAgents: Number(getRows<any>(market)[0]?.marketplace_agents || 0),
      marketplaceVisible: Number(getRows<any>(market)[0]?.marketplace_visible || 0),
      visibleMonthlyRevenue: Number(getRows<any>(market)[0]?.visible_monthly_revenue || 0),
    };

    res.json({ ok: true, summary });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load Agents OS summary" });
  }
});

router.post("/admin/agents-os/import-runtime", async (req: any, res) => {
  try {
    await ensureAgentsOsMarketplaceTables();
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    const actor = req.adminUser;

    const importResult = await syncRuntimeAgentsIntoCatalog({
      tenantId: tenant.tenantId,
      tenantKey: tenant.tenantKey,
      actor,
      req,
      force: true,
    });

    await writeAudit({
      tenantId: tenant.tenantId,
      actor,
      action: "AGENTS_OS_IMPORT_RUNTIME",
      entityType: "agent",
      entityId: null,
      metadata: importResult,
      req,
    });

    res.json({ ok: true, imported: importResult });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to import runtime agents" });
  }
});

router.post("/admin/agents-os/seed", async (req: any, res) => {
  try {
    await ensureAgentsOsMarketplaceTables();
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    const actor = req.adminUser;

    let seededCreated = 0;
    let seededUpdated = 0;

    for (const seed of AGENTS_OS_SEED_PRESET) {
      const code = `seed-${tenant.tenantId}-${slugify(seed.name)}`;
      const slug = await buildUniqueSlug(tenant.tenantId, seed.name);
      const existing = getRows<any>(
        await db.execute(sql`
          select id
          from ece_agent_templates
          where code = ${code}
          limit 1
        `),
      )[0];

      if (existing?.id) {
        await db.execute(sql`
          update ece_agent_templates
          set
            tenant_id = ${tenant.tenantId},
            title = ${seed.name},
            role_title = ${seed.role},
            category = ${seed.category},
            short_pitch = ${seed.pitch},
            long_description = ${seed.pitch},
            description = ${seed.pitch},
            status = 'active',
            is_active = true,
            updated_by_user_id = ${actor?.id ? Number(actor.id) : null},
            updated_at = now()
          where id = ${Number(existing.id)}
        `);
        seededUpdated += 1;
      } else {
        await db.execute(sql`
          insert into ece_agent_templates (
            tenant_id, code, slug, title, description, category, role_title, short_pitch, long_description,
            base_model, personality_profile, autonomy_level, approval_policy, knowledge_base_id, avatar_url,
            status, visibility, is_active, base_salary_monthly, created_by_user_id, updated_by_user_id, created_at, updated_at
          )
          values (
            ${tenant.tenantId},
            ${code},
            ${slug},
            ${seed.name},
            ${seed.pitch},
            ${seed.category},
            ${seed.role},
            ${seed.pitch},
            ${seed.pitch},
            'gpt-5',
            '{}'::jsonb,
            2,
            '{"source":"agents_os_seed"}'::jsonb,
            null,
            null,
            'active',
            'private',
            true,
            0,
            ${actor?.id ? Number(actor.id) : null},
            ${actor?.id ? Number(actor.id) : null},
            now(),
            now()
          )
        `);
        seededCreated += 1;
      }

      await db.execute(sql`
        insert into agent_marketplace_profiles (
          agent_id, tenant_id, is_visible, price_monthly, currency, tags, is_featured, sort_rank, availability, created_at, updated_at
        )
        select id, ${tenant.tenantId}, false, 0, 'USD', '[]'::jsonb, false, 0, 'available', now(), now()
        from ece_agent_templates
        where code = ${code}
        on conflict (tenant_id, agent_id) do nothing
      `);
    }

    const imported = await syncRuntimeAgentsIntoCatalog({
      tenantId: tenant.tenantId,
      tenantKey: tenant.tenantKey,
      actor,
      req,
      force: true,
    });

    await writeAudit({
      tenantId: tenant.tenantId,
      actor,
      action: "AGENTS_OS_SEED",
      entityType: "agent",
      entityId: null,
      metadata: { seededCreated, seededUpdated, imported },
      req,
    });

    res.json({
      ok: true,
      seeded: { created: seededCreated, updated: seededUpdated },
      imported,
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to seed agents" });
  }
});

router.get("/admin/agents-os/governance", async (req: any, res) => {
  try {
    await ensureAgentsOsMarketplaceTables();
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    await maybeSyncRuntimeOnRead({
      tenantId: tenant.tenantId,
      tenantKey: tenant.tenantKey,
      actor: req.adminUser,
      req,
    });

    const rows = getRows<any>(
      await db.execute(sql`
        select
          id,
          title as display_name,
          coalesce(nullif(role_title, ''), title) as role_title,
          coalesce(category, 'operations') as category,
          coalesce(status::text, 'draft') as status,
          coalesce(approval_policy, '{}'::jsonb) as approval_policy
        from ece_agent_templates
        where tenant_id = ${tenant.tenantId}
        order by title asc
      `),
    );

    const runtimeIdToTemplateId = new Map<number, number>();
    for (const row of rows) {
      const runtimeAgentId = Number((row.approval_policy as any)?.runtimeAgentId || 0);
      if (runtimeAgentId > 0) runtimeIdToTemplateId.set(runtimeAgentId, Number(row.id));
    }

    const nodes = rows.map((row) => {
      const runtimeAgentId = Number((row.approval_policy as any)?.runtimeAgentId || 0) || null;
      const runtimeManagerId = Number((row.approval_policy as any)?.runtimeManagerId || 0) || null;
      const managerTemplateId = runtimeManagerId ? runtimeIdToTemplateId.get(runtimeManagerId) ?? null : null;
      return {
        id: Number(row.id),
        displayName: row.display_name,
        roleTitle: row.role_title,
        category: row.category,
        status: row.status,
        runtimeAgentId,
        runtimeManagerId,
        managerId: managerTemplateId,
        isDepartmentHead: Boolean((row.approval_policy as any)?.runtimeDepartmentHead),
      };
    });

    const byId = new Map<number, any>(nodes.map((node) => [node.id, node]));
    const enriched = nodes.map((node) => ({
      ...node,
      managerName: node.managerId ? byId.get(node.managerId)?.displayName || null : null,
    }));
    const roots = enriched.filter((node) => node.managerId == null).length;
    const orphans = enriched.filter((node) => node.managerId != null && !byId.has(Number(node.managerId))).length;

    res.json({ ok: true, total: enriched.length, roots, orphans, nodes: enriched });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load governance hierarchy" });
  }
});

router.get("/admin/agents", async (req: any, res) => {
  try {
    await ensureAgentsOsMarketplaceTables();
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    await maybeSyncRuntimeOnRead({
      tenantId: tenant.tenantId,
      tenantKey: tenant.tenantKey,
      actor: req.adminUser,
      req,
    });

    const page = Math.max(1, toInt(req.query?.page, 1));
    const pageSize = Math.max(1, Math.min(200, toInt(req.query?.pageSize, 25)));
    const offset = (page - 1) * pageSize;
    const q = asString(req.query?.q);
    const status = asString(req.query?.status).toLowerCase();
    const category = asString(req.query?.category).toLowerCase();
    const sort = asString(req.query?.sort).toLowerCase();

    const whereParts: any[] = [sql`t.tenant_id = ${tenant.tenantId}`];
    if (status) whereParts.push(sql`coalesce(t.status::text, 'draft') = ${status}`);
    if (category) whereParts.push(sql`lower(coalesce(t.category, '')) = ${category}`);
    if (q) {
      const like = `%${q}%`;
      whereParts.push(
        sql`(
          t.title ilike ${like}
          or coalesce(t.role_title, '') ilike ${like}
          or coalesce(t.short_pitch, '') ilike ${like}
          or coalesce(t.long_description, '') ilike ${like}
          or coalesce(t.code, '') ilike ${like}
        )`,
      );
    }
    const whereClause = sql`where ${sql.join(whereParts, sql` and `)}`;

    const orderBy =
      sort === "name"
        ? sql`t.title asc`
        : sort === "updated"
          ? sql`t.updated_at desc`
          : sort === "status"
            ? sql`t.status asc, t.updated_at desc`
            : sql`t.created_at desc`;

    const rows = await db.execute(sql`
      select
        t.id,
        t.slug,
        t.code,
        t.title as display_name,
        coalesce(nullif(t.role_title, ''), t.title) as role_title,
        coalesce(t.category, 'operations') as category,
        coalesce(t.short_pitch, t.description, '') as short_pitch,
        coalesce(t.long_description, t.description, '') as long_description,
        coalesce(t.base_model, 'gpt-5') as base_model,
        coalesce(t.autonomy_level, 2) as autonomy_level,
        coalesce(t.status::text, 'draft') as status,
        coalesce(t.avatar_url, '') as avatar_url,
        case
          when coalesce(t.approval_policy->>'runtimeAgentId', t.approval_policy->>'runtime_agent_id', '') ~ '^[0-9]+$'
            then coalesce(t.approval_policy->>'runtimeAgentId', t.approval_policy->>'runtime_agent_id')::int
          else null
        end as runtime_agent_id,
        coalesce(mp.is_visible, false) as marketplace_visible,
        coalesce(mp.price_monthly, t.base_salary_monthly, 0) as price_monthly,
        coalesce(mp.currency, 'USD') as currency,
        coalesce(mp.is_featured, false) as is_featured,
        coalesce(mp.sort_rank, 0) as sort_rank,
        coalesce(mp.availability, 'available') as availability,
        t.created_at,
        t.updated_at
      from ece_agent_templates t
      left join agent_marketplace_profiles mp
        on mp.agent_id = t.id and mp.tenant_id = ${tenant.tenantId}
      ${whereClause}
      order by ${orderBy}
      limit ${pageSize}
      offset ${offset}
    `);

    const totalResult = await db.execute(sql`
      select count(*)::int as total
      from ece_agent_templates t
      ${whereClause}
    `);

    res.json({
      ok: true,
      page,
      pageSize,
      total: Number(getRows<any>(totalResult)[0]?.total || 0),
      items: getRows(rows),
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list agents" });
  }
});

router.post("/admin/agents", async (req: any, res) => {
  try {
    await ensureAgentsOsMarketplaceTables();
    const tenant = resolveTenant(req, res);
    if (!tenant) return;

    const actor = req.adminUser;
    const displayName = asString(req.body?.displayName || req.body?.display_name || req.body?.title);
    if (!displayName) return res.status(400).json({ message: "displayName is required" });

    const roleTitle = asString(req.body?.roleTitle || req.body?.role_title || displayName);
    const category = normalizeCategory(req.body?.category);
    const shortPitch = asString(req.body?.shortPitch || req.body?.short_pitch || req.body?.description);
    const longDescription = asString(req.body?.longDescription || req.body?.long_description);
    const baseModel = asString(req.body?.baseModel || req.body?.base_model || "gpt-5");
    const autonomyLevel = Math.max(0, Math.min(5, toInt(req.body?.autonomyLevel, 2)));
    const approvalPolicy = typeof req.body?.approvalPolicy === "object" && req.body.approvalPolicy ? req.body.approvalPolicy : {};
    const personalityProfile = typeof req.body?.personalityProfile === "object" && req.body.personalityProfile ? req.body.personalityProfile : {};
    const knowledgeBaseId = toInt(req.body?.knowledgeBaseId ?? req.body?.knowledge_base_id, 0);
    const avatarUrl = asString(req.body?.avatarUrl || req.body?.avatar_url) || null;
    const status = normalizeStatus(req.body?.status || "draft");
    const priceMonthly = Math.max(0, toNumber(req.body?.priceMonthly ?? req.body?.price_monthly, 0));
    const currency = asString(req.body?.currency || "USD").toUpperCase() || "USD";
    const tags = parseTags(req.body?.tags);
    const isFeatured = Boolean(req.body?.isFeatured ?? req.body?.is_featured ?? false);
    const sortRank = Math.max(0, Math.min(9999, toInt(req.body?.sortRank ?? req.body?.sort_rank, 0)));
    const availability = normalizeAvailability(req.body?.availability);

    const slug = await buildUniqueSlug(tenant.tenantId, req.body?.slug || displayName);
    const codeSeed = slugify(req.body?.code || `${tenant.tenantKey}-${slug}`);
    const code = `${codeSeed || "agent"}-${Date.now().toString(36)}`;

    const inserted = await db.execute(sql`
      insert into ece_agent_templates (
        tenant_id, code, slug, title, description, category, role_title, short_pitch, long_description,
        base_model, personality_profile, autonomy_level, approval_policy, knowledge_base_id, avatar_url,
        status, visibility, is_active, base_salary_monthly, created_by_user_id, updated_by_user_id, created_at, updated_at
      )
      values (
        ${tenant.tenantId},
        ${code},
        ${slug},
        ${displayName},
        ${shortPitch || null},
        ${category},
        ${roleTitle},
        ${shortPitch || null},
        ${longDescription || null},
        ${baseModel},
        ${JSON.stringify(personalityProfile)}::jsonb,
        ${autonomyLevel},
        ${JSON.stringify(approvalPolicy)}::jsonb,
        ${knowledgeBaseId > 0 ? knowledgeBaseId : null},
        ${avatarUrl},
        ${status},
        ${"private"},
        true,
        ${priceMonthly},
        ${actor?.id ? Number(actor.id) : null},
        ${actor?.id ? Number(actor.id) : null},
        now(),
        now()
      )
      returning *
    `);
    const created = getRows<any>(inserted)[0];

    await db.execute(sql`
      insert into agent_marketplace_profiles (
        agent_id, tenant_id, is_visible, price_monthly, currency, tags, is_featured, sort_rank, availability, created_at, updated_at
      )
      values (
        ${Number(created.id)},
        ${tenant.tenantId},
        false,
        ${priceMonthly},
        ${currency},
        ${JSON.stringify(tags)}::jsonb,
        ${isFeatured},
        ${sortRank},
        ${availability},
        now(),
        now()
      )
      on conflict (tenant_id, agent_id)
      do update set
        price_monthly = excluded.price_monthly,
        currency = excluded.currency,
        tags = excluded.tags,
        is_featured = excluded.is_featured,
        sort_rank = excluded.sort_rank,
        availability = excluded.availability,
        updated_at = now()
    `);

    await writeAudit({
      tenantId: tenant.tenantId,
      actor,
      action: "AGENT_CREATE",
      entityType: "agent",
      entityId: Number(created.id),
      after: created,
      req,
    });

    res.status(201).json({ ok: true, agent: created });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to create agent" });
  }
});

router.get("/admin/agents/:id(\\d+)", async (req: any, res) => {
  try {
    await ensureAgentsOsMarketplaceTables();
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    const id = Number(req.params.id);

    const rows = await db.execute(sql`
      select
        t.*,
        mp.id as marketplace_profile_id,
        mp.is_visible as marketplace_visible,
        mp.price_monthly,
        mp.currency,
        mp.tags,
        mp.is_featured,
        mp.sort_rank,
        mp.availability,
        mp.min_contract_days,
        mp.public_metrics_enabled
      from ece_agent_templates t
      left join agent_marketplace_profiles mp
        on mp.agent_id = t.id and mp.tenant_id = ${tenant.tenantId}
      where t.id = ${id} and t.tenant_id = ${tenant.tenantId}
      limit 1
    `);
    const agent = getRows(rows)[0];
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    res.json({ ok: true, agent });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load agent" });
  }
});

router.patch("/admin/agents/:id(\\d+)", async (req: any, res) => {
  try {
    await ensureAgentsOsMarketplaceTables();
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    const id = Number(req.params.id);
    const actor = req.adminUser;

    const existingRows = await db.execute(sql`
      select *
      from ece_agent_templates
      where id = ${id} and tenant_id = ${tenant.tenantId}
      limit 1
    `);
    const existing = getRows<any>(existingRows)[0];
    if (!existing) return res.status(404).json({ message: "Agent not found" });

    const next = {
      title: asString(req.body?.displayName ?? req.body?.display_name ?? existing.title) || existing.title,
      role_title: asString(req.body?.roleTitle ?? req.body?.role_title ?? existing.role_title ?? existing.title) || existing.title,
      category: normalizeCategory(req.body?.category ?? existing.category),
      short_pitch: asString(req.body?.shortPitch ?? req.body?.short_pitch ?? existing.short_pitch ?? existing.description),
      long_description: asString(req.body?.longDescription ?? req.body?.long_description ?? existing.long_description),
      base_model: asString(req.body?.baseModel ?? req.body?.base_model ?? existing.base_model ?? "gpt-5"),
      autonomy_level: Math.max(0, Math.min(5, toInt(req.body?.autonomyLevel ?? existing.autonomy_level, 2))),
      approval_policy:
        typeof req.body?.approvalPolicy === "object" && req.body.approvalPolicy
          ? req.body.approvalPolicy
          : existing.approval_policy ?? {},
      personality_profile:
        typeof req.body?.personalityProfile === "object" && req.body.personalityProfile
          ? req.body.personalityProfile
          : existing.personality_profile ?? {},
      knowledge_base_id: toInt(req.body?.knowledgeBaseId ?? req.body?.knowledge_base_id ?? existing.knowledge_base_id, 0),
      avatar_url: asString(req.body?.avatarUrl ?? req.body?.avatar_url ?? existing.avatar_url) || null,
      status: normalizeStatus(req.body?.status ?? existing.status),
      slug: asString(req.body?.slug ?? existing.slug) || existing.slug,
    };

    const updatedRows = await db.execute(sql`
      update ece_agent_templates
      set
        title = ${next.title},
        role_title = ${next.role_title},
        category = ${next.category},
        short_pitch = ${next.short_pitch || null},
        long_description = ${next.long_description || null},
        description = ${next.short_pitch || null},
        base_model = ${next.base_model},
        autonomy_level = ${next.autonomy_level},
        approval_policy = ${JSON.stringify(next.approval_policy)}::jsonb,
        personality_profile = ${JSON.stringify(next.personality_profile)}::jsonb,
        knowledge_base_id = ${next.knowledge_base_id > 0 ? next.knowledge_base_id : null},
        avatar_url = ${next.avatar_url},
        status = ${next.status},
        slug = ${slugify(next.slug) || existing.slug},
        updated_by_user_id = ${actor?.id ? Number(actor.id) : null},
        updated_at = now()
      where id = ${id} and tenant_id = ${tenant.tenantId}
      returning *
    `);
    const updated = getRows(updatedRows)[0];

    await writeAudit({
      tenantId: tenant.tenantId,
      actor,
      action: "AGENT_UPDATE",
      entityType: "agent",
      entityId: id,
      before: existing,
      after: updated,
      req,
    });

    res.json({ ok: true, agent: updated });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to update agent" });
  }
});

router.post("/admin/agents/:id(\\d+)/retire", async (req: any, res) => {
  try {
    await ensureAgentsOsMarketplaceTables();
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    const id = Number(req.params.id);
    const actor = req.adminUser;

    const before = await db.execute(sql`
      select *
      from ece_agent_templates
      where id = ${id} and tenant_id = ${tenant.tenantId}
      limit 1
    `);
    const existing = getRows(before)[0];
    if (!existing) return res.status(404).json({ message: "Agent not found" });

    const updatedRows = await db.execute(sql`
      update ece_agent_templates
      set status = 'retired', is_active = false, visibility = 'private', updated_by_user_id = ${actor?.id ? Number(actor.id) : null}, updated_at = now()
      where id = ${id} and tenant_id = ${tenant.tenantId}
      returning *
    `);
    const updated = getRows(updatedRows)[0];

    await db.execute(sql`
      update agent_marketplace_profiles
      set is_visible = false, updated_at = now()
      where tenant_id = ${tenant.tenantId} and agent_id = ${id}
    `);

    await writeAudit({
      tenantId: tenant.tenantId,
      actor,
      action: "AGENT_RETIRE",
      entityType: "agent",
      entityId: id,
      before: existing,
      after: updated,
      req,
    });

    res.json({ ok: true, agent: updated });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to retire agent" });
  }
});

router.post("/admin/agents/:id(\\d+)/activate", async (req: any, res) => {
  try {
    await ensureAgentsOsMarketplaceTables();
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    const id = Number(req.params.id);
    const actor = req.adminUser;

    const before = await db.execute(sql`
      select *
      from ece_agent_templates
      where id = ${id} and tenant_id = ${tenant.tenantId}
      limit 1
    `);
    const existing = getRows(before)[0];
    if (!existing) return res.status(404).json({ message: "Agent not found" });

    const updatedRows = await db.execute(sql`
      update ece_agent_templates
      set status = 'active', is_active = true, updated_by_user_id = ${actor?.id ? Number(actor.id) : null}, updated_at = now()
      where id = ${id} and tenant_id = ${tenant.tenantId}
      returning *
    `);
    const updated = getRows(updatedRows)[0];

    await writeAudit({
      tenantId: tenant.tenantId,
      actor,
      action: "AGENT_ACTIVATE",
      entityType: "agent",
      entityId: id,
      before: existing,
      after: updated,
      req,
    });

    res.json({ ok: true, agent: updated });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to activate agent" });
  }
});

router.put("/admin/agents/:id(\\d+)/marketplace", async (req: any, res) => {
  try {
    await ensureAgentsOsMarketplaceTables();
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    const id = Number(req.params.id);
    const actor = req.adminUser;

    const agentRows = await db.execute(sql`
      select *
      from ece_agent_templates
      where id = ${id} and tenant_id = ${tenant.tenantId}
      limit 1
    `);
    const agent = getRows<any>(agentRows)[0];
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const profileRows = await db.execute(sql`
      select *
      from agent_marketplace_profiles
      where tenant_id = ${tenant.tenantId} and agent_id = ${id}
      limit 1
    `);
    const beforeProfile = getRows<any>(profileRows)[0] ?? null;

    const existingVisibility = Boolean(beforeProfile?.is_visible ?? false);
    const hasVisibilityInput = req.body?.is_visible !== undefined || req.body?.isVisible !== undefined;
    const isVisible = hasVisibilityInput
      ? normalizeVisibility(req.body?.is_visible ?? req.body?.isVisible)
      : existingVisibility;
    if (hasVisibilityInput && isVisible !== existingVisibility && !canPublishMarketplace(actor)) {
      return res.status(403).json({ message: "Only chairman or super_admin can publish or unpublish marketplace agents" });
    }

    const priceMonthly = Math.max(
      0,
      toNumber(req.body?.price_monthly ?? req.body?.priceMonthly ?? beforeProfile?.price_monthly ?? agent.base_salary_monthly, 0),
    );
    const currency = asString(req.body?.currency ?? beforeProfile?.currency ?? "USD").toUpperCase() || "USD";
    const tags = parseTags(req.body?.tags ?? beforeProfile?.tags ?? []);
    const isFeatured = Boolean(req.body?.is_featured ?? req.body?.isFeatured ?? beforeProfile?.is_featured ?? false);
    const sortRank = Math.max(0, Math.min(9999, toInt(req.body?.sort_rank ?? req.body?.sortRank ?? beforeProfile?.sort_rank, 0)));
    const availability = normalizeAvailability(req.body?.availability ?? beforeProfile?.availability ?? "available");
    const minContractDays = Math.max(1, Math.min(3650, toInt(req.body?.min_contract_days ?? req.body?.minContractDays ?? beforeProfile?.min_contract_days, 30)));
    const publicMetricsEnabled =
      req.body?.public_metrics_enabled !== undefined || req.body?.publicMetricsEnabled !== undefined
        ? Boolean(req.body?.public_metrics_enabled ?? req.body?.publicMetricsEnabled)
        : Boolean(beforeProfile?.public_metrics_enabled ?? true);

    await db.execute(sql`
      insert into agent_marketplace_profiles (
        agent_id, tenant_id, is_visible, price_monthly, currency, tags, is_featured, sort_rank, availability, min_contract_days, public_metrics_enabled, created_at, updated_at
      )
      values (
        ${id},
        ${tenant.tenantId},
        ${isVisible},
        ${priceMonthly},
        ${currency},
        ${JSON.stringify(tags)}::jsonb,
        ${isFeatured},
        ${sortRank},
        ${availability},
        ${minContractDays},
        ${publicMetricsEnabled},
        now(),
        now()
      )
      on conflict (tenant_id, agent_id)
      do update set
        is_visible = excluded.is_visible,
        price_monthly = excluded.price_monthly,
        currency = excluded.currency,
        tags = excluded.tags,
        is_featured = excluded.is_featured,
        sort_rank = excluded.sort_rank,
        availability = excluded.availability,
        min_contract_days = excluded.min_contract_days,
        public_metrics_enabled = excluded.public_metrics_enabled,
        updated_at = now()
    `);

    const visibility = isVisible ? "public" : "private";
    await db.execute(sql`
      update ece_agent_templates
      set
        visibility = ${visibility},
        base_salary_monthly = ${priceMonthly},
        status = case when ${isVisible} and coalesce(status::text, 'draft') = 'draft' then 'active' else status end,
        updated_by_user_id = ${actor?.id ? Number(actor.id) : null},
        updated_at = now()
      where id = ${id} and tenant_id = ${tenant.tenantId}
    `);

    const afterRows = await db.execute(sql`
      select *
      from agent_marketplace_profiles
      where tenant_id = ${tenant.tenantId} and agent_id = ${id}
      limit 1
    `);
    const afterProfile = getRows(afterRows)[0] ?? null;

    await writeAudit({
      tenantId: tenant.tenantId,
      actor,
      action: isVisible ? "MARKETPLACE_PUBLISH" : "MARKETPLACE_UNPUBLISH",
      entityType: "marketplace_profile",
      entityId: Number((afterProfile as any)?.id || 0) || null,
      before: beforeProfile,
      after: afterProfile,
      metadata: { priceMonthly, currency, isFeatured, availability },
      req,
    });

    if (beforeProfile && Number((beforeProfile as any).price_monthly || 0) !== priceMonthly) {
      await writeAudit({
        tenantId: tenant.tenantId,
        actor,
        action: "MARKETPLACE_PRICE_CHANGE",
        entityType: "marketplace_profile",
        entityId: Number((afterProfile as any)?.id || 0) || null,
        before: { priceMonthly: Number((beforeProfile as any).price_monthly || 0), currency: (beforeProfile as any).currency },
        after: { priceMonthly, currency },
        req,
      });
    }

    res.json({ ok: true, profile: afterProfile });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to update marketplace profile" });
  }
});

router.get("/admin/marketplace/agents", async (req: any, res) => {
  try {
    await ensureAgentsOsMarketplaceTables();
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    await maybeSyncRuntimeOnRead({
      tenantId: tenant.tenantId,
      tenantKey: tenant.tenantKey,
      actor: req.adminUser,
      req,
    });

    const page = Math.max(1, toInt(req.query?.page, 1));
    const pageSize = Math.max(1, Math.min(200, toInt(req.query?.pageSize, 25)));
    const offset = (page - 1) * pageSize;
    const q = asString(req.query?.q);
    const category = asString(req.query?.category).toLowerCase();
    const visible = asString(req.query?.visible).toLowerCase();

    const whereParts: any[] = [sql`t.tenant_id = ${tenant.tenantId}`, sql`mp.tenant_id = ${tenant.tenantId}`];
    if (category) whereParts.push(sql`lower(coalesce(t.category, '')) = ${category}`);
    if (visible === "true" || visible === "false") whereParts.push(sql`coalesce(mp.is_visible, false) = ${visible === "true"}`);
    if (q) {
      const like = `%${q}%`;
      whereParts.push(sql`(t.title ilike ${like} or coalesce(t.role_title, '') ilike ${like} or coalesce(t.short_pitch, '') ilike ${like})`);
    }
    const whereClause = sql`where ${sql.join(whereParts, sql` and `)}`;

    const rows = await db.execute(sql`
      select
        t.id,
        t.title as display_name,
        coalesce(nullif(t.role_title, ''), t.title) as role_title,
        coalesce(t.category, 'operations') as category,
        coalesce(t.status::text, 'draft') as status,
        coalesce(mp.is_visible, false) as is_visible,
        coalesce(mp.price_monthly, t.base_salary_monthly, 0) as price_monthly,
        coalesce(mp.currency, 'USD') as currency,
        coalesce(mp.tags, '[]'::jsonb) as tags,
        coalesce(mp.is_featured, false) as is_featured,
        coalesce(mp.sort_rank, 0) as sort_rank,
        coalesce(mp.availability, 'available') as availability,
        t.updated_at
      from ece_agent_templates t
      join agent_marketplace_profiles mp
        on mp.agent_id = t.id and mp.tenant_id = ${tenant.tenantId}
      ${whereClause}
      order by mp.is_featured desc, mp.sort_rank asc, t.updated_at desc
      limit ${pageSize}
      offset ${offset}
    `);

    const totalResult = await db.execute(sql`
      select count(*)::int as total
      from ece_agent_templates t
      join agent_marketplace_profiles mp
        on mp.agent_id = t.id and mp.tenant_id = ${tenant.tenantId}
      ${whereClause}
    `);

    res.json({
      ok: true,
      page,
      pageSize,
      total: Number(getRows<any>(totalResult)[0]?.total || 0),
      items: getRows(rows),
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list marketplace profiles" });
  }
});

router.post("/admin/agents/:id(\\d+)/clone", async (req: any, res) => {
  try {
    await ensureAgentsOsMarketplaceTables();
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    const parentId = Number(req.params.id);
    const actor = req.adminUser;
    const cloneReason = asString(req.body?.clone_reason ?? req.body?.cloneReason ?? "manual_clone");

    const sourceRows = await db.execute(sql`
      select *
      from ece_agent_templates
      where id = ${parentId} and tenant_id = ${tenant.tenantId}
      limit 1
    `);
    const source = getRows<any>(sourceRows)[0];
    if (!source) return res.status(404).json({ message: "Source agent not found" });

    const childSlug = await buildUniqueSlug(tenant.tenantId, `${source.slug || source.title}-clone`);
    const childCode = `${slugify(source.code || childSlug)}-${Date.now().toString(36)}`;
    const childTitle = `${source.title} Clone`;

    const insertedRows = await db.execute(sql`
      insert into ece_agent_templates (
        tenant_id, code, slug, title, description, category, role_title, short_pitch, long_description,
        base_model, personality_profile, autonomy_level, approval_policy, knowledge_base_id, avatar_url,
        status, visibility, is_active, base_salary_monthly, setup_fee, default_tools, default_limits, created_by_user_id, updated_by_user_id, created_at, updated_at
      )
      values (
        ${tenant.tenantId},
        ${childCode},
        ${childSlug},
        ${childTitle},
        ${source.description || null},
        ${source.category || "operations"},
        ${source.role_title || source.title},
        ${source.short_pitch || source.description || null},
        ${source.long_description || null},
        ${source.base_model || "gpt-5"},
        ${JSON.stringify(source.personality_profile || {})}::jsonb,
        ${Number(source.autonomy_level || 2)},
        ${JSON.stringify(source.approval_policy || {})}::jsonb,
        ${source.knowledge_base_id || null},
        ${source.avatar_url || null},
        ${"draft"},
        ${"private"},
        true,
        ${Number(source.base_salary_monthly || 0)},
        ${Number(source.setup_fee || 0)},
        ${JSON.stringify(source.default_tools || [])}::jsonb,
        ${JSON.stringify(source.default_limits || {})}::jsonb,
        ${actor?.id ? Number(actor.id) : null},
        ${actor?.id ? Number(actor.id) : null},
        now(),
        now()
      )
      returning *
    `);
    const child = getRows<any>(insertedRows)[0];

    await db.execute(sql`
      insert into agent_marketplace_profiles (
        agent_id, tenant_id, is_visible, price_monthly, currency, tags, is_featured, sort_rank, availability, created_at, updated_at
      )
      values (
        ${Number(child.id)},
        ${tenant.tenantId},
        false,
        ${Number(source.base_salary_monthly || 0)},
        'USD',
        '[]'::jsonb,
        false,
        0,
        'available',
        now(),
        now()
      )
      on conflict (tenant_id, agent_id) do nothing
    `);

    await db.execute(sql`
      insert into agent_clones (
        tenant_id, parent_agent_id, child_agent_id, clone_reason, created_by_user_id, created_at
      )
      values (
        ${tenant.tenantId},
        ${parentId},
        ${Number(child.id)},
        ${cloneReason},
        ${actor?.id ? Number(actor.id) : null},
        now()
      )
    `);

    await writeAudit({
      tenantId: tenant.tenantId,
      actor,
      action: "AGENT_CLONE",
      entityType: "agent",
      entityId: Number(child.id),
      before: source,
      after: child,
      metadata: { parentAgentId: parentId, cloneReason },
      req,
    });

    res.status(201).json({ ok: true, agent: child });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to clone agent" });
  }
});

router.get("/admin/agents/:id(\\d+)/versions", async (req: any, res) => {
  try {
    await ensureAgentsOsMarketplaceTables();
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    const agentId = Number(req.params.id);

    const rows = await db.execute(sql`
      select *
      from agent_versions
      where tenant_id = ${tenant.tenantId} and agent_id = ${agentId}
      order by version desc, created_at desc
      limit 200
    `);

    res.json({ ok: true, items: getRows(rows) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list versions" });
  }
});

router.post("/admin/agents/:id(\\d+)/version", async (req: any, res) => {
  try {
    await ensureAgentsOsMarketplaceTables();
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    const actor = req.adminUser;
    const agentId = Number(req.params.id);
    const changeNote = asString(req.body?.change_note ?? req.body?.changeNote ?? "");

    const agentRows = await db.execute(sql`
      select *
      from ece_agent_templates
      where id = ${agentId} and tenant_id = ${tenant.tenantId}
      limit 1
    `);
    const agent = getRows<any>(agentRows)[0];
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const profileRows = await db.execute(sql`
      select *
      from agent_marketplace_profiles
      where tenant_id = ${tenant.tenantId} and agent_id = ${agentId}
      limit 1
    `);
    const profile = getRows<any>(profileRows)[0] ?? null;

    const maxRows = await db.execute(sql`
      select coalesce(max(version), 0)::int as max_version
      from agent_versions
      where tenant_id = ${tenant.tenantId} and agent_id = ${agentId}
    `);
    const nextVersion = Number(getRows<any>(maxRows)[0]?.max_version || 0) + 1;

    const snapshot = { agent, marketplaceProfile: profile };
    const insertedRows = await db.execute(sql`
      insert into agent_versions (
        agent_id, tenant_id, version, snapshot, change_note, created_by_user_id, created_at
      )
      values (
        ${agentId},
        ${tenant.tenantId},
        ${nextVersion},
        ${JSON.stringify(snapshot)}::jsonb,
        ${changeNote || null},
        ${actor?.id ? Number(actor.id) : null},
        now()
      )
      returning *
    `);
    const inserted = getRows(insertedRows)[0];

    await writeAudit({
      tenantId: tenant.tenantId,
      actor,
      action: "AGENT_VERSION_CREATE",
      entityType: "agent",
      entityId: agentId,
      metadata: { version: nextVersion, changeNote },
      req,
    });

    res.status(201).json({ ok: true, version: inserted });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to create version snapshot" });
  }
});

export default router;
