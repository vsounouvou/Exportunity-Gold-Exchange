import { db } from "@db";
import {
  auditLogs,
  marketingMediaItems,
  mediaRightsEvents,
  mediaRightsGrants,
  sourceContentReferences,
} from "@db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

import {
  completeRunFailure,
  completeRunSuccess,
  createActionRun,
} from "../actions/actionRuns";
import {
  evaluateMediaPublicationEligibility,
  hasMaterialRightsEvidence,
  type MediaPublicationUsage,
} from "./mediaRightsPolicy";

type JsonRecord = Record<string, unknown>;

const RIGHTS_BASES = new Set([
  "creator_grant",
  "license",
  "commissioned",
  "tenant_owned",
  "public_domain",
]);
const CONSENT_STATES = new Set(["unknown", "not_required", "pending", "granted", "revoked"]);
const TAKEDOWN_ACTIONS = new Set(["requested", "removed", "disputed", "clear"]);
const TAKEDOWN_ACTION_LABELS: Record<string, string> = {
  requested: "Takedown requested",
  removed: "Content removed",
  disputed: "Takedown disputed",
  clear: "Takedown cleared",
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asStringArray(value: unknown, fallback: string[] = []) {
  const list = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((entry) => entry.trim());
  const normalized = Array.from(
    new Set(list.map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean)),
  );
  return normalized.length ? normalized : fallback;
}

function asNumberArray(value: unknown) {
  const list = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      list
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry) && entry > 0)
        .map((entry) => Math.trunc(entry)),
    ),
  );
}

function parseDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("Invalid rights date");
  return date;
}

function normalizeConsent(value: unknown) {
  const status = String(value || "unknown").trim().toLowerCase();
  return CONSENT_STATES.has(status) ? status : "unknown";
}

function normalizeTakedownAction(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "request") return "requested";
  if (normalized === "remove") return "removed";
  if (normalized === "dispute") return "disputed";
  if (normalized === "clear") return "clear";
  if (TAKEDOWN_ACTIONS.has(normalized)) return normalized;
  return null;
}

function takedownReuseState(action: "requested" | "removed" | "disputed" | "clear") {
  if (action === "clear") return "rights_granted";
  if (action === "removed") return "takedown";
  return "restricted";
}

function takedownEventType(action: "requested" | "removed" | "disputed" | "clear") {
  if (action === "requested") return "source.takedown_requested";
  if (action === "removed") return "source.takedown_removed";
  if (action === "disputed") return "source.takedown_disputed";
  return "source.takedown_cleared";
}

function takedownActionDescription(action: "requested" | "removed" | "disputed" | "clear") {
  return TAKEDOWN_ACTION_LABELS[action];
}

function inferSourcePlatform(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (hostname.includes("instagram")) return "instagram";
    if (hostname.includes("facebook")) return "facebook";
    if (hostname.includes("tiktok")) return "tiktok";
    if (hostname.includes("youtube") || hostname === "youtu.be") return "youtube";
    if (hostname.includes("linkedin")) return "linkedin";
    if (hostname === "x.com" || hostname.includes("twitter")) return "x";
    return hostname || "web";
  } catch {
    return "unknown";
  }
}

async function findMediaItem(tenantId: number, mediaItemId: string) {
  return db.query.marketingMediaItems.findFirst({
    where: and(
      eq(marketingMediaItems.tenantId, tenantId),
      eq(marketingMediaItems.id, mediaItemId),
    ),
  });
}

export async function getMediaRightsState(input: {
  tenantId: number;
  mediaItemId: string;
  usageType?: MediaPublicationUsage;
  channel?: string | null;
  territoryId?: number | null;
}) {
  const item = await findMediaItem(input.tenantId, input.mediaItemId);
  if (!item) throw new Error("Media item not found");

  const sourceReference = await db.query.sourceContentReferences.findFirst({
    where: and(
      eq(sourceContentReferences.tenantId, input.tenantId),
      eq(sourceContentReferences.mediaItemId, input.mediaItemId),
    ),
  });
  const [grants, events] = sourceReference
    ? await Promise.all([
        db
          .select()
          .from(mediaRightsGrants)
          .where(
            and(
              eq(mediaRightsGrants.tenantId, input.tenantId),
              eq(mediaRightsGrants.sourceReferenceId, sourceReference.id),
            ),
          )
          .orderBy(desc(mediaRightsGrants.createdAt)),
        db
          .select()
          .from(mediaRightsEvents)
          .where(
            and(
              eq(mediaRightsEvents.tenantId, input.tenantId),
              eq(mediaRightsEvents.sourceReferenceId, sourceReference.id),
            ),
          )
          .orderBy(desc(mediaRightsEvents.createdAt))
          .limit(100),
      ])
    : [[], []];

  const eligibility = evaluateMediaPublicationEligibility({
    sourceReference,
    grants,
    usageType: input.usageType,
    channel: input.channel,
    territoryId: input.territoryId,
  });
  return {
    item,
    sourceReference,
    grants,
    events,
    eligibility,
    legacyPublishedWithoutLedger:
      item.status === "published" && !sourceReference,
  };
}

export class MediaPublicationBlockedError extends Error {
  readonly gate: ReturnType<typeof evaluateMediaPublicationEligibility>;

  constructor(gate: ReturnType<typeof evaluateMediaPublicationEligibility>) {
    super(`MEDIA_PUBLICATION_BLOCKED:${gate.blockers.join(",")}`);
    this.name = "MediaPublicationBlockedError";
    this.gate = gate;
  }
}

export async function grantMediaRights(input: {
  tenantId: number;
  mediaItemId: string;
  actorUserId: number | null;
  confirmed: boolean;
  source?: JsonRecord;
  grant: JsonRecord;
}) {
  if (!input.confirmed) throw new Error("An accountable human must confirm the rights evidence");
  const item = await findMediaItem(input.tenantId, input.mediaItemId);
  if (!item) throw new Error("Media item not found");

  const rightsHolderName = String(input.grant.rightsHolderName || "").trim();
  if (!rightsHolderName) throw new Error("rightsHolderName is required");
  const rightsBasis = String(input.grant.rightsBasis || "").trim().toLowerCase();
  if (!RIGHTS_BASES.has(rightsBasis)) throw new Error("Unsupported rightsBasis");
  const evidence = asRecord(input.grant.evidence);
  if (!hasMaterialRightsEvidence(evidence)) throw new Error("Material rights evidence is required");

  const usageTypes = asStringArray(input.grant.usageTypes, ["organic_publication"]);
  const channels = asStringArray(input.grant.channels, ["web"]);
  const territoryIds = asNumberArray(input.grant.territoryIds);
  const allTerritories = input.grant.allTerritories === true;
  if (!allTerritories && !territoryIds.length) {
    throw new Error("Select allTerritories or at least one territoryId");
  }

  const sourceInput = asRecord(input.source);
  const sourceUrl = String(
    sourceInput.sourceUrl || item.canonicalUrl || item.url || "",
  ).trim();
  if (!sourceUrl) throw new Error("sourceUrl is required");
  const startsAt = parseDate(input.grant.startsAt);
  const expiresAt = parseDate(input.grant.expiresAt);
  if (startsAt && expiresAt && expiresAt <= startsAt) {
    throw new Error("expiresAt must be after startsAt");
  }

  const actionRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "RIGHTS_GRANT",
    requestedByUserId: input.actorUserId,
    correlationId: `media:${input.mediaItemId}:rights:${Date.now()}`,
    payload: {
      mediaItemId: input.mediaItemId,
      rightsHolderName,
      rightsBasis,
    },
  });

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${input.tenantId}:${input.mediaItemId}:rights`}))`,
      );
      const [sourceReference] = await tx
        .insert(sourceContentReferences)
        .values({
          tenantId: input.tenantId,
          mediaItemId: input.mediaItemId,
          territoryId: Number(sourceInput.territoryId || 0) || null,
          sourcePlatform:
            String(sourceInput.sourcePlatform || "").trim().toLowerCase() || inferSourcePlatform(sourceUrl),
          sourceContentId: String(sourceInput.sourceContentId || "").trim() || null,
          sourceUrl,
          canonicalSourceUrl:
            String(sourceInput.canonicalSourceUrl || item.canonicalUrl || "").trim() || null,
          sourceCreatorName:
            String(sourceInput.sourceCreatorName || item.author || "").trim() || null,
          sourceCreatorUrl: String(sourceInput.sourceCreatorUrl || "").trim() || null,
          sourcePublishedAt: item.publishedAt || null,
          discoveredByAgentId: Number(sourceInput.discoveredByAgentId || 0) || null,
          discoveryEvidence: {
            mediaItemId: item.id,
            originalUrl: item.url,
            recordedByActionRunId: actionRun.id,
            ...asRecord(sourceInput.discoveryEvidence),
          },
          reuseStatus: "rights_granted",
          takedownState: "clear",
          createdByUserId: input.actorUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [sourceContentReferences.tenantId, sourceContentReferences.mediaItemId],
          set: {
            territoryId: Number(sourceInput.territoryId || 0) || null,
            sourcePlatform:
              String(sourceInput.sourcePlatform || "").trim().toLowerCase() || inferSourcePlatform(sourceUrl),
            sourceContentId: String(sourceInput.sourceContentId || "").trim() || null,
            sourceUrl,
            canonicalSourceUrl:
              String(sourceInput.canonicalSourceUrl || item.canonicalUrl || "").trim() || null,
            sourceCreatorName:
              String(sourceInput.sourceCreatorName || item.author || "").trim() || null,
            sourceCreatorUrl: String(sourceInput.sourceCreatorUrl || "").trim() || null,
            discoveryEvidence: {
              mediaItemId: item.id,
              originalUrl: item.url,
              recordedByActionRunId: actionRun.id,
              ...asRecord(sourceInput.discoveryEvidence),
            },
            reuseStatus: "rights_granted",
            takedownState: "clear",
            updatedAt: new Date(),
          },
        })
        .returning();

      const [grant] = await tx
        .insert(mediaRightsGrants)
        .values({
          tenantId: input.tenantId,
          sourceReferenceId: sourceReference.id,
          creatorProfileId: String(input.grant.creatorProfileId || "").trim() || null,
          rightsHolderName,
          rightsBasis,
          status: "granted",
          usageTypes,
          channels,
          territoryIds,
          allTerritories,
          startsAt,
          expiresAt,
          producerConsentStatus: normalizeConsent(input.grant.producerConsentStatus),
          subjectReleaseStatus: normalizeConsent(input.grant.subjectReleaseStatus),
          musicLicenseStatus: normalizeConsent(input.grant.musicLicenseStatus),
          attributionText: String(input.grant.attributionText || "").trim() || null,
          attributionRules: asRecord(input.grant.attributionRules),
          evidence,
          grantedByUserId: input.actorUserId,
          grantedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      await tx.insert(mediaRightsEvents).values({
        tenantId: input.tenantId,
        sourceReferenceId: sourceReference.id,
        grantId: grant.id,
        eventType: "rights.granted",
        actorUserId: input.actorUserId,
        payload: {
          actionRunId: actionRun.id,
          rightsBasis,
          usageTypes,
          channels,
          territoryIds,
          allTerritories,
        },
        createdAt: new Date(),
      });
      await tx.insert(auditLogs).values({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        userRole: "admin",
        action: "rights.granted",
        entityType: "marketing_media_item",
        entityId: null,
        metadata: {
          mediaItemId: input.mediaItemId,
          sourceReferenceId: sourceReference.id,
          grantId: grant.id,
          actionRunId: actionRun.id,
        },
        createdAt: new Date(),
      });
      return { sourceReference, grant };
    });

    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: actionRun.id,
      enforceEvidence: true,
      result: {
        mediaItemId: input.mediaItemId,
        sourceReferenceId: result.sourceReference.id,
        grantId: result.grant.id,
      },
      evidence: [
        {
          evidenceType: "RIGHTS_EVIDENCE",
          payload: {
            sourceReferenceId: result.sourceReference.id,
            grantId: result.grant.id,
            evidence,
            confirmedByUserId: input.actorUserId,
          },
        },
      ],
    });

    return getMediaRightsState({ tenantId: input.tenantId, mediaItemId: input.mediaItemId });
  } catch (error: any) {
    await completeRunFailure({
      tenantId: input.tenantId,
      runId: actionRun.id,
      error: String(error?.message || error || "Rights grant failed"),
    }).catch(() => undefined);
    throw error;
  }
}

export async function revokeMediaRights(input: {
  tenantId: number;
  mediaItemId: string;
  grantId: number;
  actorUserId: number | null;
  reason: string;
}) {
  const reason = String(input.reason || "").trim();
  if (!reason) throw new Error("reason is required");
  const state = await getMediaRightsState({
    tenantId: input.tenantId,
    mediaItemId: input.mediaItemId,
  });
  const grant = state.grants.find((row: any) => row.id === input.grantId);
  if (!grant || !state.sourceReference) throw new Error("Rights grant not found");
  const sourceReference = state.sourceReference;
  if (grant.status === "revoked") return state;

  const run = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "RIGHTS_REVOKE",
    requestedByUserId: input.actorUserId,
    correlationId: `media:${input.mediaItemId}:rights-revoke:${input.grantId}`,
    payload: { mediaItemId: input.mediaItemId, grantId: input.grantId, reason },
  });
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(mediaRightsGrants)
        .set({
          status: "revoked",
          revokedByUserId: input.actorUserId,
          revokedAt: new Date(),
          revocationReason: reason,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(mediaRightsGrants.tenantId, input.tenantId),
            eq(mediaRightsGrants.id, input.grantId),
          ),
        );
      const remainingGrant = await tx.query.mediaRightsGrants.findFirst({
        where: and(
          eq(mediaRightsGrants.tenantId, input.tenantId),
          eq(mediaRightsGrants.sourceReferenceId, sourceReference.id),
          eq(mediaRightsGrants.status, "granted"),
        ),
      });
      await tx
        .update(sourceContentReferences)
        .set({ reuseStatus: remainingGrant ? "rights_granted" : "revoked", updatedAt: new Date() })
        .where(
          and(
            eq(sourceContentReferences.tenantId, input.tenantId),
            eq(sourceContentReferences.id, sourceReference.id),
          ),
        );
      await tx.insert(mediaRightsEvents).values({
        tenantId: input.tenantId,
        sourceReferenceId: sourceReference.id,
        grantId: input.grantId,
        eventType: "rights.revoked",
        actorUserId: input.actorUserId,
        payload: { reason, actionRunId: run.id },
        createdAt: new Date(),
      });
      await tx.insert(auditLogs).values({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        userRole: "admin",
        action: "rights.revoked",
        entityType: "marketing_media_item",
        entityId: null,
        metadata: {
          mediaItemId: input.mediaItemId,
          grantId: input.grantId,
          reason,
          actionRunId: run.id,
        },
        createdAt: new Date(),
      });
    });
    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: run.id,
      enforceEvidence: true,
      result: { mediaItemId: input.mediaItemId, grantId: input.grantId, status: "revoked" },
      evidence: [
        {
          evidenceType: "REVOCATION",
          payload: { grantId: input.grantId, reason, actorUserId: input.actorUserId },
        },
      ],
    });
    return getMediaRightsState({ tenantId: input.tenantId, mediaItemId: input.mediaItemId });
  } catch (error: any) {
    await completeRunFailure({
      tenantId: input.tenantId,
      runId: run.id,
      error: String(error?.message || error || "Rights revocation failed"),
    }).catch(() => undefined);
    throw error;
  }
}

export async function setMediaSourceTakedownState(input: {
  tenantId: number;
  mediaItemId: string;
  actorUserId: number | null;
  action: "requested" | "removed" | "disputed" | "clear" | string;
  reason?: unknown;
  evidence?: unknown;
  confirmed: boolean;
}) {
  if (!input.confirmed) throw new Error("An accountable human must confirm this source action");
  const state = await getMediaRightsState({
    tenantId: input.tenantId,
    mediaItemId: input.mediaItemId,
  });
  if (!state.sourceReference) throw new Error("Source reference not found");
  const sourceReference = state.sourceReference;

  const action = normalizeTakedownAction(input.action) as
    | "requested"
    | "removed"
    | "disputed"
    | "clear"
    | null;
  if (!action) throw new Error("Unsupported takedown action");
  const normalizedReason = String(input.reason || "").trim();
  if (action !== "clear" && !normalizedReason) throw new Error("reason is required for non-clear actions");

  const currentTakedown = String(state.sourceReference.takedownState || "clear").trim().toLowerCase();
  const targetTakedown = action;
  if (currentTakedown === targetTakedown) {
    return state;
  }

  const run = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "RIGHTS_TAKEDOWN",
    requestedByUserId: input.actorUserId,
    correlationId: `media:${input.mediaItemId}:takedown:${targetTakedown}`,
    payload: {
      mediaItemId: input.mediaItemId,
      takedownAction: targetTakedown,
      reason: normalizedReason || null,
    },
  });

  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${input.tenantId}:${input.mediaItemId}:rights`}))`,
      );

      let reuseStatus = "reference_only";
      if (action === "clear") {
        const activeGrant = await tx.query.mediaRightsGrants.findFirst({
          where: and(
            eq(mediaRightsGrants.tenantId, input.tenantId),
            eq(mediaRightsGrants.sourceReferenceId, state.sourceReference!.id),
            eq(mediaRightsGrants.status, "granted"),
          ),
        });
        if (activeGrant) {
          reuseStatus = "rights_granted";
        } else {
          const anyGrant = await tx.query.mediaRightsGrants.findFirst({
            where: and(
              eq(mediaRightsGrants.tenantId, input.tenantId),
              eq(mediaRightsGrants.sourceReferenceId, state.sourceReference!.id),
            ),
          });
          reuseStatus = anyGrant ? "revoked" : "reference_only";
        }
      } else {
        reuseStatus = takedownReuseState(action);
      }

      await tx
        .update(sourceContentReferences)
        .set({
          takedownState: targetTakedown,
          reuseStatus,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(sourceContentReferences.tenantId, input.tenantId),
          eq(sourceContentReferences.id, sourceReference.id),
        ),
      );

      await tx.insert(mediaRightsEvents).values({
        tenantId: input.tenantId,
        sourceReferenceId: sourceReference.id,
        eventType: takedownEventType(action),
        actorUserId: input.actorUserId,
        payload: {
          takedownAction: targetTakedown,
          takedownActionLabel: takedownActionDescription(targetTakedown),
          reason: normalizedReason || null,
          actionRunId: run.id,
          evidence: asRecord(input.evidence),
          previousTakedownState: sourceReference.takedownState || "clear",
          previousReuseStatus: sourceReference.reuseStatus || "reference_only",
        },
        createdAt: new Date(),
      });

      await tx.insert(auditLogs).values({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        userRole: "admin",
        action: action === "clear" ? "rights.takedown_cleared" : `rights.takedown_${action}`,
        entityType: "marketing_media_item",
        entityId: null,
        metadata: {
          mediaItemId: input.mediaItemId,
          sourceReferenceId: sourceReference.id,
          actionRunId: run.id,
          reason: normalizedReason || null,
        },
        createdAt: new Date(),
      });
    });

    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: run.id,
      enforceEvidence: true,
      result: {
        mediaItemId: input.mediaItemId,
        action: targetTakedown,
      },
      evidence: [
        {
          evidenceType: "RIGHTS_TAKEDOWN",
          payload: {
            mediaItemId: input.mediaItemId,
            action: targetTakedown,
            reason: normalizedReason || null,
            confirmedByUserId: input.actorUserId,
          },
        },
      ],
    });

    return getMediaRightsState({ tenantId: input.tenantId, mediaItemId: input.mediaItemId });
  } catch (error: any) {
    await completeRunFailure({
      tenantId: input.tenantId,
      runId: run.id,
      error: String(error?.message || error || "Rights takedown update failed"),
    }).catch(() => undefined);
    throw error;
  }
}

export async function publishMediaItemWithRights(input: {
  tenantId: number;
  mediaItemId: string;
  actorUserId: number | null;
  usageType?: MediaPublicationUsage;
  channel?: string | null;
  territoryId?: number | null;
}) {
  const state = await getMediaRightsState(input);
  if (state.item.status === "published") {
    return { idempotentReplay: true, item: state.item, gate: state.eligibility, actionRun: null };
  }
  if (!state.eligibility.eligible) throw new MediaPublicationBlockedError(state.eligibility);

  const usageType = input.usageType || "organic_publication";
  const channel = String(input.channel || "web").trim().toLowerCase();
  const run = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "CONTENT_PUBLISH",
    requestedByUserId: input.actorUserId,
    correlationId: `media:${input.mediaItemId}:publish:${channel}:${state.eligibility.grantId}`,
    payload: { mediaItemId: input.mediaItemId, channel, usageType },
  });

  try {
    const [item] = await db
      .update(marketingMediaItems)
      .set({
        status: "published",
        publishedAt: state.item.publishedAt || new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(marketingMediaItems.tenantId, input.tenantId),
          eq(marketingMediaItems.id, input.mediaItemId),
        ),
      )
      .returning();

    if (state.sourceReference) {
      await db.insert(mediaRightsEvents).values({
        tenantId: input.tenantId,
        sourceReferenceId: state.sourceReference.id,
        grantId: state.eligibility.grantId,
        eventType: "content.published",
        actorUserId: input.actorUserId,
        payload: {
          channel,
          usageType,
          territoryId: input.territoryId || null,
          actionRunId: run.id,
          platformConfirmation: "cms_state_only",
        },
        createdAt: new Date(),
      });
    }
    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: run.id,
      enforceEvidence: true,
      result: { mediaItemId: input.mediaItemId, status: "published", channel, usageType },
      evidence: [
        {
          evidenceType: "RIGHTS_GATE",
          payload: {
            gate: state.eligibility,
            cmsStatusChanged: true,
            externalPlatformPublicationClaimed: false,
          },
        },
      ],
    });
    return { idempotentReplay: false, item, gate: state.eligibility, actionRun: run };
  } catch (error: any) {
    await completeRunFailure({
      tenantId: input.tenantId,
      runId: run.id,
      error: String(error?.message || error || "Content publication failed"),
    }).catch(() => undefined);
    throw error;
  }
}
