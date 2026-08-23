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
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  completeRunFailure,
  completeRunSuccess,
  createActionRun,
} from "../actions/actionRuns";
import { getMediaRightsState } from "./mediaRights";
import {
  buildManualPublicationPackage,
  deriveConnectionReadiness,
  integrationIdForPlatform,
  normalizeSocialPlatform,
  providerForPlatform,
  publicationStatusForRightsBlockers,
  REQUIRED_SOCIAL_SCOPES,
  SUPPORTED_SOCIAL_PLATFORMS,
  type SocialPlatform,
} from "./socialPublicationPolicy";
import { metaWebhookSecurityStatus } from "../integrations/metaWebhookSecurity";
import { metaSocialWebhookFeatureStatus } from "./metaSocialWebhookPolicy";
import { metaSocialPublicationFeatureStatus } from "./metaSocialPublishingAdapter";

type JsonRecord = Record<string, unknown>;

type SafeConnection = {
  id: string;
  provider: string;
  integrationId: string;
  accountLabel: string | null;
  status: string;
  scopes: string[];
  tokenMeta: Record<string, unknown>;
  expiresAt: Date | null;
  lastVerifiedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type PublicationTarget = typeof socialPublicationTargets.$inferSelect;

const PROVIDER_ENV: Record<string, string[]> = {
  meta: [
    "EXPORTUNITY_META_APP_ID",
    "EXPORTUNITY_META_APP_SECRET",
    "EXPORTUNITY_META_GRAPH_VERSION",
  ],
  google: [
    "EXPORTUNITY_GOOGLE_CLIENT_ID",
    "EXPORTUNITY_GOOGLE_CLIENT_SECRET",
  ],
};

const CONNECT_URLS: Partial<Record<SocialPlatform, string>> = {
  facebook: "/admin/exportunity/integrations",
  instagram: "/admin/exportunity/integrations",
  youtube: "/admin/exportunity/integrations",
};

function isConfigured(names: string[]) {
  return names.every((name) => Boolean(String(process.env[name] || "").trim()));
}

function missingEnv(names: string[]) {
  return names.filter((name) => !String(process.env[name] || "").trim());
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function validateIdempotencyKey(value: unknown) {
  const key = String(value || "").trim();
  if (key.length < 8 || key.length > 180) {
    throw new Error("idempotencyKey must contain 8 to 180 characters");
  }
  return key;
}

function trackingCode(input: { tenantId: number; mediaItemId: string; idempotencyKey: string }) {
  const digest = crypto
    .createHash("sha256")
    .update(`${input.tenantId}:${input.mediaItemId}:${input.idempotencyKey}`)
    .digest("hex")
    .slice(0, 16);
  return `exp_${digest}`;
}

async function loadSafeTenantConnections(tenantId: number) {
  return db
    .select({
      id: exportunityIntegrationConnections.id,
      provider: exportunityIntegrationConnections.provider,
      integrationId: exportunityIntegrationConnections.integrationId,
      accountLabel: exportunityIntegrationConnections.accountLabel,
      status: exportunityIntegrationConnections.status,
      scopes: exportunityIntegrationConnections.scopes,
      tokenMeta: exportunityIntegrationConnections.tokenMeta,
      expiresAt: exportunityIntegrationConnections.expiresAt,
      lastVerifiedAt: exportunityIntegrationConnections.lastVerifiedAt,
      revokedAt: exportunityIntegrationConnections.revokedAt,
      createdAt: exportunityIntegrationConnections.createdAt,
      updatedAt: exportunityIntegrationConnections.updatedAt,
    })
    .from(exportunityIntegrationConnections)
    .where(eq(exportunityIntegrationConnections.tenantId, tenantId))
    .orderBy(desc(exportunityIntegrationConnections.updatedAt));
}

async function loadTargets(tenantId: number) {
  return db
    .select()
    .from(socialPublicationTargets)
    .where(eq(socialPublicationTargets.tenantId, tenantId))
    .orderBy(desc(socialPublicationTargets.updatedAt));
}

function readinessForPlatform(input: {
  platform: SocialPlatform;
  connections: SafeConnection[];
  targets: PublicationTarget[];
  requestedConnectionId?: string | null;
  requestedTargetId?: number | null;
}) {
  const provider = providerForPlatform(input.platform);
  const integrationId = integrationIdForPlatform(input.platform);
  const connection = input.requestedConnectionId
    ? input.connections.find((row) => row.id === input.requestedConnectionId) || null
    : input.connections.find((row) => row.integrationId === integrationId) || null;
  const target = input.requestedTargetId
    ? input.targets.find((row) => row.id === input.requestedTargetId) || null
    : input.targets.find(
        (row) =>
          row.platform === input.platform &&
          (!connection ||
            !row.exportunityIntegrationConnectionId ||
            row.exportunityIntegrationConnectionId === connection.id),
      ) || null;
  const requiredEnv = PROVIDER_ENV[provider] || [];
  const configured = requiredEnv.length > 0 && isConfigured(requiredEnv);
  const metaAdapter = metaSocialPublicationFeatureStatus();
  const adapterAvailable =
    provider === "meta" &&
    (input.platform === "facebook" || input.platform === "instagram") &&
    metaAdapter.enabled &&
    metaAdapter.configured;
  const readiness = deriveConnectionReadiness({
    configured,
    connection,
    requiredScopes: REQUIRED_SOCIAL_SCOPES[input.platform],
    target,
    adapterAvailable,
  });

  return {
    platform: input.platform,
    provider,
    configured,
    missingEnv: missingEnv(requiredEnv),
    connectUrl: configured ? CONNECT_URLS[input.platform] || null : null,
    connection: connection
      ? {
          id: connection.id,
          integrationId: connection.integrationId,
          provider: connection.provider,
          accountLabel: connection.accountLabel,
          status: connection.status,
          scopes: connection.scopes,
          requestedScopes: Array.isArray(connection.tokenMeta?.requestedScopes)
            ? connection.tokenMeta.requestedScopes
            : [],
          missingScopes: Array.isArray(connection.tokenMeta?.missingScopes)
            ? connection.tokenMeta.missingScopes
            : [],
          declinedScopes: Array.isArray(connection.tokenMeta?.declinedScopes)
            ? connection.tokenMeta.declinedScopes
            : [],
          scopeEvidenceSource: String(
            connection.tokenMeta?.scopeEvidenceSource || "provider_scope_unavailable",
          ),
          scopeEvidenceVerified: connection.tokenMeta?.scopeEvidenceVerified === true,
          expiresAt: connection.expiresAt,
          lastVerifiedAt: connection.lastVerifiedAt,
          revokedAt: connection.revokedAt,
        }
      : null,
    target: target
      ? {
          id: target.id,
          platform: target.platform,
          channel: target.channel,
          externalAccountId: target.externalAccountId,
          externalAccountLabel: target.externalAccountLabel,
          authorizationStatus: target.authorizationStatus,
          healthStatus: target.healthStatus,
          capabilities: target.capabilities,
          permissions: target.permissions,
          lastVerifiedAt: target.lastVerifiedAt,
        }
      : null,
    requiredScopes: REQUIRED_SOCIAL_SCOPES[input.platform],
    adapterAvailable,
    adapter: provider === "meta" ? metaAdapter : null,
    ...readiness,
  };
}

export async function getSocialPublicationReadiness(input: {
  tenantId: number;
}) {
  const [connections, targets] = await Promise.all([
    loadSafeTenantConnections(input.tenantId),
    loadTargets(input.tenantId),
  ]);
  const platforms = SUPPORTED_SOCIAL_PLATFORMS.map((platform) =>
    readinessForPlatform({ platform, connections, targets }),
  );
  const twilioRequired = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM"];
  const twilioConfigured = isConfigured(twilioRequired);
  const metaSocialSecurity = metaWebhookSecurityStatus("social");
  const metaSocialFeature = metaSocialWebhookFeatureStatus();
  const metaPublicationAdapter = metaSocialPublicationFeatureStatus();

  return {
    platforms,
    webhooks: {
      metaSocial: {
        ...metaSocialSecurity,
        ...metaSocialFeature,
        sourceImplemented: true,
        releaseReady: metaSocialFeature.enabled && metaSocialSecurity.verificationReady,
        migrationApplied: "UNKNOWN_REQUIRES_PRODUCTION_ACCESS",
      },
      metaWhatsApp: metaWebhookSecurityStatus("whatsapp"),
      inboundMutationPerformed: false,
    },
    publicationAdapters: {
      meta: metaPublicationAdapter,
      providerMutationPerformed: false,
      externalPublicationPerformed: false,
    },
    communications: {
      twilio: {
        provider: "twilio",
        configured: twilioConfigured,
        liveVerified: false,
        status: twilioConfigured ? "CONFIGURED_UNVERIFIED" : "SETUP_REQUIRED",
        missingEnv: missingEnv(twilioRequired),
        capabilities: {
          whatsapp: Boolean(String(process.env.TWILIO_WHATSAPP_FROM || "").trim()),
          sms: Boolean(
            String(process.env.TWILIO_SMS_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID || "").trim(),
          ),
          voice: Boolean(String(process.env.TWILIO_VOICE_FROM || "").trim()),
        },
        note: "Twilio is the governed messaging/voice rail, not a social-publication success signal.",
      },
    },
    credentialStorage: "exportunity_integration_connections",
    credentialsNamespace: "EXPORTUNITY_",
    credentialsExposed: false,
    externalActionPerformed: false,
  };
}

export class SocialPublicationBlockedError extends Error {
  readonly code = "SOCIAL_PUBLICATION_BLOCKED";
  readonly publicationStatus: string;
  readonly blockers: string[];

  constructor(blockers: string[]) {
    super("Social publication package is blocked by rights, consent, facts, or source restrictions");
    this.name = "SocialPublicationBlockedError";
    this.blockers = blockers;
    this.publicationStatus = publicationStatusForRightsBlockers(blockers);
  }
}

async function assertCompatibleReplay(input: {
  tenantId: number;
  mediaItemId: string;
  idempotencyKey: string;
  platform: SocialPlatform;
  channel: string;
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
    existing.channel !== input.channel
  ) {
    throw new Error("idempotencyKey is already bound to another publication request");
  }
  return existing;
}

export async function listSocialPublicationAttempts(input: {
  tenantId: number;
  mediaItemId: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(100, Number(input.limit || 30)));
  const attempts = await db
    .select()
    .from(socialPublicationAttempts)
    .where(
      and(
        eq(socialPublicationAttempts.tenantId, input.tenantId),
        eq(socialPublicationAttempts.mediaItemId, input.mediaItemId),
      ),
    )
    .orderBy(desc(socialPublicationAttempts.createdAt))
    .limit(limit);
  if (!attempts.length) return [];
  const events = await db
    .select()
    .from(socialPublicationEvents)
    .where(
      and(
        eq(socialPublicationEvents.tenantId, input.tenantId),
        inArray(socialPublicationEvents.attemptId, attempts.map((row) => row.id)),
      ),
    )
    .orderBy(desc(socialPublicationEvents.createdAt));
  const byAttempt = new Map<string, typeof events>();
  for (const event of events) {
    const rows = byAttempt.get(event.attemptId) || [];
    rows.push(event);
    byAttempt.set(event.attemptId, rows);
  }
  return attempts.map((attempt) => ({
    ...attempt,
    events: byAttempt.get(attempt.id) || [],
  }));
}

export async function prepareManualSocialPublication(input: {
  tenantId: number;
  mediaItemId: string;
  actorUserId: number | null;
  platform: string;
  channel?: string | null;
  territoryId?: number | null;
  integrationConnectionId?: string | null;
  targetId?: number | null;
  idempotencyKey: string;
  confirmed: boolean;
  package?: {
    title?: string | null;
    caption?: string | null;
    hashtags?: unknown;
    altText?: string | null;
    assetUrl?: string | null;
    assetType?: string | null;
    thumbnailUrl?: string | null;
    destinationLink?: string | null;
  };
}) {
  const platform = normalizeSocialPlatform(input.platform);
  const channel = String(input.channel || platform).trim().toLowerCase();
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  if (input.confirmed !== true) {
    throw new Error("Accountable confirmation is required before preparing a publication handoff");
  }
  const replay = await assertCompatibleReplay({
    tenantId: input.tenantId,
    mediaItemId: input.mediaItemId,
    idempotencyKey,
    platform,
    channel,
  });
  if (replay) {
    return {
      idempotentReplay: true,
      attempt: replay,
      externalPublicationClaimed: false,
    };
  }

  const rights = await getMediaRightsState({
    tenantId: input.tenantId,
    mediaItemId: input.mediaItemId,
    usageType: "organic_publication",
    channel,
    territoryId: input.territoryId || null,
  });
  if (!rights.eligibility.eligible || !rights.sourceReference || !rights.eligibility.grantId) {
    throw new SocialPublicationBlockedError(rights.eligibility.blockers);
  }
  if (rights.item.status === "rejected") {
    throw new SocialPublicationBlockedError(["content_is_rejected_or_restricted"]);
  }
  if (rights.item.status !== "reviewed" && rights.item.status !== "published") {
    throw new SocialPublicationBlockedError(["content_review_required"]);
  }
  const sourceReferenceId = Number(rights.sourceReference.id);
  const rightsGrantId = Number(rights.eligibility.grantId);
  if (!Number.isFinite(sourceReferenceId) || sourceReferenceId <= 0 || !Number.isFinite(rightsGrantId) || rightsGrantId <= 0) {
    throw new SocialPublicationBlockedError(["active_rights_grant_required"]);
  }
  const eligibleGrant = rights.grants.find((grant) => grant.id === rightsGrantId);
  if (!eligibleGrant) throw new SocialPublicationBlockedError(["active_rights_grant_required"]);

  const [connections, targets] = await Promise.all([
    loadSafeTenantConnections(input.tenantId),
    loadTargets(input.tenantId),
  ]);
  if (
    input.integrationConnectionId &&
    !connections.some((connection) => connection.id === input.integrationConnectionId)
  ) {
    throw new Error("The selected integration connection is not available to this tenant");
  }
  if (input.targetId && !targets.some((target) => target.id === input.targetId)) {
    throw new Error("The selected publication target does not belong to this tenant");
  }
  const readiness = readinessForPlatform({
    platform,
    connections,
    targets,
    requestedConnectionId: input.integrationConnectionId || null,
    requestedTargetId: input.targetId || null,
  });

  const item = rights.item;
  const packageInput = asRecord(input.package);
  const assetUrl = String(
    packageInput.assetUrl ||
      item.mediaEmbedUrl ||
      item.thumbnailLocalPath ||
      item.thumbnailRemoteUrl ||
      item.canonicalUrl ||
      item.url ||
      "",
  ).trim();
  const destinationLink = String(packageInput.destinationLink || item.canonicalUrl || item.url || "").trim();
  const manualPackage = buildManualPublicationPackage({
    platform,
    channel,
    title: String(packageInput.title || item.title || ""),
    caption: String(packageInput.caption || item.summaryParagraph || item.excerpt || item.title || ""),
    hashtags: packageInput.hashtags || item.tags || [],
    altText: String(packageInput.altText || item.excerpt || item.title || ""),
    assetUrl,
    assetType: String(packageInput.assetType || item.type || "unspecified"),
    thumbnailUrl: String(packageInput.thumbnailUrl || item.thumbnailLocalPath || item.thumbnailRemoteUrl || ""),
    destinationLink,
    trackingCode: trackingCode({
      tenantId: input.tenantId,
      mediaItemId: input.mediaItemId,
      idempotencyKey,
    }),
    attributionText: eligibleGrant.attributionText,
  });

  const actionRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "SOCIAL_PUBLICATION_PREPARE",
    requestedByUserId: input.actorUserId,
    correlationId: `media:${input.mediaItemId}:social:${platform}:${idempotencyKey}`,
    payload: {
      mediaItemId: input.mediaItemId,
      platform,
      channel,
      territoryId: input.territoryId || null,
      idempotencyKey,
      confirmed: true,
    },
  });

  try {
    const transactionResult = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${input.tenantId}:${idempotencyKey}:social-publication`}))`,
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
      if (existing) return { attempt: existing, idempotentReplay: true };

      const [attempt] = await tx
        .insert(socialPublicationAttempts)
        .values({
          tenantId: input.tenantId,
          mediaItemId: input.mediaItemId,
          sourceReferenceId,
          rightsGrantId,
          territoryId: input.territoryId || null,
          targetId: readiness.target?.id || null,
          integrationConnectionId: null,
          exportunityIntegrationConnectionId: readiness.connection?.id || null,
          actionRunId: actionRun.id,
          idempotencyKey,
          provider: readiness.provider,
          platform,
          channel,
          mode: "manual_package",
          status: "MANUAL_REQUIRED",
          manualPackage,
          providerState: {
            configured: readiness.configured,
            adapterAvailable: false,
            officialPublicationReady: false,
            blockers: readiness.blockers,
            publicationClaimed: false,
          },
          requestedByUserId: input.actorUserId,
          approvedByUserId: input.actorUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      await tx.insert(socialPublicationEvents).values({
        tenantId: input.tenantId,
        attemptId: attempt.id,
        eventType: "content.manual_package_prepared",
        status: "MANUAL_REQUIRED",
        actorUserId: input.actorUserId,
        payload: {
          platform,
          channel,
          rightsGrantId,
          actionRunId: actionRun.id,
          providerConfirmation: false,
          blockers: readiness.blockers,
        },
        createdAt: new Date(),
      });
      await tx.insert(mediaRightsEvents).values({
        tenantId: input.tenantId,
        sourceReferenceId,
        grantId: rightsGrantId,
        eventType: "content.manual_package_prepared",
        actorUserId: input.actorUserId,
        payload: {
          attemptId: attempt.id,
          platform,
          channel,
          status: "MANUAL_REQUIRED",
          externalPublicationClaimed: false,
        },
        createdAt: new Date(),
      });
      await tx.insert(auditLogs).values({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        userRole: "admin",
        action: "content.manual_package_prepared",
        entityType: "social_publication_attempt",
        entityId: null,
        metadata: {
          attemptId: attempt.id,
          mediaItemId: input.mediaItemId,
          platform,
          status: "MANUAL_REQUIRED",
          externalPublicationClaimed: false,
          handoffConfirmedByUserId: input.actorUserId,
          actionRunId: actionRun.id,
        },
        createdAt: new Date(),
      });
      return { attempt, idempotentReplay: false };
    });

    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: actionRun.id,
      enforceEvidence: true,
      result: {
        attemptId: transactionResult.attempt.id,
        status: transactionResult.attempt.status,
        idempotentReplay: transactionResult.idempotentReplay,
        externalPublicationClaimed: false,
      },
      evidence: [
        {
          evidenceType: "RIGHTS_GATE",
          payload: {
            eligibility: rights.eligibility,
            sourceReferenceId,
            rightsGrantId,
          },
        },
        {
          evidenceType: "MANUAL_PUBLICATION_PACKAGE",
          payload: {
            attemptId: transactionResult.attempt.id,
            platform,
            status: "MANUAL_REQUIRED",
            trackingCode: manualPackage.trackingCode,
            externalPublicationClaimed: false,
          },
        },
      ],
    });

    return {
      idempotentReplay: transactionResult.idempotentReplay,
      attempt: transactionResult.attempt,
      readiness,
      externalPublicationClaimed: false,
    };
  } catch (error: any) {
    await completeRunFailure({
      tenantId: input.tenantId,
      runId: actionRun.id,
      error: String(error?.message || error || "Social publication preparation failed"),
      result: { externalPublicationClaimed: false },
    }).catch(() => undefined);
    throw error;
  }
}
