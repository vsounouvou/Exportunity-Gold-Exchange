import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@db";
import { actionEvents, actionRequests } from "@db/schema";
import { ensureTenantAdmin } from "./utils/auth";
import { formatPublicActionLabel, toLifecycleStateFromLegacyStatus } from "../lib/actions/lifecycle";

const router = Router();
router.use(ensureTenantAdmin);

function parseId(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

router.get("/actions/:action_id/events", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ ok: false, message: "tenant required" });

    const actionId = parseId(req.params?.action_id);
    if (!actionId) return res.status(400).json({ ok: false, message: "Invalid action_id" });

    const limitRaw = Number(req.query?.limit ?? 500);
    const limit = Number.isFinite(limitRaw) ? Math.min(2000, Math.max(1, Math.trunc(limitRaw))) : 500;

    const row = await db.query.actionRequests.findFirst({
      where: and(eq(actionRequests.tenantId, Number(tenant.id)), eq(actionRequests.id, actionId)),
    });
    if (!row) return res.status(404).json({ ok: false, message: "Action request not found" });

    const events = await db.query.actionEvents.findMany({
      where: eq(actionEvents.actionId, actionId),
      orderBy: [desc(actionEvents.createdAt)],
      limit,
    });

    const state =
      String((row as any)?.lifecycleState || "").trim().toUpperCase() ||
      toLifecycleStateFromLegacyStatus((row as any)?.status);

    return res.json({
      ok: true,
      action: {
        id: Number((row as any).id),
        publicActionId: formatPublicActionLabel(row as any),
        actionType: String((row as any).actionType || ""),
        status: String((row as any).status || ""),
        state,
        correlationId: String((row as any).correlationId || "").trim() || null,
        errorCode: String((row as any).errorCode || "").trim() || null,
        errorMessage: String((row as any).errorMessage || "").trim() || null,
        updatedAt: (row as any).updatedAt,
      },
      events: events
        .slice()
        .reverse()
        .map((event: any) => ({
          id: Number(event.id),
          actionId: Number(event.actionId),
          correlationId: event.correlationId || null,
          eventType: String(event.eventType || "").toUpperCase(),
          payload: event.payloadJson ?? {},
          createdAt: event.createdAt,
        })),
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Failed to fetch action events" });
  }
});

export default router;
