import crypto from "node:crypto";
import { db } from "@db";
import {
  companyBrainAuditEvents,
  companyBrainOauthStates,
  companyBrainSourceConnectors,
  mindbaseIntegrationConnections,
  type CompanyBrainWorkspaceService,
} from "@db/schema";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { ensureDefaultCompany } from "../default-company";
import {
  decryptIntegrationTokenPayload,
  encryptIntegrationTokenPayload,
  type EncryptedTokenPayload,
} from "../integrations/tokenVault";
import {
  assertReadOnlyWorkspaceScopes,
  isWorkspaceService,
  normalizeGoogleScopes,
  scopesForWorkspaceService,
} from "./workspaceScopes";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const OAUTH_STATE_TTL_MS = 10 * 60_000;

export type GoogleWorkspaceIdentity = {
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
  hostedDomain: string | null;
  accountType: "Google Workspace" | "Google account";
};

type OAuthTokenPayload = Record<string, unknown> & {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

export type GoogleWorkspaceConnector = {
  connectorId: number;
  tenantId: number;
  companyId: number | null;
  service: CompanyBrainWorkspaceService;
  connectorStatus: string;
  readOnly: boolean;
  grantedScopes: string[];
  policy: Record<string, unknown>;
  syncSettings: Record<string, unknown>;
  connectionId: string;
  userId: number;
  accountLabel: string | null;
  connectionStatus: string;
  scopes: string[];
  tokenCiphertext: string;
  tokenIv: string;
  tokenAuthTag: string;
  tokenMeta: Record<string, unknown>;
  expiresAt: Date | null;
  connectedAt: Date | null;
  updatedAt: Date | null;
  lastSyncAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
  lastError: string | null;
  pausedAt: Date | null;
};

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : String(value || "").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function safeReturnTo(value: unknown) {
  const raw = asText(value) || "/admin/settings/integrations/google-workspace";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/admin/settings/integrations/google-workspace";
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function decodeJwtPayload(token: unknown): Record<string, unknown> {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return {};
  try {
    return asRecord(JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")));
  } catch {
    return {};
  }
}

function rowsOf(result: any): any[] {
  if (Array.isArray(result?.rows)) return result.rows;
  if (Array.isArray(result)) return result;
  return [];
}

export function getGoogleWorkspaceOAuthConfig(origin?: string) {
  const clientId = asText(process.env.GOOGLE_WORKSPACE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID);
  const clientSecret = asText(process.env.GOOGLE_WORKSPACE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET);
  const configuredRedirect = asText(process.env.GOOGLE_WORKSPACE_REDIRECT_URI);
  const redirectUri = configuredRedirect || (origin ? `${origin.replace(/\/$/, "")}/api/admin/company-brain/workspace/google/callback` : "");
  const missing: string[] = [];
  if (!clientId) missing.push("GOOGLE_WORKSPACE_CLIENT_ID");
  if (!clientSecret) missing.push("GOOGLE_WORKSPACE_CLIENT_SECRET");
  if (!redirectUri) missing.push("GOOGLE_WORKSPACE_REDIRECT_URI");
  return {
    configured: missing.length === 0,
    clientId,
    clientSecret,
    redirectUri,
    missing,
    credentialSource:
      process.env.GOOGLE_WORKSPACE_CLIENT_ID && process.env.GOOGLE_WORKSPACE_CLIENT_SECRET
        ? "workspace_specific"
        : clientId && clientSecret
          ? "shared_google_oauth"
          : "missing",
  };
}

export async function createGoogleWorkspaceOauthState(input: {
  tenantId: number;
  userId: number;
  service: CompanyBrainWorkspaceService;
  returnTo?: unknown;
}) {
  const state = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  await db.delete(companyBrainOauthStates).where(sql`${companyBrainOauthStates.expiresAt} < ${now}`);
  await db.insert(companyBrainOauthStates).values({
    stateHash: sha256(state),
    tenantId: input.tenantId,
    userId: input.userId,
    service: input.service,
    returnTo: safeReturnTo(input.returnTo),
    expiresAt: new Date(now.getTime() + OAUTH_STATE_TTL_MS),
  });
  return state;
}

export async function consumeGoogleWorkspaceOauthState(rawState: unknown) {
  const state = asText(rawState);
  if (!state) return null;
  const result = await db.execute(sql`
    update company_brain_oauth_states
    set consumed_at = now()
    where state_hash = ${sha256(state)}
      and consumed_at is null
      and expires_at > now()
    returning tenant_id, user_id, service, return_to, expires_at
  `);
  const row = rowsOf(result)[0];
  if (!row || !isWorkspaceService(row.service)) return null;
  return {
    tenantId: Number(row.tenant_id),
    userId: Number(row.user_id),
    service: row.service,
    returnTo: safeReturnTo(row.return_to),
    expiresAt: new Date(row.expires_at),
  };
}

export async function buildGoogleWorkspaceAuthorizationUrl(input: {
  origin: string;
  tenantId: number;
  userId: number;
  service: CompanyBrainWorkspaceService;
  returnTo?: unknown;
}) {
  const config = getGoogleWorkspaceOAuthConfig(input.origin);
  if (!config.configured) {
    const error = new Error(`Google Workspace OAuth is not configured: ${config.missing.join(", ")}`);
    (error as any).status = 503;
    throw error;
  }
  const state = await createGoogleWorkspaceOauthState(input);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("scope", scopesForWorkspaceService(input.service).join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

async function parseGoogleResponse(response: Response, label: string) {
  const body = await response.json().catch(async () => ({ message: await response.text().catch(() => "") }));
  if (!response.ok) {
    const details = asRecord(body);
    const nested = asRecord(details.error);
    const message = asText(nested.message || details.error_description || details.message || details.error);
    const error = new Error(`${label} failed (${response.status})${message ? `: ${message}` : ""}`);
    (error as any).status = response.status;
    (error as any).code = asText(nested.status || details.error) || "google_api_error";
    throw error;
  }
  return asRecord(body);
}

export async function exchangeGoogleWorkspaceCode(input: { code: string; origin: string }) {
  const config = getGoogleWorkspaceOAuthConfig(input.origin);
  if (!config.configured) throw new Error(`Google Workspace OAuth is not configured: ${config.missing.join(", ")}`);
  const body = new URLSearchParams({
    code: input.code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });
  const tokenPayload = (await parseGoogleResponse(
    await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
    "Google token exchange",
  )) as OAuthTokenPayload;
  if (!asText(tokenPayload.access_token)) throw new Error("Google token exchange returned no access token");
  return tokenPayload;
}

export async function fetchGoogleWorkspaceIdentity(tokenPayload: OAuthTokenPayload): Promise<GoogleWorkspaceIdentity> {
  const accessToken = asText(tokenPayload.access_token);
  const profile = await parseGoogleResponse(
    await fetch(GOOGLE_USERINFO_URL, { headers: { authorization: `Bearer ${accessToken}` } }),
    "Google identity verification",
  );
  const jwt = decodeJwtPayload(tokenPayload.id_token);
  const subject = asText(profile.sub || jwt.sub);
  const email = asText(profile.email || jwt.email).toLowerCase();
  const emailVerified = profile.email_verified === true || jwt.email_verified === true;
  const hostedDomain = asText(profile.hd || jwt.hd) || null;
  if (!subject || !email || !emailVerified) {
    throw new Error("Google did not return an exact verified account identity");
  }
  return {
    subject,
    email,
    emailVerified,
    name: asText(profile.name || jwt.name) || null,
    picture: asText(profile.picture || jwt.picture) || null,
    hostedDomain,
    accountType: hostedDomain ? "Google Workspace" : "Google account",
  };
}

async function audit(input: {
  tenantId: number;
  companyId?: number | null;
  userId?: number | null;
  eventType: string;
  entityType: string;
  entityId?: string | number | null;
  payload?: Record<string, unknown>;
}) {
  await db.insert(companyBrainAuditEvents).values({
    tenantId: input.tenantId,
    companyId: input.companyId || null,
    actorType: "user",
    actorId: input.userId ? String(input.userId) : null,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId == null ? null : String(input.entityId),
    payload: input.payload || {},
  });
}

export async function saveGoogleWorkspaceConnection(input: {
  tenantId: number;
  tenantKey?: string | null;
  tenantName?: string | null;
  userId: number;
  service: CompanyBrainWorkspaceService;
  tokenPayload: OAuthTokenPayload;
  identity: GoogleWorkspaceIdentity;
}) {
  const grantedScopes = assertReadOnlyWorkspaceScopes(
    input.service,
    input.tokenPayload.scope || scopesForWorkspaceService(input.service),
  );
  const existingIdentityRows = rowsOf(await db.execute(sql`
    select mic.token_meta
    from company_brain_source_connectors c
    join mindbase_integration_connections mic on mic.id = c.connection_id
    where c.tenant_id = ${input.tenantId}
      and c.status in ('connected', 'paused')
      and c.revoked_at is null
      and mic.revoked_at is null
  `));
  const differentIdentity = existingIdentityRows.some((row) => {
    const meta = asRecord(row.token_meta);
    const subject = asText(meta.googleSubject);
    const email = asText(meta.primaryEmail).toLowerCase();
    return (subject && subject !== input.identity.subject) || (email && email !== input.identity.email);
  });
  if (differentIdentity) {
    const error = new Error(
      "This tenant already has a Company Brain connector under a different verified Google identity. Revoke it before connecting another account.",
    );
    (error as any).status = 409;
    throw error;
  }

  const companyId = await ensureDefaultCompany({
    tenantId: input.tenantId,
    tenantKey: input.tenantKey,
    tenantName: input.tenantName,
  });
  const integrationId = `company_brain_google_${input.service}`;
  const priorConnection = await db.query.mindbaseIntegrationConnections.findFirst({
    where: and(
      eq(mindbaseIntegrationConnections.tenantId, input.tenantId),
      eq(mindbaseIntegrationConnections.userId, input.userId),
      eq(mindbaseIntegrationConnections.integrationId, integrationId),
    ),
  });
  let priorPayload: Record<string, unknown> = {};
  if (priorConnection) {
    try {
      priorPayload = decryptIntegrationTokenPayload({
        ciphertext: priorConnection.tokenCiphertext,
        iv: priorConnection.tokenIv,
        authTag: priorConnection.tokenAuthTag,
      });
    } catch {
      priorPayload = {};
    }
  }
  const tokenPayload = {
    ...priorPayload,
    ...input.tokenPayload,
    refresh_token: asText(input.tokenPayload.refresh_token || priorPayload.refresh_token) || undefined,
  };
  const encrypted = encryptIntegrationTokenPayload(tokenPayload);
  const expiresIn = Number(input.tokenPayload.expires_in || 0);
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null;
  const now = new Date();
  const [connection] = await db
    .insert(mindbaseIntegrationConnections)
    .values({
      tenantId: input.tenantId,
      userId: input.userId,
      provider: "google",
      integrationId,
      accountLabel: input.identity.email,
      status: "connected",
      scopes: grantedScopes,
      tokenCiphertext: encrypted.ciphertext,
      tokenIv: encrypted.iv,
      tokenAuthTag: encrypted.authTag,
      tokenMeta: {
        googleSubject: input.identity.subject,
        primaryEmail: input.identity.email,
        emailVerified: true,
        displayName: input.identity.name,
        picture: input.identity.picture,
        hostedDomain: input.identity.hostedDomain,
        accountType: input.identity.accountType,
        hasRefreshToken: Boolean(asText(tokenPayload.refresh_token)),
        readOnly: true,
        service: input.service,
        authorizationVersion: "company-brain-read-v1",
      },
      expiresAt,
      lastVerifiedAt: now,
      revokedAt: null,
      createdAt: priorConnection?.createdAt || now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        mindbaseIntegrationConnections.tenantId,
        mindbaseIntegrationConnections.userId,
        mindbaseIntegrationConnections.integrationId,
      ],
      set: {
        accountLabel: input.identity.email,
        status: "connected",
        scopes: grantedScopes,
        tokenCiphertext: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        tokenMeta: {
          googleSubject: input.identity.subject,
          primaryEmail: input.identity.email,
          emailVerified: true,
          displayName: input.identity.name,
          picture: input.identity.picture,
          hostedDomain: input.identity.hostedDomain,
          accountType: input.identity.accountType,
          hasRefreshToken: Boolean(asText(tokenPayload.refresh_token)),
          readOnly: true,
          service: input.service,
          authorizationVersion: "company-brain-read-v1",
        },
        expiresAt,
        lastVerifiedAt: now,
        revokedAt: null,
        updatedAt: now,
      },
    })
    .returning();
  if (!connection) throw new Error("Failed to persist Google Workspace connection");

  await db
    .update(companyBrainSourceConnectors)
    .set({ status: "replaced", revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(companyBrainSourceConnectors.tenantId, input.tenantId),
        eq(companyBrainSourceConnectors.service, input.service),
        ne(companyBrainSourceConnectors.connectionId, connection.id),
        isNull(companyBrainSourceConnectors.revokedAt),
      ),
    );
  const [connector] = await db
    .insert(companyBrainSourceConnectors)
    .values({
      tenantId: input.tenantId,
      companyId,
      connectionId: connection.id,
      service: input.service,
      status: "connected",
      readOnly: true,
      grantedScopes,
      policy: defaultConnectorPolicy(input.service),
      syncSettings: { manualOnly: true, scheduleEnabled: false, pageSize: 50, maxItemsPerRun: 100 },
      createdByUserId: input.userId,
    })
    .onConflictDoUpdate({
      target: [companyBrainSourceConnectors.connectionId, companyBrainSourceConnectors.service],
      set: {
        companyId,
        status: "connected",
        readOnly: true,
        grantedScopes,
        pausedAt: null,
        revokedAt: null,
        lastError: null,
        updatedAt: now,
      },
    })
    .returning();
  if (!connector) throw new Error("Failed to persist Google Workspace source connector");

  await audit({
    tenantId: input.tenantId,
    companyId,
    userId: input.userId,
    eventType: "workspace_connector_connected",
    entityType: "workspace_connector",
    entityId: connector.id,
    payload: {
      service: input.service,
      verifiedEmail: input.identity.email,
      googleSubject: input.identity.subject,
      accountType: input.identity.accountType,
      scopes: grantedScopes,
      readOnly: true,
    },
  });
  return { connector, connection, identity: input.identity };
}

export function defaultConnectorPolicy(service: CompanyBrainWorkspaceService): Record<string, unknown> {
  if (service === "drive") {
    return {
      mode: "selected_archive",
      allowlistedFolderIds: [],
      allowlistedFileIds: [],
      neverIndex: [],
      maxFileBytes: 10_000_000,
      requireExplicitAllowlist: true,
    };
  }
  if (service === "gmail") {
    return {
      mode: "business_only",
      dateDays: 3650,
      includeKeywords: [
        "Exportunity",
        "rayOn",
        "XportCARD",
        "supplier",
        "sourcing",
        "buyer",
        "quotation",
        "RFQ",
        "contract",
        "shipment",
        "partnership",
        "proposal",
      ],
      excludeKeywords: [],
      includeDomains: [],
      excludeDomains: [],
      labelIds: [],
      neverIndex: [],
      requireBusinessSignal: true,
      attachments: "metadata_only",
    };
  }
  return {
    mode: "business_contacts_only",
    includeDomains: [],
    excludeDomains: [],
    neverIndex: [],
    requireBusinessSignal: true,
    mergeIntoCanonicalCrm: true,
  };
}

export async function getConnectorWithConnection(input: {
  tenantId: number;
  service: CompanyBrainWorkspaceService;
  includeRevoked?: boolean;
}): Promise<GoogleWorkspaceConnector | null> {
  const result = await db.execute(sql`
    select
      c.id as connector_id,
      c.tenant_id,
      c.company_id,
      c.service,
      c.status as connector_status,
      c.read_only,
      c.granted_scopes,
      c.policy,
      c.sync_settings,
      mic.id as connection_id,
      mic.user_id,
      mic.account_label,
      mic.status as connection_status,
      mic.scopes,
      mic.token_ciphertext,
      mic.token_iv,
      mic.token_auth_tag,
      mic.token_meta,
      mic.expires_at,
      c.created_at as connected_at,
      c.updated_at,
      c.last_sync_at,
      c.last_successful_sync_at,
      c.last_error,
      c.paused_at
    from company_brain_source_connectors c
    join mindbase_integration_connections mic on mic.id = c.connection_id
    where c.tenant_id = ${input.tenantId}
      and c.service = ${input.service}
      ${input.includeRevoked ? sql`` : sql`and c.revoked_at is null and mic.revoked_at is null`}
    order by c.updated_at desc
    limit 1
  `);
  const row = rowsOf(result)[0];
  if (!row || !isWorkspaceService(row.service)) return null;
  return {
    connectorId: Number(row.connector_id),
    tenantId: Number(row.tenant_id),
    companyId: row.company_id == null ? null : Number(row.company_id),
    service: row.service,
    connectorStatus: asText(row.connector_status),
    readOnly: row.read_only === true,
    grantedScopes: normalizeGoogleScopes(row.granted_scopes),
    policy: asRecord(row.policy),
    syncSettings: asRecord(row.sync_settings),
    connectionId: asText(row.connection_id),
    userId: Number(row.user_id),
    accountLabel: asText(row.account_label) || null,
    connectionStatus: asText(row.connection_status),
    scopes: normalizeGoogleScopes(row.scopes),
    tokenCiphertext: asText(row.token_ciphertext),
    tokenIv: asText(row.token_iv),
    tokenAuthTag: asText(row.token_auth_tag),
    tokenMeta: asRecord(row.token_meta),
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    connectedAt: row.connected_at ? new Date(row.connected_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at) : null,
    lastSuccessfulSyncAt: row.last_successful_sync_at ? new Date(row.last_successful_sync_at) : null,
    lastError: asText(row.last_error) || null,
    pausedAt: row.paused_at ? new Date(row.paused_at) : null,
  };
}

async function refreshGoogleAccessToken(connector: GoogleWorkspaceConnector, payload: Record<string, unknown>) {
  const refreshToken = asText(payload.refresh_token);
  if (!refreshToken) throw new Error("Google Workspace connection has no refresh token; reconnect the service");
  const config = getGoogleWorkspaceOAuthConfig();
  if (!config.clientId || !config.clientSecret) throw new Error("Google Workspace OAuth credentials are unavailable");
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  });
  const refreshed = await parseGoogleResponse(
    await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
    "Google token refresh",
  );
  const nextPayload = { ...payload, ...refreshed, refresh_token: refreshToken };
  const encrypted = encryptIntegrationTokenPayload(nextPayload);
  const expiresIn = Number(refreshed.expires_in || 0);
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null;
  await db
    .update(mindbaseIntegrationConnections)
    .set({
      tokenCiphertext: encrypted.ciphertext,
      tokenIv: encrypted.iv,
      tokenAuthTag: encrypted.authTag,
      expiresAt,
      lastVerifiedAt: new Date(),
      status: "connected",
      updatedAt: new Date(),
    })
    .where(eq(mindbaseIntegrationConnections.id, connector.connectionId));
  return asText(refreshed.access_token);
}

export async function getGoogleWorkspaceAccessToken(connector: GoogleWorkspaceConnector) {
  if (!connector.readOnly) throw new Error("Connector violates the read-only Company Brain policy");
  assertReadOnlyWorkspaceScopes(connector.service, connector.grantedScopes);
  const payload = decryptIntegrationTokenPayload({
    ciphertext: connector.tokenCiphertext,
    iv: connector.tokenIv,
    authTag: connector.tokenAuthTag,
  });
  const accessToken = asText(payload.access_token);
  if (accessToken && (!connector.expiresAt || connector.expiresAt.getTime() > Date.now() + 120_000)) {
    return accessToken;
  }
  return refreshGoogleAccessToken(connector, payload);
}

function retryDelayMs(response: Response, attempt: number) {
  const retryAfter = Number(response.headers.get("retry-after") || 0);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(10_000, retryAfter * 1000);
  return Math.min(8_000, 500 * 2 ** attempt + Math.floor(Math.random() * 200));
}

export async function googleWorkspaceFetch(
  connector: GoogleWorkspaceConnector,
  url: string,
  init: RequestInit = {},
  attempts = 3,
) {
  const accessToken = await getGoogleWorkspaceAccessToken(connector);
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${accessToken}`);
    if (!headers.has("accept")) headers.set("accept", "application/json");
    const response = await fetch(url, { ...init, headers });
    lastResponse = response;
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === attempts - 1) return response;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response, attempt)));
  }
  return lastResponse!;
}

export async function revokeGoogleWorkspaceConnector(input: {
  tenantId: number;
  service: CompanyBrainWorkspaceService;
  userId: number;
}) {
  const connector = await getConnectorWithConnection({ ...input, includeRevoked: false });
  if (!connector) return { revoked: false, alreadyDisconnected: true };
  let token = "";
  try {
    const payload = decryptIntegrationTokenPayload({
      ciphertext: connector.tokenCiphertext,
      iv: connector.tokenIv,
      authTag: connector.tokenAuthTag,
    });
    token = asText(payload.refresh_token || payload.access_token);
  } catch {
    token = "";
  }
  if (token) {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    }).catch(() => null);
  }
  const scrubbed = encryptIntegrationTokenPayload({ revoked: true, revokedAt: new Date().toISOString() });
  const now = new Date();
  await db
    .update(mindbaseIntegrationConnections)
    .set({
      status: "revoked",
      tokenCiphertext: scrubbed.ciphertext,
      tokenIv: scrubbed.iv,
      tokenAuthTag: scrubbed.authTag,
      expiresAt: null,
      revokedAt: now,
      updatedAt: now,
    })
    .where(eq(mindbaseIntegrationConnections.id, connector.connectionId));
  await db
    .update(companyBrainSourceConnectors)
    .set({ status: "revoked", revokedAt: now, updatedAt: now })
    .where(eq(companyBrainSourceConnectors.id, connector.connectorId));
  await audit({
    tenantId: input.tenantId,
    companyId: connector.companyId,
    userId: input.userId,
    eventType: "workspace_connector_revoked",
    entityType: "workspace_connector",
    entityId: connector.connectorId,
    payload: { service: input.service, tokensScrubbed: true },
  });
  return { revoked: true, alreadyDisconnected: false };
}

export async function setGoogleWorkspaceConnectorPaused(input: {
  tenantId: number;
  service: CompanyBrainWorkspaceService;
  userId: number;
  paused: boolean;
}) {
  const connector = await getConnectorWithConnection({ tenantId: input.tenantId, service: input.service });
  if (!connector) {
    const error = new Error(`Google ${input.service} is not connected`);
    (error as any).status = 409;
    throw error;
  }
  if (connector.connectorStatus === "syncing") {
    const error = new Error(`Google ${input.service} cannot be paused while a visible sync is running`);
    (error as any).status = 409;
    throw error;
  }
  const now = new Date();
  await db
    .update(companyBrainSourceConnectors)
    .set({
      status: input.paused ? "paused" : "connected",
      pausedAt: input.paused ? now : null,
      lastError: null,
      updatedAt: now,
    })
    .where(eq(companyBrainSourceConnectors.id, connector.connectorId));
  await audit({
    tenantId: connector.tenantId,
    companyId: connector.companyId,
    userId: input.userId,
    eventType: input.paused ? "workspace_connector_paused" : "workspace_connector_resumed",
    entityType: "workspace_connector",
    entityId: connector.connectorId,
    payload: { service: connector.service, readOnly: true },
  });
  return { service: connector.service, status: input.paused ? "paused" : "connected" };
}

export async function updateGoogleWorkspaceConnectorPolicy(input: {
  tenantId: number;
  service: CompanyBrainWorkspaceService;
  userId: number;
  policy: Record<string, unknown>;
}) {
  const connector = await getConnectorWithConnection({ tenantId: input.tenantId, service: input.service });
  if (!connector) {
    const error = new Error(`Google ${input.service} is not connected`);
    (error as any).status = 409;
    throw error;
  }
  const now = new Date();
  await db
    .update(companyBrainSourceConnectors)
    .set({ policy: input.policy, updatedAt: now })
    .where(eq(companyBrainSourceConnectors.id, connector.connectorId));
  await audit({
    tenantId: connector.tenantId,
    companyId: connector.companyId,
    userId: input.userId,
    eventType: "workspace_connector_policy_updated",
    entityType: "workspace_connector",
    entityId: connector.connectorId,
    payload: { service: connector.service, policy: input.policy, readOnly: true },
  });
  return { service: connector.service, policy: input.policy };
}

export async function verifyGoogleWorkspaceConnectorHealth(input: {
  tenantId: number;
  service: CompanyBrainWorkspaceService;
  userId: number;
}) {
  const connector = await getConnectorWithConnection({ tenantId: input.tenantId, service: input.service });
  if (!connector) {
    const error = new Error(`Google ${input.service} is not connected`);
    (error as any).status = 409;
    throw error;
  }
  const response = await googleWorkspaceFetch(connector, GOOGLE_USERINFO_URL);
  const profile = await parseGoogleResponse(response, "Google Workspace health check");
  const exactEmail = asText(profile.email).toLowerCase();
  const exactSubject = asText(profile.sub);
  const expectedEmail = asText(connector.tokenMeta.primaryEmail).toLowerCase();
  const expectedSubject = asText(connector.tokenMeta.googleSubject);
  if (!exactEmail || !exactSubject || exactEmail !== expectedEmail || exactSubject !== expectedSubject) {
    throw new Error("Google Workspace health check returned a different account identity");
  }
  const now = new Date();
  await db
    .update(mindbaseIntegrationConnections)
    .set({ status: "connected", lastVerifiedAt: now, updatedAt: now })
    .where(eq(mindbaseIntegrationConnections.id, connector.connectionId));
  await audit({
    tenantId: connector.tenantId,
    companyId: connector.companyId,
    userId: input.userId,
    eventType: "workspace_connector_health_verified",
    entityType: "workspace_connector",
    entityId: connector.connectorId,
    payload: { service: connector.service, verifiedEmail: exactEmail, readOnly: true },
  });
  return { service: connector.service, healthy: true, verifiedEmail: exactEmail, checkedAt: now.toISOString() };
}

export async function listGoogleWorkspaceConnectorStatus(tenantId: number) {
  const services: CompanyBrainWorkspaceService[] = ["drive", "gmail", "contacts"];
  const connectors = await Promise.all(services.map((service) => getConnectorWithConnection({ tenantId, service })));
  const connectorIds = connectors.filter(Boolean).map((connector) => Number(connector!.connectorId));
  const [cursorResult, sourceCountResult, deadLetterResult] = connectorIds.length
    ? await Promise.all([
        db.execute(sql`
          select connector_id, cursor_type, metadata, updated_at
          from company_brain_sync_cursors
          where connector_id in (${sql.join(connectorIds.map((id) => sql`${id}`), sql`, `)})
          order by updated_at desc
        `),
        db.execute(sql`
          select connector_id, status, count(*)::int as count
          from company_brain_sources
          where tenant_id = ${tenantId}
            and connector_id in (${sql.join(connectorIds.map((id) => sql`${id}`), sql`, `)})
          group by connector_id, status
        `),
        db.execute(sql`
          select connector_id, count(*)::int as count
          from company_brain_sync_dead_letters
          where tenant_id = ${tenantId}
            and connector_id in (${sql.join(connectorIds.map((id) => sql`${id}`), sql`, `)})
            and status = 'open'
          group by connector_id
        `),
      ])
    : [{ rows: [] }, { rows: [] }, { rows: [] }];
  const cursorsByConnector = new Map<number, Array<Record<string, unknown>>>();
  for (const row of rowsOf(cursorResult)) {
    const connectorId = Number(row.connector_id || 0);
    if (!connectorId) continue;
    const metadata = asRecord(row.metadata);
    const list = cursorsByConnector.get(connectorId) || [];
    list.push({
      type: asText(row.cursor_type),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at || null,
      inProgress: metadata.inProgress === true || asText(row.cursor_type).endsWith("_state"),
      blockedByOpenDeadLetter: metadata.blockedByOpenDeadLetter === true,
      pendingBackfill: metadata.pendingBackfill === true,
    });
    cursorsByConnector.set(connectorId, list);
  }
  const sourceCountsByConnector = new Map<number, Record<string, number>>();
  for (const row of rowsOf(sourceCountResult)) {
    const connectorId = Number(row.connector_id || 0);
    const counts = sourceCountsByConnector.get(connectorId) || {};
    counts[asText(row.status) || "unknown"] = Number(row.count || 0);
    sourceCountsByConnector.set(connectorId, counts);
  }
  const deadLettersByConnector = new Map(
    rowsOf(deadLetterResult).map((row) => [Number(row.connector_id || 0), Number(row.count || 0)]),
  );
  return services.map((service, index) => {
    const connector = connectors[index];
    if (!connector) return { service, connected: false, status: "not_connected" };
    const meta = connector.tokenMeta;
    return {
      service,
      connected: ["connected", "paused", "syncing", "error"].includes(connector.connectorStatus),
      connectorId: connector.connectorId,
      status: connector.connectorStatus,
      readOnly: connector.readOnly,
      verifiedEmail: asText(meta.primaryEmail || connector.accountLabel),
      googleAccountId: asText(meta.googleSubject),
      accountType: asText(meta.accountType) || "Google account",
      displayName: asText(meta.displayName) || null,
      hostedDomain: asText(meta.hostedDomain) || null,
      grantedScopes: connector.grantedScopes,
      policy: connector.policy,
      syncSettings: connector.syncSettings,
      connectionHealth: connector.connectionStatus === "connected" ? "healthy" : connector.connectionStatus,
      connectedAt: connector.connectedAt?.toISOString() || null,
      updatedAt: connector.updatedAt?.toISOString() || null,
      lastSyncAt: connector.lastSyncAt?.toISOString() || null,
      lastSuccessfulSyncAt: connector.lastSuccessfulSyncAt?.toISOString() || null,
      lastError: connector.lastError,
      pausedAt: connector.pausedAt?.toISOString() || null,
      syncState: cursorsByConnector.get(connector.connectorId) || [],
      sourceCounts: sourceCountsByConnector.get(connector.connectorId) || {},
      openDeadLetters: deadLettersByConnector.get(connector.connectorId) || 0,
    };
  });
}
