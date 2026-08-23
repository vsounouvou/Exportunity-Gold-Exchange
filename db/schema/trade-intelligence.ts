import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
import { industrialRequirements } from "./industrial";
import { tasks } from "./tasks";
import { tenants } from "./tenants";

export const tradeIntelligenceSourceTypeEnum = pgEnum(
  "trade_intelligence_source_type",
  [
    "official_registry",
    "customs_authority",
    "statistics_authority",
    "ministry",
    "standards_body",
    "port_authority",
    "logistics_operator",
    "chamber_of_commerce",
    "development_institution",
    "company_website",
    "industry_directory",
    "news_media",
    "research_publication",
    "manual_evidence",
  ],
);

export const tradeIntelligenceSourceStatusEnum = pgEnum(
  "trade_intelligence_source_status",
  ["active", "paused", "degraded", "blocked", "archived"],
);

export const tradeKnowledgeEntityTypeEnum = pgEnum(
  "trade_knowledge_entity_type",
  [
    "country",
    "sector",
    "product",
    "company",
    "port",
    "trade_corridor",
    "regulation",
    "tariff",
    "certification",
    "logistics_service",
    "trade_opportunity",
    "market_report",
    "news_article",
  ],
);

export const tradeVerificationStatusEnum = pgEnum(
  "trade_verification_status",
  [
    "unverified",
    "evidence_pending",
    "under_review",
    "verified",
    "disputed",
    "stale",
  ],
);

export const tradePublicationStatusEnum = pgEnum(
  "trade_publication_status",
  ["draft", "review", "approved", "published", "withdrawn"],
);

export const tradeDemandEventTypeEnum = pgEnum("trade_demand_event_type", [
  "search",
  "assistant_intent",
  "requirement",
  "zero_result",
  "rfq",
  "quote",
  "order",
]);

export const tradeCoverageStatusEnum = pgEnum("trade_coverage_status", [
  "empty",
  "researching",
  "partial",
  "verified",
  "stale",
]);

export const tradeCoverageDimensionEnum = pgEnum(
  "trade_coverage_dimension",
  [
    "country_profile",
    "sector_profile",
    "market_access",
    "regulations",
    "tariffs",
    "logistics",
    "companies",
    "products",
    "opportunities",
    "news",
  ],
);

export const tradeResearchMissionStatusEnum = pgEnum(
  "trade_research_mission_status",
  [
    "proposed",
    "queued",
    "in_progress",
    "awaiting_review",
    "completed",
    "blocked",
    "cancelled",
  ],
);

export const tradeNewsroomStoryTypeEnum = pgEnum(
  "trade_newsroom_story_type",
  [
    "news_brief",
    "regulatory_update",
    "market_analysis",
    "trade_opportunity",
    "logistics_update",
    "original_report",
  ],
);

export const tradeNewsroomArticleStatusEnum = pgEnum(
  "trade_newsroom_article_status",
  [
    "draft",
    "research_review",
    "editor_review",
    "approved",
    "published",
    "rejected",
    "withdrawn",
  ],
);

export const tradeIntelligenceSources = pgTable(
  "trade_intelligence_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    normalizedKey: text("normalized_key").notNull(),
    name: text("name").notNull(),
    sourceType: tradeIntelligenceSourceTypeEnum("source_type").notNull(),
    status: tradeIntelligenceSourceStatusEnum("status")
      .notNull()
      .default("active"),
    countryCode: text("country_code"),
    domain: text("domain"),
    baseUrl: text("base_url").notNull(),
    languageCodes: jsonb("language_codes")
      .$type<string[]>()
      .notNull()
      .default([]),
    trustScore: decimal("trust_score", { precision: 4, scale: 3 })
      .notNull()
      .default("0.500"),
    accessPolicy: text("access_policy").notNull().default("public"),
    robotsPolicy: text("robots_policy").notNull().default("unknown"),
    crawlCadence: text("crawl_cadence"),
    parserKey: text("parser_key"),
    lastCheckedAt: timestamp("last_checked_at"),
    lastSucceededAt: timestamp("last_succeeded_at"),
    lastFailedAt: timestamp("last_failed_at"),
    nextDueAt: timestamp("next_due_at"),
    lastError: text("last_error"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantKeyUnique: uniqueIndex(
      "trade_intelligence_sources_tenant_key_unique",
    ).on(t.tenantId, t.normalizedKey),
    tenantStatusIndex: index(
      "trade_intelligence_sources_tenant_status_idx",
    ).on(t.tenantId, t.status, t.nextDueAt),
    countryTypeIndex: index(
      "trade_intelligence_sources_country_type_idx",
    ).on(t.tenantId, t.countryCode, t.sourceType),
    trustScoreCheck: check(
      "trade_intelligence_sources_trust_score_check",
      sql`${t.trustScore} >= 0 and ${t.trustScore} <= 1`,
    ),
  }),
);

export const tradeKnowledgeEntities = pgTable(
  "trade_knowledge_entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    entityType: tradeKnowledgeEntityTypeEnum("entity_type").notNull(),
    canonicalKey: text("canonical_key").notNull(),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    alternateNames: jsonb("alternate_names")
      .$type<string[]>()
      .notNull()
      .default([]),
    translations: jsonb("translations")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    countryCode: text("country_code"),
    sectorCode: text("sector_code"),
    summary: text("summary"),
    structuredData: jsonb("structured_data")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    verificationStatus: tradeVerificationStatusEnum("verification_status")
      .notNull()
      .default("unverified"),
    publicationStatus: tradePublicationStatusEnum("publication_status")
      .notNull()
      .default("draft"),
    publicationEligibilityScore: integer("publication_eligibility_score")
      .notNull()
      .default(0),
    primarySourceId: uuid("primary_source_id").references(
      () => tradeIntelligenceSources.id,
      { onDelete: "set null" },
    ),
    lastVerifiedAt: timestamp("last_verified_at"),
    publishedAt: timestamp("published_at"),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantCanonicalUnique: uniqueIndex(
      "trade_knowledge_entities_tenant_canonical_unique",
    ).on(t.tenantId, t.entityType, t.canonicalKey),
    tenantSlugUnique: uniqueIndex(
      "trade_knowledge_entities_tenant_slug_unique",
    ).on(t.tenantId, t.entityType, t.slug),
    publicationIndex: index(
      "trade_knowledge_entities_publication_idx",
    ).on(
      t.tenantId,
      t.publicationStatus,
      t.verificationStatus,
      t.entityType,
    ),
    countrySectorIndex: index(
      "trade_knowledge_entities_country_sector_idx",
    ).on(t.tenantId, t.countryCode, t.sectorCode, t.entityType),
    eligibilityScoreCheck: check(
      "trade_knowledge_entities_eligibility_score_check",
      sql`${t.publicationEligibilityScore} >= 0 and ${t.publicationEligibilityScore} <= 100`,
    ),
  }),
);

export const tradeKnowledgeRelationships = pgTable(
  "trade_knowledge_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    sourceEntityId: uuid("source_entity_id")
      .references(() => tradeKnowledgeEntities.id, { onDelete: "cascade" })
      .notNull(),
    targetEntityId: uuid("target_entity_id")
      .references(() => tradeKnowledgeEntities.id, { onDelete: "cascade" })
      .notNull(),
    relationshipType: text("relationship_type").notNull(),
    summary: text("summary"),
    structuredData: jsonb("structured_data")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    confidence: decimal("confidence", { precision: 4, scale: 3 })
      .notNull()
      .default("0.000"),
    verificationStatus: tradeVerificationStatusEnum("verification_status")
      .notNull()
      .default("evidence_pending"),
    validFrom: timestamp("valid_from"),
    validUntil: timestamp("valid_until"),
    lastVerifiedAt: timestamp("last_verified_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantEdgeUnique: uniqueIndex(
      "trade_knowledge_relationships_tenant_edge_unique",
    ).on(
      t.tenantId,
      t.sourceEntityId,
      t.targetEntityId,
      t.relationshipType,
    ),
    sourceIndex: index("trade_knowledge_relationships_source_idx").on(
      t.tenantId,
      t.sourceEntityId,
      t.relationshipType,
    ),
    targetIndex: index("trade_knowledge_relationships_target_idx").on(
      t.tenantId,
      t.targetEntityId,
      t.relationshipType,
    ),
    confidenceCheck: check(
      "trade_knowledge_relationships_confidence_check",
      sql`${t.confidence} >= 0 and ${t.confidence} <= 1`,
    ),
    distinctEntitiesCheck: check(
      "trade_knowledge_relationships_distinct_entities_check",
      sql`${t.sourceEntityId} <> ${t.targetEntityId}`,
    ),
  }),
);

export const tradeFacts = pgTable(
  "trade_facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    entityId: uuid("entity_id").references(() => tradeKnowledgeEntities.id, {
      onDelete: "cascade",
    }),
    relationshipId: uuid("relationship_id").references(
      () => tradeKnowledgeRelationships.id,
      { onDelete: "cascade" },
    ),
    fieldKey: text("field_key").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    valueText: text("value_text"),
    unit: text("unit"),
    sourceId: uuid("source_id")
      .references(() => tradeIntelligenceSources.id, {
        onDelete: "restrict",
      })
      .notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceDocumentTitle: text("source_document_title"),
    sourcePublishedAt: timestamp("source_published_at"),
    retrievedAt: timestamp("retrieved_at").notNull().defaultNow(),
    effectiveFrom: timestamp("effective_from"),
    effectiveUntil: timestamp("effective_until"),
    contentHash: text("content_hash").notNull(),
    evidenceExcerpt: text("evidence_excerpt"),
    confidence: decimal("confidence", { precision: 4, scale: 3 })
      .notNull()
      .default("0.000"),
    verificationStatus: tradeVerificationStatusEnum("verification_status")
      .notNull()
      .default("evidence_pending"),
    publicationStatus: tradePublicationStatusEnum("publication_status")
      .notNull()
      .default("draft"),
    verifiedByUserId: integer("verified_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    verifiedAt: timestamp("verified_at"),
    publishedAt: timestamp("published_at"),
    lastCheckedAt: timestamp("last_checked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantEvidenceUnique: uniqueIndex(
      "trade_facts_tenant_evidence_unique",
    ).on(t.tenantId, t.sourceId, t.contentHash, t.fieldKey),
    entityFieldIndex: index("trade_facts_entity_field_idx").on(
      t.tenantId,
      t.entityId,
      t.fieldKey,
      t.verificationStatus,
    ),
    relationshipFieldIndex: index("trade_facts_relationship_field_idx").on(
      t.tenantId,
      t.relationshipId,
      t.fieldKey,
      t.verificationStatus,
    ),
    sourceFreshnessIndex: index("trade_facts_source_freshness_idx").on(
      t.tenantId,
      t.sourceId,
      t.retrievedAt,
    ),
    ownerCheck: check(
      "trade_facts_owner_check",
      sql`num_nonnulls(${t.entityId}, ${t.relationshipId}) = 1`,
    ),
    confidenceCheck: check(
      "trade_facts_confidence_check",
      sql`${t.confidence} >= 0 and ${t.confidence} <= 1`,
    ),
  }),
);

export const tradeSourceSnapshots = pgTable(
  "trade_source_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    sourceId: uuid("source_id")
      .references(() => tradeIntelligenceSources.id, { onDelete: "restrict" })
      .notNull(),
    entityId: uuid("entity_id").references(() => tradeKnowledgeEntities.id, {
      onDelete: "set null",
    }),
    documentKey: text("document_key").notNull(),
    snapshotType: text("snapshot_type").notNull().default("other"),
    sourceUrl: text("source_url").notNull(),
    documentTitle: text("document_title").notNull(),
    issuingInstitution: text("issuing_institution"),
    jurisdictionCountryCode: text("jurisdiction_country_code"),
    languageCode: text("language_code"),
    versionLabel: text("version_label"),
    contentText: text("content_text"),
    structuredData: jsonb("structured_data")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    affectedProducts: jsonb("affected_products")
      .$type<string[]>()
      .notNull()
      .default([]),
    affectedIndustries: jsonb("affected_industries")
      .$type<string[]>()
      .notNull()
      .default([]),
    affectedHsCodes: jsonb("affected_hs_codes")
      .$type<string[]>()
      .notNull()
      .default([]),
    affectedCountryCodes: jsonb("affected_country_codes")
      .$type<string[]>()
      .notNull()
      .default([]),
    affectedRoutes: jsonb("affected_routes")
      .$type<string[]>()
      .notNull()
      .default([]),
    contentHash: text("content_hash").notNull(),
    publishedAt: timestamp("published_at"),
    effectiveAt: timestamp("effective_at"),
    retrievedAt: timestamp("retrieved_at").notNull().defaultNow(),
    capturedByUserId: integer("captured_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantContentUnique: uniqueIndex(
      "trade_source_snapshots_tenant_content_unique",
    ).on(t.tenantId, t.sourceId, t.documentKey, t.contentHash),
    sourceHistoryIndex: index("trade_source_snapshots_history_idx").on(
      t.tenantId,
      t.sourceId,
      t.documentKey,
      t.retrievedAt,
    ),
    jurisdictionIndex: index(
      "trade_source_snapshots_jurisdiction_idx",
    ).on(t.tenantId, t.jurisdictionCountryCode, t.snapshotType, t.effectiveAt),
  }),
);

export const tradeSourceComparisons = pgTable(
  "trade_source_comparisons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    sourceId: uuid("source_id")
      .references(() => tradeIntelligenceSources.id, { onDelete: "restrict" })
      .notNull(),
    previousSnapshotId: uuid("previous_snapshot_id")
      .references(() => tradeSourceSnapshots.id, { onDelete: "restrict" })
      .notNull(),
    currentSnapshotId: uuid("current_snapshot_id")
      .references(() => tradeSourceSnapshots.id, { onDelete: "restrict" })
      .notNull(),
    canonicalTaskId: integer("canonical_task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    documentKey: text("document_key").notNull(),
    comparisonHash: text("comparison_hash").notNull(),
    changedFields: jsonb("changed_fields")
      .$type<string[]>()
      .notNull()
      .default([]),
    addedPassages: jsonb("added_passages")
      .$type<string[]>()
      .notNull()
      .default([]),
    removedPassages: jsonb("removed_passages")
      .$type<string[]>()
      .notNull()
      .default([]),
    affectedScopeChanges: jsonb("affected_scope_changes")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    textSimilarity: decimal("text_similarity", { precision: 4, scale: 3 })
      .notNull()
      .default("0.000"),
    materialityScore: integer("materiality_score").notNull().default(0),
    isSubstantive: boolean("is_substantive").notNull().default(false),
    deterministicSummary: text("deterministic_summary").notNull(),
    status: text("status").notNull().default("review_pending"),
    reviewOutcomeNotes: text("review_outcome_notes"),
    reviewedByUserId: integer("reviewed_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    reviewedAt: timestamp("reviewed_at"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantCurrentUnique: uniqueIndex(
      "trade_source_comparisons_tenant_current_unique",
    ).on(t.tenantId, t.currentSnapshotId),
    tenantHashUnique: uniqueIndex(
      "trade_source_comparisons_tenant_hash_unique",
    ).on(t.tenantId, t.sourceId, t.comparisonHash),
    reviewIndex: index("trade_source_comparisons_review_idx").on(
      t.tenantId,
      t.status,
      t.isSubstantive,
      t.createdAt,
    ),
    materialityCheck: check(
      "trade_source_comparisons_materiality_check",
      sql`${t.materialityScore} >= 0 and ${t.materialityScore} <= 100`,
    ),
    similarityCheck: check(
      "trade_source_comparisons_similarity_check",
      sql`${t.textSimilarity} >= 0 and ${t.textSimilarity} <= 1`,
    ),
    distinctSnapshotsCheck: check(
      "trade_source_comparisons_distinct_snapshots_check",
      sql`${t.previousSnapshotId} <> ${t.currentSnapshotId}`,
    ),
    statusCheck: check(
      "trade_source_comparisons_status_check",
      sql`${t.status} in ('review_pending', 'confirmed', 'dismissed')`,
    ),
  }),
);

export const tradeDemandEvents = pgTable(
  "trade_demand_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    eventType: tradeDemandEventTypeEnum("event_type").notNull(),
    sourceSurface: text("source_surface").notNull(),
    anonymousSessionId: text("anonymous_session_id"),
    userId: integer("user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    industrialRequirementId: uuid("industrial_requirement_id").references(
      () => industrialRequirements.id,
      { onDelete: "set null" },
    ),
    sourceConversationId: text("source_conversation_id"),
    queryText: text("query_text"),
    normalizedProduct: text("normalized_product"),
    productCategory: text("product_category"),
    sectorCode: text("sector_code"),
    originCountryCode: text("origin_country_code"),
    destinationCountryCode: text("destination_country_code"),
    destinationCity: text("destination_city"),
    commercialIntent: text("commercial_intent"),
    resultCount: integer("result_count"),
    quantityText: text("quantity_text"),
    estimatedValue: decimal("estimated_value", { precision: 18, scale: 2 }),
    currencyCode: text("currency_code"),
    conversionStage: text("conversion_stage"),
    difficultyScore: integer("difficulty_score").notNull().default(0),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantTimeIndex: index("trade_demand_events_tenant_time_idx").on(
      t.tenantId,
      t.occurredAt,
    ),
    radarIndex: index("trade_demand_events_radar_idx").on(
      t.tenantId,
      t.destinationCountryCode,
      t.sectorCode,
      t.normalizedProduct,
      t.occurredAt,
    ),
    requirementIndex: index("trade_demand_events_requirement_idx").on(
      t.industrialRequirementId,
      t.eventType,
    ),
    difficultyCheck: check(
      "trade_demand_events_difficulty_check",
      sql`${t.difficultyScore} >= 0 and ${t.difficultyScore} <= 100`,
    ),
    resultCountCheck: check(
      "trade_demand_events_result_count_check",
      sql`${t.resultCount} is null or ${t.resultCount} >= 0`,
    ),
  }),
);

export const tradeIndustrySectors = pgTable(
  "trade_industry_sectors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameFr: text("name_fr"),
    description: text("description").notNull(),
    status: text("status").notNull().default("draft"),
    coverageTier: text("coverage_tier")
      .notNull()
      .default("research_backlog"),
    canonicalCategoryCodes: jsonb("canonical_category_codes")
      .$type<string[]>()
      .notNull()
      .default([]),
    rationale: text("rationale").notNull(),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    approvedByUserId: integer("approved_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    approvedAt: timestamp("approved_at"),
    retiredAt: timestamp("retired_at"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantCodeUnique: uniqueIndex(
      "trade_industry_sectors_tenant_code_unique",
    ).on(t.tenantId, t.code),
    tenantStatusIndex: index(
      "trade_industry_sectors_tenant_status_idx",
    ).on(t.tenantId, t.status, t.coverageTier, t.code),
    statusCheck: check(
      "trade_industry_sectors_status_check",
      sql`${t.status} in ('draft', 'review', 'active', 'retired')`,
    ),
    coverageTierCheck: check(
      "trade_industry_sectors_coverage_tier_check",
      sql`${t.coverageTier} in ('priority', 'research_backlog')`,
    ),
  }),
);

export const tradeCoverageCells = pgTable(
  "trade_coverage_cells",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    countryCode: text("country_code").notNull(),
    dimension: tradeCoverageDimensionEnum("dimension").notNull(),
    sectorCode: text("sector_code").notNull().default("__all__"),
    status: tradeCoverageStatusEnum("status").notNull().default("empty"),
    coveragePercent: integer("coverage_percent").notNull().default(0),
    qualityScore: integer("quality_score").notNull().default(0),
    entityCount: integer("entity_count").notNull().default(0),
    factCount: integer("fact_count").notNull().default(0),
    verifiedFactCount: integer("verified_fact_count").notNull().default(0),
    sourceCount: integer("source_count").notNull().default(0),
    missingFields: jsonb("missing_fields")
      .$type<string[]>()
      .notNull()
      .default([]),
    lastVerifiedAt: timestamp("last_verified_at"),
    nextReviewAt: timestamp("next_review_at"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantCellUnique: uniqueIndex("trade_coverage_cells_tenant_cell_unique").on(
      t.tenantId,
      t.countryCode,
      t.dimension,
      t.sectorCode,
    ),
    statusIndex: index("trade_coverage_cells_status_idx").on(
      t.tenantId,
      t.status,
      t.countryCode,
      t.dimension,
    ),
    reviewIndex: index("trade_coverage_cells_review_idx").on(
      t.tenantId,
      t.nextReviewAt,
      t.status,
    ),
    coverageCheck: check(
      "trade_coverage_cells_coverage_check",
      sql`${t.coveragePercent} >= 0 and ${t.coveragePercent} <= 100`,
    ),
    qualityCheck: check(
      "trade_coverage_cells_quality_check",
      sql`${t.qualityScore} >= 0 and ${t.qualityScore} <= 100`,
    ),
  }),
);

export const tradeResearchMissions = pgTable(
  "trade_research_missions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    canonicalTaskId: integer("canonical_task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    triggeredByDemandEventId: uuid("triggered_by_demand_event_id").references(
      () => tradeDemandEvents.id,
      { onDelete: "set null" },
    ),
    coverageCellId: uuid("coverage_cell_id").references(
      () => tradeCoverageCells.id,
      { onDelete: "set null" },
    ),
    missionType: text("mission_type").notNull(),
    title: text("title").notNull(),
    objective: text("objective").notNull(),
    countryCode: text("country_code"),
    sectorCode: text("sector_code"),
    priority: text("priority").notNull().default("medium"),
    status: tradeResearchMissionStatusEnum("status")
      .notNull()
      .default("proposed"),
    approvalStatus: text("approval_status").notNull().default("pending"),
    assignedAgentId: integer("assigned_agent_id"),
    evidenceRequirements: jsonb("evidence_requirements")
      .$type<string[]>()
      .notNull()
      .default([]),
    evidenceCount: integer("evidence_count").notNull().default(0),
    confidence: decimal("confidence", { precision: 4, scale: 3 }),
    resultSummary: text("result_summary"),
    recommendedActions: jsonb("recommended_actions")
      .$type<string[]>()
      .notNull()
      .default([]),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    canonicalTaskUnique: uniqueIndex(
      "trade_research_missions_canonical_task_unique",
    ).on(t.canonicalTaskId),
    queueIndex: index("trade_research_missions_queue_idx").on(
      t.tenantId,
      t.status,
      t.priority,
      t.createdAt,
    ),
    scopeIndex: index("trade_research_missions_scope_idx").on(
      t.tenantId,
      t.countryCode,
      t.sectorCode,
      t.status,
    ),
    demandIndex: index("trade_research_missions_demand_idx").on(
      t.triggeredByDemandEventId,
      t.status,
    ),
    confidenceCheck: check(
      "trade_research_missions_confidence_check",
      sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
    ),
  }),
);

export const tradeResearchMissionEvidence = pgTable(
  "trade_research_mission_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    missionId: uuid("mission_id")
      .references(() => tradeResearchMissions.id, { onDelete: "cascade" })
      .notNull(),
    factId: uuid("fact_id").references(() => tradeFacts.id, {
      onDelete: "set null",
    }),
    sourceId: uuid("source_id")
      .references(() => tradeIntelligenceSources.id, { onDelete: "restrict" })
      .notNull(),
    evidenceType: text("evidence_type").notNull(),
    title: text("title").notNull(),
    sourceUrl: text("source_url").notNull(),
    contentHash: text("content_hash").notNull(),
    evidenceExcerpt: text("evidence_excerpt"),
    notes: text("notes"),
    verificationStatus: tradeVerificationStatusEnum("verification_status")
      .notNull()
      .default("evidence_pending"),
    verifiedByUserId: integer("verified_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    verifiedAt: timestamp("verified_at"),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantEvidenceUnique: uniqueIndex(
      "trade_research_mission_evidence_tenant_unique",
    ).on(t.tenantId, t.missionId, t.contentHash),
    missionStatusIndex: index(
      "trade_research_mission_evidence_mission_status_idx",
    ).on(t.tenantId, t.missionId, t.verificationStatus),
    sourceIndex: index("trade_research_mission_evidence_source_idx").on(
      t.tenantId,
      t.sourceId,
      t.createdAt,
    ),
  }),
);

export const tradeNewsroomArticles = pgTable(
  "trade_newsroom_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    knowledgeEntityId: uuid("knowledge_entity_id").references(
      () => tradeKnowledgeEntities.id,
      { onDelete: "set null" },
    ),
    researchMissionId: uuid("research_mission_id").references(
      () => tradeResearchMissions.id,
      { onDelete: "set null" },
    ),
    storyType: tradeNewsroomStoryTypeEnum("story_type").notNull(),
    status: tradeNewsroomArticleStatusEnum("status")
      .notNull()
      .default("draft"),
    slug: text("slug").notNull(),
    primaryLanguage: text("primary_language").notNull().default("en"),
    title: text("title").notNull(),
    dek: text("dek"),
    bodyMarkdown: text("body_markdown").notNull(),
    originalAnalysis: text("original_analysis"),
    translations: jsonb("translations")
      .$type<
        Record<
          string,
          {
            title?: string;
            dek?: string;
            bodyMarkdown?: string;
            reviewStatus?: string;
          }
        >
      >()
      .notNull()
      .default({}),
    countryCode: text("country_code"),
    sectorCode: text("sector_code"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    linkedEntityIds: jsonb("linked_entity_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    commercialCta: jsonb("commercial_cta")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    draftOrigin: text("draft_origin").notNull().default("human"),
    generationMetadata: jsonb("generation_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    citationCount: integer("citation_count").notNull().default(0),
    verifiedCitationCount: integer("verified_citation_count")
      .notNull()
      .default(0),
    distinctSourceCount: integer("distinct_source_count").notNull().default(0),
    currentVersion: integer("current_version").notNull().default(1),
    authoredByUserId: integer("authored_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    editedByUserId: integer("edited_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    approvedByUserId: integer("approved_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    publishedByUserId: integer("published_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    approvedAt: timestamp("approved_at"),
    publishedAt: timestamp("published_at"),
    withdrawnAt: timestamp("withdrawn_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantSlugUnique: uniqueIndex("trade_newsroom_articles_tenant_slug_unique").on(
      t.tenantId,
      t.slug,
    ),
    tenantStatusIndex: index("trade_newsroom_articles_tenant_status_idx").on(
      t.tenantId,
      t.status,
      t.updatedAt,
    ),
    publicScopeIndex: index("trade_newsroom_articles_public_scope_idx").on(
      t.tenantId,
      t.status,
      t.countryCode,
      t.sectorCode,
      t.publishedAt,
    ),
    missionIndex: index("trade_newsroom_articles_mission_idx").on(
      t.researchMissionId,
      t.status,
    ),
    citationCountsCheck: check(
      "trade_newsroom_articles_citation_counts_check",
      sql`${t.citationCount} >= 0 and ${t.verifiedCitationCount} >= 0 and ${t.distinctSourceCount} >= 0 and ${t.verifiedCitationCount} <= ${t.citationCount}`,
    ),
    currentVersionCheck: check(
      "trade_newsroom_articles_current_version_check",
      sql`${t.currentVersion} > 0`,
    ),
    languageCheck: check(
      "trade_newsroom_articles_language_check",
      sql`${t.primaryLanguage} ~ '^[a-z]{2}(-[A-Z]{2})?$'`,
    ),
    draftOriginCheck: check(
      "trade_newsroom_articles_draft_origin_check",
      sql`${t.draftOrigin} in ('human', 'ai_assisted', 'imported')`,
    ),
  }),
);

export const tradeNewsroomCitations = pgTable(
  "trade_newsroom_citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    articleId: uuid("article_id")
      .references(() => tradeNewsroomArticles.id, { onDelete: "cascade" })
      .notNull(),
    sourceId: uuid("source_id")
      .references(() => tradeIntelligenceSources.id, { onDelete: "restrict" })
      .notNull(),
    factId: uuid("fact_id").references(() => tradeFacts.id, {
      onDelete: "set null",
    }),
    snapshotId: uuid("snapshot_id").references(() => tradeSourceSnapshots.id, {
      onDelete: "set null",
    }),
    sequence: integer("sequence").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceTitle: text("source_title").notNull(),
    citedClaim: text("cited_claim").notNull(),
    evidenceExcerpt: text("evidence_excerpt"),
    sourcePublishedAt: timestamp("source_published_at"),
    retrievedAt: timestamp("retrieved_at").notNull().defaultNow(),
    contentHash: text("content_hash").notNull(),
    verificationStatus: tradeVerificationStatusEnum("verification_status")
      .notNull()
      .default("under_review"),
    reviewNotes: text("review_notes"),
    reviewedByUserId: integer("reviewed_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    reviewedAt: timestamp("reviewed_at"),
    createdByUserId: integer("created_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantHashUnique: uniqueIndex("trade_newsroom_citations_tenant_hash_unique").on(
      t.tenantId,
      t.articleId,
      t.contentHash,
    ),
    articleSequenceUnique: uniqueIndex(
      "trade_newsroom_citations_article_sequence_unique",
    ).on(t.articleId, t.sequence),
    articleReviewIndex: index("trade_newsroom_citations_article_review_idx").on(
      t.tenantId,
      t.articleId,
      t.verificationStatus,
    ),
    sourceIndex: index("trade_newsroom_citations_source_idx").on(
      t.tenantId,
      t.sourceId,
      t.createdAt,
    ),
    sequenceCheck: check(
      "trade_newsroom_citations_sequence_check",
      sql`${t.sequence} > 0`,
    ),
  }),
);

export const tradeNewsroomRevisions = pgTable(
  "trade_newsroom_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    articleId: uuid("article_id")
      .references(() => tradeNewsroomArticles.id, { onDelete: "cascade" })
      .notNull(),
    version: integer("version").notNull(),
    status: tradeNewsroomArticleStatusEnum("status").notNull(),
    title: text("title").notNull(),
    dek: text("dek"),
    bodyMarkdown: text("body_markdown").notNull(),
    originalAnalysis: text("original_analysis"),
    translations: jsonb("translations")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    changeNote: text("change_note").notNull(),
    actorUserId: integer("actor_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    articleVersionUnique: uniqueIndex(
      "trade_newsroom_revisions_article_version_unique",
    ).on(t.articleId, t.version),
    tenantCreatedIndex: index("trade_newsroom_revisions_tenant_created_idx").on(
      t.tenantId,
      t.createdAt,
    ),
    versionCheck: check(
      "trade_newsroom_revisions_version_check",
      sql`${t.version} > 0`,
    ),
  }),
);

export const tradeNewsroomReviewEvents = pgTable(
  "trade_newsroom_review_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    articleId: uuid("article_id")
      .references(() => tradeNewsroomArticles.id, { onDelete: "cascade" })
      .notNull(),
    fromStatus: tradeNewsroomArticleStatusEnum("from_status").notNull(),
    toStatus: tradeNewsroomArticleStatusEnum("to_status").notNull(),
    action: text("action").notNull(),
    reason: text("reason").notNull(),
    checklist: jsonb("checklist")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    actorUserId: integer("actor_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    articleTimelineIndex: index("trade_newsroom_review_events_article_idx").on(
      t.tenantId,
      t.articleId,
      t.createdAt,
    ),
  }),
);

export const tradeRegulatoryChanges = pgTable(
  "trade_regulatory_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    sourceId: uuid("source_id")
      .references(() => tradeIntelligenceSources.id, {
        onDelete: "restrict",
      })
      .notNull(),
    entityId: uuid("entity_id").references(() => tradeKnowledgeEntities.id, {
      onDelete: "set null",
    }),
    canonicalTaskId: integer("canonical_task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    comparisonId: uuid("comparison_id").references(
      () => tradeSourceComparisons.id,
      { onDelete: "set null" },
    ),
    previousSnapshotId: uuid("previous_snapshot_id").references(
      () => tradeSourceSnapshots.id,
      { onDelete: "set null" },
    ),
    currentSnapshotId: uuid("current_snapshot_id").references(
      () => tradeSourceSnapshots.id,
      { onDelete: "set null" },
    ),
    jurisdictionCountryCode: text("jurisdiction_country_code").notNull(),
    changeType: text("change_type").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    issuingInstitution: text("issuing_institution"),
    sourceUrl: text("source_url").notNull(),
    contentHash: text("content_hash").notNull(),
    previousValue: jsonb("previous_value").$type<unknown>(),
    currentValue: jsonb("current_value").$type<unknown>(),
    affectedProducts: jsonb("affected_products")
      .$type<string[]>()
      .notNull()
      .default([]),
    affectedIndustries: jsonb("affected_industries")
      .$type<string[]>()
      .notNull()
      .default([]),
    affectedHsCodes: jsonb("affected_hs_codes")
      .$type<string[]>()
      .notNull()
      .default([]),
    affectedCountryCodes: jsonb("affected_country_codes")
      .$type<string[]>()
      .notNull()
      .default([]),
    affectedRoutes: jsonb("affected_routes")
      .$type<string[]>()
      .notNull()
      .default([]),
    consequences: text("consequences"),
    recommendedActions: jsonb("recommended_actions")
      .$type<string[]>()
      .notNull()
      .default([]),
    confidence: decimal("confidence", { precision: 4, scale: 3 })
      .notNull()
      .default("0.000"),
    severity: text("severity").notNull().default("informational"),
    verificationStatus: tradeVerificationStatusEnum("verification_status")
      .notNull()
      .default("evidence_pending"),
    publicationStatus: tradePublicationStatusEnum("publication_status")
      .notNull()
      .default("draft"),
    sourcePublishedAt: timestamp("source_published_at"),
    effectiveAt: timestamp("effective_at"),
    detectedAt: timestamp("detected_at").notNull().defaultNow(),
    reviewedByUserId: integer("reviewed_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantHashUnique: uniqueIndex(
      "trade_regulatory_changes_tenant_hash_unique",
    ).on(t.tenantId, t.sourceId, t.contentHash),
    reviewIndex: index("trade_regulatory_changes_review_idx").on(
      t.tenantId,
      t.verificationStatus,
      t.detectedAt,
    ),
    jurisdictionIndex: index(
      "trade_regulatory_changes_jurisdiction_idx",
    ).on(t.tenantId, t.jurisdictionCountryCode, t.effectiveAt),
    comparisonIndex: index("trade_regulatory_changes_comparison_idx").on(
      t.tenantId,
      t.comparisonId,
    ),
    confidenceCheck: check(
      "trade_regulatory_changes_confidence_check",
      sql`${t.confidence} >= 0 and ${t.confidence} <= 1`,
    ),
  }),
);

export const tradeIntelligenceAlerts = pgTable(
  "trade_intelligence_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    comparisonId: uuid("comparison_id")
      .references(() => tradeSourceComparisons.id, { onDelete: "cascade" })
      .notNull(),
    regulatoryChangeId: uuid("regulatory_change_id").references(
      () => tradeRegulatoryChanges.id,
      { onDelete: "set null" },
    ),
    entityId: uuid("entity_id").references(() => tradeKnowledgeEntities.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    consequences: text("consequences"),
    severity: text("severity").notNull().default("informational"),
    verificationStatus: tradeVerificationStatusEnum("verification_status")
      .notNull()
      .default("evidence_pending"),
    publicationStatus: tradePublicationStatusEnum("publication_status")
      .notNull()
      .default("draft"),
    deliveryStatus: text("delivery_status").notNull().default("withheld"),
    affectedProducts: jsonb("affected_products")
      .$type<string[]>()
      .notNull()
      .default([]),
    affectedIndustries: jsonb("affected_industries")
      .$type<string[]>()
      .notNull()
      .default([]),
    affectedHsCodes: jsonb("affected_hs_codes")
      .$type<string[]>()
      .notNull()
      .default([]),
    affectedCountryCodes: jsonb("affected_country_codes")
      .$type<string[]>()
      .notNull()
      .default([]),
    affectedRoutes: jsonb("affected_routes")
      .$type<string[]>()
      .notNull()
      .default([]),
    recommendedActions: jsonb("recommended_actions")
      .$type<string[]>()
      .notNull()
      .default([]),
    sourceUrl: text("source_url").notNull(),
    sourcePublishedAt: timestamp("source_published_at"),
    effectiveAt: timestamp("effective_at"),
    approvedByUserId: integer("approved_by_user_id").references(
      () => eceUsers.id,
      { onDelete: "set null" },
    ),
    approvedAt: timestamp("approved_at"),
    releasedAt: timestamp("released_at"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantComparisonUnique: uniqueIndex(
      "trade_intelligence_alerts_tenant_comparison_unique",
    ).on(t.tenantId, t.comparisonId),
    reviewIndex: index("trade_intelligence_alerts_review_idx").on(
      t.tenantId,
      t.verificationStatus,
      t.publicationStatus,
      t.createdAt,
    ),
    deliveryIndex: index("trade_intelligence_alerts_delivery_idx").on(
      t.tenantId,
      t.deliveryStatus,
      t.severity,
      t.effectiveAt,
    ),
    deliveryCheck: check(
      "trade_intelligence_alerts_delivery_check",
      sql`${t.deliveryStatus} in ('withheld', 'ready_for_approval', 'sent', 'cancelled')`,
    ),
  }),
);

export const tradeIntelligenceAlertImpacts = pgTable(
  "trade_intelligence_alert_impacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    alertId: uuid("alert_id")
      .references(() => tradeIntelligenceAlerts.id, { onDelete: "cascade" })
      .notNull(),
    industrialRequirementId: uuid("industrial_requirement_id")
      .references(() => industrialRequirements.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    recipientRole: text("recipient_role").notNull(),
    matchKey: text("match_key").notNull(),
    matchScore: integer("match_score").notNull().default(0),
    matchReasons: jsonb("match_reasons")
      .$type<string[]>()
      .notNull()
      .default([]),
    status: text("status").notNull().default("identified"),
    notifiedAt: timestamp("notified_at"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tenantMatchUnique: uniqueIndex(
      "trade_intelligence_alert_impacts_tenant_match_unique",
    ).on(t.tenantId, t.alertId, t.matchKey),
    alertStatusIndex: index(
      "trade_intelligence_alert_impacts_alert_status_idx",
    ).on(t.tenantId, t.alertId, t.status, t.matchScore),
    userStatusIndex: index(
      "trade_intelligence_alert_impacts_user_status_idx",
    ).on(t.tenantId, t.userId, t.status, t.createdAt),
    matchScoreCheck: check(
      "trade_intelligence_alert_impacts_match_score_check",
      sql`${t.matchScore} >= 0 and ${t.matchScore} <= 100`,
    ),
  }),
);
