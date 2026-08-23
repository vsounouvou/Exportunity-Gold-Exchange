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
import { industrialSupplierQuotes } from "./exportunity-supplier-quotes";
import { payments } from "./payments";
import { tenants } from "./tenants";

export const industrialProcurementAuthorizationStatusEnum = pgEnum(
  "industrial_procurement_authorization_status",
  ["approval_required", "approved", "cancelled"],
);

/**
 * Internal, exact-money authorization for releasing a paid industrial order
 * into procurement. This ledger deliberately cannot represent supplier
 * contact, a submitted purchase order, or an external commitment. Those
 * actions require a later provider/communications boundary and receipt table.
 */
export const industrialProcurementAuthorizations = pgTable(
  "industrial_procurement_authorizations",
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
    referenceCode: text("reference_code").notNull(),
    status: industrialProcurementAuthorizationStatusEnum("status")
      .notNull()
      .default("approval_required"),
    currencyCode: text("currency_code").notNull(),
    supplierCostMinor: numeric("supplier_cost_minor", {
      precision: 30,
      scale: 0,
    }).notNull(),
    additionalCostsMinor: numeric("additional_costs_minor", {
      precision: 30,
      scale: 0,
    }).notNull(),
    totalCostMinor: numeric("total_cost_minor", {
      precision: 30,
      scale: 0,
    }).notNull(),
    marginMinor: numeric("margin_minor", {
      precision: 30,
      scale: 0,
    }).notNull(),
    customerPriceMinor: numeric("customer_price_minor", {
      precision: 30,
      scale: 0,
    }).notNull(),
    sourcePricingHash: text("source_pricing_hash").notNull(),
    sourceSupplierQuoteHash: text("source_supplier_quote_hash").notNull(),
    sourceOrderConfirmationHash: text(
      "source_order_confirmation_hash",
    ).notNull(),
    sourcePaymentId: uuid("source_payment_id")
      .references(() => payments.id, { onDelete: "restrict" })
      .notNull(),
    releaseHash: text("release_hash").notNull(),
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
    supplierContacted: boolean("supplier_contacted").notNull().default(false),
    supplierCommitmentCreated: boolean("supplier_commitment_created")
      .notNull()
      .default(false),
    externalReference: text("external_reference"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantOrderUnique: uniqueIndex(
      "industrial_procurement_auth_tenant_order_uq",
    ).on(table.tenantId, table.orderId),
    tenantReferenceUnique: uniqueIndex(
      "industrial_procurement_auth_tenant_reference_uq",
    ).on(table.tenantId, table.referenceCode),
    tenantReleaseHashUnique: uniqueIndex(
      "industrial_procurement_auth_tenant_release_hash_uq",
    ).on(table.tenantId, table.releaseHash),
    tenantStatusIndex: index(
      "industrial_procurement_auth_tenant_status_idx",
    ).on(table.tenantId, table.status, table.updatedAt),
    tenantSupplierIndex: index(
      "industrial_procurement_auth_tenant_supplier_idx",
    ).on(table.tenantId, table.supplierProfileId, table.status),
    currencyCheck: check(
      "industrial_procurement_auth_currency_check",
      sql`${table.currencyCode} ~ '^[A-Z]{3}$'`,
    ),
    exactAmountsCheck: check(
      "industrial_procurement_auth_amounts_check",
      sql`${table.supplierCostMinor} >= 0 AND ${table.additionalCostsMinor} >= 0 AND ${table.totalCostMinor} = ${table.supplierCostMinor} + ${table.additionalCostsMinor} AND ${table.marginMinor} >= 0 AND ${table.customerPriceMinor} = ${table.totalCostMinor} + ${table.marginMinor} AND ${table.customerPriceMinor} > 0`,
    ),
    approvalEvidenceCheck: check(
      "industrial_procurement_auth_approval_check",
      sql`${table.status} <> 'approved' OR (${table.approvedByUserId} IS NOT NULL AND ${table.approvedAt} IS NOT NULL AND length(trim(${table.approvedReason})) >= 12)`,
    ),
    noExternalExecutionCheck: check(
      "industrial_procurement_auth_no_external_check",
      sql`${table.externalActionExecuted} = false AND ${table.supplierContacted} = false AND ${table.supplierCommitmentCreated} = false AND ${table.externalReference} IS NULL`,
    ),
  }),
);
