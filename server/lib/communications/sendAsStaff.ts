import { db } from "@db";
import { and, eq, gte, sql } from "drizzle-orm";
import { auditLogs, communicationsAgentControls, communicationsEvents, communicationsMessages } from "@db/schema";
import { normalizeAgentKey } from "../mail/agentSlugs";
import { normalizeE164 } from "./twilio";
import { sendOutboundCommunication } from "./router";

type Channel = "sms" | "whatsapp";
type Mode = "text" | "template";

const outboundBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const row = outboundBuckets.get(key);
  if (!row || row.resetAt <= now) {
    outboundBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (row.count >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((row.resetAt - now) / 1000));
    const err = new Error("Rate limit exceeded");
    (err as any).status = 429;
    (err as any).retryAfterSec = retryAfterSec;
    throw err;
  }
  row.count += 1;
}

async function getOrCreateAgentControls(opts: { tenantId: number; agentKey: string }) {
  const existing = await db.query.communicationsAgentControls.findFirst({
    where: and(eq(communicationsAgentControls.tenantId, opts.tenantId), eq(communicationsAgentControls.agentKey, opts.agentKey)),
  });
  if (existing) return existing;

  const now = new Date();
  const created = await db
    .insert(communicationsAgentControls)
    .values({
      tenantId: opts.tenantId,
      agentKey: opts.agentKey,
      smsEnabled: true,
      whatsappEnabled: true,
      voiceEnabled: true,
      smsDailyOutboundLimit: 0,
      whatsappDailyOutboundLimit: 0,
      voiceDailyOutboundLimit: 0,
      voiceDialToE164: null,
      metadata: { seeded: true },
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  return (
    created[0] ||
    (await db.query.communicationsAgentControls.findFirst({
      where: and(eq(communicationsAgentControls.tenantId, opts.tenantId), eq(communicationsAgentControls.agentKey, opts.agentKey)),
    }))
  );
}

async function assertDailySendLimit(opts: { tenantId: number; agentKey: string; channel: Channel; limit: number }) {
  if (!opts.limit || opts.limit <= 0) return;

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);

  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(communicationsMessages)
    .where(
      and(
        eq(communicationsMessages.tenantId, opts.tenantId),
        eq(communicationsMessages.agentKey, opts.agentKey),
        eq(communicationsMessages.channel, opts.channel as any),
        eq(communicationsMessages.direction, "outbound"),
        gte(communicationsMessages.createdAt, start),
        sql`${communicationsMessages.status} <> 'failed'`,
      ),
    );

  const sentToday = Number(rows[0]?.count || 0);
  if (sentToday >= opts.limit) {
    const err = new Error(`Daily ${opts.channel.toUpperCase()} send limit reached (${opts.limit})`);
    (err as any).status = 429;
    throw err;
  }
}

export type SendCommunicationAsStaffInput = {
  tenantId: number;
  agentKey: string;
  channel: Channel;
  toE164: string;
  mode: Mode;
  body: string | null;
  contentSid?: string | null;
  contentVariables?: Record<string, string> | null;
  clientMessageId?: string | null;
  mediaUrls?: string[] | null;
  requestedByUserId?: number | null;
  admin?: boolean;
  source?: string;
  ackOnly?: boolean;
};

export async function sendCommunicationAsStaff(input: SendCommunicationAsStaffInput) {
  const channel = input.channel;
  if (channel !== "sms" && channel !== "whatsapp") throw new Error("channel must be sms|whatsapp");

  const agentKey = normalizeAgentKey(input.agentKey);
  if (!agentKey) throw new Error("agentKey required");

  const toE164 = normalizeE164(input.toE164);
  if (!toE164) throw new Error("toE164 (E.164) required");

  const mode = input.mode;
  if (mode !== "text" && mode !== "template") throw new Error("mode must be text|template");
  if (mode === "template" && channel !== "whatsapp") throw new Error("template mode is only supported for WhatsApp");

  const body = String(input.body || "").trim();
  const contentSid = mode === "template" ? String(input.contentSid || "").trim() || null : null;
  const contentVariables = mode === "template" ? input.contentVariables ?? null : null;
  if (mode === "text" && !body) throw new Error("body required");
  if (mode === "template" && !contentSid) throw new Error("contentSid required for template mode");

  // Rate limits (in-memory, per-process).
  rateLimit(`tenant:${input.tenantId}`, 60, 60_000);
  rateLimit(`agent:${input.tenantId}:${agentKey}:${channel}`, 30, 60_000);
  rateLimit(`peer:${input.tenantId}:${agentKey}:${channel}:${toE164}`, 6, 60_000);

  const controls = await getOrCreateAgentControls({ tenantId: input.tenantId, agentKey });
  if (!input.admin) {
    if (channel === "sms" && !controls?.smsEnabled) {
      const err = new Error("SMS is disabled for this agent");
      (err as any).status = 403;
      throw err;
    }
    if (channel === "whatsapp" && !controls?.whatsappEnabled) {
      const err = new Error("WhatsApp is disabled for this agent");
      (err as any).status = 403;
      throw err;
    }

    const limit =
      channel === "sms" ? Number(controls?.smsDailyOutboundLimit || 0) : Number(controls?.whatsappDailyOutboundLimit || 0);
    await assertDailySendLimit({ tenantId: input.tenantId, agentKey, channel, limit });
  }

  const out = await sendOutboundCommunication({
    tenantId: input.tenantId,
    agentKey,
    channel,
    toE164,
    body,
    ...(contentSid ? { contentSid, contentVariables } : {}),
    clientMessageId: input.clientMessageId ?? null,
    mediaUrls: input.mediaUrls?.length ? input.mediaUrls : null,
    metadata: {
      requestedByUserId: input.requestedByUserId ?? null,
      source: input.source || "internal",
      mode,
    },
    ackOnly: Boolean(input.ackOnly),
  });

  try {
    await db.insert(communicationsEvents).values({
      tenantId: input.tenantId,
      provider: "twilio",
      eventType: "twilio.send",
      eventAt: new Date(),
      data: {
        agentKey,
        channel,
        toE164,
        ok: out.ok,
        status: out.status ?? null,
        providerMessageId: out.providerMessageId ?? null,
        errorCode: (out as any).errorCode ?? null,
        errorMessage: out.errorMessage ?? null,
      },
      createdAt: new Date(),
    });
  } catch {
    // ignore
  }

  try {
    await db.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.requestedByUserId ?? null,
      userRole: input.admin ? "admin" : "staff",
      action: "comms.send",
      entityType: "communications_thread",
      entityId: out.threadId ?? null,
      metadata: {
        agentKey,
        channel,
        toE164,
        ok: out.ok,
        status: out.status ?? null,
        providerMessageId: out.providerMessageId ?? null,
        errorCode: (out as any).errorCode ?? null,
      },
      createdAt: new Date(),
    });
  } catch {
    // ignore
  }

  return out;
}
