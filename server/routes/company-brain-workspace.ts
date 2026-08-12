import { Router } from "express";
import { db } from "@db";
import type { CompanyBrainWorkspaceService } from "@db/schema";
import { sql } from "drizzle-orm";

import { getCompanyBrainFeatureStatus, isCompanyBrainFeatureEnabled } from "../lib/company-brain/featureFlags";
import {
  buildGoogleWorkspaceAuthorizationUrl,
  consumeGoogleWorkspaceOauthState,
  defaultConnectorPolicy,
  exchangeGoogleWorkspaceCode,
  fetchGoogleWorkspaceIdentity,
  getGoogleWorkspaceOAuthConfig,
  listGoogleWorkspaceConnectorStatus,
  revokeGoogleWorkspaceConnector,
  saveGoogleWorkspaceConnection,
  setGoogleWorkspaceConnectorPaused,
  updateGoogleWorkspaceConnectorPolicy,
  verifyGoogleWorkspaceConnectorHealth,
} from "../lib/company-brain/googleWorkspace";
import { isWorkspaceService } from "../lib/company-brain/workspaceScopes";
import { runManualWorkspaceSync } from "../lib/company-brain/workspaceSync";
import { ensureTenantAdmin } from "./utils/auth";

const router = Router();

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : String(value || "").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function rowsOf(result: any): any[] {
  if (Array.isArray(result?.rows)) return result.rows;
  if (Array.isArray(result)) return result;
  return [];
}

function tenantIdFromReq(req: any) {
  const tenantId = Number(req?.tenant?.id || 0);
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    const error = new Error("Tenant not resolved");
    (error as any).status = 400;
    throw error;
  }
  return tenantId;
}

function adminUserIdFromReq(req: any) {
  const userId = Number(req?.adminUser?.id || req?.staffUser?.id || 0);
  if (!Number.isInteger(userId) || userId <= 0) {
    const error = new Error("Administrator identity not resolved");
    (error as any).status = 401;
    throw error;
  }
  return userId;
}

function requestOrigin(req: any) {
  const configured = asText(process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL);
  if (configured) return configured.replace(/\/$/, "");
  const forwardedProto = asText(req.headers?.["x-forwarded-proto"]).split(",")[0] || req.protocol || "https";
  const forwardedHost = asText(req.headers?.["x-forwarded-host"]).split(",")[0] || asText(req.headers?.host);
  return `${forwardedProto}://${forwardedHost}`;
}

function safeReturnTo(value: unknown) {
  const path = asText(value) || "/admin/settings/integrations/google-workspace";
  return path.startsWith("/") && !path.startsWith("//")
    ? path
    : "/admin/settings/integrations/google-workspace";
}

function withResultQuery(path: string, values: Record<string, string>) {
  const url = new URL(path, "https://exportunity.invalid");
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}

function statusOf(error: any, fallback = 500) {
  const value = Number(error?.status || error?.statusCode || fallback);
  return Number.isInteger(value) && value >= 400 && value <= 599 ? value : fallback;
}

function serviceFeature(service: CompanyBrainWorkspaceService) {
  if (service === "drive") return "driveRead" as const;
  if (service === "gmail") return "gmailRead" as const;
  return "contactsRead" as const;
}

function assertConnectorFeature(service: CompanyBrainWorkspaceService) {
  const flags = getCompanyBrainFeatureStatus();
  if (!isCompanyBrainFeatureEnabled("companyBrain") || !isCompanyBrainFeatureEnabled("workspaceConnectors")) {
    const error = new Error(
      "Company Brain Google Workspace connectors are disabled. Enable FEATURE_COMPANY_BRAIN and FEATURE_GOOGLE_WORKSPACE_CONNECTORS first.",
    );
    (error as any).status = 503;
    throw error;
  }
  const feature = serviceFeature(service);
  if (!isCompanyBrainFeatureEnabled(feature)) {
    const error = new Error(`Google ${service} read access is disabled. Enable ${flags[feature].envName} first.`);
    (error as any).status = 503;
    throw error;
  }
}

function parseService(value: unknown): CompanyBrainWorkspaceService {
  if (!isWorkspaceService(value)) {
    const error = new Error("Workspace service must be drive, gmail, or contacts");
    (error as any).status = 400;
    throw error;
  }
  return value;
}

function stringList(value: unknown, limit = 30, itemLimit = 120) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,]/) : [];
  return Array.from(
    new Set(raw.map((item) => asText(item).slice(0, itemLimit)).filter(Boolean)),
  ).slice(0, limit);
}

function domainList(value: unknown) {
  return stringList(value, 30, 180)
    .map((domain) => domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^@/, "").split("/")[0] || "")
    .filter((domain) => /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain));
}

function idList(value: unknown) {
  return stringList(value, 100, 180).filter((id) => /^[A-Za-z0-9_-]{8,180}$/.test(id));
}

function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function sanitizePolicy(service: CompanyBrainWorkspaceService, value: unknown) {
  const incoming = asRecord(value);
  const defaults = defaultConnectorPolicy(service);
  if (service === "drive") {
    return {
      ...defaults,
      mode: incoming.mode === "company_archive" ? "company_archive" : "selected_archive",
      allowlistedFolderIds: idList(incoming.allowlistedFolderIds),
      allowlistedFileIds: idList(incoming.allowlistedFileIds),
      neverIndex: stringList(incoming.neverIndex),
      maxFileBytes: boundedInt(incoming.maxFileBytes, 10_000_000, 100_000, 25_000_000),
      requireExplicitAllowlist: true,
    };
  }
  if (service === "gmail") {
    return {
      ...defaults,
      mode: "business_only",
      dateDays: boundedInt(incoming.dateDays, 3650, 1, 3650),
      includeKeywords: stringList(incoming.includeKeywords),
      excludeKeywords: stringList(incoming.excludeKeywords),
      includeDomains: domainList(incoming.includeDomains),
      excludeDomains: domainList(incoming.excludeDomains),
      labelIds: stringList(incoming.labelIds, 30, 100),
      neverIndex: stringList(incoming.neverIndex),
      requireBusinessSignal: true,
      attachments: "metadata_only",
    };
  }
  return {
    ...defaults,
    mode: "business_contacts_only",
    includeDomains: domainList(incoming.includeDomains),
    excludeDomains: domainList(incoming.excludeDomains),
    neverIndex: stringList(incoming.neverIndex),
    requireBusinessSignal: true,
    mergeIntoCanonicalCrm: true,
  };
}

async function recentOperations(tenantId: number) {
  const [runsResult, deadLettersResult] = await Promise.all([
    db.execute(sql`
      select r.id, r.service, r.trigger, r.sync_mode, r.status, r.phase, r.counters,
        r.error_code, r.error_message, r.started_at, r.completed_at, r.created_at
      from company_brain_sync_runs r
      where r.tenant_id = ${tenantId}
      order by r.created_at desc
      limit 30
    `),
    db.execute(sql`
      select d.id, d.connector_id, c.service, d.sync_run_id, d.provider_item_id, d.stage,
        d.error_code, d.error_message, d.status, d.created_at
      from company_brain_sync_dead_letters d
      join company_brain_source_connectors c on c.id = d.connector_id
      where d.tenant_id = ${tenantId} and d.status = 'open'
      order by d.created_at desc
      limit 30
    `),
  ]);
  return { runs: rowsOf(runsResult), deadLetters: rowsOf(deadLettersResult) };
}

// OAuth callbacks cannot depend on a bearer token after Google redirects the browser.
// The one-time, ten-minute state record binds the request to the original tenant,
// administrator, service, and safe return path.
router.get("/google/callback", async (req: any, res) => {
  let returnTo = "/admin/settings/integrations/google-workspace";
  try {
    if (req.query?.error) {
      return res.redirect(303, withResultQuery(returnTo, { workspace: "cancelled" }));
    }
    const state = await consumeGoogleWorkspaceOauthState(req.query?.state);
    if (!state) return res.status(400).send("Google Workspace authorization state is invalid or expired.");
    returnTo = state.returnTo;
    const tenantId = tenantIdFromReq(req);
    if (tenantId !== state.tenantId) return res.status(403).send("OAuth tenant mismatch.");
    assertConnectorFeature(state.service);
    const code = asText(req.query?.code);
    if (!code) return res.status(400).send("Google returned no authorization code.");
    const tokenPayload = await exchangeGoogleWorkspaceCode({ code, origin: requestOrigin(req) });
    const identity = await fetchGoogleWorkspaceIdentity(tokenPayload);
    await saveGoogleWorkspaceConnection({
      tenantId,
      tenantKey: asText(req.tenant?.key) || null,
      tenantName: asText(req.tenant?.name) || null,
      userId: state.userId,
      service: state.service,
      tokenPayload,
      identity,
    });
    return res.redirect(303, withResultQuery(returnTo, { workspace: "connected", service: state.service }));
  } catch (error: any) {
    console.error("[CompanyBrain] Google Workspace OAuth callback failed", error?.message || error);
    return res.redirect(303, withResultQuery(returnTo, { workspace: "error" }));
  }
});

router.use(ensureTenantAdmin);

router.get("/status", async (req: any, res) => {
  try {
    const tenantId = tenantIdFromReq(req);
    const config = getGoogleWorkspaceOAuthConfig(requestOrigin(req));
    const [connectors, operations] = await Promise.all([
      listGoogleWorkspaceConnectorStatus(tenantId),
      recentOperations(tenantId),
    ]);
    return res.json({
      ok: true,
      tenant: { id: tenantId, key: req.tenant?.key, name: req.tenant?.name },
      flags: getCompanyBrainFeatureStatus(),
      oauth: {
        configured: config.configured,
        redirectUri: config.redirectUri,
        credentialSource: config.credentialSource,
        missing: config.missing,
      },
      governance: {
        readOnly: true,
        manualSyncOnly: true,
        backgroundSyncEnabled: false,
        emailSendingEnabled: false,
        contactWritesToGoogleEnabled: false,
        driveWritesEnabled: false,
        externalCommunicationsEnabled: isCompanyBrainFeatureEnabled("externalCommunications"),
      },
      connectors,
      ...operations,
    });
  } catch (error: any) {
    return res.status(statusOf(error)).json({ message: error?.message || "Failed to load Workspace connector status" });
  }
});

router.post("/connect/:service", async (req: any, res) => {
  try {
    const service = parseService(req.params.service);
    assertConnectorFeature(service);
    const authorizationUrl = await buildGoogleWorkspaceAuthorizationUrl({
      origin: requestOrigin(req),
      tenantId: tenantIdFromReq(req),
      userId: adminUserIdFromReq(req),
      service,
      returnTo: safeReturnTo(req.body?.returnTo),
    });
    return res.json({ ok: true, service, authorizationUrl, readOnly: true });
  } catch (error: any) {
    return res.status(statusOf(error)).json({ message: error?.message || "Failed to start Google authorization" });
  }
});

router.put("/connectors/:service/policy", async (req: any, res) => {
  try {
    const service = parseService(req.params.service);
    assertConnectorFeature(service);
    const policy = sanitizePolicy(service, req.body?.policy || req.body);
    const result = await updateGoogleWorkspaceConnectorPolicy({
      tenantId: tenantIdFromReq(req),
      service,
      userId: adminUserIdFromReq(req),
      policy,
    });
    return res.json({ ok: true, ...result });
  } catch (error: any) {
    return res.status(statusOf(error)).json({ message: error?.message || "Failed to save connector policy" });
  }
});

router.post("/connectors/:service/sync", async (req: any, res) => {
  try {
    const service = parseService(req.params.service);
    assertConnectorFeature(service);
    const result = await runManualWorkspaceSync({
      tenantId: tenantIdFromReq(req),
      userId: adminUserIdFromReq(req),
      service,
      maxItems: req.body?.maxItems,
    });
    return res.json({ ok: true, ...result });
  } catch (error: any) {
    return res.status(statusOf(error)).json({ message: error?.message || "Workspace sync failed" });
  }
});

router.post("/connectors/:service/health", async (req: any, res) => {
  try {
    const service = parseService(req.params.service);
    assertConnectorFeature(service);
    const result = await verifyGoogleWorkspaceConnectorHealth({
      tenantId: tenantIdFromReq(req),
      service,
      userId: adminUserIdFromReq(req),
    });
    return res.json({ ok: true, ...result });
  } catch (error: any) {
    return res.status(statusOf(error)).json({ message: error?.message || "Workspace health check failed" });
  }
});

router.post("/connectors/:service/pause", async (req: any, res) => {
  try {
    const service = parseService(req.params.service);
    const result = await setGoogleWorkspaceConnectorPaused({
      tenantId: tenantIdFromReq(req),
      service,
      userId: adminUserIdFromReq(req),
      paused: req.body?.paused !== false,
    });
    return res.json({ ok: true, ...result });
  } catch (error: any) {
    return res.status(statusOf(error)).json({ message: error?.message || "Failed to change connector state" });
  }
});

router.delete("/connectors/:service", async (req: any, res) => {
  try {
    const service = parseService(req.params.service);
    const result = await revokeGoogleWorkspaceConnector({
      tenantId: tenantIdFromReq(req),
      service,
      userId: adminUserIdFromReq(req),
    });
    return res.json({ ok: true, service, ...result });
  } catch (error: any) {
    return res.status(statusOf(error)).json({ message: error?.message || "Failed to revoke connector" });
  }
});

export default router;
