import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
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

import { eceUsers } from "./ece";
import {
  industrialFulfillmentEvents,
  industrialFulfillmentPlans,
  industrialFulfillmentServices,
  industrialOrders,
  industrialQuotes,
} from "./industrial";
import { industrialProcurementAuthorizations } from "./exportunity-procurement";
import { industrialSupplierPurchaseOrderPackages } from "./exportunity-supplier-purchase-orders";
import { payments } from "./payments";
import { tenants } from "./tenants";

export const industrialActualCostDirectionEnum = pgEnum(
  "industrial_actual_cost_direction",
  ["cost", "reversal"],
);

export const industrialActualCostCategoryEnum = pgEnum(
  "industrial_actual_cost_category",
  [
    "supplier",
    "inspection",
    "freight",
    "customs",
    "last_mile",
    "duties_taxes",
    "banking_provider_fees",
    "other",
  ],
);

export const industrialRevenueRecognitionStatusEnum = pgEnum(
  "industrial_revenue_recognition_status",
  ["approval_required", "recognized"],
);

/**
 * Immutable, private actual-cost evidence. Corrections are additive reversal
 * rows so financial evidence is never edited or deleted in place.
 */
export const industrialOrderActualCostEntries = pgTable(
  "industrial_order_actual_cost_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "restrict" })
      .notNull(),
    orderId: uuid("order_id")
      .references(() => industrialOrders.id, { onDelete: "restrict" })
      .notNull(),
    fulfillmentPlanId: uuid("fulfillment_plan_id")
      .references(() => industrialFulfillmentPlans.id, { onDelete: "restrict" })
      .notNull(),
    fulfillmentServiceId: uuid("fulfillment_service_id").references(
      () => industrialFulfillmentServices.id,
      { onDelete: "restrict" },
    ),
    supplierPurchaseOrderPackageId: uuid(
      "supplier_purchase_order_package_id",
    ).references(() => industrialSupplierPurchaseOrderPackages.id, {
      onDelete: "restrict",
    }),
    reversesCostEntryId: uuid("reverses_cost_entry_id").references(
      (): AnyPgColumn => industrialOrderActualCostEntries.id,
      { onDelete: "restrict" },
    ),
    referenceCode: text("reference_code").notNull(),
    direction: industrialActualCostDirectionEnum("direction")
      .notNull()
      .default("cost"),
    category: industrialActualCostCategoryEnum("category").notNull(),
    currencyCode: text("currency_code").notNull(),
    amountMinor: numeric("amount_minor", { precision: 30, scale: 0 }).notNull(),
    costReference: text("cost_reference").notNull(),
    description: text("description").notNull(),
    evidence: jsonb("evidence")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    evidenceHash: text("evidence_hash").notNull(),
    entryHash: text("entry_hash").notNull(),
    incurredAt: timestamp("incurred_at", { withTimezone: true }).notNull(),
    recordedReason: text("recorded_reason").notNull(),
    recordedByUserId: integer("recorded_by_user_id")
      .references(() => eceUsers.id, { onDelete: "restrict" })
      .notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    externalAccountingPosted: boolean("external_accounting_posted")
      .notNull()
      .default(false),
    externalAccountingReference: text("external_accounting_reference"),
  },
  (table) => ({
    tenantReferenceUnique: uniqueIndex(
      "industrial_actual_cost_tenant_reference_uq",
    ).on(table.tenantId, table.referenceCode),
    tenantEntryHashUnique: uniqueIndex(
      "industrial_actual_cost_tenant_hash_uq",
    ).on(table.tenantId, table.entryHash),
    tenantOrderIndex: index("industrial_actual_cost_tenant_order_idx").on(
      table.tenantId,
      table.orderId,
      table.recordedAt,
    ),
    reversalIndex: index("industrial_actual_cost_reversal_idx").on(
      table.reversesCostEntryId,
    ),
    amountCheck: check(
      "industrial_actual_cost_amount_check",
      sql`${table.amountMinor} > 0`,
    ),
    currencyCheck: check(
      "industrial_actual_cost_currency_check",
      sql`${table.currencyCode} ~ '^[A-Z]{3}$'`,
    ),
    evidenceCheck: check(
      "industrial_actual_cost_evidence_check",
      sql`jsonb_typeof(${table.evidence}) = 'array' AND jsonb_array_length(${table.evidence}) > 0 AND length(trim(${table.costReference})) >= 3 AND length(trim(${table.description})) >= 3 AND length(trim(${table.recordedReason})) >= 12`,
    ),
    hashesCheck: check(
      "industrial_actual_cost_hashes_check",
      sql`${table.evidenceHash} ~ '^[a-f0-9]{64}$' AND ${table.entryHash} ~ '^[a-f0-9]{64}$'`,
    ),
    reversalShapeCheck: check(
      "industrial_actual_cost_reversal_shape_check",
      sql`(${table.direction} = 'cost' AND ${table.reversesCostEntryId} IS NULL) OR (${table.direction} = 'reversal' AND ${table.reversesCostEntryId} IS NOT NULL)`,
    ),
    noExternalPostingCheck: check(
      "industrial_actual_cost_no_external_check",
      sql`${table.externalAccountingPosted} = false AND ${table.externalAccountingReference} IS NULL`,
    ),
  }),
);

/**
 * Internal recognition snapshot. Revenue can be recognized only against a
 * successful exact payment, delivered fulfillment plan, immutable delivery
 * proof, and the complete immutable actual-cost ledger.
 */
export const industrialOrderRevenueRecognitions = pgTable(
  "industrial_order_revenue_recognitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "restrict" })
      .notNull(),
    orderId: uuid("order_id")
      .references(() => industrialOrders.id, { onDelete: "restrict" })
      .notNull(),
    customerQuoteId: uuid("customer_quote_id")
      .references(() => industrialQuotes.id, { onDelete: "restrict" })
      .notNull(),
    sourcePaymentId: uuid("source_payment_id")
      .references(() => payments.id, { onDelete: "restrict" })
      .notNull(),
    procurementAuthorizationId: uuid("procurement_authorization_id")
      .references(() => industrialProcurementAuthorizations.id, {
        onDelete: "restrict",
      })
      .notNull(),
    supplierPurchaseOrderPackageId: uuid(
      "supplier_purchase_order_package_id",
    )
      .references(() => industrialSupplierPurchaseOrderPackages.id, {
        onDelete: "restrict",
      })
      .notNull(),
    fulfillmentPlanId: uuid("fulfillment_plan_id")
      .references(() => industrialFulfillmentPlans.id, { onDelete: "restrict" })
      .notNull(),
    deliveryProofEventId: uuid("delivery_proof_event_id")
      .references(() => industrialFulfillmentEvents.id, { onDelete: "restrict" })
      .notNull(),
    referenceCode: text("reference_code").notNull(),
    status: industrialRevenueRecognitionStatusEnum("status")
      .notNull()
      .default("approval_required"),
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
    plannedCostMinor: numeric("planned_cost_minor", {
      precision: 30,
      scale: 0,
    }).notNull(),
    plannedMarginMinor: numeric("planned_margin_minor", {
      precision: 30,
      scale: 0,
    }).notNull(),
    costVarianceMinor: numeric("cost_variance_minor", {
      precision: 30,
      scale: 0,
    }).notNull(),
    marginVarianceMinor: numeric("margin_variance_minor", {
      precision: 30,
      scale: 0,
    }).notNull(),
    costEntryIds: jsonb("cost_entry_ids").$type<string[]>().notNull().default([]),
    costEvidenceHash: text("cost_evidence_hash").notNull(),
    deliveryProofHash: text("delivery_proof_hash").notNull(),
    sourcePricingHash: text("source_pricing_hash").notNull(),
    sourceOrderConfirmationHash: text("source_order_confirmation_hash").notNull(),
    recognitionHash: text("recognition_hash").notNull(),
    sourceSnapshot: jsonb("source_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    approvalChecklist: jsonb("approval_checklist")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    preparedReason: text("prepared_reason").notNull(),
    preparedByUserId: integer("prepared_by_user_id")
      .references(() => eceUsers.id, { onDelete: "restrict" })
      .notNull(),
    preparedAt: timestamp("prepared_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    recognizedReason: text("recognized_reason"),
    recognizedByUserId: integer("recognized_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "restrict" },
    ),
    recognizedAt: timestamp("recognized_at", { withTimezone: true }),
    externalJournalPosted: boolean("external_journal_posted")
      .notNull()
      .default(false),
    externalJournalReference: text("external_journal_reference"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantOrderUnique: uniqueIndex(
      "industrial_revenue_recognition_tenant_order_uq",
    ).on(table.tenantId, table.orderId),
    tenantReferenceUnique: uniqueIndex(
      "industrial_revenue_recognition_tenant_reference_uq",
    ).on(table.tenantId, table.referenceCode),
    tenantHashUnique: uniqueIndex(
      "industrial_revenue_recognition_tenant_hash_uq",
    ).on(table.tenantId, table.recognitionHash),
    tenantStatusIndex: index(
      "industrial_revenue_recognition_tenant_status_idx",
    ).on(table.tenantId, table.status, table.updatedAt),
    currencyCheck: check(
      "industrial_revenue_recognition_currency_check",
      sql`${table.currencyCode} ~ '^[A-Z]{3}$'`,
    ),
    amountsCheck: check(
      "industrial_revenue_recognition_amounts_check",
      sql`${table.revenueMinor} > 0 AND ${table.actualCostMinor} > 0 AND ${table.plannedCostMinor} >= 0 AND ${table.actualGrossMarginMinor} = ${table.revenueMinor} - ${table.actualCostMinor} AND ${table.costVarianceMinor} = ${table.actualCostMinor} - ${table.plannedCostMinor} AND ${table.marginVarianceMinor} = ${table.actualGrossMarginMinor} - ${table.plannedMarginMinor}`,
    ),
    costEntriesCheck: check(
      "industrial_revenue_recognition_cost_entries_check",
      sql`jsonb_typeof(${table.costEntryIds}) = 'array' AND jsonb_array_length(${table.costEntryIds}) > 0`,
    ),
    hashesCheck: check(
      "industrial_revenue_recognition_hashes_check",
      sql`${table.costEvidenceHash} ~ '^[a-f0-9]{64}$' AND ${table.deliveryProofHash} ~ '^[a-f0-9]{64}$' AND ${table.sourcePricingHash} ~ '^[a-f0-9]{64}$' AND ${table.sourceOrderConfirmationHash} ~ '^[a-f0-9]{64}$' AND ${table.recognitionHash} ~ '^[a-f0-9]{64}$'`,
    ),
    recognitionEvidenceCheck: check(
      "industrial_revenue_recognition_evidence_check",
      sql`${table.status} <> 'recognized' OR (${table.recognizedByUserId} IS NOT NULL AND ${table.recognizedAt} IS NOT NULL AND length(trim(${table.recognizedReason})) >= 12)`,
    ),
    noExternalJournalCheck: check(
      "industrial_revenue_recognition_no_external_check",
      sql`${table.externalJournalPosted} = false AND ${table.externalJournalReference} IS NULL`,
    ),
  }),
);
