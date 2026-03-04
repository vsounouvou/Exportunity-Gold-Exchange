import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { eceUsers } from "./ece";
import { tenants } from "./tenants";

export const vsRoleEnum = pgEnum("vs_role", ["TENANT_ADMIN", "EDITOR", "PR_MANAGER", "ANALYST", "VIEWER"]);
export const vsApprovalStatusEnum = pgEnum("vs_approval_status", ["DRAFT", "PENDING", "APPROVED", "REJECTED"]);
export const vsRiskLevelEnum = pgEnum("vs_risk_level", ["low", "medium", "high"]);
export const vsLifecycleStatusEnum = pgEnum("vs_lifecycle_status", [
  "DRAFT",
  "READY",
  "SCHEDULED",
  "RUNNING",
  "PUBLISHED",
  "FAILED",
  "ARCHIVED",
]);
export const vsInboxTypeEnum = pgEnum("vs_inbox_type", ["COMMENT", "DM", "EMAIL", "CONTACT"]);

export const vsUserRoles = pgTable(
  "vs_user_roles",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => eceUsers.id, { onDelete: "cascade" }).notNull(),
    role: vsRoleEnum("role").notNull(),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTenantUserRole: uniqueIndex("vs_user_roles_tenant_user_role_uniq").on(t.tenantId, t.userId, t.role),
    byTenantUser: index("vs_user_roles_tenant_user_idx").on(t.tenantId, t.userId, t.isActive),
  }),
);

export const vsBudgetPolicies = pgTable(
  "vs_budget_policies",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    tenantDailyCap: integer("tenant_daily_cap").notNull().default(500000),
    defaultAgentDailyCap: integer("default_agent_daily_cap").notNull().default(50000),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTenant: uniqueIndex("vs_budget_policies_tenant_uniq").on(t.tenantId),
  }),
);

export const vsAgentBudgetCaps = pgTable(
  "vs_agent_budget_caps",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    agentKey: text("agent_key").notNull(),
    dailyCap: integer("daily_cap").notNull().default(20000),
    outputDetailLevel: text("output_detail_level").notNull().default("concise"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTenantAgent: uniqueIndex("vs_agent_budget_caps_tenant_agent_uniq").on(t.tenantId, t.agentKey),
  }),
);

export const vsWebsiteBlocks = pgTable(
  "vs_website_blocks",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    pagePath: text("page_path").notNull(),
    blockKey: text("block_key").notNull(),
    title: text("title"),
    content: text("content"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    isPublished: boolean("is_published").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedByUserId: integer("updated_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTenantPageBlock: uniqueIndex("vs_website_blocks_tenant_page_block_uniq").on(t.tenantId, t.pagePath, t.blockKey),
    byTenantPage: index("vs_website_blocks_tenant_page_idx").on(t.tenantId, t.pagePath, t.sortOrder),
  }),
);

export const vsInboxMessages = pgTable(
  "vs_inbox_messages",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    type: vsInboxTypeEnum("type").notNull().default("CONTACT"),
    channel: text("channel").notNull().default("website"),
    externalMessageId: text("external_message_id"),
    senderName: text("sender_name"),
    senderHandle: text("sender_handle"),
    senderEmail: text("sender_email"),
    subject: text("subject"),
    body: text("body").notNull(),
    riskLevel: vsRiskLevelEnum("risk_level").notNull().default("low"),
    status: text("status").notNull().default("NEW"),
    autoReplyEnabled: boolean("auto_reply_enabled").notNull().default(false),
    draftReply: text("draft_reply"),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    approvedByUserId: integer("approved_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("vs_inbox_messages_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantStatus: index("vs_inbox_messages_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
  }),
);

export const reputationSources = pgTable(
  "reputation_sources",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    type: text("type").notNull().default("RSS"),
    url: text("url"),
    checkFrequencyMinutes: integer("check_frequency_minutes").notNull().default(60),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantActive: index("reputation_sources_tenant_active_idx").on(t.tenantId, t.isActive, t.createdAt),
  }),
);

export const reputationKeywords = pgTable(
  "reputation_keywords",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    keyword: text("keyword").notNull(),
    weight: integer("weight").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTenantKeyword: uniqueIndex("reputation_keywords_tenant_keyword_uniq").on(t.tenantId, t.keyword),
  }),
);

export const reputationMentions = pgTable(
  "reputation_mentions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    sourceId: integer("source_id").references(() => reputationSources.id, { onDelete: "set null" }),
    externalId: text("external_id"),
    url: text("url"),
    domain: text("domain"),
    title: text("title"),
    snippet: text("snippet"),
    sentiment: text("sentiment").notNull().default("neutral"),
    severity: text("severity").notNull().default("medium"),
    authorityScore: integer("authority_score").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    status: text("status").notNull().default("NEW"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("reputation_mentions_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantSeverity: index("reputation_mentions_tenant_severity_idx").on(t.tenantId, t.severity, t.createdAt),
  }),
);

export const reputationTags = pgTable(
  "reputation_tags",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    mentionId: integer("mention_id").references(() => reputationMentions.id, { onDelete: "cascade" }).notNull(),
    tag: text("tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTenantMentionTag: uniqueIndex("reputation_tags_tenant_mention_tag_uniq").on(t.tenantId, t.mentionId, t.tag),
  }),
);

export const reputationRules = pgTable(
  "reputation_rules",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    conditionSpec: jsonb("condition_spec").$type<Record<string, unknown>>().notNull().default({}),
    actionSpec: jsonb("action_spec").$type<Record<string, unknown>>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantActive: index("reputation_rules_tenant_active_idx").on(t.tenantId, t.isActive, t.createdAt),
  }),
);

export const reputationAlerts = pgTable(
  "reputation_alerts",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    mentionId: integer("mention_id").references(() => reputationMentions.id, { onDelete: "set null" }),
    ruleId: integer("rule_id").references(() => reputationRules.id, { onDelete: "set null" }),
    alertType: text("alert_type").notNull().default("mention"),
    severity: text("severity").notNull().default("warning"),
    status: text("status").notNull().default("OPEN"),
    message: text("message").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantSeverity: index("reputation_alerts_tenant_severity_idx").on(t.tenantId, t.severity, t.createdAt),
  }),
);

export const reputationTasks = pgTable(
  "reputation_tasks",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    mentionId: integer("mention_id").references(() => reputationMentions.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("OPEN"),
    priority: integer("priority").notNull().default(0),
    ownerUserId: integer("owner_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantStatus: index("reputation_tasks_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
  }),
);

export const mediaOutlets = pgTable(
  "media_outlets",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    domain: text("domain"),
    category: text("category"),
    region: text("region"),
    authorityScore: integer("authority_score").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("media_outlets_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);

export const mediaContacts = pgTable(
  "media_contacts",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    outletId: integer("outlet_id").references(() => mediaOutlets.id, { onDelete: "set null" }),
    fullName: text("full_name").notNull(),
    title: text("title"),
    email: text("email"),
    phone: text("phone"),
    socialHandle: text("social_handle"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantOutlet: index("media_contacts_tenant_outlet_idx").on(t.tenantId, t.outletId, t.createdAt),
  }),
);

export const pressAngles = pgTable(
  "press_angles",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    targetAudience: text("target_audience"),
    status: text("status").notNull().default("DRAFT"),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantStatus: index("press_angles_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
  }),
);

export const outreachTemplates = pgTable(
  "outreach_templates",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    channel: text("channel").notNull().default("EMAIL"),
    subjectTemplate: text("subject_template"),
    bodyTemplate: text("body_template").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantActive: index("outreach_templates_tenant_active_idx").on(t.tenantId, t.isActive, t.createdAt),
  }),
);

export const prCampaigns = pgTable(
  "pr_campaigns",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    objective: text("objective"),
    status: text("status").notNull().default("DRAFT"),
    budgetUsd: numeric("budget_usd", { precision: 12, scale: 2 }).notNull().default("0"),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantStatus: index("pr_campaigns_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
  }),
);

export const outreachMessages = pgTable(
  "outreach_messages",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    campaignId: integer("campaign_id").references(() => prCampaigns.id, { onDelete: "set null" }),
    contactId: integer("contact_id").references(() => mediaContacts.id, { onDelete: "set null" }),
    angleId: integer("angle_id").references(() => pressAngles.id, { onDelete: "set null" }),
    templateId: integer("template_id").references(() => outreachTemplates.id, { onDelete: "set null" }),
    subject: text("subject"),
    body: text("body").notNull(),
    status: text("status").notNull().default("DRAFT"),
    approvalStatus: vsApprovalStatusEnum("approval_status").notNull().default("DRAFT"),
    approvedByUserId: integer("approved_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantStatus: index("outreach_messages_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
  }),
);

export const prTasks = pgTable(
  "pr_tasks",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    campaignId: integer("campaign_id").references(() => prCampaigns.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("OPEN"),
    priority: integer("priority").notNull().default(0),
    ownerUserId: integer("owner_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantStatus: index("pr_tasks_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
  }),
);

export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    provider: text("provider").notNull(),
    accountId: text("account_id").notNull(),
    accountName: text("account_name"),
    status: text("status").notNull().default("CONNECTED"),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTenantProviderAccount: uniqueIndex("social_accounts_tenant_provider_account_uniq").on(t.tenantId, t.provider, t.accountId),
    byTenantProvider: index("social_accounts_tenant_provider_idx").on(t.tenantId, t.provider, t.createdAt),
  }),
);

export const socialPages = pgTable(
  "social_pages",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    accountId: integer("account_id").references(() => socialAccounts.id, { onDelete: "cascade" }).notNull(),
    pageId: text("page_id").notNull(),
    pageName: text("page_name").notNull(),
    handle: text("handle"),
    url: text("url"),
    isPrimary: boolean("is_primary").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTenantPage: uniqueIndex("social_pages_tenant_page_uniq").on(t.tenantId, t.pageId),
    byTenantAccount: index("social_pages_tenant_account_idx").on(t.tenantId, t.accountId, t.createdAt),
  }),
);

export const socialTokens = pgTable(
  "social_tokens",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    accountId: integer("account_id").references(() => socialAccounts.id, { onDelete: "cascade" }).notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    tokenMeta: jsonb("token_meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTenantAccount: uniqueIndex("social_tokens_tenant_account_uniq").on(t.tenantId, t.accountId),
  }),
);

export const socialRateLimits = pgTable(
  "social_rate_limits",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    accountId: integer("account_id").references(() => socialAccounts.id, { onDelete: "cascade" }).notNull(),
    resource: text("resource").notNull(),
    limitPerHour: integer("limit_per_hour").notNull().default(200),
    usedCount: integer("used_count").notNull().default(0),
    resetAt: timestamp("reset_at", { withTimezone: true }),
    status: text("status").notNull().default("OK"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTenantAccountResource: uniqueIndex("social_rate_limits_tenant_account_resource_uniq").on(t.tenantId, t.accountId, t.resource),
  }),
);

export const studioProjects = pgTable(
  "studio_projects",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("ACTIVE"),
    ownerUserId: integer("owner_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantStatus: index("studio_projects_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
  }),
);

export const contentItems = pgTable(
  "content_items",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    projectId: integer("project_id").references(() => studioProjects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("POST"),
    brief: text("brief"),
    bodyText: text("body_text"),
    status: vsLifecycleStatusEnum("status").notNull().default("DRAFT"),
    riskLevel: vsRiskLevelEnum("risk_level").notNull().default("low"),
    approvalStatus: vsApprovalStatusEnum("approval_status").notNull().default("DRAFT"),
    approvedByUserId: integer("approved_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    sourceMentionId: integer("source_mention_id").references(() => reputationMentions.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantStatus: index("content_items_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
  }),
);

export const contentAssets = pgTable(
  "content_assets",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    itemId: integer("item_id").references(() => contentItems.id, { onDelete: "cascade" }).notNull(),
    assetType: text("asset_type").notNull(),
    url: text("url").notNull(),
    provider: text("provider"),
    status: text("status").notNull().default("READY"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantItem: index("content_assets_tenant_item_idx").on(t.tenantId, t.itemId, t.createdAt),
  }),
);

export const contentSchedules = pgTable(
  "content_schedules",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    itemId: integer("item_id").references(() => contentItems.id, { onDelete: "cascade" }).notNull(),
    socialPageId: integer("social_page_id").references(() => socialPages.id, { onDelete: "set null" }),
    channel: text("channel").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("SCHEDULED"),
    approvalStatus: vsApprovalStatusEnum("approval_status").notNull().default("PENDING"),
    approvedByUserId: integer("approved_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    publishedPostId: text("published_post_id"),
    error: text("error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantStatusTime: index("content_schedules_tenant_status_time_idx").on(t.tenantId, t.status, t.scheduledAt),
  }),
);

export const publishingJobs = pgTable(
  "publishing_jobs",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    scheduleId: integer("schedule_id").references(() => contentSchedules.id, { onDelete: "cascade" }).notNull(),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("QUEUED"),
    requestPayload: jsonb("request_payload").$type<Record<string, unknown>>().notNull().default({}),
    responsePayload: jsonb("response_payload").$type<Record<string, unknown>>().notNull().default({}),
    retryCount: integer("retry_count").notNull().default(0),
    lastError: text("last_error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantStatus: index("publishing_jobs_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
  }),
);

export const vsApprovalRequests = pgTable(
  "vs_approval_requests",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    scope: text("scope").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    requestedByUserId: integer("requested_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    status: vsApprovalStatusEnum("status").notNull().default("PENDING"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    approvedByUserId: integer("approved_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    note: text("note"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantStatus: index("vs_approval_requests_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
  }),
);

export const vsSettings = pgTable(
  "vs_settings",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    key: text("key").notNull(),
    value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
    updatedByUserId: integer("updated_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTenantKey: uniqueIndex("vs_settings_tenant_key_uniq").on(t.tenantId, t.key),
  }),
);
