import { db } from "@db";
import { agentTokenUsage, agents, economyWallets } from "@db/schema";
import { and, eq, gte, sql } from "drizzle-orm";

type HierarchyLevel = "executor" | "manager" | "director" | "super";

type HierarchyPolicy = {
  dailyCap: number;
  perTaskCap: number;
  maxReasoningDepth: number;
  canSpawnCrons: boolean;
  canGenerateScripts: boolean;
  canOverrideLimits: boolean;
};

const HIERARCHY_POLICIES: Record<HierarchyLevel, HierarchyPolicy> = {
  executor: {
    dailyCap: 10_000,
    perTaskCap: 5_000,
    maxReasoningDepth: 1,
    canSpawnCrons: true,
    canGenerateScripts: false,
    canOverrideLimits: false,
  },
  manager: {
    dailyCap: 100_000,
    perTaskCap: 25_000,
    maxReasoningDepth: 3,
    canSpawnCrons: true,
    canGenerateScripts: true,
    canOverrideLimits: false,
  },
  director: {
    dailyCap: 250_000,
    perTaskCap: 50_000,
    maxReasoningDepth: 5,
    canSpawnCrons: true,
    canGenerateScripts: true,
    canOverrideLimits: true,
  },
  super: {
    dailyCap: Number.MAX_SAFE_INTEGER,
    perTaskCap: Number.MAX_SAFE_INTEGER,
    maxReasoningDepth: Number.MAX_SAFE_INTEGER,
    canSpawnCrons: true,
    canGenerateScripts: true,
    canOverrideLimits: true,
  },
};

let ensurePromise: Promise<void> | null = null;

function toHierarchyLevel(value: unknown): HierarchyLevel {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "manager" || normalized === "director" || normalized === "super") return normalized;
  return "executor";
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function toPositiveFloat(value: unknown, fallback: number): number {
  const parsed = Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function getPolicyForHierarchy(level: HierarchyLevel, isSuperAgent = false): HierarchyPolicy {
  if (isSuperAgent) return HIERARCHY_POLICIES.super;
  return HIERARCHY_POLICIES[level] || HIERARCHY_POLICIES.executor;
}

export async function ensureAgentEconomyGovernanceTables() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await db.execute(sql`
        alter table if exists agents
          add column if not exists hierarchy_level text not null default 'executor',
          add column if not exists intelligence_cap text not null default 'LOW',
          add column if not exists max_context_tokens int not null default 4096,
          add column if not exists max_daily_tokens int not null default 10000,
          add column if not exists is_super_agent boolean not null default false,
          add column if not exists token_multiplier numeric(6,2) not null default 1.00;
      `);

      await db.execute(sql`
        alter table if exists economy_wallets
          add column if not exists daily_spent numeric(15,2) not null default 0.00,
          add column if not exists lifetime_spent numeric(20,2) not null default 0.00,
          add column if not exists daily_limit numeric(15,2) not null default 100.00,
          add column if not exists tier_limit numeric(15,2) not null default 100000.00,
          add column if not exists auto_refill boolean not null default false;
      `);

      await db.execute(sql`
        create table if not exists agent_token_usage (
          id serial primary key,
          agent_id int not null references agents(id) on delete cascade,
          tenant_id int references tenants(id) on delete cascade,
          task_id int,
          tokens_used int not null default 0,
          reasoning_depth int not null default 1,
          "timestamp" timestamp not null default now(),
          metadata jsonb not null default '{}'::jsonb
        );
      `);
      await db.execute(sql`create index if not exists agent_token_usage_agent_idx on agent_token_usage (agent_id, "timestamp");`);
      await db.execute(sql`create index if not exists agent_token_usage_tenant_idx on agent_token_usage (tenant_id, "timestamp");`);
      await db.execute(sql`create index if not exists agent_token_usage_task_idx on agent_token_usage (task_id);`);

      await db.execute(sql`
        create table if not exists cron_registry (
          id serial primary key,
          tenant_id int not null references tenants(id) on delete cascade,
          agent_id int references agents(id) on delete set null,
          cron_type text not null,
          schedule text,
          script_reference text,
          budget_tokens int not null default 0,
          is_active boolean not null default true,
          last_run timestamptz,
          next_run timestamptz,
          metadata jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
      `);
      await db.execute(sql`create index if not exists cron_registry_tenant_active_idx on cron_registry (tenant_id, is_active, next_run);`);
      await db.execute(sql`create index if not exists cron_registry_agent_idx on cron_registry (agent_id, next_run);`);
      await db.execute(sql`create index if not exists cron_registry_type_idx on cron_registry (cron_type, next_run);`);

      await db.execute(sql`
        alter table if exists agent_tasks
          add column if not exists agent_id int,
          add column if not exists task_type text not null default 'general',
          add column if not exists task_source text not null default 'manual',
          add column if not exists script_generated boolean not null default false,
          add column if not exists execution_status text not null default 'queued';
      `);

      await db.execute(sql`
        update economy_wallets
        set
          daily_spent = coalesce(daily_spent, 0.00) + 0,
          lifetime_spent = coalesce(nullif(lifetime_spent, 0.00), lifetime_credits_spent::numeric, 0.00),
          daily_limit = coalesce(nullif(daily_limit, 0.00), daily_credit_limit::numeric, 100.00)
      `);
    })();
  }
  return ensurePromise;
}

export type AgentBudgetEvaluation = {
  allowed: boolean;
  reason?: string;
  action?: "allow" | "downgrade" | "reject" | "escalate";
  hierarchyLevel: HierarchyLevel;
  isSuperAgent: boolean;
  dailyUsed: number;
  dailyCap: number;
  perTaskCap: number;
  suggestedReasoningDepth: number;
  policy: HierarchyPolicy;
};

export async function evaluateAgentTokenBudget(input: {
  agentId: number;
  estimatedTokens: number;
  requestedReasoningDepth?: number;
}) : Promise<AgentBudgetEvaluation> {
  await ensureAgentEconomyGovernanceTables();

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, input.agentId),
    columns: {
      id: true,
      tenantId: true,
      hierarchyLevel: true,
      isSuperAgent: true,
      maxDailyTokens: true,
      tokenMultiplier: true,
      roleLevel: true,
      decisionAuthority: true,
    },
  });

  if (!agent) {
    return {
      allowed: false,
      reason: "Agent not found",
      action: "reject",
      hierarchyLevel: "executor",
      isSuperAgent: false,
      dailyUsed: 0,
      dailyCap: 0,
      perTaskCap: 0,
      suggestedReasoningDepth: 1,
      policy: HIERARCHY_POLICIES.executor,
    };
  }

  const derivedLevel = (() => {
    if (agent.isSuperAgent) return "super";
    const fromColumn = toHierarchyLevel((agent as any).hierarchyLevel);
    if (fromColumn !== "executor") return fromColumn;
    if (String(agent.decisionAuthority || "").toLowerCase() === "executive") return "director";
    if (toPositiveInt(agent.roleLevel, 1) >= 3) return "manager";
    return "executor";
  })();

  const policy = getPolicyForHierarchy(derivedLevel, Boolean(agent.isSuperAgent));
  const multiplier = toPositiveFloat(agent.tokenMultiplier, 1);
  const perTaskCap = agent.isSuperAgent ? policy.perTaskCap : Math.max(1, Math.round(policy.perTaskCap * multiplier));

  const configuredDailyCap = toPositiveInt(agent.maxDailyTokens, 0);
  const dailyCap = agent.isSuperAgent
    ? policy.dailyCap
    : Math.max(1, configuredDailyCap > 0 ? configuredDailyCap : Math.round(policy.dailyCap * multiplier));

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const usageRows = await db
    .select({
      used: sql<number>`coalesce(sum(${agentTokenUsage.tokensUsed}), 0)`,
    })
    .from(agentTokenUsage)
    .where(and(eq(agentTokenUsage.agentId, input.agentId), gte(agentTokenUsage.eventAt, startOfDay)));

  const dailyUsed = Number(usageRows[0]?.used || 0);
  const estimatedTokens = Math.max(0, toPositiveInt(input.estimatedTokens, 0));
  const requestedDepth = toPositiveInt(input.requestedReasoningDepth, 1);
  const suggestedReasoningDepth = Math.min(requestedDepth, policy.maxReasoningDepth);

  if (!agent.isSuperAgent && estimatedTokens > perTaskCap) {
    return {
      allowed: false,
      reason: `Per-task token cap exceeded (${estimatedTokens} > ${perTaskCap})`,
      action: "reject",
      hierarchyLevel: derivedLevel,
      isSuperAgent: false,
      dailyUsed,
      dailyCap,
      perTaskCap,
      suggestedReasoningDepth,
      policy,
    };
  }

  if (!agent.isSuperAgent && dailyUsed + estimatedTokens > dailyCap) {
    return {
      allowed: false,
      reason: `Daily token cap exceeded (${dailyUsed + estimatedTokens} > ${dailyCap}); escalate to manager`,
      action: "escalate",
      hierarchyLevel: derivedLevel,
      isSuperAgent: false,
      dailyUsed,
      dailyCap,
      perTaskCap,
      suggestedReasoningDepth,
      policy,
    };
  }

  return {
    allowed: true,
    action: suggestedReasoningDepth < requestedDepth ? "downgrade" : "allow",
    hierarchyLevel: derivedLevel,
    isSuperAgent: Boolean(agent.isSuperAgent),
    dailyUsed,
    dailyCap,
    perTaskCap,
    suggestedReasoningDepth,
    policy,
  };
}

export async function recordAgentTokenUsageEvent(input: {
  agentId: number;
  tokensUsed: number;
  taskId?: number | null;
  tenantId?: number | null;
  reasoningDepth?: number;
  metadata?: Record<string, unknown>;
}) {
  const tokensUsed = toPositiveInt(input.tokensUsed, 0);
  if (!tokensUsed) return;

  await ensureAgentEconomyGovernanceTables();

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, input.agentId),
    columns: { tenantId: true },
  });

  const tenantId = input.tenantId ?? agent?.tenantId ?? null;

  await db.insert(agentTokenUsage).values({
    agentId: input.agentId,
    tenantId,
    taskId: input.taskId ?? null,
    tokensUsed,
    reasoningDepth: toPositiveInt(input.reasoningDepth, 1),
    eventAt: new Date(),
    metadata: input.metadata || {},
  });
}

export async function syncWalletMirrorColumnsForAgent(agentId: number) {
  await ensureAgentEconomyGovernanceTables();
  await db
    .update(economyWallets)
    .set({
      dailySpent: sql`coalesce(${economyWallets.creditsSpentToday}::numeric, 0)`,
      lifetimeSpent: sql`coalesce(${economyWallets.lifetimeCreditsSpent}::numeric, 0)`,
      dailyLimit: sql`coalesce(${economyWallets.dailyCreditLimit}::numeric, 100)`,
      updatedAt: new Date(),
    })
    .where(eq(economyWallets.agentId, agentId));
}
