import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, decimal, uniqueIndex, index } from "drizzle-orm/pg-core";
import { eceUsers } from "./ece";
import { tenants } from "./tenants";

export const waChannelStatusEnum = pgEnum("wa_channel_status", ["active", "disabled"]);
export const waMessageDirectionEnum = pgEnum("wa_message_direction", ["in", "out"]);
export const waMessageTypeEnum = pgEnum("wa_message_type", [
  "text",
  "image",
  "video",
  "document",
  "audio",
  "interactive",
  "template",
]);
export const waDeliveryStatusEnum = pgEnum("wa_delivery_status", ["sent", "delivered", "read", "failed"]);
export const waOpsTicketStatusEnum = pgEnum("wa_ops_ticket_status", ["open", "resolved"]);
export const waOfferStatusEnum = pgEnum("wa_offer_status", ["draft", "pending_review", "published", "withdrawn"]);
export const waOrderStatusEnum = pgEnum("wa_order_status", [
  "pending_terms",
  "kyc_required",
  "payment_pending",
  "escrow_pending",
  "in_progress",
  "completed",
  "cancelled",
]);

export const waConversationStatusEnum = pgEnum("wa_conversation_status", ["open", "closed"]);

export const whatsappConversations = pgTable(
  "whatsapp_conversations",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    conversationId: text("conversation_id").notNull(),
    waPhoneE164: text("wa_phone_e164").notNull(),
    waDisplayName: text("wa_display_name"),
    status: waConversationStatusEnum("status").notNull().default("open"),
    lastInboundAt: timestamp("last_inbound_at"),
    lastOutboundAt: timestamp("last_outbound_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    tenantConversationUnique: uniqueIndex("whatsapp_conversations_tenant_conversation_unique").on(t.tenantId, t.conversationId),
    byTenantPhone: index("whatsapp_conversations_tenant_phone_idx").on(t.tenantId, t.waPhoneE164),
  })
);

export const userWhatsappChannels = pgTable(
  "user_whatsapp_channels",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => eceUsers.id, { onDelete: "cascade" })
      .notNull(),
    waPhoneE164: text("wa_phone_e164").notNull(),
    waDisplayName: text("wa_display_name"),
    verifiedAt: timestamp("verified_at"),
    status: waChannelStatusEnum("status").notNull().default("active"),
    lastSeenAt: timestamp("last_seen_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    waPhoneUnique: uniqueIndex("user_whatsapp_channels_wa_phone_unique").on(t.waPhoneE164),
    userUnique: uniqueIndex("user_whatsapp_channels_user_unique").on(t.userId),
  })
);

export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    direction: waMessageDirectionEnum("direction").notNull(),
    waMessageId: text("wa_message_id").notNull(),
    clientMessageId: text("client_message_id"),
    userId: integer("user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    waPhoneE164: text("wa_phone_e164").notNull(),
    timestamp: timestamp("timestamp"),
    messageType: waMessageTypeEnum("message_type").notNull(),
    textBody: text("text_body"),
    payloadJson: jsonb("payload_json").notNull(),
    conversationId: text("conversation_id"),
    deliveryStatus: waDeliveryStatusEnum("delivery_status").notNull().default("sent"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    waMessageUnique: uniqueIndex("whatsapp_messages_wa_message_id_unique").on(t.waMessageId),
    tenantClientMessageUnique: uniqueIndex("whatsapp_messages_tenant_client_message_id_unique").on(t.tenantId, t.clientMessageId),
    byTenant: index("whatsapp_messages_tenant_idx").on(t.tenantId),
    byPhone: index("whatsapp_messages_phone_idx").on(t.waPhoneE164),
    byConversation: index("whatsapp_messages_conversation_idx").on(t.conversationId),
    byUser: index("whatsapp_messages_user_idx").on(t.userId),
    byTenantCreatedAt: index("whatsapp_messages_tenant_created_at_idx").on(t.tenantId, t.createdAt),
  })
);

export const whatsappMedia = pgTable(
  "whatsapp_media",
  {
    id: serial("id").primaryKey(),
    waMediaId: text("wa_media_id").notNull(),
    userId: integer("user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    mimeType: text("mime_type"),
    sha256: text("sha256"),
    storageUrl: text("storage_url"),
    sizeBytes: integer("size_bytes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    waMediaUnique: uniqueIndex("whatsapp_media_wa_media_id_unique").on(t.waMediaId),
    byUser: index("whatsapp_media_user_idx").on(t.userId),
  })
);

export const waConversationState = pgTable(
  "wa_conversation_state",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => eceUsers.id, { onDelete: "cascade" })
      .notNull(),
    stateKey: text("state_key").notNull(),
    stateJson: jsonb("state_json").notNull().default({}),
    expiresAt: timestamp("expires_at"),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    userStateKeyUnique: uniqueIndex("wa_conversation_state_user_key_unique").on(t.userId, t.stateKey),
  })
);

export const assistantActionsLog = pgTable(
  "assistant_actions_log",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => eceUsers.id, { onDelete: "set null" })
      .notNull(),
    source: text("source").notNull().default("whatsapp"),
    intent: text("intent").notNull(),
    inputMessageIds: jsonb("input_message_ids").$type<string[]>().notNull().default([]),
    entitiesJson: jsonb("entities_json").notNull().default({}),
    actionTaken: text("action_taken"),
    resultRefType: text("result_ref_type"),
    resultRefId: text("result_ref_id"),
    confidence: decimal("confidence", { precision: 5, scale: 2 }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    byUser: index("assistant_actions_log_user_idx").on(t.userId),
    byIntent: index("assistant_actions_log_intent_idx").on(t.intent),
  })
);

// Internal helper table for OTP linking (Mode A).
export const whatsappLinkTokens = pgTable(
  "whatsapp_link_tokens",
  {
    id: serial("id").primaryKey(),
    waPhoneE164: text("wa_phone_e164").notNull(),
    otpHash: text("otp_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    byPhone: index("whatsapp_link_tokens_phone_idx").on(t.waPhoneE164),
    byOtpHash: index("whatsapp_link_tokens_otp_hash_idx").on(t.otpHash),
  })
);

export const waOpsTickets = pgTable(
  "wa_ops_tickets",
  {
    id: serial("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    userId: integer("user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    waPhoneE164: text("wa_phone_e164").notNull(),
    reason: text("reason").notNull(),
    status: waOpsTicketStatusEnum("status").notNull().default("open"),
    takenOverByUserId: integer("taken_over_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => ({
    byConversation: index("wa_ops_tickets_conversation_idx").on(t.conversationId),
    byPhone: index("wa_ops_tickets_phone_idx").on(t.waPhoneE164),
    byStatus: index("wa_ops_tickets_status_idx").on(t.status),
  })
);

export const waOffers = pgTable(
  "wa_offers",
  {
    id: serial("id").primaryKey(),
    createdByUserId: integer("created_by_user_id")
      .references(() => eceUsers.id, { onDelete: "set null" })
      .notNull(),
    status: waOfferStatusEnum("status").notNull().default("draft"),
    type: text("type").notNull(), // dore|dust|nuggets|bar (or extended)
    quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
    unit: text("unit").notNull(), // g|kg|oz|bar etc
    locationJson: jsonb("location_json")
      .$type<{ country: string; region?: string; city?: string }>()
      .notNull()
      .default({ country: "CI" }),
    priceJson: jsonb("price_json").$type<{
      amount?: number;
      currency?: string;
      unit?: string;
    }>(),
    mediaIds: jsonb("media_ids").$type<number[]>().notNull().default([]),
    notes: text("notes"),
    metadata: jsonb("metadata").notNull().default({}),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    byCreator: index("wa_offers_creator_idx").on(t.createdByUserId),
    byStatus: index("wa_offers_status_idx").on(t.status),
  })
);

export const waOrders = pgTable(
  "wa_orders",
  {
    id: serial("id").primaryKey(),
    offerId: integer("offer_id").references(() => waOffers.id, { onDelete: "set null" }),
    buyerUserId: integer("buyer_user_id")
      .references(() => eceUsers.id, { onDelete: "set null" })
      .notNull(),
    quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
    unit: text("unit").notNull(),
    status: waOrderStatusEnum("status").notNull().default("pending_terms"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    byBuyer: index("wa_orders_buyer_idx").on(t.buyerUserId),
    byStatus: index("wa_orders_status_idx").on(t.status),
  })
);

export const userWhatsappChannelsRelations = relations(userWhatsappChannels, ({ one }) => ({
  user: one(eceUsers, { fields: [userWhatsappChannels.userId], references: [eceUsers.id] }),
}));
