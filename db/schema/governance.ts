import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, serial, text, timestamp, decimal, pgEnum, index } from "drizzle-orm/pg-core";
import { companies, users, companyShareholders } from "../schema";

export const voteTypeEnum = pgEnum('vote_type', [
  'majority', 'supermajority', 'unanimous', 'founder_only'
]);

export const voteStatusEnum = pgEnum('vote_status', [
  'pending', 'open', 'closed', 'approved', 'rejected', 'expired'
]);

export const governanceRules = pgTable('governance_rules', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  
  ruleName: text('rule_name').notNull(),
  ruleDescription: text('rule_description'),
  category: text('category', {
    enum: ['financial', 'operational', 'legal', 'hiring', 'strategic', 'ownership']
  }).notNull(),
  
  thresholdAmount: decimal('threshold_amount', { precision: 15, scale: 2 }),
  thresholdCurrency: text('threshold_currency').default('USD'),
  
  voteType: voteTypeEnum('vote_type').notNull().default('majority'),
  
  requiredApprovers: jsonb('required_approvers').$type<{
    founderApproval?: boolean;
    cfoApproval?: boolean;
    legalApproval?: boolean;
    boardApproval?: boolean;
    shareholderVote?: boolean;
    shareholderThreshold?: number;
  }>().default({}),
  
  autoEnforce: boolean('auto_enforce').default(true),
  isActive: boolean('is_active').default(true),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const votingSessions = pgTable('voting_sessions', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  governanceRuleId: integer('governance_rule_id').references(() => governanceRules.id),
  
  title: text('title').notNull(),
  description: text('description'),
  proposalType: text('proposal_type', {
    enum: ['spending', 'hiring', 'contract', 'ownership_change', 'dividend', 'strategic', 'other']
  }).notNull(),
  
  proposedAmount: decimal('proposed_amount', { precision: 15, scale: 2 }),
  proposedCurrency: text('proposed_currency').default('USD'),
  
  voteType: voteTypeEnum('vote_type').notNull().default('majority'),
  status: voteStatusEnum('status').notNull().default('pending'),
  
  requiredVotes: integer('required_votes'),
  totalEligibleVotes: integer('total_eligible_votes'),
  votesFor: integer('votes_for').default(0),
  votesAgainst: integer('votes_against').default(0),
  votesAbstained: integer('votes_abstained').default(0),
  
  proposedBy: integer('proposed_by').references(() => users.id),
  proposedByAgentId: integer('proposed_by_agent_id'),
  
  aiLawyerAdvice: text('ai_lawyer_advice'),
  aiCfoAdvice: text('ai_cfo_advice'),
  
  openedAt: timestamp('opened_at'),
  closesAt: timestamp('closes_at'),
  closedAt: timestamp('closed_at'),
  
  outcome: text('outcome', {
    enum: ['approved', 'rejected', 'expired', 'cancelled']
  }),
  outcomeNotes: text('outcome_notes'),
  
  linkedTaskId: integer('linked_task_id'),
  linkedContractId: integer('linked_contract_id'),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => ({
  companyIdx: index('voting_session_company_idx').on(table.companyId),
  statusIdx: index('voting_session_status_idx').on(table.status)
}));

export const shareholderVotes = pgTable('shareholder_votes', {
  id: serial('id').primaryKey(),
  votingSessionId: integer('voting_session_id').references(() => votingSessions.id, { onDelete: 'cascade' }).notNull(),
  shareholderId: integer('shareholder_id').references(() => companyShareholders.id).notNull(),
  userId: integer('user_id').references(() => users.id),
  
  vote: text('vote', {
    enum: ['for', 'against', 'abstain']
  }).notNull(),
  
  voteWeight: decimal('vote_weight', { precision: 5, scale: 2 }).notNull(),
  
  comment: text('comment'),
  votedAt: timestamp('voted_at').defaultNow(),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow()
}, (table) => ({
  sessionIdx: index('shareholder_vote_session_idx').on(table.votingSessionId),
  shareholderIdx: index('shareholder_vote_holder_idx').on(table.shareholderId)
}));

export const boardMeetingSummaries = pgTable('board_meeting_summaries', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  votingSessionId: integer('voting_session_id').references(() => votingSessions.id),
  
  meetingDate: timestamp('meeting_date').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  
  attendees: jsonb('attendees').$type<{
    shareholders?: number[];
    agents?: number[];
    aiAdvisors?: string[];
  }>().default({}),
  
  decisionsRecorded: jsonb('decisions_recorded').$type<{
    decision: string;
    outcome: string;
    voteCount?: { for: number; against: number; abstain: number };
  }[]>().default([]),
  
  actionItems: jsonb('action_items').$type<{
    description: string;
    assignedTo: string;
    dueDate?: string;
  }[]>().default([]),
  
  recordedBy: text('recorded_by'),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow()
});

export const wallets = pgTable('wallets', {
  id: serial('id').primaryKey(),
  
  ownerType: text('owner_type', {
    enum: ['user', 'company', 'shareholder']
  }).notNull(),
  ownerId: integer('owner_id').notNull(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  
  walletType: text('wallet_type', {
    enum: ['personal', 'company_operating', 'company_reserve', 'dividend', 'escrow']
  }).notNull(),
  
  name: text('name').notNull(),
  
  balance: decimal('balance', { precision: 15, scale: 2 }).notNull().default('0.00'),
  currency: text('currency').notNull().default('USD'),
  
  pendingInbound: decimal('pending_inbound', { precision: 15, scale: 2 }).default('0.00'),
  pendingOutbound: decimal('pending_outbound', { precision: 15, scale: 2 }).default('0.00'),
  
  isActive: boolean('is_active').default(true),
  
  linkedBankAccount: jsonb('linked_bank_account').$type<{
    bankName?: string;
    accountNumber?: string;
    routingNumber?: string;
    accountType?: string;
  }>().default({}),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => ({
  ownerIdx: index('wallet_owner_idx').on(table.ownerType, table.ownerId),
  companyIdx: index('wallet_company_idx').on(table.companyId)
}));

export const walletTransactions = pgTable('wallet_transactions', {
  id: serial('id').primaryKey(),
  walletId: integer('wallet_id').references(() => wallets.id, { onDelete: 'cascade' }).notNull(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  
  transactionType: text('transaction_type', {
    enum: ['deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'dividend', 'investment', 'expense', 'revenue', 'refund', 'fee']
  }).notNull(),
  
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('USD'),
  
  balanceBefore: decimal('balance_before', { precision: 15, scale: 2 }).notNull(),
  balanceAfter: decimal('balance_after', { precision: 15, scale: 2 }).notNull(),
  
  relatedWalletId: integer('related_wallet_id').references(() => wallets.id),
  
  category: text('category'),
  description: text('description'),
  
  status: text('status', {
    enum: ['pending', 'completed', 'failed', 'cancelled']
  }).default('completed'),
  
  approvedBy: integer('approved_by').references(() => users.id),
  votingSessionId: integer('voting_session_id').references(() => votingSessions.id),
  
  metadata: jsonb('metadata').$type<{
    invoiceId?: string;
    vendorName?: string;
    clientName?: string;
    projectId?: number;
    notes?: string;
  }>().default({}),
  
  createdAt: timestamp('created_at').defaultNow()
}, (table) => ({
  walletIdx: index('wallet_tx_wallet_idx').on(table.walletId),
  companyIdx: index('wallet_tx_company_idx').on(table.companyId),
  typeIdx: index('wallet_tx_type_idx').on(table.transactionType)
}));

export const dividendDistributions = pgTable('dividend_distributions', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  votingSessionId: integer('voting_session_id').references(() => votingSessions.id),
  
  totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('USD'),
  
  distributionDate: timestamp('distribution_date').notNull(),
  periodStart: timestamp('period_start'),
  periodEnd: timestamp('period_end'),
  
  status: text('status', {
    enum: ['proposed', 'approved', 'processing', 'completed', 'cancelled']
  }).default('proposed'),
  
  distributions: jsonb('distributions').$type<{
    shareholderId: number;
    shareholderName: string;
    percentage: number;
    amount: number;
    walletId?: number;
    status: 'pending' | 'sent' | 'received';
  }[]>().default([]),
  
  aiCfoRecommendation: text('ai_cfo_recommendation'),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const governanceRulesRelations = relations(governanceRules, ({ one, many }) => ({
  company: one(companies, {
    fields: [governanceRules.companyId],
    references: [companies.id]
  }),
  votingSessions: many(votingSessions)
}));

export const votingSessionsRelations = relations(votingSessions, ({ one, many }) => ({
  company: one(companies, {
    fields: [votingSessions.companyId],
    references: [companies.id]
  }),
  governanceRule: one(governanceRules, {
    fields: [votingSessions.governanceRuleId],
    references: [governanceRules.id]
  }),
  proposer: one(users, {
    fields: [votingSessions.proposedBy],
    references: [users.id]
  }),
  votes: many(shareholderVotes)
}));

export const shareholderVotesRelations = relations(shareholderVotes, ({ one }) => ({
  votingSession: one(votingSessions, {
    fields: [shareholderVotes.votingSessionId],
    references: [votingSessions.id]
  }),
  shareholder: one(companyShareholders, {
    fields: [shareholderVotes.shareholderId],
    references: [companyShareholders.id]
  }),
  user: one(users, {
    fields: [shareholderVotes.userId],
    references: [users.id]
  })
}));

export const walletsRelations = relations(wallets, ({ one, many }) => ({
  company: one(companies, {
    fields: [wallets.companyId],
    references: [companies.id]
  }),
  transactions: many(walletTransactions)
}));

export const walletTransactionsRelations = relations(walletTransactions, ({ one }) => ({
  wallet: one(wallets, {
    fields: [walletTransactions.walletId],
    references: [wallets.id]
  }),
  company: one(companies, {
    fields: [walletTransactions.companyId],
    references: [companies.id]
  }),
  relatedWallet: one(wallets, {
    fields: [walletTransactions.relatedWalletId],
    references: [wallets.id]
  }),
  approver: one(users, {
    fields: [walletTransactions.approvedBy],
    references: [users.id]
  }),
  votingSession: one(votingSessions, {
    fields: [walletTransactions.votingSessionId],
    references: [votingSessions.id]
  })
}));
