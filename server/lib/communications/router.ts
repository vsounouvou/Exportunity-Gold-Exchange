import { db } from "@db";
import { and, eq } from "drizzle-orm";
import { communicationsMessages, communicationsThreads, communicationsWorkOrders } from "@db/schema";
import { normalizeAgentKey } from "../mail/agentSlugs";
import { normalizeE164, sendTenantMessage, type TwilioChannel } from "./twilio";
import { resolveAgentIdentityForTenant } from "./sender-resolution";

export type OutboundCommunicationRequest = {
  tenantId: number;
  actionRequestId?: number | null;
  agentKey: string;
  channel: TwilioChannel;
  toE164: string;
  body?: string;
  contentSid?: string | null;
  contentVariables?: Record<string, string> | null;
  mediaUrls?: string[] | null;
  metadata?: Record<string, unknown>;
  clientMessageId?: string | null;
  // When true, updates the work order as acknowledged (not fully replied).
  ackOnly?: boolean;
};

export async function sendOutboundCommunication(req: OutboundCommunicationRequest) {
  const toE164 = normalizeE164(req.toE164);
  if (!toE164) return { ok: false as const, message: "Invalid E.164 number" };

  const body = String(req.body || "").trim();
  const contentSid = String(req.contentSid || "").trim() || null;
  const contentVariables =
    req.contentVariables && typeof req.contentVariables === "object"
      ? Object.fromEntries(
          Object.entries(req.contentVariables)
            .slice(0, 25)
            .map(([k, v]) => [String(k), String(v)]),
        )
      : null;

  if (!contentSid && !body) return { ok: false as const, message: "Message body required" };
  if (contentSid && req.channel !== "whatsapp") return { ok: false as const, message: "Templates are only supported for WhatsApp" };

  const now = new Date();
  const normalizedAgentKey = normalizeAgentKey(req.agentKey) || req.agentKey;
  const agentIdentity = await resolveAgentIdentityForTenant({
    tenantId: req.tenantId,
    agentKey: normalizedAgentKey,
  });

  const [thread] = await db
    .insert(communicationsThreads)
    .values({
      tenantId: req.tenantId,
      agentKey: normalizedAgentKey,
      channel: req.channel,
      peerAddress: toE164,
      lastMessageAt: now,
      metadata: {},
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
      set: { lastMessageAt: now, updatedAt: now },
    })
    .returning();

  const [queued] = await db
    .insert(communicationsMessages)
    .values({
      tenantId: req.tenantId,
      agentKey: normalizedAgentKey,
      threadId: thread.id,
      direction: "outbound",
      status: "queued",
      provider: "twilio",
      channel: req.channel,
      fromAddress: "",
      toAddress: toE164,
      body: body || null,
      providerMessageId: null,
      errorCode: null,
      errorMessage: null,
      metadata: {
        ...(req.metadata ?? {}),
        actionRequestId: req.actionRequestId ?? null,
        ...(req.clientMessageId ? { clientMessageId: req.clientMessageId } : {}),
        ...(contentSid ? { contentSid, contentVariables } : {}),
        ...(req.mediaUrls?.length ? { mediaUrls: req.mediaUrls } : {}),
      },
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  let sendResult:
    | Awaited<ReturnType<typeof sendTenantMessage>>
    | {
        ok: false;
        providerMessageId: null;
        status: string | null;
        errorCode: string | null;
        errorMessage: string | null;
        raw: Record<string, unknown> | null;
        outboundLogId: number | null;
        finalBody: string | null;
        fromAddress: string | null;
      };

  try {
    sendResult = await sendTenantMessage({
      tenantId: req.tenantId,
      agentId: agentIdentity.agentId,
      agentKey: agentIdentity.agentKey,
      to: toE164,
      channel: req.channel,
      body,
      templateName: contentSid,
      templatePayload: contentSid
        ? {
            contentSid,
            ...(contentVariables ? { contentVariables } : {}),
          }
        : null,
      metadata: {
        ...(req.metadata ?? {}),
        ...(req.clientMessageId ? { clientMessageId: req.clientMessageId } : {}),
        source: "communications.router",
      },
      mediaUrls: req.mediaUrls ?? null,
    });
  } catch (error: any) {
    sendResult = {
      ok: false,
      providerMessageId: null,
      status: "failed",
      errorCode: String(error?.code || error?.providerErrorCode || "twilio_send_failed"),
      errorMessage: String(error?.message || "Twilio send failed"),
      raw: null,
      outboundLogId: null,
      finalBody: body || null,
      fromAddress: null,
    };
  }

  const status = sendResult.ok ? String(sendResult.status || "sent").toLowerCase() : "failed";
  await db
    .update(communicationsMessages)
    .set({
      status,
      fromAddress: sendResult.fromAddress || "",
      body: sendResult.finalBody || body || null,
      providerMessageId: sendResult.providerMessageId,
      errorCode: sendResult.errorCode,
      errorMessage: sendResult.errorMessage,
      metadata: {
        ...(req.metadata ?? {}),
        ...(req.clientMessageId ? { clientMessageId: req.clientMessageId } : {}),
        ...(contentSid ? { contentSid, contentVariables } : {}),
        ...(req.mediaUrls?.length ? { mediaUrls: req.mediaUrls } : {}),
        ...(sendResult.outboundLogId ? { outboundLogId: sendResult.outboundLogId } : {}),
        ...(sendResult.raw ? { twilio: sendResult.raw } : {}),
      },
      updatedAt: new Date(),
    })
    .where(eq(communicationsMessages.id, queued.id));

  // Work order enforcement: only mark ack/replied if Twilio accepted the message.
  if (sendResult.ok) {
    if (req.ackOnly) {
      await db
        .update(communicationsWorkOrders)
        .set({ ackSentAt: now, updatedAt: now })
        .where(and(eq(communicationsWorkOrders.threadId, thread.id), eq(communicationsWorkOrders.tenantId, req.tenantId)));
    } else {
      await db
        .update(communicationsWorkOrders)
        .set({ status: "replied", repliedAt: now, updatedAt: now })
        .where(and(eq(communicationsWorkOrders.threadId, thread.id), eq(communicationsWorkOrders.tenantId, req.tenantId)));
    }
  }

  return {
    ok: sendResult.ok as boolean,
    threadId: thread.id,
    messageId: queued.id,
    providerMessageId: sendResult.providerMessageId,
    status,
    errorCode: sendResult.errorCode,
    errorMessage: sendResult.errorMessage,
  };
}
