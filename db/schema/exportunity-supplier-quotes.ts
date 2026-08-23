import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { eceUsers } from "./ece";
import {
  industrialRequirements,
  industrialRequirementSupplierMatches,
  industrialSupplierProfiles,
  industrialSupplierRfqDispatches,
  industrialSupplierRfqDrafts,
} from "./industrial";
import { tenants } from "./tenants";

export const industrialSupplierQuoteCorrelationStatusEnum = pgEnum(
  "industrial_supplier_quote_correlation_status",
  ["exact", "inferred", "ambiguous", "unmatched"],
);

export const industrialSupplierQuoteReviewStatusEnum = pgEnum(
  "industrial_supplier_quote_review_status",
  ["needs_review", "qualified", "rejected"],
);

// Tenant-wide, hashed do-not-contact registry. It closes the gap where the
// same email/WhatsApp address could later appear under another supplier
// profile. Recipient opt-out always wins over a profile authorization.
export const industrialSupplierContactSuppressions = pgTable(
  "industrial_supplier_contact_suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    channel: text("channel", { enum: ["email", "whatsapp"] }).notNull(),
    contactHash: text("contact_hash").notNull(),
    contactMasked: text("contact_masked").notNull(),
    reason: text("reason").notNull(),
    sourceKind: text("source_kind", {
      enum: ["recipient_opt_out"],
    })
      .notNull()
      .default("recipient_opt_out"),
    sourceEmailMessageId: integer("source_email_message_id"),
    sourceCommunicationsMessageId: integer("source_communications_message_id"),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantContactUnique: uniqueIndex(
      "industrial_supplier_contact_suppressions_tenant_contact_unique",
    ).on(table.tenantId, table.channel, table.contactHash),
    tenantUpdatedIndex: index(
      "industrial_supplier_contact_suppressions_tenant_updated_idx",
    ).on(table.tenantId, table.updatedAt),
  }),
);

// Raw messages and attachments remain in the native mail/communications
// stores. This table records immutable source pointers plus deterministic,
// evidence-bearing normalization; it never invents a missing quote field.
export const industrialSupplierQuoteIntakes = pgTable(
  "industrial_supplier_quote_intakes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    rfqDispatchId: uuid("rfq_dispatch_id").references(
      () => industrialSupplierRfqDispatches.id,
      { onDelete: "restrict" },
    ),
    rfqDraftId: uuid("rfq_draft_id").references(
      () => industrialSupplierRfqDrafts.id,
      { onDelete: "restrict" },
    ),
    requirementId: uuid("requirement_id").references(
      () => industrialRequirements.id,
      { onDelete: "restrict" },
    ),
    supplierProfileId: uuid("supplier_profile_id").references(
      () => industrialSupplierProfiles.id,
      { onDelete: "restrict" },
    ),
    contactSuppressionId: uuid("contact_suppression_id").references(
      () => industrialSupplierContactSuppressions.id,
      { onDelete: "restrict" },
    ),
    channel: text("channel", { enum: ["email", "whatsapp"] }).notNull(),
    // Cross-module foreign keys are enforced by the migration. Keeping these
    // columns scalar avoids a schema import cycle through communications.ts.
    sourceEmailMessageId: integer("source_email_message_id"),
    sourceCommunicationsMessageId: integer("source_communications_message_id"),
    sourceProviderMessageId: text("source_provider_message_id").notNull(),
    sourceAgentKey: text("source_agent_key").notNull(),
    sourceContactHash: text("source_contact_hash").notNull(),
    sourceContactMasked: text("source_contact_masked").notNull(),
    sourceReceivedAt: timestamp("source_received_at", {
      withTimezone: true,
    }).notNull(),
    sourceAttachments: jsonb("source_attachments")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    correlationStatus: industrialSupplierQuoteCorrelationStatusEnum(
      "correlation_status",
    ).notNull(),
    correlationMethod: text("correlation_method").notNull(),
    candidateDispatchIds: jsonb("candidate_dispatch_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    normalizationVersion: text("normalization_version").notNull(),
    normalizedQuote: jsonb("normalized_quote")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    missingFields: jsonb("missing_fields")
      .$type<string[]>()
      .notNull()
      .default([]),
    ambiguousFields: jsonb("ambiguous_fields")
      .$type<string[]>()
      .notNull()
      .default([]),
    quoteLikeSignals: jsonb("quote_like_signals")
      .$type<string[]>()
      .notNull()
      .default([]),
    optOutDetected: boolean("opt_out_detected").notNull().default(false),
    suppressionAppliedAt: timestamp("suppression_applied_at", {
      withTimezone: true,
    }),
    suppressedControlIds: jsonb("suppressed_control_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    reviewStatus: industrialSupplierQuoteReviewStatusEnum("review_status")
      .notNull()
      .default("needs_review"),
    reviewChecklist: jsonb("review_checklist")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    reviewNotes: text("review_notes"),
    reviewedByUserId: integer("reviewed_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sourceEmailUnique: uniqueIndex(
      "industrial_supplier_quote_intakes_source_email_unique",
    ).on(table.sourceEmailMessageId),
    sourceCommunicationsUnique: uniqueIndex(
      "industrial_supplier_quote_intakes_source_communications_unique",
    ).on(table.sourceCommunicationsMessageId),
    tenantReviewIndex: index(
      "industrial_supplier_quote_intakes_tenant_review_idx",
    ).on(table.tenantId, table.reviewStatus, table.updatedAt),
    tenantRequirementIndex: index(
      "industrial_supplier_quote_intakes_tenant_requirement_idx",
    ).on(table.tenantId, table.requirementId, table.reviewStatus),
    tenantSupplierIndex: index(
      "industrial_supplier_quote_intakes_tenant_supplier_idx",
    ).on(table.tenantId, table.supplierProfileId, table.createdAt),
  }),
);

// Reuse the pre-existing internal supplier-cost ledger rather than creating a
// parallel quote model. Compatible legacy columns (product, quantity_text,
// unit, origin, and so on) remain canonical storage; the added fields carry
// exact intake lineage and evidence that the legacy shape could not express.
// industrial_quotes remains the separate, customer-facing Exportunity offer.
export const industrialSupplierQuotes = pgTable(
  "industrial_supplier_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    quoteIntakeId: uuid("quote_intake_id")
      .references(() => industrialSupplierQuoteIntakes.id, {
        onDelete: "restrict",
      }),
    rfqDispatchId: uuid("rfq_dispatch_id")
      .references(() => industrialSupplierRfqDispatches.id, {
        onDelete: "restrict",
      }),
    rfqDraftId: uuid("rfq_draft_id")
      .references(() => industrialSupplierRfqDrafts.id, {
        onDelete: "restrict",
      }),
    requirementId: uuid("requirement_id")
      .references(() => industrialRequirements.id, { onDelete: "restrict" })
      .notNull(),
    supplierProfileId: uuid("supplier_profile_id")
      .references(() => industrialSupplierProfiles.id, {
        onDelete: "set null",
      }),
    supplierMatchId: uuid("supplier_match_id").references(
      () => industrialRequirementSupplierMatches.id,
      { onDelete: "set null" },
    ),
    referenceCode: text("reference_code").notNull(),
    status: text("status", {
      enum: [
        "needs_review",
        "reviewed",
        "qualified",
        "rejected",
        "superseded",
        "withdrawn",
        "expired",
      ],
    })
      .notNull()
      .default("needs_review"),
    sourceChannel: text("source_channel", {
      enum: ["manual", "email", "whatsapp", "phone", "document"],
    })
      .notNull()
      .default("manual"),
    sourceReceivedAt: timestamp("source_received_at", {
      withTimezone: true,
    }),
    supplierQuoteReference: text("supplier_quote_reference"),
    productName: text("product"),
    specification: text("specification"),
    offeredQuantity: text("quantity_text"),
    unitOfMeasure: text("unit"),
    currencyCode: text("currency_code"),
    legacyUnitPrice: decimal("unit_price", { precision: 16, scale: 4 }),
    legacyTotalCost: decimal("total_cost", { precision: 16, scale: 2 }),
    unitPrice: text("unit_price_text"),
    totalAmount: text("total_amount_text"),
    minimumOrderQuantity: text("minimum_order_quantity"),
    packaging: text("packaging"),
    leadTime: text("lead_time_text"),
    incoterm: text("incoterm"),
    paymentTerms: text("payment_terms"),
    destination: text("destination"),
    legacyLeadTimeDays: integer("lead_time_days"),
    legacyValidUntil: timestamp("valid_until"),
    legacyCertifications: jsonb("certifications")
      .$type<string[]>()
      .notNull()
      .default([]),
    documentReferences: jsonb("document_references")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    validity: text("validity_text"),
    countryOfOrigin: text("origin"),
    certifications: text("certifications_text"),
    warranty: text("warranty"),
    supplierNotes: text("supplier_notes"),
    rawSourceMessageId: text("raw_source_message_id"),
    rawSourceText: text("raw_source_text"),
    extractionConfidence: decimal("extraction_confidence", {
      precision: 4,
      scale: 3,
    }),
    internalNotes: text("internal_notes"),
    projectionVersion: text("projection_version"),
    normalizationVersion: text("normalization_version"),
    quoteHash: text("quote_hash"),
    fieldEvidence: jsonb("field_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    providedFields: jsonb("provided_fields")
      .$type<string[]>()
      .notNull()
      .default([]),
    missingFields: jsonb("missing_fields")
      .$type<string[]>()
      .notNull()
      .default([]),
    ambiguousFields: jsonb("ambiguous_fields")
      .$type<string[]>()
      .notNull()
      .default([]),
    comparisonReady: boolean("comparison_ready").notNull().default(false),
    comparisonBlockers: jsonb("comparison_blockers")
      .$type<string[]>()
      .notNull()
      .default(["canonical_projection_pending"]),
    offerPreparationReady: boolean("offer_preparation_ready")
      .notNull()
      .default(false),
    offerPreparationBlockers: jsonb("offer_preparation_blockers")
      .$type<string[]>()
      .notNull()
      .default(["canonical_projection_pending"]),
    qualifiedByUserId: integer("qualified_by_user_id")
      .references(() => eceUsers.id, { onDelete: "set null" }),
    qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    receivedAt: timestamp("received_at"),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    intakeUnique: uniqueIndex(
      "industrial_supplier_quotes_intake_unique",
    ).on(table.quoteIntakeId),
    tenantReferenceUnique: uniqueIndex(
      "industrial_supplier_quotes_tenant_reference_unique",
    ).on(table.tenantId, table.referenceCode),
    tenantRequirementIndex: index(
      "industrial_supplier_quotes_tenant_requirement_idx",
    ).on(table.tenantId, table.requirementId, table.status, table.updatedAt),
    tenantSupplierIndex: index(
      "industrial_supplier_quotes_tenant_supplier_idx",
    ).on(table.tenantId, table.supplierProfileId, table.status),
    tenantReadinessIndex: index(
      "industrial_supplier_quotes_tenant_readiness_idx",
    ).on(
      table.tenantId,
      table.comparisonReady,
      table.offerPreparationReady,
      table.qualifiedAt,
    ),
  }),
);
