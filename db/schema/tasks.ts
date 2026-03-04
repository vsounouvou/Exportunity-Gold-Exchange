import { pgTable, serial, text, integer, varchar, timestamp, boolean, jsonb, decimal } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { agents } from "../schema";

export const goals = pgTable("goals", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  ownerAgentId: integer("owner_agent_id").references(() => agents.id),
  title: text("title").notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).default("planned"),
  priority: varchar("priority", { length: 20 }).default("medium"),
  deadline: timestamp("deadline"),
  startDate: timestamp("start_date"),
  completedAt: timestamp("completed_at"),
  progress: integer("progress").default(0),
  parentGoalId: integer("parent_goal_id"),
  metadata: jsonb("metadata").$type<{
    keyResults?: string[];
    successCriteria?: string[];
    blockers?: string[];
    notes?: string;
  }>().default({}),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").references(() => agents.id),
  companyId: integer("company_id"),
  goalId: integer("goal_id").references(() => goals.id, { onDelete: 'set null' }),
  objectiveId: integer("objective_id").references(() => goals.id, { onDelete: 'set null' }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  priority: varchar("priority", { length: 20 }).default("medium"),
  status: varchar("status", { length: 20 }).default("backlog"),
  executionType: varchar("execution_type", { length: 20 }),
  dependencyIds: jsonb("dependency_ids").$type<number[]>().default([]),
  blockedByIds: jsonb("blocked_by_ids").$type<number[]>().default([]),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  dueDate: timestamp("due_date"),
  urgencyScore: integer("urgency_score").default(5),
  importanceScore: integer("importance_score").default(5),
  dependencyScore: integer("dependency_score").default(5),
  isAutomated: boolean("is_automated").default(false),
  
  isGroupTask: boolean("is_group_task").default(false),
  participantAgentIds: jsonb("participant_agent_ids").$type<number[]>().default([]),
  isRecurring: boolean("is_recurring").default(false),
  recurrenceRule: jsonb("recurrence_rule").$type<{
    pattern: 'daily' | 'weekly' | 'monthly' | 'custom';
    interval?: number;
    daysOfWeek?: number[];
    dayOfMonth?: number;
    endDate?: string;
  }>(),
  parentTaskId: integer("parent_task_id"),
  lastInstanceDate: timestamp("last_instance_date"),
  
  sourceMeetingId: integer("source_meeting_id"),
  sourceMessageId: integer("source_message_id"),
  lastMeetingId: integer("last_meeting_id"),
  approvalStatus: varchar("approval_status", { length: 20 }).default("pending"),
  approvedByAgentId: integer("approved_by_agent_id").references(() => agents.id),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  agentId: integer("agent_id").references(() => agents.id),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  eventCategory: varchar("event_category", { length: 30 }).default("general"),
  title: text("title").notNull(),
  description: text("description"),
  metadata: jsonb("metadata").$type<{
    goalId?: number;
    meetingId?: number;
    roomId?: number;
    taskId?: number;
    messageId?: number;
    targetAgentId?: number;
    tokensUsed?: number;
    cost?: number;
    taskCount?: number;
    knowledgeDocumentId?: number;
    oldValue?: any;
    newValue?: any;
  }>().default({}),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const meetingPurposes = pgTable("meeting_purposes", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull(),
  goalId: integer("goal_id").references(() => goals.id, { onDelete: 'set null' }),
  purpose: varchar("purpose", { length: 30 }).notNull(),
  topic: text("topic"),
  agenda: text("agenda"),
  expectedOutcome: text("expected_outcome"),
  tokenBudget: integer("token_budget").default(5000),
  tokensUsed: integer("tokens_used").default(0),
  isCompleted: boolean("is_completed").default(false),
  completedAt: timestamp("completed_at"),
  taskCount: integer("task_count").default(0),
  decisionsReached: integer("decisions_reached").default(0),
  efficiencyScore: decimal("efficiency_score", { precision: 5, scale: 2 }),
  summary: text("summary"),
  nextSteps: jsonb("next_steps").$type<string[]>().default([]),
  linkedTaskIds: jsonb("linked_task_ids").$type<number[]>().default([]),
  createdTaskIds: jsonb("created_task_ids").$type<number[]>().default([]),
  participantAgentIds: jsonb("participant_agent_ids").$type<number[]>().default([]),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const agentRoleTemplates = pgTable("agent_role_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  roleLevel: integer("role_level").notNull(),
  department: text("department"),
  contextWindowTokens: integer("context_window_tokens").notNull().default(4000),
  decisionAuthority: varchar("decision_authority", { length: 20 }).default("low"),
  communicationStyle: jsonb("communication_style").$type<{
    tone?: 'formal' | 'friendly' | 'neutral' | 'direct';
    verbosity?: 'concise' | 'moderate' | 'detailed';
    emoji?: boolean;
  }>().default({}),
  defaultResponsibilities: jsonb("default_responsibilities").$type<string[]>().default([]),
  defaultSkills: jsonb("default_skills").$type<string[]>().default([]),
  requiredApprovalLevel: integer("required_approval_level").default(0),
  canApproveBelow: boolean("can_approve_below").default(false),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const goalsRelations = relations(goals, ({ one, many }) => ({
  ownerAgent: one(agents, {
    fields: [goals.ownerAgentId],
    references: [agents.id],
  }),
  tasks: many(tasks),
  meetings: many(meetingPurposes),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  agent: one(agents, {
    fields: [tasks.agentId],
    references: [agents.id],
  }),
  approver: one(agents, {
    fields: [tasks.approvedByAgentId],
    references: [agents.id],
  }),
  goal: one(goals, {
    fields: [tasks.goalId],
    references: [goals.id],
  }),
  objective: one(goals, {
    fields: [tasks.objectiveId],
    references: [goals.id],
  }),
}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  agent: one(agents, {
    fields: [activityLog.agentId],
    references: [agents.id],
  }),
}));

export const meetingPurposesRelations = relations(meetingPurposes, ({ one }) => ({
  goal: one(goals, {
    fields: [meetingPurposes.goalId],
    references: [goals.id],
  }),
}));

export const taskDependencies = pgTable("task_dependencies", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  dependencyId: integer("dependency_id").notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const taskDependenciesRelations = relations(taskDependencies, ({ one }) => ({
  task: one(tasks, {
    fields: [taskDependencies.taskId],
    references: [tasks.id],
  }),
  dependency: one(tasks, {
    fields: [taskDependencies.dependencyId],
    references: [tasks.id],
  }),
}));
