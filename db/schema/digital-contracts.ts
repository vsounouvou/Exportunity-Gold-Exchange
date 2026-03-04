import { relations } from "drizzle-orm";
import { decimal, integer, jsonb, pgEnum, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { bureauDAchat } from "./gold-exchange";
import { eceUsers } from "./ece";
import { tenants } from "./tenants";

export const digitalContractTypeEnum = pgEnum("digital_contract_type", [
  "investment_revenue_share",
  "offtake_order",
  "tri_party_investment_offtake",
]);

export const digitalContractStatusEnum = pgEnum("digital_contract_status", [
  "draft",
  "pending_signatures",
  "active",
  "completed",
  "terminated",
]);

export const payoutFrequencyEnum = pgEnum("digital_payout_frequency", ["per_sale", "per_rotation", "monthly"]);
export const contractPartyEnum = pgEnum("digital_contract_party", ["partyA", "partyB", "partyC"]);

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
  "draft",
  "submitted",
  "accepted",
  "executed",
  "settled",
  "cancelled",
]);

export const digitalPayoutStatusEnum = pgEnum("digital_payout_status", ["scheduled", "due", "paid"]);

export const digitalContracts = pgTable("digital_contracts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  contractId: text("contract_id").notNull().unique(),

  contractType: digitalContractTypeEnum("contract_type").notNull(),

  mineId: text("mine_id").notNull(),
  investmentOpportunityId: text("investment_opportunity_id"),
  bureauAchatId: integer("bureau_achat_id").references(() => bureauDAchat.id),

  partyAUserId: integer("party_a_user_id").references(() => eceUsers.id),
  partyBUserId: integer("party_b_user_id").references(() => eceUsers.id).notNull(),
  partyCUserId: integer("party_c_user_id").references(() => eceUsers.id),

  principalAmount: decimal("principal_amount", { precision: 20, scale: 4 }).notNull(),
  currency: text("currency").notNull().default("USD"),

  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  rotationCount: integer("rotation_count"),

  returnModel: jsonb("return_model")
    .$type<
      | { type: "revenue_share_percent"; revenueSharePercent: number }
      | { type: "premium_per_rotation"; premiumPerRotationPercent: number }
    >()
    .notNull(),

  payoutFrequency: payoutFrequencyEnum("payout_frequency").notNull().default("per_sale"),

  cap: jsonb("cap").$type<{ maxPayout?: number; maxRotations?: number }>().default({}),
  terminationClauses: text("termination_clauses"),

  status: digitalContractStatusEnum("status").notNull().default("draft"),
  documents: jsonb("documents")
    .$type<{
      previewText?: string;
      pdfUrl?: string;
      attachments?: Array<{ name: string; url: string; type?: string }>;
    }>()
    .default({}),

  metadata: jsonb("metadata")
    .$type<{
      requiredParties?: Array<"partyA" | "partyB" | "partyC">;
      notes?: string;
    }>()
    .default({}),

  activatedAt: timestamp("activated_at"),
  completedAt: timestamp("completed_at"),
  terminatedAt: timestamp("terminated_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const digitalContractSignatures = pgTable("digital_contract_signatures", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  contractDbId: integer("contract_db_id")
    .references(() => digitalContracts.id, { onDelete: "cascade" })
    .notNull(),
  party: contractPartyEnum("party").notNull(),
  userId: integer("user_id").references(() => eceUsers.id).notNull(),
  signedAt: timestamp("signed_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  orderId: text("order_id").notNull().unique(),

  bureauAchatId: integer("bureau_achat_id")
    .references(() => bureauDAchat.id)
    .notNull(),
  mineId: text("mine_id").notNull(),

  goldType: text("gold_type").notNull().default("dore"),
  quantityKg: decimal("quantity_kg", { precision: 15, scale: 4 }).notNull(),
  pricingReference: text("pricing_reference"),

  status: purchaseOrderStatusEnum("status").notNull().default("draft"),
  linkedContractDbId: integer("linked_contract_db_id").references(() => digitalContracts.id),

  evidence: jsonb("evidence")
    .$type<{ invoiceRef?: string; receiptRef?: string; attachments?: Array<{ name: string; url: string }> }>()
    .default({}),

  submittedAt: timestamp("submitted_at"),
  acceptedAt: timestamp("accepted_at"),
  executedAt: timestamp("executed_at"),
  settledAt: timestamp("settled_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const revenueEvents = pgTable("revenue_events", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  eventId: text("event_id").notNull().unique(),

  mineId: text("mine_id").notNull(),
  bureauAchatId: integer("bureau_achat_id")
    .references(() => bureauDAchat.id)
    .notNull(),
  linkedContractDbId: integer("linked_contract_db_id").references(() => digitalContracts.id),
  purchaseOrderDbId: integer("purchase_order_db_id").references(() => purchaseOrders.id),

  grossRevenue: decimal("gross_revenue", { precision: 20, scale: 4 }).notNull(),
  netRevenue: decimal("net_revenue", { precision: 20, scale: 4 }),
  currency: text("currency").notNull().default("USD"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),

  evidence: jsonb("evidence")
    .$type<{ invoiceRef?: string; receiptRef?: string; notes?: string; attachments?: Array<{ name: string; url: string }> }>()
    .default({}),

  createdAt: timestamp("created_at").defaultNow(),
});

export const digitalPayouts = pgTable("digital_payouts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  payoutId: text("payout_id").notNull().unique(),

  contractDbId: integer("contract_db_id")
    .references(() => digitalContracts.id, { onDelete: "cascade" })
    .notNull(),
  investorUserId: integer("investor_user_id").references(() => eceUsers.id).notNull(),
  revenueEventDbId: integer("revenue_event_db_id").references(() => revenueEvents.id),

  amount: decimal("amount", { precision: 20, scale: 4 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  status: digitalPayoutStatusEnum("status").notNull().default("due"),

  dueAt: timestamp("due_at").defaultNow(),
  paidAt: timestamp("paid_at"),

  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const digitalContractsRelations = relations(digitalContracts, ({ one, many }) => ({
  bureau: one(bureauDAchat, {
    fields: [digitalContracts.bureauAchatId],
    references: [bureauDAchat.id],
  }),
  partyA: one(eceUsers, {
    fields: [digitalContracts.partyAUserId],
    references: [eceUsers.id],
  }),
  partyB: one(eceUsers, {
    fields: [digitalContracts.partyBUserId],
    references: [eceUsers.id],
  }),
  partyC: one(eceUsers, {
    fields: [digitalContracts.partyCUserId],
    references: [eceUsers.id],
  }),
  signatures: many(digitalContractSignatures),
  purchaseOrders: many(purchaseOrders),
  revenueEvents: many(revenueEvents),
  payouts: many(digitalPayouts),
}));

export const digitalContractSignaturesRelations = relations(digitalContractSignatures, ({ one }) => ({
  contract: one(digitalContracts, {
    fields: [digitalContractSignatures.contractDbId],
    references: [digitalContracts.id],
  }),
  user: one(eceUsers, {
    fields: [digitalContractSignatures.userId],
    references: [eceUsers.id],
  }),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  bureau: one(bureauDAchat, {
    fields: [purchaseOrders.bureauAchatId],
    references: [bureauDAchat.id],
  }),
  linkedContract: one(digitalContracts, {
    fields: [purchaseOrders.linkedContractDbId],
    references: [digitalContracts.id],
  }),
  revenueEvents: many(revenueEvents),
}));

export const revenueEventsRelations = relations(revenueEvents, ({ one, many }) => ({
  bureau: one(bureauDAchat, {
    fields: [revenueEvents.bureauAchatId],
    references: [bureauDAchat.id],
  }),
  linkedContract: one(digitalContracts, {
    fields: [revenueEvents.linkedContractDbId],
    references: [digitalContracts.id],
  }),
  purchaseOrder: one(purchaseOrders, {
    fields: [revenueEvents.purchaseOrderDbId],
    references: [purchaseOrders.id],
  }),
  payouts: many(digitalPayouts),
}));

export const digitalPayoutsRelations = relations(digitalPayouts, ({ one }) => ({
  contract: one(digitalContracts, {
    fields: [digitalPayouts.contractDbId],
    references: [digitalContracts.id],
  }),
  investor: one(eceUsers, {
    fields: [digitalPayouts.investorUserId],
    references: [eceUsers.id],
  }),
  revenueEvent: one(revenueEvents, {
    fields: [digitalPayouts.revenueEventDbId],
    references: [revenueEvents.id],
  }),
}));
