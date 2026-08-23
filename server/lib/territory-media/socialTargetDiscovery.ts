import { db } from "@db";
import {
  actionEvidence,
  actionRuns,
  auditLogs,
  socialPublicationTargets,
} from "@db/schema";
import { and, desc, eq } from "drizzle-orm";

import {
  completeRunFailure,
  completeRunSuccess,
  createActionRun,
} from "../actions/actionRuns";
import {
  accessTokenForExportunityProviderConnection,
  loadExportunityProviderConnection,
  type ExportunityProviderConnection,
} from "../exportunity/integrations/providerAccess";
import {
  EXPORTUNITY_META_INTEGRATION_ID,
  EXPORTUNITY_YOUTUBE_INTEGRATION_ID,
} from "../exportunity/integrations/providerContracts";
import {
  candidateContainsCredentialMaterial,
  parseMetaTargetCandidates,
  parseYouTubeTargetCandidates,
  type DiscoveredSocialTarget,
} from "./socialTargetDiscoveryPolicy";
import {
  normalizeSocialPlatform,
  providerForPlatform,
  REQUIRED_SOCIAL_SCOPES,
  type SocialPlatform,
} from "./socialPublicationPolicy";

type JsonRecord = Record<string, unknown>;
type Connection = ExportunityProviderConnection;

const DISCOVERY_PLATFORMS = new Set<SocialPlatform>(["facebook", "instagram", "youtube"]);
const PROVIDER_TIMEOUT_MS = 12_000;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asRecords(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function requireConfirmation(value: boolean) {
  if (!value) throw new Error("Accountable confirmation is required for provider target discovery");
}

function requireNonSecretReference(value: unknown, field: string) {
  const normalized = asText(value);
  if (!normalized) throw new Error(`${field} is required`);
  if (normalized.length > 1_000) throw new Error(`${field} is too long`);
  if (/(?:access[_-]?token|refresh[_-]?token|auth[_-]?token|client[_-]?secret|api[_-]?key|bearer\s+|password)/i.test(normalized)) {
    throw new Error(`${field} must be a non-secret evidence reference`);
  }
  return normalized;
}

function normalizeDiscoveryPlatform(value: unknown) {
  const platform = normalizeSocialPlatform(value);
  if (!DISCOVERY_PLATFORMS.has(platform)) {
    throw new Error("Read-only target discovery currently supports Facebook, Instagram, and YouTube");
  }
  return platform as "facebook" | "instagram" | "youtube";
}

function requiredDiscoveryScopes(platform: "facebook" | "instagram" | "youtube") {
  if (platform === "facebook") return ["pages_show_list"];
  if (platform === "instagram") return ["pages_show_list", "instagram_basic"];
  return ["https://www.googleapis.com/auth/youtube.readonly"];
}

async function loadConnection(input: {
  tenantId: number;
  connectionId: string;
  platform: "facebook" | "instagram" | "youtube";
}) {
  const connection = await loadExportunityProviderConnection({
    tenantId: input.tenantId,
    connectionId: input.connectionId,
  });
  const expectedIntegrationId = input.platform === "youtube"
    ? EXPORTUNITY_YOUTUBE_INTEGRATION_ID
    : EXPORTUNITY_META_INTEGRATION_ID;
  if (connection.integrationId !== expectedIntegrationId) {
    throw new Error("Integration connection does not match the selected platform");
  }
  if (connection.provider !== providerForPlatform(input.platform)) {
    throw new Error("Integration provider does not match the selected platform");
  }
  const tokenMeta = asRecord(connection.tokenMeta);
  if (tokenMeta.scopeEvidenceVerified !== true) {
    throw new Error("Provider permission evidence must be verified before target discovery");
  }
  if (tokenMeta.authorizationReady !== true) {
    throw new Error("Provider authorization evidence must be complete before target discovery");
  }
  const grantedScopes = Array.isArray(connection.scopes)
    ? connection.scopes.map((scope) => asText(scope)).filter(Boolean)
    : [];
  const missing = requiredDiscoveryScopes(input.platform).filter(
    (scope) => !grantedScopes.includes(scope),
  );
  if (missing.length) {
    throw new Error(`Target discovery requires provider permission: ${missing.join(", ")}`);
  }
  return connection;
}

async function providerJson(input: {
  url: string;
  accessToken?: string;
  method?: "GET" | "POST";
  body?: URLSearchParams;
  label: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(input.url, {
      method: input.method || "GET",
      headers: {
        ...(input.accessToken
          ? { authorization: `Bearer ${input.accessToken}` }
          : {}),
        accept: "application/json",
        ...(input.body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      body: input.body,
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as JsonRecord;
    if (!response.ok) {
      throw new Error(`${input.label} returned HTTP ${response.status}`);
    }
    return payload;
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error(`${input.label} timed out`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function accessTokenForProviderConnection(connection: Connection) {
  const credential = await accessTokenForExportunityProviderConnection(connection);
  return credential.accessToken;
}

async function discoverCandidates(
  connection: Connection,
  platform: "facebook" | "instagram" | "youtube",
) {
  const accessToken = await accessTokenForProviderConnection(connection);
  if (platform === "youtube") {
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("part", "id,snippet,status");
    url.searchParams.set("mine", "true");
    url.searchParams.set("maxResults", "50");
    const payload = await providerJson({
      url: url.toString(),
      accessToken,
      label: "YouTube channel discovery",
    });
    return parseYouTubeTargetCandidates({
      connectionId: connection.id,
      grantedScopes: connection.scopes,
      payload,
    });
  }

  const graphVersion = asText(process.env.EXPORTUNITY_META_GRAPH_VERSION);
  if (!/^v\d+\.\d+$/i.test(graphVersion)) {
    throw new Error(
      "A pinned EXPORTUNITY_META_GRAPH_VERSION is required for Meta target discovery",
    );
  }
  const url = new URL(`https://graph.facebook.com/${graphVersion}/me/accounts`);
  url.searchParams.set(
    "fields",
    "id,name,category,tasks,instagram_business_account{id,username,name,profile_picture_url}",
  );
  url.searchParams.set("limit", "100");
  const payload = await providerJson({
    url: url.toString(),
    accessToken,
    label: "Meta business target discovery",
  });
  return parseMetaTargetCandidates({
    connectionId: connection.id,
    platform,
    grantedScopes: connection.scopes,
    payload,
  });
}

export async function discoverSocialTargetsReadOnly(input: {
  tenantId: number;
  actorUserId: number | null;
  connectionId: string;
  platform: unknown;
  confirmed: boolean;
}) {
  requireConfirmation(input.confirmed);
  const platform = normalizeDiscoveryPlatform(input.platform);
  const connectionId = asText(input.connectionId);
  if (!connectionId) throw new Error("connectionId is required");
  const connection = await loadConnection({ tenantId: input.tenantId, connectionId, platform });
  const actionRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "SOCIAL_TARGET_DISCOVER",
    requestedByUserId: input.actorUserId,
    correlationId: `social-target:${platform}:${connectionId}:${Date.now()}`,
    payload: { connectionId, platform, confirmed: true },
  });
  try {
    const candidates = await discoverCandidates(connection, platform);
    if (candidateContainsCredentialMaterial(candidates)) {
      throw new Error("Provider target response failed credential-exclusion policy");
    }
    const discoveredAt = new Date().toISOString();
    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: actionRun.id,
      enforceEvidence: true,
      result: {
        platform,
        connectionId,
        candidateCount: candidates.length,
        providerReadPerformed: true,
        providerMutationPerformed: false,
        externalPublicationPerformed: false,
        credentialsExposed: false,
      },
      evidence: [{
        evidenceType: "SOCIAL_TARGET_DISCOVERY",
        payload: {
          platform,
          connectionId,
          discoveredAt,
          candidates,
          providerReadPerformed: true,
          providerMutationPerformed: false,
          externalPublicationPerformed: false,
          credentialsExcluded: true,
        },
      }],
    });
    return {
      discoveryActionRunId: actionRun.id,
      platform,
      connectionId,
      discoveredAt,
      candidates,
      providerReadPerformed: true,
      providerMutationPerformed: false,
      externalPublicationPerformed: false,
      credentialsExposed: false,
    };
  } catch (error: any) {
    await completeRunFailure({
      tenantId: input.tenantId,
      runId: actionRun.id,
      error: asText(error?.message || error || "Target discovery failed"),
      result: {
        providerMutationPerformed: false,
        externalPublicationPerformed: false,
        credentialsExposed: false,
      },
    }).catch(() => undefined);
    throw error;
  }
}

async function loadCandidateReceipt(input: {
  tenantId: number;
  discoveryActionRunId: number;
  candidateKey: string;
}) {
  const run = await db.query.actionRuns.findFirst({
    where: and(
      eq(actionRuns.tenantId, input.tenantId),
      eq(actionRuns.id, input.discoveryActionRunId),
      eq(actionRuns.actionKey, "SOCIAL_TARGET_DISCOVER"),
      eq(actionRuns.status, "SUCCEEDED"),
    ),
  });
  if (!run) throw new Error("Successful target-discovery receipt was not found for this tenant");
  const evidence = await db
    .select()
    .from(actionEvidence)
    .where(
      and(
        eq(actionEvidence.tenantId, input.tenantId),
        eq(actionEvidence.runId, input.discoveryActionRunId),
      ),
    )
    .orderBy(desc(actionEvidence.createdAt));
  for (const row of evidence) {
    if (row.evidenceType !== "SOCIAL_TARGET_DISCOVERY") continue;
    const candidate = asRecords(asRecord(row.payload).candidates).find(
      (entry) => asText(entry.candidateKey) === input.candidateKey,
    );
    if (candidate) return candidate as unknown as DiscoveredSocialTarget;
  }
  throw new Error("Selected provider target is not present in the discovery receipt");
}

export async function selectVerifiedSocialTarget(input: {
  tenantId: number;
  actorUserId: number | null;
  discoveryActionRunId: number;
  candidateKey: string;
  authorityReference: unknown;
  confirmed: boolean;
}) {
  if (!input.confirmed) throw new Error("Accountable target-selection confirmation is required");
  const candidateKey = asText(input.candidateKey);
  if (!candidateKey) throw new Error("candidateKey is required");
  const authorityReference = requireNonSecretReference(input.authorityReference, "authorityReference");
  const candidate = await loadCandidateReceipt({
    tenantId: input.tenantId,
    discoveryActionRunId: Number(input.discoveryActionRunId),
    candidateKey,
  });
  if (candidateContainsCredentialMaterial(candidate) || candidate.credentialsExcluded !== true) {
    throw new Error("Discovery receipt does not satisfy credential-exclusion policy");
  }
  const connection = await loadConnection({
    tenantId: input.tenantId,
    connectionId: candidate.connectionId,
    platform: candidate.platform,
  });
  const actionRun = await createActionRun({
    tenantId: input.tenantId,
    actionKey: "SOCIAL_TARGET_SELECT",
    requestedByUserId: input.actorUserId,
    correlationId: `social-target-select:${candidate.platform}:${candidate.externalAccountId}:${Date.now()}`,
    payload: {
      discoveryActionRunId: input.discoveryActionRunId,
      candidateKey,
      authorityReference,
      confirmed: true,
    },
  });
  try {
    const target = await db.transaction(async (tx) => {
      const values = {
        integrationConnectionId: null,
        exportunityIntegrationConnectionId: connection.id,
        provider: candidate.provider,
        platform: candidate.platform,
        channel: candidate.channel,
        externalAccountId: candidate.externalAccountId,
        externalAccountLabel: candidate.externalAccountLabel,
        authorizationStatus: "authorized",
        healthStatus: "healthy",
        capabilities: candidate.capabilities,
        permissions: candidate.permissions,
        verificationEvidence: {
          source: candidate.evidenceSource,
          discoveryActionRunId: input.discoveryActionRunId,
          candidateKey,
          authorityReference,
          parentAccountId: candidate.parentAccountId,
          parentAccountLabel: candidate.parentAccountLabel,
          providerReadPerformed: true,
          providerMutationPerformed: false,
          credentialsExcluded: true,
          selectedByUserId: input.actorUserId,
        },
        lastVerifiedAt: new Date(),
        updatedByUserId: input.actorUserId,
        updatedAt: new Date(),
      };
      const [selected] = await tx
        .insert(socialPublicationTargets)
        .values({
          tenantId: input.tenantId,
          ...values,
          createdByUserId: input.actorUserId,
          createdAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            socialPublicationTargets.tenantId,
            socialPublicationTargets.platform,
            socialPublicationTargets.externalAccountId,
          ],
          set: values,
        })
        .returning();
      await tx.insert(auditLogs).values({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        userRole: "admin",
        action: "social.target.selected",
        entityType: "social_publication_target",
        entityId: selected.id,
        metadata: {
          actionRunId: actionRun.id,
          discoveryActionRunId: input.discoveryActionRunId,
          candidateKey,
          platform: candidate.platform,
          connectionId: connection.id,
          providerMutationPerformed: false,
          externalPublicationPerformed: false,
        },
        createdAt: new Date(),
      });
      return selected;
    });
    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: actionRun.id,
      enforceEvidence: true,
      result: {
        targetId: target.id,
        platform: target.platform,
        externalPublicationPerformed: false,
        credentialsExposed: false,
      },
      evidence: [{
        evidenceType: "SOCIAL_TARGET_SELECTION",
        payload: {
          targetId: target.id,
          discoveryActionRunId: input.discoveryActionRunId,
          candidateKey,
          authorityReference,
          connectionId: connection.id,
          credentialsExcluded: true,
          externalPublicationPerformed: false,
        },
      }],
    });
    return {
      target,
      discoveryActionRunId: input.discoveryActionRunId,
      selectionActionRunId: actionRun.id,
      providerMutationPerformed: false,
      externalPublicationPerformed: false,
      credentialsExposed: false,
    };
  } catch (error: any) {
    await completeRunFailure({
      tenantId: input.tenantId,
      runId: actionRun.id,
      error: asText(error?.message || error || "Target selection failed"),
      result: { externalPublicationPerformed: false, credentialsExposed: false },
    }).catch(() => undefined);
    throw error;
  }
}

export function requiredScopesForDiscoveredTarget(platform: SocialPlatform) {
  return REQUIRED_SOCIAL_SCOPES[platform];
}
