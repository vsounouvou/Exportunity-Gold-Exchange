import "../env";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { ensureAgentsInitialized } from "./lib/init";
import { ensureCompanyStaffed } from "./lib/staffing";
import { ensureChairmanAssistants } from "./lib/chairman-assistant";
import { ensureActionDefinitions } from "./lib/actions/actionDefinitions";
import { ensureDefaultCompany } from "./lib/default-company";
import { ensureDemoData } from "./lib/seed-demo-data";
import { startAudioCleanupScheduler } from "./lib/audioCleanup";
import { ensureBourseDeLorKnowledgeBase } from "./lib/bdo/seed-bdo-kb";
import { ensureTenants, getTenantByKey } from "./lib/tenants";
import { resolveTenantFromRequest } from "./lib/tenantResolution";
import { resolveActiveTenantForRequest } from "./lib/adminTenantContext";
import { db } from "@db";
import { sql } from "drizzle-orm";
import { startTerritoryJobs } from "./lib/territories";
import { ensureTerritoryPolygonColumns } from "./lib/territories-schema";
import { ensureBourseHeroSeed } from "./lib/imageGen/seed-bourse-hero";
import { ensureImageTables } from "./lib/imageGen/ensureTables";
import { refreshImageGenStatus } from "./lib/imageGen/health";
import { ensureMineQuantityColumns } from "./lib/bdo/mine-quantities";
import { ensureDefaultMessageTemplates } from "./lib/messageTemplates";
import { ensureKkiapayPaymentsTable } from "./lib/kkiapay/ensureTables";
import { ensureWalletOsTables } from "./lib/wallet/ensureTables";
import { ensureTelemetryTables } from "./lib/telemetry/ensureTables";
import { ensureSeoAutopilotTables } from "./lib/seo/ensureTables";
import { ensureAgentEnums } from "./lib/agents/ensureEnums";
import { ensureAgentVisibilityColumns } from "./lib/agents/ensureVisibilityColumns";
import { ensureAgentManagementV2Tables } from "./lib/agents/ensureManagementV2Tables";
import { ensureAgentsProductionTables } from "./lib/agents/ensureProductionAgents";
import { ensureAgentPhotoColumns, ensureAgentPhotoTables } from "./lib/agents/ensurePhotoTables";
import { ensureMailEngineTables } from "./lib/mail/ensureTables";
import { ensureEmailAdminTables } from "./lib/mail/ensureEmailAdminTables";
import { startMailIndexerScheduler } from "./lib/mail/scheduler";
import { startAgoojiyeJobWorkerScheduler } from "./lib/agoojye/jobWorker";
import { ensureCommunicationsTables } from "./lib/communications/ensureTables";
import { getTwilioConfig, validateTwilioEnv } from "./lib/communications/twilio";
import { ensureActionRouterTables } from "./lib/actions/ensureTables";
import { ensureOpsCommsTables } from "./lib/ops-comms/ensureTables";
import { ensureMeetTables } from "./lib/meet/ensureTables";
import { ensureMeetingContextTables } from "./lib/meetings/ensureTables";
import { ensureChatMessageIdempotencyColumns } from "./lib/chat/ensureTables";
import { startActionsWorkerScheduler } from "./lib/actions/scheduler";
import { ensureIntelligenceGovernanceTables } from "./lib/intelligence/ensureTables";
import { startGovernedCronScheduler, startGovernedExecutionScheduler } from "./lib/intelligence/scheduler";
import { startWorkOrderSlaScheduler } from "./lib/communications/slaScheduler";
import { ensureContactTables } from "./lib/contact/ensureTables";
import { ensureNotificationsTables } from "./lib/notificationsEnsureTables";
import { ensureEngineeringKernelTables } from "./lib/engineering/ensureTables";
import { ensureMarketplaceMapTables } from "./lib/marketplace/ensureTables";
import { ensureBrainstormTables } from "./lib/brainstorm/ensureTables";
import { ensureWorkstationTables } from "./lib/workstations/ensureTables";
import { startWorkstationAutoShutdownScheduler } from "./lib/workstations/autoShutdown";
import { ensurePageRegistryTables } from "./lib/platform/ensurePageRegistryTables";
import { ensureCadastreTables } from "./lib/cadastre/ensureCadastreTables";
import { ensureMindbaseTables } from "./lib/mindbase/ensureTables";
import { ensureVsTenantTables } from "./lib/vs/ensureTables";
import { assertWhatsAppOtpConfigured, getWhatsAppOtpHealth } from "./services/whatsappOtp.service";
import { getMessagingHealth } from "./lib/messaging/config";
import { validateSmtpEnvAtBoot } from "./lib/mail/smtpProbe";

const app = express();
let degradedNoDbMode = false;
let degradedNoDbReason = "";
const startupMode = String(process.env.STARTUP_MODE || "").trim().toLowerCase();
const qualityGateStartup = startupMode === "marketing-audit" || startupMode === "quality-gate";
const allowStartWithoutDb =
  String(process.env.ALLOW_START_WITHOUT_DB || "").trim().toLowerCase() === "true";

const CLONE_STAGING_HOSTS = new Set(["clone.exportunity.net", "www.clone.exportunity.net"]);
const EXPORTUNITY_NON_CANONICAL_HOSTS = new Set([
  ...CLONE_STAGING_HOSTS,
  "exportunity.net",
  "www.exportunity.net",
]);

function normalizeForwardedHostValue(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.split(",")[0]?.split(":")[0]?.trim().toLowerCase() || "";
}

function resolveRequestHost(req: Request): string {
  const forwardedHostHeader = req.headers["x-forwarded-host"];
  const forwardedHost = Array.isArray(forwardedHostHeader) ? forwardedHostHeader[0] : forwardedHostHeader;
  return normalizeForwardedHostValue(String(forwardedHost || req.headers.host || ""));
}

function parseBasicAuthCredentials(header: unknown) {
  const raw = typeof header === "string" ? header.trim() : "";
  if (!raw.toLowerCase().startsWith("basic ")) return null;
  const encoded = raw.slice("basic ".length).trim();
  if (!encoded) return null;

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx < 0) return null;
    return {
      username: decoded.slice(0, idx),
      password: decoded.slice(idx + 1),
    };
  } catch {
    return null;
  }
}

app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: false }));

// Defense-in-depth: non-canonical Exportunity hosts are never indexable.
// clone.exportunity.net is gated as protected staging.
app.use((req: Request, res: Response, next: NextFunction) => {
  const host = resolveRequestHost(req);
  if (!host) return next();

  if (EXPORTUNITY_NON_CANONICAL_HOSTS.has(host)) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  }

  if (!CLONE_STAGING_HOSTS.has(host)) return next();

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const requiredToken = String(process.env.CLONE_STAGING_ACCESS_TOKEN || "").trim();
  const suppliedToken = String(req.headers["x-staging-token"] || "").trim();
  if (requiredToken && suppliedToken && suppliedToken === requiredToken) {
    return next();
  }

  const basicAuthUser =
    String(process.env.CLONE_STAGING_BASIC_AUTH_USER || process.env.STAGING_BASIC_AUTH_USER || "").trim();
  const basicAuthPassword =
    String(process.env.CLONE_STAGING_BASIC_AUTH_PASSWORD || process.env.STAGING_BASIC_AUTH_PASSWORD || "").trim();

  if (!basicAuthUser || !basicAuthPassword) {
    return res.status(404).send("Not found");
  }

  const parsed = parseBasicAuthCredentials(req.headers.authorization);
  if (parsed && parsed.username === basicAuthUser && parsed.password === basicAuthPassword) {
    return next();
  }

  res.setHeader("WWW-Authenticate", 'Basic realm="Exportunity Staging"');
  return res.status(401).send("Authentication required.");
});

// Serve generated assets from persistent volume
const assetRoot = process.env.ASSET_BASE_PATH || process.env.ASSET_ROOT || "/data/assets";
const assetPublicPath = process.env.ASSET_PUBLIC_PATH || "/assets";
const imageGenStatus = refreshImageGenStatus({ assetRoot, publicPath: assetPublicPath });
app.locals.imageGenStatus = imageGenStatus;

if (imageGenStatus.storage.ok) {
  app.use(
    assetPublicPath,
    express.static(assetRoot, {
      setHeaders: (res) => {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      },
    })
  );
} else {
  log(`[image-gen] Storage not writable at ${assetRoot}: ${imageGenStatus.storage.error || "unknown error"}`);
}

// Canonical retail route migration: /retail -> /zone (preserve query + deep suffix).
app.use((req: Request, res: Response, next: NextFunction) => {
  const pathname = String(req.path || "");
  if (!/^\/retail(?:\/|$)/i.test(pathname)) return next();

  const suffix = pathname.replace(/^\/retail/i, "/zone");
  const queryIndex = req.originalUrl.indexOf("?");
  const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : "";
  return res.redirect(301, `${suffix}${query}`);
});

app.use(async (req, res, next) => {
  if (qualityGateStartup) {
    req.tenant = { id: 0, key: "bdo", name: "Marketing quality gate" } as any;
    req.tenant_id = 0;
    return next();
  }
  if (degradedNoDbMode) {
    return next();
  }

  try {
    let tenant = await resolveTenantFromRequest(req);
    const hostName = String(req.headers["x-forwarded-host"] || req.headers.host || "")
      .split(",")[0]
      .split(":")[0]
      .trim()
      .toLowerCase();
    const isLocalHost = hostName === "localhost" || hostName === "127.0.0.1";
    const pathName = String(req.path || "");
    if (isLocalHost && /^\/(mindbase|api\/mindbase|api\/onboarding)(\/|$)/i.test(pathName)) {
      const mindbaseTenant = await getTenantByKey("mindbase");
      if (mindbaseTenant) tenant = mindbaseTenant;
    }

    if (!tenant) {
      return res.status(500).json({ message: "Tenant not configured" });
    }
    req.tenant = tenant;
    req.tenant_id = Number(tenant.id);
    next();
  } catch (error) {
    next(error);
  }
});

app.use(async (req, _res, next) => {
  if (degradedNoDbMode || qualityGateStartup) return next();
  try {
    const activeTenant = await resolveActiveTenantForRequest(req);
    if (activeTenant) {
      req.tenant = activeTenant as any;
      req.tenant_id = Number((activeTenant as any).id || 0);
    }
    next();
  } catch (error) {
    next(error);
  }
});

function registerDegradedApiHandlers() {
  app.get("/api/health/build", (_req, res) => {
    res.status(200).json({
      ok: false,
      degraded: true,
      code: "DB_UNAVAILABLE",
      message: "Service running in degraded mode: database unavailable",
      reason: degradedNoDbReason,
      serverTime: new Date().toISOString(),
      deployedAt: process.env.DEPLOYED_AT ?? null,
      nodeEnv: process.env.NODE_ENV ?? app.get("env"),
      gitSha: process.env.GIT_SHA ?? null,
      buildId: process.env.BUILD_ID ?? null,
      clientBuild: null,
    });
  });

  app.get("/api/health", (_req, res) => {
    res.status(503).json({
      ok: false,
      degraded: true,
      code: "DB_UNAVAILABLE",
      message: "Database unavailable",
      reason: degradedNoDbReason,
      serverTime: new Date().toISOString(),
    });
  });

  app.use("/api", (_req, res) => {
    res.status(503).json({
      message: "Service temporarily degraded: database unavailable",
      code: "DB_UNAVAILABLE",
      degraded: true,
      reason: degradedNoDbReason,
    });
  });
}

function registerShutdown(server: { close: (cb?: () => void) => void }) {
  const shutdown = (signal: string) => {
    log(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      log("HTTP server closed");
      process.exit(0);
    });

    // Force close after 10s
    setTimeout(() => {
      log("Could not close connections in time, forcefully shutting down");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// CORS for static frontend hosted on a different origin (e.g., GoDaddy shared hosting)
const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsAllowAll = process.env.CORS_ALLOW_ALL === "true";

app.use((req, res, next) => {
  const origin = req.headers.origin as string | undefined;
  const allow =
    !!origin && (corsAllowAll || corsOrigins.length === 0 || corsOrigins.includes(origin));

  if (allow && origin) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      (req.headers["access-control-request-headers"] as string | undefined) ??
        "Content-Type, Authorization"
    );
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// Verify database connection before starting server
async function checkDatabaseConnection() {
  const timeoutMsRaw = String(process.env.DB_CONNECT_TIMEOUT_MS || "").trim();
  const timeoutMs = timeoutMsRaw ? Number(timeoutMsRaw) : 12_000;

  try {
    log(`Checking database connection (timeout ${Number.isFinite(timeoutMs) ? timeoutMs : 12_000}ms)...`);

    // Test query to verify connection
    const probe = db.execute(sql`SELECT 1`);
    const deadline = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Database connection timed out")), Number.isFinite(timeoutMs) ? timeoutMs : 12_000),
    );

    await Promise.race([probe, deadline]);
    log("Database connection verified");
  } catch (error) {
    log("Database connection failed: " + (error instanceof Error ? error.message : String(error)));
    throw error;
  }
}

// Enhanced logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  // Capture JSON responses for logging
  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  // Log responses on completion
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

      // Add response data for non-200 status codes
      if (res.statusCode !== 200) {
        logLine += ` [!] Status: ${res.statusCode}`;
      }

      if (capturedJsonResponse) {
        // Truncate long responses
        const jsonStr = JSON.stringify(capturedJsonResponse);
        logLine += ` :: ${jsonStr.length > 50 ? jsonStr.slice(0, 47) + "..." : jsonStr}`;
      }

      log(logLine);
    }
  });

  next();
});

// Global error handler
const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  // Enhanced error logging
  log(`Error [${status}]: ${message}`);
  if (err.stack) {
    log(`Stack trace: ${err.stack}`);
  }

  const plan = err?.plan;
  res.status(status).json({
    message,
    ...(plan ? { requiresConsent: true, plan } : {}),
    error: app.get("env") === "development" ? err.stack : undefined,
  });
};

(async () => {
  try {
    if (qualityGateStartup) {
      const server = registerRoutes(app);
      log(`Routes registered successfully (startupMode=${startupMode})`);
      app.use(errorHandler);
      serveStatic(app);
      log("Static serving configured for production");

      const port = parseInt(process.env.PORT || "5000", 10);
      server.listen(port, "0.0.0.0", () => {
        log(`Server running on port ${port}`);
      });
      registerShutdown(server);
      return;
    }

    // Verify database connection first
    try {
      await checkDatabaseConnection();
      log("Database connection successful");
    } catch (error) {
      if (!allowStartWithoutDb) {
        throw error;
      }
      degradedNoDbMode = true;
      degradedNoDbReason = error instanceof Error ? error.message : String(error);
      log(
        `[startup] Database unavailable; continuing in degraded mode because ALLOW_START_WITHOUT_DB=true: ${degradedNoDbReason}`,
      );
    }

    if (degradedNoDbMode) {
      registerDegradedApiHandlers();
      app.use(errorHandler);

      if (app.get("env") === "development") {
        throw new Error("Degraded mode is supported in production only");
      } else {
        serveStatic(app);
        log("Static serving configured for production (degraded mode)");
      }

      const port = parseInt(process.env.PORT || "5000", 10);
      const server = app.listen(port, "0.0.0.0", () => {
        log(`Server running on port ${port} (degraded mode)`);
      });
      registerShutdown(server);
      return;
    }

    // Ensure tenants exist before any other initialization
    await ensureTenants();
    log("Tenants ensured");

    // Fail fast on partially configured Twilio environments.
    validateTwilioEnv();
    const otpRequired = String(process.env.WHATSAPP_OTP_REQUIRED || "").trim() === "1";
    const anyOtpEnv =
      !!String(process.env.TWILIO_ACCOUNT_SID || "").trim() ||
      !!String(process.env.TWILIO_AUTH_TOKEN || "").trim() ||
      !!String(process.env.TWILIO_VERIFY_SERVICE_SID || "").trim() ||
      !!String(process.env.TWILIO_WHATSAPP_FROM || "").trim();
    const otpHealth = getWhatsAppOtpHealth();
    if (otpRequired) {
      assertWhatsAppOtpConfigured();
      if (otpHealth.sandboxMode) {
        log("[whatsapp-otp] Twilio WhatsApp Sandbox mode");
      }
    } else if (anyOtpEnv && !otpHealth.configured) {
      log(`[whatsapp-otp] disabled (missing ${otpHealth.missing.join(", ")})`);
    } else if (otpHealth.configured && otpHealth.sandboxMode) {
      log("[whatsapp-otp] Twilio WhatsApp Sandbox mode");
    }
    const twilioCfg = getTwilioConfig();
    const smsEnabled = !!(twilioCfg.smsFrom || twilioCfg.messagingServiceSid);
    const messagingHealth = getMessagingHealth();
    log(
      `[Twilio] Config: accountSidPresent=${!!twilioCfg.accountSid}, authTokenPresent=${twilioCfg.authTokenPresent}, whatsappFromPresent=${!!twilioCfg.whatsappFrom}, smsEnabled=${smsEnabled}, smsVia=${String((twilioCfg as any).smsVia || "none")}, namespace=${String((twilioCfg as any).envNamespace || "global")}, statusCallbackBaseUrlPresent=${!!(twilioCfg as any).statusCallbackBaseUrl}`,
    );
    if (messagingHealth.missing.length) {
      log(`[Twilio] Missing config keys: ${messagingHealth.missing.join(", ")}`);
    }
    if (messagingHealth.warnings.length) {
      log(`[Twilio] Warnings: ${messagingHealth.warnings.join(" | ")}`);
    }

    const smtpHealth = validateSmtpEnvAtBoot();
    if (!smtpHealth.configured) {
      log(`[Email] SMTP disabled (${smtpHealth.mode})`);
      if (smtpHealth.missing.length) {
        log(`[Email] Missing SMTP config keys: ${smtpHealth.missing.join(", ")}`);
      }
    } else {
      log(`[Email] SMTP transport ready (mode=${smtpHealth.mode})`);
    }

    // Ensure agent enums are up-to-date (idempotent).
    await ensureAgentEnums();
    await ensureAgentVisibilityColumns();
    await ensureAgentsProductionTables();
    // Ensure agent photo columns exist before any agent queries run.
    await ensureAgentPhotoColumns();

    // Ensure shared telemetry + SEO autopilot tables exist (idempotent)
    await ensureTelemetryTables();
    await ensureSeoAutopilotTables();
    log("Telemetry + SEO tables ensured");

    // Ensure each tenant has at least one company.
    const tenantBootstrapKeys = ["bdo", "exportunity", "zone", "mindbase", "met", "vs", "hoz", "zogueland", "rayon1km"] as const;
    const tenantDefaultCompanies: Partial<Record<(typeof tenantBootstrapKeys)[number], number>> = {};
    for (const tenantKey of tenantBootstrapKeys) {
      const tenantRow = await getTenantByKey(tenantKey);
      if (!tenantRow) continue;
      const companyId = await ensureDefaultCompany({
        tenantId: Number(tenantRow.id),
        tenantKey,
        tenantName: String(tenantRow.name || ""),
        // Keep legacy behavior for existing unassigned/global agents.
        attachUnassignedAgents: tenantKey === "bdo",
      });
      tenantDefaultCompanies[tenantKey] = companyId;
      log(`Default company ready for tenant=${tenantKey} (id=${companyId})`);
    }

    const defaultCompanyId =
      tenantDefaultCompanies.bdo ??
      (await ensureDefaultCompany({
        attachUnassignedAgents: true,
      }));
    log(`Default company ready (bootstrap id=${defaultCompanyId})`);

    // Seed the canonical Bourse de l'Or knowledge base (idempotent)
    await ensureBourseDeLorKnowledgeBase(defaultCompanyId);
    log("Bourse de l'Or knowledge base ensured");

    // Initialize core agents
    await ensureAgentsInitialized(defaultCompanyId);
    log("Core agents initialized successfully");

    // Ensure baseline staffing (departments + IT) for the default company.
    await ensureCompanyStaffed(defaultCompanyId);
    log("Company staffing ensured successfully");

    // Ensure tenant-scoped chairman assistants and action definitions (hybrid cutover).
    await ensureChairmanAssistants();
    await ensureActionDefinitions();
    log("Chairman assistant defaults + action definitions ensured");

    // Seed demo data in dev if DB is empty (disable via AUTO_SEED=false)
    await ensureDemoData();
    // Ensure cheap-reply templates exist (idempotent)
    await ensureDefaultMessageTemplates();
    // Ensure optional mine realism columns exist (used by Bourse map pins)
    await ensureMineQuantityColumns();
    // Ensure polygon-capable territory schema exists (hierarchy + GeoJSON boundaries)
    await ensureTerritoryPolygonColumns();
    // Ensure image tables and seed Bourse hero into asset system if available
    await ensureImageTables();
    // Ensure agent photo editor tables/columns exist (uses image_assets/generate pipeline)
    await ensureAgentPhotoTables();
    // Ensure tenant-scoped payments table exists (KKiaPay + future providers)
    await ensureKkiapayPaymentsTable();
    // Ensure global wallet OS tables exist (ledger + vouchers + payouts)
    await ensureWalletOsTables();
    // Ensure marketplace map marker schema exists (db-driven marker styles + category/shop marker keys)
    await ensureMarketplaceMapTables();
    // Ensure shared communications tables exist (Twilio SMS/WhatsApp, etc.)
    await ensureCommunicationsTables();
    // Ensure public contact form tables exist
    await ensureContactTables();
    // Ensure unified notifications tables exist (omni-channel delivery logs)
    await ensureNotificationsTables();
    // Ensure Ops Center tables exist (action router + internal comms)
    await ensureActionRouterTables();
    // Ensure page registry exists (master menus + center routes + browse-all list)
    await ensurePageRegistryTables();
    // Ensure Agent Management V2 + Action Forge + unified activity views exist
    await ensureAgentManagementV2Tables();
    // Ensure brainstorm orchestration session storage exists
    await ensureBrainstormTables();
    // Ensure workstation runtime + monitoring tables exist
    await ensureWorkstationTables();
    // Ensure cadastre + demo-link tables exist (investment map + public demo route)
    await ensureCadastreTables();
    // Ensure Mindbase core tables exist (creator profiles + intellects + knowledge + chat)
    await ensureMindbaseTables();
    // Ensure Exportunity Meet tables exist (SFU sessions + invites + artifacts)
    await ensureMeetTables();
    await ensureMeetingContextTables();
    // Ensure Engineering Kernel tables exist (autonomous machine compilation/execution)
    await ensureEngineeringKernelTables();
    // Ensure internal mail engine tables exist (agent mailboxes + threads/messages index)
    await ensureMailEngineTables();
    // Ensure admin-managed human email tables exist (domains/accounts/aliases)
    await ensureEmailAdminTables();
    await ensureOpsCommsTables();
    await ensureIntelligenceGovernanceTables();
    await ensureVsTenantTables();
    await ensureChatMessageIdempotencyColumns();
    await ensureBourseHeroSeed();

    // Register routes and get HTTP server
    const server = registerRoutes(app);
    log("Routes registered successfully");

    // Start audio cleanup scheduler
    startAudioCleanupScheduler();

    // Start territory background jobs (referrer expiry, KPI rollups)
    startTerritoryJobs();
    log("Territory jobs scheduled");

    const mailScheduler = startMailIndexerScheduler();
    if (mailScheduler) {
      log(
        `Mail indexer scheduled (intervalMs=${mailScheduler.intervalMs}, limitPerMailbox=${mailScheduler.limitPerMailbox})`,
      );
    } else {
      log("Mail indexer scheduler disabled");
    }

    const agoojiyeJobWorker = startAgoojiyeJobWorkerScheduler();
    if (agoojiyeJobWorker) {
      log(
        `AGOOJIYE job worker scheduled (intervalMs=${agoojiyeJobWorker.intervalMs}, maxBatch=${agoojiyeJobWorker.maxBatch})`,
      );
    } else {
      log("AGOOJIYE job worker disabled");
    }

    const actionsScheduler = startActionsWorkerScheduler();
    if (actionsScheduler) {
      log(
        `Actions worker scheduled (intervalMs=${actionsScheduler.intervalMs}, maxBatch=${actionsScheduler.maxBatch})`,
      );
    } else {
      log("Actions worker scheduler disabled");
    }

    const governedCronScheduler = startGovernedCronScheduler();
    if (governedCronScheduler) {
      log(
        `Governed cron scheduler enabled (intervalMs=${governedCronScheduler.intervalMs}, maxBatch=${governedCronScheduler.maxBatch})`,
      );
    } else {
      log("Governed cron scheduler disabled");
    }

    const governedExecutionScheduler = startGovernedExecutionScheduler();
    if (governedExecutionScheduler) {
      log(
        `Governed execution scheduler enabled (intervalMs=${governedExecutionScheduler.intervalMs}, maxBatch=${governedExecutionScheduler.maxBatch})`,
      );
    } else {
      log("Governed execution scheduler disabled");
    }

    const workstationAutoShutdown = startWorkstationAutoShutdownScheduler();
    if (workstationAutoShutdown) {
      log(
        `Workstation auto-shutdown enabled (intervalMs=${workstationAutoShutdown.intervalMs}, inactivityMinutes=${workstationAutoShutdown.inactivityMinutes})`,
      );
    } else {
      log("Workstation auto-shutdown disabled");
    }

    const slaScheduler = startWorkOrderSlaScheduler();
    if (slaScheduler) {
      log(`Work order SLA scheduler enabled (intervalMs=${slaScheduler.intervalMs}, maxBatch=${slaScheduler.maxBatch})`);
    } else {
      log("Work order SLA scheduler disabled");
    }

    // Register error handler
    app.use(errorHandler);

    // Setup Vite or static serving
    if (app.get("env") === "development") {
      await setupVite(app, server);
      log("Vite middleware configured for development");
    } else {
      serveStatic(app);
      log("Static serving configured for production");
    }

    // Start server
    const port = parseInt(process.env.PORT || "5000", 10);
    server.listen(port, "0.0.0.0", () => {
      log(`Server running on port ${port}`);
    });

    // Handle server shutdown
    registerShutdown(server);

  } catch (error) {
    log(`Fatal error during startup: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
})();
