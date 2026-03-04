import { Router } from "express";
import { db } from "@db";
import { actionDefinitions, actionEvidence, actionReceipts, actionRequests, actionRuns } from "@db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { resolveChairmanConsoleActor } from "./utils/chairman-console-auth";
import { attachEvidence, completeRunSuccess, createActionRun } from "../lib/actions/actionRuns";

const router = Router();
type LegacyActionStatus = NonNullable<(typeof actionRequests.$inferSelect)["status"]>;
const LEGACY_ACTION_STATUSES: LegacyActionStatus[] = [
  "PENDING",
  "QUEUED",
  "RUNNING",
  "DONE",
  "FAILED",
  "CANCELLED",
  "REQUIRES_APPROVAL",
  "DENIED",
];

function parseIntSafe(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function toObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function normalizeStatus(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function asLegacyStatus(value: string | null | undefined): LegacyActionStatus | null {
  const normalized = normalizeStatus(value);
  if (!normalized) return null;
  return LEGACY_ACTION_STATUSES.includes(normalized as LegacyActionStatus)
    ? (normalized as LegacyActionStatus)
    : null;
}

async function listLegacyRuns(tenantId: number, limit: number, status?: string | null) {
  const legacyStatus = asLegacyStatus(status === "SUCCEEDED" ? "DONE" : status);
  const where = legacyStatus
    ? and(eq(actionRequests.tenantId, tenantId), eq(actionRequests.status, legacyStatus))
    : eq(actionRequests.tenantId, tenantId);

  const legacy = await db.query.actionRequests.findMany({
    where,
    orderBy: [desc(actionRequests.createdAt)],
    limit,
  });
  if (!legacy.length) return [];

  const ids = legacy.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
  if (!ids.length) return [];
  const idsSql = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );

  const latestResults = await db.execute(sql`
    select distinct on (action_request_id)
      action_request_id,
      result
    from action_results
    where tenant_id = ${tenantId}
      and action_request_id in (${idsSql})
    order by action_request_id, created_at desc
  `);
  const resultsById = new Map<number, any>();
  for (const row of (latestResults as any).rows || []) {
    const id = Number(row.action_request_id);
    if (Number.isFinite(id)) resultsById.set(id, row);
  }

  const receipts = await db.query.actionReceipts.findMany({
    where: and(eq(actionReceipts.tenantId, tenantId), inArray(actionReceipts.actionRunId, ids)),
    orderBy: [desc(actionReceipts.createdAt)],
  });
  const receiptsById = new Map<number, any[]>();
  for (const receipt of receipts) {
    const id = Number(receipt.actionRunId);
    if (!receiptsById.has(id)) receiptsById.set(id, []);
    receiptsById.get(id)!.push(receipt);
  }

  return legacy.map((row) => {
    const id = Number(row.id);
    const resultRow = resultsById.get(id);
    const payload = toObject(resultRow?.result);
    const receiptsForRun = receiptsById.get(id) ?? [];
    const normalizedStatus = normalizeStatus(row.status);
    const mappedStatus = normalizedStatus === "DONE" ? "SUCCEEDED" : normalizedStatus;

    return {
      id,
      source: "legacy",
      actionKey: row.actionType,
      status: mappedStatus,
      legacyStatus: normalizedStatus,
      payload: row.payload ?? {},
      result: payload ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      evidence: receiptsForRun.map((receipt) => ({
        id: receipt.id,
        evidenceType: receipt.receiptType,
        payload: {
          receiptType: receipt.receiptType,
          entityType: receipt.entityType,
          entityIds: receipt.entityIdsJson ?? [],
          affectedRows: receipt.affectedRows ?? null,
          externalRef: receipt.externalRef ?? null,
          evidenceUrl: receipt.evidenceUrl ?? null,
        },
        createdAt: receipt.createdAt,
      })),
    };
  });
}

router.get("/runs", async (req, res) => {
  const auth = await resolveChairmanConsoleActor(req, { allowAdminOverride: true });
  if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
  const tenantId = Number(req.tenant?.id);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return res.status(400).json({ message: "Tenant not resolved" });
  }

  const limit = Math.max(1, Math.min(200, Number(req.query?.limit || 50)));
  const status = req.query?.status ? normalizeStatus(req.query.status) : null;
  const includeLegacy = String(req.query?.includeLegacy || "true").toLowerCase() !== "false";

  const runWhere = status
    ? and(eq(actionRuns.tenantId, tenantId), eq(actionRuns.status, status))
    : eq(actionRuns.tenantId, tenantId);

  const runs = await db.query.actionRuns.findMany({
    where: runWhere,
    orderBy: [desc(actionRuns.createdAt)],
    limit,
  });

  const runIds = runs.map((run) => Number(run.id)).filter((id) => Number.isFinite(id) && id > 0);
  const evidenceRows = runIds.length
    ? await db.query.actionEvidence.findMany({
        where: and(eq(actionEvidence.tenantId, tenantId), inArray(actionEvidence.runId, runIds)),
        orderBy: [desc(actionEvidence.createdAt)],
      })
    : [];
  const evidenceByRun = new Map<number, any[]>();
  for (const evidence of evidenceRows) {
    const id = Number(evidence.runId);
    if (!evidenceByRun.has(id)) evidenceByRun.set(id, []);
    evidenceByRun.get(id)!.push(evidence);
  }

  const definitionIds = Array.from(
    new Set(
      runs
        .map((run) => Number(run.definitionId))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );
  const definitions = definitionIds.length
    ? await db.query.actionDefinitions.findMany({
        where: inArray(actionDefinitions.id, definitionIds),
      })
    : [];
  const definitionById = new Map<number, any>();
  for (const def of definitions) definitionById.set(Number(def.id), def);

  const normalizedRuns = runs.map((run) => ({
    id: run.id,
    source: "chairman",
    actionKey: run.actionKey,
    status: run.status,
    payload: run.payload ?? {},
    result: run.result ?? null,
    error: run.error ?? null,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    threadId: run.threadId,
    messageId: run.messageId,
    objectiveId: run.objectiveId,
    requestedByUserId: run.requestedByUserId,
    requestedByAgentId: run.requestedByAgentId,
    assignedAgentId: run.assignedAgentId,
    definition: definitionById.get(Number(run.definitionId)) ?? null,
    evidence: (evidenceByRun.get(Number(run.id)) ?? []).map((row) => ({
      id: row.id,
      evidenceType: row.evidenceType,
      payload: row.payload ?? {},
      createdAt: row.createdAt,
    })),
  }));

  const legacyRuns = includeLegacy ? await listLegacyRuns(tenantId, limit, status) : [];
  const combined = [...normalizedRuns, ...legacyRuns].sort((a, b) => {
    const left = new Date(a.createdAt || 0).getTime();
    const right = new Date(b.createdAt || 0).getTime();
    return right - left;
  });

  res.json({ runs: combined });
});

router.post("/run", async (req, res) => {
  const auth = await resolveChairmanConsoleActor(req, { allowAdminOverride: true });
  if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
  const tenantId = Number(req.tenant?.id);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return res.status(400).json({ message: "Tenant not resolved" });
  }

  const actionKey = String(req.body?.actionKey ?? req.body?.action_key ?? "").trim();
  if (!actionKey) return res.status(400).json({ message: "actionKey is required" });

  try {
    const run = await createActionRun({
      tenantId,
      actionKey,
      payload: toObject(req.body?.payload ?? req.body?.params),
      requestedByUserId: auth.user?.id ?? null,
      requestedByAgentId: req.body?.requestedByAgentId ?? null,
      assignedAgentId: parseIntSafe(req.body?.assignedAgentId) ?? null,
      defaultAssigneeRole: req.body?.defaultAssigneeRole ?? null,
      threadId: parseIntSafe(req.body?.threadId) ?? null,
      messageId: parseIntSafe(req.body?.messageId) ?? null,
      objectiveId: parseIntSafe(req.body?.objectiveId) ?? null,
      correlationId: typeof req.body?.correlationId === "string" ? req.body.correlationId : null,
    });
    res.status(201).json({ run });
  } catch (error: any) {
    res.status(422).json({ message: error?.message || "Failed to create action run" });
  }
});

router.post("/run/:id/evidence", async (req, res) => {
  const auth = await resolveChairmanConsoleActor(req, { allowAdminOverride: true });
  if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
  const tenantId = Number(req.tenant?.id);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return res.status(400).json({ message: "Tenant not resolved" });
  }

  const runId = parseIntSafe(req.params.id);
  if (!runId) return res.status(400).json({ message: "run id is required" });

  const run = await db.query.actionRuns.findFirst({
    where: and(eq(actionRuns.id, runId), eq(actionRuns.tenantId, tenantId)),
  });
  if (!run) return res.status(404).json({ message: "Run not found" });

  const evidenceListRaw = Array.isArray(req.body?.evidence)
    ? req.body.evidence
    : [
        {
          evidenceType: req.body?.evidenceType ?? req.body?.evidence_type ?? null,
          payload: toObject(req.body?.payload ?? {}),
        },
      ];
  const evidence = evidenceListRaw
    .map((item: any) => ({
      evidenceType: item?.evidenceType ?? item?.evidence_type ?? null,
      payload: toObject(item?.payload ?? {}),
    }))
    .filter((item: any) => Object.keys(item.payload || {}).length > 0 || item.evidenceType);

  const complete = Boolean(req.body?.complete) || normalizeStatus(req.body?.status) === "SUCCEEDED";

  try {
    if (complete) {
      const updated = await completeRunSuccess({
        tenantId,
        runId,
        result: toObject(req.body?.result ?? {}),
        evidence,
      });
      return res.status(200).json({ run: updated, evidenceCount: evidence.length });
    }

    const inserted = await attachEvidence({ tenantId, runId, evidence });
    res.status(201).json({ evidence: inserted, evidenceCount: inserted.length });
  } catch (error: any) {
    res.status(422).json({ message: error?.message || "Failed to attach evidence" });
  }
});

export default router;
