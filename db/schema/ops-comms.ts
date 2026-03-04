import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

const COMMS_THREAD_TYPES = ["CHANNEL", "DM", "CASE"] as const;
const COMMS_VISIBILITY_POLICIES = ["PRIVATE", "DEPT", "TENANT_INTERNAL"] as const;
const COMMS_ROLES_IN_THREAD = ["MEMBER", "MODERATOR", "SUPERVISOR"] as const;
const COMMS_SENDER_TYPES = ["AGENT", "SYSTEM"] as const;
const COMMS_MESSAGE_TYPES = [
  "STATUS_UPDATE",
  "REQUEST",
  "DECISION",
  "HANDOFF",
  "FYI",
  "ALERT",
  "ACTION_CARD",
] as const;
const COMMS_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export const commsThreads = pgTable(
  "comms_threads",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    type: text("type", { enum: COMMS_THREAD_TYPES }).notNull(),
    name: text("name"),
    relatedEntityType: text("related_entity_type"),
    relatedEntityId: text("related_entity_id"),
    visibilityPolicy: text("visibility_policy", { enum: COMMS_VISIBILITY_POLICIES })
      .notNull()
      .default("TENANT_INTERNAL"),
    createdByAgentKey: text("created_by_agent_key"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("comms_threads_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantType: index("comms_threads_tenant_type_idx").on(t.tenantId, t.type, t.createdAt),
  }),
);

export const commsParticipants = pgTable(
  "comms_participants",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    threadId: integer("thread_id")
      .references(() => commsThreads.id, { onDelete: "cascade" })
      .notNull(),
    agentKey: text("agent_key").notNull(),
    roleInThread: text("role_in_thread", { enum: COMMS_ROLES_IN_THREAD }).notNull().default("MEMBER"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueThreadAgent: uniqueIndex("comms_participants_thread_agent_idx").on(t.threadId, t.agentKey),
    byTenant: index("comms_participants_tenant_idx").on(t.tenantId, t.createdAt),
    byThread: index("comms_participants_thread_idx").on(t.threadId),
  }),
);

export const commsMessages = pgTable(
  "comms_messages",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    threadId: integer("thread_id")
      .references(() => commsThreads.id, { onDelete: "cascade" })
      .notNull(),
    senderType: text("sender_type", { enum: COMMS_SENDER_TYPES }).notNull().default("AGENT"),
    senderAgentKey: text("sender_agent_key"),
    messageType: text("message_type", { enum: COMMS_MESSAGE_TYPES }).notNull().default("STATUS_UPDATE"),
    contentText: text("content_text"),
    contentJson: jsonb("content_json").$type<Record<string, unknown>>().notNull().default({}),
    priority: text("priority", { enum: COMMS_PRIORITIES }).notNull().default("NORMAL"),
    requiresAck: boolean("requires_ack").notNull().default(false),
    ackByAgentKeys: jsonb("ack_by_agent_keys").$type<string[]>().notNull().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byThreadCreated: index("comms_messages_thread_created_idx").on(t.threadId, t.createdAt),
    byTenantCreated: index("comms_messages_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantPriority: index("comms_messages_tenant_priority_idx").on(t.tenantId, t.priority, t.createdAt),
  }),
);
