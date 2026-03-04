import { pgEnum, pgTable, serial, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export const tenantRoleEnum = pgEnum("tenant_role", [
  "SUPER_ADMIN",
  "TENANT_ADMIN",
  "SHAREHOLDER",
  "OPS",
  "SUPPORT",
  "USER",
]);

export const tenants = pgTable(
  "tenants",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    domains: jsonb("domains").$type<string[]>().default([]),
    themeConfig: jsonb("theme_config").$type<Record<string, unknown>>().default({}),
    featureFlags: jsonb("feature_flags").$type<Record<string, boolean>>().default({}),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    keyIdx: uniqueIndex("tenants_key_idx").on(table.key),
  }),
);
