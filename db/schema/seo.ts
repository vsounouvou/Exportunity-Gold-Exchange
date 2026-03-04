import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { tenantSites } from "./tenant-sites";

export const seoPageSnapshots = pgTable(
  "seo_page_snapshots",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    siteId: integer("site_id").references(() => tenantSites.id, { onDelete: "set null" }),
    env: text("env").notNull().default("prod"),
    url: text("url").notNull(),
    path: text("path").notNull(),
    statusCode: integer("status_code").notNull(),
    redirectChain: jsonb("redirect_chain").$type<string[]>().notNull().default([]),
    title: text("title"),
    metaDescription: text("meta_description"),
    canonical: text("canonical"),
    robots: text("robots"),
    openGraph: jsonb("open_graph").$type<Record<string, unknown>>().notNull().default({}),
    twitter: jsonb("twitter").$type<Record<string, unknown>>().notNull().default({}),
    jsonLdPresent: boolean("json_ld_present").notNull().default(false),
    breadcrumbsPresent: boolean("breadcrumbs_present").notNull().default(false),
    internalLinksCount: integer("internal_links_count").notNull().default(0),
    performanceSummary: jsonb("performance_summary").$type<Record<string, unknown>>().notNull().default({}),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCollected: index("seo_page_snapshots_tenant_collected_idx").on(t.tenantId, t.collectedAt),
    byTenantPath: index("seo_page_snapshots_tenant_path_idx").on(t.tenantId, t.path),
  }),
);

export const seoIssues = pgTable(
  "seo_issues",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    siteId: integer("site_id").references(() => tenantSites.id, { onDelete: "set null" }),
    env: text("env").notNull().default("prod"),
    path: text("path").notNull(),
    issueType: text("issue_type").notNull(),
    severity: integer("severity").notNull().default(2), // 1=low,2=med,3=high
    status: text("status").notNull().default("open"), // open|resolved|ignored
    message: text("message").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueIssue: uniqueIndex("seo_issues_tenant_env_path_type_idx").on(t.tenantId, t.env, t.path, t.issueType),
    byTenantStatus: index("seo_issues_tenant_status_idx").on(t.tenantId, t.status, t.lastSeenAt),
  }),
);

export const seoRecommendations = pgTable(
  "seo_recommendations",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    siteId: integer("site_id").references(() => tenantSites.id, { onDelete: "set null" }),
    env: text("env").notNull().default("prod"),
    actionType: text("action_type").notNull(),
    targetPath: text("target_path").notNull(),
    proposedChange: jsonb("proposed_change").$type<Record<string, unknown>>().notNull().default({}),
    expectedImpact: jsonb("expected_impact").$type<Record<string, unknown>>().notNull().default({}),
    severity: integer("severity").notNull().default(2),
    confidence: integer("confidence").notNull().default(50),
    status: text("status").notNull().default("proposed"), // proposed|approved|applied|dismissed
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantStatus: index("seo_recommendations_tenant_status_idx").on(t.tenantId, t.status, t.updatedAt),
  }),
);

export const seoPatches = pgTable(
  "seo_patches",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    siteId: integer("site_id").references(() => tenantSites.id, { onDelete: "set null" }),
    env: text("env").notNull().default("prod"),
    patchType: text("patch_type").notNull(),
    targetPath: text("target_path").notNull(),
    featureFlag: text("feature_flag").notNull(),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    status: text("status").notNull().default("proposed"), // proposed|auto_applied|applied|rolled_back|dismissed
    patch: jsonb("patch").$type<Record<string, unknown>>().notNull().default({}),
    guardrails: jsonb("guardrails").$type<Record<string, unknown>>().notNull().default({}),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
  },
  (t) => ({
    byTenantStatus: index("seo_patches_tenant_status_idx").on(t.tenantId, t.status, t.updatedAt),
  }),
);

