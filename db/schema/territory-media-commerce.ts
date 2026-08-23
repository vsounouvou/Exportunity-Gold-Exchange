import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { marketingMediaItems } from "./marketing-cms";
import { agentTasks } from "./agent-tasks";
import {
  communicationsMessages,
  communicationsThreads,
  communicationsWorkOrders,
} from "./communications";
import { contacts } from "./contact";
import { exportunityIntegrationConnections } from "./exportunity-integrations";
import { mindbaseIntegrationConnections } from "./mindbase";
import { tenants } from "./tenants";
import { geoTerritories } from "./territories";

export type TerritoryCoverageDimensions = Record<
  | "producer"
  | "buyer"
  | "creator"
  | "carrier"
  | "payment"
  | "language"
  | "content",
  {
    status: "unknown" | "gap" | "candidate" | "verified" | "working";
    count?: number;
    evidenceRefs?: string[];
    note?: string;
  }
>;

/**
 * Operational metadata extends geo_territories without replacing or copying the
 * canonical geography. One profile is allowed per tenant-scoped territory.
 */
export const territoryOperationalProfiles = pgTable(
  "territory_operational_profiles",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    territoryId: integer("territory_id")
      .references(() => geoTerritories.id, { onDelete: "cascade" })
      .notNull(),
    operatingMode: text("operating_mode").notNull().default("research_only"),
    operationalStatus: text("operational_status").notNull().default("draft"),
    primaryLanguage: text("primary_language"),
    secondaryLanguages: jsonb("secondary_languages").$type<string[]>().notNull().default([]),
    prioritySectors: jsonb("priority_sectors").$type<string[]>().notNull().default([]),
    geographyEvidence: jsonb("geography_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    operatingRules: jsonb("operating_rules")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    dataGaps: jsonb("data_gaps").$type<string[]>().notNull().default([]),
    readinessStatus: text("readiness_status").notNull().default("unknown"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id"),
    updatedByUserId: integer("updated_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantTerritoryUnique: uniqueIndex("territory_operational_profiles_tenant_territory_uniq").on(
      t.tenantId,
      t.territoryId,
    ),
    byTenantStatus: index("territory_operational_profiles_tenant_status_idx").on(
      t.tenantId,
      t.operationalStatus,
      t.updatedAt,
    ),
  }),
);

export const territoryActivations = pgTable(
  "territory_activations",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    territoryId: integer("territory_id")
      .references(() => geoTerritories.id, { onDelete: "cascade" })
      .notNull(),
    profileId: integer("profile_id")
      .references(() => territoryOperationalProfiles.id, { onDelete: "cascade" })
      .notNull(),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("approval_required"),
    operatingMode: text("operating_mode").notNull().default("research_only"),
    idempotencyKey: text("idempotency_key").notNull(),
    preparationActionRunId: integer("preparation_action_run_id"),
    activationActionRunId: integer("activation_action_run_id"),
    readinessSnapshot: jsonb("readiness_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    activationScope: jsonb("activation_scope")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    blockers: jsonb("blockers").$type<string[]>().notNull().default([]),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    requestedByUserId: integer("requested_by_user_id"),
    approvedByUserId: integer("approved_by_user_id"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdempotencyUnique: uniqueIndex("territory_activations_tenant_idempotency_uniq").on(
      t.tenantId,
      t.idempotencyKey,
    ),
    byTerritoryStatus: index("territory_activations_territory_status_idx").on(
      t.tenantId,
      t.territoryId,
      t.status,
      t.updatedAt,
    ),
  }),
);

export const territoryAgentTeams = pgTable(
  "territory_agent_teams",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    territoryId: integer("territory_id")
      .references(() => geoTerritories.id, { onDelete: "cascade" })
      .notNull(),
    activationId: integer("activation_id")
      .references(() => territoryActivations.id, { onDelete: "cascade" })
      .notNull(),
    departmentKey: text("department_key").notNull(),
    roleKey: text("role_key").notNull(),
    agentId: integer("agent_id"),
    autonomyLevel: text("autonomy_level").notNull().default("approval_required"),
    responsibility: text("responsibility").notNull(),
    budgetUsdCap: text("budget_usd_cap").notNull().default("0.00"),
    status: text("status").notNull().default("planned"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    activationRoleUnique: uniqueIndex("territory_agent_teams_activation_role_uniq").on(
      t.activationId,
      t.roleKey,
    ),
    byTerritory: index("territory_agent_teams_territory_idx").on(t.tenantId, t.territoryId, t.status),
  }),
);

export const territoryCoverageSnapshots = pgTable(
  "territory_coverage_snapshots",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    territoryId: integer("territory_id")
      .references(() => geoTerritories.id, { onDelete: "cascade" })
      .notNull(),
    activationId: integer("activation_id").references(() => territoryActivations.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("gaps_identified"),
    dimensions: jsonb("dimensions")
      .$type<Partial<TerritoryCoverageDimensions>>()
      .notNull()
      .default({}),
    gaps: jsonb("gaps").$type<string[]>().notNull().default([]),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    capturedByUserId: integer("captured_by_user_id"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTerritoryCaptured: index("territory_coverage_snapshots_territory_captured_idx").on(
      t.tenantId,
      t.territoryId,
      t.capturedAt,
    ),
  }),
);

/**
 * marketing_media_items remains the canonical CMS/media record. This table is
 * its provenance extension and deliberately stores references rather than a
 * copied creator asset.
 */
export const sourceContentReferences = pgTable(
  "source_content_references",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    mediaItemId: text("media_item_id")
      .references(() => marketingMediaItems.id, { onDelete: "cascade" })
      .notNull(),
    territoryId: integer("territory_id").references(() => geoTerritories.id, {
      onDelete: "set null",
    }),
    sourcePlatform: text("source_platform"),
    sourceContentId: text("source_content_id"),
    sourceUrl: text("source_url").notNull(),
    canonicalSourceUrl: text("canonical_source_url"),
    sourceCreatorName: text("source_creator_name"),
    sourceCreatorUrl: text("source_creator_url"),
    sourcePublishedAt: timestamp("source_published_at", { withTimezone: true }),
    discoveredByAgentId: integer("discovered_by_agent_id"),
    discoveryEvidence: jsonb("discovery_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    reuseStatus: text("reuse_status").notNull().default("reference_only"),
    takedownState: text("takedown_state").notNull().default("clear"),
    createdByUserId: integer("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantMediaUnique: uniqueIndex("source_content_references_tenant_media_uniq").on(
      t.tenantId,
      t.mediaItemId,
    ),
    sourceLookup: index("source_content_references_source_lookup_idx").on(
      t.tenantId,
      t.sourcePlatform,
      t.sourceContentId,
    ),
  }),
);

export const mediaRightsGrants = pgTable(
  "media_rights_grants",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    sourceReferenceId: integer("source_reference_id")
      .references(() => sourceContentReferences.id, { onDelete: "cascade" })
      .notNull(),
    creatorProfileId: text("creator_profile_id"),
    rightsHolderName: text("rights_holder_name").notNull(),
    rightsBasis: text("rights_basis").notNull(),
    status: text("status").notNull().default("pending"),
    usageTypes: jsonb("usage_types").$type<string[]>().notNull().default([]),
    channels: jsonb("channels").$type<string[]>().notNull().default([]),
    territoryIds: jsonb("territory_ids").$type<number[]>().notNull().default([]),
    allTerritories: boolean("all_territories").notNull().default(false),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    producerConsentStatus: text("producer_consent_status").notNull().default("unknown"),
    subjectReleaseStatus: text("subject_release_status").notNull().default("unknown"),
    musicLicenseStatus: text("music_license_status").notNull().default("unknown"),
    attributionText: text("attribution_text"),
    attributionRules: jsonb("attribution_rules")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    grantedByUserId: integer("granted_by_user_id"),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    revokedByUserId: integer("revoked_by_user_id"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySourceStatus: index("media_rights_grants_source_status_idx").on(
      t.tenantId,
      t.sourceReferenceId,
      t.status,
      t.updatedAt,
    ),
  }),
);

export const mediaRightsEvents = pgTable(
  "media_rights_events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    sourceReferenceId: integer("source_reference_id")
      .references(() => sourceContentReferences.id, { onDelete: "cascade" })
      .notNull(),
    grantId: integer("grant_id").references(() => mediaRightsGrants.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    actorUserId: integer("actor_user_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySourceCreated: index("media_rights_events_source_created_idx").on(
      t.tenantId,
      t.sourceReferenceId,
      t.createdAt,
    ),
  }),
);

/**
 * A non-secret publication destination. New Exportunity operations bind only
 * to exportunity_integration_connections. The legacy reference is retained as
 * nullable migration evidence and is never an operational credential fallback.
 */
export const socialPublicationTargets = pgTable(
  "social_publication_targets",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    territoryId: integer("territory_id").references(() => geoTerritories.id, {
      onDelete: "set null",
    }),
    integrationConnectionId: uuid("integration_connection_id").references(
      () => mindbaseIntegrationConnections.id,
      { onDelete: "set null" },
    ),
    exportunityIntegrationConnectionId: uuid(
      "exportunity_integration_connection_id",
    ).references(() => exportunityIntegrationConnections.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    platform: text("platform").notNull(),
    channel: text("channel").notNull(),
    externalAccountId: text("external_account_id"),
    externalAccountLabel: text("external_account_label"),
    authorizationStatus: text("authorization_status").notNull().default("unknown"),
    healthStatus: text("health_status").notNull().default("unknown"),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    verificationEvidence: jsonb("verification_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id"),
    updatedByUserId: integer("updated_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantPlatform: index("social_publication_targets_tenant_platform_idx").on(
      t.tenantId,
      t.platform,
      t.healthStatus,
    ),
    byConnection: index("social_publication_targets_connection_idx").on(
      t.integrationConnectionId,
    ),
    byExportunityConnection: index(
      "social_publication_targets_exportunity_connection_idx",
    ).on(t.exportunityIntegrationConnectionId),
    byTenantPlatformAccount: uniqueIndex(
      "social_publication_targets_tenant_platform_account_unique",
    ).on(t.tenantId, t.platform, t.externalAccountId),
  }),
);

/**
 * Every provider or manual handoff attempt has an accurate state. In
 * particular, preparing a manual package is MANUAL_REQUIRED and can never be
 * represented as a confirmed provider publication.
 */
export const socialPublicationAttempts = pgTable(
  "social_publication_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    mediaItemId: text("media_item_id")
      .references(() => marketingMediaItems.id, { onDelete: "cascade" })
      .notNull(),
    sourceReferenceId: integer("source_reference_id")
      .references(() => sourceContentReferences.id, { onDelete: "restrict" })
      .notNull(),
    rightsGrantId: integer("rights_grant_id")
      .references(() => mediaRightsGrants.id, { onDelete: "restrict" })
      .notNull(),
    territoryId: integer("territory_id").references(() => geoTerritories.id, {
      onDelete: "set null",
    }),
    targetId: integer("target_id").references(() => socialPublicationTargets.id, {
      onDelete: "set null",
    }),
    integrationConnectionId: uuid("integration_connection_id").references(
      () => mindbaseIntegrationConnections.id,
      { onDelete: "set null" },
    ),
    exportunityIntegrationConnectionId: uuid(
      "exportunity_integration_connection_id",
    ).references(() => exportunityIntegrationConnections.id, {
      onDelete: "set null",
    }),
    actionRunId: integer("action_run_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    provider: text("provider").notNull(),
    platform: text("platform").notNull(),
    channel: text("channel").notNull(),
    mode: text("mode").notNull().default("manual_package"),
    status: text("status").notNull().default("DRAFT"),
    manualPackage: jsonb("manual_package")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    providerState: jsonb("provider_state")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    requestedByUserId: integer("requested_by_user_id"),
    approvedByUserId: integer("approved_by_user_id"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    providerConfirmedAt: timestamp("provider_confirmed_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdempotencyUnique: uniqueIndex("social_publication_attempts_tenant_idempotency_uniq").on(
      t.tenantId,
      t.idempotencyKey,
    ),
    byMediaCreated: index("social_publication_attempts_media_created_idx").on(
      t.tenantId,
      t.mediaItemId,
      t.createdAt,
    ),
    byStatus: index("social_publication_attempts_status_idx").on(
      t.tenantId,
      t.platform,
      t.status,
      t.updatedAt,
    ),
    byExportunityConnection: index(
      "social_publication_attempts_exportunity_connection_idx",
    ).on(t.exportunityIntegrationConnectionId),
  }),
);

export const socialPublicationEvents = pgTable(
  "social_publication_events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    attemptId: uuid("attempt_id")
      .references(() => socialPublicationAttempts.id, { onDelete: "cascade" })
      .notNull(),
    eventType: text("event_type").notNull(),
    status: text("status").notNull(),
    actorUserId: integer("actor_user_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byAttemptCreated: index("social_publication_events_attempt_created_idx").on(
      t.tenantId,
      t.attemptId,
      t.createdAt,
    ),
  }),
);

/**
 * Verified provider comments and direct messages are projected into the
 * canonical communications inbox. This record binds the provider event to the
 * inbox message, CRM lead (when eligible), paused agent task, and verification
 * evidence without storing access tokens or raw webhook headers.
 */
export const socialInboxEvents = pgTable(
  "social_inbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    targetId: integer("target_id").references(() => socialPublicationTargets.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    platform: text("platform").notNull(),
    channel: text("channel").notNull(),
    eventType: text("event_type").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    externalAccountId: text("external_account_id").notNull(),
    externalActorId: text("external_actor_id").notNull(),
    externalActorLabel: text("external_actor_label"),
    externalThreadId: text("external_thread_id"),
    parentContentId: text("parent_content_id"),
    parentContentUrl: text("parent_content_url"),
    threadId: integer("thread_id")
      .references(() => communicationsThreads.id, { onDelete: "restrict" })
      .notNull(),
    messageId: integer("message_id")
      .references(() => communicationsMessages.id, { onDelete: "restrict" })
      .notNull(),
    workOrderId: integer("work_order_id")
      .references(() => communicationsWorkOrders.id, { onDelete: "restrict" })
      .notNull(),
    contactId: integer("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    agentTaskId: integer("agent_task_id").references(() => agentTasks.id, {
      onDelete: "set null",
    }),
    classification: text("classification").notNull(),
    classificationConfidenceBps: integer("classification_confidence_bps").notNull(),
    classificationEvidence: jsonb("classification_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    moderationStatus: text("moderation_status").notNull().default("normal"),
    leadStatus: text("lead_status").notNull().default("not_applicable"),
    replyPolicyStatus: text("reply_policy_status").notNull().default("fact_pack_required"),
    verificationEvidence: jsonb("verification_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantProviderEventUnique: uniqueIndex("social_inbox_events_tenant_provider_event_uniq").on(
      t.tenantId,
      t.provider,
      t.providerEventId,
    ),
    byTenantReceived: index("social_inbox_events_tenant_received_idx").on(
      t.tenantId,
      t.receivedAt,
    ),
    byThread: index("social_inbox_events_thread_idx").on(t.threadId, t.receivedAt),
    byClassification: index("social_inbox_events_classification_idx").on(
      t.tenantId,
      t.classification,
      t.receivedAt,
    ),
  }),
);

export const socialInboxEventAudit = pgTable(
  "social_inbox_event_audit",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    socialInboxEventId: uuid("social_inbox_event_id")
      .references(() => socialInboxEvents.id, { onDelete: "cascade" })
      .notNull(),
    eventType: text("event_type").notNull(),
    actorUserId: integer("actor_user_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byEventCreated: index("social_inbox_event_audit_event_created_idx").on(
      t.tenantId,
      t.socialInboxEventId,
      t.createdAt,
    ),
  }),
);

/**
 * Durable, credential-free receipts for signed Meta Page/Instagram webhook
 * events. A receipt may exist without a tenant while the business target is
 * unknown or ambiguous; only an eligible verified target can project it into
 * social_inbox_events.
 */
export const metaSocialWebhookReceipts = pgTable(
  "meta_social_webhook_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptKey: text("receipt_key").notNull(),
    payloadChecksum: text("payload_checksum").notNull(),
    objectType: text("object_type").notNull(),
    platform: text("platform"),
    externalAccountId: text("external_account_id"),
    providerEventId: text("provider_event_id"),
    eventKind: text("event_kind").notNull(),
    parseStatus: text("parse_status").notNull(),
    resolutionStatus: text("resolution_status").notNull().default("received"),
    reasonCode: text("reason_code"),
    tenantId: integer("tenant_id").references(() => tenants.id, {
      onDelete: "set null",
    }),
    targetId: integer("target_id").references(() => socialPublicationTargets.id, {
      onDelete: "set null",
    }),
    sanitizedPayload: jsonb("sanitized_payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    verificationEvidence: jsonb("verification_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    deliveryCount: integer("delivery_count").notNull().default(1),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    lastReceivedAt: timestamp("last_received_at", { withTimezone: true }).notNull().defaultNow(),
    retentionUntil: timestamp("retention_until", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    receiptKeyUnique: uniqueIndex("meta_social_webhook_receipts_key_unique").on(t.receiptKey),
    byResolution: index("meta_social_webhook_receipts_resolution_idx").on(
      t.resolutionStatus,
      t.createdAt,
    ),
    byAccount: index("meta_social_webhook_receipts_account_idx").on(
      t.platform,
      t.externalAccountId,
      t.resolutionStatus,
    ),
    byTenantTarget: index("meta_social_webhook_receipts_tenant_target_idx").on(
      t.tenantId,
      t.targetId,
      t.createdAt,
    ),
    byChecksum: index("meta_social_webhook_receipts_checksum_idx").on(t.payloadChecksum),
  }),
);

/** Non-secret, tenant-owned advertising account reference. */
export const adAccountConnections = pgTable(
  "ad_account_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    publicationTargetId: integer("publication_target_id").references(() => socialPublicationTargets.id, {
      onDelete: "set null",
    }),
    integrationConnectionId: uuid("integration_connection_id").references(
      () => mindbaseIntegrationConnections.id,
      { onDelete: "set null" },
    ),
    exportunityIntegrationConnectionId: uuid(
      "exportunity_integration_connection_id",
    ).references(() => exportunityIntegrationConnections.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    platform: text("platform").notNull(),
    externalAdAccountId: text("external_ad_account_id").notNull(),
    externalAdAccountLabel: text("external_ad_account_label"),
    businessOwnerReference: text("business_owner_reference"),
    ownershipStatus: text("ownership_status").notNull().default("unverified"),
    billingOwnershipStatus: text("billing_ownership_status").notNull().default("unverified"),
    authorizationStatus: text("authorization_status").notNull().default("unknown"),
    healthStatus: text("health_status").notNull().default("unknown"),
    restrictionStatus: text("restriction_status").notNull().default("unknown"),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    verificationEvidence: jsonb("verification_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id"),
    updatedByUserId: integer("updated_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantProviderAccountUnique: uniqueIndex("ad_account_connections_tenant_provider_account_uniq").on(
      t.tenantId,
      t.provider,
      t.externalAdAccountId,
    ),
    byTenantHealth: index("ad_account_connections_tenant_health_idx").on(
      t.tenantId,
      t.healthStatus,
      t.updatedAt,
    ),
    byExportunityConnection: index(
      "ad_account_connections_exportunity_connection_idx",
    ).on(t.exportunityIntegrationConnectionId),
  }),
);

/** Hierarchical spend boundary; each narrower scope may only reduce authority. */
export const adBudgetEnvelopes = pgTable(
  "ad_budget_envelopes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    parentEnvelopeId: uuid("parent_envelope_id").references((): any => adBudgetEnvelopes.id, {
      onDelete: "restrict",
    }),
    adAccountConnectionId: uuid("ad_account_connection_id").references(() => adAccountConnections.id, {
      onDelete: "restrict",
    }),
    territoryId: integer("territory_id").references(() => geoTerritories.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    name: text("name").notNull(),
    scopeType: text("scope_type").notNull(),
    scopeReferenceId: text("scope_reference_id"),
    currencyCode: text("currency_code").notNull().default("XOF"),
    status: text("status").notNull().default("approval_required"),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    totalCapMinor: integer("total_cap_minor").notNull().default(0),
    dailyCapMinor: integer("daily_cap_minor").notNull().default(0),
    weeklyCapMinor: integer("weekly_cap_minor").notNull().default(0),
    monthlyCapMinor: integer("monthly_cap_minor").notNull().default(0),
    committedMinor: integer("committed_minor").notNull().default(0),
    spentMinor: integer("spent_minor").notNull().default(0),
    maximumCacMinor: integer("maximum_cac_minor").notNull().default(0),
    minimumMarginBps: integer("minimum_margin_bps").notNull().default(0),
    agentReallocationAllowed: boolean("agent_reallocation_allowed").notNull().default(false),
    maximumReallocationBps: integer("maximum_reallocation_bps").notNull().default(0),
    stoppingConditions: jsonb("stopping_conditions").$type<Record<string, unknown>>().notNull().default({}),
    approvalEvidence: jsonb("approval_evidence").$type<Record<string, unknown>>().notNull().default({}),
    approvedByUserId: integer("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdempotencyUnique: uniqueIndex("ad_budget_envelopes_tenant_idempotency_uniq").on(
      t.tenantId,
      t.idempotencyKey,
    ),
    byTenantScope: index("ad_budget_envelopes_tenant_scope_idx").on(
      t.tenantId,
      t.scopeType,
      t.status,
      t.periodEnd,
    ),
    byParent: index("ad_budget_envelopes_parent_idx").on(t.parentEnvelopeId),
  }),
);

export const mediaPlans = pgTable(
  "media_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    envelopeId: uuid("envelope_id").references(() => adBudgetEnvelopes.id, { onDelete: "restrict" }).notNull(),
    territoryId: integer("territory_id").references(() => geoTerritories.id, { onDelete: "restrict" }).notNull(),
    actionRunId: integer("action_run_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    title: text("title").notNull(),
    objective: text("objective").notNull(),
    status: text("status").notNull().default("blocked"),
    eligibleProducts: jsonb("eligible_products").$type<Record<string, unknown>[]>().notNull().default([]),
    stockCapacityEvidence: jsonb("stock_capacity_evidence").$type<Record<string, unknown>>().notNull().default({}),
    deliveryCoverageEvidence: jsonb("delivery_coverage_evidence").$type<Record<string, unknown>>().notNull().default({}),
    landingPageUrl: text("landing_page_url").notNull(),
    trackingPlan: jsonb("tracking_plan").$type<Record<string, unknown>>().notNull().default({}),
    marginBps: integer("margin_bps").notNull().default(0),
    maximumCacMinor: integer("maximum_cac_minor").notNull().default(0),
    rightsEvidence: jsonb("rights_evidence").$type<Record<string, unknown>>().notNull().default({}),
    policyStatus: text("policy_status").notNull().default("unknown"),
    requestedBudgetMinor: integer("requested_budget_minor").notNull().default(0),
    stoppingConditions: jsonb("stopping_conditions").$type<Record<string, unknown>>().notNull().default({}),
    readinessSnapshot: jsonb("readiness_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    blockers: jsonb("blockers").$type<string[]>().notNull().default([]),
    requestedByUserId: integer("requested_by_user_id"),
    approvedByUserId: integer("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdempotencyUnique: uniqueIndex("media_plans_tenant_idempotency_uniq").on(t.tenantId, t.idempotencyKey),
    byTenantStatus: index("media_plans_tenant_status_idx").on(t.tenantId, t.status, t.updatedAt),
    byEnvelope: index("media_plans_envelope_idx").on(t.envelopeId, t.updatedAt),
  }),
);

export const adCampaigns = pgTable(
  "ad_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    mediaPlanId: uuid("media_plan_id").references(() => mediaPlans.id, { onDelete: "cascade" }).notNull(),
    adAccountConnectionId: uuid("ad_account_connection_id")
      .references(() => adAccountConnections.id, { onDelete: "restrict" })
      .notNull(),
    envelopeId: uuid("envelope_id").references(() => adBudgetEnvelopes.id, { onDelete: "restrict" }).notNull(),
    territoryId: integer("territory_id").references(() => geoTerritories.id, { onDelete: "restrict" }).notNull(),
    name: text("name").notNull(),
    objective: text("objective").notNull(),
    status: text("status").notNull().default("DRAFT"),
    providerCampaignId: text("provider_campaign_id"),
    requestedBudgetMinor: integer("requested_budget_minor").notNull().default(0),
    trackingCode: text("tracking_code").notNull(),
    stoppingConditions: jsonb("stopping_conditions").$type<Record<string, unknown>>().notNull().default({}),
    providerState: jsonb("provider_state").$type<Record<string, unknown>>().notNull().default({}),
    providerConfirmedAt: timestamp("provider_confirmed_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantTrackingUnique: uniqueIndex("ad_campaigns_tenant_tracking_uniq").on(t.tenantId, t.trackingCode),
    providerCampaignUnique: uniqueIndex("ad_campaigns_tenant_provider_campaign_uniq").on(
      t.tenantId,
      t.adAccountConnectionId,
      t.providerCampaignId,
    ),
    byTenantStatus: index("ad_campaigns_tenant_status_idx").on(t.tenantId, t.status, t.updatedAt),
  }),
);

export const adGroupsOrAdSets = pgTable(
  "ad_groups_or_ad_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    campaignId: uuid("campaign_id").references(() => adCampaigns.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("DRAFT"),
    providerGroupId: text("provider_group_id"),
    audienceDefinition: jsonb("audience_definition").$type<Record<string, unknown>>().notNull().default({}),
    territoryTargeting: jsonb("territory_targeting").$type<Record<string, unknown>>().notNull().default({}),
    placements: jsonb("placements").$type<string[]>().notNull().default([]),
    bidStrategy: text("bid_strategy"),
    dailyCapMinor: integer("daily_cap_minor").notNull().default(0),
    lifetimeCapMinor: integer("lifetime_cap_minor").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byCampaign: index("ad_groups_or_ad_sets_campaign_idx").on(t.tenantId, t.campaignId, t.updatedAt),
  }),
);

export const adCreatives = pgTable(
  "ad_creatives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    campaignId: uuid("campaign_id").references(() => adCampaigns.id, { onDelete: "cascade" }).notNull(),
    groupId: uuid("group_id").references(() => adGroupsOrAdSets.id, { onDelete: "set null" }),
    mediaItemId: text("media_item_id").references(() => marketingMediaItems.id, { onDelete: "restrict" }).notNull(),
    sourceReferenceId: integer("source_reference_id").references(() => sourceContentReferences.id, {
      onDelete: "restrict",
    }).notNull(),
    rightsGrantId: integer("rights_grant_id").references(() => mediaRightsGrants.id, { onDelete: "restrict" }).notNull(),
    status: text("status").notNull().default("NEEDS_REVIEW"),
    providerCreativeId: text("provider_creative_id"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    callToAction: text("call_to_action").notNull(),
    destinationUrl: text("destination_url").notNull(),
    assetSnapshot: jsonb("asset_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    factSnapshot: jsonb("fact_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    rightsSnapshot: jsonb("rights_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: integer("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byCampaign: index("ad_creatives_campaign_idx").on(t.tenantId, t.campaignId, t.updatedAt),
  }),
);

export const spendAuthorizations = pgTable(
  "spend_authorizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    envelopeId: uuid("envelope_id").references(() => adBudgetEnvelopes.id, { onDelete: "restrict" }).notNull(),
    mediaPlanId: uuid("media_plan_id").references(() => mediaPlans.id, { onDelete: "restrict" }).notNull(),
    campaignId: uuid("campaign_id").references(() => adCampaigns.id, { onDelete: "restrict" }),
    actionRunId: integer("action_run_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("approval_required"),
    amountMinor: integer("amount_minor").notNull(),
    currencyCode: text("currency_code").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
    purpose: text("purpose").notNull(),
    authorityBounds: jsonb("authority_bounds").$type<Record<string, unknown>>().notNull().default({}),
    approvalEvidence: jsonb("approval_evidence").$type<Record<string, unknown>>().notNull().default({}),
    requestedByUserId: integer("requested_by_user_id"),
    approvedByUserId: integer("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    revokedByUserId: integer("revoked_by_user_id"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdempotencyUnique: uniqueIndex("spend_authorizations_tenant_idempotency_uniq").on(
      t.tenantId,
      t.idempotencyKey,
    ),
    byEnvelopeStatus: index("spend_authorizations_envelope_status_idx").on(
      t.tenantId,
      t.envelopeId,
      t.status,
      t.validUntil,
    ),
  }),
);

export const spendLedger = pgTable(
  "spend_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    envelopeId: uuid("envelope_id").references(() => adBudgetEnvelopes.id, { onDelete: "restrict" }).notNull(),
    authorizationId: uuid("authorization_id").references(() => spendAuthorizations.id, { onDelete: "restrict" }).notNull(),
    campaignId: uuid("campaign_id").references(() => adCampaigns.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerTransactionId: text("provider_transaction_id").notNull(),
    entryType: text("entry_type").notNull(),
    direction: text("direction").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currencyCode: text("currency_code").notNull(),
    reconciliationStatus: text("reconciliation_status").notNull().default("pending"),
    providerEvidence: jsonb("provider_evidence").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerTransactionUnique: uniqueIndex("spend_ledger_tenant_provider_transaction_uniq").on(
      t.tenantId,
      t.provider,
      t.providerTransactionId,
    ),
    byEnvelopeOccurred: index("spend_ledger_envelope_occurred_idx").on(t.envelopeId, t.occurredAt),
  }),
);

export const conversionEvents = pgTable(
  "conversion_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    campaignId: uuid("campaign_id").references(() => adCampaigns.id, { onDelete: "restrict" }),
    territoryId: integer("territory_id").references(() => geoTerritories.id, { onDelete: "restrict" }),
    industrialOrderId: uuid("industrial_order_id"),
    paymentId: uuid("payment_id"),
    fulfillmentPlanId: uuid("fulfillment_plan_id"),
    publicationAttemptId: uuid("publication_attempt_id").references(() => socialPublicationAttempts.id, {
      onDelete: "restrict",
    }),
    sourceKind: text("source_kind"),
    canonicalBindingStatus: text("canonical_binding_status").notNull().default("legacy_unknown"),
    bindingEvidence: jsonb("binding_evidence").$type<Record<string, unknown>>().notNull().default({}),
    idempotencyKey: text("idempotency_key"),
    reconciliationActionRunId: integer("reconciliation_action_run_id"),
    reconciledByUserId: integer("reconciled_by_user_id"),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    orderReference: text("order_reference"),
    productReference: text("product_reference"),
    valueMinor: integer("value_minor").notNull().default(0),
    currencyCode: text("currency_code").notNull(),
    verificationStatus: text("verification_status").notNull().default("unverified"),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerEventUnique: uniqueIndex("conversion_events_tenant_provider_event_uniq").on(
      t.tenantId,
      t.provider,
      t.providerEventId,
    ),
    byCampaignOccurred: index("conversion_events_campaign_occurred_idx").on(t.campaignId, t.occurredAt),
    byTerritoryBinding: index("conversion_events_territory_binding_idx").on(
      t.tenantId,
      t.territoryId,
      t.canonicalBindingStatus,
      t.occurredAt,
    ),
  }),
);

export const attributionRecords = pgTable(
  "attribution_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    conversionEventId: uuid("conversion_event_id").references(() => conversionEvents.id, { onDelete: "cascade" }).notNull(),
    campaignId: uuid("campaign_id").references(() => adCampaigns.id, { onDelete: "restrict" }),
    creativeId: uuid("creative_id").references(() => adCreatives.id, { onDelete: "set null" }),
    territoryId: integer("territory_id").references(() => geoTerritories.id, { onDelete: "set null" }),
    publicationAttemptId: uuid("publication_attempt_id").references(() => socialPublicationAttempts.id, {
      onDelete: "restrict",
    }),
    mediaItemId: text("media_item_id").references(() => marketingMediaItems.id, { onDelete: "restrict" }),
    sourceReferenceId: integer("source_reference_id").references(() => sourceContentReferences.id, {
      onDelete: "restrict",
    }),
    rightsGrantId: integer("rights_grant_id").references(() => mediaRightsGrants.id, { onDelete: "restrict" }),
    attributionModel: text("attribution_model").notNull(),
    touchpointReference: text("touchpoint_reference").notNull(),
    weightBps: integer("weight_bps").notNull(),
    attributedValueMinor: integer("attributed_value_minor").notNull().default(0),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byConversion: index("attribution_records_conversion_idx").on(t.tenantId, t.conversionEventId),
    byTerritoryCreated: index("attribution_records_territory_created_idx").on(
      t.tenantId,
      t.territoryId,
      t.createdAt,
    ),
  }),
);

export const accountHealthIncidents = pgTable(
  "account_health_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    adAccountConnectionId: uuid("ad_account_connection_id")
      .references(() => adAccountConnections.id, { onDelete: "cascade" })
      .notNull(),
    incidentType: text("incident_type").notNull(),
    severity: text("severity").notNull(),
    status: text("status").notNull().default("open"),
    providerCode: text("provider_code"),
    summary: text("summary").notNull(),
    restrictions: jsonb("restrictions").$type<string[]>().notNull().default([]),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byAccountOpen: index("account_health_incidents_account_open_idx").on(
      t.tenantId,
      t.adAccountConnectionId,
      t.status,
      t.detectedAt,
    ),
  }),
);
