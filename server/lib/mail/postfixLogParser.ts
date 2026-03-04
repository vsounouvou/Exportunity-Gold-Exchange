import { MAIL_DELIVERY_STATUSES, type MailDeliveryStatus } from "./deliveryStatus";

export type PostfixDeliveryEvent = {
  queueId: string;
  recipient: string;
  dsn: string | null;
  postfixStatus: string | null;
  reason: string | null;
  deliveryStatus: MailDeliveryStatus;
};

function normalizeQueueId(value: string) {
  return String(value || "").trim().toUpperCase();
}

function normalizeEmail(value: string) {
  return String(value || "").trim().toLowerCase();
}

function deriveStatus(input: { dsn: string | null; postfixStatus: string | null; reason: string | null }): MailDeliveryStatus {
  const dsn = String(input.dsn || "").trim();
  const postfixStatus = String(input.postfixStatus || "").trim().toLowerCase();
  const reason = String(input.reason || "");
  const spamLike = /(5\.7\.\d+|unauthenticated|spf|dkim|dmarc|spam|policy rejection|block list|blacklist)/i.test(reason);

  if (dsn.startsWith("2.")) return MAIL_DELIVERY_STATUSES.DELIVERED_REMOTE_ACCEPTED;
  if (dsn.startsWith("4.")) return MAIL_DELIVERY_STATUSES.DEFERRED;
  if (dsn.startsWith("5.")) return spamLike ? MAIL_DELIVERY_STATUSES.SPAM_REJECTED : MAIL_DELIVERY_STATUSES.BOUNCED;
  if (postfixStatus === "sent") return MAIL_DELIVERY_STATUSES.DELIVERED_REMOTE_ACCEPTED;
  if (postfixStatus === "deferred") return MAIL_DELIVERY_STATUSES.DEFERRED;
  if (postfixStatus === "bounced") return spamLike ? MAIL_DELIVERY_STATUSES.SPAM_REJECTED : MAIL_DELIVERY_STATUSES.BOUNCED;
  return MAIL_DELIVERY_STATUSES.UNKNOWN;
}

export function parsePostfixDeliveryEvent(line: string): PostfixDeliveryEvent | null {
  const text = String(line || "").trim();
  if (!text) return null;

  // Example:
  // postfix/smtp[123]: 4A1B2C3D4E: to=<user@example.com>, relay=..., dsn=2.0.0, status=sent (250 2.0.0 Ok: queued as XYZ123)
  const match = text.match(
    /\b([A-F0-9]{5,})\b:\s+to=<([^>]+)>,[\s\S]*?(?:dsn=([245]\.\d+\.\d+))?[\s,]*status=([a-z]+)\s+\(([\s\S]*?)\)\s*$/i,
  );
  if (!match) return null;

  const queueId = normalizeQueueId(match[1] || "");
  const recipient = normalizeEmail(match[2] || "");
  const dsn = String(match[3] || "").trim() || null;
  const postfixStatus = String(match[4] || "").trim().toLowerCase() || null;
  const reason = String(match[5] || "").trim() || null;
  if (!queueId || !recipient) return null;

  return {
    queueId,
    recipient,
    dsn,
    postfixStatus,
    reason,
    deliveryStatus: deriveStatus({ dsn, postfixStatus, reason }),
  };
}

export function parsePostfixDeliveryEvents(lines: string[]) {
  const events: PostfixDeliveryEvent[] = [];
  for (const line of lines) {
    const event = parsePostfixDeliveryEvent(line);
    if (event) events.push(event);
  }
  return events;
}

