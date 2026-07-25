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

import { eceUsers } from "./ece";
import { agoojyeProjectUsers, agoojyeTeams } from "./agoojye";
import { tenants } from "./tenants";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const agoojyeWorkosMfaFactors = pgTable(
  "agoojye_workos_mfa_factors",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => eceUsers.id, { onDelete: "cascade" }).notNull(),
    type: text("type").notNull().default("totp"),
    encryptedSecret: text("encrypted_secret").notNull(),
    recoveryCodeHashes: jsonb("recovery_code_hashes").$type<string[]>().notNull().default([]),
    enabled: boolean("enabled").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    tenantUserUnique: uniqueIndex("agoojye_workos_mfa_tenant_user_uidx").on(table.tenantId, table.userId),
  }),
);

export const agoojyeWorkosMfaChallenges = pgTable(
  "agoojye_workos_mfa_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => eceUsers.id, { onDelete: "cascade" }).notNull(),
    tokenHash: text("token_hash").notNull(),
    purpose: text("purpose").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("agoojye_workos_mfa_challenge_token_uidx").on(table.tokenHash),
    byUserExpiry: index("agoojye_workos_mfa_challenge_user_expiry_idx").on(table.userId, table.expiresAt),
  }),
);

export const agoojyeWorkosSessions = pgTable(
  "agoojye_workos_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => eceUsers.id, { onDelete: "cascade" }).notNull(),
    eceSessionId: integer("ece_session_id"),
    tokenHash: text("token_hash").notNull(),
    mfaVerifiedAt: timestamp("mfa_verified_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("agoojye_workos_session_token_uidx").on(table.tokenHash),
    byUserExpiry: index("agoojye_workos_session_user_expiry_idx").on(table.userId, table.expiresAt),
  }),
);

export const agoojyeWorkosSecurityEvents = pgTable(
  "agoojye_workos_security_events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    actorUserId: integer("actor_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    subjectUserId: integer("subject_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    result: text("result").notNull().default("success"),
    reason: text("reason"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => ({
    byTenantCreated: index("agoojye_workos_security_tenant_created_idx").on(table.tenantId, table.createdAt),
    bySubjectCreated: index("agoojye_workos_security_subject_created_idx").on(table.subjectUserId, table.createdAt),
  }),
);

export const agoojyeWorkosWorkerImports = pgTable(
  "agoojye_workos_worker_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    createdBy: integer("created_by").references(() => eceUsers.id, { onDelete: "set null" }),
    sourceName: text("source_name").notNull(),
    sourceHash: text("source_hash").notNull(),
    status: text("status").notNull().default("preview"),
    mapping: jsonb("mapping").$type<Record<string, string>>().notNull().default({}),
    previewRows: jsonb("preview_rows").$type<Array<Record<string, unknown>>>().notNull().default([]),
    validation: jsonb("validation").$type<Record<string, unknown>>().notNull().default({}),
    results: jsonb("results").$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    byTenantStatus: index("agoojye_workos_import_tenant_status_idx").on(table.tenantId, table.status),
  }),
);

export const agoojyeWorkosVacancies = pgTable(
  "agoojye_workos_vacancies",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    teamId: integer("team_id").references(() => agoojyeTeams.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    previousHolderUserId: integer("previous_holder_user_id").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    candidateName: text("candidate_name"),
    candidateEmail: text("candidate_email"),
    status: text("status").notNull().default("open"),
    restrictions: jsonb("restrictions").$type<string[]>().notNull().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    byTenantStatus: index("agoojye_workos_vacancy_tenant_status_idx").on(table.tenantId, table.status),
  }),
);

export const agoojyeWorkosOffboardingEvents = pgTable(
  "agoojye_workos_offboarding_events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    projectUserId: integer("project_user_id").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    authUserId: integer("auth_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    performedBy: integer("performed_by").references(() => eceUsers.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    transferredTaskCount: integer("transferred_task_count").notNull().default(0),
    mailboxStatus: text("mailbox_status").notNull().default("archived"),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => ({
    byTenantCreated: index("agoojye_workos_offboarding_tenant_created_idx").on(table.tenantId, table.createdAt),
  }),
);

export const agoojyeWorkosCalendarEvents = pgTable(
  "agoojye_workos_calendar_events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    ownerUserId: integer("owner_user_id").references(() => agoojyeProjectUsers.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    eventType: text("event_type").notNull().default("internal"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    participantUserIds: jsonb("participant_user_ids").$type<number[]>().notNull().default([]),
    recurrence: jsonb("recurrence").$type<Record<string, unknown>>().notNull().default({}),
    confidentialityClass: text("confidentiality_class").notNull().default("INTERNAL"),
    status: text("status").notNull().default("scheduled"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    byTenantStart: index("agoojye_workos_calendar_tenant_start_idx").on(table.tenantId, table.startsAt),
  }),
);

export const agoojyeWorkosAgents = pgTable(
  "agoojye_workos_agents",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("active"),
    timezone: text("timezone").notNull().default("Africa/Porto-Novo"),
    policy: jsonb("policy").$type<Record<string, unknown>>().notNull().default({}),
    schedule: jsonb("schedule").$type<Record<string, unknown>>().notNull().default({}),
    dailyBudgetXof: integer("daily_budget_xof").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    tenantKeyUnique: uniqueIndex("agoojye_workos_agents_tenant_key_uidx").on(table.tenantId, table.key),
  }),
);

export const agoojyeWorkosAgentActions = pgTable(
  "agoojye_workos_agent_actions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    agentId: integer("agent_id").references(() => agoojyeWorkosAgents.id, { onDelete: "cascade" }).notNull(),
    requestedBy: integer("requested_by").references(() => eceUsers.id, { onDelete: "set null" }),
    actionType: text("action_type").notNull(),
    riskLevel: text("risk_level").notNull().default("low"),
    status: text("status").notNull().default("proposed"),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    approvedBy: integer("approved_by").references(() => eceUsers.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb("output").$type<Record<string, unknown>>().notNull().default({}),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    byTenantStatus: index("agoojye_workos_agent_action_tenant_status_idx").on(table.tenantId, table.status),
  }),
);

export const agoojyeWorkosComplianceAccess = pgTable(
  "agoojye_workos_compliance_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    requestedBy: integer("requested_by").references(() => eceUsers.id, { onDelete: "cascade" }).notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => ({
    byTenantExpiry: index("agoojye_workos_compliance_tenant_expiry_idx").on(table.tenantId, table.expiresAt),
  }),
);
