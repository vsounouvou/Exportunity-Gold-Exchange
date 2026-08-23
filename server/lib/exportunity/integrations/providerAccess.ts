import { db } from "@db";
import {
  exportunityIntegrationAuditEvents,
  exportunityIntegrationConnections,
} from "@db/schema";
import { and, eq, isNull } from "drizzle-orm";

import {
  EXPORTUNITY_GOOGLE_INTEGRATION_ID,
  EXPORTUNITY_META_INTEGRATION_ID,
  EXPORTUNITY_YOUTUBE_INTEGRATION_ID,
  isExportunityOAuthIntegrationId,
  providerForExportunityIntegration,
  scopesForExportunityIntegration,
  type ExportunityOAuthIntegrationId,
} from "./providerContracts";
import {
  decryptExportunityIntegrationTokenPayload,
  encryptExportunityIntegrationTokenPayload,
} from "./tokenVault";

const PROVIDER_TIMEOUT_MS = 15_000;
const PROVIDER_EVIDENCE_TTL_MS = 7 * 24 * 60 * 60_000;
const ACCESS_TOKEN_REFRESH_SKEW_MS = 2 * 60_000;

type JsonRecord = Record<string, unknown>;
export type ExportunityProviderConnection =
  typeof exportunityIntegrationConnections.$inferSelect;
type ProviderFetch = typeof fetch;

export type ExportunityProviderVerificationCheck = {
  key: string;
  label: string;
  verified: boolean;
  state: "verified" | "attention" | "provider_error";
  providerStatus: string | null;
  detail: string;
};

export type ExportunityProviderVerification = {
  integrationId: ExportunityOAuthIntegrationId;
  provider: "google" | "meta";
  ready: boolean;
  authorizationReady: boolean;
  resourceReady: boolean;
  checkedAt: string;
  mode: "read_only";
  credentialsNamespace: "EXPORTUNITY_";
  providerMutationPerformed: false;
  externalActionPerformed: false;
  tokenRefreshed: boolean;
  requestedScopes: string[];
  grantedScopes: string[];
  missingScopes: string[];
  unexpectedScopes: string[];
  checks: ExportunityProviderVerificationCheck[];
  capabilities: Record<string, boolean | number>;
  warnings: string[];
  fresh?: boolean;
  freshUntil?: string;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function asScopes(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(/[\s,]+/)
        .filter(Boolean);
  return Array.from(
    new Set(source.map((scope) => asText(scope)).filter(Boolean)),
  );
}

function nativeEnv(key: string) {
  return asText(process.env[`EXPORTUNITY_${key}`]);
}

function safeProviderDetail(value: unknown, fallback: string) {
  const detail = asText(value || fallback)
    .replace(
      /(?:access|refresh|auth)?[_-]?token\s*[=:]\s*[^\s&]+/gi,
      "token=[redacted]",
    )
    .replace(/bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
  return detail.slice(0, 320) || fallback;
}

function providerError(payload: JsonRecord, fallback: string) {
  const nested = asRecord(payload.error);
  return safeProviderDetail(
    nested.message || payload.error_description || payload.message,
    fallback,
  );
}

async function providerRequest(input: {
  url: string;
  fetchImpl: ProviderFetch;
  accessToken?: string;
  method?: "GET" | "POST";
  body?: URLSearchParams;
}): Promise<{
  ok: boolean;
  status: number | null;
  payload: JsonRecord;
  detail: string | null;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await input.fetchImpl(input.url, {
      method: input.method || "GET",
      headers: {
        accept: "application/json",
        ...(input.accessToken
          ? { authorization: `Bearer ${input.accessToken}` }
          : {}),
        ...(input.body
          ? { "content-type": "application/x-www-form-urlencoded" }
          : {}),
      },
      body: input.body,
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as JsonRecord;
    return {
      ok: response.ok,
      status: response.status,
      payload,
      detail: response.ok
        ? null
        : providerError(payload, `Provider returned HTTP ${response.status}`),
    };
  } catch (error: any) {
    return {
      ok: false,
      status: null,
      payload: {},
      detail:
        error?.name === "AbortError"
          ? "Provider request timed out"
          : safeProviderDetail(error?.message, "Provider request failed"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function verificationCheck(input: {
  key: string;
  label: string;
  ok: boolean;
  status: number | null;
  successDetail: string;
  failureDetail?: string | null;
  attention?: boolean;
}): ExportunityProviderVerificationCheck {
  const verified = input.ok && input.attention !== true;
  return {
    key: input.key,
    label: input.label,
    verified,
    state: !input.ok
      ? "provider_error"
      : input.attention
        ? "attention"
        : "verified",
    providerStatus: input.status ? `HTTP_${input.status}` : null,
    detail: verified
      ? input.successDetail
      : safeProviderDetail(
          input.failureDetail,
          input.attention
            ? `${input.label} needs attention`
            : `${input.label} could not be verified`,
        ),
  };
}

function requiredScopes(integrationId: ExportunityOAuthIntegrationId) {
  return [...scopesForExportunityIntegration(integrationId)];
}

function equivalentScopes(scope: string) {
  if (scope === "email") {
    return new Set(["email", "https://www.googleapis.com/auth/userinfo.email"]);
  }
  if (scope === "profile") {
    return new Set(["profile", "https://www.googleapis.com/auth/userinfo.profile"]);
  }
  return new Set([scope]);
}

function scopeMatchesExpected(grantedScope: string, expectedScopes: string[]) {
  return expectedScopes.some((expectedScope) =>
    equivalentScopes(expectedScope).has(grantedScope),
  );
}

export function missingExportunityProviderScopes(input: {
  integrationId: ExportunityOAuthIntegrationId;
  grantedScopes: unknown;
}) {
  const granted = new Set(asScopes(input.grantedScopes));
  return requiredScopes(input.integrationId).filter((scope) =>
    Array.from(equivalentScopes(scope)).every(
      (equivalentScope) => !granted.has(equivalentScope),
    ),
  );
}

export function unexpectedExportunityProviderScopes(input: {
  integrationId: ExportunityOAuthIntegrationId;
  grantedScopes: unknown;
}) {
  const expected = requiredScopes(input.integrationId);
  return asScopes(input.grantedScopes).filter((scope) => {
    if (
      input.integrationId === EXPORTUNITY_META_INTEGRATION_ID &&
      scope === "public_profile"
    ) {
      return false;
    }
    return !scopeMatchesExpected(scope, expected);
  });
}

export function exportunityProviderScopeContract(input: {
  integrationId: ExportunityOAuthIntegrationId;
  grantedScopes: unknown;
}) {
  const missingScopes = missingExportunityProviderScopes(input);
  const unexpectedScopes = unexpectedExportunityProviderScopes(input);
  return {
    ready: missingScopes.length === 0 && unexpectedScopes.length === 0,
    missingScopes,
    unexpectedScopes,
  };
}

export async function refreshExportunityGoogleTokenPayload(input: {
  payload: JsonRecord;
  fetchImpl?: ProviderFetch;
  clientId?: string;
  clientSecret?: string;
  now?: Date;
}) {
  const refreshToken = asText(input.payload.refresh_token);
  const clientId = asText(input.clientId || nativeEnv("GOOGLE_CLIENT_ID"));
  const clientSecret = asText(
    input.clientSecret || nativeEnv("GOOGLE_CLIENT_SECRET"),
  );
  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error(
      "Exportunity Google authorization expired and must be reconnected",
    );
  }
  const response = await providerRequest({
    url: "https://oauth2.googleapis.com/token",
    fetchImpl: input.fetchImpl || fetch,
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const accessToken = asText(response.payload.access_token);
  if (!response.ok || !accessToken) {
    throw new Error(
      safeProviderDetail(
        response.detail,
        "Exportunity Google token refresh failed",
      ),
    );
  }
  const now = input.now || new Date();
  const expiresIn = Math.max(0, Number(response.payload.expires_in || 0));
  return {
    accessToken,
    payload: {
      ...input.payload,
      ...response.payload,
      refresh_token: refreshToken,
    },
    expiresAt:
      expiresIn > 0
        ? new Date(now.getTime() + expiresIn * 1_000)
        : null,
    refreshedAt: now,
  };
}

export async function loadExportunityProviderConnection(input: {
  tenantId: number;
  integrationId?: unknown;
  connectionId?: unknown;
}) {
  const integrationId = asText(input.integrationId).toLowerCase();
  const connectionId = asText(input.connectionId);
  if (!connectionId && !isExportunityOAuthIntegrationId(integrationId)) {
    throw new Error("A valid Exportunity integration is required");
  }
  const connection = await db.query.exportunityIntegrationConnections.findFirst({
    where: and(
      eq(exportunityIntegrationConnections.tenantId, input.tenantId),
      ...(connectionId
        ? [eq(exportunityIntegrationConnections.id, connectionId)]
        : [
            eq(
              exportunityIntegrationConnections.integrationId,
              integrationId,
            ),
          ]),
      isNull(exportunityIntegrationConnections.revokedAt),
    ),
  });
  if (!connection || connection.status !== "connected") {
    throw new Error(
      "Connected Exportunity provider authorization was not found for this tenant",
    );
  }
  if (!isExportunityOAuthIntegrationId(connection.integrationId)) {
    throw new Error("Stored Exportunity provider integration is unsupported");
  }
  const expectedProvider = providerForExportunityIntegration(
    connection.integrationId,
  );
  if (connection.provider !== expectedProvider) {
    throw new Error("Stored Exportunity provider does not match its integration");
  }
  return connection;
}

export async function accessTokenForExportunityProviderConnection(
  connection: ExportunityProviderConnection,
  options: { fetchImpl?: ProviderFetch; now?: Date } = {},
) {
  const payload = decryptExportunityIntegrationTokenPayload({
    ciphertext: connection.tokenCiphertext,
    iv: connection.tokenIv,
    authTag: connection.tokenAuthTag,
  });
  const accessToken = asText(payload.access_token);
  if (!accessToken) {
    throw new Error("Stored Exportunity provider authorization has no access token");
  }
  const now = options.now || new Date();
  const expiresAt = connection.expiresAt
    ? new Date(connection.expiresAt)
    : null;
  if (
    !expiresAt ||
    expiresAt.getTime() > now.getTime() + ACCESS_TOKEN_REFRESH_SKEW_MS
  ) {
    return {
      accessToken,
      tokenRefreshed: false,
      tokenMeta: asRecord(connection.tokenMeta),
      expiresAt,
    };
  }
  if (connection.provider !== "google") {
    await db
      .update(exportunityIntegrationConnections)
      .set({ status: "reconnect_required", updatedAt: now })
      .where(
        and(
          eq(exportunityIntegrationConnections.tenantId, connection.tenantId),
          eq(exportunityIntegrationConnections.id, connection.id),
        ),
      );
    throw new Error(
      "Exportunity Meta authorization expired and must be reconnected",
    );
  }

  const refreshed = await refreshExportunityGoogleTokenPayload({
    payload,
    fetchImpl: options.fetchImpl,
    now,
  });
  const encrypted = encryptExportunityIntegrationTokenPayload(
    refreshed.payload,
  );
  const tokenMeta = {
    ...asRecord(connection.tokenMeta),
    hasRefreshToken: true,
    tokenRefreshedAt: refreshed.refreshedAt.toISOString(),
    credentialsExcluded: true,
  };
  await db.transaction(async (tx) => {
    await tx
      .update(exportunityIntegrationConnections)
      .set({
        tokenCiphertext: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        tokenMeta,
        expiresAt: refreshed.expiresAt,
        status: "connected",
        updatedAt: now,
      })
      .where(
        and(
          eq(exportunityIntegrationConnections.tenantId, connection.tenantId),
          eq(exportunityIntegrationConnections.id, connection.id),
        ),
      );
    await tx.insert(exportunityIntegrationAuditEvents).values({
      tenantId: connection.tenantId,
      connectionId: connection.id,
      integrationId: connection.integrationId,
      provider: connection.provider,
      eventType: "credential_refreshed",
      metadata: {
        refreshedAt: now.toISOString(),
        expiresAt: refreshed.expiresAt?.toISOString() || null,
        credentialsExcluded: true,
        providerMutationPerformed: false,
        externalActionPerformed: false,
      },
    });
  });
  return {
    accessToken: refreshed.accessToken,
    tokenRefreshed: true,
    tokenMeta,
    expiresAt: refreshed.expiresAt,
  };
}

async function verifyGoogleWorkspace(input: {
  accessToken: string;
  connection: ExportunityProviderConnection;
  fetchImpl: ProviderFetch;
  tokenRefreshed: boolean;
  checkedAt: Date;
}): Promise<ExportunityProviderVerification> {
  const [identity, gmail, calendar, drive] = await Promise.all([
    providerRequest({
      url: "https://openidconnect.googleapis.com/v1/userinfo",
      fetchImpl: input.fetchImpl,
      accessToken: input.accessToken,
    }),
    providerRequest({
      url: "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      fetchImpl: input.fetchImpl,
      accessToken: input.accessToken,
    }),
    providerRequest({
      url: "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1&minAccessRole=reader",
      fetchImpl: input.fetchImpl,
      accessToken: input.accessToken,
    }),
    providerRequest({
      url: "https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress),storageQuota(limit,usage)",
      fetchImpl: input.fetchImpl,
      accessToken: input.accessToken,
    }),
  ]);
  const grantedScopes = asScopes(input.connection.scopes);
  const missingScopes = missingExportunityProviderScopes({
    integrationId: EXPORTUNITY_GOOGLE_INTEGRATION_ID,
    grantedScopes,
  });
  const unexpectedScopes = unexpectedExportunityProviderScopes({
    integrationId: EXPORTUNITY_GOOGLE_INTEGRATION_ID,
    grantedScopes,
  });
  const checks = [
    verificationCheck({
      key: "identity",
      label: "Google identity",
      ok: identity.ok,
      status: identity.status,
      successDetail: "Google accepted the Exportunity company authorization.",
      failureDetail: identity.detail,
    }),
    verificationCheck({
      key: "gmail",
      label: "Gmail API",
      ok: gmail.ok,
      status: gmail.status,
      successDetail: "Gmail read access was verified without sending or changing a message.",
      failureDetail: gmail.detail,
    }),
    verificationCheck({
      key: "calendar",
      label: "Google Calendar API",
      ok: calendar.ok,
      status: calendar.status,
      successDetail: "Calendar access was verified without creating or changing an event.",
      failureDetail: calendar.detail,
    }),
    verificationCheck({
      key: "drive",
      label: "Google Drive API",
      ok: drive.ok,
      status: drive.status,
      successDetail: "Drive access was verified without creating, changing, or sharing a file.",
      failureDetail: drive.detail,
    }),
  ];
  const authorizationReady =
    missingScopes.length === 0 && unexpectedScopes.length === 0;
  const resourceReady = checks.every((check) => check.verified);
  return {
    integrationId: EXPORTUNITY_GOOGLE_INTEGRATION_ID,
    provider: "google",
    ready: authorizationReady && resourceReady,
    authorizationReady,
    resourceReady,
    checkedAt: input.checkedAt.toISOString(),
    mode: "read_only",
    credentialsNamespace: "EXPORTUNITY_",
    providerMutationPerformed: false,
    externalActionPerformed: false,
    tokenRefreshed: input.tokenRefreshed,
    requestedScopes: requiredScopes(EXPORTUNITY_GOOGLE_INTEGRATION_ID),
    grantedScopes,
    missingScopes,
    unexpectedScopes,
    checks,
    capabilities: {
      identity: identity.ok,
      gmail: gmail.ok,
      calendar: calendar.ok,
      drive: drive.ok,
    },
    warnings: [
      ...(missingScopes.length
        ? [`Google authorization is missing ${missingScopes.length} required read-only scope(s).`]
        : []),
      ...(unexpectedScopes.length
        ? [`Google returned ${unexpectedScopes.length} scope(s) outside the exact read-only contract; revoke the earlier grant before reconnecting.`]
        : []),
    ],
  };
}

async function verifyYouTube(input: {
  accessToken: string;
  connection: ExportunityProviderConnection;
  fetchImpl: ProviderFetch;
  tokenRefreshed: boolean;
  checkedAt: Date;
}): Promise<ExportunityProviderVerification> {
  const [identity, channels] = await Promise.all([
    providerRequest({
      url: "https://openidconnect.googleapis.com/v1/userinfo",
      fetchImpl: input.fetchImpl,
      accessToken: input.accessToken,
    }),
    providerRequest({
      url: "https://www.googleapis.com/youtube/v3/channels?part=id%2Csnippet%2Cstatus&mine=true&maxResults=50",
      fetchImpl: input.fetchImpl,
      accessToken: input.accessToken,
    }),
  ]);
  const grantedScopes = asScopes(input.connection.scopes);
  const missingScopes = missingExportunityProviderScopes({
    integrationId: EXPORTUNITY_YOUTUBE_INTEGRATION_ID,
    grantedScopes,
  });
  const unexpectedScopes = unexpectedExportunityProviderScopes({
    integrationId: EXPORTUNITY_YOUTUBE_INTEGRATION_ID,
    grantedScopes,
  });
  const channelRows = Array.isArray(channels.payload.items)
    ? channels.payload.items
    : [];
  const channelCount = channelRows.length;
  const checks = [
    verificationCheck({
      key: "identity",
      label: "Google identity",
      ok: identity.ok,
      status: identity.status,
      successDetail: "Google accepted the Exportunity YouTube authorization.",
      failureDetail: identity.detail,
    }),
    verificationCheck({
      key: "youtube_channels",
      label: "YouTube channels",
      ok: channels.ok,
      status: channels.status,
      attention: channels.ok && channelCount === 0,
      successDetail: `YouTube returned ${channelCount} owned channel target(s) without changing them.`,
      failureDetail: channels.ok
        ? "No YouTube channel is owned by the authorized account."
        : channels.detail,
    }),
  ];
  const authorizationReady =
    missingScopes.length === 0 && unexpectedScopes.length === 0;
  const resourceReady = identity.ok && channels.ok && channelCount > 0;
  return {
    integrationId: EXPORTUNITY_YOUTUBE_INTEGRATION_ID,
    provider: "google",
    ready: authorizationReady && resourceReady,
    authorizationReady,
    resourceReady,
    checkedAt: input.checkedAt.toISOString(),
    mode: "read_only",
    credentialsNamespace: "EXPORTUNITY_",
    providerMutationPerformed: false,
    externalActionPerformed: false,
    tokenRefreshed: input.tokenRefreshed,
    requestedScopes: requiredScopes(EXPORTUNITY_YOUTUBE_INTEGRATION_ID),
    grantedScopes,
    missingScopes,
    unexpectedScopes,
    checks,
    capabilities: {
      identity: identity.ok,
      youtube: channels.ok,
      channelCount,
      ownedChannel: channelCount > 0,
    },
    warnings: [
      ...(missingScopes.length
        ? [`YouTube authorization is missing ${missingScopes.length} required read-only scope(s).`]
        : []),
      ...(unexpectedScopes.length
        ? [`YouTube authorization returned ${unexpectedScopes.length} scope(s) outside the exact read-only contract.`]
        : []),
      ...(channels.ok && channelCount === 0
        ? ["No owned YouTube channel is available to this Google account."]
        : []),
    ],
  };
}

async function verifyMeta(input: {
  accessToken: string;
  connection: ExportunityProviderConnection;
  fetchImpl: ProviderFetch;
  tokenRefreshed: boolean;
  checkedAt: Date;
}): Promise<ExportunityProviderVerification> {
  const graphVersion = nativeEnv("META_GRAPH_VERSION");
  if (!/^v\d+\.\d+$/i.test(graphVersion)) {
    throw new Error(
      "EXPORTUNITY_META_GRAPH_VERSION must be pinned before Meta verification",
    );
  }
  const [identity, permissions, accounts] = await Promise.all([
    providerRequest({
      url: `https://graph.facebook.com/${graphVersion}/me?fields=id,name`,
      fetchImpl: input.fetchImpl,
      accessToken: input.accessToken,
    }),
    providerRequest({
      url: `https://graph.facebook.com/${graphVersion}/me/permissions`,
      fetchImpl: input.fetchImpl,
      accessToken: input.accessToken,
    }),
    providerRequest({
      url: `https://graph.facebook.com/${graphVersion}/me/accounts?fields=id,name,tasks,instagram_business_account{id,username}&limit=100`,
      fetchImpl: input.fetchImpl,
      accessToken: input.accessToken,
    }),
  ]);
  const permissionRows = Array.isArray(permissions.payload.data)
    ? permissions.payload.data.map(asRecord)
    : [];
  const providerScopes = permissionRows
    .filter((row) => asText(row.status).toLowerCase() === "granted")
    .map((row) => asText(row.permission))
    .filter(Boolean);
  const grantedScopes = permissions.ok
    ? asScopes(providerScopes)
    : asScopes(input.connection.scopes);
  const missingScopes = missingExportunityProviderScopes({
    integrationId: EXPORTUNITY_META_INTEGRATION_ID,
    grantedScopes,
  });
  const unexpectedScopes = unexpectedExportunityProviderScopes({
    integrationId: EXPORTUNITY_META_INTEGRATION_ID,
    grantedScopes,
  });
  const pages = Array.isArray(accounts.payload.data)
    ? accounts.payload.data.map(asRecord)
    : [];
  const pageCount = pages.length;
  const instagramBusinessAccountCount = pages.filter(
    (page) => asText(asRecord(page.instagram_business_account).id),
  ).length;
  const checks = [
    verificationCheck({
      key: "identity",
      label: "Meta identity",
      ok: identity.ok,
      status: identity.status,
      successDetail: "Meta accepted the Exportunity company authorization.",
      failureDetail: identity.detail,
    }),
    verificationCheck({
      key: "permissions",
      label: "Meta permissions",
      ok: permissions.ok,
      status: permissions.status,
      attention: permissions.ok && missingScopes.length > 0,
      successDetail: "Meta confirmed all currently requested permissions.",
      failureDetail: permissions.ok
        ? `${missingScopes.length} requested permission(s) are not granted.`
        : permissions.detail,
    }),
    verificationCheck({
      key: "pages",
      label: "Facebook Pages",
      ok: accounts.ok,
      status: accounts.status,
      attention: accounts.ok && pageCount === 0,
      successDetail: `Meta returned ${pageCount} company Page target(s) without changing them.`,
      failureDetail: accounts.ok
        ? "No company Page target is available to this authorization."
        : accounts.detail,
    }),
    verificationCheck({
      key: "instagram",
      label: "Instagram business accounts",
      ok: accounts.ok,
      status: accounts.status,
      attention: accounts.ok && instagramBusinessAccountCount === 0,
      successDetail: `Meta returned ${instagramBusinessAccountCount} Instagram business target(s) without changing them.`,
      failureDetail: accounts.ok
        ? "No Instagram business account is linked to the authorized Pages."
        : accounts.detail,
    }),
  ];
  const authorizationReady =
    permissions.ok &&
    missingScopes.length === 0 &&
    unexpectedScopes.length === 0;
  const resourceReady = identity.ok && accounts.ok && pageCount > 0;
  const warnings = [
    ...(missingScopes.length
      ? [`Meta authorization is missing ${missingScopes.length} requested permission(s).`]
      : []),
    ...(unexpectedScopes.length
      ? [`Meta returned ${unexpectedScopes.length} permission(s) outside the current contract.`]
      : []),
    ...(pageCount === 0
      ? ["No Facebook Page is currently available to the connected account."]
      : []),
    ...(instagramBusinessAccountCount === 0
      ? ["No Instagram business account is linked to an available Page."]
      : []),
  ];
  return {
    integrationId: EXPORTUNITY_META_INTEGRATION_ID,
    provider: "meta",
    ready: authorizationReady && resourceReady,
    authorizationReady,
    resourceReady,
    checkedAt: input.checkedAt.toISOString(),
    mode: "read_only",
    credentialsNamespace: "EXPORTUNITY_",
    providerMutationPerformed: false,
    externalActionPerformed: false,
    tokenRefreshed: input.tokenRefreshed,
    requestedScopes: requiredScopes(EXPORTUNITY_META_INTEGRATION_ID),
    grantedScopes,
    missingScopes,
    unexpectedScopes,
    checks,
    capabilities: {
      pageCount,
      instagramBusinessAccountCount,
      facebookPages: pageCount > 0,
      instagramBusiness: instagramBusinessAccountCount > 0,
    },
    warnings,
  };
}

export async function verifyExportunityProviderConnectionReadOnly(input: {
  tenantId: number;
  actorUserId: number | null;
  integrationId: ExportunityOAuthIntegrationId;
  fetchImpl?: ProviderFetch;
  now?: Date;
}) {
  const connection = await loadExportunityProviderConnection({
    tenantId: input.tenantId,
    integrationId: input.integrationId,
  });
  const checkedAt = input.now || new Date();
  const credential = await accessTokenForExportunityProviderConnection(
    connection,
    { fetchImpl: input.fetchImpl, now: checkedAt },
  );
  const verification =
    connection.integrationId === EXPORTUNITY_GOOGLE_INTEGRATION_ID
      ? await verifyGoogleWorkspace({
          accessToken: credential.accessToken,
          connection,
          fetchImpl: input.fetchImpl || fetch,
          tokenRefreshed: credential.tokenRefreshed,
          checkedAt,
        })
      : connection.integrationId === EXPORTUNITY_YOUTUBE_INTEGRATION_ID
        ? await verifyYouTube({
            accessToken: credential.accessToken,
            connection,
            fetchImpl: input.fetchImpl || fetch,
            tokenRefreshed: credential.tokenRefreshed,
            checkedAt,
          })
      : await verifyMeta({
          accessToken: credential.accessToken,
          connection,
          fetchImpl: input.fetchImpl || fetch,
          tokenRefreshed: credential.tokenRefreshed,
          checkedAt,
        });
  const nextTokenMeta = {
    ...credential.tokenMeta,
    scopeEvidenceVerified: true,
    authorizationReady: verification.authorizationReady,
    resourceReady: verification.resourceReady,
    requestedScopes: verification.requestedScopes,
    missingScopes: verification.missingScopes,
    unexpectedScopes: verification.unexpectedScopes,
    providerVerification: verification,
    credentialsExcluded: true,
  };
  const nextScopes =
    verification.provider === "meta"
      ? verification.grantedScopes
      : asScopes(connection.scopes);
  await db.transaction(async (tx) => {
    await tx
      .update(exportunityIntegrationConnections)
      .set({
        scopes: nextScopes,
        tokenMeta: nextTokenMeta,
        lastVerifiedAt: checkedAt,
        updatedAt: checkedAt,
      })
      .where(
        and(
          eq(exportunityIntegrationConnections.tenantId, input.tenantId),
          eq(exportunityIntegrationConnections.id, connection.id),
        ),
      );
    await tx.insert(exportunityIntegrationAuditEvents).values({
      tenantId: input.tenantId,
      connectionId: connection.id,
      actorUserId: input.actorUserId,
      integrationId: connection.integrationId,
      provider: connection.provider,
      eventType: "read_only_verification_completed",
      metadata: {
        verification,
        credentialsExcluded: true,
      },
    });
  });
  return verification;
}

export function storedExportunityProviderVerification(
  value: unknown,
  now = new Date(),
): ExportunityProviderVerification | null {
  const record = asRecord(value);
  const integrationId = asText(record.integrationId).toLowerCase();
  const provider = asText(record.provider).toLowerCase();
  const checkedAt = asText(record.checkedAt);
  const checkedAtMs = new Date(checkedAt).valueOf();
  if (
    !isExportunityOAuthIntegrationId(integrationId) ||
    providerForExportunityIntegration(integrationId) !== provider ||
    typeof record.ready !== "boolean" ||
    typeof record.authorizationReady !== "boolean" ||
    typeof record.resourceReady !== "boolean" ||
    record.mode !== "read_only" ||
    record.credentialsNamespace !== "EXPORTUNITY_" ||
    record.providerMutationPerformed !== false ||
    record.externalActionPerformed !== false ||
    typeof record.tokenRefreshed !== "boolean" ||
    !Number.isFinite(checkedAtMs)
  ) {
    return null;
  }
  const checks = Array.isArray(record.checks)
    ? record.checks
        .map((value) => asRecord(value))
        .filter(
          (check) =>
            asText(check.key) &&
            asText(check.label) &&
            typeof check.verified === "boolean" &&
            ["verified", "attention", "provider_error"].includes(
              asText(check.state),
            ),
        )
        .slice(0, 12)
        .map((check) => ({
          key: asText(check.key).slice(0, 80),
          label: asText(check.label).slice(0, 120),
          verified: check.verified === true,
          state: asText(check.state) as ExportunityProviderVerificationCheck["state"],
          providerStatus: asText(check.providerStatus).slice(0, 80) || null,
          detail: safeProviderDetail(check.detail, "Provider evidence unavailable"),
        }))
    : [];
  if (!checks.length) return null;
  const freshUntilMs = checkedAtMs + PROVIDER_EVIDENCE_TTL_MS;
  const capabilities = Object.fromEntries(
    Object.entries(asRecord(record.capabilities))
      .filter(([, item]) => typeof item === "boolean" || typeof item === "number")
      .slice(0, 20),
  ) as Record<string, boolean | number>;
  return {
    integrationId,
    provider: provider as "google" | "meta",
    ready: record.ready === true,
    authorizationReady: record.authorizationReady === true,
    resourceReady: record.resourceReady === true,
    checkedAt,
    mode: "read_only",
    credentialsNamespace: "EXPORTUNITY_",
    providerMutationPerformed: false,
    externalActionPerformed: false,
    tokenRefreshed: record.tokenRefreshed === true,
    requestedScopes: asScopes(record.requestedScopes),
    grantedScopes: asScopes(record.grantedScopes),
    missingScopes: asScopes(record.missingScopes),
    unexpectedScopes: asScopes(record.unexpectedScopes),
    checks,
    capabilities,
    warnings: Array.isArray(record.warnings)
      ? record.warnings
          .map((warning) => safeProviderDetail(warning, ""))
          .filter(Boolean)
          .slice(0, 20)
      : [],
    fresh:
      checkedAtMs <= now.getTime() + 5 * 60_000 &&
      now.getTime() <= freshUntilMs,
    freshUntil: new Date(freshUntilMs).toISOString(),
  };
}
