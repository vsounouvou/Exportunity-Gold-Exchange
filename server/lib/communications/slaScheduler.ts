import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@db";
import { auditLogs, communicationsEvents, communicationsWorkOrders, emailWorkOrders } from "@db/schema";

function truthyEnv(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  const n = Math.trunc(parsed);
  return Math.max(min, Math.min(max, n));
}

export function startWorkOrderSlaScheduler() {
  const enabled = String(process.env.WORK_ORDERS_SLA_WORKER_ENABLED || "true").trim().toLowerCase() !== "false";
  if (!enabled) return null;

  const intervalMs = clampInt(process.env.WORK_ORDERS_SLA_WORKER_INTERVAL_MS, 5_000, 10 * 60_000, 60_000);
  const maxBatch = clampInt(process.env.WORK_ORDERS_SLA_WORKER_MAX_BATCH, 1, 250, 50);
  const escalateEveryMin = clampInt(process.env.WORK_ORDERS_SLA_ESCALATE_EVERY_MIN, 1, 24 * 60, 30);
  const notifyViaAudit = String(process.env.WORK_ORDERS_SLA_AUDIT_ENABLED || "true").trim().toLowerCase() !== "false";

  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    const now = new Date();
    const nextEligible = new Date(now.getTime() - escalateEveryMin * 60_000);

    try {
      const overdueComms = await db.query.communicationsWorkOrders.findMany({
        where: and(
          sql`${communicationsWorkOrders.status} <> 'replied'`,
          sql`${communicationsWorkOrders.dueAt} is not null`,
          lte(communicationsWorkOrders.dueAt, now),
          or(isNull(communicationsWorkOrders.lastEscalatedAt), lte(communicationsWorkOrders.lastEscalatedAt, nextEligible)),
        ),
        orderBy: [asc(communicationsWorkOrders.dueAt)],
        limit: maxBatch,
      });

      for (const wo of overdueComms) {
        await db
          .update(communicationsWorkOrders)
          .set({ lastEscalatedAt: now, updatedAt: now })
          .where(and(eq(communicationsWorkOrders.tenantId, wo.tenantId), eq(communicationsWorkOrders.id, wo.id)));

        await db.insert(communicationsEvents).values({
          tenantId: wo.tenantId,
          provider: "twilio",
          eventType: "work_order.sla_breached",
          eventAt: now,
          data: {
            type: "communications",
            channel: wo.channel,
            agentKey: wo.agentKey,
            threadId: wo.threadId,
            workOrderId: wo.id,
            peerAddress: wo.peerAddress,
            dueAt: wo.dueAt,
          },
          createdAt: now,
        });

        if (notifyViaAudit) {
          try {
            await db.insert(auditLogs).values({
              tenantId: wo.tenantId,
              userId: null,
              userRole: "staff",
              action: "work_order.sla_breached",
              entityType: "communications_work_order",
              entityId: wo.id,
              metadata: { channel: wo.channel, agentKey: wo.agentKey, threadId: wo.threadId, peerAddress: wo.peerAddress, dueAt: wo.dueAt },
              createdAt: now,
            });
          } catch {
            // ignore
          }
        }
      }

      const overdueEmail = await db.query.emailWorkOrders.findMany({
        where: and(
          sql`${emailWorkOrders.status} <> 'replied'`,
          sql`${emailWorkOrders.dueAt} is not null`,
          lte(emailWorkOrders.dueAt, now),
          or(isNull(emailWorkOrders.lastEscalatedAt), lte(emailWorkOrders.lastEscalatedAt, nextEligible)),
        ),
        orderBy: [asc(emailWorkOrders.dueAt)],
        limit: Math.max(1, Math.floor(maxBatch / 2)),
      });

      for (const wo of overdueEmail) {
        await db
          .update(emailWorkOrders)
          .set({ lastEscalatedAt: now, updatedAt: now })
          .where(and(eq(emailWorkOrders.tenantId, wo.tenantId), eq(emailWorkOrders.id, wo.id)));

        if (notifyViaAudit) {
          try {
            await db.insert(auditLogs).values({
              tenantId: wo.tenantId,
              userId: null,
              userRole: "staff",
              action: "email_work_order.sla_breached",
              entityType: "email_work_order",
              entityId: wo.id,
              metadata: { agentKey: wo.agentKey, mailboxId: wo.mailboxId, threadId: wo.threadId, senderEmail: wo.senderEmail, dueAt: wo.dueAt },
              createdAt: now,
            });
          } catch {
            // ignore
          }
        }
      }
    } finally {
      running = false;
    }
  };

  const initialDelayMs = truthyEnv(process.env.WORK_ORDERS_SLA_WORKER_RUN_IMMEDIATELY) ? 0 : clampInt(process.env.WORK_ORDERS_SLA_WORKER_INITIAL_DELAY_MS, 0, 60_000, 5_000);
  setTimeout(() => void tick(), initialDelayMs);
  const timer = setInterval(() => void tick(), intervalMs);

  return { intervalMs, maxBatch, stop: () => clearInterval(timer) };
}

