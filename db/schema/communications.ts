import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

// Shared communications layer (SMS/WhatsApp/… providers). Twilio is the first provider.

export const communicationsRoutingMap = pgTable(
  "communications_routing_map",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    provider: text("provider", { enum: ["twilio"] }).notNull().default("twilio"),
    channel: text("channel", { enum: ["sms", "whatsapp", "voice"] }).notNull(),
    toAddress: text("to_address").notNull(),
    agentKey: text("agent_key").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueRoute: uniqueIndex("communications_routing_unique_idx").on(t.tenantId, t.provider, t.channel, t.toAddress),
    byTenant: index("communications_routing_tenant_idx").on(t.tenantId, t.createdAt),
  }),
);

// Per-tenant/per-agent comms policies (limits + enable flags + voice routing helpers).
export const communicationsAgentControls = pgTable(
  "communications_agent_controls",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    agentKey: text("agent_key").notNull(),
    smsEnabled: boolean("sms_enabled").notNull().default(true),
    whatsappEnabled: boolean("whatsapp_enabled").notNull().default(true),
    voiceEnabled: boolean("voice_enabled").notNull().default(true),
    smsDailyOutboundLimit: integer("sms_daily_outbound_limit").notNull().default(0),
    whatsappDailyOutboundLimit: integer("whatsapp_daily_outbound_limit").notNull().default(0),
    voiceDailyOutboundLimit: integer("voice_daily_outbound_limit").notNull().default(0),
    voiceDialToE164: text("voice_dial_to_e164"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueAgent: uniqueIndex("communications_agent_controls_unique_idx").on(t.tenantId, t.agentKey),
    byTenant: index("communications_agent_controls_tenant_idx").on(t.tenantId, t.createdAt),
  }),
);

export const communicationsThreads = pgTable(
  "communications_threads",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    agentKey: text("agent_key").notNull(),
    channel: text("channel", { enum: ["sms", "whatsapp", "voice"] }).notNull(),
    peerAddress: text("peer_address").notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueThread: uniqueIndex("communications_threads_unique_idx").on(t.tenantId, t.agentKey, t.channel, t.peerAddress),
    byTenantLast: index("communications_threads_tenant_last_idx").on(t.tenantId, t.lastMessageAt),
    byAgentLast: index("communications_threads_agent_last_idx").on(t.agentKey, t.lastMessageAt),
  }),
);

export const communicationsMessages = pgTable(
  "communications_messages",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    agentKey: text("agent_key").notNull(),
    threadId: integer("thread_id")
      .references(() => communicationsThreads.id, { onDelete: "cascade" })
      .notNull(),
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    status: text("status").notNull(),
    provider: text("provider", { enum: ["twilio"] }).notNull().default("twilio"),
    channel: text("channel", { enum: ["sms", "whatsapp", "voice"] }).notNull(),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    body: text("body"),
    providerMessageId: text("provider_message_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueProviderMessage: uniqueIndex("communications_messages_provider_id_idx").on(
      t.tenantId,
      t.provider,
      t.providerMessageId,
    ),
    byThreadCreated: index("communications_messages_thread_created_idx").on(t.threadId, t.createdAt),
    byTenantCreated: index("communications_messages_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);

// Work orders: enforce "messages are work orders" for inbound comms.
export const communicationsWorkOrders = pgTable(
  "communications_work_orders",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    agentKey: text("agent_key").notNull(),
    channel: text("channel", { enum: ["sms", "whatsapp", "voice"] }).notNull(),
    threadId: integer("thread_id")
      .references(() => communicationsThreads.id, { onDelete: "cascade" })
      .notNull(),
    status: text("status").notNull().default("open"), // open|ack_sent|replied
    peerAddress: text("peer_address").notNull(),
    lastInboundMessageId: integer("last_inbound_message_id").references(() => communicationsMessages.id, {
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
    uniqueThread: uniqueIndex("communications_work_orders_thread_idx").on(t.threadId),
    byTenantDue: index("communications_work_orders_tenant_due_idx").on(t.tenantId, t.dueAt),
    byAgentDue: index("communications_work_orders_agent_due_idx").on(t.agentKey, t.dueAt),
  }),
);

export const communicationsEvents = pgTable(
  "communications_events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    provider: text("provider", { enum: ["twilio"] }).notNull().default("twilio"),
    eventType: text("event_type").notNull(),
    eventAt: timestamp("event_at", { withTimezone: true }).notNull().defaultNow(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantEvent: index("communications_events_tenant_event_idx").on(t.tenantId, t.eventAt),
    byProviderEvent: index("communications_events_provider_event_idx").on(t.provider, t.eventAt),
  }),
);
