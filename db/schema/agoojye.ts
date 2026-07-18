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

export const agoojyeSponsorCategories = pgTable(
  "agoojye_sponsor_categories",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantSlugUnique: uniqueIndex("agoojye_sponsor_categories_tenant_slug_uidx").on(t.tenantId, t.slug),
    byTenantStatus: index("agoojye_sponsor_categories_tenant_status_idx").on(t.tenantId, t.status, t.sortOrder),
  }),
);

export const agoojyePipelineStages = pgTable(
  "agoojye_pipeline_stages",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    stageGroup: text("stage_group").notNull().default("active"),
    status: text("status").notNull().default("active"),
    isTerminal: boolean("is_terminal").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantSlugUnique: uniqueIndex("agoojye_pipeline_stages_tenant_slug_uidx").on(t.tenantId, t.slug),
    byTenantOrder: index("agoojye_pipeline_stages_tenant_order_idx").on(t.tenantId, t.status, t.sortOrder),
  }),
);

export const agoojyeCrmOrganizations = pgTable(
  "agoojye_crm_organizations",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    website: text("website"),
    country: text("country"),
    industry: text("industry"),
    sponsorCategoryId: integer("sponsor_category_id").references(() => agoojyeSponsorCategories.id, { onDelete: "set null" }),
    sponsorCategory: text("sponsor_category"),
    companySize: text("company_size"),
    publicDescription: text("public_description"),
    strategicRelevance: text("strategic_relevance"),
    priority: text("priority").notNull().default("medium"),
    pipelineStageId: integer("pipeline_stage_id").references(() => agoojyePipelineStages.id, { onDelete: "set null" }),
    opportunityOwner: integer("opportunity_owner").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    estimatedValue: text("estimated_value"),
    currency: text("currency").notNull().default("XOF"),
    source: text("source").notNull().default("admin"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    nextAction: text("next_action"),
    nextActionDate: timestamp("next_action_date", { withTimezone: true }),
    internalNotes: text("internal_notes"),
    publicNotes: text("public_notes"),
    doNotContact: boolean("do_not_contact").notNull().default(false),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantNameUnique: uniqueIndex("agoojye_crm_organizations_tenant_name_uidx").on(t.tenantId, t.name),
    byTenantStage: index("agoojye_crm_organizations_tenant_stage_idx").on(t.tenantId, t.pipelineStageId),
    byTenantCategory: index("agoojye_crm_organizations_tenant_category_idx").on(t.tenantId, t.sponsorCategoryId),
  }),
);

export const agoojyeCrmContacts = pgTable(
  "agoojye_crm_contacts",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    organizationId: integer("organization_id").references(() => agoojyeCrmOrganizations.id, { onDelete: "set null" }),
    firstName: text("first_name"),
    lastName: text("last_name"),
    jobTitle: text("job_title"),
    email: text("email"),
    phone: text("phone"),
    country: text("country"),
    preferredLanguage: text("preferred_language").notNull().default("fr"),
    publicSourceUrl: text("public_source_url"),
    verificationStatus: text("verification_status").notNull().default("unverified"),
    confidenceScore: integer("confidence_score").notNull().default(0),
    relationshipOwner: integer("relationship_owner").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    lawfulContactNote: text("lawful_contact_note"),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    lastRepliedAt: timestamp("last_replied_at", { withTimezone: true }),
    doNotContact: boolean("do_not_contact").notNull().default(false),
    notes: text("notes"),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantEmailUnique: uniqueIndex("agoojye_crm_contacts_tenant_email_uidx").on(t.tenantId, t.email),
    byTenantOrganization: index("agoojye_crm_contacts_tenant_org_idx").on(t.tenantId, t.organizationId),
    byTenantVerification: index("agoojye_crm_contacts_tenant_verification_idx").on(t.tenantId, t.verificationStatus),
  }),
);

export const agoojyeSponsorOpportunities = pgTable(
  "agoojye_sponsor_opportunities",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    organizationId: integer("organization_id").references(() => agoojyeCrmOrganizations.id, { onDelete: "cascade" }).notNull(),
    contactId: integer("contact_id").references(() => agoojyeCrmContacts.id, { onDelete: "set null" }),
    sponsorCategoryId: integer("sponsor_category_id").references(() => agoojyeSponsorCategories.id, { onDelete: "set null" }),
    stageId: integer("stage_id").references(() => agoojyePipelineStages.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    priority: text("priority").notNull().default("medium"),
    ownerUserId: integer("owner_user_id").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    estimatedValue: text("estimated_value"),
    currency: text("currency").notNull().default("XOF"),
    source: text("source").notNull().default("admin"),
    status: text("status").notNull().default("active"),
    nextAction: text("next_action"),
    nextActionDate: timestamp("next_action_date", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    internalNotes: text("internal_notes"),
    publicNotes: text("public_notes"),
    doNotContact: boolean("do_not_contact").notNull().default(false),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantTitleUnique: uniqueIndex("agoojye_sponsor_opportunities_tenant_title_uidx").on(t.tenantId, t.title),
    byTenantStage: index("agoojye_sponsor_opportunities_tenant_stage_idx").on(t.tenantId, t.stageId),
    byTenantOwner: index("agoojye_sponsor_opportunities_tenant_owner_idx").on(t.tenantId, t.ownerUserId),
  }),
);

export const agoojyeCrmActivities = pgTable(
  "agoojye_crm_activities",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    organizationId: integer("organization_id").references(() => agoojyeCrmOrganizations.id, { onDelete: "cascade" }),
    contactId: integer("contact_id").references(() => agoojyeCrmContacts.id, { onDelete: "set null" }),
    opportunityId: integer("opportunity_id").references(() => agoojyeSponsorOpportunities.id, { onDelete: "cascade" }),
    actorUserId: integer("actor_user_id").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    activityType: text("activity_type").notNull().default("note"),
    channel: text("channel").notNull().default("admin"),
    subject: text("subject"),
    body: text("body"),
    outcome: text("outcome"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    byTenantCreated: index("agoojye_crm_activities_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantOpportunity: index("agoojye_crm_activities_tenant_opportunity_idx").on(t.tenantId, t.opportunityId),
  }),
);

export const agoojyeEmailTemplates = pgTable(
  "agoojye_email_templates",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    templateGroup: text("template_group").notNull().default("Initial introduction"),
    sponsorCategoryId: integer("sponsor_category_id").references(() => agoojyeSponsorCategories.id, { onDelete: "set null" }),
    language: text("language").notNull().default("fr"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    senderIdentityId: integer("sender_identity_id").references(() => agoojyeEmailIdentities.id, { onDelete: "set null" }),
    signature: text("signature"),
    status: text("status").notNull().default("draft"),
    version: text("version").notNull().default("1.0"),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    variables: jsonb("variables").$type<string[]>().notNull().default([]),
    attachmentIds: jsonb("attachment_ids").$type<number[]>().notNull().default([]),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantNameVersionUnique: uniqueIndex("agoojye_email_templates_tenant_name_version_uidx").on(t.tenantId, t.name, t.version),
    byTenantStatus: index("agoojye_email_templates_tenant_status_idx").on(t.tenantId, t.status),
  }),
);

export const agoojyeToolboxAssets = pgTable(
  "agoojye_toolbox_assets",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    title: text("title").notNull(),
    category: text("category").notNull().default("Core"),
    sponsorCategoryId: integer("sponsor_category_id").references(() => agoojyeSponsorCategories.id, { onDelete: "set null" }),
    description: text("description"),
    fileUrl: text("file_url"),
    assetType: text("asset_type").notNull().default("document"),
    status: text("status").notNull().default("needed"),
    version: text("version").notNull().default("1.0"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    approvedClaims: jsonb("approved_claims").$type<string[]>().notNull().default([]),
    prohibitedClaims: jsonb("prohibited_claims").$type<string[]>().notNull().default([]),
    visibility: text("visibility").notNull().default("admin_only"),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantTitleUnique: uniqueIndex("agoojye_toolbox_assets_tenant_title_uidx").on(t.tenantId, t.title),
    byTenantCategory: index("agoojye_toolbox_assets_tenant_category_idx").on(t.tenantId, t.category),
    byTenantStatus: index("agoojye_toolbox_assets_tenant_status_idx").on(t.tenantId, t.status),
  }),
);

export const agoojyeSuppressionEntries = pgTable(
  "agoojye_suppression_entries",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    email: text("email").notNull(),
    organizationId: integer("organization_id").references(() => agoojyeCrmOrganizations.id, { onDelete: "set null" }),
    contactId: integer("contact_id").references(() => agoojyeCrmContacts.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    source: text("source").notNull().default("admin"),
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantEmailUnique: uniqueIndex("agoojye_suppression_entries_tenant_email_uidx").on(t.tenantId, t.email),
    byTenantStatus: index("agoojye_suppression_entries_tenant_status_idx").on(t.tenantId, t.status),
  }),
);

export const agoojyeOutreachApprovals = pgTable(
  "agoojye_outreach_approvals",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    opportunityId: integer("opportunity_id").references(() => agoojyeSponsorOpportunities.id, { onDelete: "cascade" }),
    contactId: integer("contact_id").references(() => agoojyeCrmContacts.id, { onDelete: "set null" }),
    templateId: integer("template_id").references(() => agoojyeEmailTemplates.id, { onDelete: "set null" }),
    requesterUserId: integer("requester_user_id").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    reviewerUserId: integer("reviewer_user_id").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    senderIdentityId: integer("sender_identity_id").references(() => agoojyeEmailIdentities.id, { onDelete: "set null" }),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("awaiting_approval"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    decisionNotes: text("decision_notes"),
    agentResearchJson: jsonb("agent_research_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    byTenantStatus: index("agoojye_outreach_approvals_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
    byTenantOpportunity: index("agoojye_outreach_approvals_tenant_opportunity_idx").on(t.tenantId, t.opportunityId),
  }),
);

export const agoojyeMailThreads = pgTable(
  "agoojye_mail_threads",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    providerThreadId: text("provider_thread_id"),
    mailboxIdentityId: integer("mailbox_identity_id").references(() => agoojyeEmailIdentities.id, { onDelete: "set null" }),
    organizationId: integer("organization_id").references(() => agoojyeCrmOrganizations.id, { onDelete: "set null" }),
    contactId: integer("contact_id").references(() => agoojyeCrmContacts.id, { onDelete: "set null" }),
    opportunityId: integer("opportunity_id").references(() => agoojyeSponsorOpportunities.id, { onDelete: "set null" }),
    assignedTo: integer("assigned_to").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    direction: text("direction").notNull().default("inbound"),
    subject: text("subject").notNull().default("(Sans sujet)"),
    status: text("status").notNull().default("open"),
    source: text("source").notNull().default("manual"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    internalNotes: text("internal_notes"),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantProviderThreadUnique: uniqueIndex("agoojye_mail_threads_tenant_provider_uidx").on(t.tenantId, t.providerThreadId),
    byTenantStatus: index("agoojye_mail_threads_tenant_status_idx").on(t.tenantId, t.status, t.lastMessageAt),
    byTenantOpportunity: index("agoojye_mail_threads_tenant_opportunity_idx").on(t.tenantId, t.opportunityId),
  }),
);

export const agoojyeMailMessages = pgTable(
  "agoojye_mail_messages",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    threadId: integer("thread_id").references(() => agoojyeMailThreads.id, { onDelete: "cascade" }).notNull(),
    providerMessageId: text("provider_message_id"),
    messageIdHeader: text("message_id_header"),
    inReplyTo: text("in_reply_to"),
    referencesHeader: text("references_header"),
    fromEmail: text("from_email"),
    toEmails: jsonb("to_emails").$type<string[]>().notNull().default([]),
    ccEmails: jsonb("cc_emails").$type<string[]>().notNull().default([]),
    subject: text("subject").notNull().default("(Sans sujet)"),
    bodyText: text("body_text"),
    bodyPreview: text("body_preview"),
    direction: text("direction").notNull().default("inbound"),
    deliveryStatus: text("delivery_status").notNull().default("received"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    attachmentMetadata: jsonb("attachment_metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantProviderMessageUnique: uniqueIndex("agoojye_mail_messages_tenant_provider_uidx").on(t.tenantId, t.providerMessageId),
    byTenantThread: index("agoojye_mail_messages_tenant_thread_idx").on(t.tenantId, t.threadId, t.createdAt),
    byTenantDirection: index("agoojye_mail_messages_tenant_direction_idx").on(t.tenantId, t.direction, t.createdAt),
  }),
);

export const agoojyeOutreachSequences = pgTable(
  "agoojye_outreach_sequences",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    sponsorCategoryId: integer("sponsor_category_id").references(() => agoojyeSponsorCategories.id, { onDelete: "set null" }),
    ownerUserId: integer("owner_user_id").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    status: text("status").notNull().default("draft"),
    templateIds: jsonb("template_ids").$type<number[]>().notNull().default([]),
    maxSteps: integer("max_steps").notNull().default(3),
    minDelayHours: integer("min_delay_hours").notNull().default(72),
    dailyLimit: integer("daily_limit").notNull().default(10),
    businessHours: text("business_hours"),
    stopOnReply: boolean("stop_on_reply").notNull().default(true),
    stopOnBounce: boolean("stop_on_bounce").notNull().default(true),
    notes: text("notes"),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    tenantNameUnique: uniqueIndex("agoojye_outreach_sequences_tenant_name_uidx").on(t.tenantId, t.name),
    byTenantStatus: index("agoojye_outreach_sequences_tenant_status_idx").on(t.tenantId, t.status),
  }),
);

export const agoojyeImportBatches = pgTable(
  "agoojye_import_batches",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    fileName: text("file_name").notNull(),
    sourceType: text("source_type").notNull().default("csv"),
    targetResource: text("target_resource").notNull().default("organizations"),
    status: text("status").notNull().default("draft"),
    rowCount: integer("row_count").notNull().default(0),
    importedCount: integer("imported_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    warnings: jsonb("warnings").$type<Record<string, unknown>>().notNull().default({}),
    mappingJson: jsonb("mapping_json").$type<Record<string, unknown>>().notNull().default({}),
    rollbackNotes: text("rollback_notes"),
    createdBy: text("created_by"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    byTenantStatus: index("agoojye_import_batches_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
    byTenantTarget: index("agoojye_import_batches_tenant_target_idx").on(t.tenantId, t.targetResource),
  }),
);

export const agoojyeAgentResearchRecords = pgTable(
  "agoojye_agent_research_records",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    organizationId: integer("organization_id").references(() => agoojyeCrmOrganizations.id, { onDelete: "set null" }),
    contactId: integer("contact_id").references(() => agoojyeCrmContacts.id, { onDelete: "set null" }),
    opportunityId: integer("opportunity_id").references(() => agoojyeSponsorOpportunities.id, { onDelete: "set null" }),
    requestedByUserId: integer("requested_by_user_id").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    approvalId: integer("approval_id").references(() => agoojyeOutreachApprovals.id, { onDelete: "set null" }),
    researchStatus: text("research_status").notNull().default("draft"),
    sourceUrls: jsonb("source_urls").$type<string[]>().notNull().default([]),
    sourceRecordsJson: jsonb("source_records_json").$type<Array<Record<string, unknown>>>().notNull().default([]),
    summary: text("summary"),
    sponsorCategoryGuess: text("sponsor_category_guess"),
    relevanceScore: integer("relevance_score").notNull().default(0),
    confidenceScore: integer("confidence_score").notNull().default(0),
    recommendedTemplateId: integer("recommended_template_id").references(() => agoojyeEmailTemplates.id, { onDelete: "set null" }),
    recommendedToolboxAssetIds: jsonb("recommended_toolbox_asset_ids").$type<number[]>().notNull().default([]),
    draftSubject: text("draft_subject"),
    draftBody: text("draft_body"),
    guardrailNotes: text("guardrail_notes"),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    byTenantStatus: index("agoojye_agent_research_tenant_status_idx").on(t.tenantId, t.researchStatus, t.createdAt),
    byTenantOpportunity: index("agoojye_agent_research_tenant_opportunity_idx").on(t.tenantId, t.opportunityId),
  }),
);

export const agoojyeBackgroundJobs = pgTable(
  "agoojye_background_jobs",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    jobType: text("job_type").notNull(),
    status: text("status").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
    relatedEntityType: text("related_entity_type"),
    relatedEntityId: integer("related_entity_id"),
    createdBy: text("created_by"),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull().default({}),
    resultJson: jsonb("result_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    byTenantStatus: index("agoojye_background_jobs_tenant_status_idx").on(t.tenantId, t.status, t.scheduledAt),
    byTenantType: index("agoojye_background_jobs_tenant_type_idx").on(t.tenantId, t.jobType, t.createdAt),
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
