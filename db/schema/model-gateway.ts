import { boolean, index, integer, jsonb, numeric, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, bigint } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const modelTierEnum = pgEnum("model_tier", ["TIER_LOCAL_TINY", "TIER_LOCAL_GPU", "TIER_EXTERNAL"]);
export const modelProviderEnum = pgEnum("model_provider", ["llama_cpp", "vllm", "openai", "anthropic"]);
export const modelLogStatusEnum = pgEnum("model_log_status", ["success", "error", "degraded"]);
export const toolRiskLevelEnum = pgEnum("tool_risk_level", ["low", "medium", "high", "critical"]);
export const evalRunStatusEnum = pgEnum("eval_run_status", ["running", "completed", "failed"]);

export const modelRegistry = pgTable(
  "model_registry",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    tier: modelTierEnum("tier").notNull(),
    provider: modelProviderEnum("provider").notNull(),
    baseModel: text("base_model").notNull(),
    quantization: text("quantization"),
    contextLen: integer("context_len").notNull().default(8192),
    endpointUrl: text("endpoint_url"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    tenantScope: integer("tenant_scope").references(() => tenants.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTierEnabled: index("model_registry_tier_enabled_idx").on(t.tier, t.isEnabled),
    byTenantScope: index("model_registry_tenant_scope_idx").on(t.tenantScope, t.isEnabled),
    byProvider: index("model_registry_provider_idx").on(t.provider, t.isEnabled),
  }),
);

export const agentModelPolicy = pgTable(
  "agent_model_policy",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    agentId: integer("agent_id").notNull(),
    maxTierAllowed: modelTierEnum("max_tier_allowed").notNull().default("TIER_LOCAL_TINY"),
    defaultModelId: integer("default_model_id").references(() => modelRegistry.id, { onDelete: "set null" }),
    maxTokensPerDay: integer("max_tokens_per_day").notNull().default(20000),
    maxRequestsPerMinute: integer("max_requests_per_minute").notNull().default(30),
    toolsAllowlist: jsonb("tools_allowlist").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueAgentPolicy: uniqueIndex("agent_model_policy_tenant_agent_uidx").on(t.tenantId, t.agentId),
    byTier: index("agent_model_policy_tier_idx").on(t.tenantId, t.maxTierAllowed),
  }),
);

export const toolGovernorRegistry = pgTable(
  "tool_governor_registry",
  {
    id: serial("id").primaryKey(),
    toolKey: text("tool_key").notNull(),
    name: text("name").notNull(),
    riskLevel: toolRiskLevelEnum("risk_level").notNull().default("medium"),
    handler: text("handler").notNull(),
    permissionsRequired: jsonb("permissions_required").$type<string[]>().notNull().default([]),
    allowlistDomains: jsonb("allowlist_domains").$type<string[]>().notNull().default([]),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueToolKey: uniqueIndex("tool_governor_registry_tool_key_uidx").on(t.toolKey),
    byEnabled: index("tool_governor_registry_enabled_idx").on(t.isEnabled),
  }),
);

export const modelGatewayLogs = pgTable(
  "model_gateway_logs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    traceId: text("trace_id").notNull(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    agentId: integer("agent_id").notNull(),
    sessionId: text("session_id"),
    workspace: text("workspace"),
    domain: text("domain"),
    requestMessages: jsonb("request_messages").$type<Array<{ role: string; content: string }>>().notNull().default([]),
    responseMessage: text("response_message"),
    toolCalls: jsonb("tool_calls").$type<Array<Record<string, unknown>>>().notNull().default([]),
    toolResults: jsonb("tool_results").$type<Array<Record<string, unknown>>>().notNull().default([]),
    modelId: integer("model_id").references(() => modelRegistry.id, { onDelete: "set null" }),
    modelName: text("model_name"),
    modelTier: modelTierEnum("model_tier"),
    provider: modelProviderEnum("provider"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 14, scale: 6 }).notNull().default("0"),
    status: modelLogStatusEnum("status").notNull().default("success"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTrace: uniqueIndex("model_gateway_logs_trace_uidx").on(t.traceId),
    byTenantAgentDate: index("model_gateway_logs_tenant_agent_created_idx").on(t.tenantId, t.agentId, t.createdAt),
    byModelDate: index("model_gateway_logs_model_created_idx").on(t.modelName, t.createdAt),
    byStatusDate: index("model_gateway_logs_status_created_idx").on(t.status, t.createdAt),
  }),
);

export const evalCases = pgTable(
  "eval_cases",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    suiteName: text("suite_name").notNull(),
    caseName: text("case_name").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    expectedJsonSchema: jsonb("expected_json_schema").$type<Record<string, unknown>>().notNull().default({}),
    expectedTool: text("expected_tool"),
    expectedAssertions: jsonb("expected_assertions").$type<Array<Record<string, unknown>>>().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenantSuite: index("eval_cases_tenant_suite_idx").on(t.tenantId, t.suiteName, t.isActive),
  }),
);

export const evalRuns = pgTable(
  "eval_runs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    suiteName: text("suite_name").notNull(),
    modelId: integer("model_id").references(() => modelRegistry.id, { onDelete: "set null" }),
    status: evalRunStatusEnum("status").notNull().default("running"),
    score: numeric("score", { precision: 7, scale: 4 }),
    regressions: integer("regressions").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySuiteStatus: index("eval_runs_suite_status_idx").on(t.suiteName, t.status, t.createdAt),
    byTenantDate: index("eval_runs_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);

export const evalResults = pgTable(
  "eval_results",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    runId: bigint("run_id", { mode: "number" })
      .notNull()
      .references(() => evalRuns.id, { onDelete: "cascade" }),
    caseId: integer("case_id").references(() => evalCases.id, { onDelete: "set null" }),
    traceId: text("trace_id"),
    passed: boolean("passed").notNull().default(false),
    score: numeric("score", { precision: 7, scale: 4 }),
    assertions: jsonb("assertions").$type<Array<Record<string, unknown>>>().notNull().default([]),
    latencyMs: integer("latency_ms").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byRun: index("eval_results_run_idx").on(t.runId, t.createdAt),
    byCase: index("eval_results_case_idx").on(t.caseId, t.createdAt),
  }),
);

export const modelGatewayTraces = pgTable(
  "model_gateway_traces",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    traceId: text("trace_id").notNull(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    agentId: integer("agent_id").notNull(),
    sessionId: text("session_id"),
    messages: jsonb("messages").$type<Array<Record<string, unknown>>>().notNull().default([]),
    toolCalls: jsonb("tool_calls").$type<Array<Record<string, unknown>>>().notNull().default([]),
    toolResults: jsonb("tool_results").$type<Array<Record<string, unknown>>>().notNull().default([]),
    finalAnswer: text("final_answer"),
    rating: integer("rating"),
    modelName: text("model_name"),
    provider: modelProviderEnum("provider"),
    isGold: boolean("is_gold").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTrace: uniqueIndex("model_gateway_traces_trace_uidx").on(t.traceId),
    byTenantDate: index("model_gateway_traces_tenant_created_idx").on(t.tenantId, t.createdAt),
    byGoldDate: index("model_gateway_traces_gold_created_idx").on(t.tenantId, t.isGold, t.createdAt),
  }),
);

export type ModelRegistryRow = typeof modelRegistry.$inferSelect;
export type AgentModelPolicyRow = typeof agentModelPolicy.$inferSelect;
export type ModelGatewayLogRow = typeof modelGatewayLogs.$inferSelect;
