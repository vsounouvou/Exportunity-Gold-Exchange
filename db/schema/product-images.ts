import { pgTable, uuid, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { tenants } from "./tenants";
import { sellerProducts } from "./marketplace";

export const productImages = pgTable("product_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: integer("tenant_id")
    .references(() => tenants.id)
    .notNull(),
  productId: integer("product_id")
    .references(() => sellerProducts.id)
    .notNull(),
  role: text("role").notNull(), // primary | angle | detail | lifestyle
  position: integer("position").notNull().default(0),
  label: text("label"),
  assetNamespace: text("asset_namespace").notNull().default("products"),
  assetKey: text("asset_key").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productImagesRelations = relations(productImages, ({ one }) => ({
  tenant: one(tenants, {
    fields: [productImages.tenantId],
    references: [tenants.id],
  }),
  product: one(sellerProducts, {
    fields: [productImages.productId],
    references: [sellerProducts.id],
  }),
}));

