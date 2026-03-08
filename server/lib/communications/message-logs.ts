import { db } from "@db";
import { inboundMessageLogs, outboundMessageLogs } from "@db/schema";
import { eq } from "drizzle-orm";
import type { ResolvableTwilioChannel } from "./sender-resolution";

export type TwilioOutboundLogStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "undelivered"
  | "failed"
  | "received";

export function mapTwilioStatusToLogStatus(statusRaw: unknown): TwilioOutboundLogStatus {
  const status = String(statusRaw || "").trim().toLowerCase();
  if (!status) return "queued";
  if (status === "accepted" || status === "queued" || status === "scheduled") return "queued";
  if (status === "sent" || status === "sending") return "sent";
  if (status === "delivered") return "delivered";
  if (status === "read") return "read";
  if (status === "undelivered") return "undelivered";
  if (status === "received" || status === "receiving") return "received";
  if (status === "failed" || status === "canceled" || status === "cancelled") return "failed";
  return "queued";
}

function toPlainJsonObject(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  try {
    const json = JSON.stringify(value);
    if (!json) return null;
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function buildOutboundMessageLogValues(input: {
  tenantId: number;
  agentId?: number | null;
  channel: ResolvableTwilioChannel;
  fromAddress?: string | null;
  toAddress: string;
  body?: string | null;
  templateName?: string | null;
  templatePayload?: Record<string, unknown> | null;
}) {
  const now = new Date();
  return {
    tenantId: Number(input.tenantId),
    agentId: input.agentId ?? null,
    channel: input.channel,
    fromAddress: input.fromAddress ?? null,
    toAddress: input.toAddress,
    body: input.body ?? null,
    templateName: input.templateName ?? null,
    templatePayload: toPlainJsonObject(input.templatePayload) ?? null,
    twilioMessageSid: null,
    twilioStatus: "queued",
    providerErrorCode: null,
    providerErrorMessage: null,
    providerResponse: null,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
}

export function buildOutboundLogFinalizePatch(input: {
  status?: unknown;
  twilioStatus?: unknown;
  twilioMessageSid?: string | null;
  providerErrorCode?: string | null;
  providerErrorMessage?: string | null;
  providerResponse?: Record<string, unknown> | null;
}) {
  const twilioStatus = String(input.twilioStatus ?? input.status ?? "").trim().toLowerCase() || null;
  const providerErrorCode = input.providerErrorCode != null ? String(input.providerErrorCode) : null;
  return {
    status: mapTwilioStatusToLogStatus(input.status ?? input.twilioStatus),
    twilioStatus,
    twilioMessageSid: input.twilioMessageSid ?? null,
    providerErrorCode,
    providerErrorMessage: input.providerErrorMessage ?? null,
    providerResponse: toPlainJsonObject(input.providerResponse) ?? null,
    updatedAt: new Date(),
  };
}

export function buildInboundMessageLogValues(input: {
  tenantId?: number | null;
  agentId?: number | null;
  fromAddress: string;
  toAddress: string;
  body?: string | null;
  channel: ResolvableTwilioChannel;
  twilioMessageSid?: string | null;
  rawPayload: Record<string, unknown>;
}) {
  return {
    tenantId: input.tenantId ?? null,
    agentId: input.agentId ?? null,
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
    body: input.body ?? null,
    channel: input.channel,
    twilioMessageSid: input.twilioMessageSid ?? null,
    rawPayload: toPlainJsonObject(input.rawPayload) ?? {},
    createdAt: new Date(),
  };
}

export async function createOutboundMessageLog(input: Parameters<typeof buildOutboundMessageLogValues>[0]) {
  const [row] = await db.insert(outboundMessageLogs).values(buildOutboundMessageLogValues(input)).returning();
  return row;
}

export async function finalizeOutboundMessageLog(
  id: number,
  input: Parameters<typeof buildOutboundLogFinalizePatch>[0],
) {
  const [row] = await db
    .update(outboundMessageLogs)
    .set(buildOutboundLogFinalizePatch(input))
    .where(eq(outboundMessageLogs.id, id))
    .returning();
  return row || null;
}

export async function updateOutboundMessageLogBySid(
  twilioMessageSid: string,
  input: Parameters<typeof buildOutboundLogFinalizePatch>[0],
) {
  const [row] = await db
    .update(outboundMessageLogs)
    .set(buildOutboundLogFinalizePatch({ ...input, twilioMessageSid }))
    .where(eq(outboundMessageLogs.twilioMessageSid, twilioMessageSid))
    .returning();
  return row || null;
}

export async function createInboundMessageLog(input: Parameters<typeof buildInboundMessageLogValues>[0]) {
  const [row] = await db.insert(inboundMessageLogs).values(buildInboundMessageLogValues(input)).returning();
  return row;
}
