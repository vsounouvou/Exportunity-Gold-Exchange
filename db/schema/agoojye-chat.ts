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
  uuid,
} from "drizzle-orm/pg-core";

import { agoojyeOsChannels, agoojyeOsMessages } from "./agoojye-os";
import { agoojyeProjectUsers } from "./agoojye";
import { tenants } from "./tenants";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const agoojyeOsConversationReads = pgTable(
  "agoojye_os_conversation_reads",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    channelId: integer("channel_id").references(() => agoojyeOsChannels.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => agoojyeProjectUsers.id, { onDelete: "cascade" }).notNull(),
    lastReadMessageId: integer("last_read_message_id").references(() => agoojyeOsMessages.id, { onDelete: "set null" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    markedUnreadAt: timestamp("marked_unread_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    channelUserUnique: uniqueIndex("agoojye_os_conversation_reads_channel_user_uidx").on(table.channelId, table.userId),
    byTenantUser: index("agoojye_os_conversation_reads_tenant_user_idx").on(table.tenantId, table.userId, table.updatedAt),
  }),
);

export const agoojyeOsConversationPreferences = pgTable(
  "agoojye_os_conversation_preferences",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    channelId: integer("channel_id").references(() => agoojyeOsChannels.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => agoojyeProjectUsers.id, { onDelete: "cascade" }).notNull(),
    favorite: boolean("favorite").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    mutedUntil: timestamp("muted_until", { withTimezone: true }),
    folder: text("folder"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    channelUserUnique: uniqueIndex("agoojye_os_conversation_preferences_channel_user_uidx").on(table.channelId, table.userId),
    byTenantUser: index("agoojye_os_conversation_preferences_tenant_user_idx").on(table.tenantId, table.userId),
  }),
);

export const agoojyeOsMessageDeliveries = pgTable(
  "agoojye_os_message_deliveries",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    messageId: integer("message_id").references(() => agoojyeOsMessages.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => agoojyeProjectUsers.id, { onDelete: "cascade" }).notNull(),
    status: text("status").notNull().default("sent"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    messageUserUnique: uniqueIndex("agoojye_os_message_deliveries_message_user_uidx").on(table.messageId, table.userId),
    byTenantUserStatus: index("agoojye_os_message_deliveries_tenant_user_status_idx").on(table.tenantId, table.userId, table.status),
  }),
);

export const agoojyeOsMessageReactions = pgTable(
  "agoojye_os_message_reactions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    messageId: integer("message_id").references(() => agoojyeOsMessages.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => agoojyeProjectUsers.id, { onDelete: "cascade" }).notNull(),
    emoji: text("emoji").notNull(),
    createdAt: createdAt(),
  },
  (table) => ({
    messageUserEmojiUnique: uniqueIndex("agoojye_os_message_reactions_uidx").on(table.messageId, table.userId, table.emoji),
    byMessage: index("agoojye_os_message_reactions_message_idx").on(table.tenantId, table.messageId),
  }),
);

export const agoojyeOsMessageMentions = pgTable(
  "agoojye_os_message_mentions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    messageId: integer("message_id").references(() => agoojyeOsMessages.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => agoojyeProjectUsers.id, { onDelete: "cascade" }).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => ({
    messageUserUnique: uniqueIndex("agoojye_os_message_mentions_message_user_uidx").on(table.messageId, table.userId),
    byTenantUser: index("agoojye_os_message_mentions_tenant_user_idx").on(table.tenantId, table.userId, table.readAt),
  }),
);

export const agoojyeOsMessageAttachments = pgTable(
  "agoojye_os_message_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    channelId: integer("channel_id").references(() => agoojyeOsChannels.id, { onDelete: "cascade" }).notNull(),
    messageId: integer("message_id").references(() => agoojyeOsMessages.id, { onDelete: "cascade" }),
    uploadedBy: integer("uploaded_by").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    originalName: text("original_name").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    kind: text("kind").notNull().default("document"),
    status: text("status").notNull().default("ready"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    byTenantChannel: index("agoojye_os_message_attachments_tenant_channel_idx").on(table.tenantId, table.channelId, table.createdAt),
    tenantHashIndex: index("agoojye_os_message_attachments_tenant_hash_idx").on(table.tenantId, table.sha256),
  }),
);

export const agoojyeOsMessageDrafts = pgTable(
  "agoojye_os_message_drafts",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    channelId: integer("channel_id").references(() => agoojyeOsChannels.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => agoojyeProjectUsers.id, { onDelete: "cascade" }).notNull(),
    body: text("body").notNull().default(""),
    attachmentIds: jsonb("attachment_ids").$type<string[]>().notNull().default([]),
    replyToMessageId: integer("reply_to_message_id").references(() => agoojyeOsMessages.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    channelUserUnique: uniqueIndex("agoojye_os_message_drafts_channel_user_uidx").on(table.channelId, table.userId),
    byTenantUser: index("agoojye_os_message_drafts_tenant_user_idx").on(table.tenantId, table.userId, table.updatedAt),
  }),
);

export const agoojyeOsMessagePins = pgTable(
  "agoojye_os_message_pins",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    channelId: integer("channel_id").references(() => agoojyeOsChannels.id, { onDelete: "cascade" }).notNull(),
    messageId: integer("message_id").references(() => agoojyeOsMessages.id, { onDelete: "cascade" }).notNull(),
    pinnedBy: integer("pinned_by").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => ({
    messageUnique: uniqueIndex("agoojye_os_message_pins_message_uidx").on(table.messageId),
    byChannel: index("agoojye_os_message_pins_channel_idx").on(table.tenantId, table.channelId, table.createdAt),
  }),
);

export const agoojyeOsAiConversations = pgTable(
  "agoojye_os_ai_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => agoojyeProjectUsers.id, { onDelete: "cascade" }).notNull(),
    title: text("title").notNull().default("Nouvelle conversation"),
    contextType: text("context_type").notNull().default("personal"),
    contextId: text("context_id"),
    contextLabel: text("context_label").notNull().default("Espace personnel"),
    pinned: boolean("pinned").notNull().default(false),
    status: text("status").notNull().default("active"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    byTenantUserStatus: index("agoojye_os_ai_conversations_tenant_user_status_idx").on(table.tenantId, table.userId, table.status, table.updatedAt),
  }),
);

export const agoojyeOsAiMessages = pgTable(
  "agoojye_os_ai_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    conversationId: uuid("conversation_id").references(() => agoojyeOsAiConversations.id, { onDelete: "cascade" }).notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    parentMessageId: uuid("parent_message_id"),
    sources: jsonb("sources").$type<Array<{ type: string; title: string; href?: string }>>().notNull().default([]),
    actions: jsonb("actions").$type<Array<Record<string, unknown>>>().notNull().default([]),
    provider: text("provider"),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    feedback: text("feedback"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    byConversationCreated: index("agoojye_os_ai_messages_conversation_created_idx").on(table.tenantId, table.conversationId, table.createdAt),
  }),
);

export const agoojyeOsAiConversationContexts = pgTable(
  "agoojye_os_ai_conversation_contexts",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    conversationId: uuid("conversation_id").references(() => agoojyeOsAiConversations.id, { onDelete: "cascade" }).notNull(),
    contextType: text("context_type").notNull(),
    contextId: text("context_id"),
    label: text("label").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    conversationContextUnique: uniqueIndex("agoojye_os_ai_contexts_conversation_type_id_uidx").on(
      table.conversationId,
      table.contextType,
      table.contextId,
    ),
  }),
);

export const agoojyeOsAiMessageActions = pgTable(
  "agoojye_os_ai_message_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    conversationId: uuid("conversation_id").references(() => agoojyeOsAiConversations.id, { onDelete: "cascade" }).notNull(),
    messageId: uuid("message_id").references(() => agoojyeOsAiMessages.id, { onDelete: "cascade" }).notNull(),
    requestedBy: integer("requested_by").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    actionType: text("action_type").notNull(),
    label: text("label").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    riskLevel: text("risk_level").notNull().default("low"),
    status: text("status").notNull().default("proposed"),
    requiresApproval: boolean("requires_approval").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    byConversationStatus: index("agoojye_os_ai_message_actions_conversation_status_idx").on(table.tenantId, table.conversationId, table.status),
  }),
);
