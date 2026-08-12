import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { agents, companies } from "../schema";
import { eceUsers } from "./ece";
import { mindbaseIntegrationConnections } from "./mindbase";
import { tenants } from "./tenants";

export type CompanyBrainClassification = {
  level?: "public" | "internal" | "confidential" | "restricted";
  categories?: string[];
  containsPersonalData?: boolean;
  containsFinancialData?: boolean;
};

export type CompanyBrainCitation = {
  sourceId: number;
  sourceVersionId: number;
  title: string;
  locator?: string;
  sourceUrl?: string;
  contentHash?: string;
};

export type CompanyBrainWorkspaceService = "drive" | "gmail" | "contacts";

export const companyBrainSourceConnectors = pgTable(
  "company_brain_source_connectors",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => mindbaseIntegrationConnections.id, { onDelete: "cascade" }),
    service: text("service").$type<CompanyBrainWorkspaceService>().notNull(),
    mode: text("mode").notNull().default("review_only"),
    status: text("status").notNull().default("connected"),
    readOnly: boolean("read_only").notNull().default(true),
    grantedScopes: jsonb("granted_scopes").$type<string[]>().notNull().default([]),
    policy: jsonb("policy").$type<Record<string, unknown>>().notNull().default({}),
    syncSettings: jsonb("sync_settings").$type<Record<string, unknown>>().notNull().default({}),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSuccessfulSyncAt: timestamp("last_successful_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantServiceIdx: index("company_brain_source_connectors_tenant_service_idx").on(
      table.tenantId,
      table.service,
      table.status,
    ),
    connectionServiceIdx: uniqueIndex("company_brain_source_connectors_connection_service_uniq").on(
      table.connectionId,
      table.service,
    ),
  }),
);

export const companyBrainOauthStates = pgTable(
  "company_brain_oauth_states",
  {
    stateHash: text("state_hash").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => eceUsers.id, { onDelete: "cascade" }),
    service: text("service").$type<CompanyBrainWorkspaceService>().notNull(),
    returnTo: text("return_to").notNull().default("/admin/settings/integrations/google-workspace"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantExpiryIdx: index("company_brain_oauth_states_tenant_expiry_idx").on(table.tenantId, table.expiresAt),
  }),
);

export const companyBrainSyncRuns = pgTable(
  "company_brain_sync_runs",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    connectorId: integer("connector_id")
      .notNull()
      .references(() => companyBrainSourceConnectors.id, { onDelete: "cascade" }),
    service: text("service").$type<CompanyBrainWorkspaceService>().notNull(),
    trigger: text("trigger").notNull().default("manual"),
    syncMode: text("sync_mode").notNull().default("incremental"),
    status: text("status").notNull().default("queued"),
    phase: text("phase").notNull().default("queued"),
    counters: jsonb("counters").$type<Record<string, number>>().notNull().default({}),
    cursorBefore: jsonb("cursor_before").$type<Record<string, unknown>>().notNull().default({}),
    cursorAfter: jsonb("cursor_after").$type<Record<string, unknown>>().notNull().default({}),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    connectorCreatedIdx: index("company_brain_sync_runs_connector_created_idx").on(
      table.connectorId,
      table.createdAt,
    ),
    tenantStatusIdx: index("company_brain_sync_runs_tenant_status_idx").on(table.tenantId, table.status, table.createdAt),
  }),
);

export const companyBrainSyncCursors = pgTable(
  "company_brain_sync_cursors",
  {
    id: serial("id").primaryKey(),
    connectorId: integer("connector_id")
      .notNull()
      .references(() => companyBrainSourceConnectors.id, { onDelete: "cascade" }),
    cursorType: text("cursor_type").notNull(),
    cursorValue: text("cursor_value"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    connectorTypeIdx: uniqueIndex("company_brain_sync_cursors_connector_type_uniq").on(
      table.connectorId,
      table.cursorType,
    ),
  }),
);

export const companyBrainSyncDeadLetters = pgTable(
  "company_brain_sync_dead_letters",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    connectorId: integer("connector_id")
      .notNull()
      .references(() => companyBrainSourceConnectors.id, { onDelete: "cascade" }),
    syncRunId: integer("sync_run_id").references(() => companyBrainSyncRuns.id, { onDelete: "set null" }),
    providerItemId: text("provider_item_id"),
    stage: text("stage").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    connectorStatusIdx: index("company_brain_sync_dead_letters_connector_status_idx").on(
      table.connectorId,
      table.status,
      table.createdAt,
    ),
  }),
);

export const companyBrainSources = pgTable(
  "company_brain_sources",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
    connectorId: integer("connector_id").references(() => companyBrainSourceConnectors.id, { onDelete: "set null" }),
    connectorType: text("connector_type").notNull().default("manual"),
    providerSourceId: text("provider_source_id"),
    parentSourceId: integer("parent_source_id"),
    title: text("title").notNull(),
    sourceUrl: text("source_url"),
    mimeType: text("mime_type"),
    sourceType: text("source_type").notNull().default("document"),
    confidentiality: text("confidentiality").notNull().default("internal"),
    businessRelevance: text("business_relevance").notNull().default("general"),
    permissionSnapshot: jsonb("permission_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    contentHash: text("content_hash"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantStatusIdx: index("company_brain_sources_tenant_status_idx").on(table.tenantId, table.status, table.updatedAt),
    tenantCompanyIdx: index("company_brain_sources_tenant_company_idx").on(table.tenantId, table.companyId),
    connectorStatusIdx: index("company_brain_sources_connector_status_idx").on(table.connectorId, table.status),
    providerIdentityIdx: uniqueIndex("company_brain_sources_provider_identity_uniq").on(
      table.tenantId,
      table.connectorType,
      table.providerSourceId,
    ),
  }),
);

export const companyBrainSourceVersions = pgTable(
  "company_brain_source_versions",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => companyBrainSources.id, { onDelete: "cascade" }),
    providerVersionId: text("provider_version_id"),
    contentHash: text("content_hash").notNull(),
    extractedText: text("extracted_text"),
    storageRef: text("storage_ref"),
    sourceModifiedAt: timestamp("source_modified_at", { withTimezone: true }),
    extractionStatus: text("extraction_status").notNull().default("pending"),
    securityStatus: text("security_status").notNull().default("pending"),
    classification: jsonb("classification").$type<CompanyBrainClassification>().notNull().default({}),
    redactions: jsonb("redactions").$type<Record<string, unknown>[]>().notNull().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sourceCreatedIdx: index("company_brain_source_versions_source_created_idx").on(table.sourceId, table.createdAt),
    sourceHashIdx: uniqueIndex("company_brain_source_versions_source_hash_uniq").on(table.sourceId, table.contentHash),
    securityStatusIdx: index("company_brain_source_versions_security_status_idx").on(table.securityStatus, table.createdAt),
  }),
);

export const companyBrainClaims = pgTable(
  "company_brain_claims",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
    canonicalKey: text("canonical_key").notNull(),
    subjectType: text("subject_type").notNull().default("company"),
    subjectId: text("subject_id"),
    claimText: text("claim_text").notNull(),
    structuredValue: jsonb("structured_value").$type<Record<string, unknown>>().notNull().default({}),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    status: text("status").notNull().default("proposed"),
    conflictStatus: text("conflict_status").notNull().default("clear"),
    confidentiality: text("confidentiality").notNull().default("internal"),
    internalWording: text("internal_wording"),
    approvedExternalWording: text("approved_external_wording"),
    currentRevision: integer("current_revision").notNull().default(1),
    reviewAt: timestamp("review_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    createdByAgentId: integer("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantKeyIdx: index("company_brain_claims_tenant_key_idx").on(table.tenantId, table.canonicalKey, table.updatedAt),
    tenantStatusIdx: index("company_brain_claims_tenant_status_idx").on(table.tenantId, table.status, table.updatedAt),
    tenantConflictIdx: index("company_brain_claims_tenant_conflict_idx").on(table.tenantId, table.conflictStatus, table.updatedAt),
  }),
);

export const companyBrainClaimEvidence = pgTable(
  "company_brain_claim_evidence",
  {
    id: serial("id").primaryKey(),
    claimId: integer("claim_id")
      .notNull()
      .references(() => companyBrainClaims.id, { onDelete: "cascade" }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => companyBrainSources.id, { onDelete: "cascade" }),
    sourceVersionId: integer("source_version_id")
      .notNull()
      .references(() => companyBrainSourceVersions.id, { onDelete: "cascade" }),
    supportType: text("support_type").notNull().default("supports"),
    excerpt: text("excerpt"),
    locator: text("locator"),
    sourceStrength: text("source_strength").notNull().default("unknown"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("0.500"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    claimIdx: index("company_brain_claim_evidence_claim_idx").on(table.claimId, table.createdAt),
    sourceVersionIdx: index("company_brain_claim_evidence_source_version_idx").on(table.sourceVersionId),
    uniqueEvidenceIdx: uniqueIndex("company_brain_claim_evidence_unique_idx").on(
      table.claimId,
      table.sourceVersionId,
      table.supportType,
    ),
  }),
);

export const companyBrainClaimConflicts = pgTable(
  "company_brain_claim_conflicts",
  {
    id: serial("id").primaryKey(),
    claimId: integer("claim_id")
      .notNull()
      .references(() => companyBrainClaims.id, { onDelete: "cascade" }),
    conflictingClaimId: integer("conflicting_claim_id").references(() => companyBrainClaims.id, {
      onDelete: "set null",
    }),
    conflictType: text("conflict_type").notNull().default("value_mismatch"),
    summary: text("summary").notNull(),
    status: text("status").notNull().default("open"),
    resolution: text("resolution"),
    resolvedByUserId: integer("resolved_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    claimStatusIdx: index("company_brain_claim_conflicts_claim_status_idx").on(table.claimId, table.status),
  }),
);

export const companyBrainClaimApprovals = pgTable(
  "company_brain_claim_approvals",
  {
    id: serial("id").primaryKey(),
    claimId: integer("claim_id")
      .notNull()
      .references(() => companyBrainClaims.id, { onDelete: "cascade" }),
    approvalScope: text("approval_scope").notNull().default("internal"),
    status: text("status").notNull().default("pending"),
    requestedByUserId: integer("requested_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    requestedByAgentId: integer("requested_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    reviewedByUserId: integer("reviewed_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    approvedWording: text("approved_wording"),
    reviewNotes: text("review_notes"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => ({
    claimStatusIdx: index("company_brain_claim_approvals_claim_status_idx").on(table.claimId, table.status),
  }),
);

export const companyBrainContextPacks = pgTable(
  "company_brain_context_packs",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
    agentId: integer("agent_id").references(() => agents.id, { onDelete: "set null" }),
    conversationId: text("conversation_id"),
    correlationId: text("correlation_id"),
    taskKey: text("task_key").notNull(),
    purpose: text("purpose").notNull().default("internal"),
    authoritySnapshot: jsonb("authority_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    sourceCitations: jsonb("source_citations").$type<CompanyBrainCitation[]>().notNull().default([]),
    conflictSummaries: jsonb("conflict_summaries").$type<Record<string, unknown>[]>().notNull().default([]),
    freshness: jsonb("freshness").$type<Record<string, unknown>>().notNull().default({}),
    redactions: jsonb("redactions").$type<Record<string, unknown>[]>().notNull().default([]),
    status: text("status").notNull().default("assembled"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => ({
    tenantCreatedIdx: index("company_brain_context_packs_tenant_created_idx").on(table.tenantId, table.createdAt),
    agentCreatedIdx: index("company_brain_context_packs_agent_created_idx").on(table.agentId, table.createdAt),
    correlationIdx: index("company_brain_context_packs_correlation_idx").on(table.correlationId),
  }),
);

export const companyBrainAuditEvents = pgTable(
  "company_brain_audit_events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    correlationId: text("correlation_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    tenantCreatedIdx: index("company_brain_audit_events_tenant_created_idx").on(table.tenantId, table.createdAt),
    entityIdx: index("company_brain_audit_events_entity_idx").on(table.entityType, table.entityId, table.createdAt),
    correlationIdx: index("company_brain_audit_events_correlation_idx").on(table.correlationId),
  }),
);
