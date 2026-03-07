import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, serial, text, timestamp, numeric, decimal, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { type InferModel } from 'drizzle-orm';
import { goals, goalsRelations, tasks, tasksRelations, activityLog, activityLogRelations, meetingPurposes, meetingPurposesRelations, agentRoleTemplates, taskDependencies, taskDependenciesRelations } from "./schema/tasks";
import { tenants } from "./schema/tenants";
import { eceUsers } from "./schema/ece";

// Export payment gateway tables
export * from "./schema/payments";

// Export expert clone platform tables
export * from "./schema/expert_clones";

// Export personal clone agent system tables
export * from "./schema/personal_clones";

// Export unified expert clones hub (Phase 1 - New Architecture)
export * from "./schema/unified_expert_clones";

// Export governance and wallet tables
export * from "./schema/governance";

// Export digital company entities (Channels, Sales, Marketing)
export * from "./schema/digital_company";

// Export ECE (Exportunity Commodities Exchange) platform tables
export * from "./schema/ece";

// Export Uberized Delivery System tables
export * from "./schema/delivery";

// Export Marketplace (Sellers, Products, Orders, Territories, Franchisees)
export * from "./schema/marketplace";

// Export Agent Economy (Wallets, Credits, CFO Decisions)
export * from "./schema/agent-economy";

// Export AgentOS (LLM-last, memory, templates, playbooks)
export * from "./schema/agent-os";

// Export agent photo generation history
export * from "./schema/agent-photos";

// Export production agent allowlist (industrialized deployments)
export * from "./schema/agents-production";

// Export Script Registry (script-first autonomy)
export * from "./schema/script-registry";

// Export image assets (Replicate pipeline)
export * from "./schema/image-assets";
// Export product image slots (multi-angle sets)
export * from "./schema/product-images";
// Export website settings
export * from "./schema/website-settings";
// Export agent keys
export * from "./schema/agent-keys";

// Export Admin Management (User Roles, Subscriptions, Applications, Workflows, Leads)
export * from "./schema/admin-management";

// Export tenant system tables
export * from "./schema/tenants";
export * from "./schema/tenant-sites";
export * from "./schema/tenant-users";
export * from "./schema/tenant-switch";
export * from "./schema/territories";
export * from "./schema/telemetry";
export * from "./schema/seo";
export * from "./schema/equipment-ops";
export * from "./schema/mine";
export * from "./schema/cadastre";

// Export Gold Exchange (Bureau d'Achat, Offers, Wallets, Orders, Delivery)
export * from "./schema/gold-exchange";

// Export Stamped Gold (SKU+Item inventory, jeweller pickup, verification scans)
export * from "./schema/stamped-gold";

// Export Wallet OS (global credits ledger + vouchers + payouts)
export * from "./schema/wallet-os";

// Export Digital Contract module (Investment ↔ Mine ↔ Bureau d’Achat)
export * from "./schema/digital-contracts";

// Export WhatsApp integration tables
export * from "./schema/whatsapp";

// Export message templates (cheap reply engine)
export * from "./schema/message-templates";

// Export internal mail engine (per-tenant agent mailboxes)
export * from "./schema/mail-engine";

// Export email admin tables (human mailboxes/domains/aliases)
export * from "./schema/email-admin";

// Export Engineering Kernel (autonomous machine compilation + execution)
export * from "./schema/engineering-kernel";

// Export public contact messages (marketing forms)
export * from "./schema/contact";
// Export marketing CMS + media discovery tables
export * from "./schema/marketing-cms";
// Export investment opportunities + investor lead capture tables
export * from "./schema/investment";
// Export marketing talk desk (lead chat)
export * from "./schema/chat-desk";

// Export shared communications tables (SMS/WhatsApp/Twilio, etc.)
export * from "./schema/communications";

// Export notifications (omni-channel delivery logs)
export * from "./schema/notifications";

// Export Mindbase (creator profiles + intellect marketplace)
export * from "./schema/mindbase";
// Export Maison en Terre tenant commerce/cms tables
export * from "./schema/met";

// Export Action Router tables (background action requests + results)
export * from "./schema/actions";

// Export Exportunity Meet (self-hosted SFU meetings + invites/artifacts)
export * from "./schema/meet";

// Export Ops comms tables (internal channels/DMs/cases)
export * from "./schema/ops-comms";

// Export agent task runner tables (headless agents + logs)
export * from "./schema/agent-tasks";

// Export governed intelligence hierarchy tables (policy matrix + cron army + audit ledger)
export * from "./schema/intelligence-governance";
// Export model gateway tables (local/external model routing + policy + logs + evals)
export * from "./schema/model-gateway";

// Message type enum and values
const MESSAGE_TYPES = ['chat', 'system', 'notification', 'thought'] as const;
export type MessageType = typeof MESSAGE_TYPES[number];

// ========================================
// GLOBAL GEOLOCATION HIERARCHY
// ========================================

// Countries table
export const countries = pgTable('countries', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // ISO 3166-1 alpha-2
  name: text('name').notNull(),
  dialCode: text('dial_code'), // +1, +971, +33, etc.
  currency: text('currency'),
  timezone: text('timezone'),
  metadata: jsonb('metadata').$type<{
    capital?: string;
    continent?: string;
    languages?: string[];
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow()
});

// Regions/States/Provinces table
export const regions = pgTable('regions', {
  id: serial('id').primaryKey(),
  countryId: integer('country_id').references(() => countries.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  code: text('code'), // State/province code
  type: text('type', { enum: ['state', 'province', 'region', 'territory'] }).default('region'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow()
});

// Cities table
export const cities = pgTable('cities', {
  id: serial('id').primaryKey(),
  regionId: integer('region_id').references(() => regions.id, { onDelete: 'cascade' }).notNull(),
  countryId: integer('country_id').references(() => countries.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  latitude: decimal('latitude', { precision: 10, scale: 7 }),
  longitude: decimal('longitude', { precision: 10, scale: 7 }),
  population: integer('population'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow()
});

// Districts/Communes table
export const districts = pgTable('districts', {
  id: serial('id').primaryKey(),
  cityId: integer('city_id').references(() => cities.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  type: text('type', { enum: ['district', 'commune', 'borough', 'ward'] }).default('district'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow()
});

// Neighborhoods table
export const neighborhoods = pgTable('neighborhoods', {
  id: serial('id').primaryKey(),
  districtId: integer('district_id').references(() => districts.id, { onDelete: 'cascade' }).notNull(),
  cityId: integer('city_id').references(() => cities.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  latitude: decimal('latitude', { precision: 10, scale: 7 }),
  longitude: decimal('longitude', { precision: 10, scale: 7 }),
  isCustom: boolean('is_custom').default(false), // User-created neighborhood
  boundaries: jsonb('boundaries').$type<{
    type: 'Polygon';
    coordinates: number[][][];
  }>(),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow()
});

// ========================================
// USERS & COMPANIES
// ========================================

// Users table (Chairman/Investors)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  displayName: text('display_name').notNull(),
  email: text('email'),
  
  // Username for P2P transfers (like @cashapp or venmo)
  username: text('username').unique(),
  
  // Phone Identity
  phoneNumber: text('phone_number'),
  phoneCountryCode: text('phone_country_code'),
  phoneVerified: boolean('phone_verified').default(false),
  phoneVerifiedAt: timestamp('phone_verified_at'),
  
  role: text('role', { enum: ['chairman', 'investor', 'admin'] }).notNull().default('chairman'),
  accountType: text('account_type').notNull().default('Chairman'),
  language: text('language').default('en'),
  timezone: text('timezone').default('UTC'),
  
  // QR Code
  qrCode: text('qr_code'),
  qrCodeUrl: text('qr_code_url'),
  
  preferences: jsonb('preferences').$type<{
    vision?: string;
    preferredMarkets?: string[];
    preferredStyle?: string;
    riskAppetite?: string;
    keyProjects?: string[];
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Companies table (multi-tenant) - Enhanced with complete business profile
export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  
  // Basic Information
  name: text('name').notNull(),
  logo: text('logo'),
  description: text('description'),
  
  // Phone Identity
  phoneNumber: text('phone_number'),
  phoneCountryCode: text('phone_country_code'),
  phoneVerified: boolean('phone_verified').default(false),
  phoneVerifiedAt: timestamp('phone_verified_at'),
  alternativePhones: jsonb('alternative_phones').$type<string[]>().default([]),
  
  // Geolocation (Hierarchical)
  neighborhoodId: integer('neighborhood_id'),
  districtId: integer('district_id'),
  cityId: integer('city_id'),
  regionId: integer('region_id'),
  countryId: integer('country_id'),
  
  // GPS Coordinates
  latitude: decimal('latitude', { precision: 10, scale: 7 }),
  longitude: decimal('longitude', { precision: 10, scale: 7 }),
  address: text('address'),
  postalCode: text('postal_code'),
  
  // QR Code
  qrCode: text('qr_code'),
  qrCodeUrl: text('qr_code_url'),
  
  // Visibility
  publicVisibility: boolean('public_visibility').default(true),
  marketplaceEnabled: boolean('marketplace_enabled').default(false),
  
  // Registration & Legal
  country: text('country').notNull().default('US'),
  legalType: text('legal_type', { 
    enum: ['LLC', 'FZ-LLC', 'SA', 'SARL', 'FZE', 'Inc', 'Corp', 'LTD', 'Other'] 
  }).default('LLC'),
  registrationNumber: text('registration_number'),
  registrationDate: timestamp('registration_date'),
  
  // Sector & Industry
  primarySector: text('primary_sector', {
    enum: ['trade_export', 'gold_metals', 'education', 'logistics', 'construction', 
           'architecture', 'technology', 'retail', 'media', 'agriculture', 'real_estate', 'other']
  }).default('technology'),
  secondarySector: text('secondary_sector', {
    enum: ['trade_export', 'gold_metals', 'education', 'logistics', 'construction', 
           'architecture', 'technology', 'retail', 'media', 'agriculture', 'real_estate', 'other']
  }),
  industryTags: jsonb('industry_tags').$type<string[]>().default([]),
  
  // Vision & Strategy
  vision: text('vision'),
  currentGoals: jsonb('current_goals').$type<string[]>().default([]),
  kpiTargets: jsonb('kpi_targets').$type<{
    revenue?: number;
    leads?: number;
    dealsClosed?: number;
    actionsExecuted?: number;
    meetingsHeld?: number;
    autonomousTasks?: number;
  }>().default({}),
  
  // Budget & Finance
  monthlyBudget: decimal('monthly_budget', { precision: 10, scale: 2 }).notNull().default('1000.00'),
  budgetUsed: decimal('budget_used', { precision: 10, scale: 2 }).notNull().default('0.00'),
  dailyCashBurnTarget: decimal('daily_cash_burn_target', { precision: 10, scale: 2 }).default('50.00'),
  tokenUsageLimit: integer('token_usage_limit').default(1000000),
  
  // Revenue Tracking
  totalRevenue: decimal('total_revenue', { precision: 10, scale: 2 }).notNull().default('0.00'),
  totalProfit: decimal('total_profit', { precision: 10, scale: 2 }).notNull().default('0.00'),
  totalExpenses: decimal('total_expenses', { precision: 10, scale: 2 }).notNull().default('0.00'),
  
  // AI Behavior Settings
  autonomyLevel: text('autonomy_level', { 
    enum: ['low', 'medium', 'high', 'full'] 
  }).default('medium'),
  riskAppetite: text('risk_appetite', { 
    enum: ['conservative', 'moderate', 'bold'] 
  }).default('moderate'),
  creativity: text('creativity', { 
    enum: ['low', 'medium', 'high'] 
  }).default('medium'),
  strictness: text('strictness', { 
    enum: ['relaxed', 'balanced', 'strict'] 
  }).default('balanced'),
  
  // Status & Management
  status: text('status', { enum: ['active', 'testing', 'paused', 'archived'] }).notNull().default('active'),
  parentCompanyId: integer('parent_company_id').references((): any => companies.id),
  
  // Theme & Customization
  themeColor: text('theme_color').default('#3B82F6'),
  
  // Metadata & Lifecycle
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Departments table (org structure for each company)
export const departments = pgTable('departments', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').default('#6B7280'),
  order: integer('order').default(0),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Company Shareholding table (shareholders and investors)
export const companyShareholders = pgTable('company_shareholders', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  shareholderName: text('shareholder_name').notNull(),
  shareholderType: text('shareholder_type', { 
    enum: ['founder', 'investor', 'employee', 'strategic', 'other'] 
  }).notNull().default('investor'),
  sharePercentage: decimal('share_percentage', { precision: 5, scale: 2 }).notNull(),
  role: text('role'),
  walletAddress: text('wallet_address'),
  distributionMode: text('distribution_mode', { 
    enum: ['automatic', 'manual', 'none'] 
  }).default('manual'),
  metadata: jsonb('metadata').$type<{
    investmentDate?: string;
    investmentAmount?: number;
    boardSeat?: boolean;
    votingRights?: boolean;
    notes?: string;
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Company KPIs table (company-level performance metrics)
export const companyKpis = pgTable('company_kpis', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  kpiName: text('kpi_name').notNull(),
  kpiValue: decimal('kpi_value', { precision: 15, scale: 2 }).notNull(),
  period: text('period', { enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] }).notNull().default('monthly'),
  target: decimal('target', { precision: 15, scale: 2 }),
  category: text('category', { 
    enum: ['revenue', 'leads', 'deals', 'meetings', 'actions', 'autonomous_tasks', 'ai_cost', 'efficiency', 'other'] 
  }).default('other'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow()
});

// Revenue Transactions table (track all revenue events)
export const revenueTransactions = pgTable('revenue_transactions', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  type: text('type', { 
    enum: ['sale', 'subscription', 'service', 'commission', 'refund', 'adjustment', 'other'] 
  }).notNull(),
  direction: text('direction', {
    enum: ['credit', 'debit']
  }).notNull().default('credit'),
  source: text('source'),
  description: text('description'),
  
  // Location Tracking
  sellerNeighborhoodId: integer('seller_neighborhood_id'),
  sellerCityId: integer('seller_city_id'),
  sellerCountryId: integer('seller_country_id'),
  buyerNeighborhoodId: integer('buyer_neighborhood_id'),
  buyerCityId: integer('buyer_city_id'),
  buyerCountryId: integer('buyer_country_id'),
  originLatitude: decimal('origin_latitude', { precision: 10, scale: 7 }),
  originLongitude: decimal('origin_longitude', { precision: 10, scale: 7 }),
  distance: decimal('distance', { precision: 10, scale: 2 }), // km
  localCurrency: text('local_currency'),
  exchangeRate: decimal('exchange_rate', { precision: 10, scale: 4 }),
  
  metadata: jsonb('metadata').$type<{
    clientName?: string;
    dealId?: string;
    agentId?: number;
    recurringPeriod?: string;
    productId?: number;
    serviceId?: number;
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow()
});

// Products table (for marketplace)
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category'),
  price: decimal('price', { precision: 15, scale: 2 }).notNull(),
  currency: text('currency').default('USD'),
  images: jsonb('images').$type<string[]>().default([]),
  stock: integer('stock').default(0),
  isActive: boolean('is_active').default(true),
  
  // QR Code
  qrCode: text('qr_code'),
  qrCodeUrl: text('qr_code_url'),
  
  // Location (inherits from company by default)
  availableInNeighborhoods: jsonb('available_in_neighborhoods').$type<number[]>().default([]),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Services table (for marketplace)
export const services = pgTable('services', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category'),
  price: decimal('price', { precision: 15, scale: 2 }).notNull(),
  currency: text('currency').default('USD'),
  duration: integer('duration'), // minutes
  isActive: boolean('is_active').default(true),
  
  // QR Code
  qrCode: text('qr_code'),
  qrCodeUrl: text('qr_code_url'),
  
  // Service Area
  serviceRadius: decimal('service_radius', { precision: 10, scale: 2 }), // km
  availableInNeighborhoods: jsonb('available_in_neighborhoods').$type<number[]>().default([]),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Agents table (updated with company, hierarchy, budget, and HR-style profile fields)
export const agents = pgTable('agents', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  departmentId: integer('department_id').references(() => departments.id, { onDelete: 'set null' }),
  managerId: integer('manager_id').references((): any => agents.id),
  env: text('env', { enum: ['prod', 'staging', 'dev'] }).notNull().default('prod'),
  isTest: boolean('is_test').notNull().default(false),
  isVisible: boolean('is_visible').notNull().default(true),
  name: text('name').notNull(),
  displayName: text('display_name'),
  role: text('role').notNull(),
  hierarchyLevel: text('hierarchy_level', { enum: ['executor', 'manager', 'director', 'super'] }).notNull().default('executor'),
  intelligenceCap: text('intelligence_cap', { enum: ['LOW', 'MEDIUM', 'HIGH', 'UNLIMITED'] }).notNull().default('LOW'),
  maxContextTokens: integer('max_context_tokens').notNull().default(4096),
  maxDailyTokens: integer('max_daily_tokens').notNull().default(10000),
  isSuperAgent: boolean('is_super_agent').notNull().default(false),
  tokenMultiplier: decimal('token_multiplier', { precision: 6, scale: 2 }).notNull().default('1.00'),
  isDepartmentHead: boolean('is_department_head').default(false),
  status: text('status', { enum: ['active', 'inactive', 'paused', 'archived'] }).notNull().default('active'),
  avatar: text('avatar'),
  avatarUrl: text('avatar_url'),
  isTerminalDefault: boolean('is_terminal_default').notNull().default(false),

  // Agent photo (product-image pipeline)
  photoAssetId: uuid("photo_asset_id"),
  photoPrompt: text("photo_prompt"),
  photoLocked: boolean("photo_locked").notNull().default(false),
  photoUpdatedAt: timestamp("photo_updated_at"),
  photoUpdatedBy: text("photo_updated_by"),
  
  // HR-style Personal Information
  birthday: timestamp('birthday'),
  country: text('country'),
  timezone: text('timezone').default('UTC'),
  languages: jsonb('languages').$type<string[]>().default([]),
  
  // CV / Background
  cv: text('cv'),
  skills: jsonb('skills').$type<string[]>().default([]),
  industryFocus: jsonb('industry_focus').$type<string[]>().default([]),
  
  // Personality Profile
  personality: jsonb('personality').$type<{
    tone?: 'formal' | 'friendly' | 'neutral';
    riskTolerance?: 'conservative' | 'moderate' | 'bold';
    speed?: 'deliberate' | 'moderate' | 'fast';
    detailLevel?: 'high_level' | 'moderate' | 'very_detailed';
  }>().default({}),
  
  // Job Description & KPIs
  mission: text('mission'),
  responsibilities: jsonb('responsibilities').$type<string[]>().default([]),
  kpiTargets: jsonb('kpi_targets').$type<Record<string, number>>().default({}),
  
  // Tools & Permissions
  permissions: jsonb('permissions').$type<{
    email?: boolean;
    calendar?: boolean;
    crm?: boolean;
    knowledge?: boolean;
    payments?: boolean;
    webResearch?: boolean;
  }>().default({}),
  
  // Autonomy Settings
  autonomyLevel: text('autonomy_level', { enum: ['draft_only', 'partial', 'full'] }).default('partial'),
  approvalRules: jsonb('approval_rules').$type<Record<string, any>>().default({}),
  
  // Role-based Context Windows
  roleLevel: integer('role_level').default(1),
  contextWindowTokens: integer('context_window_tokens').default(4000),
  decisionAuthority: text('decision_authority', { enum: ['low', 'medium', 'high', 'executive'] }).default('low'),
  canApproveBelow: boolean('can_approve_below').default(false),
  communicationStyle: jsonb('communication_style').$type<{
    tone?: 'formal' | 'friendly' | 'neutral' | 'direct';
    verbosity?: 'concise' | 'moderate' | 'detailed';
    emoji?: boolean;
  }>().default({}),
  
  // Lifecycle
  hiredDate: timestamp('hired_date').defaultNow(),
  promotedDate: timestamp('promoted_date'),
  
  // Budget & Capabilities
  capabilities: jsonb('capabilities').default([]),
  baseBudget: decimal('base_budget', { precision: 10, scale: 2 }).notNull().default('100.00'),
  budgetUsed: decimal('budget_used', { precision: 10, scale: 2 }).notNull().default('0.00'),
  budgetBonus: decimal('budget_bonus', { precision: 10, scale: 2 }).notNull().default('0.00'),
  metadata: jsonb('metadata').default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export { goals, goalsRelations, tasks, tasksRelations, activityLog, activityLogRelations, meetingPurposes, meetingPurposesRelations, agentRoleTemplates, taskDependencies, taskDependenciesRelations };

// Cost transactions table (tracks all costs per agent)
export const costTransactions = pgTable('cost_transactions', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['llm_tokens', 'api_call', 'email', 'calendar', 'linkedin', 'crm', 'other'] }).notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  tokenCount: integer('token_count'),
  metadata: jsonb('metadata').$type<{
    model?: string;
    endpoint?: string;
    operation?: string;
    details?: any;
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow()
});

// Agent KPIs table (tracks performance metrics)
export const agentKpis = pgTable('agent_kpis', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
  kpiName: text('kpi_name').notNull(),
  kpiValue: decimal('kpi_value', { precision: 10, scale: 2 }).notNull(),
  period: text('period', { enum: ['daily', 'weekly', 'monthly'] }).notNull().default('monthly'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow()
});

// Budget adjustments table (tracks budget changes over time)
export const budgetAdjustments = pgTable('budget_adjustments', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
  oldBudget: decimal('old_budget', { precision: 10, scale: 2 }).notNull(),
  newBudget: decimal('new_budget', { precision: 10, scale: 2 }).notNull(),
  adjustmentAmount: decimal('adjustment_amount', { precision: 10, scale: 2 }).notNull(),
  reason: text('reason', { enum: ['performance', 'manual', 'kpi_threshold', 'budget_reduction'] }).notNull(),
  adjustedBy: text('adjusted_by'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow()
});

// Export Drizzle inferred types
export type Company = InferModel<typeof companies>;
export type Department = InferModel<typeof departments>;
export type CompanyShareholder = InferModel<typeof companyShareholders>;
export type CompanyKpi = InferModel<typeof companyKpis>;
export type RevenueTransaction = InferModel<typeof revenueTransactions>;
export type Agent = InferModel<typeof agents>;
export type Task = InferModel<typeof tasks>;
export type Message = InferModel<typeof messages>;
export type ChatRoom = InferModel<typeof chatRooms>;
export type RoomMembership = InferModel<typeof roomMemberships>;
export type Thread = InferModel<typeof threads>;
export type Meeting = InferModel<typeof meetings>;
export type MeetingRoom = InferModel<typeof meetingRooms>;
export type MeetingParticipant = InferModel<typeof meetingParticipants>;
export type TokenTransaction = InferModel<typeof tokenTransactions>;
export type Memory = InferModel<typeof memories>;
export type CostTransaction = InferModel<typeof costTransactions>;
export type AgentKpi = InferModel<typeof agentKpis>;
export type BudgetAdjustment = InferModel<typeof budgetAdjustments>;


// Chat rooms table with dynamic naming support
export const chatRooms = pgTable('chat_rooms', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['general', 'meeting', 'task'] }).notNull().default('general'),
  description: text('description'),
  moderatorId: integer('moderator_id').references(() => agents.id),
  
  // Dynamic conversation naming
  currentTitle: text('current_title'),
  previousTitles: jsonb('previous_titles').$type<Array<{ title: string; changedAt: string; reason?: string }>>().default([]),
  topicTags: jsonb('topic_tags').$type<string[]>().default([]),
  ownerAgentId: integer('owner_agent_id').references(() => agents.id),
  titleLastUpdated: timestamp('title_last_updated'),
  
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata').default({}),
  conversationId: text('conversation_id').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Messages table
export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  clientMessageId: text('client_message_id'),
  inReplyToClientMessageId: text('in_reply_to_client_message_id'),
  content: text('content').notNull(),
  fromAgentId: integer('from_agent_id').references(() => agents.id),
  toAgentId: integer('to_agent_id').references(() => agents.id),
  type: text('type', { enum: MESSAGE_TYPES }).notNull().default('chat'),
  status: text('status', { enum: ['sending', 'sent', 'delivered', 'read', 'error'] }).notNull().default('sending'),
  deliveredAt: timestamp('delivered_at'),
  readAt: timestamp('read_at'),
  metadata: jsonb('metadata').default({}),
  conversationId: text('conversation_id').references(() => chatRooms.conversationId),
  createdAt: timestamp('created_at').defaultNow()
});

// Room memberships table
export const roomMemberships = pgTable('room_memberships', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').references(() => chatRooms.id, { onDelete: 'cascade' }),
  agentId: integer('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at').defaultNow(),
  role: text('role', { enum: ['member', 'moderator', 'observer'] }).default('member'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Define relationships
export const chatRoomRelations = relations(chatRooms, ({ many, one }) => ({
  messages: many(messages),
  memberships: many(roomMemberships),
  moderator: one(agents, {
    fields: [chatRooms.moderatorId],
    references: [agents.id]
  })
}));

export const usersRelations = relations(users, ({ many }) => ({
  companies: many(companies)
}));

export const companyRelations = relations(companies, ({ many, one }) => ({
  user: one(users, {
    fields: [companies.userId],
    references: [users.id]
  }),
  departments: many(departments),
  agents: many(agents),
  costTransactions: many(costTransactions),
  shareholders: many(companyShareholders),
  kpis: many(companyKpis),
  revenueTransactions: many(revenueTransactions),
  subsidiaries: many(companies, { relationName: 'subsidiaries' }),
  parentCompany: one(companies, {
    fields: [companies.parentCompanyId],
    references: [companies.id],
    relationName: 'subsidiaries'
  })
}));

export const departmentRelations = relations(departments, ({ many, one }) => ({
  company: one(companies, {
    fields: [departments.companyId],
    references: [companies.id]
  }),
  agents: many(agents)
}));

export const companyShareholderRelations = relations(companyShareholders, ({ one }) => ({
  company: one(companies, {
    fields: [companyShareholders.companyId],
    references: [companies.id]
  })
}));

export const companyKpiRelations = relations(companyKpis, ({ one }) => ({
  company: one(companies, {
    fields: [companyKpis.companyId],
    references: [companies.id]
  })
}));

export const revenueTransactionRelations = relations(revenueTransactions, ({ one }) => ({
  company: one(companies, {
    fields: [revenueTransactions.companyId],
    references: [companies.id]
  })
}));

export const agentRelations = relations(agents, ({ many, one }) => ({
  company: one(companies, {
    fields: [agents.companyId],
    references: [companies.id]
  }),
  department: one(departments, {
    fields: [agents.departmentId],
    references: [departments.id]
  }),
  manager: one(agents, {
    fields: [agents.managerId],
    references: [agents.id],
    relationName: 'manager'
  }),
  subordinates: many(agents, { relationName: 'manager' }),
  sentMessages: many(messages, { relationName: 'fromAgent' }),
  receivedMessages: many(messages, { relationName: 'toAgent' }),
  memberships: many(roomMemberships),
  costTransactions: many(costTransactions),
  kpis: many(agentKpis),
  budgetAdjustments: many(budgetAdjustments)
}));

export const costTransactionRelations = relations(costTransactions, ({ one }) => ({
  agent: one(agents, {
    fields: [costTransactions.agentId],
    references: [agents.id]
  }),
  company: one(companies, {
    fields: [costTransactions.companyId],
    references: [companies.id]
  })
}));

export const agentKpiRelations = relations(agentKpis, ({ one }) => ({
  agent: one(agents, {
    fields: [agentKpis.agentId],
    references: [agents.id]
  })
}));

export const budgetAdjustmentRelations = relations(budgetAdjustments, ({ one }) => ({
  agent: one(agents, {
    fields: [budgetAdjustments.agentId],
    references: [agents.id]
  })
}));

export const messageRelations = relations(messages, ({ one }) => ({
  fromAgent: one(agents, {
    fields: [messages.fromAgentId],
    references: [agents.id],
    relationName: 'fromAgent'
  }),
  toAgent: one(agents, {
    fields: [messages.toAgentId],
    references: [agents.id],
    relationName: 'toAgent'
  }),
  chatRoom: one(chatRooms, {
    fields: [messages.conversationId],
    references: [chatRooms.conversationId]
  })
}));

export const roomMembershipRelations = relations(roomMemberships, ({ one }) => ({
  room: one(chatRooms, {
    fields: [roomMemberships.roomId],
    references: [chatRooms.id]
  }),
  agent: one(agents, {
    fields: [roomMemberships.agentId],
    references: [agents.id]
  })
}));


// Thread table for conversation branching
export const threads = pgTable('threads', {
  id: serial('id').primaryKey(),
  parentThreadId: integer('parent_thread_id').references((): any => threads.id),
  roomId: integer('room_id').references(() => chatRooms.id),
  topic: text('topic'),
  status: text('status', { enum: ['active', 'archived', 'merged'] }).notNull().default('active'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Thread relations
export const threadRelations = relations(threads, ({ many, one }) => ({
  messages: many(messages),
  parentThread: one(threads, {
    fields: [threads.parentThreadId],
    references: [threads.id]
  }),
  room: one(chatRooms, {
    fields: [threads.roomId],
    references: [chatRooms.id]
  })
}));


// Token transactions table
export const tokenTransactions = pgTable('token_transactions', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').references(() => agents.id),
  amount: integer('amount').notNull(),
  type: text('type', { enum: ['earned', 'spent'] }).notNull(),
  description: text('description'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow()
});

// Availability Status
export type AvailabilityStatus = "available" | "busy" | "tentative" | "out_of_office";

// Agent availability table
export const agentAvailability = pgTable("agent_availability", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agents.id, { onDelete: 'cascade' }),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  status: text("status", { enum: ["available", "busy", "tentative", "out_of_office"] })
    .notNull()
    .default("available"),
  recurrence: jsonb("recurrence").default({}),
  meetingId: integer("meeting_id").references(() => meetings.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Add relations for agent availability
export const agentAvailabilityRelations = relations(agentAvailability, ({ one }) => ({
  agent: one(agents, {
    fields: [agentAvailability.agentId],
    references: [agents.id],
  }),
  meeting: one(meetings, {
    fields: [agentAvailability.meetingId],
    references: [meetings.id],
  }),
}));

// Meetings table with all required fields
export const meetings = pgTable('meetings', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id'), // Multi-tenant scope (null = legacy/global)
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }), // Added for company-scoping
  title: text('title').notNull(),
  description: text('description'),
  roomId: integer('room_id').references(() => meetingRooms.id),
  meetingType: text('meeting_type').default('general'),
  type: text('type', { enum: ['scheduled', 'spontaneous'] }).notNull(),
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time'),
  duration: integer('duration'),
  actualStartAt: timestamp('actual_start_at'),
  actualEndAt: timestamp('actual_end_at'),
  organizerId: integer('organizer_id').references(() => agents.id),
  status: text('status', { enum: ['scheduled', 'in_progress', 'completed', 'cancelled'] }).notNull(),
  conversationId: text('conversation_id').notNull(),
  summaryMd: text('summary_md'),
  notesMd: text('notes_md'),
  metadata: jsonb('metadata').$type<{
    summary?: string;
    agenda?: string;
    notes?: string;
    lastUpdated?: string;
    createdVia?: string;
    category?: string;
    color?: string;
    location?: string;
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Add meeting relations
export const meetingRelations = relations(meetings, ({ many, one }) => ({
  company: one(companies, {
    fields: [meetings.companyId],
    references: [companies.id],
  }),
  participants: many(meetingParticipants),
  room: one(meetingRooms, {
    fields: [meetings.roomId],
    references: [meetingRooms.id],
  }),
  organizer: one(agents, {
    fields: [meetings.organizerId],
    references: [agents.id],
  }),
}));

// Memories table
export const memories = pgTable('memories', {
  id: serial('id').primaryKey(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Meeting rooms table
export const meetingRooms = pgTable('meeting_rooms', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id'), // Multi-tenant scope (null = legacy/global)
  name: text('name').notNull(),
  capacity: integer('capacity').notNull(),
  capacityHumans: integer('capacity_humans'),
  location: text('location'),
  locationLabel: text('location_label'),
  timezone: text('timezone').default('UTC'),
  isVirtual: boolean('is_virtual').notNull().default(true),
  defaultAgentsJson: jsonb('default_agents_json'),
  features: jsonb('features').default({}),
  isAvailable: boolean('is_available').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Meeting participants table
export const meetingParticipants = pgTable('meeting_participants', {
  id: serial('id').primaryKey(),
  meetingId: integer('meeting_id').references(() => meetings.id, { onDelete: 'cascade' }),
  tenantId: integer('tenant_id'), // Multi-tenant scope (null = legacy/global)
  participantType: text('participant_type', { enum: ['human', 'agent'] }).notNull().default('agent'),
  userId: integer('user_id'),
  guestEmail: text('guest_email'),
  agentId: integer('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['host', 'facilitator', 'note_taker', 'participant', 'observer', 'decision_owner'] }).notNull().default('participant'),
  required: boolean('required').notNull().default(true),
  invitedAt: timestamp('invited_at'),
  joinedAt: timestamp('joined_at'),
  leftAt: timestamp('left_at'),
  status: text('status', { enum: ['invited', 'present', 'absent', 'left_early', 'unknown'] }).notNull().default('invited'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const meetingDecisions = pgTable("meeting_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: integer("tenant_id"),
  meetingId: integer("meeting_id")
    .references(() => meetings.id, { onDelete: "cascade" })
    .notNull(),
  decisionText: text("decision_text").notNull(),
  ownerType: text("owner_type", { enum: ["human", "agent", "none"] }).notNull().default("none"),
  ownerUserId: integer("owner_user_id"),
  ownerAgentId: integer("owner_agent_id").references(() => agents.id, { onDelete: "set null" }),
  dueDate: timestamp("due_date"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Chairman's Daily Diary System Tables

// ChatDay - Day-based conversation container
export const chatDays = pgTable('chat_days', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'set null' }),
  date: text('date').notNull(), // Format: YYYY-MM-DD
  messageCount: integer('message_count').notNull().default(0),
  metadata: jsonb('metadata').$type<{
    topics?: string[];
    firstMessageAt?: string;
    lastMessageAt?: string;
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ChairmanMessages - Individual messages within a ChatDay
export const chairmanMessages = pgTable('chairman_messages', {
  id: serial('id').primaryKey(),
  chatDayId: integer('chat_day_id').references(() => chatDays.id, { onDelete: 'cascade' }).notNull(),
  sender: text('sender', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata').$type<{
    model?: string;
    tokens?: number;
    cost?: number;
    intent?: string;
    audioUrl?: string;
    voice?: string;
    reasoning?: string;
    needsDeepThinking?: boolean;
    intentDetected?: boolean;
    intentType?: string;
    intentAction?: string;
  }>().default({}),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  createdAt: timestamp('created_at').defaultNow()
});

// DailySummaries - AI-generated summaries of each ChatDay
export const dailySummaries = pgTable('daily_summaries', {
  id: serial('id').primaryKey(),
  chatDayId: integer('chat_day_id').references(() => chatDays.id, { onDelete: 'cascade' }).notNull().unique(),
  summaryText: text('summary_text').notNull(),
  keyDecisions: jsonb('key_decisions').$type<string[]>().default([]),
  keyTopics: jsonb('key_topics').$type<string[]>().default([]),
  actionItems: jsonb('action_items').$type<string[]>().default([]),
  metadata: jsonb('metadata').$type<{
    generatedBy?: string;
    generatedAt?: string;
    confidence?: number;
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// MemoryFacts - Extracted important facts for long-term context
export const memoryFacts = pgTable('memory_facts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'set null' }),
  dailySummaryId: integer('daily_summary_id').references(() => dailySummaries.id, { onDelete: 'cascade' }),
  type: text('type', { 
    enum: ['preference', 'goal', 'company_update', 'agent_update', 'decision', 'context', 'other'] 
  }).notNull(),
  content: text('content').notNull(),
  importance: text('importance', { enum: ['low', 'medium', 'high'] }).notNull().default('medium'),
  expiresAt: timestamp('expires_at'), // Optional expiration for time-sensitive facts
  metadata: jsonb('metadata').$type<{
    relatedAgentId?: number;
    relatedTaskId?: number;
    tags?: string[];
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ============================================================================
// UNIFIED CONVERSATION SYSTEM
// ============================================================================

// Conversations - Unified model for chats, meetings, and agent syncs
export const conversations = pgTable('conversations', {
  id: text('id').primaryKey().notNull(), // UUID generated by application
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'set null' }),
  date: text('date').notNull(), // YYYY-MM-DD for diary grouping
  startTime: timestamp('start_time'), // For scheduled conversations
  endTime: timestamp('end_time'),
  title: text('title').notNull(),
  type: text('type', { enum: ['chat', 'scheduled', 'agent-sync', 'chairman-daily'] }).notNull(),
  status: text('status', { enum: ['planned', 'ongoing', 'completed', 'cancelled'] }).notNull().default('ongoing'),
  createdBy: text('created_by', { enum: ['chairman', 'agent', 'system'] }).notNull().default('chairman'),
  messageCount: integer('message_count').notNull().default(0),
  metadata: jsonb('metadata').$type<{
    summary?: string;
    agenda?: string;
    keyDecisions?: string[];
    keyTopics?: string[];
    actionItems?: string[];
    previousTitles?: Array<{ title: string; changedAt: string; reason?: string }>;
    location?: string;
    recordingUrl?: string;
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ConversationParticipants - Unified participants for all conversation types
export const conversationParticipants = pgTable('conversation_participants', {
  id: serial('id').primaryKey(),
  conversationId: text('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  participantType: text('participant_type', { enum: ['chairman', 'agent', 'human_guest', 'system'] }).notNull(),
  participantId: integer('participant_id'), // References users.id (chairman) or agents.id depending on type
  participantName: text('participant_name').notNull(),
  participantAvatar: text('participant_avatar'),
  role: text('role', { enum: ['organizer', 'participant', 'observer'] }).notNull().default('participant'),
  status: text('status', { enum: ['invited', 'accepted', 'declined', 'active'] }).notNull().default('active'),
  joinedAt: timestamp('joined_at').defaultNow(),
  leftAt: timestamp('left_at'),
  metadata: jsonb('metadata').$type<{
    isChairmanAssistant?: boolean;
    notificationPreference?: string;
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow()
});

// ConversationMessages - Messages within conversations (extends existing messages concept)
export const conversationMessages = pgTable('conversation_messages', {
  id: serial('id').primaryKey(),
  conversationId: text('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  senderId: integer('sender_id'), // Can be userId or agentId
  senderType: text('sender_type', { enum: ['chairman', 'agent', 'system', 'guest'] }).notNull(),
  senderName: text('sender_name').notNull(),
  content: text('content').notNull(),
  messageType: text('message_type', { enum: ['chat', 'system', 'notification', 'thought'] }).notNull().default('chat'),
  metadata: jsonb('metadata').$type<{
    model?: string;
    tokens?: number;
    cost?: number;
    quotedMessageId?: number;
    attachments?: any[];
    audioUrl?: string;
    reasoning?: string;
    needsDeepThinking?: boolean;
    voice?: string;
    action?: string;
    namespace?: string;
    assetKey?: string;
    imageId?: string;
    imageUrl?: string | null;
  }>().default({}),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  createdAt: timestamp('created_at').defaultNow()

});

// ============================================================================
// CHAIRMAN ASSISTANT THREADS & ACTION RUNS (Hybrid Cutover)
// ============================================================================

export const assistantThreads = pgTable('assistant_threads', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  userId: integer('user_id').references(() => eceUsers.id, { onDelete: 'cascade' }).notNull(),
  assistantAgentId: integer('assistant_agent_id').references(() => agents.id, { onDelete: 'set null' }),
  assistantDisplayName: text('assistant_display_name'),
  assistantRole: text('assistant_role'),
  status: text('status').notNull().default('active'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const assistantMessages = pgTable('assistant_messages', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  threadId: integer('thread_id').references(() => assistantThreads.id, { onDelete: 'cascade' }).notNull(),
  senderType: text('sender_type', { enum: ['user', 'assistant', 'system'] }).notNull(),
  senderUserId: integer('sender_user_id').references(() => eceUsers.id, { onDelete: 'set null' }),
  senderAgentId: integer('sender_agent_id').references(() => agents.id, { onDelete: 'set null' }),
  senderName: text('sender_name'),
  content: text('content').notNull(),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
});

export const actionDefinitions = pgTable('action_definitions', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  actionKey: text('action_key').notNull(),
  name: text('name'),
  description: text('description'),
  category: text('category'),
  schema: jsonb('schema').default({}),
  defaultAssigneeRole: text('default_assignee_role'),
  isActive: boolean('is_active').notNull().default(true),
  version: integer('version').notNull().default(1),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const actionRuns = pgTable('action_runs', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  definitionId: integer('definition_id').references(() => actionDefinitions.id, { onDelete: 'set null' }),
  actionKey: text('action_key').notNull(),
  status: text('status').notNull().default('PENDING'),
  mode: text('mode').notNull().default('LIVE'),
  requestedByUserId: integer('requested_by_user_id').references(() => eceUsers.id, { onDelete: 'set null' }),
  requestedByAgentId: integer('requested_by_agent_id').references(() => agents.id, { onDelete: 'set null' }),
  assignedAgentId: integer('assigned_agent_id').references(() => agents.id, { onDelete: 'set null' }),
  defaultAssigneeRole: text('default_assignee_role'),
  threadId: integer('thread_id').references(() => assistantThreads.id, { onDelete: 'set null' }),
  messageId: integer('message_id').references(() => assistantMessages.id, { onDelete: 'set null' }),
  objectiveId: integer('objective_id').references(() => goals.id, { onDelete: 'set null' }),
  payload: jsonb('payload').default({}),
  result: jsonb('result'),
  error: text('error'),
  correlationId: text('correlation_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
});

export const actionEvidence = pgTable('action_evidence', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  runId: integer('run_id').references(() => actionRuns.id, { onDelete: 'cascade' }).notNull(),
  evidenceType: text('evidence_type'),
  payload: jsonb('payload').default({}),
  createdAt: timestamp('created_at').defaultNow(),
});

export const chairmanQuickTokens = pgTable('chairman_quick_tokens', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  userId: integer('user_id').references(() => eceUsers.id, { onDelete: 'cascade' }).notNull(),
  tokenPrefix: text('token_prefix').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  redeemedAt: timestamp('redeemed_at'),
  revokedAt: timestamp('revoked_at'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
});

// Relations for Daily Diary System
export const chatDayRelations = relations(chatDays, ({ many, one }) => ({
  messages: many(chairmanMessages),
  summary: one(dailySummaries),
  user: one(users, {
    fields: [chatDays.userId],
    references: [users.id]
  }),
  company: one(companies, {
    fields: [chatDays.companyId],
    references: [companies.id]
  })
}));

export const chairmanMessageRelations = relations(chairmanMessages, ({ one }) => ({
  chatDay: one(chatDays, {
    fields: [chairmanMessages.chatDayId],
    references: [chatDays.id]
  })
}));

export const dailySummaryRelations = relations(dailySummaries, ({ one, many }) => ({
  chatDay: one(chatDays, {
    fields: [dailySummaries.chatDayId],
    references: [chatDays.id]
  }),
  memoryFacts: many(memoryFacts)
}));

export const memoryFactRelations = relations(memoryFacts, ({ one }) => ({
  user: one(users, {
    fields: [memoryFacts.userId],
    references: [users.id]
  }),
  company: one(companies, {
    fields: [memoryFacts.companyId],
    references: [companies.id]
  }),
  dailySummary: one(dailySummaries, {
    fields: [memoryFacts.dailySummaryId],
    references: [dailySummaries.id]
  })
}));

// ========================================
// GEOLOCATION RELATIONS
// ========================================

export const countryRelations = relations(countries, ({ many }) => ({
  regions: many(regions),
  cities: many(cities),
  companies: many(companies)
}));

export const regionRelations = relations(regions, ({ one, many }) => ({
  country: one(countries, {
    fields: [regions.countryId],
    references: [countries.id]
  }),
  cities: many(cities)
}));

export const cityRelations = relations(cities, ({ one, many }) => ({
  region: one(regions, {
    fields: [cities.regionId],
    references: [regions.id]
  }),
  country: one(countries, {
    fields: [cities.countryId],
    references: [countries.id]
  }),
  districts: many(districts),
  neighborhoods: many(neighborhoods)
}));

export const districtRelations = relations(districts, ({ one, many }) => ({
  city: one(cities, {
    fields: [districts.cityId],
    references: [cities.id]
  }),
  neighborhoods: many(neighborhoods)
}));

export const neighborhoodRelations = relations(neighborhoods, ({ one }) => ({
  district: one(districts, {
    fields: [neighborhoods.districtId],
    references: [districts.id]
  }),
  city: one(cities, {
    fields: [neighborhoods.cityId],
    references: [cities.id]
  })
}));

// Products and Services Relations
export const productRelations = relations(products, ({ one }) => ({
  company: one(companies, {
    fields: [products.companyId],
    references: [companies.id]
  })
}));

export const serviceRelations = relations(services, ({ one }) => ({
  company: one(companies, {
    fields: [services.companyId],
    references: [companies.id]
  })
}));

// Relations for Unified Conversation System
export const conversationRelations = relations(conversations, ({ many, one }) => ({
  participants: many(conversationParticipants),
  messages: many(conversationMessages),
  company: one(companies, {
    fields: [conversations.companyId],
    references: [companies.id]
  })
}));

export const conversationParticipantRelations = relations(conversationParticipants, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationParticipants.conversationId],
    references: [conversations.id]
  })
}));

export const conversationMessageRelations = relations(conversationMessages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationMessages.conversationId],
    references: [conversations.id]
  })
}));

// Export types for TypeScript
export type ChatDay = InferModel<typeof chatDays>;
export type ChairmanMessage = InferModel<typeof chairmanMessages>;
export type DailySummary = InferModel<typeof dailySummaries>;
export type MemoryFact = InferModel<typeof memoryFacts>;
export type Conversation = InferModel<typeof conversations>;
export type ConversationParticipant = InferModel<typeof conversationParticipants>;
export type ConversationMessage = InferModel<typeof conversationMessages>;
export type AssistantThread = InferModel<typeof assistantThreads>;
export type AssistantMessage = InferModel<typeof assistantMessages>;
export type ActionDefinition = InferModel<typeof actionDefinitions>;
export type ActionRun = InferModel<typeof actionRuns>;
export type ActionEvidence = InferModel<typeof actionEvidence>;
export type ChairmanQuickToken = InferModel<typeof chairmanQuickTokens>;

// Create schemas for validation
export const insertAgentAvailabilitySchema = createInsertSchema(agentAvailability);
export const selectAgentAvailabilitySchema = createSelectSchema(agentAvailability);

// Knowledge Base - Spaces (Collections/Folders for organizing documents)
export const knowledgeSpaces = pgTable('knowledge_spaces', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').default('blue'),
  icon: text('icon'),
  metadata: jsonb('metadata').default({}),
  createdBy: integer('created_by').references(() => agents.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Knowledge Base - Documents (metadata and references to actual content)
export const knowledgeDocuments = pgTable('knowledge_documents', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  spaceId: integer('space_id').references(() => knowledgeSpaces.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  type: text('type', { enum: ['pdf', 'note', 'ai_doc', 'web_import', 'file'] }).notNull(),
  content: text('content'),
  url: text('url'),
  filePath: text('file_path'),
  fileName: text('file_name'),
  fileSize: integer('file_size'),
  mimeType: text('mime_type'),
  tags: jsonb('tags').$type<string[]>().default([]),
  metadata: jsonb('metadata').default({}),
  preview: text('preview'),
  createdBy: integer('created_by').references(() => agents.id),
  createdByType: text('created_by_type', { enum: ['human', 'agent'] }).default('agent'),
  sourceId: integer('source_id').references((): any => knowledgeSources.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Knowledge Base - Sources (External integrations like Google Drive, Notion, etc.)
export const knowledgeSources = pgTable('knowledge_sources', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  type: text('type', { enum: ['google_drive', 'notion', 'confluence', 'dropbox', 'slack'] }).notNull(),
  name: text('name').notNull(),
  connected: boolean('connected').notNull().default(false),
  credentials: jsonb('credentials').default({}),
  syncSettings: jsonb('sync_settings').$type<{
    autoSync?: boolean;
    syncFrequency?: string;
    lastSync?: string;
  }>().default({}),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Relations for Knowledge Base
export const knowledgeSpaceRelations = relations(knowledgeSpaces, ({ many, one }) => ({
  documents: many(knowledgeDocuments),
  company: one(companies, {
    fields: [knowledgeSpaces.companyId],
    references: [companies.id]
  }),
  createdByAgent: one(agents, {
    fields: [knowledgeSpaces.createdBy],
    references: [agents.id]
  })
}));

export const knowledgeDocumentRelations = relations(knowledgeDocuments, ({ one }) => ({
  space: one(knowledgeSpaces, {
    fields: [knowledgeDocuments.spaceId],
    references: [knowledgeSpaces.id]
  }),
  company: one(companies, {
    fields: [knowledgeDocuments.companyId],
    references: [companies.id]
  }),
  createdByAgent: one(agents, {
    fields: [knowledgeDocuments.createdBy],
    references: [agents.id]
  }),
  source: one(knowledgeSources, {
    fields: [knowledgeDocuments.sourceId],
    references: [knowledgeSources.id]
  })
}));

export const knowledgeSourceRelations = relations(knowledgeSources, ({ many, one }) => ({
  documents: many(knowledgeDocuments),
  company: one(companies, {
    fields: [knowledgeSources.companyId],
    references: [companies.id]
  })
}));

// Export types for TypeScript
export type KnowledgeSpace = InferModel<typeof knowledgeSpaces>;
export type KnowledgeDocument = InferModel<typeof knowledgeDocuments>;
export type KnowledgeSource = InferModel<typeof knowledgeSources>;

export const performanceMetrics = pgTable('performance_metrics', {
  id: serial('id').primaryKey(),
  metric: text('metric')
});

export const teamPerformance = pgTable('team_performance', {
  id: serial('id').primaryKey(),
  team: text('team'),
  score: integer('score')
});

export const interactionMetrics = pgTable('interaction_metrics', {
  id: serial('id').primaryKey(),
  interaction: text('interaction'),
  count: integer('count')
});
