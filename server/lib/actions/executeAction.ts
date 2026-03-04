import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@db";

import {
  ACTIONS_REGISTRY_MAP,
  deriveDefaultRisk,
  getActionRegistryEntry,
  hasActionPermission,
  isMasterActor,
  isPrivilegedActor,
  type ActionMode,
  type ActionRiskLevel,
} from "./actionRegistry";

type ActionLifecycleStatus =
  | "QUEUED"
  | "RUNNING"
  | "REQUIRES_APPROVAL"
  | "SUCCEEDED"
  | "FAILED"
  | "SIMULATED";

export type ExecuteActionContext = {
  tenantId: number;
  companyId?: number | null;
  actorUserId?: number | null;
  actorAgentId?: number | null;
  actorAgentKey?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  actor?: any;
  objectiveId?: number | null;
  sessionId?: string | number | null;
  conversationId?: string | null;
  mode?: ActionMode;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
  approvalReason?: string | null;
  approvedByAgentId?: number | null;
  approvedByUserId?: number | null;
};

export type ExecuteActionResult<T = unknown> = {
  ok: boolean;
  actionKey: string;
  correlationId: string;
  status: ActionLifecycleStatus;
  riskLevel: ActionRiskLevel;
  approvalRequired: boolean;
  approvalReason: string | null;
  inputsHash: string;
  resultHash: string | null;
  result: T | null;
  error: string | null;
};

export class ActionExecutionError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly correlationId: string | null;

  constructor(message: string, options: { statusCode?: number; code?: string; correlationId?: string | null } = {}) {
    super(message);
    this.name = "ActionExecutionError";
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? "ACTION_EXECUTION_FAILED";
    this.correlationId = options.correlationId ?? null;
  }
}

function toPositiveInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

function hashJson(value: unknown) {
  const serialized = JSON.stringify(value ?? {});
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

function generateCorrelationId() {
  return `act_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

function isTruthy(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseOptionalBoolean(value: unknown): boolean | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function isEvidenceEnforcementEnabled() {
  const explicit = process.env.FEATURE_ACCOUNTABILITY_ENFORCEMENT;
  if (typeof explicit === "string" && explicit.trim()) return isTruthy(explicit);
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
}

function isSimulationAllowed() {
  if (String(process.env.NODE_ENV || "").trim().toLowerCase() === "production") return false;
  return isTruthy(process.env.ALLOW_SIMULATED_ACTIONS || process.env.FEATURE_ALLOW_ACTION_SIMULATION || "false");
}

function extractEvidencePayload(result: unknown) {
  if (!result || typeof result !== "object") return null;
  const candidate = result as Record<string, unknown>;
  const directEvidence = candidate.evidence;
  if (directEvidence && typeof directEvidence === "object" && !Array.isArray(directEvidence)) {
    return directEvidence as Record<string, unknown>;
  }

  const receipts = candidate.receipts;
  if (Array.isArray(receipts) && receipts.length > 0) {
    return { receipts };
  }

  return candidate;
}

function hasActionEvidence(result: unknown) {
  const evidence = extractEvidencePayload(result);
  if (!evidence) return false;

  const keys = [
    "executor_run_id",
    "action_run_id",
    "workstation_session_id",
    "job_id",
    "correlation_id",
    "response_hash",
    "file_sha256",
    "screenshot_hash",
    "event_ids",
    "entity_ids",
    "affected_rows",
    "external_ref",
  ];
  for (const key of keys) {
    const value = (evidence as any)[key];
    if (value == null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return true;
  }

  const receipts = (evidence as any).receipts;
  if (Array.isArray(receipts) && receipts.length > 0) return true;
  return false;
}

function normalizeActionKey(actionKey: string) {
  return String(actionKey || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function emitLiveActivity(input: {
  companyId: number | null;
  actorAgentId: number | null;
  eventType: string;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
}) {
  if (!input.companyId || input.companyId <= 0) return;
  try {
    await db.execute(sql`
      insert into activity_log (
        company_id,
        agent_id,
        event_type,
        event_category,
        title,
        description,
        metadata,
        created_at
      ) values (
        ${input.companyId},
        ${input.actorAgentId},
        ${input.eventType},
        'action',
        ${input.title},
        ${input.description},
        ${JSON.stringify(input.metadata || {})}::jsonb,
        now()
      )
    `);
  } catch {
    // best effort: activity stream must not block primary execution
  }
}

async function emitAudit(input: {
  tenantId: number;
  actorUserId: number | null;
  actionKey: string;
  entityType: string;
  entityId: string;
  beforeState?: unknown;
  afterState?: unknown;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.execute(sql`
      insert into audit_logs (
        tenant_id,
        actor_user_id,
        actor_role,
        action,
        entity_type,
        entity_id,
        before,
        after,
        ip,
        user_agent,
        created_at
      ) values (
        ${input.tenantId},
        ${input.actorUserId},
        'staff',
        ${input.actionKey},
        ${input.entityType},
        ${input.entityId},
        ${JSON.stringify(input.beforeState ?? null)}::jsonb,
        ${JSON.stringify(input.afterState ?? null)}::jsonb,
        null,
        null,
        now()
      )
    `);
  } catch {
    // best effort: audit sink can be provisioned later
  }
}

async function emitLifecycleAudit(input: {
  tenantId: number;
  actorUserId: number | null;
  actionKey: string;
  correlationId: string;
  stage: "REQUESTED" | "RUNNING" | "REQUIRES_APPROVAL" | "SIMULATED" | "SUCCEEDED" | "FAILED";
  status: ActionLifecycleStatus;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  await emitAudit({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actionKey: `${input.actionKey}_${input.stage}`,
    entityType: "action_lifecycle",
    entityId: input.correlationId,
    afterState: {
      stage: input.stage,
      status: input.status,
      payload: input.payload || null,
      at: new Date().toISOString(),
    },
    metadata: input.metadata,
  });
}

export async function executeAction<T = unknown>(
  actionKeyRaw: string,
  payload: Record<string, unknown>,
  context: ExecuteActionContext,
  handler?: () => Promise<T>,
): Promise<ExecuteActionResult<T>> {
  const actionKey = normalizeActionKey(actionKeyRaw);
  const actor = context.actor ?? { roles: [context.actorRole], permissions: [] };
  const registryEntry = getActionRegistryEntry(actionKey);
  const riskLevel = registryEntry?.riskLevel ?? deriveDefaultRisk(actionKey);
  const approvalRequired = Boolean(registryEntry?.approvalRequired ?? false);
  const mode: ActionMode = context.mode === "SIMULATE" ? "SIMULATE" : "LIVE";
  const evidenceEnforcementEnabled = isEvidenceEnforcementEnabled();
  const correlationId = String(context.correlationId || generateCorrelationId());
  const inputsHash = hashJson(payload);

  const tenantId = toPositiveInt(context.tenantId);
  if (!tenantId) {
    throw new ActionExecutionError("tenantId is required", {
      statusCode: 400,
      code: "TENANT_REQUIRED",
      correlationId,
    });
  }

  const companyId = toPositiveInt(context.companyId ?? null);
  const actorUserId = toPositiveInt(context.actorUserId ?? context.actor?.id ?? null);
  const actorAgentId = toPositiveInt(context.actorAgentId ?? null);

  if (!hasActionPermission(actionKey, actor)) {
    throw new ActionExecutionError(`Permission denied for action ${actionKey}`, {
      statusCode: 403,
      code: "PERMISSION_DENIED",
      correlationId,
    });
  }

  if (registryEntry?.requiresObjective && !toPositiveInt(context.objectiveId ?? null)) {
    throw new ActionExecutionError(`objective_id is required for action ${actionKey}`, {
      statusCode: 422,
      code: "OBJECTIVE_REQUIRED",
      correlationId,
    });
  }

  if (registryEntry?.requiresSession && !String(context.sessionId ?? context.conversationId ?? "").trim()) {
    throw new ActionExecutionError(`session_id or conversation_id is required for action ${actionKey}`, {
      statusCode: 422,
      code: "SESSION_REQUIRED",
      correlationId,
    });
  }

  if (mode === "SIMULATE" && isMasterActor(actor)) {
    throw new ActionExecutionError(`Simulation not allowed for master agent action ${actionKey}`, {
      statusCode: 422,
      code: "MASTER_SIMULATION_BLOCKED",
      correlationId,
    });
  }

  if (mode === "SIMULATE" && !isSimulationAllowed()) {
    throw new ActionExecutionError(`Simulation disabled for action ${actionKey}`, {
      statusCode: 422,
      code: "SIMULATION_DISABLED",
      correlationId,
    });
  }

  const metadataBase = {
    actionKey,
    correlationId,
    riskLevel,
    approvalRequired,
    mode,
    objectiveId: toPositiveInt(context.objectiveId ?? null),
    sessionId: context.sessionId ?? null,
    conversationId: context.conversationId ?? null,
    actorUserId,
    actorAgentId,
    actorAgentKey: context.actorAgentKey ?? null,
    actorName: context.actorName ?? null,
    actorRole: context.actorRole ?? null,
    inputsHash,
    ...context.metadata,
  };

  await emitLiveActivity({
    companyId,
    actorAgentId,
    eventType: "action_queued",
    title: `Action queued: ${actionKey}`,
    description: `mode=${mode}`,
    metadata: metadataBase,
  });

  await emitLifecycleAudit({
    tenantId,
    actorUserId,
    actionKey,
    correlationId,
    stage: "REQUESTED",
    status: "QUEUED",
    payload: {
      mode,
      riskLevel,
      approvalRequired,
    },
    metadata: metadataBase,
  });

  if (approvalRequired && mode === "LIVE" && !isPrivilegedActor(actor ?? context)) {
    const approvalReason = String(context.approvalReason || "").trim() || null;
    const result: ExecuteActionResult = {
      ok: false,
      actionKey,
      correlationId,
      status: "REQUIRES_APPROVAL",
      riskLevel,
      approvalRequired,
      approvalReason,
      inputsHash,
      resultHash: null,
      result: null,
      error: null,
    };

    await emitLiveActivity({
      companyId,
      actorAgentId,
      eventType: "action_requires_approval",
      title: `Action requires approval: ${actionKey}`,
      description: approvalReason || "Awaiting approval",
      metadata: {
        ...metadataBase,
        approvalReason,
      },
    });

    await emitLifecycleAudit({
      tenantId,
      actorUserId,
      actionKey,
      correlationId,
      stage: "REQUIRES_APPROVAL",
      status: "REQUIRES_APPROVAL",
      payload: { approvalReason },
      metadata: metadataBase,
    });

    await emitAudit({
      tenantId,
      actorUserId,
      actionKey,
      entityType: "action",
      entityId: correlationId,
      afterState: result,
      metadata: metadataBase,
    });

    return result as ExecuteActionResult<T>;
  }

  if (mode === "SIMULATE" && !handler) {
    if (!isSimulationAllowed()) {
      throw new ActionExecutionError(`Simulation disabled for action ${actionKey}`, {
        statusCode: 422,
        code: "SIMULATION_DISABLED",
        correlationId,
      });
    }

    const simulatedResult: ExecuteActionResult = {
      ok: true,
      actionKey,
      correlationId,
      status: "SIMULATED",
      riskLevel,
      approvalRequired,
      approvalReason: null,
      inputsHash,
      resultHash: hashJson({ mode: "SIMULATE", accepted: true }),
      result: { mode: "SIMULATE", accepted: true },
      error: null,
    };

    await emitLiveActivity({
      companyId,
      actorAgentId,
      eventType: "action_simulated",
      title: `Action simulated: ${actionKey}`,
      description: "No LIVE side-effect executed",
      metadata: {
        ...metadataBase,
        resultHash: simulatedResult.resultHash,
      },
    });

    await emitAudit({
      tenantId,
      actorUserId,
      actionKey,
      entityType: "action",
      entityId: correlationId,
      afterState: simulatedResult,
      metadata: metadataBase,
    });

    await emitLifecycleAudit({
      tenantId,
      actorUserId,
      actionKey,
      correlationId,
      stage: "SIMULATED",
      status: "SIMULATED",
      payload: { resultHash: simulatedResult.resultHash },
      metadata: metadataBase,
    });

    return simulatedResult as ExecuteActionResult<T>;
  }

  await emitLiveActivity({
    companyId,
    actorAgentId,
    eventType: "action_running",
    title: `Action running: ${actionKey}`,
    description: "Execution in progress",
    metadata: metadataBase,
  });

  await emitLifecycleAudit({
    tenantId,
    actorUserId,
    actionKey,
    correlationId,
    stage: "RUNNING",
    status: "RUNNING",
    metadata: metadataBase,
  });

  try {
    const result = handler ? await handler() : (({ accepted: true } as unknown) as T);
    const metadata = (context?.metadata && typeof context.metadata === "object" ? context.metadata : {}) as Record<string, unknown>;
    const explicitEvidenceRequired = parseOptionalBoolean(
      (metadata as any).evidenceRequired ?? (metadata as any).evidence_required,
    );
    const requiresEvidence =
      explicitEvidenceRequired != null
        ? explicitEvidenceRequired
        : Boolean(registryEntry?.requiresEvidence);
    if (evidenceEnforcementEnabled && requiresEvidence && !hasActionEvidence(result)) {
      throw new ActionExecutionError(`Missing action evidence for ${actionKey}`, {
        statusCode: 422,
        code: "MISSING_EVIDENCE",
        correlationId,
      });
    }

    const resultHash = hashJson(result);

    const response: ExecuteActionResult<T> = {
      ok: true,
      actionKey,
      correlationId,
      status: "SUCCEEDED",
      riskLevel,
      approvalRequired,
      approvalReason: null,
      inputsHash,
      resultHash,
      result,
      error: null,
    };

    await emitLiveActivity({
      companyId,
      actorAgentId,
      eventType: "action_succeeded",
      title: `Action succeeded: ${actionKey}`,
      description: "Execution complete",
      metadata: {
        ...metadataBase,
        resultHash,
      },
    });

    await emitLifecycleAudit({
      tenantId,
      actorUserId,
      actionKey,
      correlationId,
      stage: "SUCCEEDED",
      status: "SUCCEEDED",
      payload: { resultHash },
      metadata: metadataBase,
    });

    await emitAudit({
      tenantId,
      actorUserId,
      actionKey,
      entityType: "action",
      entityId: correlationId,
      afterState: response,
      metadata: metadataBase,
    });

    return response;
  } catch (error: any) {
    const message = String(error?.message || error || "action_failed");
    const failedResult: ExecuteActionResult<T> = {
      ok: false,
      actionKey,
      correlationId,
      status: "FAILED",
      riskLevel,
      approvalRequired,
      approvalReason: null,
      inputsHash,
      resultHash: null,
      result: null,
      error: message,
    };

    await emitLiveActivity({
      companyId,
      actorAgentId,
      eventType: "action_failed",
      title: `Action failed: ${actionKey}`,
      description: message,
      metadata: metadataBase,
    });

    await emitAudit({
      tenantId,
      actorUserId,
      actionKey,
      entityType: "action",
      entityId: correlationId,
      afterState: failedResult,
      metadata: metadataBase,
    });

    await emitLifecycleAudit({
      tenantId,
      actorUserId,
      actionKey,
      correlationId,
      stage: "FAILED",
      status: "FAILED",
      payload: { error: message },
      metadata: metadataBase,
    });

    const statusCode = error instanceof ActionExecutionError ? error.statusCode : 500;
    const code = error instanceof ActionExecutionError ? error.code : "ACTION_FAILED";
    const errorCorrelationId =
      error instanceof ActionExecutionError && error.correlationId ? error.correlationId : correlationId;
    throw new ActionExecutionError(message, {
      statusCode,
      code,
      correlationId: errorCorrelationId,
    });
  }
}

export function listRegisteredActions() {
  return Array.from(ACTIONS_REGISTRY_MAP.values());
}
