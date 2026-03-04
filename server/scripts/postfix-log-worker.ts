import "../../env";
import { db } from "../../db";
import { emailMessages, emailSendLogs } from "../../db/schema";
import { eq, sql } from "drizzle-orm";
import { parsePostfixDeliveryEvents } from "../lib/mail/postfixLogParser";
import type { PostfixDeliveryEvent } from "../lib/mail/postfixLogParser";
import fs from "fs";
import { Tail } from "tail";

const POSTFIX_LOG_PATH = process.env.POSTFIX_LOG_PATH || "/var/log/mail.log";
const WATCH_INTERVAL_MS = Number(process.env.POSTFIX_LOG_WATCH_INTERVAL || "1000");

async function updateMessageStatus(event: PostfixDeliveryEvent) {
  try {
    const { queueId, recipient, deliveryStatus, dsn, postfixStatus, reason } = event;

    console.log(`[postfix-log-worker] Processing: queueId=${queueId}, recipient=${recipient}, status=${deliveryStatus}`);

    // Find messages by queue ID stored in metadata
    const messages = await db
      .select()
      .from(emailMessages)
      .where(sql`${emailMessages.metadata}->>'queueId' = ${queueId}`)
      .limit(10);

    if (messages.length === 0) {
      console.log(`[postfix-log-worker] No messages found for queueId=${queueId}`);
      return;
    }

    for (const msg of messages) {
      const toEmails = Array.isArray(msg.toJson) ? msg.toJson : [];
      const recipientMatch = toEmails.some(
        (email) => email.toLowerCase() === recipient.toLowerCase()
      );

      if (!recipientMatch) {
        console.log(`[postfix-log-worker] Recipient ${recipient} not in message ${msg.id} recipients`);
        continue;
      }

      // Update email message status
      await db
        .update(emailMessages)
        .set({
          status: deliveryStatus,
          metadata: {
            ...(msg.metadata as any || {}),
            postfixDeliveryStatus: deliveryStatus,
            postfixQueueId: queueId,
            postfixDsn: dsn,
            postfixStatus: postfixStatus,
            postfixReason: reason,
            postfixUpdatedAt: new Date().toISOString(),
          },
        })
        .where(eq(emailMessages.id, msg.id));

      console.log(`[postfix-log-worker] ✅ Updated message ${msg.id} → ${deliveryStatus}`);

      // Also update send log if exists
      if (msg.metadata && typeof msg.metadata === "object" && "correlationId" in msg.metadata) {
        const correlationId = (msg.metadata as any).correlationId;
        if (correlationId) {
          await db
            .update(emailSendLogs)
            .set({
              status: deliveryStatus,
              metadata: sql`${emailSendLogs.metadata} || ${JSON.stringify({
                postfixDeliveryStatus: deliveryStatus,
                postfixQueueId: queueId,
                postfixDsn: dsn,
                postfixStatus: postfixStatus,
                postfixReason: reason,
                postfixUpdatedAt: new Date().toISOString(),
              })}::jsonb`,
              updatedAt: new Date(),
            })
            .where(sql`${emailSendLogs.metadata}->>'correlationId' = ${correlationId}`);

          console.log(`[postfix-log-worker] ✅ Updated send log for correlationId=${correlationId}`);
        }
      }
    }
  } catch (err) {
    console.error("[postfix-log-worker] Error updating status:", err);
  }
}

async function main() {
  console.log("[postfix-log-worker] Starting...");
  console.log(`[postfix-log-worker] Watching log file: ${POSTFIX_LOG_PATH}`);

  if (!fs.existsSync(POSTFIX_LOG_PATH)) {
    console.error(`[postfix-log-worker] ❌ Log file not found: ${POSTFIX_LOG_PATH}`);
    console.error(`[postfix-log-worker] Set POSTFIX_LOG_PATH environment variable or ensure file exists`);
    process.exit(1);
  }

  const tail = new Tail(POSTFIX_LOG_PATH, {
    follow: true,
    useWatchFile: true,
    fsWatchOptions: {
      interval: WATCH_INTERVAL_MS,
    },
  });

  tail.on("line", async (line: string) => {
    const events = parsePostfixDeliveryEvents([line]);
    for (const event of events) {
      await updateMessageStatus(event);
    }
  });

  tail.on("error", (err: unknown) => {
    console.error("[postfix-log-worker] ⚠️ Tail error:", err);
  });

  console.log("[postfix-log-worker] ✅ Ready - monitoring Postfix logs");

  // Keep process alive
  process.on("SIGINT", () => {
    console.log("[postfix-log-worker] Shutting down...");
    tail.unwatch();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("[postfix-log-worker] Shutting down...");
    tail.unwatch();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[postfix-log-worker] Fatal error:", err);
  process.exit(1);
});
