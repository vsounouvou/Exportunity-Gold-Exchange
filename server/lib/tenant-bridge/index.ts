import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "@db";
import {
  actionRequests,
  agentTasks,
  agents,
  communicationsMessages,
  communicationsThreads,
  tenantCommunicationProfiles,
} from "@db/schema";
import { AGENT_KEYS } from "../../agents";
import type { AgentKey } from "../../agents/types";
import { createActionRequest } from "../actions/ActionRouter";
import { DEFAULT_MINDBASE_AGENT_LIMITS, resolveMindbaseAgentRuntimeLimits } from "../mindbase/runtimeLimits";

type TenantMetricSnapshot = {
  activeAgents: number;
  inboxThreads: number;
  inboundToday: number;
  pendingApprovals: number;
  failedRuns: number;
  queuedTasks: number;
  connectedChannels: number;
};

type TenantAgentRecord = {
  id: number;
  tenantId: number | null;
  companyId: number | null;
  name: string;
  displayName: string | null;
  role: string | null;
  status: string | null;
  hierarchyLevel: string | null;
  maxDailyTokens: number | null;
  updatedAt: Date | null;
};

type TenantBridgeActionContext = {
  platformTenantId?: number | null;
  requestedByUserId?: number | null;
  requestedByAgentKey?: string | null;
  correlationId?: string | null;
  relatedConversationId?: string | null;
  relatedThreadId?: number | null;
  organizationId?: string | null;
  metadata?: Record<string, unknown>;
};

type ExecuteAgentTaskOptions = TenantBridgeActionContext & {
  taskType?: string | null;
  goal?: string | null;
  constraints?: Record<string, unknown> | null;
  budgetUsdCap?: number | null;
  budgetMaxCalls?: number | null;
  budgetMaxTokens?: number | null;
};

const MINDBASE_BRIDGE_AGENT_KEY = "chairman_assistant";

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function normalizeBridgeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeDescriptor(value: unknown) {
  return normalizeBridgeText(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePositiveInteger(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
}

function parsePositiveMoney(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function buildBridgeCorrelationId(prefix: string, agentId: number) {
  return `mindbase_${prefix}_${agentId}_${Date.now()}`;
}

async function getTenantAgentRecord(agentId: number, platformTenantId?: number | null): Promise<TenantAgentRecord | null> {
  const whereClause =
    platformTenantId && Number.isFinite(platformTenantId)
      ? and(eq(agents.id, agentId), eq(agents.tenantId, Number(platformTenantId)))
      : eq(agents.id, agentId);

  const row = await db.query.agents.findFirst({
    where: whereClause,
    columns: {
      id: true,
      tenantId: true,
      companyId: true,
      name: true,
      displayName: true,
      role: true,
      status: true,
      hierarchyLevel: true,
      maxDailyTokens: true,
      updatedAt: true,
    },
  });

  return (row as TenantAgentRecord | null) || null;
}

function projectTenantAgent(agent: TenantAgentRecord) {
  return {
    id: agent.id,
    name: agent.name,
    displayName: agent.displayName,
    role: agent.role,
    status: agent.status,
    hierarchyLevel: agent.hierarchyLevel,
    companyId: agent.companyId,
    updatedAt: agent.updatedAt,
  };
}

function resolveTenantBridgeAgentKey(agent: TenantAgentRecord): AgentKey {
  const descriptor = `${normalizeDescriptor(agent.role)} ${normalizeDescriptor(agent.displayName)} ${normalizeDescriptor(agent.name)}`;

  if (descriptor.includes("seo")) return "seo_autopilot";
  if (
    descriptor.includes("compliance") ||
    descriptor.includes("legal") ||
    descriptor.includes("risk") ||
    descriptor.includes("certif")
  ) {
    return "compliance";
  }
  if (
    descriptor.includes("media") ||
    descriptor.includes("content") ||
    descriptor.includes("visual") ||
    descriptor.includes("image") ||
    descriptor.includes("creative")
  ) {
    return "media";
  }
  if (
    descriptor.includes("client hunter") ||
    descriptor.includes("lead") ||
    descriptor.includes("sales") ||
    descriptor.includes("supplier") ||
    descriptor.includes("buyer")
  ) {
    return "client_hunter";
  }
  if (descriptor.includes("marketing") || descriptor.includes("growth")) {
    return "marketing";
  }
  if (
    descriptor.includes("data") ||
    descriptor.includes("analytics") ||
    descriptor.includes("research") ||
    descriptor.includes("intelligence")
  ) {
    return "data";
  }
  return "ops";
}

export async function getTenantAgents(platformTenantId: number) {
  return db.query.agents.findMany({
    where: eq(agents.tenantId, platformTenantId),
    orderBy: [desc(agents.updatedAt)],
    limit: 50,
    columns: {
      id: true,
      name: true,
      displayName: true,
      role: true,
      status: true,
      hierarchyLevel: true,
      companyId: true,
      updatedAt: true,
    },
  });
}

export async function getTenantAgentStatus(agentId: number) {
  const row = await getTenantAgentRecord(agentId);
  return row ? projectTenantAgent(row) : null;
}

export async function getTenantMetrics(platformTenantId: number): Promise<TenantMetricSnapshot> {
  const today = startOfTodayUtc();
  const [
    activeAgentsRows,
    threadRows,
    inboundRows,
    approvalsRows,
    failedRows,
    queuedTaskRows,
    channelRows,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(agents).where(and(eq(agents.tenantId, platformTenantId), eq(agents.status, "active"))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(communicationsThreads)
      .where(eq(communicationsThreads.tenantId, platformTenantId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(communicationsMessages)
      .where(
        and(
          eq(communicationsMessages.tenantId, platformTenantId),
          eq(communicationsMessages.direction, "inbound"),
          gte(communicationsMessages.createdAt, today),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(actionRequests)
      .where(and(eq(actionRequests.tenantId, platformTenantId), inArray(actionRequests.status, ["REQUIRES_APPROVAL", "PENDING", "QUEUED"]))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(actionRequests)
      .where(and(eq(actionRequests.tenantId, platformTenantId), inArray(actionRequests.lifecycleState, ["FAILED"]))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentTasks)
      .where(and(eq(agentTasks.tenantId, platformTenantId), inArray(agentTasks.executionStatus, ["queued", "running"]))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantCommunicationProfiles)
      .where(and(eq(tenantCommunicationProfiles.tenantId, platformTenantId), eq(tenantCommunicationProfiles.isActive, true))),
  ]);

  return {
    activeAgents: Number(activeAgentsRows[0]?.count || 0),
    inboxThreads: Number(threadRows[0]?.count || 0),
    inboundToday: Number(inboundRows[0]?.count || 0),
    pendingApprovals: Number(approvalsRows[0]?.count || 0),
    failedRuns: Number(failedRows[0]?.count || 0),
    queuedTasks: Number(queuedTaskRows[0]?.count || 0),
    connectedChannels: Number(channelRows[0]?.count || 0),
  };
}

export async function sendMessageToAgent(agentId: number, message: string, context: TenantBridgeActionContext = {}) {
  const body = normalizeBridgeText(message);
  if (!body) {
    throw new Error("message is required");
  }

  const agent = await getTenantAgentRecord(agentId, context.platformTenantId);
  if (!agent?.tenantId) {
    throw new Error("Target agent not found for linked tenant platform");
  }

  const actionRequest = await createActionRequest({
    tenantId: Number(agent.tenantId),
    requestedByUserId: context.requestedByUserId ?? null,
    requestedByAgentKey: context.requestedByAgentKey || MINDBASE_BRIDGE_AGENT_KEY,
    actionType: "CREATE_TASK",
    correlationId: context.correlationId || buildBridgeCorrelationId("message", agent.id),
    relatedConversationId: context.relatedConversationId || null,
    relatedThreadId: context.relatedThreadId ?? null,
    priority: 25,
    payload: {
      title: `MindBase message · ${agent.displayName || agent.name}`,
      description: body,
      body,
      agentId: agent.id,
      companyId: agent.companyId ?? undefined,
      priority: "medium",
      metadata: {
        source: "mindbase_control",
        bridgeType: "agent_message",
        organizationId: context.organizationId || null,
        targetAgentRole: agent.role,
        targetRuntimeKey: resolveTenantBridgeAgentKey(agent),
        ...(context.metadata || {}),
      },
    },
    mode: "REAL",
  });

  return {
    ok: true,
    mode: "action_request",
    agent: projectTenantAgent(agent),
    message: body,
    actionRequest,
  };
}

export async function executeAgentTask(
  agentId: number,
  payload: Record<string, unknown>,
  options: ExecuteAgentTaskOptions = {},
) {
  const agent = await getTenantAgentRecord(agentId, options.platformTenantId);
  if (!agent?.tenantId) {
    throw new Error("Target agent not found for linked tenant platform");
  }

  const runtimeKey = resolveTenantBridgeAgentKey(agent);
  if (!AGENT_KEYS.includes(runtimeKey)) {
    throw new Error(`No runtime mapping available for agent ${agent.id}`);
  }

  const runtimeLimits = resolveMindbaseAgentRuntimeLimits({
    maxSteps: parsePositiveInteger(options.budgetMaxCalls ?? payload.budgetMaxCalls ?? payload.budget_max_calls, DEFAULT_MINDBASE_AGENT_LIMITS.maxSteps),
    maxCostUsd: parsePositiveMoney(options.budgetUsdCap ?? payload.budgetUsdCap ?? payload.budget_usd_cap, DEFAULT_MINDBASE_AGENT_LIMITS.maxCostUsd),
  });

  const goal =
    normalizeBridgeText(options.goal) ||
    normalizeBridgeText(payload.goal) ||
    normalizeBridgeText(payload.instructions) ||
    normalizeBridgeText(payload.title) ||
    normalizeBridgeText(payload.message);

  if (!goal) {
    throw new Error("goal is required");
  }

  const taskType =
    normalizeBridgeText(options.taskType) ||
    normalizeBridgeText(payload.taskType) ||
    normalizeBridgeText(payload.task_type) ||
    "mindbase_control";

  const constraints = {
    source: "mindbase_control",
    bridgePayload: payload,
    organizationId: options.organizationId || null,
    targetAgentRole: agent.role,
    targetAgentName: agent.displayName || agent.name,
    ...(options.constraints || {}),
  };

  const budgetMaxTokens = parsePositiveInteger(
    options.budgetMaxTokens ?? payload.budgetMaxTokens ?? payload.budget_max_tokens,
    Number(agent.maxDailyTokens || 0),
  );
  const now = new Date();
  const [task] = await db
    .insert(agentTasks)
    .values({
      tenantId: Number(agent.tenantId),
      agentId: agent.id,
      agent: runtimeKey,
      taskType,
      taskSource: "manual",
      scriptGenerated: false,
      executionStatus: "queued",
      goal,
      budgetUsdCap: runtimeLimits.maxCostUsd.toFixed(2),
      budgetMaxCalls: runtimeLimits.maxSteps,
      budgetMaxTokens,
      status: "queued",
      constraints,
      createdByUserId: options.requestedByUserId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return {
    ok: true,
    mode: "agent_task",
    agent: projectTenantAgent(agent),
    runtimeKey,
    runtimeLimits,
    payload,
    task,
  };
}
