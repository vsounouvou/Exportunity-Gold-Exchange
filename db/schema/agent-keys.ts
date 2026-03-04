import { pgTable, uuid, text, jsonb, integer, timestamp } from "drizzle-orm/pg-core";

export const agentKeys = pgTable("agent_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  scopes: jsonb("scopes").notNull().default({ images: ["generate"] }),
  rateLimitPerDay: integer("rate_limit_per_day").notNull().default(200),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

