import { db } from "@db";
import { actionEvents, actionRequests } from "@db/schema";
import { and, eq } from "drizzle-orm";

export type ActionLifecycleState =
  | "CREATED"
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED";

export type ActionEvidenceStatus = "NONE" | "PENDING" | "SATISFIED";

export function toPublicActionId(actionId: number, prefix = "ACT") {
  const normalized = Number.isFinite(actionId) && actionId > 0 ? Math.trunc(actionId) : 0;
  return `${String(prefix || "ACT").toUpperCase()}-${String(normalized).padStart(6, "0")}`;
}

export function readPublicActionId(row: any, fallbackPrefix = "ACT") {
  const direct = String(row?.publicActionId ?? row?.public_action_id ?? "").trim();
  if (direct) return direct;
  const id = Number(row?.id ?? row?.action_request_id ?? 0);
  if (Number.isFinite(id) && id > 0) return toPublicActionId(id, fallbackPrefix);
  return null;
}

export function formatPublicActionLabel(row: any, fallbackPrefix = "ACT") {
  return readPublicActionId(row, fallbackPrefix) || "ACT-UNKNOWN";
}

export function normalizeLifecycleState(value: unknown): ActionLifecycleState {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "CREATED") return "CREATED";
  if (normalized === "QUEUED") return "QUEUED";
  if (normalized === "RUNNING") return "RUNNING";
  if (normalized === "SUCCEEDED") return "SUCCEEDED";
  if (normalized === "FAILED") return "FAILED";
  if (normalized === "CANCELED" || normalized === "CANCELLED") return "CANCELED";
  return "CREATED";
}

export function normalizeEvidenceStatus(value: unknown): ActionEvidenceStatus {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "NONE") return "NONE";
  if (normalized === "PENDING") return "PENDING";
  if (normalized === "SATISFIED") return "SATISFIED";
  return "NONE";
}

export function toLifecycleStateFromLegacyStatus(status: unknown): ActionLifecycleState {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "QUEUED") return "QUEUED";
  if (normalized === "RUNNING") return "RUNNING";
  if (normalized === "DONE") return "SUCCEEDED";
  if (normalized === "FAILED") return "FAILED";
  if (normalized === "CANCELLED" || normalized === "CANCELED" || normalized === "DENIED") return "CANCELED";
  if (normalized === "REQUIRES_APPROVAL") return "CREATED";
  return "CREATED";
}

export function toLegacyStatusFromLifecycleState(state: ActionLifecycleState) {
  if (state === "QUEUED") return "QUEUED";
  if (state === "RUNNING") return "RUNNING";
  if (state === "SUCCEEDED") return "DONE";
  if (state === "FAILED") return "FAILED";
  if (state === "CANCELED") return "CANCELLED";
  return "PENDING";
}

function looksMissingConfigMessage(message: string) {
  const text = message.toLowerCase();
  return (
    text.includes("not configured") ||
    text.includes("missing config") ||
    text.includes("twilio_") ||
    text.includes("mail_smtp") ||
    text.includes("smtp not configured") ||
    text.includes("smtp credentials not resolved") ||
    text.includes("whatsapp sending disabled") ||
    text.includes("sms sending disabled")
  );
}

export function inferActionErrorCode(input: { errorCode?: unknown; message?: unknown }) {
  const explicit = String(input.errorCode || "").trim();
  if (explicit) {
    const upper = explicit.toUpperCase();
    if (upper.includes("NOT_CONFIGURED") || upper.includes("MISSING")) return "MISSING_CONFIG";
    if (upper.includes("TIMEOUT")) return "TIMEOUT";
    if (upper.includes("RATE")) return "RATE_LIMITED";
    return upper.replace(/[^A-Z0-9_]/g, "_").slice(0, 80) || "ACTION_FAILED";
  }

  const message = String(input.message || "").trim();
  if (!message) return "ACTION_FAILED";
  if (looksMissingConfigMessage(message)) return "MISSING_CONFIG";
  if (message.toLowerCase().includes("timeout")) return "TIMEOUT";
  if (message.toLowerCase().includes("rate limit")) return "RATE_LIMITED";
  if (message.toLowerCase().includes("unsupported action_type")) return "UNSUPPORTED_ACTION_TYPE";
  return "ACTION_FAILED";
}

export async function ensureActionPublicId(input: {
  tenantId: number;
  actionId: number;
  existingPublicActionId?: string | null | undefined;
  prefix?: string;
}) {
  const actionId = Number(input.actionId);
  const tenantId = Number(input.tenantId);
  if (!Number.isFinite(actionId) || actionId <= 0 || !Number.isFinite(tenantId) || tenantId <= 0) return null;

  const existing = String(input.existingPublicActionId || "").trim();
  if (existing) return existing;
  const computed = toPublicActionId(actionId, input.prefix || "ACT");

  await db
    .update(actionRequests)
    .set({ publicActionId: computed, updatedAt: new Date() } as any)
    .where(and(eq(actionRequests.tenantId, tenantId), eq(actionRequests.id, actionId)));

  return computed;
}

export async function appendActionEvent(input: {
  actionId: number;
  correlationId?: string | null;
  eventType: string;
  payload?: Record<string, unknown> | null;
}) {
  const actionId = Number(input.actionId);
  if (!Number.isFinite(actionId) || actionId <= 0) return;

  try {
    await db.insert(actionEvents).values({
      actionId,
      correlationId: String(input.correlationId || "").trim() || null,
      eventType: String(input.eventType || "UNKNOWN").trim().toUpperCase(),
      payloadJson: input.payload && typeof input.payload === "object" ? input.payload : {},
      createdAt: new Date(),
    });
  } catch {
    // Event sink is best-effort and must never break action execution.
  }
}
