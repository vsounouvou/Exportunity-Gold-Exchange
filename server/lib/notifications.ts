import crypto from "crypto";
import { db } from "@db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { eceUsers, notificationDeliveries, notifications } from "@db/schema";
import { createActionRequest } from "./actions/ActionRouter";
import { normalizeAgentKey } from "./mail/agentSlugs";
import { normalizeE164 } from "./communications/twilio";

export type NotificationChannel = "whatsapp" | "sms" | "email";

const DEFAULT_CHANNEL_ORDER: NotificationChannel[] = ["whatsapp", "sms", "email"];

function safeObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function getUserChannelOrder(user: any): NotificationChannel[] {
  const meta = safeObject(user?.metadata);
  const prefs = safeObject((meta as any)?.preferences);
  const raw = (prefs as any)?.notificationChannels;
  const list = Array.isArray(raw) ? raw.map((v: any) => String(v || "").trim().toLowerCase()) : [];

  const allowed = new Set<NotificationChannel>(["whatsapp", "sms", "email"]);
  const ordered = list.filter((v) => allowed.has(v as any)) as NotificationChannel[];
  if (ordered.length) return Array.from(new Set(ordered));
  return DEFAULT_CHANNEL_ORDER;
}

function computeContentHash(input: { eventKey: string; title: string | null; message: string | null }) {
  const payload = JSON.stringify({ eventKey: input.eventKey, title: input.title, message: input.message });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

async function setActionRequestRunAt(actionRequestId: number, runAtIso: string) {
  await db.execute(sql`
    update action_requests
    set metadata = jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{runAt}',
      to_jsonb(${runAtIso}::text),
      true
    ),
    updated_at = now()
    where id = ${actionRequestId};
  `);
}

function computeBackoffMs(attempt: number) {
  // attempt=1 is first attempt (no backoff). Retries start at attempt=2.
  const capped = Math.max(1, Math.min(6, attempt));
  const base = 1000; // 1s
  return base * Math.pow(2, capped - 2); // attempt=2 => 1s, 3=>2s, 4=>4s
}

function addMsIso(ms: number) {
  return new Date(Date.now() + ms).toISOString();
}

type RecipientContact = {
  userId: number;
  email: string | null;
  phoneE164: string | null;
  channelOrder: NotificationChannel[];
};

async function resolveRecipientContact(opts: { tenantId: number; recipientUserId: number }) {
  const user = await db.query.eceUsers.findFirst({
    where: eq(eceUsers.id, opts.recipientUserId),
    columns: { id: true, email: true, phone: true, metadata: true },
  });
  if (!user) throw new Error("Recipient user not found");

  const phoneE164 = user.phone ? normalizeE164(user.phone) : null;
  const email = user.email ? String(user.email).trim() : null;
  const channelOrder = getUserChannelOrder(user);

  return {
    userId: Number(user.id),
    email: email || null,
    phoneE164,
    channelOrder,
  } satisfies RecipientContact;
}

function computeEligibleChannels(input: {
  preferred: NotificationChannel[];
  requested?: NotificationChannel[] | null;
  recipient: RecipientContact;
  requireEmail: boolean;
}): NotificationChannel[] {
  const allowed = new Set<NotificationChannel>(["whatsapp", "sms", "email"]);
  const base = (input.requested?.length ? input.requested : input.preferred).filter((c) => allowed.has(c));
  const unique = Array.from(new Set(base));

  const eligible = unique.filter((c) => {
    if (c === "email") return !!input.recipient.email;
    if (c === "sms" || c === "whatsapp") return !!input.recipient.phoneE164;
    return false;
  });

  if (input.requireEmail && !eligible.includes("email") && input.recipient.email) eligible.push("email");
  return eligible;
}

export type CreateNotificationInput = {
  tenantId: number;
  requestedByUserId: number | null;
  // Sender identity for provider sends (email + comms are agent-scoped today).
  agentKey: string;
  recipientUserId: number;
  eventKey: string;
  title?: string | null;
  message?: string | null;
  channels?: NotificationChannel[] | null;
  requireEmail?: boolean;
};

export async function createNotification(input: CreateNotificationInput) {
  const agentKey = normalizeAgentKey(input.agentKey);
  if (!agentKey) throw new Error("agentKey required");

  const title = String(input.title || "").trim() || null;
  const message = String(input.message || "").trim() || null;
  if (!message) throw new Error("message required");

  const recipient = await resolveRecipientContact({ tenantId: input.tenantId, recipientUserId: input.recipientUserId });
  const channels = computeEligibleChannels({
    preferred: recipient.channelOrder,
    requested: input.channels ?? null,
    recipient,
    requireEmail: Boolean(input.requireEmail),
  });
  if (!channels.length) throw new Error("No eligible channels for recipient");

  const now = new Date();
  const contentHash = computeContentHash({ eventKey: input.eventKey, title, message });

  const [notification] = await db
    .insert(notifications)
    .values({
      tenantId: input.tenantId,
      eventKey: input.eventKey,
      status: "queued",
      recipientUserId: recipient.userId,
      recipientAgentKey: agentKey,
      readByUserId: null,
      readAt: null,
      title,
      message,
      requestedChannels: channels,
      metadata: {
        contentHash,
        createdByUserId: input.requestedByUserId,
      },
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const firstChannel = channels[0] as NotificationChannel;
  const queued = await queueNotificationDeliveryAttempt({
    tenantId: input.tenantId,
    requestedByUserId: input.requestedByUserId,
    notificationId: notification.id,
    agentKey,
    recipient,
    channel: firstChannel,
    channelIndex: 0,
    attempt: 1,
    title,
    message,
    runAtIso: null,
  });

  return { ok: true as const, notification, firstDelivery: queued.delivery, firstActionRequest: queued.actionRequest };
}

type QueueDeliveryInput = {
  tenantId: number;
  requestedByUserId: number | null;
  notificationId: number;
  agentKey: string;
  recipient: RecipientContact;
  channel: NotificationChannel;
  channelIndex: number;
  attempt: number;
  title: string | null;
  message: string;
  runAtIso: string | null;
};

async function queueNotificationDeliveryAttempt(input: QueueDeliveryInput) {
  const now = new Date();

  const toAddress =
    input.channel === "email"
      ? input.recipient.email
      : input.recipient.phoneE164;
  if (!toAddress) throw new Error(`Recipient missing address for channel ${input.channel}`);

  const provider = input.channel === "email" ? (process.env.MAIL_SMTP_SENDMAIL === "true" ? "sendmail" : "smtp") : "twilio";

  const [delivery] = await db
    .insert(notificationDeliveries)
    .values({
      tenantId: input.tenantId,
      notificationId: input.notificationId,
      actionRequestId: null,
      channel: input.channel,
      provider,
      toAddress,
      status: "queued",
      attempt: input.attempt,
      providerMessageId: null,
      errorCode: null,
      errorMessage: null,
      metadata: {
        channelIndex: input.channelIndex,
      },
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const basePayload = {
    notificationId: input.notificationId,
    notificationDeliveryId: delivery.id,
    notificationChannelIndex: input.channelIndex,
    notificationAttempt: input.attempt,
    notificationMaxAttempts: 3,
  };

  const actionRequest = await (async () => {
    if (input.channel === "sms" || input.channel === "whatsapp") {
      const actionType = input.channel === "sms" ? "SEND_SMS" : "SEND_WHATSAPP";
      return createActionRequest({
        tenantId: input.tenantId,
        requestedByUserId: input.requestedByUserId,
        requestedByAgentKey: input.agentKey,
        actionType,
        payload: {
          agentKey: input.agentKey,
          toE164: String(toAddress),
          mode: "text",
          body: input.message,
          adminOverride: false,
          ...basePayload,
        },
        priority: 0,
        idempotencyKey: null,
        relatedConversationId: null,
        relatedThreadId: null,
        isAdmin: false,
      });
    }

    return createActionRequest({
      tenantId: input.tenantId,
      requestedByUserId: input.requestedByUserId,
      requestedByAgentKey: input.agentKey,
      actionType: "SEND_EMAIL",
      payload: {
        agentKey: input.agentKey,
        to: [String(toAddress)],
        subject: input.title || `Notification: ${input.channel}`,
        body: { text: input.message, html: null },
        source: "notifications",
        ...basePayload,
      },
      priority: 0,
      idempotencyKey: null,
      relatedConversationId: null,
      relatedThreadId: null,
      isAdmin: true,
    });
  })();

  if (input.runAtIso) {
    await setActionRequestRunAt(actionRequest.id, input.runAtIso);
  }

  await db
    .update(notificationDeliveries)
    .set({ actionRequestId: actionRequest.id, updatedAt: new Date() })
    .where(and(eq(notificationDeliveries.id, delivery.id), eq(notificationDeliveries.tenantId, input.tenantId)));

  return { delivery, actionRequest };
}

export async function handleNotificationActionSuccess(opts: {
  tenantId: number;
  notificationId: number;
  deliveryId: number;
  status: string;
  providerMessageId: string | null;
}) {
  const now = new Date();
  await db
    .update(notificationDeliveries)
    .set({
      status: String(opts.status || "sent"),
      providerMessageId: opts.providerMessageId,
      errorCode: null,
      errorMessage: null,
      updatedAt: now,
    })
    .where(and(eq(notificationDeliveries.tenantId, opts.tenantId), eq(notificationDeliveries.id, opts.deliveryId)));

  await db
    .update(notifications)
    .set({ status: "sent", updatedAt: now })
    .where(and(eq(notifications.tenantId, opts.tenantId), eq(notifications.id, opts.notificationId)));
}

export async function handleNotificationActionFailure(opts: {
  tenantId: number;
  notificationId: number;
  deliveryId: number;
  channelIndex: number;
  attempt: number;
  maxAttempts: number;
  errorMessage: string;
}) {
  const now = new Date();

  await db
    .update(notificationDeliveries)
    .set({
      status: "failed",
      errorMessage: opts.errorMessage,
      updatedAt: now,
    })
    .where(and(eq(notificationDeliveries.tenantId, opts.tenantId), eq(notificationDeliveries.id, opts.deliveryId)));

  const notification = await db.query.notifications.findFirst({
    where: and(eq(notifications.tenantId, opts.tenantId), eq(notifications.id, opts.notificationId)),
    columns: { id: true, recipientUserId: true, recipientAgentKey: true, title: true, message: true, requestedChannels: true },
  });
  if (!notification) return;

  const recipientUserId = notification.recipientUserId ? Number(notification.recipientUserId) : null;
  if (!recipientUserId) return;

  const recipient = await resolveRecipientContact({ tenantId: opts.tenantId, recipientUserId });
  const channels = Array.isArray(notification.requestedChannels) ? (notification.requestedChannels as NotificationChannel[]) : [];

  const nextSameChannelAttempt = opts.attempt + 1;
  if (nextSameChannelAttempt <= opts.maxAttempts) {
    const runAtIso = addMsIso(computeBackoffMs(nextSameChannelAttempt));
    await queueNotificationDeliveryAttempt({
      tenantId: opts.tenantId,
      requestedByUserId: null,
      notificationId: notification.id,
      agentKey: String(notification.recipientAgentKey || "support"),
      recipient,
      channel: channels[opts.channelIndex] as NotificationChannel,
      channelIndex: opts.channelIndex,
      attempt: nextSameChannelAttempt,
      title: notification.title ? String(notification.title) : null,
      message: String(notification.message || ""),
      runAtIso,
    });

    await db
      .update(notifications)
      .set({ status: "queued", updatedAt: new Date() })
      .where(and(eq(notifications.tenantId, opts.tenantId), eq(notifications.id, notification.id)));
    return;
  }

  const nextChannelIndex = opts.channelIndex + 1;
  const nextChannel = channels[nextChannelIndex] as NotificationChannel | undefined;
  if (nextChannel) {
    await queueNotificationDeliveryAttempt({
      tenantId: opts.tenantId,
      requestedByUserId: null,
      notificationId: notification.id,
      agentKey: String(notification.recipientAgentKey || "support"),
      recipient,
      channel: nextChannel,
      channelIndex: nextChannelIndex,
      attempt: 1,
      title: notification.title ? String(notification.title) : null,
      message: String(notification.message || ""),
      runAtIso: null,
    });

    await db
      .update(notifications)
      .set({ status: "queued", updatedAt: new Date() })
      .where(and(eq(notifications.tenantId, opts.tenantId), eq(notifications.id, notification.id)));
    return;
  }

  await db
    .update(notifications)
    .set({ status: "failed", updatedAt: now })
    .where(and(eq(notifications.tenantId, opts.tenantId), eq(notifications.id, notification.id)));
}

export async function listNotificationsForUser(opts: { tenantId: number; userId: number; limit?: number }) {
  const limit = Math.min(Math.max(Number(opts.limit || 50), 1), 200);
  const rows = await db.query.notifications.findMany({
    where: and(eq(notifications.tenantId, opts.tenantId), eq(notifications.recipientUserId, opts.userId)),
    orderBy: [desc(notifications.createdAt)],
    limit,
  });

  const ids = rows.map((r) => Number(r.id)).filter((id) => Number.isFinite(id));
  const deliveries = ids.length
    ? await db.query.notificationDeliveries.findMany({
        where: and(eq(notificationDeliveries.tenantId, opts.tenantId), inArray(notificationDeliveries.notificationId, ids)),
        orderBy: [desc(notificationDeliveries.createdAt)],
        limit: 1000,
      })
    : [];

  const deliveriesByNotification = new Map<number, typeof deliveries>();
  for (const d of deliveries) {
    const id = Number(d.notificationId);
    const arr = deliveriesByNotification.get(id) || [];
    arr.push(d as any);
    deliveriesByNotification.set(id, arr);
  }

  return {
    ok: true as const,
    items: rows.map((n) => ({
      notification: n,
      deliveries: deliveriesByNotification.get(Number(n.id)) || [],
    })),
  };
}

export async function markNotificationsRead(opts: { tenantId: number; userId: number; notificationIds: number[] }) {
  const ids = Array.from(new Set(opts.notificationIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)))).slice(0, 500);
  if (!ids.length) return { ok: true as const, updated: 0 };

  const now = new Date();
  const rows = await db
    .update(notifications)
    .set({ readAt: now, readByUserId: opts.userId, updatedAt: now })
    .where(and(eq(notifications.tenantId, opts.tenantId), eq(notifications.recipientUserId, opts.userId), inArray(notifications.id, ids)))
    .returning({ id: notifications.id });

  return { ok: true as const, updated: rows.length };
}

export async function listNotificationsForAdmin(opts: {
  tenantId: number;
  limit?: number;
  status?: string | null;
  channel?: string | null;
}) {
  const limit = Math.min(Math.max(Number(opts.limit || 100), 1), 500);
  const status = opts.status ? String(opts.status).trim() : null;
  const channel = opts.channel ? String(opts.channel).trim().toLowerCase() : null;

  const where = [eq(notifications.tenantId, opts.tenantId)];
  if (status) where.push(eq(notifications.status, status));

  const rows = await db.query.notifications.findMany({
    where: and(...where),
    orderBy: [desc(notifications.createdAt)],
    limit,
  });

  const ids = rows.map((r) => Number(r.id)).filter((id) => Number.isFinite(id));
  const deliveries = ids.length
    ? await db.query.notificationDeliveries.findMany({
        where: and(
          eq(notificationDeliveries.tenantId, opts.tenantId),
          inArray(notificationDeliveries.notificationId, ids),
          ...(channel ? [eq(notificationDeliveries.channel, channel as any)] : []),
        ),
        orderBy: [desc(notificationDeliveries.createdAt)],
        limit: 2000,
      })
    : [];

  const deliveriesByNotification = new Map<number, typeof deliveries>();
  for (const d of deliveries) {
    const id = Number(d.notificationId);
    const arr = deliveriesByNotification.get(id) || [];
    arr.push(d as any);
    deliveriesByNotification.set(id, arr);
  }

  return {
    ok: true as const,
    items: rows.map((n) => ({
      notification: n,
      deliveries: deliveriesByNotification.get(Number(n.id)) || [],
    })),
  };
}
