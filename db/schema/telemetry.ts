import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { tenantSites } from "./tenant-sites";
import { geoTerritories } from "./territories";

export const telemetryEvents = pgTable(
  "telemetry_events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    siteId: integer("site_id").references(() => tenantSites.id, { onDelete: "set null" }),
    env: text("env").notNull().default("prod"),
    territoryId: integer("territory_id").references(() => geoTerritories.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    path: text("path").notNull(),
    canonicalUrl: text("canonical_url"),
    referrer: text("referrer"),
    lastRoute: text("last_route"),
    sessionId: text("session_id").notNull(),
    anonIdHash: text("anon_id_hash").notNull(),
    userIdHash: text("user_id_hash"),
    deviceClass: text("device_class"),
    locale: text("locale"),
    botScore: integer("bot_score").notNull().default(0),
    isBot: boolean("is_bot").notNull().default(false),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => ({
    byTenantTime: index("telemetry_events_tenant_time_idx").on(t.tenantId, t.occurredAt),
    byTenantTypeTime: index("telemetry_events_tenant_type_time_idx").on(t.tenantId, t.eventType, t.occurredAt),
    byTenantSession: index("telemetry_events_tenant_session_idx").on(t.tenantId, t.sessionId),
    byTenantPathTime: index("telemetry_events_tenant_path_time_idx").on(t.tenantId, t.path, t.occurredAt),
  }),
);

export const telemetrySessions = pgTable(
  "telemetry_sessions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    siteId: integer("site_id").references(() => tenantSites.id, { onDelete: "set null" }),
    env: text("env").notNull().default("prod"),
    sessionId: text("session_id").notNull(),
    anonIdHash: text("anon_id_hash").notNull(),
    userIdHash: text("user_id_hash"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    entryPath: text("entry_path"),
    exitPath: text("exit_path"),
    referrer: text("referrer"),
    deviceClass: text("device_class"),
    locale: text("locale"),
    botScore: integer("bot_score").notNull().default(0),
    isBot: boolean("is_bot").notNull().default(false),
    eventCount: integer("event_count").notNull().default(0),
    pageViews: integer("page_views").notNull().default(0),
    errors: integer("errors").notNull().default(0),
    scrollMax: integer("scroll_max").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueSession: uniqueIndex("telemetry_sessions_tenant_session_idx").on(t.tenantId, t.sessionId),
    byTenantLastSeen: index("telemetry_sessions_tenant_last_seen_idx").on(t.tenantId, t.lastSeenAt),
    byTenantUser: index("telemetry_sessions_tenant_user_idx").on(t.tenantId, t.userIdHash),
  }),
);

export const telemetryRouteDaily = pgTable(
  "telemetry_route_daily",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    siteId: integer("site_id").references(() => tenantSites.id, { onDelete: "set null" }),
    env: text("env").notNull().default("prod"),
    day: text("day").notNull(), // YYYY-MM-DD
    path: text("path").notNull(),
    pageViews: integer("page_views").notNull().default(0),
    uniqueSessions: integer("unique_sessions").notNull().default(0),
    uniqueUsers: integer("unique_users").notNull().default(0),
    metrics: jsonb("metrics").$type<Record<string, unknown>>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueDay: uniqueIndex("telemetry_route_daily_tenant_day_path_idx").on(t.tenantId, t.env, t.day, t.path),
    byTenantDay: index("telemetry_route_daily_tenant_day_idx").on(t.tenantId, t.day),
  }),
);

