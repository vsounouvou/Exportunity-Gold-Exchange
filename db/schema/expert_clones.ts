import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, serial, text, timestamp, decimal } from "drizzle-orm/pg-core";

/**
 * EXPERT CLONE PLATFORM SCHEMA
 * 
 * Enables experts to create AI clones of themselves that companies can hire.
 * Features:
 * - Expert profiles (public marketplace listing)
 * - Clone training pipeline (materials upload, analysis, fine-tuning)
 * - 3-layer memory architecture (core identity, client vaults, performance)
 * - Dynamic pricing and revenue sharing
 * - Multi-platform access (web, WhatsApp, LinkedIn)
 */

// ========================================
// EXPERT PROFILES
// ========================================

export const expertProfiles = pgTable('expert_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(), // Links to users table (the human expert)
  
  // Public Profile Information
  displayName: text('display_name').notNull(),
  bio: text('bio'),
  longDescription: text('long_description'),
  avatar: text('avatar'),
  coverImage: text('cover_image'),
  
  // Expertise
  title: text('title').notNull(), // e.g. "Senior Gold Trade Expert", "Business Consultant"
  primaryExpertise: text('primary_expertise').notNull(), // e.g. "gold_trading", "accounting", "hr"
  skills: jsonb('skills').$type<string[]>().default([]),
  industries: jsonb('industries').$type<string[]>().default([]),
  languages: jsonb('languages').$type<string[]>().default(['en']),
  yearsOfExperience: integer('years_of_experience'),
  
  // Performance & Ratings
  rating: decimal('rating', { precision: 3, scale: 2 }).default('0.00'), // 0.00 - 5.00
  totalHires: integer('total_hires').default(0),
  totalTasks: integer('total_tasks').default(0),
  successRate: decimal('success_rate', { precision: 5, scale: 2 }).default('0.00'), // 0.00 - 100.00
  averageResponseTime: integer('average_response_time'), // seconds
  
  // Pricing (per hour in USD)
  basePrice: decimal('base_price', { precision: 10, scale: 2 }).notNull().default('10.00'),
  currentPrice: decimal('current_price', { precision: 10, scale: 2 }).notNull().default('10.00'),
  pricingModel: text('pricing_model', {
    enum: ['per_hour', 'per_task', 'monthly_subscription', 'custom']
  }).default('per_hour'),
  customPricingTiers: jsonb('custom_pricing_tiers').$type<Array<{
    name: string;
    price: number;
    duration?: string;
    features?: string[];
  }>>().default([]),
  
  // Contact & Social
  whatsappNumber: text('whatsapp_number'),
  linkedinUrl: text('linkedin_url'),
  websiteUrl: text('website_url'),
  email: text('email'),
  
  // Status & Visibility
  status: text('status', {
    enum: ['draft', 'training', 'active', 'paused', 'inactive']
  }).default('draft'),
  isPublic: boolean('is_public').default(false),
  isFeatured: boolean('is_featured').default(false),
  
  // Shareable Links
  shortCode: text('short_code').unique(), // e.g. "expert_john_gold_trader"
  profileUrl: text('profile_url'), // Full shareable URL
  
  // Revenue Sharing
  platformFeePercentage: decimal('platform_fee_percentage', { precision: 5, scale: 2 }).default('20.00'), // Platform takes 20%
  expertEarningsTotal: decimal('expert_earnings_total', { precision: 12, scale: 2 }).default('0.00'),
  platformEarningsTotal: decimal('platform_earnings_total', { precision: 12, scale: 2 }).default('0.00'),
  
  // Metadata
  metadata: jsonb('metadata').$type<{
    badges?: string[];
    certifications?: string[];
    culturalFocus?: string; // e.g. "Afrocentric", "MENA", "Global"
    preferences?: Record<string, any>;
  }>().default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  publishedAt: timestamp('published_at'),
  lastActiveAt: timestamp('last_active_at')
});

// ========================================
// CLONE TRAINING MATERIALS
// ========================================

export const cloneTrainingMaterials = pgTable('clone_training_materials', {
  id: serial('id').primaryKey(),
  expertProfileId: integer('expert_profile_id').references(() => expertProfiles.id, { onDelete: 'cascade' }).notNull(),
  
  // Material Information
  materialType: text('material_type', {
    enum: ['video', 'audio', 'document', 'social_media', 'transcript', 'framework', 'case_study', 'other']
  }).notNull(),
  fileName: text('file_name'),
  fileUrl: text('file_url'),
  fileSize: integer('file_size'), // bytes
  mimeType: text('mime_type'),
  
  // Processing Status
  status: text('status', {
    enum: ['uploaded', 'processing', 'analyzed', 'integrated', 'failed']
  }).default('uploaded'),
  
  // Analysis Results
  analysisResults: jsonb('analysis_results').$type<{
    knowledgeExtracted?: string[];
    communicationStyle?: {
      tone?: string;
      vocabulary?: string[];
      patterns?: string[];
    };
    reasoningPatterns?: string[];
    expertiseAreas?: string[];
    confidence?: number;
  }>().default({}),
  
  // Metadata
  title: text('title'),
  description: text('description'),
  tags: jsonb('tags').$type<string[]>().default([]),
  metadata: jsonb('metadata').default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  processedAt: timestamp('processed_at'),
  integratedAt: timestamp('integrated_at')
});

// ========================================
// CLONE CORE IDENTITY (Layer 1 - Public)
// ========================================

export const cloneCoreIdentity = pgTable('clone_core_identity', {
  id: serial('id').primaryKey(),
  expertProfileId: integer('expert_profile_id').references(() => expertProfiles.id, { onDelete: 'cascade' }).notNull().unique(),
  
  // Knowledge Base (shared across all clients)
  knowledgeBase: jsonb('knowledge_base').$type<{
    expertise?: string[];
    methods?: string[];
    frameworks?: string[];
    bestPractices?: string[];
    caseStudies?: string[];
  }>().default({}),
  
  // Communication Style
  communicationStyle: jsonb('communication_style').$type<{
    tone?: string;
    vocabulary?: string[];
    sentenceStructure?: string;
    greetingStyle?: string;
    closingStyle?: string;
    culturalElements?: string[];
  }>().default({}),
  
  // Personality Profile
  personality: jsonb('personality').$type<{
    traits?: string[];
    values?: string[];
    approach?: string;
    decisionMakingStyle?: string;
    riskTolerance?: string;
  }>().default({}),
  
  // Reasoning Patterns
  reasoningPatterns: jsonb('reasoning_patterns').$type<{
    problemSolvingApproach?: string[];
    analyticalFrameworks?: string[];
    decisionCriteria?: string[];
  }>().default({}),
  
  // Model Configuration
  modelConfig: jsonb('model_config').$type<{
    baseModel?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    customInstructions?: string[];
  }>().default({}),
  
  // Version & Quality
  version: text('version').default('1.0'),
  qualityScore: decimal('quality_score', { precision: 5, scale: 2 }).default('0.00'), // 0.00 - 100.00
  lastFineTunedAt: timestamp('last_fine_tuned_at'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ========================================
// CLIENT MEMORY VAULTS (Layer 2 - Private)
// ========================================

export const clientMemoryVaults = pgTable('client_memory_vaults', {
  id: serial('id').primaryKey(),
  expertProfileId: integer('expert_profile_id').references(() => expertProfiles.id, { onDelete: 'cascade' }).notNull(),
  companyId: integer('company_id').notNull(), // The hiring company
  agentId: integer('agent_id'), // The AI agent created for this clone - FK added via migration
  
  // Vault Status
  status: text('status', {
    enum: ['active', 'paused', 'terminated', 'archived']
  }).default('active'),
  
  // Confidential Data (isolated per client)
  companyContext: jsonb('company_context').$type<{
    industry?: string;
    challenges?: string[];
    goals?: string[];
    preferences?: Record<string, any>;
  }>().default({}),
  
  // Conversation History (compressed)
  conversationSummary: text('conversation_summary'),
  keyInsights: jsonb('key_insights').$type<string[]>().default([]),
  
  // Documents & Materials (client-specific)
  documents: jsonb('documents').$type<Array<{
    id: string;
    title: string;
    type: string;
    uploadedAt: string;
    url?: string;
  }>>().default([]),
  
  // Tasks & Projects
  ongoingTasks: jsonb('ongoing_tasks').$type<Array<{
    id: string;
    title: string;
    status: string;
    assignedAt: string;
  }>>().default([]),
  
  // Privacy Settings
  encryptionKey: text('encryption_key'), // For future encryption
  autoDeleteAfterDays: integer('auto_delete_after_days').default(0), // 0 = never
  
  // Metadata
  metadata: jsonb('metadata').default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  lastAccessedAt: timestamp('last_accessed_at'),
  terminatedAt: timestamp('terminated_at')
});

// ========================================
// CLONE PERFORMANCE METRICS (Layer 3 - Anonymous)
// ========================================

export const clonePerformanceMetrics = pgTable('clone_performance_metrics', {
  id: serial('id').primaryKey(),
  expertProfileId: integer('expert_profile_id').references(() => expertProfiles.id, { onDelete: 'cascade' }).notNull(),
  
  // Aggregated Performance (no company data)
  totalInteractions: integer('total_interactions').default(0),
  totalTasksCompleted: integer('total_tasks_completed').default(0),
  averageRating: decimal('average_rating', { precision: 3, scale: 2 }).default('0.00'),
  averageResponseTime: integer('average_response_time').default(0), // seconds
  
  // Success Metrics
  taskSuccessRate: decimal('task_success_rate', { precision: 5, scale: 2 }).default('0.00'),
  clientSatisfactionScore: decimal('client_satisfaction_score', { precision: 5, scale: 2 }).default('0.00'),
  repeatHireRate: decimal('repeat_hire_rate', { precision: 5, scale: 2 }).default('0.00'),
  
  // Speed Metrics
  averageFirstResponseTime: integer('average_first_response_time').default(0),
  averageTaskCompletionTime: integer('average_task_completion_time').default(0),
  
  // Usage Patterns (anonymous)
  peakUsageHours: jsonb('peak_usage_hours').$type<number[]>().default([]),
  commonTaskTypes: jsonb('common_task_types').$type<Record<string, number>>().default({}),
  
  // Period
  period: text('period', {
    enum: ['daily', 'weekly', 'monthly', 'all_time']
  }).default('all_time'),
  periodStart: timestamp('period_start'),
  periodEnd: timestamp('period_end'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ========================================
// CLONE HIRES (Hiring Transactions)
// ========================================

export const cloneHires = pgTable('clone_hires', {
  id: serial('id').primaryKey(),
  expertProfileId: integer('expert_profile_id').references(() => expertProfiles.id, { onDelete: 'cascade' }).notNull(),
  companyId: integer('company_id').notNull(),
  vaultId: integer('vault_id').references(() => clientMemoryVaults.id, { onDelete: 'cascade' }),
  agentId: integer('agent_id'), // The AI agent created for this clone - FK added via migration
  
  // Hire Details
  pricingModel: text('pricing_model', {
    enum: ['per_hour', 'per_task', 'monthly_subscription', 'custom']
  }).notNull(),
  agreedPrice: decimal('agreed_price', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').default('USD'),
  
  // Status
  status: text('status', {
    enum: ['pending', 'active', 'paused', 'completed', 'cancelled']
  }).default('pending'),
  
  // Duration
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date'),
  renewalType: text('renewal_type', {
    enum: ['one_time', 'auto_renew', 'manual_renew']
  }).default('manual_renew'),
  
  // Usage Tracking
  totalHoursUsed: decimal('total_hours_used', { precision: 10, scale: 2 }).default('0.00'),
  totalTasksCompleted: integer('total_tasks_completed').default(0),
  totalSpent: decimal('total_spent', { precision: 12, scale: 2 }).default('0.00'),
  
  // Metadata
  metadata: jsonb('metadata').$type<{
    contractTerms?: string;
    specialRequirements?: string[];
    accessLevel?: string;
  }>().default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  completedAt: timestamp('completed_at'),
  cancelledAt: timestamp('cancelled_at')
});

// ========================================
// CLONE REVENUE TRANSACTIONS
// ========================================

export const cloneRevenueTransactions = pgTable('clone_revenue_transactions', {
  id: serial('id').primaryKey(),
  expertProfileId: integer('expert_profile_id').references(() => expertProfiles.id, { onDelete: 'cascade' }).notNull(),
  hireId: integer('hire_id').references(() => cloneHires.id, { onDelete: 'cascade' }),
  companyId: integer('company_id').notNull(),
  
  // Transaction Details
  totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull(),
  currency: text('currency').default('USD'),
  
  // Revenue Split
  expertShare: decimal('expert_share', { precision: 12, scale: 2 }).notNull(),
  platformShare: decimal('platform_share', { precision: 12, scale: 2 }).notNull(),
  platformFeePercentage: decimal('platform_fee_percentage', { precision: 5, scale: 2 }).notNull(),
  
  // Transaction Type
  transactionType: text('transaction_type', {
    enum: ['hourly_billing', 'task_completion', 'subscription', 'bonus', 'refund']
  }).notNull(),
  
  // Status
  status: text('status', {
    enum: ['pending', 'completed', 'failed', 'refunded']
  }).default('pending'),
  
  // Metadata
  description: text('description'),
  metadata: jsonb('metadata').$type<{
    hoursWorked?: number;
    tasksCompleted?: number;
    billingPeriod?: string;
  }>().default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  processedAt: timestamp('processed_at')
});

// ========================================
// CLONE RATINGS & REVIEWS
// ========================================

export const cloneRatings = pgTable('clone_ratings', {
  id: serial('id').primaryKey(),
  expertProfileId: integer('expert_profile_id').references(() => expertProfiles.id, { onDelete: 'cascade' }).notNull(),
  companyId: integer('company_id').notNull(),
  hireId: integer('hire_id').references(() => cloneHires.id, { onDelete: 'cascade' }),
  
  // Rating
  overallRating: integer('overall_rating').notNull(), // 1-5 stars
  expertiseRating: integer('expertise_rating'), // 1-5
  communicationRating: integer('communication_rating'), // 1-5
  responsivenessRating: integer('responsiveness_rating'), // 1-5
  valueRating: integer('value_rating'), // 1-5
  
  // Review
  reviewTitle: text('review_title'),
  reviewText: text('review_text'),
  isPublic: boolean('is_public').default(true),
  
  // Response
  expertResponse: text('expert_response'),
  respondedAt: timestamp('responded_at'),
  
  // Metadata
  metadata: jsonb('metadata').default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ========================================
// RELATIONS
// ========================================

export const expertProfilesRelations = relations(expertProfiles, ({ many, one }) => ({
  trainingMaterials: many(cloneTrainingMaterials),
  coreIdentity: one(cloneCoreIdentity),
  memoryVaults: many(clientMemoryVaults),
  performanceMetrics: many(clonePerformanceMetrics),
  hires: many(cloneHires),
  revenues: many(cloneRevenueTransactions),
  ratings: many(cloneRatings)
}));

export const cloneTrainingMaterialsRelations = relations(cloneTrainingMaterials, ({ one }) => ({
  expertProfile: one(expertProfiles, {
    fields: [cloneTrainingMaterials.expertProfileId],
    references: [expertProfiles.id]
  })
}));

export const cloneCoreIdentityRelations = relations(cloneCoreIdentity, ({ one }) => ({
  expertProfile: one(expertProfiles, {
    fields: [cloneCoreIdentity.expertProfileId],
    references: [expertProfiles.id]
  })
}));

export const clientMemoryVaultsRelations = relations(clientMemoryVaults, ({ one }) => ({
  expertProfile: one(expertProfiles, {
    fields: [clientMemoryVaults.expertProfileId],
    references: [expertProfiles.id]
  })
}));

export const clonePerformanceMetricsRelations = relations(clonePerformanceMetrics, ({ one }) => ({
  expertProfile: one(expertProfiles, {
    fields: [clonePerformanceMetrics.expertProfileId],
    references: [expertProfiles.id]
  })
}));

export const cloneHiresRelations = relations(cloneHires, ({ one, many }) => ({
  expertProfile: one(expertProfiles, {
    fields: [cloneHires.expertProfileId],
    references: [expertProfiles.id]
  }),
  vault: one(clientMemoryVaults, {
    fields: [cloneHires.vaultId],
    references: [clientMemoryVaults.id]
  }),
  revenues: many(cloneRevenueTransactions),
  ratings: many(cloneRatings)
}));

export const cloneRevenueTransactionsRelations = relations(cloneRevenueTransactions, ({ one }) => ({
  expertProfile: one(expertProfiles, {
    fields: [cloneRevenueTransactions.expertProfileId],
    references: [expertProfiles.id]
  }),
  hire: one(cloneHires, {
    fields: [cloneRevenueTransactions.hireId],
    references: [cloneHires.id]
  })
}));

export const cloneRatingsRelations = relations(cloneRatings, ({ one }) => ({
  expertProfile: one(expertProfiles, {
    fields: [cloneRatings.expertProfileId],
    references: [expertProfiles.id]
  }),
  hire: one(cloneHires, {
    fields: [cloneRatings.hireId],
    references: [cloneHires.id]
  })
}));
