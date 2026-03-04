import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, serial, text, timestamp, decimal, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { users } from "../schema";

// ========================================
// CREDIT SYSTEM
// ========================================

// User credits balance and settings
export const userCredits = pgTable('user_credits', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  balance: decimal('balance', { precision: 10, scale: 2 }).notNull().default('0'),
  dailyCost: decimal('daily_cost', { precision: 10, scale: 2 }).notNull().default('0'), // Auto-calculated
  forecastDays: integer('forecast_days'), // Days remaining based on current balance and daily cost
  lowBalanceThreshold: decimal('low_balance_threshold', { precision: 10, scale: 2 }).default('50'),
  lowBalanceAlertSent: boolean('low_balance_alert_sent').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Credit transaction history
export const creditTransactions = pgTable('credit_transactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  type: text('type', { enum: ['purchase', 'spent', 'refund', 'bonus', 'adjustment'] }).notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  balanceBefore: decimal('balance_before', { precision: 10, scale: 2 }).notNull(),
  balanceAfter: decimal('balance_after', { precision: 10, scale: 2 }).notNull(),
  description: text('description').notNull(),
  relatedAgentId: integer('related_agent_id'), // If spent on an agent
  metadata: jsonb('metadata').$type<{
    paymentMethod?: string;
    transactionId?: string;
    agentName?: string;
    reason?: string;
    agentTypeId?: number;
    tierId?: number;
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow()
});

// ========================================
// AGENT TIERS & COSTS
// ========================================

// Agent tier definitions (Starter, PRO, etc.)
export const agentTiers = pgTable('agent_tiers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(), // 'starter', 'pro', 'enterprise'
  displayName: text('display_name').notNull(), // 'Starter', 'PRO', 'Enterprise'
  description: text('description'),
  features: jsonb('features').$type<string[]>().default([]),
  costMultiplier: decimal('cost_multiplier', { precision: 4, scale: 2 }).notNull().default('1.0'), // 1.0 for starter, 2.0 for pro, etc.
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow()
});

// Agent type definitions and their base costs
export const agentTypes = pgTable('agent_types', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // 'personal_clone', 'tiktok', 'front_desk', etc.
  name: text('name').notNull(),
  description: text('description'),
  pitch: text('pitch'), // "I will analyze your videos, create daily ideas..."
  category: text('category', { enum: ['social', 'business', 'productivity', 'sales', 'content'] }).notNull(),
  baseDailyCost: decimal('base_daily_cost', { precision: 10, scale: 2 }).notNull(),
  isStarter: boolean('is_starter').default(false), // True for Personal Clone Agent
  icon: text('icon'),
  color: text('color'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata').$type<{
    recommendAfter?: string[]; // Agent codes to recommend this after
    requiredFeatures?: string[];
    maxInstances?: number; // Max instances per user
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow()
});

// ========================================
// PERSONAL CLONE AGENTS
// ========================================

// User's personal clone agents
export const cloneAgents = pgTable('clone_agents', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  agentTypeId: integer('agent_type_id').references(() => agentTypes.id, { onDelete: 'cascade' }).notNull(),
  tierId: integer('tier_id').references(() => agentTiers.id).notNull(),
  
  name: text('name').notNull(), // User-given name
  status: text('status', { enum: ['learning', 'training', 'active', 'paused', 'inactive'] }).notNull().default('learning'),
  
  // Current costs
  dailyCost: decimal('daily_cost', { precision: 10, scale: 2 }).notNull(),
  weeklyCost: decimal('weekly_cost', { precision: 10, scale: 2 }).notNull(),
  monthlyCost: decimal('monthly_cost', { precision: 10, scale: 2 }).notNull(),
  
  // Training completion
  learningProgress: integer('learning_progress').default(0), // 0-100%
  learningStartedAt: timestamp('learning_started_at'),
  learningCompletedAt: timestamp('learning_completed_at'),
  
  // Usage stats
  messagesHandled: integer('messages_handled').default(0),
  postsCreated: integer('posts_created').default(0),
  interactionsCount: integer('interactions_count').default(0),
  lastActiveAt: timestamp('last_active_at'),
  
  // Configuration
  config: jsonb('config').$type<{
    autoReply?: boolean;
    autoPost?: boolean;
    platforms?: string[]; // ['instagram', 'tiktok', 'facebook']
    personality?: string;
    tone?: string;
    customInstructions?: string;
  }>().default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Clone training data (photos, voice, social media)
export const cloneTrainingData = pgTable('clone_training_data', {
  id: serial('id').primaryKey(),
  cloneAgentId: integer('clone_agent_id').references(() => cloneAgents.id, { onDelete: 'cascade' }).notNull(),
  
  // Face cloning
  facePhotos: jsonb('face_photos').$type<Array<{
    url: string;
    uploadedAt: string;
    processed: boolean;
  }>>().default([]),
  faceModelUrl: text('face_model_url'),
  
  // Voice cloning
  voiceSamples: jsonb('voice_samples').$type<Array<{
    url: string;
    duration: number;
    uploadedAt: string;
    processed: boolean;
  }>>().default([]),
  voiceModelUrl: text('voice_model_url'),
  
  // Social media
  socialLinks: jsonb('social_links').$type<{
    instagram?: string;
    tiktok?: string;
    facebook?: string;
    twitter?: string;
    linkedin?: string;
  }>().default({}),
  
  // Learned patterns
  writingStyle: jsonb('writing_style').$type<{
    tone?: string;
    vocabulary?: string[];
    commonPhrases?: string[];
    emojiUsage?: string;
  }>(),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ========================================
// AGENT RECOMMENDATIONS
// ========================================

// System recommendations for users
export const agentRecommendations = pgTable('agent_recommendations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  agentTypeId: integer('agent_type_id').references(() => agentTypes.id, { onDelete: 'cascade' }).notNull(),
  
  reason: text('reason').notNull(), // "You post a lot on TikTok"
  priority: integer('priority').notNull().default(0), // Higher = more important
  score: decimal('score', { precision: 5, scale: 2 }), // Recommendation confidence score
  
  status: text('status', { enum: ['pending', 'accepted', 'dismissed', 'expired'] }).notNull().default('pending'),
  
  basedOn: jsonb('based_on').$type<{
    activityType?: string; // 'posts', 'messages', 'meetings'
    activityCount?: number;
    timeframe?: string;
  }>(),
  
  dismissedAt: timestamp('dismissed_at'),
  acceptedAt: timestamp('accepted_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow()
});

// ========================================
// RELATIONS
// ========================================

export const userCreditsRelations = relations(userCredits, ({ one }) => ({
  user: one(users, {
    fields: [userCredits.userId],
    references: [users.id]
  })
}));

export const creditTransactionsRelations = relations(creditTransactions, ({ one }) => ({
  user: one(users, {
    fields: [creditTransactions.userId],
    references: [users.id]
  }),
  agent: one(cloneAgents, {
    fields: [creditTransactions.relatedAgentId],
    references: [cloneAgents.id]
  })
}));

export const cloneAgentsRelations = relations(cloneAgents, ({ one, many }) => ({
  user: one(users, {
    fields: [cloneAgents.userId],
    references: [users.id]
  }),
  agentType: one(agentTypes, {
    fields: [cloneAgents.agentTypeId],
    references: [agentTypes.id]
  }),
  tier: one(agentTiers, {
    fields: [cloneAgents.tierId],
    references: [agentTiers.id]
  }),
  trainingData: one(cloneTrainingData, {
    fields: [cloneAgents.id],
    references: [cloneTrainingData.cloneAgentId]
  }),
  transactions: many(creditTransactions)
}));

export const cloneTrainingDataRelations = relations(cloneTrainingData, ({ one }) => ({
  cloneAgent: one(cloneAgents, {
    fields: [cloneTrainingData.cloneAgentId],
    references: [cloneAgents.id]
  })
}));

export const agentRecommendationsRelations = relations(agentRecommendations, ({ one }) => ({
  user: one(users, {
    fields: [agentRecommendations.userId],
    references: [users.id]
  }),
  agentType: one(agentTypes, {
    fields: [agentRecommendations.agentTypeId],
    references: [agentTypes.id]
  })
}));

export const agentTypesRelations = relations(agentTypes, ({ many }) => ({
  cloneAgents: many(cloneAgents),
  recommendations: many(agentRecommendations)
}));

export const agentTiersRelations = relations(agentTiers, ({ many }) => ({
  cloneAgents: many(cloneAgents)
}));

// ========================================
// ZOD SCHEMAS
// ========================================

export const insertUserCreditSchema = createInsertSchema(userCredits);
export const selectUserCreditSchema = createSelectSchema(userCredits);

export const insertCreditTransactionSchema = createInsertSchema(creditTransactions);
export const selectCreditTransactionSchema = createSelectSchema(creditTransactions);

export const insertAgentTierSchema = createInsertSchema(agentTiers);
export const selectAgentTierSchema = createSelectSchema(agentTiers);

export const insertAgentTypeSchema = createInsertSchema(agentTypes);
export const selectAgentTypeSchema = createSelectSchema(agentTypes);

export const insertCloneAgentSchema = createInsertSchema(cloneAgents);
export const selectCloneAgentSchema = createSelectSchema(cloneAgents);

export const insertCloneTrainingDataSchema = createInsertSchema(cloneTrainingData);
export const selectCloneTrainingDataSchema = createSelectSchema(cloneTrainingData);

export const insertAgentRecommendationSchema = createInsertSchema(agentRecommendations);
export const selectAgentRecommendationSchema = createSelectSchema(agentRecommendations);
