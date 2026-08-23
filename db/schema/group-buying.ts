import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { carrierBookingAuthorizations } from "./carrier-network";
import { contacts } from "./contact";
import { eceUsers } from "./ece";
import {
  industrialCatalogItems,
  industrialFactories,
  industrialOrders,
  industrialSupplierProfiles,
} from "./industrial";
import { marketingMediaItems } from "./marketing-cms";
import { payments } from "./payments";
import { tenants } from "./tenants";
import { geoTerritories } from "./territories";
import { mediaRightsGrants } from "./territory-media-commerce";

export const groupBuyingCampaignTypeEnum = pgEnum("group_buying_campaign_type", [
  "preorder",
  "group_order",
  "buyer_club",
  "production_batch",
  "recurring_procurement",
]);

export const groupBuyingCampaignStatusEnum = pgEnum("group_buying_campaign_status", [
  "draft",
  "verification_required",
  "live",
  "threshold_pending",
  "moq_reached",
  "payment_confirmed",
  "production",
  "ready_for_pickup",
  "in_transit",
  "delivered",
  "settled",
  "failed",
  "refunding",
  "refunded",
]);

export const groupBuyingCommitmentStatusEnum = pgEnum(
  "group_buying_commitment_status",
  [
    "interest_recorded",
    "order_required",
    "payment_pending",
    "payment_confirmed",
    "allocated_to_batch",
    "fulfilled",
    "cancelled",
    "refund_pending",
    "refunded",
  ],
);

export const groupBuyingUpdateStatusEnum = pgEnum("group_buying_update_status", [
  "draft",
  "approved",
  "published",
  "withdrawn",
]);

export const productionBatchStatusEnum = pgEnum("production_batch_status", [
  "planned",
  "capacity_confirmed",
  "funded_by_orders",
  "production",
  "quality_review",
  "ready_for_pickup",
  "in_transit",
  "delivered",
  "settlement_pending",
  "settled",
  "failed",
  "refunding",
  "refunded",
]);

export const groupSettlementStatusEnum = pgEnum("group_settlement_status", [
  "draft",
  "approval_required",
  "approved_submission_ready",
  "submitted",
  "provider_confirmed",
  "reconciled",
  "reversed",
]);

/**
 * A commerce campaign only. It is never an equity, debt, revenue-share, or
 * investment instrument. Aggregate paid quantity is derived from canonical
 * industrial orders and provider-reconciled payment rows.
 */
export const groupBuyingCampaigns = pgTable(
  "group_buying_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    referenceCode: text("reference_code").notNull(),
    slug: text("slug").notNull(),
    campaignType: groupBuyingCampaignTypeEnum("campaign_type").notNull(),
    status: groupBuyingCampaignStatusEnum("status").notNull().default("draft"),
    catalogItemId: uuid("catalog_item_id")
      .references(() => industrialCatalogItems.id, { onDelete: "restrict" })
      .notNull(),
    producerFactoryId: uuid("producer_factory_id")
      .references(() => industrialFactories.id, { onDelete: "restrict" })
      .notNull(),
    supplierProfileId: uuid("supplier_profile_id").references(
      () => industrialSupplierProfiles.id,
      { onDelete: "set null" },
    ),
    territoryId: integer("territory_id")
      .references(() => geoTerritories.id, { onDelete: "restrict" })
      .notNull(),
    campaignMediaItemId: text("campaign_media_item_id").references(
      () => marketingMediaItems.id,
      { onDelete: "set null" },
    ),
    mediaRightsGrantId: integer("media_rights_grant_id").references(
      () => mediaRightsGrants.id,
      { onDelete: "set null" },
    ),
    title: text("title").notNull(),
    publicSummary: text("public_summary").notNull(),
    unitOfMeasure: text("unit_of_measure").notNull(),
    minimumQuantity: numeric("minimum_quantity", { precision: 18, scale: 4 }).notNull(),
    interestQuantity: numeric("interest_quantity", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    pendingQuantity: numeric("pending_quantity", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    committedQuantity: numeric("committed_quantity", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    fulfilledQuantity: numeric("fulfilled_quantity", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    refundedQuantity: numeric("refunded_quantity", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    currencyCode: text("currency_code").notNull(),
    baseUnitPriceMinor: bigint("base_unit_price_minor", { mode: "number" }).notNull(),
    deadline: timestamp("deadline", { withTimezone: true }).notNull(),
    productionLeadTimeDays: integer("production_lead_time_days").notNull(),
    estimatedReadyAt: timestamp("estimated_ready_at", { withTimezone: true }),
    deliveryOptions: jsonb("delivery_options")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    paymentTerms: text("payment_terms").notNull(),
    refundConditions: text("refund_conditions").notNull(),
    capacityEvidence: jsonb("capacity_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    campaignContent: jsonb("campaign_content")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    verificationEvidence: jsonb("verification_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    commerceRail: text("commerce_rail").notNull().default("preorder_or_group_purchase"),
    regulatedCapitalEnabled: boolean("regulated_capital_enabled").notNull().default(false),
    riskClassification: text("risk_classification").notNull().default("standard_commerce"),
    externalPaymentCollectionExecuted: boolean("external_payment_collection_executed")
      .notNull()
      .default(false),
    externalSettlementExecuted: boolean("external_settlement_executed")
      .notNull()
      .default(false),
    preparationActionRunId: integer("preparation_action_run_id"),
    approvalActionRunId: integer("approval_action_run_id"),
    preparedByUserId: integer("prepared_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    approvedByUserId: integer("approved_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    liveAt: timestamp("live_at", { withTimezone: true }),
    thresholdReachedAt: timestamp("threshold_reached_at", { withTimezone: true }),
    paymentConfirmedAt: timestamp("payment_confirmed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantReferenceUnique: uniqueIndex("group_buying_campaigns_tenant_reference_unique").on(
      table.tenantId,
      table.referenceCode,
    ),
    tenantSlugUnique: uniqueIndex("group_buying_campaigns_tenant_slug_unique").on(
      table.tenantId,
      table.slug,
    ),
    tenantStatusIndex: index("group_buying_campaigns_tenant_status_idx").on(
      table.tenantId,
      table.status,
      table.deadline,
    ),
    territoryStatusIndex: index("group_buying_campaigns_territory_status_idx").on(
      table.territoryId,
      table.status,
      table.deadline,
    ),
  }),
);

export const groupBuyingPriceTiers = pgTable(
  "group_buying_price_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    campaignId: uuid("campaign_id")
      .references(() => groupBuyingCampaigns.id, { onDelete: "cascade" })
      .notNull(),
    minimumQuantity: numeric("minimum_quantity", { precision: 18, scale: 4 }).notNull(),
    maximumQuantity: numeric("maximum_quantity", { precision: 18, scale: 4 }),
    unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
    currencyCode: text("currency_code").notNull(),
    label: text("label"),
    status: text("status").notNull().default("draft"),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    verifiedByUserId: integer("verified_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    campaignMinimumUnique: uniqueIndex("group_buying_price_tiers_campaign_minimum_unique").on(
      table.campaignId,
      table.minimumQuantity,
    ),
    campaignStatusIndex: index("group_buying_price_tiers_campaign_status_idx").on(
      table.campaignId,
      table.status,
      table.minimumQuantity,
    ),
  }),
);

export const groupBuyingCommitments = pgTable(
  "group_buying_commitments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    campaignId: uuid("campaign_id")
      .references(() => groupBuyingCampaigns.id, { onDelete: "cascade" })
      .notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    buyerUserId: integer("buyer_user_id").references(() => eceUsers.id, {
      onDelete: "restrict",
    }),
    buyerContactId: integer("buyer_contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    status: groupBuyingCommitmentStatusEnum("status")
      .notNull()
      .default("interest_recorded"),
    quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
    priceTierId: uuid("price_tier_id").references(() => groupBuyingPriceTiers.id, {
      onDelete: "set null",
    }),
    unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
    totalAmountMinor: bigint("total_amount_minor", { mode: "number" }).notNull(),
    currencyCode: text("currency_code").notNull(),
    industrialOrderId: uuid("industrial_order_id").references(() => industrialOrders.id, {
      onDelete: "restrict",
    }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "restrict" }),
    canonicalPaymentVerified: boolean("canonical_payment_verified").notNull().default(false),
    paymentEvidence: jsonb("payment_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    deliveryOptionSnapshot: jsonb("delivery_option_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    buyerNotes: text("buyer_notes"),
    refundConditionsAcceptedAt: timestamp("refund_conditions_accepted_at", {
      withTimezone: true,
    }),
    paymentConfirmedAt: timestamp("payment_confirmed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    updatedByUserId: integer("updated_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdempotencyUnique: uniqueIndex("group_buying_commitments_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    industrialOrderUnique: uniqueIndex("group_buying_commitments_industrial_order_unique").on(
      table.industrialOrderId,
    ),
    paymentUnique: uniqueIndex("group_buying_commitments_payment_unique").on(table.paymentId),
    campaignStatusIndex: index("group_buying_commitments_campaign_status_idx").on(
      table.campaignId,
      table.status,
      table.createdAt,
    ),
    buyerIndex: index("group_buying_commitments_buyer_idx").on(
      table.tenantId,
      table.buyerUserId,
      table.createdAt,
    ),
  }),
);

export const groupBuyingUpdates = pgTable(
  "group_buying_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    campaignId: uuid("campaign_id")
      .references(() => groupBuyingCampaigns.id, { onDelete: "cascade" })
      .notNull(),
    status: groupBuyingUpdateStatusEnum("status").notNull().default("draft"),
    audience: text("audience").notNull().default("buyers"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    approvedByUserId: integer("approved_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    campaignStatusIndex: index("group_buying_updates_campaign_status_idx").on(
      table.campaignId,
      table.status,
      table.createdAt,
    ),
  }),
);

export const groupBuyingEvents = pgTable(
  "group_buying_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    campaignId: uuid("campaign_id")
      .references(() => groupBuyingCampaigns.id, { onDelete: "cascade" })
      .notNull(),
    sequence: integer("sequence").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    eventType: text("event_type").notNull(),
    previousStatus: groupBuyingCampaignStatusEnum("previous_status"),
    nextStatus: groupBuyingCampaignStatusEnum("next_status"),
    actorUserId: integer("actor_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    publicMessage: text("public_message"),
    internalNote: text("internal_note"),
    evidence: jsonb("evidence").$type<Array<Record<string, unknown>>>().notNull().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    campaignSequenceUnique: uniqueIndex("group_buying_events_campaign_sequence_unique").on(
      table.campaignId,
      table.sequence,
    ),
    tenantIdempotencyUnique: uniqueIndex("group_buying_events_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    campaignCreatedIndex: index("group_buying_events_campaign_created_idx").on(
      table.campaignId,
      table.createdAt,
    ),
  }),
);

export const productionBatches = pgTable(
  "production_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    campaignId: uuid("campaign_id")
      .references(() => groupBuyingCampaigns.id, { onDelete: "cascade" })
      .notNull(),
    referenceCode: text("reference_code").notNull(),
    status: productionBatchStatusEnum("status").notNull().default("planned"),
    targetQuantity: numeric("target_quantity", { precision: 18, scale: 4 }).notNull(),
    allocatedQuantity: numeric("allocated_quantity", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    producedQuantity: numeric("produced_quantity", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    passedInspectionQuantity: numeric("passed_inspection_quantity", {
      precision: 18,
      scale: 4,
    })
      .notNull()
      .default("0"),
    readyQuantity: numeric("ready_quantity", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    handedToCarrierQuantity: numeric("handed_to_carrier_quantity", {
      precision: 18,
      scale: 4,
    })
      .notNull()
      .default("0"),
    deliveredQuantity: numeric("delivered_quantity", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    carrierBookingAuthorizationId: uuid("carrier_booking_authorization_id").references(
      () => carrierBookingAuthorizations.id,
      { onDelete: "set null" },
    ),
    capacityEvidence: jsonb("capacity_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    productionEvidence: jsonb("production_evidence")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    inspectionEvidence: jsonb("inspection_evidence")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    handoffEvidence: jsonb("handoff_evidence")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    deliveryEvidence: jsonb("delivery_evidence")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    settlementEvidence: jsonb("settlement_evidence")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    externalProductionExecuted: boolean("external_production_executed")
      .notNull()
      .default(false),
    externalCarrierHandoffExecuted: boolean("external_carrier_handoff_executed")
      .notNull()
      .default(false),
    externalSettlementExecuted: boolean("external_settlement_executed")
      .notNull()
      .default(false),
    approvedByUserId: integer("approved_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    handedToCarrierAt: timestamp("handed_to_carrier_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    updatedByUserId: integer("updated_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    campaignUnique: uniqueIndex("production_batches_campaign_unique").on(table.campaignId),
    tenantReferenceUnique: uniqueIndex("production_batches_tenant_reference_unique").on(
      table.tenantId,
      table.referenceCode,
    ),
    tenantStatusIndex: index("production_batches_tenant_status_idx").on(
      table.tenantId,
      table.status,
      table.updatedAt,
    ),
  }),
);

export const productionBatchAllocations = pgTable(
  "production_batch_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    productionBatchId: uuid("production_batch_id")
      .references(() => productionBatches.id, { onDelete: "cascade" })
      .notNull(),
    commitmentId: uuid("commitment_id")
      .references(() => groupBuyingCommitments.id, { onDelete: "restrict" })
      .notNull(),
    industrialOrderId: uuid("industrial_order_id")
      .references(() => industrialOrders.id, { onDelete: "restrict" })
      .notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
    status: text("status").notNull().default("allocated"),
    allocatedByUserId: integer("allocated_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    allocatedAt: timestamp("allocated_at", { withTimezone: true }).notNull().defaultNow(),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    batchCommitmentUnique: uniqueIndex("production_batch_allocations_commitment_unique").on(
      table.commitmentId,
    ),
    batchStatusIndex: index("production_batch_allocations_batch_status_idx").on(
      table.productionBatchId,
      table.status,
    ),
  }),
);

export const groupSettlementPlans = pgTable(
  "group_settlement_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    campaignId: uuid("campaign_id")
      .references(() => groupBuyingCampaigns.id, { onDelete: "cascade" })
      .notNull(),
    productionBatchId: uuid("production_batch_id")
      .references(() => productionBatches.id, { onDelete: "cascade" })
      .notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: groupSettlementStatusEnum("status").notNull().default("draft"),
    grossCollectedMinor: bigint("gross_collected_minor", { mode: "number" }).notNull(),
    refundExposureMinor: bigint("refund_exposure_minor", { mode: "number" }).notNull().default(0),
    distributableMinor: bigint("distributable_minor", { mode: "number" }).notNull(),
    currencyCode: text("currency_code").notNull(),
    calculationEvidence: jsonb("calculation_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    approvalEvidence: jsonb("approval_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    providerEvidence: jsonb("provider_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    providerSettlementReference: text("provider_settlement_reference"),
    externalSettlementExecuted: boolean("external_settlement_executed")
      .notNull()
      .default(false),
    preparationActionRunId: integer("preparation_action_run_id"),
    approvalActionRunId: integer("approval_action_run_id"),
    preparedByUserId: integer("prepared_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    approvedByUserId: integer("approved_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    providerConfirmedAt: timestamp("provider_confirmed_at", { withTimezone: true }),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdempotencyUnique: uniqueIndex("group_settlement_plans_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    batchUnique: uniqueIndex("group_settlement_plans_batch_unique").on(table.productionBatchId),
    tenantStatusIndex: index("group_settlement_plans_tenant_status_idx").on(
      table.tenantId,
      table.status,
      table.updatedAt,
    ),
  }),
);

export const groupSettlementAllocations = pgTable(
  "group_settlement_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    settlementPlanId: uuid("settlement_plan_id")
      .references(() => groupSettlementPlans.id, { onDelete: "cascade" })
      .notNull(),
    commitmentId: uuid("commitment_id").references(() => groupBuyingCommitments.id, {
      onDelete: "set null",
    }),
    recipientRole: text("recipient_role").notNull(),
    recipientReference: text("recipient_reference"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currencyCode: text("currency_code").notNull(),
    calculationBasis: text("calculation_basis").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    planRoleCommitmentUnique: uniqueIndex("group_settlement_allocations_plan_role_commitment_unique").on(
      table.settlementPlanId,
      table.recipientRole,
      sql`coalesce(${table.commitmentId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
    planIndex: index("group_settlement_allocations_plan_idx").on(
      table.settlementPlanId,
      table.recipientRole,
    ),
  }),
);
