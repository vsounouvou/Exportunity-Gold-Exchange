import { pgTable, serial, integer, text, decimal, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { agents, companies, tenants } from '../schema';

export const economyWallets = pgTable('economy_wallets', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').references(() => agents.id, { onDelete: 'cascade' }).notNull().unique(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  
  creditBalance: decimal('credit_balance', { precision: 15, scale: 2 }).notNull().default('0.00'),
  lifetimeCreditsEarned: decimal('lifetime_credits_earned', { precision: 20, scale: 2 }).notNull().default('0.00'),
  lifetimeCreditsSpent: decimal('lifetime_credits_spent', { precision: 20, scale: 2 }).notNull().default('0.00'),
  
  tier: text('tier').notNull().default('bronze'),
  tierProgress: decimal('tier_progress', { precision: 5, scale: 2 }).default('0.00'),
  
  status: text('status', { enum: ['active', 'frozen', 'throttled', 'depleted'] }).notNull().default('active'),
  allowedModels: text('allowed_models').notNull().default('gpt-3.5-turbo'),
  toolAccess: jsonb('tool_access').$type<string[]>().default([]),
  
  dailyCreditLimit: decimal('daily_credit_limit', { precision: 10, scale: 2 }).default('100.00'),
  hourlyCreditLimit: decimal('hourly_credit_limit', { precision: 10, scale: 2 }).default('20.00'),
  creditsSpentToday: decimal('credits_spent_today', { precision: 10, scale: 2 }).notNull().default('0.00'),
  dailySpent: decimal('daily_spent', { precision: 15, scale: 2 }).notNull().default('0.00'),
  lastDayReset: timestamp('last_day_reset').defaultNow(),
  creditsSpentThisHour: decimal('credits_spent_this_hour', { precision: 10, scale: 2 }).notNull().default('0.00'),
  lifetimeSpent: decimal('lifetime_spent', { precision: 20, scale: 2 }).notNull().default('0.00'),
  dailyLimit: decimal('daily_limit', { precision: 15, scale: 2 }).notNull().default('100.00'),
  tierLimit: decimal('tier_limit', { precision: 15, scale: 2 }).notNull().default('100000.00'),
  autoRefill: boolean('auto_refill').notNull().default(false),
  lastHourReset: timestamp('last_hour_reset').defaultNow(),
  
  frozenUntil: timestamp('frozen_until'),
  freezeReason: text('freeze_reason'),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => ({
  agentIdIdx: index('economy_wallets_agent_id_idx').on(table.agentId),
  statusIdx: index('economy_wallets_status_idx').on(table.status),
}));

export const economyTransactions = pgTable('economy_transactions', {
  id: serial('id').primaryKey(),
  walletId: integer('wallet_id').references(() => economyWallets.id, { onDelete: 'cascade' }).notNull(),
  agentId: integer('agent_id').references(() => agents.id, { onDelete: 'cascade' }).notNull(),
  
  direction: text('direction', { enum: ['credit', 'debit'] }).notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  balanceBefore: decimal('balance_before', { precision: 15, scale: 2 }).notNull(),
  balanceAfter: decimal('balance_after', { precision: 15, scale: 2 }).notNull(),
  
  category: text('category', { enum: [
    'llm_usage', 'tool_usage', 'api_call',
    'referral_commission', 'performance_bonus', 'task_reward',
    'manual_adjustment', 'cfo_adjustment', 'budget_allocation',
    'model_upgrade', 'penalty'
  ] }).notNull(),
  
  tokenCount: integer('token_count'),
  modelUsed: text('model_used'),
  costUsd: decimal('cost_usd', { precision: 10, scale: 4 }),
  
  referenceType: text('reference_type'),
  referenceId: integer('reference_id'),
  
  description: text('description'),
  metadata: jsonb('metadata').$type<{
    model?: string;
    provider?: string;
    operation?: string;
    campaignId?: number;
    contractId?: number;
    approvedBy?: string;
    details?: any;
  }>().default({}),
  
  createdAt: timestamp('created_at').defaultNow()
}, (table) => ({
  walletIdIdx: index('credit_transactions_wallet_id_idx').on(table.walletId),
  agentIdIdx: index('credit_transactions_agent_id_idx').on(table.agentId),
  createdAtIdx: index('credit_transactions_created_at_idx').on(table.createdAt),
  categoryIdx: index('credit_transactions_category_idx').on(table.category),
}));

export const agentCreditSnapshots = pgTable('agent_credit_snapshots', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').references(() => agents.id, { onDelete: 'cascade' }).notNull(),
  walletId: integer('wallet_id').references(() => economyWallets.id, { onDelete: 'cascade' }).notNull(),
  
  period: text('period', { enum: ['hourly', 'daily', 'weekly', 'monthly'] }).notNull(),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  
  creditsEarned: decimal('credits_earned', { precision: 15, scale: 2 }).notNull().default('0.00'),
  creditsSpent: decimal('credits_spent', { precision: 15, scale: 2 }).notNull().default('0.00'),
  netProfit: decimal('net_profit', { precision: 15, scale: 2 }).notNull().default('0.00'),
  
  tokensUsed: integer('tokens_used').notNull().default(0),
  profitPer1kTokens: decimal('profit_per_1k_tokens', { precision: 10, scale: 4 }).default('0.00'),
  
  tasksCompleted: integer('tasks_completed').notNull().default(0),
  conversions: integer('conversions').notNull().default(0),
  conversionRate: decimal('conversion_rate', { precision: 5, scale: 2 }).default('0.00'),
  
  averageModelTier: text('average_model_tier'),
  successScore: decimal('success_score', { precision: 5, scale: 2 }).default('0.00'),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow()
}, (table) => ({
  agentIdIdx: index('agent_credit_snapshots_agent_id_idx').on(table.agentId),
  periodIdx: index('agent_credit_snapshots_period_idx').on(table.period),
  periodStartIdx: index('agent_credit_snapshots_period_start_idx').on(table.periodStart),
}));

export const campaignForecasts = pgTable('campaign_forecasts', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').references(() => agents.id, { onDelete: 'cascade' }).notNull(),
  walletId: integer('wallet_id').references(() => economyWallets.id, { onDelete: 'cascade' }).notNull(),
  
  campaignName: text('campaign_name').notNull(),
  campaignType: text('campaign_type', { enum: ['outreach', 'sales', 'support', 'research', 'other'] }).notNull(),
  
  estimatedCreditCost: decimal('estimated_credit_cost', { precision: 10, scale: 2 }).notNull(),
  estimatedTokens: integer('estimated_tokens'),
  estimatedConversions: integer('estimated_conversions'),
  estimatedRevenue: decimal('estimated_revenue', { precision: 15, scale: 2 }),
  expectedRoi: decimal('expected_roi', { precision: 10, scale: 4 }),
  marginFactor: decimal('margin_factor', { precision: 5, scale: 2 }).default('1.50'),
  
  status: text('status', { enum: ['pending', 'approved', 'rejected', 'running', 'completed', 'cancelled'] }).notNull().default('pending'),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at'),
  rejectionReason: text('rejection_reason'),
  
  actualCreditCost: decimal('actual_credit_cost', { precision: 10, scale: 2 }),
  actualConversions: integer('actual_conversions'),
  actualRevenue: decimal('actual_revenue', { precision: 15, scale: 2 }),
  actualRoi: decimal('actual_roi', { precision: 10, scale: 4 }),
  
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => ({
  agentIdIdx: index('campaign_forecasts_agent_id_idx').on(table.agentId),
  statusIdx: index('campaign_forecasts_status_idx').on(table.status),
}));

export const cfoDecisions = pgTable('cfo_decisions', {
  id: serial('id').primaryKey(),
  
  decisionType: text('decision_type', { enum: [
    'budget_increase', 'budget_decrease', 'model_upgrade', 'model_downgrade',
    'tool_grant', 'tool_revoke', 'freeze_wallet', 'unfreeze_wallet',
    'tier_upgrade', 'tier_downgrade', 'emergency_throttle', 'campaign_approval'
  ] }).notNull(),
  
  targetAgentId: integer('target_agent_id').references(() => agents.id, { onDelete: 'cascade' }),
  targetWalletId: integer('target_wallet_id').references(() => economyWallets.id, { onDelete: 'cascade' }),
  
  reason: text('reason').notNull(),
  previousValue: jsonb('previous_value'),
  newValue: jsonb('new_value'),
  
  roiJustification: decimal('roi_justification', { precision: 10, scale: 4 }),
  performanceMetrics: jsonb('performance_metrics').$type<{
    netProfit?: number;
    profitPer1kTokens?: number;
    conversionRate?: number;
    successScore?: number;
  }>(),
  
  isAutomatic: boolean('is_automatic').notNull().default(true),
  approvedBy: text('approved_by'),
  
  status: text('status', { enum: ['pending', 'approved', 'rejected', 'executed'] }).notNull().default('executed'),
  executedAt: timestamp('executed_at'),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow()
}, (table) => ({
  targetAgentIdIdx: index('cfo_decisions_target_agent_id_idx').on(table.targetAgentId),
  decisionTypeIdx: index('cfo_decisions_decision_type_idx').on(table.decisionType),
  createdAtIdx: index('cfo_decisions_created_at_idx').on(table.createdAt),
}));

export const globalCreditPool = pgTable('global_credit_pool', {
  id: serial('id').primaryKey(),
  
  totalCreditsMinted: decimal('total_credits_minted', { precision: 20, scale: 2 }).notNull().default('0.00'),
  creditsInCirculation: decimal('credits_in_circulation', { precision: 20, scale: 2 }).notNull().default('0.00'),
  reserveForCoreOps: decimal('reserve_for_core_ops', { precision: 20, scale: 2 }).notNull().default('0.00'),
  reserveForExperiments: decimal('reserve_for_experiments', { precision: 20, scale: 2 }).notNull().default('0.00'),
  reserveForRewards: decimal('reserve_for_rewards', { precision: 20, scale: 2 }).notNull().default('0.00'),
  
  creditToUsdRate: decimal('credit_to_usd_rate', { precision: 10, scale: 6 }).notNull().default('0.001'),
  monthlyBudgetUsd: decimal('monthly_budget_usd', { precision: 15, scale: 2 }).notNull().default('1000.00'),
  
  dailySpendLimit: decimal('daily_spend_limit', { precision: 15, scale: 2 }).notNull().default('100.00'),
  spentToday: decimal('spent_today', { precision: 15, scale: 2 }).notNull().default('0.00'),
  lastDayReset: timestamp('last_day_reset').defaultNow(),
  
  emergencyThrottleActive: boolean('emergency_throttle_active').notNull().default(false),
  throttleReason: text('throttle_reason'),
  throttledAt: timestamp('throttled_at'),
  
  metadata: jsonb('metadata').default({}),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Unified token ledger for the agent-economy command center.
export const agentTokenUsage = pgTable('agent_token_usage', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').references(() => agents.id, { onDelete: 'cascade' }).notNull(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  taskId: integer('task_id'),
  tokensUsed: integer('tokens_used').notNull().default(0),
  reasoningDepth: integer('reasoning_depth').notNull().default(1),
  eventAt: timestamp('timestamp').notNull().defaultNow(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
}, (table) => ({
  byAgent: index('agent_token_usage_agent_idx').on(table.agentId, table.eventAt),
  byTenant: index('agent_token_usage_tenant_idx').on(table.tenantId, table.eventAt),
  byTask: index('agent_token_usage_task_idx').on(table.taskId),
}));

// CRON registry used by the command center UI for deterministic execution controls.
export const cronRegistry = pgTable('cron_registry', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  agentId: integer('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  cronType: text('cron_type', { enum: ['time', 'event', 'monitor', 'regeneration'] }).notNull(),
  schedule: text('schedule'),
  scriptReference: text('script_reference'),
  budgetTokens: integer('budget_tokens').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  lastRun: timestamp('last_run'),
  nextRun: timestamp('next_run'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  byTenantActive: index('cron_registry_tenant_active_idx').on(table.tenantId, table.isActive, table.nextRun),
  byAgent: index('cron_registry_agent_idx').on(table.agentId, table.nextRun),
  byType: index('cron_registry_type_idx').on(table.cronType, table.nextRun),
}));

export const economyWalletsRelations = relations(economyWallets, ({ one, many }) => ({
  agent: one(agents, {
    fields: [economyWallets.agentId],
    references: [agents.id],
  }),
  company: one(companies, {
    fields: [economyWallets.companyId],
    references: [companies.id],
  }),
  transactions: many(economyTransactions),
  snapshots: many(agentCreditSnapshots),
  campaigns: many(campaignForecasts),
}));

export const economyTransactionsRelations = relations(economyTransactions, ({ one }) => ({
  wallet: one(economyWallets, {
    fields: [economyTransactions.walletId],
    references: [economyWallets.id],
  }),
  agent: one(agents, {
    fields: [economyTransactions.agentId],
    references: [agents.id],
  }),
}));

export const agentCreditSnapshotsRelations = relations(agentCreditSnapshots, ({ one }) => ({
  agent: one(agents, {
    fields: [agentCreditSnapshots.agentId],
    references: [agents.id],
  }),
  wallet: one(economyWallets, {
    fields: [agentCreditSnapshots.walletId],
    references: [economyWallets.id],
  }),
}));

export const campaignForecastsRelations = relations(campaignForecasts, ({ one }) => ({
  agent: one(agents, {
    fields: [campaignForecasts.agentId],
    references: [agents.id],
  }),
  wallet: one(economyWallets, {
    fields: [campaignForecasts.walletId],
    references: [economyWallets.id],
  }),
}));

export const cfoDecisionsRelations = relations(cfoDecisions, ({ one }) => ({
  targetAgent: one(agents, {
    fields: [cfoDecisions.targetAgentId],
    references: [agents.id],
  }),
  targetWallet: one(economyWallets, {
    fields: [cfoDecisions.targetWalletId],
    references: [economyWallets.id],
  }),
}));

export type EconomyWallet = typeof economyWallets.$inferSelect;
export type NewEconomyWallet = typeof economyWallets.$inferInsert;
export type EconomyTransaction = typeof economyTransactions.$inferSelect;
export type NewEconomyTransaction = typeof economyTransactions.$inferInsert;
export type AgentCreditSnapshot = typeof agentCreditSnapshots.$inferSelect;
export type CampaignForecast = typeof campaignForecasts.$inferSelect;
export type CfoDecision = typeof cfoDecisions.$inferSelect;
export type GlobalCreditPool = typeof globalCreditPool.$inferSelect;
export type AgentTokenUsage = typeof agentTokenUsage.$inferSelect;
export type NewAgentTokenUsage = typeof agentTokenUsage.$inferInsert;
export type CronRegistryRow = typeof cronRegistry.$inferSelect;
export type NewCronRegistryRow = typeof cronRegistry.$inferInsert;
