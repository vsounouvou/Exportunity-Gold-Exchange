import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { eceUsers } from "./ece";
import { tenants } from "./tenants";

/**
 * Company-owned provider connections for Exportunity.
 *
 * These records are owned solely by the Exportunity tenant. The actor is
 * retained only for governance and audit evidence.
 */
export const exportunityIntegrationConnections = pgTable(
  "exportunity_integration_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    integrationId: text("integration_id").notNull(),
    provider: text("provider").notNull(),
    accountLabel: text("account_label"),
    status: text("status").notNull().default("connected"),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    tokenCiphertext: text("token_ciphertext").notNull(),
    tokenIv: text("token_iv").notNull(),
    tokenAuthTag: text("token_auth_tag").notNull(),
    tokenMeta: jsonb("token_meta")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    connectedByUserId: integer("connected_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    byTenantIntegration: uniqueIndex(
      "exportunity_integration_connections_tenant_integration_unique",
    ).on(table.tenantId, table.integrationId),
    byTenantStatus: index(
      "exportunity_integration_connections_tenant_status_idx",
    ).on(table.tenantId, table.status, table.updatedAt),
  }),
);

/** One-time, short-lived OAuth state. Only a SHA-256 digest is persisted. */
export const exportunityIntegrationOauthStates = pgTable(
  "exportunity_integration_oauth_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stateDigest: text("state_digest").notNull(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    actorUserId: integer("actor_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    integrationId: text("integration_id").notNull(),
    provider: text("provider").notNull(),
    returnTo: text("return_to").notNull().default("/admin/exportunity/integrations"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    byDigest: uniqueIndex(
      "exportunity_integration_oauth_states_digest_unique",
    ).on(table.stateDigest),
    byTenantExpiry: index(
      "exportunity_integration_oauth_states_tenant_expiry_idx",
    ).on(table.tenantId, table.expiresAt),
  }),
);

export const exportunityIntegrationAuditEvents = pgTable(
  "exportunity_integration_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    connectionId: uuid("connection_id").references(
      () => exportunityIntegrationConnections.id,
      { onDelete: "set null" },
    ),
    actorUserId: integer("actor_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    integrationId: text("integration_id").notNull(),
    provider: text("provider").notNull(),
    eventType: text("event_type").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    byTenantCreated: index(
      "exportunity_integration_audit_events_tenant_created_idx",
    ).on(table.tenantId, table.createdAt),
    byConnection: index(
      "exportunity_integration_audit_events_connection_idx",
    ).on(table.connectionId, table.createdAt),
  }),
);
