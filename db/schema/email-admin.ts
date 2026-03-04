import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const emailDomains = pgTable(
  "email_domains",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    domain: text("domain").notNull(),
    type: text("type").notNull().default("primary"), // primary|agent|custom
    isVerified: boolean("is_verified").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTenantDomain: uniqueIndex("email_domains_tenant_domain_idx").on(t.tenantId, t.domain),
    byTenant: index("email_domains_tenant_idx").on(t.tenantId, t.createdAt),
  }),
);

export const emailAccounts = pgTable(
  "email_accounts",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    // Optional; kept as an int to avoid tightly coupling to a company model that may evolve.
    companyId: integer("company_id"),
    // Link to a platform human user (ECE user id). Nullable for unassigned/shared mailboxes.
    ownerUserId: integer("owner_user_id"),
    address: text("address").notNull(),
    localPart: text("local_part").notNull(),
    domainId: integer("domain_id")
      .references(() => emailDomains.id, { onDelete: "restrict" })
      .notNull(),
    status: text("status").notNull().default("active"), // active|disabled|provision_failed
    quotaMb: integer("quota_mb"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTenantAddress: uniqueIndex("email_accounts_tenant_address_idx").on(t.tenantId, t.address),
    byTenantCompany: index("email_accounts_tenant_company_idx").on(t.tenantId, t.companyId, t.createdAt),
    byTenantOwner: index("email_accounts_tenant_owner_idx").on(t.tenantId, t.ownerUserId, t.createdAt),
  }),
);

export const emailAliases = pgTable(
  "email_aliases",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    sourceAccountId: integer("source_account_id").references(() => emailAccounts.id, { onDelete: "set null" }),
    sourceAddress: text("source_address").notNull(),
    destination: text("destination").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantSource: index("email_aliases_tenant_source_idx").on(t.tenantId, t.sourceAddress),
    byTenantCreated: index("email_aliases_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);

