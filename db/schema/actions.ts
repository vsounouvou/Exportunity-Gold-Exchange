import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { eceUsers } from "./ece";

const ACTION_REQUEST_STATUSES = [
  "PENDING",
  "QUEUED",
  "RUNNING",
  "DONE",
  "FAILED",
  "REQUIRES_APPROVAL",
  "DENIED",
  "CANCELLED",
] as const;

const ACTION_LIFECYCLE_STATES = ["CREATED", "QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELED"] as const;
const ACTION_EVIDENCE_STATUSES = ["NONE", "PENDING", "SATISFIED"] as const;

const ACTION_TYPES = [
  "SEND_EMAIL",
  "SEND_SMS",
  "SEND_WHATSAPP",
  "CREATE_CONTACT",
  "CREATE_AGENT",
  "BULK_CREATE_AGENTS",
  "UPDATE_AGENT_MODEL",
  "ASSIGN_AGENT_TO_CONVERSATION",
  "CREATE_SHOP",
  "CREATE_TASK",
  "CREATE_MEETING_LINK",
  "SEND_MEETING_INVITE",
  "REQUEST_MEETING_SUMMARY",
  "START_BACKGROUND_SESSION",
  "CONFIGURE_RECURRING_MEETING",
  "TRANSCRIBE_VOICE_NOTE",
] as const;

const ACTION_MODES = ["REAL", "SIMULATED"] as const;
const ACTION_OUTCOMES = ["SUCCESS", "FAILED", "NO_EFFECT", "APPROVAL_PENDING"] as const;
const ACTION_RECEIPT_TYPES = ["DB_MUTATION", "HTTP_CALL", "FILE_ARTIFACT", "WORKSTATION_EVENT"] as const;

export const actionRequests = pgTable(
  "action_requests",
  {
    id: serial("id").primaryKey(),
    publicActionId: text("public_action_id"),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    requestedByAgentKey: text("requested_by_agent_key"),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    requestedByUserId: integer("requested_by_user_id").references(() => eceUsers.id, {
      onDelete: "set null",
    }),
    assignedAgentId: integer("assigned_agent_id"),
    actionType: text("action_type", { enum: ACTION_TYPES }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status", { enum: ACTION_REQUEST_STATUSES }).notNull().default("PENDING"),
    lifecycleState: text("lifecycle_state", { enum: ACTION_LIFECYCLE_STATES }).notNull().default("CREATED"),
    mode: text("mode", { enum: ACTION_MODES }).notNull().default("REAL"),
    outcome: text("outcome", { enum: ACTION_OUTCOMES }).notNull().default("APPROVAL_PENDING"),
    evidenceRequired: boolean("evidence_required").notNull().default(false),
    evidenceStatus: text("evidence_status", { enum: ACTION_EVIDENCE_STATUSES }).notNull().default("NONE"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    claimedUntil: timestamp("claimed_until", { withTimezone: true }),
    claimedBy: text("claimed_by"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    priority: integer("priority").notNull().default(0),
    idempotencyKey: text("idempotency_key"),
    correlationId: text("correlation_id"),
    modelUsed: text("model_used"),
    relatedConversationId: text("related_conversation_id"),
    relatedThreadId: integer("related_thread_id"),
    approvedByUserId: integer("approved_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("action_requests_tenant_created_idx").on(t.tenantId, t.createdAt),
    byTenantStatus: index("action_requests_tenant_status_idx").on(t.tenantId, t.status, t.updatedAt),
    byStatus: index("action_requests_status_idx").on(t.status, t.updatedAt),
    byCorrelationId: index("action_requests_correlation_idx").on(t.correlationId, t.updatedAt),
    byLifecycle: index("action_requests_lifecycle_idx").on(t.tenantId, t.lifecycleState, t.updatedAt),
    byQueueLease: index("action_requests_queue_lease_idx").on(t.status, t.claimedUntil, t.nextRetryAt, t.priority),
    uniquePublicActionId: uniqueIndex("action_requests_public_action_id_idx").on(t.publicActionId),
    uniqueIdempotency: uniqueIndex("action_requests_tenant_idempotency_idx").on(t.tenantId, t.idempotencyKey),
  }),
);

export const actionResults = pgTable(
  "action_results",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    actionRequestId: integer("action_request_id")
      .references(() => actionRequests.id, { onDelete: "cascade" })
      .notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
    error: jsonb("error").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenant: index("action_results_tenant_idx").on(t.tenantId, t.createdAt),
    byRequest: index("action_results_request_idx").on(t.actionRequestId, t.createdAt),
  }),
);

export const actionReceipts = pgTable(
  "action_receipts",
  {
    id: text("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    actionRunId: integer("action_run_id")
      .references(() => actionRequests.id, { onDelete: "cascade" })
      .notNull(),
    receiptType: text("receipt_type", { enum: ACTION_RECEIPT_TYPES }).notNull(),
    entityType: text("entity_type"),
    entityIdsJson: jsonb("entity_ids_json").$type<Array<string | number>>().default([]),
    affectedRows: integer("affected_rows"),
    beforeHash: text("before_hash"),
    afterHash: text("after_hash"),
    externalRef: text("external_ref"),
    evidenceUrl: text("evidence_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantCreated: index("action_receipts_tenant_created_idx").on(t.tenantId, t.createdAt),
    byActionRun: index("action_receipts_action_run_idx").on(t.actionRunId, t.createdAt),
  }),
);

export const actionEvents = pgTable(
  "action_events",
  {
    id: serial("id").primaryKey(),
    actionId: integer("action_id")
      .references(() => actionRequests.id, { onDelete: "cascade" })
      .notNull(),
    correlationId: text("correlation_id"),
    eventType: text("event_type").notNull(),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byAction: index("action_events_action_idx").on(t.actionId, t.createdAt),
    byCorrelation: index("action_events_correlation_idx").on(t.correlationId, t.createdAt),
  }),
);
