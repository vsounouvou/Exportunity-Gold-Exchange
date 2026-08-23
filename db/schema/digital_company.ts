import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, serial, text, timestamp, decimal, uuid } from "drizzle-orm/pg-core";
import { companies, agents } from "../schema";
import { chatLeads } from "./chat-desk";
import { industrialRequirements } from "./industrial";
import { tenants } from "./tenants";

export const channelTypeEnum = ['all-team', 'management', 'sales', 'marketing', 'operations', 'support', 'general', 'custom'] as const;
export type ChannelType = typeof channelTypeEnum[number];

export const channels = pgTable('channels', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  type: text('type', { enum: channelTypeEnum }).notNull().default('general'),
  
  icon: text('icon').default('hash'),
  color: text('color').default('#6B7280'),
  
  isDefault: boolean('is_default').default(false),
  isPrivate: boolean('is_private').default(false),
  isArchived: boolean('is_archived').default(false),
  
  departmentId: integer('department_id'),
  
  memberCount: integer('member_count').default(0),
  lastActivityAt: timestamp('last_activity_at'),
  
  metadata: jsonb('metadata').$type<{
    pinnedMessages?: number[];
    allowedRoles?: string[];
  }>().default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const channelMessages = pgTable('channel_messages', {
  id: serial('id').primaryKey(),
  channelId: integer('channel_id').references(() => channels.id, { onDelete: 'cascade' }).notNull(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  
  fromAgentId: integer('from_agent_id').references(() => agents.id, { onDelete: 'set null' }),
  fromUserId: integer('from_user_id'),
  
  content: text('content').notNull(),
  
  messageType: text('message_type', { 
    enum: ['chat', 'system', 'action', 'meeting', 'deal', 'campaign', 'announcement'] 
  }).default('chat'),
  
  mentions: jsonb('mentions').$type<{
    agents?: number[];
    roles?: string[];
    everyone?: boolean;
  }>().default({}),
  
  attachments: jsonb('attachments').$type<{
    files?: Array<{ name: string; url: string; type: string }>;
    links?: Array<{ url: string; title?: string }>;
  }>().default({}),
  
  contextTags: jsonb('context_tags').$type<string[]>().default([]),
  
  threadId: integer('thread_id'),
  replyCount: integer('reply_count').default(0),
  
  isPinned: boolean('is_pinned').default(false),
  isEdited: boolean('is_edited').default(false),
  
  reactions: jsonb('reactions').$type<Record<string, number[]>>().default({}),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const channelMemberships = pgTable('channel_memberships', {
  id: serial('id').primaryKey(),
  channelId: integer('channel_id').references(() => channels.id, { onDelete: 'cascade' }).notNull(),
  agentId: integer('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
  userId: integer('user_id'),
  
  role: text('role', { enum: ['member', 'admin', 'moderator'] }).default('member'),
  
  isMuted: boolean('is_muted').default(false),
  notificationLevel: text('notification_level', { 
    enum: ['all', 'mentions', 'none'] 
  }).default('all'),
  
  lastReadAt: timestamp('last_read_at'),
  unreadCount: integer('unread_count').default(0),
  
  joinedAt: timestamp('joined_at').defaultNow(),
  leftAt: timestamp('left_at')
});

export const salesLeads = pgTable('sales_leads', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  sourceChatLeadId: uuid('source_chat_lead_id').references(() => chatLeads.id, { onDelete: 'set null' }),
  
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  company: text('company'),
  
  source: text('source', { 
    enum: ['manual', 'website', 'referral', 'linkedin', 'cold_outreach', 'event', 'other'] 
  }).default('manual'),
  
  status: text('status', { 
    enum: ['new', 'contacted', 'warm', 'qualified', 'unqualified', 'replied', 'stale', 'converted', 'lost'] 
  }).default('new'),
  
  score: integer('score').default(0),
  
  ownerAgentId: integer('owner_agent_id').references(() => agents.id, { onDelete: 'set null' }),
  
  notes: text('notes'),
  
  tags: jsonb('tags').$type<string[]>().default([]),
  
  customFields: jsonb('custom_fields').$type<Record<string, any>>().default({}),
  
  lastContactedAt: timestamp('last_contacted_at'),
  nextFollowUpAt: timestamp('next_follow_up_at'),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const deals = pgTable('deals', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  leadId: integer('lead_id').references(() => salesLeads.id, { onDelete: 'set null' }),
  sourceChatLeadId: uuid('source_chat_lead_id').references(() => chatLeads.id, { onDelete: 'set null' }),
  industrialRequirementId: uuid('industrial_requirement_id').references(() => industrialRequirements.id, { onDelete: 'set null' }),
  referenceCode: text('reference_code'),
  
  name: text('name').notNull(),
  value: decimal('value', { precision: 15, scale: 2 }).default('0'),
  currency: text('currency').default('USD'),
  
  stage: text('stage', { 
    enum: ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost', 'dormant'] 
  }).default('lead'),
  
  probability: integer('probability').default(0),
  
  ownerAgentId: integer('owner_agent_id').references(() => agents.id, { onDelete: 'set null' }),
  
  expectedCloseDate: timestamp('expected_close_date'),
  actualCloseDate: timestamp('actual_close_date'),
  
  lostReason: text('lost_reason'),
  
  history: jsonb('history').$type<Array<{
    stage: string;
    changedAt: string;
    changedBy: string;
    notes?: string;
  }>>().default([]),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const outreachSequences = pgTable('outreach_sequences', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  
  name: text('name').notNull(),
  description: text('description'),
  
  channel: text('channel', { 
    enum: ['email', 'linkedin', 'whatsapp', 'sms', 'phone', 'multi'] 
  }).default('email'),
  
  status: text('status', { 
    enum: ['draft', 'active', 'paused', 'completed', 'archived'] 
  }).default('draft'),
  
  steps: jsonb('steps').$type<Array<{
    order: number;
    type: 'email' | 'message' | 'call' | 'task';
    delay: number;
    delayUnit: 'hours' | 'days';
    template: string;
    subject?: string;
  }>>().default([]),
  
  enrolledCount: integer('enrolled_count').default(0),
  completedCount: integer('completed_count').default(0),
  replyRate: decimal('reply_rate', { precision: 5, scale: 2 }).default('0'),
  
  ownerAgentId: integer('owner_agent_id').references(() => agents.id, { onDelete: 'set null' }),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const campaigns = pgTable('campaigns', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  
  name: text('name').notNull(),
  description: text('description'),
  goal: text('goal'),
  
  targetAudience: text('target_audience'),
  
  status: text('status', { 
    enum: ['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled'] 
  }).default('draft'),
  
  campaignType: text('campaign_type', { 
    enum: ['brand_awareness', 'lead_generation', 'product_launch', 'engagement', 'promotion', 'content', 'other'] 
  }).default('other'),
  
  channels: jsonb('channels').$type<string[]>().default([]),
  
  budget: decimal('budget', { precision: 15, scale: 2 }).default('0'),
  budgetSpent: decimal('budget_spent', { precision: 15, scale: 2 }).default('0'),
  currency: text('currency').default('USD'),
  
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  
  kpis: jsonb('kpis').$type<{
    targetReach?: number;
    targetLeads?: number;
    targetConversions?: number;
    targetEngagement?: number;
  }>().default({}),
  
  results: jsonb('results').$type<{
    reach?: number;
    impressions?: number;
    clicks?: number;
    leads?: number;
    conversions?: number;
    revenue?: number;
  }>().default({}),
  
  ownerAgentId: integer('owner_agent_id').references(() => agents.id, { onDelete: 'set null' }),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const contentAssets = pgTable('content_assets', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  
  title: text('title').notNull(),
  
  assetType: text('asset_type', { 
    enum: ['post', 'blog', 'script', 'email', 'ad_copy', 'video_script', 'newsletter', 'landing_page', 'other'] 
  }).default('post'),
  
  content: text('content'),
  
  status: text('status', { 
    enum: ['draft', 'review', 'approved', 'published', 'archived'] 
  }).default('draft'),
  
  platform: text('platform'),
  
  scheduledFor: timestamp('scheduled_for'),
  publishedAt: timestamp('published_at'),
  
  tags: jsonb('tags').$type<string[]>().default([]),
  
  attachments: jsonb('attachments').$type<Array<{
    name: string;
    url: string;
    type: string;
  }>>().default([]),
  
  createdByAgentId: integer('created_by_agent_id').references(() => agents.id, { onDelete: 'set null' }),
  approvedByAgentId: integer('approved_by_agent_id').references(() => agents.id, { onDelete: 'set null' }),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const socialPosts = pgTable('social_posts', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  contentAssetId: integer('content_asset_id').references(() => contentAssets.id, { onDelete: 'set null' }),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  
  platform: text('platform', { 
    enum: ['twitter', 'linkedin', 'facebook', 'instagram', 'tiktok', 'youtube', 'other'] 
  }).notNull(),
  
  content: text('content').notNull(),
  
  mediaUrls: jsonb('media_urls').$type<string[]>().default([]),
  
  status: text('status', { 
    enum: ['draft', 'scheduled', 'posted', 'failed', 'deleted'] 
  }).default('draft'),
  
  scheduledTime: timestamp('scheduled_time'),
  postedAt: timestamp('posted_at'),
  
  externalPostId: text('external_post_id'),
  externalUrl: text('external_url'),
  
  metrics: jsonb('metrics').$type<{
    likes?: number;
    comments?: number;
    shares?: number;
    impressions?: number;
    reach?: number;
    clicks?: number;
    engagement?: number;
  }>().default({}),
  
  ownerAgentId: integer('owner_agent_id').references(() => agents.id, { onDelete: 'set null' }),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const postingSchedules = pgTable('posting_schedules', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  
  name: text('name').notNull(),
  
  platform: text('platform', { 
    enum: ['twitter', 'linkedin', 'facebook', 'instagram', 'tiktok', 'youtube', 'all'] 
  }).notNull(),
  
  frequency: text('frequency', { 
    enum: ['daily', 'weekly', 'custom'] 
  }).default('daily'),
  
  rules: jsonb('rules').$type<{
    daysOfWeek?: number[];
    timesOfDay?: string[];
    postsPerDay?: number;
    timezone?: string;
  }>().default({}),
  
  isActive: boolean('is_active').default(true),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const metricSnapshots = pgTable('metric_snapshots', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  
  scope: text('scope', { 
    enum: ['campaign', 'channel', 'account', 'post', 'overall'] 
  }).notNull(),
  
  scopeId: integer('scope_id'),
  
  platform: text('platform'),
  
  timeRangeStart: timestamp('time_range_start').notNull(),
  timeRangeEnd: timestamp('time_range_end').notNull(),
  
  metrics: jsonb('metrics').$type<{
    impressions?: number;
    reach?: number;
    engagement?: number;
    engagementRate?: number;
    clicks?: number;
    ctr?: number;
    conversions?: number;
    cost?: number;
    cpc?: number;
    cpm?: number;
    roas?: number;
    followers?: number;
    followerGrowth?: number;
  }>().default({}),
  
  comparison: jsonb('comparison').$type<{
    previousPeriod?: Record<string, number>;
    percentChange?: Record<string, number>;
  }>().default({}),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow()
});

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  
  name: text('name').notNull(),
  description: text('description'),
  
  status: text('status', { 
    enum: ['planning', 'in_progress', 'on_hold', 'completed', 'cancelled'] 
  }).default('planning'),
  
  priority: text('priority', { 
    enum: ['low', 'medium', 'high', 'urgent'] 
  }).default('medium'),
  
  departmentId: integer('department_id'),
  
  ownerAgentId: integer('owner_agent_id').references(() => agents.id, { onDelete: 'set null' }),
  
  startDate: timestamp('start_date'),
  dueDate: timestamp('due_date'),
  completedAt: timestamp('completed_at'),
  
  progress: integer('progress').default(0),
  
  relatedCampaignId: integer('related_campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  
  tags: jsonb('tags').$type<string[]>().default([]),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const channelsRelations = relations(channels, ({ one, many }) => ({
  company: one(companies, {
    fields: [channels.companyId],
    references: [companies.id],
  }),
  messages: many(channelMessages),
  memberships: many(channelMemberships),
}));

export const channelMessagesRelations = relations(channelMessages, ({ one }) => ({
  channel: one(channels, {
    fields: [channelMessages.channelId],
    references: [channels.id],
  }),
  company: one(companies, {
    fields: [channelMessages.companyId],
    references: [companies.id],
  }),
  fromAgent: one(agents, {
    fields: [channelMessages.fromAgentId],
    references: [agents.id],
  }),
}));

export const salesLeadsRelations = relations(salesLeads, ({ one, many }) => ({
  company: one(companies, {
    fields: [salesLeads.companyId],
    references: [companies.id],
  }),
  ownerAgent: one(agents, {
    fields: [salesLeads.ownerAgentId],
    references: [agents.id],
  }),
  deals: many(deals),
}));

export const dealsRelations = relations(deals, ({ one }) => ({
  company: one(companies, {
    fields: [deals.companyId],
    references: [companies.id],
  }),
  lead: one(salesLeads, {
    fields: [deals.leadId],
    references: [salesLeads.id],
  }),
  ownerAgent: one(agents, {
    fields: [deals.ownerAgentId],
    references: [agents.id],
  }),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  company: one(companies, {
    fields: [campaigns.companyId],
    references: [companies.id],
  }),
  ownerAgent: one(agents, {
    fields: [campaigns.ownerAgentId],
    references: [agents.id],
  }),
  contentAssets: many(contentAssets),
  socialPosts: many(socialPosts),
}));

export const contentAssetsRelations = relations(contentAssets, ({ one }) => ({
  company: one(companies, {
    fields: [contentAssets.companyId],
    references: [companies.id],
  }),
  campaign: one(campaigns, {
    fields: [contentAssets.campaignId],
    references: [campaigns.id],
  }),
  createdByAgent: one(agents, {
    fields: [contentAssets.createdByAgentId],
    references: [agents.id],
  }),
}));

export const socialPostsRelations = relations(socialPosts, ({ one }) => ({
  company: one(companies, {
    fields: [socialPosts.companyId],
    references: [companies.id],
  }),
  contentAsset: one(contentAssets, {
    fields: [socialPosts.contentAssetId],
    references: [contentAssets.id],
  }),
  campaign: one(campaigns, {
    fields: [socialPosts.campaignId],
    references: [campaigns.id],
  }),
  ownerAgent: one(agents, {
    fields: [socialPosts.ownerAgentId],
    references: [agents.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one }) => ({
  company: one(companies, {
    fields: [projects.companyId],
    references: [companies.id],
  }),
  ownerAgent: one(agents, {
    fields: [projects.ownerAgentId],
    references: [agents.id],
  }),
  relatedCampaign: one(campaigns, {
    fields: [projects.relatedCampaignId],
    references: [campaigns.id],
  }),
}));
