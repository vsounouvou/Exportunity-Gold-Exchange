import { pgTable, uuid, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { agents } from "../schema";
import { tenants } from "./tenants";
import { imageAssets, generatedImages } from "./image-assets";

export const agentPhotoGenerations = pgTable(
  "agent_photo_generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    agentId: integer("agent_id")
      .references(() => agents.id, { onDelete: "cascade" })
      .notNull(),
    prompt: text("prompt").notNull(),
    assetId: uuid("asset_id").references(() => imageAssets.id, { onDelete: "set null" }),
    imageId: uuid("image_id").references(() => generatedImages.id, { onDelete: "set null" }),
    status: text("status", { enum: ["queued", "running", "done", "failed"] }).notNull().default("queued"),
    provider: text("provider").notNull().default("replicate"),
    error: text("error"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantAgentCreatedIdx: index("agent_photo_gens_tenant_agent_created_idx").on(table.tenantId, table.agentId, table.createdAt),
    tenantCreatedIdx: index("agent_photo_gens_tenant_created_idx").on(table.tenantId, table.createdAt),
  }),
);

export const agentPhotoGenerationsRelations = relations(agentPhotoGenerations, ({ one }) => ({
  tenant: one(tenants, {
    fields: [agentPhotoGenerations.tenantId],
    references: [tenants.id],
  }),
  agent: one(agents, {
    fields: [agentPhotoGenerations.agentId],
    references: [agents.id],
  }),
  asset: one(imageAssets, {
    fields: [agentPhotoGenerations.assetId],
    references: [imageAssets.id],
  }),
  image: one(generatedImages, {
    fields: [agentPhotoGenerations.imageId],
    references: [generatedImages.id],
  }),
}));

