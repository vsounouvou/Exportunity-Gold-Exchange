import type { DeliveryEvaluation } from "./outboundPolicy";

export const MAIL_DELIVERY_STATUSES = {
  QUEUED: "QUEUED",
  ACCEPTED_BY_MTA: "ACCEPTED_BY_MTA",
  DELIVERED_REMOTE_ACCEPTED: "DELIVERED_REMOTE_ACCEPTED",
  BOUNCED: "BOUNCED",
  DEFERRED: "DEFERRED",
  SPAM_REJECTED: "SPAM_REJECTED",
  UNKNOWN: "UNKNOWN",
} as const;

export type MailDeliveryStatus = (typeof MAIL_DELIVERY_STATUSES)[keyof typeof MAIL_DELIVERY_STATUSES];

type ClassifyDeliveryStatusInput = {
  delivery: DeliveryEvaluation | null | undefined;
  errorMessage?: string | null;
};

function normalizeStatusToken(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function textContainsSpamSignal(value: string) {
  return (
    /5\.7\.\d+/.test(value) ||
    /(unauthenticated|not authenticated|authentication failed)/i.test(value) ||
    /\b(spf|dkim|dmarc)\b/i.test(value) ||
    /(blacklist|block\s*list|spam|policy rejection)/i.test(value)
  );
}

export function normalizeMailDeliveryStatus(value: unknown): MailDeliveryStatus {
  const token = normalizeStatusToken(value);
  switch (token) {
    case "QUEUED":
      return MAIL_DELIVERY_STATUSES.QUEUED;
    case "ACCEPTED_BY_MTA":
    case "SENT":
      return MAIL_DELIVERY_STATUSES.ACCEPTED_BY_MTA;
    case "DELIVERED_REMOTE_ACCEPTED":
    case "DELIVERED":
      return MAIL_DELIVERY_STATUSES.DELIVERED_REMOTE_ACCEPTED;
    case "BOUNCED":
    case "FAILED":
      return MAIL_DELIVERY_STATUSES.BOUNCED;
    case "DEFERRED":
      return MAIL_DELIVERY_STATUSES.DEFERRED;
    case "SPAM_REJECTED":
      return MAIL_DELIVERY_STATUSES.SPAM_REJECTED;
    default:
      return MAIL_DELIVERY_STATUSES.UNKNOWN;
  }
}

export function classifyMailDeliveryStatus(input: ClassifyDeliveryStatusInput): MailDeliveryStatus {
  const delivery = input.delivery;
  if (!delivery) {
    const err = String(input.errorMessage || "");
    return textContainsSpamSignal(err) ? MAIL_DELIVERY_STATUSES.SPAM_REJECTED : MAIL_DELIVERY_STATUSES.UNKNOWN;
  }

  const responseText = String(delivery.response || "");
  const combinedErrorText = `${String(input.errorMessage || "")} ${responseText}`.trim();

  if (delivery.rejected.length > 0) {
    return textContainsSpamSignal(combinedErrorText)
      ? MAIL_DELIVERY_STATUSES.SPAM_REJECTED
      : MAIL_DELIVERY_STATUSES.BOUNCED;
  }
  if (delivery.pending.length > 0) return MAIL_DELIVERY_STATUSES.DEFERRED;
  if (delivery.missing.length > 0) return MAIL_DELIVERY_STATUSES.UNKNOWN;
  return MAIL_DELIVERY_STATUSES.ACCEPTED_BY_MTA;
}

export function isTerminalMailDeliveryStatus(value: MailDeliveryStatus) {
  return (
    value === MAIL_DELIVERY_STATUSES.DELIVERED_REMOTE_ACCEPTED ||
    value === MAIL_DELIVERY_STATUSES.BOUNCED ||
    value === MAIL_DELIVERY_STATUSES.SPAM_REJECTED ||
    value === MAIL_DELIVERY_STATUSES.UNKNOWN
  );
}

export function formatMailDeliveryStatusLabel(value: MailDeliveryStatus) {
  switch (value) {
    case MAIL_DELIVERY_STATUSES.QUEUED:
      return "Queued";
    case MAIL_DELIVERY_STATUSES.ACCEPTED_BY_MTA:
      return "Accepted by server";
    case MAIL_DELIVERY_STATUSES.DELIVERED_REMOTE_ACCEPTED:
      return "Delivered";
    case MAIL_DELIVERY_STATUSES.BOUNCED:
      return "Bounced";
    case MAIL_DELIVERY_STATUSES.DEFERRED:
      return "Deferred";
    case MAIL_DELIVERY_STATUSES.SPAM_REJECTED:
      return "Rejected";
    default:
      return "Unknown";
  }
}

export function extractQueueIdFromSmtpResponse(response: unknown) {
  const text = String(response || "").trim();
  if (!text) return null;
  const queuedAs = text.match(/queued\s+as\s+([A-Z0-9]+)/i)?.[1];
  if (queuedAs) return queuedAs.toUpperCase();
  const queueId = text.match(/\bid=([A-Z0-9]{5,})\b/i)?.[1];
  if (queueId) return queueId.toUpperCase();
  return null;
}

