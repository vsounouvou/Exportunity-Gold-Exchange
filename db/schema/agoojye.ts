import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

const now = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const agoojyeRoles = pgTable(
  "agoojye_roles",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantSlugUnique: uniqueIndex("agoojye_roles_tenant_slug_uidx").on(t.tenantId, t.slug),
    byTenant: index("agoojye_roles_tenant_idx").on(t.tenantId),
  }),
);

export const agoojyePermissions = pgTable(
  "agoojye_permissions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantKeyUnique: uniqueIndex("agoojye_permissions_tenant_key_uidx").on(t.tenantId, t.key),
  }),
);

export const agoojyeTeams = pgTable(
  "agoojye_teams",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    mission: text("mission"),
    leadUserId: integer("lead_user_id"),
    status: text("status").notNull().default("active"),
    visibility: text("visibility").notNull().default("public"),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantSlugUnique: uniqueIndex("agoojye_teams_tenant_slug_uidx").on(t.tenantId, t.slug),
    byTenantStatus: index("agoojye_teams_tenant_status_idx").on(t.tenantId, t.status),
  }),
);

export const agoojyeProjectUsers = pgTable(
  "agoojye_project_users",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    role: text("role").notNull().default("Participant"),
    teamId: integer("team_id").references(() => agoojyeTeams.id, { onDelete: "set null" }),
    status: text("status").notNull().default("Invited"),
    profilePhotoUrl: text("profile_photo_url"),
    bio: text("bio"),
    confirmedRole: boolean("confirmed_role").notNull().default(false),
    emailAccountCreated: boolean("email_account_created").notNull().default(false),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantEmailUnique: uniqueIndex("agoojye_project_users_tenant_email_uidx").on(t.tenantId, t.email),
    byTenantTeam: index("agoojye_project_users_tenant_team_idx").on(t.tenantId, t.teamId),
    byTenantStatus: index("agoojye_project_users_tenant_status_idx").on(t.tenantId, t.status),
  }),
);

export const agoojyeParticipants = pgTable(
  "agoojye_participants",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => agoojyeProjectUsers.id, { onDelete: "cascade" }),
    teamId: integer("team_id").references(() => agoojyeTeams.id, { onDelete: "set null" }),
    roleTitle: text("role_title"),
    confirmedRole: boolean("confirmed_role").notNull().default(false),
    participantType: text("participant_type").notNull().default("student"),
    bio: text("bio"),
    skills: jsonb("skills").$type<string[]>().notNull().default([]),
    phone: text("phone"),
    schoolOrCompany: text("school_or_company"),
    status: text("status").notNull().default("Pending"),
    emailIdentityId: integer("email_identity_id"),
    certificateEligible: boolean("certificate_eligible").notNull().default(false),
    shareEligibilityStatus: text("share_eligibility_status"),
    notes: text("notes"),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    byTenantTeam: index("agoojye_participants_tenant_team_idx").on(t.tenantId, t.teamId),
    byTenantStatus: index("agoojye_participants_tenant_status_idx").on(t.tenantId, t.status),
  }),
);

export const agoojyeEmailIdentities = pgTable(
  "agoojye_email_identities",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    emailAddress: text("email_address").notNull(),
    displayName: text("display_name").notNull(),
    emailType: text("email_type").notNull().default("individual"),
    provider: text("provider").notNull().default("manual"),
    status: text("status").notNull().default("requested"),
    canSend: boolean("can_send").notNull().default(true),
    canReceive: boolean("can_receive").notNull().default(true),
    forwardingAddress: text("forwarding_address"),
    createdBy: text("created_by"),
    notes: text("notes"),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantEmailUnique: uniqueIndex("agoojye_email_identities_tenant_email_uidx").on(t.tenantId, t.emailAddress),
    byTenantStatus: index("agoojye_email_identities_tenant_status_idx").on(t.tenantId, t.status),
  }),
);

export const agoojyeInternalMessages = pgTable(
  "agoojye_internal_messages",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    senderUserId: integer("sender_user_id").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    teamId: integer("team_id").references(() => agoojyeTeams.id, { onDelete: "set null" }),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    messageType: text("message_type").notNull().default("direct"),
    attachments: jsonb("attachments").$type<string[]>().notNull().default([]),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    byTenantCreated: index("agoojye_internal_messages_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);

export const agoojyeInternalMessageRecipients = pgTable(
  "agoojye_internal_message_recipients",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    messageId: integer("message_id").references(() => agoojyeInternalMessages.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => agoojyeProjectUsers.id, { onDelete: "cascade" }),
    teamId: integer("team_id").references(() => agoojyeTeams.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    byTenantMessage: index("agoojye_message_recipients_tenant_message_idx").on(t.tenantId, t.messageId),
  }),
);

export const agoojyeTasks = pgTable(
  "agoojye_tasks",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    teamId: integer("team_id").references(() => agoojyeTeams.id, { onDelete: "set null" }),
    assignedTo: integer("assigned_to").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    createdBy: integer("created_by").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    priority: text("priority").notNull().default("medium"),
    status: text("status").notNull().default("todo"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    milestoneId: integer("milestone_id"),
    attachments: jsonb("attachments").$type<string[]>().notNull().default([]),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    byTenantStatus: index("agoojye_tasks_tenant_status_idx").on(t.tenantId, t.status),
    byTenantTeam: index("agoojye_tasks_tenant_team_idx").on(t.tenantId, t.teamId),
  }),
);

export const agoojyeMilestones = pgTable(
  "agoojye_milestones",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    date: timestamp("date", { withTimezone: true }),
    status: text("status").notNull().default("planned"),
    owner: text("owner"),
    visibility: text("visibility").notNull().default("public"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantTitleUnique: uniqueIndex("agoojye_milestones_tenant_title_uidx").on(t.tenantId, t.title),
    byTenantVisibility: index("agoojye_milestones_tenant_visibility_idx").on(t.tenantId, t.visibility, t.sortOrder),
  }),
);

export const agoojyeDocuments = pgTable(
  "agoojye_documents",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category").notNull().default("Strategy"),
    teamId: integer("team_id").references(() => agoojyeTeams.id, { onDelete: "set null" }),
    uploadedBy: integer("uploaded_by").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    fileUrl: text("file_url"),
    version: text("version").notNull().default("1.0"),
    status: text("status").notNull().default("draft"),
    visibility: text("visibility").notNull().default("private"),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantTitleUnique: uniqueIndex("agoojye_documents_tenant_title_uidx").on(t.tenantId, t.title),
    byTenantCategory: index("agoojye_documents_tenant_category_idx").on(t.tenantId, t.category),
    byTenantVisibility: index("agoojye_documents_tenant_visibility_idx").on(t.tenantId, t.visibility),
  }),
);

export const agoojyePartners = pgTable(
  "agoojye_partners",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull().default("In discussion"),
    logoUrl: text("logo_url"),
    description: text("description"),
    contactPerson: text("contact_person"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    website: text("website"),
    notes: text("notes"),
    visibility: text("visibility").notNull().default("public"),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantNameUnique: uniqueIndex("agoojye_partners_tenant_name_uidx").on(t.tenantId, t.name),
    byTenantCategory: index("agoojye_partners_tenant_category_idx").on(t.tenantId, t.category),
    byTenantStatus: index("agoojye_partners_tenant_status_idx").on(t.tenantId, t.status),
  }),
);

export const agoojyeSponsorLeads = pgTable(
  "agoojye_sponsor_leads",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    companyName: text("company_name").notNull(),
    contactPerson: text("contact_person").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    interest: text("interest"),
    budgetRange: text("budget_range"),
    message: text("message"),
    source: text("source").notNull().default("public"),
    status: text("status").notNull().default("New"),
    assignedTo: integer("assigned_to").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    byTenantStatus: index("agoojye_sponsor_leads_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
    byTenantEmail: index("agoojye_sponsor_leads_tenant_email_idx").on(t.tenantId, t.email),
  }),
);

export const agoojyeMediaAssets = pgTable(
  "agoojye_media_assets",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    mediaType: text("media_type").notNull().default("image"),
    fileUrl: text("file_url"),
    thumbnailUrl: text("thumbnail_url"),
    category: text("category").notNull().default("gallery"),
    status: text("status").notNull().default("draft"),
    visibility: text("visibility").notNull().default("public"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    byTenantCategory: index("agoojye_media_assets_tenant_category_idx").on(t.tenantId, t.category),
    byTenantVisibility: index("agoojye_media_assets_tenant_visibility_idx").on(t.tenantId, t.visibility),
  }),
);

export const agoojyeContentBlocks = pgTable(
  "agoojye_content_blocks",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    page: text("page").notNull(),
    section: text("section").notNull(),
    key: text("key").notNull(),
    titleFr: text("title_fr"),
    titleEn: text("title_en"),
    contentFr: text("content_fr"),
    contentEn: text("content_en"),
    imageUrl: text("image_url"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    updatedBy: text("updated_by"),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantBlockUnique: uniqueIndex("agoojye_content_blocks_tenant_key_uidx").on(t.tenantId, t.page, t.section, t.key),
    byTenantPage: index("agoojye_content_blocks_tenant_page_idx").on(t.tenantId, t.page),
  }),
);

export const agoojyeAuditLogs = pgTable(
  "agoojye_audit_logs",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    actor: text("actor"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    byTenantCreated: index("agoojye_audit_logs_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);

export const agoojyeTenantEmailSettings = pgTable(
  "agoojye_tenant_email_settings",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    smtpHost: text("smtp_host"),
    smtpPort: integer("smtp_port"),
    smtpUsername: text("smtp_username"),
    smtpPasswordEncrypted: text("smtp_password_encrypted"),
    fromName: text("from_name"),
    fromEmail: text("from_email"),
    replyToEmail: text("reply_to_email"),
    providerName: text("provider_name").notNull().default("manual"),
    status: text("status").notNull().default("not_configured"),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantUnique: uniqueIndex("agoojye_email_settings_tenant_uidx").on(t.tenantId),
  }),
);
