import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, serial, text, timestamp, decimal, pgEnum } from "drizzle-orm/pg-core";
import { users } from "../schema";
import { applicationStatusEnum } from "./enums";

export { applicationStatusEnum };

export const aiDecisionEnum = pgEnum('ai_decision', [
  'approved', 'rejected', 'needs_review'
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trial', 'active', 'past_due', 'canceled', 'expired'
]);

export const subscriptionPlanTypeEnum = pgEnum('subscription_plan_type', [
  'shop', 'delivery_agent', 'mixed'
]);

export const workflowTypeEnum = pgEnum('workflow_type', [
  'shop_application', 'delivery_application', 'kyc_verification', 'role_upgrade'
]);

export const workflowStepTypeEnum = pgEnum('workflow_step_type', [
  'question', 'document_upload', 'ai_review', 'manual_review', 'payment', 'confirmation'
]);

export const leadStatusEnum = pgEnum('lead_status', [
  'new', 'contacted', 'responded', 'converted', 'disqualified', 'nurturing'
]);

export const leadSourceEnum = pgEnum('lead_source', [
  'google', 'instagram', 'tiktok', 'facebook', 'linkedin', 'directory', 'referral', 'website', 'manual'
]);

export const userRoles = pgTable('user_roles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  permissions: jsonb('permissions').$type<string[]>().default([]),
  isSystem: boolean('is_system').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const userRoleAssignments = pgTable('user_role_assignments', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  roleId: integer('role_id').references(() => userRoles.id, { onDelete: 'cascade' }).notNull(),
  assignedBy: integer('assigned_by').references(() => users.id),
  assignedAt: timestamp('assigned_at').defaultNow(),
  expiresAt: timestamp('expires_at'),
  isActive: boolean('is_active').default(true),
  metadata: jsonb('metadata').default({})
});

export const subscriptionPlans = pgTable('subscription_plans', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  type: subscriptionPlanTypeEnum('type').notNull().default('shop'),
  
  pricePerMonth: decimal('price_per_month', { precision: 10, scale: 2 }).notNull().default('0'),
  currency: text('currency').default('XOF'),
  
  maxProducts: integer('max_products'),
  maxOrdersPerMonth: integer('max_orders_per_month'),
  maxAiActionsPerMonth: integer('max_ai_actions_per_month'),
  
  commissionRate: decimal('commission_rate', { precision: 5, scale: 2 }).default('10.00'),
  
  features: jsonb('features').$type<{
    analytics?: boolean;
    aiAgentAccess?: boolean;
    prioritySupport?: boolean;
    customBranding?: boolean;
    apiAccess?: boolean;
    multiLocation?: boolean;
  }>().default({}),
  
  trialDays: integer('trial_days').default(0),
  isActive: boolean('is_active').default(true),
  sortOrder: integer('sort_order').default(0),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const userSubscriptions = pgTable('user_subscriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  planId: integer('plan_id').references(() => subscriptionPlans.id).notNull(),
  
  status: subscriptionStatusEnum('status').notNull().default('trial'),
  
  startDate: timestamp('start_date').defaultNow(),
  endDate: timestamp('end_date'),
  trialEndsAt: timestamp('trial_ends_at'),
  
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  
  externalBillingId: text('external_billing_id'),
  paymentMethod: text('payment_method'),
  
  autoRenew: boolean('auto_renew').default(true),
  canceledAt: timestamp('canceled_at'),
  cancelReason: text('cancel_reason'),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const workflows = pgTable('workflows', {
  id: serial('id').primaryKey(),
  type: workflowTypeEnum('type').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  version: integer('version').notNull().default(1),
  
  definition: jsonb('definition').$type<{
    steps: Array<{
      id: string;
      type: string;
      title: string;
      config: Record<string, any>;
      required: boolean;
      order: number;
    }>;
    aiConfig?: {
      scoreThreshold: number;
      autoApproveEnabled: boolean;
      requiredDocuments: string[];
    };
  }>().default({ steps: [] }),
  
  isActive: boolean('is_active').default(true),
  isDefault: boolean('is_default').default(false),
  
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const shopApplications = pgTable('shop_applications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  workflowId: integer('workflow_id').references(() => workflows.id),
  
  applicationData: jsonb('application_data').$type<{
    businessType?: string;
    productCategories?: string[];
    productionCapacity?: string;
    location?: {
      country?: string;
      city?: string;
      address?: string;
      coordinates?: { lat: number; lng: number };
    };
    legalStatus?: string;
    hasPhysicalStore?: boolean;
    deliveryOptions?: string[];
    socialPresence?: {
      website?: string;
      instagram?: string;
      facebook?: string;
      tiktok?: string;
    };
    documents?: Array<{
      type: string;
      url: string;
      uploadedAt: string;
    }>;
  }>().default({}),
  
  currentStep: integer('current_step').default(1),
  completedSteps: jsonb('completed_steps').$type<number[]>().default([]),
  
  status: applicationStatusEnum('status').notNull().default('in_progress'),
  
  aiScore: integer('ai_score'),
  aiDecision: aiDecisionEnum('ai_decision'),
  aiDecisionReason: text('ai_decision_reason'),
  aiReviewedAt: timestamp('ai_reviewed_at'),
  
  manualReviewedBy: integer('manual_reviewed_by').references(() => users.id),
  manualReviewedAt: timestamp('manual_reviewed_at'),
  manualDecision: text('manual_decision'),
  manualDecisionReason: text('manual_decision_reason'),
  
  recommendedPlanId: integer('recommended_plan_id').references(() => subscriptionPlans.id),
  
  submittedAt: timestamp('submitted_at'),
  decidedAt: timestamp('decided_at'),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const deliveryApplications = pgTable('delivery_applications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  workflowId: integer('workflow_id').references(() => workflows.id),
  
  applicationData: jsonb('application_data').$type<{
    hasVehicle?: boolean;
    vehicleType?: string;
    vehicleBrand?: string;
    vehicleAge?: number;
    deliveryZones?: string[];
    dailyAvailability?: {
      start: string;
      end: string;
      days: string[];
    };
    previousExperience?: string;
    documents?: Array<{
      type: string;
      url: string;
      uploadedAt: string;
    }>;
    bankDetails?: {
      bankName?: string;
      accountNumber?: string;
      accountHolderName?: string;
    };
  }>().default({}),
  
  currentStep: integer('current_step').default(1),
  completedSteps: jsonb('completed_steps').$type<number[]>().default([]),
  
  status: applicationStatusEnum('status').notNull().default('in_progress'),
  
  requiredDeposit: decimal('required_deposit', { precision: 15, scale: 2 }),
  depositPaid: boolean('deposit_paid').default(false),
  depositPaidAt: timestamp('deposit_paid_at'),
  
  insuranceRequired: boolean('insurance_required').default(false),
  insuranceVerified: boolean('insurance_verified').default(false),
  
  aiScore: integer('ai_score'),
  aiDecision: aiDecisionEnum('ai_decision'),
  aiDecisionReason: text('ai_decision_reason'),
  aiReviewedAt: timestamp('ai_reviewed_at'),
  aiRecommendedMaxOrderValue: decimal('ai_recommended_max_order_value', { precision: 15, scale: 2 }),
  aiRecommendedCoverageRadius: integer('ai_recommended_coverage_radius'),
  
  manualReviewedBy: integer('manual_reviewed_by').references(() => users.id),
  manualReviewedAt: timestamp('manual_reviewed_at'),
  manualDecision: text('manual_decision'),
  manualDecisionReason: text('manual_decision_reason'),
  
  submittedAt: timestamp('submitted_at'),
  decidedAt: timestamp('decided_at'),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const leads = pgTable('leads', {
  id: serial('id').primaryKey(),
  
  source: leadSourceEnum('source').notNull().default('manual'),
  sourceLink: text('source_link'),
  
  companyName: text('company_name'),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  contactSocialHandle: text('contact_social_handle'),
  
  country: text('country'),
  city: text('city'),
  
  category: text('category'),
  subcategory: text('subcategory'),
  
  score: integer('score').default(0),
  priority: text('priority', { enum: ['low', 'medium', 'high', 'urgent'] }).default('medium'),
  
  status: leadStatusEnum('status').notNull().default('new'),
  
  ownerAgentId: integer('owner_agent_id'),
  assignedToUserId: integer('assigned_to_user_id').references(() => users.id),
  
  campaignId: integer('campaign_id'),
  
  notes: text('notes'),
  tags: jsonb('tags').$type<string[]>().default([]),
  
  enrichmentData: jsonb('enrichment_data').$type<{
    website?: string;
    socialProfiles?: Record<string, string>;
    employeeCount?: number;
    annualRevenue?: string;
    foundedYear?: number;
    industry?: string;
    description?: string;
  }>().default({}),
  
  lastContactedAt: timestamp('last_contacted_at'),
  nextFollowUpAt: timestamp('next_follow_up_at'),
  convertedAt: timestamp('converted_at'),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const leadMessages = pgTable('lead_messages', {
  id: serial('id').primaryKey(),
  leadId: integer('lead_id').references(() => leads.id, { onDelete: 'cascade' }).notNull(),
  
  channel: text('channel', { 
    enum: ['email', 'instagram_dm', 'tiktok_dm', 'whatsapp', 'sms', 'linkedin', 'phone_call', 'in_app'] 
  }).notNull(),
  
  direction: text('direction', { enum: ['outbound', 'inbound'] }).notNull(),
  
  subject: text('subject'),
  content: text('content').notNull(),
  
  sentBy: text('sent_by', { enum: ['client_hunter_agent', 'human', 'system'] }).notNull(),
  sentByUserId: integer('sent_by_user_id').references(() => users.id),
  
  status: text('status', { 
    enum: ['draft', 'pending_approval', 'approved', 'sent', 'failed', 'read', 'replied'] 
  }).default('draft'),
  
  scheduledFor: timestamp('scheduled_for'),
  sentAt: timestamp('sent_at'),
  readAt: timestamp('read_at'),
  repliedAt: timestamp('replied_at'),
  
  externalMessageId: text('external_message_id'),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow()
});

export const leadCampaigns = pgTable('lead_campaigns', {
  id: serial('id').primaryKey(),
  
  name: text('name').notNull(),
  description: text('description'),
  
  targetCountry: text('target_country'),
  targetCity: text('target_city'),
  targetCategory: text('target_category'),
  
  keywords: jsonb('keywords').$type<string[]>().default([]),
  exclusionKeywords: jsonb('exclusion_keywords').$type<string[]>().default([]),
  
  sources: jsonb('sources').$type<string[]>().default([]),
  
  status: text('status', { enum: ['draft', 'active', 'paused', 'completed'] }).default('draft'),
  
  messageTemplates: jsonb('message_templates').$type<Array<{
    channel: string;
    subject?: string;
    content: string;
    isDefault: boolean;
  }>>().default([]),
  
  dailyLimit: integer('daily_limit').default(50),
  totalLeadsGenerated: integer('total_leads_generated').default(0),
  totalMessagesent: integer('total_messages_sent').default(0),
  totalResponses: integer('total_responses').default(0),
  totalConversions: integer('total_conversions').default(0),
  
  ownerUserId: integer('owner_user_id').references(() => users.id),
  
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const aiApprovalLogs = pgTable('ai_approval_logs', {
  id: serial('id').primaryKey(),
  
  applicationType: text('application_type', { enum: ['shop', 'delivery', 'kyc', 'other'] }).notNull(),
  applicationId: integer('application_id').notNull(),
  
  inputData: jsonb('input_data').default({}),
  
  decision: aiDecisionEnum('decision').notNull(),
  score: integer('score'),
  confidence: decimal('confidence', { precision: 5, scale: 4 }),
  
  reasons: jsonb('reasons').$type<string[]>().default([]),
  
  hardRulesApplied: jsonb('hard_rules_applied').$type<Array<{
    rule: string;
    result: boolean;
    action: string;
  }>>().default([]),
  
  modelUsed: text('model_used'),
  tokensUsed: integer('tokens_used'),
  processingTimeMs: integer('processing_time_ms'),
  
  wasOverridden: boolean('was_overridden').default(false),
  overriddenBy: integer('overridden_by').references(() => users.id),
  overrideReason: text('override_reason'),
  overriddenAt: timestamp('overridden_at'),
  
  createdAt: timestamp('created_at').defaultNow()
});

export const userRolesRelations = relations(userRoles, ({ many }) => ({
  assignments: many(userRoleAssignments)
}));

export const userRoleAssignmentsRelations = relations(userRoleAssignments, ({ one }) => ({
  user: one(users, {
    fields: [userRoleAssignments.userId],
    references: [users.id]
  }),
  role: one(userRoles, {
    fields: [userRoleAssignments.roleId],
    references: [userRoles.id]
  })
}));

export const subscriptionPlansRelations = relations(subscriptionPlans, ({ many }) => ({
  subscriptions: many(userSubscriptions)
}));

export const userSubscriptionsRelations = relations(userSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [userSubscriptions.userId],
    references: [users.id]
  }),
  plan: one(subscriptionPlans, {
    fields: [userSubscriptions.planId],
    references: [subscriptionPlans.id]
  })
}));

export const shopApplicationsRelations = relations(shopApplications, ({ one }) => ({
  user: one(users, {
    fields: [shopApplications.userId],
    references: [users.id]
  }),
  workflow: one(workflows, {
    fields: [shopApplications.workflowId],
    references: [workflows.id]
  }),
  recommendedPlan: one(subscriptionPlans, {
    fields: [shopApplications.recommendedPlanId],
    references: [subscriptionPlans.id]
  })
}));

export const deliveryApplicationsRelations = relations(deliveryApplications, ({ one }) => ({
  user: one(users, {
    fields: [deliveryApplications.userId],
    references: [users.id]
  }),
  workflow: one(workflows, {
    fields: [deliveryApplications.workflowId],
    references: [workflows.id]
  })
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  assignedTo: one(users, {
    fields: [leads.assignedToUserId],
    references: [users.id]
  }),
  messages: many(leadMessages),
  campaign: one(leadCampaigns, {
    fields: [leads.campaignId],
    references: [leadCampaigns.id]
  })
}));

export const leadMessagesRelations = relations(leadMessages, ({ one }) => ({
  lead: one(leads, {
    fields: [leadMessages.leadId],
    references: [leads.id]
  }),
  sentByUser: one(users, {
    fields: [leadMessages.sentByUserId],
    references: [users.id]
  })
}));

export const leadCampaignsRelations = relations(leadCampaigns, ({ one, many }) => ({
  owner: one(users, {
    fields: [leadCampaigns.ownerUserId],
    references: [users.id]
  }),
  leads: many(leads)
}));
