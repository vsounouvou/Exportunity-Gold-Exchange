import { relations, sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { agents, companies } from "../schema";
import { tasks } from "./tasks";

export const scriptRegistry = pgTable("script_registry", {
  id: serial("id").primaryKey(),
  scriptKey: text("script_key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  version: text("version").notNull().default("1.0.0"),
  executionMode: text("execution_mode", { enum: ["script", "rules", "llm_assist", "hybrid"] })
    .notNull()
    .default("script"),
  handlerType: text("handler_type", { enum: ["internal"] }).notNull().default("internal"),
  handlerConfig: jsonb("handler_config").$type<Record<string, unknown>>().notNull().default({}),
  inputSchema: jsonb("input_schema").$type<Record<string, unknown>>().notNull().default({}),
  outputSchema: jsonb("output_schema").$type<Record<string, unknown>>().notNull().default({}),
  permissions: jsonb("permissions")
    .$type<{
      allowedRoles?: string[];
      allowedAgentIds?: number[];
      minAutonomyLevel?: 0 | 1 | 2 | 3;
      requiresApproval?: boolean;
    }>()
    .notNull()
    .default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const taskScriptBindings = pgTable("task_script_bindings", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  scriptKey: text("script_key")
    .notNull()
    .references(() => scriptRegistry.scriptKey, { onDelete: "restrict" }),
  inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status", { enum: ["proposed", "confirmed", "running", "succeeded", "failed"] })
    .notNull()
    .default("proposed"),
  boundByAgentId: integer("bound_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
  approvedByAgentId: integer("approved_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  lastRunId: text("last_run_id"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const scriptRuns = pgTable("script_runs", {
  id: text("id").primaryKey().notNull(),
  scriptKey: text("script_key").notNull(),
  bindingId: integer("binding_id").references(() => taskScriptBindings.id, { onDelete: "set null" }),
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "set null" }),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  status: text("status", { enum: ["queued", "running", "succeeded", "failed"] }).notNull().default("queued"),
  inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull().default({}),
  outputs: jsonb("outputs").$type<Record<string, unknown>>().notNull().default({}),
  logs: text("logs"),
  error: text("error"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdByAgentId: integer("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const scriptRegistryRelations = relations(scriptRegistry, ({ many }) => ({
  bindings: many(taskScriptBindings),
}));

export const taskScriptBindingRelations = relations(taskScriptBindings, ({ one, many }) => ({
  task: one(tasks, { fields: [taskScriptBindings.taskId], references: [tasks.id] }),
  company: one(companies, { fields: [taskScriptBindings.companyId], references: [companies.id] }),
  script: one(scriptRegistry, { fields: [taskScriptBindings.scriptKey], references: [scriptRegistry.scriptKey] }),
  boundByAgent: one(agents, { fields: [taskScriptBindings.boundByAgentId], references: [agents.id] }),
  approvedByAgent: one(agents, { fields: [taskScriptBindings.approvedByAgentId], references: [agents.id] }),
  runs: many(scriptRuns),
}));

export const scriptRunRelations = relations(scriptRuns, ({ one }) => ({
  task: one(tasks, { fields: [scriptRuns.taskId], references: [tasks.id] }),
  company: one(companies, { fields: [scriptRuns.companyId], references: [companies.id] }),
  binding: one(taskScriptBindings, { fields: [scriptRuns.bindingId], references: [taskScriptBindings.id] }),
  createdByAgent: one(agents, { fields: [scriptRuns.createdByAgentId], references: [agents.id] }),
}));

