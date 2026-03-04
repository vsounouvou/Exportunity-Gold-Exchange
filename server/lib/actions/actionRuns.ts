import { db } from "@db";
import { actionDefinitions, actionEvidence, actionRuns } from "@db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { ensureActionDefinitionsForTenant, getActionDefinitionForTenant } from "./actionDefinitions";

type ActionEvidenceInput = {
  evidenceType?: string | null;
  payload: Record<string, unknown>;
};

type ValidationResult = { ok: true } | { ok: false; error: string };

function normalizeActionKey(value: string) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeRole(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function coercePayload(value: unknown) {
  return isObject(value) ? value : {};
}

function matchesType(value: unknown, expected: string) {
  if (expected === "string") return typeof value === "string";
  if (expected === "number") return typeof value === "number" && Number.isFinite(value);
  if (expected === "boolean") return typeof value === "boolean";
  if (expected === "object") return isObject(value);
  if (expected === "array") return Array.isArray(value);
  return true;
}

function validateActionParams(schema: unknown, payload: Record<string, unknown>): ValidationResult {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return { ok: true };
  const schemaObj = schema as Record<string, unknown>;
  const expectedType = typeof schemaObj.type === "string" ? schemaObj.type : null;
  if (expectedType === "object" && !isObject(payload)) {
    return { ok: false, error: "Payload must be an object." };
  }

  const required = Array.isArray(schemaObj.required) ? schemaObj.required.map((x) => String(x)) : [];
  for (const key of required) {
    const value = (payload as any)[key];
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
      return { ok: false, error: `Missing required param: ${key}` };
    }
  }

  const properties = isObject(schemaObj.properties) ? schemaObj.properties : null;
  if (properties) {
    for (const [key, spec] of Object.entries(properties)) {
      if (!(key in payload)) continue;
      if (!spec || typeof spec !== "object" || Array.isArray(spec)) continue;
      const type = typeof (spec as any).type === "string" ? String((spec as any).type) : null;
      if (type && !matchesType((payload as any)[key], type)) {
        return { ok: false, error: `Invalid type for ${key}: expected ${type}` };
      }
    }
  }

  return { ok: true };
}

async function resolveAssigneeId(tenantId: number, role: string | null | undefined) {
  const normalized = normalizeRole(role);
  if (!normalized) return null;
  const result = await db.execute(sql`
    select id
    from agents
    where tenant_id = ${tenantId}
      and lower(role) = ${normalized}
    order by updated_at desc nulls last, id desc
    limit 1
  `);
  const row = Array.isArray((result as any)?.rows) ? (result as any).rows[0] : null;
  if (!row) return null;
  const id = Number(row.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function ensureDefinition(tenantId: number, actionKey: string) {
  let definition = await getActionDefinitionForTenant(tenantId, actionKey);
  if (definition) return definition;
  await ensureActionDefinitionsForTenant(tenantId);
  definition = await getActionDefinitionForTenant(tenantId, actionKey);
  if (definition) return definition;

  const now = new Date();
  const [created] = await db
    .insert(actionDefinitions)
    .values({
      tenantId,
      actionKey,
      name: actionKey,
      description: "Ad-hoc action",
      category: "EXECUTION",
      schema: {},
      defaultAssigneeRole: null,
      isActive: true,
      version: 1,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return created;
}

export async function createActionRun(input: {
  tenantId: number;
  actionKey: string;
  payload?: Record<string, unknown>;
  requestedByUserId?: number | null;
  requestedByAgentId?: number | null;
  assignedAgentId?: number | null;
  defaultAssigneeRole?: string | null;
  threadId?: number | null;
  messageId?: number | null;
  objectiveId?: number | null;
  correlationId?: string | null;
}) {
  const tenantId = Number(input.tenantId);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw new Error("tenantId is required to create action run");
  }
  const actionKey = normalizeActionKey(input.actionKey);
  if (!actionKey) throw new Error("actionKey is required");
  const payload = coercePayload(input.payload);

  const definition = await ensureDefinition(tenantId, actionKey);
  const validation = validateActionParams(definition?.schema ?? {}, payload);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  let assignedAgentId = input.assignedAgentId ?? null;
  const defaultAssigneeRole = input.defaultAssigneeRole ?? definition?.defaultAssigneeRole ?? null;
  if (!assignedAgentId && defaultAssigneeRole) {
    assignedAgentId = await resolveAssigneeId(tenantId, defaultAssigneeRole);
  }

  const [run] = await db
    .insert(actionRuns)
    .values({
      tenantId,
      definitionId: definition?.id ?? null,
      actionKey,
      status: "PENDING",
      mode: "LIVE",
      requestedByUserId: input.requestedByUserId ?? null,
      requestedByAgentId: input.requestedByAgentId ?? null,
      assignedAgentId,
      defaultAssigneeRole,
      threadId: input.threadId ?? null,
      messageId: input.messageId ?? null,
      objectiveId: input.objectiveId ?? null,
      payload,
      correlationId: input.correlationId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return run;
}

export async function attachEvidence(input: {
  tenantId: number;
  runId: number;
  evidence: ActionEvidenceInput[];
}) {
  const { tenantId, runId } = input;
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  if (!evidence.length) return [];

  const rows = evidence.map((item) => ({
    tenantId,
    runId,
    evidenceType: item.evidenceType ?? null,
    payload: coercePayload(item.payload),
    createdAt: new Date(),
  }));

  const inserted = await db.insert(actionEvidence).values(rows).returning();
  await db
    .update(actionRuns)
    .set({ updatedAt: new Date() })
    .where(and(eq(actionRuns.id, runId), eq(actionRuns.tenantId, tenantId)));
  return inserted;
}

export async function completeRunSuccess(input: {
  tenantId: number;
  runId: number;
  result?: Record<string, unknown> | null;
  evidence: ActionEvidenceInput[];
  enforceEvidence?: boolean;
}) {
  const { tenantId, runId } = input;
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  const enforceEvidence = Boolean(input.enforceEvidence);

  if (enforceEvidence && !evidence.length) {
    await db
      .update(actionRuns)
      .set({
        status: "FAILED",
        error: "Evidence required to mark success",
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(actionRuns.id, runId), eq(actionRuns.tenantId, tenantId)));
    throw new Error("Evidence required to mark run success");
  }

  await attachEvidence({ tenantId, runId, evidence });

  const [updated] = await db
    .update(actionRuns)
    .set({
      status: "SUCCEEDED",
      result: input.result ?? null,
      error: null,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(actionRuns.id, runId), eq(actionRuns.tenantId, tenantId)))
    .returning();

  return updated;
}

export async function completeRunFailure(input: {
  tenantId: number;
  runId: number;
  error: string;
  result?: Record<string, unknown> | null;
}) {
  const [updated] = await db
    .update(actionRuns)
    .set({
      status: "FAILED",
      error: input.error,
      result: input.result ?? null,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(actionRuns.id, input.runId), eq(actionRuns.tenantId, input.tenantId)))
    .returning();
  return updated;
}

export async function listActionRuns(input: {
  tenantId: number;
  status?: string | null;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(200, Number(input.limit || 50)));
  const where = input.status
    ? and(eq(actionRuns.tenantId, input.tenantId), eq(actionRuns.status, input.status))
    : eq(actionRuns.tenantId, input.tenantId);

  return db.query.actionRuns.findMany({
    where,
    orderBy: [desc(actionRuns.createdAt)],
    limit,
  });
}
