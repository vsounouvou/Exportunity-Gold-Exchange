import bcrypt from "bcryptjs";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@db";
import {
  agentTasks,
  agents,
  agentTokenUsage,
  auditLogs,
  companies,
  cronRegistry,
  departments,
  economyWallets,
  eceUsers,
  geoTerritories,
  userTenantRoles,
} from "@db/schema";

import { ensureAgentEconomyGovernanceTables } from "../server/lib/agent-economy-governance";
import { ensureTenants, getTenantByKey } from "../server/lib/tenants";

const TENANT_KEY = "exportunity";
const SEED_KEY = "exportunity_agent_economy_seed_v1";
const TERRITORY_SOURCE = "SEED_EXPORTUNITY_AGENT_ECONOMY";

type Hierarchy = "super" | "director" | "manager" | "executor";
type TenantRole = "SUPER_ADMIN" | "TENANT_ADMIN" | "OPS" | "SUPPORT";
type TaskAgent = "marketing" | "client_hunter" | "media" | "ops" | "compliance" | "data" | "seo_autopilot";

type TerritorySpec = {
  key: string;
  sourceRef: string;
  type: "country" | "region" | "city" | "neighborhood";
  name: string;
  countryCode: string;
  city: string | null;
  lat: number;
  lng: number;
  radius: number;
  parent?: string;
};

type StaffSpec = {
  email: string;
  displayName: string;
  territoryKey?: string;
  roles: TenantRole[];
};

type AgentSpec = {
  key: string;
  name: string;
  role: string;
  hierarchy: Hierarchy;
  department: string;
  managerKey?: string;
  territoryKey?: string;
  taskAgent: TaskAgent;
};

const TERRITORIES: TerritorySpec[] = [
  { key: "country_bj", sourceRef: "BJ", type: "country", name: "Benin", countryCode: "BJ", city: null, lat: 9.30769, lng: 2.315834, radius: 210000 },
  { key: "region_littoral", sourceRef: "BJ-LIT", type: "region", name: "Littoral", countryCode: "BJ", city: "Cotonou", lat: 6.370293, lng: 2.391236, radius: 42000, parent: "country_bj" },
  { key: "region_oueme", sourceRef: "BJ-OUE", type: "region", name: "Oueme", countryCode: "BJ", city: "Porto-Novo", lat: 6.496857, lng: 2.628852, radius: 72000, parent: "country_bj" },
  { key: "city_cotonou", sourceRef: "BJ-COT", type: "city", name: "Cotonou", countryCode: "BJ", city: "Cotonou", lat: 6.36536, lng: 2.41833, radius: 15000, parent: "region_littoral" },
  { key: "city_portonovo", sourceRef: "BJ-PN", type: "city", name: "Porto-Novo", countryCode: "BJ", city: "Porto-Novo", lat: 6.49646, lng: 2.60359, radius: 13000, parent: "region_oueme" },
  { key: "neigh_ganhi", sourceRef: "BJ-COT-GANHI", type: "neighborhood", name: "Ganhi", countryCode: "BJ", city: "Cotonou", lat: 6.3566, lng: 2.4342, radius: 3200, parent: "city_cotonou" },
  { key: "neigh_akpakpa", sourceRef: "BJ-COT-AKPAKPA", type: "neighborhood", name: "Akpakpa", countryCode: "BJ", city: "Cotonou", lat: 6.3624, lng: 2.4488, radius: 3500, parent: "city_cotonou" },
  { key: "neigh_djassin", sourceRef: "BJ-PN-DJASSIN", type: "neighborhood", name: "Djassin", countryCode: "BJ", city: "Porto-Novo", lat: 6.4881, lng: 2.6227, radius: 3000, parent: "city_portonovo" },
];

const STAFF: StaffSpec[] = [
  { email: "ops.super@exportunity.net", displayName: "Exportunity Super Admin", territoryKey: "country_bj", roles: ["SUPER_ADMIN", "TENANT_ADMIN"] },
  { email: "regional.south@exportunity.net", displayName: "Regional Manager South", territoryKey: "region_littoral", roles: ["TENANT_ADMIN", "OPS"] },
  { email: "regional.east@exportunity.net", displayName: "Regional Manager East", territoryKey: "region_oueme", roles: ["OPS"] },
  { email: "territory.cotonou@exportunity.net", displayName: "Territory Manager Cotonou", territoryKey: "city_cotonou", roles: ["OPS"] },
  { email: "territory.portonovo@exportunity.net", displayName: "Territory Manager Porto-Novo", territoryKey: "city_portonovo", roles: ["OPS"] },
  { email: "support.analytics@exportunity.net", displayName: "Tenant Analyst", territoryKey: "city_cotonou", roles: ["SUPPORT"] },
];

const CORE_AGENTS: AgentSpec[] = [
  { key: "super", name: "EXO Super Orchestrator", role: "Chairman Assistant", hierarchy: "super", department: "Executive", taskAgent: "ops" },
  { key: "director_ops", name: "EXO Director Operations", role: "Operations Director", hierarchy: "director", department: "Operations", managerKey: "super", taskAgent: "ops" },
  { key: "director_finance", name: "EXO Director Finance", role: "Finance Director", hierarchy: "director", department: "Finance", managerKey: "super", taskAgent: "compliance" },
  { key: "director_territories", name: "EXO Director Territories", role: "Territory Programs Director", hierarchy: "director", department: "Operations", managerKey: "super", territoryKey: "country_bj", taskAgent: "ops" },
  { key: "regional_south", name: "EXO Regional Manager South", role: "Regional Manager", hierarchy: "manager", department: "Operations", managerKey: "director_territories", territoryKey: "region_littoral", taskAgent: "ops" },
  { key: "regional_east", name: "EXO Regional Manager East", role: "Regional Manager", hierarchy: "manager", department: "Operations", managerKey: "director_territories", territoryKey: "region_oueme", taskAgent: "ops" },
  { key: "territory_cotonou", name: "EXO Territory Manager Cotonou", role: "Territory Manager", hierarchy: "manager", department: "Operations", managerKey: "regional_south", territoryKey: "city_cotonou", taskAgent: "ops" },
  { key: "territory_portonovo", name: "EXO Territory Manager Porto-Novo", role: "Territory Manager", hierarchy: "manager", department: "Operations", managerKey: "regional_east", territoryKey: "city_portonovo", taskAgent: "ops" },
];

const EXECUTOR_SEEDS: Array<{ suffix: string; role: string; taskAgent: TaskAgent; managerKey: string; territoryKey?: string }> = [
  { suffix: "CRM Bot", role: "CRM Execution Agent", taskAgent: "client_hunter", managerKey: "territory_cotonou", territoryKey: "neigh_ganhi" },
  { suffix: "Payment Reconciliation Bot", role: "Payments Reconciliation Agent", taskAgent: "compliance", managerKey: "director_finance" },
  { suffix: "Gold Flow Controller Bot", role: "Gold Flow Controller", taskAgent: "ops", managerKey: "director_ops" },
  { suffix: "Contract Follow-up Bot", role: "Contract Operations Agent", taskAgent: "ops", managerKey: "director_ops" },
  { suffix: "Outreach Scheduler Bot", role: "Outreach Automation Agent", taskAgent: "client_hunter", managerKey: "territory_portonovo", territoryKey: "neigh_djassin" },
  { suffix: "Reputation Monitor Bot", role: "Reputation Monitoring Agent", taskAgent: "media", managerKey: "director_ops" },
  { suffix: "Warehouse Sync Bot", role: "Warehouse Sync Agent", taskAgent: "ops", managerKey: "territory_cotonou", territoryKey: "neigh_akpakpa" },
  { suffix: "Logistics Signal Bot", role: "Logistics Signal Agent", taskAgent: "ops", managerKey: "territory_portonovo" },
  { suffix: "Compliance Sentinel Bot", role: "Compliance Sentinel", taskAgent: "compliance", managerKey: "director_finance" },
  { suffix: "Dashboard Refresh Bot", role: "Analytics Refresh Agent", taskAgent: "data", managerKey: "director_finance" },
  { suffix: "SEO Pulse Bot", role: "SEO Signal Agent", taskAgent: "seo_autopilot", managerKey: "director_ops" },
  { suffix: "Media Outreach Bot", role: "Media Outreach Agent", taskAgent: "media", managerKey: "director_ops" },
];

const AGENTS: AgentSpec[] = [
  ...CORE_AGENTS,
  ...EXECUTOR_SEEDS.map((item, idx) => ({
    key: `exec_${idx + 1}`,
    name: `EXO ${item.suffix}`,
    role: item.role,
    hierarchy: "executor" as const,
    department: "Operations",
    managerKey: item.managerKey,
    territoryKey: item.territoryKey,
    taskAgent: item.taskAgent,
  })),
];

function uniq(values: string[]) {
  return Array.from(new Set(values.map((v) => String(v || "").trim()).filter(Boolean)));
}

function profile(hierarchy: Hierarchy) {
  if (hierarchy === "super") return { intel: "UNLIMITED", ctx: 250000, day: 9999999, mul: "100.00", roleLevel: 5, authority: "executive", autonomy: "full", tier: "SUPER", bal: "500000.00", daily: "9999999.00", tierLimit: "999999999.00", models: "gpt-5,gpt-4.1,o3" };
  if (hierarchy === "director") return { intel: "HIGH", ctx: 131072, day: 320000, mul: "10.00", roleLevel: 4, authority: "high", autonomy: "full", tier: "DIRECTOR", bal: "120000.00", daily: "250000.00", tierLimit: "2000000.00", models: "gpt-5,gpt-4.1,o3-mini" };
  if (hierarchy === "manager") return { intel: "MEDIUM", ctx: 48000, day: 100000, mul: "4.00", roleLevel: 3, authority: "medium", autonomy: "partial", tier: "MANAGER-1", bal: "54000.00", daily: "100000.00", tierLimit: "900000.00", models: "gpt-4.1,o3-mini" };
  return { intel: "LOW", ctx: 6000, day: 15000, mul: "1.00", roleLevel: 1, authority: "low", autonomy: "draft_only", tier: "EXEC-1", bal: "12000.00", daily: "15000.00", tierLimit: "150000.00", models: "gpt-4.1-mini,gpt-4o-mini" };
}

async function seedTerritories(tenantId: number) {
  const ids = new Map<string, number>();
  for (const t of TERRITORIES) {
    const parentId = t.parent ? ids.get(t.parent) || null : null;
    const existing = await db.query.geoTerritories.findFirst({
      where: and(eq(geoTerritories.tenantId, tenantId), eq(geoTerritories.source, TERRITORY_SOURCE), eq(geoTerritories.sourceRef, t.sourceRef)),
      columns: { id: true },
    });
    const payload = {
      tenantId,
      parentTerritoryId: parentId,
      name: t.name,
      countryCode: t.countryCode,
      city: t.city,
      territoryType: t.type,
      centerLat: t.lat.toFixed(7),
      centerLng: t.lng.toFixed(7),
      radiusMeters: t.radius,
      source: TERRITORY_SOURCE,
      sourceRef: t.sourceRef,
      sourceVersion: "2026-03-03",
      confidence: 85,
      currency: "XOF",
      language: "fr",
      status: "active",
      updatedAt: new Date(),
    };
    if (existing?.id) {
      await db.update(geoTerritories).set(payload).where(eq(geoTerritories.id, existing.id));
      ids.set(t.key, existing.id);
    } else {
      const [created] = await db.insert(geoTerritories).values({ ...payload, createdAt: new Date() }).returning({ id: geoTerritories.id });
      if (!created?.id) throw new Error(`Failed creating territory ${t.key}`);
      ids.set(t.key, created.id);
    }
  }
  return ids;
}

async function seedStaff(tenantId: number, territoryIds: Map<string, number>, passwordHash: string) {
  const userIds = new Map<string, number>();
  for (const s of STAFF) {
    const territoryId = s.territoryKey ? territoryIds.get(s.territoryKey) || null : null;
    const existing = await db.query.eceUsers.findFirst({ where: eq(eceUsers.email, s.email) });
    if (existing?.id) {
      await db.update(eceUsers).set({
        displayName: s.displayName,
        passwordHash,
        role: "admin" as any,
        roles: uniq([...(Array.isArray(existing.roles) ? (existing.roles as any[]).map(String) : []), "admin"]) as any,
        permissions: uniq([...(Array.isArray(existing.permissions) ? (existing.permissions as any[]).map(String) : []), "*"]) as any,
        currentMode: "admin" as any,
        isActive: true,
        emailVerified: true,
        primaryTerritoryId: territoryId,
        metadata: { ...(existing.metadata as Record<string, unknown> || {}), seed_key: SEED_KEY, managed_territory_key: s.territoryKey || null },
        updatedAt: new Date(),
      }).where(eq(eceUsers.id, existing.id));
      userIds.set(s.email, existing.id);
    } else {
      const [created] = await db.insert(eceUsers).values({
        email: s.email,
        passwordHash,
        displayName: s.displayName,
        role: "admin" as any,
        roles: ["admin"] as any,
        permissions: ["*"] as any,
        currentMode: "admin" as any,
        buyerType: "retail" as any,
        isActive: true,
        emailVerified: true,
        primaryTerritoryId: territoryId,
        metadata: { seed_key: SEED_KEY, managed_territory_key: s.territoryKey || null },
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning({ id: eceUsers.id });
      if (!created?.id) throw new Error(`Failed creating staff user ${s.email}`);
      userIds.set(s.email, created.id);
    }
    const uid = userIds.get(s.email)!;
    for (const role of s.roles) {
      await db.insert(userTenantRoles).values({ tenantId, userId: uid, role, createdAt: new Date() }).onConflictDoNothing({
        target: [userTenantRoles.tenantId, userTenantRoles.userId, userTenantRoles.role],
      });
      await db.insert(auditLogs).values({
        tenantId,
        userId: uid,
        userRole: role,
        action: "SEED_TENANT_ROLE_GRANTED",
        entityType: "user_tenant_role",
        entityId: uid,
        metadata: { seed_key: SEED_KEY, granted_role: role, email: s.email },
        createdAt: new Date(),
      });
    }
  }
  return userIds;
}

async function run() {
  if (AGENTS.length !== 20) throw new Error(`Expected 20 agents, got ${AGENTS.length}`);

  await ensureTenants();
  await ensureAgentEconomyGovernanceTables();
  await db.execute(sql`
    alter table if exists agents
      add column if not exists display_name text,
      add column if not exists avatar_url text,
      add column if not exists is_terminal_default boolean not null default false;
  `);
  const tenant = await getTenantByKey(TENANT_KEY as any);
  if (!tenant?.id) throw new Error(`Tenant ${TENANT_KEY} not found`);
  const tenantId = Number(tenant.id);
  const companiesRows = await db.select({ id: companies.id, name: companies.name }).from(companies).limit(100);
  const preferredCompany =
    companiesRows.find((row) => String(row.name || "").trim().toLowerCase().includes("exportunity")) || companiesRows[0];
  if (!preferredCompany?.id) throw new Error("No company found to attach seeded agents");
  const companyId = Number(preferredCompany.id);

  const deptRows = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(eq(departments.companyId, companyId));
  const deptMap = new Map(deptRows.map((d) => [String(d.name || "").toLowerCase(), Number(d.id)]));

  const territoryIds = await seedTerritories(tenantId);
  const passwordHash = await bcrypt.hash(String(process.env.EXPORTUNITY_AGENT_SEED_PASSWORD || "Exportunity2026!"), 10);
  const staffIds = await seedStaff(tenantId, territoryIds, passwordHash);
  const adminId = staffIds.get("ops.super@exportunity.net") || null;

  const existingAgents = await db.query.agents.findMany({
    where: and(eq(agents.tenantId, tenantId), inArray(agents.name, AGENTS.map((a) => a.name) as any)),
    columns: { id: true },
  });
  const existingIds = existingAgents.map((a) => Number(a.id)).filter((id) => id > 0);
  if (existingIds.length) {
    await db.delete(agentTokenUsage).where(inArray(agentTokenUsage.agentId, existingIds as any));
    await db.delete(cronRegistry).where(inArray(cronRegistry.agentId, existingIds as any));
    await db.delete(agentTasks).where(and(eq(agentTasks.tenantId, tenantId), inArray(agentTasks.agentId, existingIds as any)));
    await db.delete(economyWallets).where(inArray(economyWallets.agentId, existingIds as any));
    await db.delete(agents).where(inArray(agents.id, existingIds as any));
  }

  const insertedAgents = await db.insert(agents).values(
    AGENTS.map((a) => {
      const p = profile(a.hierarchy);
      const territoryId = a.territoryKey ? territoryIds.get(a.territoryKey) || null : null;
      return {
        tenantId,
        companyId,
        departmentId: deptMap.get(a.department.toLowerCase()) || deptMap.get("operations") || null,
        env: "prod" as const,
        isTest: false,
        isVisible: true,
        name: a.name,
        role: a.role,
        hierarchyLevel: a.hierarchy,
        intelligenceCap: p.intel as any,
        maxContextTokens: p.ctx,
        maxDailyTokens: p.day,
        isSuperAgent: a.hierarchy === "super",
        tokenMultiplier: p.mul,
        status: "active" as const,
        autonomyLevel: p.autonomy as any,
        roleLevel: p.roleLevel,
        contextWindowTokens: p.ctx,
        decisionAuthority: p.authority as any,
        canApproveBelow: a.hierarchy !== "executor",
        permissions: { email: true, calendar: a.hierarchy !== "executor", crm: true, knowledge: true, payments: a.taskAgent === "compliance", webResearch: a.hierarchy !== "executor" },
        capabilities: [a.taskAgent, a.hierarchy],
        metadata: { seed_key: SEED_KEY, blueprint_key: a.key, territory_id: territoryId, territory_key: a.territoryKey || null },
        hiredDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }),
  ).returning({ id: agents.id, name: agents.name, hierarchyLevel: agents.hierarchyLevel, role: agents.role });

  const idByName = new Map(insertedAgents.map((a) => [String(a.name), Number(a.id)]));
  for (const a of AGENTS) {
    if (!a.managerKey) continue;
    const managerName = AGENTS.find((m) => m.key === a.managerKey)?.name;
    const agentId = idByName.get(a.name);
    const managerId = managerName ? idByName.get(managerName) : null;
    if (!agentId || !managerId) continue;
    await db.update(agents).set({ managerId, updatedAt: new Date() }).where(eq(agents.id, agentId));
  }

  await db.insert(economyWallets).values(
    AGENTS.map((a, idx) => {
      const p = profile(a.hierarchy);
      const bump = (idx % 6) * 11;
      const tier = a.hierarchy === "executor" && idx % 2 === 0 ? "EXEC-2" : p.tier;
      return {
        agentId: idByName.get(a.name)!,
        companyId,
        creditBalance: p.bal,
        lifetimeCreditsEarned: String(Number(p.bal) + 12000 + idx * 100),
        lifetimeCreditsSpent: String(7600 + idx * 83),
        tier,
        tierProgress: String((idx * 7) % 100),
        status: "active",
        allowedModels: p.models,
        toolAccess: ["crm", "wallet", "tasks", "cron", "actions"],
        dailyCreditLimit: p.daily,
        hourlyCreditLimit: String(Math.max(250, Math.round(Number(p.daily) / 8))),
        creditsSpentToday: String(240 + bump),
        creditsSpentThisHour: String(40 + (idx % 4) * 9),
        dailySpent: String(240 + bump),
        lifetimeSpent: String(7600 + idx * 83),
        dailyLimit: p.daily,
        tierLimit: p.tierLimit,
        autoRefill: a.hierarchy === "super" || a.hierarchy === "director",
        lastDayReset: new Date(),
        lastHourReset: new Date(),
        metadata: { seed_key: SEED_KEY, hierarchy: a.hierarchy, tier },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }),
  );

  const taskRows = AGENTS.flatMap((a, idx) => {
    const p = profile(a.hierarchy);
    const baseTokens = Math.max(350, Math.round(p.day / (a.hierarchy === "executor" ? 30 : 90)));
    const now = Date.now();
    return [
      {
        tenantId,
        agentId: idByName.get(a.name)!,
        agent: a.taskAgent as any,
        taskType: "governance_cycle",
        taskSource: "manual" as const,
        scriptGenerated: a.hierarchy === "executor",
        executionStatus: "success" as const,
        goal: `${a.role}: execute daily governance mission`,
        budgetUsdCap: "15.00",
        budgetMaxCalls: 20,
        budgetMaxTokens: baseTokens * 2,
        budgetUsedUsd: "2.4000",
        callsUsed: 6,
        tokensUsed: baseTokens,
        status: "completed" as const,
        constraints: { seed_key: SEED_KEY, hierarchy: a.hierarchy },
        createdByUserId: adminId,
        startedAt: new Date(now - (idx + 1) * 12 * 60_000),
        finishedAt: new Date(now - (idx + 1) * 6 * 60_000),
        createdAt: new Date(now - (idx + 1) * 14 * 60_000),
        updatedAt: new Date(now - (idx + 1) * 6 * 60_000),
      },
      {
        tenantId,
        agentId: idByName.get(a.name)!,
        agent: a.taskAgent as any,
        taskType: "cron_backbone",
        taskSource: "cron" as const,
        scriptGenerated: true,
        executionStatus: idx % 4 === 0 ? ("queued" as const) : ("running" as const),
        goal: `${a.role}: run deterministic cron execution`,
        budgetUsdCap: "10.00",
        budgetMaxCalls: 30,
        budgetMaxTokens: baseTokens,
        budgetUsedUsd: "1.1000",
        callsUsed: 3,
        tokensUsed: Math.max(140, Math.round(baseTokens * 0.45)),
        status: idx % 4 === 0 ? ("queued" as const) : ("running" as const),
        constraints: { seed_key: SEED_KEY, hierarchy: a.hierarchy, cron: true },
        createdByUserId: adminId,
        startedAt: idx % 4 === 0 ? null : new Date(now - (idx + 1) * 5 * 60_000),
        finishedAt: null,
        createdAt: new Date(now - (idx + 1) * 7 * 60_000),
        updatedAt: new Date(now - (idx + 1) * 2 * 60_000),
      },
    ];
  });

  const tasks = await db.insert(agentTasks).values(taskRows).returning({
    id: agentTasks.id,
    agentId: agentTasks.agentId,
    taskSource: agentTasks.taskSource,
    tokensUsed: agentTasks.tokensUsed,
  });

  await db.insert(agentTokenUsage).values(tasks.map((t, i) => ({
    agentId: Number(t.agentId),
    tenantId,
    taskId: Number(t.id),
    tokensUsed: Number(t.tokensUsed || 0) + (t.taskSource === "cron" ? 18 : 42),
    reasoningDepth: t.taskSource === "cron" ? 1 : 3,
    eventAt: new Date(Date.now() - (i + 1) * 4 * 60_000),
    metadata: { seed_key: SEED_KEY, task_source: t.taskSource },
  })));

  await db.insert(cronRegistry).values(AGENTS.filter((a) => a.hierarchy !== "super").map((a, idx) => {
    const role = a.role.toLowerCase();
    const cronType = role.includes("monitor") ? "monitor" : role.includes("territory") ? "event" : role.includes("dashboard") ? "regeneration" : "time";
    const schedule = cronType === "event" ? null : cronType === "monitor" ? "*/15 * * * *" : cronType === "regeneration" ? "30 2 * * *" : "0 * * * *";
    const budgetTokens = a.hierarchy === "director" ? 32000 : a.hierarchy === "manager" ? 18000 : 5000;
    return {
      tenantId,
      agentId: idByName.get(a.name)!,
      cronType: cronType as any,
      schedule,
      scriptReference: `scripts/cron/${a.key}.ts`,
      budgetTokens,
      isActive: true,
      lastRun: new Date(Date.now() - (idx + 1) * 25 * 60_000),
      nextRun: new Date(Date.now() + (idx + 1) * 17 * 60_000),
      metadata: { seed_key: SEED_KEY, tier: a.hierarchy, trigger: cronType === "event" ? "task.created" : "schedule" },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }));

  await db.insert(auditLogs).values(insertedAgents.map((a) => ({
    tenantId,
    userId: adminId,
    userRole: "SUPER_ADMIN",
    action: "SEED_AGENT_PROVISIONED",
    entityType: "agent",
    entityId: Number(a.id),
    metadata: { seed_key: SEED_KEY, agent_name: a.name, hierarchy: a.hierarchyLevel },
    createdAt: new Date(),
  })));

  console.log(JSON.stringify({
    ok: true,
    tenant: TENANT_KEY,
    seedKey: SEED_KEY,
    companyId,
    territoriesSeeded: TERRITORIES.length,
    staffUsersSeeded: STAFF.length,
    agentsSeeded: insertedAgents.length,
    walletsSeeded: AGENTS.length,
    tasksSeeded: tasks.length,
    tokenUsageSeeded: tasks.length,
    cronsSeeded: AGENTS.length - 1,
  }, null, 2));
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[seed-exportunity-agent-economy] failed", error);
    process.exit(1);
  });
