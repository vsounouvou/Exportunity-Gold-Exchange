import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { contacts } from "./contact";
import { geoTerritories } from "./territories";
import { marketingMediaItems } from "./marketing-cms";
import { mediaRightsGrants, sourceContentReferences } from "./territory-media-commerce";
import { tenants } from "./tenants";

export const mediaInterviewSessions = pgTable(
  "media_interview_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    territoryId: integer("territory_id").references(() => geoTerritories.id, {
      onDelete: "set null",
    }),
    contactId: integer("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    sourceReferenceId: integer("source_reference_id").references(
      () => sourceContentReferences.id,
      { onDelete: "set null" },
    ),
    outputMediaItemId: text("output_media_item_id").references(
      () => marketingMediaItems.id,
      { onDelete: "set null" },
    ),
    idempotencyKey: text("idempotency_key").notNull(),
    mode: text("mode").notNull(),
    status: text("status").notNull().default("draft"),
    intervieweeName: text("interviewee_name").notNull(),
    intervieweeRole: text("interviewee_role").notNull(),
    organizationName: text("organization_name").notNull(),
    language: text("language").notNull().default("en"),
    intendedUses: jsonb("intended_uses").$type<string[]>().notNull().default([]),
    recordingConsentStatus: text("recording_consent_status").notNull().default("unknown"),
    publicationConsentStatus: text("publication_consent_status").notNull().default("unknown"),
    aiProcessingConsentStatus: text("ai_processing_consent_status").notNull().default("unknown"),
    consentEvidence: jsonb("consent_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    questionPlan: jsonb("question_plan")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    progress: jsonb("progress").$type<Record<string, unknown>>().notNull().default({}),
    blockers: jsonb("blockers").$type<string[]>().notNull().default([]),
    preparationActionRunId: integer("preparation_action_run_id"),
    reviewActionRunId: integer("review_action_run_id"),
    createdByUserId: integer("created_by_user_id"),
    approvedByUserId: integer("approved_by_user_id"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdempotencyUnique: uniqueIndex("media_interview_sessions_tenant_idempotency_uniq").on(
      t.tenantId,
      t.idempotencyKey,
    ),
    byTenantStatus: index("media_interview_sessions_tenant_status_idx").on(
      t.tenantId,
      t.status,
      t.updatedAt,
    ),
    byTerritory: index("media_interview_sessions_territory_idx").on(
      t.tenantId,
      t.territoryId,
      t.updatedAt,
    ),
  }),
);

export const mediaInterviewClaims = pgTable(
  "media_interview_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    sessionId: uuid("session_id")
      .references(() => mediaInterviewSessions.id, { onDelete: "cascade" })
      .notNull(),
    questionKey: text("question_key").notNull(),
    questionText: text("question_text").notNull(),
    answerText: text("answer_text").notNull(),
    claimCategory: text("claim_category").notNull().default("other"),
    factStatus: text("fact_status").notNull().default("UNVERIFIED"),
    isMaterial: boolean("is_material").notNull().default(true),
    confidenceBps: integer("confidence_bps").notNull().default(0),
    evidenceReferences: jsonb("evidence_references").$type<string[]>().notNull().default([]),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    correctionNotes: text("correction_notes"),
    verifiedByUserId: integer("verified_by_user_id"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    intervieweeApprovedAt: timestamp("interviewee_approved_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id"),
    updatedByUserId: integer("updated_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionQuestionUnique: uniqueIndex("media_interview_claims_session_question_uniq").on(
      t.sessionId,
      t.questionKey,
    ),
    bySessionFactStatus: index("media_interview_claims_session_fact_status_idx").on(
      t.tenantId,
      t.sessionId,
      t.factStatus,
    ),
  }),
);

export const mediaInterviewEvents = pgTable(
  "media_interview_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    sessionId: uuid("session_id")
      .references(() => mediaInterviewSessions.id, { onDelete: "cascade" })
      .notNull(),
    claimId: uuid("claim_id").references(() => mediaInterviewClaims.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    actorUserId: integer("actor_user_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySessionCreated: index("media_interview_events_session_created_idx").on(
      t.tenantId,
      t.sessionId,
      t.createdAt,
    ),
  }),
);

export const mediaStudioProjects = pgTable(
  "media_studio_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    territoryId: integer("territory_id").references(() => geoTerritories.id, {
      onDelete: "set null",
    }),
    interviewSessionId: uuid("interview_session_id").references(
      () => mediaInterviewSessions.id,
      { onDelete: "set null" },
    ),
    sourceReferenceId: integer("source_reference_id").references(
      () => sourceContentReferences.id,
      { onDelete: "set null" },
    ),
    rightsGrantId: integer("rights_grant_id").references(() => mediaRightsGrants.id, {
      onDelete: "set null",
    }),
    sourceMediaItemId: text("source_media_item_id").references(
      () => marketingMediaItems.id,
      { onDelete: "set null" },
    ),
    outputMediaItemId: text("output_media_item_id").references(
      () => marketingMediaItems.id,
      { onDelete: "set null" },
    ),
    idempotencyKey: text("idempotency_key").notNull(),
    title: text("title").notNull(),
    storyAngle: text("story_angle"),
    language: text("language").notNull().default("en"),
    status: text("status").notNull().default("draft"),
    outputFormats: jsonb("output_formats").$type<string[]>().notNull().default([]),
    contentPlan: jsonb("content_plan").$type<Record<string, unknown>>().notNull().default({}),
    complianceSnapshot: jsonb("compliance_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    blockers: jsonb("blockers").$type<string[]>().notNull().default([]),
    currentVersionNumber: integer("current_version_number").notNull().default(0),
    preparationActionRunId: integer("preparation_action_run_id"),
    externalRenderExecuted: boolean("external_render_executed").notNull().default(false),
    createdByUserId: integer("created_by_user_id"),
    approvedByUserId: integer("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdempotencyUnique: uniqueIndex("media_studio_projects_tenant_idempotency_uniq").on(
      t.tenantId,
      t.idempotencyKey,
    ),
    byTenantStatus: index("media_studio_projects_tenant_status_idx").on(
      t.tenantId,
      t.status,
      t.updatedAt,
    ),
    byInterview: index("media_studio_projects_interview_idx").on(
      t.tenantId,
      t.interviewSessionId,
    ),
  }),
);

export const mediaStudioAssets = pgTable(
  "media_studio_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    projectId: uuid("project_id")
      .references(() => mediaStudioProjects.id, { onDelete: "cascade" })
      .notNull(),
    sourceMediaItemId: text("source_media_item_id").references(
      () => marketingMediaItems.id,
      { onDelete: "set null" },
    ),
    assetRole: text("asset_role").notNull(),
    storageReference: text("storage_reference").notNull(),
    originalSource: text("original_source").notNull(),
    ownerName: text("owner_name").notNull(),
    uploaderUserId: integer("uploader_user_id"),
    mimeType: text("mime_type"),
    sha256: text("sha256"),
    generationProvider: text("generation_provider"),
    generationPrompt: text("generation_prompt"),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    rightsStatus: text("rights_status").notNull().default("unknown"),
    subjectConsentStatus: text("subject_consent_status").notNull().default("unknown"),
    musicLicenseStatus: text("music_license_status").notNull().default("not_applicable"),
    modifications: jsonb("modifications")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    takedownState: text("takedown_state").notNull().default("clear"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectStorageUnique: uniqueIndex("media_studio_assets_project_storage_uniq").on(
      t.projectId,
      t.storageReference,
    ),
    byProjectRole: index("media_studio_assets_project_role_idx").on(
      t.tenantId,
      t.projectId,
      t.assetRole,
    ),
  }),
);

export const mediaStudioVersions = pgTable(
  "media_studio_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    projectId: uuid("project_id")
      .references(() => mediaStudioProjects.id, { onDelete: "cascade" })
      .notNull(),
    versionNumber: integer("version_number").notNull(),
    status: text("status").notNull().default("draft"),
    storyboard: jsonb("storyboard")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    editDecisionList: jsonb("edit_decision_list")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    naturalLanguageCommands: jsonb("natural_language_commands")
      .$type<string[]>()
      .notNull()
      .default([]),
    outputSpecifications: jsonb("output_specifications")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    claimIds: jsonb("claim_ids").$type<string[]>().notNull().default([]),
    reviewComments: jsonb("review_comments")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    contentHash: text("content_hash"),
    approvalEvidence: jsonb("approval_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdByUserId: integer("created_by_user_id"),
    approvedByUserId: integer("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectVersionUnique: uniqueIndex("media_studio_versions_project_version_uniq").on(
      t.projectId,
      t.versionNumber,
    ),
    byProjectStatus: index("media_studio_versions_project_status_idx").on(
      t.tenantId,
      t.projectId,
      t.status,
    ),
  }),
);

export const mediaRenderJobs = pgTable(
  "media_render_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    projectId: uuid("project_id")
      .references(() => mediaStudioProjects.id, { onDelete: "cascade" })
      .notNull(),
    versionId: uuid("version_id")
      .references(() => mediaStudioVersions.id, { onDelete: "restrict" })
      .notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    outputFormat: text("output_format").notNull(),
    status: text("status").notNull().default("prepared"),
    provider: text("provider"),
    providerJobReference: text("provider_job_reference"),
    costEstimateMinor: integer("cost_estimate_minor"),
    currencyCode: text("currency_code"),
    progressBps: integer("progress_bps").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    renderSpecification: jsonb("render_specification")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    inputAssetHashes: jsonb("input_asset_hashes").$type<string[]>().notNull().default([]),
    outputStorageReference: text("output_storage_reference"),
    outputSha256: text("output_sha256"),
    failureDiagnostics: jsonb("failure_diagnostics")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    externalRenderExecuted: boolean("external_render_executed").notNull().default(false),
    providerConfirmed: boolean("provider_confirmed").notNull().default(false),
    preparationActionRunId: integer("preparation_action_run_id"),
    requestedByUserId: integer("requested_by_user_id"),
    approvedByUserId: integer("approved_by_user_id"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdempotencyUnique: uniqueIndex("media_render_jobs_tenant_idempotency_uniq").on(
      t.tenantId,
      t.idempotencyKey,
    ),
    byProjectStatus: index("media_render_jobs_project_status_idx").on(
      t.tenantId,
      t.projectId,
      t.status,
      t.createdAt,
    ),
  }),
);

export const mediaStudioEvents = pgTable(
  "media_studio_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    projectId: uuid("project_id")
      .references(() => mediaStudioProjects.id, { onDelete: "cascade" })
      .notNull(),
    versionId: uuid("version_id").references(() => mediaStudioVersions.id, {
      onDelete: "set null",
    }),
    renderJobId: uuid("render_job_id").references(() => mediaRenderJobs.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    actorUserId: integer("actor_user_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byProjectCreated: index("media_studio_events_project_created_idx").on(
      t.tenantId,
      t.projectId,
      t.createdAt,
    ),
  }),
);
