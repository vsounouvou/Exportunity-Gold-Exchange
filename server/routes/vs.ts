import { Router, type NextFunction, type Request, type Response } from "express";
import { db } from "@db";
import { eceSessions, eceUsers } from "@db/schema";
import { eq, sql } from "drizzle-orm";

type VsRole = "TENANT_ADMIN" | "EDITOR" | "PR_MANAGER" | "ANALYST" | "VIEWER";
type Access = { tenantId: number; user: any; roles: Set<VsRole>; globalAdmin: boolean };

const ROLES: VsRole[] = ["TENANT_ADMIN", "EDITOR", "PR_MANAGER", "ANALYST", "VIEWER"];
const AGENT_KEYS = new Set(["marketing", "client_hunter", "media", "ops", "compliance", "data", "seo_autopilot"]);

const TABLES: Record<
  string,
  {
    table: string;
    read: VsRole[];
    write: VsRole[];
  }
> = {
  reputation_sources: { table: "reputation_sources", read: ROLES, write: ["TENANT_ADMIN"] },
  reputation_keywords: { table: "reputation_keywords", read: ROLES, write: ["TENANT_ADMIN"] },
  reputation_mentions: { table: "reputation_mentions", read: ROLES, write: ["TENANT_ADMIN", "EDITOR", "PR_MANAGER", "ANALYST"] },
  reputation_rules: { table: "reputation_rules", read: ROLES, write: ["TENANT_ADMIN"] },
  reputation_alerts: { table: "reputation_alerts", read: ROLES, write: ["TENANT_ADMIN", "ANALYST"] },
  media_outlets: { table: "media_outlets", read: ROLES, write: ["TENANT_ADMIN", "PR_MANAGER"] },
  media_contacts: { table: "media_contacts", read: ROLES, write: ["TENANT_ADMIN", "PR_MANAGER", "EDITOR"] },
  press_angles: { table: "press_angles", read: ROLES, write: ["TENANT_ADMIN", "PR_MANAGER"] },
  outreach_templates: { table: "outreach_templates", read: ROLES, write: ["TENANT_ADMIN", "PR_MANAGER"] },
  pr_campaigns: { table: "pr_campaigns", read: ROLES, write: ["TENANT_ADMIN", "PR_MANAGER"] },
  outreach_messages: { table: "outreach_messages", read: ROLES, write: ["TENANT_ADMIN", "PR_MANAGER", "EDITOR"] },
  social_accounts: { table: "social_accounts", read: ROLES, write: ["TENANT_ADMIN"] },
  social_pages: { table: "social_pages", read: ROLES, write: ["TENANT_ADMIN"] },
  social_rate_limits: { table: "social_rate_limits", read: ROLES, write: ["TENANT_ADMIN"] },
  studio_projects: { table: "studio_projects", read: ROLES, write: ["TENANT_ADMIN", "EDITOR", "PR_MANAGER"] },
  content_items: { table: "content_items", read: ROLES, write: ["TENANT_ADMIN", "EDITOR", "PR_MANAGER"] },
  content_assets: { table: "content_assets", read: ROLES, write: ["TENANT_ADMIN", "EDITOR", "PR_MANAGER"] },
  content_schedules: { table: "content_schedules", read: ROLES, write: ["TENANT_ADMIN", "EDITOR", "PR_MANAGER"] },
  publishing_jobs: { table: "publishing_jobs", read: ROLES, write: ["TENANT_ADMIN"] },
  vs_inbox_messages: { table: "vs_inbox_messages", read: ROLES, write: ["TENANT_ADMIN", "EDITOR", "PR_MANAGER", "ANALYST"] },
  vs_approval_requests: { table: "vs_approval_requests", read: ROLES, write: ["TENANT_ADMIN"] },
  vs_settings: { table: "vs_settings", read: ROLES, write: ["TENANT_ADMIN"] },
  vs_website_blocks: { table: "vs_website_blocks", read: ROLES, write: ["TENANT_ADMIN", "EDITOR"] },
  vs_user_roles: { table: "vs_user_roles", read: ROLES, write: ["TENANT_ADMIN"] },
};

const router = Router();
const publicApi = Router();
const adminApi = Router();

function getBearer(req: Request) {
  return String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
}

function toRows<T = Record<string, any>>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function firstRow<T = Record<string, any>>(result: any): T | null {
  const rows = toRows<T>(result);
  return rows.length ? rows[0] : null;
}

async function safeQueryRows<T = Record<string, any>>(query: ReturnType<typeof sql.raw> | any): Promise<T[]> {
  try {
    const result = await db.execute(query);
    return toRows<T>(result);
  } catch {
    return [];
  }
}

async function safeCount(query: ReturnType<typeof sql.raw> | any): Promise<number> {
  const rows = await safeQueryRows<{ count: number | string }>(query);
  const count = Number(rows[0]?.count ?? 0);
  return Number.isFinite(count) ? count : 0;
}

function isVsTenant(req: Request) {
  return String((req as any)?.tenant?.key || "").trim().toLowerCase() === "vs";
}

function normalizeRole(value: unknown): VsRole | null {
  const role = String(value || "").trim().toUpperCase();
  return (ROLES as string[]).includes(role) ? (role as VsRole) : null;
}

function classifyRisk(text: string) {
  const value = String(text || "").toLowerCase();
  if (/(fraud|scam|lawsuit|legal|threat|court|police)/.test(value)) return "high";
  if (/(complain|issue|angry|refund|problem|delay)/.test(value)) return "medium";
  return "low";
}

function escapeSql(value: string) {
  return value.replace(/'/g, "''");
}

function toSqlValue(value: unknown) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return `'${escapeSql(JSON.stringify(value))}'::jsonb`;
  return `'${escapeSql(String(value))}'`;
}

async function verifySession(token: string) {
  if (!token) return null;
  const session = await db.query.eceSessions.findFirst({ where: eq(eceSessions.token, token) });
  if (!session || new Date(session.expiresAt) < new Date()) return null;
  return db.query.eceUsers.findFirst({ where: eq(eceUsers.id, session.userId) });
}

function isGlobalAdmin(user: any) {
  const perms = Array.isArray(user?.permissions) ? user.permissions.map((x: unknown) => String(x)) : [];
  const roles = Array.isArray(user?.roles) ? user.roles.map((x: unknown) => String(x).toLowerCase()) : [];
  return (
    String(user?.currentMode || "").toLowerCase() === "admin" ||
    perms.includes("*") ||
    perms.includes("admin:*") ||
    roles.includes("admin") ||
    roles.includes("chairman")
  );
}

async function loadAccess(req: Request): Promise<Access | null> {
  const token = getBearer(req);
  const user = await verifySession(token);
  if (!user) return null;
  const tenantId = Number((req as any)?.tenant?.id || 0);
  if (!Number.isInteger(tenantId) || tenantId <= 0) return null;
  const globalAdmin = isGlobalAdmin(user);
  const roleRows = await db.execute(sql`
    select role
    from vs_user_roles
    where tenant_id = ${tenantId}
      and user_id = ${Number(user.id)}
      and is_active = true
  `);
  const roles = new Set<VsRole>();
  for (const row of toRows<{ role: string }>(roleRows)) {
    const role = normalizeRole(row.role);
    if (role) roles.add(role);
  }
  if (globalAdmin) roles.add("TENANT_ADMIN");
  return { tenantId, user, roles, globalAdmin };
}

function allow(access: Access, allowed: VsRole[]) {
  if (access.globalAdmin) return true;
  return allowed.some((role) => access.roles.has(role));
}

async function requireVsAuth(req: Request, res: Response, next: NextFunction) {
  if (!isVsTenant(req)) return res.status(404).json({ message: "VS tenant route unavailable on this host" });
  const access = await loadAccess(req);
  if (!access) return res.status(401).json({ message: "Authentication required" });
  (req as any).vsAccess = access;
  next();
}

function requireRoles(roles: VsRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const access = (req as any).vsAccess as Access;
    if (!allow(access, roles)) return res.status(403).json({ message: `Role required: ${roles.join(" | ")}` });
    next();
  };
}

async function queueGovernedTask(tenantId: number, title: string, instruction: string, moduleId: string, userId: number | null) {
  await db.execute(sql`
    insert into intelligence_tasks (
      tenant_id, module_id, title, instruction, source, state, manager_tier, execution_tier, token_budget, workflow_spec, created_by_user_id, metadata, created_at, updated_at
    )
    values (
      ${tenantId}, ${moduleId}, ${title}, ${instruction}, 'MANUAL', 'QUEUED', 'MANAGER', 'EXECUTION', 5000,
      '{"steps":["brief","script","execute","verify","report"]}'::jsonb,
      ${userId},
      '{}'::jsonb,
      now(),
      now()
    )
  `);
}

publicApi.get("/public/website", async (req: Request, res: Response) => {
  if (!isVsTenant(req)) return res.status(404).json({ message: "VS tenant route unavailable on this host" });
  const tenantId = Number((req as any)?.tenant?.id || 0);
  const page = String(req.query.page || "/").trim() || "/";
  const rows = await db.execute(sql`
    select id, page_path, block_key, title, content, metadata, sort_order, is_published, updated_at
    from vs_website_blocks
    where tenant_id = ${tenantId}
      and page_path = ${page}
      and is_published = true
    order by sort_order asc, id asc
  `);
  res.json({ ok: true, blocks: toRows(rows) });
});

publicApi.get("/public/insights", async (req: Request, res: Response) => {
  if (!isVsTenant(req)) return res.status(404).json({ message: "VS tenant route unavailable on this host" });
  const tenantId = Number((req as any)?.tenant?.id || 0);
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
  const rows = await db.execute(sql`
    select id, title, brief, kind, status, published_at, created_at
    from content_items
    where tenant_id = ${tenantId}
      and (status = 'PUBLISHED' or published_at is not null)
    order by coalesce(published_at, created_at) desc
    limit ${limit}
  `);
  res.json({ ok: true, items: toRows(rows) });
});

publicApi.post("/public/contact", async (req: Request, res: Response) => {
  if (!isVsTenant(req)) return res.status(404).json({ message: "VS tenant route unavailable on this host" });
  const tenantId = Number((req as any)?.tenant?.id || 0);
  const fullName = String(req.body?.fullName || req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim();
  const message = String(req.body?.message || "").trim();
  const type = String(req.body?.type || "Other").trim();
  if (!fullName || !email || !message) return res.status(400).json({ message: "fullName, email, and message are required" });
  const risk = classifyRisk(message);
  await db.execute(sql`
    insert into vs_inbox_messages (
      tenant_id, type, channel, sender_name, sender_email, subject, body, risk_level, status, metadata, created_at, updated_at
    )
    values (
      ${tenantId}, 'CONTACT', 'website', ${fullName}, ${email}, ${type}, ${message}, ${risk}, 'NEW',
      ${JSON.stringify({ inquiryType: type, source: "public.contact.form" })}::jsonb, now(), now()
    )
  `);
  res.status(201).json({ ok: true, risk });
});

adminApi.use(requireVsAuth);

adminApi.get("/dashboard", requireRoles(ROLES), async (req: Request, res: Response) => {
  const access = (req as any).vsAccess as Access;
  const [mentions, alerts, campaigns, content, inbox, tasks] = await Promise.all([
    safeCount(sql`select count(*)::int as count from reputation_mentions where tenant_id = ${access.tenantId}`),
    safeCount(sql`select count(*)::int as count from reputation_alerts where tenant_id = ${access.tenantId} and status = 'OPEN'`),
    safeCount(sql`select count(*)::int as count from pr_campaigns where tenant_id = ${access.tenantId}`),
    safeCount(sql`select count(*)::int as count from content_items where tenant_id = ${access.tenantId}`),
    safeCount(sql`select count(*)::int as count from vs_inbox_messages where tenant_id = ${access.tenantId} and status in ('NEW','PENDING')`),
    safeCount(sql`select count(*)::int as count from intelligence_tasks where tenant_id = ${access.tenantId} and state in ('QUEUED','RUNNING')`),
  ]);
  res.json({
    ok: true,
    metrics: {
      mentions,
      openAlerts: alerts,
      campaigns,
      contentItems: content,
      inboxPending: inbox,
      queuedTasks: tasks,
    },
  });
});

adminApi.get("/social/health", requireRoles(ROLES), async (req: Request, res: Response) => {
  const access = (req as any).vsAccess as Access;
  const rows = await safeQueryRows<{ provider: string; status: string; count: number }>(sql`
    select provider, status, count(*)::int as count
    from social_accounts
    where tenant_id = ${access.tenantId}
    group by provider, status
  `);
  const health: Record<string, number> = {};
  for (const row of rows) {
    const provider = String(row.provider || "unknown").toUpperCase();
    const status = String(row.status || "unknown").toUpperCase();
    health[`${provider}:${status}`] = Number(row.count || 0);
  }
  health.totalConnected = rows
    .filter((row) => String(row.status || "").toUpperCase() === "CONNECTED")
    .reduce((sum, row) => sum + Number(row.count || 0), 0);
  res.json({ ok: true, health });
});

adminApi.post("/social/connect", requireRoles(["TENANT_ADMIN"]), async (req: Request, res: Response) => {
  const access = (req as any).vsAccess as Access;
  const provider = String(req.body?.provider || "").trim().toUpperCase();
  const accountId = String(req.body?.accountId || "").trim();
  const accountName = String(req.body?.accountName || "").trim() || null;
  const accessToken = String(req.body?.accessToken || "").trim();
  const pageId = String(req.body?.pageId || "").trim();
  const pageName = String(req.body?.pageName || "").trim();
  const handle = String(req.body?.handle || "").trim() || null;

  if (!provider || !accountId) {
    return res.status(400).json({ message: "provider and accountId are required" });
  }

  const accountRows = await db.execute(sql`
    insert into social_accounts (tenant_id, provider, account_id, account_name, status, connected_at, created_at, updated_at)
    values (${access.tenantId}, ${provider}, ${accountId}, ${accountName}, 'CONNECTED', now(), now(), now())
    on conflict (tenant_id, provider, account_id)
    do update set account_name = excluded.account_name, status = 'CONNECTED', connected_at = now(), updated_at = now()
    returning *
  `);
  const account = firstRow<any>(accountRows);

  if (account?.id && accessToken) {
    await db.execute(sql`
      insert into social_tokens (tenant_id, account_id, access_token, created_at, updated_at)
      values (${access.tenantId}, ${Number(account.id)}, ${accessToken}, now(), now())
      on conflict (tenant_id, account_id)
      do update set access_token = excluded.access_token, updated_at = now()
    `);
  }

  if (account?.id && pageId && pageName) {
    await db.execute(sql`
      insert into social_pages (tenant_id, account_id, page_id, page_name, handle, created_at, updated_at)
      values (${access.tenantId}, ${Number(account.id)}, ${pageId}, ${pageName}, ${handle}, now(), now())
      on conflict (tenant_id, page_id)
      do update set page_name = excluded.page_name, handle = excluded.handle, updated_at = now()
    `);
  }

  res.status(201).json({ ok: true, account });
});

adminApi.get("/agents", requireRoles(ROLES), async (req: Request, res: Response) => {
  const access = (req as any).vsAccess as Access;
  const caps = await safeQueryRows<{ agent_key: string; daily_cap: number; output_detail_level: string }>(sql`
    select agent_key, daily_cap, output_detail_level
    from vs_agent_budget_caps
    where tenant_id = ${access.tenantId}
    order by agent_key asc
  `);
  const queueStats = await safeQueryRows<{ agent: string; queued: number; running: number }>(sql`
    select
      agent,
      sum(case when status = 'queued' then 1 else 0 end)::int as queued,
      sum(case when status = 'running' then 1 else 0 end)::int as running
    from agent_tasks
    where tenant_id = ${access.tenantId}
    group by agent
  `);
  const byAgent = new Map(queueStats.map((row) => [String(row.agent || ""), row]));
  const items = caps.map((row) => {
    const stats = byAgent.get(String(row.agent_key || "")) || { queued: 0, running: 0 };
    return {
      key: row.agent_key,
      dailyCap: Number(row.daily_cap || 0),
      outputDetailLevel: row.output_detail_level,
      queued: Number(stats.queued || 0),
      running: Number(stats.running || 0),
    };
  });
  res.json({ ok: true, items });
});

adminApi.get("/assistant/context", requireRoles(ROLES), async (req: Request, res: Response) => {
  const access = (req as any).vsAccess as Access;
  const [settings, metrics, recent] = await Promise.all([
    safeQueryRows(sql`select key, value from vs_settings where tenant_id = ${access.tenantId} order by key asc`),
    Promise.all([
      safeCount(sql`select count(*)::int as count from reputation_mentions where tenant_id = ${access.tenantId}`),
      safeCount(sql`select count(*)::int as count from pr_campaigns where tenant_id = ${access.tenantId}`),
      safeCount(sql`select count(*)::int as count from content_items where tenant_id = ${access.tenantId}`),
      safeCount(sql`select count(*)::int as count from vs_inbox_messages where tenant_id = ${access.tenantId} and status in ('NEW','PENDING')`),
    ]),
    safeQueryRows(sql`
      select id, title, state, created_at
      from intelligence_tasks
      where tenant_id = ${access.tenantId}
      order by created_at desc
      limit 12
    `),
  ]);
  const [mentions, campaigns, contentItems, inboxPending] = metrics;
  res.json({
    ok: true,
    tenantId: access.tenantId,
    role: Array.from(access.roles.values()),
    metrics: { mentions, campaigns, contentItems, inboxPending },
    settings,
    recentTasks: recent,
  });
});

adminApi.get("/actions", requireRoles(ROLES), async (req: Request, res: Response) => {
  const access = (req as any).vsAccess as Access;
  const [governed, queue] = await Promise.all([
    safeQueryRows(sql`
      select id, module_id, title, state, source, created_at, updated_at
      from intelligence_tasks
      where tenant_id = ${access.tenantId}
      order by created_at desc
      limit 200
    `),
    safeQueryRows(sql`
      select id, agent, goal, status, budget_usd_cap, budget_max_calls, budget_max_tokens, created_at, updated_at
      from agent_tasks
      where tenant_id = ${access.tenantId}
      order by created_at desc
      limit 200
    `),
  ]);
  res.json({ ok: true, governed, queue });
});

adminApi.get("/users", requireRoles(ROLES), async (req: Request, res: Response) => {
  const access = (req as any).vsAccess as Access;
  const items = await safeQueryRows(sql`
    select
      r.id,
      r.user_id,
      r.role,
      r.permissions,
      r.is_active,
      u.email,
      u.first_name,
      u.last_name,
      u.username
    from vs_user_roles r
    left join ece_users u on u.id = r.user_id
    where r.tenant_id = ${access.tenantId}
    order by r.role asc, r.user_id asc
  `);
  res.json({ ok: true, items });
});

adminApi.get("/settings", requireRoles(ROLES), async (req: Request, res: Response) => {
  const access = (req as any).vsAccess as Access;
  const [settings, budgetPolicy, agentCaps] = await Promise.all([
    safeQueryRows(sql`select key, value, updated_at from vs_settings where tenant_id = ${access.tenantId} order by key asc`),
    safeQueryRows(sql`select * from vs_budget_policies where tenant_id = ${access.tenantId} limit 1`),
    safeQueryRows(sql`select agent_key, daily_cap, output_detail_level, metadata from vs_agent_budget_caps where tenant_id = ${access.tenantId} order by agent_key asc`),
  ]);
  res.json({
    ok: true,
    settings,
    budgetPolicy: firstRow(budgetPolicy),
    agentCaps,
  });
});

adminApi.get("/data/:table", async (req: Request, res: Response) => {
  const access = (req as any).vsAccess as Access;
  const tableKey = String(req.params.table || "").trim().toLowerCase();
  const cfg = TABLES[tableKey];
  if (!cfg) return res.status(404).json({ message: "Unknown table" });
  if (!allow(access, cfg.read)) return res.status(403).json({ message: "Forbidden" });
  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 200)));
  const rows = await db.execute(sql.raw(`select * from ${cfg.table} where tenant_id = ${access.tenantId} order by created_at desc limit ${limit}`));
  res.json({ ok: true, items: toRows(rows) });
});

adminApi.post("/data/:table", async (req: Request, res: Response) => {
  const access = (req as any).vsAccess as Access;
  const tableKey = String(req.params.table || "").trim().toLowerCase();
  const cfg = TABLES[tableKey];
  if (!cfg) return res.status(404).json({ message: "Unknown table" });
  if (!allow(access, cfg.write)) return res.status(403).json({ message: "Forbidden" });
  const payload = req.body && typeof req.body === "object" ? { ...req.body } : {};
  delete (payload as any).id;
  (payload as any).tenant_id = access.tenantId;
  (payload as any).created_at = new Date().toISOString();
  (payload as any).updated_at = new Date().toISOString();

  const keys = Object.keys(payload);
  if (!keys.length) return res.status(400).json({ message: "Body required" });
  const cols = keys.map((k) => `"${k}"`).join(", ");
  const valuesSql = keys.map((k) => toSqlValue((payload as any)[k])).join(", ");
  const q = sql.raw(`insert into ${cfg.table} (${cols}) values (${valuesSql}) returning *`);
  const result = await db.execute(q);
  res.status(201).json({ ok: true, item: firstRow(result) });
});

adminApi.patch("/data/:table/:id", async (req: Request, res: Response) => {
  const access = (req as any).vsAccess as Access;
  const tableKey = String(req.params.table || "").trim().toLowerCase();
  const cfg = TABLES[tableKey];
  if (!cfg) return res.status(404).json({ message: "Unknown table" });
  if (!allow(access, cfg.write)) return res.status(403).json({ message: "Forbidden" });
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
  const payload = req.body && typeof req.body === "object" ? { ...req.body } : {};
  delete (payload as any).id;
  delete (payload as any).tenant_id;
  (payload as any).updated_at = new Date().toISOString();
  const keys = Object.keys(payload);
  if (!keys.length) return res.status(400).json({ message: "Body required" });
  const assigns = keys.map((k) => `"${k}" = ${toSqlValue((payload as any)[k])}`).join(", ");
  const query = sql.raw(`update ${cfg.table} set ${assigns} where id = ${id} and tenant_id = ${access.tenantId} returning *`);
  const result = await db.execute(query);
  res.json({ ok: true, item: firstRow(result) });
});

adminApi.post("/approve/publish/:scheduleId", requireRoles(["TENANT_ADMIN"]), async (req: Request, res: Response) => {
  const access = (req as any).vsAccess as Access;
  const scheduleId = Number(req.params.scheduleId);
  if (!Number.isInteger(scheduleId) || scheduleId <= 0) return res.status(400).json({ message: "Invalid scheduleId" });
  await db.execute(sql`
    update content_schedules
    set approval_status = 'APPROVED', approved_by_user_id = ${Number(access.user.id)}, status = 'PUBLISHED', published_post_id = ${`pub-${scheduleId}-${Date.now()}`}, updated_at = now()
    where tenant_id = ${access.tenantId} and id = ${scheduleId}
  `);
  await queueGovernedTask(access.tenantId, `Publish schedule ${scheduleId}`, `Execute approved publish for schedule ${scheduleId}`, "vs.studio.publish", Number(access.user.id));
  res.json({ ok: true });
});

adminApi.post("/approve/outreach/:id/send", requireRoles(["TENANT_ADMIN"]), async (req: Request, res: Response) => {
  const access = (req as any).vsAccess as Access;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid outreach id" });
  await db.execute(sql`
    update outreach_messages
    set status = 'SENT', approval_status = 'APPROVED', approved_by_user_id = ${Number(access.user.id)}, sent_at = now(), updated_at = now()
    where tenant_id = ${access.tenantId} and id = ${id}
  `);
  await queueGovernedTask(access.tenantId, `Send outreach ${id}`, `Execute approved outreach ${id}`, "vs.pr.send", Number(access.user.id));
  res.json({ ok: true });
});

adminApi.post("/inbox/:id/draft-reply", requireRoles(["TENANT_ADMIN", "EDITOR", "PR_MANAGER", "ANALYST"]), async (req: Request, res: Response) => {
  const access = (req as any).vsAccess as Access;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid inbox id" });
  const rows = await db.execute(sql`select body, sender_name from vs_inbox_messages where tenant_id = ${access.tenantId} and id = ${id} limit 1`);
  const item = firstRow<any>(rows);
  if (!item) return res.status(404).json({ message: "Message not found" });
  const risk = classifyRisk(String(item.body || ""));
  const draft = `Hello${item.sender_name ? ` ${item.sender_name}` : ""}, thank you for reaching out. We have received your message and will send an approved response shortly.`;
  await db.execute(sql`
    update vs_inbox_messages
    set risk_level = ${risk}, draft_reply = ${draft}, status = 'PENDING', updated_at = now()
    where tenant_id = ${access.tenantId} and id = ${id}
  `);
  res.json({ ok: true, risk, draft });
});

adminApi.post("/inbox/:id/reply", requireRoles(["TENANT_ADMIN", "EDITOR", "PR_MANAGER", "ANALYST"]), async (req: Request, res: Response) => {
  const access = (req as any).vsAccess as Access;
  const id = Number(req.params.id);
  const reply = String(req.body?.reply || "").trim();
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid inbox id" });
  if (!reply) return res.status(400).json({ message: "reply is required" });
  const rows = await db.execute(sql`select risk_level from vs_inbox_messages where tenant_id = ${access.tenantId} and id = ${id} limit 1`);
  const risk = String(firstRow<any>(rows)?.risk_level || "low").toLowerCase();
  if ((risk === "medium" || risk === "high") && !allow(access, ["TENANT_ADMIN"])) {
    return res.status(403).json({ message: "TENANT_ADMIN approval required for medium/high risk replies" });
  }
  await db.execute(sql`
    update vs_inbox_messages
    set draft_reply = ${reply}, status = 'REPLIED', approved_by_user_id = ${Number(access.user.id)}, replied_at = now(), updated_at = now()
    where tenant_id = ${access.tenantId} and id = ${id}
  `);
  res.json({ ok: true });
});

adminApi.post("/actions/task", requireRoles(["TENANT_ADMIN", "EDITOR", "PR_MANAGER"]), async (req: Request, res: Response) => {
  const access = (req as any).vsAccess as Access;
  const goal = String(req.body?.goal || "").trim();
  const agent = String(req.body?.agent || "ops").trim();
  if (!goal) return res.status(400).json({ message: "goal is required" });
  if (!AGENT_KEYS.has(agent)) return res.status(400).json({ message: "Unsupported agent" });
  await db.execute(sql`
    insert into agent_tasks (
      tenant_id, agent, goal, budget_usd_cap, budget_max_calls, budget_max_tokens, status, constraints, created_by_user_id, created_at, updated_at
    )
    values (
      ${access.tenantId}, ${agent}, ${goal},
      ${Number(req.body?.budgetUsdCap || 0)},
      ${Number(req.body?.budgetMaxCalls || 0)},
      ${Number(req.body?.budgetMaxTokens || 0)},
      'queued',
      ${JSON.stringify(req.body?.constraints && typeof req.body.constraints === "object" ? req.body.constraints : {})}::jsonb,
      ${Number(access.user.id)},
      now(),
      now()
    )
  `);
  await queueGovernedTask(access.tenantId, `Queue task for ${agent}`, `Run queued task for ${agent}: ${goal}`, "vs.execution.queue", Number(access.user.id));
  res.status(201).json({ ok: true });
});

adminApi.get("/runbook", requireRoles(ROLES), (_req: Request, res: Response) => {
  res.json({
    ok: true,
    runbook: {
      integrations: {
        meta: "Connect Facebook Page + Instagram Business via Social Connections.",
        tiktok: "Connect TikTok posting account and token.",
        youtube: "Phase 2 required for Shorts upload flow.",
      },
      approvals: [
        "Publishing posts requires TENANT_ADMIN.",
        "Sending outreach requires TENANT_ADMIN.",
        "Connector changes require TENANT_ADMIN.",
        "Medium/high-risk inbox replies require TENANT_ADMIN.",
      ],
      execution: "Queue uses agent_tasks and intelligence_tasks with governed schedulers.",
    },
  });
});

router.use("/api/vs", publicApi);
router.use("/api/admin/vs", adminApi);

export default router;
