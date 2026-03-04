import { pgEnum, pgTable, serial, text, timestamp, integer, decimal, jsonb, index, boolean } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { eceUsers } from "./ece";

export const agentKeyEnum = pgEnum("agent_key", [
  "marketing",
  "client_hunter",
  "media",
  "ops",
  "compliance",
  "data",
  "seo_autopilot",
]);

export const agentTaskStatusEnum = pgEnum("agent_task_status", [
  "queued",
  "running",
  "paused",
  "completed",
  "error",
  "cancelled",
]);

export const agentActionLogStatusEnum = pgEnum("agent_action_log_status", ["running", "ok", "error", "skipped"]);

export const agentTasks = pgTable(
  "agent_tasks",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    agentId: integer("agent_id"),
    agent: agentKeyEnum("agent").notNull(),
    taskType: text("task_type").notNull().default("general"),
    taskSource: text("task_source", { enum: ["manual", "cron", "event"] }).notNull().default("manual"),
    scriptGenerated: boolean("script_generated").notNull().default(false),
    executionStatus: text("execution_status", {
      enum: ["queued", "running", "success", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    goal: text("goal").notNull(),
    budgetUsdCap: decimal("budget_usd_cap", { precision: 10, scale: 2 }).notNull().default("0.00"),
    budgetMaxCalls: integer("budget_max_calls").notNull().default(0),
    budgetMaxTokens: integer("budget_max_tokens").notNull().default(0),
    budgetUsedUsd: decimal("budget_used_usd", { precision: 10, scale: 4 }).notNull().default("0.0000"),
    callsUsed: integer("calls_used").notNull().default(0),
    tokensUsed: integer("tokens_used").notNull().default(0),
    status: agentTaskStatusEnum("status").notNull().default("queued"),
    constraints: jsonb("constraints").notNull().default({}),
    createdByUserId: integer("created_by_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    byTenant: index("agent_tasks_tenant_idx").on(t.tenantId),
    byTenantAgent: index("agent_tasks_tenant_agent_idx").on(t.tenantId, t.agent),
    byStatus: index("agent_tasks_status_idx").on(t.status),
    byExecutionStatus: index("agent_tasks_execution_status_idx").on(t.tenantId, t.executionStatus),
    byTenantAgentId: index("agent_tasks_tenant_agent_id_idx").on(t.tenantId, t.agentId),
  })
);

export const agentActionLogs = pgTable(
  "agent_action_logs",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    agent: agentKeyEnum("agent").notNull(),
    taskId: integer("task_id").references(() => agentTasks.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    estimatedCostUsd: decimal("estimated_cost_usd", { precision: 10, scale: 4 }).notNull().default("0.0000"),
    status: agentActionLogStatusEnum("status").notNull().default("ok"),
    outputSummary: text("output_summary"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    byTenant: index("agent_action_logs_tenant_idx").on(t.tenantId),
    byTask: index("agent_action_logs_task_idx").on(t.taskId),
    byAgent: index("agent_action_logs_agent_idx").on(t.agent),
    byStatus: index("agent_action_logs_status_idx").on(t.status),
  })
);
