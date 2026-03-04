import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { eceUsers } from "./ece";
import { tenants } from "./tenants";

export const tenantSwitchTokens = pgTable("tenant_switch_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: integer("user_id").references(() => eceUsers.id, { onDelete: "cascade" }).notNull(),
  targetTenantId: integer("target_tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
