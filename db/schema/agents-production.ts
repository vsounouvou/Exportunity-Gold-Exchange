import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { agents } from "../schema";
import { tenants } from "./tenants";

export const agentsProduction = pgTable(
  "agents_production",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    agentId: integer("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    agentKey: text("agent_key").notNull(),
    displayName: text("display_name"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTenantAgentKey: uniqueIndex("agents_production_tenant_key_idx").on(t.tenantId, t.agentKey),
    uniqueTenantAgentId: uniqueIndex("agents_production_tenant_agent_id_idx").on(t.tenantId, t.agentId),
    byTenantCreated: index("agents_production_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantEnabled: index("agents_production_tenant_enabled_idx").on(t.tenantId, t.isEnabled, t.updatedAt),
  }),
);

export const agentsProductionRelations = relations(agentsProduction, ({ one }) => ({
  agent: one(agents, {
    fields: [agentsProduction.agentId],
    references: [agents.id],
  }),
  tenant: one(tenants, {
    fields: [agentsProduction.tenantId],
    references: [tenants.id],
  }),
}));

