import { db } from "@db";
import { economyWallets, globalCreditPool, cfoDecisions } from "@db/schema";
import { eq } from "drizzle-orm";

// Real-time spend guard configuration
export interface SpendGuardConfig {
  maxSpendPerMinute: number;
  maxSpendPerHour: number;
  maxSpendPerDay: number;
  alertThresholdPercent: number;
  autoFreezeOnExceed: boolean;
}

const DEFAULT_GUARD_CONFIG: SpendGuardConfig = {
  maxSpendPerMinute: 10,
  maxSpendPerHour: 50,
  maxSpendPerDay: 200,
  alertThresholdPercent: 80,
  autoFreezeOnExceed: true
};

// In-memory tracking for rapid spend detection
const recentSpends: Map<number, { amount: number; timestamp: number }[]> = new Map();

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  
  for (const [walletId, spends] of recentSpends.entries()) {
    const filtered = spends.filter(s => s.timestamp > oneHourAgo);
    if (filtered.length === 0) {
      recentSpends.delete(walletId);
    } else {
      recentSpends.set(walletId, filtered);
    }
  }
}, 60000); // Clean up every minute

// Record a spend for real-time tracking
export function recordSpend(walletId: number, amount: number) {
  const existing = recentSpends.get(walletId) || [];
  existing.push({ amount, timestamp: Date.now() });
  recentSpends.set(walletId, existing);
}

// Check if wallet is exceeding rate limits
export function checkSpendRate(walletId: number, config: SpendGuardConfig = DEFAULT_GUARD_CONFIG): {
  exceeds: boolean;
  minuteSpend: number;
  hourSpend: number;
  reason?: string;
} {
  const spends = recentSpends.get(walletId) || [];
  const now = Date.now();
  
  const oneMinuteAgo = now - 60 * 1000;
  const oneHourAgo = now - 60 * 60 * 1000;
  
  const minuteSpend = spends
    .filter(s => s.timestamp > oneMinuteAgo)
    .reduce((sum, s) => sum + s.amount, 0);
    
  const hourSpend = spends
    .filter(s => s.timestamp > oneHourAgo)
    .reduce((sum, s) => sum + s.amount, 0);
  
  if (minuteSpend > config.maxSpendPerMinute) {
    return {
      exceeds: true,
      minuteSpend,
      hourSpend,
      reason: `Minute spend limit exceeded (${minuteSpend.toFixed(2)} > ${config.maxSpendPerMinute})`
    };
  }
  
  if (hourSpend > config.maxSpendPerHour) {
    return {
      exceeds: true,
      minuteSpend,
      hourSpend,
      reason: `Hourly spend limit exceeded (${hourSpend.toFixed(2)} > ${config.maxSpendPerHour})`
    };
  }
  
  return { exceeds: false, minuteSpend, hourSpend };
}

// Kill Switch - Immediately freeze a wallet
export async function killSwitchFreezeWallet(
  walletId: number, 
  reason: string,
  duration?: number // Duration in minutes (null = indefinite)
): Promise<{ success: boolean; error?: string }> {
  try {
    const frozenUntil = duration ? new Date(Date.now() + duration * 60 * 1000) : null;
    
    await db.update(economyWallets)
      .set({
        status: 'frozen',
        frozenUntil,
        freezeReason: `KILL SWITCH: ${reason}`,
        updatedAt: new Date()
      })
      .where(eq(economyWallets.id, walletId));

    // Record the decision
    const wallet = await db.query.economyWallets.findFirst({
      where: eq(economyWallets.id, walletId)
    });

    if (wallet) {
      await db.insert(cfoDecisions).values({
        decisionType: 'freeze_wallet',
        targetAgentId: wallet.agentId,
        targetWalletId: walletId,
        reason: `KILL SWITCH: ${reason}`,
        previousValue: { status: 'active' },
        newValue: { status: 'frozen', frozenUntil },
        isAutomatic: true,
        status: 'executed',
        executedAt: new Date()
      });
    }

    console.log(`[SpendGuard] KILL SWITCH activated for wallet ${walletId}: ${reason}`);
    return { success: true };
  } catch (error) {
    console.error('[SpendGuard] Kill switch error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Kill Switch - Unfreeze a wallet
export async function unfreezeWallet(walletId: number): Promise<{ success: boolean; error?: string }> {
  try {
    await db.update(economyWallets)
      .set({
        status: 'active',
        frozenUntil: null,
        freezeReason: null,
        updatedAt: new Date()
      })
      .where(eq(economyWallets.id, walletId));

    console.log(`[SpendGuard] Wallet ${walletId} unfrozen`);
    return { success: true };
  } catch (error) {
    console.error('[SpendGuard] Unfreeze error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Global Kill Switch - Freeze all wallets in the system
export async function globalKillSwitch(reason: string): Promise<{ success: boolean; frozenCount: number }> {
  try {
    const result = await db.update(economyWallets)
      .set({
        status: 'frozen',
        freezeReason: `GLOBAL KILL SWITCH: ${reason}`,
        updatedAt: new Date()
      })
      .where(eq(economyWallets.status, 'active'));

    // Activate emergency throttle
    await db.update(globalCreditPool)
      .set({
        emergencyThrottleActive: true,
        throttleReason: `GLOBAL KILL SWITCH: ${reason}`,
        throttledAt: new Date(),
        updatedAt: new Date()
      });

    const frozenCount = result.rowCount || 0;
    console.log(`[SpendGuard] GLOBAL KILL SWITCH activated: ${frozenCount} wallets frozen. Reason: ${reason}`);
    
    return { success: true, frozenCount };
  } catch (error) {
    console.error('[SpendGuard] Global kill switch error:', error);
    return { success: false, frozenCount: 0 };
  }
}

// Release global kill switch
export async function releaseGlobalKillSwitch(): Promise<{ success: boolean; unfrozenCount: number }> {
  try {
    const result = await db.update(economyWallets)
      .set({
        status: 'active',
        freezeReason: null,
        updatedAt: new Date()
      })
      .where(eq(economyWallets.status, 'frozen'));

    await db.update(globalCreditPool)
      .set({
        emergencyThrottleActive: false,
        throttleReason: null,
        throttledAt: null,
        updatedAt: new Date()
      });

    const unfrozenCount = result.rowCount || 0;
    console.log(`[SpendGuard] Global kill switch released: ${unfrozenCount} wallets unfrozen`);
    
    return { success: true, unfrozenCount };
  } catch (error) {
    console.error('[SpendGuard] Release kill switch error:', error);
    return { success: false, unfrozenCount: 0 };
  }
}

// Check for unusual spending patterns
export function detectAnomalousSpending(
  walletId: number,
  currentSpend: number,
  averageSpend: number
): { isAnomalous: boolean; multiplier: number; severity: 'low' | 'medium' | 'high' } {
  if (averageSpend === 0) {
    return { isAnomalous: false, multiplier: 1, severity: 'low' };
  }
  
  const multiplier = currentSpend / averageSpend;
  
  if (multiplier > 10) {
    return { isAnomalous: true, multiplier, severity: 'high' };
  } else if (multiplier > 5) {
    return { isAnomalous: true, multiplier, severity: 'medium' };
  } else if (multiplier > 3) {
    return { isAnomalous: true, multiplier, severity: 'low' };
  }
  
  return { isAnomalous: false, multiplier, severity: 'low' };
}

// Spend guard middleware for credit deduction
export async function spendGuardCheck(
  walletId: number, 
  agentId: number,
  amount: number
): Promise<{ allowed: boolean; reason?: string }> {
  // Record the spend
  recordSpend(walletId, amount);
  
  // Check spend rate
  const rateCheck = checkSpendRate(walletId);
  if (rateCheck.exceeds) {
    console.warn(`[SpendGuard] Rate limit exceeded for wallet ${walletId}: ${rateCheck.reason}`);
    
    // Auto-freeze if configured
    await killSwitchFreezeWallet(walletId, rateCheck.reason!, 60); // Freeze for 1 hour
    
    return { 
      allowed: false, 
      reason: rateCheck.reason 
    };
  }
  
  // Check global throttle
  const pool = await db.query.globalCreditPool.findFirst();
  if (pool?.emergencyThrottleActive) {
    return { 
      allowed: false, 
      reason: `Global throttle active: ${pool.throttleReason || 'Emergency shutdown'}` 
    };
  }
  
  return { allowed: true };
}
