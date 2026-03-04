import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { eceUsers } from "./ece";
import { actionRequests } from "./actions";

export type NotificationChannel = "whatsapp" | "sms" | "email";
export type NotificationProvider = "twilio" | "smtp" | "sendmail";

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    eventKey: text("event_key").notNull(),
    status: text("status").notNull().default("queued"), // queued|sending|sent|delivered|failed
    recipientUserId: integer("recipient_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    recipientAgentKey: text("recipient_agent_key"),
    readByUserId: integer("read_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    title: text("title"),
    message: text("message"),
    requestedChannels: jsonb("requested_channels").$type<NotificationChannel[]>().notNull().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("notifications_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantStatus: index("notifications_tenant_status_idx").on(t.tenantId, t.status, t.updatedAt),
  }),
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    notificationId: integer("notification_id")
      .references(() => notifications.id, { onDelete: "cascade" })
      .notNull(),
    actionRequestId: integer("action_request_id").references(() => actionRequests.id, {
      onDelete: "set null",
    }),
    channel: text("channel", { enum: ["whatsapp", "sms", "email"] }).notNull(),
    provider: text("provider").notNull(),
    toAddress: text("to_address").notNull(),
    status: text("status").notNull().default("queued"), // queued|sent|delivered|failed
    attempt: integer("attempt").notNull().default(1),
    providerMessageId: text("provider_message_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byNotification: index("notification_deliveries_notification_idx").on(t.notificationId, t.createdAt),
    byTenantCreated: index("notification_deliveries_tenant_created_idx").on(t.tenantId, t.createdAt),
    byProviderId: index("notification_deliveries_provider_id_idx").on(t.tenantId, t.provider, t.providerMessageId),
  }),
);
