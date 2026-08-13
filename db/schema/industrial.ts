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
import { tenants } from "./tenants";
import { contacts } from "./contact";

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
    requesterEmail: text("requester_email").notNull(),
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
    intent: text("intent").notNull(),
    intentConfidence: decimal("intent_confidence", {
      precision: 4,
      scale: 3,
    }),
    suggestedAction: text("suggested_action").notNull().default("ASK"),
    productName: text("product_name"),
    productCategory: text("product_category"),
    specification: text("specification"),
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

// Supplier quotations are strictly internal evidence. Customer-facing prices
// live in industrial_quotes and never inherit cost or margin fields from this
// table through a public serializer.
export const industrialSupplierQuotes = pgTable(
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
    totalAmount: decimal("total_amount", { precision: 16, scale: 2 }),
    lineItems: jsonb("line_items")
      .$type<Array<Record<string, string>>>()
      .notNull()
      .default([]),
    leadTimeText: text("lead_time_text"),
    validUntil: timestamp("valid_until"),
    commercialTerms: text("commercial_terms"),
    customerNotes: text("customer_notes"),
    internalNotes: text("internal_notes"),
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
    totalAmount: decimal("total_amount", { precision: 16, scale: 2 }),
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
    factoryStatus: index("industrial_orders_factory_status_idx").on(
      t.factoryId,
      t.status,
      t.updatedAt,
    ),
    requirementIndex: index("industrial_orders_requirement_idx").on(
      t.requirementId,
      t.status,
    ),
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
    visibility: industrialVisibilityEnum("visibility")
      .notNull()
      .default("factory_team_only"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    requirementIndex: index(
      "industrial_requirement_attachments_requirement_idx",
    ).on(t.requirementId, t.visibility),
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
