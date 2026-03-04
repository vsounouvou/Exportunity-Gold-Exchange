import { sql } from "drizzle-orm";
import { boolean, decimal, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { agents, companies, departments } from "../schema";
import { tenants } from "./tenants";

export const agentRegistry = pgTable(
  "agent_registry",
  {
    agentId: integer("agent_id")
      .primaryKey()
      .references(() => agents.id, { onDelete: "cascade" }),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
    departmentId: integer("department_id").references(() => departments.id, { onDelete: "set null" }),
    role: text("role"),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    openaiPolicy: jsonb("openai_policy")
      .$type<{
        allowedModels?: string[];
        maxTokens?: number;
        temperature?: number;
        timeoutMs?: number;
      }>()
      .notNull()
      .default({}),
    memoryScopes: jsonb("memory_scopes").$type<string[]>().notNull().default([]),
    defaultPlaybooks: jsonb("default_playbooks").$type<string[]>().notNull().default([]),
    handoffRules: jsonb("handoff_rules").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    companyIdx: index("agent_registry_company_idx").on(table.companyId),
    departmentIdx: index("agent_registry_department_idx").on(table.departmentId),
  }),
);

export const clues = pgTable(
  "clues",
  {
    clueId: serial("clue_id").primaryKey(),
    scope: text("scope", { enum: ["personal", "department", "company", "entity"] })
      .notNull()
      .default("personal"),
    agentId: integer("agent_id").references(() => agents.id, { onDelete: "set null" }),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
    departmentId: integer("department_id").references(() => departments.id, { onDelete: "set null" }),
    entityId: text("entity_id"),
    type: text("type", {
      enum: ["script", "template", "objection", "lead_source", "policy", "website", "metric", "note"],
    }).notNull(),
    content: text("content").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    confidence: decimal("confidence", { precision: 3, scale: 2 }).notNull().default("0.50"),
    pinned: boolean("pinned").notNull().default(false),
    expiresAt: timestamp("expires_at"),
    evidenceRef: text("evidence_ref"),
    embedding: jsonb("embedding").$type<number[] | null>().default(null),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    scopeCompanyIdx: index("clues_scope_company_idx").on(table.scope, table.companyId),
    agentIdx: index("clues_agent_idx").on(table.agentId),
    departmentIdx: index("clues_department_idx").on(table.departmentId),
    entityIdx: index("clues_entity_idx").on(table.entityId),
    expiresIdx: index("clues_expires_idx").on(table.expiresAt),
  }),
);

export const agentMemory = pgTable(
  "agent_memory",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id")
      .references(() => agents.id, { onDelete: "cascade" })
      .notNull(),
    scope: text("scope", { enum: ["CONVERSATION", "TENANT", "GLOBAL"] }).notNull().default("CONVERSATION"),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id"),
    conversationId: text("conversation_id"),
    memoryBlob: jsonb("memory_blob").$type<Record<string, unknown>>().notNull().default({}),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    tenantConversationAgentIdx: index("agent_memory_tenant_conversation_agent_idx").on(
      table.tenantId,
      table.conversationId,
      table.agentId,
    ),
    agentScopeTenantIdx: index("agent_memory_agent_scope_tenant_idx").on(table.agentId, table.scope, table.tenantId),
  }),
);

export const templates = pgTable(
  "templates",
  {
    templateId: serial("template_id").primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
    useCase: text("use_case").notNull(),
    channel: text("channel", { enum: ["email", "whatsapp", "linkedin", "in_app"] }).notNull(),
    language: text("language").notNull(),
    tone: text("tone", { enum: ["formal", "concise", "warm", "neutral"] }).notNull().default("neutral"),
    subject: text("subject"),
    body: text("body").notNull(),
    requiredVars: jsonb("required_vars").$type<string[]>().notNull().default([]),
    version: text("version").notNull().default("1.0.0"),
    approved: boolean("approved").notNull().default(false),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    companyUseCaseIdx: index("templates_company_use_case_idx").on(table.companyId, table.useCase),
    approvedIdx: index("templates_approved_idx").on(table.approved),
  }),
);

export const playbooks = pgTable(
  "playbooks",
  {
    playbookId: serial("playbook_id").primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
    departmentId: integer("department_id").references(() => departments.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    companyIdx: index("playbooks_company_idx").on(table.companyId),
    departmentIdx: index("playbooks_department_idx").on(table.departmentId),
  }),
);

export const playbookSteps = pgTable(
  "playbook_steps",
  {
    stepId: serial("step_id").primaryKey(),
    playbookId: integer("playbook_id")
      .references(() => playbooks.playbookId, { onDelete: "cascade" })
      .notNull(),
    stepOrder: integer("step_order").notNull(),
    type: text("type", {
      enum: ["tool_call", "template_send", "memory_write", "openai_call", "decision", "handoff"],
    }).notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    inputsSchema: jsonb("inputs_schema").$type<Record<string, unknown>>().notNull().default({}),
    outputsSchema: jsonb("outputs_schema").$type<Record<string, unknown>>().notNull().default({}),
    conditions: jsonb("conditions").$type<Record<string, unknown>>().notNull().default({}),
    retryPolicy: jsonb("retry_policy").$type<Record<string, unknown>>().notNull().default({}),
    onFail: jsonb("on_fail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    playbookIdx: index("playbook_steps_playbook_idx").on(table.playbookId),
    uniqPlaybookStepOrder: uniqueIndex("playbook_steps_playbook_order_unique").on(table.playbookId, table.stepOrder),
  }),
);

export const agentJobs = pgTable(
  "agent_jobs",
  {
    jobId: text("job_id").primaryKey().notNull(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
    agentId: integer("agent_id").references(() => agents.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status", {
      enum: ["queued", "running", "succeeded", "failed", "escalated"],
    })
      .notNull()
      .default("queued"),
    error: text("error"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    companyIdx: index("agent_jobs_company_idx").on(table.companyId),
    agentIdx: index("agent_jobs_agent_idx").on(table.agentId),
    statusIdx: index("agent_jobs_status_idx").on(table.status),
  }),
);

export const agentAuditLog = pgTable(
  "agent_audit_log",
  {
    logId: serial("log_id").primaryKey(),
    jobId: text("job_id")
      .references(() => agentJobs.jobId, { onDelete: "cascade" })
      .notNull(),
    agentId: integer("agent_id").references(() => agents.id, { onDelete: "set null" }),
    actionType: text("action_type", {
      enum: ["tool_call", "llm_call", "openai_call", "memory_read", "memory_write", "template_render", "router_decision", "playbook_step"],
    }).notNull(),
    inputsHash: text("inputs_hash"),
    inputs: jsonb("inputs").$type<Record<string, unknown> | null>().default(null),
    outputs: jsonb("outputs").$type<Record<string, unknown> | null>().default(null),
    outputsRef: text("outputs_ref"),
    status: text("status", { enum: ["ok", "error"] }).notNull().default("ok"),
    error: text("error"),
    latencyMs: integer("latency_ms"),
    tokenUsage: jsonb("token_usage")
      .$type<{
        provider?: string;
        model?: string;
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
        endpoint?: string;
      } | null>()
      .default(null),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    jobIdx: index("agent_audit_job_idx").on(table.jobId),
    agentIdx: index("agent_audit_agent_idx").on(table.agentId),
    actionIdx: index("agent_audit_action_idx").on(table.actionType),
    statusIdx: index("agent_audit_status_idx").on(table.status),
  }),
);
