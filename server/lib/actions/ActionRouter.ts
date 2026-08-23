import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@db";
import { actionRequests, agentMailboxes, agents, auditLogs, emailSendLogs, tenants } from "@db/schema";
import { normalizeAgentKey } from "../mail/agentSlugs";
import { resolveTenantMailDomain } from "../mail/domainResolver";
import { provisionAgentMailbox } from "../mail/provisioner";
import { isAgentRunnableStatus } from "../agents/visibility";
import { assertProductionAgentIdAllowed, assertProductionAgentKeyAllowed } from "../agents/productionAllowlist";
import { randomUUID } from "crypto";
import {
  appendActionEvent,
  ensureActionPublicId,
  inferActionErrorCode,
  toLifecycleStateFromLegacyStatus,
} from "./lifecycle";
import { getMessagingHealth } from "../messaging/config";
import { getSmtpRuntimeHealth } from "../mail/smtpProbe";
import {
  externalCommunicationsEnabled,
  isExternalCommunicationAction,
} from "./externalCommunications";
import {
  evaluateOutboundActionPolicy,
  outboundChannelForActionType,
  outboundRecipientsForPayload,
  OutboundCommunicationPolicyError,
} from "../communications/outboundDecisionService";
import { authorizeExportunityOwnerTest } from "../exportunity/outreach/ownerTestPolicy";
import { isolateActionForDeploymentTenant } from "./tenantWorkerIsolation";

export type ActionRequestStatus =
  | "PENDING"
  | "QUEUED"
  | "RUNNING"
  | "DONE"
  | "FAILED"
  | "REQUIRES_APPROVAL"
  | "DENIED"
  | "CANCELLED";

export type ActionMode = "REAL" | "SIMULATED";
export type ActionOutcome = "SUCCESS" | "FAILED" | "NO_EFFECT" | "APPROVAL_PENDING";

export const ACTION_TYPE_VALUES = [
  "SEND_EMAIL",
  "SEND_SMS",
  "SEND_WHATSAPP",
  "CREATE_CONTACT",
  "CREATE_AGENT",
  "BULK_CREATE_AGENTS",
  "UPDATE_AGENT_MODEL",
  "ASSIGN_AGENT_TO_CONVERSATION",
  "CREATE_SHOP",
  "CREATE_TASK",
  "RUN_AGENT_TASK",
  "CREATE_MEETING_LINK",
  "SEND_MEETING_INVITE",
  "REQUEST_MEETING_SUMMARY",
  "START_BACKGROUND_SESSION",
  "CONFIGURE_RECURRING_MEETING",
  "TRANSCRIBE_VOICE_NOTE",
] as const;

export type ActionType = (typeof ACTION_TYPE_VALUES)[number];

export function isKnownActionType(actionType: string): actionType is ActionType {
  return (ACTION_TYPE_VALUES as readonly string[]).includes(String(actionType || "").trim().toUpperCase());
}

export type CreateActionRequestInput = {
  tenantId: number;
  requestedByUserId: number | null;
  requestedByAgentKey?: string | null;
  actionType: ActionType;
  payload: Record<string, unknown>;
  mode?: ActionMode;
  priority?: number;
  idempotencyKey?: string | null;
  correlationId?: string | null;
  relatedConversationId?: string | null;
  relatedThreadId?: number | null;
  metadata?: Record<string, unknown>;
  isAdmin?: boolean;
  forceApproval?: boolean;
};

async function logAudit(input: {
  tenantId: number;
  userId: number | null;
  action: string;
  entityType?: string | null;
  entityId?: number | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.userId,
      userRole: "staff",
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    });
  } catch {
    // ignore
  }
}

function parseCsvEnv(value: unknown): string[] {
  return String(value || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function isMarketingAgentKey(agentKey: string) {
  const keys = parseCsvEnv(process.env.MAIL_MARKETING_AGENT_KEYS);
  const allow = keys.length ? keys : ["marketing"];
  return allow.includes(String(agentKey || "").trim().toLowerCase());
}

function randomInt(minInclusive: number, maxInclusive: number) {
  const min = Math.min(minInclusive, maxInclusive);
  const max = Math.max(minInclusive, maxInclusive);
  return Math.floor(min + Math.random() * (max - min + 1));
}

function isEnabledByEnv(value: unknown, defaultValue: boolean) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return defaultValue;
  return ["1", "true", "yes", "y", "on"].includes(raw);
}

function isTruthy(value: unknown) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return false;
  return ["1", "true", "yes", "y", "on"].includes(raw);
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isProductionRuntime() {
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
}

function normalizeMode(value: unknown): ActionMode {
  const mode = String(value || "").trim().toUpperCase();
  return mode === "SIMULATED" ? "SIMULATED" : "REAL";
}

function normalizeOutcome(value: unknown): ActionOutcome {
  const outcome = String(value || "").trim().toUpperCase();
  if (outcome === "SUCCESS" || outcome === "FAILED" || outcome === "NO_EFFECT") return outcome;
  return "APPROVAL_PENDING";
}

function generateCorrelationId() {
  return `act_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function inferInitialStatus(input: {
  actionType: ActionType;
  payload: Record<string, unknown>;
  isAdmin: boolean;
  mailbox: { approvalRequired: boolean };
  forceApproval?: boolean;
}): ActionRequestStatus {
  if (input.forceApproval) return "REQUIRES_APPROVAL";
  if (input.actionType === "SEND_EMAIL") {
    if (input.mailbox.approvalRequired && !input.isAdmin) return "REQUIRES_APPROVAL";
    return "QUEUED";
  }
  if (input.actionType === "START_BACKGROUND_SESSION" || input.actionType === "CONFIGURE_RECURRING_MEETING") {
    return input.isAdmin ? "QUEUED" : "REQUIRES_APPROVAL";
  }
  // Default: queue immediately.
  return "QUEUED";
}

function actionRequiresEvidence(actionType: ActionType, payload: Record<string, unknown>) {
  const explicit = (payload as any).evidenceRequired ?? (payload as any).evidence_required;
  if (explicit != null) return isTruthy(explicit);
  // Default to no mandatory evidence for asynchronous action_requests.
  return false;
}

function resolveTenantKeyFromRow(tenant: any) {
  const key = String(tenant?.key || "").trim().toLowerCase();
  if (key === "bdo" || key === "exportunity" || key === "zone" || key === "mindbase") return key;
  return null;
}

async function getTenantKey(tenantId: number) {
  const row = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { key: true },
  });
  return resolveTenantKeyFromRow(row);
}

async function requireMailboxForSendEmail(opts: { tenantId: number; agentKey: string }) {
  const mailbox = await db.query.agentMailboxes.findFirst({
    where: and(eq(agentMailboxes.tenantId, opts.tenantId), eq(agentMailboxes.agentKey, opts.agentKey)),
  });
  if (!mailbox) throw new Error("Mailbox not provisioned for this agent");
  if (!mailbox.isEnabled) throw new Error("Mailbox disabled");
  return mailbox;
}

async function maybeProvisionMailbox(opts: { tenantId: number; agentKey: string }) {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, opts.tenantId),
  });
  if (!tenant) return false;
  const tenantKey = String(tenant?.key || "").trim();
  if (!tenantKey) return false;

  const domain = await resolveTenantMailDomain({
    id: tenant.id,
    key: tenant.key,
    domains: tenant.domains,
  });
  if (!domain) return false;

  const maildirBase = String(process.env.MAILDIR_BASE || "").trim() || "/var/mail";
  await provisionAgentMailbox({
    tenantId: opts.tenantId,
    tenantKey,
    agentKey: opts.agentKey,
    domain,
    maildirBase,
  });
  return true;
}

async function resolveMailboxForSendEmail(opts: { tenantId: number; requestedAgentKey: string }) {
  const agentKey = normalizeAgentKey(opts.requestedAgentKey);
  if (!agentKey) throw new Error("payload.agentKey required");

  try {
    const mailbox = await requireMailboxForSendEmail({ tenantId: opts.tenantId, agentKey });
    return { mailbox, agentKey, autoProvisioned: false };
  } catch (error: any) {
    const message = String(error?.message || error || "unknown_error");
    if (!message.includes("Mailbox not provisioned")) throw error;
  }

  const provisioned = await maybeProvisionMailbox({ tenantId: opts.tenantId, agentKey });
  if (!provisioned) throw new Error("Mailbox not provisioned for this agent");

  const mailbox = await requireMailboxForSendEmail({ tenantId: opts.tenantId, agentKey });
  return { mailbox, agentKey, autoProvisioned: true };
}

export async function createActionRequest(input: CreateActionRequestInput) {
  const now = new Date();
  const requestedByAgentKey = input.requestedByAgentKey ? normalizeAgentKey(input.requestedByAgentKey) : null;
  let payload = input.payload ?? {};
  const requestedMode = normalizeMode(input.mode);
  const dryRunRequested =
    isTruthy((payload as any)?.dryRun) ||
    isTruthy((payload as any)?.dry_run) ||
    isTruthy((payload as any)?.metadata?.dryRun) ||
    isTruthy((payload as any)?.metadata?.dry_run);
  const allowSimulationInProduction =
    isTruthy(process.env.ALLOW_SIMULATED_ACTIONS) || isTruthy(process.env.FEATURE_ALLOW_ACTION_SIMULATION);
  if (requestedMode === "SIMULATED" && isProductionRuntime() && !dryRunRequested && !allowSimulationInProduction) {
    throw new Error("SIMULATION_BLOCKED: production requires dryRun=true (or explicit ALLOW_SIMULATED_ACTIONS)");
  }
  const mode = requestedMode;
  const modelSelectorEnabled = isEnabledByEnv(process.env.FEATURE_AGENT_MODEL_SELECTOR, true);
  const correlationIdRaw = input.correlationId ? String(input.correlationId).trim() : "";
  const correlationId = correlationIdRaw || generateCorrelationId();
  const priority = Number.isFinite(input.priority) ? Math.trunc(Number(input.priority)) : 0;
  const idempotencyKey = input.idempotencyKey ? String(input.idempotencyKey).trim() : null;
  const relatedConversationId = input.relatedConversationId ? String(input.relatedConversationId).trim() : null;
  const relatedThreadId = input.relatedThreadId != null ? Number(input.relatedThreadId) : null;

  let initialStatus: ActionRequestStatus = "QUEUED";
  let policy: Record<string, unknown> = {};
  let metadata: Record<string, unknown> = { ...(input.metadata || {}) };
  let lifecycleState = "QUEUED";
  let initialErrorCode: string | null = null;
  let initialErrorMessage: string | null = null;
  const payloadAgentIdRaw = (payload as any)?.agentId ?? (payload as any)?.agent_id ?? null;
  const payloadAgentId =
    typeof payloadAgentIdRaw === "number" || typeof payloadAgentIdRaw === "string"
      ? Number(payloadAgentIdRaw)
      : null;
  const assignedAgentId = Number.isFinite(payloadAgentId) ? Number(payloadAgentId) : null;

  if (payloadAgentId && Number.isFinite(payloadAgentId)) {
    const actor = await db.query.agents.findFirst({
      where: eq(agents.id, Number(payloadAgentId)),
      columns: {
        id: true,
        name: true,
        status: true,
        isTest: true,
        isVisible: true,
      },
    });
    if (actor && (!isAgentRunnableStatus(actor.status) || actor.isTest || !actor.isVisible)) {
      throw new Error(
        `Agent action blocked: agent ${actor.id} (${actor.name}) is not runnable (status=${actor.status}, is_test=${Boolean(
          actor.isTest,
        )}, is_visible=${Boolean(actor.isVisible)})`,
      );
    }

    if (actor) {
      await assertProductionAgentIdAllowed({
        tenantId: input.tenantId,
        agentId: actor.id,
        context: `action:${input.actionType}`,
      });
    }
  }

  if (input.actionType === "SEND_EMAIL") {
    const smtpHealth = getSmtpRuntimeHealth();
    if (!smtpHealth.configured) {
      initialStatus = input.forceApproval ? "REQUIRES_APPROVAL" : "FAILED";
      lifecycleState = input.forceApproval ? "CREATED" : "FAILED";
      initialErrorCode = input.forceApproval ? null : "MISSING_CONFIG";
      initialErrorMessage = input.forceApproval
        ? null
        : smtpHealth.mode === "disabled"
          ? "Email disabled: SMTP is not configured."
          : `Email disabled: missing ${smtpHealth.missing.join(", ")}`;
      metadata.config = {
        missing: smtpHealth.missing,
        warnings: smtpHealth.warnings,
        mode: smtpHealth.mode,
        channel: "email",
        setupRequiredBeforeApproval: Boolean(input.forceApproval),
      };
    } else {
      const agentKeyRaw = String(payload?.agentKey ?? payload?.agent ?? "").trim();
      const mailboxResult = await resolveMailboxForSendEmail({
        tenantId: input.tenantId,
        requestedAgentKey: agentKeyRaw,
      });
      const mailbox = mailboxResult.mailbox;
      const agentKey = mailboxResult.agentKey;
      await assertProductionAgentKeyAllowed({ tenantId: input.tenantId, agentKey, context: "action:SEND_EMAIL" });
      payload = {
        ...payload,
        agentKey,
      };
      initialStatus = inferInitialStatus({
        actionType: input.actionType,
        payload,
        isAdmin: Boolean(input.isAdmin),
        mailbox,
        forceApproval: input.forceApproval,
      });
      policy = {
        approvalRequired: mailbox.approvalRequired,
        dailyOutboundLimit: mailbox.dailyOutboundLimit,
        mailboxId: mailbox.id,
        mailboxAgentKey: agentKey,
        mailboxAutoProvisioned: mailboxResult.autoProvisioned,
      };

      // Production hardening: pace outbound email sends (warm-up + human-like replies) via action_request.metadata.runAt.
      const warmupEnabled = isEnabledByEnv(
        process.env.MAIL_WARMUP_ENABLED,
        String(process.env.NODE_ENV || "").trim().toLowerCase() === "production",
      );
      const wantsHumanReplyDelay = !input.requestedByUserId && relatedThreadId != null;
      const shouldSchedule = warmupEnabled || wantsHumanReplyDelay;

      let runAtMs: number | null = null;
      let runReason: string | null = null;
      const nowMs = now.getTime();

      if (shouldSchedule) {
        runAtMs = nowMs;

        if (wantsHumanReplyDelay) {
          const minMs = Math.max(0, Number(process.env.MAIL_HUMAN_REPLY_DELAY_MIN_MS ?? 2 * 60_000));
          const maxMs = Math.max(minMs, Number(process.env.MAIL_HUMAN_REPLY_DELAY_MAX_MS ?? 5 * 60_000));
          const jitter = randomInt(Math.trunc(minMs), Math.trunc(maxMs));
          runAtMs += jitter;
          runReason = "human_reply_delay";
        }

        if (warmupEnabled) {
          const marketing = isMarketingAgentKey(agentKey);
          const minIntervalMsRaw = Number(marketing ? process.env.MAIL_WARMUP_MIN_INTERVAL_MARKETING_MS : process.env.MAIL_WARMUP_MIN_INTERVAL_MS);
          const minIntervalMs = Number.isFinite(minIntervalMsRaw)
            ? Math.max(0, Math.min(10 * 60_000, Math.trunc(minIntervalMsRaw)))
            : marketing
              ? 15_000
              : 5_000;

          if (minIntervalMs > 0) {
            const last = await db.query.emailSendLogs.findFirst({
              where: eq(emailSendLogs.tenantId, input.tenantId),
              orderBy: [desc(emailSendLogs.createdAt)],
              columns: { createdAt: true },
            });
            const lastAt = last?.createdAt ? new Date(last.createdAt).getTime() : null;
            if (lastAt != null) {
              const nextAllowed = lastAt + minIntervalMs;
              if (nextAllowed > (runAtMs ?? nowMs)) {
                runAtMs = nextAllowed;
                runReason = runReason ? `${runReason}+warmup_interval` : "warmup_interval";
              }
            }
          }

          // Marketing warm-up daily cap (default: day 1-3=5, day 4-7=10, day 8-14=20, then hold).
          const marketingDailyEnabled = isEnabledByEnv(
            process.env.MAIL_WARMUP_MARKETING_DAILY_ENABLED,
            String(process.env.NODE_ENV || "").trim().toLowerCase() === "production",
          );
          if (marketing && marketingDailyEnabled) {
            const mode = String(process.env.MAIL_WARMUP_MARKETING_DAILY_MODE || "step").trim().toLowerCase();

          const first = await db.query.emailSendLogs.findFirst({
            where: and(eq(emailSendLogs.tenantId, input.tenantId), eq(emailSendLogs.actorAgentKey, agentKey)),
            orderBy: [asc(emailSendLogs.createdAt)],
            columns: { createdAt: true },
          });
          const firstAtMs = first?.createdAt ? new Date(first.createdAt).getTime() : nowMs;
          const daysSince = Math.max(0, Math.floor((nowMs - firstAtMs) / (24 * 60 * 60_000)));

          const allowedToday = (() => {
            if (mode === "linear") {
              const startRaw = Number(process.env.MAIL_WARMUP_MARKETING_DAILY_START ?? 10);
              const incRaw = Number(process.env.MAIL_WARMUP_MARKETING_DAILY_INCREMENT ?? 10);
              const maxRaw = Number(process.env.MAIL_WARMUP_MARKETING_DAILY_MAX ?? 250);
              const start = Number.isFinite(startRaw) ? Math.max(1, Math.min(5000, Math.trunc(startRaw))) : 10;
              const increment = Number.isFinite(incRaw) ? Math.max(0, Math.min(5000, Math.trunc(incRaw))) : 10;
              const max = Number.isFinite(maxRaw) ? Math.max(start, Math.min(50_000, Math.trunc(maxRaw))) : 250;
              return Math.min(max, start + daysSince * increment);
            }

            const after14Raw = Number(process.env.MAIL_WARMUP_MARKETING_DAILY_AFTER_14 ?? 20);
            const after14 = Number.isFinite(after14Raw) ? Math.max(1, Math.min(50_000, Math.trunc(after14Raw))) : 20;
            if (daysSince <= 2) return 5;
            if (daysSince <= 6) return 10;
            if (daysSince <= 13) return 20;
            return after14;
          })();

          const dayStart = new Date(now);
          dayStart.setUTCHours(0, 0, 0, 0);

          const rows = await db
            .select({ count: sql<number>`count(*)` })
            .from(emailSendLogs)
            .where(
              and(
                eq(emailSendLogs.tenantId, input.tenantId),
                eq(emailSendLogs.actorAgentKey, agentKey),
                gte(emailSendLogs.createdAt, dayStart),
              ),
            );
          const sentToday = Number(rows[0]?.count || 0);

          if (sentToday >= allowedToday) {
            const tomorrow = new Date(dayStart.getTime() + 24 * 60 * 60_000);
            const jitter = randomInt(5 * 60_000, 25 * 60_000);
            const nextAllowed = tomorrow.getTime() + jitter;
            if (nextAllowed > (runAtMs ?? nowMs)) {
              runAtMs = nextAllowed;
              runReason = runReason ? `${runReason}+marketing_daily_cap` : "marketing_daily_cap";
            }
          }
        }
        }
      }

      if (runAtMs != null && runAtMs > nowMs + 1000) {
        metadata.runAt = new Date(runAtMs).toISOString();
        metadata.runReason = runReason;
        metadata.runScheduledAt = now.toISOString();
      }
    }
  }

  if (input.actionType === "SEND_SMS" || input.actionType === "SEND_WHATSAPP") {
    const tenantKey = await getTenantKey(input.tenantId);
    const messagingHealth = getMessagingHealth(tenantKey);
    const channel = input.actionType === "SEND_SMS" ? "sms" : "whatsapp";

    if (!messagingHealth.configured) {
      const message = `Messaging disabled: missing ${messagingHealth.missing.join(", ")}`;
      initialStatus = input.forceApproval ? "REQUIRES_APPROVAL" : "FAILED";
      lifecycleState = input.forceApproval ? "CREATED" : "FAILED";
      initialErrorCode = input.forceApproval ? null : "MISSING_CONFIG";
      initialErrorMessage = input.forceApproval ? null : message;
      metadata.config = { missing: messagingHealth.missing, warnings: messagingHealth.warnings, channel, setupRequiredBeforeApproval: Boolean(input.forceApproval) };
    } else if (channel === "sms" && !messagingHealth.sms.enabled) {
      const message = "SMS disabled: missing TWILIO_SMS_FROM or TWILIO_MESSAGING_SERVICE_SID";
      initialStatus = input.forceApproval ? "REQUIRES_APPROVAL" : "FAILED";
      lifecycleState = input.forceApproval ? "CREATED" : "FAILED";
      initialErrorCode = input.forceApproval ? null : "MISSING_CONFIG";
      initialErrorMessage = input.forceApproval ? null : message;
      metadata.config = { missing: ["TWILIO_SMS_FROM|TWILIO_MESSAGING_SERVICE_SID"], warnings: messagingHealth.warnings, channel, setupRequiredBeforeApproval: Boolean(input.forceApproval) };
    } else if (
      channel === "whatsapp" &&
      !String(messagingHealth.resolved.whatsappFrom || "").trim() &&
      !String(messagingHealth.resolved.messagingServiceSid || "").trim()
    ) {
      const message = "WhatsApp disabled: missing TWILIO_WHATSAPP_FROM or TWILIO_MESSAGING_SERVICE_SID";
      initialStatus = input.forceApproval ? "REQUIRES_APPROVAL" : "FAILED";
      lifecycleState = input.forceApproval ? "CREATED" : "FAILED";
      initialErrorCode = input.forceApproval ? null : "MISSING_CONFIG";
      initialErrorMessage = input.forceApproval ? null : message;
      metadata.config = {
        missing: ["TWILIO_WHATSAPP_FROM|TWILIO_MESSAGING_SERVICE_SID"],
        warnings: messagingHealth.warnings,
        channel,
        setupRequiredBeforeApproval: Boolean(input.forceApproval),
      };
    }
  }

  if (input.actionType === "CREATE_CONTACT") {
    const payloadLooksLikeAgent =
      String((payload as any)?.entityType || (payload as any)?.entity_type || "").toLowerCase() === "agent" ||
      (payload as any)?.runtimeModel != null ||
      (payload as any)?.runtime_model != null ||
      (payload as any)?.department != null;
    if (payloadLooksLikeAgent) {
      throw new Error("WRONG_ENTITY_TYPE: use CREATE_AGENT or BULK_CREATE_AGENTS");
    }
  }

  if (input.actionType === "UPDATE_AGENT_MODEL" && !modelSelectorEnabled) {
    throw new Error("Feature disabled: FEATURE_AGENT_MODEL_SELECTOR");
  }

  const configMetadata = safeRecord(metadata.config);
  const missingConfiguration = Array.isArray(configMetadata.missing)
    ? configMetadata.missing.filter((value) => String(value || "").trim()).length > 0
    : initialErrorCode === "MISSING_CONFIG";
  const outboundCommunicationPolicy = await evaluateOutboundActionPolicy({
    tenantId: input.tenantId,
    tenantKey: await getTenantKey(input.tenantId),
    actionType: input.actionType,
    payload,
    executionRequested: false,
    approvalGranted: false,
    requestedByUserId: input.requestedByUserId,
    requestedByAgentKey,
    externalCommunicationsEnabled: externalCommunicationsEnabled(
      process.env.FEATURE_EXTERNAL_COMMUNICATIONS,
    ),
    providerConfigured: !missingConfiguration,
    channelEnabled: !missingConfiguration,
    senderVerified: true,
    dailyLimit:
      typeof policy.dailyOutboundLimit === "number"
        ? policy.dailyOutboundLimit
        : null,
  });
  if (outboundCommunicationPolicy) {
    metadata.outboundCommunicationPolicy = outboundCommunicationPolicy;
    policy = {
      ...policy,
      outboundCommunication: outboundCommunicationPolicy,
    };
    if (outboundCommunicationPolicy.decision === "BLOCK") {
      initialStatus = "FAILED";
      lifecycleState = "FAILED";
      initialErrorCode = "OUTBOUND_COMMUNICATION_BLOCK";
      initialErrorMessage = `Outbound communication blocked: ${outboundCommunicationPolicy.reasons.join(", ")}`;
    } else if (
      outboundCommunicationPolicy.decision === "REQUIRE_APPROVAL" &&
      initialStatus !== "FAILED"
    ) {
      initialStatus = "REQUIRES_APPROVAL";
      lifecycleState = "CREATED";
      policy = { ...policy, approvalRequired: true };
    }
  }

  if (
    input.forceApproval &&
    outboundCommunicationPolicy?.decision !== "BLOCK"
  ) {
    initialStatus = "REQUIRES_APPROVAL";
    lifecycleState = "CREATED";
    initialErrorCode = null;
    initialErrorMessage = null;
    policy = { ...policy, approvalRequired: true, forcedApproval: true };
  }

  if (initialStatus === "REQUIRES_APPROVAL") {
    lifecycleState = "CREATED";
  } else if (initialStatus === "FAILED") {
    lifecycleState = "FAILED";
  } else {
    lifecycleState = toLifecycleStateFromLegacyStatus(initialStatus);
  }

  const evidenceRequired = actionRequiresEvidence(input.actionType, payload);
  const evidenceStatus = evidenceRequired ? "PENDING" : "NONE";
  if (evidenceRequired && initialStatus === "QUEUED") {
    initialStatus = "PENDING";
    lifecycleState = "CREATED";
  }

  const baseOutcome: ActionOutcome =
    initialStatus === "FAILED"
      ? "FAILED"
      : initialStatus === "REQUIRES_APPROVAL"
        ? "APPROVAL_PENDING"
        : mode === "SIMULATED"
          ? "NO_EFFECT"
          : "APPROVAL_PENDING";

  metadata = isolateActionForDeploymentTenant({
    tenantId: input.tenantId,
    tenantKey: await getTenantKey(input.tenantId),
    deployTenantKey:
      process.env.DEPLOY_TENANT || process.env.TENANT_DEFAULT || null,
    metadata,
  });

  const [row] = await db
    .insert(actionRequests)
    .values({
      tenantId: input.tenantId,
      createdByUserId: input.requestedByUserId,
      requestedByAgentKey,
      requestedByUserId: input.requestedByUserId,
      assignedAgentId,
      actionType: input.actionType,
      payload,
      status: initialStatus,
      lifecycleState: lifecycleState as any,
      mode,
      outcome: baseOutcome,
      evidenceRequired,
      evidenceStatus: evidenceStatus as any,
      attemptCount: 0,
      nextRetryAt: null,
      claimedUntil: null,
      claimedBy: null,
      errorCode: initialErrorCode,
      errorMessage: initialErrorMessage,
      priority,
      idempotencyKey,
      correlationId,
      relatedConversationId,
      relatedThreadId,
      metadata: { ...metadata, policy },
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [actionRequests.tenantId, actionRequests.idempotencyKey],
      set: { updatedAt: now },
    })
    .returning();

  const actionId = Number((row as any)?.id || 0);
  const publicActionId = await ensureActionPublicId({
    tenantId: input.tenantId,
    actionId,
    existingPublicActionId: (row as any)?.publicActionId ?? (row as any)?.public_action_id,
  });

  await logAudit({
    tenantId: input.tenantId,
    userId: input.requestedByUserId,
    action: "action_request.created",
    entityType: "action_request",
    entityId: actionId,
    metadata: {
      actionType: row.actionType,
      status: row.status,
      lifecycleState: (row as any)?.lifecycleState ?? lifecycleState,
      publicActionId,
      policy,
    },
  });

  await appendActionEvent({
    actionId,
    correlationId,
    eventType: "CREATED",
    payload: {
      tenantId: input.tenantId,
      actionType: row.actionType,
      status: row.status,
      lifecycleState: (row as any)?.lifecycleState ?? lifecycleState,
      publicActionId,
      requestedByUserId: input.requestedByUserId,
    },
  });
  if ((row as any)?.lifecycleState === "QUEUED" || lifecycleState === "QUEUED") {
    await appendActionEvent({
      actionId,
      correlationId,
      eventType: "QUEUED",
      payload: {
        reason: initialErrorCode ? "failed_immediately" : "ready_for_runner",
      },
    });
  }
  if (evidenceRequired && ((row as any)?.evidenceStatus === "PENDING" || evidenceStatus === "PENDING")) {
    await appendActionEvent({
      actionId,
      correlationId,
      eventType: "EVIDENCE_PENDING",
      payload: {
        reason: "evidence_required_before_queue",
      },
    });
  }
  if ((row as any)?.lifecycleState === "FAILED" || lifecycleState === "FAILED") {
    await appendActionEvent({
      actionId,
      correlationId,
      eventType: "FAILED",
      payload: {
        errorCode: initialErrorCode || inferActionErrorCode({ message: initialErrorMessage }),
        errorMessage: initialErrorMessage,
      },
    });
  }

  // Defensive normalization for legacy rows where outcome may be null/unknown.
  if (!(row as any)?.outcome) {
    await db
      .update(actionRequests)
      .set({ outcome: normalizeOutcome((row as any)?.outcome), updatedAt: now })
      .where(and(eq(actionRequests.tenantId, input.tenantId), eq(actionRequests.id, Number((row as any)?.id || 0))));
  }
  return {
    ...(row as any),
    publicActionId,
    lifecycleState: (row as any)?.lifecycleState ?? lifecycleState,
    state: (row as any)?.lifecycleState ?? lifecycleState,
  } as any;
}

export async function approveActionRequest(opts: { tenantId: number; actionRequestId: number; approvedByUserId: number }) {
  const now = new Date();
  const current = await db.query.actionRequests.findFirst({
    where: and(
      eq(actionRequests.tenantId, opts.tenantId),
      eq(actionRequests.id, opts.actionRequestId),
    ),
  });
  if (!current) throw new Error("Action request not found");
  if (String(current.status || "").trim().toUpperCase() !== "REQUIRES_APPROVAL") {
    const error = new Error(
      "ACTION_NOT_AWAITING_APPROVAL: only an action in REQUIRES_APPROVAL may be approved.",
    );
    (error as any).code = "ACTION_NOT_AWAITING_APPROVAL";
    (error as any).status = 409;
    throw error;
  }
  const currentPayload = safeRecord(current.payload);
  const currentTenantKey = await getTenantKey(opts.tenantId);
  const currentChannel = outboundChannelForActionType(current.actionType);
  const ownerTestAuthorization =
    currentChannel === "email" ||
    currentChannel === "sms" ||
    currentChannel === "whatsapp"
      ? authorizeExportunityOwnerTest({
          tenantKey: currentTenantKey,
          channel: currentChannel,
          payload: currentPayload,
          recipients: outboundRecipientsForPayload(
            currentChannel,
            currentPayload,
          ),
        })
      : null;
  if (
    isExternalCommunicationAction(current.actionType) &&
    !externalCommunicationsEnabled(process.env.FEATURE_EXTERNAL_COMMUNICATIONS) &&
    !(
      ownerTestAuthorization?.authorized &&
      ownerTestAuthorization.channelEnabled
    )
  ) {
    const error = new Error(
      "EXTERNAL_COMMUNICATIONS_DISABLED: activate FEATURE_EXTERNAL_COMMUNICATIONS only through the approved external-communications runbook.",
    );
    (error as any).status = 409;
    throw error;
  }
  const currentMetadata = safeRecord(current.metadata);
  const currentConfig = safeRecord(currentMetadata.config);
  const missingConfiguration = Array.isArray(currentConfig.missing)
    ? currentConfig.missing.filter((value) => String(value || "").trim()).length > 0
    : false;
  const outboundApprovalPolicy = await evaluateOutboundActionPolicy({
    tenantId: opts.tenantId,
    actionType: String(current.actionType || ""),
    payload: currentPayload,
    executionRequested: true,
    approvalGranted: true,
    requestedByUserId: current.requestedByUserId,
    requestedByAgentKey: current.requestedByAgentKey,
    externalCommunicationsEnabled: externalCommunicationsEnabled(
      process.env.FEATURE_EXTERNAL_COMMUNICATIONS,
    ),
    providerConfigured: !missingConfiguration,
    channelEnabled: !missingConfiguration,
    senderVerified: true,
    evaluatedAt: now,
  });
  if (outboundApprovalPolicy && !outboundApprovalPolicy.mayExecute) {
    throw new OutboundCommunicationPolicyError(outboundApprovalPolicy);
  }
  const existingPolicy = safeRecord(currentMetadata.policy);
  const [row] = await db
    .update(actionRequests)
    .set({
      status: "QUEUED",
      lifecycleState: "QUEUED" as any,
      outcome: "APPROVAL_PENDING",
      approvedByUserId: opts.approvedByUserId,
      approvedAt: now,
      errorCode: null,
      errorMessage: null,
      nextRetryAt: null,
      claimedUntil: null,
      claimedBy: null,
      metadata: outboundApprovalPolicy
        ? {
            ...currentMetadata,
            outboundApprovalPolicy,
            policy: {
              ...existingPolicy,
              outboundCommunication: outboundApprovalPolicy,
            },
          }
        : currentMetadata,
      updatedAt: now,
    })
    .where(
      and(
        eq(actionRequests.tenantId, opts.tenantId),
        eq(actionRequests.id, opts.actionRequestId),
        eq(actionRequests.status, "REQUIRES_APPROVAL" as any),
      ),
    )
    .returning();
  if (!row) {
    const error = new Error(
      "ACTION_APPROVAL_CONFLICT: action state changed before approval was recorded.",
    );
    (error as any).code = "ACTION_APPROVAL_CONFLICT";
    (error as any).status = 409;
    throw error;
  }

  const actionId = Number((row as any)?.id || 0);
  const publicActionId = await ensureActionPublicId({
    tenantId: opts.tenantId,
    actionId,
    existingPublicActionId: (row as any)?.publicActionId ?? (row as any)?.public_action_id,
  });

  await logAudit({
    tenantId: opts.tenantId,
    userId: opts.approvedByUserId,
    action: "action_request.approved",
    entityType: "action_request",
    entityId: actionId,
    metadata: {
      actionType: row.actionType,
      publicActionId,
      outboundDecision: outboundApprovalPolicy?.decision ?? null,
      outboundReasons: outboundApprovalPolicy?.reasons ?? [],
    },
  });
  await appendActionEvent({
    actionId,
    correlationId: (row as any)?.correlationId ?? (row as any)?.correlation_id ?? null,
    eventType: "QUEUED",
    payload: {
      approvedByUserId: opts.approvedByUserId,
      publicActionId,
      outboundDecision: outboundApprovalPolicy?.decision ?? null,
      outboundPolicyVersion: outboundApprovalPolicy?.policyVersion ?? null,
    },
  });
  return row;
}

export async function denyActionRequest(opts: { tenantId: number; actionRequestId: number; deniedByUserId: number }) {
  const now = new Date();
  const [row] = await db
    .update(actionRequests)
    .set({
      status: "DENIED",
      lifecycleState: "CANCELED" as any,
      outcome: "FAILED",
      finishedAt: now,
      approvedByUserId: opts.deniedByUserId,
      approvedAt: now,
      errorCode: "DENIED",
      errorMessage: "Action denied by admin",
      claimedUntil: null,
      claimedBy: null,
      updatedAt: now,
    })
    .where(and(eq(actionRequests.tenantId, opts.tenantId), eq(actionRequests.id, opts.actionRequestId)))
    .returning();
  if (!row) throw new Error("Action request not found");

  const actionId = Number((row as any)?.id || 0);
  const publicActionId = await ensureActionPublicId({
    tenantId: opts.tenantId,
    actionId,
    existingPublicActionId: (row as any)?.publicActionId ?? (row as any)?.public_action_id,
  });

  await logAudit({
    tenantId: opts.tenantId,
    userId: opts.deniedByUserId,
    action: "action_request.denied",
    entityType: "action_request",
    entityId: actionId,
    metadata: { actionType: row.actionType, publicActionId },
  });
  await appendActionEvent({
    actionId,
    correlationId: (row as any)?.correlationId ?? (row as any)?.correlation_id ?? null,
    eventType: "CANCELED",
    payload: { deniedByUserId: opts.deniedByUserId, publicActionId },
  });
  return row;
}
