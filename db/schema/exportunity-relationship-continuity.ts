import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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

import { contacts } from "./contact";
import { eceUsers } from "./ece";
import { industrialOrderRevenueRecognitions } from "./exportunity-delivery-accounting";
import { industrialSupplierPurchaseOrderPackages } from "./exportunity-supplier-purchase-orders";
import {
  industrialFulfillmentPlans,
  industrialOrders,
  industrialRequirements,
  industrialSupplierProfiles,
} from "./industrial";
import { tenants } from "./tenants";

export const industrialRelationshipContinuityStatusEnum = pgEnum(
  "industrial_relationship_continuity_status",
  ["review_required", "approved_internal"],
);

/**
 * Immutable post-delivery relationship memory. It binds the customer,
 * supplier, product and exact delivered transaction outcome without exposing
 * the private financial snapshot to customer-facing APIs.
 */
export const industrialTransactionRelationshipMemories = pgTable(
  "industrial_transaction_relationship_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "restrict" })
      .notNull(),
    recognitionId: uuid("recognition_id")
      .references(() => industrialOrderRevenueRecognitions.id, {
        onDelete: "restrict",
      })
      .notNull(),
    orderId: uuid("order_id")
      .references(() => industrialOrders.id, { onDelete: "restrict" })
      .notNull(),
    requirementId: uuid("requirement_id")
      .references(() => industrialRequirements.id, { onDelete: "restrict" })
      .notNull(),
    fulfillmentPlanId: uuid("fulfillment_plan_id")
      .references(() => industrialFulfillmentPlans.id, { onDelete: "restrict" })
      .notNull(),
    supplierPurchaseOrderPackageId: uuid(
      "supplier_purchase_order_package_id",
    )
      .references(() => industrialSupplierPurchaseOrderPackages.id, {
        onDelete: "restrict",
      })
      .notNull(),
    supplierProfileId: uuid("supplier_profile_id")
      .references(() => industrialSupplierProfiles.id, { onDelete: "restrict" })
      .notNull(),
    customerContactId: integer("customer_contact_id").references(
      () => contacts.id,
      { onDelete: "restrict" },
    ),
    referenceCode: text("reference_code").notNull(),
    productName: text("product_name").notNull(),
    specification: text("specification"),
    quantityText: text("quantity_text").notNull(),
    unitOfMeasure: text("unit_of_measure").notNull(),
    destination: text("destination").notNull(),
    countryOfOrigin: text("country_of_origin"),
    cadenceText: text("cadence_text"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }).notNull(),
    currencyCode: text("currency_code").notNull(),
    revenueMinor: numeric("revenue_minor", { precision: 30, scale: 0 }).notNull(),
    actualCostMinor: numeric("actual_cost_minor", {
      precision: 30,
      scale: 0,
    }).notNull(),
    actualGrossMarginMinor: numeric("actual_gross_margin_minor", {
      precision: 30,
      scale: 0,
    }).notNull(),
    customerMemory: jsonb("customer_memory")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    supplierMemory: jsonb("supplier_memory")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    sourceSnapshot: jsonb("source_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    evidenceHash: text("evidence_hash").notNull(),
    memoryHash: text("memory_hash").notNull(),
    recordedByUserId: integer("recorded_by_user_id")
      .references(() => eceUsers.id, { onDelete: "restrict" })
      .notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantRecognitionUnique: uniqueIndex(
      "industrial_rel_memory_tenant_recognition_uq",
    ).on(table.tenantId, table.recognitionId),
    tenantOrderUnique: uniqueIndex("industrial_rel_memory_tenant_order_uq").on(
      table.tenantId,
      table.orderId,
    ),
    tenantReferenceUnique: uniqueIndex(
      "industrial_rel_memory_tenant_reference_uq",
    ).on(table.tenantId, table.referenceCode),
    tenantMemoryHashUnique: uniqueIndex(
      "industrial_rel_memory_tenant_hash_uq",
    ).on(table.tenantId, table.memoryHash),
    customerIndex: index("industrial_rel_memory_customer_idx").on(
      table.tenantId,
      table.customerContactId,
      table.deliveredAt,
    ),
    supplierIndex: index("industrial_rel_memory_supplier_idx").on(
      table.tenantId,
      table.supplierProfileId,
      table.deliveredAt,
    ),
    currencyCheck: check(
      "industrial_rel_memory_currency_check",
      sql`${table.currencyCode} ~ '^[A-Z]{3}$'`,
    ),
    amountsCheck: check(
      "industrial_rel_memory_amounts_check",
      sql`${table.revenueMinor} > 0 AND ${table.actualCostMinor} > 0 AND ${table.actualGrossMarginMinor} = ${table.revenueMinor} - ${table.actualCostMinor}`,
    ),
    evidenceCheck: check(
      "industrial_rel_memory_evidence_check",
      sql`${table.evidenceHash} ~ '^[a-f0-9]{64}$' AND ${table.memoryHash} ~ '^[a-f0-9]{64}$' AND length(trim(${table.productName})) >= 2 AND length(trim(${table.quantityText})) >= 1 AND length(trim(${table.unitOfMeasure})) >= 1 AND length(trim(${table.destination})) >= 2`,
    ),
  }),
);

/**
 * A governed internal review plan over immutable relationship memory. Approval
 * schedules only an internal review; it cannot authorize or execute contact.
 */
export const industrialRelationshipContinuityReviews = pgTable(
  "industrial_relationship_continuity_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "restrict" })
      .notNull(),
    memoryId: uuid("memory_id")
      .references(() => industrialTransactionRelationshipMemories.id, {
        onDelete: "restrict",
      })
      .notNull(),
    status: industrialRelationshipContinuityStatusEnum("status")
      .notNull()
      .default("review_required"),
    recommendedAction: text("recommended_action").notNull(),
    proposedNextReviewAt: timestamp("proposed_next_review_at", {
      withTimezone: true,
    }),
    consentStatus: text("consent_status").notNull().default("unknown"),
    isDnc: boolean("is_dnc").notNull().default(false),
    decisionChecklist: jsonb("decision_checklist")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    decisionReason: text("decision_reason"),
    approvedByUserId: integer("approved_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "restrict" },
    ),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    externalCommunicationAuthorized: boolean(
      "external_communication_authorized",
    )
      .notNull()
      .default(false),
    externalCommunicationExecuted: boolean("external_communication_executed")
      .notNull()
      .default(false),
    externalMessageReference: text("external_message_reference"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantMemoryUnique: uniqueIndex(
      "industrial_rel_continuity_tenant_memory_uq",
    ).on(table.tenantId, table.memoryId),
    reviewQueueIndex: index("industrial_rel_continuity_review_queue_idx").on(
      table.tenantId,
      table.status,
      table.proposedNextReviewAt,
    ),
    statusEvidenceCheck: check(
      "industrial_rel_continuity_status_check",
      sql`${table.status} <> 'approved_internal' OR (${table.approvedByUserId} IS NOT NULL AND ${table.approvedAt} IS NOT NULL AND ${table.proposedNextReviewAt} IS NOT NULL AND length(trim(${table.decisionReason})) >= 12)`,
    ),
    noExternalCommunicationCheck: check(
      "industrial_rel_continuity_no_external_check",
      sql`${table.externalCommunicationAuthorized} = false AND ${table.externalCommunicationExecuted} = false AND ${table.externalMessageReference} IS NULL`,
    ),
  }),
);
