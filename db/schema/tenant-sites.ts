import { index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const tenantSites = pgTable(
  "tenant_sites",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    env: text("env").notNull().default("prod"),
    domain: text("domain").notNull(),
    canonicalHost: text("canonical_host").notNull(),
    defaultLocale: text("default_locale").notNull().default("en"),
    defaultCountry: text("default_country"),
    urlPatterns: jsonb("url_patterns").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    uniqueDomain: uniqueIndex("tenant_sites_tenant_env_domain_idx").on(t.tenantId, t.env, t.domain),
    byTenant: index("tenant_sites_tenant_idx").on(t.tenantId),
  }),
);

