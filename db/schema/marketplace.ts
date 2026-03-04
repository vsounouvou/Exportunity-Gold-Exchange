import { pgTable, serial, varchar, text, timestamp, boolean, decimal, integer, jsonb, pgEnum, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "../schema";
import { tenants } from "./tenants";

export const continentEnum = pgEnum("continent", [
  "africa", "europe", "asia", "north_america", "south_america", "oceania", "antarctica"
]);

export const sellerStatusEnum = pgEnum("seller_status", [
  "pending", "verified", "approved", "suspended", "rejected"
]);

export const sellerTypeEnum = pgEnum("seller_type", ["mine", "bureau_d_achat", "trader", "jeweler", "retail_shop"]);

export const productStatusEnum = pgEnum("product_status", [
  "draft", "active", "out_of_stock", "discontinued"
]);

export const orderStatusEnum = pgEnum("marketplace_order_status", [
  "pending", "confirmed", "processing", "ready_for_pickup", "out_for_delivery", "delivered", "cancelled", "refunded"
]);

export const markerIconTypeEnum = pgEnum("marker_icon_type", [
  "lucide", "emoji", "svg", "image_url"
]);

export const geoContinents = pgTable("geo_continents", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 2 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const geoCountries = pgTable("geo_countries", {
  id: serial("id").primaryKey(),
  continentId: integer("continent_id").references(() => geoContinents.id).notNull(),
  code: varchar("code", { length: 3 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  currency: varchar("currency", { length: 3 }),
  phoneCode: varchar("phone_code", { length: 10 }),
  isActive: boolean("is_active").default(true),
  tier: integer("tier").default(3),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const geoRegions = pgTable("geo_regions", {
  id: serial("id").primaryKey(),
  countryId: integer("country_id").references(() => geoCountries.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const geoCities = pgTable("geo_cities", {
  id: serial("id").primaryKey(),
  regionId: integer("region_id").references(() => geoRegions.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  population: integer("population"),
  timezone: varchar("timezone", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const geoDistricts = pgTable("geo_districts", {
  id: serial("id").primaryKey(),
  cityId: integer("city_id").references(() => geoCities.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const geoNeighborhoods = pgTable("geo_neighborhoods", {
  id: serial("id").primaryKey(),
  districtId: integer("district_id").references(() => geoDistricts.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const productCategories = pgTable("product_categories", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  parentId: integer("parent_id"),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  icon: varchar("icon", { length: 50 }),
  color: varchar("color", { length: 20 }),
  mapMarkerKey: varchar("map_marker_key", { length: 100 }),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mapMarkerStyles = pgTable("map_marker_styles", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  key: varchar("key", { length: 100 }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  iconType: markerIconTypeEnum("icon_type").notNull().default("emoji"),
  iconValue: text("icon_value").notNull(),
  iconAssetId: uuid("icon_asset_id"),
  iconPrompt: text("icon_prompt"),
  locked: boolean("locked").notNull().default(false),
  color: varchar("color", { length: 20 }).default("#111827"),
  size: integer("size").default(28),
  zIndex: integer("z_index").default(10),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantKeyUnique: uniqueIndex("map_marker_styles_tenant_key_idx").on(table.tenantId, table.key),
}));

export const sellers = pgTable("sellers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  shopName: varchar("shop_name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  description: text("description"),
  logo: text("logo"),
  coverImage: text("cover_image"),
  sellerType: sellerTypeEnum("seller_type").notNull().default("retail_shop"),
  
  businessRegistration: varchar("business_registration", { length: 100 }),
  personalId: varchar("personal_id", { length: 100 }),
  productionProof: jsonb("production_proof"),
  
  neighborhoodId: integer("neighborhood_id").references(() => geoNeighborhoods.id),
  districtId: integer("district_id").references(() => geoDistricts.id),
  cityId: integer("city_id").references(() => geoCities.id),
  regionId: integer("region_id").references(() => geoRegions.id),
  countryId: integer("country_id").references(() => geoCountries.id),
  
  streetAddress: text("street_address"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  
  phoneNumber: varchar("phone_number", { length: 20 }),
  email: varchar("email", { length: 255 }),
  website: varchar("website", { length: 255 }),
  
  openingHours: jsonb("opening_hours"),
  tags: jsonb("tags"),
  mapMarkerKey: varchar("map_marker_key", { length: 100 }),
  externalSeedId: varchar("external_seed_id", { length: 120 }),
  
  walletBalance: decimal("wallet_balance", { precision: 15, scale: 2 }).default("0.00"),
  totalSales: decimal("total_sales", { precision: 15, scale: 2 }).default("0.00"),
  totalOrders: integer("total_orders").default(0),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("5.00"),
  reviewCount: integer("review_count").default(0),
  
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }).default("10.00"),
  
  status: sellerStatusEnum("status").default("pending"),
  verifiedAt: timestamp("verified_at"),
  approvedAt: timestamp("approved_at"),
  approvedBy: integer("approved_by").references(() => users.id),
  rejectionReason: text("rejection_reason"),
  
  isProducer: boolean("is_producer").default(true).notNull(),
  productionType: varchar("production_type", { length: 100 }),

  // Bourse mine realism fields (optional; only used when productionType = gold_mining)
  mineType: varchar("mine_type", { length: 32 }),
  avgWeeklyOutputKg: decimal("avg_weekly_output_kg", { precision: 10, scale: 3 }),
  availableThisWeekKg: decimal("available_this_week_kg", { precision: 10, scale: 3 }),
  mineLastUpdatedAt: timestamp("mine_last_updated_at"),

  // Output model fields (used for realistic map pins + supply point cards)
  estWeeklyOutputKg: decimal("est_weekly_output_kg", { precision: 10, scale: 3 }).default("1.500"),
  estWeeklyOutputRangeMinKg: decimal("est_weekly_output_range_min_kg", { precision: 10, scale: 3 }).default("1.000"),
  estWeeklyOutputRangeMaxKg: decimal("est_weekly_output_range_max_kg", { precision: 10, scale: 3 }).default("2.000"),
  estWeeklyOutputConfidence: varchar("est_weekly_output_confidence", { length: 12 }).default("med"),
  estWeeklyOutputUpdatedAt: timestamp("est_weekly_output_updated_at"),
  estWeeklyOutputUpdatedBy: text("est_weekly_output_updated_by"),
  
  isDemo: boolean("is_demo").default(false),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sellerProducts = pgTable("seller_products", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  sellerId: integer("seller_id").references(() => sellers.id).notNull(),
  categoryId: integer("category_id").references(() => productCategories.id),
  
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 200 }).notNull(),
  description: text("description"),
  shortDescription: varchar("short_description", { length: 500 }),
  
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  compareAtPrice: decimal("compare_at_price", { precision: 15, scale: 2 }),
  costPrice: decimal("cost_price", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("XOF"),
  
  sku: varchar("sku", { length: 100 }),
  barcode: varchar("barcode", { length: 100 }),
  
  stockQuantity: integer("stock_quantity").default(0),
  lowStockThreshold: integer("low_stock_threshold").default(5),
  trackInventory: boolean("track_inventory").default(true),
  allowBackorder: boolean("allow_backorder").default(false),
  
  weight: decimal("weight", { precision: 10, scale: 2 }),
  weightUnit: varchar("weight_unit", { length: 10 }).default("kg"),
  dimensions: jsonb("dimensions"),
  
  images: jsonb("images"),
  
  isHandmade: boolean("is_handmade").default(true),
  productionTime: varchar("production_time", { length: 100 }),
  ingredients: jsonb("ingredients"),
  allergens: jsonb("allergens"),
  certifications: jsonb("certifications"),
  
  tags: jsonb("tags"),
  attributes: jsonb("attributes"),
  
  status: productStatusEnum("status").default("draft"),
  
  totalSold: integer("total_sold").default(0),
  viewCount: integer("view_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sellerWalletTransactions = pgTable("seller_wallet_transactions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  sellerId: integer("seller_id").references(() => sellers.id).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  balanceBefore: decimal("balance_before", { precision: 15, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 15, scale: 2 }).notNull(),
  description: text("description"),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: integer("reference_id"),
  status: varchar("status", { length: 20 }).default("completed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const buyerWallets = pgTable("buyer_wallets", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  
visitorId: varchar("visitor_id", { length: 100 }),
  userId: integer("user_id").references(() => users.id),
  
  balance: decimal("balance", { precision: 15, scale: 2 }).default("0.00"),
  currency: varchar("currency", { length: 3 }).default("XOF"),
  
  totalDeposited: decimal("total_deposited", { precision: 15, scale: 2 }).default("0.00"),
  totalSpent: decimal("total_spent", { precision: 15, scale: 2 }).default("0.00"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const buyerWalletTransactions = pgTable("buyer_wallet_transactions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  walletId: integer("wallet_id").references(() => buyerWallets.id).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  balanceBefore: decimal("balance_before", { precision: 15, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 15, scale: 2 }).notNull(),
  description: text("description"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  paymentProvider: varchar("payment_provider", { length: 50 }),
  externalReference: varchar("external_reference", { length: 255 }),
  status: varchar("status", { length: 20 }).default("completed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const marketplaceOrders = pgTable("marketplace_orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  orderNumber: varchar("order_number", { length: 50 }).notNull().unique(),
  
  buyerWalletId: integer("buyer_wallet_id").references(() => buyerWallets.id),
  buyerUserId: integer("buyer_user_id").references(() => users.id),
  buyerName: varchar("buyer_name", { length: 200 }),
  buyerPhone: varchar("buyer_phone", { length: 20 }),
  buyerEmail: varchar("buyer_email", { length: 255 }),
  
  sellerId: integer("seller_id").references(() => sellers.id).notNull(),
  
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull(),
  deliveryFee: decimal("delivery_fee", { precision: 15, scale: 2 }).default("0.00"),
  serviceFee: decimal("service_fee", { precision: 15, scale: 2 }).default("0.00"),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0.00"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
  
  fulfillmentType: varchar("fulfillment_type", { length: 20 }).default("delivery"),
  
  deliveryAddress: text("delivery_address"),
  deliveryLatitude: decimal("delivery_latitude", { precision: 10, scale: 7 }),
  deliveryLongitude: decimal("delivery_longitude", { precision: 10, scale: 7 }),
  deliveryInstructions: text("delivery_instructions"),
  
  deliveryOrderId: integer("delivery_order_id"),
  pickupPartnerId: uuid("pickup_partner_id"),
  
  status: orderStatusEnum("status").default("pending"),
  
  notes: text("notes"),
  
  paidAt: timestamp("paid_at"),
  confirmedAt: timestamp("confirmed_at"),
  readyAt: timestamp("ready_at"),
  deliveredAt: timestamp("delivered_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancellationReason: text("cancellation_reason"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const marketplaceOrderItems = pgTable("marketplace_order_items", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  orderId: integer("order_id").references(() => marketplaceOrders.id).notNull(),
  productId: integer("product_id").references(() => sellerProducts.id).notNull(),
  
  productName: varchar("product_name", { length: 200 }).notNull(),
  productImage: text("product_image"),
  
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull(),
  
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const territories = pgTable("territories", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  
  continentId: integer("continent_id").references(() => geoContinents.id),
  countryId: integer("country_id").references(() => geoCountries.id),
  regionId: integer("region_id").references(() => geoRegions.id),
  cityId: integer("city_id").references(() => geoCities.id),
  districtId: integer("district_id").references(() => geoDistricts.id),
  
  boundaryPolygon: jsonb("boundary_polygon"),
  
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const franchisees = pgTable("franchisees", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  territoryId: integer("territory_id").references(() => territories.id).notNull(),
  
  companyName: varchar("company_name", { length: 200 }),
  contactName: varchar("contact_name", { length: 200 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }).default("5.00"),
  royaltyRate: decimal("royalty_rate", { precision: 5, scale: 2 }).default("2.00"),
  
  walletBalance: decimal("wallet_balance", { precision: 15, scale: 2 }).default("0.00"),
  totalEarnings: decimal("total_earnings", { precision: 15, scale: 2 }).default("0.00"),
  
  status: varchar("status", { length: 20 }).default("active"),
  
  isDemo: boolean("is_demo").default(false),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const franchiseTeamMembers = pgTable("franchise_team_members", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  franchiseeId: integer("franchisee_id").references(() => franchisees.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  permissions: jsonb("permissions"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const franchiseCommissions = pgTable("franchise_commissions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  franchiseeId: integer("franchisee_id").references(() => franchisees.id).notNull(),
  orderId: integer("order_id").references(() => marketplaceOrders.id),
  type: varchar("type", { length: 50 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  rate: decimal("rate", { precision: 5, scale: 2 }).notNull(),
  baseAmount: decimal("base_amount", { precision: 15, scale: 2 }).notNull(),
  status: varchar("status", { length: 20 }).default("pending"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sellerReviews = pgTable("seller_reviews", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  sellerId: integer("seller_id").references(() => sellers.id).notNull(),
  orderId: integer("order_id").references(() => marketplaceOrders.id),
  buyerUserId: integer("buyer_user_id").references(() => users.id),
  buyerName: varchar("buyer_name", { length: 200 }),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  isVerifiedPurchase: boolean("is_verified_purchase").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const geoContinentsRelations = relations(geoContinents, ({ many }) => ({
  countries: many(geoCountries),
}));

export const geoCountriesRelations = relations(geoCountries, ({ one, many }) => ({
  continent: one(geoContinents, {
    fields: [geoCountries.continentId],
    references: [geoContinents.id],
  }),
  regions: many(geoRegions),
}));

export const geoRegionsRelations = relations(geoRegions, ({ one, many }) => ({
  country: one(geoCountries, {
    fields: [geoRegions.countryId],
    references: [geoCountries.id],
  }),
  cities: many(geoCities),
}));

export const geoCitiesRelations = relations(geoCities, ({ one, many }) => ({
  region: one(geoRegions, {
    fields: [geoCities.regionId],
    references: [geoRegions.id],
  }),
  districts: many(geoDistricts),
}));

export const geoDistrictsRelations = relations(geoDistricts, ({ one, many }) => ({
  city: one(geoCities, {
    fields: [geoDistricts.cityId],
    references: [geoCities.id],
  }),
  neighborhoods: many(geoNeighborhoods),
}));

export const geoNeighborhoodsRelations = relations(geoNeighborhoods, ({ one }) => ({
  district: one(geoDistricts, {
    fields: [geoNeighborhoods.districtId],
    references: [geoDistricts.id],
  }),
}));

export const sellersRelations = relations(sellers, ({ one, many }) => ({
  user: one(users, {
    fields: [sellers.userId],
    references: [users.id],
  }),
  neighborhood: one(geoNeighborhoods, {
    fields: [sellers.neighborhoodId],
    references: [geoNeighborhoods.id],
  }),
  district: one(geoDistricts, {
    fields: [sellers.districtId],
    references: [geoDistricts.id],
  }),
  city: one(geoCities, {
    fields: [sellers.cityId],
    references: [geoCities.id],
  }),
  region: one(geoRegions, {
    fields: [sellers.regionId],
    references: [geoRegions.id],
  }),
  country: one(geoCountries, {
    fields: [sellers.countryId],
    references: [geoCountries.id],
  }),
  products: many(sellerProducts),
  orders: many(marketplaceOrders),
  walletTransactions: many(sellerWalletTransactions),
  reviews: many(sellerReviews),
}));

export const sellerProductsRelations = relations(sellerProducts, ({ one, many }) => ({
  seller: one(sellers, {
    fields: [sellerProducts.sellerId],
    references: [sellers.id],
  }),
  category: one(productCategories, {
    fields: [sellerProducts.categoryId],
    references: [productCategories.id],
  }),
  orderItems: many(marketplaceOrderItems),
}));

export const marketplaceOrdersRelations = relations(marketplaceOrders, ({ one, many }) => ({
  seller: one(sellers, {
    fields: [marketplaceOrders.sellerId],
    references: [sellers.id],
  }),
  buyerWallet: one(buyerWallets, {
    fields: [marketplaceOrders.buyerWalletId],
    references: [buyerWallets.id],
  }),
  buyerUser: one(users, {
    fields: [marketplaceOrders.buyerUserId],
    references: [users.id],
  }),
  items: many(marketplaceOrderItems),
}));

export const marketplaceOrderItemsRelations = relations(marketplaceOrderItems, ({ one }) => ({
  order: one(marketplaceOrders, {
    fields: [marketplaceOrderItems.orderId],
    references: [marketplaceOrders.id],
  }),
  product: one(sellerProducts, {
    fields: [marketplaceOrderItems.productId],
    references: [sellerProducts.id],
  }),
}));

export const territoriesRelations = relations(territories, ({ one, many }) => ({
  continent: one(geoContinents, {
    fields: [territories.continentId],
    references: [geoContinents.id],
  }),
  country: one(geoCountries, {
    fields: [territories.countryId],
    references: [geoCountries.id],
  }),
  region: one(geoRegions, {
    fields: [territories.regionId],
    references: [geoRegions.id],
  }),
  city: one(geoCities, {
    fields: [territories.cityId],
    references: [geoCities.id],
  }),
  district: one(geoDistricts, {
    fields: [territories.districtId],
    references: [geoDistricts.id],
  }),
  franchisees: many(franchisees),
}));

export const franchiseesRelations = relations(franchisees, ({ one, many }) => ({
  user: one(users, {
    fields: [franchisees.userId],
    references: [users.id],
  }),
  territory: one(territories, {
    fields: [franchisees.territoryId],
    references: [territories.id],
  }),
  teamMembers: many(franchiseTeamMembers),
  commissions: many(franchiseCommissions),
}));

export const buyerWalletsRelations = relations(buyerWallets, ({ one, many }) => ({
  user: one(users, {
    fields: [buyerWallets.userId],
    references: [users.id],
  }),
  transactions: many(buyerWalletTransactions),
  orders: many(marketplaceOrders),
  sentTransfers: many(p2pTransfers, { relationName: "senderWallet" }),
  receivedTransfers: many(p2pTransfers, { relationName: "recipientWallet" }),
}));

export const p2pTransferStatusEnum = pgEnum("p2p_transfer_status", [
  "pending", "completed", "failed", "cancelled"
]);

export const p2pTransfers = pgTable("p2p_transfers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  
  senderWalletId: integer("sender_wallet_id").references(() => buyerWallets.id).notNull(),
  recipientWalletId: integer("recipient_wallet_id").references(() => buyerWallets.id).notNull(),
  
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("XOF"),
  
  senderBalanceBefore: decimal("sender_balance_before", { precision: 15, scale: 2 }).notNull(),
  senderBalanceAfter: decimal("sender_balance_after", { precision: 15, scale: 2 }).notNull(),
  recipientBalanceBefore: decimal("recipient_balance_before", { precision: 15, scale: 2 }).notNull(),
  recipientBalanceAfter: decimal("recipient_balance_after", { precision: 15, scale: 2 }).notNull(),
  
  note: text("note"),
  
  transferMethod: varchar("transfer_method", { length: 20 }).notNull(),
  
  status: p2pTransferStatusEnum("status").default("completed"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const p2pTransfersRelations = relations(p2pTransfers, ({ one }) => ({
  senderWallet: one(buyerWallets, {
    fields: [p2pTransfers.senderWalletId],
    references: [buyerWallets.id],
    relationName: "senderWallet",
  }),
  recipientWallet: one(buyerWallets, {
    fields: [p2pTransfers.recipientWalletId],
    references: [buyerWallets.id],
    relationName: "recipientWallet",
  }),
}));
