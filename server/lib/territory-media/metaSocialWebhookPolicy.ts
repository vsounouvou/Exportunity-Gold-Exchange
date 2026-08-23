import crypto from "node:crypto";

import { REQUIRED_SOCIAL_SCOPES } from "./socialPublicationPolicy";

export const META_SOCIAL_WEBHOOK_ADAPTER_VERSION = "meta-social-webhook-v1";
export const META_SOCIAL_WEBHOOK_MIGRATION =
  "20270421_exportunity_meta_social_webhook_receipts.sql";

export type MetaSocialPlatform = "facebook" | "instagram";
export type MetaSocialChannel =
  | "facebook_comment"
  | "facebook_messenger"
  | "instagram_comment"
  | "instagram_dm";

export type ParsedMetaSocialEvent = {
  platform: MetaSocialPlatform;
  channel: MetaSocialChannel;
  eventType: "comment" | "direct_message";
  providerEventId: string;
  externalAccountId: string;
  externalActorId: string;
  externalActorLabel: string | null;
  externalThreadId: string | null;
  parentContentId: string | null;
  parentContentUrl: string | null;
  body: string;
  receivedAt: string;
};

export type MetaSocialReceiptCandidate = {
  receiptKey: string;
  payloadChecksum: string;
  slot: string;
  objectType: string;
  platform: MetaSocialPlatform | null;
  externalAccountId: string | null;
  providerEventId: string | null;
  eventKind: string;
  parseStatus: "parsed" | "unsupported";
  initialResolutionStatus: "received" | "ignored_outbound" | "unsupported_payload";
  reasonCode: string | null;
  sanitizedPayload: Record<string, unknown>;
  event: ParsedMetaSocialEvent | null;
  receivedAt: string;
};

const META_INBOUND_SCOPES: Record<MetaSocialPlatform, string[]> = {
  facebook: [
    "pages_manage_metadata",
    "pages_read_user_content",
    "pages_messaging",
  ],
  instagram: [
    "pages_manage_metadata",
    "instagram_manage_comments",
    "instagram_manage_messages",
  ],
};

const CHANNEL_SCOPES: Record<MetaSocialChannel, string[]> = {
  facebook_comment: [
    "pages_manage_metadata",
    "pages_read_engagement",
    "pages_read_user_content",
  ],
  facebook_messenger: [
    "pages_manage_metadata",
    "pages_read_engagement",
    "pages_messaging",
  ],
  instagram_comment: [
    "pages_manage_metadata",
    "pages_read_engagement",
    "instagram_basic",
    "instagram_manage_comments",
  ],
  instagram_dm: [
    "pages_manage_metadata",
    "instagram_basic",
    "instagram_manage_messages",
  ],
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, max = 240) {
  const result = String(value ?? "").trim();
  return result ? result.slice(0, max) : "";
}

function nullableText(value: unknown, max = 240) {
  return text(value, max) || null;
}

function normalizeTimestamp(value: unknown, fallback: Date) {
  const numeric = Number(value);
  let parsed: Date | null = null;
  if (Number.isFinite(numeric) && numeric > 0) {
    parsed = new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric);
  } else if (typeof value === "string" && value.trim()) {
    parsed = new Date(value);
  }
  if (!parsed || !Number.isFinite(parsed.getTime())) return fallback.toISOString();
  if (parsed.getTime() > fallback.getTime() + 5 * 60_000) return fallback.toISOString();
  return parsed.toISOString();
}

function receiptKey(input: {
  payloadChecksum: string;
  slot: string;
  platform: MetaSocialPlatform | null;
  externalAccountId: string | null;
  providerEventId: string | null;
}) {
  const stableEventIdentity =
    input.platform && input.externalAccountId && input.providerEventId
      ? `${input.platform}:${input.externalAccountId}:${input.providerEventId}`
      : `${input.payloadChecksum}:${input.slot}`;
  return crypto.createHash("sha256").update(stableEventIdentity).digest("hex");
}

const CREDENTIAL_KEY =
  /(?:^|_)(?:access_?token|refresh_?token|api_?key|client_?secret|app_?secret|token|authorization|cookie|password|secret|signature)(?:$|_)/i;

export function sanitizeMetaWebhookPayload(value: unknown) {
  let remainingText = 32_000;
  const visit = (item: unknown, depth: number): unknown => {
    if (depth > 6 || remainingText <= 0) return "[truncated]";
    if (item === null || typeof item === "boolean" || typeof item === "number") return item;
    if (typeof item === "string") {
      const bounded = item.slice(0, Math.min(2_000, remainingText));
      remainingText -= bounded.length;
      return bounded;
    }
    if (Array.isArray(item)) return item.slice(0, 50).map((entry) => visit(entry, depth + 1));
    if (typeof item !== "object") return String(item).slice(0, 120);
    const result: JsonRecord = {};
    for (const [key, child] of Object.entries(item as JsonRecord).slice(0, 80)) {
      const safeKey = key.slice(0, 120);
      result[safeKey] = CREDENTIAL_KEY.test(safeKey)
        ? "[redacted_provider_credential]"
        : visit(child, depth + 1);
    }
    return result;
  };
  return asRecord(visit(value, 0));
}

function baseCandidate(input: {
  payloadChecksum: string;
  slot: string;
  objectType: string;
  platform: MetaSocialPlatform | null;
  externalAccountId: string | null;
  providerEventId?: string | null;
  eventKind: string;
  parseStatus: "parsed" | "unsupported";
  initialResolutionStatus: "received" | "ignored_outbound" | "unsupported_payload";
  reasonCode?: string | null;
  sanitizedPayload: Record<string, unknown>;
  event?: ParsedMetaSocialEvent | null;
  receivedAt: string;
}): MetaSocialReceiptCandidate {
  const providerEventId = input.providerEventId || null;
  return {
    payloadChecksum: input.payloadChecksum,
    slot: input.slot,
    objectType: input.objectType,
    platform: input.platform,
    externalAccountId: input.externalAccountId,
    providerEventId,
    eventKind: input.eventKind,
    parseStatus: input.parseStatus,
    initialResolutionStatus: input.initialResolutionStatus,
    reasonCode: input.reasonCode || null,
    sanitizedPayload: input.sanitizedPayload,
    event: input.event || null,
    receivedAt: input.receivedAt,
    receiptKey: receiptKey({
      payloadChecksum: input.payloadChecksum,
      slot: input.slot,
      platform: input.platform,
      externalAccountId: input.externalAccountId,
      providerEventId,
    }),
  };
}

function unsupportedCandidate(input: {
  payloadChecksum: string;
  slot: string;
  objectType: string;
  platform: MetaSocialPlatform | null;
  externalAccountId: string | null;
  providerEventId?: string | null;
  eventKind: string;
  reasonCode: string;
  source: unknown;
  receivedAt: string;
}) {
  return baseCandidate({
    payloadChecksum: input.payloadChecksum,
    slot: input.slot,
    objectType: input.objectType,
    platform: input.platform,
    externalAccountId: input.externalAccountId,
    providerEventId: input.providerEventId,
    eventKind: input.eventKind,
    reasonCode: input.reasonCode,
    receivedAt: input.receivedAt,
    parseStatus: "unsupported",
    initialResolutionStatus: "unsupported_payload",
    sanitizedPayload: {
      adapterVersion: META_SOCIAL_WEBHOOK_ADAPTER_VERSION,
      credentialsExcluded: true,
      reasonCode: input.reasonCode,
      source: sanitizeMetaWebhookPayload(input.source),
    },
  });
}

function parsedCandidate(input: {
  payloadChecksum: string;
  slot: string;
  objectType: string;
  eventKind: string;
  event: ParsedMetaSocialEvent;
  source: unknown;
  ignoredOutbound?: boolean;
  reasonCode?: string | null;
}) {
  return baseCandidate({
    payloadChecksum: input.payloadChecksum,
    slot: input.slot,
    objectType: input.objectType,
    platform: input.event.platform,
    externalAccountId: input.event.externalAccountId,
    providerEventId: input.event.providerEventId,
    eventKind: input.eventKind,
    parseStatus: "parsed",
    initialResolutionStatus: input.ignoredOutbound ? "ignored_outbound" : "received",
    reasonCode: input.reasonCode,
    event: input.event,
    receivedAt: input.event.receivedAt,
    sanitizedPayload: {
      adapterVersion: META_SOCIAL_WEBHOOK_ADAPTER_VERSION,
      credentialsExcluded: true,
      event: input.event,
      source: sanitizeMetaWebhookPayload(input.source),
    },
  });
}

function parseMessaging(input: {
  payloadChecksum: string;
  objectType: string;
  platform: MetaSocialPlatform;
  entry: JsonRecord;
  entryIndex: number;
  messaging: unknown;
  messagingIndex: number;
  fallback: Date;
}) {
  const slot = `entry:${input.entryIndex}:messaging:${input.messagingIndex}`;
  const source = asRecord(input.messaging);
  const accountId = text(input.entry.id || asRecord(source.recipient).id);
  const message = asRecord(source.message);
  const senderId = text(asRecord(source.sender).id);
  const recipientId = text(asRecord(source.recipient).id);
  const providerEventId = text(message.mid, 500);
  const body = text(message.text, 10_000);
  const receivedAt = normalizeTimestamp(source.timestamp || input.entry.time, input.fallback);
  const channel: MetaSocialChannel =
    input.platform === "facebook" ? "facebook_messenger" : "instagram_dm";

  if (!Object.keys(message).length) {
    return unsupportedCandidate({
      payloadChecksum: input.payloadChecksum,
      slot,
      objectType: input.objectType,
      platform: input.platform,
      externalAccountId: accountId || null,
      eventKind: "messaging_non_message",
      reasonCode: "unsupported_messaging_event",
      source,
      receivedAt,
    });
  }
  if (!accountId || !providerEventId || !senderId || !recipientId) {
    return unsupportedCandidate({
      payloadChecksum: input.payloadChecksum,
      slot,
      objectType: input.objectType,
      platform: input.platform,
      externalAccountId: accountId || null,
      providerEventId: providerEventId || null,
      eventKind: "direct_message",
      reasonCode: "missing_message_identity",
      source,
      receivedAt,
    });
  }
  if (!body || message.is_deleted === true || message.is_unsupported === true) {
    return unsupportedCandidate({
      payloadChecksum: input.payloadChecksum,
      slot,
      objectType: input.objectType,
      platform: input.platform,
      externalAccountId: accountId,
      providerEventId,
      eventKind: "direct_message",
      reasonCode: message.is_deleted === true
        ? "deleted_message"
        : message.is_unsupported === true
          ? "unsupported_message_content"
          : "text_body_required",
      source,
      receivedAt,
    });
  }

  const ignoredOutbound =
    message.is_echo === true ||
    message.is_self === true ||
    senderId === accountId ||
    recipientId !== accountId;
  const replyTo = asRecord(message.reply_to);
  const story = asRecord(replyTo.story);
  const event: ParsedMetaSocialEvent = {
    platform: input.platform,
    channel,
    eventType: "direct_message",
    providerEventId,
    externalAccountId: accountId,
    externalActorId: ignoredOutbound ? recipientId : senderId,
    externalActorLabel: null,
    externalThreadId: ignoredOutbound ? recipientId : senderId,
    parentContentId: nullableText(replyTo.mid || story.id, 500),
    parentContentUrl: nullableText(story.url, 2_048),
    body,
    receivedAt,
  };
  return parsedCandidate({
    payloadChecksum: input.payloadChecksum,
    slot,
    objectType: input.objectType,
    eventKind: "direct_message",
    event,
    source,
    ignoredOutbound,
    reasonCode: ignoredOutbound ? "outbound_or_self_message" : null,
  });
}

function parseChange(input: {
  payloadChecksum: string;
  objectType: string;
  platform: MetaSocialPlatform;
  entry: JsonRecord;
  entryIndex: number;
  change: unknown;
  changeIndex: number;
  fallback: Date;
}) {
  const slot = `entry:${input.entryIndex}:change:${input.changeIndex}`;
  const source = asRecord(input.change);
  const value = asRecord(source.value);
  const field = text(source.field).toLowerCase();
  const accountId = text(input.entry.id);
  const receivedAt = normalizeTimestamp(value.created_time || input.entry.time, input.fallback);

  const instagramComment =
    input.platform === "instagram" && (field === "comments" || field === "live_comments");
  const facebookComment =
    input.platform === "facebook" &&
    ((field === "feed" && text(value.item).toLowerCase() === "comment") || field === "comments");
  if (!instagramComment && !facebookComment) {
    return unsupportedCandidate({
      payloadChecksum: input.payloadChecksum,
      slot,
      objectType: input.objectType,
      platform: input.platform,
      externalAccountId: accountId || null,
      eventKind: field || "unknown_change",
      reasonCode: "unsupported_change_field",
      source,
      receivedAt,
    });
  }

  const actor = asRecord(value.from);
  const providerEventId = text(value.comment_id || value.id, 500);
  const actorId = text(actor.id || actor.self_ig_scoped_id, 500);
  const body = text(value.message || value.text, 10_000);
  const verb = text(value.verb).toLowerCase();
  if (!accountId || !providerEventId || !actorId) {
    return unsupportedCandidate({
      payloadChecksum: input.payloadChecksum,
      slot,
      objectType: input.objectType,
      platform: input.platform,
      externalAccountId: accountId || null,
      providerEventId: providerEventId || null,
      eventKind: "comment",
      reasonCode: "missing_comment_identity",
      source,
      receivedAt,
    });
  }
  if (!body || (verb && verb !== "add")) {
    return unsupportedCandidate({
      payloadChecksum: input.payloadChecksum,
      slot,
      objectType: input.objectType,
      platform: input.platform,
      externalAccountId: accountId,
      providerEventId,
      eventKind: "comment",
      reasonCode: !body ? "text_body_required" : "non_create_comment_change",
      source,
      receivedAt,
    });
  }

  const ignoredOutbound = actorId === accountId || Boolean(actor.self_ig_scoped_id);
  const media = asRecord(value.media);
  const event: ParsedMetaSocialEvent = {
    platform: input.platform,
    channel: input.platform === "facebook" ? "facebook_comment" : "instagram_comment",
    eventType: "comment",
    providerEventId,
    externalAccountId: accountId,
    externalActorId: actorId,
    externalActorLabel: nullableText(actor.name || actor.username, 200),
    externalThreadId: null,
    parentContentId: nullableText(value.post_id || media.id || value.parent_id, 500),
    parentContentUrl: nullableText(value.permalink_url, 2_048),
    body,
    receivedAt,
  };
  return parsedCandidate({
    payloadChecksum: input.payloadChecksum,
    slot,
    objectType: input.objectType,
    eventKind: "comment",
    event,
    source,
    ignoredOutbound,
    reasonCode: ignoredOutbound ? "business_self_comment" : null,
  });
}

export function parseMetaSocialWebhookPayload(input: {
  payload: unknown;
  payloadChecksum: string;
  now?: Date;
}) {
  const now = input.now || new Date();
  const payloadChecksum = text(input.payloadChecksum, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(payloadChecksum)) {
    throw new Error("A verified payload checksum is required");
  }
  const root = asRecord(input.payload);
  const receivedObjectType = text(root.object, 80).toLowerCase();
  const objectType =
    receivedObjectType === "page" || receivedObjectType === "instagram"
      ? receivedObjectType
      : "unknown";
  const platform: MetaSocialPlatform | null =
    objectType === "page" ? "facebook" : objectType === "instagram" ? "instagram" : null;
  const entries = asArray(root.entry).slice(0, 100);
  const candidates: MetaSocialReceiptCandidate[] = [];

  if (!platform || !entries.length) {
    candidates.push(
      unsupportedCandidate({
        payloadChecksum,
        slot: "root",
        objectType,
        platform,
        externalAccountId: null,
        eventKind: "root",
        reasonCode: !platform ? "unsupported_object_type" : "entry_array_required",
        source: { receivedObjectType: receivedObjectType || null, payload: root },
        receivedAt: now.toISOString(),
      }),
    );
    return { objectType, candidates, truncated: false };
  }

  entries.forEach((entryValue, entryIndex) => {
    const entry = asRecord(entryValue);
    const messaging = asArray(entry.messaging).slice(0, 100);
    const changes = asArray(entry.changes).slice(0, 100);
    const inlineChange = entry.field && entry.value ? [{ field: entry.field, value: entry.value }] : [];
    messaging.forEach((event, messagingIndex) => {
      candidates.push(
        parseMessaging({
          payloadChecksum,
          objectType,
          platform,
          entry,
          entryIndex,
          messaging: event,
          messagingIndex,
          fallback: now,
        }),
      );
    });
    [...changes, ...inlineChange].forEach((change, changeIndex) => {
      candidates.push(
        parseChange({
          payloadChecksum,
          objectType,
          platform,
          entry,
          entryIndex,
          change,
          changeIndex,
          fallback: now,
        }),
      );
    });
    if (!messaging.length && !changes.length && !inlineChange.length) {
      candidates.push(
        unsupportedCandidate({
          payloadChecksum,
          slot: `entry:${entryIndex}`,
          objectType,
          platform,
          externalAccountId: nullableText(entry.id, 500),
          eventKind: "empty_entry",
          reasonCode: "supported_event_array_required",
          source: entry,
          receivedAt: normalizeTimestamp(entry.time, now),
        }),
      );
    }
  });

  if (asArray(root.entry).length > entries.length) {
    candidates.push(
      unsupportedCandidate({
        payloadChecksum,
        slot: "entry:overflow",
        objectType,
        platform,
        externalAccountId: null,
        eventKind: "overflow",
        reasonCode: "entry_limit_exceeded",
        source: { received: asArray(root.entry).length, retained: entries.length },
        receivedAt: now.toISOString(),
      }),
    );
  }
  return {
    objectType,
    candidates,
    truncated: asArray(root.entry).length > entries.length,
  };
}

export function parsedMetaSocialEventFromPayload(value: unknown): ParsedMetaSocialEvent | null {
  const event = asRecord(asRecord(value).event);
  const platform = text(event.platform) as MetaSocialPlatform;
  const channel = text(event.channel) as MetaSocialChannel;
  const eventType = text(event.eventType) as ParsedMetaSocialEvent["eventType"];
  if (!(platform === "facebook" || platform === "instagram")) return null;
  if (!Object.prototype.hasOwnProperty.call(CHANNEL_SCOPES, channel)) return null;
  if (!(eventType === "comment" || eventType === "direct_message")) return null;
  const required = [
    "providerEventId",
    "externalAccountId",
    "externalActorId",
    "body",
    "receivedAt",
  ] as const;
  if (required.some((key) => !text(event[key], key === "body" ? 10_000 : 500))) return null;
  return {
    platform,
    channel,
    eventType,
    providerEventId: text(event.providerEventId, 500),
    externalAccountId: text(event.externalAccountId, 500),
    externalActorId: text(event.externalActorId, 500),
    externalActorLabel: nullableText(event.externalActorLabel, 200),
    externalThreadId: nullableText(event.externalThreadId, 500),
    parentContentId: nullableText(event.parentContentId, 500),
    parentContentUrl: nullableText(event.parentContentUrl, 2_048),
    body: text(event.body, 10_000),
    receivedAt: text(event.receivedAt, 100),
  };
}

export function requiredMetaInboundScopes(channel: MetaSocialChannel) {
  return [...CHANNEL_SCOPES[channel]];
}

export function metaOAuthScopesForFeature(
  platform: MetaSocialPlatform,
  inboundEnabled: boolean,
) {
  return Array.from(
    new Set([
      ...REQUIRED_SOCIAL_SCOPES[platform],
      ...(inboundEnabled ? META_INBOUND_SCOPES[platform] : []),
    ]),
  );
}

export function metaSocialWebhookFeatureStatus() {
  const enabled =
    String(process.env.FEATURE_META_SOCIAL_WEBHOOK_INGESTION || "")
      .trim()
      .toLowerCase() === "true";
  const retentionDaysRaw = Number(process.env.META_SOCIAL_WEBHOOK_RETENTION_DAYS || 30);
  const retentionDays = Number.isFinite(retentionDaysRaw)
    ? Math.max(1, Math.min(90, Math.trunc(retentionDaysRaw)))
    : 30;
  return {
    enabled,
    adapterVersion: META_SOCIAL_WEBHOOK_ADAPTER_VERSION,
    endpoint: "/api/webhooks/meta/social",
    migrationRequired: META_SOCIAL_WEBHOOK_MIGRATION,
    retentionDays,
    automaticBackgroundRetry: false,
    externalReplyAvailable: false,
    providerSubscriptionPerformed: false,
    credentialsExposed: false,
  } as const;
}
