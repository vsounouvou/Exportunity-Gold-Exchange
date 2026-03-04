import { relations, sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, serial, text, timestamp, decimal, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { users, companies } from "../schema";
import { cloneAgents } from "./personal_clones";
import { expertProfiles } from "./expert_clones";

/**
 * UNIFIED EXPERT CLONES HUB SCHEMA (Phase 1)
 * 
 * This schema unifies Personal Clones and Expert Marketplace into one coherent system.
 * Key principles:
 * 1. Company-first multi-tenancy (everything scoped by company_id)
 * 2. Agents can work for multiple companies with different roles
 * 3. 3-layer knowledge base (Global → Company → Agent)
 * 4. Performance & Diagnostics as core feature
 * 5. Backward compatible - coexists with existing clone_agents and expert_profiles
 */

// ========================================
// UNIFIED CLONE PROFILES (Company-Agnostic Definition)
// ========================================

/**
 * Clone Profiles: Company-agnostic definition of an AI clone/expert.
 * Replaces both clone_agents (personal) and expert_profiles (marketplace).
 * Each profile can be:
 * - Private (created by user for their company only)
 * - Public (published to marketplace for others to hire)
 * - Shared (used across multiple companies with different assignments)
 */
export const cloneProfiles = pgTable('clone_profiles', {
  id: serial('id').primaryKey(),
  createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  
  // Basic Information
  displayName: text('display_name').notNull(),
  shortCode: text('short_code').unique(), // URL-friendly identifier
  bio: text('bio'),
  longDescription: text('long_description'),
  avatar: text('avatar'),
  coverImage: text('cover_image'),
  
  // Expertise & Classification
  title: text('title').notNull(), // e.g. "Senior SEO Expert", "Personal Assistant"
  category: text('category', { 
    enum: ['social', 'business', 'productivity', 'sales', 'content', 'expert', 'personal'] 
  }).notNull(),
  primaryExpertise: text('primary_expertise').notNull(),
  skills: jsonb('skills').$type<string[]>().default([]),
  industries: jsonb('industries').$type<string[]>().default([]),
  languages: jsonb('languages').$type<string[]>().default(['en']),
  
  // Training & Model
  trainingStatus: text('training_status', {
    enum: ['draft', 'training', 'ready', 'active', 'paused', 'archived']
  }).default('draft'),
  trainingProgress: integer('training_progress').default(0), // 0-100%
  trainingCompletedAt: timestamp('training_completed_at'),
  modelVersion: text('model_version').default('1.0'),
  qualityScore: decimal('quality_score', { precision: 5, scale: 2 }).default('0.00'),
  
  // Marketplace Visibility
  visibility: text('visibility', {
    enum: ['private', 'company_only', 'public_marketplace']
  }).default('private'),
  isPublished: boolean('is_published').default(false),
  isFeatured: boolean('is_featured').default(false),
  publishedAt: timestamp('published_at'),
  
  // Pricing (for marketplace clones)
  pricingModel: text('pricing_model', {
    enum: ['per_hour', 'per_day', 'per_task', 'monthly_subscription', 'custom']
  }).default('per_day'),
  baseDailyCost: decimal('base_daily_cost', { precision: 10, scale: 2 }).default('5.00'),
  baseHourlyRate: decimal('base_hourly_rate', { precision: 10, scale: 2 }).default('10.00'),
  
  // Aggregate Performance (across all assignments)
  totalAssignments: integer('total_assignments').default(0),
  totalTasksCompleted: integer('total_tasks_completed').default(0),
  averageRating: decimal('average_rating', { precision: 3, scale: 2 }).default('0.00'),
  successRate: decimal('success_rate', { precision: 5, scale: 2 }).default('0.00'),
  
  // Migration Tracking (with FKs to old tables)
  migratedFromCloneAgentId: integer('migrated_from_clone_agent_id').references(() => cloneAgents.id),
  migratedFromExpertProfileId: integer('migrated_from_expert_profile_id').references(() => expertProfiles.id),
  migrationSource: text('migration_source', { enum: ['personal_clone', 'expert_marketplace', 'new'] }),
  
  // Metadata
  metadata: jsonb('metadata').$type<{
    badges?: string[];
    certifications?: string[];
  }>().default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  lastActiveAt: timestamp('last_active_at')
}, (table) => ({
  // Indexes for migration tracking
  migratedFromCloneIdx: index('profile_migrated_clone_idx').on(table.migratedFromCloneAgentId),
  migratedFromExpertIdx: index('profile_migrated_expert_idx').on(table.migratedFromExpertProfileId),
  migrationSourceIdx: index('profile_migration_source_idx').on(table.migrationSource)
}));

// ========================================
// COMPANY CLONE ASSIGNMENTS (Multi-Company Support)
// ========================================

/**
 * Company Clone Assignments: Defines how a clone works for a specific company.
 * The same clone_profile_id can have multiple assignments (different companies).
 * Each assignment has its own role, scope, permissions, and cost structure.
 */
export const companyCloneAssignments = pgTable('company_clone_assignments', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  cloneProfileId: integer('clone_profile_id').references(() => cloneProfiles.id, { onDelete: 'cascade' }).notNull(),
  
  // Role & Hierarchy
  roleWithinCompany: text('role_within_company').notNull(), // "Marketing Agent", "Finance Analyst"
  departmentId: integer('department_id'), // Optional: link to departments table
  managerAgentId: integer('manager_agent_id'), // Self-reference for hierarchy - FK added manually to avoid circular type
  reportingLevel: integer('reporting_level').default(0), // 0 = top level, 1 = reports to level 0, etc.
  
  // Status & Access
  status: text('status', {
    enum: ['pending', 'learning', 'active', 'paused', 'terminated']
  }).default('pending'),
  accessScope: jsonb('access_scope').$type<{
    modules?: string[]; // Which platform modules can access
    dataCategories?: string[]; // Which data types can see
    permissions?: string[]; // Specific capabilities
  }>().default({}),
  
  // Tier & Cost (company-specific pricing)
  tierId: integer('tier_id'), // References agent_tiers (Starter, PRO, Enterprise)
  dailyCost: decimal('daily_cost', { precision: 10, scale: 2 }).notNull(),
  weeklyCost: decimal('weekly_cost', { precision: 10, scale: 2 }).notNull(),
  monthlyCost: decimal('monthly_cost', { precision: 10, scale: 2 }).notNull(),
  
  // Configuration (company-specific settings)
  config: jsonb('config').$type<{
    autoReply?: boolean;
    autoPost?: boolean;
    workingHours?: string;
    notifications?: boolean;
    customInstructions?: string;
  }>().default({}),
  
  // Performance Tracking (per company)
  tasksCompleted: integer('tasks_completed').default(0),
  messagesHandled: integer('messages_handled').default(0),
  meetingsAttended: integer('meetings_attended').default(0),
  lastActiveAt: timestamp('last_active_at'),
  
  // Hiring Details (for marketplace clones)
  hireId: integer('hire_id'), // Links to clone_hires if hired from marketplace
  agreedPrice: decimal('agreed_price', { precision: 10, scale: 2 }),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  
  // Metadata
  metadata: jsonb('metadata').$type<{
    specialRequirements?: string[];
    contractTerms?: string;
  }>().default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  activatedAt: timestamp('activated_at'),
  terminatedAt: timestamp('terminated_at')
}, (table) => ({
  // Unique constraint: one clone can only be assigned once per company
  uniqCompanyClone: uniqueIndex('company_clone_assignment_unique').on(table.companyId, table.cloneProfileId),
  // Index for hierarchy queries
  managerIdx: index('assignment_manager_idx').on(table.managerAgentId),
  // Index for company lookups
  companyIdx: index('assignment_company_idx').on(table.companyId),
  // Index for clone profile lookups
  cloneIdx: index('assignment_clone_idx').on(table.cloneProfileId),
  // Self-referencing foreign key for hierarchy (added here to avoid circular type)
  // Note: Will be added via raw SQL migration as Drizzle doesn't support inline self-refs in this pattern
  // FOREIGN KEY (manager_agent_id) REFERENCES company_clone_assignments(id) ON DELETE SET NULL
}));

// ========================================
// KNOWLEDGE LAYERS (3-Layer System)
// ========================================

/**
 * Knowledge Base: Three-layer knowledge system
 * Layer 1: GLOBAL - Available to all clones across all companies
 * Layer 2: COMPANY - Available only to clones assigned to specific company
 * Layer 3: AGENT - Private to specific clone assignment
 */
export const knowledgeLayers = pgTable('knowledge_layers', {
  id: serial('id').primaryKey(),
  
  // Scope Definition
  scope: text('scope', {
    enum: ['global', 'company', 'agent']
  }).notNull(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }), // REQUIRED for company/agent scope
  assignmentId: integer('assignment_id').references(() => companyCloneAssignments.id, { onDelete: 'cascade' }), // REQUIRED for agent scope only
  
  // Knowledge Item
  itemType: text('item_type', {
    enum: ['document', 'framework', 'case_study', 'memory', 'conversation', 'training_material', 'note']
  }).notNull(),
  title: text('title').notNull(),
  content: text('content'),
  summary: text('summary'),
  
  // Source & References
  sourceType: text('source_type', {
    enum: ['uploaded', 'generated', 'learned', 'imported', 'conversation']
  }).default('uploaded'),
  sourceUrl: text('source_url'),
  documentId: integer('document_id'), // Links to knowledge_documents table if applicable
  
  // Categorization
  category: text('category'), // "Finance", "HR", "Marketing", etc.
  tags: jsonb('tags').$type<string[]>().default([]),
  keywords: jsonb('keywords').$type<string[]>().default([]),
  
  // Access Control
  isPublic: boolean('is_public').default(false),
  accessLevel: text('access_level', {
    enum: ['public', 'company', 'team', 'agent_only']
  }).default('agent_only'),
  
  // Quality & Relevance
  qualityScore: decimal('quality_score', { precision: 5, scale: 2 }).default('0.00'),
  relevanceScore: decimal('relevance_score', { precision: 5, scale: 2 }),
  usageCount: integer('usage_count').default(0), // How often this knowledge is retrieved
  lastUsedAt: timestamp('last_used_at'),
  
  // Metadata
  metadata: jsonb('metadata').$type<{
    extractedFrom?: string;
    relatedTopics?: string[];
    version?: string;
  }>().default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  expiresAt: timestamp('expires_at') // Optional: auto-delete old knowledge
}, (table) => ({
  // Indexes for scoped queries
  scopeIdx: index('knowledge_scope_idx').on(table.scope),
  companyIdx: index('knowledge_company_idx').on(table.companyId),
  assignmentIdx: index('knowledge_assignment_idx').on(table.assignmentId),
  // Index for usage tracking
  lastUsedIdx: index('knowledge_last_used_idx').on(table.lastUsedAt),
  // Scope validation constraints
  globalScopeCheck: check(
    'knowledge_global_scope_check',
    sql`(scope != 'global' OR (company_id IS NULL AND assignment_id IS NULL))`
  ),
  companyScopeCheck: check(
    'knowledge_company_scope_check',
    sql`(scope != 'company' OR (company_id IS NOT NULL AND assignment_id IS NULL))`
  ),
  agentScopeCheck: check(
    'knowledge_agent_scope_check',
    sql`(scope != 'agent' OR (company_id IS NOT NULL AND assignment_id IS NOT NULL))`
  )
}));

// ========================================
// AGENT DIAGNOSTICS & PERFORMANCE
// ========================================

/**
 * Agent Diagnostics: Per-company performance metrics for each clone assignment.
 * Tracks granular metrics to enable Performance & Diagnostics dashboard.
 * NOTE: Schema matches the SQL migration (002_unified_expert_clones_schema.sql)
 */
export const agentDiagnostics = pgTable('agent_diagnostics', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  assignmentId: integer('assignment_id').references(() => companyCloneAssignments.id, { onDelete: 'cascade' }).notNull(),
  metricDate: timestamp('metric_date').notNull(),
  
  // Task Metrics
  tasksCompleted: integer('tasks_completed').default(0),
  tasksFailed: integer('tasks_failed').default(0),
  
  // Engagement Metrics
  messagesSent: integer('messages_sent').default(0),
  messagesReceived: integer('messages_received').default(0),
  meetingsAttended: integer('meetings_attended').default(0),
  knowledgeItemsAccessed: integer('knowledge_items_accessed').default(0),
  
  // Performance Metrics
  avgResponseTimeSeconds: integer('avg_response_time_seconds').default(0),
  totalCost: decimal('total_cost', { precision: 10, scale: 2 }).default('0.00'),
  qualityScore: decimal('quality_score', { precision: 5, scale: 2 }).default('0.00'),
  userSatisfactionScore: decimal('user_satisfaction_score', { precision: 3, scale: 2 }).default('0.00'),
  errorsCount: integer('errors_count').default(0),
  
  // Metadata
  metadata: jsonb('metadata').default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => ({
  // Index for company lookups
  companyIdx: index('diagnostics_company_idx').on(table.companyId),
  // Index for assignment lookups
  assignmentIdx: index('diagnostics_assignment_idx').on(table.assignmentId),
  // Index for date-based queries
  dateIdx: index('diagnostics_date_idx').on(table.metricDate)
}));

// ========================================
// COMPANY MEETINGS (Scoped by Company)
// ========================================

/**
 * Add company_id to existing meetings table via migration.
 * This extends the existing meetings table to support company-scoping.
 * Note: This will be added as an ALTER TABLE migration, not a new table.
 */

// ========================================
// RELATIONS
// ========================================

export const cloneProfilesRelations = relations(cloneProfiles, ({ one, many }) => ({
  creator: one(users, {
    fields: [cloneProfiles.createdByUserId],
    references: [users.id]
  }),
  assignments: many(companyCloneAssignments)
}));

export const companyCloneAssignmentsRelations = relations(companyCloneAssignments, ({ one, many }) => ({
  company: one(companies, {
    fields: [companyCloneAssignments.companyId],
    references: [companies.id]
  }),
  cloneProfile: one(cloneProfiles, {
    fields: [companyCloneAssignments.cloneProfileId],
    references: [cloneProfiles.id]
  }),
  manager: one(companyCloneAssignments, {
    fields: [companyCloneAssignments.managerAgentId],
    references: [companyCloneAssignments.id]
  }),
  subordinates: many(companyCloneAssignments),
  diagnostics: many(agentDiagnostics),
  knowledge: many(knowledgeLayers)
}));

export const knowledgeLayersRelations = relations(knowledgeLayers, ({ one }) => ({
  company: one(companies, {
    fields: [knowledgeLayers.companyId],
    references: [companies.id]
  }),
  assignment: one(companyCloneAssignments, {
    fields: [knowledgeLayers.assignmentId],
    references: [companyCloneAssignments.id]
  })
}));

export const agentDiagnosticsRelations = relations(agentDiagnostics, ({ one }) => ({
  assignment: one(companyCloneAssignments, {
    fields: [agentDiagnostics.assignmentId],
    references: [companyCloneAssignments.id]
  }),
  company: one(companies, {
    fields: [agentDiagnostics.companyId],
    references: [companies.id]
  })
}));

// ========================================
// ZOD SCHEMAS
// ========================================

export const insertCloneProfileSchema = createInsertSchema(cloneProfiles);
export const selectCloneProfileSchema = createSelectSchema(cloneProfiles);

export const insertCompanyCloneAssignmentSchema = createInsertSchema(companyCloneAssignments);
export const selectCompanyCloneAssignmentSchema = createSelectSchema(companyCloneAssignments);

export const insertKnowledgeLayerSchema = createInsertSchema(knowledgeLayers);
export const selectKnowledgeLayerSchema = createSelectSchema(knowledgeLayers);

export const insertAgentDiagnosticSchema = createInsertSchema(agentDiagnostics);
export const selectAgentDiagnosticSchema = createSelectSchema(agentDiagnostics);
