import "../env";
import fs from "node:fs/promises";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { emailMessages, emailSendLogs, tenants } from "../db/schema";
import { MAIL_DELIVERY_STATUSES } from "../server/lib/mail/deliveryStatus";
import { parsePostfixDeliveryEvents } from "../server/lib/mail/postfixLogParser";

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = String(argv[i] || "").trim();
    if (!key.startsWith("--")) continue;
    const value = String(argv[i + 1] || "").trim();
    if (!value || value.startsWith("--")) continue;
    out[key.slice(2)] = value;
    i += 1;
  }
  return out;
}

function asObject(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function isFailureStatus(status: string) {
  return (
    status === MAIL_DELIVERY_STATUSES.BOUNCED ||
    status === MAIL_DELIVERY_STATUSES.SPAM_REJECTED ||
    status === MAIL_DELIVERY_STATUSES.UNKNOWN
  );
}

async function resolveTenantId(input: { tenantId?: string; tenantKey?: string }) {
  const byId = Number(String(input.tenantId || "").trim());
  if (Number.isFinite(byId) && byId > 0) return Math.trunc(byId);

  const tenantKey = String(input.tenantKey || "").trim().toLowerCase();
  if (!tenantKey) throw new Error("Provide --tenant-id or --tenant.");

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.key, tenantKey as any),
    columns: { id: true },
  });
  if (!tenant) throw new Error(`Tenant not found: ${tenantKey}`);
  return tenant.id;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const logPath = String(args.file || args.path || "").trim();
  if (!logPath) throw new Error("Provide --file /path/to/mail.log");

  const tenantId = await resolveTenantId({ tenantId: args["tenant-id"], tenantKey: args.tenant || "bdo" });
  const raw = await fs.readFile(logPath, "utf8");
  const lines = raw.split(/\r?\n/g).filter(Boolean);
  const events = parsePostfixDeliveryEvents(lines);

  let matchedLogs = 0;
  let updatedLogs = 0;
  let updatedMessages = 0;
  const unmatchedQueueIds: string[] = [];

  for (const event of events) {
    // eslint-disable-next-line no-await-in-loop
    const logs = await db.query.emailSendLogs.findMany({
      where: and(
        eq(emailSendLogs.tenantId, tenantId),
        sql`upper(coalesce(${emailSendLogs.providerResponse}->>'queueId', '')) = ${event.queueId}`,
      ),
      orderBy: [desc(emailSendLogs.id)],
      limit: 100,
    });
    if (!logs.length) {
      unmatchedQueueIds.push(event.queueId);
      continue;
    }

    matchedLogs += logs.length;
    for (const log of logs) {
      const providerResponse = asObject(log.providerResponse);
      const now = new Date();
      // eslint-disable-next-line no-await-in-loop
      await db
        .update(emailSendLogs)
        .set({
          status: event.deliveryStatus,
          providerResponse: {
            ...providerResponse,
            postfix: {
              queueId: event.queueId,
              recipient: event.recipient,
              dsn: event.dsn,
              status: event.postfixStatus,
              reason: event.reason,
              observedAt: now.toISOString(),
            },
            deliveryStatus: event.deliveryStatus,
          },
          error: isFailureStatus(event.deliveryStatus) ? event.reason || log.error : null,
          updatedAt: now,
        })
        .where(eq(emailSendLogs.id, log.id));

      updatedLogs += 1;

      const actionRequestId = log.actionRequestId ? Number(log.actionRequestId) : null;
      if (!actionRequestId || !Number.isFinite(actionRequestId)) continue;

      // eslint-disable-next-line no-await-in-loop
      const messages = await db.query.emailMessages.findMany({
        where: and(
          eq(emailMessages.tenantId, tenantId),
          eq(emailMessages.actionRequestId, actionRequestId),
          eq(emailMessages.direction, "outbound"),
        ),
        limit: 25,
      });

      for (const message of messages) {
        const metadata = asObject(message.metadata);
        const delivery = asObject(metadata.delivery);
        // eslint-disable-next-line no-await-in-loop
        await db
          .update(emailMessages)
          .set({
            status: event.deliveryStatus,
            metadata: {
              ...metadata,
              delivery: {
                ...delivery,
                deliveryStatus: event.deliveryStatus,
                postfix: {
                  queueId: event.queueId,
                  recipient: event.recipient,
                  dsn: event.dsn,
                  status: event.postfixStatus,
                  reason: event.reason,
                  observedAt: new Date().toISOString(),
                },
                error: isFailureStatus(event.deliveryStatus) ? event.reason || null : null,
              },
            },
          })
          .where(eq(emailMessages.id, message.id));
        updatedMessages += 1;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenantId,
        scannedLines: lines.length,
        events: events.length,
        matchedLogs,
        updatedLogs,
        updatedMessages,
        unmatchedQueueIds: Array.from(new Set(unmatchedQueueIds)).slice(0, 200),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[mail-reconcile-postfix] failed:", error?.message || error);
  process.exit(1);
});

