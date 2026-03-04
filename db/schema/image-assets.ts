import { pgTable, text, timestamp, uuid, jsonb, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const imageAssets = pgTable("image_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  namespace: text("namespace").notNull(),
  assetKey: text("asset_key").notNull(),
  variant: text("variant").notNull().default("default"),
  label: text("label"),
  metadata: jsonb("metadata").default({}).notNull(),
  activeImageId: uuid("active_image_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const generatedImages = pgTable("generated_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  namespace: text("namespace").notNull(),
  assetKey: text("asset_key").notNull(),
  variant: text("variant").notNull().default("default"),
  model: text("model").notNull(),
  prompt: text("prompt").notNull(),
  negativePrompt: text("negative_prompt"),
  input: jsonb("input").notNull(),
  promptHash: text("prompt_hash").notNull(),
  contentHash: text("content_hash"),
  status: text("status").notNull(), // queued|running|succeeded|failed
  replicatePredictionId: text("replicate_prediction_id"),
  sourceUrl: text("source_url"),
  storedUrl: text("stored_url"),
  width: integer("width"),
  height: integer("height"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  error: text("error"),
});

export const imageAssetRelations = relations(imageAssets, ({ one, many }) => ({
  activeImage: one(generatedImages, {
    fields: [imageAssets.activeImageId],
    references: [generatedImages.id],
  }),
  generatedImages: many(generatedImages),
}));

export const generatedImageRelations = relations(generatedImages, ({ one }) => ({
  asset: one(imageAssets, {
    fields: [generatedImages.namespace, generatedImages.assetKey, generatedImages.variant],
    references: [imageAssets.namespace, imageAssets.assetKey, imageAssets.variant],
  }),
}));

export const generatedImagesLookup = `
  create index if not exists generated_images_lookup
    on generated_images (namespace, asset_key, variant, prompt_hash);
`;

export const generatedImagesLatest = `
  create index if not exists generated_images_latest
    on generated_images (namespace, asset_key, variant, created_at desc);
`;
