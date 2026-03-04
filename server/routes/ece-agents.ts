import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@db";
import { eceSessions, eceUsers } from "@db/schema";
import { ensureEceAgentsTables } from "../lib/ece-agents/ensureTables";
import { canManageAgents, canOperateAgents, detectsHighImpactAction, resolveTenantScope, type TenantScope } from "../lib/ece-agents/policy";
import { buildLocalizedSeedRoster } from "../lib/ece-agents/localizedRoster";

const router = Router();

type SessionUser = typeof eceUsers.$inferSelect;
type SqlExecutor = { execute: (query: any) => Promise<any> };

function getRows(result: any): any[] {
  if (Array.isArray(result?.rows)) return result.rows;
  if (Array.isArray(result)) return result;
  return [];
}

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function parsePositiveInt(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parsePositiveFloat(value: unknown, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function getBearerToken(req: any) {
  const header = req.headers?.authorization;
  if (typeof header !== "string") return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^Bearer\s+/i, "");
}

async function verifySession(token: string | null) {
  if (!token) return null;
  const session = await db.query.eceSessions.findFirst({ where: eq(eceSessions.token, token) });
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
  const user = await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, session.userId) });
  if (!user) return null;
  return user;
}

function requireTenant(req: any, res: any) {
  const tenant = req?.tenant;
  if (!tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

function monthPeriodKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

async function getOrCreateOrg(tenantId: number, user: SessionUser, scope: TenantScope) {
  const ownOrgRows = await db.execute(sql`
    select * from ece_agent_orgs
    where tenant_id = ${tenantId}
      and owner_user_id = ${user.id}
    order by id asc
    limit 1
  `);
  const ownOrg = getRows(ownOrgRows)[0];
  if (ownOrg) {
    await ensureLocalizedSeedTeam(tenantId, Number(ownOrg.id), user);
    return ownOrg;
  }

  if (canManageAgents(scope)) {
    const defaultName = `${asString(user.displayName) || "Tenant"} Team`;
    const createdRows = await db.execute(sql`
      insert into ece_agent_orgs (tenant_id, owner_user_id, name, created_at, updated_at)
      values (${tenantId}, ${user.id}, ${defaultName}, now(), now())
      on conflict (tenant_id, owner_user_id)
      do update set updated_at = now()
      returning *
    `);
    const created = getRows(createdRows)[0];
    if (created) {
      await ensureLocalizedSeedTeam(tenantId, Number(created.id), user);
      return created;
    }
  }

  const fallbackRows = await db.execute(sql`
    select * from ece_agent_orgs
    where tenant_id = ${tenantId}
    order by id asc
    limit 1
  `);
  const fallback = getRows(fallbackRows)[0] ?? null;
  if (fallback) {
    await ensureLocalizedSeedTeam(tenantId, Number(fallback.id), user);
  }
  return fallback;
}

async function ensureDefaultSubscription(tenantId: number, orgId: number, executor: SqlExecutor = db) {
  const existingRows = await executor.execute(sql`
    select
      s.*,
      p.plan_name,
      p.monthly_fee,
      p.included_agents_count,
      p.included_tokens,
      p.overage_token_price,
      p.max_agents,
      p.features
    from ece_billing_subscriptions s
    join ece_org_plans p on p.id = s.plan_id
    where s.tenant_id = ${tenantId} and s.org_id = ${orgId}
    order by s.updated_at desc
    limit 1
  `);
  const existing = getRows(existingRows)[0];
  if (existing) return existing;

  const starterPlanRows = await executor.execute(sql`
    select *
    from ece_org_plans
    where is_active = true
      and (tenant_id = ${tenantId} or tenant_id is null)
      and plan_name = 'Starter'
    order by case when tenant_id = ${tenantId} then 0 else 1 end, id asc
    limit 1
  `);
  const starter = getRows(starterPlanRows)[0];
  if (!starter) return null;

  await executor.execute(sql`
    insert into ece_billing_subscriptions (
      tenant_id, org_id, plan_id, status, renewal_date, provider, provider_ref, created_at, updated_at
    )
    values (
      ${tenantId},
      ${orgId},
      ${starter.id},
      'active',
      now() + interval '30 days',
      'manual',
      'bootstrap',
      now(),
      now()
    )
    on conflict (tenant_id, org_id)
    do update set
      plan_id = excluded.plan_id,
      status = excluded.status,
      renewal_date = excluded.renewal_date,
      updated_at = now()
  `);

  const seededRows = await executor.execute(sql`
    select
      s.*,
      p.plan_name,
      p.monthly_fee,
      p.included_agents_count,
      p.included_tokens,
      p.overage_token_price,
      p.max_agents,
      p.features
    from ece_billing_subscriptions s
    join ece_org_plans p on p.id = s.plan_id
    where s.tenant_id = ${tenantId} and s.org_id = ${orgId}
    order by s.updated_at desc
    limit 1
  `);
  return getRows(seededRows)[0] ?? null;
}

async function ensureThread(tenantId: number, orgId: number, orgAgentId: number, title: string, executor: SqlExecutor = db) {
  const rows = await executor.execute(sql`
    insert into ece_org_agent_threads (
      tenant_id, org_id, org_agent_id, title, last_message_at, created_at, updated_at
    )
    values (${tenantId}, ${orgId}, ${orgAgentId}, ${title}, now(), now(), now())
    on conflict (tenant_id, org_agent_id)
    do update set title = excluded.title, updated_at = now()
    returning *
  `);
  return getRows(rows)[0] ?? null;
}

async function appendAgentMessage(params: {
  tenantId: number;
  orgId: number;
  orgAgentId: number;
  senderType: "user" | "agent" | "system";
  senderUserId?: number | null;
  content: string;
  metadata?: Record<string, unknown>;
}, executor: SqlExecutor = db) {
  const inserted = await executor.execute(sql`
    insert into ece_org_agent_messages (
      tenant_id, org_id, org_agent_id, sender_type, sender_user_id, content, metadata, created_at
    )
    values (
      ${params.tenantId},
      ${params.orgId},
      ${params.orgAgentId},
      ${params.senderType},
      ${params.senderUserId ?? null},
      ${params.content},
      ${JSON.stringify(params.metadata || {})}::jsonb,
      now()
    )
    returning *
  `);

  await executor.execute(sql`
    update ece_org_agent_threads
    set last_message_at = now(), updated_at = now()
    where tenant_id = ${params.tenantId} and org_id = ${params.orgId} and org_agent_id = ${params.orgAgentId}
  `);

  return getRows(inserted)[0] ?? null;
}

async function ensureLocalizedSeedTeam(tenantId: number, orgId: number, user: SessionUser) {
  await db.transaction(async (tx: any) => {
    const executor: SqlExecutor = tx;

    await executor.execute(sql`select pg_advisory_xact_lock(${tenantId}, ${orgId})`);

    const existingRows = await executor.execute(sql`
      select count(*)::int as count
      from ece_org_agents
      where tenant_id = ${tenantId} and org_id = ${orgId}
    `);
    const existingCount = Number(getRows(existingRows)[0]?.count || 0);
    if (existingCount > 0) return;

    const subscription = await ensureDefaultSubscription(tenantId, orgId, executor);
    if (!subscription) return;

    const templatesRows = await executor.execute(sql`
      select id, code, title, base_salary_monthly, default_tools
      from ece_agent_templates
      where is_active = true and (tenant_id = ${tenantId} or tenant_id is null)
      order by id asc
    `);
    const templates = getRows(templatesRows);
    if (!templates.length) return;

    const templatesByCode = new Map<string, any>();
    for (const template of templates) {
      const code = asString(template?.code);
      if (!code) continue;
      if (!templatesByCode.has(code)) templatesByCode.set(code, template);
    }

    const fallbackTemplate = templates[0];
    const { locale, agents } = buildLocalizedSeedRoster(user);

    for (const profile of agents.slice(0, 5)) {
      const template = templatesByCode.get(profile.templateCode) || fallbackTemplate;
      if (!template) continue;

      const insertedRows = await executor.execute(sql`
        insert into ece_org_agents (
          tenant_id, org_id, template_id, display_name, status, salary_monthly, billing_plan_id,
          tool_policy, model_tier, language, goals, token_budget_daily, timebox_minutes, quota_snapshot,
          created_by_user_id, created_at, updated_at
        )
        values (
          ${tenantId},
          ${orgId},
          ${Number(template.id)},
          ${profile.displayName},
          'active',
          ${Number(template.base_salary_monthly || 0)},
          ${Number(subscription.plan_id)},
          ${JSON.stringify({
            tools: Array.isArray(template.default_tools) ? template.default_tools : [],
            requireApprovalExternal: true,
            seeded: true,
          })}::jsonb,
          'L0',
          ${profile.language || "en"},
          ${profile.goals || null},
          10000,
          60,
          ${JSON.stringify({
            includedTokens: Number(subscription.included_tokens || 0),
            monthlyFee: Number(subscription.monthly_fee || 0),
            seededLocale: locale,
          })}::jsonb,
          ${user.id},
          now(),
          now()
        )
        returning *
      `);
      const seededAgent = getRows(insertedRows)[0];
      if (!seededAgent) continue;

      await ensureThread(tenantId, orgId, Number(seededAgent.id), profile.displayName, executor);
      await appendAgentMessage(
        {
          tenantId,
          orgId,
          orgAgentId: Number(seededAgent.id),
          senderType: "system",
          content: `${profile.displayName} (${profile.roleTitle}) is ready. Share a mission to generate approval-gated actions.`,
          metadata: {
            event: "agent_seeded",
            locale,
            templateCode: asString(template.code),
          },
        },
        executor,
      );

      await executor.execute(sql`
        insert into ece_agent_salary_charges (
          tenant_id, org_agent_id, period, amount, status, created_at, updated_at
        )
        values (
          ${tenantId},
          ${Number(seededAgent.id)},
          ${monthPeriodKey()},
          ${Number(template.base_salary_monthly || 0)},
          'pending',
          now(),
          now()
        )
        on conflict (tenant_id, org_agent_id, period)
        do update set amount = excluded.amount, updated_at = now()
      `);
    }
  });
}

async function listPlansForTenant(tenantId: number) {
  const rows = await db.execute(sql`
    select *
    from ece_org_plans
    where is_active = true and (tenant_id = ${tenantId} or tenant_id is null)
    order by monthly_fee asc, id asc
  `);
  return getRows(rows);
}

router.use(async (req: any, res, next) => {
  try {
    await ensureEceAgentsTables();
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const token = getBearerToken(req);
    const user = await verifySession(token);
    if (!user) return res.status(401).json({ message: "Authentication required" });

    req.eceTenant = tenant;
    req.eceUser = user;
    req.eceScope = resolveTenantScope(user);
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/bootstrap", async (req: any, res) => {
  try {
    const tenantId = Number(req.eceTenant.id);
    const user = req.eceUser as SessionUser;
    const scope = req.eceScope as TenantScope;
    const org = await getOrCreateOrg(tenantId, user, scope);
    if (!org) {
      return res.json({
        ok: true,
        scope,
        canManage: canManageAgents(scope),
        canOperate: canOperateAgents(scope),
        org: null,
        templates: [],
        team: [],
      });
    }

    const subscription = await ensureDefaultSubscription(tenantId, Number(org.id));
    const templatesRows = await db.execute(sql`
      select *
      from ece_agent_templates
      where is_active = true
        and (tenant_id = ${tenantId} or tenant_id is null)
        and (visibility = 'public' or visibility = 'private' and tenant_id = ${tenantId})
      order by category asc, title asc
    `);

    const teamRows = await db.execute(sql`
      select
        a.*,
        t.code as template_code,
        t.title as template_title,
        th.last_message_at
      from ece_org_agents a
      left join ece_agent_templates t on t.id = a.template_id
      left join ece_org_agent_threads th
        on th.tenant_id = a.tenant_id and th.org_agent_id = a.id
      where a.tenant_id = ${tenantId} and a.org_id = ${Number(org.id)}
      order by a.created_at desc
    `);

    const taskStatsRows = await db.execute(sql`
      select status, count(*)::int as count
      from ece_org_agent_tasks
      where tenant_id = ${tenantId} and org_id = ${Number(org.id)}
      group by status
    `);

    const taskStats = getRows(taskStatsRows).reduce(
      (acc, row) => {
        acc[String(row.status || "unknown")] = Number(row.count || 0);
        return acc;
      },
      {} as Record<string, number>,
    );

    const billingRows = await db.execute(sql`
      select
        count(*) filter (where status = 'active')::int as active_agents,
        coalesce(sum(salary_monthly) filter (where status = 'active'), 0)::numeric as salary_total
      from ece_org_agents
      where tenant_id = ${tenantId} and org_id = ${Number(org.id)}
    `);

    const billingSummary = getRows(billingRows)[0] || { active_agents: 0, salary_total: "0" };

    return res.json({
      ok: true,
      scope,
      canManage: canManageAgents(scope),
      canOperate: canOperateAgents(scope),
      org,
      subscription,
      templates: getRows(templatesRows),
      team: getRows(teamRows),
      taskStats,
      billingSummary: {
        activeAgents: Number(billingSummary.active_agents || 0),
        monthlySalaryTotal: Number(billingSummary.salary_total || 0),
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load Agents workspace" });
  }
});

router.get("/templates", async (req: any, res) => {
  try {
    const tenantId = Number(req.eceTenant.id);
    const rows = await db.execute(sql`
      select *
      from ece_agent_templates
      where is_active = true and (tenant_id = ${tenantId} or tenant_id is null)
      order by category asc, title asc
    `);
    res.json({ ok: true, templates: getRows(rows) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list templates" });
  }
});

router.get("/team", async (req: any, res) => {
  try {
    const tenantId = Number(req.eceTenant.id);
    const user = req.eceUser as SessionUser;
    const scope = req.eceScope as TenantScope;
    const org = await getOrCreateOrg(tenantId, user, scope);
    if (!org) return res.json({ ok: true, items: [] });

    const rows = await db.execute(sql`
      select
        a.*,
        t.code as template_code,
        t.title as template_title,
        th.last_message_at,
        (
          select m.content
          from ece_org_agent_messages m
          where m.tenant_id = a.tenant_id and m.org_agent_id = a.id
          order by m.created_at desc, m.id desc
          limit 1
        ) as last_message
      from ece_org_agents a
      left join ece_agent_templates t on t.id = a.template_id
      left join ece_org_agent_threads th
        on th.tenant_id = a.tenant_id and th.org_agent_id = a.id
      where a.tenant_id = ${tenantId} and a.org_id = ${Number(org.id)}
      order by a.created_at desc
    `);

    res.json({ ok: true, items: getRows(rows) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list team" });
  }
});

router.post("/hire", async (req: any, res) => {
  try {
    const scope = req.eceScope as TenantScope;
    if (!canManageAgents(scope)) return res.status(403).json({ message: "Owner access required for hiring" });

    const tenantId = Number(req.eceTenant.id);
    const user = req.eceUser as SessionUser;
    const org = await getOrCreateOrg(tenantId, user, scope);
    if (!org) return res.status(400).json({ message: "Organization not initialized" });

    const templateId = parsePositiveInt(req.body?.templateId);
    const displayName = asString(req.body?.displayName);
    const modelTier = asString(req.body?.modelTier) || "L0";
    const language = asString(req.body?.language) || "fr";
    const goals = asString(req.body?.goals) || null;
    const tokenBudgetDaily = Math.max(1000, Math.min(500000, parsePositiveInt(req.body?.tokenBudgetDaily, 10000)));
    const timeboxMinutes = Math.max(5, Math.min(720, parsePositiveInt(req.body?.timeboxMinutes, 60)));
    const requestedSalary = parsePositiveFloat(req.body?.salaryMonthly, 0);

    if (!templateId) return res.status(400).json({ message: "templateId is required" });

    const templateRows = await db.execute(sql`
      select * from ece_agent_templates
      where id = ${templateId} and is_active = true and (tenant_id = ${tenantId} or tenant_id is null)
      limit 1
    `);
    const template = getRows(templateRows)[0];
    if (!template) return res.status(404).json({ message: "Template not found" });

    const subscription = await ensureDefaultSubscription(tenantId, Number(org.id));
    if (!subscription) return res.status(409).json({ message: "No active subscription plan found" });

    const activeAgentsRows = await db.execute(sql`
      select count(*)::int as count
      from ece_org_agents
      where tenant_id = ${tenantId}
        and org_id = ${Number(org.id)}
        and status in ('active', 'paused')
    `);
    const activeAgents = Number(getRows(activeAgentsRows)[0]?.count || 0);
    const maxAgents = Number(subscription.max_agents || 1);
    if (activeAgents >= maxAgents) {
      return res.status(409).json({
        message: `Plan limit reached (${activeAgents}/${maxAgents}). Upgrade plan to hire more agents.`,
      });
    }

    const safeName = displayName || `${template.title}`;
    const salaryMonthly = requestedSalary > 0 ? requestedSalary : Number(template.base_salary_monthly || 0);

    const insertedRows = await db.execute(sql`
      insert into ece_org_agents (
        tenant_id, org_id, template_id, display_name, status, salary_monthly, billing_plan_id,
        tool_policy, model_tier, language, goals, token_budget_daily, timebox_minutes, quota_snapshot,
        created_by_user_id, created_at, updated_at
      )
      values (
        ${tenantId},
        ${Number(org.id)},
        ${templateId},
        ${safeName},
        'active',
        ${salaryMonthly},
        ${Number(subscription.plan_id)},
        ${JSON.stringify({
          tools: Array.isArray(template.default_tools) ? template.default_tools : [],
          requireApprovalExternal: true,
        })}::jsonb,
        ${modelTier},
        ${language},
        ${goals},
        ${tokenBudgetDaily},
        ${timeboxMinutes},
        ${JSON.stringify({
          includedTokens: Number(subscription.included_tokens || 0),
          monthlyFee: Number(subscription.monthly_fee || 0),
        })}::jsonb,
        ${user.id},
        now(),
        now()
      )
      returning *
    `);
    const agent = getRows(insertedRows)[0];
    if (!agent) return res.status(500).json({ message: "Failed to create agent" });

    await ensureThread(tenantId, Number(org.id), Number(agent.id), safeName);
    await appendAgentMessage({
      tenantId,
      orgId: Number(org.id),
      orgAgentId: Number(agent.id),
      senderType: "system",
      content: `${safeName}: I am ready. Share your mission and I will return approval-gated tasks for execution.`,
      metadata: { event: "agent_hired", templateCode: template.code },
    });

    const period = monthPeriodKey();
    await db.execute(sql`
      insert into ece_agent_salary_charges (
        tenant_id, org_agent_id, period, amount, status, created_at, updated_at
      )
      values (${tenantId}, ${Number(agent.id)}, ${period}, ${salaryMonthly}, 'pending', now(), now())
      on conflict (tenant_id, org_agent_id, period)
      do update set amount = excluded.amount, updated_at = now()
    `);

    res.status(201).json({ ok: true, agent });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to hire agent" });
  }
});

router.patch("/team/:orgAgentId", async (req: any, res) => {
  try {
    const scope = req.eceScope as TenantScope;
    if (!canManageAgents(scope)) return res.status(403).json({ message: "Owner access required" });

    const tenantId = Number(req.eceTenant.id);
    const user = req.eceUser as SessionUser;
    const org = await getOrCreateOrg(tenantId, user, scope);
    if (!org) return res.status(400).json({ message: "Organization not initialized" });

    const orgAgentId = parsePositiveInt(req.params?.orgAgentId);
    if (!orgAgentId) return res.status(400).json({ message: "Invalid agent id" });

    const status = asString(req.body?.status).toLowerCase();
    const allowedStatus = new Set(["active", "paused", "cancelled"]);
    const updates: any[] = [];

    if (status) {
      if (!allowedStatus.has(status)) return res.status(400).json({ message: "Invalid status" });
      updates.push(sql`status = ${status}`);
    }

    if (req.body?.modelTier !== undefined) updates.push(sql`model_tier = ${asString(req.body.modelTier) || "L0"}`);
    if (req.body?.language !== undefined) updates.push(sql`language = ${asString(req.body.language) || "fr"}`);
    if (req.body?.goals !== undefined) updates.push(sql`goals = ${asString(req.body.goals) || null}`);
    if (req.body?.tokenBudgetDaily !== undefined) {
      const tokenBudget = Math.max(1000, Math.min(500000, parsePositiveInt(req.body.tokenBudgetDaily, 10000)));
      updates.push(sql`token_budget_daily = ${tokenBudget}`);
    }
    if (req.body?.timeboxMinutes !== undefined) {
      const timeboxMinutes = Math.max(5, Math.min(720, parsePositiveInt(req.body.timeboxMinutes, 60)));
      updates.push(sql`timebox_minutes = ${timeboxMinutes}`);
    }
    if (req.body?.toolPolicy !== undefined) {
      updates.push(sql`tool_policy = ${JSON.stringify(req.body.toolPolicy || {})}::jsonb`);
    }

    if (!updates.length) return res.status(400).json({ message: "No updates provided" });

    updates.push(sql`updated_at = now()`);

    const updatedRows = await db.execute(sql`
      update ece_org_agents
      set ${sql.join(updates, sql`, `)}
      where tenant_id = ${tenantId}
        and org_id = ${Number(org.id)}
        and id = ${orgAgentId}
      returning *
    `);
    const updated = getRows(updatedRows)[0];
    if (!updated) return res.status(404).json({ message: "Agent not found" });

    res.json({ ok: true, agent: updated });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to update agent" });
  }
});

router.get("/threads", async (req: any, res) => {
  try {
    const tenantId = Number(req.eceTenant.id);
    const user = req.eceUser as SessionUser;
    const scope = req.eceScope as TenantScope;
    const org = await getOrCreateOrg(tenantId, user, scope);
    if (!org) return res.json({ ok: true, items: [] });

    const rows = await db.execute(sql`
      select
        a.id as org_agent_id,
        a.display_name,
        a.status,
        t.title as thread_title,
        t.last_message_at,
        (
          select m.content
          from ece_org_agent_messages m
          where m.tenant_id = t.tenant_id and m.org_agent_id = t.org_agent_id
          order by m.created_at desc, m.id desc
          limit 1
        ) as last_message
      from ece_org_agent_threads t
      join ece_org_agents a
        on a.id = t.org_agent_id and a.tenant_id = t.tenant_id and a.org_id = t.org_id
      where t.tenant_id = ${tenantId} and t.org_id = ${Number(org.id)}
      order by t.last_message_at desc nulls last, t.updated_at desc
    `);

    res.json({ ok: true, items: getRows(rows) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list threads" });
  }
});

router.get("/threads/:orgAgentId/messages", async (req: any, res) => {
  try {
    const tenantId = Number(req.eceTenant.id);
    const user = req.eceUser as SessionUser;
    const scope = req.eceScope as TenantScope;
    const org = await getOrCreateOrg(tenantId, user, scope);
    if (!org) return res.json({ ok: true, items: [] });

    const orgAgentId = parsePositiveInt(req.params?.orgAgentId);
    const limit = Math.min(300, Math.max(20, parsePositiveInt(req.query?.limit, 120)));
    if (!orgAgentId) return res.status(400).json({ message: "Invalid agent id" });

    const agentRows = await db.execute(sql`
      select id, display_name, status
      from ece_org_agents
      where tenant_id = ${tenantId} and org_id = ${Number(org.id)} and id = ${orgAgentId}
      limit 1
    `);
    const agent = getRows(agentRows)[0];
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    await ensureThread(tenantId, Number(org.id), orgAgentId, String(agent.display_name || `Agent ${orgAgentId}`));

    const rows = await db.execute(sql`
      select *
      from ece_org_agent_messages
      where tenant_id = ${tenantId}
        and org_id = ${Number(org.id)}
        and org_agent_id = ${orgAgentId}
      order by created_at asc, id asc
      limit ${limit}
    `);

    res.json({ ok: true, agent, items: getRows(rows) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load messages" });
  }
});

router.post("/threads/:orgAgentId/send", async (req: any, res) => {
  try {
    const scope = req.eceScope as TenantScope;
    if (!canOperateAgents(scope)) return res.status(403).json({ message: "Operator access required" });

    const tenantId = Number(req.eceTenant.id);
    const user = req.eceUser as SessionUser;
    const org = await getOrCreateOrg(tenantId, user, scope);
    if (!org) return res.status(400).json({ message: "Organization not initialized" });

    const orgAgentId = parsePositiveInt(req.params?.orgAgentId);
    const content = asString(req.body?.content);
    if (!orgAgentId) return res.status(400).json({ message: "Invalid agent id" });
    if (!content) return res.status(400).json({ message: "Message content required" });

    const agentRows = await db.execute(sql`
      select a.*, tpl.code as template_code
      from ece_org_agents a
      left join ece_agent_templates tpl on tpl.id = a.template_id
      where a.tenant_id = ${tenantId} and a.org_id = ${Number(org.id)} and a.id = ${orgAgentId}
      limit 1
    `);
    const agent = getRows(agentRows)[0];
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    if (String(agent.status) === "cancelled") {
      return res.status(409).json({ message: "Agent is cancelled" });
    }

    await ensureThread(tenantId, Number(org.id), orgAgentId, String(agent.display_name || `Agent ${orgAgentId}`));

    const userMessage = await appendAgentMessage({
      tenantId,
      orgId: Number(org.id),
      orgAgentId,
      senderType: "user",
      senderUserId: user.id,
      content,
      metadata: { scope, senderDisplayName: user.displayName },
    });

    const highImpact = detectsHighImpactAction(content);
    let task: any = null;
    let assistantContent = "";

    if (highImpact) {
      const taskRows = await db.execute(sql`
        insert into ece_org_agent_tasks (
          tenant_id, org_id, org_agent_id, type, title, status, payload_json, approval_required, created_at, updated_at
        )
        values (
          ${tenantId},
          ${Number(org.id)},
          ${orgAgentId},
          'external_action',
          ${`Approval required: ${content.slice(0, 140)}`},
          'needs_approval',
          ${JSON.stringify({
            instruction: content,
            requestedByUserId: user.id,
            requestedByUserName: user.displayName,
            senderType: "owner",
          })}::jsonb,
          true,
          now(),
          now()
        )
        returning *
      `);
      task = getRows(taskRows)[0] || null;

      assistantContent =
        `Task queued for approval.\n\n` +
        `- Agent: ${String(agent.display_name || "Agent")}\n` +
        `- Type: external action\n` +
        `- Task #${task?.id ?? "n/a"}\n` +
        `- Status: NEEDS_APPROVAL\n\n` +
        `I will execute only after explicit approval from the owner panel.`;
    } else {
      assistantContent =
        `${String(agent.display_name || "Agent")} acknowledged.\n\n` +
        `I keep this thread context and will return draft outputs, task cards, and approval-gated actions when external execution is requested.`;
    }

    const assistantMessage = await appendAgentMessage({
      tenantId,
      orgId: Number(org.id),
      orgAgentId,
      senderType: "agent",
      content: assistantContent,
      metadata: {
        highImpact,
        taskId: task?.id ?? null,
        templateCode: agent.template_code || null,
      },
    });

    res.json({ ok: true, userMessage, assistantMessage, task });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to send message" });
  }
});

router.get("/tasks", async (req: any, res) => {
  try {
    const tenantId = Number(req.eceTenant.id);
    const user = req.eceUser as SessionUser;
    const scope = req.eceScope as TenantScope;
    const org = await getOrCreateOrg(tenantId, user, scope);
    if (!org) return res.json({ ok: true, items: [] });

    const status = asString(req.query?.status).toLowerCase();
    const limit = Math.min(400, Math.max(20, parsePositiveInt(req.query?.limit, 100)));
    const allowedStatus = new Set(["draft", "needs_approval", "in_progress", "done", "failed", "rejected"]);
    const statusFilter = allowedStatus.has(status) ? status : null;

    const rows = await db.execute(
      statusFilter
        ? sql`
            select
              t.*,
              a.display_name as agent_name
            from ece_org_agent_tasks t
            join ece_org_agents a
              on a.id = t.org_agent_id and a.tenant_id = t.tenant_id and a.org_id = t.org_id
            where t.tenant_id = ${tenantId}
              and t.org_id = ${Number(org.id)}
              and t.status = ${statusFilter}
            order by t.created_at desc, t.id desc
            limit ${limit}
          `
        : sql`
            select
              t.*,
              a.display_name as agent_name
            from ece_org_agent_tasks t
            join ece_org_agents a
              on a.id = t.org_agent_id and a.tenant_id = t.tenant_id and a.org_id = t.org_id
            where t.tenant_id = ${tenantId}
              and t.org_id = ${Number(org.id)}
            order by t.created_at desc, t.id desc
            limit ${limit}
          `,
    );

    res.json({ ok: true, items: getRows(rows) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to list tasks" });
  }
});

router.post("/tasks/:taskId/approve", async (req: any, res) => {
  try {
    const scope = req.eceScope as TenantScope;
    if (!canManageAgents(scope)) return res.status(403).json({ message: "Owner access required" });

    const tenantId = Number(req.eceTenant.id);
    const user = req.eceUser as SessionUser;
    const org = await getOrCreateOrg(tenantId, user, scope);
    if (!org) return res.status(400).json({ message: "Organization not initialized" });

    const taskId = parsePositiveInt(req.params?.taskId);
    if (!taskId) return res.status(400).json({ message: "Invalid task id" });

    const taskRows = await db.execute(sql`
      update ece_org_agent_tasks
      set status = 'done',
          approved_by_user_id = ${user.id},
          approved_at = now(),
          updated_at = now()
      where id = ${taskId}
        and tenant_id = ${tenantId}
        and org_id = ${Number(org.id)}
      returning *
    `);
    const task = getRows(taskRows)[0];
    if (!task) return res.status(404).json({ message: "Task not found" });

    await appendAgentMessage({
      tenantId,
      orgId: Number(org.id),
      orgAgentId: Number(task.org_agent_id),
      senderType: "system",
      content: `Task #${task.id} approved and executed.`,
      metadata: {
        event: "task_approved",
        approvedByUserId: user.id,
        taskId: task.id,
      },
    });

    res.json({ ok: true, task });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to approve task" });
  }
});

router.post("/tasks/:taskId/reject", async (req: any, res) => {
  try {
    const scope = req.eceScope as TenantScope;
    if (!canManageAgents(scope)) return res.status(403).json({ message: "Owner access required" });

    const tenantId = Number(req.eceTenant.id);
    const user = req.eceUser as SessionUser;
    const org = await getOrCreateOrg(tenantId, user, scope);
    if (!org) return res.status(400).json({ message: "Organization not initialized" });

    const taskId = parsePositiveInt(req.params?.taskId);
    if (!taskId) return res.status(400).json({ message: "Invalid task id" });
    const reason = asString(req.body?.reason) || "Rejected by owner";

    const taskRows = await db.execute(sql`
      update ece_org_agent_tasks
      set status = 'rejected',
          rejected_by_user_id = ${user.id},
          rejected_at = now(),
          rejection_reason = ${reason},
          updated_at = now()
      where id = ${taskId}
        and tenant_id = ${tenantId}
        and org_id = ${Number(org.id)}
      returning *
    `);
    const task = getRows(taskRows)[0];
    if (!task) return res.status(404).json({ message: "Task not found" });

    await appendAgentMessage({
      tenantId,
      orgId: Number(org.id),
      orgAgentId: Number(task.org_agent_id),
      senderType: "system",
      content: `Task #${task.id} rejected. Reason: ${reason}`,
      metadata: {
        event: "task_rejected",
        rejectedByUserId: user.id,
        taskId: task.id,
      },
    });

    res.json({ ok: true, task });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to reject task" });
  }
});

router.get("/billing", async (req: any, res) => {
  try {
    const tenantId = Number(req.eceTenant.id);
    const user = req.eceUser as SessionUser;
    const scope = req.eceScope as TenantScope;
    const org = await getOrCreateOrg(tenantId, user, scope);
    if (!org) return res.json({ ok: true, org: null, plans: [], subscription: null, charges: [] });

    const subscription = await ensureDefaultSubscription(tenantId, Number(org.id));
    const plans = await listPlansForTenant(tenantId);

    const salaryRows = await db.execute(sql`
      select
        count(*) filter (where status in ('active', 'paused'))::int as active_agents,
        coalesce(sum(salary_monthly) filter (where status in ('active', 'paused')), 0)::numeric as monthly_salary_total
      from ece_org_agents
      where tenant_id = ${tenantId} and org_id = ${Number(org.id)}
    `);
    const summary = getRows(salaryRows)[0] || { active_agents: 0, monthly_salary_total: "0" };

    const chargesRows = await db.execute(sql`
      select
        c.*,
        a.display_name as agent_name
      from ece_agent_salary_charges c
      join ece_org_agents a on a.id = c.org_agent_id and a.tenant_id = c.tenant_id
      where c.tenant_id = ${tenantId}
        and a.org_id = ${Number(org.id)}
      order by c.created_at desc, c.id desc
      limit 60
    `);

    res.json({
      ok: true,
      org,
      plans,
      subscription,
      summary: {
        activeAgents: Number(summary.active_agents || 0),
        monthlySalaryTotal: Number(summary.monthly_salary_total || 0),
      },
      charges: getRows(chargesRows),
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to load billing" });
  }
});

router.post("/billing/subscribe", async (req: any, res) => {
  try {
    const scope = req.eceScope as TenantScope;
    if (!canManageAgents(scope)) return res.status(403).json({ message: "Owner access required" });

    const tenantId = Number(req.eceTenant.id);
    const user = req.eceUser as SessionUser;
    const org = await getOrCreateOrg(tenantId, user, scope);
    if (!org) return res.status(400).json({ message: "Organization not initialized" });

    const planId = parsePositiveInt(req.body?.planId);
    if (!planId) return res.status(400).json({ message: "planId is required" });

    const planRows = await db.execute(sql`
      select *
      from ece_org_plans
      where id = ${planId}
        and is_active = true
        and (tenant_id = ${tenantId} or tenant_id is null)
      limit 1
    `);
    const plan = getRows(planRows)[0];
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    const provider = asString(req.body?.provider) || "manual";
    const providerRef = asString(req.body?.providerRef) || null;

    await db.execute(sql`
      insert into ece_billing_subscriptions (
        tenant_id, org_id, plan_id, status, renewal_date, provider, provider_ref, created_at, updated_at
      )
      values (
        ${tenantId},
        ${Number(org.id)},
        ${planId},
        'active',
        now() + interval '30 days',
        ${provider},
        ${providerRef},
        now(),
        now()
      )
      on conflict (tenant_id, org_id)
      do update set
        plan_id = excluded.plan_id,
        status = 'active',
        provider = excluded.provider,
        provider_ref = excluded.provider_ref,
        renewal_date = excluded.renewal_date,
        updated_at = now()
    `);

    const subscription = await ensureDefaultSubscription(tenantId, Number(org.id));
    res.json({ ok: true, subscription, plan });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to update subscription" });
  }
});

export default router;
