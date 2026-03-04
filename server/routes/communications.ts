import { Router } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@db";
import { auditLogs, communicationsEvents, communicationsMessages, communicationsThreads, communicationsWorkOrders } from "@db/schema";
import { ensureTenantStaff, isChairmanAssistantUser } from "./utils/auth";
import { normalizeAgentKey } from "../lib/mail/agentSlugs";

const router = Router();
router.use(ensureTenantStaff);

function parseIntSafe(value: unknown) {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseLimit(value: unknown, fallback: number, max: number) {
  const n = parseIntSafe(value);
  if (!n) return fallback;
  return Math.min(Math.max(n, 1), max);
}

function isAdminUser(user: any) {
  if (!user) return false;
  const currentMode = (user as any).currentMode;
  const roles = Array.isArray((user as any).roles) ? (user as any).roles : [];
  const perms = Array.isArray((user as any).permissions) ? (user as any).permissions : [];
  return (
    currentMode === "admin" || roles.includes("admin") || perms.includes("*") || perms.includes("admin:*") || isChairmanAssistantUser(user)
  );
}

router.get("/work-orders", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const limit = parseLimit(req.query?.limit, 200, 2000);
    const agentKey = req.query?.agentKey ? normalizeAgentKey(String(req.query.agentKey)) : null;
    const channel = req.query?.channel ? String(req.query.channel).trim().toLowerCase() : null;

    const conditions: any[] = [eq(communicationsWorkOrders.tenantId, tenant.id), sql`${communicationsWorkOrders.status} <> 'replied'`];
    if (agentKey) conditions.push(eq(communicationsWorkOrders.agentKey, agentKey));
    if (channel) conditions.push(eq(communicationsWorkOrders.channel, channel as any));

    const rows = await db
      .select({
        workOrder: communicationsWorkOrders,
        thread: {
          id: communicationsThreads.id,
          agentKey: communicationsThreads.agentKey,
          channel: communicationsThreads.channel,
          peerAddress: communicationsThreads.peerAddress,
          lastMessageAt: communicationsThreads.lastMessageAt,
          metadata: communicationsThreads.metadata,
        },
      })
      .from(communicationsWorkOrders)
      .leftJoin(
        communicationsThreads,
        and(eq(communicationsWorkOrders.threadId, communicationsThreads.id), eq(communicationsThreads.tenantId, tenant.id)),
      )
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(asc(communicationsWorkOrders.dueAt))
      .limit(limit);

    res.json({ ok: true, items: rows });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list work orders" });
  }
});

router.get("/threads", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const limit = parseLimit(req.query?.limit, 200, 2000);
    const offset = Math.max(parseIntSafe(req.query?.offset) ?? 0, 0);

    const agentKey = req.query?.agentKey ? normalizeAgentKey(String(req.query.agentKey)) : null;
    const channel = req.query?.channel ? String(req.query.channel).trim().toLowerCase() : null;
    const q = String(req.query?.q || "").trim().slice(0, 160);

    const conditions: any[] = [eq(communicationsThreads.tenantId, tenant.id)];
    if (agentKey) conditions.push(eq(communicationsThreads.agentKey, agentKey));
    if (channel) conditions.push(eq(communicationsThreads.channel, channel as any));
    if (q) {
      conditions.push(sql`${communicationsThreads.peerAddress} ILIKE ${"%" + q + "%"}`);
    }

    const rows = await db
      .select({
        thread: communicationsThreads,
        workOrder: communicationsWorkOrders,
      })
      .from(communicationsThreads)
      .leftJoin(
        communicationsWorkOrders,
        and(eq(communicationsWorkOrders.threadId, communicationsThreads.id), eq(communicationsWorkOrders.tenantId, tenant.id)),
      )
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(communicationsThreads.lastMessageAt))
      .limit(limit)
      .offset(offset);

    res.json({ ok: true, items: rows });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list threads" });
  }
});

router.get("/threads/:threadId/messages", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const threadId = parseIntSafe(req.params?.threadId);
    if (!threadId) return res.status(400).json({ message: "Invalid threadId" });

    const limit = parseLimit(req.query?.limit, 200, 2000);
    const offset = Math.max(parseIntSafe(req.query?.offset) ?? 0, 0);

    const thread = await db.query.communicationsThreads.findFirst({
      where: and(eq(communicationsThreads.id, threadId), eq(communicationsThreads.tenantId, tenant.id)),
      columns: { id: true },
    });
    if (!thread) return res.status(404).json({ message: "Thread not found" });

    const items = await db.query.communicationsMessages.findMany({
      where: and(eq(communicationsMessages.threadId, threadId), eq(communicationsMessages.tenantId, tenant.id)),
      orderBy: [asc(communicationsMessages.createdAt)],
      limit,
      offset,
    });

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list messages" });
  }
});

router.post("/work-orders/:workOrderId/escalate", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const staffUser = req.staffUser;
    if (!isAdminUser(staffUser)) return res.status(403).json({ message: "Admin required" });

    const workOrderId = parseIntSafe(req.params?.workOrderId);
    if (!workOrderId) return res.status(400).json({ message: "Invalid workOrderId" });

    const reason = String(req.body?.reason || "").trim().slice(0, 240) || null;

    const wo = await db.query.communicationsWorkOrders.findFirst({
      where: and(eq(communicationsWorkOrders.tenantId, tenant.id), eq(communicationsWorkOrders.id, workOrderId)),
    });
    if (!wo) return res.status(404).json({ message: "Work order not found" });

    const now = new Date();

    await db
      .update(communicationsWorkOrders)
      .set({ lastEscalatedAt: now, updatedAt: now })
      .where(and(eq(communicationsWorkOrders.tenantId, tenant.id), eq(communicationsWorkOrders.id, wo.id)));

    try {
      await db.insert(communicationsEvents).values({
        tenantId: tenant.id,
        provider: "twilio",
        eventType: "work_order.escalated",
        eventAt: now,
        data: {
          type: "communications",
          channel: wo.channel,
          agentKey: wo.agentKey,
          threadId: wo.threadId,
          workOrderId: wo.id,
          peerAddress: wo.peerAddress,
          dueAt: wo.dueAt,
          reason,
        },
        createdAt: now,
      });
    } catch {
      // ignore
    }

    try {
      await db.insert(auditLogs).values({
        tenantId: tenant.id,
        userId: staffUser?.id ?? null,
        userRole: (staffUser as any)?.currentMode || "staff",
        action: "communications_work_order.escalated",
        entityType: "communications_work_order",
        entityId: wo.id,
        metadata: { agentKey: wo.agentKey, channel: wo.channel, threadId: wo.threadId, peerAddress: wo.peerAddress, reason },
        createdAt: now,
      });
    } catch {
      // ignore
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to escalate work order" });
  }
});

router.post("/threads/:threadId/reassign", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const staffUser = req.staffUser;
    if (!isAdminUser(staffUser)) return res.status(403).json({ message: "Admin required" });

    const threadId = parseIntSafe(req.params?.threadId);
    if (!threadId) return res.status(400).json({ message: "Invalid threadId" });

    const newAgentKey = normalizeAgentKey(String(req.body?.agentKey ?? req.body?.agent_id ?? req.body?.agent ?? ""));
    if (!newAgentKey) return res.status(400).json({ message: "agentKey required" });

    const thread = await db.query.communicationsThreads.findFirst({
      where: and(eq(communicationsThreads.id, threadId), eq(communicationsThreads.tenantId, tenant.id)),
    });
    if (!thread) return res.status(404).json({ message: "Thread not found" });
    if (thread.agentKey === newAgentKey) return res.json({ ok: true, thread });

    const existingTarget = await db.query.communicationsThreads.findFirst({
      where: and(
        eq(communicationsThreads.tenantId, tenant.id),
        eq(communicationsThreads.agentKey, newAgentKey),
        eq(communicationsThreads.channel, thread.channel),
        eq(communicationsThreads.peerAddress, thread.peerAddress),
      ),
    });

    const now = new Date();

    if (!existingTarget) {
      const [updated] = await db
        .update(communicationsThreads)
        .set({ agentKey: newAgentKey, updatedAt: now })
        .where(and(eq(communicationsThreads.tenantId, tenant.id), eq(communicationsThreads.id, threadId)))
        .returning();

      await db
        .update(communicationsMessages)
        .set({ agentKey: newAgentKey, updatedAt: now })
        .where(and(eq(communicationsMessages.tenantId, tenant.id), eq(communicationsMessages.threadId, threadId)));

      await db
        .update(communicationsWorkOrders)
        .set({ agentKey: newAgentKey, updatedAt: now })
        .where(and(eq(communicationsWorkOrders.tenantId, tenant.id), eq(communicationsWorkOrders.threadId, threadId)));

      return res.json({ ok: true, thread: updated });
    }

    // Merge threads: move messages + work order to the target thread, then delete the old thread.
    const targetThreadId = existingTarget.id;

    await db
      .update(communicationsMessages)
      .set({ threadId: targetThreadId, agentKey: newAgentKey, updatedAt: now })
      .where(and(eq(communicationsMessages.tenantId, tenant.id), eq(communicationsMessages.threadId, threadId)));

    const srcWork = await db.query.communicationsWorkOrders.findFirst({
      where: and(eq(communicationsWorkOrders.tenantId, tenant.id), eq(communicationsWorkOrders.threadId, threadId)),
    });
    const dstWork = await db.query.communicationsWorkOrders.findFirst({
      where: and(eq(communicationsWorkOrders.tenantId, tenant.id), eq(communicationsWorkOrders.threadId, targetThreadId)),
    });

    if (srcWork && dstWork) {
      const srcInboundAt = srcWork.lastInboundAt ? new Date(srcWork.lastInboundAt).getTime() : 0;
      const dstInboundAt = dstWork.lastInboundAt ? new Date(dstWork.lastInboundAt).getTime() : 0;
      const useSrc = srcInboundAt >= dstInboundAt;
      const nextStatus = srcWork.status !== "replied" || dstWork.status !== "replied" ? "open" : "replied";

      await db
        .update(communicationsWorkOrders)
        .set({
          agentKey: newAgentKey,
          status: nextStatus,
          lastInboundMessageId: useSrc ? srcWork.lastInboundMessageId : dstWork.lastInboundMessageId,
          lastInboundAt: useSrc ? srcWork.lastInboundAt : dstWork.lastInboundAt,
          dueAt: useSrc ? srcWork.dueAt : dstWork.dueAt,
          ackSentAt: dstWork.ackSentAt || srcWork.ackSentAt,
          repliedAt: dstWork.repliedAt || srcWork.repliedAt,
          updatedAt: now,
        })
        .where(and(eq(communicationsWorkOrders.tenantId, tenant.id), eq(communicationsWorkOrders.id, dstWork.id)));

      await db
        .delete(communicationsWorkOrders)
        .where(and(eq(communicationsWorkOrders.tenantId, tenant.id), eq(communicationsWorkOrders.id, srcWork.id)));
    } else if (srcWork && !dstWork) {
      await db
        .update(communicationsWorkOrders)
        .set({ threadId: targetThreadId, agentKey: newAgentKey, updatedAt: now })
        .where(and(eq(communicationsWorkOrders.tenantId, tenant.id), eq(communicationsWorkOrders.id, srcWork.id)));
    } else if (!srcWork && dstWork) {
      await db
        .update(communicationsWorkOrders)
        .set({ agentKey: newAgentKey, updatedAt: now })
        .where(and(eq(communicationsWorkOrders.tenantId, tenant.id), eq(communicationsWorkOrders.id, dstWork.id)));
    }

    await db
      .delete(communicationsThreads)
      .where(and(eq(communicationsThreads.tenantId, tenant.id), eq(communicationsThreads.id, threadId)));

    // Keep the target thread's lastMessageAt fresh.
    await db
      .update(communicationsThreads)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(and(eq(communicationsThreads.tenantId, tenant.id), eq(communicationsThreads.id, targetThreadId)));

    res.json({ ok: true, threadId: targetThreadId, merged: true });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to reassign thread" });
  }
});

export default router;
