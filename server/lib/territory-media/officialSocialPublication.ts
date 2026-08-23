import crypto from "node:crypto";

import { db } from "@db";
import {
  auditLogs,
  exportunityIntegrationConnections,
  mediaRightsEvents,
  socialPublicationAttempts,
  socialPublicationEvents,
  socialPublicationTargets,
} from "@db/schema";
import { and, eq, sql } from "drizzle-orm";

import {
  completeRunFailure,
  completeRunSuccess,
  createActionRun,
} from "../actions/actionRuns";
import { getMediaRightsState } from "./mediaRights";
import {
  createMetaGraphTransport,
  MetaGraphRequestError,
  MetaSocialPublishingAdapter,
  META_SOCIAL_PUBLICATION_ADAPTER_VERSION,
  META_SOCIAL_PUBLICATION_FEATURE_FLAG,
  metaSocialPublicationFeatureStatus,
  normalizeMetaApprovedPublicationPackage,
  type MetaGraphTransport,
  type MetaPublicationExecutionResult,
  type MetaSocialPublicationPlatform,
} from "./metaSocialPublishingAdapter";
import {
  buildOfficialPublicationPackage,
  deriveConnectionReadiness,
  normalizeSocialPlatform,
  REQUIRED_SOCIAL_SCOPES,
} from "./socialPublicationPolicy";
import { accessTokenForProviderConnection } from "./socialTargetDiscovery";

type JsonRecord = Record<string, unknown>;
type Target = typeof socialPublicationTargets.$inferSelect;
type Attempt = typeof socialPublicationAttempts.$inferSelect;

const PROVIDER_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function requireIdempotencyKey(value: unknown) {
  const key = asText(value);
  if (key.length < 8 || key.length > 180) {
    throw new Error("idempotencyKey must contain 8 to 180 characters");
  }
  return key;
}

function requestChecksum(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hasCredentialMaterial(value: unknown, key = ""): boolean {
  if (/(?:access|refresh|auth)?[_-]?token|secret|password|authorization|cookie|private[_-]?key/i.test(key)) {
    return true;
  }
  if (Array.isArray(value)) return value.some((entry) => hasCredentialMaterial(entry));
  if (value && typeof value === "object") {
    return Object.entries(value as JsonRecord).some(([childKey, child]) =>
      hasCredentialMaterial(child, childKey),
    );
  }
  return false;
}

function assertCredentialFree(value: unknown, label: string) {
  if (hasCredentialMaterial(value)) {
    throw new Error(`${label} failed credential-exclusion policy`);
  }
}

function safeError(error: unknown) {
  if (error instanceof MetaGraphRequestError) {
    return {
      code: error.code,
      message: error.message.slice(0, 500),
      outcomeAmbiguous: error.outcomeAmbiguous,
      evidence: error.evidence,
    };
  }
  const raw = asText((error as any)?.message || error || "Official Meta publication failed");
  const message = raw
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/(?:access|refresh|auth)?[_-]?token\s*[=:]\s*[^\s&]+/gi, "token=[redacted]")
    .slice(0, 500);
  return {
    code: "OFFICIAL_SOCIAL_PUBLICATION_FAILED",
    message,
    outcomeAmbiguous: false,
    evidence: {
      credentialsExcluded: true,
      automaticRetryAllowed: false,
    },
  };
}

function providerMutationPerformedForResult(result: MetaPublicationExecutionResult) {
  return asRecord(result.evidence).providerMutationPerformed === true;
}

function withProviderMutationAmbiguity(
  failure: ReturnType<typeof safeError>,
  providerMutationStarted: boolean,
) {
  if (!providerMutationStarted) return failure;
  return {
    ...failure,
    outcomeAmbiguous: true,
    evidence: {
      ...failure.evidence,
      providerMutationStarted: true,
      providerMutationMayHaveOccurred: true,
      automaticRetryAllowed: false,
      credentialsExcluded: true,
    },
  };
}

function observedMetaTransport(onProviderMutationStarted: () => void): MetaGraphTransport {
  const transport = createMetaGraphTransport();
  return async (request) => {
    if (request.method === "POST") onProviderMutationStarted();
    return transport(request);
  };
}

function freshEnough(value: Date | string | null | undefined, now = Date.now()) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp >= now - PROVIDER_EVIDENCE_MAX_AGE_MS;
}

function providerParentAccountId(target: Target) {
  const value = asText(asRecord(target.verificationEvidence).parentAccountId);
  return value || null;
}

function requireMetaPlatform(value: unknown) {
  const platform = normalizeSocialPlatform(value);
  if (platform !== "facebook" && platform !== "instagram") {
    throw new Error("Official provider publication currently supports Facebook and Instagram only");
  }
  return platform as MetaSocialPublicationPlatform;
}

export class OfficialSocialPublicationBlockedError extends Error {
  readonly code = "OFFICIAL_SOCIAL_PUBLICATION_BLOCKED";
  readonly blockers: string[];

  constructor(blockers: string[]) {
    const unique = Array.from(new Set(blockers.map(asText).filter(Boolean)));
    super("Official social publication is blocked by release, rights, authorization, target, or evidence requirements");
    this.name = "OfficialSocialPublicationBlockedError";
    this.blockers = unique;
  }
}

async function loadProviderContext(input: {
  tenantId: number;
  mediaItemId: string;
  platform: MetaSocialPublicationPlatform;
  integrationConnectionId: string;
  targetId: number;
  territoryId?: number | null;
  expectedRightsGrantId?: number | null;
}) {
  const feature = metaSocialPublicationFeatureStatus();
  const blockers: string[] = [];
  if (!feature.enabled) blockers.push(`release_flag_required:${META_SOCIAL_PUBLICATION_FEATURE_FLAG}`);
  if (!feature.configured) blockers.push("provider_application_configuration_required");

  const [connection, target, rights] = await Promise.all([
    db.query.exportunityIntegrationConnections.findFirst({
      where: and(
        eq(exportunityIntegrationConnections.tenantId, input.tenantId),
        eq(exportunityIntegrationConnections.id, input.integrationConnectionId),
      ),
    }),
    db.query.socialPublicationTargets.findFirst({
      where: and(
        eq(socialPublicationTargets.tenantId, input.tenantId),
        eq(socialPublicationTargets.id, input.targetId),
      ),
    }),
    getMediaRightsState({
      tenantId: input.tenantId,
      mediaItemId: input.mediaItemId,
      usageType: "organic_publication",
      channel: input.platform,
      territoryId: input.territoryId || null,
    }),
  ]);

  if (!connection) blockers.push("account_authorization_required");
  if (!target) blockers.push("business_publication_target_verification_required");
  if (connection) {
    if (connection.provider !== "meta" || connection.integrationId !== "meta_business") {
      blockers.push("integration_connection_platform_mismatch");
    }
    if (!freshEnough(connection.lastVerifiedAt)) blockers.push("connection_permission_evidence_stale");
  }
  if (target) {
    if (target.provider !== "meta" || target.platform !== input.platform) {
      blockers.push("publication_target_platform_mismatch");
    }
    if (
      target.exportunityIntegrationConnectionId !==
      input.integrationConnectionId
    ) {
      blockers.push("publication_target_connection_mismatch");
    }
    if (!freshEnough(target.lastVerifiedAt)) blockers.push("publication_target_evidence_stale");
    if (asRecord(target.verificationEvidence).credentialsExcluded !== true) {
      blockers.push("publication_target_credential_exclusion_evidence_required");
    }
  }
  if (connection && target) {
    const readiness = deriveConnectionReadiness({
      configured: feature.configured,
      connection,
      requiredScopes: REQUIRED_SOCIAL_SCOPES[input.platform],
      target,
      adapterAvailable: feature.enabled && feature.configured,
    });
    blockers.push(...readiness.blockers);
  }

  if (!rights.eligibility.eligible) blockers.push(...rights.eligibility.blockers);
  if (!rights.sourceReference) blockers.push("source_reference_required");
  if (!rights.eligibility.grantId) blockers.push("active_rights_grant_required");
  if (rights.item.status !== "reviewed" && rights.item.status !== "published") {
    blockers.push("content_review_required");
  }
  if (
    input.expectedRightsGrantId &&
    Number(rights.eligibility.grantId || 0) !== input.expectedRightsGrantId
  ) {
    blockers.push("original_rights_grant_is_no_longer_current");
  }

  if (blockers.length || !connection || !target || !rights.sourceReference || !rights.eligibility.grantId) {
    throw new OfficialSocialPublicationBlockedError(blockers);
  }

  const rightsGrant = rights.grants.find((grant) => grant.id === Number(rights.eligibility.grantId));
  if (!rightsGrant) {
    throw new OfficialSocialPublicationBlockedError(["active_rights_grant_required"]);
  }
  return {
    feature,
    connection,
    target,
    rights,
    rightsGrant,
    sourceReferenceId: Number(rights.sourceReference.id),
    rightsGrantId: Number(rights.eligibility.grantId),
  };
}

function buildPublication(input: {
  context: Awaited<ReturnType<typeof loadProviderContext>>;
  tenantId: number;
  mediaItemId: string;
  platform: MetaSocialPublicationPlatform;
  channel: string;
  idempotencyKey: string;
  package?: JsonRecord;
}) {
  const item = input.context.rights.item;
  const packageInput = asRecord(input.package);
  const assetUrl = asText(
    packageInput.assetUrl ||
    item.mediaEmbedUrl ||
    item.thumbnailRemoteUrl ||
    item.canonicalUrl ||
    item.url,
  );
  const destinationLink = asText(packageInput.destinationLink || item.canonicalUrl || item.url);
  const trackingCode = `exp_${crypto
    .createHash("sha256")
    .update(`${input.tenantId}:${input.mediaItemId}:${input.idempotencyKey}`)
    .digest("hex")
    .slice(0, 16)}`;
  const publication = buildOfficialPublicationPackage({
    platform: input.platform,
    channel: input.channel,
    title: asText(packageInput.title || item.title),
    caption: asText(packageInput.caption || item.summaryParagraph || item.excerpt || item.title),
    hashtags: packageInput.hashtags || item.tags || [],
    altText: asText(packageInput.altText || item.excerpt || item.title),
    assetUrl,
    assetType: asText(packageInput.assetType || item.type || "unspecified"),
    thumbnailUrl: asText(packageInput.thumbnailUrl || item.thumbnailRemoteUrl),
    destinationLink,
    trackingCode,
    attributionText: input.context.rightsGrant.attributionText,
  });
  return normalizeMetaApprovedPublicationPackage(publication);
}

async function loadCompatibleAttempt(input: {
  tenantId: number;
  mediaItemId: string;
  idempotencyKey: string;
  platform: MetaSocialPublicationPlatform;
  channel: string;
  integrationConnectionId: string;
  targetId: number;
  territoryId?: number | null;
  package?: JsonRecord;
}) {
  const existing = await db.query.socialPublicationAttempts.findFirst({
    where: and(
      eq(socialPublicationAttempts.tenantId, input.tenantId),
      eq(socialPublicationAttempts.idempotencyKey, input.idempotencyKey),
    ),
  });
  if (!existing) return null;
  if (
    existing.mediaItemId !== input.mediaItemId ||
    existing.platform !== input.platform ||
    existing.channel !== input.channel ||
    existing.mode !== "official_api" ||
    existing.exportunityIntegrationConnectionId !== input.integrationConnectionId ||
    existing.targetId !== input.targetId ||
    (existing.territoryId || null) !== (input.territoryId || null)
  ) {
    throw new Error("idempotencyKey is already bound to another publication request");
  }
  const requested = asRecord(input.package);
  const stored = asRecord(existing.manualPackage);
  const storedAsset = asRecord(stored.finalAsset);
  const comparable: Array<[unknown, unknown, string]> = [
    [requested.title, stored.title, "title"],
    [requested.caption, stored.caption, "caption"],
    [requested.altText, stored.altText, "altText"],
    [requested.assetUrl, storedAsset.url, "assetUrl"],
    [requested.assetType, storedAsset.type, "assetType"],
    [requested.thumbnailUrl, stored.thumbnail, "thumbnailUrl"],
    [requested.destinationLink, stored.destinationLink, "destinationLink"],
  ];
  for (const [requestedValue, storedValue, field] of comparable) {
    if (requestedValue !== undefined && requestedValue !== null && asText(requestedValue) !== asText(storedValue)) {
      throw new Error(`idempotencyKey replay changed the bound ${field}`);
    }
  }
  if (Array.isArray(requested.hashtags)) {
    const normalizedRequested = requested.hashtags
      .map((entry) => asText(entry).replace(/^#+/, "").replace(/\s+/g, ""))
      .filter(Boolean);
    const normalizedStored = Array.isArray(stored.hashtags)
      ? stored.hashtags
          .map((entry) => asText(entry).replace(/^#+/, "").replace(/\s+/g, ""))
          .filter(Boolean)
      : [];
    if (JSON.stringify(normalizedRequested) !== JSON.stringify(normalizedStored)) {
      throw new Error("idempotencyKey replay changed the bound hashtags");
    }
  }
  return existing;
}

async function persistProviderResult(input: {
  attempt: Attempt;
  actorUserId: number;
  actionRunId: number;
  result: MetaPublicationExecutionResult;
}) {
  assertCredentialFree(input.result.evidence, "Meta provider receipt");
  const now = new Date();
  const providerConfirmedAt = input.result.providerConfirmedAt
    ? new Date(input.result.providerConfirmedAt)
    : null;
  const publishedAt = input.result.providerPublishedAt
    ? new Date(input.result.providerPublishedAt)
    : null;
  if (
    input.result.status === "PUBLISHED" &&
    (!providerConfirmedAt || !publishedAt || !Number.isFinite(providerConfirmedAt.getTime()) || !Number.isFinite(publishedAt.getTime()))
  ) {
    throw new Error("Provider-confirmed publication requires valid confirmation and publication timestamps");
  }
  const operationProviderMutationPerformed = providerMutationPerformedForResult(input.result);
  const providerMutationPerformed =
    asRecord(input.attempt.providerState).providerMutationPerformed === true ||
    operationProviderMutationPerformed;
  const providerState = {
    ...asRecord(input.attempt.providerState),
    adapter: META_SOCIAL_PUBLICATION_ADAPTER_VERSION,
    executionPhase: input.result.status === "PUBLISHED" ? "provider_confirmed" : "provider_processing",
    providerObjectId: input.result.providerObjectId,
    providerContainerId: input.result.providerContainerId,
    providerUrl: input.result.providerUrl,
    receipt: input.result.evidence,
    providerMutationPerformed,
    operationProviderMutationPerformed,
    externalPublicationPerformed: input.result.status === "PUBLISHED",
    providerConfirmationVerified: input.result.status === "PUBLISHED",
    automaticRetryStarted: false,
    credentialsExcluded: true,
    updatedAt: now.toISOString(),
  };
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(socialPublicationAttempts)
      .set({
        status: input.result.status,
        providerState,
        providerConfirmedAt,
        publishedAt,
        errorCode: null,
        errorMessage: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(socialPublicationAttempts.tenantId, input.attempt.tenantId),
          eq(socialPublicationAttempts.id, input.attempt.id),
        ),
      )
      .returning();
    await tx.insert(socialPublicationEvents).values({
      tenantId: input.attempt.tenantId,
      attemptId: input.attempt.id,
      eventType: input.result.status === "PUBLISHED"
        ? "content.provider_publication_confirmed"
        : "content.provider_publication_processing",
      status: input.result.status,
      actorUserId: input.actorUserId,
      payload: {
        actionRunId: input.actionRunId,
        providerObjectId: input.result.providerObjectId,
        providerContainerId: input.result.providerContainerId,
        providerUrl: input.result.providerUrl,
        providerConfirmationVerified: input.result.status === "PUBLISHED",
        providerMutationPerformed: operationProviderMutationPerformed,
        externalPublicationPerformed: input.result.status === "PUBLISHED",
        automaticRetryStarted: false,
        credentialsExcluded: true,
      },
      createdAt: now,
    });
    if (input.result.status === "PUBLISHED") {
      await tx.insert(mediaRightsEvents).values({
        tenantId: input.attempt.tenantId,
        sourceReferenceId: input.attempt.sourceReferenceId,
        grantId: input.attempt.rightsGrantId,
        eventType: "content.provider_publication_confirmed",
        actorUserId: input.actorUserId,
        payload: {
          attemptId: input.attempt.id,
          platform: input.attempt.platform,
          providerObjectId: input.result.providerObjectId,
          providerUrl: input.result.providerUrl,
          providerConfirmationVerified: true,
          credentialsExcluded: true,
        },
        createdAt: now,
      });
    }
    await tx.insert(auditLogs).values({
      tenantId: input.attempt.tenantId,
      userId: input.actorUserId,
      userRole: "admin",
      action: input.result.status === "PUBLISHED"
        ? "content.provider_publication_confirmed"
        : "content.provider_publication_processing",
      entityType: "social_publication_attempt",
      entityId: null,
      metadata: {
        attemptId: input.attempt.id,
        actionRunId: input.actionRunId,
        platform: input.attempt.platform,
        status: input.result.status,
        providerMutationPerformed: operationProviderMutationPerformed,
        externalPublicationPerformed: input.result.status === "PUBLISHED",
        credentialsExcluded: true,
      },
      createdAt: now,
    });
    return updated;
  });
}

async function persistFailure(input: {
  attempt: Attempt;
  actorUserId: number;
  actionRunId: number;
  failure: ReturnType<typeof safeError>;
}) {
  assertCredentialFree(input.failure.evidence, "Meta provider failure evidence");
  const now = new Date();
  const providerState = {
    ...asRecord(input.attempt.providerState),
    executionPhase: "provider_failed",
    failure: input.failure.evidence,
    outcomeAmbiguous: input.failure.outcomeAmbiguous,
    providerMutationMayHaveOccurred: input.failure.outcomeAmbiguous,
    automaticRetryAllowed: false,
    credentialsExcluded: true,
    updatedAt: now.toISOString(),
  };
  await db.transaction(async (tx) => {
    await tx
      .update(socialPublicationAttempts)
      .set({
        status: "FAILED",
        providerState,
        errorCode: input.failure.code,
        errorMessage: input.failure.message,
        updatedAt: now,
      })
      .where(
        and(
          eq(socialPublicationAttempts.tenantId, input.attempt.tenantId),
          eq(socialPublicationAttempts.id, input.attempt.id),
        ),
      );
    await tx.insert(socialPublicationEvents).values({
      tenantId: input.attempt.tenantId,
      attemptId: input.attempt.id,
      eventType: "content.provider_publication_failed",
      status: "FAILED",
      actorUserId: input.actorUserId,
      payload: {
        actionRunId: input.actionRunId,
        errorCode: input.failure.code,
        outcomeAmbiguous: input.failure.outcomeAmbiguous,
        providerMutationMayHaveOccurred: input.failure.outcomeAmbiguous,
        automaticRetryAllowed: false,
        credentialsExcluded: true,
      },
      createdAt: now,
    });
    await tx.insert(auditLogs).values({
      tenantId: input.attempt.tenantId,
      userId: input.actorUserId,
      userRole: "admin",
      action: "content.provider_publication_failed",
      entityType: "social_publication_attempt",
      entityId: null,
      metadata: {
        attemptId: input.attempt.id,
        actionRunId: input.actionRunId,
        platform: input.attempt.platform,
        outcomeAmbiguous: input.failure.outcomeAmbiguous,
        automaticRetryAllowed: false,
        credentialsExcluded: true,
      },
      createdAt: now,
    });
  });
}

async function completeProviderAction(input: {
  tenantId: number;
  actionRunId: number;
  attempt: Attempt;
  result: MetaPublicationExecutionResult;
}) {
  const providerMutationPerformed = providerMutationPerformedForResult(input.result);
  await completeRunSuccess({
    tenantId: input.tenantId,
    runId: input.actionRunId,
    enforceEvidence: true,
    result: {
      attemptId: input.attempt.id,
      status: input.result.status,
      providerMutationPerformed,
      externalPublicationPerformed: input.result.status === "PUBLISHED",
      automaticRetryStarted: false,
      credentialsExposed: false,
    },
    evidence: [{
      evidenceType: "META_SOCIAL_PUBLICATION_RECEIPT",
      payload: {
        attemptId: input.attempt.id,
        status: input.result.status,
        providerObjectId: input.result.providerObjectId,
        providerContainerId: input.result.providerContainerId,
        providerUrl: input.result.providerUrl,
        providerConfirmedAt: input.result.providerConfirmedAt,
        providerPublishedAt: input.result.providerPublishedAt,
        receipt: input.result.evidence,
        providerMutationPerformed,
        credentialsExcluded: true,
      },
    }],
  });
}

async function finalizeProviderActionPreservingProviderTruth(input: {
  tenantId: number;
  actionRunId: number;
  attempt: Attempt;
  result: MetaPublicationExecutionResult;
}) {
  try {
    await completeProviderAction(input);
    return { actionEvidenceFinalized: true, actionEvidenceWarning: null };
  } catch (error) {
    const warning = safeError(error).message;
    await completeRunFailure({
      tenantId: input.tenantId,
      runId: input.actionRunId,
      error: `Provider truth was persisted, but Action evidence finalization failed: ${warning}`,
      result: {
        attemptId: input.attempt.id,
        status: input.result.status,
        providerTruthPersisted: true,
        providerMutationPerformed: providerMutationPerformedForResult(input.result),
        externalPublicationPerformed: input.result.status === "PUBLISHED",
        credentialsExposed: false,
      },
    }).catch(() => undefined);
    return { actionEvidenceFinalized: false, actionEvidenceWarning: warning };
  }
}

async function claimInstagramContinuation(input: {
  tenantId: number;
  mediaItemId: string;
  attemptId: string;
  actorUserId: number;
  actionRunId: number;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${input.tenantId}:${input.attemptId}:instagram-continuation`}))`,
    );
    const now = new Date();
    const [claimed] = await tx
      .update(socialPublicationAttempts)
      .set({ status: "UPLOADING", updatedAt: now })
      .where(
        and(
          eq(socialPublicationAttempts.tenantId, input.tenantId),
          eq(socialPublicationAttempts.id, input.attemptId),
          eq(socialPublicationAttempts.mediaItemId, input.mediaItemId),
          eq(socialPublicationAttempts.mode, "official_api"),
          eq(socialPublicationAttempts.platform, "instagram"),
          eq(socialPublicationAttempts.status, "PROCESSING"),
        ),
      )
      .returning();
    if (!claimed) {
      throw new Error("This Instagram continuation is already running or is no longer PROCESSING");
    }
    await tx.insert(socialPublicationEvents).values({
      tenantId: input.tenantId,
      attemptId: claimed.id,
      eventType: "content.provider_publication_continuation_started",
      status: "UPLOADING",
      actorUserId: input.actorUserId,
      payload: {
        actionRunId: input.actionRunId,
        providerMutationPerformed: false,
        externalPublicationPerformed: false,
        automaticRetryStarted: false,
        credentialsExcluded: true,
      },
      createdAt: now,
    });
    return claimed;
  });
}

export async function executeOfficialSocialPublication(input: {
  tenantId: number;
  mediaItemId: string;
  actorUserId: number | null;
  platform: unknown;
  channel?: string | null;
  territoryId?: number | null;
  integrationConnectionId: string;
  targetId: number;
  idempotencyKey: unknown;
  confirmed: boolean;
  package?: JsonRecord;
}) {
  if (input.confirmed !== true || !input.actorUserId) {
    throw new Error("Action-time administrator confirmation is required before external publication");
  }
  const platform = requireMetaPlatform(input.platform);
  const channel = asText(input.channel || platform).toLowerCase();
  if (channel !== platform) throw new Error("Official publication channel must match the selected platform");
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const connectionId = asText(input.integrationConnectionId);
  const targetId = Number(input.targetId);
  if (!connectionId) throw new Error("integrationConnectionId is required");
  if (!Number.isInteger(targetId) || targetId <= 0) throw new Error("targetId is required");

  const replay = await loadCompatibleAttempt({
    tenantId: input.tenantId,
    mediaItemId: input.mediaItemId,
    idempotencyKey,
    platform,
    channel,
    integrationConnectionId: connectionId,
    targetId,
    territoryId: input.territoryId || null,
    package: input.package,
  });
  if (replay) {
    if (replay.status === "PUBLISHED" || replay.status === "PROCESSING") {
      return {
        idempotentReplay: true,
        attempt: replay,
        providerMutationPerformed: false,
        externalPublicationPerformed: replay.status === "PUBLISHED",
        explicitForegroundContinuationRequired: replay.status === "PROCESSING",
        credentialsExposed: false,
      };
    }
    throw new Error(
      "This official publication key already has a non-replayable outcome; inspect the provider and ledger before any new attempt",
    );
  }

  const context = await loadProviderContext({
    tenantId: input.tenantId,
    mediaItemId: input.mediaItemId,
    platform,
    integrationConnectionId: connectionId,
    targetId,
    territoryId: input.territoryId || null,
  });
  const publication = buildPublication({
    context,
    tenantId: input.tenantId,
    mediaItemId: input.mediaItemId,
    platform,
    channel,
    idempotencyKey,
    package: input.package,
  });
  const checksum = requestChecksum(publication);
  const actionRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "SOCIAL_PUBLICATION_EXECUTE",
    requestedByUserId: input.actorUserId,
    correlationId: `media:${input.mediaItemId}:official-social:${platform}:${idempotencyKey}`,
    payload: {
      mediaItemId: input.mediaItemId,
      platform,
      channel,
      targetId,
      integrationConnectionId: connectionId,
      requestChecksum: checksum,
      confirmed: true,
    },
  });

  let attempt: Attempt | null = null;
  let providerMutationStarted = false;
  try {
    attempt = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${input.tenantId}:${idempotencyKey}:official-social-publication`}))`,
      );
      const [existing] = await tx
        .select()
        .from(socialPublicationAttempts)
        .where(
          and(
            eq(socialPublicationAttempts.tenantId, input.tenantId),
            eq(socialPublicationAttempts.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (existing) throw new Error("Official publication idempotency key was claimed concurrently");
      const now = new Date();
      const [created] = await tx
        .insert(socialPublicationAttempts)
        .values({
          tenantId: input.tenantId,
          mediaItemId: input.mediaItemId,
          sourceReferenceId: context.sourceReferenceId,
          rightsGrantId: context.rightsGrantId,
          territoryId: input.territoryId || null,
          targetId,
          integrationConnectionId: null,
          exportunityIntegrationConnectionId: connectionId,
          actionRunId: actionRun.id,
          idempotencyKey,
          provider: "meta",
          platform,
          channel,
          mode: "official_api",
          status: "UPLOADING",
          manualPackage: publication,
          providerState: {
            adapter: META_SOCIAL_PUBLICATION_ADAPTER_VERSION,
            executionPhase: "provider_call_started",
            requestChecksum: checksum,
            providerMutationPerformed: false,
            externalPublicationPerformed: false,
            automaticRetryStarted: false,
            credentialsExcluded: true,
            startedAt: now.toISOString(),
          },
          requestedByUserId: input.actorUserId,
          approvedByUserId: input.actorUserId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await tx.insert(socialPublicationEvents).values({
        tenantId: input.tenantId,
        attemptId: created.id,
        eventType: "content.provider_publication_started",
        status: "UPLOADING",
        actorUserId: input.actorUserId,
        payload: {
          actionRunId: actionRun.id,
          requestChecksum: checksum,
          providerMutationPerformed: false,
          externalPublicationPerformed: false,
          automaticRetryStarted: false,
          credentialsExcluded: true,
        },
        createdAt: now,
      });
      return created;
    });

    const userAccessToken = await accessTokenForProviderConnection(context.connection);
    const adapter = new MetaSocialPublishingAdapter(
      observedMetaTransport(() => {
        providerMutationStarted = true;
      }),
      userAccessToken,
      {
        platform,
        externalAccountId: asText(context.target.externalAccountId),
        parentAccountId: providerParentAccountId(context.target),
      },
    );
    const providerResult = await adapter.publishApprovedPackage(publication);
    const persisted = await persistProviderResult({
      attempt,
      actorUserId: input.actorUserId,
      actionRunId: actionRun.id,
      result: providerResult,
    });
    const actionFinalization = await finalizeProviderActionPreservingProviderTruth({
      tenantId: input.tenantId,
      actionRunId: actionRun.id,
      attempt,
      result: providerResult,
    });
    return {
      idempotentReplay: false,
      attempt: persisted,
      providerMutationPerformed: providerMutationPerformedForResult(providerResult),
      externalPublicationPerformed: providerResult.status === "PUBLISHED",
      explicitForegroundContinuationRequired: providerResult.status === "PROCESSING",
      ...actionFinalization,
      credentialsExposed: false,
    };
  } catch (error: any) {
    const failure = withProviderMutationAmbiguity(
      safeError(error),
      providerMutationStarted,
    );
    if (attempt) {
      await persistFailure({
        attempt,
        actorUserId: input.actorUserId,
        actionRunId: actionRun.id,
        failure,
      }).catch(() => undefined);
    }
    await completeRunFailure({
      tenantId: input.tenantId,
      runId: actionRun.id,
      error: failure.message,
      result: {
        providerMutationMayHaveOccurred: failure.outcomeAmbiguous,
        automaticRetryStarted: false,
        credentialsExposed: false,
      },
    }).catch(() => undefined);
    throw error;
  }
}

export async function continueOfficialSocialPublication(input: {
  tenantId: number;
  mediaItemId: string;
  attemptId: string;
  actorUserId: number | null;
  confirmed: boolean;
}) {
  if (input.confirmed !== true || !input.actorUserId) {
    throw new Error("Action-time administrator confirmation is required before continuing external publication");
  }
  const attempt = await db.query.socialPublicationAttempts.findFirst({
    where: and(
      eq(socialPublicationAttempts.tenantId, input.tenantId),
      eq(socialPublicationAttempts.id, input.attemptId),
      eq(socialPublicationAttempts.mediaItemId, input.mediaItemId),
    ),
  });
  if (!attempt) throw new Error("Official publication attempt was not found for this tenant and media item");
  if (attempt.mode !== "official_api" || attempt.platform !== "instagram" || attempt.status !== "PROCESSING") {
    throw new Error("Only a PROCESSING official Instagram attempt can be continued");
  }
  if (!attempt.exportunityIntegrationConnectionId || !attempt.targetId) {
    throw new Error("Processing attempt has no exact provider connection and target binding");
  }
  const providerContainerId = asText(asRecord(attempt.providerState).providerContainerId);
  if (!providerContainerId) throw new Error("Processing attempt has no provider container receipt");
  const context = await loadProviderContext({
    tenantId: input.tenantId,
    mediaItemId: input.mediaItemId,
    platform: "instagram",
    integrationConnectionId: attempt.exportunityIntegrationConnectionId,
    targetId: attempt.targetId,
    territoryId: attempt.territoryId,
    expectedRightsGrantId: attempt.rightsGrantId,
  });
  const actionRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "SOCIAL_PUBLICATION_EXECUTE",
    requestedByUserId: input.actorUserId,
    correlationId: `social-publication:${attempt.id}:continue:${Date.now()}`,
    payload: {
      attemptId: attempt.id,
      operation: "continue_processing_container",
      providerContainerId,
      confirmed: true,
    },
  });
  let claimedAttempt: Attempt | null = null;
  let providerMutationStarted = false;
  try {
    claimedAttempt = await claimInstagramContinuation({
      tenantId: input.tenantId,
      mediaItemId: input.mediaItemId,
      attemptId: attempt.id,
      actorUserId: input.actorUserId,
      actionRunId: actionRun.id,
    });
    const userAccessToken = await accessTokenForProviderConnection(context.connection);
    const adapter = new MetaSocialPublishingAdapter(
      observedMetaTransport(() => {
        providerMutationStarted = true;
      }),
      userAccessToken,
      {
        platform: "instagram",
        externalAccountId: asText(context.target.externalAccountId),
        parentAccountId: providerParentAccountId(context.target),
      },
    );
    const providerResult = await adapter.continueInstagramPublication(providerContainerId);
    const persisted = await persistProviderResult({
      attempt: claimedAttempt,
      actorUserId: input.actorUserId,
      actionRunId: actionRun.id,
      result: providerResult,
    });
    const actionFinalization = await finalizeProviderActionPreservingProviderTruth({
      tenantId: input.tenantId,
      actionRunId: actionRun.id,
      attempt: claimedAttempt,
      result: providerResult,
    });
    return {
      attempt: persisted,
      providerMutationPerformed: providerMutationPerformedForResult(providerResult),
      externalPublicationPerformed: providerResult.status === "PUBLISHED",
      explicitForegroundContinuationRequired: providerResult.status === "PROCESSING",
      automaticRetryStarted: false,
      ...actionFinalization,
      credentialsExposed: false,
    };
  } catch (error: any) {
    const failure = withProviderMutationAmbiguity(
      safeError(error),
      providerMutationStarted,
    );
    if (claimedAttempt) {
      await persistFailure({
        attempt: claimedAttempt,
        actorUserId: input.actorUserId,
        actionRunId: actionRun.id,
        failure,
      }).catch(() => undefined);
    }
    await completeRunFailure({
      tenantId: input.tenantId,
      runId: actionRun.id,
      error: failure.message,
      result: {
        providerMutationMayHaveOccurred: failure.outcomeAmbiguous,
        automaticRetryStarted: false,
        credentialsExposed: false,
      },
    }).catch(() => undefined);
    throw error;
  }
}
