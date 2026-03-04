import { Router } from 'express';
import { db } from '@db';
import { 
  economyWallets, 
  economyTransactions, 
  agentCreditSnapshots, 
  campaignForecasts, 
  cfoDecisions, 
  globalCreditPool,
  agents,
  agentTasks,
  agentTokenUsage,
  cronRegistry,
  intelligenceCronJobs,
  intelligenceTasks,
  tenants,
  companies,
} from '@db/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { 
  analyzeAgentPerformance, 
  executeCFORecommendations, 
  createPeriodSnapshots,
  resetSpendLimits
} from '../lib/cfo-agent-service';
import {
  killSwitchFreezeWallet,
  unfreezeWallet,
  globalKillSwitch,
  releaseGlobalKillSwitch
} from '../lib/spend-guards';
import { ensureTenantAdmin, isChairmanAssistantUser } from './utils/auth';
import { ensureAgentEconomyGovernanceTables, getPolicyForHierarchy } from '../lib/agent-economy-governance';

const router = Router();
router.use(ensureTenantAdmin);

function parsePositiveInt(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function parseScope(value: unknown): 'tenant' | 'global' {
  return String(value || '').trim().toLowerCase() === 'global' ? 'global' : 'tenant';
}

function parseBool(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function getRows<T = any>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function isSuperOperator(user: any): boolean {
  const role = String(user?.role || '').toLowerCase();
  const roles = Array.isArray(user?.roles) ? user.roles.map((entry: unknown) => String(entry || '').toLowerCase()) : [];
  const perms = Array.isArray(user?.permissions)
    ? user.permissions.map((entry: unknown) => String(entry || '').toLowerCase())
    : [];
  return (
    isChairmanAssistantUser(user) ||
    role.includes('chairman') ||
    role.includes('super') ||
    roles.some((entry: string) => entry.includes('chairman') || entry.includes('super') || entry.includes('platform admin')) ||
    perms.includes('*') ||
    perms.includes('admin:*')
  );
}

router.get('/tenant-options', async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant?.id) return res.status(500).json({ message: 'Tenant not resolved' });
    const canUseGlobalView = isSuperOperator(req.adminUser);
    if (!canUseGlobalView) {
      return res.json({
        canUseGlobalView: false,
        tenants: [{ id: Number(tenant.id), key: String(tenant.key || 'tenant'), name: String(tenant.name || 'Tenant') }],
      });
    }

    const tenantRows = await db.query.tenants.findMany({
      columns: { id: true, key: true, name: true },
      orderBy: (t, { asc }) => [asc(t.name)],
    });

    return res.json({ canUseGlobalView: true, tenants: tenantRows });
  } catch (error: any) {
    console.error('Error listing tenant options:', error);
    return res.status(500).json({ message: error?.message || 'Failed to list tenant options' });
  }
});

router.get('/command-center', async (req: any, res) => {
  try {
    await ensureAgentEconomyGovernanceTables();

    const tenant = req.tenant;
    if (!tenant?.id) return res.status(500).json({ message: 'Tenant not resolved' });

    const canUseGlobalView = isSuperOperator(req.adminUser);
    const requestedScope = parseScope(req.query?.scope);
    const scope: 'tenant' | 'global' = requestedScope === 'global' && canUseGlobalView ? 'global' : 'tenant';
    const requestedTenantId = parsePositiveInt(req.query?.tenantId ?? req.query?.tenant_id, 0);
    const activeTenantId = scope === 'global' ? (requestedTenantId || null) : Number(tenant.id);

    if (requestedScope === 'global' && !canUseGlobalView) {
      return res.status(403).json({ message: 'Global view requires super-agent privileges' });
    }

    const agentScopeFilter = activeTenantId
      ? sql`coalesce(${agents.tenantId}, ${companies.tenantId}) = ${activeTenantId}`
      : undefined;

    const walletRows = await db
      .select({
        walletId: economyWallets.id,
        agentId: agents.id,
        tenantId: agents.tenantId,
        companyId: agents.companyId,
        agentName: agents.name,
        role: agents.role,
        status: agents.status,
        hierarchyLevel: agents.hierarchyLevel,
        intelligenceCap: agents.intelligenceCap,
        maxContextTokens: agents.maxContextTokens,
        maxDailyTokens: agents.maxDailyTokens,
        isSuperAgent: agents.isSuperAgent,
        tokenMultiplier: agents.tokenMultiplier,
        tier: economyWallets.tier,
        walletStatus: economyWallets.status,
        creditBalance: economyWallets.creditBalance,
        creditsSpentToday: economyWallets.creditsSpentToday,
        lifetimeCreditsSpent: economyWallets.lifetimeCreditsSpent,
        dailyCreditLimit: economyWallets.dailyCreditLimit,
        dailySpent: economyWallets.dailySpent,
        lifetimeSpent: economyWallets.lifetimeSpent,
        dailyLimit: economyWallets.dailyLimit,
      })
      .from(economyWallets)
      .innerJoin(agents, eq(economyWallets.agentId, agents.id))
      .leftJoin(companies, eq(agents.companyId, companies.id))
      .where(agentScopeFilter)
      .orderBy(desc(economyWallets.creditBalance));

    const totalCredits = walletRows.reduce((sum: number, row: any) => sum + toNumber(row.creditBalance, 0), 0);
    const activeWallets = walletRows.filter((row: any) => String(row.walletStatus) === 'active' && toNumber(row.creditBalance, 0) > 0).length;
    const dailySpend = walletRows.reduce(
      (sum: number, row: any) => sum + toNumber(row.dailySpent ?? row.creditsSpentToday, 0),
      0,
    );
    const dailyLimit = walletRows.reduce(
      (sum: number, row: any) => sum + toNumber(row.dailyLimit ?? row.dailyCreditLimit, 0),
      0,
    );
    const activeAgentCount = walletRows.filter((row: any) => String(row.status) === 'active').length;
    const avgSpendPerAgent = activeAgentCount > 0 ? dailySpend / activeAgentCount : 0;

    const intelligenceTaskScope = activeTenantId ? eq(intelligenceTasks.tenantId, activeTenantId) : undefined;
    const intelligenceTaskRows = await db.query.intelligenceTasks.findMany({
      where: intelligenceTaskScope,
      limit: 5000,
      orderBy: desc(intelligenceTasks.createdAt),
      columns: {
        id: true,
        managerAgentId: true,
        executionAgentId: true,
        source: true,
        state: true,
        scriptHash: true,
        runningAt: true,
        finishedAt: true,
        queuedAt: true,
        createdAt: true,
      },
    });

    const basicTaskScope = activeTenantId ? eq(agentTasks.tenantId, activeTenantId) : undefined;
    const basicTaskRows = await db.query.agentTasks.findMany({
      where: basicTaskScope,
      limit: 5000,
      orderBy: desc(agentTasks.createdAt),
      columns: {
        id: true,
        agentId: true,
        status: true,
        executionStatus: true,
        taskSource: true,
        scriptGenerated: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
      },
    });

    const tokenScope = activeTenantId ? eq(agentTokenUsage.tenantId, activeTenantId) : undefined;
    const tokenRows = await db
      .select({
        agentId: agentTokenUsage.agentId,
        totalTokens: sql<number>`coalesce(sum(${agentTokenUsage.tokensUsed}), 0)`,
        totalEvents: sql<number>`count(*)`,
      })
      .from(agentTokenUsage)
      .where(tokenScope)
      .groupBy(agentTokenUsage.agentId);

    const tokenByAgent = new Map<number, { totalTokens: number; totalEvents: number }>();
    for (const row of tokenRows) {
      tokenByAgent.set(Number(row.agentId), {
        totalTokens: Number(row.totalTokens || 0),
        totalEvents: Number(row.totalEvents || 0),
      });
    }

    type Perf = {
      totalTasks: number;
      successTasks: number;
      cronTasks: number;
      scriptTasks: number;
      totalDurationMs: number;
      durationSamples: number;
    };

    const perfByAgent = new Map<number, Perf>();
    const getPerf = (agentId: number) => {
      if (!perfByAgent.has(agentId)) {
        perfByAgent.set(agentId, {
          totalTasks: 0,
          successTasks: 0,
          cronTasks: 0,
          scriptTasks: 0,
          totalDurationMs: 0,
          durationSamples: 0,
        });
      }
      return perfByAgent.get(agentId)!;
    };

    for (const row of intelligenceTaskRows) {
      const agentId = Number(row.executionAgentId || row.managerAgentId || 0);
      if (!agentId) continue;
      const perf = getPerf(agentId);
      perf.totalTasks += 1;
      if (String(row.state || '').toUpperCase() === 'VERIFIED' || String(row.state || '').toUpperCase() === 'REPORTED') {
        perf.successTasks += 1;
      }
      if (String(row.source || '').toUpperCase().startsWith('CRON_')) {
        perf.cronTasks += 1;
      }
      if (row.scriptHash) {
        perf.scriptTasks += 1;
      }
      const startAt = row.runningAt || row.queuedAt || row.createdAt;
      const endAt = row.finishedAt;
      if (startAt && endAt) {
        const duration = new Date(endAt).getTime() - new Date(startAt).getTime();
        if (Number.isFinite(duration) && duration > 0) {
          perf.totalDurationMs += duration;
          perf.durationSamples += 1;
        }
      }
    }

    for (const row of basicTaskRows) {
      const agentId = Number(row.agentId || 0);
      if (!agentId) continue;
      const perf = getPerf(agentId);
      perf.totalTasks += 1;
      const status = String(row.executionStatus || row.status || '').toLowerCase();
      if (status === 'success' || status === 'completed') {
        perf.successTasks += 1;
      }
      if (String(row.taskSource || '').toLowerCase() !== 'manual') {
        perf.cronTasks += 1;
      }
      if (Boolean(row.scriptGenerated)) {
        perf.scriptTasks += 1;
      }
      if (row.startedAt && row.finishedAt) {
        const duration = new Date(row.finishedAt).getTime() - new Date(row.startedAt).getTime();
        if (Number.isFinite(duration) && duration > 0) {
          perf.totalDurationMs += duration;
          perf.durationSamples += 1;
        }
      }
    }

    const performance = walletRows.map((row: any) => {
      const agentId = Number(row.agentId);
      const perf = perfByAgent.get(agentId) || {
        totalTasks: 0,
        successTasks: 0,
        cronTasks: 0,
        scriptTasks: 0,
        totalDurationMs: 0,
        durationSamples: 0,
      };
      const token = tokenByAgent.get(agentId) || { totalTokens: 0, totalEvents: 0 };

      const totalTasks = perf.totalTasks;
      const successRate = totalTasks > 0 ? (perf.successTasks / totalTasks) * 100 : 0;
      const avgExecutionSeconds = perf.durationSamples > 0 ? perf.totalDurationMs / perf.durationSamples / 1000 : 0;
      const scriptReusePct = totalTasks > 0 ? (perf.scriptTasks / totalTasks) * 100 : 0;
      const cronUsagePct = totalTasks > 0 ? (perf.cronTasks / totalTasks) * 100 : 0;
      const llmUsagePct = totalTasks > 0 ? Math.min(100, (token.totalEvents / totalTasks) * 100) : 0;

      const hierarchyLevel = String(row.hierarchyLevel || 'executor').toLowerCase() as any;
      const policy = getPolicyForHierarchy(hierarchyLevel, Boolean(row.isSuperAgent));
      const dailyCap = Number(row.maxDailyTokens || policy.dailyCap || 0);
      const anomaly =
        !row.isSuperAgent &&
        (token.totalTokens > dailyCap * 0.8 && successRate < 60
          ? 'high-token-low-success'
          : token.totalTokens > policy.perTaskCap * 3 && totalTasks < 3
            ? 'token-heavy-low-action'
            : null);

      return {
        agentId,
        agentName: row.agentName,
        hierarchyLevel,
        isSuperAgent: Boolean(row.isSuperAgent),
        successRate,
        avgExecutionSeconds,
        scriptReusePct,
        llmUsagePct,
        cronUsagePct,
        totalTokens: token.totalTokens,
        anomaly,
      };
    });

    const cronScopeFilter = activeTenantId ? eq(cronRegistry.tenantId, activeTenantId) : undefined;
    const cronRegistryRows = await db
      .select({
        source: sql<string>`'registry'`,
        id: cronRegistry.id,
        tenantId: cronRegistry.tenantId,
        agentId: cronRegistry.agentId,
        agentName: agents.name,
        cronType: cronRegistry.cronType,
        schedule: cronRegistry.schedule,
        scriptReference: cronRegistry.scriptReference,
        budgetTokens: cronRegistry.budgetTokens,
        isActive: cronRegistry.isActive,
        lastRun: cronRegistry.lastRun,
        nextRun: cronRegistry.nextRun,
      })
      .from(cronRegistry)
      .leftJoin(agents, eq(cronRegistry.agentId, agents.id))
      .where(cronScopeFilter)
      .orderBy(desc(cronRegistry.updatedAt));

    const governedCronScope = activeTenantId ? eq(intelligenceCronJobs.tenantId, activeTenantId) : undefined;
    const governedCronRows = await db.query.intelligenceCronJobs.findMany({
      where: governedCronScope,
      orderBy: desc(intelligenceCronJobs.updatedAt),
      limit: 1000,
      columns: {
        id: true,
        tenantId: true,
        cronKind: true,
        scheduleCron: true,
        moduleId: true,
        isActive: true,
        lastRunAt: true,
        nextRunAt: true,
        metadata: true,
      },
    });

    const governedCrons = governedCronRows.map((row) => ({
      source: 'governed',
      id: row.id,
      tenantId: row.tenantId,
      agentId: Number((row.metadata as any)?.agentId || 0) || null,
      agentName: null as string | null,
      cronType: String(row.cronKind || '').toLowerCase(),
      schedule: row.scheduleCron || null,
      scriptReference: row.moduleId || null,
      budgetTokens: parsePositiveInt((row.metadata as any)?.budgetTokens, 0),
      isActive: Boolean(row.isActive),
      lastRun: row.lastRunAt,
      nextRun: row.nextRunAt,
    }));

    const crons = [...cronRegistryRows, ...governedCrons];

    const tenantRows = canUseGlobalView
      ? await db.query.tenants.findMany({
          columns: { id: true, key: true, name: true },
          orderBy: (t, { asc }) => [asc(t.name)],
        })
      : [{ id: Number(tenant.id), key: String(tenant.key || 'tenant'), name: String(tenant.name || 'Tenant') }];

    return res.json({
      scope,
      canUseGlobalView,
      tenant: { id: Number(tenant.id), key: String(tenant.key || ''), name: String(tenant.name || '') },
      selectedTenantId: activeTenantId,
      tenantOptions: tenantRows,
      metrics: {
        totalCredits,
        activeWallets,
        avgSpendPerAgent,
        dailySpend,
        dailyLimit,
      },
      wallets: walletRows.map((row: any) => ({
        walletId: row.walletId,
        agentId: row.agentId,
        tenantId: row.tenantId,
        agentName: row.agentName,
        role: row.role,
        status: row.status,
        hierarchyLevel: row.hierarchyLevel,
        intelligenceCap: row.intelligenceCap,
        maxContextTokens: Number(row.maxContextTokens || 0),
        maxDailyTokens: Number(row.maxDailyTokens || 0),
        isSuperAgent: Boolean(row.isSuperAgent),
        tokenMultiplier: Number(row.tokenMultiplier || 1),
        tier: row.tier,
        walletStatus: row.walletStatus,
        creditBalance: toNumber(row.creditBalance, 0),
        dailySpent: toNumber(row.dailySpent ?? row.creditsSpentToday, 0),
        lifetimeSpent: toNumber(row.lifetimeSpent ?? row.lifetimeCreditsSpent, 0),
        dailyLimit: toNumber(row.dailyLimit ?? row.dailyCreditLimit, 0),
      })),
      performance,
      crons,
    });
  } catch (error: any) {
    console.error('Error fetching command center data:', error);
    return res.status(500).json({ message: error?.message || 'Failed to fetch command center data' });
  }
});

router.patch('/cron/:id', async (req: any, res) => {
  try {
    await ensureAgentEconomyGovernanceTables();

    const cronId = parsePositiveInt(req.params.id, 0);
    if (!cronId) return res.status(400).json({ message: 'Invalid cron id' });

    const source = String(req.body?.source || 'registry').trim().toLowerCase();
    const schedule = typeof req.body?.schedule === 'string' ? req.body.schedule.trim() : undefined;
    const budgetTokens = req.body?.budgetTokens !== undefined ? parsePositiveInt(req.body.budgetTokens, 0) : undefined;
    const scriptReference = typeof req.body?.scriptReference === 'string' ? req.body.scriptReference.trim() : undefined;
    const isActive = req.body?.isActive !== undefined ? parseBool(req.body.isActive, true) : undefined;

    if (source === 'governed') {
      const existing = await db.query.intelligenceCronJobs.findFirst({
        where: eq(intelligenceCronJobs.id, cronId),
      });
      if (!existing) return res.status(404).json({ message: 'Governed cron not found' });

      const canGlobal = isSuperOperator(req.adminUser);
      if (!canGlobal && Number(existing.tenantId) !== Number(req.tenant?.id)) {
        return res.status(403).json({ message: 'Cross-tenant cron update requires super privileges' });
      }

      const currentMetadata = (existing.metadata as Record<string, unknown>) || {};
      const mergedMetadata = {
        ...currentMetadata,
        ...(budgetTokens !== undefined ? { budgetTokens } : {}),
      };

      const [updated] = await db
        .update(intelligenceCronJobs)
        .set({
          ...(schedule !== undefined ? { scheduleCron: schedule || null } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
          ...(scriptReference !== undefined ? { moduleId: scriptReference || existing.moduleId } : {}),
          metadata: mergedMetadata,
          updatedAt: new Date(),
        })
        .where(eq(intelligenceCronJobs.id, cronId))
        .returning();

      return res.json({ ok: true, source: 'governed', cron: updated });
    }

    const existing = await db.query.cronRegistry.findFirst({
      where: eq(cronRegistry.id, cronId),
    });
    if (!existing) return res.status(404).json({ message: 'Cron registry entry not found' });

    const canGlobal = isSuperOperator(req.adminUser);
    if (!canGlobal && Number(existing.tenantId) !== Number(req.tenant?.id)) {
      return res.status(403).json({ message: 'Cross-tenant cron update requires super privileges' });
    }

    const [updated] = await db
      .update(cronRegistry)
      .set({
        ...(schedule !== undefined ? { schedule: schedule || null } : {}),
        ...(budgetTokens !== undefined ? { budgetTokens } : {}),
        ...(scriptReference !== undefined ? { scriptReference: scriptReference || null } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        updatedAt: new Date(),
      })
      .where(eq(cronRegistry.id, cronId))
      .returning();

    return res.json({ ok: true, source: 'registry', cron: updated });
  } catch (error: any) {
    console.error('Error updating cron:', error);
    return res.status(500).json({ message: error?.message || 'Failed to update cron' });
  }
});

router.patch('/cron/:id/toggle', async (req: any, res) => {
  try {
    await ensureAgentEconomyGovernanceTables();
    const cronId = parsePositiveInt(req.params.id, 0);
    if (!cronId) return res.status(400).json({ message: 'Invalid cron id' });

    const source = String(req.body?.source || 'registry').trim().toLowerCase();
    const isActive = parseBool(req.body?.isActive, true);

    if (source === 'governed') {
      const existing = await db.query.intelligenceCronJobs.findFirst({ where: eq(intelligenceCronJobs.id, cronId) });
      if (!existing) return res.status(404).json({ message: 'Governed cron not found' });

      const canGlobal = isSuperOperator(req.adminUser);
      if (!canGlobal && Number(existing.tenantId) !== Number(req.tenant?.id)) {
        return res.status(403).json({ message: 'Cross-tenant cron toggle requires super privileges' });
      }

      const [updated] = await db
        .update(intelligenceCronJobs)
        .set({ isActive, updatedAt: new Date() })
        .where(eq(intelligenceCronJobs.id, cronId))
        .returning();
      return res.json({ ok: true, source: 'governed', cron: updated });
    }

    const existing = await db.query.cronRegistry.findFirst({ where: eq(cronRegistry.id, cronId) });
    if (!existing) return res.status(404).json({ message: 'Cron registry entry not found' });

    const canGlobal = isSuperOperator(req.adminUser);
    if (!canGlobal && Number(existing.tenantId) !== Number(req.tenant?.id)) {
      return res.status(403).json({ message: 'Cross-tenant cron toggle requires super privileges' });
    }

    const [updated] = await db
      .update(cronRegistry)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(cronRegistry.id, cronId))
      .returning();
    return res.json({ ok: true, source: 'registry', cron: updated });
  } catch (error: any) {
    console.error('Error toggling cron:', error);
    return res.status(500).json({ message: error?.message || 'Failed to toggle cron' });
  }
});

router.patch('/agents/:id/super', async (req: any, res) => {
  try {
    if (!isSuperOperator(req.adminUser)) {
      return res.status(403).json({ message: 'Only super operators can elevate agents' });
    }
    await ensureAgentEconomyGovernanceTables();

    const agentId = parsePositiveInt(req.params.id, 0);
    if (!agentId) return res.status(400).json({ message: 'Invalid agent id' });
    const elevate = parseBool(req.body?.isSuperAgent ?? req.body?.elevate, true);

    const [updated] = await db
      .update(agents)
      .set({
        isSuperAgent: elevate,
        hierarchyLevel: elevate ? 'super' : 'manager',
        intelligenceCap: elevate ? 'UNLIMITED' : 'MEDIUM',
        maxDailyTokens: elevate ? 100000000 : sql`greatest(${agents.maxDailyTokens}, 100000)`,
        tokenMultiplier: elevate ? '10.00' : '2.00',
        status: elevate ? 'active' : agents.status,
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId))
      .returning();

    if (!updated) return res.status(404).json({ message: 'Agent not found' });

    return res.json({ ok: true, agent: updated });
  } catch (error: any) {
    console.error('Error elevating agent:', error);
    return res.status(500).json({ message: error?.message || 'Failed to elevate agent' });
  }
});

router.patch('/agents/:id/freeze', async (req: any, res) => {
  try {
    if (!isSuperOperator(req.adminUser)) {
      return res.status(403).json({ message: 'Only super operators can freeze/unfreeze agents' });
    }

    const agentId = parsePositiveInt(req.params.id, 0);
    if (!agentId) return res.status(400).json({ message: 'Invalid agent id' });

    const freeze = parseBool(req.body?.freeze, true);
    const reason = String(req.body?.reason || '').trim() || (freeze ? 'Manual governance freeze' : 'Manual governance release');

    const [updatedAgent] = await db
      .update(agents)
      .set({
        status: freeze ? 'paused' : 'active',
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId))
      .returning();

    if (!updatedAgent) return res.status(404).json({ message: 'Agent not found' });

    const wallet = await db.query.economyWallets.findFirst({
      where: eq(economyWallets.agentId, agentId),
    });

    if (wallet) {
      await db
        .update(economyWallets)
        .set({
          status: freeze ? 'frozen' : 'active',
          freezeReason: freeze ? reason : null,
          frozenUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(economyWallets.id, wallet.id));
    }

    return res.json({ ok: true, agent: updatedAgent, walletAffected: Boolean(wallet), freeze, reason });
  } catch (error: any) {
    console.error('Error freezing/unfreezing agent:', error);
    return res.status(500).json({ message: error?.message || 'Failed to freeze/unfreeze agent' });
  }
});

// Get global credit pool status
router.get('/pool', async (req, res) => {
  try {
    const pool = await db.query.globalCreditPool.findFirst();
    if (!pool) {
      return res.status(404).json({ error: 'Global credit pool not initialized' });
    }
    res.json(pool);
  } catch (error: any) {
    console.error('Error fetching global credit pool:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update global credit pool settings
router.patch('/pool', async (req, res) => {
  try {
    const { monthlyBudgetUsd, dailySpendLimit, creditToUsdRate, emergencyThrottleActive, throttleReason } = req.body;
    
    const [updated] = await db
      .update(globalCreditPool)
      .set({
        ...(monthlyBudgetUsd !== undefined && { monthlyBudgetUsd }),
        ...(dailySpendLimit !== undefined && { dailySpendLimit }),
        ...(creditToUsdRate !== undefined && { creditToUsdRate }),
        ...(emergencyThrottleActive !== undefined && { 
          emergencyThrottleActive,
          throttledAt: emergencyThrottleActive ? new Date() : null,
          throttleReason: emergencyThrottleActive ? throttleReason : null
        }),
        updatedAt: new Date()
      })
      .where(eq(globalCreditPool.id, 1))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('Error updating global credit pool:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all agent wallets with agent info
router.get('/wallets', async (req, res) => {
  try {
    const { companyId, status } = req.query;
    
    let whereConditions = [];
    if (companyId) {
      whereConditions.push(eq(economyWallets.companyId, Number(companyId)));
    }
    if (status) {
      whereConditions.push(sql`${economyWallets.status} = ${String(status)}`);
    }
    
    const wallets = await db
      .select({
        wallet: economyWallets,
        agent: {
          id: agents.id,
          name: agents.name
        }
      })
      .from(economyWallets)
      .innerJoin(agents, eq(economyWallets.agentId, agents.id))
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(desc(economyWallets.creditBalance));

    res.json(wallets);
  } catch (error: any) {
    console.error('Error fetching agent wallets:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get or create wallet for an agent
router.get('/wallets/agent/:agentId', async (req, res) => {
  try {
    const agentId = parseInt(req.params.agentId);
    
    let wallet = await db.query.economyWallets.findFirst({
      where: eq(economyWallets.agentId, agentId)
    });

    if (!wallet) {
      const agent = await db.query.agents.findFirst({
        where: eq(agents.id, agentId)
      });
      
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      const initialCredits = '1000.00';
      
      const [newWallet] = await db
        .insert(economyWallets)
        .values({
          agentId,
          companyId: agent.companyId,
          creditBalance: initialCredits,
          lifetimeCreditsEarned: initialCredits,
          status: 'active'
        })
        .returning();

      await db.insert(economyTransactions).values({
        walletId: newWallet.id,
        agentId,
        direction: 'credit',
        amount: initialCredits,
        balanceBefore: '0.00',
        balanceAfter: initialCredits,
        category: 'budget_allocation',
        description: 'Initial credit allocation for new agent wallet'
      });

      wallet = newWallet;
    }

    res.json(wallet);
  } catch (error: any) {
    console.error('Error fetching/creating agent wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get wallet by ID with transactions
router.get('/wallets/:walletId', async (req, res) => {
  try {
    const walletId = parseInt(req.params.walletId);
    
    const wallet = await db.query.economyWallets.findFirst({
      where: eq(economyWallets.id, walletId)
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const recentTransactions = await db.query.economyTransactions.findMany({
      where: eq(economyTransactions.walletId, walletId),
      orderBy: desc(economyTransactions.createdAt),
      limit: 50
    });

    res.json({ wallet, transactions: recentTransactions });
  } catch (error: any) {
    console.error('Error fetching wallet details:', error);
    res.status(500).json({ error: error.message });
  }
});

// Credit or debit a wallet
router.post('/wallets/:walletId/transaction', async (req, res) => {
  try {
    const walletId = parseInt(req.params.walletId);
    const { direction, amount, category, description, tokenCount, modelUsed, costUsd, referenceType, referenceId, metadata } = req.body;

    const wallet = await db.query.economyWallets.findFirst({
      where: eq(economyWallets.id, walletId)
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    if (wallet.status === 'frozen') {
      return res.status(403).json({ error: 'Wallet is frozen', reason: wallet.freezeReason });
    }

    const currentBalance = parseFloat(wallet.creditBalance);
    const transactionAmount = parseFloat(amount);

    if (direction === 'debit' && transactionAmount > currentBalance) {
      return res.status(400).json({ error: 'Insufficient credits', available: currentBalance, required: transactionAmount });
    }

    const newBalance = direction === 'credit' 
      ? currentBalance + transactionAmount 
      : currentBalance - transactionAmount;

    const lifetimeEarned = direction === 'credit' 
      ? parseFloat(wallet.lifetimeCreditsEarned) + transactionAmount
      : parseFloat(wallet.lifetimeCreditsEarned);
    
    const lifetimeSpent = direction === 'debit'
      ? parseFloat(wallet.lifetimeCreditsSpent) + transactionAmount
      : parseFloat(wallet.lifetimeCreditsSpent);

    const spentToday = direction === 'debit'
      ? parseFloat(wallet.creditsSpentToday) + transactionAmount
      : parseFloat(wallet.creditsSpentToday);

    const spentThisHour = direction === 'debit'
      ? parseFloat(wallet.creditsSpentThisHour) + transactionAmount
      : parseFloat(wallet.creditsSpentThisHour);

    await db
      .update(economyWallets)
      .set({
        creditBalance: String(newBalance),
        lifetimeCreditsEarned: String(lifetimeEarned),
        lifetimeCreditsSpent: String(lifetimeSpent),
        creditsSpentToday: String(spentToday),
        creditsSpentThisHour: String(spentThisHour),
        updatedAt: new Date()
      })
      .where(eq(economyWallets.id, walletId));

    const [transaction] = await db
      .insert(economyTransactions)
      .values({
        walletId,
        agentId: wallet.agentId,
        direction,
        amount: String(transactionAmount),
        balanceBefore: String(currentBalance),
        balanceAfter: String(newBalance),
        category,
        description,
        tokenCount,
        modelUsed,
        costUsd: costUsd ? String(costUsd) : null,
        referenceType,
        referenceId,
        metadata: metadata || {}
      })
      .returning();

    res.json({ transaction, newBalance });
  } catch (error: any) {
    console.error('Error processing wallet transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Freeze/unfreeze a wallet
router.post('/wallets/:walletId/freeze', async (req, res) => {
  try {
    const walletId = parseInt(req.params.walletId);
    const { freeze, reason, durationMinutes } = req.body;

    const wallet = await db.query.economyWallets.findFirst({
      where: eq(economyWallets.id, walletId)
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const frozenUntil = freeze && durationMinutes 
      ? new Date(Date.now() + durationMinutes * 60 * 1000)
      : null;

    const [updated] = await db
      .update(economyWallets)
      .set({
        status: freeze ? 'frozen' : 'active',
        frozenUntil,
        freezeReason: freeze ? reason : null,
        updatedAt: new Date()
      })
      .where(eq(economyWallets.id, walletId))
      .returning();

    await db.insert(cfoDecisions).values({
      decisionType: freeze ? 'freeze_wallet' : 'unfreeze_wallet',
      targetAgentId: wallet.agentId,
      targetWalletId: walletId,
      reason: reason || (freeze ? 'Wallet frozen' : 'Wallet unfrozen'),
      previousValue: { status: wallet.status },
      newValue: { status: freeze ? 'frozen' : 'active', frozenUntil },
      isAutomatic: false,
      status: 'executed',
      executedAt: new Date()
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Error freezing/unfreezing wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update wallet tier and model access
router.patch('/wallets/:walletId/tier', async (req, res) => {
  try {
    const walletId = parseInt(req.params.walletId);
    const { tier, allowedModels, dailyCreditLimit, hourlyCreditLimit } = req.body;

    const wallet = await db.query.economyWallets.findFirst({
      where: eq(economyWallets.id, walletId)
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const [updated] = await db
      .update(economyWallets)
      .set({
        ...(tier !== undefined && { tier }),
        ...(allowedModels && { allowedModels }),
        ...(dailyCreditLimit && { dailyCreditLimit: String(dailyCreditLimit) }),
        ...(hourlyCreditLimit && { hourlyCreditLimit: String(hourlyCreditLimit) }),
        updatedAt: new Date()
      })
      .where(eq(economyWallets.id, walletId))
      .returning();

    if (tier && tier !== wallet.tier) {
      const tierOrder = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
      const oldIndex = tierOrder.indexOf(wallet.tier);
      const newIndex = tierOrder.indexOf(tier);
      
      await db.insert(cfoDecisions).values({
        decisionType: newIndex > oldIndex ? 'tier_upgrade' : 'tier_downgrade',
        targetAgentId: wallet.agentId,
        targetWalletId: walletId,
        reason: `Tier changed from ${wallet.tier} to ${tier}`,
        previousValue: { tier: wallet.tier, allowedModels: wallet.allowedModels },
        newValue: { tier, allowedModels: allowedModels || wallet.allowedModels },
        isAutomatic: false,
        status: 'executed',
        executedAt: new Date()
      });
    }

    res.json(updated);
  } catch (error: any) {
    console.error('Error updating wallet tier:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get transactions for an agent
router.get('/transactions/agent/:agentId', async (req, res) => {
  try {
    const agentId = parseInt(req.params.agentId);
    const { limit = 100, offset = 0, category, direction } = req.query;

    let whereConditions = [eq(economyTransactions.agentId, agentId)];
    if (category) {
      whereConditions.push(sql`${economyTransactions.category} = ${String(category)}`);
    }
    if (direction) {
      whereConditions.push(sql`${economyTransactions.direction} = ${String(direction)}`);
    }

    const transactions = await db.query.economyTransactions.findMany({
      where: and(...whereConditions),
      orderBy: desc(economyTransactions.createdAt),
      limit: Number(limit),
      offset: Number(offset)
    });

    res.json(transactions);
  } catch (error: any) {
    console.error('Error fetching agent transactions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get performance snapshots for an agent
router.get('/snapshots/agent/:agentId', async (req, res) => {
  try {
    const agentId = parseInt(req.params.agentId);
    const { period = 'daily', limit = 30 } = req.query;

    const snapshots = await db.query.agentCreditSnapshots.findMany({
      where: and(
        eq(agentCreditSnapshots.agentId, agentId),
        sql`${agentCreditSnapshots.period} = ${String(period)}`
      ),
      orderBy: desc(agentCreditSnapshots.periodStart),
      limit: Number(limit)
    });

    res.json(snapshots);
  } catch (error: any) {
    console.error('Error fetching agent snapshots:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a campaign forecast
router.post('/campaigns', async (req, res) => {
  try {
    const { agentId, walletId, campaignName, campaignType, estimatedCreditCost, estimatedTokens, estimatedConversions, estimatedRevenue, marginFactor } = req.body;

    const wallet = await db.query.economyWallets.findFirst({
      where: eq(economyWallets.id, walletId)
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const expectedRoi = estimatedRevenue && estimatedCreditCost 
      ? (parseFloat(estimatedRevenue) - parseFloat(estimatedCreditCost)) / parseFloat(estimatedCreditCost)
      : null;

    const [campaign] = await db
      .insert(campaignForecasts)
      .values({
        agentId,
        walletId,
        campaignName,
        campaignType,
        estimatedCreditCost: String(estimatedCreditCost),
        estimatedTokens,
        estimatedConversions,
        estimatedRevenue: estimatedRevenue ? String(estimatedRevenue) : null,
        expectedRoi: expectedRoi ? String(expectedRoi) : null,
        marginFactor: marginFactor ? String(marginFactor) : '1.50',
        status: 'pending'
      })
      .returning();

    res.json(campaign);
  } catch (error: any) {
    console.error('Error creating campaign forecast:', error);
    res.status(500).json({ error: error.message });
  }
});

// List campaigns
router.get('/campaigns', async (req, res) => {
  try {
    const { agentId, status } = req.query;

    let whereConditions = [];
    if (agentId) {
      whereConditions.push(eq(campaignForecasts.agentId, Number(agentId)));
    }
    if (status) {
      whereConditions.push(sql`${campaignForecasts.status} = ${String(status)}`);
    }

    const campaigns = await db.query.campaignForecasts.findMany({
      where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
      orderBy: desc(campaignForecasts.createdAt)
    });

    res.json(campaigns);
  } catch (error: any) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ error: error.message });
  }
});

// Approve/reject a campaign
router.patch('/campaigns/:campaignId/approve', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.campaignId);
    const { approved, approvedBy, rejectionReason } = req.body;

    const campaign = await db.query.campaignForecasts.findFirst({
      where: eq(campaignForecasts.id, campaignId)
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status !== 'pending') {
      return res.status(400).json({ error: 'Campaign is not pending approval' });
    }

    const [updated] = await db
      .update(campaignForecasts)
      .set({
        status: approved ? 'approved' : 'rejected',
        approvedBy: approved ? approvedBy : null,
        approvedAt: approved ? new Date() : null,
        rejectionReason: approved ? null : rejectionReason,
        updatedAt: new Date()
      })
      .where(eq(campaignForecasts.id, campaignId))
      .returning();

    await db.insert(cfoDecisions).values({
      decisionType: 'campaign_approval',
      targetAgentId: campaign.agentId,
      targetWalletId: campaign.walletId,
      reason: approved ? `Campaign "${campaign.campaignName}" approved` : `Campaign "${campaign.campaignName}" rejected: ${rejectionReason}`,
      previousValue: { status: 'pending' },
      newValue: { status: approved ? 'approved' : 'rejected' },
      roiJustification: campaign.expectedRoi,
      isAutomatic: false,
      approvedBy,
      status: 'executed',
      executedAt: new Date()
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Error approving/rejecting campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get CFO decisions
router.get('/cfo-decisions', async (req, res) => {
  try {
    const { agentId, decisionType, limit = 50 } = req.query;

    let whereConditions = [];
    if (agentId) {
      whereConditions.push(eq(cfoDecisions.targetAgentId, Number(agentId)));
    }
    if (decisionType) {
      whereConditions.push(sql`${cfoDecisions.decisionType} = ${String(decisionType)}`);
    }

    const decisions = await db.query.cfoDecisions.findMany({
      where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
      orderBy: desc(cfoDecisions.createdAt),
      limit: Number(limit)
    });

    res.json(decisions);
  } catch (error: any) {
    console.error('Error fetching CFO decisions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Economy overview dashboard data
router.get('/overview', async (req, res) => {
  try {
    const { companyId } = req.query;

    const pool = await db.query.globalCreditPool.findFirst();

    const walletStats = await db
      .select({
        totalWallets: sql<number>`COUNT(*)`,
        totalCreditsInWallets: sql<string>`COALESCE(SUM(credit_balance::numeric), 0)::text`,
        totalLifetimeEarned: sql<string>`COALESCE(SUM(lifetime_credits_earned::numeric), 0)::text`,
        totalLifetimeSpent: sql<string>`COALESCE(SUM(lifetime_credits_spent::numeric), 0)::text`,
        activeWallets: sql<number>`COUNT(*) FILTER (WHERE status = 'active')`,
        frozenWallets: sql<number>`COUNT(*) FILTER (WHERE status = 'frozen')`
      })
      .from(economyWallets)
      .where(companyId ? eq(economyWallets.companyId, Number(companyId)) : undefined);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const topPerformers = await db
      .select({
        agentId: agents.id,
        agentName: agents.name,
        wallet: economyWallets,
        totalCredits: sql<string>`COALESCE(SUM(CASE WHEN ${economyTransactions.direction} = 'credit' THEN ${economyTransactions.amount}::numeric ELSE 0 END), 0)::text`,
        totalDebits: sql<string>`COALESCE(SUM(CASE WHEN ${economyTransactions.direction} = 'debit' THEN ${economyTransactions.amount}::numeric ELSE 0 END), 0)::text`
      })
      .from(economyWallets)
      .innerJoin(agents, eq(economyWallets.agentId, agents.id))
      .leftJoin(economyTransactions, and(
        eq(economyTransactions.walletId, economyWallets.id),
        gte(economyTransactions.createdAt, thirtyDaysAgo)
      ))
      .where(companyId ? eq(economyWallets.companyId, Number(companyId)) : undefined)
      .groupBy(agents.id, agents.name, economyWallets.id)
      .orderBy(desc(sql`SUM(CASE WHEN ${economyTransactions.direction} = 'credit' THEN ${economyTransactions.amount}::numeric ELSE -${economyTransactions.amount}::numeric END)`))
      .limit(10);

    const recentTransactions = await db
      .select({
        transaction: economyTransactions,
        agentName: agents.name
      })
      .from(economyTransactions)
      .innerJoin(agents, eq(economyTransactions.agentId, agents.id))
      .orderBy(desc(economyTransactions.createdAt))
      .limit(20);

    const pendingCampaigns = await db.query.campaignForecasts.findMany({
      where: sql`${campaignForecasts.status} = 'pending'`,
      orderBy: desc(campaignForecasts.createdAt),
      limit: 10
    });

    res.json({
      pool,
      walletStats: walletStats[0],
      topPerformers,
      recentTransactions,
      pendingCampaigns
    });
  } catch (error: any) {
    console.error('Error fetching economy overview:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initialize wallets for all agents in a company
router.post('/initialize-company/:companyId', async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);
    const { initialCredits = 1000 } = req.body;

    const companyAgents = await db.query.agents.findMany({
      where: eq(agents.companyId, companyId)
    });

    const existingWallets = await db.query.economyWallets.findMany({
      where: eq(economyWallets.companyId, companyId)
    });

    const existingAgentIds = new Set(existingWallets.map(w => w.agentId));
    const agentsNeedingWallets = companyAgents.filter(a => !existingAgentIds.has(a.id));

    const createdWallets = [];

    for (const agent of agentsNeedingWallets) {
      const [wallet] = await db
        .insert(economyWallets)
        .values({
          agentId: agent.id,
          companyId,
          creditBalance: String(initialCredits),
          lifetimeCreditsEarned: String(initialCredits),
          status: 'active'
        })
        .returning();

      await db.insert(economyTransactions).values({
        walletId: wallet.id,
        agentId: agent.id,
        direction: 'credit',
        amount: String(initialCredits),
        balanceBefore: '0.00',
        balanceAfter: String(initialCredits),
        category: 'budget_allocation',
        description: 'Initial credit allocation for company agent'
      });

      createdWallets.push({ wallet, agent });
    }

    res.json({
      message: `Initialized ${createdWallets.length} wallets`,
      totalAgents: companyAgents.length,
      existingWallets: existingWallets.length,
      newWallets: createdWallets.length,
      wallets: createdWallets
    });
  } catch (error: any) {
    console.error('Error initializing company wallets:', error);
    res.status(500).json({ error: error.message });
  }
});

// CFO Agent Analysis endpoint
router.get('/cfo/analysis', async (req, res) => {
  try {
    const analysis = await analyzeAgentPerformance();
    res.json(analysis);
  } catch (error: any) {
    console.error('Error analyzing agent performance:', error);
    res.status(500).json({ error: error.message });
  }
});

// Execute CFO recommendations
router.post('/cfo/execute-recommendations', async (req, res) => {
  try {
    const { autoApprove = false } = req.body;
    const result = await executeCFORecommendations(autoApprove);
    res.json(result);
  } catch (error: any) {
    console.error('Error executing CFO recommendations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create snapshots manually
router.post('/cfo/create-snapshots', async (req, res) => {
  try {
    const { period = 'daily' } = req.body;
    const count = await createPeriodSnapshots(period);
    res.json({ message: `Created ${count} ${period} snapshots` });
  } catch (error: any) {
    console.error('Error creating snapshots:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reset spend limits manually
router.post('/cfo/reset-limits', async (req, res) => {
  try {
    const { period = 'daily' } = req.body;
    const count = await resetSpendLimits(period);
    res.json({ message: `Reset ${period} limits for ${count} wallets` });
  } catch (error: any) {
    console.error('Error resetting spend limits:', error);
    res.status(500).json({ error: error.message });
  }
});

// Kill Switch - Freeze individual wallet
router.post('/kill-switch/freeze/:walletId', async (req, res) => {
  try {
    const { walletId } = req.params;
    const { reason, durationMinutes } = req.body;
    
    if (!reason) {
      return res.status(400).json({ error: 'Reason is required' });
    }
    
    const result = await killSwitchFreezeWallet(
      parseInt(walletId), 
      reason, 
      durationMinutes
    );
    
    if (result.success) {
      res.json({ message: `Wallet ${walletId} frozen successfully`, result });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('Error freezing wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Kill Switch - Unfreeze individual wallet
router.post('/kill-switch/unfreeze/:walletId', async (req, res) => {
  try {
    const { walletId } = req.params;
    const result = await unfreezeWallet(parseInt(walletId));
    
    if (result.success) {
      res.json({ message: `Wallet ${walletId} unfrozen successfully` });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('Error unfreezing wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Global Kill Switch - Freeze all wallets
router.post('/kill-switch/global/activate', async (req, res) => {
  try {
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({ error: 'Reason is required' });
    }
    
    const result = await globalKillSwitch(reason);
    res.json({ 
      message: `Global kill switch activated. ${result.frozenCount} wallets frozen.`,
      result 
    });
  } catch (error: any) {
    console.error('Error activating global kill switch:', error);
    res.status(500).json({ error: error.message });
  }
});

// Global Kill Switch - Release and unfreeze all
router.post('/kill-switch/global/release', async (req, res) => {
  try {
    const result = await releaseGlobalKillSwitch();
    res.json({ 
      message: `Global kill switch released. ${result.unfrozenCount} wallets unfrozen.`,
      result 
    });
  } catch (error: any) {
    console.error('Error releasing global kill switch:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
