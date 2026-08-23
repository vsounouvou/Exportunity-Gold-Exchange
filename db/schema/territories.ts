import { bigint, pgTable, serial, text, integer, timestamp, numeric, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
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
    fulfilledGmvMinor: bigint("fulfilled_gmv_minor", { mode: "number" }),
    producerIncomeMinor: bigint("producer_income_minor", { mode: "number" }),
    contributionMarginMinor: bigint("contribution_margin_minor", { mode: "number" }),
    creatorAttributedSalesMinor: bigint("creator_attributed_sales_minor", { mode: "number" }),
    mediaSpendMinor: bigint("media_spend_minor", { mode: "number" }),
    productPageSessions: integer("product_page_sessions"),
    qualifiedLeads: integer("qualified_leads"),
    acquiredCustomers: integer("acquired_customers"),
    attributableCompletedOrders: integer("attributable_completed_orders"),
    groupOrderCampaigns: integer("group_order_campaigns"),
    groupOrderThresholdsReached: integer("group_order_thresholds_reached"),
    paymentAttempts: integer("payment_attempts"),
    paymentSuccesses: integer("payment_successes"),
    deliveryAttempts: integer("delivery_attempts"),
    successfulDeliveries: integer("successful_deliveries"),
    onTimeDeliveries: integer("on_time_deliveries"),
    disputes: integer("disputes"),
    refunds: integer("refunds"),
    repeatBuyers: integer("repeat_buyers"),
    rightsClearedAssets: integer("rights_cleared_assets"),
    publishedContentAssets: integer("published_content_assets"),
    currencyCode: text("currency_code"),
    evidenceStatus: text("evidence_status").notNull().default("unknown"),
    metricEvidence: jsonb("metric_evidence").$type<Record<string, unknown>>().notNull().default({}),
    sourceWindowStart: timestamp("source_window_start", { withTimezone: true }),
    sourceWindowEnd: timestamp("source_window_end", { withTimezone: true }),
    evidenceIdempotencyKey: text("evidence_idempotency_key"),
    evidenceVersion: integer("evidence_version").notNull().default(0),
    scorecardActionRunId: integer("scorecard_action_run_id"),
    recordedByUserId: integer("recorded_by_user_id"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
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
