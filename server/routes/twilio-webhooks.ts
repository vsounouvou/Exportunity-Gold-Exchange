import { Router, type Request, type Response } from "express";
import twilio from "twilio";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@db";
import {
  communicationsAgentControls,
  communicationsEvents,
  communicationsMessages,
  communicationsRoutingMap,
  communicationsThreads,
  communicationsWorkOrders,
  tenants,
  notificationDeliveries,
  notifications,
} from "@db/schema";
import { normalizeAgentKey } from "../lib/mail/agentSlugs";
import { replyRouter } from "../lib/replyRouter";
import { sendOutboundCommunication } from "../lib/communications/router";
import {
  normalizeE164,
  normalizeTwilioAddress,
  resolveTwilioProviderErrorMessage,
  verifyTwilioWebhookSignature,
} from "../lib/communications/twilio";
import { createInboundMessageLog, mapTwilioStatusToLogStatus, updateOutboundMessageLogBySid } from "../lib/communications/message-logs";
import { resolveInboundTwilioContext } from "../lib/communications/sender-resolution";

const router = Router();

type TenantInfo = { id: number; key: string } | undefined;

function parseIntSafe(value: unknown) {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function resolveWebhookUrl(req: Request) {
  const base = String(
    process.env.TWILIO_STATUS_CALLBACK_BASE_URL || process.env.PUBLIC_BASE_URL || process.env.TWILIO_APP_BASE_URL || "",
  ).trim();
  const origin = base || `${req.protocol}://${req.get("host")}`;
  return new URL(req.originalUrl, origin).toString();
}

function getTwilioSigningSecret() {
  return (
    String(process.env.TWILIO_WEBHOOK_SIGNING_SECRET || "").trim() ||
    String(process.env.TWILIO_WEBHOOK_SECRET || "").trim() ||
    String(process.env.TWILIO_AUTH_TOKEN || "").trim()
  );
}

function shouldAutoReply() {
  return String(process.env.TWILIO_AUTO_REPLY || "true").trim().toLowerCase() !== "false";
}

function shouldVoiceVoicemail() {
  return String(process.env.TWILIO_VOICE_VOICEMAIL_ENABLED || "true").trim().toLowerCase() !== "false";
}

function defaultAgentKey() {
  return normalizeAgentKey(String(process.env.TWILIO_DEFAULT_AGENT_KEY || "support"));
}

function computeDueAt(fromE164: string) {
  const vipCsv = String(process.env.TWILIO_VIP_PHONES || "").trim();
  const vips = vipCsv
    ? vipCsv
        .split(",")
        .map((v) => normalizeE164(v))
        .filter(Boolean)
    : [];

  const isVip = !!fromE164 && vips.includes(fromE164);
  const now = Date.now();
  const ms = isVip ? 15 * 60_000 : 24 * 60 * 60_000;
  return new Date(now + ms);
}

async function logEvent(tenantId: number, eventType: string, data: Record<string, unknown>) {
  try {
    await db.insert(communicationsEvents).values({
      tenantId,
      provider: "twilio",
      eventType,
      eventAt: new Date(),
      data,
      createdAt: new Date(),
    });
  } catch {
    // ignore logging errors
  }
}

function reject(res: Response, status: number, message: string) {
  res.status(status).json({ ok: false, message });
}

function verifySignature(req: Request, res: Response) {
  const secret = getTwilioSigningSecret();
  if (!secret) {
    reject(res, 503, "Twilio signing secret not configured");
    return false;
  }

  const verification = verifyTwilioWebhookSignature({
    url: resolveWebhookUrl(req),
    body: (req.body ?? {}) as any,
    signatureHeader: req.header("X-Twilio-Signature"),
    authToken: secret,
  });
  if (!verification.ok) {
    reject(res, 403, "Invalid Twilio signature");
    return false;
  }

  return true;
}

function parseMedia(body: Record<string, any>) {
  const num = Number.parseInt(String(body?.NumMedia ?? "0"), 10);
  if (!Number.isFinite(num) || num <= 0) return { count: 0, items: [] as Array<{ url: string; contentType: string | null }> };

  const max = Math.min(Math.max(num, 0), 10);
  const items: Array<{ url: string; contentType: string | null }> = [];
  for (let i = 0; i < max; i++) {
    const url = String(body?.[`MediaUrl${i}`] ?? "").trim();
    if (!url) continue;
    const contentType = String(body?.[`MediaContentType${i}`] ?? "").trim() || null;
    items.push({ url, contentType });
  }
  return { count: num, items };
}

async function resolveVoiceDialToE164(input: { tenantId: number; agentKey: string; routeMeta: Record<string, unknown> | null }) {
  const fromRoute = normalizeE164((input.routeMeta as any)?.dialToE164);
  if (fromRoute) return fromRoute;

  const agent = await db.query.communicationsAgentControls.findFirst({
    where: and(eq(communicationsAgentControls.tenantId, input.tenantId), eq(communicationsAgentControls.agentKey, input.agentKey)),
  });
  const fromAgent = normalizeE164(agent?.voiceDialToE164);
  if (fromAgent) return fromAgent;

  const fromEnv = normalizeE164(process.env.TWILIO_VOICE_FORWARD_TO || process.env.TWILIO_VOICE_DIAL_TO);
  return fromEnv;
}

async function handleMessageStatus(req: Request, res: Response) {
  if (!verifySignature(req, res)) return;

  const messageSid = String((req.body as any)?.MessageSid || "").trim();
  const messageStatus = String((req.body as any)?.MessageStatus || "").trim();
  const toRaw = String((req.body as any)?.To || "").trim();
  const fromRaw = String((req.body as any)?.From || "").trim();
  const errorCode = (req.body as any)?.ErrorCode != null ? String((req.body as any)?.ErrorCode) : null;
  const errorMessageRaw = (req.body as any)?.ErrorMessage != null ? String((req.body as any)?.ErrorMessage) : null;
  const errorMessage = resolveTwilioProviderErrorMessage(errorCode, errorMessageRaw);

  if (!messageSid) return reject(res, 400, "MessageSid required");
  if (!messageStatus) return reject(res, 400, "MessageStatus required");

  const status = mapTwilioStatusToLogStatus(messageStatus);
  const outboundLog = await updateOutboundMessageLogBySid(messageSid, {
    status,
    twilioStatus: messageStatus,
    providerErrorCode: errorCode,
    providerErrorMessage: errorMessage,
    providerResponse: req.body as Record<string, unknown>,
  });
  const resolvedTenantId = Number(outboundLog?.tenantId || (req as any)?.tenant?.id || 0) || null;
  const messageWhere = resolvedTenantId
    ? and(eq(communicationsMessages.tenantId, resolvedTenantId), eq(communicationsMessages.providerMessageId, messageSid))
    : eq(communicationsMessages.providerMessageId, messageSid);

  await db
    .update(communicationsMessages)
    .set({
      status,
      errorCode,
      errorMessage,
      updatedAt: new Date(),
    })
    .where(messageWhere);

  // If this Twilio message was sent as part of a unified notification, mirror the status update.
  const updatedDeliveries = await db
    .update(notificationDeliveries)
    .set({
      status,
      errorCode,
      errorMessage,
      updatedAt: new Date(),
    })
    .where(
      resolvedTenantId
        ? and(
            eq(notificationDeliveries.tenantId, resolvedTenantId),
            eq(notificationDeliveries.provider, "twilio"),
            eq(notificationDeliveries.providerMessageId, messageSid),
          )
        : and(eq(notificationDeliveries.provider, "twilio"), eq(notificationDeliveries.providerMessageId, messageSid)),
    )
    .returning({ notificationId: notificationDeliveries.notificationId });

  if (updatedDeliveries.length) {
    const ids = Array.from(new Set(updatedDeliveries.map((d) => Number(d.notificationId)).filter((id) => Number.isFinite(id))));
    const nextStatus = status === "delivered" || status === "read" ? "delivered" : null;
    if (nextStatus && ids.length && resolvedTenantId) {
      await db
        .update(notifications)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(and(eq(notifications.tenantId, resolvedTenantId), inArray(notifications.id, ids)));
    }
  }

  if (resolvedTenantId) {
    await logEvent(resolvedTenantId, "twilio.message.status", {
      messageSid,
      messageStatus: status,
      to: toRaw,
      from: fromRaw,
      errorCode,
      errorMessage,
      outboundLogId: outboundLog?.id ?? null,
    });
  }

  res.json({ ok: true, tenantId: resolvedTenantId });
}

async function handleMessageInbound(req: Request, res: Response) {
  if (!verifySignature(req, res)) return;

  const fromParsed = normalizeTwilioAddress((req.body as any)?.From);
  const toParsed = normalizeTwilioAddress((req.body as any)?.To);
  const bodyText = String((req.body as any)?.Body || "").trim();
  const messageSid = String((req.body as any)?.MessageSid || "").trim();

  if (!messageSid) return reject(res, 400, "MessageSid required");
  if (!fromParsed || !toParsed) return reject(res, 400, "Invalid From/To");

  const channel = fromParsed.channel;
  const fromE164 = fromParsed.addressE164;
  const toE164 = toParsed.addressE164;
  const media = parseMedia(req.body as any);
  const hostTenant = (req as any).tenant as TenantInfo;
  const inboundContext = await resolveInboundTwilioContext({
    channel,
    toAddress: String((req.body as any)?.To || ""),
    hostTenant: hostTenant ?? null,
  });
  const tenantId = inboundContext.tenantId;
  const tenantKey =
    inboundContext.tenantKey ||
    (tenantId
      ? (
          await db.query.tenants.findFirst({
            where: eq(tenants.id, tenantId),
            columns: { key: true },
          })
        )?.key || null
      : null);
  const agentKey = normalizeAgentKey(inboundContext.agentKey || defaultAgentKey()) || "support";

  const now = new Date();
  const inboundLog = await createInboundMessageLog({
    tenantId,
    agentId: inboundContext.agentId,
    fromAddress: channel === "whatsapp" ? `whatsapp:${fromE164}` : fromE164,
    toAddress: String((req.body as any)?.To || "").trim() || (channel === "whatsapp" ? `whatsapp:${toE164}` : toE164),
    body: bodyText || null,
    channel,
    twilioMessageSid: messageSid,
    rawPayload: req.body as Record<string, unknown>,
  });

  if (!tenantId) {
    return res.status(202).json({ ok: true, unresolved: true, inboundLogId: inboundLog.id });
  }

  const [thread] = await db
    .insert(communicationsThreads)
    .values({
      tenantId,
      agentKey,
      channel: channel as any,
      peerAddress: fromE164,
      lastMessageAt: now,
      metadata: { lastTo: toE164 },
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        communicationsThreads.tenantId,
        communicationsThreads.agentKey,
        communicationsThreads.channel,
        communicationsThreads.peerAddress,
      ],
      set: { lastMessageAt: now, updatedAt: now, metadata: { lastTo: toE164 } as any },
    })
    .returning();

  const inserted = await db
    .insert(communicationsMessages)
    .values({
      tenantId,
      agentKey,
      threadId: thread.id,
      direction: "inbound",
      status: "received",
      provider: "twilio",
      channel: channel as any,
      fromAddress: fromE164,
      toAddress: toE164,
      body: bodyText || null,
      providerMessageId: messageSid,
      errorCode: null,
      errorMessage: null,
      metadata: {
        raw: { from: (req.body as any)?.From, to: (req.body as any)?.To },
        inboundLogId: inboundLog.id,
        resolutionSource: inboundContext.resolutionSource,
        ...(media.count ? { media } : {}),
        ...(channel === "whatsapp" && (req.body as any)?.ProfileName ? { profileName: String((req.body as any)?.ProfileName) } : {}),
      },
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  const msg =
    inserted[0] ||
    (await db.query.communicationsMessages.findFirst({
      where: and(
        eq(communicationsMessages.tenantId, tenantId),
        eq(communicationsMessages.provider, "twilio"),
        eq(communicationsMessages.providerMessageId, messageSid),
      ),
    }));
  if (!msg) return reject(res, 500, "Failed to record inbound message");

  const dueAt = computeDueAt(fromE164);

  await db
    .insert(communicationsWorkOrders)
    .values({
      tenantId,
      agentKey,
      channel: channel as any,
      threadId: thread.id,
      status: "open",
      peerAddress: fromE164,
      lastInboundMessageId: msg.id,
      lastInboundAt: now,
      ackSentAt: null,
      repliedAt: null,
      dueAt,
      lastEscalatedAt: null,
      metadata: { source: "twilio", messageSid },
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [communicationsWorkOrders.threadId],
      set: {
        status: "open",
        agentKey,
        channel: channel as any,
        peerAddress: fromE164,
        lastInboundMessageId: msg.id,
        lastInboundAt: now,
        dueAt,
        updatedAt: now,
      },
    });

  await logEvent(tenantId, "twilio.message.inbound", {
    channel,
    messageSid,
    from: (req.body as any)?.From,
    to: (req.body as any)?.To,
    numMedia: media.count,
    inboundLogId: inboundLog.id,
    resolutionSource: inboundContext.resolutionSource,
  });

  // Only auto-reply once (idempotent on MessageSid).
  if (inserted.length && shouldAutoReply() && bodyText) {
    try {
      const reply = await replyRouter(bodyText, { tenantId, tenantKey: tenantKey || "exportunity" });
      const out = await sendOutboundCommunication({
        tenantId,
        agentKey,
        channel,
        toE164: fromE164,
        body: reply.response,
        metadata: { autoReply: true, mode: reply.mode, confidence: reply.confidence, reason: reply.reason },
        ackOnly: true,
      });

      await logEvent(tenantId, "twilio.auto_reply", {
        ok: out.ok,
        channel,
        to: fromE164,
        providerMessageId: out.providerMessageId,
      });
    } catch (err: any) {
      await logEvent(tenantId, "twilio.auto_reply_failed", { message: String(err?.message || "failed") });
    }
  }

  res.json({ ok: true, tenantId, inboundLogId: inboundLog.id });
}

async function handleVoiceInbound(req: Request, res: Response) {
  const tenant = (req as any).tenant as TenantInfo;
  if (!tenant) return reject(res, 500, "Tenant not configured");
  if (!verifySignature(req, res)) return;

  const callSid = String((req.body as any)?.CallSid || "").trim();
  const callStatus = String((req.body as any)?.CallStatus || "").trim().toLowerCase();
  const fromE164 = normalizeE164((req.body as any)?.From);
  const toE164 = normalizeE164((req.body as any)?.To);
  if (!callSid) return reject(res, 400, "CallSid required");
  if (!fromE164 || !toE164) return reject(res, 400, "Invalid From/To (E.164 required)");

  const route = await db.query.communicationsRoutingMap.findFirst({
    where: and(
      eq(communicationsRoutingMap.tenantId, tenant.id),
      eq(communicationsRoutingMap.provider, "twilio"),
      eq(communicationsRoutingMap.channel, "voice" as any),
      eq(communicationsRoutingMap.toAddress, toE164),
      eq(communicationsRoutingMap.isEnabled, true),
    ),
  });

  const agentKey = normalizeAgentKey(route?.agentKey || defaultAgentKey()) || "support";
  const now = new Date();

  const [thread] = await db
    .insert(communicationsThreads)
    .values({
      tenantId: tenant.id,
      agentKey,
      channel: "voice" as any,
      peerAddress: fromE164,
      lastMessageAt: now,
      metadata: { lastTo: toE164 },
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        communicationsThreads.tenantId,
        communicationsThreads.agentKey,
        communicationsThreads.channel,
        communicationsThreads.peerAddress,
      ],
      set: { lastMessageAt: now, updatedAt: now, metadata: { lastTo: toE164 } as any },
    })
    .returning();

  const inserted = await db
    .insert(communicationsMessages)
    .values({
      tenantId: tenant.id,
      agentKey,
      threadId: thread.id,
      direction: "inbound",
      status: callStatus || "ringing",
      provider: "twilio",
      channel: "voice" as any,
      fromAddress: fromE164,
      toAddress: toE164,
      body: null,
      providerMessageId: callSid,
      errorCode: null,
      errorMessage: null,
      metadata: { source: "twilio.voice", callSid, callStatus },
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  const callMsg =
    inserted[0] ||
    (await db.query.communicationsMessages.findFirst({
      where: and(
        eq(communicationsMessages.tenantId, tenant.id),
        eq(communicationsMessages.provider, "twilio"),
        eq(communicationsMessages.providerMessageId, callSid),
      ),
    }));
  if (!callMsg) return reject(res, 500, "Failed to record inbound call");

  const dueAt = computeDueAt(fromE164);

  await db
    .insert(communicationsWorkOrders)
    .values({
      tenantId: tenant.id,
      agentKey,
      channel: "voice" as any,
      threadId: thread.id,
      status: "open",
      peerAddress: fromE164,
      lastInboundMessageId: callMsg.id,
      lastInboundAt: now,
      ackSentAt: null,
      repliedAt: null,
      dueAt,
      lastEscalatedAt: null,
      metadata: { source: "twilio.voice", callSid },
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [communicationsWorkOrders.threadId],
      set: {
        status: "open",
        agentKey,
        channel: "voice" as any,
        peerAddress: fromE164,
        lastInboundMessageId: callMsg.id,
        lastInboundAt: now,
        dueAt,
        updatedAt: now,
      },
    });

  await logEvent(tenant.id, "twilio.voice.inbound", {
    callSid,
    callStatus,
    from: (req.body as any)?.From,
    to: (req.body as any)?.To,
    agentKey,
  });

  const voiceResponse = new (twilio as any).twiml.VoiceResponse();
  const dialToE164 = await resolveVoiceDialToE164({ tenantId: tenant.id, agentKey, routeMeta: (route?.metadata as any) ?? null });

  if (dialToE164) {
    voiceResponse.say(
      { voice: "alice" },
      "Thank you for calling. Please hold while we connect you.",
    );
    const dial = voiceResponse.dial({ timeout: 25 });
    dial.number(dialToE164);
  }

  if (shouldVoiceVoicemail()) {
    voiceResponse.say({ voice: "alice" }, "Please leave a message after the beep.");
    voiceResponse.record({
      playBeep: true,
      maxLength: 120,
      action: "/api/webhooks/twilio/voice/recording",
      method: "POST",
    });
  } else if (!dialToE164) {
    voiceResponse.say({ voice: "alice" }, "No agent is available right now.");
  }

  voiceResponse.hangup();

  res.type("text/xml").send(voiceResponse.toString());
}

async function handleVoiceOutbound(req: Request, res: Response) {
  const tenant = (req as any).tenant as TenantInfo;
  if (!tenant) return reject(res, 500, "Tenant not configured");
  if (!verifySignature(req, res)) return;

  const messageId = parseIntSafe((req.query as any)?.messageId);
  if (!messageId) return reject(res, 400, "messageId required");

  const msg = await db.query.communicationsMessages.findFirst({
    where: and(eq(communicationsMessages.tenantId, tenant.id), eq(communicationsMessages.id, messageId)),
  });
  if (!msg) return reject(res, 404, "Message not found");

  const meta = (msg.metadata && typeof msg.metadata === "object" ? msg.metadata : {}) as any;
  const dialToE164 = normalizeE164(meta?.voiceDialToE164) || normalizeE164(process.env.TWILIO_VOICE_FORWARD_TO || process.env.TWILIO_VOICE_DIAL_TO);
  if (!dialToE164) return reject(res, 409, "Missing voice dial target");

  const record = Boolean(meta?.record);

  const voiceResponse = new (twilio as any).twiml.VoiceResponse();

  const dial = voiceResponse.dial({
    timeout: 25,
    ...(record
      ? {
          record: "record-from-answer",
          recordingStatusCallback: "/api/webhooks/twilio/voice/recording",
          recordingStatusCallbackMethod: "POST",
        }
      : {}),
  });
  dial.number(dialToE164);

  if (shouldVoiceVoicemail()) {
    voiceResponse.say({ voice: "alice" }, "If we cannot connect, please leave a message after the beep.");
    voiceResponse.record({
      playBeep: true,
      maxLength: 120,
      action: "/api/webhooks/twilio/voice/recording",
      method: "POST",
    });
  }

  voiceResponse.hangup();
  res.type("text/xml").send(voiceResponse.toString());
}

async function handleVoiceRecording(req: Request, res: Response) {
  const tenant = (req as any).tenant as TenantInfo;
  if (!tenant) return reject(res, 500, "Tenant not configured");
  if (!verifySignature(req, res)) return;

  const callSid = String((req.body as any)?.CallSid || "").trim();
  const recordingSid = String((req.body as any)?.RecordingSid || "").trim() || null;
  const recordingUrl = String((req.body as any)?.RecordingUrl || "").trim() || null;
  const recordingDuration = (req.body as any)?.RecordingDuration != null ? String((req.body as any)?.RecordingDuration) : null;

  if (!callSid) return reject(res, 400, "CallSid required");

  const msg = await db.query.communicationsMessages.findFirst({
    where: and(
      eq(communicationsMessages.tenantId, tenant.id),
      eq(communicationsMessages.provider, "twilio"),
      eq(communicationsMessages.providerMessageId, callSid),
    ),
  });

  if (msg) {
    const prev = (msg.metadata && typeof msg.metadata === "object" ? msg.metadata : {}) as any;
    await db
      .update(communicationsMessages)
      .set({
        metadata: {
          ...prev,
          recording: {
            sid: recordingSid,
            url: recordingUrl,
            durationSec: recordingDuration ? Number.parseInt(recordingDuration, 10) : null,
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(communicationsMessages.id, msg.id));
  }

  await logEvent(tenant.id, "twilio.voice.recording", { callSid, recordingSid, recordingUrl, recordingDuration });
  res.json({ ok: true });
}

async function handleVoiceStatus(req: Request, res: Response) {
  const tenant = (req as any).tenant as TenantInfo;
  if (!tenant) return reject(res, 500, "Tenant not configured");
  if (!verifySignature(req, res)) return;

  const callSid = String((req.body as any)?.CallSid || "").trim();
  const callStatus = String((req.body as any)?.CallStatus || "").trim().toLowerCase();
  const toRaw = String((req.body as any)?.To || "").trim();
  const fromRaw = String((req.body as any)?.From || "").trim();
  const durationSecRaw = (req.body as any)?.CallDuration != null ? String((req.body as any)?.CallDuration) : null;
  const durationSec = durationSecRaw ? Number.parseInt(durationSecRaw, 10) : null;

  if (!callSid) return reject(res, 400, "CallSid required");
  if (!callStatus) return reject(res, 400, "CallStatus required");

  const messageId = parseIntSafe((req.query as any)?.messageId);
  const msg =
    (messageId
      ? await db.query.communicationsMessages.findFirst({
          where: and(eq(communicationsMessages.tenantId, tenant.id), eq(communicationsMessages.id, messageId)),
        })
      : null) ||
    (await db.query.communicationsMessages.findFirst({
      where: and(
        eq(communicationsMessages.tenantId, tenant.id),
        eq(communicationsMessages.provider, "twilio"),
        eq(communicationsMessages.providerMessageId, callSid),
      ),
    }));

  if (msg) {
    const prev = (msg.metadata && typeof msg.metadata === "object" ? msg.metadata : {}) as any;
    await db
      .update(communicationsMessages)
      .set({
        status: callStatus,
        providerMessageId: msg.providerMessageId || callSid,
        metadata: { ...prev, callStatus, durationSec },
        updatedAt: new Date(),
      })
      .where(eq(communicationsMessages.id, msg.id));

    // Consider an answered call as a reply (no follow-up required by default).
    const answered = callStatus === "in-progress" || (callStatus === "completed" && (durationSec ?? 0) > 0);
    if (answered) {
      await db
        .update(communicationsWorkOrders)
        .set({ status: "replied", repliedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(communicationsWorkOrders.tenantId, tenant.id), eq(communicationsWorkOrders.threadId, msg.threadId)));
    }
  }

  await logEvent(tenant.id, "twilio.voice.status", {
    callSid,
    callStatus,
    to: toRaw,
    from: fromRaw,
    durationSec,
  });

  res.json({ ok: true });
}

// Messaging (new canonical endpoints)
router.post("/message/status", handleMessageStatus);
router.post("/sms/inbound", handleMessageInbound);
router.post("/whatsapp/inbound", handleMessageInbound);

// Messaging (legacy aliases)
router.post("/status", handleMessageStatus);
router.post("/inbound", handleMessageInbound);

// Voice (TwiML + callbacks)
router.post("/voice/inbound", handleVoiceInbound);
router.post("/voice/outbound", handleVoiceOutbound);
router.post("/voice/status", handleVoiceStatus);
router.post("/voice/recording", handleVoiceRecording);

export default router;
