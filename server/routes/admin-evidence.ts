import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@db";
import { actionReceipts, actionRequests, actionResults } from "@db/schema";
import { ensureTenantStaff, isChairmanAssistantUser } from "./utils/auth";

const router = Router();
router.use(ensureTenantStaff);

function isFeatureEnabled(name: string, defaultValue = true) {
  const raw = String((process.env as Record<string, string | undefined>)[name] || "").trim().toLowerCase();
  if (!raw) return defaultValue;
  return ["1", "true", "yes", "on"].includes(raw);
}

function parseIntSafe(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function asObject(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>;
  return {};
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

function summarizeReceipt(receipt: any) {
  return {
    id: receipt.id,
    receiptType: receipt.receiptType,
    entityType: receipt.entityType,
    entityIds: Array.isArray(receipt.entityIdsJson) ? receipt.entityIdsJson : [],
    affectedRows: receipt.affectedRows,
    externalRef: receipt.externalRef,
    evidenceUrl: receipt.evidenceUrl,
    createdAt: receipt.createdAt,
  };
}

router.get("/", async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_ACTION_EVIDENCE", true)) {
      return res.status(404).json({ message: "Action evidence feature disabled" });
    }
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const staffUser = req.staffUser;
    if (!isAdminUser(staffUser)) return res.status(403).json({ message: "Admin required" });

    const limit = Math.min(Math.max(parseIntSafe(req.query?.limit, 50), 1), 200);
    const outcomeFilter = firstNonEmptyString(req.query?.outcome);
    const modeFilter = firstNonEmptyString(req.query?.mode);
    const where = and(
      eq(actionRequests.tenantId, tenant.id),
      outcomeFilter ? eq(actionRequests.outcome, outcomeFilter as any) : sql`true`,
      modeFilter ? eq(actionRequests.mode, modeFilter as any) : sql`true`,
    );

    const runs = await db
      .select()
      .from(actionRequests)
      .where(where)
      .orderBy(desc(actionRequests.createdAt))
      .limit(limit);

    const actionIds = runs.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
    const latestResultByActionId = new Map<number, any>();
    const receiptsByActionId = new Map<number, any[]>();

    if (actionIds.length) {
      const latestResults = await db.query.actionResults.findMany({
        where: and(eq(actionResults.tenantId, tenant.id), inArray(actionResults.actionRequestId, actionIds)),
        orderBy: [desc(actionResults.createdAt)],
        limit: Math.min(actionIds.length * 3, 4000),
      });
      for (const row of latestResults) {
        const actionId = Number(row.actionRequestId);
        if (!actionId || latestResultByActionId.has(actionId)) continue;
        latestResultByActionId.set(actionId, row);
      }

      const receipts = await db.query.actionReceipts.findMany({
        where: and(eq(actionReceipts.tenantId, tenant.id), inArray(actionReceipts.actionRunId, actionIds)),
        orderBy: [desc(actionReceipts.createdAt)],
        limit: Math.min(actionIds.length * 30, 10000),
      });
      for (const receipt of receipts) {
        const actionId = Number(receipt.actionRunId);
        if (!actionId) continue;
        const list = receiptsByActionId.get(actionId) ?? [];
        list.push(receipt);
        receiptsByActionId.set(actionId, list);
      }
    }

    const items = runs.map((run) => {
      const actionId = Number(run.id);
      const latestResult = latestResultByActionId.get(actionId) || null;
      const resultPayload = asObject(latestResult?.result);
      const rawReceipts = receiptsByActionId.get(actionId) || [];
      const receipts = rawReceipts.map((row) => summarizeReceipt(row));
      const receiptCount =
        typeof resultPayload.receipt_count === "number" ? Math.max(0, Math.trunc(resultPayload.receipt_count)) : receipts.length;
      const actor =
        firstNonEmptyString(run.requestedByAgentKey) ||
        (run.requestedByUserId ? `user:${run.requestedByUserId}` : "unknown");
      return {
        id: actionId,
        actionType: run.actionType,
        status: run.status,
        mode: run.mode,
        outcome: run.outcome,
        actor,
        actorUserId: run.requestedByUserId,
        actorAgentKey: run.requestedByAgentKey,
        correlationId: run.correlationId,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        finishedAt: run.finishedAt,
        action_run_id: actionId,
        receipt_count: receiptCount,
        receipts: receipts.slice(0, 10),
      };
    });

    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const noEffectRecent = await db
      .select({ count: sql<number>`count(*)` })
      .from(actionRequests)
      .where(and(eq(actionRequests.tenantId, tenant.id), eq(actionRequests.outcome, "NO_EFFECT"), sql`${actionRequests.createdAt} >= ${hourAgo}`));
    const simulatedRecent = await db
      .select({ count: sql<number>`count(*)` })
      .from(actionRequests)
      .where(and(eq(actionRequests.tenantId, tenant.id), eq(actionRequests.mode, "SIMULATED"), sql`${actionRequests.createdAt} >= ${hourAgo}`));

    return res.json({
      ok: true,
      items,
      alerts: {
        noEffectLastHour: Number(noEffectRecent[0]?.count || 0),
        simulatedLastHour: Number(simulatedRecent[0]?.count || 0),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch evidence runs" });
  }
});

router.get("/:id", async (req: any, res) => {
  try {
    if (!isFeatureEnabled("FEATURE_ACTION_EVIDENCE", true)) {
      return res.status(404).json({ message: "Action evidence feature disabled" });
    }
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const staffUser = req.staffUser;
    if (!isAdminUser(staffUser)) return res.status(403).json({ message: "Admin required" });

    const id = parseIntSafe(req.params?.id, 0);
    if (!id) return res.status(400).json({ message: "invalid id" });

    const run = await db.query.actionRequests.findFirst({
      where: and(eq(actionRequests.tenantId, tenant.id), eq(actionRequests.id, id)),
    });
    if (!run) return res.status(404).json({ message: "Action run not found" });

    const results = await db.query.actionResults.findMany({
      where: and(eq(actionResults.tenantId, tenant.id), eq(actionResults.actionRequestId, id)),
      orderBy: [desc(actionResults.createdAt)],
      limit: 20,
    });
    const receipts = await db.query.actionReceipts.findMany({
      where: and(eq(actionReceipts.tenantId, tenant.id), eq(actionReceipts.actionRunId, id)),
      orderBy: [desc(actionReceipts.createdAt)],
      limit: 200,
    });

    return res.json({
      ok: true,
      run,
      results,
      receipts: receipts.map((row) => summarizeReceipt(row)),
      evidence: {
        action_run_id: Number(run.id),
        outcome: run.outcome,
        receipt_count: receipts.length,
        receipts: receipts.map((row) => summarizeReceipt(row)),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch evidence run detail" });
  }
});

export default router;
