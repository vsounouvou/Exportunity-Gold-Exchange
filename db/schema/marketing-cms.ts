import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const marketingRecordStatusEnum = pgEnum("marketing_record_status", ["draft", "published", "archived"]);
export const marketingMediaTypeEnum = pgEnum("marketing_media_type", [
  "article",
  "video",
  "profile",
  "press_release",
  "podcast",
  "post",
]);
export const marketingMediaStatusEnum = pgEnum("marketing_media_status", ["discovered", "reviewed", "published", "rejected"]);

export const marketingPosts = pgTable(
  "marketing_posts",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    contentMarkdown: text("content_markdown"),
    contentHtml: text("content_html"),
    coverImageLocal: text("cover_image_local"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    externalUrl: text("external_url"),
    status: marketingRecordStatusEnum("status").notNull().default("draft"),
    sortOrder: integer("sort_order").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantStatus: index("marketing_posts_tenant_status_idx").on(t.tenantId, t.status, t.sortOrder),
    byTenantPublishedAt: index("marketing_posts_tenant_published_idx").on(t.tenantId, t.publishedAt),
    tenantSlugUnique: uniqueIndex("marketing_posts_tenant_slug_uniq").on(t.tenantId, t.slug),
  }),
);

export const marketingPress = pgTable(
  "marketing_press",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    outlet: text("outlet"),
    excerpt: text("excerpt"),
    externalUrl: text("external_url"),
    thumbnailLocal: text("thumbnail_local"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    status: marketingRecordStatusEnum("status").notNull().default("draft"),
    sortOrder: integer("sort_order").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantStatus: index("marketing_press_tenant_status_idx").on(t.tenantId, t.status, t.sortOrder),
    byTenantPublishedAt: index("marketing_press_tenant_published_idx").on(t.tenantId, t.publishedAt),
    tenantSlugUnique: uniqueIndex("marketing_press_tenant_slug_uniq").on(t.tenantId, t.slug),
  }),
);

export const marketingLibrary = pgTable(
  "marketing_library",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category"),
    language: text("language"),
    duration: text("duration"),
    externalUrl: text("external_url"),
    embedUrl: text("embed_url"),
    thumbnailLocal: text("thumbnail_local"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    status: marketingRecordStatusEnum("status").notNull().default("draft"),
    sortOrder: integer("sort_order").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantStatus: index("marketing_library_tenant_status_idx").on(t.tenantId, t.status, t.sortOrder),
    byTenantPublishedAt: index("marketing_library_tenant_published_idx").on(t.tenantId, t.publishedAt),
    tenantSlugUnique: uniqueIndex("marketing_library_tenant_slug_uniq").on(t.tenantId, t.slug),
  }),
);

export const marketingAssets = pgTable(
  "marketing_assets",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    key: text("key").notNull(),
    title: text("title"),
    localPath: text("local_path").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    sourceUrl: text("source_url"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantKeyUnique: uniqueIndex("marketing_assets_tenant_key_uniq").on(t.tenantId, t.key),
    byTenantCreated: index("marketing_assets_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);

export const marketingMediaRuns = pgTable(
  "marketing_media_runs",
  {
    id: text("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    status: text("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    limitedMode: text("limited_mode").notNull().default("false"),
    stats: jsonb("stats").$type<Record<string, unknown>>().notNull().default({}),
    errors: jsonb("errors").$type<Array<Record<string, unknown>>>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantStarted: index("marketing_media_runs_tenant_started_idx").on(t.tenantId, t.startedAt),
  }),
);

export const marketingMediaSources = pgTable(
  "marketing_media_sources",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    provider: text("provider").notNull(),
    query: text("query").notNull(),
    runId: text("run_id").references(() => marketingMediaRuns.id, { onDelete: "set null" }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantRun: index("marketing_media_sources_tenant_run_idx").on(t.tenantId, t.runId),
    byTenantProvider: index("marketing_media_sources_tenant_provider_idx").on(t.tenantId, t.provider),
  }),
);

export const marketingMediaItems = pgTable(
  "marketing_media_items",
  {
    id: text("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    type: marketingMediaTypeEnum("type").notNull().default("article"),
    title: text("title").notNull(),
    outlet: text("outlet"),
    url: text("url").notNull(),
    canonicalUrl: text("canonical_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    language: text("language"),
    excerpt: text("excerpt"),
    summaryBullets: jsonb("summary_bullets").$type<string[]>().notNull().default([]),
    summaryParagraph: text("summary_paragraph"),
    summaryQuality: text("summary_quality").notNull().default("low"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    thumbnailRemoteUrl: text("thumbnail_remote_url"),
    thumbnailLocalPath: text("thumbnail_local_path"),
    mediaEmbedUrl: text("media_embed_url"),
    author: text("author"),
    sourceQueries: jsonb("source_queries").$type<string[]>().notNull().default([]),
    relevanceScore: real("relevance_score").notNull().default(0),
    confidenceScore: real("confidence_score").notNull().default(0),
    duplicateOf: text("duplicate_of"),
    status: marketingMediaStatusEnum("status").notNull().default("discovered"),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantStatus: index("marketing_media_items_tenant_status_idx").on(t.tenantId, t.status, t.publishedAt),
    byTenantType: index("marketing_media_items_tenant_type_idx").on(t.tenantId, t.type, t.publishedAt),
    byTenantCreated: index("marketing_media_items_tenant_created_idx").on(t.tenantId, t.createdAt),
    tenantUrlUnique: uniqueIndex("marketing_media_items_tenant_url_uniq").on(t.tenantId, t.url),
    tenantCanonicalUnique: uniqueIndex("marketing_media_items_tenant_canonical_uniq").on(t.tenantId, t.canonicalUrl),
  }),
);

export const marketingScreenshots = pgTable(
  "marketing_screenshots",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    module: text("module").notNull().default("platform"),
    caption: text("caption"),
    imageLocalPath: text("image_local_path").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    status: marketingRecordStatusEnum("status").notNull().default("draft"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantStatus: index("marketing_screenshots_tenant_status_idx").on(t.tenantId, t.status, t.sortOrder),
    byTenantModule: index("marketing_screenshots_tenant_module_idx").on(t.tenantId, t.module, t.sortOrder),
    tenantSlugUnique: uniqueIndex("marketing_screenshots_tenant_slug_uniq").on(t.tenantId, t.slug),
  }),
);
