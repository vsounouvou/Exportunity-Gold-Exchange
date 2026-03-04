import "../env";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { emailMessages, emailSendLogs } from "../db/schema";
import { evaluateSmtpDelivery, normalizeAndValidateRecipients, describeDeliveryFailure } from "../server/lib/mail/outboundPolicy";
import { classifyMailDeliveryStatus, MAIL_DELIVERY_STATUSES } from "../server/lib/mail/deliveryStatus";

type SendLogRow = typeof emailSendLogs.$inferSelect;

async function loadCandidateLogs() {
  return db.query.emailSendLogs.findMany({
    where: eq(emailSendLogs.status, "sent"),
    limit: 5000,
    orderBy: (table, { desc }) => [desc(table.id)],
  });
}

function shouldBackfill(log: SendLogRow) {
  const requested = normalizeAndValidateRecipients(Array.isArray(log.toJson) ? log.toJson : []).recipients;
  if (!requested.length) return { shouldFix: true, reason: "missing_requested_recipients" };
  const outcome = evaluateSmtpDelivery(requested, log.providerResponse as any);
  if (outcome.ok) return { shouldFix: false, reason: "" };
  return { shouldFix: true, reason: describeDeliveryFailure(outcome) };
}

async function backfill() {
  const rows = await loadCandidateLogs();
  const toFix = rows
    .map((row) => {
      const verdict = shouldBackfill(row);
      return { row, verdict };
    })
    .filter((entry) => entry.verdict.shouldFix);

  for (const entry of toFix) {
    const now = new Date();
    const reason = `backfill_delivery_mismatch:${entry.verdict.reason}`;
    const outcome = evaluateSmtpDelivery(
      normalizeAndValidateRecipients(Array.isArray(entry.row.toJson) ? entry.row.toJson : []).recipients,
      entry.row.providerResponse as any,
    );
    const classified = classifyMailDeliveryStatus({ delivery: outcome, errorMessage: reason });
    const status =
      classified === MAIL_DELIVERY_STATUSES.ACCEPTED_BY_MTA
        ? MAIL_DELIVERY_STATUSES.UNKNOWN
        : classified;

    await db
      .update(emailSendLogs)
      .set({
        status,
        error: reason,
        updatedAt: now,
      })
      .where(eq(emailSendLogs.id, entry.row.id));

    if (entry.row.actionRequestId) {
      await db
        .update(emailMessages)
        .set({ status })
        .where(
          and(
            eq(emailMessages.actionRequestId, entry.row.actionRequestId),
            eq(emailMessages.direction, "outbound"),
          ),
        );
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        scanned: rows.length,
        fixed: toFix.length,
        fixedLogIds: toFix.map((entry) => entry.row.id),
      },
      null,
      2,
    ),
  );
}

backfill().catch((error) => {
  console.error("[mail-backfill-send-status] failed:", error?.message || error);
  process.exit(1);
});
