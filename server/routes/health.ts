import { Router } from "express";
import fs from "fs";
import path from "path";
import { db } from "@db";
import { actionRequests, eceSessions, eceUsers } from "@db/schema";
import { eq, sql } from "drizzle-orm";
import { ensureTenantAdmin, isChairmanAssistantUser } from "./utils/auth";
import { getWhatsAppOtpHealth, sendOtp } from "../services/whatsappOtp.service";
import { getMessagingHealth } from "../lib/messaging/config";
import { normalizeE164 } from "../lib/communications/twilio";
import { sendCommunicationAsStaff } from "../lib/communications/sendAsStaff";
import { getActionsWorkerStatus } from "../lib/actions/scheduler";
import { probeSmtpConnection } from "../lib/mail/smtpProbe";

const router = Router();
const deployedAt = new Date().toISOString();

function normalizeGitSha(raw: unknown): string | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value) return null;
  if (/^[0-9a-f]{7,40}$/i.test(value)) return value.slice(0, 12);
  return value;
}

function readGitSha(): string | null {
  const envSha = normalizeGitSha(
    process.env.GIT_SHA ||
      process.env.RENDER_GIT_COMMIT ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.COMMIT_SHA ||
      null,
  );
  if (envSha) return envSha;

  try {
    const repoRoot = process.cwd();
    const headPath = path.join(repoRoot, ".git", "HEAD");
    const head = fs.readFileSync(headPath, "utf8").trim();
    if (head.startsWith("ref:")) {
      const ref = head.replace(/^ref:\s+/, "").trim();
      const refPath = path.join(repoRoot, ".git", ref);
      const sha = fs.readFileSync(refPath, "utf8").trim();
      return normalizeGitSha(sha);
    }
    return normalizeGitSha(head);
  } catch {
    return null;
  }
}

function pickBuildId(): string | null {
  const envBuild = process.env.BUILD_ID || process.env.DEPLOYMENT_ID || process.env.RENDER_INSTANCE_ID || null;
  return envBuild ? String(envBuild) : null;
}

function findClientPublicDir(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "dist", "public"),
    path.resolve(process.cwd(), "client", "public"),
    path.resolve(process.cwd(), "public"),
  ];

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, "build.json"))) return dir;
    } catch {
      // ignore
    }
  }
  return null;
}

function readClientBuild(publicDir: string) {
  try {
    const buildPath = path.join(publicDir, "build.json");
    if (!fs.existsSync(buildPath)) return null;
    const raw = fs.readFileSync(buildPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as any;
  } catch {
    return null;
  }
}

router.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const publicDir = findClientPublicDir();
  const clientBuildRaw = publicDir ? readClientBuild(publicDir) : null;
  const gitSha = String(readGitSha() || clientBuildRaw?.gitSha || "unknown");
  const buildId = String(pickBuildId() || clientBuildRaw?.buildId || "unknown");
  const buildTime = String(
    process.env.BUILT_AT ||
      clientBuildRaw?.builtAt ||
      clientBuildRaw?.buildTime ||
      deployedAt,
  );

  res.json({
    ok: true,
    status: "ok",
    gitSha,
    buildId,
    buildTime,
    serverTime: new Date().toISOString(),
  });
});

async function getSessionUser(req: any) {
  try {
    const token = String(req?.headers?.authorization || "").replace("Bearer ", "").trim();
    if (!token) return null;
    const session = await db.query.eceSessions.findFirst({ where: eq(eceSessions.token, token) });
    if (!session || new Date(session.expiresAt) < new Date()) return null;
    const user = await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, session.userId) });
    return user || null;
  } catch {
    return null;
  }
}

function isAdminUser(user: any): boolean {
  if (!user) return false;
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const perms = Array.isArray(user?.permissions) ? user.permissions : [];
  const currentMode = user?.currentMode;
  return currentMode === "admin" || roles.includes("admin") || perms.includes("*") || isChairmanAssistantUser(user);
}

router.get("/build", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const publicDir = findClientPublicDir();
  const clientBuildRaw = publicDir ? readClientBuild(publicDir) : null;

  const serverBuildId = String(pickBuildId() || clientBuildRaw?.buildId || "unknown");
  const fullGitSha = String(readGitSha() || clientBuildRaw?.gitSha || "unknown");

  const allowSensitive = (() => {
    if (process.env.NODE_ENV !== "production") return true;
    return false;
  })();

  let isAdmin = allowSensitive;
  if (!isAdmin && req?.headers?.authorization) {
    const user = await getSessionUser(req);
    isAdmin = isAdminUser(user);
  }

  res.json({
    ok: true,
    serverTime: new Date().toISOString(),
    deployedAt,
    nodeEnv: process.env.NODE_ENV || "unknown",
    gitSha: isAdmin ? fullGitSha : null,
    buildId: serverBuildId,
    clientBuild: isAdmin && clientBuildRaw
      ? {
          gitSha: clientBuildRaw?.gitSha ?? null,
          buildId: clientBuildRaw?.buildId ?? null,
          builtAt: clientBuildRaw?.builtAt ?? clientBuildRaw?.buildTime ?? null,
        }
      : null,
  });
});

router.get("/whatsapp", (_req, res) => {
  const health = getWhatsAppOtpHealth();
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.json({
    provider: "twilio_verify",
    configured: health.configured,
    missing: health.missing,
    sandboxMode: health.sandboxMode,
    warnings: health.warnings,
  });
});

router.get("/messaging", (req: any, res) => {
  const tenant = req.tenant;
  if (!tenant) return res.status(400).json({ ok: false, message: "tenant required" });

  const health = getMessagingHealth(tenant.key);
  const response = {
    ok: Boolean(health.configured),
    tenant: {
      id: Number(tenant.id),
      slug: String(tenant.key),
    },
    twilio: {
      configured: Boolean(health.configured),
      envNamespace: health.resolved.envNamespace,
      sms: {
        enabled: Boolean(health.sms.enabled),
        via: health.sms.via,
      },
      whatsappOtp: {
        enabled: Boolean(health.whatsappOtp.enabled),
        verifyServiceSidPresent: Boolean(health.whatsappOtp.verifyServiceSidPresent),
      },
    },
    missing: health.missing,
    warnings: health.warnings,
  };

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  return res.json(response);
});

router.get("/messaging/test", ensureTenantAdmin, async (req: any, res) => {
  const tenant = req.tenant;
  if (!tenant) return res.status(400).json({ ok: false, message: "tenant required" });

  const requestId = String(req.headers["x-request-id"] || `msg-health-${Date.now()}`);
  const channel = String(req.query?.channel || "").trim();
  if (channel !== "sms" && channel !== "whatsappOtp") {
    return res.status(400).json({ ok: false, message: "channel must be sms|whatsappOtp", requestId });
  }

  const phoneRaw = String(req.query?.phone || "").trim();
  const phone = normalizeE164(phoneRaw);
  if (!phone) {
    return res.status(400).json({ ok: false, message: "phone must be E.164 format (+225...)", requestId });
  }

  const health = getMessagingHealth(tenant.key);
  try {
    if (channel === "sms") {
      if (!health.sms.enabled) {
        return res.status(412).json({
          ok: false,
          code: "SMS_NOT_CONFIGURED",
          message: "SMS sending disabled (set TWILIO_SMS_FROM or TWILIO_MESSAGING_SERVICE_SID)",
          requestId,
        });
      }

      const result = await sendCommunicationAsStaff({
        tenantId: Number(tenant.id),
        agentKey: "support",
        channel: "sms",
        toE164: phone,
        mode: "text",
        body: `[health-check] tenant=${tenant.key} requestId=${requestId}`,
        requestedByUserId: Number((req as any).adminUser?.id || 0) || null,
        admin: true,
        source: "health.messaging.test",
      });

      if (!result.ok) {
        return res.status(503).json({
          ok: false,
          code: (result as any).errorCode || "sms_send_failed",
          message: result.errorMessage || "SMS send failed",
          requestId,
        });
      }

      return res.json({
        ok: true,
        tenant: { id: Number(tenant.id), slug: String(tenant.key) },
        channel,
        status: result.status || "sent",
        sid: result.providerMessageId || null,
        requestId,
      });
    }

    if (!health.whatsappOtp.enabled) {
      return res.status(412).json({
        ok: false,
        code: "WHATSAPP_OTP_NOT_CONFIGURED",
        message: "WhatsApp OTP disabled (set TWILIO_VERIFY_SERVICE_SID with valid Twilio credentials)",
        requestId,
      });
    }

    const result = await sendOtp(phone);
    return res.json({
      ok: true,
      tenant: { id: Number(tenant.id), slug: String(tenant.key) },
      channel,
      status: result.status,
      sid: result.sid || null,
      to: result.to,
      requestId,
    });
  } catch (error: any) {
    const code = String(error?.code || `${channel}_test_failed`);
    const message = String(error?.message || "Messaging health test failed");
    console.error(
      `[messaging-health-test] tenant=${tenant.id} channel=${channel} requestId=${requestId} code=${code} message=${message}`,
    );
    return res.status(Number(error?.status || 500)).json({
      ok: false,
      code,
      message,
      requestId,
    });
  }
});

router.get("/actions-runner", async (_req, res) => {
  try {
    const runner = getActionsWorkerStatus();
    const queuedRow = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(actionRequests)
      .where(eq(actionRequests.lifecycleState, "QUEUED" as any));
    const queueDepth = Number(queuedRow?.[0]?.count || 0);
    const runnerAlive = Boolean(runner.healthy || (runner.enabled && runner.running && (runner.heartbeatAgeMs ?? Infinity) <= runner.staleThresholdMs));

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    return res.json({
      ok: true,
      runnerAlive,
      queueDepth,
      lastJobAt: runner.lastJobAt || null,
      runner,
      checkedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "actions_runner_health_failed",
      runnerAlive: false,
      queueDepth: null,
      lastJobAt: null,
    });
  }
});

router.get("/email", async (_req, res) => {
  try {
    const probe = await probeSmtpConnection();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    return res.status(probe.ok ? 200 : 503).json({
      ok: probe.ok,
      smtp: probe,
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "smtp_probe_failed",
    });
  }
});

export default router;
