import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  doublePrecision,
  numeric,
} from "drizzle-orm/pg-core";

import { eceUsers } from "./ece";
import { tenants } from "./tenants";

export const cadastreSiteTypeEnum = pgEnum("cadastre_site_type", [
  "ARTISANAL",
  "SEMI_INDUSTRIAL",
  "INDUSTRIAL",
  "UNKNOWN",
]);

export const cadastreStatusEnum = pgEnum("cadastre_status", ["VERIFIED", "PENDING", "INACTIVE"]);

export const cadastreRiskLevelEnum = pgEnum("cadastre_risk_level", ["LOW", "MEDIUM", "HIGH"]);

export const cadastreSourceEnum = pgEnum("cadastre_source", ["OFFICIAL_CADASTRE", "MANUAL", "IMPORT"]);

export const cadastreSyncStatusEnum = pgEnum("cadastre_sync_status", ["SUCCESS", "PARTIAL", "FAILED"]);

export const miningSites = pgTable(
  "mining_sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    country: text("country").notNull().default("CI"),
    cadastreName: text("cadastre_name").notNull(),
    permitNumber: text("permit_number"),
    region: text("region"),
    department: text("department"),
    commune: text("commune"),
    holderName: text("holder_name"),
    siteType: cadastreSiteTypeEnum("site_type").notNull().default("UNKNOWN"),
    status: cadastreStatusEnum("status").notNull().default("PENDING"),
    riskLevel: cadastreRiskLevelEnum("risk_level").notNull().default("MEDIUM"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    geometryJson: jsonb("geometry_json").$type<Record<string, unknown> | null>(),
    source: cadastreSourceEnum("source").notNull().default("IMPORT"),
    sourceRef: text("source_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCountry: index("mining_sites_tenant_country_idx").on(t.tenantId, t.country),
    byTenantCadastreName: index("mining_sites_tenant_cadastre_name_idx").on(t.tenantId, t.cadastreName),
    byTenantPermit: index("mining_sites_tenant_permit_idx").on(t.tenantId, t.permitNumber),
    byTenantRegion: index("mining_sites_tenant_region_idx").on(t.tenantId, t.region),
    byTenantStatus: index("mining_sites_tenant_status_idx").on(t.tenantId, t.status),
    permitUnique: uniqueIndex("mining_sites_tenant_permit_unique").on(t.tenantId, t.country, t.permitNumber),
  }),
);

export const miningSiteReports = pgTable(
  "mining_site_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    miningSiteId: uuid("mining_site_id")
      .references(() => miningSites.id, { onDelete: "cascade" })
      .notNull(),
    reportDate: timestamp("report_date", { withTimezone: false }).notNull(),
    productionG: numeric("production_g", { precision: 20, scale: 3 }),
    declaredByUserId: integer("declared_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantSiteDate: index("mining_site_reports_tenant_site_date_idx").on(t.tenantId, t.miningSiteId, t.reportDate),
  }),
);

export const cadastreSyncRuns = pgTable(
  "cadastre_sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    status: cadastreSyncStatusEnum("status").notNull().default("FAILED"),
    sourceMode: text("source_mode").notNull().default("scrape"),
    recordsFetched: integer("records_fetched").notNull().default(0),
    recordsUpserted: integer("records_upserted").notNull().default(0),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantStarted: index("cadastre_sync_runs_tenant_started_idx").on(t.tenantId, t.startedAt),
  }),
);

export const demoLinks = pgTable(
  "demo_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: text("token_hash").notNull(),
    label: text("label").notNull(),
    scopes: text("scopes").array().notNull().default(["cadastre:read", "opportunities:read"]),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex("demo_links_token_hash_unique").on(t.tokenHash),
    byTenantExpiry: index("demo_links_tenant_expiry_idx").on(t.tenantId, t.expiresAt),
  }),
);
