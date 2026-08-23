import crypto from "crypto";
import { Router } from "express";
import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { db } from "@db";
import {
  exportunityIntegrationAuditEvents,
  exportunityIntegrationConnections,
  exportunityIntegrationOauthStates,
} from "@db/schema";
import { ensureExportunityIntegrationTables } from "../lib/exportunity/integrations/ensureTables";
import {
  EXPORTUNITY_GOOGLE_CALLBACK_PATH,
  EXPORTUNITY_GOOGLE_INTEGRATION_ID,
  EXPORTUNITY_GOOGLE_REQUIRED_APIS,
  EXPORTUNITY_META_CALLBACK_PATH,
  EXPORTUNITY_META_INTEGRATION_ID,
  EXPORTUNITY_YOUTUBE_INTEGRATION_ID,
  EXPORTUNITY_YOUTUBE_REQUIRED_APIS,
  isExportunityOAuthIntegrationId,
  providerForExportunityIntegration,
  scopesForExportunityIntegration,
  type ExportunityOAuthIntegrationId,
} from "../lib/exportunity/integrations/providerContracts";
import {
  exportunityProviderScopeContract,
  missingExportunityProviderScopes,
  storedExportunityProviderVerification,
  unexpectedExportunityProviderScopes,
  verifyExportunityProviderConnectionReadOnly,
} from "../lib/exportunity/integrations/providerAccess";
import { encryptExportunityIntegrationTokenPayload } from "../lib/exportunity/integrations/tokenVault";
import { getExportunityTwilioReadiness } from "../lib/exportunity/integrations/twilioReadiness";
import {
  getExportunityTwilioConfigurationFingerprint,
  toExportunityTwilioPublicVerification,
  verifyExportunityTwilioReadOnly,
  type ExportunityTwilioPublicVerification,
  type ExportunityTwilioVerificationCheck,
} from "../lib/exportunity/integrations/twilioVerification";
import { ensureTenantAdmin, ensureTenantStaff } from "./utils/auth";
import {
  approveActionRequest,
  createActionRequest,
} from "../lib/actions/ActionRouter";
import {
  authorizeExportunityOwnerTest,
  exportunityOwnerTestRecipients,
  publicExportunityOwnerTestPolicy,
  type ExportunityOwnerTestChannel,
} from "../lib/exportunity/outreach/ownerTestPolicy";

const router = Router();

const DEFAULT_RETURN_TO = "/admin/exportunity/integrations";
const OAUTH_STATE_TTL_MS = 10 * 60_000;
const PROVIDER_TIMEOUT_MS = 15_000;
const TWILIO_PROVIDER_EVIDENCE_TTL_MS = 7 * 24 * 60 * 60_000;

type OAuthExchange = {
  provider: "google" | "meta";
  tokenPayload: Record<string, unknown>;
  scopes: string[];
  accountLabel: string | null;
  tokenMeta: Record<string, unknown>;
  expiresAt: Date | null;
};

type ConnectionRow = typeof exportunityIntegrationConnections.$inferSelect;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function compactRecord(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) => item !== undefined && item !== null && item !== "",
    ),
  );
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function storedTwilioCheck(
  value: unknown,
): ExportunityTwilioVerificationCheck | null {
  const check = recordValue(value);
  if (!check) return null;
  const state = text(check.state);
  if (
    typeof check.configured !== "boolean" ||
    typeof check.verified !== "boolean" ||
    ![
      "not_configured",
      "verified",
      "unverified",
      "provider_error",
    ].includes(state) ||
    !(
      check.identifier === null ||
      (typeof check.identifier === "string" && check.identifier.length <= 80)
    ) ||
    !(
      check.providerStatus === null ||
      (typeof check.providerStatus === "string" &&
        check.providerStatus.length <= 80)
    ) ||
    typeof check.detail !== "string" ||
    check.detail.length > 320
  ) {
    return null;
  }
  return {
    configured: check.configured,
    verified: check.verified,
    state: state as ExportunityTwilioVerificationCheck["state"],
    identifier: check.identifier,
    providerStatus: check.providerStatus,
    detail: check.detail,
  };
}

function storedTwilioVerification(
  value: unknown,
): ExportunityTwilioPublicVerification | null {
  const verification = recordValue(value);
  const checks = recordValue(verification?.checks);
  const account = storedTwilioCheck(checks?.account);
  const sms = storedTwilioCheck(checks?.sms);
  const messagingService = storedTwilioCheck(checks?.messagingService);
  const whatsapp = storedTwilioCheck(checks?.whatsapp);
  const checkedAt = text(verification?.checkedAt);
  const checkedAtMs = new Date(checkedAt).valueOf();
  if (
    !verification ||
    typeof verification.ready !== "boolean" ||
    verification.mode !== "read_only" ||
    verification.credentialsNamespace !== "EXPORTUNITY_" ||
    verification.externalActionPerformed !== false ||
    verification.messageSent !== false ||
    !Number.isFinite(checkedAtMs) ||
    !account ||
    !sms ||
    !messagingService ||
    !whatsapp
  ) {
    return null;
  }
  const warnings = Array.isArray(verification.warnings)
    ? verification.warnings
        .filter(
          (warning): warning is string =>
            typeof warning === "string" && warning.length <= 320,
        )
        .slice(0, 20)
    : [];
  return {
    ready: verification.ready,
    checkedAt,
    mode: "read_only",
    credentialsNamespace: "EXPORTUNITY_",
    externalActionPerformed: false,
    messageSent: false,
    checks: { account, sms, messagingService, whatsapp },
    warnings,
  };
}

function latestTwilioProviderEvidence(
  events: Array<{ metadata: unknown }>,
) {
  const currentFingerprint =
    getExportunityTwilioConfigurationFingerprint();
  for (const event of events) {
    const metadata = recordValue(event.metadata);
    if (
      !metadata ||
      text(metadata.configurationFingerprint) !== currentFingerprint
    ) {
      continue;
    }
    const verification = storedTwilioVerification(metadata.verification);
    if (!verification) continue;
    const checkedAtMs = new Date(verification.checkedAt).valueOf();
    const freshUntilMs = checkedAtMs + TWILIO_PROVIDER_EVIDENCE_TTL_MS;
    return {
      ...verification,
      fresh:
        checkedAtMs <= Date.now() + 5 * 60_000 && Date.now() <= freshUntilMs,
      freshUntil: new Date(freshUntilMs).toISOString(),
    };
  }
  return null;
}

function normalizeScopeList(
  value: unknown,
  fallback: readonly string[] = [],
): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(value.map((item) => text(item)).filter(Boolean)),
    );
  }
  const parsed = String(value || "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length ? Array.from(new Set(parsed)) : [...fallback];
}

function toPositiveInteger(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function resolveExportunityTenant(req: any, res: any) {
  const tenant = req?.tenant;
  if (
    !tenant?.id ||
    String(tenant?.key || "").trim().toLowerCase() !== "exportunity"
  ) {
    res.status(404).json({
      ok: false,
      message: "Exportunity integrations are available only on the Exportunity tenant.",
    });
    return null;
  }
  return tenant;
}

function actorId(req: any) {
  const value = Number(req?.adminUser?.id || req?.staffUser?.id || 0);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function safeReturnTo(value: unknown) {
  const raw = text(value) || DEFAULT_RETURN_TO;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return DEFAULT_RETURN_TO;
}

function requestOrigin(req: any) {
  const configured = text(
    process.env.EXPORTUNITY_APP_URL || process.env.EXPORTUNITY_PUBLIC_URL,
  );
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("unsupported_protocol");
      }
      return parsed.origin;
    } catch {
      throw new Error("EXPORTUNITY_APP_URL must be an absolute HTTP(S) URL");
    }
  }
  if (process.env.NODE_ENV === "production") return "https://exportunity.net";
  const forwardedProto = text(req.headers?.["x-forwarded-proto"])
    .split(",")[0]
    ?.trim();
  const forwardedHost = text(req.headers?.["x-forwarded-host"])
    .split(",")[0]
    ?.trim();
  const protocol = forwardedProto || req.protocol || "http";
  const host = forwardedHost || req.get?.("host") || req.headers?.host;
  if (!host) throw new Error("Unable to resolve the Exportunity application origin");
  return `${protocol}://${host}`;
}

function readExportunityEnv(key: string) {
  return text(process.env[`EXPORTUNITY_${key}`]);
}

function looksPlaceholder(value: string) {
  return (
    !value ||
    /(?:changeme|replace|example|placeholder|your[_-]?|xxxx+|\.\.\.)/i.test(
      value,
    )
  );
}

function configuredExportunityEnv(key: string) {
  return !looksPlaceholder(readExportunityEnv(key));
}

function missingExportunityEnv(keys: readonly string[]) {
  return keys
    .filter((key) => !configuredExportunityEnv(key))
    .map((key) => `EXPORTUNITY_${key}`);
}

function stateDigest(rawState: string) {
  return crypto.createHash("sha256").update(rawState).digest("hex");
}

function decodeJwtPayload(token: unknown): Record<string, unknown> | null {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

async function providerJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return { response, payload };
}

function providerErrorMessage(
  payload: Record<string, unknown>,
  fallback: string,
) {
  const nested =
    payload.error && typeof payload.error === "object"
      ? (payload.error as Record<string, unknown>)
      : null;
  return (
    text(payload.error_description) ||
    text(nested?.message) ||
    (typeof payload.error === "string" ? text(payload.error) : "") ||
    fallback
  );
}

async function exchangeGoogleCode(input: {
  code: string;
  origin: string;
  integrationId: ExportunityOAuthIntegrationId;
}): Promise<OAuthExchange> {
  const clientId = readExportunityEnv("GOOGLE_CLIENT_ID");
  const clientSecret = readExportunityEnv("GOOGLE_CLIENT_SECRET");
  const redirectUri = `${input.origin}${EXPORTUNITY_GOOGLE_CALLBACK_PATH}`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const { response, payload } = await providerJson(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  if (!response.ok || !text(payload.access_token)) {
    throw new Error(
      `Google OAuth token exchange failed: ${providerErrorMessage(payload, `HTTP ${response.status}`)}`,
    );
  }
  const idPayload = decodeJwtPayload(payload.id_token);
  const scopes = normalizeScopeList(payload.scope);
  const missingScopes = missingExportunityProviderScopes({
    integrationId: input.integrationId,
    grantedScopes: scopes,
  });
  const unexpectedScopes = unexpectedExportunityProviderScopes({
    integrationId: input.integrationId,
    grantedScopes: scopes,
  });
  if (missingScopes.length || unexpectedScopes.length) {
    throw new Error(
      unexpectedScopes.length
        ? "Google returned permissions outside Exportunity's exact read-only contract. Revoke the earlier Google project grant, then reconnect."
        : `Google did not grant ${missingScopes.length} required read-only permission(s).`,
    );
  }
  const accountEmail = text(idPayload?.email);
  const accountName = text(idPayload?.name);
  const expiresIn = toPositiveInteger(payload.expires_in);
  const isYouTube = input.integrationId === EXPORTUNITY_YOUTUBE_INTEGRATION_ID;
  return {
    provider: "google",
    tokenPayload: payload,
    scopes,
    accountLabel:
      accountEmail ||
      accountName ||
      (isYouTube ? "YouTube account" : "Google Workspace account"),
    tokenMeta: compactRecord({
      tokenType: text(payload.token_type),
      accountEmail,
      accountName,
      hasRefreshToken: Boolean(text(payload.refresh_token)),
      scopeEvidenceVerified: scopes.length > 0,
      scopeEvidenceSource: "google_token_response",
      requestedScopes: [...scopesForExportunityIntegration(input.integrationId)],
      missingScopes,
      unexpectedScopes,
      credentialsExcluded: true,
      capabilities: isYouTube
        ? {
            youtube: scopes.includes(
              "https://www.googleapis.com/auth/youtube.readonly",
            ),
          }
        : {
            gmail: scopes.includes(
              "https://www.googleapis.com/auth/gmail.readonly",
            ),
            calendar: scopes.includes(
              "https://www.googleapis.com/auth/calendar.readonly",
            ),
            drive: scopes.includes(
              "https://www.googleapis.com/auth/drive.readonly",
            ),
          },
    }),
    expiresAt: expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : null,
  };
}

async function exchangeMetaCode(input: {
  code: string;
  origin: string;
}): Promise<OAuthExchange> {
  const appId = readExportunityEnv("META_APP_ID");
  const appSecret = readExportunityEnv("META_APP_SECRET");
  const graphVersion = readExportunityEnv("META_GRAPH_VERSION") || "v25.0";
  const redirectUri = `${input.origin}${EXPORTUNITY_META_CALLBACK_PATH}`;
  const exchangeUrl = new URL(
    `https://graph.facebook.com/${graphVersion}/oauth/access_token`,
  );
  exchangeUrl.searchParams.set("client_id", appId);
  exchangeUrl.searchParams.set("client_secret", appSecret);
  exchangeUrl.searchParams.set("redirect_uri", redirectUri);
  exchangeUrl.searchParams.set("code", input.code);

  const initial = await providerJson(exchangeUrl.toString());
  if (!initial.response.ok || !text(initial.payload.access_token)) {
    throw new Error(
      `Meta OAuth token exchange failed: ${providerErrorMessage(initial.payload, `HTTP ${initial.response.status}`)}`,
    );
  }

  let tokenPayload = initial.payload;
  try {
    const longLivedUrl = new URL(
      `https://graph.facebook.com/${graphVersion}/oauth/access_token`,
    );
    longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
    longLivedUrl.searchParams.set("client_id", appId);
    longLivedUrl.searchParams.set("client_secret", appSecret);
    longLivedUrl.searchParams.set(
      "fb_exchange_token",
      text(initial.payload.access_token),
    );
    const longLived = await providerJson(longLivedUrl.toString());
    if (longLived.response.ok && text(longLived.payload.access_token)) {
      tokenPayload = { ...initial.payload, ...longLived.payload };
    }
  } catch {
    // A valid short-lived token is still usable; status exposes its expiry.
  }

  const accessToken = text(tokenPayload.access_token);
  let profile: Record<string, unknown> = {};
  let grantedScopes: string[] = [];
  let pageCount = 0;
  let instagramBusinessAccountCount = 0;

  try {
    const profileUrl = new URL(`https://graph.facebook.com/${graphVersion}/me`);
    profileUrl.searchParams.set("fields", "id,name");
    profileUrl.searchParams.set("access_token", accessToken);
    const result = await providerJson(profileUrl.toString());
    if (result.response.ok) profile = result.payload;
  } catch {
    profile = {};
  }

  try {
    const permissionsUrl = new URL(
      `https://graph.facebook.com/${graphVersion}/me/permissions`,
    );
    permissionsUrl.searchParams.set("access_token", accessToken);
    const result = await providerJson(permissionsUrl.toString());
    const rows = Array.isArray(result.payload.data) ? result.payload.data : [];
    grantedScopes = rows
      .filter(
        (row: any) =>
          row &&
          typeof row === "object" &&
          String(row.status || "").toLowerCase() === "granted",
      )
      .map((row: any) => text(row.permission))
      .filter(Boolean);
  } catch {
    grantedScopes = [];
  }

  try {
    const accountsUrl = new URL(
      `https://graph.facebook.com/${graphVersion}/me/accounts`,
    );
    accountsUrl.searchParams.set(
      "fields",
      "id,name,instagram_business_account",
    );
    accountsUrl.searchParams.set("access_token", accessToken);
    const result = await providerJson(accountsUrl.toString());
    const rows = Array.isArray(result.payload.data) ? result.payload.data : [];
    pageCount = rows.length;
    instagramBusinessAccountCount = rows.filter(
      (row: any) => row?.instagram_business_account?.id,
    ).length;
  } catch {
    pageCount = 0;
    instagramBusinessAccountCount = 0;
  }

  const scopes = normalizeScopeList(grantedScopes);
  const accountName = text(profile.name);
  const expiresIn = toPositiveInteger(tokenPayload.expires_in);
  return {
    provider: "meta",
    tokenPayload,
    scopes,
    accountLabel: accountName || "Meta Business account",
    tokenMeta: compactRecord({
      tokenType: text(tokenPayload.token_type),
      accountName,
      hasRefreshToken: false,
      pageCount,
      instagramBusinessAccountCount,
      permissionsVerified: grantedScopes.length > 0,
      scopeEvidenceVerified: grantedScopes.length > 0,
      scopeEvidenceSource: "meta_permissions_edge",
      credentialsExcluded: true,
    }),
    expiresAt: expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : null,
  };
}

async function createOauthState(input: {
  tenantId: number;
  actorUserId: number;
  integrationId: ExportunityOAuthIntegrationId;
  provider: "google" | "meta";
  returnTo: string;
}) {
  const rawState = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
  await db.insert(exportunityIntegrationOauthStates).values({
    stateDigest: stateDigest(rawState),
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    integrationId: input.integrationId,
    provider: input.provider,
    returnTo: input.returnTo,
    expiresAt,
  });
  return { rawState, expiresAt };
}

async function consumeOauthState(input: {
  rawState: string;
  tenantId: number;
  provider: "google" | "meta";
}) {
  const digest = stateDigest(input.rawState);
  const now = new Date();
  const [state] = await db
    .update(exportunityIntegrationOauthStates)
    .set({ consumedAt: now })
    .where(
      and(
        eq(exportunityIntegrationOauthStates.stateDigest, digest),
        eq(exportunityIntegrationOauthStates.tenantId, input.tenantId),
        eq(exportunityIntegrationOauthStates.provider, input.provider),
        isNull(exportunityIntegrationOauthStates.consumedAt),
        gt(exportunityIntegrationOauthStates.expiresAt, now),
      ),
    )
    .returning();
  return state || null;
}

async function recordAudit(input: {
  tenantId: number;
  actorUserId?: number | null;
  connectionId?: string | null;
  integrationId: string;
  provider: string;
  eventType: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(exportunityIntegrationAuditEvents).values({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId || null,
    connectionId: input.connectionId || null,
    integrationId: input.integrationId,
    provider: input.provider,
    eventType: input.eventType,
    metadata: input.metadata || {},
  });
}

async function saveConnection(input: {
  tenantId: number;
  actorUserId: number | null;
  integrationId: ExportunityOAuthIntegrationId;
  exchange: OAuthExchange;
}) {
  const encrypted = encryptExportunityIntegrationTokenPayload(
    input.exchange.tokenPayload,
  );
  const now = new Date();
  const [connection] = await db
    .insert(exportunityIntegrationConnections)
    .values({
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      provider: input.exchange.provider,
      accountLabel: input.exchange.accountLabel,
      status: "connected",
      scopes: input.exchange.scopes,
      tokenCiphertext: encrypted.ciphertext,
      tokenIv: encrypted.iv,
      tokenAuthTag: encrypted.authTag,
      tokenMeta: input.exchange.tokenMeta,
      expiresAt: input.exchange.expiresAt,
      lastVerifiedAt: now,
      revokedAt: null,
      connectedByUserId: input.actorUserId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        exportunityIntegrationConnections.tenantId,
        exportunityIntegrationConnections.integrationId,
      ],
      set: {
        provider: input.exchange.provider,
        accountLabel: input.exchange.accountLabel,
        status: "connected",
        scopes: input.exchange.scopes,
        tokenCiphertext: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        tokenMeta: input.exchange.tokenMeta,
        expiresAt: input.exchange.expiresAt,
        lastVerifiedAt: now,
        revokedAt: null,
        connectedByUserId: input.actorUserId,
        updatedAt: now,
      },
    })
    .returning();
  await recordAudit({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    connectionId: connection.id,
    integrationId: input.integrationId,
    provider: input.exchange.provider,
    eventType: "connection_completed",
    metadata: {
      scopes: input.exchange.scopes,
      accountLabel: input.exchange.accountLabel,
      expiresAt: input.exchange.expiresAt?.toISOString() || null,
    },
  });
  return connection;
}

function connectionProjection(connection?: ConnectionRow | null) {
  if (!connection || connection.revokedAt) {
    return {
      connected: false,
      accountLabel: null,
      scopes: [] as string[],
      connectedAt: null,
      lastVerifiedAt: null,
      expiresAt: null,
      reconnectRequired: false,
      operationalReady: false,
      providerVerification: null,
      scopeContract: {
        ready: false,
        missingScopes: [] as string[],
        unexpectedScopes: [] as string[],
      },
    };
  }
  const connectionStatus = String(connection.status).trim().toLowerCase();
  const tokenMeta = recordValue(connection.tokenMeta) || {};
  const providerVerification = storedExportunityProviderVerification(
    tokenMeta.providerVerification,
  );
  const integrationId = text(connection.integrationId).toLowerCase();
  const scopeContract = isExportunityOAuthIntegrationId(integrationId)
    ? exportunityProviderScopeContract({
        integrationId,
        grantedScopes: connection.scopes,
      })
    : {
        ready: false,
        missingScopes: ["unsupported_integration"],
        unexpectedScopes: [],
      };
  const scopeContractReady = scopeContract.ready;
  const expiresAtMs = connection.expiresAt
    ? new Date(connection.expiresAt).getTime()
    : 0;
  const expired = expiresAtMs > 0 && expiresAtMs <= Date.now();
  const canRefresh = tokenMeta.hasRefreshToken === true;
  const reconnectRequired =
    connectionStatus === "reconnect_required" ||
    (expired && !canRefresh) ||
    !scopeContractReady;
  const connected = connectionStatus === "connected" && !reconnectRequired;
  const operationalReady = Boolean(
    connected &&
      scopeContractReady &&
      providerVerification?.fresh &&
      providerVerification.ready,
  );
  return {
    connected,
    accountLabel: connection.accountLabel || null,
    scopes: Array.isArray(connection.scopes) ? connection.scopes : [],
    connectedAt: connection.createdAt?.toISOString?.() || null,
    lastVerifiedAt: connection.lastVerifiedAt?.toISOString?.() || null,
    expiresAt: connection.expiresAt?.toISOString?.() || null,
    reconnectRequired,
    operationalReady,
    providerVerification,
    scopeContract: {
      ...scopeContract,
    },
  };
}

function oauthRuntime(
  integrationId: ExportunityOAuthIntegrationId,
  connection?: ConnectionRow | null,
) {
  const provider = providerForExportunityIntegration(integrationId);
  const envKeys =
    provider === "google"
      ? [
          "GOOGLE_CLIENT_ID",
          "GOOGLE_CLIENT_SECRET",
          "INTEGRATION_SECRET",
        ]
      : [
          "META_APP_ID",
          "META_APP_SECRET",
          "META_LOGIN_CONFIGURATION_ID",
          "META_GRAPH_VERSION",
          "INTEGRATION_SECRET",
        ];
  const missingEnv = missingExportunityEnv(envKeys);
  const projection = connectionProjection(connection);
  const callbackPath =
    provider === "google"
      ? EXPORTUNITY_GOOGLE_CALLBACK_PATH
      : EXPORTUNITY_META_CALLBACK_PATH;
  const configured = missingEnv.length === 0;
  const label =
    integrationId === EXPORTUNITY_GOOGLE_INTEGRATION_ID
      ? "Google Workspace — read only"
      : integrationId === EXPORTUNITY_YOUTUBE_INTEGRATION_ID
        ? "YouTube channel — read only"
        : "Meta Business";
  return {
    id: integrationId,
    label,
    provider,
    configured,
    ...projection,
    ready: configured && projection.connected,
    status: !configured
      ? "setup_needed"
      : projection.reconnectRequired
        ? "reconnect_required"
        : projection.connected
          ? "connected"
          : "authorization_required",
    requiredEnv: envKeys.map((key) => `EXPORTUNITY_${key}`),
    missingEnv,
    callbackPath,
    authorizePath: `/api/exportunity/integrations/${integrationId}/authorize`,
    requestedScopes: [...scopesForExportunityIntegration(integrationId)],
    requiredApis:
      integrationId === EXPORTUNITY_GOOGLE_INTEGRATION_ID
        ? [...EXPORTUNITY_GOOGLE_REQUIRED_APIS]
        : integrationId === EXPORTUNITY_YOUTUBE_INTEGRATION_ID
          ? [...EXPORTUNITY_YOUTUBE_REQUIRED_APIS]
          : [],
    capabilities:
      integrationId === EXPORTUNITY_GOOGLE_INTEGRATION_ID
        ? ["gmail", "calendar", "drive"]
        : integrationId === EXPORTUNITY_YOUTUBE_INTEGRATION_ID
          ? ["youtube_channels"]
          : ["facebook_pages", "instagram_business"],
    note:
      provider === "meta"
        ? "The current permission contract supports page/Instagram discovery, engagement metadata, and comment management. It does not claim post publishing or advertising-spend authority."
        : integrationId === EXPORTUNITY_YOUTUBE_INTEGRATION_ID
          ? "This grant reads owned-channel identity only. It cannot upload, edit, delete, or publish a video."
          : "This grant reads Gmail, Calendar, and Drive evidence only. It cannot send, modify, create, delete, or share provider data.",
  };
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCallbackPage(
  res: any,
  input: {
    status: number;
    title: string;
    detail: string;
    integrationId?: string | null;
    accountLabel?: string | null;
    returnTo?: string | null;
  },
) {
  const returnTo = safeReturnTo(input.returnTo);
  return res
    .status(input.status)
    .type("html")
    .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${htmlEscape(input.title)}</title>
    <style>
      body { margin: 0; font-family: Inter, system-ui, -apple-system, Segoe UI, sans-serif; background: #f6f4ec; color: #11261f; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      section { width: min(560px, 100%); box-sizing: border-box; border: 1px solid #d8d4c7; border-radius: 22px; background: white; padding: 30px; box-shadow: 0 24px 80px rgba(17,38,31,.12); }
      h1 { margin: 0 0 12px; font-size: 25px; line-height: 1.2; }
      p { margin: 0 0 18px; color: #53635c; line-height: 1.6; }
      a { display: inline-flex; border-radius: 999px; background: #146c43; color: white; padding: 11px 18px; text-decoration: none; font-weight: 750; font-size: 14px; }
      code { background: #eef3ed; border-radius: 8px; padding: 2px 6px; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${htmlEscape(input.title)}</h1>
        ${input.integrationId ? `<p><strong>Integration:</strong> <code>${htmlEscape(input.integrationId)}</code></p>` : ""}
        ${input.accountLabel ? `<p><strong>Account:</strong> <code>${htmlEscape(input.accountLabel)}</code></p>` : ""}
        <p>${htmlEscape(input.detail)}</p>
        <a href="${htmlEscape(returnTo)}">Return to Exportunity</a>
      </section>
    </main>
  </body>
</html>`);
}

router.get("/status", ensureTenantStaff, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  try {
    await ensureExportunityIntegrationTables();
    const [connections, twilioVerificationEvents] = await Promise.all([
      db.query.exportunityIntegrationConnections.findMany({
        where: and(
          eq(exportunityIntegrationConnections.tenantId, tenant.id),
          isNull(exportunityIntegrationConnections.revokedAt),
        ),
        orderBy: [desc(exportunityIntegrationConnections.updatedAt)],
      }),
      db.query.exportunityIntegrationAuditEvents.findMany({
        where: and(
          eq(exportunityIntegrationAuditEvents.tenantId, tenant.id),
          eq(exportunityIntegrationAuditEvents.integrationId, "twilio"),
          eq(
            exportunityIntegrationAuditEvents.eventType,
            "read_only_verification_completed",
          ),
        ),
        orderBy: [desc(exportunityIntegrationAuditEvents.createdAt)],
        limit: 20,
      }),
    ]);
    const byId = new Map(
      connections.map((connection) => [connection.integrationId, connection]),
    );
    const twilio = getExportunityTwilioReadiness();
    const providerVerification = latestTwilioProviderEvidence(
      twilioVerificationEvents,
    );
    const freshProviderEvidence = providerVerification?.fresh === true;
    const twilioReady = freshProviderEvidence
      ? providerVerification.ready
      : twilio.ready;
    const smsVerified = freshProviderEvidence
      ? providerVerification.checks.sms.verified
      : twilio.smsVerified;
    const whatsappVerified = freshProviderEvidence
      ? providerVerification.checks.whatsapp.verified
      : twilio.whatsappVerified;
    return res.json({
      ok: true,
      tenant: { key: "exportunity" },
      namespace: {
        api: "/api/exportunity/integrations",
        storage: "exportunity_integration_*",
        credentials: "EXPORTUNITY_*",
        isolatedProductState: true,
      },
      outreachTest: publicExportunityOwnerTestPolicy(),
      integrations: {
        google_workspace: oauthRuntime(
          EXPORTUNITY_GOOGLE_INTEGRATION_ID,
          byId.get(EXPORTUNITY_GOOGLE_INTEGRATION_ID),
        ),
        youtube: oauthRuntime(
          EXPORTUNITY_YOUTUBE_INTEGRATION_ID,
          byId.get(EXPORTUNITY_YOUTUBE_INTEGRATION_ID),
        ),
        meta_business: oauthRuntime(
          EXPORTUNITY_META_INTEGRATION_ID,
          byId.get(EXPORTUNITY_META_INTEGRATION_ID),
        ),
        twilio: {
          id: "twilio",
          label: "Twilio Messaging",
          provider: "twilio",
          ...twilio,
          ready: twilioReady,
          status: twilioReady
            ? "verified"
            : twilio.status === "verified"
              ? "configured_unverified"
              : twilio.status,
          smsVerified,
          whatsappVerified,
          providerVerification,
          note: "No message is sent by this readiness check. Configuration alone is not treated as production verification, and outbound messaging remains approval-gated.",
        },
      },
    });
  } catch (error: any) {
    console.error(
      "[Exportunity integrations] status failed",
      text(error?.message),
    );
    return res.status(500).json({
      ok: false,
      message: error?.message || "Exportunity integration status could not be loaded.",
    });
  }
});

router.post("/outreach-test/queue", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const userId = actorId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, message: "Admin identity required." });
  }
  const channel = text(req.body?.channel).toLowerCase();
  if (!(["email", "sms", "whatsapp"] as const).includes(channel as any)) {
    return res.status(400).json({
      ok: false,
      message: "Owner outreach tests support email, SMS, or WhatsApp.",
    });
  }
  const ownerChannel = channel as ExportunityOwnerTestChannel;
  const requestedRecipientIndex = Number(req.body?.recipientIndex);
  const hasRecipientIndex =
    req.body?.recipientIndex !== undefined &&
    Number.isInteger(requestedRecipientIndex) &&
    requestedRecipientIndex >= 0;
  const recipient = hasRecipientIndex
    ? exportunityOwnerTestRecipients(ownerChannel)[requestedRecipientIndex] || ""
    : text(req.body?.to || req.body?.recipient);
  if (!recipient) {
    return res.status(400).json({
      ok: false,
      message:
        "The selected owner test destination is not available on the server-side allowlist.",
      code: "owner_test_destination_unavailable",
    });
  }
  const ownerPayload = {
    ownerOnlyTest: true,
    outreachTestMode: "owner_only",
  };
  const authorization = authorizeExportunityOwnerTest({
    tenantKey: "exportunity",
    channel: ownerChannel,
    payload: ownerPayload,
    recipients: [recipient],
  });
  if (!authorization.authorized) {
    return res.status(403).json({
      ok: false,
      message:
        "The destination is not on the server-side Exportunity owner test allowlist.",
      code: authorization.reason,
    });
  }
  if (!authorization.channelEnabled) {
    return res.status(409).json({
      ok: false,
      message:
        "This owner-only test channel is disabled until its provider sender is verified.",
      code: authorization.reason,
    });
  }

  const requestedMessage = text(req.body?.message).slice(0, 600);
  const timestamp = new Date().toISOString();
  const message = [
    `[Exportunity internal owner test · ${ownerChannel.toUpperCase()}]`,
    requestedMessage ||
      "This message confirms that the governed Exportunity outreach channel reached its owner-only test destination.",
    `Test time: ${timestamp}`,
  ].join("\n\n");
  const agentKey =
    text(process.env.EXPORTUNITY_OUTREACH_TEST_AGENT_KEY) || "commercial";
  const commonPayload = {
    ...ownerPayload,
    agentKey,
    communicationPurpose: "service_update",
    contactBasis: "explicit_opt_in",
    commitmentRisk: "none",
    optInEvidence:
      "Exportunity owner explicitly authorized internal channel tests on 2026-08-22.",
    recipientProvenance: {
      verificationStatus: "verified",
      source: "exportunity_owner_test_allowlist",
    },
    recipientTimeZone: "Africa/Abidjan",
    source: "api.exportunity.integrations.outreach_test",
  };

  try {
    const action = await createActionRequest({
      tenantId: tenant.id,
      requestedByUserId: userId,
      requestedByAgentKey: agentKey,
      actionType:
        ownerChannel === "email"
          ? "SEND_EMAIL"
          : ownerChannel === "sms"
            ? "SEND_SMS"
            : "SEND_WHATSAPP",
      payload:
        ownerChannel === "email"
          ? {
              ...commonPayload,
              to: [recipient],
              subject: `[Exportunity internal owner test] Email · ${timestamp}`,
              body: { text: message },
            }
          : {
              ...commonPayload,
              toE164: recipient,
              body: message,
              mode: "text",
              ...(ownerChannel === "whatsapp"
                ? {
                    whatsappSessionActive: ["1", "true", "yes", "on"].includes(
                      text(
                        process.env
                          .EXPORTUNITY_OUTREACH_TEST_WHATSAPP_SESSION_ACTIVE,
                      ).toLowerCase(),
                    ),
                  }
                : {}),
            },
      mode: "REAL",
      priority: 90,
      idempotencyKey: `exportunity-owner-test:${ownerChannel}:${crypto.randomUUID()}`,
      correlationId: `exportunity-owner-test:${crypto.randomUUID()}`,
      metadata: {
        ownerOnlyTest: true,
        outreachTestMode: "owner_only",
        destinationDigest: crypto
          .createHash("sha256")
          .update(`${ownerChannel}:${recipient}`)
          .digest("hex"),
        requestedAt: timestamp,
      },
      isAdmin: true,
    });
    const approved =
      String(action.status || "").toUpperCase() === "REQUIRES_APPROVAL"
        ? await approveActionRequest({
            tenantId: tenant.id,
            actionRequestId: Number(action.id),
            approvedByUserId: userId,
          })
        : action;
    if (String(approved.status || "").toUpperCase() === "FAILED") {
      return res.status(409).json({
        ok: false,
        message:
          text((approved as any).errorMessage) ||
          "The owner-only test action failed its provider or governance checks.",
        actionRequestId: Number(approved.id),
      });
    }
    await recordAudit({
      tenantId: tenant.id,
      actorUserId: userId,
      integrationId: `outreach_test_${ownerChannel}`,
      provider:
        ownerChannel === "email" ? "smtp" : "twilio",
      eventType: "owner_only_test_queued",
      metadata: {
        actionRequestId: Number(approved.id),
        channel: ownerChannel,
        destinationDigest: crypto
          .createHash("sha256")
          .update(`${ownerChannel}:${recipient}`)
          .digest("hex"),
        externalRecipientAllowed: false,
        ownerAllowlistVerified: true,
      },
    });
    return res.status(202).json({
      ok: true,
      actionRequestId: Number(approved.id),
      status: approved.status,
      channel: ownerChannel,
      ownerAllowlistVerified: true,
      externalRecipientAllowed: false,
    });
  } catch (error: any) {
    return res.status(Number(error?.status || 0) || 500).json({
      ok: false,
      code: text(error?.code) || null,
      message:
        text(error?.message) ||
        "The owner-only outreach test could not be queued.",
    });
  }
});

router.post("/twilio/verify", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const userId = actorId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, message: "Admin identity required." });
  }
  try {
    await ensureExportunityIntegrationTables();
    const verification = await verifyExportunityTwilioReadOnly();
    const publicResult =
      toExportunityTwilioPublicVerification(verification);
    await recordAudit({
      tenantId: tenant.id,
      actorUserId: userId,
      integrationId: "twilio",
      provider: "twilio",
      eventType: "read_only_verification_completed",
      metadata: {
        mode: verification.mode,
        checkedAt: verification.checkedAt,
        configurationFingerprint: verification.configurationFingerprint,
        ready: verification.ready,
        accountVerified: verification.checks.account.verified,
        smsVerified: verification.checks.sms.verified,
        messagingServiceVerified:
          verification.checks.messagingService.verified,
        whatsappVerified: verification.checks.whatsapp.verified,
        accountStatus: verification.checks.account.providerStatus,
        smsStatus: verification.checks.sms.providerStatus,
        messagingServiceStatus:
          verification.checks.messagingService.providerStatus,
        whatsappStatus: verification.checks.whatsapp.providerStatus,
        externalActionPerformed: verification.externalActionPerformed,
        messageSent: verification.messageSent,
        verification: publicResult,
      },
    });
    return res.json({ ok: true, verification: publicResult });
  } catch (error: any) {
    console.error(
      "[Exportunity integrations] Twilio verification failed",
      text(error?.message),
    );
    return res.status(500).json({
      ok: false,
      message:
        error?.message || "The Exportunity Twilio check could not be completed.",
    });
  }
});

router.post("/:id/verify", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const userId = actorId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, message: "Admin identity required." });
  }
  const integrationId = text(req.params.id).toLowerCase();
  if (!isExportunityOAuthIntegrationId(integrationId)) {
    return res.status(404).json({
      ok: false,
      message: "Unknown Exportunity OAuth integration.",
    });
  }
  try {
    await ensureExportunityIntegrationTables();
    const verification =
      await verifyExportunityProviderConnectionReadOnly({
        tenantId: tenant.id,
        actorUserId: userId,
        integrationId,
      });
    return res.json({ ok: true, verification });
  } catch (error: any) {
    console.error(
      "[Exportunity integrations] provider verification failed",
      integrationId,
      text(error?.message),
    );
    return res.status(502).json({
      ok: false,
      message:
        error?.message ||
        "The Exportunity provider check could not be completed.",
    });
  }
});

router.post("/:id/authorize", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const userId = actorId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, message: "Admin identity required." });
  }
  const integrationId = text(req.params.id).toLowerCase();
  if (!isExportunityOAuthIntegrationId(integrationId)) {
    return res.status(404).json({
      ok: false,
      message: "Unknown Exportunity OAuth integration.",
    });
  }
  try {
    await ensureExportunityIntegrationTables();
    const runtime = oauthRuntime(integrationId);
    if (!runtime.configured) {
      return res.status(503).json({
        ok: false,
        message: `${runtime.label} is not configured for Exportunity.`,
        missingEnv: runtime.missingEnv,
      });
    }
    const provider = providerForExportunityIntegration(integrationId);
    const returnTo = safeReturnTo(req.body?.returnTo);
    const state = await createOauthState({
      tenantId: tenant.id,
      actorUserId: userId,
      integrationId,
      provider,
      returnTo,
    });
    const origin = requestOrigin(req);
    let authorizeUrl: URL;
    if (provider === "google") {
      authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authorizeUrl.searchParams.set(
        "client_id",
        readExportunityEnv("GOOGLE_CLIENT_ID"),
      );
      authorizeUrl.searchParams.set(
        "redirect_uri",
        `${origin}${EXPORTUNITY_GOOGLE_CALLBACK_PATH}`,
      );
      authorizeUrl.searchParams.set("response_type", "code");
      authorizeUrl.searchParams.set("access_type", "offline");
      authorizeUrl.searchParams.set("prompt", "consent");
      // Do not set include_granted_scopes: each stored grant must remain exact
      // instead of accumulating permissions from another Google capability.
      authorizeUrl.searchParams.set(
        "scope",
        scopesForExportunityIntegration(integrationId).join(" "),
      );
    } else {
      const graphVersion = readExportunityEnv("META_GRAPH_VERSION") || "v25.0";
      authorizeUrl = new URL(
        `https://www.facebook.com/${graphVersion}/dialog/oauth`,
      );
      authorizeUrl.searchParams.set(
        "client_id",
        readExportunityEnv("META_APP_ID"),
      );
      authorizeUrl.searchParams.set(
        "redirect_uri",
        `${origin}${EXPORTUNITY_META_CALLBACK_PATH}`,
      );
      authorizeUrl.searchParams.set("response_type", "code");
      authorizeUrl.searchParams.set(
        "config_id",
        readExportunityEnv("META_LOGIN_CONFIGURATION_ID"),
      );
      authorizeUrl.searchParams.set("override_default_response_type", "true");
    }
    authorizeUrl.searchParams.set("state", state.rawState);
    await recordAudit({
      tenantId: tenant.id,
      actorUserId: userId,
      integrationId,
      provider,
      eventType: "authorization_started",
      metadata: {
        callbackPath: runtime.callbackPath,
        stateExpiresAt: state.expiresAt.toISOString(),
      },
    });
    return res.status(201).json({
      ok: true,
      integrationId,
      provider,
      authorizeUrl: authorizeUrl.toString(),
      callbackPath: runtime.callbackPath,
      expiresAt: state.expiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error(
      "[Exportunity integrations] authorization start failed",
      text(error?.message),
    );
    return res.status(500).json({
      ok: false,
      message: error?.message || "Exportunity authorization could not be started.",
    });
  }
});

router.get("/:provider/callback", async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const provider = text(req.params.provider).toLowerCase();
  if (provider !== "google" && provider !== "meta") {
    return renderCallbackPage(res, {
      status: 404,
      title: "Unsupported Exportunity provider",
      detail: "This callback provider is not supported.",
    });
  }
  try {
    await ensureExportunityIntegrationTables();
    const rawState = text(req.query?.state);
    if (!rawState) {
      return renderCallbackPage(res, {
        status: 400,
        title: "Exportunity connection was not completed",
        detail: "The one-time authorization state is missing. Start again from Exportunity Connections.",
      });
    }
    const state = await consumeOauthState({
      rawState,
      tenantId: tenant.id,
      provider,
    });
    if (!state) {
      return renderCallbackPage(res, {
        status: 400,
        title: "Exportunity connection was not completed",
        detail: "The authorization state is expired, invalid, or has already been used.",
      });
    }
    const returnTo = safeReturnTo(state.returnTo);
    const providerError = text(req.query?.error);
    if (providerError) {
      await recordAudit({
        tenantId: tenant.id,
        actorUserId: state.actorUserId,
        integrationId: state.integrationId,
        provider,
        eventType: "authorization_cancelled",
        metadata: { providerError },
      });
      return renderCallbackPage(res, {
        status: 400,
        title: "Exportunity connection was not completed",
        detail: `The provider returned: ${providerError}`,
        integrationId: state.integrationId,
        returnTo,
      });
    }
    if (
      !isExportunityOAuthIntegrationId(state.integrationId) ||
      providerForExportunityIntegration(state.integrationId) !== provider
    ) {
      return renderCallbackPage(res, {
        status: 400,
        title: "Exportunity connection was not completed",
        detail: "The provider does not match the Exportunity integration request.",
        returnTo,
      });
    }
    const code = text(req.query?.code);
    if (!code) {
      return renderCallbackPage(res, {
        status: 400,
        title: "Exportunity connection was not completed",
        detail: "No authorization code was returned by the provider.",
        integrationId: state.integrationId,
        returnTo,
      });
    }
    const origin = requestOrigin(req);
    const exchange =
      provider === "google"
        ? await exchangeGoogleCode({
            code,
            origin,
            integrationId: state.integrationId,
          })
        : await exchangeMetaCode({ code, origin });
    const connection = await saveConnection({
      tenantId: tenant.id,
      actorUserId: state.actorUserId,
      integrationId: state.integrationId,
      exchange,
    });
    return renderCallbackPage(res, {
      status: 200,
      title: "Exportunity connection is ready",
      detail:
        "The company account is connected to Exportunity. External actions remain governed by Exportunity permissions, budgets, and approval policy.",
      integrationId: state.integrationId,
      accountLabel: connection.accountLabel,
      returnTo,
    });
  } catch (error: any) {
    console.error(
      "[Exportunity integrations] callback failed",
      text(error?.message),
    );
    return renderCallbackPage(res, {
      status: 500,
      title: "Exportunity connection failed",
      detail: error?.message || "The provider connection could not be completed.",
      returnTo: DEFAULT_RETURN_TO,
    });
  }
});

router.post("/:id/disconnect", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  const integrationId = text(req.params.id).toLowerCase();
  if (!isExportunityOAuthIntegrationId(integrationId)) {
    return res.status(404).json({
      ok: false,
      message: "Unknown Exportunity OAuth integration.",
    });
  }
  try {
    await ensureExportunityIntegrationTables();
    const now = new Date();
    const [connection] = await db
      .update(exportunityIntegrationConnections)
      .set({ status: "revoked", revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(exportunityIntegrationConnections.tenantId, tenant.id),
          eq(
            exportunityIntegrationConnections.integrationId,
            integrationId,
          ),
          isNull(exportunityIntegrationConnections.revokedAt),
        ),
      )
      .returning();
    if (!connection) {
      return res.status(404).json({
        ok: false,
        message: "No active Exportunity connection was found.",
      });
    }
    await recordAudit({
      tenantId: tenant.id,
      actorUserId: actorId(req),
      connectionId: connection.id,
      integrationId,
      provider: connection.provider,
      eventType: "connection_revoked_locally",
      metadata: {
        providerRevocationRequired: true,
        note: "The provider account owner must also revoke access in the provider console when required.",
      },
    });
    return res.json({
      ok: true,
      integrationId,
      status: "revoked",
      providerRevocationRequired: true,
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "The Exportunity connection could not be revoked.",
    });
  }
});

router.get("/audit/events", ensureTenantAdmin, async (req: any, res) => {
  const tenant = resolveExportunityTenant(req, res);
  if (!tenant) return;
  try {
    await ensureExportunityIntegrationTables();
    const limit = Math.min(
      200,
      Math.max(1, Number.parseInt(text(req.query?.limit) || "80", 10) || 80),
    );
    const events = await db.query.exportunityIntegrationAuditEvents.findMany({
      where: eq(exportunityIntegrationAuditEvents.tenantId, tenant.id),
      orderBy: [desc(exportunityIntegrationAuditEvents.createdAt)],
      limit,
    });
    return res.json({ ok: true, events });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "Integration audit events could not be loaded.",
    });
  }
});

export default router;
