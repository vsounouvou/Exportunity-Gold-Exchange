import { decimal, index, integer, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";

import { eceUsers } from "./ece";
import { tenants } from "./tenants";

export const mineDailyProduction = pgTable(
  "mine_daily_production",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    companyId: integer("company_id").notNull(),
    userId: integer("user_id")
      .references(() => eceUsers.id, { onDelete: "cascade" })
      .notNull(),
    siteId: text("site_id"),
    date: text("date").notNull(), // YYYY-MM-DD
    gramsTotal: decimal("grams_total", { precision: 20, scale: 3 }).notNull(),
    purityPercent: decimal("purity_percent", { precision: 5, scale: 2 }),
    shift: text("shift", { enum: ["AM", "PM"] }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantCompanySiteDateUnique: uniqueIndex("mine_daily_production_unique").on(
      table.tenantId,
      table.companyId,
      table.siteId,
      table.date,
    ),
    tenantCompanyDateIdx: index("mine_daily_production_tenant_company_date_idx").on(table.tenantId, table.companyId, table.date),
    tenantUserDateIdx: index("mine_daily_production_tenant_user_date_idx").on(table.tenantId, table.userId, table.date),
  }),
);

