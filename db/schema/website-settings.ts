import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const websiteSettings = pgTable("website_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  scope: text("scope").notNull(),
  key: text("key").notNull(),
  value: jsonb("value").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

export const websiteSettingsUnique = `
  create unique index if not exists website_settings_scope_key_idx
    on website_settings(scope, key);
`;
