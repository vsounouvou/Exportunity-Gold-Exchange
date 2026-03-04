import { relations } from "drizzle-orm";
import { integer, pgTable, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { eceUsers } from "./ece";
import { tenants, tenantRoleEnum } from "./tenants";

export const userTenantRoles = pgTable(
  "user_tenant_roles",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => eceUsers.id, { onDelete: "cascade" }).notNull(),
    role: tenantRoleEnum("role").notNull().default("USER"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    tenantUserRoleIdx: uniqueIndex("user_tenant_roles_unique").on(table.tenantId, table.userId, table.role),
  }),
);

export const userTenantRolesRelations = relations(userTenantRoles, ({ one }) => ({
  tenant: one(tenants, {
    fields: [userTenantRoles.tenantId],
    references: [tenants.id],
  }),
  user: one(eceUsers, {
    fields: [userTenantRoles.userId],
    references: [eceUsers.id],
  }),
}));
