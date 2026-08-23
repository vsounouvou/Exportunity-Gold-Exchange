import {
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

import { eceUsers } from "./ece";
import { exportunityIntegrationConnections } from "./exportunity-integrations";
import {
  industrialFulfillmentPlans,
  industrialFulfillmentServices,
  industrialOrders,
} from "./industrial";
import { tenants } from "./tenants";
import { geoTerritories } from "./territories";

export const carrierProfileStatusEnum = pgEnum("carrier_profile_status", [
  "discovered",
  "contactable",
  "contacted",
  "prequalified",
  "verified",
  "contracted",
  "active",
  "suspended",
  "rejected",
  "archived",
]);

export const carrierVerificationStatusEnum = pgEnum(
  "carrier_verification_status",
  [
    "unverified",
    "source_verified",
    "contact_verified",
    "document_verified",
    "contract_verified",
    "transaction_verified",
  ],
);

export const carrierPartnershipStatusEnum = pgEnum(
  "carrier_partnership_status",
  ["candidate", "verified_provider", "contracted_partner", "internal_network"],
);

export const carrierCoverageStatusEnum = pgEnum("carrier_coverage_status", [
  "candidate",
  "evidence_pending",
  "verified",
  "active",
  "suspended",
  "unavailable",
  "expired",
]);

export const carrierAdapterConnectionStatusEnum = pgEnum(
  "carrier_adapter_connection_status",
  [
    "disconnected",
    "pending_verification",
    "verified",
    "restricted",
    "revoked",
    "error",
  ],
);

export const carrierQuoteRequestStatusEnum = pgEnum(
  "carrier_quote_request_status",
  [
    "prepared",
    "manual_required",
    "submission_ready",
    "submitted",
    "quotes_received",
    "selected",
    "expired",
    "cancelled",
  ],
);

export const carrierDeliveryQuoteStatusEnum = pgEnum(
  "carrier_delivery_quote_status",
  [
    "received",
    "evidence_pending",
    "verified",
    "selected",
    "rejected",
    "expired",
    "withdrawn",
  ],
);

export const carrierBookingAuthorizationStatusEnum = pgEnum(
  "carrier_booking_authorization_status",
  [
    "approval_required",
    "approved_submission_ready",
    "submitted",
    "provider_confirmed",
    "in_progress",
    "completed",
    "cancelled",
    "failed",
  ],
);

export const carrierProviderReceiptStatusEnum = pgEnum(
  "carrier_provider_receipt_status",
  ["received", "verified", "projected", "rejected", "duplicate", "error"],
);

export const carrierIncidentSeverityEnum = pgEnum("carrier_incident_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const carrierIncidentStatusEnum = pgEnum("carrier_incident_status", [
  "open",
  "investigating",
  "action_required",
  "resolved",
  "dismissed",
]);

export const carrierProfiles = pgTable(
  "carrier_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    referenceCode: text("reference_code").notNull(),
    legalName: text("legal_name").notNull(),
    displayName: text("display_name").notNull(),
    carrierType: text("carrier_type").notNull(),
    status: carrierProfileStatusEnum("status").notNull().default("discovered"),
    verificationStatus: carrierVerificationStatusEnum("verification_status")
      .notNull()
      .default("unverified"),
    partnershipStatus: carrierPartnershipStatusEnum("partnership_status")
      .notNull()
      .default("candidate"),
    providerCode: text("provider_code"),
    headquartersCountryCode: text("headquarters_country_code"),
    websiteUrl: text("website_url"),
    supportEmail: text("support_email"),
    supportPhone: text("support_phone"),
    operatingCountryCodes: jsonb("operating_country_codes")
      .$type<string[]>()
      .notNull()
      .default([]),
    transportModes: jsonb("transport_modes")
      .$type<string[]>()
      .notNull()
      .default([]),
    capabilities: jsonb("capabilities")
      .$type<string[]>()
      .notNull()
      .default([]),
    commodityCategories: jsonb("commodity_categories")
      .$type<string[]>()
      .notNull()
      .default([]),
    contactDetails: jsonb("contact_details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    insuranceEvidence: jsonb("insurance_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    complianceEvidence: jsonb("compliance_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    sourceProvenance: jsonb("source_provenance")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    verificationEvidence: jsonb("verification_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    restrictionStatus: text("restriction_status").notNull().default("none"),
    riskFlags: jsonb("risk_flags").$type<string[]>().notNull().default([]),
    lastVerifiedAt: timestamp("last_verified_at"),
    verificationExpiresAt: timestamp("verification_expires_at"),
    verifiedByUserId: integer("verified_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    updatedByUserId: integer("updated_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantReferenceUnique: uniqueIndex("carrier_profiles_tenant_reference_unique").on(
      table.tenantId,
      table.referenceCode,
    ),
    tenantStatusIndex: index("carrier_profiles_tenant_status_idx").on(
      table.tenantId,
      table.status,
      table.updatedAt,
    ),
    tenantProviderIndex: index("carrier_profiles_tenant_provider_idx").on(
      table.tenantId,
      table.providerCode,
    ),
  }),
);

export const carrierCoverages = pgTable(
  "carrier_coverages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    carrierProfileId: uuid("carrier_profile_id")
      .references(() => carrierProfiles.id, { onDelete: "cascade" })
      .notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    originTerritoryId: integer("origin_territory_id").references(
      () => geoTerritories.id,
      { onDelete: "set null" },
    ),
    destinationTerritoryId: integer("destination_territory_id").references(
      () => geoTerritories.id,
      { onDelete: "set null" },
    ),
    originCountryCode: text("origin_country_code").notNull(),
    destinationCountryCode: text("destination_country_code").notNull(),
    serviceType: text("service_type").notNull(),
    transportMode: text("transport_mode").notNull(),
    serviceLevel: text("service_level"),
    productCategory: text("product_category"),
    vehicleTypes: jsonb("vehicle_types").$type<string[]>().notNull().default([]),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    maxWeightKg: numeric("max_weight_kg", { precision: 16, scale: 3 }),
    maxVolumeM3: numeric("max_volume_m3", { precision: 16, scale: 3 }),
    minimumTransitDays: integer("minimum_transit_days"),
    maximumTransitDays: integer("maximum_transit_days"),
    hazardousGoodsSupported: boolean("hazardous_goods_supported").notNull().default(false),
    coldChainSupported: boolean("cold_chain_supported").notNull().default(false),
    customsSupported: boolean("customs_supported").notNull().default(false),
    insuranceSupported: boolean("insurance_supported").notNull().default(false),
    status: carrierCoverageStatusEnum("status").notNull().default("candidate"),
    evidence: jsonb("evidence")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    sourceReference: text("source_reference"),
    lastVerifiedAt: timestamp("last_verified_at"),
    validUntil: timestamp("valid_until"),
    verifiedByUserId: integer("verified_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    updatedByUserId: integer("updated_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantIdempotencyUnique: uniqueIndex(
      "carrier_coverages_tenant_idempotency_unique",
    ).on(table.tenantId, table.idempotencyKey),
    tenantRouteIndex: index("carrier_coverages_tenant_route_idx").on(
      table.tenantId,
      table.originCountryCode,
      table.destinationCountryCode,
      table.status,
    ),
    carrierStatusIndex: index("carrier_coverages_carrier_status_idx").on(
      table.carrierProfileId,
      table.status,
      table.updatedAt,
    ),
  }),
);

export const carrierAdapterConnections = pgTable(
  "carrier_adapter_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    carrierProfileId: uuid("carrier_profile_id")
      .references(() => carrierProfiles.id, { onDelete: "cascade" })
      .notNull(),
    exportunityIntegrationConnectionId: uuid(
      "exportunity_integration_connection_id",
    ).references(
      () => exportunityIntegrationConnections.id,
      { onDelete: "set null" },
    ),
    provider: text("provider").notNull(),
    environment: text("environment").notNull().default("production"),
    status: carrierAdapterConnectionStatusEnum("status")
      .notNull()
      .default("pending_verification"),
    externalAccountReference: text("external_account_reference"),
    credentialReference: text("credential_reference"),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    callbackStatus: text("callback_status").notNull().default("not_configured"),
    restrictionStatus: text("restriction_status").notNull().default("none"),
    verificationEvidence: jsonb("verification_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastVerifiedAt: timestamp("last_verified_at"),
    verifiedByUserId: integer("verified_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    updatedByUserId: integer("updated_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantCarrierProviderUnique: uniqueIndex(
      "carrier_adapter_connections_tenant_carrier_provider_unique",
    ).on(table.tenantId, table.carrierProfileId, table.provider, table.environment),
    tenantStatusIndex: index("carrier_adapter_connections_tenant_status_idx").on(
      table.tenantId,
      table.status,
      table.updatedAt,
    ),
  }),
);

export const carrierQuoteRequests = pgTable(
  "carrier_quote_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    industrialOrderId: uuid("industrial_order_id")
      .references(() => industrialOrders.id, { onDelete: "cascade" })
      .notNull(),
    fulfillmentPlanId: uuid("fulfillment_plan_id").references(
      () => industrialFulfillmentPlans.id,
      { onDelete: "set null" },
    ),
    fulfillmentServiceId: uuid("fulfillment_service_id").references(
      () => industrialFulfillmentServices.id,
      { onDelete: "set null" },
    ),
    idempotencyKey: text("idempotency_key").notNull(),
    serviceType: text("service_type").notNull(),
    status: carrierQuoteRequestStatusEnum("status").notNull().default("prepared"),
    originSnapshot: jsonb("origin_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    destinationSnapshot: jsonb("destination_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    cargoSnapshot: jsonb("cargo_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    incoterm: text("incoterm"),
    requestedPickupAt: timestamp("requested_pickup_at"),
    requiredDeliveryAt: timestamp("required_delivery_at"),
    requiredCapabilities: jsonb("required_capabilities")
      .$type<string[]>()
      .notNull()
      .default([]),
    matchedCoverageIds: jsonb("matched_coverage_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    manualPackage: jsonb("manual_package")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    preparationActionRunId: integer("preparation_action_run_id"),
    preparedByUserId: integer("prepared_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    providerRequestExecuted: boolean("provider_request_executed")
      .notNull()
      .default(false),
    providerRequestReceipt: jsonb("provider_request_receipt")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    externalSubmittedAt: timestamp("external_submitted_at"),
    expiresAt: timestamp("expires_at"),
    selectedQuoteId: uuid("selected_quote_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantIdempotencyUnique: uniqueIndex(
      "carrier_quote_requests_tenant_idempotency_unique",
    ).on(table.tenantId, table.idempotencyKey),
    tenantOrderStatusIndex: index("carrier_quote_requests_tenant_order_status_idx").on(
      table.tenantId,
      table.industrialOrderId,
      table.status,
      table.updatedAt,
    ),
  }),
);

export const carrierDeliveryQuotes = pgTable(
  "carrier_delivery_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    quoteRequestId: uuid("quote_request_id")
      .references(() => carrierQuoteRequests.id, { onDelete: "cascade" })
      .notNull(),
    industrialOrderId: uuid("industrial_order_id")
      .references(() => industrialOrders.id, { onDelete: "cascade" })
      .notNull(),
    carrierProfileId: uuid("carrier_profile_id")
      .references(() => carrierProfiles.id, { onDelete: "restrict" })
      .notNull(),
    carrierCoverageId: uuid("carrier_coverage_id").references(() => carrierCoverages.id, {
      onDelete: "set null",
    }),
    adapterConnectionId: uuid("adapter_connection_id").references(
      () => carrierAdapterConnections.id,
      { onDelete: "set null" },
    ),
    idempotencyKey: text("idempotency_key").notNull(),
    status: carrierDeliveryQuoteStatusEnum("status").notNull().default("received"),
    sourceType: text("source_type").notNull(),
    providerQuoteReference: text("provider_quote_reference"),
    totalCostMinor: integer("total_cost_minor").notNull(),
    customerPriceMinor: integer("customer_price_minor"),
    currencyCode: text("currency_code").notNull(),
    costBreakdown: jsonb("cost_breakdown")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    minimumTransitDays: integer("minimum_transit_days"),
    maximumTransitDays: integer("maximum_transit_days"),
    pickupWindowStart: timestamp("pickup_window_start"),
    pickupWindowEnd: timestamp("pickup_window_end"),
    estimatedDeliveryAt: timestamp("estimated_delivery_at"),
    validUntil: timestamp("valid_until").notNull(),
    terms: jsonb("terms").$type<Record<string, unknown>>().notNull().default({}),
    evidence: jsonb("evidence")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    receivedAt: timestamp("received_at").notNull().defaultNow(),
    verifiedAt: timestamp("verified_at"),
    selectedAt: timestamp("selected_at"),
    verifiedByUserId: integer("verified_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    recordedByUserId: integer("recorded_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    actionRunId: integer("action_run_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantIdempotencyUnique: uniqueIndex(
      "carrier_delivery_quotes_tenant_idempotency_unique",
    ).on(table.tenantId, table.idempotencyKey),
    requestStatusIndex: index("carrier_delivery_quotes_request_status_idx").on(
      table.quoteRequestId,
      table.status,
      table.totalCostMinor,
    ),
    tenantCarrierIndex: index("carrier_delivery_quotes_tenant_carrier_idx").on(
      table.tenantId,
      table.carrierProfileId,
      table.receivedAt,
    ),
  }),
);

export const carrierBookingAuthorizations = pgTable(
  "carrier_booking_authorizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    quoteRequestId: uuid("quote_request_id")
      .references(() => carrierQuoteRequests.id, { onDelete: "cascade" })
      .notNull(),
    deliveryQuoteId: uuid("delivery_quote_id")
      .references(() => carrierDeliveryQuotes.id, { onDelete: "restrict" })
      .notNull(),
    industrialOrderId: uuid("industrial_order_id")
      .references(() => industrialOrders.id, { onDelete: "cascade" })
      .notNull(),
    fulfillmentPlanId: uuid("fulfillment_plan_id")
      .references(() => industrialFulfillmentPlans.id, { onDelete: "cascade" })
      .notNull(),
    fulfillmentServiceId: uuid("fulfillment_service_id")
      .references(() => industrialFulfillmentServices.id, { onDelete: "cascade" })
      .notNull(),
    carrierProfileId: uuid("carrier_profile_id")
      .references(() => carrierProfiles.id, { onDelete: "restrict" })
      .notNull(),
    adapterConnectionId: uuid("adapter_connection_id").references(
      () => carrierAdapterConnections.id,
      { onDelete: "set null" },
    ),
    idempotencyKey: text("idempotency_key").notNull(),
    status: carrierBookingAuthorizationStatusEnum("status")
      .notNull()
      .default("approval_required"),
    authorizedCostMinor: integer("authorized_cost_minor").notNull(),
    currencyCode: text("currency_code").notNull(),
    approvalReference: text("approval_reference"),
    approvalRationale: text("approval_rationale"),
    approvalEvidence: jsonb("approval_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    providerBookingReference: text("provider_booking_reference"),
    providerConfirmationEvidence: jsonb("provider_confirmation_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    preparationActionRunId: integer("preparation_action_run_id"),
    approvalActionRunId: integer("approval_action_run_id"),
    preparedByUserId: integer("prepared_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    approvedByUserId: integer("approved_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    preparedAt: timestamp("prepared_at").notNull().defaultNow(),
    approvedAt: timestamp("approved_at"),
    providerSubmittedAt: timestamp("provider_submitted_at"),
    providerConfirmedAt: timestamp("provider_confirmed_at"),
    externalBookingExecuted: boolean("external_booking_executed")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantIdempotencyUnique: uniqueIndex(
      "carrier_booking_authorizations_tenant_idempotency_unique",
    ).on(table.tenantId, table.idempotencyKey),
    tenantQuoteUnique: uniqueIndex("carrier_booking_authorizations_tenant_quote_unique").on(
      table.tenantId,
      table.deliveryQuoteId,
    ),
    tenantStatusIndex: index("carrier_booking_authorizations_tenant_status_idx").on(
      table.tenantId,
      table.status,
      table.updatedAt,
    ),
  }),
);

export const carrierProviderReceipts = pgTable(
  "carrier_provider_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    adapterConnectionId: uuid("adapter_connection_id")
      .references(() => carrierAdapterConnections.id, { onDelete: "cascade" })
      .notNull(),
    bookingAuthorizationId: uuid("booking_authorization_id").references(
      () => carrierBookingAuthorizations.id,
      { onDelete: "set null" },
    ),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    signatureVerified: boolean("signature_verified").notNull().default(false),
    status: carrierProviderReceiptStatusEnum("status").notNull().default("received"),
    normalizedPayload: jsonb("normalized_payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    industrialFulfillmentEventId: uuid("industrial_fulfillment_event_id"),
    rejectionReason: text("rejection_reason"),
    receivedAt: timestamp("received_at").notNull().defaultNow(),
    processedAt: timestamp("processed_at"),
  },
  (table) => ({
    tenantProviderEventUnique: uniqueIndex(
      "carrier_provider_receipts_tenant_provider_event_unique",
    ).on(table.tenantId, table.adapterConnectionId, table.providerEventId),
    tenantStatusIndex: index("carrier_provider_receipts_tenant_status_idx").on(
      table.tenantId,
      table.status,
      table.receivedAt,
    ),
  }),
);

export const carrierIncidents = pgTable(
  "carrier_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    carrierProfileId: uuid("carrier_profile_id")
      .references(() => carrierProfiles.id, { onDelete: "cascade" })
      .notNull(),
    adapterConnectionId: uuid("adapter_connection_id").references(
      () => carrierAdapterConnections.id,
      { onDelete: "set null" },
    ),
    bookingAuthorizationId: uuid("booking_authorization_id").references(
      () => carrierBookingAuthorizations.id,
      { onDelete: "set null" },
    ),
    severity: carrierIncidentSeverityEnum("severity").notNull(),
    status: carrierIncidentStatusEnum("status").notNull().default("open"),
    incidentType: text("incident_type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    operationalImpact: jsonb("operational_impact")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    evidence: jsonb("evidence")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    openedByUserId: integer("opened_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    resolvedByUserId: integer("resolved_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    openedAt: timestamp("opened_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantStatusIndex: index("carrier_incidents_tenant_status_idx").on(
      table.tenantId,
      table.status,
      table.severity,
      table.updatedAt,
    ),
    carrierStatusIndex: index("carrier_incidents_carrier_status_idx").on(
      table.carrierProfileId,
      table.status,
      table.updatedAt,
    ),
  }),
);
