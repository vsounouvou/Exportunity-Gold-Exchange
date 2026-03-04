import { db } from "@db";
import { agents, costTransactions, companies, economyWallets, economyTransactions } from "@db/schema";
import { eq, sql } from "drizzle-orm";
import { recordSpend, checkSpendRate, killSwitchFreezeWallet } from "./spend-guards";
import {
  evaluateAgentTokenBudget,
  recordAgentTokenUsageEvent,
  syncWalletMirrorColumnsForAgent,
} from "./agent-economy-governance";

function parseBooleanEnv(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return defaultValue;
}

export function isCreditEnforcementEnabled() {
  return parseBooleanEnv(process.env.AI_CREDIT_ENFORCEMENT, false);
}

const PRICING = {
  openai: {
    'gpt-4': {
      input: 0.03 / 1000,
      output: 0.06 / 1000
    },
    'gpt-3.5-turbo': {
      input: 0.0005 / 1000,
      output: 0.0015 / 1000
    }
  },
  claude: {
    'claude-3-5-sonnet-20241022': {
      input: 0.003 / 1000,
      output: 0.015 / 1000
    },
    'claude-sonnet-4-5': {
      input: 0.003 / 1000,
      output: 0.015 / 1000
    },
    'claude-sonnet-4-20250514': {
      input: 0.003 / 1000,
      output: 0.015 / 1000
    },
    'claude-3-opus-20240229': {
      input: 0.015 / 1000,
      output: 0.075 / 1000
    }
  }
};

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export function calculateCost(
  model: string,
  usage: TokenUsage,
  provider: 'openai' | 'claude'
): number {
  const modelPricing = (PRICING as any)[provider]?.[model] as { input: number; output: number } | undefined;
  
  if (!modelPricing) {
    console.warn(`[CostTracker] Unknown model: ${model}, using default pricing`);
    return (usage.totalTokens / 1000) * 0.01;
  }
  
  const inputCost = usage.promptTokens * modelPricing.input;
  const outputCost = usage.completionTokens * modelPricing.output;
  
  return inputCost + outputCost;
}

export async function recordCost(params: {
  agentId: number;
  companyId: number | null;
  type: 'llm_tokens' | 'api_call' | 'email' | 'calendar' | 'linkedin' | 'crm' | 'other';
  amount: number;
  tokenCount?: number;
  metadata?: {
    model?: string;
    endpoint?: string;
    operation?: string;
    provider?: string;
    details?: any;
    creditDeducted?: boolean;
    creditsSpent?: number;
  };
}): Promise<void> {
  try {
    await db.insert(costTransactions).values({
      agentId: params.agentId,
      companyId: params.companyId,
      type: params.type,
      amount: params.amount.toFixed(2),
      tokenCount: params.tokenCount || null,
      metadata: params.metadata || {},
      createdAt: new Date()
    });

    await db.update(agents)
      .set({
        budgetUsed: sql`budget_used + ${params.amount.toFixed(2)}`,
        updatedAt: new Date()
      })
      .where(eq(agents.id, params.agentId));

    if (params.companyId) {
      await db.update(companies)
        .set({
          budgetUsed: sql`budget_used + ${params.amount.toFixed(2)}`,
          updatedAt: new Date()
        })
        .where(eq(companies.id, params.companyId));
    }

    console.log(`[CostTracker] Recorded $${params.amount.toFixed(4)} cost for agent ${params.agentId}`);
  } catch (error) {
    console.error('[CostTracker] Error recording cost:', error);
    throw error;
  }
}

export async function trackLLMCost(params: {
  agentId: number;
  companyId: number | null;
  model: string;
  usage: TokenUsage;
  provider: 'openai' | 'claude';
  operation?: string;
  skipCreditDeduction?: boolean; // For cases where pre-flight check already validated
}): Promise<{ cost: number; creditDeductionResult: { success: boolean; error?: string } }> {
  const cost = calculateCost(params.model, params.usage, params.provider);

  if (!isCreditEnforcementEnabled() || params.skipCreditDeduction) {
    await recordCost({
      agentId: params.agentId,
      companyId: params.companyId,
      type: "llm_tokens",
      amount: cost,
      tokenCount: params.usage.totalTokens,
      metadata: {
        model: params.model,
        provider: params.provider,
        operation: params.operation || "completion",
        creditDeducted: false,
        creditsSpent: 0,
        details: {
          promptTokens: params.usage.promptTokens,
          completionTokens: params.usage.completionTokens,
          totalTokens: params.usage.totalTokens,
          creditEnforcementEnabled: isCreditEnforcementEnabled(),
        },
      },
    });

    await recordAgentTokenUsageEvent({
      agentId: params.agentId,
      tokensUsed: params.usage.totalTokens,
      reasoningDepth: 1,
      metadata: {
        provider: params.provider,
        model: params.model,
        operation: params.operation || "completion",
        creditEnforcementEnabled: false,
      },
    });

    return { cost, creditDeductionResult: { success: true } };
  }
  
  // First try to deduct credits from the agent's economy wallet
  const creditResult = await deductAgentCredits({
    agentId: params.agentId,
    costUsd: cost,
    tokenCount: params.usage.totalTokens,
    model: params.model,
    provider: params.provider,
    operation: params.operation || 'completion'
  });

  // If credit deduction failed, check if it's because there's no wallet
  const hasWallet = creditResult.newBalance !== 0 || creditResult.creditsDeducted !== 0 || 
                    (creditResult.error && creditResult.error !== 'No wallet - skipping credit deduction');
  
  // If there was a wallet and deduction failed, don't record the cost
  if (!creditResult.success && hasWallet) {
    console.error(`[CostTracker] Credit deduction failed for agent ${params.agentId}: ${creditResult.error}. Cost NOT recorded.`);
    return { 
      cost, 
      creditDeductionResult: { success: false, error: creditResult.error }
    };
  }

  // Record the cost in the legacy cost tracking system (only if no wallet or deduction succeeded)
  await recordCost({
    agentId: params.agentId,
    companyId: params.companyId,
    type: 'llm_tokens',
    amount: cost,
    tokenCount: params.usage.totalTokens,
    metadata: {
      model: params.model,
      provider: params.provider,
      operation: params.operation || 'completion',
      creditDeducted: creditResult.success,
      creditsSpent: creditResult.creditsDeducted,
      details: {
        promptTokens: params.usage.promptTokens,
        completionTokens: params.usage.completionTokens,
        totalTokens: params.usage.totalTokens
      }
    }
  });

  await recordAgentTokenUsageEvent({
    agentId: params.agentId,
    tokensUsed: params.usage.totalTokens,
    reasoningDepth: 1,
    metadata: {
      provider: params.provider,
      model: params.model,
      operation: params.operation || "completion",
      creditDeducted: creditResult.success,
      creditsSpent: creditResult.creditsDeducted,
    },
  });
  
  return { 
    cost, 
    creditDeductionResult: { success: creditResult.success }
  };
}

// Error class for credit-related failures
export class CreditEnforcementError extends Error {
  constructor(
    message: string,
    public readonly agentId: number,
    public readonly reason: string
  ) {
    super(message);
    this.name = 'CreditEnforcementError';
  }
}

// Credit-to-USD conversion rate (fetched from global pool or use default)
const DEFAULT_CREDIT_TO_USD_RATE = 0.001;

// Estimated cost per token by model (for pre-flight checks)
// Using average of input/output costs from PRICING table with safety margin (1.5x)
const ESTIMATED_COST_PER_TOKEN = {
  'gpt-4': ((0.03 + 0.06) / 2000) * 1.5, // ~0.0000675 per token
  'gpt-3.5-turbo': ((0.0005 + 0.0015) / 2000) * 1.5, // ~0.0000015 per token
  'claude-3-5-sonnet-20241022': ((0.003 + 0.015) / 2000) * 1.5, // ~0.0000135 per token
  'claude-3-opus-20240229': ((0.015 + 0.075) / 2000) * 1.5, // ~0.0000675 per token
  'claude-sonnet-4-5': ((0.003 + 0.015) / 2000) * 1.5 // Same as sonnet
};

// Convert USD cost to credits
export function usdToCredits(usdAmount: number, creditToUsdRate: number = DEFAULT_CREDIT_TO_USD_RATE): number {
  return usdAmount / creditToUsdRate;
}

// Pre-flight credit check - validates agent can make LLM call BEFORE it happens
export async function validateCreditEligibility(params: {
  agentId: number;
  model: string;
  estimatedTokens?: number;
}): Promise<{ eligible: boolean; reason?: string; wallet?: any }> {
  if (!isCreditEnforcementEnabled()) {
    return { eligible: true, reason: "Credit enforcement disabled" };
  }

  try {
    const wallet = await db.query.economyWallets.findFirst({
      where: eq(economyWallets.agentId, params.agentId)
    });

    if (!wallet) {
      // No wallet = no credit enforcement for this agent
      return { eligible: true, reason: 'No wallet - credit enforcement skipped' };
    }

    // Check if wallet is frozen
    if (wallet.status === 'frozen') {
      return { 
        eligible: false, 
        reason: `Wallet is frozen: ${wallet.freezeReason || 'No reason provided'}`,
        wallet 
      };
    }

    if (wallet.status === 'depleted') {
      return { 
        eligible: false, 
        reason: 'Wallet is depleted',
        wallet 
      };
    }

    // Check if wallet has frozen until date
    if (wallet.frozenUntil && new Date(wallet.frozenUntil) > new Date()) {
      return { 
        eligible: false, 
        reason: `Wallet frozen until ${wallet.frozenUntil}`,
        wallet 
      };
    }

    // Check real-time spend rate guard state
    const rateCheck = checkSpendRate(wallet.id);
    if (rateCheck.exceeds) {
      return { 
        eligible: false, 
        reason: `Rate limit exceeded: ${rateCheck.reason}`,
        wallet 
      };
    }

    // Check model access
    const allowedModels = wallet.allowedModels?.split(',').map((m: string) => m.trim()) || [];
    if (allowedModels.length > 0 && !allowedModels.includes('all') && !allowedModels.includes(params.model)) {
      return { 
        eligible: false, 
        reason: `Model ${params.model} not allowed for tier ${wallet.tier}. Allowed: ${wallet.allowedModels}`,
        wallet 
      };
    }

    // Estimate cost if tokens provided using realistic pricing with safety margin
    const estimatedTokens = params.estimatedTokens || 2000; // Default estimate
    const costPerToken = ESTIMATED_COST_PER_TOKEN[params.model as keyof typeof ESTIMATED_COST_PER_TOKEN] || 0.0001;
    const estimatedCostUsd = estimatedTokens * costPerToken;
    const estimatedCredits = usdToCredits(estimatedCostUsd);

    const currentBalance = parseFloat(wallet.creditBalance);
    if (estimatedCredits > currentBalance) {
      return { 
        eligible: false, 
        reason: `Insufficient credits: estimated need ${estimatedCredits.toFixed(2)}, have ${currentBalance.toFixed(2)}`,
        wallet 
      };
    }

    // Check daily limit
    const spentToday = parseFloat(wallet.creditsSpentToday);
    const dailyLimit = wallet.dailyCreditLimit ? parseFloat(wallet.dailyCreditLimit) : Infinity;
    if (spentToday + estimatedCredits > dailyLimit) {
      return { 
        eligible: false, 
        reason: `Daily limit would be exceeded: spent ${spentToday.toFixed(2)}, limit ${dailyLimit.toFixed(2)}`,
        wallet 
      };
    }

    // Check hourly limit
    const spentThisHour = parseFloat(wallet.creditsSpentThisHour);
    const hourlyLimit = wallet.hourlyCreditLimit ? parseFloat(wallet.hourlyCreditLimit) : Infinity;
    if (spentThisHour + estimatedCredits > hourlyLimit) {
      return { 
        eligible: false, 
        reason: `Hourly limit would be exceeded: spent ${spentThisHour.toFixed(2)}, limit ${hourlyLimit.toFixed(2)}`,
        wallet 
      };
    }

    const budgetDecision = await evaluateAgentTokenBudget({
      agentId: params.agentId,
      estimatedTokens,
      requestedReasoningDepth: 2,
    });
    if (!budgetDecision.allowed) {
      return {
        eligible: false,
        reason: budgetDecision.reason || "Token governance denied this call",
        wallet,
      };
    }

    return { eligible: true, wallet };
  } catch (error) {
    console.error('[CreditTracker] Error validating credit eligibility:', error);
    // On error, FAIL CLOSED - deny the call for safety
    return { eligible: false, reason: 'Validation error - denying for safety' };
  }
}

// Deduct credits from agent's economy wallet
export async function deductAgentCredits(params: {
  agentId: number;
  costUsd: number;
  tokenCount: number;
  model: string;
  provider: string;
  operation: string;
}): Promise<{ success: boolean; creditsDeducted: number; newBalance: number; error?: string }> {
  try {
    // Find the agent's wallet
    const wallet = await db.query.economyWallets.findFirst({
      where: eq(economyWallets.agentId, params.agentId)
    });

    if (!wallet) {
      // Agent doesn't have a wallet yet - skip credit deduction
      // (Wallet will be created on first explicit request)
      console.log(`[CreditTracker] Agent ${params.agentId} has no economy wallet - skipping credit deduction`);
      return { success: true, creditsDeducted: 0, newBalance: 0, error: 'No wallet - skipping credit deduction' };
    }

    // Check wallet status
    if (wallet.status === 'frozen') {
      console.warn(`[CreditTracker] Agent ${params.agentId} wallet is frozen - blocking operation`);
      return { 
        success: false, 
        creditsDeducted: 0, 
        newBalance: parseFloat(wallet.creditBalance),
        error: 'Wallet is frozen'
      };
    }

    // Convert USD cost to credits
    const creditsToDeduct = usdToCredits(params.costUsd);
    const currentBalance = parseFloat(wallet.creditBalance);
    
    // Check if agent has enough credits
    if (creditsToDeduct > currentBalance) {
      console.warn(`[CreditTracker] Agent ${params.agentId} insufficient credits: need ${creditsToDeduct.toFixed(2)}, have ${currentBalance.toFixed(2)}`);
      return { 
        success: false, 
        creditsDeducted: 0, 
        newBalance: currentBalance,
        error: 'Insufficient credits'
      };
    }

    // Check daily/hourly limits
    const spentToday = parseFloat(wallet.creditsSpentToday);
    const spentThisHour = parseFloat(wallet.creditsSpentThisHour);
    const dailyLimit = wallet.dailyCreditLimit ? parseFloat(wallet.dailyCreditLimit) : Infinity;
    const hourlyLimit = wallet.hourlyCreditLimit ? parseFloat(wallet.hourlyCreditLimit) : Infinity;

    if (spentToday + creditsToDeduct > dailyLimit) {
      console.warn(`[CreditTracker] Agent ${params.agentId} daily limit exceeded`);
      return { 
        success: false, 
        creditsDeducted: 0, 
        newBalance: currentBalance,
        error: 'Daily credit limit exceeded'
      };
    }

    if (spentThisHour + creditsToDeduct > hourlyLimit) {
      console.warn(`[CreditTracker] Agent ${params.agentId} hourly limit exceeded`);
      return { 
        success: false, 
        creditsDeducted: 0, 
        newBalance: currentBalance,
        error: 'Hourly credit limit exceeded'
      };
    }

    // Record spend for real-time rate limiting
    recordSpend(wallet.id, creditsToDeduct);
    
    // Check spend rate and auto-freeze if exceeding limits
    const rateCheck = checkSpendRate(wallet.id);
    if (rateCheck.exceeds) {
      console.warn(`[CreditTracker] Rate limit exceeded for wallet ${wallet.id}: ${rateCheck.reason}`);
      await killSwitchFreezeWallet(wallet.id, rateCheck.reason!, 60); // Auto-freeze for 1 hour
      return { 
        success: false, 
        creditsDeducted: 0, 
        newBalance: currentBalance,
        error: `Rate limit exceeded: ${rateCheck.reason}`
      };
    }

    // Deduct credits
    const newBalance = currentBalance - creditsToDeduct;
    const newSpentToday = spentToday + creditsToDeduct;
    const newSpentThisHour = spentThisHour + creditsToDeduct;
    const newLifetimeSpent = parseFloat(wallet.lifetimeCreditsSpent) + creditsToDeduct;

    await db.update(economyWallets)
      .set({
        creditBalance: newBalance.toFixed(2),
        creditsSpentToday: newSpentToday.toFixed(2),
        creditsSpentThisHour: newSpentThisHour.toFixed(2),
        lifetimeCreditsSpent: newLifetimeSpent.toFixed(2),
        dailySpent: newSpentToday.toFixed(2),
        lifetimeSpent: newLifetimeSpent.toFixed(2),
        dailyLimit: (wallet.dailyCreditLimit || wallet.dailyLimit || '100.00') as any,
        updatedAt: new Date()
      })
      .where(eq(economyWallets.id, wallet.id));

    // Record the transaction
    await db.insert(economyTransactions).values({
      walletId: wallet.id,
      agentId: params.agentId,
      direction: 'debit',
      amount: creditsToDeduct.toFixed(2),
      balanceBefore: currentBalance.toFixed(2),
      balanceAfter: newBalance.toFixed(2),
      category: 'llm_usage',
      tokenCount: params.tokenCount,
      modelUsed: params.model,
      costUsd: params.costUsd.toFixed(4),
      description: `${params.provider} ${params.model} - ${params.operation}`,
      metadata: {
        model: params.model,
        provider: params.provider,
        operation: params.operation
      }
    });

    await syncWalletMirrorColumnsForAgent(params.agentId);

    console.log(`[CreditTracker] Deducted ${creditsToDeduct.toFixed(4)} credits from agent ${params.agentId} (balance: ${newBalance.toFixed(2)})`);
    
    return { 
      success: true, 
      creditsDeducted: creditsToDeduct, 
      newBalance 
    };
  } catch (error) {
    console.error('[CreditTracker] Error deducting credits:', error);
    return { 
      success: false, 
      creditsDeducted: 0, 
      newBalance: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
