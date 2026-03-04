import { pgTable, serial, text, timestamp, jsonb, integer, boolean, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const messageTemplates = pgTable(
  "message_templates",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    language: text("language").notNull().default("en"),
    templateText: text("template_text").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    intents: jsonb("intents").$type<string[]>().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    byTenant: index("message_templates_tenant_idx").on(t.tenantId),
    byCategory: index("message_templates_category_idx").on(t.category),
    byLanguage: index("message_templates_language_idx").on(t.language),
    byActive: index("message_templates_active_idx").on(t.isActive),
  })
);

