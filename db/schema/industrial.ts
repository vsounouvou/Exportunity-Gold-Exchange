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
import { sql } from "drizzle-orm";

import { eceUsers } from "./ece";
import { tenants } from "./tenants";
import { contacts } from "./contact";
import { chatMessages } from "./chat-desk";

export const industrialVisibilityEnum = pgEnum("industrial_visibility", [
  "public",
  "verified_users_only",
  "parties_to_transaction",
  "factory_team_only",
  "exportunity_internal",
  "admin_only",
]);

export const industrialFactoryStatusEnum = pgEnum("industrial_factory_status", [
  "draft",
  "submitted",
  "under_review",
  "active",
  "suspended",
  "archived",
]);

export const industrialVerificationStatusEnum = pgEnum(
  "industrial_verification_status",
  [
    "unverified",
    "submitted",
    "under_review",
    "verified",
    "rejected",
    "suspended",
  ],
);

export const industrialCatalogClassificationEnum = pgEnum(
  "industrial_catalog_classification",
  [
    "export_ready_factory_product",
    "machinery",
    "raw_material",
    "industrial_input",
    "spare_part",
    "industrial_service",
  ],
);

export const industrialCatalogStatusEnum = pgEnum("industrial_catalog_status", [
  "draft",
  "under_review",
  "approved",
  "archived",
]);

export const industrialRequirementMatchStatusEnum = pgEnum(
  "industrial_requirement_match_status",
  ["candidate", "shortlisted", "selected", "rejected"],
);

export const industrialSupplierStatusEnum = pgEnum("industrial_supplier_status", [
  "draft",
  "under_review",
  "active",
  "suspended",
  "archived",
]);

export const industrialSupplierNdaStatusEnum = pgEnum(
  "industrial_supplier_nda_status",
  ["not_assessed", "under_review", "signed", "not_required"],
);

export const industrialLegacyProductReviewStatusEnum = pgEnum(
  "industrial_legacy_product_review_status",
  [
    "APPROVED_EXPORT_PRODUCT",
    "APPROVED_MACHINERY",
    "APPROVED_RAW_MATERIAL",
    "APPROVED_INDUSTRIAL_INPUT",
    "APPROVED_SPARE_PART",
    "APPROVED_INDUSTRIAL_SERVICE",
    "REQUIRES_RECLASSIFICATION",
    "REQUIRES_VERIFICATION",
    "INCOMPLETE",
    "DUPLICATE",
    "OUT_OF_SCOPE",
    "ARCHIVED",
  ],
);

export const industrialQuoteStatusEnum = pgEnum("industrial_quote_status", [
  "draft",
  "under_review",
  "ready_for_account_manager",
  "issued",
  "accepted",
  "declined",
  "expired",
  "cancelled",
]);

export const industrialOrderStatusEnum = pgEnum("industrial_order_status", [
  "confirmed",
  "procurement",
  "manufacturing",
  "quality_control",
  "delivery",
  "completed",
  "cancelled",
]);

export const industrialFulfillmentKindEnum = pgEnum(
  "industrial_fulfillment_kind",
  ["standard_order", "sample", "prototype"],
);

export const industrialFulfillmentStatusEnum = pgEnum(
  "industrial_fulfillment_status",
  [
    "release_review",
    "procurement",
    "inspection",
    "ready_to_ship",
    "in_transit",
    "customs",
    "last_mile",
    "delivered",
    "exception",
    "cancelled",
  ],
);

export const industrialFulfillmentServiceTypeEnum = pgEnum(
  "industrial_fulfillment_service_type",
  ["procurement", "inspection", "freight", "customs", "last_mile"],
);

export const industrialFulfillmentServiceStatusEnum = pgEnum(
  "industrial_fulfillment_service_status",
  [
    "candidate",
    "approval_required",
    "approved",
    "in_progress",
    "completed",
    "exception",
    "cancelled",
  ],
);

export const industrialFulfillmentEventSourceEnum = pgEnum(
  "industrial_fulfillment_event_source",
  ["system_payment", "staff", "delivery_network", "provider_callback"],
);

export const industrialFactoryClaimStatusEnum = pgEnum(
  "industrial_factory_claim_status",
  ["submitted", "under_review", "approved", "rejected", "cancelled"],
);

export const industrialRequirementTypeEnum = pgEnum(
  "industrial_requirement_type",
  [
    "machinery",
    "raw_material",
    "industrial_input",
    "spare_part",
    "custom_manufacturing",
    "industrial_service",
    "export_quotation",
  ],
);

export const industrialRequirementStatusEnum = pgEnum(
  "industrial_requirement_status",
  [
    "draft",
    "submitted",
    "triaged",
    "under_review",
    "supplier_matching",
    "quote_preparation",
    "quoted",
    "closed",
    "cancelled",
  ],
);

export const industrialRecurringRequirementStatusEnum = pgEnum(
  "industrial_recurring_requirement_status",
  ["draft", "active", "paused", "closed"],
);

export const industrialChallengeStatusEnum = pgEnum(
  "industrial_challenge_status",
  [
    "submitted",
    "triaged",
    "grouped",
    "sourcing_review",
    "engineering_review",
    "local_manufacturing_review",
    "resolved",
    "declined",
    "closed",
  ],
);

export const industrialChallengeOutcomeEnum = pgEnum(
  "industrial_challenge_outcome",
  [
    "review_required",
    "stock_candidate",
    "group_procurement",
    "reverse_engineering",
    "local_manufacturing",
    "redesign",
    "engineering_partner",
    "declined",
  ],
);

// A part record is the private technical file created when a factory captures
// a physical part for controlled digitization and route review. It is not a
// product listing, manufacturing instruction, purchase order, or supplier
// outreach action.
export const industrialPartRecordStatusEnum = pgEnum(
  "industrial_part_record_status",
  [
    "captured",
    "digitization",
    "technical_review",
    "route_review",
    "route_selected",
    "prototype",
    "validated",
    "catalog_candidate",
    "archived",
  ],
);

export const industrialPartRouteDecisionEnum = pgEnum(
  "industrial_part_route_decision",
  [
    "review_required",
    "stock",
    "distribute",
    "assemble",
    "manufacture_local",
    "import",
  ],
);

export const industrialAttachmentReviewKindEnum = pgEnum(
  "industrial_attachment_review_kind",
  ["image_vision", "scanned_document_ocr", "cad_technical", "manual"],
);

export const industrialAttachmentReviewStatusEnum = pgEnum(
  "industrial_attachment_review_status",
  [
    "pending_analysis",
    "analysis_ready",
    "analysis_failed",
    "under_review",
    "approved",
    "rejected",
    "applied",
  ],
);

export const industrialFactoryLeadStatusEnum = pgEnum(
  "industrial_factory_lead_status",
  [
    "new",
    "under_review",
    "qualified",
    "contact_ready",
    "rejected",
    "converted",
  ],
);

export const industrialDiscoveryCandidateStatusEnum = pgEnum(
  "industrial_discovery_candidate_status",
  ["discovered", "under_review", "verification_pending", "rejected", "promoted"],
);

export const industrialSupplierRfqStatusEnum = pgEnum(
  "industrial_supplier_rfq_status",
  ["draft", "approval_pending", "approved_for_outreach", "rejected", "cancelled"],
);

export const industrialSupplierRfqDecisionEnum = pgEnum(
  "industrial_supplier_rfq_decision",
  ["approved", "rejected"],
);

export const industrialSupplierContactChannelEnum = pgEnum(
  "industrial_supplier_contact_channel",
  ["email", "whatsapp"],
);

export const industrialSupplierContactControlStateEnum = pgEnum(
  "industrial_supplier_contact_control_state",
  ["authorized", "suppressed"],
);

export const industrialSupplierContactAuthorizationBasisEnum = pgEnum(
  "industrial_supplier_contact_authorization_basis",
  ["explicit_consent", "existing_business_relationship", "supplier_initiated_inquiry"],
);

export const industrialSupplierRfqDispatchStatusEnum = pgEnum(
  "industrial_supplier_rfq_dispatch_status",
  ["reserved", "sending", "accepted", "failed", "unknown"],
);

export const industrialFactoryRelationshipStageEnum = pgEnum(
  "industrial_factory_relationship_stage",
  [
    "identified",
    "research_in_progress",
    "contacted",
    "qualified",
    "visit_scheduled",
    "factory_visited",
    "requirements_collected",
    "proposal_in_preparation",
    "active_customer",
    "recurring_customer",
    "dormant",
    "disqualified",
  ],
);

export const industrialFactories = pgTable(
  "industrial_factories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    accountManagerUserId: integer("account_manager_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    legalName: text("legal_name").notNull(),
    displayName: text("display_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    registrationNumber: text("registration_number"),
    factoryStatus: industrialFactoryStatusEnum("factory_status")
      .notNull()
      .default("draft"),
    verificationStatus: industrialVerificationStatusEnum("verification_status")
      .notNull()
      .default("unverified"),
    publicVisibility: industrialVisibilityEnum("public_visibility")
      .notNull()
      .default("exportunity_internal"),
    countryCode: text("country_code").notNull(),
    region: text("region"),
    city: text("city"),
    industrialZone: text("industrial_zone"),
    publicAddress: text("public_address"),
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 10, scale: 7 }),
    primaryIndustry: text("primary_industry").notNull(),
    industries: jsonb("industries").$type<string[]>().notNull().default([]),
    publicDescription: text("public_description"),
    publicWebsite: text("public_website"),
    publicEmail: text("public_email"),
    publicPhone: text("public_phone"),
    publicCertifications: jsonb("public_certifications")
      .$type<string[]>()
      .notNull()
      .default([]),
    exportMarkets: jsonb("export_markets")
      .$type<string[]>()
      .notNull()
      .default([]),
    privateProfile: jsonb("private_profile")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    adminNotes: text("admin_notes"),
    submittedAt: timestamp("submitted_at"),
    verifiedAt: timestamp("verified_at"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantNameUnique: uniqueIndex("industrial_factories_tenant_name_unique").on(
      t.tenantId,
      t.normalizedName,
    ),
    tenantVisibility: index("industrial_factories_tenant_visibility_idx").on(
      t.tenantId,
      t.factoryStatus,
      t.verificationStatus,
      t.publicVisibility,
    ),
    tenantLocation: index("industrial_factories_tenant_location_idx").on(
      t.tenantId,
      t.countryCode,
      t.city,
      t.industrialZone,
    ),
    tenantIndustry: index("industrial_factories_tenant_industry_idx").on(
      t.tenantId,
      t.primaryIndustry,
    ),
  }),
);

/**
 * Internal relationship management is intentionally separate from public
 * factory verification. It does not create a contact, quote, order, or payment.
 */
export const industrialFactoryRelationships = pgTable(
  "industrial_factory_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    factoryId: uuid("factory_id")
      .references(() => industrialFactories.id, { onDelete: "cascade" })
      .notNull(),
    accountManagerUserId: integer("account_manager_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    stage: industrialFactoryRelationshipStageEnum("stage")
      .notNull()
      .default("identified"),
    nextAction: text("next_action"),
    nextReviewAt: timestamp("next_review_at"),
    lastContactedAt: timestamp("last_contacted_at"),
    lastContactedByUserId: integer("last_contacted_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    lastContactSummary: text("last_contact_summary"),
    internalNotes: text("internal_notes"),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    updatedByUserId: integer("updated_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    factoryUnique: uniqueIndex(
      "industrial_factory_relationships_factory_unique",
    ).on(t.factoryId),
    tenantStage: index("industrial_factory_relationships_tenant_stage_idx").on(
      t.tenantId,
      t.stage,
      t.nextReviewAt,
    ),
    tenantManager: index(
      "industrial_factory_relationships_tenant_manager_idx",
    ).on(t.tenantId, t.accountManagerUserId, t.stage),
  }),
);

export const industrialFactoryLeads = pgTable(
  "industrial_factory_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    source: text("source").notNull().default("manual"),
    discoveryKey: text("discovery_key"),
    googlePlaceId: text("google_place_id"),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    primaryIndustry: text("primary_industry"),
    googleTypes: jsonb("google_types").$type<string[]>().notNull().default([]),
    address: text("address"),
    city: text("city"),
    countryCode: text("country_code"),
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 10, scale: 7 }),
    phone: text("phone"),
    website: text("website"),
    googleMapsUrl: text("google_maps_url"),
    rating: decimal("rating", { precision: 3, scale: 2 }),
    reviewCount: integer("review_count"),
    businessStatus: text("business_status"),
    openingHours: jsonb("opening_hours")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    leadStatus: industrialFactoryLeadStatusEnum("lead_status")
      .notNull()
      .default("new"),
    qualificationScore: integer("qualification_score").notNull().default(0),
    screeningNotes: text("screening_notes"),
    contactStatus: text("contact_status").notNull().default("not_contacted"),
    lastEnrichedAt: timestamp("last_enriched_at"),
    reviewedByUserId: integer("reviewed_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    reviewedAt: timestamp("reviewed_at"),
    convertedFactoryId: uuid("converted_factory_id").references(
      () => industrialFactories.id,
      { onDelete: "set null" },
    ),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantGooglePlaceUnique: uniqueIndex(
      "industrial_factory_leads_tenant_google_place_unique",
    ).on(t.tenantId, t.googlePlaceId),
    tenantDiscoveryKeyUnique: uniqueIndex(
      "industrial_factory_leads_tenant_discovery_key_unique",
    ).on(t.tenantId, t.discoveryKey),
    tenantNameCityIndex: index(
      "industrial_factory_leads_tenant_name_city_idx",
    ).on(t.tenantId, t.normalizedName, t.city),
    tenantStatusIndex: index("industrial_factory_leads_tenant_status_idx").on(
      t.tenantId,
      t.leadStatus,
      t.qualificationScore,
    ),
    tenantLocationIndex: index(
      "industrial_factory_leads_tenant_location_idx",
    ).on(t.tenantId, t.countryCode, t.city),
    convertedFactoryIndex: index(
      "industrial_factory_leads_converted_factory_idx",
    ).on(t.convertedFactoryId),
  }),
);

export const industrialProductionLines = pgTable(
  "industrial_production_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    factoryId: uuid("factory_id")
      .references(() => industrialFactories.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    industry: text("industry"),
    operatingStatus: text("operating_status").notNull().default("unknown"),
    visibility: industrialVisibilityEnum("visibility")
      .notNull()
      .default("factory_team_only"),
    publicSummary: text("public_summary"),
    privateMetadata: jsonb("private_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    factoryIndex: index("industrial_production_lines_factory_idx").on(
      t.factoryId,
      t.visibility,
    ),
  }),
);

export const industrialMachines = pgTable(
  "industrial_machines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    factoryId: uuid("factory_id")
      .references(() => industrialFactories.id, { onDelete: "cascade" })
      .notNull(),
    productionLineId: uuid("production_line_id").references(
      () => industrialProductionLines.id,
      { onDelete: "set null" },
    ),
    name: text("name").notNull(),
    manufacturer: text("manufacturer"),
    model: text("model"),
    serialNumber: text("serial_number"),
    machineCategory: text("machine_category"),
    operatingStatus: text("operating_status").notNull().default("unknown"),
    visibility: industrialVisibilityEnum("visibility")
      .notNull()
      .default("factory_team_only"),
    privateMetadata: jsonb("private_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    factoryIndex: index("industrial_machines_factory_idx").on(
      t.factoryId,
      t.visibility,
    ),
    lineIndex: index("industrial_machines_line_idx").on(t.productionLineId),
  }),
);

export const industrialMachineAssemblies = pgTable(
  "industrial_machine_assemblies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    factoryId: uuid("factory_id")
      .references(() => industrialFactories.id, { onDelete: "cascade" })
      .notNull(),
    machineId: uuid("machine_id")
      .references(() => industrialMachines.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    assemblyType: text("assembly_type"),
    operatingStatus: text("operating_status").notNull().default("unknown"),
    visibility: industrialVisibilityEnum("visibility")
      .notNull()
      .default("factory_team_only"),
    publicSummary: text("public_summary"),
    privateMetadata: jsonb("private_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    factoryIndex: index("industrial_machine_assemblies_factory_idx").on(
      t.factoryId,
      t.visibility,
    ),
    machineIndex: index("industrial_machine_assemblies_machine_idx").on(
      t.machineId,
      t.visibility,
    ),
  }),
);

export const industrialMachineComponents = pgTable(
  "industrial_machine_components",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    factoryId: uuid("factory_id")
      .references(() => industrialFactories.id, { onDelete: "cascade" })
      .notNull(),
    machineId: uuid("machine_id")
      .references(() => industrialMachines.id, { onDelete: "cascade" })
      .notNull(),
    assemblyId: uuid("assembly_id").references(
      () => industrialMachineAssemblies.id,
      { onDelete: "set null" },
    ),
    name: text("name").notNull(),
    componentType: text("component_type"),
    partNumber: text("part_number"),
    manufacturer: text("manufacturer"),
    model: text("model"),
    criticality: text("criticality").notNull().default("standard"),
    operatingStatus: text("operating_status").notNull().default("unknown"),
    visibility: industrialVisibilityEnum("visibility")
      .notNull()
      .default("factory_team_only"),
    privateMetadata: jsonb("private_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    factoryIndex: index("industrial_machine_components_factory_idx").on(
      t.factoryId,
      t.visibility,
    ),
    machineIndex: index("industrial_machine_components_machine_idx").on(
      t.machineId,
      t.visibility,
    ),
    assemblyIndex: index("industrial_machine_components_assembly_idx").on(
      t.assemblyId,
      t.visibility,
    ),
    factoryPartNumberIndex: index(
      "industrial_machine_components_factory_part_number_idx",
    ).on(t.factoryId, t.partNumber),
  }),
);

export const industrialCatalogItems = pgTable(
  "industrial_catalog_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    factoryId: uuid("factory_id")
      .references(() => industrialFactories.id, { onDelete: "cascade" })
      .notNull(),
    classification:
      industrialCatalogClassificationEnum("classification").notNull(),
    categoryCode: text("category_code").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    publicDescription: text("public_description"),
    productCode: text("product_code"),
    supplyModes: jsonb("supply_modes").$type<string[]>().notNull().default([]),
    priceMode: text("price_mode").notNull().default("quote_required"),
    availabilityStatus: text("availability_status")
      .notNull()
      .default("subject_to_confirmation"),
    manufacturer: text("manufacturer"),
    brand: text("brand"),
    model: text("model"),
    partNumber: text("part_number"),
    countryOfOrigin: text("country_of_origin"),
    technicalSpecifications: jsonb("technical_specifications")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    application: text("application"),
    compatibleMachinery: jsonb("compatible_machinery")
      .$type<string[]>()
      .notNull()
      .default([]),
    material: text("material"),
    unitOfMeasure: text("unit_of_measure"),
    minimumOrderQuantity: text("minimum_order_quantity"),
    availableQuantityText: text("available_quantity_text"),
    productionCapacityText: text("production_capacity_text"),
    leadTimeText: text("lead_time_text"),
    supplyFrequency: text("supply_frequency"),
    currencyCode: text("currency_code"),
    priceText: text("price_text"),
    certifications: jsonb("certifications")
      .$type<string[]>()
      .notNull()
      .default([]),
    visibility: industrialVisibilityEnum("visibility")
      .notNull()
      .default("exportunity_internal"),
    approvalStatus: industrialCatalogStatusEnum("approval_status")
      .notNull()
      .default("draft"),
    publicMedia: jsonb("public_media").$type<string[]>().notNull().default([]),
    privateMetadata: jsonb("private_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantPublicIndex: index("industrial_catalog_items_tenant_public_idx").on(
      t.tenantId,
      t.approvalStatus,
      t.visibility,
      t.classification,
    ),
    factoryIndex: index("industrial_catalog_items_factory_idx").on(
      t.factoryId,
      t.approvalStatus,
    ),
    tenantName: index("industrial_catalog_items_tenant_name_idx").on(
      t.tenantId,
      t.normalizedName,
    ),
  }),
);

export const industrialRequirements = pgTable(
  "industrial_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    factoryId: uuid("factory_id").references(() => industrialFactories.id, {
      onDelete: "set null",
    }),
    machineId: uuid("machine_id").references(() => industrialMachines.id, {
      onDelete: "set null",
    }),
    assemblyId: uuid("assembly_id").references(
      () => industrialMachineAssemblies.id,
      { onDelete: "set null" },
    ),
    componentId: uuid("component_id").references(
      () => industrialMachineComponents.id,
      { onDelete: "set null" },
    ),
    requesterUserId: integer("requester_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    customerContactId: integer("customer_contact_id").references(
      () => contacts.id,
      { onDelete: "set null" },
    ),
    assignedAccountManagerUserId: integer(
      "assigned_account_manager_user_id",
    ).references(() => eceUsers.id, { onDelete: "set null" }),
    referenceCode: text("reference_code").notNull(),
    requirementType:
      industrialRequirementTypeEnum("requirement_type").notNull(),
    categoryCode: text("category_code").notNull(),
    title: text("title").notNull(),
    details: text("details").notNull(),
    quantityText: text("quantity_text"),
    deliveryCountryCode: text("delivery_country_code"),
    deliveryCity: text("delivery_city"),
    requiredBy: timestamp("required_by"),
    urgency: text("urgency").notNull().default("standard"),
    requesterCompany: text("requester_company"),
    requesterName: text("requester_name").notNull(),
    requesterEmail: text("requester_email"),
    requesterPhone: text("requester_phone"),
    commercialIntent: text("commercial_intent"),
    commercialActionMode: text("commercial_action_mode"),
    intentConfidence: decimal("intent_confidence", {
      precision: 4,
      scale: 3,
    }),
    assignedCommercialAgentId: integer("assigned_commercial_agent_id"),
    sourceConversationId: text("source_conversation_id"),
    nextAction: text("next_action"),
    nextActionAt: timestamp("next_action_at"),
    status: industrialRequirementStatusEnum("status")
      .notNull()
      .default("draft"),
    visibility: industrialVisibilityEnum("visibility")
      .notNull()
      .default("exportunity_internal"),
    internalNotes: text("internal_notes"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    submittedAt: timestamp("submitted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantReferenceUnique: uniqueIndex(
      "industrial_requirements_tenant_reference_unique",
    ).on(t.tenantId, t.referenceCode),
    tenantStatus: index("industrial_requirements_tenant_status_idx").on(
      t.tenantId,
      t.status,
      t.requirementType,
    ),
    factoryIndex: index("industrial_requirements_factory_idx").on(
      t.factoryId,
      t.status,
    ),
    technicalContextIndex: index(
      "industrial_requirements_technical_context_idx",
    ).on(t.factoryId, t.machineId, t.assemblyId, t.componentId),
    commercialQueueIndex: index(
      "industrial_requirements_commercial_queue_idx",
    ).on(t.tenantId, t.commercialIntent, t.status, t.nextActionAt),
    customerContactIndex: index(
      "industrial_requirements_customer_contact_idx",
    ).on(t.tenantId, t.customerContactId, t.status),
  }),
);

export const industrialProductRequirements = pgTable(
  "industrial_product_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    requirementId: uuid("requirement_id")
      .references(() => industrialRequirements.id, { onDelete: "cascade" })
      .notNull(),
    sourceMessageId: integer("source_message_id").references(
      () => chatMessages.id,
      { onDelete: "set null" },
    ),
    intent: text("intent").notNull(),
    intentConfidence: decimal("intent_confidence", {
      precision: 4,
      scale: 3,
    }),
    suggestedAction: text("suggested_action").notNull().default("ASK"),
    productName: text("product_name"),
    productCategory: text("product_category"),
    specification: text("specification"),
    quantity: decimal("quantity", { precision: 20, scale: 6 }),
    quantityText: text("quantity_text"),
    unit: text("unit"),
    origin: text("origin"),
    destination: text("destination"),
    targetPrice: text("target_price"),
    currency: text("currency"),
    deadlineText: text("deadline_text"),
    frequency: text("frequency"),
    incoterm: text("incoterm"),
    customerType: text("customer_type"),
    missingFields: jsonb("missing_fields")
      .$type<string[]>()
      .notNull()
      .default([]),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    requirementUnique: uniqueIndex(
      "industrial_product_requirements_requirement_unique",
    ).on(t.requirementId),
    tenantIntentIndex: index(
      "industrial_product_requirements_tenant_intent_idx",
    ).on(t.tenantId, t.intent, t.createdAt),
    tenantProductIndex: index(
      "industrial_product_requirements_tenant_product_idx",
    ).on(t.tenantId, t.productCategory, t.productName),
    tenantSourceMessageIndex: index(
      "industrial_product_requirements_tenant_source_message_idx",
    ).on(t.tenantId, t.sourceMessageId),
  }),
);

export const industrialRecurringRequirements = pgTable(
  "industrial_recurring_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    factoryId: uuid("factory_id")
      .references(() => industrialFactories.id, { onDelete: "cascade" })
      .notNull(),
    machineId: uuid("machine_id").references(() => industrialMachines.id, {
      onDelete: "set null",
    }),
    assemblyId: uuid("assembly_id").references(
      () => industrialMachineAssemblies.id,
      { onDelete: "set null" },
    ),
    componentId: uuid("component_id").references(
      () => industrialMachineComponents.id,
      { onDelete: "set null" },
    ),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    updatedByUserId: integer("updated_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    requirementType:
      industrialRequirementTypeEnum("requirement_type").notNull(),
    categoryCode: text("category_code").notNull(),
    title: text("title").notNull(),
    details: text("details").notNull().default(""),
    quantityText: text("quantity_text"),
    frequency: text("frequency").notNull(),
    reorderThreshold: text("reorder_threshold"),
    preferredDeliveryDate: text("preferred_delivery_date"),
    preferredSupplier: text("preferred_supplier"),
    alternativeSupplier: text("alternative_supplier"),
    priceAgreementPeriod: text("price_agreement_period"),
    contractStartAt: timestamp("contract_start_at"),
    contractEndAt: timestamp("contract_end_at"),
    approvalWorkflow: text("approval_workflow")
      .notNull()
      .default("factory_owner_approval"),
    approvalRequired: boolean("approval_required").notNull().default(true),
    status: industrialRecurringRequirementStatusEnum("status")
      .notNull()
      .default("draft"),
    nextReviewAt: timestamp("next_review_at"),
    lastReminderAt: timestamp("last_reminder_at"),
    internalNotes: text("internal_notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    factoryStatusIndex: index(
      "industrial_recurring_requirements_factory_status_idx",
    ).on(t.factoryId, t.status, t.updatedAt),
    tenantReviewIndex: index(
      "industrial_recurring_requirements_tenant_review_idx",
    ).on(t.tenantId, t.status, t.nextReviewAt),
    tenantCategoryIndex: index(
      "industrial_recurring_requirements_tenant_category_idx",
    ).on(t.tenantId, t.requirementType, t.categoryCode),
    technicalContextIndex: index(
      "industrial_recurring_requirements_technical_context_idx",
    ).on(t.factoryId, t.machineId, t.assemblyId, t.componentId),
  }),
);

export const industrialChallenges = pgTable(
  "industrial_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    factoryId: uuid("factory_id")
      .references(() => industrialFactories.id, { onDelete: "cascade" })
      .notNull(),
    requirementId: uuid("requirement_id")
      .references(() => industrialRequirements.id, { onDelete: "cascade" })
      .notNull(),
    machineId: uuid("machine_id").references(() => industrialMachines.id, {
      onDelete: "set null",
    }),
    assemblyId: uuid("assembly_id").references(
      () => industrialMachineAssemblies.id,
      { onDelete: "set null" },
    ),
    componentId: uuid("component_id").references(
      () => industrialMachineComponents.id,
      { onDelete: "set null" },
    ),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    assignedStaffUserId: integer("assigned_staff_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    reviewedByUserId: integer("reviewed_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    requirementType: industrialRequirementTypeEnum("requirement_type").notNull(),
    categoryCode: text("category_code").notNull(),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    details: text("details").notNull(),
    problemType: text("problem_type").notNull(),
    productionStopped: boolean("production_stopped").notNull().default(false),
    impactText: text("impact_text"),
    recurrenceFrequency: text("recurrence_frequency"),
    estimatedDowntime: text("estimated_downtime"),
    currentWorkaround: text("current_workaround"),
    desiredOutcome: industrialChallengeOutcomeEnum("desired_outcome")
      .notNull()
      .default("review_required"),
    urgency: text("urgency").notNull().default("standard"),
    status: industrialChallengeStatusEnum("status").notNull().default("submitted"),
    visibility: industrialVisibilityEnum("visibility")
      .notNull()
      .default("factory_team_only"),
    groupKey: text("group_key"),
    triageNotes: text("triage_notes"),
    resolutionNotes: text("resolution_notes"),
    reviewedAt: timestamp("reviewed_at"),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    requirementUnique: uniqueIndex(
      "industrial_challenges_requirement_unique",
    ).on(t.requirementId),
    tenantStatusUrgencyIndex: index(
      "industrial_challenges_tenant_status_urgency_idx",
    ).on(t.tenantId, t.status, t.urgency, t.updatedAt),
    factoryStatusIndex: index("industrial_challenges_factory_status_idx").on(
      t.factoryId,
      t.status,
      t.updatedAt,
    ),
    technicalContextIndex: index(
      "industrial_challenges_technical_context_idx",
    ).on(t.factoryId, t.machineId, t.assemblyId, t.componentId),
    groupIndex: index("industrial_challenges_tenant_group_idx").on(
      t.tenantId,
      t.groupKey,
      t.status,
    ),
  }),
);

// Private scan-to-manufacture evidence record. This remains separate from a
// production challenge so one part can be reviewed independently or linked to
// an existing challenge and requirement without changing either lifecycle.
export const industrialPartRecords = pgTable(
  "industrial_part_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    factoryId: uuid("factory_id")
      .references(() => industrialFactories.id, { onDelete: "cascade" })
      .notNull(),
    sourceRequirementId: uuid("source_requirement_id").references(
      () => industrialRequirements.id,
      { onDelete: "set null" },
    ),
    challengeId: uuid("challenge_id").references(() => industrialChallenges.id, {
      onDelete: "set null",
    }),
    machineId: uuid("machine_id").references(() => industrialMachines.id, {
      onDelete: "set null",
    }),
    assemblyId: uuid("assembly_id").references(
      () => industrialMachineAssemblies.id,
      { onDelete: "set null" },
    ),
    componentId: uuid("component_id").references(
      () => industrialMachineComponents.id,
      { onDelete: "set null" },
    ),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    reviewedByUserId: integer("reviewed_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    referenceCode: text("reference_code").notNull(),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    partNumber: text("part_number"),
    requirementType: industrialRequirementTypeEnum("requirement_type")
      .notNull()
      .default("spare_part"),
    categoryCode: text("category_code").notNull(),
    technicalDetails: text("technical_details").notNull().default(""),
    material: text("material"),
    dimensionsText: text("dimensions_text"),
    weightText: text("weight_text"),
    application: text("application"),
    currentSource: text("current_source"),
    demandSignalText: text("demand_signal_text"),
    status: industrialPartRecordStatusEnum("status").notNull().default("captured"),
    routeDecision: industrialPartRouteDecisionEnum("route_decision")
      .notNull()
      .default("review_required"),
    routeRationale: text("route_rationale"),
    reviewNotes: text("review_notes"),
    visibility: industrialVisibilityEnum("visibility")
      .notNull()
      .default("factory_team_only"),
    revision: integer("revision").notNull().default(1),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantReferenceUnique: uniqueIndex(
      "industrial_part_records_tenant_reference_unique",
    ).on(t.tenantId, t.referenceCode),
    factoryStatusIndex: index("industrial_part_records_factory_status_idx").on(
      t.factoryId,
      t.status,
      t.updatedAt,
    ),
    tenantRouteIndex: index("industrial_part_records_tenant_route_idx").on(
      t.tenantId,
      t.routeDecision,
      t.status,
      t.updatedAt,
    ),
    technicalContextIndex: index(
      "industrial_part_records_technical_context_idx",
    ).on(t.factoryId, t.machineId, t.assemblyId, t.componentId),
    requirementIndex: index("industrial_part_records_requirement_idx").on(
      t.sourceRequirementId,
      t.challengeId,
    ),
  }),
);

export const industrialRequirementMatches = pgTable(
  "industrial_requirement_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    requirementId: uuid("requirement_id")
      .references(() => industrialRequirements.id, { onDelete: "cascade" })
      .notNull(),
    factoryId: uuid("factory_id")
      .references(() => industrialFactories.id, { onDelete: "cascade" })
      .notNull(),
    catalogItemId: uuid("catalog_item_id")
      .references(() => industrialCatalogItems.id, { onDelete: "cascade" })
      .notNull(),
    status: industrialRequirementMatchStatusEnum("status")
      .notNull()
      .default("candidate"),
    matchScore: integer("match_score"),
    matchReason: text("match_reason"),
    internalNotes: text("internal_notes"),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    selectedByUserId: integer("selected_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    selectedAt: timestamp("selected_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    requirementCatalogUnique: uniqueIndex(
      "industrial_requirement_matches_requirement_catalog_unique",
    ).on(t.requirementId, t.catalogItemId),
    tenantRequirementIndex: index(
      "industrial_requirement_matches_tenant_requirement_idx",
    ).on(t.tenantId, t.requirementId, t.status),
    tenantFactoryIndex: index(
      "industrial_requirement_matches_tenant_factory_idx",
    ).on(t.tenantId, t.factoryId, t.status),
  }),
);

// Supplier capabilities remain private to Exportunity operations. They are not
// public marketplace listings and cannot become a quote or an outreach action
// without a separate controlled commercial review.
export const industrialSupplierProfiles = pgTable(
  "industrial_supplier_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    linkedFactoryId: uuid("linked_factory_id").references(
      () => industrialFactories.id,
      { onDelete: "set null" },
    ),
    ownerUserId: integer("owner_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    legalName: text("legal_name").notNull(),
    displayName: text("display_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    supplierStatus: industrialSupplierStatusEnum("supplier_status")
      .notNull()
      .default("draft"),
    verificationStatus: industrialVerificationStatusEnum("verification_status")
      .notNull()
      .default("unverified"),
    visibility: industrialVisibilityEnum("visibility")
      .notNull()
      .default("exportunity_internal"),
    countryCode: text("country_code").notNull(),
    region: text("region"),
    city: text("city"),
    industrialZone: text("industrial_zone"),
    address: text("address"),
    website: text("website"),
    email: text("email"),
    phone: text("phone"),
    industriesServed: jsonb("industries_served")
      .$type<string[]>()
      .notNull()
      .default([]),
    categoryCodes: jsonb("category_codes")
      .$type<string[]>()
      .notNull()
      .default([]),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    equipmentAvailable: jsonb("equipment_available")
      .$type<string[]>()
      .notNull()
      .default([]),
    materialsHandled: jsonb("materials_handled")
      .$type<string[]>()
      .notNull()
      .default([]),
    maximumDimensions: text("maximum_dimensions"),
    tolerances: text("tolerances"),
    productionCapacityText: text("production_capacity_text"),
    certifications: jsonb("certifications").$type<string[]>().notNull().default([]),
    qualityControlCapability: text("quality_control_capability"),
    leadTimeText: text("lead_time_text"),
    previousPerformanceNotes: text("previous_performance_notes"),
    onTimeDeliveryRate: decimal("on_time_delivery_rate", {
      precision: 5,
      scale: 2,
    }),
    technicalDocumentReferences: jsonb("technical_document_references")
      .$type<string[]>()
      .notNull()
      .default([]),
    mediaReferences: jsonb("media_references")
      .$type<string[]>()
      .notNull()
      .default([]),
    ndaStatus: industrialSupplierNdaStatusEnum("nda_status")
      .notNull()
      .default("not_assessed"),
    adminNotes: text("admin_notes"),
    verifiedAt: timestamp("verified_at"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantNameUnique: uniqueIndex(
      "industrial_supplier_profiles_tenant_name_unique",
    ).on(t.tenantId, t.normalizedName),
    tenantReviewIndex: index(
      "industrial_supplier_profiles_tenant_review_idx",
    ).on(t.tenantId, t.supplierStatus, t.verificationStatus),
    tenantLocationIndex: index(
      "industrial_supplier_profiles_tenant_location_idx",
    ).on(t.tenantId, t.countryCode, t.city, t.industrialZone),
    linkedFactoryIndex: index(
      "industrial_supplier_profiles_linked_factory_idx",
    ).on(t.linkedFactoryId),
  }),
);

export const industrialRequirementSupplierMatches = pgTable(
  "industrial_requirement_supplier_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    requirementId: uuid("requirement_id")
      .references(() => industrialRequirements.id, { onDelete: "cascade" })
      .notNull(),
    supplierProfileId: uuid("supplier_profile_id")
      .references(() => industrialSupplierProfiles.id, { onDelete: "cascade" })
      .notNull(),
    status: industrialRequirementMatchStatusEnum("status")
      .notNull()
      .default("candidate"),
    matchScore: integer("match_score"),
    matchReason: text("match_reason"),
    source: text("source").notNull().default("internal_supplier_network"),
    discoveryUrl: text("discovery_url"),
    discoveryAgentId: integer("discovery_agent_id"),
    verificationScore: integer("verification_score"),
    relevanceScore: integer("relevance_score"),
    contactabilityScore: integer("contactability_score"),
    lastVerifiedAt: timestamp("last_verified_at"),
    internalNotes: text("internal_notes"),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    selectedByUserId: integer("selected_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    selectedAt: timestamp("selected_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    requirementSupplierUnique: uniqueIndex(
      "industrial_requirement_supplier_matches_requirement_supplier_unique",
    ).on(t.requirementId, t.supplierProfileId),
    tenantRequirementIndex: index(
      "industrial_requirement_supplier_matches_tenant_requirement_idx",
    ).on(t.tenantId, t.requirementId, t.status),
    tenantSupplierIndex: index(
      "industrial_requirement_supplier_matches_tenant_supplier_idx",
    ).on(t.tenantId, t.supplierProfileId, t.status),
  }),
);

// External discovery candidates are unverified company records linked to one
// governed requirement. Recording a candidate never creates a supplier
// profile, exposes an identity publicly, or authorizes outreach.
export const industrialRequirementDiscoveryCandidates = pgTable(
  "industrial_requirement_discovery_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    requirementId: uuid("requirement_id")
      .references(() => industrialRequirements.id, { onDelete: "cascade" })
      .notNull(),
    factoryLeadId: uuid("factory_lead_id")
      .references(() => industrialFactoryLeads.id, { onDelete: "cascade" })
      .notNull(),
    candidateKey: text("candidate_key").notNull(),
    status: industrialDiscoveryCandidateStatusEnum("status")
      .notNull()
      .default("discovered"),
    relevanceScore: integer("relevance_score").notNull().default(0),
    relevanceRationale: text("relevance_rationale").notNull(),
    contactStatus: text("contact_status").notNull().default("not_contacted"),
    outreachAllowed: boolean("outreach_allowed").notNull().default(false),
    humanApprovalRequired: boolean("human_approval_required")
      .notNull()
      .default(true),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    reviewedByUserId: integer("reviewed_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    reviewedAt: timestamp("reviewed_at"),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    requirementCandidateUnique: uniqueIndex(
      "industrial_requirement_discovery_candidates_requirement_candidate_unique",
    ).on(t.requirementId, t.candidateKey),
    tenantQueueIndex: index(
      "industrial_requirement_discovery_candidates_tenant_queue_idx",
    ).on(t.tenantId, t.status, t.updatedAt),
    tenantRequirementIndex: index(
      "industrial_requirement_discovery_candidates_tenant_requirement_idx",
    ).on(t.tenantId, t.requirementId, t.status),
    factoryLeadIndex: index(
      "industrial_requirement_discovery_candidates_factory_lead_idx",
    ).on(t.factoryLeadId, t.status),
  }),
);

// Provenance is append-only at the application layer. Multiple source
// snapshots can support one candidate without overwriting earlier evidence.
export const industrialDiscoveryEvidence = pgTable(
  "industrial_discovery_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    discoveryCandidateId: uuid("discovery_candidate_id")
      .references(() => industrialRequirementDiscoveryCandidates.id, {
        onDelete: "cascade",
      })
      .notNull(),
    sourceType: text("source_type").notNull(),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url").notNull(),
    retrievedAt: timestamp("retrieved_at").notNull(),
    contentHash: text("content_hash").notNull(),
    evidence: jsonb("evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    sourceSnapshotUnique: uniqueIndex(
      "industrial_discovery_evidence_candidate_source_hash_unique",
    ).on(t.discoveryCandidateId, t.sourceUrl, t.contentHash),
    tenantCandidateIndex: index(
      "industrial_discovery_evidence_tenant_candidate_idx",
    ).on(t.tenantId, t.discoveryCandidateId, t.createdAt),
  }),
);

// A promotion is an explicit, human-approved bridge from an unverified
// discovery candidate to an internal supplier profile. It records the exact
// evidence and attestation used for the decision, but never authorizes
// outreach or public identity exposure.
export const industrialSupplierPromotions = pgTable(
  "industrial_supplier_promotions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    discoveryCandidateId: uuid("discovery_candidate_id")
      .references(() => industrialRequirementDiscoveryCandidates.id, {
        onDelete: "cascade",
      })
      .notNull(),
    requirementId: uuid("requirement_id")
      .references(() => industrialRequirements.id, { onDelete: "cascade" })
      .notNull(),
    supplierProfileId: uuid("supplier_profile_id")
      .references(() => industrialSupplierProfiles.id, { onDelete: "restrict" })
      .notNull(),
    verificationScope: text("verification_scope").notNull(),
    evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull().default([]),
    officialEvidenceId: uuid("official_evidence_id")
      .references(() => industrialDiscoveryEvidence.id, { onDelete: "restrict" })
      .notNull(),
    contactEvidenceId: uuid("contact_evidence_id")
      .references(() => industrialDiscoveryEvidence.id, { onDelete: "restrict" })
      .notNull(),
    legalName: text("legal_name").notNull(),
    countryCode: text("country_code").notNull(),
    contactType: text("contact_type").notNull(),
    contactValue: text("contact_value").notNull(),
    checklist: jsonb("checklist")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    decisionNotes: text("decision_notes").notNull(),
    approvedByUserId: integer("approved_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    approvedAt: timestamp("approved_at").notNull(),
    outreachAllowed: boolean("outreach_allowed").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    candidateUnique: uniqueIndex(
      "industrial_supplier_promotions_candidate_unique",
    ).on(t.discoveryCandidateId),
    tenantSupplierIndex: index(
      "industrial_supplier_promotions_tenant_supplier_idx",
    ).on(t.tenantId, t.supplierProfileId, t.approvedAt),
    tenantRequirementIndex: index(
      "industrial_supplier_promotions_tenant_requirement_idx",
    ).on(t.tenantId, t.requirementId, t.approvedAt),
  }),
);

// An RFQ draft is an internal, content-addressed proposal for supplier
// outreach. This table is intentionally unable to record a delivery: channel
// dispatch belongs to a later, separately governed workflow.
export const industrialSupplierRfqDrafts = pgTable(
  "industrial_supplier_rfq_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    promotionId: uuid("promotion_id")
      .references(() => industrialSupplierPromotions.id, { onDelete: "restrict" })
      .notNull(),
    requirementId: uuid("requirement_id")
      .references(() => industrialRequirements.id, { onDelete: "restrict" })
      .notNull(),
    supplierProfileId: uuid("supplier_profile_id")
      .references(() => industrialSupplierProfiles.id, { onDelete: "restrict" })
      .notNull(),
    requirementSupplierMatchId: uuid("requirement_supplier_match_id")
      .references(() => industrialRequirementSupplierMatches.id, {
        onDelete: "restrict",
      })
      .notNull(),
    referenceCode: text("reference_code").notNull(),
    revision: integer("revision").notNull().default(1),
    status: industrialSupplierRfqStatusEnum("status").notNull().default("draft"),
    subject: text("subject").notNull(),
    messageBody: text("message_body").notNull(),
    requestedFields: jsonb("requested_fields").$type<string[]>().notNull().default([]),
    requirementSnapshot: jsonb("requirement_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    supplierSnapshot: jsonb("supplier_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    buyerInstructions: text("buyer_instructions"),
    responseDeadline: timestamp("response_deadline").notNull(),
    contentHash: text("content_hash").notNull(),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    submittedByUserId: integer("submitted_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    submittedAt: timestamp("submitted_at"),
    deliveryStatus: text("delivery_status").notNull().default("not_sent"),
    deliveryChannel: text("delivery_channel"),
    deliveredAt: timestamp("delivered_at"),
    externalMessageId: text("external_message_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantReferenceUnique: uniqueIndex(
      "industrial_supplier_rfq_drafts_tenant_reference_unique",
    ).on(t.tenantId, t.referenceCode),
    promotionRevisionUnique: uniqueIndex(
      "industrial_supplier_rfq_drafts_promotion_revision_unique",
    ).on(t.promotionId, t.revision),
    promotionContentUnique: uniqueIndex(
      "industrial_supplier_rfq_drafts_promotion_content_unique",
    ).on(t.promotionId, t.contentHash),
    tenantStatusIndex: index(
      "industrial_supplier_rfq_drafts_tenant_status_idx",
    ).on(t.tenantId, t.status, t.updatedAt),
    tenantRequirementIndex: index(
      "industrial_supplier_rfq_drafts_tenant_requirement_idx",
    ).on(t.tenantId, t.requirementId, t.status),
    tenantSupplierIndex: index(
      "industrial_supplier_rfq_drafts_tenant_supplier_idx",
    ).on(t.tenantId, t.supplierProfileId, t.status),
  }),
);

// Decision content is immutable at the application layer and binds an explicit
// human decision to the exact RFQ content hash. The dispatchCreated marker is
// the sole mutable field and is consumed atomically by the separate dispatcher.
export const industrialSupplierRfqDecisions = pgTable(
  "industrial_supplier_rfq_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    rfqDraftId: uuid("rfq_draft_id")
      .references(() => industrialSupplierRfqDrafts.id, { onDelete: "restrict" })
      .notNull(),
    decision: industrialSupplierRfqDecisionEnum("decision").notNull(),
    contentHash: text("content_hash").notNull(),
    checklist: jsonb("checklist")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    decisionNotes: text("decision_notes").notNull(),
    decidedByUserId: integer("decided_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    decidedAt: timestamp("decided_at").notNull(),
    authorizationExpiresAt: timestamp("authorization_expires_at"),
    outreachAuthorized: boolean("outreach_authorized").notNull().default(false),
    dispatchCreated: boolean("dispatch_created").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    draftUnique: uniqueIndex(
      "industrial_supplier_rfq_decisions_draft_unique",
    ).on(t.rfqDraftId),
    tenantDecisionIndex: index(
      "industrial_supplier_rfq_decisions_tenant_decision_idx",
    ).on(t.tenantId, t.decision, t.decidedAt),
    tenantExpiryIndex: index(
      "industrial_supplier_rfq_decisions_tenant_expiry_idx",
    ).on(t.tenantId, t.authorizationExpiresAt),
  }),
);

// Contact authorization and suppression are stored independently from a
// supplier profile. A verified public contact is not, by itself, permission
// to send an RFQ.
export const industrialSupplierContactControls = pgTable(
  "industrial_supplier_contact_controls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    supplierProfileId: uuid("supplier_profile_id")
      .references(() => industrialSupplierProfiles.id, { onDelete: "restrict" })
      .notNull(),
    sourcePromotionId: uuid("source_promotion_id").references(
      () => industrialSupplierPromotions.id,
      { onDelete: "restrict" },
    ),
    channel: industrialSupplierContactChannelEnum("channel").notNull(),
    contactHash: text("contact_hash").notNull(),
    contactMasked: text("contact_masked").notNull(),
    state: industrialSupplierContactControlStateEnum("state").notNull(),
    authorizationBasis: industrialSupplierContactAuthorizationBasisEnum(
      "authorization_basis",
    ),
    evidenceReference: text("evidence_reference"),
    notes: text("notes").notNull(),
    authorizedByUserId: integer("authorized_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    authorizedAt: timestamp("authorized_at"),
    authorizationExpiresAt: timestamp("authorization_expires_at"),
    suppressedByUserId: integer("suppressed_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    suppressedAt: timestamp("suppressed_at"),
    suppressionReason: text("suppression_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    contactUnique: uniqueIndex(
      "industrial_supplier_contact_controls_tenant_contact_unique",
    ).on(t.tenantId, t.supplierProfileId, t.channel, t.contactHash),
    tenantStateIndex: index(
      "industrial_supplier_contact_controls_tenant_state_idx",
    ).on(t.tenantId, t.state, t.updatedAt),
    tenantExpiryIndex: index(
      "industrial_supplier_contact_controls_tenant_expiry_idx",
    ).on(t.tenantId, t.authorizationExpiresAt),
  }),
);

// A dispatch consumes exactly one approved RFQ decision. The ledger permits
// one provider attempt and intentionally has no automatic retry state.
export const industrialSupplierRfqDispatches = pgTable(
  "industrial_supplier_rfq_dispatches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    rfqDraftId: uuid("rfq_draft_id")
      .references(() => industrialSupplierRfqDrafts.id, { onDelete: "restrict" })
      .notNull(),
    decisionId: uuid("decision_id")
      .references(() => industrialSupplierRfqDecisions.id, { onDelete: "restrict" })
      .notNull(),
    contactControlId: uuid("contact_control_id")
      .references(() => industrialSupplierContactControls.id, { onDelete: "restrict" })
      .notNull(),
    contactAuthorizationBasis: industrialSupplierContactAuthorizationBasisEnum(
      "contact_authorization_basis",
    ).notNull(),
    contactEvidenceReference: text("contact_evidence_reference").notNull(),
    contactAuthorizedAt: timestamp("contact_authorized_at").notNull(),
    contactAuthorizationExpiresAt: timestamp(
      "contact_authorization_expires_at",
    ).notNull(),
    supplierProfileId: uuid("supplier_profile_id")
      .references(() => industrialSupplierProfiles.id, { onDelete: "restrict" })
      .notNull(),
    channel: industrialSupplierContactChannelEnum("channel").notNull(),
    contentHash: text("content_hash").notNull(),
    recipientHash: text("recipient_hash").notNull(),
    recipientMasked: text("recipient_masked").notNull(),
    senderAgentKey: text("sender_agent_key").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    checklist: jsonb("checklist")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    dispatchNotes: text("dispatch_notes").notNull(),
    status: industrialSupplierRfqDispatchStatusEnum("status")
      .notNull()
      .default("reserved"),
    attemptCount: integer("attempt_count").notNull().default(0),
    reservedByUserId: integer("reserved_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    reservedAt: timestamp("reserved_at").notNull(),
    attemptedAt: timestamp("attempted_at"),
    completedAt: timestamp("completed_at"),
    providerMessageId: text("provider_message_id"),
    providerStatus: text("provider_status"),
    providerResponse: jsonb("provider_response")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    draftUnique: uniqueIndex("industrial_supplier_rfq_dispatches_draft_unique").on(
      t.rfqDraftId,
    ),
    decisionUnique: uniqueIndex(
      "industrial_supplier_rfq_dispatches_decision_unique",
    ).on(t.decisionId),
    tenantIdempotencyUnique: uniqueIndex(
      "industrial_supplier_rfq_dispatches_tenant_idempotency_unique",
    ).on(t.tenantId, t.idempotencyKey),
    tenantStatusIndex: index(
      "industrial_supplier_rfq_dispatches_tenant_status_idx",
    ).on(t.tenantId, t.status, t.updatedAt),
    tenantSupplierIndex: index(
      "industrial_supplier_rfq_dispatches_tenant_supplier_idx",
    ).on(t.tenantId, t.supplierProfileId, t.createdAt),
  }),
);

// This ledger preserves the legacy marketplace source while staff decide
// whether a record belongs in Exportunity's industrial model. It never alters
// seller_products directly and is never used by public industrial search.
export const industrialLegacyProductReviews = pgTable(
  "industrial_legacy_product_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    legacySellerProductId: integer("legacy_seller_product_id").notNull(),
    legacySellerId: integer("legacy_seller_id"),
    legacyCategoryId: integer("legacy_category_id"),
    sourceSnapshot: jsonb("source_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    reviewStatus: industrialLegacyProductReviewStatusEnum("review_status")
      .notNull()
      .default("REQUIRES_RECLASSIFICATION"),
    suggestedStatus: industrialLegacyProductReviewStatusEnum(
      "suggested_status",
    ),
    suggestedClassification: industrialCatalogClassificationEnum(
      "suggested_classification",
    ),
    proposedClassification: industrialCatalogClassificationEnum(
      "proposed_classification",
    ),
    industrialCatalogItemId: uuid("industrial_catalog_item_id").references(
      () => industrialCatalogItems.id,
      { onDelete: "set null" },
    ),
    duplicateOfLegacyProductId: integer("duplicate_of_legacy_product_id"),
    reviewReason: text("review_reason"),
    reviewedByUserId: integer("reviewed_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    reviewedAt: timestamp("reviewed_at"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantLegacyProductUnique: uniqueIndex(
      "industrial_legacy_product_reviews_tenant_product_unique",
    ).on(t.tenantId, t.legacySellerProductId),
    tenantReviewStatusIndex: index(
      "industrial_legacy_product_reviews_tenant_status_idx",
    ).on(t.tenantId, t.reviewStatus, t.updatedAt),
    tenantCatalogItemIndex: index(
      "industrial_legacy_product_reviews_tenant_catalog_item_idx",
    ).on(t.tenantId, t.industrialCatalogItemId),
  }),
);

// Historical subset retained privately for source compatibility while the
// canonical exported table is defined in exportunity-supplier-quotes.ts. Both
// definitions target the existing ledger; only the extended definition is
// exported through @db/schema.
const industrialSupplierQuotesLegacyShape = pgTable(
  "industrial_supplier_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    requirementId: uuid("requirement_id")
      .references(() => industrialRequirements.id, { onDelete: "cascade" })
      .notNull(),
    supplierProfileId: uuid("supplier_profile_id")
      .references(() => industrialSupplierProfiles.id, { onDelete: "set null" }),
    supplierMatchId: uuid("supplier_match_id").references(
      () => industrialRequirementSupplierMatches.id,
      { onDelete: "set null" },
    ),
    referenceCode: text("reference_code").notNull(),
    product: text("product").notNull(),
    specification: text("specification"),
    quantityText: text("quantity_text"),
    unit: text("unit"),
    unitPrice: decimal("unit_price", { precision: 16, scale: 4 }),
    totalCost: decimal("total_cost", { precision: 16, scale: 2 }),
    currencyCode: text("currency_code").notNull().default("XOF"),
    incoterm: text("incoterm"),
    origin: text("origin"),
    destination: text("destination"),
    packaging: text("packaging"),
    minimumOrderQuantity: text("minimum_order_quantity"),
    leadTimeDays: integer("lead_time_days"),
    paymentTerms: text("payment_terms"),
    validUntil: timestamp("valid_until"),
    certifications: jsonb("certifications")
      .$type<string[]>()
      .notNull()
      .default([]),
    documentReferences: jsonb("document_references")
      .$type<string[]>()
      .notNull()
      .default([]),
    sourceChannel: text("source_channel").notNull().default("manual"),
    rawSourceMessageId: text("raw_source_message_id"),
    rawSourceText: text("raw_source_text"),
    extractionConfidence: decimal("extraction_confidence", {
      precision: 4,
      scale: 3,
    }),
    status: text("status").notNull().default("needs_review"),
    internalNotes: text("internal_notes"),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    receivedAt: timestamp("received_at"),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantReferenceUnique: uniqueIndex(
      "industrial_supplier_quotes_tenant_reference_unique",
    ).on(t.tenantId, t.referenceCode),
    tenantRequirementIndex: index(
      "industrial_supplier_quotes_tenant_requirement_idx",
    ).on(t.tenantId, t.requirementId, t.status, t.updatedAt),
    tenantSupplierIndex: index(
      "industrial_supplier_quotes_tenant_supplier_idx",
    ).on(t.tenantId, t.supplierProfileId, t.status),
    sourceMessageIndex: index(
      "industrial_supplier_quotes_source_message_idx",
    ).on(t.tenantId, t.rawSourceMessageId),
  }),
);

// Internal pricing workbench. Conversion to a customer quote is an explicit,
// audited step; no supplier cost or margin is copied into customer-visible
// fields.
export const industrialCommercialOffers = pgTable(
  "industrial_commercial_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    requirementId: uuid("requirement_id")
      .references(() => industrialRequirements.id, { onDelete: "cascade" })
      .notNull(),
    customerContactId: integer("customer_contact_id").references(
      () => contacts.id,
      { onDelete: "set null" },
    ),
    referenceCode: text("reference_code").notNull(),
    version: integer("version").notNull().default(1),
    supplierQuoteIds: jsonb("supplier_quote_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    costStack: jsonb("cost_stack")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    totalCost: decimal("total_cost", { precision: 16, scale: 2 }).notNull(),
    internalMargin: decimal("internal_margin", {
      precision: 16,
      scale: 2,
    }).notNull(),
    marginPercent: decimal("margin_percent", {
      precision: 7,
      scale: 3,
    }).notNull(),
    customerPrice: decimal("customer_price", {
      precision: 16,
      scale: 2,
    }).notNull(),
    currencyCode: text("currency_code").notNull().default("XOF"),
    incoterm: text("incoterm"),
    deliveryEstimate: text("delivery_estimate"),
    paymentTerms: text("payment_terms"),
    offerValidUntil: timestamp("offer_valid_until"),
    terms: text("terms"),
    status: text("status").notNull().default("draft"),
    pricingPolicy: jsonb("pricing_policy")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    approvedByUserId: integer("approved_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    approvedAt: timestamp("approved_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantReferenceUnique: uniqueIndex(
      "industrial_commercial_offers_tenant_reference_unique",
    ).on(t.tenantId, t.referenceCode),
    requirementVersionUnique: uniqueIndex(
      "industrial_commercial_offers_requirement_version_unique",
    ).on(t.requirementId, t.version),
    tenantRequirementIndex: index(
      "industrial_commercial_offers_tenant_requirement_idx",
    ).on(t.tenantId, t.requirementId, t.status, t.updatedAt),
  }),
);

export const industrialQuotes = pgTable(
  "industrial_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    requirementId: uuid("requirement_id")
      .references(() => industrialRequirements.id, { onDelete: "cascade" })
      .notNull(),
    requirementMatchId: uuid("requirement_match_id").references(
      () => industrialRequirementMatches.id,
      { onDelete: "set null" },
    ),
    factoryId: uuid("factory_id").references(() => industrialFactories.id, {
      onDelete: "set null",
    }),
    catalogItemId: uuid("catalog_item_id").references(
      () => industrialCatalogItems.id,
      { onDelete: "set null" },
    ),
    commercialOfferId: uuid("commercial_offer_id").references(
      () => industrialCommercialOffers.id,
      { onDelete: "set null" },
    ),
    referenceCode: text("reference_code").notNull(),
    status: industrialQuoteStatusEnum("status").notNull().default("draft"),
    currencyCode: text("currency_code").notNull().default("XOF"),
    totalAmount: decimal("total_amount", { precision: 24, scale: 3 }),
    lineItems: jsonb("line_items")
      .$type<Array<Record<string, string>>>()
      .notNull()
      .default([]),
    leadTimeText: text("lead_time_text"),
    validUntil: timestamp("valid_until"),
    commercialTerms: text("commercial_terms"),
    customerNotes: text("customer_notes"),
    internalNotes: text("internal_notes"),
    // industrial_supplier_quotes lives in the Exportunity extension schema.
    // The additive migration enforces this cross-module foreign key without
    // introducing an import cycle back into the industrial foundation.
    sourceSupplierQuoteId: uuid("source_supplier_quote_id"),
    pricingVersion: text("pricing_version"),
    pricingHash: text("pricing_hash"),
    supplierCostMinor: decimal("supplier_cost_minor", {
      precision: 30,
      scale: 0,
    }),
    additionalCostsMinor: decimal("additional_costs_minor", {
      precision: 30,
      scale: 0,
    }),
    totalCostMinor: decimal("total_cost_minor", {
      precision: 30,
      scale: 0,
    }),
    targetGrossMarginBps: integer("target_gross_margin_bps"),
    marginMinor: decimal("margin_minor", { precision: 30, scale: 0 }),
    customerPriceMinor: decimal("customer_price_minor", {
      precision: 30,
      scale: 0,
    }),
    costStack: jsonb("cost_stack")
      .$type<Array<Record<string, string>>>()
      .notNull()
      .default([]),
    pricingChecklist: jsonb("pricing_checklist")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    pricingNotes: text("pricing_notes"),
    pricingSubmittedByUserId: integer(
      "pricing_submitted_by_user_id",
    ).references(() => eceUsers.id, { onDelete: "set null" }),
    pricingSubmittedAt: timestamp("pricing_submitted_at"),
    pricingApprovedByUserId: integer(
      "pricing_approved_by_user_id",
    ).references(() => eceUsers.id, { onDelete: "set null" }),
    pricingApprovedAt: timestamp("pricing_approved_at"),
    pricingDecisionNotes: text("pricing_decision_notes"),
    visibility: industrialVisibilityEnum("visibility")
      .notNull()
      .default("parties_to_transaction"),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    issuedByUserId: integer("issued_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    issuedAt: timestamp("issued_at"),
    respondedAt: timestamp("responded_at"),
    customerResponseHash: text("customer_response_hash"),
    customerResponseChannel: text("customer_response_channel"),
    customerResponseReference: text("customer_response_reference"),
    customerResponseEvidence: jsonb("customer_response_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    customerResponseRecordedByUserId: integer(
      "customer_response_recorded_by_user_id",
    ).references(() => eceUsers.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantReferenceUnique: uniqueIndex(
      "industrial_quotes_tenant_reference_unique",
    ).on(t.tenantId, t.referenceCode),
    tenantRequirementIndex: index(
      "industrial_quotes_tenant_requirement_idx",
    ).on(t.tenantId, t.requirementId, t.status),
    tenantFactoryIndex: index("industrial_quotes_tenant_factory_idx").on(
      t.tenantId,
      t.factoryId,
      t.status,
    ),
    commercialOfferUnique: uniqueIndex(
      "industrial_quotes_commercial_offer_unique",
    ).on(t.tenantId, t.commercialOfferId),
    tenantPricingHashUnique: uniqueIndex(
      "industrial_quotes_tenant_pricing_hash_unique",
    ).on(t.tenantId, t.pricingHash),
    tenantSourceSupplierQuoteIndex: index(
      "industrial_quotes_tenant_source_supplier_quote_idx",
    ).on(t.tenantId, t.sourceSupplierQuoteId, t.status),
    tenantCustomerResponseHashUnique: uniqueIndex(
      "industrial_quotes_tenant_customer_response_hash_unique",
    )
      .on(t.tenantId, t.customerResponseHash)
      .where(sql`${t.customerResponseHash} IS NOT NULL`),
  }),
);

export const industrialOrders = pgTable(
  "industrial_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    quoteId: uuid("quote_id")
      .references(() => industrialQuotes.id)
      .notNull(),
    requirementId: uuid("requirement_id")
      .references(() => industrialRequirements.id)
      .notNull(),
    factoryId: uuid("factory_id").references(() => industrialFactories.id, {
      onDelete: "set null",
    }),
    catalogItemId: uuid("catalog_item_id").references(
      () => industrialCatalogItems.id,
      { onDelete: "set null" },
    ),
    referenceCode: text("reference_code").notNull(),
    status: industrialOrderStatusEnum("status").notNull().default("confirmed"),
    currencyCode: text("currency_code").notNull().default("XOF"),
    totalAmount: decimal("total_amount", { precision: 30, scale: 3 }),
    totalAmountMinor: decimal("total_amount_minor", {
      precision: 30,
      scale: 0,
    }),
    sourcePricingHash: text("source_pricing_hash"),
    customerResponseHash: text("customer_response_hash"),
    orderConfirmationHash: text("order_confirmation_hash"),
    orderConfirmationChecklist: jsonb("order_confirmation_checklist")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    paidAmount: decimal("paid_amount", { precision: 16, scale: 2 }),
    paidCurrencyCode: text("paid_currency_code"),
    paidAt: timestamp("paid_at"),
    lastPaymentId: uuid("last_payment_id"),
    lineItems: jsonb("line_items")
      .$type<Array<Record<string, string>>>()
      .notNull()
      .default([]),
    commercialTerms: text("commercial_terms"),
    deliveryNotes: text("delivery_notes"),
    internalNotes: text("internal_notes"),
    sourceQuoteSnapshot: jsonb("source_quote_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    visibility: industrialVisibilityEnum("visibility")
      .notNull()
      .default("parties_to_transaction"),
    confirmedByUserId: integer("confirmed_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    confirmedAt: timestamp("confirmed_at"),
    plannedDeliveryAt: timestamp("planned_delivery_at"),
    completedAt: timestamp("completed_at"),
    cancelledAt: timestamp("cancelled_at"),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    updatedByUserId: integer("updated_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantReferenceUnique: uniqueIndex(
      "industrial_orders_tenant_reference_unique",
    ).on(t.tenantId, t.referenceCode),
    tenantQuoteUnique: uniqueIndex("industrial_orders_tenant_quote_unique").on(
      t.tenantId,
      t.quoteId,
    ),
    tenantStatus: index("industrial_orders_tenant_status_idx").on(
      t.tenantId,
      t.status,
      t.updatedAt,
    ),
    tenantPaymentStatus: index(
      "industrial_orders_tenant_payment_status_idx",
    ).on(t.tenantId, t.paymentStatus, t.updatedAt),
    factoryStatus: index("industrial_orders_factory_status_idx").on(
      t.factoryId,
      t.status,
      t.updatedAt,
    ),
    requirementIndex: index("industrial_orders_requirement_idx").on(
      t.requirementId,
      t.status,
    ),
    tenantConfirmationHashUnique: uniqueIndex(
      "industrial_orders_tenant_confirmation_hash_unique",
    )
      .on(t.tenantId, t.orderConfirmationHash)
      .where(sql`${t.orderConfirmationHash} IS NOT NULL`),
    tenantSourcePricingHash: index(
      "industrial_orders_tenant_source_pricing_hash_idx",
    )
      .on(t.tenantId, t.sourcePricingHash)
      .where(sql`${t.sourcePricingHash} IS NOT NULL`),
  }),
);

export const industrialFulfillmentPlans = pgTable(
  "industrial_fulfillment_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    orderId: uuid("order_id")
      .references(() => industrialOrders.id, { onDelete: "cascade" })
      .notNull(),
    kind: industrialFulfillmentKindEnum("kind")
      .notNull()
      .default("standard_order"),
    status: industrialFulfillmentStatusEnum("status")
      .notNull()
      .default("release_review"),
    trackingCode: text("tracking_code").notNull(),
    procurementTaskId: integer("procurement_task_id"),
    publicEta: timestamp("public_eta"),
    routeSnapshot: jsonb("route_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    exceptionSummary: text("exception_summary"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    startedAt: timestamp("started_at"),
    deliveredAt: timestamp("delivered_at"),
    cancelledAt: timestamp("cancelled_at"),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    updatedByUserId: integer("updated_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantOrderUnique: uniqueIndex(
      "industrial_fulfillment_plans_tenant_order_unique",
    ).on(t.tenantId, t.orderId),
    tenantTrackingUnique: uniqueIndex(
      "industrial_fulfillment_plans_tenant_tracking_unique",
    ).on(t.tenantId, t.trackingCode),
    tenantStatusIndex: index(
      "industrial_fulfillment_plans_tenant_status_idx",
    ).on(t.tenantId, t.status, t.updatedAt),
  }),
);

export const industrialFulfillmentServices = pgTable(
  "industrial_fulfillment_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    planId: uuid("plan_id")
      .references(() => industrialFulfillmentPlans.id, { onDelete: "cascade" })
      .notNull(),
    orderId: uuid("order_id")
      .references(() => industrialOrders.id, { onDelete: "cascade" })
      .notNull(),
    serviceType: industrialFulfillmentServiceTypeEnum("service_type").notNull(),
    status: industrialFulfillmentServiceStatusEnum("status")
      .notNull()
      .default("candidate"),
    providerKind: text("provider_kind").notNull().default("internal_team"),
    providerName: text("provider_name"),
    providerReference: text("provider_reference"),
    externalReference: text("external_reference"),
    publicLabel: text("public_label"),
    approvalReason: text("approval_reason"),
    approvedByUserId: integer("approved_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    approvedAt: timestamp("approved_at"),
    approvalActionId: integer("approval_action_id"),
    linkedDeliveryOrderId: integer("linked_delivery_order_id"),
    linkedDeliveryReference: text("linked_delivery_reference"),
    carrierProfileId: uuid("carrier_profile_id"),
    carrierDeliveryQuoteId: uuid("carrier_delivery_quote_id"),
    carrierBookingAuthorizationId: uuid("carrier_booking_authorization_id"),
    quotedCost: decimal("quoted_cost", { precision: 16, scale: 2 }),
    currencyCode: text("currency_code"),
    scheduledStartAt: timestamp("scheduled_start_at"),
    scheduledEndAt: timestamp("scheduled_end_at"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    performanceRating: integer("performance_rating"),
    onTime: boolean("on_time"),
    issueCount: integer("issue_count").notNull().default(0),
    performanceNotes: text("performance_notes"),
    internalNotes: text("internal_notes"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    updatedByUserId: integer("updated_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    planServiceUnique: uniqueIndex(
      "industrial_fulfillment_services_plan_type_unique",
    ).on(t.planId, t.serviceType),
    tenantStatusIndex: index(
      "industrial_fulfillment_services_tenant_status_idx",
    ).on(t.tenantId, t.status, t.updatedAt),
    orderIndex: index("industrial_fulfillment_services_order_idx").on(
      t.orderId,
      t.serviceType,
    ),
  }),
);

export const industrialFulfillmentEvents = pgTable(
  "industrial_fulfillment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    planId: uuid("plan_id")
      .references(() => industrialFulfillmentPlans.id, { onDelete: "cascade" })
      .notNull(),
    orderId: uuid("order_id")
      .references(() => industrialOrders.id, { onDelete: "cascade" })
      .notNull(),
    sequence: integer("sequence").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    eventType: text("event_type").notNull(),
    planStatus: industrialFulfillmentStatusEnum("plan_status"),
    title: text("title").notNull(),
    customerMessage: text("customer_message"),
    internalNotes: text("internal_notes"),
    customerVisible: boolean("customer_visible").notNull().default(false),
    evidence: jsonb("evidence")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    proof: jsonb("proof")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    source: industrialFulfillmentEventSourceEnum("source")
      .notNull()
      .default("staff"),
    actorUserId: integer("actor_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
  },
  (t) => ({
    planSequenceUnique: uniqueIndex(
      "industrial_fulfillment_events_plan_sequence_unique",
    ).on(t.planId, t.sequence),
    tenantIdempotencyUnique: uniqueIndex(
      "industrial_fulfillment_events_tenant_idempotency_unique",
    ).on(t.tenantId, t.idempotencyKey),
    tenantOrderIndex: index(
      "industrial_fulfillment_events_tenant_order_idx",
    ).on(t.tenantId, t.orderId, t.occurredAt),
    publicTimelineIndex: index(
      "industrial_fulfillment_events_public_timeline_idx",
    ).on(t.planId, t.customerVisible, t.sequence),
  }),
);

export const industrialFactoryClaims = pgTable(
  "industrial_factory_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    factoryId: uuid("factory_id")
      .references(() => industrialFactories.id, { onDelete: "cascade" })
      .notNull(),
    claimantUserId: integer("claimant_user_id")
      .references(() => eceUsers.id, { onDelete: "cascade" })
      .notNull(),
    relationship: text("relationship").notNull(),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    authorizationReference: text("authorization_reference"),
    message: text("message"),
    status: industrialFactoryClaimStatusEnum("status")
      .notNull()
      .default("submitted"),
    reviewNotes: text("review_notes"),
    reviewedByUserId: integer("reviewed_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantStatusIndex: index("industrial_factory_claims_tenant_status_idx").on(
      t.tenantId,
      t.status,
      t.createdAt,
    ),
    factoryStatusIndex: index(
      "industrial_factory_claims_factory_status_idx",
    ).on(t.factoryId, t.status),
    claimantIndex: index("industrial_factory_claims_claimant_idx").on(
      t.claimantUserId,
      t.status,
    ),
  }),
);

export const industrialRequirementAttachments = pgTable(
  "industrial_requirement_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    requirementId: uuid("requirement_id")
      .references(() => industrialRequirements.id, { onDelete: "cascade" })
      .notNull(),
    uploadedByUserId: integer("uploaded_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    fileName: text("file_name").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    extractionStatus: text("extraction_status").notNull().default("pending"),
    extractionMethod: text("extraction_method"),
    extractedText: text("extracted_text"),
    extractionWarning: text("extraction_warning"),
    extractionMetadata: jsonb("extraction_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    extractedAt: timestamp("extracted_at"),
    visibility: industrialVisibilityEnum("visibility")
      .notNull()
      .default("factory_team_only"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    requirementIndex: index(
      "industrial_requirement_attachments_requirement_idx",
    ).on(t.requirementId, t.visibility),
    extractionIndex: index(
      "industrial_requirement_attachments_extraction_idx",
    ).on(t.tenantId, t.extractionStatus, t.createdAt),
  }),
);

// Model and deterministic extraction output is only a candidate. A reviewer
// must explicitly verify a separate proposal before any requirement field can
// be changed, and applying approved fields is its own audited action.
export const industrialAttachmentReviews = pgTable(
  "industrial_attachment_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    requirementId: uuid("requirement_id")
      .references(() => industrialRequirements.id, { onDelete: "cascade" })
      .notNull(),
    attachmentId: uuid("attachment_id")
      .references(() => industrialRequirementAttachments.id, {
        onDelete: "cascade",
      })
      .notNull(),
    reviewKind: industrialAttachmentReviewKindEnum("review_kind").notNull(),
    status: industrialAttachmentReviewStatusEnum("status")
      .notNull()
      .default("under_review"),
    analysisProposal: jsonb("analysis_proposal")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    reviewedProposal: jsonb("reviewed_proposal")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    generationMetadata: jsonb("generation_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    analysisWarning: text("analysis_warning"),
    reviewNotes: text("review_notes"),
    appliedFields: jsonb("applied_fields")
      .$type<string[]>()
      .notNull()
      .default([]),
    revision: integer("revision").notNull().default(1),
    requestedByUserId: integer("requested_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    requestedAt: timestamp("requested_at"),
    reviewedByUserId: integer("reviewed_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    reviewedAt: timestamp("reviewed_at"),
    approvedByUserId: integer("approved_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    approvedAt: timestamp("approved_at"),
    rejectedByUserId: integer("rejected_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    rejectedAt: timestamp("rejected_at"),
    appliedByUserId: integer("applied_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    appliedAt: timestamp("applied_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantAttachmentUnique: uniqueIndex(
      "industrial_attachment_reviews_tenant_attachment_unique",
    ).on(t.tenantId, t.attachmentId),
    requirementStatusIndex: index(
      "industrial_attachment_reviews_requirement_status_idx",
    ).on(t.tenantId, t.requirementId, t.status, t.updatedAt),
  }),
);

export const industrialAttachmentReviewEvents = pgTable(
  "industrial_attachment_review_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    reviewId: uuid("review_id")
      .references(() => industrialAttachmentReviews.id, {
        onDelete: "cascade",
      })
      .notNull(),
    requirementId: uuid("requirement_id")
      .references(() => industrialRequirements.id, { onDelete: "cascade" })
      .notNull(),
    attachmentId: uuid("attachment_id")
      .references(() => industrialRequirementAttachments.id, {
        onDelete: "cascade",
      })
      .notNull(),
    action: text("action").notNull(),
    fromStatus: industrialAttachmentReviewStatusEnum("from_status"),
    toStatus: industrialAttachmentReviewStatusEnum("to_status").notNull(),
    reason: text("reason"),
    snapshot: jsonb("snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    actorUserId: integer("actor_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    reviewTimelineIndex: index(
      "industrial_attachment_review_events_review_timeline_idx",
    ).on(t.reviewId, t.createdAt),
    requirementTimelineIndex: index(
      "industrial_attachment_review_events_requirement_timeline_idx",
    ).on(t.tenantId, t.requirementId, t.createdAt),
  }),
);

// Evidence belonging to a captured part. It is stored outside public media and
// is available only to the factory team and designated Exportunity reviewers.
export const industrialPartRecordDocuments = pgTable(
  "industrial_part_record_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    partRecordId: uuid("part_record_id")
      .references(() => industrialPartRecords.id, { onDelete: "cascade" })
      .notNull(),
    uploadedByUserId: integer("uploaded_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    documentType: text("document_type").notNull(),
    title: text("title").notNull(),
    fileName: text("file_name").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    visibility: industrialVisibilityEnum("visibility")
      .notNull()
      .default("factory_team_only"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    partRecordIndex: index(
      "industrial_part_record_documents_part_record_idx",
    ).on(t.partRecordId, t.createdAt),
    tenantDocumentTypeIndex: index(
      "industrial_part_record_documents_tenant_type_idx",
    ).on(t.tenantId, t.documentType, t.createdAt),
  }),
);

// Factory-wide evidence stays private to the factory team and Exportunity
// reviewers. It is deliberately separate from request-specific attachments.
export const industrialFactoryDocuments = pgTable(
  "industrial_factory_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    factoryId: uuid("factory_id")
      .references(() => industrialFactories.id, { onDelete: "cascade" })
      .notNull(),
    uploadedByUserId: integer("uploaded_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    documentType: text("document_type").notNull(),
    title: text("title").notNull(),
    fileName: text("file_name").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    visibility: industrialVisibilityEnum("visibility")
      .notNull()
      .default("factory_team_only"),
    expiresAt: timestamp("expires_at"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    factoryActiveIndex: index(
      "industrial_factory_documents_factory_active_idx",
    ).on(t.factoryId, t.archivedAt, t.updatedAt),
    tenantTypeIndex: index("industrial_factory_documents_tenant_type_idx").on(
      t.tenantId,
      t.documentType,
      t.archivedAt,
    ),
  }),
);

export const industrialAuditLogs = pgTable(
  "industrial_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    actorUserId: integer("actor_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    reason: text("reason"),
    previousValue: jsonb("previous_value")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    nextValue: jsonb("next_value")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantEntityIndex: index("industrial_audit_logs_tenant_entity_idx").on(
      t.tenantId,
      t.entityType,
      t.entityId,
    ),
    tenantActionIndex: index("industrial_audit_logs_tenant_action_idx").on(
      t.tenantId,
      t.action,
      t.createdAt,
    ),
  }),
);
