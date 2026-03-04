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
import { actionRequests } from "./actions";
import { emailAccounts } from "./email-admin";
import { agents } from "../schema";

// Multi-tenant agent mailboxes (separate mailbox per tenant+agent key).
export const agentMailboxes = pgTable(
  "agent_mailboxes",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    agentKey: text("agent_key").notNull(),
    email: text("email").notNull(),
    mailUserId: integer("mail_user_id"),
    quotaMb: integer("quota_mb").notNull().default(2048),
    dailyOutboundLimit: integer("daily_outbound_limit").notNull().default(0),
    approvalRequired: boolean("approval_required").notNull().default(false),
    isEnabled: boolean("is_enabled").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTenantAgent: uniqueIndex("agent_mailboxes_tenant_agent_idx").on(t.tenantId, t.agentKey),
    uniqueEmail: uniqueIndex("agent_mailboxes_email_idx").on(t.email),
    byTenant: index("agent_mailboxes_tenant_idx").on(t.tenantId, t.createdAt),
  }),
);

export const agentEmailIdentities = pgTable(
  "agent_email_identities",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    agentId: integer("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    agentKey: text("agent_key").notNull(),
    mailboxId: integer("mailbox_id").references(() => agentMailboxes.id, { onDelete: "set null" }),
    emailAccountId: integer("email_account_id").references(() => emailAccounts.id, { onDelete: "set null" }),
    fromEmail: text("from_email").notNull(),
    replyToEmail: text("reply_to_email"),
    displayName: text("display_name"),
    smtpHost: text("smtp_host"),
    smtpPort: integer("smtp_port"),
    smtpSecure: boolean("smtp_secure").notNull().default(false),
    smtpUsername: text("smtp_username"),
    smtpPasswordRef: text("smtp_password_ref"), // env var name or vault reference
    isEnabled: boolean("is_enabled").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTenantAgentKey: uniqueIndex("agent_email_identities_tenant_agent_key_idx").on(t.tenantId, t.agentKey),
    uniqueTenantAgentId: uniqueIndex("agent_email_identities_tenant_agent_id_idx").on(t.tenantId, t.agentId),
    byTenant: index("agent_email_identities_tenant_idx").on(t.tenantId, t.createdAt),
  }),
);

export const emailThreads = pgTable(
  "email_threads",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    agentKey: text("agent_key").notNull(),
    mailboxId: integer("mailbox_id")
      .references(() => agentMailboxes.id, { onDelete: "cascade" })
      .notNull(),
    subjectNorm: text("subject_norm").notNull(),
    subject: text("subject"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueThread: uniqueIndex("email_threads_mailbox_subject_idx").on(t.mailboxId, t.subjectNorm),
    byMailbox: index("email_threads_mailbox_last_idx").on(t.mailboxId, t.lastMessageAt),
    byTenant: index("email_threads_tenant_last_idx").on(t.tenantId, t.lastMessageAt),
  }),
);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    agentKey: text("agent_key").notNull(),
    mailboxId: integer("mailbox_id")
      .references(() => agentMailboxes.id, { onDelete: "cascade" })
      .notNull(),
    threadId: integer("thread_id").references(() => emailThreads.id, { onDelete: "set null" }),
    actionRequestId: integer("action_request_id").references(() => actionRequests.id, {
      onDelete: "set null",
    }),
    direction: text("direction").notNull(), // inbound|outbound
    status: text("status").notNull(), // received|queued|sent|bounced|failed
    fromEmail: text("from_email").notNull(),
    toJson: jsonb("to_json").$type<string[]>().notNull().default([]),
    ccJson: jsonb("cc_json").$type<string[]>().notNull().default([]),
    subject: text("subject"),
    textBody: text("text_body"),
    htmlBody: text("html_body"),
    messageId: text("message_id"),
    inReplyTo: text("in_reply_to"),
    referencesJson: jsonb("references_json").$type<string[]>().notNull().default([]),
    maildirPath: text("maildir_path"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueMailboxMessageId: uniqueIndex("email_messages_mailbox_message_id_idx").on(t.mailboxId, t.messageId),
    byActionRequest: index("email_messages_action_request_idx").on(t.actionRequestId, t.createdAt),
    byThread: index("email_messages_thread_created_idx").on(t.threadId, t.createdAt),
    byMailbox: index("email_messages_mailbox_created_idx").on(t.mailboxId, t.createdAt),
  }),
);

export const emailSendLogs = pgTable(
  "email_send_logs",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    actionRequestId: integer("action_request_id").references(() => actionRequests.id, { onDelete: "set null" }),
    actorType: text("actor_type").notNull().default("agent"), // agent|system|human
    actorId: integer("actor_id"),
    actorAgentId: integer("actor_agent_id").references(() => agents.id, { onDelete: "set null" }),
    actorAgentKey: text("actor_agent_key"),
    resolvedFromEmail: text("resolved_from_email").notNull(),
    resolvedReplyToEmail: text("resolved_reply_to_email"),
    smtpUsernameUsed: text("smtp_username_used"),
    toJson: jsonb("to_json").$type<string[]>().notNull().default([]),
    subject: text("subject"),
    status: text("status").notNull().default("queued"), // queued|sent|failed
    providerMessageId: text("provider_message_id"),
    providerResponse: jsonb("provider_response").$type<Record<string, unknown>>().notNull().default({}),
    error: text("error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenant: index("email_send_logs_tenant_created_idx").on(t.tenantId, t.createdAt),
    byActionRequest: index("email_send_logs_action_request_idx").on(t.actionRequestId, t.createdAt),
    byStatus: index("email_send_logs_tenant_status_idx").on(t.tenantId, t.status, t.updatedAt),
  }),
);

// Per-tenant unsubscribe registry (marketing-only for now).
export const emailUnsubscribes = pgTable(
  "email_unsubscribes",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    email: text("email").notNull(),
    scope: text("scope").notNull().default("marketing"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTenantEmailScope: uniqueIndex("email_unsubscribes_tenant_email_scope_idx").on(t.tenantId, t.email, t.scope),
    byTenant: index("email_unsubscribes_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);

// Work orders: enforce "email is a work order" (inbound -> reply obligation).
export const emailWorkOrders = pgTable(
  "email_work_orders",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    agentKey: text("agent_key").notNull(),
    mailboxId: integer("mailbox_id")
      .references(() => agentMailboxes.id, { onDelete: "cascade" })
      .notNull(),
    threadId: integer("thread_id")
      .references(() => emailThreads.id, { onDelete: "cascade" })
      .notNull(),
    status: text("status").notNull().default("open"), // open|ack_sent|replied
    senderEmail: text("sender_email").notNull(),
    lastInboundMessageId: integer("last_inbound_message_id").references(() => emailMessages.id, {
      onDelete: "set null",
    }),
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    ackSentAt: timestamp("ack_sent_at", { withTimezone: true }),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    lastEscalatedAt: timestamp("last_escalated_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueThread: uniqueIndex("email_work_orders_thread_idx").on(t.threadId),
    byMailboxDue: index("email_work_orders_mailbox_due_idx").on(t.mailboxId, t.dueAt),
    byTenantDue: index("email_work_orders_tenant_due_idx").on(t.tenantId, t.dueAt),
  }),
);

export const emailAttachmentsMeta = pgTable(
  "email_attachments_meta",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    messageId: integer("message_id")
      .references(() => emailMessages.id, { onDelete: "cascade" })
      .notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    maildirPath: text("maildir_path"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byMessage: index("email_attachments_message_idx").on(t.messageId),
    byTenant: index("email_attachments_tenant_idx").on(t.tenantId, t.createdAt),
  }),
);

export const emailEvents = pgTable(
  "email_events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    agentKey: text("agent_key").notNull(),
    mailboxId: integer("mailbox_id")
      .references(() => agentMailboxes.id, { onDelete: "cascade" })
      .notNull(),
    eventType: text("event_type").notNull(),
    eventAt: timestamp("event_at", { withTimezone: true }).notNull().defaultNow(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byMailbox: index("email_events_mailbox_event_idx").on(t.mailboxId, t.eventAt),
    byTenant: index("email_events_tenant_event_idx").on(t.tenantId, t.eventAt),
  }),
);

// =========================
// Email assistant UX (drafting + summaries)
// =========================

export const emailAssistantAgentPolicies = pgTable(
  "email_assistant_agent_policies",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    agentId: integer("agent_id")
      .references(() => agents.id, { onDelete: "cascade" })
      .notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    readScope: text("read_scope", { enum: ["subject_only", "full_thread"] })
      .notNull()
      .default("full_thread"),
    canSuggestDrafts: boolean("can_suggest_drafts").notNull().default(true),
    canSuggestSummaries: boolean("can_suggest_summaries").notNull().default(true),
    canSuggestFollowups: boolean("can_suggest_followups").notNull().default(true),
    sendMode: text("send_mode", { enum: ["never", "approval", "autonomous"] })
      .notNull()
      .default("never"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTenantAgent: uniqueIndex("email_assistant_agent_policies_unique_idx").on(t.tenantId, t.agentId),
    byTenant: index("email_assistant_agent_policies_tenant_idx").on(t.tenantId, t.updatedAt),
  }),
);

export const emailThreadInsights = pgTable(
  "email_thread_insights",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    mailboxId: integer("mailbox_id")
      .references(() => agentMailboxes.id, { onDelete: "cascade" })
      .notNull(),
    threadId: integer("thread_id")
      .references(() => emailThreads.id, { onDelete: "cascade" })
      .notNull(),
    sourceLastMessageAt: timestamp("source_last_message_at", { withTimezone: true }).notNull(),
    summaryJson: jsonb("summary_json").$type<Record<string, unknown>>().notNull().default({}),
    nextActionsJson: jsonb("next_actions_json").$type<Array<Record<string, unknown>>>().notNull().default([]),
    generatedByAgentId: integer("generated_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueThread: uniqueIndex("email_thread_insights_thread_idx").on(t.threadId),
    byTenant: index("email_thread_insights_tenant_idx").on(t.tenantId, t.updatedAt),
  }),
);
