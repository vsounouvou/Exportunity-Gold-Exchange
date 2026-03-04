import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid, boolean, uniqueIndex, numeric } from "drizzle-orm/pg-core";
import { eceUsers } from "./ece";
import { tenants } from "./tenants";

export const metLeadSourceEnum = pgEnum("met_lead_source", ["WEB_FORM", "WHATSAPP", "ADMIN_MANUAL"]);
export const metLeadIntentEnum = pgEnum("met_lead_intent", ["BUILD_HOUSE", "BUY_BRICKS", "VISIT_MODEL", "INFO"]);
export const metLeadStatusEnum = pgEnum("met_lead_status", ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"]);
export const metProductUnitEnum = pgEnum("met_product_unit", ["PIECE", "PALLET"]);
export const metOrderTypeEnum = pgEnum("met_order_type", ["BRICKS"]);
export const metOrderStatusEnum = pgEnum("met_order_status", [
  "DRAFT",
  "SUBMITTED",
  "CONFIRMED",
  "IN_PRODUCTION",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
]);
export const metEstimateStatusEnum = pgEnum("met_estimate_status", ["NEW", "REVIEWING", "SENT", "CLOSED"]);
export const metProjectStatusEnum = pgEnum("met_project_status", ["DRAFT", "PUBLISHED", "ARCHIVED"]);

export const metLeads = pgTable(
  "met_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    tenantKey: text("tenant_key").notNull(),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    city: text("city").notNull(),
    country: text("country"),
    source: metLeadSourceEnum("source").notNull().default("WEB_FORM"),
    intent: metLeadIntentEnum("intent").notNull().default("INFO"),
    message: text("message"),
    internalNotes: text("internal_notes"),
    status: metLeadStatusEnum("status").notNull().default("NEW"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("met_leads_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantStatus: index("met_leads_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
    byTenantKey: index("met_leads_tenant_key_idx").on(t.tenantKey),
  }),
);

export const metProducts = pgTable(
  "met_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    tenantKey: text("tenant_key").notNull(),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    sku: text("sku").notNull(),
    description: text("description"),
    dimensionsMm: jsonb("dimensions_mm").$type<{ length?: number; width?: number; height?: number }>().default({}),
    compressiveStrengthMpa: numeric("compressive_strength_mpa", { precision: 8, scale: 2 }),
    priceCfa: integer("price_cfa").notNull().default(0),
    unit: metProductUnitEnum("unit").notNull().default("PIECE"),
    piecesPerPallet: integer("pieces_per_pallet").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("met_products_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantActive: index("met_products_tenant_active_idx").on(t.tenantId, t.isActive, t.updatedAt),
    byTenantKey: index("met_products_tenant_key_idx").on(t.tenantKey),
    tenantSkuUnique: uniqueIndex("met_products_tenant_sku_uniq").on(t.tenantId, t.sku),
    tenantKeySkuUnique: uniqueIndex("met_products_tenant_key_sku_uniq").on(t.tenantKey, t.sku),
  }),
);

export const metOrders = pgTable(
  "met_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    tenantKey: text("tenant_key").notNull(),
    leadId: uuid("lead_id").references(() => metLeads.id, { onDelete: "set null" }),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    orderType: metOrderTypeEnum("order_type").notNull().default("BRICKS"),
    status: metOrderStatusEnum("status").notNull().default("DRAFT"),
    deliveryAddress: text("delivery_address"),
    city: text("city"),
    distanceKm: numeric("distance_km", { precision: 10, scale: 2 }),
    deliveryFeeCfa: integer("delivery_fee_cfa"),
    subtotalCfa: integer("subtotal_cfa"),
    totalCfa: integer("total_cfa"),
    notes: text("notes"),
    internalNotes: text("internal_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("met_orders_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantStatus: index("met_orders_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
    byTenantKey: index("met_orders_tenant_key_idx").on(t.tenantKey),
  }),
);

export const metOrderItems = pgTable(
  "met_order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    tenantKey: text("tenant_key").notNull(),
    orderId: uuid("order_id").references(() => metOrders.id, { onDelete: "cascade" }).notNull(),
    productId: uuid("product_id").references(() => metProducts.id, { onDelete: "restrict" }).notNull(),
    quantityPieces: integer("quantity_pieces"),
    quantityPallets: integer("quantity_pallets"),
    unitPriceCfa: integer("unit_price_cfa").notNull().default(0),
    totalCfa: integer("total_cfa").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantOrder: index("met_order_items_tenant_order_idx").on(t.tenantId, t.orderId),
    byTenantKey: index("met_order_items_tenant_key_idx").on(t.tenantKey),
  }),
);

export const metEstimateRequests = pgTable(
  "met_estimate_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    tenantKey: text("tenant_key").notNull(),
    leadId: uuid("lead_id").references(() => metLeads.id, { onDelete: "set null" }),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    projectCity: text("project_city").notNull(),
    landSizeM2: numeric("land_size_m2", { precision: 10, scale: 2 }),
    floors: integer("floors"),
    rooms: integer("rooms"),
    budgetCfa: integer("budget_cfa"),
    timeline: text("timeline"),
    brief: text("brief"),
    planFileUrl: text("plan_file_url"),
    status: metEstimateStatusEnum("status").notNull().default("NEW"),
    internalNotes: text("internal_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("met_estimates_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantStatus: index("met_estimates_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
    byTenantKey: index("met_estimates_tenant_key_idx").on(t.tenantKey),
  }),
);

export const metPlans = pgTable(
  "met_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    tenantKey: text("tenant_key").notNull(),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    bedrooms: integer("bedrooms"),
    bathrooms: integer("bathrooms"),
    floors: integer("floors"),
    areaM2: numeric("area_m2", { precision: 10, scale: 2 }),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    thumbnailUrl: text("thumbnail_url"),
    fileUrl: text("file_url"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("met_plans_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantActive: index("met_plans_tenant_active_idx").on(t.tenantId, t.isActive, t.updatedAt),
    byTenantKey: index("met_plans_tenant_key_idx").on(t.tenantKey),
    tenantSlugUnique: uniqueIndex("met_plans_tenant_slug_uniq").on(t.tenantId, t.slug),
    tenantKeySlugUnique: uniqueIndex("met_plans_tenant_key_slug_uniq").on(t.tenantKey, t.slug),
  }),
);

export const metProjects = pgTable(
  "met_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    tenantKey: text("tenant_key").notNull(),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    summary: text("summary"),
    description: text("description"),
    location: text("location"),
    status: metProjectStatusEnum("status").notNull().default("PUBLISHED"),
    isFeatured: boolean("is_featured").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("met_projects_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantStatus: index("met_projects_tenant_status_idx").on(t.tenantId, t.status, t.updatedAt),
    byTenantFeatured: index("met_projects_tenant_featured_idx").on(t.tenantId, t.isFeatured, t.updatedAt),
    byTenantKey: index("met_projects_tenant_key_idx").on(t.tenantKey),
    tenantSlugUnique: uniqueIndex("met_projects_tenant_slug_uniq").on(t.tenantId, t.slug),
    tenantKeySlugUnique: uniqueIndex("met_projects_tenant_key_slug_uniq").on(t.tenantKey, t.slug),
  }),
);

export const metProjectMedia = pgTable(
  "met_project_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    tenantKey: text("tenant_key").notNull(),
    projectId: uuid("project_id").references(() => metProjects.id, { onDelete: "cascade" }).notNull(),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    assetUrl: text("asset_url").notNull(),
    caption: text("caption"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantProject: index("met_project_media_tenant_project_idx").on(t.tenantId, t.projectId, t.sortOrder),
    byTenantKey: index("met_project_media_tenant_key_idx").on(t.tenantKey),
  }),
);

export const metBlogPosts = pgTable(
  "met_blog_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    tenantKey: text("tenant_key").notNull(),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    contentMarkdown: text("content_markdown"),
    coverImageUrl: text("cover_image_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("met_blog_posts_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantPublished: index("met_blog_posts_tenant_published_idx").on(t.tenantId, t.publishedAt),
    byTenantKey: index("met_blog_posts_tenant_key_idx").on(t.tenantKey),
    tenantSlugUnique: uniqueIndex("met_blog_posts_tenant_slug_uniq").on(t.tenantId, t.slug),
    tenantKeySlugUnique: uniqueIndex("met_blog_posts_tenant_key_slug_uniq").on(t.tenantKey, t.slug),
  }),
);

export const metSettings = pgTable(
  "met_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    tenantKey: text("tenant_key").notNull(),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    key: text("key").notNull(),
    value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("met_settings_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantKey: index("met_settings_tenant_key_idx").on(t.tenantKey),
    tenantSettingUnique: uniqueIndex("met_settings_tenant_key_name_uniq").on(t.tenantId, t.key),
  }),
);
