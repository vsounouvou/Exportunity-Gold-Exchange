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

import { eceUsers } from "./ece";
import {
  industrialFulfillmentPlans,
  industrialFulfillmentServices,
  industrialOrders,
  industrialQuotes,
  industrialSupplierProfiles,
} from "./industrial";
import { industrialProcurementAuthorizations } from "./exportunity-procurement";
import { industrialSupplierQuotes } from "./exportunity-supplier-quotes";
import { payments } from "./payments";
import { tenants } from "./tenants";

export const industrialSupplierPurchaseOrderPackageStatusEnum = pgEnum(
  "industrial_supplier_po_package_status",
  ["approval_required", "approved_for_submission", "cancelled"],
);

/**
 * Exact internal package for a future supplier purchase-order action. It can
 * be reviewed and approved, but this ledger cannot represent transmission,
 * supplier acceptance, or an external commitment. A later action/receipt
 * boundary must perform and prove any supplier-facing step.
 */
export const industrialSupplierPurchaseOrderPackages = pgTable(
  "industrial_supplier_purchase_order_packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "restrict" })
      .notNull(),
    orderId: uuid("order_id")
      .references(() => industrialOrders.id, { onDelete: "restrict" })
      .notNull(),
    procurementAuthorizationId: uuid("procurement_authorization_id")
      .references(() => industrialProcurementAuthorizations.id, {
        onDelete: "restrict",
      })
      .notNull(),
    customerQuoteId: uuid("customer_quote_id")
      .references(() => industrialQuotes.id, { onDelete: "restrict" })
      .notNull(),
    supplierQuoteId: uuid("supplier_quote_id")
      .references(() => industrialSupplierQuotes.id, { onDelete: "restrict" })
      .notNull(),
    supplierProfileId: uuid("supplier_profile_id")
      .references(() => industrialSupplierProfiles.id, { onDelete: "restrict" })
      .notNull(),
    fulfillmentPlanId: uuid("fulfillment_plan_id")
      .references(() => industrialFulfillmentPlans.id, { onDelete: "restrict" })
      .notNull(),
    procurementServiceId: uuid("procurement_service_id")
      .references(() => industrialFulfillmentServices.id, {
        onDelete: "restrict",
      })
      .notNull(),
    sourcePaymentId: uuid("source_payment_id")
      .references(() => payments.id, { onDelete: "restrict" })
      .notNull(),
    referenceCode: text("reference_code").notNull(),
    status: industrialSupplierPurchaseOrderPackageStatusEnum("status")
      .notNull()
      .default("approval_required"),
    currencyCode: text("currency_code").notNull(),
    supplierTotalMinor: numeric("supplier_total_minor", {
      precision: 30,
      scale: 0,
    }).notNull(),
    productName: text("product_name").notNull(),
    specification: text("specification"),
    offeredQuantity: text("offered_quantity").notNull(),
    unitOfMeasure: text("unit_of_measure").notNull(),
    unitPriceText: text("unit_price_text"),
    packaging: text("packaging"),
    leadTime: text("lead_time").notNull(),
    incoterm: text("incoterm").notNull(),
    paymentTerms: text("payment_terms").notNull(),
    destination: text("destination").notNull(),
    countryOfOrigin: text("country_of_origin"),
    warranty: text("warranty"),
    supplierQuoteReference: text("supplier_quote_reference").notNull(),
    supplierQuoteValidUntil: timestamp("supplier_quote_valid_until", {
      withTimezone: true,
    }).notNull(),
    lineItems: jsonb("line_items")
      .$type<Array<Record<string, string | null>>>()
      .notNull()
      .default([]),
    sourcePricingHash: text("source_pricing_hash").notNull(),
    sourceSupplierQuoteHash: text("source_supplier_quote_hash").notNull(),
    sourceOrderConfirmationHash: text(
      "source_order_confirmation_hash",
    ).notNull(),
    procurementReleaseHash: text("procurement_release_hash").notNull(),
    packageHash: text("package_hash").notNull(),
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
    approvedReason: text("approved_reason"),
    approvedByUserId: integer("approved_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "restrict" },
    ),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    externalActionExecuted: boolean("external_action_executed")
      .notNull()
      .default(false),
    transmittedToSupplier: boolean("transmitted_to_supplier")
      .notNull()
      .default(false),
    supplierAccepted: boolean("supplier_accepted").notNull().default(false),
    externalPurchaseOrderReference: text("external_purchase_order_reference"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantOrderUnique: uniqueIndex(
      "industrial_supplier_po_pkg_tenant_order_uq",
    ).on(table.tenantId, table.orderId),
    tenantReferenceUnique: uniqueIndex(
      "industrial_supplier_po_pkg_tenant_ref_uq",
    ).on(table.tenantId, table.referenceCode),
    tenantPackageHashUnique: uniqueIndex(
      "industrial_supplier_po_pkg_tenant_hash_uq",
    ).on(table.tenantId, table.packageHash),
    tenantStatusIndex: index(
      "industrial_supplier_po_pkg_tenant_status_idx",
    ).on(table.tenantId, table.status, table.updatedAt),
    tenantSupplierIndex: index(
      "industrial_supplier_po_pkg_tenant_supplier_idx",
    ).on(table.tenantId, table.supplierProfileId, table.status),
    currencyCheck: check(
      "industrial_supplier_po_pkg_currency_check",
      sql`${table.currencyCode} ~ '^[A-Z]{3}$'`,
    ),
    exactAmountCheck: check(
      "industrial_supplier_po_pkg_amount_check",
      sql`${table.supplierTotalMinor} > 0`,
    ),
    hashCheck: check(
      "industrial_supplier_po_pkg_hash_check",
      sql`${table.sourcePricingHash} ~ '^[a-f0-9]{64}$' AND ${table.sourceSupplierQuoteHash} ~ '^[a-f0-9]{64}$' AND ${table.sourceOrderConfirmationHash} ~ '^[a-f0-9]{64}$' AND ${table.procurementReleaseHash} ~ '^[a-f0-9]{64}$' AND ${table.packageHash} ~ '^[a-f0-9]{64}$'`,
    ),
    approvalEvidenceCheck: check(
      "industrial_supplier_po_pkg_approval_check",
      sql`${table.status} <> 'approved_for_submission' OR (${table.approvedByUserId} IS NOT NULL AND ${table.approvedAt} IS NOT NULL AND length(trim(${table.approvedReason})) >= 12)`,
    ),
    noExternalExecutionCheck: check(
      "industrial_supplier_po_pkg_no_external_check",
      sql`${table.externalActionExecuted} = false AND ${table.transmittedToSupplier} = false AND ${table.supplierAccepted} = false AND ${table.externalPurchaseOrderReference} IS NULL`,
    ),
  }),
);
