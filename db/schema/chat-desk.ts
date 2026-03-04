import { index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const chatLeadStatusEnum = pgEnum("chat_lead_status", ["new", "triaged", "booked", "closed"]);
export const chatMessageRoleEnum = pgEnum("chat_message_role", ["user", "assistant", "system"]);

export const chatLeads = pgTable(
  "chat_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    intent: text("intent").notNull(),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    country: text("country"),
    summary: text("summary"),
    status: chatLeadStatusEnum("status").notNull().default("new"),
    sourceUrl: text("source_url"),
    userAgent: text("user_agent"),
    ip: text("ip"),
    notifyStatus: text("notify_status").notNull().default("pending"), // pending|sent|failed|skipped
    notifyError: text("notify_error"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("chat_leads_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantStatus: index("chat_leads_tenant_status_idx").on(t.tenantId, t.status, t.updatedAt),
  }),
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    leadId: uuid("lead_id")
      .references(() => chatLeads.id, { onDelete: "cascade" })
      .notNull(),
    role: chatMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byLeadCreated: index("chat_messages_lead_created_idx").on(t.leadId, t.createdAt),
    byTenantCreated: index("chat_messages_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);

export const chatEvents = pgTable(
  "chat_events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    leadId: uuid("lead_id")
      .references(() => chatLeads.id, { onDelete: "cascade" })
      .notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byLeadCreated: index("chat_events_lead_created_idx").on(t.leadId, t.createdAt),
    byTenantCreated: index("chat_events_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);

