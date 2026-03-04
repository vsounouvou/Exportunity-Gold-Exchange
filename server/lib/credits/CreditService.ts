import { db } from "@db";
import {
  userCredits,
  creditTransactions,
  cloneAgents
} from "@db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export class CreditService {
  /**
   * Get or create user credit account
   */
  static async getUserCredits(userId: number) {
    let credits = await db.query.userCredits.findFirst({
      where: eq(userCredits.userId, userId)
    });

    if (!credits) {
      // Create new credit account with 100 free credits to start
      const [newCredit] = await db.insert(userCredits).values({
        userId,
        balance: "100.00",
        dailyCost: "0.00",
        forecastDays: null,
        lowBalanceThreshold: "50.00"
      }).returning();
      
      // Record the initial bonus
      await db.insert(creditTransactions).values({
        userId,
        type: "bonus",
        amount: "100.00",
        balanceBefore: "0.00",
        balanceAfter: "100.00",
        description: "Welcome bonus - 100 free credits"
      });

      credits = newCredit;
    }

    return credits;
  }

  /**
   * Calculate daily cost based on active agents
   */
  static async calculateDailyCost(userId: number): Promise<number> {
    const activeAgents = await db.query.cloneAgents.findMany({
      where: and(
        eq(cloneAgents.userId, userId),
        eq(cloneAgents.status, "active")
      ),
      columns: {
        dailyCost: true
      }
    });

    const totalDailyCost = activeAgents.reduce((sum, agent) => {
      return sum + parseFloat(agent.dailyCost || "0");
    }, 0);

    return totalDailyCost;
  }

  /**
   * Update user's daily cost and forecast
   */
  static async updateDailyCostAndForecast(userId: number) {
    const dailyCost = await this.calculateDailyCost(userId);
    const credits = await this.getUserCredits(userId);
    const balance = parseFloat(credits.balance || "0");

    let forecastDays: number | null = null;
    if (dailyCost > 0) {
      forecastDays = Math.floor(balance / dailyCost);
    }

    // Always update forecastDays, even if null (when dailyCost is 0)
    await db.update(userCredits)
      .set({
        dailyCost: dailyCost.toFixed(2),
        forecastDays: forecastDays,  // Explicitly set to null when dailyCost is 0
        updatedAt: new Date()
      })
      .where(eq(userCredits.userId, userId));

    return {
      dailyCost,
      forecastDays,
      balance
    };
  }

  /**
   * Add credits to user account
   */
  static async addCredits(
    userId: number,
    amount: number,
    description: string,
    metadata?: Record<string, any>
  ) {
    const credits = await this.getUserCredits(userId);
    const balanceBefore = parseFloat(credits.balance || "0");
    const balanceAfter = balanceBefore + amount;

    // Update balance
    await db.update(userCredits)
      .set({
        balance: balanceAfter.toFixed(2),
        lowBalanceAlertSent: false, // Reset alert flag
        updatedAt: new Date()
      })
      .where(eq(userCredits.userId, userId));

    // Record transaction
    const [transaction] = await db.insert(creditTransactions).values({
      userId,
      type: "purchase",
      amount: amount.toFixed(2),
      balanceBefore: balanceBefore.toFixed(2),
      balanceAfter: balanceAfter.toFixed(2),
      description,
      metadata: metadata || {}
    }).returning();

    // Update forecast
    await this.updateDailyCostAndForecast(userId);

    return {
      transaction,
      newBalance: balanceAfter,
      forecastDays: await this.getForecastDays(userId)
    };
  }

  /**
   * Spend credits (for agent activation, upgrades, etc.)
   */
  static async spendCredits(
    userId: number,
    amount: number,
    description: string,
    relatedAgentId?: number,
    metadata?: Record<string, any>
  ) {
    const credits = await this.getUserCredits(userId);
    const balanceBefore = parseFloat(credits.balance || "0");

    if (balanceBefore < amount) {
      throw new Error("Insufficient credits");
    }

    const balanceAfter = balanceBefore - amount;

    // Update balance
    await db.update(userCredits)
      .set({
        balance: balanceAfter.toFixed(2),
        updatedAt: new Date()
      })
      .where(eq(userCredits.userId, userId));

    // Record transaction
    const [transaction] = await db.insert(creditTransactions).values({
      userId,
      type: "spent",
      amount: amount.toFixed(2),
      balanceBefore: balanceBefore.toFixed(2),
      balanceAfter: balanceAfter.toFixed(2),
      description,
      relatedAgentId: relatedAgentId || null,
      metadata: metadata || {}
    }).returning();

    // Update forecast
    await this.updateDailyCostAndForecast(userId);

    // Check low balance alert
    await this.checkLowBalance(userId);

    return {
      transaction,
      newBalance: balanceAfter,
      forecastDays: await this.getForecastDays(userId)
    };
  }

  /**
   * Get transaction history
   */
  static async getTransactions(
    userId: number,
    limit: number = 50,
    offset: number = 0
  ) {
    const transactions = await db.query.creditTransactions.findMany({
      where: eq(creditTransactions.userId, userId),
      orderBy: [desc(creditTransactions.createdAt)],
      limit,
      offset,
      with: {
        agent: {
          columns: {
            id: true,
            name: true
          }
        }
      }
    });

    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, userId));

    return {
      transactions,
      total: Number(total[0]?.count || 0),
      limit,
      offset
    };
  }

  /**
   * Get forecast days
   */
  static async getForecastDays(userId: number): Promise<number | null> {
    const credits = await this.getUserCredits(userId);
    const dailyCost = parseFloat(credits.dailyCost || "0");
    const balance = parseFloat(credits.balance || "0");

    if (dailyCost === 0) {
      return null; // Infinite if no active agents
    }

    return Math.floor(balance / dailyCost);
  }

  /**
   * Check if user has low balance and needs alert
   */
  static async checkLowBalance(userId: number) {
    const credits = await this.getUserCredits(userId);
    const balance = parseFloat(credits.balance || "0");
    const threshold = parseFloat(credits.lowBalanceThreshold || "50");

    if (balance < threshold && !credits.lowBalanceAlertSent) {
      // Set alert flag
      await db.update(userCredits)
        .set({
          lowBalanceAlertSent: true,
          updatedAt: new Date()
        })
        .where(eq(userCredits.userId, userId));

      return {
        shouldAlert: true,
        balance,
        threshold,
        forecastDays: credits.forecastDays
      };
    }

    return {
      shouldAlert: false,
      balance,
      threshold
    };
  }

  /**
   * Get credit summary (balance, daily cost, forecast, active agents)
   */
  static async getCreditSummary(userId: number) {
    const credits = await this.getUserCredits(userId);
    const activeAgents = await db.query.cloneAgents.findMany({
      where: and(
        eq(cloneAgents.userId, userId),
        eq(cloneAgents.status, "active")
      ),
      with: {
        agentType: {
          columns: {
            name: true,
            icon: true,
            color: true
          }
        },
        tier: {
          columns: {
            displayName: true
          }
        }
      }
    });

    const balance = parseFloat(credits.balance || "0");
    const dailyCost = parseFloat(credits.dailyCost || "0");
    const weeklyCost = dailyCost * 7;
    const monthlyCost = dailyCost * 30;

    return {
      balance,
      dailyCost,
      weeklyCost,
      monthlyCost,
      forecastDays: credits.forecastDays,
      lowBalanceThreshold: parseFloat(credits.lowBalanceThreshold || "50"),
      activeAgentsCount: activeAgents.length,
      activeAgents: activeAgents.map(agent => ({
        id: agent.id,
        name: agent.name,
        type: agent.agentType?.name,
        tier: agent.tier?.displayName,
        dailyCost: parseFloat(agent.dailyCost || "0"),
        icon: agent.agentType?.icon,
        color: agent.agentType?.color
      }))
    };
  }
}
