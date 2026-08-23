import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@db";
import { actionReceipts, actionRequests, actionResults, emailMessages } from "@db/schema";
import { ensureTenantStaff, isChairmanAssistantUser } from "./utils/auth";
import { approveActionRequest, createActionRequest, denyActionRequest, isKnownActionType } from "../lib/actions/ActionRouter";
import { getActionsWorkerStatus } from "../lib/actions/scheduler";
import { createActionForgeRequest, isDevAgentActor, isFeatureEnabled as isFeatureEnabledInForge } from "../lib/actions/forge";
import { appendActionEvent, formatPublicActionLabel, toLifecycleStateFromLegacyStatus } from "../lib/actions/lifecycle";

const router = Router();
router.use(ensureTenantStaff);
const DEFAULT_IDEMPOTENCY_TTL_SECONDS = Math.max(
  60,
  Number.parseInt(String(process.env.ACTION_IDEMPOTENCY_TTL_SECONDS || "86400"), 10) || 86400,
);

function isFeatureEnabled(name: string, defaultValue = true) {
  const raw = String((process.env as Record<string, string | undefined>)[name] || "").trim().toLowerCase();
  if (!raw) return defaultValue;
  return ["1", "true", "yes", "on"].includes(raw);
}

function parseIntSafe(value: unknown) {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function asObject(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>;
  return {};
}

function isTruthy(value: unknown) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return false;
  return ["1", "true", "yes", "y", "on"].includes(raw);
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function rows<T = any>(result: unknown): T[] {
  const candidate = (result as any)?.rows;
  return Array.isArray(candidate) ? (candidate as T[]) : [];
}

function withActionIdentity<T extends Record<string, any>>(row: T): T & {
  publicActionId: string;
  state: string;
  lastError: string | null;
} {
  const publicActionId = formatPublicActionLabel(row);
  const state =
    String((row as any)?.lifecycleState || (row as any)?.lifecycle_state || "").trim().toUpperCase() ||
    toLifecycleStateFromLegacyStatus((row as any)?.status);
  const lastError = firstNonEmptyString((row as any)?.errorMessage, (row as any)?.error_message, (row as any)?.metadata?.lastError) || null;

  return {
    ...(row as any),
    publicActionId,
    state,
    lastError,
  };
}

function toReceiptSummary(receipt: any) {
  return {
    id: receipt?.id ?? null,
    receiptType: receipt?.receiptType ?? receipt?.receipt_type ?? null,
    entityType: receipt?.entityType ?? receipt?.entity_type ?? null,
    entityIds: Array.isArray(receipt?.entityIdsJson ?? receipt?.entity_ids_json) ? receipt.entityIdsJson ?? receipt.entity_ids_json : [],
    affectedRows: typeof receipt?.affectedRows === "number" ? receipt.affectedRows : receipt?.affected_rows ?? null,
    externalRef: receipt?.externalRef ?? receipt?.external_ref ?? null,
    evidenceUrl: receipt?.evidenceUrl ?? receipt?.evidence_url ?? null,
    createdAt: receipt?.createdAt ?? receipt?.created_at ?? null,
  };
}

function buildActionEvidenceContract(input: {
  actionRequest: any;
  latestResult?: any | null;
  receipts?: any[] | null;
}) {
  const resultPayload = asObject(input.latestResult?.result);
  const receiptsFromResult = Array.isArray(resultPayload.receipts) ? resultPayload.receipts : [];
  const dbReceipts = Array.isArray(input.receipts) ? input.receipts.map((row) => toReceiptSummary(row)) : [];
  const receipts = dbReceipts.length ? dbReceipts : receiptsFromResult.map((row) => toReceiptSummary(row));
  const rowOutcome = firstNonEmptyString(input.actionRequest?.outcome);
  const resultOutcome = firstNonEmptyString(resultPayload.outcome);
  const outcome = rowOutcome || resultOutcome || "APPROVAL_PENDING";
  const actionRunId = Number(input.actionRequest?.id || 0) || null;
  const receiptCount =
    typeof resultPayload.receipt_count === "number"
      ? Math.max(0, Math.trunc(resultPayload.receipt_count))
      : receipts.length;
  return {
    action_run_id: actionRunId,
    outcome,
    receipt_count: receiptCount,
    receipts,
  };
}

async function fetchLatestActionResult(tenantId: number, actionRequestId: number) {
  return db.query.actionResults.findFirst({
    where: and(eq(actionResults.tenantId, tenantId), eq(actionResults.actionRequestId, actionRequestId)),
    orderBy: [desc(actionResults.createdAt)],
  });
}

async function fetchActionReceipts(tenantId: number, actionRequestId: number) {
  return db.query.actionReceipts.findMany({
    where: and(eq(actionReceipts.tenantId, tenantId), eq(actionReceipts.actionRunId, actionRequestId)),
    orderBy: [desc(actionReceipts.createdAt)],
    limit: 100,
  });
}

function parseIdempotencyKey(req: any) {
  const fromHeader = firstNonEmptyString(req.headers?.["idempotency-key"]);
  const fromBody = firstNonEmptyString(req.body?.idempotencyKey, req.body?.idempotency_key);
  return firstNonEmptyString(fromHeader, fromBody);
}

function idempotencyWindowFromNow(ttlSeconds = DEFAULT_IDEMPOTENCY_TTL_SECONDS) {
  return new Date(Date.now() - ttlSeconds * 1000);
}

function isAdminUser(user: any) {
  if (!user) return false;
  const currentMode = (user as any).currentMode;
  const roles = Array.isArray((user as any).roles) ? (user as any).roles : [];
  const perms = Array.isArray((user as any).permissions) ? (user as any).permissions : [];
  return (
    currentMode === "admin" ||
    roles.includes("admin") ||
    perms.includes("*") ||
    perms.includes("admin:*") ||
    isChairmanAssistantUser(user)
  );
}

router.post("/request", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const staffUser = req.staffUser;
    const actionType = String(req.body?.actionType ?? req.body?.action_type ?? "").trim();
    if (!actionType) return res.status(400).json({ message: "actionType required" });
    const normalizedActionType = actionType.toUpperCase();

    if (isFeatureEnabled("FEATURE_ACTION_REGISTRY_ENFORCEMENT", true) && !isKnownActionType(normalizedActionType)) {
      const forgeEnabled = isFeatureEnabledInForge("FEATURE_ACTION_FORGE", true);
      const canAutoForge = forgeEnabled && isDevAgentActor(staffUser);
      let forgeRequest: any = null;

      if (canAutoForge) {
        forgeRequest = await createActionForgeRequest({
          tenantId: tenant.id,
          requestedByUserId: staffUser?.id ? Number(staffUser.id) : null,
          desiredActionKey: normalizedActionType,
          desiredDescription:
            String(req.body?.description || req.body?.desiredDescription || "").trim() || `Auto-forge requested for ${normalizedActionType}`,
          desiredEntity: String(req.body?.targetEntity || req.body?.entity || "").trim() || null,
          metadata: {
            source: "actions.request",
            autoCreated: true,
            correlationId: firstNonEmptyString(req.headers?.["x-correlation-id"], req.body?.correlationId, req.body?.correlation_id),
          },
        });
      }

      return res.status(404).json({
        ok: false,
        code: "ACTION_NOT_FOUND",
        message: `Action key not found: ${normalizedActionType}`,
        suggested_resolution: canAutoForge
          ? `Action missing — forging initiated: ${forgeRequest?.id || "pending"}`
          : "Create Action Forge Request?",
        forge_request_id: forgeRequest?.id || null,
        escalation: canAutoForge ? null : "Escalate to DEV_AGENT for safe action fabrication.",
      });
    }

    const payload = (req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {}) as Record<
      string,
      unknown
    >;
    const dryRunRequested = isTruthy(req.body?.dryRun) || isTruthy(req.body?.dry_run);
    if (dryRunRequested && (payload as any).dryRun == null && (payload as any).dry_run == null) {
      (payload as any).dryRun = true;
    }

    const idempotencyKey = parseIdempotencyKey(req);
    const ttlSeconds = DEFAULT_IDEMPOTENCY_TTL_SECONDS;
    const idempotencyFloor = idempotencyWindowFromNow(ttlSeconds);
    let replayedFromIdempotency = false;

    let existingByIdempotency: any | null = null;
    if (idempotencyKey) {
      existingByIdempotency = await db.query.actionRequests.findFirst({
        where: and(eq(actionRequests.tenantId, tenant.id), eq(actionRequests.idempotencyKey, idempotencyKey)),
        orderBy: [desc(actionRequests.createdAt)],
      });
      if (existingByIdempotency) replayedFromIdempotency = true;
    }

    const row = replayedFromIdempotency
      ? existingByIdempotency
      : await createActionRequest({
      tenantId: tenant.id,
      requestedByUserId: staffUser?.id ?? null,
      requestedByAgentKey: String(req.body?.requestedByAgentKey ?? req.body?.requested_by_agent_key ?? "").trim() || null,
      actionType: normalizedActionType as any,
      payload,
      priority: parseIntSafe(req.body?.priority) ?? 0,
      idempotencyKey,
      relatedConversationId: req.body?.relatedConversationId ?? req.body?.related_conversation_id ?? null,
      relatedThreadId: parseIntSafe(req.body?.relatedThreadId ?? req.body?.related_thread_id),
      correlationId: firstNonEmptyString(req.headers?.["x-correlation-id"], req.body?.correlationId, req.body?.correlation_id),
      mode: String(req.body?.mode || "").toUpperCase() === "SIMULATED" ? "SIMULATED" : "REAL",
      isAdmin: isAdminUser(staffUser),
    });

    const latestResult = row ? await fetchLatestActionResult(tenant.id, Number(row.id)) : null;
    const receipts = row ? await fetchActionReceipts(tenant.id, Number(row.id)) : [];
    const evidence = buildActionEvidenceContract({
      actionRequest: row,
      latestResult,
      receipts,
    });

    res.status(replayedFromIdempotency ? 200 : 201).json({
      ok: true,
      actionRequest: withActionIdentity(row as any),
      ...evidence,
      idempotency: {
        key: idempotencyKey || null,
        replayed: replayedFromIdempotency,
        ttlSeconds,
        requestedWindowStart: idempotencyFloor.toISOString(),
      },
    });
  } catch (err: any) {
    const msg = err?.message || "Failed to create action request";
    const status =
      msg.includes("Mailbox not provisioned") ? 404 : msg.includes("payload.agentKey") ? 400 : msg.includes("Mailbox disabled") ? 423 : 500;
    res.status(status).json({ message: msg });
  }
});

router.post("/:id/evidence", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const actionId = parseIntSafe(req.params?.id);
    if (!actionId) return res.status(400).json({ message: "action id required" });

    const row = await db.query.actionRequests.findFirst({
      where: and(eq(actionRequests.tenantId, tenant.id), eq(actionRequests.id, actionId)),
    });
    if (!row) return res.status(404).json({ message: "Action request not found" });

    const evidencePayloadRaw = Array.isArray(req.body?.evidence)
      ? req.body.evidence
      : req.body?.evidence != null
        ? [req.body.evidence]
        : [];
    const evidencePayload = evidencePayloadRaw.filter((item: any) => item && typeof item === "object");
    if (!evidencePayload.length) {
      return res.status(400).json({ message: "evidence payload required" });
    }

    const metadata = asObject(row.metadata);
    const existingEvidence = Array.isArray(metadata.evidence) ? metadata.evidence : [];
    const mergedEvidence = [...existingEvidence, ...evidencePayload].slice(-200);
    const now = new Date();
    const lifecycle = String((row as any).lifecycleState || "").trim().toUpperCase();
    const status = String((row as any).status || "").trim().toUpperCase();
    const shouldQueue = lifecycle === "CREATED" && status === "PENDING";

    const [updated] = await db
      .update(actionRequests)
      .set({
        metadata: {
          ...metadata,
          evidence: mergedEvidence,
          evidenceUpdatedAt: now.toISOString(),
        },
        evidenceStatus: "SATISFIED" as any,
        status: shouldQueue ? ("QUEUED" as any) : (row as any).status,
        lifecycleState: shouldQueue ? ("QUEUED" as any) : ((row as any).lifecycleState || "CREATED"),
        nextRetryAt: shouldQueue ? null : (row as any).nextRetryAt,
        errorCode: shouldQueue ? null : (row as any).errorCode,
        errorMessage: shouldQueue ? null : (row as any).errorMessage,
        updatedAt: now,
      } as any)
      .where(and(eq(actionRequests.tenantId, tenant.id), eq(actionRequests.id, actionId)))
      .returning();

    await appendActionEvent({
      actionId,
      correlationId: (updated as any)?.correlationId ?? (updated as any)?.correlation_id ?? null,
      eventType: "EVIDENCE_SATISFIED",
      payload: {
        count: evidencePayload.length,
      },
    });
    if (shouldQueue) {
      await appendActionEvent({
        actionId,
        correlationId: (updated as any)?.correlationId ?? (updated as any)?.correlation_id ?? null,
        eventType: "QUEUED",
        payload: {
          reason: "evidence_satisfied",
        },
      });
    }

    return res.json({
      ok: true,
      actionRequest: withActionIdentity(updated as any),
      queued: shouldQueue,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || "Failed to attach evidence" });
  }
});

router.get("/queue", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const limit = Math.min(Math.max(parseIntSafe(req.query?.limit) ?? 200, 1), 2000);
    const statusFilter = String(req.query?.status || "").trim().toUpperCase();
    const conversationIdFilter = String(req.query?.conversationId || "").trim();

    const conditions = [eq(actionRequests.tenantId, tenant.id)];
    if (statusFilter) {
      if (["CREATED", "QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELED"].includes(statusFilter)) {
        conditions.push(eq(actionRequests.lifecycleState, statusFilter as any));
      } else if (statusFilter === "SUCCEEDED") {
        conditions.push(eq(actionRequests.status, "DONE" as any));
      } else if (statusFilter === "CANCELED") {
        conditions.push(eq(actionRequests.status, "CANCELLED" as any));
      } else {
        conditions.push(eq(actionRequests.status, statusFilter as any));
      }
    }
    if (conversationIdFilter) conditions.push(eq(actionRequests.relatedConversationId, conversationIdFilter));
    const where = conditions.length === 1 ? conditions[0] : and(...conditions);

    const rows = await db
      .select()
      .from(actionRequests)
      .where(where)
      .orderBy(desc(actionRequests.createdAt))
      .limit(limit);

    const actionIds = rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
    const resultByActionId = new Map<number, any>();
    const emailByActionId = new Map<number, any>();
    const receiptsByActionId = new Map<number, any[]>();

    if (actionIds.length) {
      const latestResults = await db.query.actionResults.findMany({
        where: and(eq(actionResults.tenantId, tenant.id), inArray(actionResults.actionRequestId, actionIds)),
        orderBy: [desc(actionResults.createdAt)],
        limit: Math.min(actionIds.length * 5, 5000),
      });
      for (const row of latestResults) {
        const actionId = Number(row.actionRequestId);
        if (!actionId || resultByActionId.has(actionId)) continue;
        resultByActionId.set(actionId, row);
      }

      const latestEmails = await db.query.emailMessages.findMany({
        where: and(eq(emailMessages.tenantId, tenant.id), inArray(emailMessages.actionRequestId, actionIds as any)),
        orderBy: [desc(emailMessages.createdAt)],
        limit: Math.min(actionIds.length * 3, 3000),
      });
      for (const row of latestEmails) {
        const actionId = Number(row.actionRequestId);
        if (!actionId || emailByActionId.has(actionId)) continue;
        emailByActionId.set(actionId, row);
      }

      const receipts = await db.query.actionReceipts.findMany({
        where: and(eq(actionReceipts.tenantId, tenant.id), inArray(actionReceipts.actionRunId, actionIds)),
        orderBy: [desc(actionReceipts.createdAt)],
        limit: Math.min(actionIds.length * 30, 6000),
      });
      for (const receipt of receipts) {
        const actionId = Number(receipt.actionRunId);
        if (!actionId) continue;
        const bucket = receiptsByActionId.get(actionId) ?? [];
        bucket.push(receipt);
        receiptsByActionId.set(actionId, bucket);
      }
    }

    const items = rows.map((row) => {
      const identityRow = withActionIdentity(row as any);
      const payload = asObject(row.payload);
      const latestResult = resultByActionId.get(Number(row.id)) || null;
      const latestEmail = emailByActionId.get(Number(row.id)) || null;
      const evidence = buildActionEvidenceContract({
        actionRequest: row,
        latestResult,
        receipts: receiptsByActionId.get(Number(row.id)) || [],
      });
      const latestResultError = asObject(latestResult?.error);
      const latestEmailMeta = asObject(latestEmail?.metadata);
      const deliveryMeta = asObject(latestEmailMeta.delivery);
      const failureReason =
        firstNonEmptyString(latestResultError.message, latestEmailMeta.error, identityRow.lastError) ||
        (row.status === "FAILED" ? "Action failed without a diagnostic message." : null);
      const traceConversationId =
        firstNonEmptyString(row.relatedConversationId, payload.conversationId, payload.relatedConversationId) || null;

      return {
        ...identityRow,
        trace: {
          conversationId: traceConversationId,
          source: firstNonEmptyString(payload.source, payload.channelId, payload.roomType),
          correlationId: firstNonEmptyString(row.correlationId, payload.correlationId, payload.traceId),
        },
        evidence,
        diagnostics: {
          failureReason,
          deliveryStatus: firstNonEmptyString(latestEmail?.status, deliveryMeta.deliveryStatus),
          queueId: firstNonEmptyString(deliveryMeta.queueId),
          providerResponse: firstNonEmptyString(deliveryMeta.response),
        },
        latestResult: latestResult
          ? {
              id: latestResult.id,
              createdAt: latestResult.createdAt,
              result: latestResult.result ?? {},
              error: latestResult.error ?? null,
            }
          : null,
        latestEmail: latestEmail
          ? {
              id: latestEmail.id,
              createdAt: latestEmail.createdAt,
              status: latestEmail.status,
              fromEmail: latestEmail.fromEmail,
              toJson: latestEmail.toJson,
              subject: latestEmail.subject,
              messageId: latestEmail.messageId,
              metadata: latestEmail.metadata ?? {},
            }
          : null,
      };
    });

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list actions" });
  }
});

router.get("/status", async (_req: any, res) => {
  res.json({
    ok: true,
    runner: getActionsWorkerStatus(),
  });
});

router.get("/automation-manager", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const ensure = isTruthy(req.query?.ensure);

    const managerResult = await db.execute(sql`
      select a.id, a.name, a.role, a.company_id
      from agents a
      join companies c on c.id = a.company_id
      where c.tenant_id = ${tenant.id}
        and a.status = 'active'
        and a.is_test = false
        and a.is_visible = true
        and (
          lower(coalesce(a.role, '')) like '%automation manager%'
          or lower(coalesce(a.name, '')) like '%automation manager%'
        )
      order by a.id asc
      limit 1
    `);

    let manager = rows<any>(managerResult)[0] || null;

    if (!manager && ensure) {
      const companyResult = await db.execute(sql`
        select id
        from companies
        where tenant_id = ${tenant.id}
        order by id asc
        limit 1
      `);
      const firstCompany = rows<any>(companyResult)[0] || null;
      if (!firstCompany?.id) {
        return res.status(409).json({
          ok: false,
          code: "NO_COMPANY_FOR_TENANT",
          message: "No company available to assign Automation Manager",
        });
      }

      const inserted = await db.execute(sql`
        insert into agents (
          company_id,
          env,
          is_test,
          is_visible,
          name,
          role,
          status,
          mission,
          responsibilities,
          permissions,
          decision_authority,
          capabilities,
          metadata,
          created_at,
          updated_at
        )
        values (
          ${firstCompany.id},
          'prod',
          false,
          true,
          'Automation Manager',
          'Automation Manager',
          'active',
          'Own automation catalog, monitor failures, and propose/refactor automations.',
          ${JSON.stringify([
            "Own automation catalog",
            "Monitor automation failures",
            "Propose new automations",
            "Refactor outdated automations",
          ])}::jsonb,
          ${JSON.stringify({
            email: true,
            calendar: true,
            crm: true,
            knowledge: true,
            payments: false,
            webResearch: true,
          })}::jsonb,
          'high',
          ${JSON.stringify({
            canUseWorkstation: true,
            canBrowseWeb: true,
            canExecuteActions: true,
            canWriteData: true,
            canDeploy: false,
          })}::jsonb,
          ${JSON.stringify({ systemGenerated: true, owner: "automation_manager" })}::jsonb,
          now(),
          now()
        )
        returning id, name, role, company_id
      `);
      manager = rows<any>(inserted)[0] || null;
    }

    return res.json({ ok: true, manager });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || "Failed to load automation manager" });
  }
});

router.get("/health", async (_req: any, res) => {
  const runner = getActionsWorkerStatus();
  const healthy = Boolean(runner?.healthy || runner?.running);
  res.json({
    ok: true,
    healthy,
    runner,
    timestamp: new Date().toISOString(),
  });
});

router.get("/live", async (req: any, res) => {
  const tenant = req.tenant;
  if (!tenant) return res.status(400).json({ message: "tenant required" });

  const limit = Math.min(Math.max(parseIntSafe(req.query?.limit) ?? 100, 1), 500);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let closed = false;
  const sendSnapshot = async () => {
    if (closed) return;
    try {
      const items = await db
        .select()
        .from(actionRequests)
        .where(eq(actionRequests.tenantId, tenant.id))
        .orderBy(desc(actionRequests.updatedAt))
        .limit(limit);

      const payload = {
        ts: new Date().toISOString(),
        runner: getActionsWorkerStatus(),
        items: items.map((item) => withActionIdentity(item as any)),
      };
      res.write(`event: actions_snapshot\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch (error: any) {
      const payload = {
        ts: new Date().toISOString(),
        error: String(error?.message || error || "snapshot_failed"),
      };
      res.write(`event: actions_error\ndata: ${JSON.stringify(payload)}\n\n`);
    }
  };

  await sendSnapshot();
  const timer = setInterval(() => void sendSnapshot(), 2000);
  req.on("close", () => {
    closed = true;
    clearInterval(timer);
    res.end();
  });
});

router.get("/decisions", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const limit = Math.min(Math.max(parseIntSafe(req.query?.limit) ?? 200, 1), 2000);
    const rows = await db
      .select()
      .from(actionRequests)
      .where(and(eq(actionRequests.tenantId, tenant.id), eq(actionRequests.status, "REQUIRES_APPROVAL" as any)))
      .orderBy(desc(actionRequests.createdAt))
      .limit(limit);

    res.json({ ok: true, items: rows.map((row) => withActionIdentity(row as any)) });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list decisions" });
  }
});

router.get("/:id", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const id = parseIntSafe(req.params?.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    const actionRequest = await db.query.actionRequests.findFirst({
      where: and(eq(actionRequests.tenantId, tenant.id), eq(actionRequests.id, id)),
    });
    if (!actionRequest) return res.status(404).json({ message: "Action request not found" });

    const results = await db.query.actionResults.findMany({
      where: and(eq(actionResults.tenantId, tenant.id), eq(actionResults.actionRequestId, id)),
      orderBy: [desc(actionResults.createdAt)],
      limit: 50,
    });
    const receipts = await fetchActionReceipts(tenant.id, id);

    const relatedEmail = await db.query.emailMessages.findMany({
      where: and(eq(emailMessages.tenantId, tenant.id), eq(emailMessages.actionRequestId, id)),
      orderBy: [desc(emailMessages.createdAt)],
      limit: 10,
    });

    res.json({
      ok: true,
      actionRequest: withActionIdentity(actionRequest as any),
      results,
      evidence: buildActionEvidenceContract({
        actionRequest,
        latestResult: results[0] || null,
        receipts,
      }),
      receipts,
      related: {
        emailMessages: relatedEmail,
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch action trace" });
  }
});

router.post("/:id/approve", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const staffUser = req.staffUser;
    if (!isAdminUser(staffUser)) return res.status(403).json({ message: "Admin required" });

    const id = parseIntSafe(req.params?.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    const row = await approveActionRequest({ tenantId: tenant.id, actionRequestId: id, approvedByUserId: staffUser.id });
    res.json({ ok: true, actionRequest: withActionIdentity(row as any) });
  } catch (err: any) {
    const status =
      typeof err?.status === "number" && err.status >= 400 && err.status <= 599
        ? err.status
        : 500;
    res.status(status).json({
      message: err?.message || "Failed to approve",
      code: err?.code || null,
      ...(err?.evaluation ? { outboundPolicy: err.evaluation } : {}),
    });
  }
});

router.post("/:id/deny", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const staffUser = req.staffUser;
    if (!isAdminUser(staffUser)) return res.status(403).json({ message: "Admin required" });

    const id = parseIntSafe(req.params?.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    const row = await denyActionRequest({ tenantId: tenant.id, actionRequestId: id, deniedByUserId: staffUser.id });
    res.json({ ok: true, actionRequest: withActionIdentity(row as any) });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to deny" });
  }
});

router.post("/:id/retry", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const staffUser = req.staffUser;
    if (!isAdminUser(staffUser)) return res.status(403).json({ message: "Admin required" });

    const id = parseIntSafe(req.params?.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    const now = new Date();
    const [row] = await db
      .update(actionRequests)
      .set({
        status: "QUEUED" as any,
        lifecycleState: "QUEUED" as any,
        errorCode: null,
        errorMessage: null,
        claimedUntil: null,
        claimedBy: null,
        nextRetryAt: null,
        startedAt: null,
        finishedAt: null,
        updatedAt: now,
      })
      .where(and(eq(actionRequests.tenantId, tenant.id), eq(actionRequests.id, id)))
      .returning();

    if (!row) return res.status(404).json({ message: "Action request not found" });
    await appendActionEvent({
      actionId: Number(row.id),
      correlationId: row.correlationId || null,
      eventType: "QUEUED",
      payload: {
        reason: "manual_retry",
        requestedByUserId: Number(staffUser?.id || 0) || null,
      },
    });
    res.json({ ok: true, actionRequest: withActionIdentity(row as any) });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to retry" });
  }
});

router.post("/:id/cancel", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const id = parseIntSafe(req.params?.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    const now = new Date();
    const [row] = await db
      .update(actionRequests)
      .set({
        status: "CANCELLED" as any,
        lifecycleState: "CANCELED" as any,
        errorCode: "CANCELED",
        errorMessage: "Action canceled by user",
        claimedUntil: null,
        claimedBy: null,
        finishedAt: now,
        updatedAt: now,
      })
      .where(and(eq(actionRequests.tenantId, tenant.id), eq(actionRequests.id, id)))
      .returning();

    if (!row) return res.status(404).json({ message: "Action request not found" });
    await appendActionEvent({
      actionId: Number(row.id),
      correlationId: row.correlationId || null,
      eventType: "CANCELED",
      payload: {
        reason: "manual_cancel",
      },
    });
    const latestResult = await fetchLatestActionResult(tenant.id, id);
    const receipts = await fetchActionReceipts(tenant.id, id);

    return res.json({
      ok: true,
      actionRequest: withActionIdentity(row as any),
      ...buildActionEvidenceContract({
        actionRequest: row,
        latestResult,
        receipts,
      }),
    });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || "Failed to cancel action" });
  }
});

export default router;
