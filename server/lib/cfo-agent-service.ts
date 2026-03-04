import { db } from "@db";
import { 
  economyWallets, 
  economyTransactions, 
  agentCreditSnapshots,
  cfoDecisions,
  globalCreditPool,
  agents
} from "@db/schema";
import { eq, desc, and, gte, lte, sql, lt } from "drizzle-orm";

// CFO Agent Service - Monitors and manages agent economy
// Runs periodically to analyze spending, adjust budgets, and enforce policies

export interface AgentPerformanceMetrics {
  agentId: number;
  agentName: string;
  walletId: number;
  creditBalance: number;
  lifetimeSpent: number;
  lifetimeEarned: number;
  netProfit: number;
  profitPer1kTokens: number;
  conversionRate: number;
  tier: string;
  status: string;
}

export interface CFOAnalysis {
  totalAgents: number;
  activeWallets: number;
  totalCreditsInSystem: number;
  averageSpendPerAgent: number;
  topPerformers: AgentPerformanceMetrics[];
  underperformers: AgentPerformanceMetrics[];
  recommendations: CFORecommendation[];
}

export interface CFORecommendation {
  agentId: number;
  walletId: number;
  type: 'tier_upgrade' | 'tier_downgrade' | 'budget_increase' | 'budget_decrease' | 'freeze_wallet' | 'unfreeze_wallet';
  reason: string;
  currentValue: any;
  suggestedValue: any;
  priority: 'high' | 'medium' | 'low';
}

const TIER_THRESHOLDS = {
  bronze: { minProfit: 0, maxProfit: 100, allowedModels: 'gpt-3.5-turbo' },
  silver: { minProfit: 100, maxProfit: 500, allowedModels: 'gpt-3.5-turbo,gpt-4' },
  gold: { minProfit: 500, maxProfit: 2000, allowedModels: 'gpt-3.5-turbo,gpt-4,claude-3-5-sonnet-20241022' },
  platinum: { minProfit: 2000, maxProfit: 10000, allowedModels: 'gpt-3.5-turbo,gpt-4,claude-3-5-sonnet-20241022,claude-3-opus-20240229' },
  diamond: { minProfit: 10000, maxProfit: Infinity, allowedModels: 'all' }
};

const TIER_ORDER = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];

// Get the global credit pool settings
async function getGlobalPool() {
  return await db.query.globalCreditPool.findFirst();
}

// Get all agent wallet metrics
async function getAgentMetrics(): Promise<AgentPerformanceMetrics[]> {
  const results = await db
    .select({
      agentId: agents.id,
      agentName: agents.name,
      walletId: economyWallets.id,
      creditBalance: economyWallets.creditBalance,
      lifetimeSpent: economyWallets.lifetimeCreditsSpent,
      lifetimeEarned: economyWallets.lifetimeCreditsEarned,
      tier: economyWallets.tier,
      status: economyWallets.status
    })
    .from(economyWallets)
    .innerJoin(agents, eq(economyWallets.agentId, agents.id));

  return results.map(r => ({
    agentId: r.agentId,
    agentName: r.agentName,
    walletId: r.walletId,
    creditBalance: parseFloat(r.creditBalance),
    lifetimeSpent: parseFloat(r.lifetimeSpent),
    lifetimeEarned: parseFloat(r.lifetimeEarned),
    netProfit: parseFloat(r.lifetimeEarned) - parseFloat(r.lifetimeSpent),
    profitPer1kTokens: 0, // Will be calculated from snapshots
    conversionRate: 0,
    tier: r.tier,
    status: r.status
  }));
}

// Analyze agent performance and generate recommendations
export async function analyzeAgentPerformance(): Promise<CFOAnalysis> {
  const metrics = await getAgentMetrics();
  const pool = await getGlobalPool();
  
  const activeWallets = metrics.filter(m => m.status === 'active').length;
  const totalCredits = metrics.reduce((sum, m) => sum + m.creditBalance, 0);
  const totalSpent = metrics.reduce((sum, m) => sum + m.lifetimeSpent, 0);
  const averageSpend = metrics.length > 0 ? totalSpent / metrics.length : 0;

  // Sort by net profit
  const sortedByProfit = [...metrics].sort((a, b) => b.netProfit - a.netProfit);
  
  const topPerformers = sortedByProfit.slice(0, 5);
  const underperformers = sortedByProfit.filter(m => m.netProfit < 0).slice(-5);

  const recommendations: CFORecommendation[] = [];

  // Generate tier upgrade/downgrade recommendations
  for (const agent of metrics) {
    const currentTierIndex = TIER_ORDER.indexOf(agent.tier);
    const thresholds = TIER_THRESHOLDS[agent.tier as keyof typeof TIER_THRESHOLDS];
    
    if (thresholds) {
      // Check for tier upgrade
      if (agent.netProfit > thresholds.maxProfit && currentTierIndex < TIER_ORDER.length - 1) {
        const nextTier = TIER_ORDER[currentTierIndex + 1];
        recommendations.push({
          agentId: agent.agentId,
          walletId: agent.walletId,
          type: 'tier_upgrade',
          reason: `Agent ${agent.agentName} has exceeded profit threshold (${agent.netProfit.toFixed(2)} > ${thresholds.maxProfit})`,
          currentValue: { tier: agent.tier },
          suggestedValue: { tier: nextTier, allowedModels: TIER_THRESHOLDS[nextTier as keyof typeof TIER_THRESHOLDS].allowedModels },
          priority: 'medium'
        });
      }
      
      // Check for tier downgrade
      if (agent.netProfit < thresholds.minProfit && currentTierIndex > 0) {
        const prevTier = TIER_ORDER[currentTierIndex - 1];
        recommendations.push({
          agentId: agent.agentId,
          walletId: agent.walletId,
          type: 'tier_downgrade',
          reason: `Agent ${agent.agentName} is below profit threshold (${agent.netProfit.toFixed(2)} < ${thresholds.minProfit})`,
          currentValue: { tier: agent.tier },
          suggestedValue: { tier: prevTier, allowedModels: TIER_THRESHOLDS[prevTier as keyof typeof TIER_THRESHOLDS].allowedModels },
          priority: 'low'
        });
      }
    }

    // Check for budget increase for high performers
    if (agent.netProfit > 100 && agent.creditBalance < 500) {
      recommendations.push({
        agentId: agent.agentId,
        walletId: agent.walletId,
        type: 'budget_increase',
        reason: `High-performing agent ${agent.agentName} has low balance`,
        currentValue: { balance: agent.creditBalance },
        suggestedValue: { addCredits: 500 },
        priority: 'medium'
      });
    }

    // Check for freezing depleted wallets
    if (agent.creditBalance < 10 && agent.status === 'active') {
      recommendations.push({
        agentId: agent.agentId,
        walletId: agent.walletId,
        type: 'freeze_wallet',
        reason: `Agent ${agent.agentName} wallet nearly depleted (${agent.creditBalance.toFixed(2)} credits)`,
        currentValue: { status: 'active' },
        suggestedValue: { status: 'depleted' },
        priority: 'high'
      });
    }
  }

  return {
    totalAgents: metrics.length,
    activeWallets,
    totalCreditsInSystem: totalCredits,
    averageSpendPerAgent: averageSpend,
    topPerformers,
    underperformers,
    recommendations
  };
}

// Execute CFO recommendations automatically
export async function executeCFORecommendations(autoApprove: boolean = false): Promise<{ executed: number; skipped: number; errors: string[] }> {
  const analysis = await analyzeAgentPerformance();
  let executed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const rec of analysis.recommendations) {
    if (rec.priority !== 'high' && !autoApprove) {
      skipped++;
      continue;
    }

    try {
      switch (rec.type) {
        case 'tier_upgrade':
        case 'tier_downgrade':
          await db.update(economyWallets)
            .set({
              tier: rec.suggestedValue.tier,
              allowedModels: rec.suggestedValue.allowedModels,
              updatedAt: new Date()
            })
            .where(eq(economyWallets.id, rec.walletId));
          break;

        case 'budget_increase':
          const wallet = await db.query.economyWallets.findFirst({
            where: eq(economyWallets.id, rec.walletId)
          });
          if (wallet) {
            const newBalance = parseFloat(wallet.creditBalance) + rec.suggestedValue.addCredits;
            const newEarned = parseFloat(wallet.lifetimeCreditsEarned) + rec.suggestedValue.addCredits;
            
            await db.update(economyWallets)
              .set({
                creditBalance: newBalance.toFixed(2),
                lifetimeCreditsEarned: newEarned.toFixed(2),
                updatedAt: new Date()
              })
              .where(eq(economyWallets.id, rec.walletId));

            await db.insert(economyTransactions).values({
              walletId: rec.walletId,
              agentId: rec.agentId,
              direction: 'credit',
              amount: rec.suggestedValue.addCredits.toFixed(2),
              balanceBefore: wallet.creditBalance,
              balanceAfter: newBalance.toFixed(2),
              category: 'cfo_adjustment',
              description: `CFO automatic budget increase: ${rec.reason}`
            });
          }
          break;

        case 'freeze_wallet':
          await db.update(economyWallets)
            .set({
              status: 'depleted',
              freezeReason: rec.reason,
              updatedAt: new Date()
            })
            .where(eq(economyWallets.id, rec.walletId));
          break;

        case 'unfreeze_wallet':
          await db.update(economyWallets)
            .set({
              status: 'active',
              freezeReason: null,
              frozenUntil: null,
              updatedAt: new Date()
            })
            .where(eq(economyWallets.id, rec.walletId));
          break;
      }

      // Record the CFO decision
      await db.insert(cfoDecisions).values({
        decisionType: rec.type,
        targetAgentId: rec.agentId,
        targetWalletId: rec.walletId,
        reason: rec.reason,
        previousValue: rec.currentValue,
        newValue: rec.suggestedValue,
        isAutomatic: true,
        status: 'executed',
        executedAt: new Date()
      });

      executed++;
    } catch (error) {
      errors.push(`Failed to execute ${rec.type} for agent ${rec.agentId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log(`[CFO Agent] Executed ${executed} recommendations, skipped ${skipped}, ${errors.length} errors`);
  return { executed, skipped, errors };
}

// Create periodic snapshots for analytics
export async function createPeriodSnapshots(period: 'hourly' | 'daily' | 'weekly' | 'monthly'): Promise<number> {
  const wallets = await db.query.economyWallets.findMany();
  let created = 0;

  const now = new Date();
  let periodStart: Date;
  let periodEnd: Date;

  switch (period) {
    case 'hourly':
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);
      periodEnd = new Date(periodStart.getTime() + 60 * 60 * 1000);
      break;
    case 'daily':
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
      break;
    case 'weekly':
      const dayOfWeek = now.getDay();
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 0, 0, 0);
      periodEnd = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    case 'monthly':
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
      break;
  }

  for (const wallet of wallets) {
    try {
      // Calculate period metrics
      const transactions = await db.query.economyTransactions.findMany({
        where: and(
          eq(economyTransactions.walletId, wallet.id),
          gte(economyTransactions.createdAt, periodStart),
          lt(economyTransactions.createdAt, periodEnd)
        )
      });

      const credits = transactions.filter(t => t.direction === 'credit');
      const debits = transactions.filter(t => t.direction === 'debit');

      const creditsEarned = credits.reduce((sum, t) => sum + parseFloat(t.amount), 0);
      const creditsSpent = debits.reduce((sum, t) => sum + parseFloat(t.amount), 0);
      const tokensUsed = debits.reduce((sum, t) => sum + (t.tokenCount || 0), 0);

      const netProfit = creditsEarned - creditsSpent;
      const profitPer1kTokens = tokensUsed > 0 ? (netProfit / tokensUsed) * 1000 : 0;

      await db.insert(agentCreditSnapshots).values({
        agentId: wallet.agentId,
        walletId: wallet.id,
        period,
        periodStart,
        periodEnd,
        creditsEarned: creditsEarned.toFixed(2),
        creditsSpent: creditsSpent.toFixed(2),
        netProfit: netProfit.toFixed(2),
        tokensUsed,
        profitPer1kTokens: profitPer1kTokens.toFixed(4),
        tasksCompleted: 0,
        conversions: 0,
        conversionRate: '0.00',
        averageModelTier: wallet.tier
      });

      created++;
    } catch (error) {
      console.error(`[CFO Agent] Error creating snapshot for wallet ${wallet.id}:`, error);
    }
  }

  console.log(`[CFO Agent] Created ${created} ${period} snapshots`);
  return created;
}

// Reset daily/hourly spend limits
export async function resetSpendLimits(period: 'hourly' | 'daily'): Promise<number> {
  const now = new Date();
  let updated = 0;

  if (period === 'hourly') {
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const result = await db.update(economyWallets)
      .set({
        creditsSpentThisHour: '0.00',
        lastHourReset: now
      })
      .where(lt(economyWallets.lastHourReset, oneHourAgo));
    updated = result.rowCount || 0;
  } else {
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const result = await db.update(economyWallets)
      .set({
        creditsSpentToday: '0.00',
        lastDayReset: now
      })
      .where(lt(economyWallets.lastDayReset, oneDayAgo));
    updated = result.rowCount || 0;
  }

  if (updated > 0) {
    console.log(`[CFO Agent] Reset ${period} spend limits for ${updated} wallets`);
  }
  return updated;
}

// Check and enforce global throttle
export async function checkGlobalThrottle(): Promise<boolean> {
  const pool = await getGlobalPool();
  if (!pool) return false;

  const spentToday = parseFloat(pool.spentToday);
  const dailyLimit = parseFloat(pool.dailySpendLimit);

  if (spentToday >= dailyLimit && !pool.emergencyThrottleActive) {
    await db.update(globalCreditPool)
      .set({
        emergencyThrottleActive: true,
        throttleReason: `Daily spend limit reached (${spentToday.toFixed(2)} / ${dailyLimit.toFixed(2)})`,
        throttledAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(globalCreditPool.id, 1));

    console.log('[CFO Agent] EMERGENCY THROTTLE ACTIVATED - Daily spend limit reached');
    return true;
  }

  return pool.emergencyThrottleActive;
}

// Initialize CFO Agent background tasks
let cfoMonitorIntervalId: ReturnType<typeof setInterval> | null = null;
let hourlyTimeoutId: ReturnType<typeof setTimeout> | null = null;
let dailyTimeoutId: ReturnType<typeof setTimeout> | null = null;
let hourlyIntervalId: ReturnType<typeof setInterval> | null = null;
let dailyIntervalId: ReturnType<typeof setInterval> | null = null;
let stopTimeoutId: ReturnType<typeof setTimeout> | null = null;

export function getCFOAgentStatus() {
  return {
    running: !!cfoMonitorIntervalId || !!hourlyIntervalId || !!dailyIntervalId || !!hourlyTimeoutId || !!dailyTimeoutId,
    monitorIntervalRunning: !!cfoMonitorIntervalId,
  };
}

export function initializeCFOAgent(options?: { durationMs?: number }) {
  if (getCFOAgentStatus().running) return;
  console.log('[CFO Agent] Initializing CFO Agent monitoring service');

  // Run hourly tasks (reset hourly limits, create hourly snapshots)
  const hourlyTask = async () => {
    try {
      await resetSpendLimits('hourly');
    } catch (error) {
      console.error('[CFO Agent] Error in hourly task:', error);
    }
  };

  // Run daily tasks (reset daily limits, analyze performance, create snapshots)
  const dailyTask = async () => {
    try {
      await resetSpendLimits('daily');
      await createPeriodSnapshots('daily');
      await executeCFORecommendations(true); // Auto-approve high priority recommendations
    } catch (error) {
      console.error('[CFO Agent] Error in daily task:', error);
    }
  };

  // Run CFO analysis every 5 minutes
  cfoMonitorIntervalId = setInterval(async () => {
    try {
      await checkGlobalThrottle();
    } catch (error) {
      console.error('[CFO Agent] Error in monitoring task:', error);
    }
  }, 5 * 60 * 1000);

  // Schedule hourly task
  const scheduleHourly = () => {
    const now = new Date();
    const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0);
    const delay = nextHour.getTime() - now.getTime();

    hourlyTimeoutId = setTimeout(() => {
      hourlyTask();
      hourlyIntervalId = setInterval(hourlyTask, 60 * 60 * 1000);
    }, delay);
  };

  // Schedule daily task
  const scheduleDaily = () => {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    const delay = tomorrow.getTime() - now.getTime();

    dailyTimeoutId = setTimeout(() => {
      dailyTask();
      dailyIntervalId = setInterval(dailyTask, 24 * 60 * 60 * 1000);
    }, delay);
  };

  scheduleHourly();
  scheduleDaily();

  console.log('[CFO Agent] CFO Agent monitoring service started');

  if (options?.durationMs) {
    stopTimeoutId = setTimeout(() => stopCFOAgent(), options.durationMs);
  }
}

export function stopCFOAgent() {
  if (cfoMonitorIntervalId) {
    clearInterval(cfoMonitorIntervalId);
    cfoMonitorIntervalId = null;
  }
  if (hourlyTimeoutId) {
    clearTimeout(hourlyTimeoutId);
    hourlyTimeoutId = null;
  }
  if (dailyTimeoutId) {
    clearTimeout(dailyTimeoutId);
    dailyTimeoutId = null;
  }
  if (hourlyIntervalId) {
    clearInterval(hourlyIntervalId);
    hourlyIntervalId = null;
  }
  if (dailyIntervalId) {
    clearInterval(dailyIntervalId);
    dailyIntervalId = null;
  }
  if (stopTimeoutId) {
    clearTimeout(stopTimeoutId);
    stopTimeoutId = null;
  }
  console.log('[CFO Agent] CFO Agent monitoring service stopped');
}
