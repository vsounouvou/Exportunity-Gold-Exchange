
import { db } from "@db";
import {
  intelligenceAgentPolicies,
  intelligenceAlerts,
  intelligenceAuditEvents,
  intelligenceCronJobs,
  intelligenceTasks,
  intelligenceTokenLedger,
  scriptRegistry,
} from "@db/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getInternalScript } from "../scripts/registry";
import { computeNextScheduledRun } from "./cronUtils";
import { type IntelligenceTier, parseIntelligenceCronKind, parseIntelligenceTier } from "./policyDefaults";
import {
  assertGovernedTaskTransition,
  type GovernedTaskState,
  normalizeGovernedTaskState,
} from "./stateMachine";
import { computeStableJsonHash, signHash, verifyHashSignature } from "./signing";
import { parseWorkflowSpec, type WorkflowSpec } from "./workflowSpec";

export type AuditActorType = "SUPER" | "MANAGER" | "EXECUTION" | "SYSTEM" | "USER";

export type GovernedTaskSource =
  | "MANUAL"
  | "CRON_TIME"
  | "CRON_EVENT"
  | "CRON_MONITOR"
  | "CRON_REGENERATION"
  | "ESCALATION";

export type CreateGovernedTaskInput = {
  tenantId: number;
  moduleId: string;
  title: string;
  instruction: string;
  objective?: string | null;
  managerTier?: IntelligenceTier;
  policyTier?: IntelligenceTier;
  priority?: number;
  source?: GovernedTaskSource;
  tokenBudget?: number | null;
  managerAgentId?: number | null;
  executionAgentId?: number | null;
  cronJobId?: number | null;
  createdByUserId?: number | null;
  metadata?: Record<string, unknown>;
};

export type TransitionGovernedTaskInput = {
  taskId: number;
  toState: GovernedTaskState;
  actorType: AuditActorType;
  actorId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  payload?: Record<string, unknown>;
};

export type CreateGovernedCronJobInput = {
  tenantId: number;
  name: string;
  cronKind: "TIME" | "EVENT" | "MONITOR" | "REGENERATION";
  triggerMode?: "SCHEDULE" | "EVENT";
  scheduleCron?: string | null;
  eventKey?: string | null;
  moduleId: string;
  policyTier?: IntelligenceTier;
  workflowTemplate?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdByUserId?: number | null;
};

export type TriggerGovernedCronJobInput = {
  tenantId: number;
  cronJobId: number;
  actorType: AuditActorType;
  actorId?: string | null;
  createdByUserId?: number | null;
};

function getRows<T = any>(result: unknown): T[] {
  if (Array.isArray((result as any)?.rows)) return (result as any).rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function asPositiveInt(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function asPriority(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-1000, Math.min(1000, Math.trunc(parsed)));
}

function toPublicTaskId(id: number) {
  return `INT-${String(id).padStart(6, "0")}`;
}

function resolveTaskSourceFromCronKind(kind: "TIME" | "EVENT" | "MONITOR" | "REGENERATION"): GovernedTaskSource {
  if (kind === "TIME") return "CRON_TIME";
  if (kind === "EVENT") return "CRON_EVENT";
  if (kind === "MONITOR") return "CRON_MONITOR";
  return "CRON_REGENERATION";
}

export async function listIntelligencePolicies(tenantId: number) {
  return db
    .select()
    .from(intelligenceAgentPolicies)
    .where(
      and(
        eq(intelligenceAgentPolicies.active, true),
        sql`${intelligenceAgentPolicies.tenantId} = ${tenantId} or ${intelligenceAgentPolicies.tenantId} is null`,
      ),
    )
    .orderBy(
      asc(intelligenceAgentPolicies.tenantId),
      asc(intelligenceAgentPolicies.agentTier),
      desc(intelligenceAgentPolicies.updatedAt),
    );
}

export async function getActivePolicyForTier(input: { tenantId: number; tier: IntelligenceTier }) {
  const rows = getRows<any>(
    await db.execute(sql`
      select *
      from intelligence_agent_policies
      where active = true
        and agent_tier = ${input.tier}
        and (tenant_id = ${input.tenantId} or tenant_id is null)
      order by case when tenant_id = ${input.tenantId} then 0 else 1 end, id desc
      limit 1
    `),
  );
  return rows[0] ?? null;
}

export async function upsertTenantPolicy(input: {
  tenantId: number;
  tier: IntelligenceTier;
  maxContext: number;
  maxReasoningDepth: number;
  maxTokenBudgetPerTask: number;
  maxTasksPerHour: number;
  allowCrossTenant: boolean;
  allowLlm: boolean;
  metadata?: Record<string, unknown>;
  userId?: number | null;
}) {
  const existing = await db.query.intelligenceAgentPolicies.findFirst({
    where: and(
      eq(intelligenceAgentPolicies.tenantId, input.tenantId),
      eq(intelligenceAgentPolicies.agentTier, input.tier),
      eq(intelligenceAgentPolicies.active, true),
    ),
  });

  const payload = {
    maxContext: Math.max(-1, Math.trunc(input.maxContext)),
    maxReasoningDepth: Math.max(0, Math.trunc(input.maxReasoningDepth)),
    maxTokenBudgetPerTask: Math.max(-1, Math.trunc(input.maxTokenBudgetPerTask)),
    maxTasksPerHour: Math.max(-1, Math.trunc(input.maxTasksPerHour)),
    allowCrossTenant: Boolean(input.allowCrossTenant),
    allowLlm: Boolean(input.allowLlm),
    metadata: input.metadata ?? {},
    updatedByUserId: input.userId ?? null,
    updatedAt: new Date(),
  };

  if (existing) {
    const [updated] = await db
      .update(intelligenceAgentPolicies)
      .set(payload)
      .where(eq(intelligenceAgentPolicies.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(intelligenceAgentPolicies)
    .values({
      tenantId: input.tenantId,
      agentTier: input.tier,
      ...payload,
      createdByUserId: input.userId ?? null,
      createdAt: new Date(),
    })
    .returning();

  return created;
}
async function enforceTaskRateLimit(tenantId: number, tier: IntelligenceTier, maxTasksPerHour: number) {
  if (maxTasksPerHour < 0) return;

  const rows = getRows<{ total: number }>(
    await db.execute(sql`
      select count(*)::int as total
      from intelligence_tasks
      where tenant_id = ${tenantId}
        and manager_tier = ${tier}
        and created_at >= now() - interval '1 hour'
    `),
  );
  const total = Number(rows[0]?.total || 0);

  if (total < maxTasksPerHour) return;

  await createIntelligenceAlert({
    tenantId,
    severity: "critical",
    code: "TASK_RATE_LIMIT_EXCEEDED",
    message: `Task rate exceeded for tier ${tier}: ${total}/${maxTasksPerHour} in the last hour`,
    details: { tier, total, maxTasksPerHour },
  });

  throw new Error(`TASK_RATE_LIMIT_EXCEEDED: tier=${tier} limit=${maxTasksPerHour} lastHour=${total}`);
}

export async function recordIntelligenceAuditEvent(input: {
  tenantId?: number | null;
  taskId?: number | null;
  cronJobId?: number | null;
  actorType: AuditActorType;
  actorId?: string | null;
  eventType: string;
  beforeState?: string | null;
  afterState?: string | null;
  payload?: Record<string, unknown>;
}) {
  const payload = input.payload ?? {};
  const immutableHash = computeStableJsonHash({
    tenantId: input.tenantId ?? null,
    taskId: input.taskId ?? null,
    cronJobId: input.cronJobId ?? null,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    eventType: input.eventType,
    beforeState: input.beforeState ?? null,
    afterState: input.afterState ?? null,
    payload,
  });

  const [created] = await db
    .insert(intelligenceAuditEvents)
    .values({
      tenantId: input.tenantId ?? null,
      taskId: input.taskId ?? null,
      cronJobId: input.cronJobId ?? null,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      eventType: input.eventType,
      beforeState: input.beforeState ?? null,
      afterState: input.afterState ?? null,
      payload,
      immutableHash,
      createdAt: new Date(),
    })
    .returning();

  return created;
}

export async function recordTokenLedgerEntry(input: {
  tenantId: number;
  taskId?: number | null;
  policyId?: number | null;
  actorTier: IntelligenceTier;
  eventType: "ALLOCATE" | "CONSUME" | "REFUND" | "VIOLATION" | "THROTTLE";
  tokensDelta: number;
  tokenBalanceAfter?: number | null;
  metadata?: Record<string, unknown>;
}) {
  const [entry] = await db
    .insert(intelligenceTokenLedger)
    .values({
      tenantId: input.tenantId,
      taskId: input.taskId ?? null,
      policyId: input.policyId ?? null,
      actorTier: input.actorTier,
      eventType: input.eventType,
      tokensDelta: Math.trunc(input.tokensDelta),
      tokenBalanceAfter: input.tokenBalanceAfter ?? null,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    })
    .returning();
  return entry;
}

export async function createIntelligenceAlert(input: {
  tenantId?: number | null;
  taskId?: number | null;
  cronJobId?: number | null;
  severity: "info" | "warning" | "critical";
  code: string;
  message: string;
  details?: Record<string, unknown>;
}) {
  const [alert] = await db
    .insert(intelligenceAlerts)
    .values({
      tenantId: input.tenantId ?? null,
      taskId: input.taskId ?? null,
      cronJobId: input.cronJobId ?? null,
      severity: input.severity,
      code: input.code,
      message: input.message,
      details: input.details ?? {},
      createdAt: new Date(),
    })
    .returning();
  return alert;
}

export async function createGovernedTask(input: CreateGovernedTaskInput) {
  const managerTier = parseIntelligenceTier(input.managerTier ?? "MANAGER", "MANAGER");
  const policyTier = parseIntelligenceTier(input.policyTier ?? managerTier, managerTier);
  const policy = await getActivePolicyForTier({ tenantId: input.tenantId, tier: policyTier });

  if (!policy) {
    throw new Error(`POLICY_NOT_FOUND: tenant=${input.tenantId} tier=${policyTier}`);
  }

  await enforceTaskRateLimit(input.tenantId, managerTier, Number(policy.max_tasks_per_hour ?? policy.maxTasksPerHour ?? 30));

  const policyBudget = Number(policy.max_token_budget_per_task ?? policy.maxTokenBudgetPerTask ?? 0);
  const requestedBudget = input.tokenBudget == null ? policyBudget : Math.trunc(input.tokenBudget);

  let finalBudget = requestedBudget;
  if (policyBudget >= 0 && requestedBudget > policyBudget) {
    finalBudget = policyBudget;
    await createIntelligenceAlert({
      tenantId: input.tenantId,
      severity: "warning",
      code: "TOKEN_BUDGET_CLAMPED",
      message: `Requested task budget ${requestedBudget} exceeded policy budget ${policyBudget}`,
      details: {
        policyTier,
        requestedBudget,
        policyBudget,
      },
    });
  }

  const [created] = await db
    .insert(intelligenceTasks)
    .values({
      tenantId: input.tenantId,
      moduleId: asText(input.moduleId),
      policyId: Number(policy.id),
      cronJobId: input.cronJobId ?? null,
      managerAgentId: input.managerAgentId ?? null,
      executionAgentId: input.executionAgentId ?? null,
      managerTier: managerTier === "SUPER" ? "SUPER" : "MANAGER",
      executionTier: "EXECUTION",
      state: "CREATED",
      priority: asPriority(input.priority),
      title: asText(input.title) || "Governed task",
      instruction: asText(input.instruction) || "Execute governed workflow",
      objective: asText(input.objective) || null,
      source: input.source ?? "MANUAL",
      tokenBudget: finalBudget,
      tokensUsed: 0,
      metadata: input.metadata ?? {},
      createdByUserId: input.createdByUserId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  const publicTaskId = toPublicTaskId(Number(created.id));
  const [withPublicId] = await db
    .update(intelligenceTasks)
    .set({ publicTaskId, updatedAt: new Date() })
    .where(eq(intelligenceTasks.id, created.id))
    .returning();

  await recordIntelligenceAuditEvent({
    tenantId: input.tenantId,
    taskId: created.id,
    cronJobId: input.cronJobId ?? null,
    actorType: managerTier === "SUPER" ? "SUPER" : "MANAGER",
    actorId: input.createdByUserId ? String(input.createdByUserId) : null,
    eventType: "TASK_CREATED",
    beforeState: null,
    afterState: "CREATED",
    payload: {
      moduleId: input.moduleId,
      source: input.source ?? "MANUAL",
      policyId: policy.id,
      tokenBudget: finalBudget,
    },
  });

  await recordTokenLedgerEntry({
    tenantId: input.tenantId,
    taskId: created.id,
    policyId: Number(policy.id),
    actorTier: policyTier,
    eventType: "ALLOCATE",
    tokensDelta: finalBudget,
    tokenBalanceAfter: finalBudget,
    metadata: { source: "task_create" },
  });

  return withPublicId ?? created;
}

export async function getGovernedTaskById(taskId: number) {
  const id = asPositiveInt(taskId, 0);
  if (!id) return null;
  return db.query.intelligenceTasks.findFirst({ where: eq(intelligenceTasks.id, id) });
}
export async function listGovernedTasks(input: {
  tenantId: number;
  state?: GovernedTaskState | null;
  limit?: number;
  moduleId?: string | null;
}) {
  const whereParts = [eq(intelligenceTasks.tenantId, input.tenantId)];
  if (input.state) whereParts.push(eq(intelligenceTasks.state, input.state));
  if (input.moduleId) whereParts.push(eq(intelligenceTasks.moduleId, input.moduleId));

  const limit = Math.max(1, Math.min(500, Math.trunc(input.limit ?? 100)));

  return db.query.intelligenceTasks.findMany({
    where: and(...whereParts),
    orderBy: [desc(intelligenceTasks.priority), desc(intelligenceTasks.createdAt)],
    limit,
  });
}

function stateTimePatch(state: GovernedTaskState, stamp: Date) {
  const patch: Record<string, unknown> = {};
  if (state === "PLANNED") patch.plannedAt = stamp;
  if (state === "SCRIPTED") patch.scriptedAt = stamp;
  if (state === "QUEUED") patch.queuedAt = stamp;
  if (state === "RUNNING") patch.runningAt = stamp;
  if (state === "VERIFIED") patch.verifiedAt = stamp;
  if (state === "REPORTED") {
    patch.reportedAt = stamp;
    patch.finishedAt = stamp;
    patch.leaseUntil = null;
    patch.claimedBy = null;
  }
  if (state === "FAILED" || state === "CANCELLED") {
    patch.finishedAt = stamp;
    patch.leaseUntil = null;
    patch.claimedBy = null;
  }
  return patch;
}

export async function transitionGovernedTaskState(input: TransitionGovernedTaskInput) {
  const task = await getGovernedTaskById(input.taskId);
  if (!task) throw new Error(`TASK_NOT_FOUND: id=${input.taskId}`);

  const current = normalizeGovernedTaskState(task.state);
  if (!current) throw new Error(`TASK_STATE_INVALID: id=${input.taskId}`);

  if (current === input.toState) return task;

  assertGovernedTaskTransition(current, input.toState);

  const now = new Date();
  const patch = {
    state: input.toState,
    updatedAt: now,
    ...stateTimePatch(input.toState, now),
    ...(input.errorCode !== undefined ? { lastErrorCode: input.errorCode } : {}),
    ...(input.errorMessage !== undefined ? { lastError: input.errorMessage } : {}),
  };

  const [updated] = await db
    .update(intelligenceTasks)
    .set(patch as any)
    .where(eq(intelligenceTasks.id, task.id))
    .returning();

  await recordIntelligenceAuditEvent({
    tenantId: task.tenantId,
    taskId: task.id,
    cronJobId: task.cronJobId,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    eventType: "TASK_STATE_CHANGED",
    beforeState: current,
    afterState: input.toState,
    payload: {
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      ...(input.payload ?? {}),
    },
  });

  return updated;
}

async function ensureWorkflowScriptsExist(spec: WorkflowSpec) {
  const uniqueKeys = Array.from(new Set(spec.steps.map((step) => step.scriptKey)));
  const unresolved = uniqueKeys.filter((scriptKey) => !getInternalScript(scriptKey));

  if (!unresolved.length) return;

  const rows = await db
    .select({ scriptKey: scriptRegistry.scriptKey })
    .from(scriptRegistry)
    .where(and(eq(scriptRegistry.isActive, true), inArray(scriptRegistry.scriptKey, unresolved)));

  const dbKeys = new Set(rows.map((row) => row.scriptKey));
  const missing = unresolved.filter((key) => !dbKeys.has(key));

  if (missing.length) {
    throw new Error(`WORKFLOW_SCRIPT_NOT_FOUND: ${missing.join(",")}`);
  }
}

function buildScriptHashFromSpec(spec: WorkflowSpec) {
  const reduced = spec.steps.map((step) => ({
    stepId: step.stepId,
    scriptKey: step.scriptKey,
    input: step.input,
    retries: step.retries,
    onFailure: step.onFailure,
  }));
  return computeStableJsonHash(reduced);
}

export async function attachWorkflowSpecToTask(input: {
  taskId: number;
  workflowSpec: unknown;
  actorType: AuditActorType;
  actorId?: string | null;
}) {
  const task = await getGovernedTaskById(input.taskId);
  if (!task) throw new Error(`TASK_NOT_FOUND: id=${input.taskId}`);

  const parsed = parseWorkflowSpec(input.workflowSpec);
  if (parsed.tenantId !== task.tenantId) {
    throw new Error(`WORKFLOW_TENANT_MISMATCH: spec=${parsed.tenantId} task=${task.tenantId}`);
  }

  if (parsed.moduleId !== task.moduleId) {
    throw new Error(`WORKFLOW_MODULE_MISMATCH: spec=${parsed.moduleId} task=${task.moduleId}`);
  }

  await ensureWorkflowScriptsExist(parsed);

  const currentState = normalizeGovernedTaskState(task.state);
  if (!currentState) throw new Error(`TASK_STATE_INVALID: id=${task.id}`);

  if (currentState === "CREATED") {
    await transitionGovernedTaskState({
      taskId: task.id,
      toState: "PLANNED",
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      payload: { reason: "auto_plan_before_script" },
    });
  } else if (currentState === "SCRIPTED") {
    await transitionGovernedTaskState({
      taskId: task.id,
      toState: "PLANNED",
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      payload: { reason: "replan_before_resign" },
    });
  } else if (currentState !== "PLANNED") {
    throw new Error(`TASK_NOT_READY_FOR_WORKFLOW: state=${currentState}`);
  }

  const workflowHash = computeStableJsonHash(parsed);
  const scriptHash = buildScriptHashFromSpec(parsed);
  const scriptSignature = signHash(scriptHash);

  await db
    .update(intelligenceTasks)
    .set({
      workflowSpec: parsed,
      workflowHash,
      scriptHash,
      scriptSignature,
      scriptVersion: parsed.version,
      updatedAt: new Date(),
    })
    .where(eq(intelligenceTasks.id, task.id));

  await recordIntelligenceAuditEvent({
    tenantId: task.tenantId,
    taskId: task.id,
    cronJobId: task.cronJobId,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    eventType: "WORKFLOW_SIGNED",
    payload: {
      workflowId: parsed.workflowId,
      workflowHash,
      scriptHash,
    },
  });

  return transitionGovernedTaskState({
    taskId: task.id,
    toState: "SCRIPTED",
    actorType: input.actorType,
    actorId: input.actorId ?? null,
  });
}

export async function verifyTaskWorkflowSignature(taskId: number) {
  const task = await getGovernedTaskById(taskId);
  if (!task) return { ok: false as const, reason: "TASK_NOT_FOUND" };

  const spec = asRecord(task.workflowSpec);
  const scriptHash = asText(task.scriptHash);
  const signature = asText(task.scriptSignature);

  if (!Object.keys(spec).length || !scriptHash || !signature) {
    return { ok: false as const, reason: "MISSING_SIGNED_WORKFLOW" };
  }

  let parsed: WorkflowSpec;
  try {
    parsed = parseWorkflowSpec(spec);
  } catch (error: any) {
    return { ok: false as const, reason: String(error?.message || error || "INVALID_WORKFLOW_SPEC") };
  }

  const computedScriptHash = buildScriptHashFromSpec(parsed);
  if (computedScriptHash !== scriptHash) {
    return { ok: false as const, reason: "SCRIPT_HASH_MISMATCH" };
  }

  const valid = verifyHashSignature(scriptHash, signature);
  if (!valid) return { ok: false as const, reason: "SIGNATURE_INVALID" };

  return { ok: true as const, workflow: parsed, scriptHash, signature };
}

export async function queueGovernedTask(input: { taskId: number; actorType: AuditActorType; actorId?: string | null }) {
  const task = await getGovernedTaskById(input.taskId);
  if (!task) throw new Error(`TASK_NOT_FOUND: id=${input.taskId}`);

  const state = normalizeGovernedTaskState(task.state);
  if (!state) throw new Error(`TASK_STATE_INVALID: id=${input.taskId}`);

  if (state === "QUEUED") return task;
  if (state !== "SCRIPTED") throw new Error(`TASK_NOT_READY_FOR_QUEUE: state=${state}`);

  return transitionGovernedTaskState({
    taskId: task.id,
    toState: "QUEUED",
    actorType: input.actorType,
    actorId: input.actorId ?? null,
  });
}

export async function recordTaskTokenConsumption(input: {
  taskId: number;
  tokensUsed: number;
  actorTier?: IntelligenceTier;
  reason?: string;
  metadata?: Record<string, unknown>;
}) {
  const task = await getGovernedTaskById(input.taskId);
  if (!task) throw new Error(`TASK_NOT_FOUND: id=${input.taskId}`);

  const tokens = Math.max(0, Math.trunc(input.tokensUsed));
  if (!tokens) {
    return { withinBudget: true, tokenBalanceAfter: task.tokenBudget >= 0 ? task.tokenBudget - task.tokensUsed : null };
  }

  const newUsed = Math.max(0, Number(task.tokensUsed || 0) + tokens);
  const budget = Number(task.tokenBudget || 0);
  const balance = budget >= 0 ? budget - newUsed : null;

  await db
    .update(intelligenceTasks)
    .set({ tokensUsed: newUsed, updatedAt: new Date() })
    .where(eq(intelligenceTasks.id, task.id));

  await recordTokenLedgerEntry({
    tenantId: task.tenantId,
    taskId: task.id,
    policyId: task.policyId,
    actorTier: input.actorTier ?? parseIntelligenceTier(task.executionTier, "EXECUTION"),
    eventType: "CONSUME",
    tokensDelta: -tokens,
    tokenBalanceAfter: balance,
    metadata: {
      reason: input.reason ?? "task_execution",
      ...(input.metadata ?? {}),
    },
  });

  const withinBudget = budget < 0 || newUsed <= budget;
  if (withinBudget) {
    return { withinBudget, tokenBalanceAfter: balance };
  }

  await recordTokenLedgerEntry({
    tenantId: task.tenantId,
    taskId: task.id,
    policyId: task.policyId,
    actorTier: input.actorTier ?? parseIntelligenceTier(task.executionTier, "EXECUTION"),
    eventType: "VIOLATION",
    tokensDelta: 0,
    tokenBalanceAfter: balance,
    metadata: {
      budget,
      newUsed,
      overBy: newUsed - budget,
      reason: input.reason ?? "budget_exceeded",
    },
  });

  await createIntelligenceAlert({
    tenantId: task.tenantId,
    taskId: task.id,
    severity: "critical",
    code: "TOKEN_BUDGET_EXCEEDED",
    message: `Task ${task.publicTaskId || task.id} exceeded token budget (${newUsed}/${budget})`,
    details: { budget, newUsed, overBy: newUsed - budget },
  });

  await recordIntelligenceAuditEvent({
    tenantId: task.tenantId,
    taskId: task.id,
    actorType: "SYSTEM",
    eventType: "TOKEN_BUDGET_EXCEEDED",
    beforeState: task.state,
    afterState: task.state,
    payload: {
      budget,
      newUsed,
      overBy: newUsed - budget,
    },
  });

  return { withinBudget, tokenBalanceAfter: balance };
}
export async function createGovernedCronJob(input: CreateGovernedCronJobInput) {
  const triggerMode = String(input.triggerMode || "SCHEDULE").trim().toUpperCase() === "EVENT" ? "EVENT" : "SCHEDULE";
  const cronKind = parseIntelligenceCronKind(input.cronKind, "TIME");
  const policyTier = parseIntelligenceTier(input.policyTier ?? "EXECUTION", "EXECUTION");
  const nextRunAt =
    triggerMode === "SCHEDULE"
      ? computeNextScheduledRun({ scheduleCron: input.scheduleCron, metadata: input.metadata ?? {} })
      : null;

  const [created] = await db
    .insert(intelligenceCronJobs)
    .values({
      tenantId: input.tenantId,
      name: asText(input.name) || "Governed cron",
      cronKind,
      triggerMode,
      scheduleCron: asText(input.scheduleCron) || null,
      eventKey: asText(input.eventKey) || null,
      moduleId: asText(input.moduleId) || "general",
      policyTier,
      workflowTemplate: input.workflowTemplate ?? {},
      isActive: true,
      nextRunAt,
      metadata: input.metadata ?? {},
      createdByUserId: input.createdByUserId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  await recordIntelligenceAuditEvent({
    tenantId: input.tenantId,
    cronJobId: created.id,
    actorType: "USER",
    actorId: input.createdByUserId ? String(input.createdByUserId) : null,
    eventType: "CRON_JOB_CREATED",
    payload: {
      cronKind,
      triggerMode,
      moduleId: created.moduleId,
      nextRunAt: nextRunAt?.toISOString() ?? null,
    },
  });

  return created;
}

export async function listGovernedCronJobs(input: { tenantId: number; includeInactive?: boolean }) {
  const where = input.includeInactive
    ? eq(intelligenceCronJobs.tenantId, input.tenantId)
    : and(eq(intelligenceCronJobs.tenantId, input.tenantId), eq(intelligenceCronJobs.isActive, true));

  return db.query.intelligenceCronJobs.findMany({
    where,
    orderBy: [asc(intelligenceCronJobs.cronKind), asc(intelligenceCronJobs.name), asc(intelligenceCronJobs.id)],
    limit: 1000,
  });
}

function buildWorkflowSpecFromTemplate(templateInput: unknown, fallback: { tenantId: number; moduleId: string; cronJobId: number }) {
  const template = asRecord(templateInput);
  if (!Object.keys(template).length) return null;

  if (Array.isArray(template.steps)) {
    const candidate: Record<string, unknown> = {
      version: "1.0",
      workflowId: asText(template.workflowId) || `cron-${fallback.cronJobId}`,
      tenantId: asPositiveInt(template.tenantId, fallback.tenantId),
      moduleId: asText(template.moduleId) || fallback.moduleId,
      managerTier: asText(template.managerTier) || "MANAGER",
      executionTier: "EXECUTION",
      metadata: asRecord(template.metadata),
      steps: template.steps,
    };
    return candidate;
  }

  if (template.workflowSpec && typeof template.workflowSpec === "object") {
    return asRecord(template.workflowSpec);
  }

  return null;
}

async function createTaskFromCronJob(input: {
  job: typeof intelligenceCronJobs.$inferSelect;
  actorType: AuditActorType;
  actorId?: string | null;
  createdByUserId?: number | null;
}) {
  const template = asRecord(input.job.workflowTemplate);
  const now = new Date();
  const title = asText(template.title) || `${input.job.name} @ ${now.toISOString()}`;
  const instruction =
    asText(template.instruction) ||
    `Execute ${input.job.cronKind.toLowerCase()} governed workflow for module ${input.job.moduleId}`;
  const objective = asText(template.objective) || null;
  const managerTier = parseIntelligenceTier(template.managerTier ?? input.job.policyTier ?? "MANAGER", "MANAGER");
  const policyTier = parseIntelligenceTier(input.job.policyTier ?? managerTier, managerTier);

  const created = await createGovernedTask({
    tenantId: input.job.tenantId,
    moduleId: input.job.moduleId,
    title,
    instruction,
    objective,
    managerTier,
    policyTier,
    priority: asPriority(template.priority),
    source: resolveTaskSourceFromCronKind(parseIntelligenceCronKind(input.job.cronKind, "TIME")),
    tokenBudget: asPositiveInt(template.tokenBudget, 0) || null,
    managerAgentId: asPositiveInt(template.managerAgentId, 0) || null,
    executionAgentId: asPositiveInt(template.executionAgentId, 0) || null,
    cronJobId: input.job.id,
    createdByUserId: input.createdByUserId ?? null,
    metadata: {
      trigger: "cron",
      cronJobId: input.job.id,
      cronKind: input.job.cronKind,
      triggerMode: input.job.triggerMode,
      eventKey: input.job.eventKey,
      ...(asRecord(template.taskMetadata) ?? {}),
    },
  });

  const workflowCandidate = buildWorkflowSpecFromTemplate(template, {
    tenantId: input.job.tenantId,
    moduleId: input.job.moduleId,
    cronJobId: input.job.id,
  });

  if (!workflowCandidate) {
    await createIntelligenceAlert({
      tenantId: input.job.tenantId,
      taskId: created.id,
      cronJobId: input.job.id,
      severity: "warning",
      code: "CRON_WORKFLOW_MISSING",
      message: `Cron job ${input.job.name} executed without workflow steps`,
      details: { cronJobId: input.job.id },
    });
    return created;
  }

  await attachWorkflowSpecToTask({
    taskId: created.id,
    workflowSpec: workflowCandidate,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
  });

  await queueGovernedTask({
    taskId: created.id,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
  });

  return getGovernedTaskById(created.id);
}
export async function triggerGovernedCronJobNow(input: TriggerGovernedCronJobInput) {
  const job = await db.query.intelligenceCronJobs.findFirst({
    where: and(eq(intelligenceCronJobs.id, input.cronJobId), eq(intelligenceCronJobs.tenantId, input.tenantId)),
  });

  if (!job) throw new Error(`CRON_JOB_NOT_FOUND: id=${input.cronJobId}`);
  if (!job.isActive) throw new Error(`CRON_JOB_INACTIVE: id=${input.cronJobId}`);

  const task = await createTaskFromCronJob({
    job,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    createdByUserId: input.createdByUserId ?? null,
  });

  const nextRunAt =
    job.triggerMode === "SCHEDULE"
      ? computeNextScheduledRun({ scheduleCron: job.scheduleCron, metadata: asRecord(job.metadata) })
      : job.nextRunAt;

  await db
    .update(intelligenceCronJobs)
    .set({
      lastRunAt: new Date(),
      nextRunAt,
      failureCount: 0,
      updatedAt: new Date(),
    })
    .where(eq(intelligenceCronJobs.id, job.id));

  await recordIntelligenceAuditEvent({
    tenantId: input.tenantId,
    cronJobId: job.id,
    taskId: task?.id ?? null,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    eventType: "CRON_JOB_TRIGGERED",
    payload: {
      taskId: task?.id ?? null,
      nextRunAt: nextRunAt ? new Date(nextRunAt).toISOString() : null,
    },
  });

  return { jobId: job.id, task };
}

export async function incrementCronFailure(input: { jobId: number; tenantId: number; reason: string }) {
  const rows = getRows<{ failure_count: number; max_failures: number }>(
    await db.execute(sql`
      update intelligence_cron_jobs
      set
        failure_count = coalesce(failure_count, 0) + 1,
        updated_at = now()
      where id = ${input.jobId} and tenant_id = ${input.tenantId}
      returning failure_count, max_failures
    `),
  );

  const row = rows[0];
  if (!row) return;

  const failureCount = Number(row.failure_count || 0);
  const maxFailures = Number(row.max_failures || 10);

  if (failureCount < maxFailures) return;

  await db
    .update(intelligenceCronJobs)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(intelligenceCronJobs.id, input.jobId));

  await createIntelligenceAlert({
    tenantId: input.tenantId,
    cronJobId: input.jobId,
    severity: "critical",
    code: "CRON_JOB_DISABLED",
    message: `Cron job ${input.jobId} disabled after ${failureCount} failures`,
    details: {
      reason: input.reason,
      failureCount,
      maxFailures,
    },
  });
}

export async function listIntelligenceAuditEvents(input: {
  tenantId: number;
  limit?: number;
  taskId?: number | null;
}) {
  const whereParts = [eq(intelligenceAuditEvents.tenantId, input.tenantId)];
  if (input.taskId) whereParts.push(eq(intelligenceAuditEvents.taskId, input.taskId));

  const limit = Math.max(1, Math.min(1000, Math.trunc(input.limit ?? 200)));
  return db.query.intelligenceAuditEvents.findMany({
    where: and(...whereParts),
    orderBy: [desc(intelligenceAuditEvents.createdAt)],
    limit,
  });
}

export async function listIntelligenceTokenLedger(input: {
  tenantId: number;
  limit?: number;
  taskId?: number | null;
}) {
  const whereParts = [eq(intelligenceTokenLedger.tenantId, input.tenantId)];
  if (input.taskId) whereParts.push(eq(intelligenceTokenLedger.taskId, input.taskId));

  const limit = Math.max(1, Math.min(1000, Math.trunc(input.limit ?? 200)));
  return db.query.intelligenceTokenLedger.findMany({
    where: and(...whereParts),
    orderBy: [desc(intelligenceTokenLedger.createdAt)],
    limit,
  });
}

export async function listIntelligenceAlerts(input: { tenantId: number; limit?: number; onlyOpen?: boolean }) {
  const whereParts = [eq(intelligenceAlerts.tenantId, input.tenantId)];
  if (input.onlyOpen) whereParts.push(sql`${intelligenceAlerts.acknowledgedAt} is null` as any);

  const limit = Math.max(1, Math.min(1000, Math.trunc(input.limit ?? 200)));
  return db.query.intelligenceAlerts.findMany({
    where: and(...whereParts),
    orderBy: [desc(intelligenceAlerts.createdAt)],
    limit,
  });
}
export async function claimQueuedGovernedTask(input: { workerId: string; leaseSeconds?: number }) {
  const leaseSeconds = Math.max(30, Math.min(900, Math.trunc(input.leaseSeconds ?? 120)));

  const rows = getRows<any>(
    await db.execute(sql`
      with candidate as (
        select id
        from intelligence_tasks
        where state = 'QUEUED'
          and (lease_until is null or lease_until < now())
          and coalesce(max_attempts, 3) > coalesce(attempts, 0)
        order by priority desc, created_at asc
        limit 1
        for update skip locked
      )
      update intelligence_tasks t
      set
        state = 'RUNNING',
        running_at = coalesce(t.running_at, now()),
        lease_until = now() + (${leaseSeconds} || ' seconds')::interval,
        claimed_by = ${input.workerId},
        attempts = coalesce(t.attempts, 0) + 1,
        updated_at = now()
      from candidate
      where t.id = candidate.id
      returning t.*
    `),
  );

  const claimed = rows[0] ?? null;
  if (!claimed) return null;

  await recordIntelligenceAuditEvent({
    tenantId: claimed.tenant_id,
    taskId: claimed.id,
    cronJobId: claimed.cron_job_id,
    actorType: "SYSTEM",
    actorId: input.workerId,
    eventType: "TASK_CLAIMED",
    beforeState: "QUEUED",
    afterState: "RUNNING",
    payload: {
      leaseSeconds,
      attempts: claimed.attempts,
    },
  });

  return claimed;
}

export async function completeGovernedTaskRun(input: {
  taskId: number;
  actorType?: AuditActorType;
  actorId?: string | null;
  payload?: Record<string, unknown>;
}) {
  const actorType = input.actorType ?? "SYSTEM";

  const verified = await transitionGovernedTaskState({
    taskId: input.taskId,
    toState: "VERIFIED",
    actorType,
    actorId: input.actorId ?? null,
    payload: input.payload ?? {},
  });

  const reported = await transitionGovernedTaskState({
    taskId: input.taskId,
    toState: "REPORTED",
    actorType,
    actorId: input.actorId ?? null,
    payload: input.payload ?? {},
  });

  return { verified, reported };
}

export async function failGovernedTaskRun(input: {
  taskId: number;
  actorType?: AuditActorType;
  actorId?: string | null;
  errorCode?: string | null;
  errorMessage: string;
  payload?: Record<string, unknown>;
}) {
  const task = await transitionGovernedTaskState({
    taskId: input.taskId,
    toState: "FAILED",
    actorType: input.actorType ?? "SYSTEM",
    actorId: input.actorId ?? null,
    errorCode: input.errorCode ?? "RUN_FAILED",
    errorMessage: input.errorMessage,
    payload: input.payload,
  });

  await createIntelligenceAlert({
    tenantId: task.tenantId,
    taskId: task.id,
    cronJobId: task.cronJobId,
    severity: "warning",
    code: input.errorCode ?? "RUN_FAILED",
    message: input.errorMessage,
    details: {
      taskId: task.id,
      publicTaskId: task.publicTaskId,
      attempts: task.attempts,
      maxAttempts: task.maxAttempts,
    },
  });

  return task;
}

export async function releaseGovernedTaskLease(taskId: number) {
  await db
    .update(intelligenceTasks)
    .set({ leaseUntil: null, claimedBy: null, updatedAt: new Date() })
    .where(eq(intelligenceTasks.id, taskId));
}

export async function listDueScheduledCronJobs(maxBatch = 25) {
  const rows = getRows<any>(
    await db.execute(sql`
      select *
      from intelligence_cron_jobs
      where is_active = true
        and trigger_mode = 'SCHEDULE'
        and (next_run_at is null or next_run_at <= now())
      order by next_run_at nulls first, id asc
      limit ${Math.max(1, Math.min(250, Math.trunc(maxBatch)))}
    `),
  );

  return rows;
}

export async function markCronJobExecuted(input: {
  jobId: number;
  tenantId: number;
  scheduleCron?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const nextRunAt = computeNextScheduledRun({ scheduleCron: input.scheduleCron, metadata: input.metadata ?? {} });

  await db.execute(sql`
    update intelligence_cron_jobs
    set
      last_run_at = now(),
      next_run_at = ${nextRunAt.toISOString()}::timestamptz,
      failure_count = 0,
      updated_at = now()
    where id = ${input.jobId}
      and tenant_id = ${input.tenantId}
  `);

  return nextRunAt;
}

export async function runGlobalMonitoringRules() {
  const staleRows = getRows<{ id: number; tenant_id: number; public_task_id: string | null }>(
    await db.execute(sql`
      select id, tenant_id, public_task_id
      from intelligence_tasks
      where state in ('RUNNING', 'QUEUED')
        and updated_at < now() - interval '20 minutes'
      order by updated_at asc
      limit 200
    `),
  );

  for (const row of staleRows) {
    await createIntelligenceAlert({
      tenantId: row.tenant_id,
      taskId: row.id,
      severity: "warning",
      code: "TASK_STALLED",
      message: `Task ${row.public_task_id || row.id} appears stalled (>20 minutes without progress)`,
      details: { taskId: row.id },
    });
  }

  const spendRows = getRows<{ tenant_id: number; total: number }>(
    await db.execute(sql`
      select tenant_id, coalesce(sum(abs(tokens_delta)), 0)::int as total
      from intelligence_token_ledger
      where event_type = 'CONSUME'
        and created_at >= now() - interval '1 hour'
      group by tenant_id
      having coalesce(sum(abs(tokens_delta)), 0) > 50000
    `),
  );

  for (const row of spendRows) {
    await createIntelligenceAlert({
      tenantId: row.tenant_id,
      severity: "critical",
      code: "TOKEN_BURN_SPIKE",
      message: `High token burn detected for tenant ${row.tenant_id} in the last hour (${row.total} tokens)`,
      details: { total: row.total, window: "1h" },
    });
  }

  return {
    staleTasks: staleRows.length,
    tokenSpikeTenants: spendRows.length,
  };
}

export async function triggerEventCronJobs(input: {
  tenantId: number;
  eventKey: string;
  actorType: AuditActorType;
  actorId?: string | null;
  createdByUserId?: number | null;
}) {
  const eventKey = asText(input.eventKey);
  if (!eventKey) return [] as Array<{ jobId: number; task: any }>;

  const jobs = await db.query.intelligenceCronJobs.findMany({
    where: and(
      eq(intelligenceCronJobs.tenantId, input.tenantId),
      eq(intelligenceCronJobs.triggerMode, "EVENT"),
      eq(intelligenceCronJobs.isActive, true),
      eq(intelligenceCronJobs.eventKey, eventKey),
    ),
    orderBy: [asc(intelligenceCronJobs.id)],
    limit: 200,
  });

  const outputs: Array<{ jobId: number; task: any }> = [];
  for (const job of jobs) {
    const triggered = await triggerGovernedCronJobNow({
      tenantId: input.tenantId,
      cronJobId: job.id,
      actorType: input.actorType,
      actorId: input.actorId,
      createdByUserId: input.createdByUserId,
    });
    outputs.push({ jobId: job.id, task: triggered.task });
  }

  return outputs;
}
