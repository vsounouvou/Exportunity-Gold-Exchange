import { db } from "@db";
import {
  auditLogs,
  exportunityIntegrationConnections,
  metaSocialWebhookReceipts,
  socialPublicationTargets,
} from "@db/schema";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { verifyMetaWebhookSignature } from "../integrations/metaWebhookSecurity";
import { ingestVerifiedSocialInboxEvent, SocialInboxConflictError } from "./socialInbox";
import {
  META_SOCIAL_WEBHOOK_ADAPTER_VERSION,
  metaSocialWebhookFeatureStatus,
  parseMetaSocialWebhookPayload,
  parsedMetaSocialEventFromPayload,
  requiredMetaInboundScopes,
  type ParsedMetaSocialEvent,
} from "./metaSocialWebhookPolicy";

type Receipt = typeof metaSocialWebhookReceipts.$inferSelect;
type JsonRecord = Record<string, unknown>;

const TERMINAL_RECEIPT_STATUSES = new Set([
  "ingested",
  "ignored_outbound",
  "dead_letter",
]);

const RECONCILABLE_RECEIPT_STATUSES = [
  "received",
  "unmatched_target",
  "ambiguous_target",
  "ineligible_target",
  "ingestion_failed",
] as const;

export class MetaSocialWebhookRequestError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly retryable: boolean;

  constructor(message: string, input: { code: string; httpStatus: number; retryable: boolean }) {
    super(message);
    this.name = "MetaSocialWebhookRequestError";
    this.code = input.code;
    this.httpStatus = input.httpStatus;
    this.retryable = input.retryable;
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function normalizedStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function safeErrorMessage(value: unknown) {
  return String(value || "Webhook receipt processing failed").trim().slice(0, 500);
}

function retentionUntil(now: Date) {
  const { retentionDays } = metaSocialWebhookFeatureStatus();
  return new Date(now.getTime() + retentionDays * 24 * 60 * 60_000);
}

async function persistVerifiedCandidates(input: {
  payload: unknown;
  payloadChecksum: string;
  verifiedAt: Date;
}) {
  const parsed = parseMetaSocialWebhookPayload({
    payload: input.payload,
    payloadChecksum: input.payloadChecksum,
    now: input.verifiedAt,
  });
  const expiry = retentionUntil(input.verifiedAt);
  const verificationEvidence = {
    verified: true,
    method: "provider_signature",
    verifiedAt: input.verifiedAt.toISOString(),
    adapter: META_SOCIAL_WEBHOOK_ADAPTER_VERSION,
    algorithm: "HMAC-SHA256",
    signatureHeader: "X-Hub-Signature-256",
    checksum: input.payloadChecksum,
    credentialsExcluded: true,
  };

  return db.transaction(async (tx) => {
    const receipts: Receipt[] = [];
    for (const candidate of parsed.candidates) {
      const terminalAt =
        candidate.initialResolutionStatus === "ignored_outbound"
          ? input.verifiedAt
          : null;
      const [receipt] = await tx
        .insert(metaSocialWebhookReceipts)
        .values({
          receiptKey: candidate.receiptKey,
          payloadChecksum: candidate.payloadChecksum,
          objectType: candidate.objectType,
          platform: candidate.platform,
          externalAccountId: candidate.externalAccountId,
          providerEventId: candidate.providerEventId,
          eventKind: candidate.eventKind,
          parseStatus: candidate.parseStatus,
          resolutionStatus: candidate.initialResolutionStatus,
          reasonCode: candidate.reasonCode,
          sanitizedPayload: candidate.sanitizedPayload,
          verificationEvidence,
          deliveryCount: 1,
          attemptCount: 0,
          receivedAt: new Date(candidate.receivedAt),
          lastReceivedAt: input.verifiedAt,
          retentionUntil: expiry,
          resolvedAt: terminalAt,
          createdAt: input.verifiedAt,
          updatedAt: input.verifiedAt,
        })
        .onConflictDoUpdate({
          target: metaSocialWebhookReceipts.receiptKey,
          set: {
            deliveryCount: sql`${metaSocialWebhookReceipts.deliveryCount} + 1`,
            lastReceivedAt: input.verifiedAt,
            updatedAt: input.verifiedAt,
          },
        })
        .returning();
      if (!receipt) {
        throw new Error("Signed Meta webhook receipt could not be persisted");
      }
      receipts.push(receipt);
    }
    return { parsed, receipts };
  });
}

async function loadMatchingTargets(event: ParsedMetaSocialEvent) {
  return db
    .select({
      targetId: socialPublicationTargets.id,
      tenantId: socialPublicationTargets.tenantId,
      targetProvider: socialPublicationTargets.provider,
      targetPlatform: socialPublicationTargets.platform,
      targetAuthorizationStatus: socialPublicationTargets.authorizationStatus,
      targetHealthStatus: socialPublicationTargets.healthStatus,
      targetLastVerifiedAt: socialPublicationTargets.lastVerifiedAt,
      targetEvidence: socialPublicationTargets.verificationEvidence,
      connectionId: exportunityIntegrationConnections.id,
      connectionTenantId: exportunityIntegrationConnections.tenantId,
      connectionProvider: exportunityIntegrationConnections.provider,
      connectionIntegrationId: exportunityIntegrationConnections.integrationId,
      connectionStatus: exportunityIntegrationConnections.status,
      connectionScopes: exportunityIntegrationConnections.scopes,
      connectionTokenMeta: exportunityIntegrationConnections.tokenMeta,
      connectionExpiresAt: exportunityIntegrationConnections.expiresAt,
      connectionRevokedAt: exportunityIntegrationConnections.revokedAt,
    })
    .from(socialPublicationTargets)
    .leftJoin(
      exportunityIntegrationConnections,
      and(
        eq(
          socialPublicationTargets.exportunityIntegrationConnectionId,
          exportunityIntegrationConnections.id,
        ),
        eq(
          socialPublicationTargets.tenantId,
          exportunityIntegrationConnections.tenantId,
        ),
      ),
    )
    .where(
      and(
        eq(socialPublicationTargets.provider, "meta"),
        eq(socialPublicationTargets.platform, event.platform),
        eq(socialPublicationTargets.externalAccountId, event.externalAccountId),
      ),
    );
}

function targetEligibilityBlockers(
  target: Awaited<ReturnType<typeof loadMatchingTargets>>[number],
  event: ParsedMetaSocialEvent,
  now: Date,
) {
  const blockers: string[] = [];
  const targetEvidence = asRecord(target.targetEvidence);
  const tokenMeta = asRecord(target.connectionTokenMeta);
  const grantedScopes = normalizedStringArray(target.connectionScopes);
  const requiredScopes = requiredMetaInboundScopes(event.channel);

  if (String(target.targetAuthorizationStatus).toLowerCase() !== "authorized") {
    blockers.push("target_authorization_not_authorized");
  }
  if (String(target.targetHealthStatus).toLowerCase() !== "healthy") {
    blockers.push("target_health_not_healthy");
  }
  if (!target.targetLastVerifiedAt) blockers.push("target_verification_timestamp_required");
  if (
    targetEvidence.providerReadPerformed !== true ||
    targetEvidence.credentialsExcluded !== true ||
    !String(targetEvidence.authorityReference || "").trim()
  ) {
    blockers.push("target_business_ownership_evidence_required");
  }
  if (
    !target.connectionId ||
    target.connectionTenantId !== target.tenantId ||
    target.connectionProvider !== "meta" ||
    target.connectionIntegrationId !== "meta_business"
  ) {
    blockers.push("matching_meta_connection_required");
  }
  if (String(target.connectionStatus || "").toLowerCase() !== "connected") {
    blockers.push("meta_connection_not_connected");
  }
  if (target.connectionRevokedAt) blockers.push("meta_connection_revoked");
  if (
    target.connectionExpiresAt &&
    new Date(target.connectionExpiresAt).getTime() <= now.getTime()
  ) {
    blockers.push("meta_connection_expired");
  }
  if (tokenMeta.scopeEvidenceVerified !== true) {
    blockers.push("provider_scope_evidence_required");
  }
  if (tokenMeta.authorizationReady !== true) {
    blockers.push("provider_authorization_not_ready");
  }
  for (const scope of requiredScopes) {
    if (!grantedScopes.includes(scope.toLowerCase())) {
      blockers.push(`permission_required:${scope}`);
    }
  }
  return Array.from(new Set(blockers));
}

async function updateResolution(input: {
  receipt: Receipt;
  status: string;
  reasonCode: string | null;
  tenantId?: number | null;
  targetId?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  terminal?: boolean;
  incrementAttempt?: boolean;
}) {
  const now = new Date();
  const [updated] = await db
    .update(metaSocialWebhookReceipts)
    .set({
      resolutionStatus: input.status,
      reasonCode: input.reasonCode,
      tenantId: input.tenantId === undefined ? input.receipt.tenantId : input.tenantId,
      targetId: input.targetId === undefined ? input.receipt.targetId : input.targetId,
      attemptCount: input.incrementAttempt
        ? sql`${metaSocialWebhookReceipts.attemptCount} + 1`
        : input.receipt.attemptCount,
      lastErrorCode: input.errorCode === undefined ? null : input.errorCode,
      lastErrorMessage: input.errorMessage === undefined ? null : input.errorMessage,
      resolvedAt: input.terminal ? now : null,
      updatedAt: now,
    })
    .where(eq(metaSocialWebhookReceipts.id, input.receipt.id))
    .returning();
  return updated || input.receipt;
}

async function resolveReceipt(receipt: Receipt) {
  if (TERMINAL_RECEIPT_STATUSES.has(receipt.resolutionStatus)) return receipt;
  if (receipt.parseStatus !== "parsed") return receipt;
  const event = parsedMetaSocialEventFromPayload(receipt.sanitizedPayload);
  if (!event) {
    return updateResolution({
      receipt,
      status: "dead_letter",
      reasonCode: "stored_event_invalid",
      errorCode: "stored_event_invalid",
      errorMessage: "The sanitized event no longer satisfies the adapter contract",
      terminal: true,
      incrementAttempt: true,
    });
  }

  const targets = await loadMatchingTargets(event);
  if (!targets.length) {
    return updateResolution({
      receipt,
      status: "unmatched_target",
      reasonCode: "verified_tenant_target_not_found",
      incrementAttempt: true,
    });
  }
  if (targets.length !== 1) {
    return updateResolution({
      receipt,
      status: "ambiguous_target",
      reasonCode: "external_account_matches_multiple_tenants",
      incrementAttempt: true,
    });
  }

  const target = targets[0];
  const blockers = targetEligibilityBlockers(target, event, new Date());
  if (blockers.length) {
    return updateResolution({
      receipt,
      status: "ineligible_target",
      reasonCode: blockers.join("|").slice(0, 1_000),
      tenantId: target.tenantId,
      targetId: target.targetId,
      incrementAttempt: true,
    });
  }

  try {
    await ingestVerifiedSocialInboxEvent({
      tenantId: target.tenantId,
      actorUserId: null,
      targetId: target.targetId,
      provider: "meta",
      platform: event.platform,
      channel: event.channel,
      eventType: event.eventType,
      providerEventId: event.providerEventId,
      externalAccountId: event.externalAccountId,
      externalActorId: event.externalActorId,
      externalActorLabel: event.externalActorLabel,
      externalThreadId: event.externalThreadId,
      parentContentId: event.parentContentId,
      parentContentUrl: event.parentContentUrl,
      body: event.body,
      receivedAt: event.receivedAt,
      verificationEvidence: {
        verified: true,
        method: "provider_signature",
        verifiedAt: new Date().toISOString(),
        businessOwnedAccountConfirmed: true,
        credentialsExcluded: true,
        adapter: META_SOCIAL_WEBHOOK_ADAPTER_VERSION,
        requestId: receipt.receiptKey,
        checksum: receipt.payloadChecksum,
        source: "meta_signed_webhook_receipt",
      },
    });
    return updateResolution({
      receipt,
      status: "ingested",
      reasonCode: "verified_event_ingested",
      tenantId: target.tenantId,
      targetId: target.targetId,
      terminal: true,
      incrementAttempt: true,
    });
  } catch (error: any) {
    const nextAttempt = receipt.attemptCount + 1;
    const conflict = error instanceof SocialInboxConflictError;
    const terminal = conflict || nextAttempt >= 3;
    return updateResolution({
      receipt,
      status: terminal ? "dead_letter" : "ingestion_failed",
      reasonCode: conflict ? "provider_event_conflict" : "inbox_projection_failed",
      tenantId: target.tenantId,
      targetId: target.targetId,
      errorCode: conflict ? error.code : "inbox_projection_failed",
      errorMessage: safeErrorMessage(error?.message),
      terminal,
      incrementAttempt: true,
    });
  }
}

export async function ingestMetaSocialWebhookNotification(input: {
  rawBody: Buffer | Uint8Array | undefined;
  signatureHeader: unknown;
  payload: unknown;
}) {
  const feature = metaSocialWebhookFeatureStatus();
  if (!feature.enabled) {
    throw new MetaSocialWebhookRequestError("Meta social webhook ingestion is disabled", {
      code: "feature_disabled",
      httpStatus: 503,
      retryable: true,
    });
  }
  const verification = verifyMetaWebhookSignature({
    purpose: "social",
    rawBody: input.rawBody,
    signatureHeader: input.signatureHeader,
  });
  if (!verification.ok) {
    const configurationMissing = verification.reason === "signing_secret_not_configured";
    throw new MetaSocialWebhookRequestError(
      configurationMissing
        ? "Meta social webhook signature verification is not configured"
        : "Invalid Meta webhook signature",
      {
        code: verification.reason,
        httpStatus: configurationMissing ? 503 : 401,
        retryable: configurationMissing,
      },
    );
  }

  const verifiedAt = new Date();
  const persisted = await persistVerifiedCandidates({
    payload: input.payload,
    payloadChecksum: verification.payloadChecksum,
    verifiedAt,
  });
  const resolved: Receipt[] = [];
  for (const receipt of persisted.receipts) resolved.push(await resolveReceipt(receipt));
  const statusCounts = resolved.reduce<Record<string, number>>((counts, receipt) => {
    counts[receipt.resolutionStatus] = (counts[receipt.resolutionStatus] || 0) + 1;
    return counts;
  }, {});
  return {
    accepted: true,
    durableReceiptCount: resolved.length,
    statusCounts,
    payloadChecksum: verification.payloadChecksum,
    credentialsExposed: false,
    externalReplyPerformed: false,
    providerMutationPerformed: false,
  };
}

export async function listMetaSocialWebhookReceipts(input: {
  tenantId: number;
  targetId?: number | null;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(200, Number(input.limit || 100)));
  const conditions = [eq(metaSocialWebhookReceipts.tenantId, input.tenantId)];
  if (input.targetId) conditions.push(eq(metaSocialWebhookReceipts.targetId, input.targetId));
  return db
    .select({
      id: metaSocialWebhookReceipts.id,
      targetId: metaSocialWebhookReceipts.targetId,
      platform: metaSocialWebhookReceipts.platform,
      eventKind: metaSocialWebhookReceipts.eventKind,
      parseStatus: metaSocialWebhookReceipts.parseStatus,
      resolutionStatus: metaSocialWebhookReceipts.resolutionStatus,
      reasonCode: metaSocialWebhookReceipts.reasonCode,
      deliveryCount: metaSocialWebhookReceipts.deliveryCount,
      attemptCount: metaSocialWebhookReceipts.attemptCount,
      receivedAt: metaSocialWebhookReceipts.receivedAt,
      lastReceivedAt: metaSocialWebhookReceipts.lastReceivedAt,
      resolvedAt: metaSocialWebhookReceipts.resolvedAt,
      retentionUntil: metaSocialWebhookReceipts.retentionUntil,
      payloadChecksum: metaSocialWebhookReceipts.payloadChecksum,
    })
    .from(metaSocialWebhookReceipts)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .orderBy(desc(metaSocialWebhookReceipts.receivedAt))
    .limit(limit);
}

export async function reconcileMetaSocialWebhookTarget(input: {
  tenantId: number;
  targetId: number;
  actorUserId: number | null;
  confirmed: boolean;
  limit?: number;
}) {
  if (input.confirmed !== true) throw new Error("Accountable reconciliation confirmation is required");
  const target = await db.query.socialPublicationTargets.findFirst({
    where: and(
      eq(socialPublicationTargets.id, input.targetId),
      eq(socialPublicationTargets.tenantId, input.tenantId),
      eq(socialPublicationTargets.provider, "meta"),
    ),
  });
  if (!target || !target.externalAccountId) {
    throw new Error("A tenant-owned Meta target is required");
  }
  const limit = Math.max(1, Math.min(200, Number(input.limit || 100)));
  const receipts = await db
    .select()
    .from(metaSocialWebhookReceipts)
    .where(
      and(
        eq(metaSocialWebhookReceipts.platform, target.platform),
        eq(metaSocialWebhookReceipts.externalAccountId, target.externalAccountId),
        inArray(metaSocialWebhookReceipts.parseStatus, ["parsed"]),
        inArray(metaSocialWebhookReceipts.resolutionStatus, [...RECONCILABLE_RECEIPT_STATUSES]),
        or(
          isNull(metaSocialWebhookReceipts.tenantId),
          eq(metaSocialWebhookReceipts.tenantId, input.tenantId),
        ),
      ),
    )
    .orderBy(metaSocialWebhookReceipts.receivedAt)
    .limit(limit);

  const reconciled: Receipt[] = [];
  for (const receipt of receipts) reconciled.push(await resolveReceipt(receipt));
  const statusCounts = reconciled.reduce<Record<string, number>>((counts, receipt) => {
    counts[receipt.resolutionStatus] = (counts[receipt.resolutionStatus] || 0) + 1;
    return counts;
  }, {});
  await db.insert(auditLogs).values({
    tenantId: input.tenantId,
    userId: input.actorUserId,
    userRole: "admin",
    action: "social.meta_webhook_receipts.reconciled",
    entityType: "social_publication_target",
    entityId: target.id,
    metadata: {
      targetId: target.id,
      platform: target.platform,
      attemptedReceiptCount: reconciled.length,
      statusCounts,
      confirmed: true,
      automaticBackgroundRetry: false,
      externalReplyPerformed: false,
      credentialsExposed: false,
    },
  });
  return {
    targetId: target.id,
    attemptedReceiptCount: reconciled.length,
    statusCounts,
    automaticBackgroundRetry: false,
    externalReplyPerformed: false,
    credentialsExposed: false,
  };
}
