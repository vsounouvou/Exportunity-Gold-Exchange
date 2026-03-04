import { relations } from "drizzle-orm";
import { boolean, decimal, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { marketplaceOrderItems, marketplaceOrders, sellerProducts } from "./marketplace";

export type StampedGoldType = "COIN" | "BAR";
export type StampedGoldItemStatus =
  | "IN_STOCK"
  | "RESERVED"
  | "SOLD"
  | "DELIVERED"
  | "VOID"
  | "CREATED"
  | "ASSIGNED"
  | "ENGRAVED"
  | "SEALED"
  | "CERTIFIED"
  | "IN_VAULT"
  | "READY_PICKUP"
  | "OPENED_VOID";
export type StampedGoldLocationType = "VAULT" | "JEWELLER_PARTNER" | "IN_TRANSIT" | "DELIVERED";
export type PartnerJewellerStockMode = "STOCKED" | "JUST_IN_TIME";
export type VerificationScannerType = "PUBLIC" | "JEWELLER" | "ADMIN";

export const stampedGoldTypeEnum = pgEnum("stamped_gold_type", ["COIN", "BAR"]);
export const stampedGoldItemStatusEnum = pgEnum("stamped_gold_item_status", [
  "IN_STOCK",
  "RESERVED",
  "SOLD",
  "DELIVERED",
  "VOID",
  "CREATED",
  "ASSIGNED",
  "ENGRAVED",
  "SEALED",
  "CERTIFIED",
  "IN_VAULT",
  "READY_PICKUP",
  "OPENED_VOID",
]);
export const stampedGoldLocationTypeEnum = pgEnum("stamped_gold_location_type", ["VAULT", "JEWELLER_PARTNER", "IN_TRANSIT", "DELIVERED"]);
export const partnerJewellerStockModeEnum = pgEnum("partner_jeweller_stock_mode", ["STOCKED", "JUST_IN_TIME"]);

export const partnerJewellers = pgTable("partner_jewellers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: integer("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  email: text("email"),
  address: text("address"),
  phone: text("phone"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  stockMode: partnerJewellerStockModeEnum("stock_mode").notNull().default("JUST_IN_TIME"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stampedGoldSkus = pgTable("stamped_gold_skus", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: integer("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name"),
  productId: integer("product_id")
    .references(() => sellerProducts.id, { onDelete: "cascade" })
    .notNull(),
  stampedType: stampedGoldTypeEnum("stamped_type").notNull(),
  productType: text("product_type"),
  weightGrams: integer("weight_grams").notNull(),
  weightG: decimal("weight_g", { precision: 10, scale: 3 }),
  purity: text("purity").notNull(),
  karat: integer("karat"),
  metal: text("metal").notNull().default("FINE GOLD"),
  brandText: text("brand_text").notNull().default("BOURSE DE L'OR"),
  serialPrefix: text("serial_prefix").notNull(),
  hallmarkText: text("hallmark_text").notNull(),
  year: integer("year"),
  requiresLegalStamp: boolean("requires_legal_stamp").notNull().default(true),
  skuCode: text("sku_code").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stampedGoldItems = pgTable("stamped_gold_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: integer("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  skuId: uuid("sku_id")
    .references(() => stampedGoldSkus.id, { onDelete: "cascade" })
    .notNull(),
  serialCode: text("serial_code").notNull().unique(),
  serial: text("serial"),
  status: stampedGoldItemStatusEnum("status").notNull().default("IN_STOCK"),
  currentLocationType: stampedGoldLocationTypeEnum("current_location_type").notNull().default("VAULT"),
  currentLocationId: uuid("current_location_id").references(() => partnerJewellers.id, { onDelete: "set null" }),
  partnerJewellerId: uuid("partner_jeweller_id").references(() => partnerJewellers.id, { onDelete: "set null" }),
  certificateId: uuid("certificate_id"),
  qrToken: text("qr_token"),
  mintedAt: timestamp("minted_at", { withTimezone: true }).notNull().defaultNow(),
  mintedBy: text("minted_by"),
  expertUserId: integer("expert_user_id"),
  orderId: integer("order_id").references(() => marketplaceOrders.id, { onDelete: "set null" }),
  orderItemId: integer("order_item_id").references(() => marketplaceOrderItems.id, { onDelete: "set null" }),
  ownerUserId: text("owner_user_id"),
  ownerEmail: text("owner_email"),
  soldAt: timestamp("sold_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  pickupIdVerified: boolean("pickup_id_verified").notNull().default(false),
  pickupIdVerifiedAt: timestamp("pickup_id_verified_at", { withTimezone: true }),
  pickupIdVerifiedBy: integer("pickup_id_verified_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stampedGoldCertificates = pgTable("stamped_gold_certificates", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: integer("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  itemId: uuid("item_id")
    .references(() => stampedGoldItems.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  orderId: integer("order_id").references(() => marketplaceOrders.id, { onDelete: "set null" }),
  ownerUserId: text("owner_user_id"),
  ownerEmail: text("owner_email"),
  pickupPartnerId: uuid("pickup_partner_id").references(() => partnerJewellers.id, { onDelete: "set null" }),
  serial: text("serial"),
  qrLink: text("qr_link"),
  sha256Hash: text("sha256_hash"),
  pdfUrl: text("pdf_url"),
  weightG: decimal("weight_g", { precision: 10, scale: 3 }),
  karat: integer("karat"),
  expertUserId: integer("expert_user_id"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stampedGoldVerificationScans = pgTable("stamped_gold_verification_scans", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: integer("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  itemId: uuid("item_id").references(() => stampedGoldItems.id, { onDelete: "set null" }),
  serialCode: text("serial_code").notNull(),
  scannedByUserId: text("scanned_by_user_id"),
  scannerType: text("scanner_type").$type<VerificationScannerType>().notNull().default("PUBLIC"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stampedGoldSkusRelations = relations(stampedGoldSkus, ({ one, many }) => ({
  tenant: one(tenants, { fields: [stampedGoldSkus.tenantId], references: [tenants.id] }),
  product: one(sellerProducts, { fields: [stampedGoldSkus.productId], references: [sellerProducts.id] }),
  items: many(stampedGoldItems),
}));

export const stampedGoldItemsRelations = relations(stampedGoldItems, ({ one, many }) => ({
  sku: one(stampedGoldSkus, { fields: [stampedGoldItems.skuId], references: [stampedGoldSkus.id] }),
  order: one(marketplaceOrders, { fields: [stampedGoldItems.orderId], references: [marketplaceOrders.id] }),
  orderItem: one(marketplaceOrderItems, { fields: [stampedGoldItems.orderItemId], references: [marketplaceOrderItems.id] }),
  scans: many(stampedGoldVerificationScans),
  certificate: one(stampedGoldCertificates, { fields: [stampedGoldItems.id], references: [stampedGoldCertificates.itemId] }),
}));

export const partnerJewellersRelations = relations(partnerJewellers, ({ one, many }) => ({
  tenant: one(tenants, { fields: [partnerJewellers.tenantId], references: [tenants.id] }),
  items: many(stampedGoldItems),
}));

export const stampedGoldCertificatesRelations = relations(stampedGoldCertificates, ({ one }) => ({
  item: one(stampedGoldItems, { fields: [stampedGoldCertificates.itemId], references: [stampedGoldItems.id] }),
}));

export const stampedGoldVerificationScansRelations = relations(stampedGoldVerificationScans, ({ one }) => ({
  item: one(stampedGoldItems, { fields: [stampedGoldVerificationScans.itemId], references: [stampedGoldItems.id] }),
}));
