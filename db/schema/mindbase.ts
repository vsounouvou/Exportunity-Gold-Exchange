import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { eceUsers } from "./ece";
import { tenants } from "./tenants";

export const creatorVerificationStatusEnum = pgEnum("creator_verification_status", [
  "unverified",
  "pending",
  "verified",
]);

export const intellectAccessPolicyEnum = pgEnum("intellect_access_policy", ["private", "public", "paid"]);
export const intellectPublishStatusEnum = pgEnum("intellect_publish_status", [
  "draft",
  "pending",
  "approved",
  "rejected",
]);
export const intellectKnowledgeScopeEnum = pgEnum("intellect_knowledge_scope", ["private", "public", "monetized"]);
export const intellectKnowledgeFileStatusEnum = pgEnum("intellect_knowledge_file_status", [
  "uploaded",
  "processed",
  "failed",
]);
export const intellectConversationChannelEnum = pgEnum("intellect_conversation_channel", [
  "web",
  "email",
  "api",
  "whatsapp",
  "telegram",
]);
export const intellectMessageSenderEnum = pgEnum("intellect_message_sender", ["user", "assistant", "system"]);
export const mindbaseUserRoleEnum = pgEnum("mindbase_user_role", ["admin", "creator", "client"]);
export const mindbaseWorkspaceMemberRoleEnum = pgEnum("mindbase_workspace_member_role", ["owner", "admin", "member"]);
export const mindbaseEmailDirectionEnum = pgEnum("mindbase_email_direction", ["inbound", "outbound"]);
export const mindbaseOrganizationStatusEnum = pgEnum("mindbase_organization_status", [
  "draft",
  "onboarding",
  "active",
  "paused",
  "archived",
]);
export const mindbaseOrganizationPlanEnum = pgEnum("mindbase_organization_plan", [
  "starter",
  "growth",
  "enterprise",
]);
export const mindbaseOrganizationUserRoleEnum = pgEnum("mindbase_organization_user_role", [
  "owner",
  "admin",
  "manager",
  "member",
  "agent",
]);
export const mindbaseTenantPlatformStatusEnum = pgEnum("mindbase_tenant_platform_status", [
  "active",
  "sandbox",
  "disconnected",
]);
export const mindbaseOrgChannelTypeEnum = pgEnum("mindbase_org_channel_type", [
  "whatsapp",
  "sms",
  "voice",
  "webchat",
  "facebook_messenger",
  "instagram_dm",
]);
export const mindbaseWidgetVisibilityEnum = pgEnum("mindbase_widget_visibility", ["visible", "hidden"]);
export const intelligenceAssetTypeEnum = pgEnum("intelligence_asset_type", ["agent", "knowledge", "automation"]);

const vector = customType<{ data: number[] | null; driverData: string | null }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value) {
    if (!Array.isArray(value) || !value.length) return null;
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    if (typeof value !== "string") return null;
    const normalized = value.replace(/[\[\]]/g, "").trim();
    if (!normalized) return [];
    const parsed = normalized
      .split(",")
      .map((entry) => Number.parseFloat(entry))
      .filter((entry) => Number.isFinite(entry));
    return parsed.length ? parsed : null;
  },
});

export const creatorProfiles = pgTable(
  "creator_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => eceUsers.id, { onDelete: "cascade" })
      .notNull(),
    displayName: text("display_name").notNull(),
    headline: text("headline"),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    location: text("location"),
    shareSlug: text("share_slug").notNull(),
    verificationStatus: creatorVerificationStatusEnum("verification_status").notNull().default("unverified"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantUser: uniqueIndex("creator_profiles_tenant_user_unique").on(t.tenantId, t.userId),
    byTenantSlug: uniqueIndex("creator_profiles_tenant_slug_unique").on(t.tenantId, t.shareSlug),
    byTenantCreated: index("creator_profiles_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);

export const mindbaseMindbases = pgTable(
  "mindbase_mindbases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => eceUsers.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    tagline: text("tagline"),
    description: text("description"),
    isPublished: boolean("is_published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantSlug: uniqueIndex("mindbase_mindbases_tenant_slug_unique").on(t.tenantId, t.slug),
    byTenantOwner: uniqueIndex("mindbase_mindbases_tenant_owner_unique").on(t.tenantId, t.ownerUserId),
    byTenantPublished: index("mindbase_mindbases_tenant_published_idx").on(t.tenantId, t.isPublished, t.updatedAt),
  }),
);

export const mindbaseProfileDrafts = pgTable(
  "mindbase_profile_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => eceUsers.id, { onDelete: "cascade" })
      .notNull(),
    conversationId: text("conversation_id").notNull(),
    messageCount: integer("message_count").notNull().default(0),
    messagesJson: jsonb("messages_json")
      .$type<Array<{ role: "user" | "assistant"; text: string; createdAt?: string }>>()
      .notNull()
      .default([]),
    extractedJson: jsonb("extracted_json").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantUserConversation: uniqueIndex("mindbase_profile_drafts_tenant_user_conversation_unique").on(
      t.tenantId,
      t.userId,
      t.conversationId,
    ),
    byTenantUserUpdated: index("mindbase_profile_drafts_tenant_user_updated_idx").on(t.tenantId, t.userId, t.updatedAt),
  }),
);

export const intellects = pgTable(
  "intellects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => eceUsers.id, { onDelete: "cascade" })
      .notNull(),
    agentId: integer("agent_id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    tagline: text("tagline"),
    description: text("description"),
    category: text("category").notNull().default("general"),
    tags: text("tags").array().notNull().default([]),
    personaRole: text("persona_role"),
    personaTone: text("persona_tone"),
    personaRules: jsonb("persona_rules").$type<string[]>().notNull().default([]),
    styleConstraints: jsonb("style_constraints").$type<string[]>().notNull().default([]),
    systemPrompt: text("system_prompt"),
    accessPolicy: intellectAccessPolicyEnum("access_policy").notNull().default("private"),
    pricePer100Messages: integer("price_per_100_messages").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(false),
    publishStatus: intellectPublishStatusEnum("publish_status").notNull().default("draft"),
    usageCount: integer("usage_count").notNull().default(0),
    agentEmail: text("agent_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantSlug: uniqueIndex("intellects_tenant_slug_unique").on(t.tenantId, t.slug),
    byAgentEmail: uniqueIndex("intellects_agent_email_unique").on(t.agentEmail),
    byTenantOwner: index("intellects_tenant_owner_idx").on(t.tenantId, t.ownerUserId),
    byTenantPublish: index("intellects_tenant_publish_idx").on(t.tenantId, t.isPublished, t.publishStatus),
    byTenantCategory: index("intellects_tenant_category_idx").on(t.tenantId, t.category),
  }),
);

export const intellectKnowledgeFiles = pgTable(
  "intellect_knowledge_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    intellectId: uuid("intellect_id")
      .references(() => intellects.id, { onDelete: "cascade" })
      .notNull(),
    scope: intellectKnowledgeScopeEnum("scope").notNull().default("private"),
    filename: text("filename").notNull(),
    mime: text("mime"),
    storageUrl: text("storage_url").notNull(),
    extractedText: text("extracted_text"),
    status: intellectKnowledgeFileStatusEnum("status").notNull().default("uploaded"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantIntellect: index("intellect_knowledge_files_tenant_intellect_idx").on(t.tenantId, t.intellectId),
    byTenantStatus: index("intellect_knowledge_files_tenant_status_idx").on(t.tenantId, t.status),
  }),
);

export const intellectKnowledgeChunks = pgTable(
  "intellect_knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    intellectId: uuid("intellect_id")
      .references(() => intellects.id, { onDelete: "cascade" })
      .notNull(),
    fileId: uuid("file_id")
      .references(() => intellectKnowledgeFiles.id, { onDelete: "cascade" })
      .notNull(),
    chunkIndex: integer("chunk_index").notNull().default(0),
    sourceFilename: text("source_filename"),
    chunkText: text("chunk_text").notNull(),
    embedding: jsonb("embedding").$type<number[] | null>().default(null),
    embeddingVector: vector("embedding_vector"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantIntellect: index("intellect_knowledge_chunks_tenant_intellect_idx").on(t.tenantId, t.intellectId),
    byFileChunk: uniqueIndex("intellect_knowledge_chunks_file_chunk_unique").on(t.fileId, t.chunkIndex),
  }),
);

export const mindbaseUserRoles = pgTable(
  "mindbase_user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => eceUsers.id, { onDelete: "cascade" })
      .notNull(),
    role: mindbaseUserRoleEnum("role").notNull().default("client"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantUserRole: uniqueIndex("mindbase_user_roles_tenant_user_role_unique").on(t.tenantId, t.userId, t.role),
    byTenantUser: index("mindbase_user_roles_tenant_user_idx").on(t.tenantId, t.userId),
  }),
);

export const mindbaseWorkspaces = pgTable(
  "mindbase_workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => eceUsers.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("draft"),
    companyBrainProgress: integer("company_brain_progress").notNull().default(0),
    personaReadiness: integer("persona_readiness").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantOwner: index("mindbase_workspaces_tenant_owner_idx").on(t.tenantId, t.ownerUserId),
    byTenantName: index("mindbase_workspaces_tenant_name_idx").on(t.tenantId, t.name),
  }),
);

export const mindbaseOrganizations = pgTable(
  "mindbase_organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => eceUsers.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logoUrl: text("logo_url"),
    status: mindbaseOrganizationStatusEnum("status").notNull().default("onboarding"),
    plan: mindbaseOrganizationPlanEnum("plan").notNull().default("starter"),
    chairmanAssistantName: text("chairman_assistant_name").notNull().default("Chairman Assistant"),
    defaultWorkspaceId: uuid("default_workspace_id").references(() => mindbaseWorkspaces.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantSlug: uniqueIndex("mindbase_organizations_tenant_slug_unique").on(t.tenantId, t.slug),
    byTenantOwner: index("mindbase_organizations_tenant_owner_idx").on(t.tenantId, t.ownerUserId),
    byTenantStatus: index("mindbase_organizations_tenant_status_idx").on(t.tenantId, t.status, t.updatedAt),
  }),
);

export const mindbaseOrganizationUsers = pgTable(
  "mindbase_organization_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => mindbaseOrganizations.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => eceUsers.id, { onDelete: "cascade" })
      .notNull(),
    role: mindbaseOrganizationUserRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byOrganizationUser: uniqueIndex("mindbase_org_users_org_user_unique").on(t.organizationId, t.userId),
    byTenantUser: index("mindbase_org_users_tenant_user_idx").on(t.tenantId, t.userId, t.updatedAt),
  }),
);

export const mindbaseTenantPlatforms = pgTable(
  "mindbase_tenant_platforms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    platformTenantId: integer("platform_tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    baseUrl: text("base_url"),
    apiKey: text("api_key"),
    status: mindbaseTenantPlatformStatusEnum("status").notNull().default("active"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantPlatform: uniqueIndex("mindbase_tenant_platforms_unique_idx").on(t.tenantId, t.platformTenantId),
    byTenantSlug: uniqueIndex("mindbase_tenant_platforms_slug_unique").on(t.tenantId, t.slug),
  }),
);

export const mindbaseOrganizationPlatforms = pgTable(
  "mindbase_organization_platforms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => mindbaseOrganizations.id, { onDelete: "cascade" })
      .notNull(),
    tenantPlatformId: uuid("tenant_platform_id")
      .references(() => mindbaseTenantPlatforms.id, { onDelete: "cascade" })
      .notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byOrgPlatform: uniqueIndex("mindbase_org_platforms_org_platform_unique").on(t.organizationId, t.tenantPlatformId),
    byTenantOrg: index("mindbase_org_platforms_tenant_org_idx").on(t.tenantId, t.organizationId, t.updatedAt),
  }),
);

export const mindbaseOrgChannels = pgTable(
  "mindbase_org_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => mindbaseOrganizations.id, { onDelete: "cascade" })
      .notNull(),
    channelType: mindbaseOrgChannelTypeEnum("channel_type").notNull(),
    twilioAccountSid: text("twilio_account_sid"),
    phoneNumber: text("phone_number"),
    status: text("status").notNull().default("disconnected"),
    autoReplyEnabled: boolean("auto_reply_enabled").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byOrgChannel: uniqueIndex("mindbase_org_channels_unique_idx").on(t.organizationId, t.channelType, t.phoneNumber),
    byTenantOrg: index("mindbase_org_channels_tenant_org_idx").on(t.tenantId, t.organizationId, t.updatedAt),
  }),
);

export const mindbaseOrgWallets = pgTable(
  "mindbase_org_wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => mindbaseOrganizations.id, { onDelete: "cascade" })
      .notNull(),
    balance: numeric("balance", { precision: 18, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("USD"),
    flutterwaveAccountId: text("flutterwave_account_id"),
    status: text("status").notNull().default("active"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byOrg: uniqueIndex("mindbase_org_wallets_org_unique").on(t.organizationId),
    byTenantOrg: index("mindbase_org_wallets_tenant_org_idx").on(t.tenantId, t.organizationId, t.updatedAt),
  }),
);

export const intelligenceAssets = pgTable(
  "intelligence_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: intelligenceAssetTypeEnum("type").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull(),
    tags: text("tags").array().notNull().default([]),
    creatorUserId: integer("creator_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
    rating: numeric("rating", { precision: 3, scale: 2 }).notNull().default("0"),
    installCount: integer("install_count").notNull().default(0),
    visibility: text("visibility").notNull().default("public"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTypeName: uniqueIndex("intelligence_assets_type_name_unique").on(t.type, t.name),
    byCategoryCreated: index("intelligence_assets_category_created_idx").on(t.category, t.createdAt),
    byVisibilityInstallCount: index("intelligence_assets_visibility_installs_idx").on(t.visibility, t.installCount),
  }),
);

export const organizationAssets = pgTable(
  "organization_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .references(() => mindbaseOrganizations.id, { onDelete: "cascade" })
      .notNull(),
    assetId: uuid("asset_id")
      .references(() => intelligenceAssets.id, { onDelete: "cascade" })
      .notNull(),
    installedBy: integer("installed_by").references(() => eceUsers.id, { onDelete: "set null" }),
    installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull().default("installed"),
  },
  (t) => ({
    byOrgAsset: uniqueIndex("organization_assets_org_asset_unique").on(t.orgId, t.assetId),
    byOrgInstalled: index("organization_assets_org_installed_idx").on(t.orgId, t.installedAt),
    byAssetInstalled: index("organization_assets_asset_installed_idx").on(t.assetId, t.installedAt),
  }),
);

export const mindbaseWidgetRegistry = pgTable(
  "mindbase_widget_registry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    componentKey: text("component_key").notNull(),
    schema: jsonb("schema").$type<Record<string, unknown>>().notNull().default({}),
    version: integer("version").notNull().default(1),
    featureFlags: jsonb("feature_flags").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byType: uniqueIndex("mindbase_widget_registry_type_unique").on(t.type),
  }),
);

export const mindbaseOrgWidgets = pgTable(
  "mindbase_org_widgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => mindbaseOrganizations.id, { onDelete: "cascade" })
      .notNull(),
    widgetType: text("widget_type").notNull(),
    configJson: jsonb("config_json").$type<Record<string, unknown>>().notNull().default({}),
    widgetPermissions: jsonb("widget_permissions").$type<string[]>().notNull().default([]),
    layoutZone: text("layout_zone").notNull().default("center"),
    orderIndex: integer("order_index").notNull().default(0),
    visibility: mindbaseWidgetVisibilityEnum("visibility").notNull().default("visible"),
    widgetState: jsonb("widget_state").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byOrgWidget: uniqueIndex("mindbase_org_widgets_org_widget_zone_unique").on(
      t.organizationId,
      t.widgetType,
      t.layoutZone,
      t.orderIndex,
    ),
    byTenantOrg: index("mindbase_org_widgets_tenant_org_idx").on(t.tenantId, t.organizationId, t.updatedAt),
  }),
);

export const mindbaseEvents = pgTable(
  "mindbase_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => mindbaseOrganizations.id, { onDelete: "cascade" })
      .notNull(),
    workspaceId: uuid("workspace_id").references(() => mindbaseWorkspaces.id, { onDelete: "set null" }),
    actorUserId: integer("actor_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    status: text("status").notNull().default("pending"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byOrgCreated: index("mindbase_events_org_created_idx").on(t.organizationId, t.createdAt),
    byTenantEvent: index("mindbase_events_tenant_event_idx").on(t.tenantId, t.eventType, t.createdAt),
  }),
);

export const mindbaseDashboardSummaries = pgTable(
  "mindbase_dashboard_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => mindbaseOrganizations.id, { onDelete: "cascade" })
      .notNull(),
    summaryJson: jsonb("summary_json").$type<Record<string, unknown>>().notNull().default({}),
    liveJson: jsonb("live_json").$type<Array<Record<string, unknown>>>().notNull().default([]),
    cachedAt: timestamp("cached_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byOrg: uniqueIndex("mindbase_dashboard_summaries_org_unique").on(t.organizationId),
    byTenantCached: index("mindbase_dashboard_summaries_tenant_cached_idx").on(t.tenantId, t.cachedAt),
  }),
);

export const mindbaseBrainEvents = pgTable(
  "mindbase_brain_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => mindbaseOrganizations.id, { onDelete: "cascade" })
      .notNull(),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byOrgCreated: index("mindbase_brain_events_org_created_idx").on(t.organizationId, t.createdAt),
    byTenantEvent: index("mindbase_brain_events_tenant_event_idx").on(t.tenantId, t.eventType, t.createdAt),
  }),
);

export const mindbaseBrainInsights = pgTable(
  "mindbase_brain_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => mindbaseOrganizations.id, { onDelete: "cascade" })
      .notNull(),
    sourceEventId: uuid("source_event_id").references(() => mindbaseBrainEvents.id, { onDelete: "set null" }),
    insightType: text("insight_type").notNull(),
    confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }).default("0"),
    generatedByAgent: text("generated_by_agent"),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byOrgInsight: index("mindbase_brain_insights_org_idx").on(t.organizationId, t.createdAt),
    bySourceEvent: index("mindbase_brain_insights_source_idx").on(t.sourceEventId, t.createdAt),
  }),
);

export const mindbaseWorkspaceMembers = pgTable(
  "mindbase_workspace_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    workspaceId: uuid("workspace_id")
      .references(() => mindbaseWorkspaces.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => eceUsers.id, { onDelete: "cascade" })
      .notNull(),
    role: mindbaseWorkspaceMemberRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspaceUser: uniqueIndex("mindbase_workspace_members_workspace_user_unique").on(t.workspaceId, t.userId),
    byTenantUser: index("mindbase_workspace_members_tenant_user_idx").on(t.tenantId, t.userId),
  }),
);

export const mindbaseWorkspaceAgents = pgTable(
  "mindbase_workspace_agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    workspaceId: uuid("workspace_id")
      .references(() => mindbaseWorkspaces.id, { onDelete: "cascade" })
      .notNull(),
    intellectId: uuid("intellect_id")
      .references(() => intellects.id, { onDelete: "cascade" })
      .notNull(),
    status: text("status").notNull().default("draft"),
    requiredIntegrations: jsonb("required_integrations").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspaceIntellect: uniqueIndex("mindbase_workspace_agents_workspace_intellect_unique").on(t.workspaceId, t.intellectId),
    byTenantWorkspace: index("mindbase_workspace_agents_tenant_workspace_idx").on(t.tenantId, t.workspaceId),
  }),
);

export const intellectConversations = pgTable(
  "intellect_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    channel: intellectConversationChannelEnum("channel").notNull().default("web"),
    externalThreadId: text("external_thread_id"),
    userId: integer("user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    workspaceId: uuid("workspace_id").references(() => mindbaseWorkspaces.id, { onDelete: "set null" }),
    intellectId: uuid("intellect_id")
      .references(() => intellects.id, { onDelete: "cascade" })
      .notNull(),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => ({
    byTenantUser: index("intellect_conversations_tenant_user_idx").on(t.tenantId, t.userId),
    byTenantIntellect: index("intellect_conversations_tenant_intellect_idx").on(t.tenantId, t.intellectId),
    byWorkspace: index("intellect_conversations_workspace_idx").on(t.workspaceId),
  }),
);

export const intellectMessages = pgTable(
  "intellect_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .references(() => intellectConversations.id, { onDelete: "cascade" })
      .notNull(),
    senderType: intellectMessageSenderEnum("sender_type").notNull(),
    senderUserId: integer("sender_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    content: text("content").notNull(),
    citations: jsonb("citations").$type<Array<{ fileId?: string; filename?: string }> | null>().default(null),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byConversationCreated: index("intellect_messages_conversation_created_idx").on(t.conversationId, t.createdAt),
  }),
);

export const mindbaseUsageEvents = pgTable(
  "mindbase_usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    intellectId: uuid("intellect_id")
      .references(() => intellects.id, { onDelete: "cascade" })
      .notNull(),
    conversationId: uuid("conversation_id").references(() => intellectConversations.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    amountInt: integer("amount_int").notNull().default(0),
    amountUsd: numeric("amount_usd", { precision: 14, scale: 2 }),
    requestCorrelationId: text("request_correlation_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>().default(null),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("mindbase_usage_events_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantIntellect: index("mindbase_usage_events_tenant_intellect_idx").on(t.tenantId, t.intellectId),
    byTenantUser: index("mindbase_usage_events_tenant_user_idx").on(t.tenantId, t.userId),
    byCorrelation: uniqueIndex("mindbase_usage_events_unique_correlation_idx").on(
      t.tenantId,
      t.userId,
      t.intellectId,
      t.requestCorrelationId,
    ),
  }),
);

export const mindbaseCreditsLedger = pgTable(
  "mindbase_credits_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => eceUsers.id, { onDelete: "cascade" })
      .notNull(),
    deltaInt: integer("delta_int").notNull(),
    reason: text("reason").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>().default(null),
    requestCorrelationId: text("request_correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantUserCreated: index("mindbase_credits_ledger_tenant_user_created_idx").on(t.tenantId, t.userId, t.createdAt),
    byCorrelation: index("mindbase_credits_ledger_correlation_idx").on(t.requestCorrelationId),
  }),
);

export const mindbaseApiKeys = pgTable(
  "mindbase_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    workspaceId: uuid("workspace_id")
      .references(() => mindbaseWorkspaces.id, { onDelete: "cascade" })
      .notNull(),
    keyHash: text("key_hash").notNull(),
    label: text("label"),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    byHash: uniqueIndex("mindbase_api_keys_key_hash_unique").on(t.keyHash),
    byTenantWorkspace: index("mindbase_api_keys_tenant_workspace_idx").on(t.tenantId, t.workspaceId),
  }),
);

export const mindbaseEmailThreads = pgTable(
  "mindbase_email_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    intellectId: uuid("intellect_id")
      .references(() => intellects.id, { onDelete: "cascade" })
      .notNull(),
    fromEmail: text("from_email").notNull(),
    toEmail: text("to_email").notNull(),
    subject: text("subject"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byIntellectLastMessage: index("mindbase_email_threads_intellect_last_message_idx").on(t.intellectId, t.lastMessageAt),
    byTenantCreated: index("mindbase_email_threads_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);

export const mindbaseEmailMessages = pgTable(
  "mindbase_email_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    threadId: uuid("thread_id")
      .references(() => mindbaseEmailThreads.id, { onDelete: "cascade" })
      .notNull(),
    direction: mindbaseEmailDirectionEnum("direction").notNull().default("inbound"),
    fromEmail: text("from_email"),
    toEmail: text("to_email"),
    messageId: text("message_id"),
    rawText: text("raw_text"),
    parsedText: text("parsed_text"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>().default(null),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byThreadCreated: index("mindbase_email_messages_thread_created_idx").on(t.threadId, t.createdAt),
    byTenantCreated: index("mindbase_email_messages_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);
