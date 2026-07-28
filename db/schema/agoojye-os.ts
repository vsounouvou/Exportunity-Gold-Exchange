import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { eceUsers } from "./ece";
import { agoojyeProjectUsers, agoojyeTeams } from "./agoojye";
import { tenants } from "./tenants";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const agoojyeOsInvitations = pgTable(
  "agoojye_os_invitations",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    tokenHash: text("token_hash").notNull(),
    label: text("label").notNull().default("Invitation équipe AGOOJIYE"),
    allowedEmails: jsonb("allowed_emails").$type<string[]>().notNull().default([]),
    defaultRole: text("default_role").notNull().default("Membre AGOOJIYE"),
    defaultTeamId: integer("default_team_id").references(() => agoojyeTeams.id, { onDelete: "set null" }),
    maxUses: integer("max_uses").notNull().default(1),
    useCount: integer("use_count").notNull().default(0),
    status: text("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdBy: integer("created_by").references(() => eceUsers.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("agoojye_os_invitations_token_uidx").on(table.tokenHash),
    byTenantStatus: index("agoojye_os_invitations_tenant_status_idx").on(table.tenantId, table.status),
  }),
);

export const agoojyeOsProjects = pgTable(
  "agoojye_os_projects",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    objective: text("objective").notNull(),
    ownerUserId: integer("owner_user_id").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    teamId: integer("team_id").references(() => agoojyeTeams.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"),
    progress: integer("progress").notNull().default(0),
    deadline: timestamp("deadline", { withTimezone: true }),
    budget: integer("budget"),
    currency: text("currency").notNull().default("XOF"),
    confidentiality: integer("confidentiality").notNull().default(2),
    risks: jsonb("risks").$type<string[]>().notNull().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    workstreams: jsonb("workstreams").$type<Array<{ id: string; name: string; progress?: number }>>().notNull().default([]),
    milestones: jsonb("milestones").$type<Array<{ id: string; name: string; dueAt?: string; status?: string }>>().notNull().default([]),
    startDate: timestamp("start_date", { withTimezone: true }),
    blocker: text("blocker"),
    nextAction: text("next_action"),
    assignedAgent: text("assigned_agent"),
    confidentialityClass: text("confidentiality_class").notNull().default("INTERNAL"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    tenantSlugUnique: uniqueIndex("agoojye_os_projects_tenant_slug_uidx").on(table.tenantId, table.slug),
    byTenantStatus: index("agoojye_os_projects_tenant_status_idx").on(table.tenantId, table.status),
    byTenantTeam: index("agoojye_os_projects_tenant_team_idx").on(table.tenantId, table.teamId),
  }),
);

export const agoojyeOsProjectMembers = pgTable(
  "agoojye_os_project_members",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    projectId: integer("project_id").references(() => agoojyeOsProjects.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => agoojyeProjectUsers.id, { onDelete: "cascade" }).notNull(),
    role: text("role").notNull().default("contributor"),
    createdAt: createdAt(),
  },
  (table) => ({
    projectUserUnique: uniqueIndex("agoojye_os_project_members_uidx").on(table.projectId, table.userId),
    byTenantUser: index("agoojye_os_project_members_tenant_user_idx").on(table.tenantId, table.userId),
  }),
);

export const agoojyeOsChannels = pgTable(
  "agoojye_os_channels",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    channelType: text("channel_type").notNull().default("group"),
    teamId: integer("team_id").references(() => agoojyeTeams.id, { onDelete: "set null" }),
    projectId: integer("project_id").references(() => agoojyeOsProjects.id, { onDelete: "set null" }),
    confidentiality: integer("confidentiality").notNull().default(2),
    status: text("status").notNull().default("active"),
    createdBy: integer("created_by").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    tenantSlugUnique: uniqueIndex("agoojye_os_channels_tenant_slug_uidx").on(table.tenantId, table.slug),
    byTenantStatus: index("agoojye_os_channels_tenant_status_idx").on(table.tenantId, table.status),
  }),
);

export const agoojyeOsChannelMembers = pgTable(
  "agoojye_os_channel_members",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    channelId: integer("channel_id").references(() => agoojyeOsChannels.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => agoojyeProjectUsers.id, { onDelete: "cascade" }).notNull(),
    role: text("role").notNull().default("member"),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => ({
    channelUserUnique: uniqueIndex("agoojye_os_channel_members_uidx").on(table.channelId, table.userId),
    byTenantUser: index("agoojye_os_channel_members_tenant_user_idx").on(table.tenantId, table.userId),
  }),
);

export const agoojyeOsMessages = pgTable(
  "agoojye_os_messages",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    channelId: integer("channel_id").references(() => agoojyeOsChannels.id, { onDelete: "cascade" }).notNull(),
    senderUserId: integer("sender_user_id").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    messageType: text("message_type").notNull().default("text"),
    replyToMessageId: integer("reply_to_message_id"),
    threadRootMessageId: integer("thread_root_message_id"),
    clientMessageId: text("client_message_id"),
    attachments: jsonb("attachments").$type<Array<{ name: string; url: string; type?: string }>>().notNull().default([]),
    reactions: jsonb("reactions").$type<Record<string, number[]>>().notNull().default({}),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveryStatus: text("delivery_status").notNull().default("sent"),
    confidentiality: integer("confidentiality").notNull().default(2),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    byChannelCreated: index("agoojye_os_messages_channel_created_idx").on(table.channelId, table.createdAt),
    byTenantCreated: index("agoojye_os_messages_tenant_created_idx").on(table.tenantId, table.createdAt),
    tenantChannelClientUnique: uniqueIndex("agoojye_os_messages_tenant_channel_client_uidx").on(
      table.tenantId,
      table.channelId,
      table.clientMessageId,
    ),
    byThread: index("agoojye_os_messages_thread_idx").on(table.tenantId, table.threadRootMessageId, table.createdAt),
  }),
);

export const agoojyeOsMeetings = pgTable(
  "agoojye_os_meetings",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    title: text("title").notNull(),
    agenda: text("agenda"),
    projectId: integer("project_id").references(() => agoojyeOsProjects.id, { onDelete: "set null" }),
    organizerUserId: integer("organizer_user_id").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    participantUserIds: jsonb("participant_user_ids").$type<number[]>().notNull().default([]),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    videoUrl: text("video_url"),
    notes: text("notes"),
    summary: text("summary"),
    status: text("status").notNull().default("scheduled"),
    confidentiality: integer("confidentiality").notNull().default(2),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    byTenantStart: index("agoojye_os_meetings_tenant_start_idx").on(table.tenantId, table.startsAt),
  }),
);

export const agoojyeOsDecisions = pgTable(
  "agoojye_os_decisions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    projectId: integer("project_id").references(() => agoojyeOsProjects.id, { onDelete: "set null" }),
    meetingId: integer("meeting_id").references(() => agoojyeOsMeetings.id, { onDelete: "set null" }),
    sourceChannelId: integer("source_channel_id").references(() => agoojyeOsChannels.id, { onDelete: "set null" }),
    sourceMessageId: integer("source_message_id").references(() => agoojyeOsMessages.id, { onDelete: "set null" }),
    decision: text("decision").notNull(),
    context: text("context"),
    optionsConsidered: jsonb("options_considered").$type<string[]>().notNull().default([]),
    decisionMakerUserId: integer("decision_maker_user_id").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    participantUserIds: jsonb("participant_user_ids").$type<number[]>().notNull().default([]),
    consequences: text("consequences"),
    assignedActions: jsonb("assigned_actions").$type<string[]>().notNull().default([]),
    reviewDate: timestamp("review_date", { withTimezone: true }),
    status: text("status").notNull().default("recorded"),
    confidentiality: integer("confidentiality").notNull().default(3),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    byTenantCreated: index("agoojye_os_decisions_tenant_created_idx").on(table.tenantId, table.createdAt),
    byTenantStatus: index("agoojye_os_decisions_tenant_status_idx").on(table.tenantId, table.status),
  }),
);

export const agoojyeOsNotifications = pgTable(
  "agoojye_os_notifications",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => agoojyeProjectUsers.id, { onDelete: "cascade" }).notNull(),
    type: text("type").notNull().default("info"),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => ({
    byUserCreated: index("agoojye_os_notifications_user_created_idx").on(table.userId, table.createdAt),
    byTenantUser: index("agoojye_os_notifications_tenant_user_idx").on(table.tenantId, table.userId),
  }),
);

export const agoojyeOsPushSubscriptions = pgTable(
  "agoojye_os_push_subscriptions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    authUserId: integer("auth_user_id").references(() => eceUsers.id, { onDelete: "cascade" }).notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    endpointUnique: uniqueIndex("agoojye_os_push_subscriptions_endpoint_uidx").on(table.endpoint),
    byTenantUser: index("agoojye_os_push_subscriptions_tenant_user_idx").on(table.tenantId, table.authUserId),
  }),
);
