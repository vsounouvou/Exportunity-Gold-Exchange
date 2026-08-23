import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@db";
import { companyBrainAuditEvents } from "@db/schema";
import { ensureTenantAdmin } from "./utils/auth";
import { ensureAgentsOsMarketplaceTables } from "../lib/agent-os/ensureMarketplaceCatalog";
import { syncRuntimeAgentsToCatalog } from "../lib/agents/syncRuntimeAgentCatalog";
import { ensureAgentManagementV2Tables } from "../lib/agents/ensureManagementV2Tables";
import { ensureAgentsProductionTables } from "../lib/agents/ensureProductionAgents";
import { ensureDefaultCompany } from "../lib/default-company";
import { ensureExportunityRoleSeatCatalog } from "../lib/company-brain/ensureRoleSeatCatalog";
import {
  buildDemandRoleSeatProfile,
  EXPORTUNITY_DEMAND_ROLE_SEAT_VERSION,
} from "../lib/company-brain/demandRoleSeat";
import { ensureIndustrialTables } from "../lib/industrial/ensureTables";
import { proposeCommercialStaffing } from "../lib/industrial/workforcePlanning";
import {
  assembleWorkforceGovernanceContext,
  assertWorkforceGovernanceReady,
  type WorkforceGovernanceSnapshot,
} from "../lib/industrial/workforceGovernance";
import { commercialStaffingSpecialistKey } from "../lib/industrial/workforcePlanningPolicy";
import {
  EXPORTUNITY_ROLE_SEAT_DEPARTMENTS,
  EXPORTUNITY_ROLE_SEAT_TOTAL,
} from "../lib/company-brain/roleSeatCatalog";
import {
  EXPORTUNITY_CORE_AGENT_KEYS,
  EXPORTUNITY_CORE_AGENT_ROLE_SEAT_BINDINGS,
} from "../lib/company-brain/coreAgentRoleSeatBindings";

const router = Router();
const RUNTIME_SYNC_TTL_MS = 60_000;
const runtimeSyncAt = new Map<number, number>();

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

  const result = await syncRuntimeAgentsToCatalog({
    tenantId: input.tenantId,
    actorUserId: input.actor?.id ? Number(input.actor.id) : null,
  });

  runtimeSyncAt.set(input.tenantId, nowMs);

  return {
    ...result,
    throttled: false,
  };
}

async function resolveRoleSeatManager(input: {
  tenantId: number;
  companyId: number;
  managerOrganizationKey: string;
}) {
  const managerResult = await db.execute(sql`
    select id, display_name, name, role
    from agents
    where tenant_id = ${input.tenantId}
      and company_id = ${input.companyId}
      and status = 'active'
      and metadata->>'organizationKey' = ${input.managerOrganizationKey}
    order by id asc
    limit 1
  `);
  const manager = getRows<any>(managerResult)[0];
  if (manager?.id) return manager;

  const executiveFallback = await db.execute(sql`
    select id, display_name, name, role
    from agents
    where tenant_id = ${input.tenantId}
      and company_id = ${input.companyId}
      and status = 'active'
      and (
        metadata->>'organizationKey' = 'ceo'
        or decision_authority = 'executive'
        or is_super_agent = true
      )
    order by
      case when metadata->>'organizationKey' = 'ceo' then 0 else 1 end,
      id asc
    limit 1
  `);
  return getRows<any>(executiveFallback)[0] || null;
}

type CoreTeamReconciliationStatus =
  | "ready"
  | "already_linked"
  | "employee_missing"
  | "role_seat_missing"
  | "seat_occupied"
  | "employee_assigned_elsewhere";

async function buildCoreTeamReconciliation(tenantId: number) {
  const organizationKeys = EXPORTUNITY_CORE_AGENT_KEYS;
  const roleSeatCodes = EXPORTUNITY_CORE_AGENT_ROLE_SEAT_BINDINGS.map(
    (binding) => binding.roleSeatCode,
  );
  const employees = getRows<any>(
    await db.execute(sql`
      select
        a.id,
        coalesce(nullif(a.display_name, ''), a.name) as display_name,
        a.role,
        a.status::text as status,
        coalesce(nullif(a.metadata->>'organizationKey', ''), production.agent_key) as organization_key,
        coalesce(production.is_enabled, false) as production_enabled
      from agents a
      left join lateral (
        select ap.agent_key, ap.is_enabled
        from agents_production ap
        where ap.tenant_id = ${tenantId}
          and ap.agent_id = a.id
        order by ap.is_enabled desc, ap.id asc
        limit 1
      ) production on true
      where a.tenant_id = ${tenantId}
        and coalesce(a.status::text, 'active') <> 'archived'
        and coalesce(nullif(a.metadata->>'organizationKey', ''), production.agent_key) in (
          ${sql.join(organizationKeys.map((key) => sql`${key}`), sql`, `)}
        )
      order by
        coalesce(nullif(a.metadata->>'organizationKey', ''), production.agent_key),
        case when a.status::text = 'active' then 0 else 1 end,
        case when a.env = 'prod' then 0 else 1 end,
        case when coalesce(a.is_visible, true) then 0 else 1 end,
        production.is_enabled desc,
        a.id asc
    `),
  );
  const seats = getRows<any>(
    await db.execute(sql`
      select id, code, title, role_title, department_key, runtime_agent_id, seat_status
      from ece_agent_templates
      where tenant_id = ${tenantId}
        and seat_type = 'role_seat'
        and code in (${sql.join(roleSeatCodes.map((code) => sql`${code}`), sql`, `)})
      order by id asc
    `),
  );
  const linkedSeats = getRows<any>(
    await db.execute(sql`
      select id, code, title, role_title, runtime_agent_id
      from ece_agent_templates
      where tenant_id = ${tenantId}
        and seat_type = 'role_seat'
        and runtime_agent_id is not null
    `),
  );

  const employeeByKey = new Map<string, any>();
  for (const employee of employees) {
    const key = asString(employee.organization_key).toLowerCase();
    if (key && !employeeByKey.has(key)) employeeByKey.set(key, employee);
  }
  const seatByCode = new Map(seats.map((seat) => [asString(seat.code), seat]));
  const linkedSeatByRuntime = new Map(
    linkedSeats.map((seat) => [Number(seat.runtime_agent_id), seat]),
  );

  const items = EXPORTUNITY_CORE_AGENT_ROLE_SEAT_BINDINGS.map((binding) => {
    const employee = employeeByKey.get(binding.organizationKey);
    const seat = seatByCode.get(binding.roleSeatCode);
    const employeeId = Number(employee?.id || 0);
    const seatRuntimeId = Number(seat?.runtime_agent_id || 0);
    const employeeSeat = employeeId > 0 ? linkedSeatByRuntime.get(employeeId) : null;
    let status: CoreTeamReconciliationStatus = "ready";
    let blockingReason: string | null = null;

    if (!employeeId) {
      status = "employee_missing";
      blockingReason = `No current employee exposes the stable organization key ${binding.organizationKey}.`;
    } else if (!seat?.id) {
      status = "role_seat_missing";
      blockingReason = `The governed role seat ${binding.roleSeatTitle} is unavailable.`;
    } else if (seatRuntimeId === employeeId) {
      status = "already_linked";
    } else if (seatRuntimeId > 0) {
      status = "seat_occupied";
      blockingReason = `${binding.roleSeatTitle} is already assigned to runtime employee #${seatRuntimeId}.`;
    } else if (employeeSeat?.id && Number(employeeSeat.id) !== Number(seat.id)) {
      status = "employee_assigned_elsewhere";
      blockingReason = `${employee.display_name} already fills ${employeeSeat.title || employeeSeat.role_title}.`;
    }

    return {
      organizationKey: binding.organizationKey,
      rationale: binding.rationale,
      status,
      blockingReason,
      employee: employee
        ? {
            id: employeeId,
            displayName: asString(employee.display_name),
            role: asString(employee.role),
            status: asString(employee.status),
            productionEnabled: Boolean(employee.production_enabled),
          }
        : null,
      roleSeat: seat
        ? {
            id: Number(seat.id),
            code: asString(seat.code),
            title: asString(seat.title),
            roleTitle: asString(seat.role_title),
            departmentKey: asString(seat.department_key),
            runtimeAgentId: seatRuntimeId || null,
          }
        : {
            id: null,
            code: binding.roleSeatCode,
            title: binding.roleSeatTitle,
            roleTitle: binding.roleSeatTitle,
            departmentKey: null,
            runtimeAgentId: null,
          },
    };
  });

  return {
    items,
    summary: {
      total: items.length,
      ready: items.filter((item) => item.status === "ready").length,
      linked: items.filter((item) => item.status === "already_linked").length,
      blocked: items.filter((item) => !["ready", "already_linked"].includes(item.status)).length,
    },
  };
}

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
      sql`coalesce(t.seat_type, 'agent') <> 'role_seat'`,
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

router.get("/admin/agents-os/workforce-requests", async (req: any, res) => {
  try {
    await ensureIndustrialTables();
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    const result = await db.execute(sql`
      select
        sr.id,
        sr.requirement_id,
        sr.role_template_id,
        sr.role_code,
        sr.role_title,
        sr.department_key,
        sr.reason,
        sr.evidence,
        sr.priority,
        sr.status,
        sr.review_note,
        sr.provisioned_agent_id,
        sr.demand_count,
        sr.demand_threshold,
        sr.signal_type,
        sr.evidence_items,
        sr.company_brain_context_pack_id,
        sr.governance_status,
        sr.governance_snapshot,
        sr.last_signal_at,
        sr.activated_at,
        sr.paused_at,
        template.seat_status as role_seat_status,
        template.organization_version as role_seat_organization_version,
        template.role_profile,
        coalesce(template.role_profile->>'dynamicRoleSeat', 'false') = 'true' as dynamic_role_seat,
        a.status as runtime_status,
        a.display_name as runtime_display_name,
        a.manager_id,
        manager.display_name as manager_display_name,
        coalesce(ap.is_enabled, false) as production_enabled,
        coalesce(workload.open_case_count, 0)::integer as open_case_count,
        case
          when coalesce(sr.evidence->>'capacityLimit', '') ~ '^[0-9]+$'
            then (sr.evidence->>'capacityLimit')::integer
          when coalesce(sr.evidence->'latestDemandSignal'->>'capacityLimit', '') ~ '^[0-9]+$'
            then (sr.evidence->'latestDemandSignal'->>'capacityLimit')::integer
          else 6
        end as capacity_limit,
        case
          when coalesce(sr.evidence->>'capacityOrdinal', '') ~ '^[0-9]+$'
            then (sr.evidence->>'capacityOrdinal')::integer
          else 1
        end as capacity_ordinal,
        coalesce(nullif(sr.evidence->>'baseRoleCode', ''), sr.role_code) as base_role_code,
        coalesce((sr.evidence->>'capacityExpansion')::boolean, false) as capacity_expansion,
        sr.created_at,
        sr.updated_at,
        ir.reference_code,
        ir.title as requirement_title,
        ir.commercial_intent
      from industrial_agent_staffing_requests sr
      left join industrial_requirements ir on ir.id = sr.requirement_id
      left join ece_agent_templates template
        on template.id = sr.role_template_id and template.tenant_id = sr.tenant_id
      left join agents a on a.id = sr.provisioned_agent_id and a.tenant_id = sr.tenant_id
      left join agents manager on manager.id = a.manager_id and manager.tenant_id = sr.tenant_id
      left join agents_production ap on ap.agent_id = sr.provisioned_agent_id and ap.tenant_id = sr.tenant_id
      left join lateral (
        select count(*)::integer as open_case_count
        from tasks task
        where task.agent_id = sr.provisioned_agent_id
          and task.execution_type = 'workforce_activation'
          and task.status in ('backlog', 'in_progress', 'blocked')
      ) workload on true
      where sr.tenant_id = ${tenant.tenantId}
      order by
        case sr.status when 'proposed' then 0 when 'approved' then 1 when 'provisioned' then 2 when 'active' then 3 when 'monitoring' then 4 else 5 end,
        case sr.priority when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
        sr.updated_at desc
      limit 200
    `);
    const items = getRows<any>(result);
    res.json({
      ok: true,
      summary: {
        total: items.length,
        monitoring: items.filter((item) => item.status === "monitoring").length,
        proposed: items.filter((item) => item.status === "proposed").length,
        approved: items.filter((item) => item.status === "approved").length,
        provisioned: items.filter((item) => item.status === "provisioned").length,
        active: items.filter((item) => item.status === "active").length,
        paused: items.filter((item) => item.status === "paused").length,
      },
      items,
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load workforce requests" });
  }
});

router.post("/admin/agents-os/workforce-requests/evaluate-current-demand", async (req: any, res) => {
  try {
    await ensureIndustrialTables();
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    if (tenant.tenantKey !== "exportunity") {
      return res.status(404).json({ message: "Demand-driven workforce planning is not available for this tenant." });
    }

    await ensureExportunityRoleSeatCatalog();
    const companyId = await ensureDefaultCompany({
      tenantId: tenant.tenantId,
      tenantKey: tenant.tenantKey,
      tenantName: "Exportunity",
      attachUnassignedAgents: false,
    });
    const demandResult = await db.execute(sql`
      select
        ir.id,
        ir.reference_code,
        ir.requirement_type,
        ir.category_code,
        ir.title,
        ir.commercial_intent,
        ir.assigned_commercial_agent_id,
        ir.metadata,
        product.intent as product_intent,
        product.product_name,
        product.product_category
      from industrial_requirements ir
      left join industrial_product_requirements product
        on product.requirement_id = ir.id
        and product.tenant_id = ir.tenant_id
      where ir.tenant_id = ${tenant.tenantId}
        and ir.status in (
          'submitted', 'triaged', 'under_review', 'supplier_matching',
          'quote_preparation', 'quoted'
        )
      order by coalesce(ir.submitted_at, ir.created_at) asc
      limit 500
    `);
    const requirements = getRows<any>(demandResult);
    const roles = new Map<string, {
      roleTitle: string;
      status: string;
      demandCount: number;
      demandThreshold: number;
      reviewReady: boolean;
    }>();
    let requirementsWithSignals = 0;
    let signalsObserved = 0;

    for (const requirement of requirements) {
      const metadata = requirement.metadata && typeof requirement.metadata === "object"
        ? requirement.metadata as Record<string, any>
        : {};
      const handoff = metadata.operationsHandoff && typeof metadata.operationsHandoff === "object"
        ? metadata.operationsHandoff as Record<string, any>
        : {};
      const missingSpecialistKeys = Array.isArray(handoff.missingSpecialistKeys)
        ? handoff.missingSpecialistKeys.map((value: unknown) => asString(value)).filter(Boolean)
        : [];
      const proposals = await proposeCommercialStaffing({
        tenantId: tenant.tenantId,
        companyId,
        requirementId: String(requirement.id),
        referenceCode: asString(requirement.reference_code),
        proposedByAgentId:
          Number(requirement.assigned_commercial_agent_id || handoff.assignedAgentId || 0) || null,
        assignmentMode: "signal_only",
        context: {
          intent: requirement.product_intent || requirement.commercial_intent || null,
          productName: requirement.product_name || requirement.title || null,
          productCategory: requirement.product_category || requirement.category_code || null,
          requirementType: asString(requirement.requirement_type),
          missingSpecialistKeys,
        },
      });
      if (proposals.length) requirementsWithSignals += 1;
      signalsObserved += proposals.length;
      for (const proposal of proposals) {
        roles.set(proposal.roleCode, {
          roleTitle: proposal.roleTitle,
          status: proposal.status,
          demandCount: proposal.demandCount,
          demandThreshold: proposal.demandThreshold,
          reviewReady: proposal.reviewReady,
        });
      }
    }

    const roleSignals = Array.from(roles.values());
    const result = {
      ok: true,
      requirementsEvaluated: requirements.length,
      requirementsWithSignals,
      signalsObserved,
      roles: roleSignals,
      reviewReady: roleSignals.filter((role) => role.reviewReady).length,
      runtimeAgentsStarted: 0,
      employeesCreated: 0,
      employeesActivated: 0,
      externalActionsStarted: false,
      nextStep: roleSignals.length
        ? "Review the evidence. Approve only a demonstrated staffing need, then create and edit the employee before a separate activation review."
        : "No unmet governed staffing need was found in current industrial opportunities.",
    };
    await writeAudit({
      tenantId: tenant.tenantId,
      actor: req.adminUser,
      action: "WORKFORCE_DEMAND_EVALUATE",
      entityType: "industrial_agent_staffing_request",
      entityId: null,
      after: result,
      metadata: {
        source: "current_industrial_requirements",
        assignmentMode: "signal_only",
        runtimeAgentsStarted: 0,
        externalActionsStarted: false,
      },
      req,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to evaluate current workforce demand" });
  }
});

router.post("/admin/agents-os/workforce-requests/:id(\\d+)/review", async (req: any, res) => {
  try {
    await ensureIndustrialTables();
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    if (tenant.tenantKey !== "exportunity") {
      return res.status(404).json({ message: "Demand-driven role seats are not available for this tenant." });
    }
    await ensureExportunityRoleSeatCatalog();
    const id = Number(req.params.id);
    const decision = asString(req.body?.decision).toLowerCase();
    const reviewNote = asString(req.body?.reviewNote).slice(0, 1200);
    if (!id || !["approve", "reject"].includes(decision)) {
      return res.status(400).json({ message: "Choose approve or reject." });
    }
    if (reviewNote.length < 12) {
      return res.status(400).json({
        message: "Add a review note of at least 12 characters explaining this decision.",
      });
    }
    const beforeResult = await db.execute(sql`
      select * from industrial_agent_staffing_requests
      where id = ${id} and tenant_id = ${tenant.tenantId}
      limit 1
    `);
    const before = getRows<any>(beforeResult)[0];
    if (!before) return res.status(404).json({ message: "Workforce request not found" });
    if (!["proposed", "approved"].includes(String(before.status))) {
      return res.status(409).json({ message: `This workforce request is already ${before.status}.` });
    }
    let governanceForReview: WorkforceGovernanceSnapshot | null = null;
    if (decision === "approve") {
      governanceForReview = await assembleWorkforceGovernanceContext({
        tenantId: tenant.tenantId,
        companyId: Number(before.company_id || 0) || null,
        requirementId: before.requirement_id ? String(before.requirement_id) : null,
        referenceCode:
          asString(before.evidence?.referenceCode || before.evidence?.reference_code) ||
          `staffing-${id}`,
        roleCode: asString(before.role_code),
        roleTitle: asString(before.role_title),
        proposedByAgentId: Number(before.proposed_by_agent_id || 0) || null,
        staffingRequestId: id,
      });
      try {
        assertWorkforceGovernanceReady(governanceForReview);
      } catch (error) {
        return res.status(409).json({
          message: error instanceof Error ? error.message : "Company Brain review is required before approval.",
          governance: governanceForReview,
        });
      }
    }
    const nextStatus = decision === "approve" ? "approved" : "rejected";
    const demandSeatBaseModel = asString(
      process.env.OPENAI_EXPORTUNITY_MODEL || process.env.OPENAI_MODEL || "gpt-5.6-terra",
    );
    const reviewResult = await db.transaction(async (tx) => {
      const lockedResult = await tx.execute(sql`
        select *
        from industrial_agent_staffing_requests
        where id = ${id} and tenant_id = ${tenant.tenantId}
        for update
      `);
      const locked = getRows<any>(lockedResult)[0];
      if (!locked) throw new Error("Workforce request not found");
      if (!["proposed", "approved"].includes(String(locked.status))) {
        const conflict: any = new Error(`This workforce request is already ${locked.status}.`);
        conflict.statusCode = 409;
        throw conflict;
      }

      const reviewedAt = new Date();
      const decisionRecord = {
        version: "workforce-decision-v1",
        decision,
        target: {
          staffingRequestId: id,
          roleCode: asString(locked.role_code),
          roleTitle: asString(locked.role_title),
          departmentKey: asString(locked.department_key),
        },
        supportingEvidence: {
          demandCount: Number(locked.demand_count || 0),
          demandThreshold: Number(locked.demand_threshold || 1),
          requirementIds: Array.isArray(locked.evidence_items)
            ? locked.evidence_items
                .map((item: any) => asString(item?.requirementId || item?.requirement_id))
                .filter(Boolean)
            : [],
          companyBrainContextPackId: governanceForReview?.contextPackId || null,
          sourceCitations: governanceForReview?.sourceCitations || [],
          knownConflicts: governanceForReview?.knownConflicts || [],
        },
        risk: {
          class: "L2",
          reversible: true,
          externalCommunication: false,
          spending: false,
          productionAccess: false,
        },
        expectedEffect:
          decision === "approve"
            ? "Authorize a private role-seat blueprint only. Employee creation and activation remain separate gates."
            : "Close this staffing proposal without creating or activating capacity.",
        expiresAt:
          decision === "approve"
            ? new Date(reviewedAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
            : null,
        approver: {
          userId: req.adminUser?.id ? Number(req.adminUser.id) : null,
          role: resolveActorRole(req.adminUser),
        },
        reviewNote,
        reviewedAt: reviewedAt.toISOString(),
      };
      const nextEvidence = {
        ...(locked.evidence && typeof locked.evidence === "object" ? locked.evidence : {}),
        decisionRecord,
      };

      let roleTemplateId = Number(locked.role_template_id || 0) || null;
      let roleSeatCreated = false;
      if (decision === "approve" && !roleTemplateId) {
        const isDemandRole = Boolean(
          locked.evidence?.dynamicRoleSeat ||
            locked.evidence?.dynamic_role_seat ||
            asString(locked.role_code).startsWith("exportunity-demand-seat-"),
        );
        if (!isDemandRole) {
          throw new Error("The approved staffing need has no governed role-seat blueprint.");
        }

        const roleProfile = buildDemandRoleSeatProfile({
          roleCode: locked.role_code,
          roleTitle: locked.role_title,
          departmentKey: locked.department_key,
          reason: locked.reason,
          staffingRequestId: Number(locked.id),
          demandCount: Number(locked.demand_count || 1),
          demandThreshold: Number(locked.demand_threshold || 1),
          evidenceItems: Array.isArray(locked.evidence_items)
            ? locked.evidence_items
            : [],
        });
        const existingTemplateResult = await tx.execute(sql`
          select id
          from ece_agent_templates
          where tenant_id = ${tenant.tenantId}
            and code = ${roleProfile.immutableAgentId}
          limit 1
        `);
        roleTemplateId =
          Number(getRows<any>(existingTemplateResult)[0]?.id || 0) || null;
        if (!roleTemplateId) {
          const approvalPolicy = {
            source: "demand_driven_workforce",
            staffingRequestId: Number(locked.id),
            activationState: "available",
            externalCommunication: "human_approval_required",
            payments: "human_approval_required",
            contracts: "human_approval_required",
            publicClaims: "human_approval_required",
            productionEnablement: "human_approval_required",
            backgroundAutonomy: "disabled",
          };
          const personalityProfile = {
            tone: "professional",
            warmth: "calm",
            riskTolerance: "conservative",
            evidenceBehavior: "cite_and_escalate_conflicts",
          };
          const createdTemplateResult = await tx.execute(sql`
            insert into ece_agent_templates (
              tenant_id, code, slug, title, description, category, role_title,
              short_pitch, long_description, default_tools, default_limits,
              base_model, personality_profile, autonomy_level, approval_policy,
              avatar_url, status, visibility, is_active, base_salary_monthly,
              seat_type, seat_status, organization_version, department_key,
              role_profile, runtime_agent_id, created_by_user_id,
              updated_by_user_id, created_at, updated_at
            ) values (
              ${tenant.tenantId}, ${roleProfile.immutableAgentId},
              ${roleProfile.immutableAgentId}, ${roleProfile.defaultDisplayName},
              ${roleProfile.description}, ${roleProfile.departmentKey},
              ${roleProfile.role}, ${roleProfile.description},
              ${roleProfile.description},
              ${JSON.stringify(roleProfile.permittedTools)}::jsonb,
              ${JSON.stringify(roleProfile.budget)}::jsonb, ${demandSeatBaseModel},
              ${JSON.stringify(personalityProfile)}::jsonb, 1,
              ${JSON.stringify(approvalPolicy)}::jsonb, null, 'draft', 'private',
              true, 0, 'role_seat', 'available',
              ${EXPORTUNITY_DEMAND_ROLE_SEAT_VERSION},
              ${roleProfile.departmentKey}, ${JSON.stringify(roleProfile)}::jsonb,
              null, ${req.adminUser?.id ? Number(req.adminUser.id) : null},
              ${req.adminUser?.id ? Number(req.adminUser.id) : null}, now(), now()
            )
            returning id
          `);
          roleTemplateId =
            Number(getRows<any>(createdTemplateResult)[0]?.id || 0) || null;
          if (!roleTemplateId) throw new Error("Unable to create the approved role seat");
          roleSeatCreated = true;
          await tx.execute(sql`
            insert into agent_marketplace_profiles (
              agent_id, tenant_id, is_visible, price_monthly, currency, tags,
              is_featured, sort_rank, availability, created_at, updated_at
            ) values (
              ${roleTemplateId}, ${tenant.tenantId}, false, 0, 'USD', '[]'::jsonb,
              false, 0, 'paused', now(), now()
            )
            on conflict (tenant_id, agent_id)
            do update set is_visible = false, availability = 'paused', updated_at = now()
          `);
        }
      }

      const updatedResult = await tx.execute(sql`
        update industrial_agent_staffing_requests
        set status = ${nextStatus},
            role_template_id = coalesce(${roleTemplateId}, role_template_id),
            reviewed_by_user_id = ${req.adminUser?.id ? Number(req.adminUser.id) : null},
            review_note = ${reviewNote},
            evidence = ${JSON.stringify(nextEvidence)}::jsonb,
            company_brain_context_pack_id = coalesce(
              ${governanceForReview?.contextPackId || null},
              company_brain_context_pack_id
            ),
            governance_status = ${governanceForReview?.status || locked.governance_status || "not_required"},
            governance_snapshot = ${JSON.stringify(
              governanceForReview || locked.governance_snapshot || {},
            )}::jsonb,
            reviewed_at = ${reviewedAt},
            updated_at = now()
        where id = ${id} and tenant_id = ${tenant.tenantId}
        returning *
      `);
      return {
        updated: getRows<any>(updatedResult)[0],
        roleSeatCreated,
        roleTemplateId,
      };
    });
    const updated = reviewResult.updated;
    await writeAudit({
      tenantId: tenant.tenantId,
      actor: req.adminUser,
      action: decision === "approve" ? "WORKFORCE_REQUEST_APPROVE" : "WORKFORCE_REQUEST_REJECT",
      entityType: "industrial_agent_staffing_request",
      entityId: id,
      before,
      after: updated,
      metadata: {
        runtimeAgentsStarted: 0,
        productionEnabled: false,
        roleSeatCreated: reviewResult.roleSeatCreated,
        roleTemplateId: reviewResult.roleTemplateId,
        reviewNote,
        riskClass: "L2",
        companyBrainContextPackId: governanceForReview?.contextPackId || null,
        governanceStatus: governanceForReview?.status || null,
        citationCount: governanceForReview?.citationCount || 0,
        conflictCount: governanceForReview?.knownConflicts.length || 0,
        externalActionsStarted: false,
      },
      req,
    });
    await db.insert(companyBrainAuditEvents).values({
      tenantId: tenant.tenantId,
      companyId: Number(updated.company_id || 0) || null,
      actorType: "user",
      actorId: req.adminUser?.id ? String(req.adminUser.id) : null,
      eventType:
        decision === "approve"
          ? "workforce_staffing_need_approved"
          : "workforce_staffing_need_rejected",
      entityType: "industrial_agent_staffing_request",
      entityId: String(id),
      correlationId: governanceForReview?.correlationId || null,
      payload: {
        decision,
        reviewNote,
        roleCode: updated.role_code,
        roleTitle: updated.role_title,
        roleTemplateId: reviewResult.roleTemplateId,
        contextPackId: governanceForReview?.contextPackId || null,
        governanceStatus: governanceForReview?.status || null,
        citationCount: governanceForReview?.citationCount || 0,
        externalActionsStarted: false,
      },
    });
    res.json({
      ok: true,
      item: updated,
      runtimeAgentsStarted: 0,
      productionEnabled: false,
      roleSeatCreated: reviewResult.roleSeatCreated,
      roleTemplateId: reviewResult.roleTemplateId,
      nextStep:
        nextStatus === "approved"
          ? reviewResult.roleSeatCreated
            ? "A governed demand-backed role seat was added to the organization. Create the employee inactive, edit the identity and face, then review activation."
            : "Provision the approved role seat separately. It will remain inactive until explicitly enabled."
          : null,
    });
  } catch (error: any) {
    res.status(Number(error?.statusCode || 500)).json({ message: error?.message || "Failed to review workforce request" });
  }
});

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
        and coalesce(seat_type, 'agent') <> 'role_seat'
    `);

    const market = await db.execute(sql`
      select
        count(*)::int as marketplace_agents,
        count(*) filter (where is_visible = true)::int as marketplace_visible,
        coalesce(sum(price_monthly) filter (where is_visible = true), 0)::numeric as visible_monthly_revenue
      from agent_marketplace_profiles mp
      join ece_agent_templates t
        on t.id = mp.agent_id and t.tenant_id = ${tenant.tenantId}
      where mp.tenant_id = ${tenant.tenantId}
        and coalesce(t.seat_type, 'agent') <> 'role_seat'
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

router.get("/admin/agents-os/role-seats", async (req: any, res) => {
  try {
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    if (tenant.tenantKey !== "exportunity") {
      return res.status(404).json({ message: "The Exportunity global organization is not available for this tenant." });
    }

    await ensureExportunityRoleSeatCatalog();
    await ensureAgentsProductionTables();
    const result = await db.execute(sql`
      select
        t.id,
        t.code,
        t.title as display_name,
        coalesce(nullif(t.role_title, ''), t.title) as role_title,
        t.department_key,
        t.seat_status,
        t.organization_version,
        t.role_profile,
        t.avatar_url,
        t.runtime_agent_id,
        a.status as runtime_status,
        coalesce(nullif(a.display_name, ''), a.name) as runtime_display_name,
        a.role as runtime_role,
        coalesce(nullif(a.avatar_url, ''), nullif(a.avatar, '')) as runtime_avatar_url,
        a.manager_id as runtime_manager_id,
        manager.display_name as runtime_manager_name,
        coalesce(ap.is_enabled, false) as production_enabled
      from ece_agent_templates t
      left join agents a
        on a.id = t.runtime_agent_id and a.tenant_id = ${tenant.tenantId}
      left join agents manager
        on manager.id = a.manager_id and manager.tenant_id = ${tenant.tenantId}
      left join agents_production ap
        on ap.agent_id = t.runtime_agent_id and ap.tenant_id = ${tenant.tenantId}
      where t.tenant_id = ${tenant.tenantId}
        and t.seat_type = 'role_seat'
      order by t.department_key asc, t.id asc
    `);
    const seats = getRows<any>(result);
    const demandCreated = seats.filter(
      (seat) => seat.role_profile?.dynamicRoleSeat === true,
    );
    const departments = EXPORTUNITY_ROLE_SEAT_DEPARTMENTS.map((department) => {
      const departmentSeats = seats.filter(
        (seat) => seat.department_key === department.key,
      );
      const departmentDemandCreated = departmentSeats.filter(
        (seat) => seat.role_profile?.dynamicRoleSeat === true,
      ).length;
      return {
        key: department.key,
        name: department.name,
        mission: department.mission,
        baseCapacity: department.capacity,
        capacity: department.capacity + departmentDemandCreated,
        demandCreated: departmentDemandCreated,
        seats: departmentSeats,
      };
    });

    res.json({
      ok: true,
      organizationVersion: seats[0]?.organization_version || null,
      summary: {
        total: seats.length,
        baseline: EXPORTUNITY_ROLE_SEAT_TOTAL,
        demandCreated: demandCreated.length,
        available: seats.filter((seat) => !seat.runtime_agent_id).length,
        provisioned: seats.filter(
          (seat) =>
            Number(seat.runtime_agent_id || 0) > 0 &&
            seat.runtime_status !== "active",
        ).length,
        activeRuntime: seats.filter((seat) => seat.runtime_status === "active").length,
        productionEnabled: seats.filter((seat) => Boolean(seat.production_enabled)).length,
      },
      departments,
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load Exportunity role seats" });
  }
});

router.get("/admin/agents-os/core-team-reconciliation", async (req: any, res) => {
  try {
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    if (tenant.tenantKey !== "exportunity") {
      return res.status(404).json({ message: "Core-team reconciliation is not available for this tenant." });
    }

    await ensureExportunityRoleSeatCatalog();
    await ensureAgentsProductionTables();
    const reconciliation = await buildCoreTeamReconciliation(tenant.tenantId);
    res.json({
      ok: true,
      mode: "preview",
      ...reconciliation,
      mutationsApplied: 0,
      permissionsChanged: false,
      lifecycleChanged: false,
      externalActionsStarted: false,
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to preview current-team reconciliation" });
  }
});

router.post("/admin/agents-os/core-team-reconciliation/apply", async (req: any, res) => {
  try {
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    if (tenant.tenantKey !== "exportunity") {
      return res.status(404).json({ message: "Core-team reconciliation is not available for this tenant." });
    }
    if (req.body?.confirm !== true) {
      return res.status(400).json({ message: "Explicit confirmation is required before linking the current team." });
    }

    await ensureExportunityRoleSeatCatalog();
    await ensureAgentsProductionTables();
    const before = await buildCoreTeamReconciliation(tenant.tenantId);
    if (before.summary.blocked > 0) {
      return res.status(409).json({
        message: "Resolve every blocked current-team match before applying reconciliation.",
        ...before,
      });
    }

    const ready = before.items.filter(
      (item) => item.status === "ready" && item.employee?.id && item.roleSeat?.id,
    );
    if (ready.length > 0) {
      await db.transaction(async (tx) => {
        for (const item of ready) {
          const templateId = Number(item.roleSeat.id);
          const runtimeAgentId = Number(item.employee!.id);
          const lockedResult = await tx.execute(sql`
            select id, runtime_agent_id, approval_policy
            from ece_agent_templates
            where id = ${templateId}
              and tenant_id = ${tenant.tenantId}
              and seat_type = 'role_seat'
            for update
          `);
          const locked = getRows<any>(lockedResult)[0];
          if (!locked) throw new Error(`Role seat ${item.roleSeat.code} is unavailable`);
          if (Number(locked.runtime_agent_id || 0) > 0) {
            throw new Error(`${item.roleSeat.roleTitle} was assigned while reconciliation was in progress`);
          }

          const existingEmployeeSeat = getRows<any>(
            await tx.execute(sql`
              select id, title
              from ece_agent_templates
              where tenant_id = ${tenant.tenantId}
                and seat_type = 'role_seat'
                and runtime_agent_id = ${runtimeAgentId}
                and id <> ${templateId}
              limit 1
            `),
          )[0];
          if (existingEmployeeSeat?.id) {
            throw new Error(`${item.employee!.displayName} was assigned to ${existingEmployeeSeat.title} while reconciliation was in progress`);
          }

          const approvalPolicy = {
            ...(locked.approval_policy && typeof locked.approval_policy === "object" ? locked.approval_policy : {}),
            runtimeAgentId,
            activationState: item.employee!.status,
            reconciliationSource: "existing_core_team",
            reconciledOrganizationKey: item.organizationKey,
            reconciledAt: new Date().toISOString(),
            productionEnablement: "human_approval_required",
            externalCommunication: "human_approval_required",
          };
          await tx.execute(sql`
            update ece_agent_templates
            set runtime_agent_id = ${runtimeAgentId},
                seat_status = 'provisioned',
                approval_policy = ${JSON.stringify(approvalPolicy)}::jsonb,
                updated_by_user_id = ${req.adminUser?.id ? Number(req.adminUser.id) : null},
                updated_at = now()
            where id = ${templateId} and tenant_id = ${tenant.tenantId}
          `);
        }
      });
    }

    const after = await buildCoreTeamReconciliation(tenant.tenantId);
    await writeAudit({
      tenantId: tenant.tenantId,
      actor: req.adminUser,
      action: "CORE_TEAM_ROLE_SEATS_RECONCILED",
      entityType: "agent_organization",
      entityId: null,
      before: before.summary,
      after: {
        ...after.summary,
        linkedNow: ready.length,
        roleSeatLinks: ready.map((item) => ({
          organizationKey: item.organizationKey,
          runtimeAgentId: item.employee?.id,
          roleSeatId: item.roleSeat.id,
          roleSeatCode: item.roleSeat.code,
        })),
      },
      metadata: {
        source: "explicit_admin_reconciliation",
        permissionsChanged: false,
        lifecycleChanged: false,
        externalActionsStarted: false,
      },
      req,
    });

    res.json({
      ok: true,
      mode: "applied",
      ...after,
      linkedNow: ready.length,
      permissionsChanged: false,
      lifecycleChanged: false,
      externalActionsStarted: false,
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to reconcile the current team" });
  }
});

router.post("/admin/agents/:id(\\d+)/provision", async (req: any, res) => {
  try {
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    if (tenant.tenantKey !== "exportunity") {
      return res.status(404).json({ message: "Role-seat provisioning is not available for this tenant." });
    }

    await ensureExportunityRoleSeatCatalog();
    await ensureAgentManagementV2Tables();
    await ensureIndustrialTables();
    const templateId = Number(req.params.id);
    const staffingRequestId = Math.max(0, Number(req.body?.staffingRequestId || 0));
    const companyId = await ensureDefaultCompany({
      tenantId: tenant.tenantId,
      tenantKey: tenant.tenantKey,
      tenantName: "Exportunity",
      attachUnassignedAgents: false,
    });

    const templateResult = await db.execute(sql`
      select *
      from ece_agent_templates
      where id = ${templateId}
        and tenant_id = ${tenant.tenantId}
        and seat_type = 'role_seat'
      limit 1
    `);
    const template = getRows<any>(templateResult)[0];
    if (!template) return res.status(404).json({ message: "Role seat not found" });

    const profile = template.role_profile && typeof template.role_profile === "object"
      ? template.role_profile
      : {};
    const specialistOrganizationKey = commercialStaffingSpecialistKey(
      template.role_title || profile.role || template.title,
    );
    let staffingRequest: any = null;
    if (staffingRequestId > 0) {
      const staffingResult = await db.execute(sql`
        select *
        from industrial_agent_staffing_requests
        where id = ${staffingRequestId}
          and tenant_id = ${tenant.tenantId}
          and role_template_id = ${templateId}
        limit 1
      `);
      staffingRequest = getRows<any>(staffingResult)[0];
      if (!staffingRequest) {
        return res.status(404).json({ message: "The approved workforce request does not match this role seat." });
      }
      if (String(staffingRequest.status) !== "approved") {
        return res.status(409).json({ message: `Approve this workforce request before provisioning. Current status: ${staffingRequest.status}.` });
      }
      if (
        String(staffingRequest.governance_status || "") !== "ready" ||
        !Number(staffingRequest.company_brain_context_pack_id || 0) ||
        !staffingRequest.evidence?.decisionRecord
      ) {
        return res.status(409).json({
          message: "Re-review this staffing need with Company Brain evidence before provisioning.",
        });
      }
      const staffingDecisionExpiresAt = staffingRequest.evidence?.decisionRecord?.expiresAt
        ? new Date(staffingRequest.evidence.decisionRecord.expiresAt)
        : null;
      if (
        !staffingDecisionExpiresAt ||
        !Number.isFinite(staffingDecisionExpiresAt.getTime()) ||
        staffingDecisionExpiresAt <= new Date()
      ) {
        return res.status(409).json({
          message: "This staffing approval expired. Re-review the need before provisioning.",
        });
      }
    }
    const capacityBaseRoleCode = asString(staffingRequest?.evidence?.baseRoleCode);
    const capacityOrdinal = Math.max(
      1,
      Number(staffingRequest?.evidence?.capacityOrdinal || 1),
    );
    const capacityLimit = Math.max(
      1,
      Number(staffingRequest?.evidence?.capacityLimit || 6),
    );
    const isCapacityExpansion = Boolean(
      staffingRequest?.evidence?.capacityExpansion || capacityOrdinal > 1,
    );
    const runtimeOrganizationKey = isCapacityExpansion
      ? asString(template.code)
      : specialistOrganizationKey || asString(template.code);
    const departmentKey = asString(profile.departmentKey || template.department_key || "operations");
    const departmentName = asString(profile.departmentName || "Operations");
    const existingDepartmentResult = await db.execute(sql`
      select id
      from departments
      where company_id = ${companyId}
        and (
          metadata->>'organizationKey' = ${departmentKey}
          or lower(name) = lower(${departmentName})
        )
      order by case when metadata->>'organizationKey' = ${departmentKey} then 0 else 1 end, id asc
      limit 1
    `);
    let departmentId = Number(getRows<any>(existingDepartmentResult)[0]?.id || 0);
    if (!departmentId) {
      const departmentOrder = Math.max(
        1,
        EXPORTUNITY_ROLE_SEAT_DEPARTMENTS.findIndex((item) => item.key === departmentKey) + 1,
      ) * 10;
      const createdDepartment = await db.execute(sql`
        insert into departments (company_id, name, description, color, "order", metadata, created_at, updated_at)
        values (
          ${companyId},
          ${departmentName},
          ${asString(profile.description || `Global operating department for ${departmentName}.`)},
          '#F5A623',
          ${departmentOrder},
          ${JSON.stringify({
            organizationKey: departmentKey,
            organizationVersion: template.organization_version,
            operatingModel: "exportunity-global-trade-os",
          })}::jsonb,
          now(),
          now()
        )
        returning id
      `);
      departmentId = Number(getRows<any>(createdDepartment)[0]?.id || 0);
    }

    const managerOrganizationKey = asString(profile.managerOrganizationKey || "ceo");
    const manager = await resolveRoleSeatManager({
      tenantId: tenant.tenantId,
      companyId,
      managerOrganizationKey,
    });
    if (!manager?.id) {
      return res.status(409).json({
        message: `No active manager is available for ${departmentName}. Restore the core organization before hiring this employee.`,
      });
    }

    const result = await db.transaction(async (tx) => {
      const lockedResult = await tx.execute(sql`
        select *
        from ece_agent_templates
        where id = ${templateId}
          and tenant_id = ${tenant.tenantId}
          and seat_type = 'role_seat'
        for update
      `);
      const locked = getRows<any>(lockedResult)[0];
      if (!locked) throw new Error("Role seat not found");
      const linkedRuntimeId = Number(locked.runtime_agent_id || 0);
      if (linkedRuntimeId > 0) {
        const reuseMetadata = {
          organizationKey: runtimeOrganizationKey,
          ...(specialistOrganizationKey
            ? { specialistFunctionKey: specialistOrganizationKey }
            : {}),
          roleSeatTemplateId: templateId,
          departmentKey,
          managerOrganizationKey,
          workforceBaseRoleCode: capacityBaseRoleCode || asString(template.code),
          workforceCapacityOrdinal: capacityOrdinal,
          workforceCaseCapacity: capacityLimit,
          ...(staffingRequestId > 0
            ? {
                staffingRequestId,
                demandCount: Number(staffingRequest?.demand_count || 0),
                demandThreshold: Number(staffingRequest?.demand_threshold || 0),
                evidenceItems: Array.isArray(staffingRequest?.evidence_items) ? staffingRequest.evidence_items : [],
              }
            : {}),
        };
        const reusedResult = await tx.execute(sql`
          update agents
          set manager_id = coalesce(manager_id, ${Number(manager.id)}),
              department_id = coalesce(department_id, ${departmentId || null}),
              metadata = jsonb_set(
                coalesce(metadata, '{}'::jsonb) || ${JSON.stringify(reuseMetadata)}::jsonb,
                '{managerAgentId}',
                to_jsonb(coalesce(manager_id, ${Number(manager.id)})),
                true
              ),
              updated_at = now()
          where id = ${linkedRuntimeId} and tenant_id = ${tenant.tenantId}
          returning id, status, manager_id
        `);
        const reused = getRows<any>(reusedResult)[0];
        if (!reused?.id) throw new Error("The linked runtime employee is unavailable for this tenant");
        return {
          runtimeAgentId: linkedRuntimeId,
          runtimeStatus: asString(reused.status || "inactive"),
          managerAgentId: Number(reused.manager_id || manager.id),
          alreadyProvisioned: true,
        };
      }

      const roleProfile = locked.role_profile && typeof locked.role_profile === "object"
        ? locked.role_profile
        : profile;
      const roleLevel = Math.max(1, Math.min(5, Number(roleProfile.roleLevel || 2)));
      const hierarchyLevel = roleLevel >= 5 ? "super" : roleLevel >= 4 ? "director" : roleLevel >= 3 ? "manager" : "executor";
      const intelligenceCap = roleLevel >= 5 ? "UNLIMITED" : roleLevel >= 4 ? "HIGH" : roleLevel >= 3 ? "MEDIUM" : "LOW";
      const displayName = asString(locked.title || roleProfile.defaultDisplayName || roleProfile.role || "Exportunity Agent");
      const role = asString(locked.role_title || roleProfile.role || displayName);
      const permittedTools = Array.isArray(roleProfile.permittedTools) ? roleProfile.permittedTools : [];
      const dailyTokenLimit = Math.max(1_000, Math.min(120_000, Number(roleProfile.budget?.dailyTokenLimit || 10_000)));
      const approvalRules = {
        externalCommunication: "human_approval_required",
        payments: "human_approval_required",
        contracts: "human_approval_required",
        publicClaims: "human_approval_required",
        productionEnablement: "human_approval_required",
        backgroundAutonomy: "disabled",
      };
      const metadata = {
        organizationKey: runtimeOrganizationKey,
        ...(specialistOrganizationKey
          ? { specialistFunctionKey: specialistOrganizationKey }
          : {}),
        organizationVersion: asString(locked.organization_version),
        operatingModel: "exportunity-global-trade-os",
        roleSeatTemplateId: templateId,
        staffingRequestId: staffingRequestId || null,
        demandCount: Number(staffingRequest?.demand_count || 0),
        demandThreshold: Number(staffingRequest?.demand_threshold || 0),
        evidenceItems: Array.isArray(staffingRequest?.evidence_items) ? staffingRequest.evidence_items : [],
        departmentKey,
        managerOrganizationKey,
        managerAgentId: Number(manager.id),
        workforceBaseRoleCode: capacityBaseRoleCode || asString(locked.code),
        workforceCapacityOrdinal: capacityOrdinal,
        workforceCaseCapacity: capacityLimit,
        companyContext: "Exportunity is a global AI-managed trade, sourcing, industrial supply, and market expansion platform.",
        activationState: "inactive",
        roleSeatProfile: roleProfile,
      };

      const inserted = await tx.execute(sql`
        insert into agents (
          tenant_id, company_id, department_id, manager_id, env, is_test, is_visible,
          name, display_name, role, hierarchy_level, intelligence_cap, max_context_tokens,
          max_daily_tokens, is_super_agent, token_multiplier, is_department_head, status,
          avatar_url, country, timezone, languages, skills, industry_focus, personality,
          mission, responsibilities, kpi_targets, permissions, autonomy_level, approval_rules,
          role_level, context_window_tokens, decision_authority, can_approve_below,
          communication_style, capabilities, base_budget, budget_used, budget_bonus, metadata,
          domain, department_key, tools_enabled_json, is_template, created_at, updated_at
        ) values (
          ${tenant.tenantId}, ${companyId}, ${departmentId || null}, ${Number(manager.id)}, 'prod', false, true,
          ${displayName}, ${displayName}, ${role}, ${hierarchyLevel}, ${intelligenceCap}, 32000,
          ${dailyTokenLimit}, ${roleLevel >= 5}, '1.00', false, 'inactive',
          ${asString(locked.avatar_url) || null}, ${asString(roleProfile.geographicCompetencies?.[0] || "Global")}, 'UTC',
          ${JSON.stringify(Array.isArray(roleProfile.languages) ? roleProfile.languages : ["English", "French"])}::jsonb,
          ${JSON.stringify(Array.isArray(roleProfile.sectorCompetencies) ? roleProfile.sectorCompetencies : [])}::jsonb,
          ${JSON.stringify(Array.isArray(roleProfile.sectorCompetencies) ? roleProfile.sectorCompetencies : [])}::jsonb,
          ${JSON.stringify(locked.personality_profile || {})}::jsonb,
          ${asString(roleProfile.description || locked.long_description || locked.description)},
          ${JSON.stringify(Array.isArray(roleProfile.escalationRules) ? roleProfile.escalationRules : [])}::jsonb,
          '{}'::jsonb,
          ${JSON.stringify({ email: false, calendar: false, crm: false, knowledge: true, payments: false, webResearch: false })}::jsonb,
          'draft_only', ${JSON.stringify(approvalRules)}::jsonb,
          ${roleLevel}, 16000, ${asString(roleProfile.decisionAuthority || "low")}, false,
          ${JSON.stringify({ tone: "direct", verbosity: "concise", emoji: false })}::jsonb,
          ${JSON.stringify(permittedTools)}::jsonb,
          '0.00', '0.00', '0.00', ${JSON.stringify(metadata)}::jsonb,
          'INTERNAL', ${departmentKey}, ${JSON.stringify(permittedTools)}::jsonb, false, now(), now()
        )
        returning id, name, role, status
      `);
      const runtime = getRows<any>(inserted)[0];
      if (!runtime?.id) throw new Error("Unable to provision runtime agent");

      const approvalPolicy = {
        ...(locked.approval_policy && typeof locked.approval_policy === "object" ? locked.approval_policy : {}),
        runtimeAgentId: Number(runtime.id),
        activationState: "inactive",
        productionEnablement: "human_approval_required",
      };
      await tx.execute(sql`
        update ece_agent_templates
        set runtime_agent_id = ${Number(runtime.id)},
            seat_status = 'provisioned',
            approval_policy = ${JSON.stringify(approvalPolicy)}::jsonb,
            updated_by_user_id = ${req.adminUser?.id ? Number(req.adminUser.id) : null},
            updated_at = now()
        where id = ${templateId} and tenant_id = ${tenant.tenantId}
      `);

      await tx.execute(sql`
        update industrial_agent_staffing_requests
        set status = 'provisioned',
            provisioned_agent_id = ${Number(runtime.id)},
            provisioned_at = now(),
            updated_at = now()
        where tenant_id = ${tenant.tenantId}
          and role_template_id = ${templateId}
          and status = 'approved'
          and ${staffingRequestId} > 0
          and id = ${staffingRequestId}
      `);

      return {
        runtimeAgentId: Number(runtime.id),
        runtimeStatus: "inactive",
        managerAgentId: Number(manager.id),
        alreadyProvisioned: false,
      };
    });

    // Reusing an existing inactive runtime still fulfils an approved staffing
    // request. Provisioning never activates the runtime or external tools.
    await db.execute(sql`
      update industrial_agent_staffing_requests
      set status = 'provisioned',
          provisioned_agent_id = ${result.runtimeAgentId},
          provisioned_at = coalesce(provisioned_at, now()),
          updated_at = now()
      where tenant_id = ${tenant.tenantId}
        and role_template_id = ${templateId}
        and status = 'approved'
        and ${staffingRequestId} > 0
        and id = ${staffingRequestId}
    `);

    await writeAudit({
      tenantId: tenant.tenantId,
      actor: req.adminUser,
      action: result.alreadyProvisioned ? "ROLE_SEAT_PROVISION_REUSED" : "ROLE_SEAT_PROVISION",
      entityType: "role_seat",
      entityId: templateId,
      before: template,
      after: {
        runtimeAgentId: result.runtimeAgentId,
        status: result.runtimeStatus,
        productionEnabled: false,
        externalCommunicationsEnabled: false,
        managerAgentId: result.managerAgentId,
        managerName: asString(manager.display_name || manager.name),
        staffingRequestId: staffingRequestId || null,
      },
      req,
    });

    res.status(result.alreadyProvisioned ? 200 : 201).json({
      ok: true,
      ...result,
      status: result.runtimeStatus,
      productionEnabled: false,
      externalCommunicationsEnabled: false,
      manager: {
        id: Number(manager.id),
        name: asString(manager.display_name || manager.name),
        role: asString(manager.role),
      },
      staffingRequestId: staffingRequestId || null,
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to provision role seat" });
  }
});

router.post("/admin/agents-os/workforce-requests/:id(\\d+)/lifecycle", async (req: any, res) => {
  try {
    const tenant = resolveTenant(req, res);
    if (!tenant) return;
    if (tenant.tenantKey !== "exportunity") {
      return res.status(404).json({ message: "Demand-driven workforce is not available for this tenant." });
    }
    await ensureIndustrialTables();
    await ensureAgentManagementV2Tables();
    await ensureAgentsProductionTables();

    const requestId = Number(req.params.id);
    const action = asString(req.body?.action).toLowerCase();
    const reason = asString(req.body?.reason).slice(0, 1200);
    if (!requestId || !["activate", "pause"].includes(action)) {
      return res.status(400).json({ message: "Choose activate or pause." });
    }
    if (action === "activate" && req.body?.confirmActivation !== true) {
      return res.status(400).json({ message: "Explicit activation confirmation is required." });
    }

    const beforeResult = await db.execute(sql`
      select
        sr.*,
        a.status as runtime_status,
        a.display_name as runtime_display_name,
        a.role as runtime_role,
        a.manager_id,
        a.role_level,
        a.max_daily_tokens,
        a.permissions,
        a.metadata as runtime_metadata,
        manager.status as manager_status,
        t.id as template_id,
        t.role_profile,
        t.approval_policy
      from industrial_agent_staffing_requests sr
      left join agents a on a.id = sr.provisioned_agent_id and a.tenant_id = sr.tenant_id
      left join agents manager on manager.id = a.manager_id and manager.tenant_id = sr.tenant_id
      left join ece_agent_templates t on t.id = sr.role_template_id and t.tenant_id = sr.tenant_id
      where sr.id = ${requestId} and sr.tenant_id = ${tenant.tenantId}
      limit 1
    `);
    const before = getRows<any>(beforeResult)[0];
    if (!before) return res.status(404).json({ message: "Workforce request not found." });
    const runtimeAgentId = Number(before.provisioned_agent_id || 0);
    if (!runtimeAgentId) {
      return res.status(409).json({ message: "Provision and edit this employee before activation." });
    }
    if (!Number(before.manager_id || 0) || String(before.manager_status || "") !== "active") {
      return res.status(409).json({ message: "Assign an active manager before activation." });
    }

    const targetAgentStatus = action === "activate" ? "active" : "paused";
    const targetRequestStatus = action === "activate" ? "active" : "paused";
    if (action === "activate" && !["provisioned", "paused"].includes(String(before.status))) {
      return res.status(409).json({ message: `This employee cannot be activated from ${before.status}.` });
    }
    if (action === "pause" && String(before.status) !== "active") {
      return res.status(409).json({ message: `This employee cannot be paused from ${before.status}.` });
    }

    const profile = before.role_profile && typeof before.role_profile === "object" ? before.role_profile : {};
    const permittedTools = Array.isArray(profile.permittedTools) ? profile.permittedTools : [];
    const permissions = {
      ...(before.permissions && typeof before.permissions === "object" ? before.permissions : {}),
      email: false,
      calendar: false,
      crm: permittedTools.includes("update_crm") || permittedTools.includes("create_lead"),
      knowledge: true,
      payments: false,
      webResearch: permittedTools.includes("search_web"),
    };
    const runtimeMetadata = before.runtime_metadata && typeof before.runtime_metadata === "object"
      ? before.runtime_metadata
      : {};
    const specialistOrganizationKey = commercialStaffingSpecialistKey(
      before.runtime_role || before.role_title,
    );
    const isCapacityExpansion = Boolean(
      before.evidence?.capacityExpansion ||
        Number(before.evidence?.capacityOrdinal || 1) > 1,
    );
    const nextRuntimeMetadata = {
      ...runtimeMetadata,
      organizationKey: isCapacityExpansion
        ? asString(runtimeMetadata.organizationKey || before.role_code)
        : specialistOrganizationKey ||
          asString(runtimeMetadata.organizationKey || before.role_code),
      ...(specialistOrganizationKey
        ? { specialistFunctionKey: specialistOrganizationKey }
        : {}),
      workforceBaseRoleCode:
        asString(before.evidence?.baseRoleCode) ||
        asString(runtimeMetadata.workforceBaseRoleCode || before.role_code),
      workforceCapacityOrdinal: Math.max(
        1,
        Number(
          before.evidence?.capacityOrdinal ||
            runtimeMetadata.workforceCapacityOrdinal ||
            1,
        ),
      ),
      workforceCaseCapacity: Math.max(
        1,
        Number(
          before.evidence?.capacityLimit ||
            runtimeMetadata.workforceCaseCapacity ||
            6,
        ),
      ),
      activationState: action === "activate" ? "active" : "paused",
      activationSource: "human_workforce_approval",
    };
    const model = asString(process.env.OPENAI_EXPORTUNITY_MODEL || process.env.OPENAI_MODEL || "gpt-5.6-terra");
    const roleLevel = Number(before.role_level || profile.roleLevel || 2);
    const productionMetadata = {
      source: "demand_driven_workforce",
      staffingRequestId: requestId,
      roleSeatTemplateId: Number(before.template_id || 0) || null,
      role: asString(before.runtime_role || before.role_title),
      managerAgentId: Number(before.manager_id),
      externalActions: "human_approval_required",
      backgroundConversations: "disabled",
      eventDrivenExecution: true,
      organizationKey:
        asString(nextRuntimeMetadata.organizationKey) || null,
      specialistFunctionKey: specialistOrganizationKey || null,
      modelPolicy: {
        model,
        reasoningEffort: roleLevel >= 4 ? "high" : roleLevel >= 3 ? "medium" : "low",
        maxDailyTokens: Number(before.max_daily_tokens || 10_000),
      },
    };

    const demandRequirementIds = Array.from(
      new Set(
        [
          ...(Array.isArray(before.evidence_items)
            ? before.evidence_items.map((item: any) =>
                asString(item?.requirementId || item?.requirement_id),
              )
            : []),
          asString(before.requirement_id),
        ].filter(Boolean),
      ),
    );
    let activationTaskId: number | null = null;
    const activationTaskIds: number[] = [];
    const pausedTaskIds: number[] = [];
    const linkedRequirementIds: string[] = [];

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        update agents
        set status = ${targetAgentStatus},
            autonomy_level = ${action === "activate" ? "partial" : "draft_only"},
            permissions = ${JSON.stringify(permissions)}::jsonb,
            approval_rules = coalesce(approval_rules, '{}'::jsonb) || ${JSON.stringify({
              externalCommunication: "human_approval_required",
              payments: "human_approval_required",
              contracts: "human_approval_required",
              publicClaims: "human_approval_required",
              backgroundAutonomy: "disabled",
            })}::jsonb,
            metadata = ${JSON.stringify(nextRuntimeMetadata)}::jsonb,
            updated_at = now()
        where id = ${runtimeAgentId} and tenant_id = ${tenant.tenantId}
      `);

      const productionResult = await tx.execute(sql`
        select id
        from agents_production
        where tenant_id = ${tenant.tenantId}
          and (agent_id = ${runtimeAgentId} or agent_key = ${asString(before.role_code)})
        order by id asc
        limit 1
        for update
      `);
      const production = getRows<any>(productionResult)[0];
      if (production?.id) {
        await tx.execute(sql`
          update agents_production
          set agent_id = ${runtimeAgentId},
              agent_key = ${asString(before.role_code)},
              display_name = ${asString(before.runtime_display_name || before.role_title)},
              is_enabled = ${action === "activate"},
              metadata = ${JSON.stringify(productionMetadata)}::jsonb,
              updated_at = now()
          where id = ${Number(production.id)} and tenant_id = ${tenant.tenantId}
        `);
      } else {
        await tx.execute(sql`
          insert into agents_production (
            tenant_id, agent_id, agent_key, display_name, is_enabled, metadata, created_at, updated_at
          ) values (
            ${tenant.tenantId}, ${runtimeAgentId}, ${asString(before.role_code)},
            ${asString(before.runtime_display_name || before.role_title)}, ${action === "activate"},
            ${JSON.stringify(productionMetadata)}::jsonb, now(), now()
          )
        `);
      }

      await tx.execute(sql`
        update industrial_agent_staffing_requests
        set status = ${targetRequestStatus},
            activated_by_user_id = ${action === "activate" && req.adminUser?.id ? Number(req.adminUser.id) : before.activated_by_user_id || null},
            activated_at = ${action === "activate" ? sql`now()` : sql`activated_at`},
            paused_at = ${action === "pause" ? sql`now()` : null},
            review_note = coalesce(${reason || null}, review_note),
            updated_at = now()
        where id = ${requestId} and tenant_id = ${tenant.tenantId}
      `);

      if (Number(before.template_id || 0)) {
        const approvalPolicy = {
          ...(before.approval_policy && typeof before.approval_policy === "object" ? before.approval_policy : {}),
          activationState: action === "activate" ? "active" : "paused",
          lastLifecycleDecisionBy: req.adminUser?.id ? Number(req.adminUser.id) : null,
          externalCommunication: "human_approval_required",
        };
        await tx.execute(sql`
          update ece_agent_templates
          set seat_status = ${action === "activate" ? "active" : "provisioned"},
              approval_policy = ${JSON.stringify(approvalPolicy)}::jsonb,
              role_profile = jsonb_set(
                coalesce(role_profile, '{}'::jsonb),
                '{activationStatus}',
                to_jsonb(${action === "activate" ? "active" : "paused"}::text),
                true
              ),
              updated_by_user_id = ${req.adminUser?.id ? Number(req.adminUser.id) : null},
              updated_at = now()
          where id = ${Number(before.template_id)} and tenant_id = ${tenant.tenantId}
        `);
      }

      if (action === "activate" && demandRequirementIds.length && before.company_id) {
        const goalTitle = "Execute verified industrial demand with accountable agent teams";
        const goalResult = await tx.execute(sql`
          select id
          from goals
          where company_id = ${Number(before.company_id)} and title = ${goalTitle}
          order by id desc
          limit 1
        `);
        let goalId = Number(getRows<any>(goalResult)[0]?.id || 0);
        if (!goalId) {
          const createdGoal = await tx.execute(sql`
            insert into goals (
              company_id, owner_agent_id, title, description, status, priority, metadata, created_at, updated_at
            ) values (
              ${Number(before.company_id)}, ${Number(before.manager_id)}, ${goalTitle},
              'Route qualified industrial requirements to event-driven specialists with evidence, budgets, and visible approval gates.',
              'in_progress', 'high',
              ${JSON.stringify({ source: "demand_driven_workforce", tenant: "exportunity" })}::jsonb,
              now(), now()
            ) returning id
          `);
          goalId = Number(getRows<any>(createdGoal)[0]?.id || 0);
        }

        for (const demandRequirementId of demandRequirementIds) {
          const requirementResult = await tx.execute(sql`
            select reference_code, title, details, status, metadata
            from industrial_requirements
            where id = ${demandRequirementId}
              and tenant_id = ${tenant.tenantId}
            limit 1
          `);
          const requirement = getRows<any>(requirementResult)[0];
          if (!requirement) continue;
          const requirementMetadata =
            requirement.metadata && typeof requirement.metadata === "object"
              ? requirement.metadata
              : {};
          const operationsHandoff =
            requirementMetadata.operationsHandoff &&
            typeof requirementMetadata.operationsHandoff === "object"
              ? requirementMetadata.operationsHandoff
              : {};
          const parentTaskId = Number(operationsHandoff.taskId || 0) || null;
          const taskTitle = `${requirement.reference_code} - ${before.role_title}`.slice(0, 240);
          const existingTaskResult = await tx.execute(sql`
            select id
            from tasks
            where company_id = ${Number(before.company_id)}
              and agent_id = ${runtimeAgentId}
              and title = ${taskTitle}
            order by id desc
            limit 1
          `);
          let caseTaskId =
            Number(getRows<any>(existingTaskResult)[0]?.id || 0) || null;
          if (!caseTaskId) {
            const createdTaskResult = await tx.execute(sql`
              insert into tasks (
                agent_id, company_id, goal_id, objective_id, parent_task_id,
                title, description, priority, status, execution_type,
                urgency_score, importance_score, dependency_score, is_automated,
                is_group_task, participant_agent_ids, approval_status,
                approved_by_agent_id, approved_at, created_at, updated_at
              ) values (
                ${runtimeAgentId}, ${Number(before.company_id)}, ${goalId || null}, ${goalId || null},
                ${parentTaskId}, ${taskTitle},
                ${[
                  `Case-linked specialist assignment for ${requirement.reference_code}: ${requirement.title}.`,
                  `Demand evidence justified activation of ${before.role_title}.`,
                  `Review the requirement and record findings in the shared case: ${String(requirement.details || "").slice(0, 1200)}`,
                  "Do not send external messages, make payments, sign contracts, publish claims, or start background conversations without a separate visible approval.",
                ].join("\n")},
                'high', 'backlog', 'workforce_activation', 7, 8, 5,
                false, false, ${JSON.stringify([runtimeAgentId])}::jsonb,
                'approved', ${Number(before.manager_id)}, now(), now(), now()
              ) returning id
            `);
            caseTaskId =
              Number(getRows<any>(createdTaskResult)[0]?.id || 0) || null;
          } else {
            await tx.execute(sql`
              update tasks
              set parent_task_id = coalesce(parent_task_id, ${parentTaskId}),
                  execution_type = 'workforce_activation',
                  participant_agent_ids = ${JSON.stringify([runtimeAgentId])}::jsonb,
                  status = case
                    when status in ('blocked', 'canceled') then 'backlog'
                    else status
                  end,
                  updated_at = now()
              where id = ${caseTaskId}
                and company_id = ${Number(before.company_id)}
            `);
          }
          if (!caseTaskId) continue;
          if (parentTaskId) {
            await tx.execute(sql`
              update tasks
              set is_group_task = true,
                  participant_agent_ids = case
                    when coalesce(participant_agent_ids, '[]'::jsonb) @>
                      ${JSON.stringify([runtimeAgentId])}::jsonb
                      then coalesce(participant_agent_ids, '[]'::jsonb)
                    else coalesce(participant_agent_ids, '[]'::jsonb) ||
                      ${JSON.stringify([runtimeAgentId])}::jsonb
                  end,
                  updated_at = now()
              where id = ${parentTaskId}
                and company_id = ${Number(before.company_id)}
            `);
          }

          activationTaskIds.push(caseTaskId);
          linkedRequirementIds.push(demandRequirementId);
          if (!activationTaskId) activationTaskId = caseTaskId;
          const activationMetadata = {
            staffingRequestId: requestId,
            requirementId: demandRequirementId,
            referenceCode: String(requirement.reference_code),
            taskId: caseTaskId,
            parentTaskId,
            managerAgentId: Number(before.manager_id),
            externalActionsStarted: false,
          };
          await tx.execute(sql`
            insert into activity_log (
              company_id, agent_id, event_type, event_category, title, description, metadata, created_at
            ) values (
              ${Number(before.company_id)}, ${runtimeAgentId}, 'workforce_activation', 'operations',
              ${`${before.runtime_display_name || before.role_title} joined the commercial team`},
              ${`Activated for case ${requirement.reference_code} under manager #${before.manager_id}.`},
              ${JSON.stringify(activationMetadata)}::jsonb,
              now()
            )
          `);
          await tx.execute(sql`
            insert into industrial_audit_logs (
              tenant_id, actor_user_id, action, entity_type, entity_id, reason,
              previous_value, next_value, metadata, created_at
            ) values (
              ${tenant.tenantId},
              ${req.adminUser?.id ? Number(req.adminUser.id) : null},
              'industrial_requirement.employee_joined',
              'industrial_requirement', ${demandRequirementId}::uuid,
              ${reason || `Approved demand-driven activation of ${before.role_title}.`},
              '{}'::jsonb,
              ${JSON.stringify({
                agentId: runtimeAgentId,
                roleTitle: asString(before.role_title),
                taskId: caseTaskId,
                parentTaskId,
              })}::jsonb,
              ${JSON.stringify(activationMetadata)}::jsonb,
              now()
            )
          `);
        }
      }

      if (action === "pause" && before.company_id) {
        const pausedTasksResult = await tx.execute(sql`
          update tasks
          set status = 'blocked',
              updated_at = now()
          where company_id = ${Number(before.company_id)}
            and agent_id = ${runtimeAgentId}
            and execution_type = 'workforce_activation'
            and status in ('backlog', 'in_progress')
          returning id, parent_task_id, title
        `);
        const pausedTasks = getRows<any>(pausedTasksResult);
        for (const pausedTask of pausedTasks) {
          const pausedTaskId = Number(pausedTask.id || 0);
          if (!pausedTaskId) continue;
          pausedTaskIds.push(pausedTaskId);
          await tx.execute(sql`
            insert into activity_log (
              company_id, agent_id, event_type, event_category, title, description, metadata, created_at
            ) values (
              ${Number(before.company_id)}, ${runtimeAgentId}, 'workforce_pause', 'operations',
              ${`${before.runtime_display_name || before.role_title} paused case work`},
              ${`Blocked ${pausedTask.title} until the employee is reactivated or the case is reassigned.`},
              ${JSON.stringify({
                staffingRequestId: requestId,
                taskId: pausedTaskId,
                parentTaskId: Number(pausedTask.parent_task_id || 0) || null,
                externalActionsStarted: false,
              })}::jsonb,
              now()
            )
          `);
        }
      }
    });

    await writeAudit({
      tenantId: tenant.tenantId,
      actor: req.adminUser,
      action: action === "activate" ? "WORKFORCE_EMPLOYEE_ACTIVATE" : "WORKFORCE_EMPLOYEE_PAUSE",
      entityType: "industrial_agent_staffing_request",
      entityId: requestId,
      before,
      after: {
        status: targetRequestStatus,
        runtimeAgentId,
        runtimeStatus: targetAgentStatus,
        productionEnabled: action === "activate",
        externalCommunicationEnabled: false,
        activationTaskId,
        activationTaskIds,
        pausedTaskIds,
        linkedRequirementIds,
      },
      metadata: {
        reason: reason || null,
        eventDrivenExecution: true,
        activationTaskId,
        activationTaskIds,
        pausedTaskIds,
        linkedRequirementIds,
      },
      req,
    });

    res.json({
      ok: true,
      requestId,
      runtimeAgentId,
      status: targetRequestStatus,
      productionEnabled: action === "activate",
      externalCommunicationEnabled: false,
      backgroundConversationsEnabled: false,
      activationTaskId,
      activationTaskIds,
      pausedTaskIds,
      linkedRequirementIds,
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to update employee lifecycle" });
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

    const whereParts: any[] = [
      sql`t.tenant_id = ${tenant.tenantId}`,
      sql`coalesce(t.seat_type, 'agent') <> 'role_seat'`,
    ];
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
        coalesce(t.runtime_agent_id, case
          when coalesce(t.approval_policy->>'runtimeAgentId', t.approval_policy->>'runtime_agent_id', '') ~ '^[0-9]+$'
            then coalesce(t.approval_policy->>'runtimeAgentId', t.approval_policy->>'runtime_agent_id')::int
          else null
        end) as runtime_agent_id,
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

    const existingRoleProfile =
      existing.role_profile && typeof existing.role_profile === "object" && !Array.isArray(existing.role_profile)
        ? existing.role_profile
        : {};
    const incomingRoleProfile =
      req.body?.roleProfile && typeof req.body.roleProfile === "object" && !Array.isArray(req.body.roleProfile)
        ? req.body.roleProfile
        : null;
    const nextRoleProfile = incomingRoleProfile && existing.seat_type === "role_seat"
      ? {
          ...existingRoleProfile,
          description: asString(incomingRoleProfile.description ?? existingRoleProfile.description),
          languages: parseTags(incomingRoleProfile.languages ?? existingRoleProfile.languages),
          geographicCompetencies: parseTags(
            incomingRoleProfile.geographicCompetencies ?? existingRoleProfile.geographicCompetencies,
          ),
          sectorCompetencies: parseTags(
            incomingRoleProfile.sectorCompetencies ?? existingRoleProfile.sectorCompetencies,
          ),
          permittedTools: parseTags(incomingRoleProfile.permittedTools ?? existingRoleProfile.permittedTools),
          prohibitedTools: parseTags(incomingRoleProfile.prohibitedTools ?? existingRoleProfile.prohibitedTools),
          decisionAuthority: ["none", "low", "medium", "high", "executive"].includes(
            asString(incomingRoleProfile.decisionAuthority).toLowerCase(),
          )
            ? asString(incomingRoleProfile.decisionAuthority).toLowerCase()
            : asString(existingRoleProfile.decisionAuthority || "low"),
          roleLevel: Math.max(1, Math.min(5, toInt(incomingRoleProfile.roleLevel ?? existingRoleProfile.roleLevel, 2))),
          // Immutable organization identity and reporting boundaries cannot be changed from profile editing.
          immutableAgentId: existingRoleProfile.immutableAgentId,
          departmentKey: existingRoleProfile.departmentKey,
          departmentName: existingRoleProfile.departmentName,
          activationStatus: existingRoleProfile.activationStatus || "available",
        }
      : existingRoleProfile;

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
      role_profile: nextRoleProfile,
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
        role_profile = ${JSON.stringify(next.role_profile)}::jsonb,
        status = ${next.status},
        slug = ${slugify(next.slug) || existing.slug},
        updated_by_user_id = ${actor?.id ? Number(actor.id) : null},
        updated_at = now()
      where id = ${id} and tenant_id = ${tenant.tenantId}
      returning *
    `);
    const updated = getRows(updatedRows)[0];

    const runtimeAgentId = Number(existing.runtime_agent_id || 0);
    if (existing.seat_type === "role_seat" && runtimeAgentId > 0) {
      await db.execute(sql`
        update agents
        set name = ${next.title},
            display_name = ${next.title},
            role = ${next.role_title},
            avatar_url = ${next.avatar_url},
            mission = ${asString(next.role_profile.description) || null},
            languages = ${JSON.stringify(next.role_profile.languages || [])}::jsonb,
            skills = ${JSON.stringify(next.role_profile.sectorCompetencies || [])}::jsonb,
            industry_focus = ${JSON.stringify(next.role_profile.sectorCompetencies || [])}::jsonb,
            decision_authority = ${asString(next.role_profile.decisionAuthority || "low")},
            role_level = ${Math.max(1, Math.min(5, Number(next.role_profile.roleLevel || 2)))},
            metadata = coalesce(metadata, '{}'::jsonb) || ${JSON.stringify({ roleSeatProfile: next.role_profile })}::jsonb,
            updated_at = now()
        where id = ${runtimeAgentId} and tenant_id = ${tenant.tenantId}
      `);
    }

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
    if (asString(existing.seat_type) === "role_seat") {
      return res.status(409).json({
        message: "Role-seat employees use the governed Workforce review and lifecycle.",
        code: "GOVERNED_WORKFORCE_LIFECYCLE_REQUIRED",
      });
    }

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
    if (asString(existing.seat_type) === "role_seat") {
      return res.status(409).json({
        message: "Role-seat employees use the governed Workforce review and activation lifecycle.",
        code: "GOVERNED_WORKFORCE_LIFECYCLE_REQUIRED",
      });
    }

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

    const whereParts: any[] = [
      sql`t.tenant_id = ${tenant.tenantId}`,
      sql`mp.tenant_id = ${tenant.tenantId}`,
      sql`coalesce(t.seat_type, 'agent') <> 'role_seat'`,
    ];
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
