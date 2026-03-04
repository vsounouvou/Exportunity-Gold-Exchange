import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { eceUsers } from "./ece";
import { tenants } from "./tenants";

export const INTELLIGENCE_AGENT_TIERS = ["SUPER", "MANAGER", "EXECUTION"] as const;
export const INTELLIGENCE_MANAGER_TIERS = ["SUPER", "MANAGER"] as const;
export const INTELLIGENCE_EXECUTION_TIERS = ["EXECUTION"] as const;

export const INTELLIGENCE_TASK_STATES = [
  "CREATED",
  "PLANNED",
  "SCRIPTED",
  "QUEUED",
  "RUNNING",
  "VERIFIED",
  "REPORTED",
  "FAILED",
  "CANCELLED",
] as const;

export const INTELLIGENCE_CRON_KINDS = ["TIME", "EVENT", "MONITOR", "REGENERATION"] as const;
export const INTELLIGENCE_CRON_TRIGGER_MODES = ["SCHEDULE", "EVENT"] as const;

export const intelligenceAgentPolicies = pgTable(
  "intelligence_agent_policies",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    agentTier: text("agent_tier", { enum: INTELLIGENCE_AGENT_TIERS }).notNull(),
    maxContext: integer("max_context").notNull().default(2048),
    maxReasoningDepth: integer("max_reasoning_depth").notNull().default(1),
    maxTokenBudgetPerTask: integer("max_token_budget_per_task").notNull().default(1000),
    maxTasksPerHour: integer("max_tasks_per_hour").notNull().default(30),
    allowCrossTenant: boolean("allow_cross_tenant").notNull().default(false),
    allowLlm: boolean("allow_llm").notNull().default(true),
    active: boolean("active").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    updatedByUserId: integer("updated_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantTierActive: index("intelligence_agent_policies_tenant_tier_active_idx").on(t.tenantId, t.agentTier, t.active),
  }),
);

export const intelligenceWorkerRoutes = pgTable(
  "intelligence_worker_routes",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    modulePattern: text("module_pattern").notNull(),
    cronKind: text("cron_kind", { enum: INTELLIGENCE_CRON_KINDS }),
    preferredQueue: text("preferred_queue").notNull().default("execution-default"),
    preferredTier: text("preferred_tier", { enum: INTELLIGENCE_AGENT_TIERS }).notNull().default("EXECUTION"),
    concurrencyLimit: integer("concurrency_limit").notNull().default(5),
    maxRetry: integer("max_retry").notNull().default(3),
    active: boolean("active").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantActive: index("intelligence_worker_routes_tenant_active_idx").on(t.tenantId, t.active),
    byPattern: index("intelligence_worker_routes_pattern_idx").on(t.modulePattern, t.active),
  }),
);

export const intelligenceCronJobs = pgTable(
  "intelligence_cron_jobs",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    cronKind: text("cron_kind", { enum: INTELLIGENCE_CRON_KINDS }).notNull(),
    triggerMode: text("trigger_mode", { enum: INTELLIGENCE_CRON_TRIGGER_MODES }).notNull().default("SCHEDULE"),
    scheduleCron: text("schedule_cron"),
    eventKey: text("event_key"),
    moduleId: text("module_id").notNull(),
    policyTier: text("policy_tier", { enum: INTELLIGENCE_AGENT_TIERS }).notNull().default("EXECUTION"),
    workflowTemplate: jsonb("workflow_template").$type<Record<string, unknown>>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    failureCount: integer("failure_count").notNull().default(0),
    maxFailures: integer("max_failures").notNull().default(10),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantKindActive: index("intelligence_cron_jobs_tenant_kind_active_idx").on(t.tenantId, t.cronKind, t.isActive),
    byDueSchedule: index("intelligence_cron_jobs_due_idx").on(t.isActive, t.triggerMode, t.nextRunAt),
    byEvent: index("intelligence_cron_jobs_event_idx").on(t.tenantId, t.eventKey, t.isActive),
  }),
);

export const intelligenceTasks = pgTable(
  "intelligence_tasks",
  {
    id: serial("id").primaryKey(),
    publicTaskId: text("public_task_id"),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    moduleId: text("module_id").notNull(),
    policyId: integer("policy_id").references(() => intelligenceAgentPolicies.id, { onDelete: "set null" }),
    cronJobId: integer("cron_job_id").references(() => intelligenceCronJobs.id, { onDelete: "set null" }),
    managerAgentId: integer("manager_agent_id"),
    executionAgentId: integer("execution_agent_id"),
    managerTier: text("manager_tier", { enum: INTELLIGENCE_MANAGER_TIERS }).notNull().default("MANAGER"),
    executionTier: text("execution_tier", { enum: INTELLIGENCE_EXECUTION_TIERS }).notNull().default("EXECUTION"),
    state: text("state", { enum: INTELLIGENCE_TASK_STATES }).notNull().default("CREATED"),
    priority: integer("priority").notNull().default(0),
    title: text("title").notNull(),
    instruction: text("instruction").notNull(),
    objective: text("objective"),
    workflowSpec: jsonb("workflow_spec").$type<Record<string, unknown>>().notNull().default({}),
    workflowHash: text("workflow_hash"),
    scriptHash: text("script_hash"),
    scriptSignature: text("script_signature"),
    scriptVersion: text("script_version").notNull().default("1.0.0"),
    source: text("source", {
      enum: ["MANUAL", "CRON_TIME", "CRON_EVENT", "CRON_MONITOR", "CRON_REGENERATION", "ESCALATION"],
    })
      .notNull()
      .default("MANUAL"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    claimedBy: text("claimed_by"),
    tokenBudget: integer("token_budget").notNull().default(0),
    tokensUsed: integer("tokens_used").notNull().default(0),
    plannedAt: timestamp("planned_at", { withTimezone: true }),
    scriptedAt: timestamp("scripted_at", { withTimezone: true }),
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    runningAt: timestamp("running_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastError: text("last_error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byPublicTaskId: uniqueIndex("intelligence_tasks_public_task_id_idx").on(t.publicTaskId),
    byTenantState: index("intelligence_tasks_tenant_state_idx").on(t.tenantId, t.state, t.priority, t.createdAt),
    byQueueLease: index("intelligence_tasks_queue_lease_idx").on(t.state, t.leaseUntil, t.priority, t.createdAt),
    byModule: index("intelligence_tasks_module_idx").on(t.tenantId, t.moduleId, t.createdAt),
  }),
);

export const intelligenceAuditEvents = pgTable(
  "intelligence_audit_events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    taskId: integer("task_id").references(() => intelligenceTasks.id, { onDelete: "cascade" }),
    cronJobId: integer("cron_job_id").references(() => intelligenceCronJobs.id, { onDelete: "set null" }),
    actorType: text("actor_type", { enum: ["SUPER", "MANAGER", "EXECUTION", "SYSTEM", "USER"] }).notNull(),
    actorId: text("actor_id"),
    eventType: text("event_type").notNull(),
    beforeState: text("before_state"),
    afterState: text("after_state"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    immutableHash: text("immutable_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("intelligence_audit_events_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTaskCreated: index("intelligence_audit_events_task_created_idx").on(t.taskId, t.createdAt),
    byEventType: index("intelligence_audit_events_type_idx").on(t.eventType, t.createdAt),
  }),
);

export const intelligenceTokenLedger = pgTable(
  "intelligence_token_ledger",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    taskId: integer("task_id").references(() => intelligenceTasks.id, { onDelete: "cascade" }),
    policyId: integer("policy_id").references(() => intelligenceAgentPolicies.id, { onDelete: "set null" }),
    actorTier: text("actor_tier", { enum: INTELLIGENCE_AGENT_TIERS }).notNull(),
    eventType: text("event_type", {
      enum: ["ALLOCATE", "CONSUME", "REFUND", "VIOLATION", "THROTTLE"],
    }).notNull(),
    tokensDelta: integer("tokens_delta").notNull(),
    tokenBalanceAfter: integer("token_balance_after"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("intelligence_token_ledger_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTaskCreated: index("intelligence_token_ledger_task_created_idx").on(t.taskId, t.createdAt),
    byTypeCreated: index("intelligence_token_ledger_type_created_idx").on(t.eventType, t.createdAt),
  }),
);

export const intelligenceAlerts = pgTable(
  "intelligence_alerts",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    taskId: integer("task_id").references(() => intelligenceTasks.id, { onDelete: "set null" }),
    cronJobId: integer("cron_job_id").references(() => intelligenceCronJobs.id, { onDelete: "set null" }),
    severity: text("severity", { enum: ["info", "warning", "critical"] }).notNull().default("warning"),
    code: text("code").notNull(),
    message: text("message").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantSeverity: index("intelligence_alerts_tenant_severity_idx").on(t.tenantId, t.severity, t.createdAt),
    byCode: index("intelligence_alerts_code_idx").on(t.code, t.createdAt),
  }),
);

export type IntelligenceAgentPolicy = typeof intelligenceAgentPolicies.$inferSelect;
export type IntelligenceTask = typeof intelligenceTasks.$inferSelect;
export type IntelligenceCronJob = typeof intelligenceCronJobs.$inferSelect;
export type IntelligenceAuditEvent = typeof intelligenceAuditEvents.$inferSelect;
export type IntelligenceTokenLedgerEntry = typeof intelligenceTokenLedger.$inferSelect;
export type IntelligenceWorkerRoute = typeof intelligenceWorkerRoutes.$inferSelect;
export type IntelligenceAlert = typeof intelligenceAlerts.$inferSelect;
