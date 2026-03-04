import { pgTable, serial, text, integer, timestamp, numeric, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const geoTerritories = pgTable("geo_territories", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  parentTerritoryId: integer("parent_territory_id").references((): any => geoTerritories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  countryCode: text("country_code").notNull(),
  city: text("city"),
  territoryType: text("territory_type", { enum: ["country", "region", "city", "district", "neighborhood"] }).notNull().default("neighborhood"),
  geometryType: text("geometry_type"),
  geometryGeojson: jsonb("geometry_geojson"),
  bbox: jsonb("bbox").$type<[number, number, number, number] | null>(),
  source: text("source"),
  sourceRef: text("source_ref"),
  sourceVersion: text("source_version"),
  confidence: integer("confidence"),
  centerLat: numeric("center_lat", { precision: 10, scale: 7 }).notNull(),
  centerLng: numeric("center_lng", { precision: 10, scale: 7 }).notNull(),
  radiusMeters: integer("radius_meters").notNull(),
  currency: text("currency").default("XOF"),
  language: text("language").default("fr"),
  status: text("status", { enum: ["inactive", "active", "suspended"] }).notNull().default("inactive"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const territoryBudgets = pgTable(
  "territory_budgets",
  {
    id: serial("id").primaryKey(),
    territoryId: integer("territory_id").references(() => geoTerritories.id, { onDelete: "cascade" }).notNull(),
    month: text("month").notNull(), // YYYY-MM
    fundedAmount: integer("funded_amount").notNull().default(0),
    spentAmount: integer("spent_amount").notNull().default(0),
    budgetCap: integer("budget_cap").notNull().default(0),
    mode: text("mode", { enum: ["low_power", "funded"] }).notNull().default("low_power"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    uniqueMonth: uniqueIndex("territory_budgets_territory_month_idx").on(table.territoryId, table.month),
  })
);

export const territoryKpis = pgTable(
  "territory_kpis",
  {
    id: serial("id").primaryKey(),
    territoryId: integer("territory_id").references(() => geoTerritories.id, { onDelete: "cascade" }).notNull(),
    month: text("month").notNull(), // YYYY-MM
    gmv: integer("gmv").notNull().default(0),
    platformFees: integer("platform_fees").notNull().default(0),
    ordersCount: integer("orders_count").notNull().default(0),
    activeBuyers: integer("active_buyers").notNull().default(0),
    activeSellers: integer("active_sellers").notNull().default(0),
    avgDeliveryTime: integer("avg_delivery_time"), // minutes
    disputeRate: numeric("dispute_rate", { precision: 5, scale: 2 }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    uniqueMonth: uniqueIndex("territory_kpis_territory_month_idx").on(table.territoryId, table.month),
  })
);

export const referrerProfiles = pgTable("referrer_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  territoryId: integer("territory_id").references(() => geoTerritories.id, { onDelete: "cascade" }).notNull(),
  status: text("status", { enum: ["active", "inactive", "removed"] }).notNull().default("active"),
  lastCheckinAt: timestamp("last_checkin_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const territoryLeaderboards = pgTable(
  "territory_leaderboards",
  {
    id: serial("id").primaryKey(),
    territoryId: integer("territory_id").references(() => geoTerritories.id, { onDelete: "cascade" }).notNull(),
    month: text("month").notNull(),
    winnerUserId: integer("winner_user_id"),
    winningMetricValue: integer("winning_metric_value").default(0),
    metricType: text("metric_type", { enum: ["platform_fees", "gmv_influenced"] }).notNull().default("platform_fees"),
    computedAt: timestamp("computed_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    uniqueMonth: uniqueIndex("territory_leaderboards_territory_month_idx").on(table.territoryId, table.month),
  })
);

export const territoryOperatorContracts = pgTable(
  "territory_operator_contracts",
  {
    id: serial("id").primaryKey(),
    territoryId: integer("territory_id").references(() => geoTerritories.id, { onDelete: "cascade" }).notNull(),
    operatorUserId: integer("operator_user_id").notNull(),
    month: text("month").notNull(),
    fundedAmount: integer("funded_amount").notNull().default(0),
    revenueSharePct: integer("revenue_share_pct").notNull().default(0), // basis points (e.g., 500 = 5%)
    disclaimerAcceptedAt: timestamp("disclaimer_accepted_at"),
    status: text("status", { enum: ["active", "ended"] }).notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    uniqueMonth: uniqueIndex("territory_operator_contracts_idx").on(table.territoryId, table.month),
  })
);
