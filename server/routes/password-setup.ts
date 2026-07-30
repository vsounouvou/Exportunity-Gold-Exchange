import { randomBytes } from "crypto";

import bcrypt from "bcryptjs";
import { Router } from "express";
import { and, eq } from "drizzle-orm";

import { db } from "@db";
import {
  agoojyeEngineeringProfiles,
  agoojyeProjectUsers,
  eceSessions,
  eceUsers,
  emailAccounts,
} from "@db/schema";

import { ensureTenantAdmin } from "./utils/auth";
import {
  buildPasswordSetupLink,
  consumePasswordSetupToken,
  createPasswordSetupToken,
  inspectPasswordSetupToken,
  resolvePasswordSetupBaseUrl,
} from "../lib/password-setup";
import { resolveSetupPasswordRedirect } from "../lib/setup-password-redirect";
import { engineeringNdaDecision } from "../lib/agoojye/ndaAccess";
import { createEngineeringNdaSession } from "../lib/agoojye/ndaOnboarding";
import {
  isMailserverSetupAvailable,
  mailserverDoveadmAuthTestWithRefresh,
  mailserverEmailUpdate,
} from "../lib/mail/mailserverSetup";

const router = Router();

const setupAttemptBuckets = new Map<string, { count: number; resetAt: number }>();
const MAX_SETUP_ATTEMPTS = 10;
const SETUP_WINDOW_MS = 10 * 60_000;

function consumeRateLimit(key: string) {
  const now = Date.now();
  const current = setupAttemptBuckets.get(key);
  if (!current || current.resetAt <= now) {
    setupAttemptBuckets.set(key, { count: 1, resetAt: now + SETUP_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (current.count >= MAX_SETUP_ATTEMPTS) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

function getRateLimitIdentity(req: any) {
  return String(req.headers["x-forwarded-for"] || req.ip || "unknown")
    .split(",")[0]
    .trim();
}

function maskSetupReason(reason: ReturnType<typeof consumePasswordSetupToken> extends Promise<infer T> ? T : never) {
  if ((reason as any)?.ok) return null;
  const code = (reason as any)?.reason;
  if (code === "used") return "SETUP_TOKEN_USED";
  if (code === "expired") return "SETUP_TOKEN_EXPIRED";
  return "SETUP_TOKEN_INVALID";
}

function buildSessionUserPayload(user: any) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roles: Array.isArray((user as any).roles) ? (user as any).roles : ["buyer"],
    permissions: Array.isArray((user as any).permissions) ? (user as any).permissions : [],
    currentMode: (user as any).currentMode || "buyer",
    buyerType: (user as any).buyerType || "retail",
    verificationLevel: (user as any).verificationLevel || "NONE",
    mustChangePassword: false,
  };
}

router.post("/api/auth/setup-password", async (req, res) => {
  try {
    const identity = getRateLimitIdentity(req);
    const bucket = consumeRateLimit(`setup-password:${identity}`);
    if (!bucket.allowed) {
      res.setHeader("Retry-After", String(bucket.retryAfterSec));
      return res.status(429).json({ message: "Rate limit exceeded", retryAfterSec: bucket.retryAfterSec });
    }

    const rawToken = String(req.body?.token || "").trim();
    const password = String(req.body?.password || "");
    if (!rawToken) return res.status(400).json({ message: "token is required" });
    if (password.length < 10) return res.status(400).json({ message: "Password must be at least 10 characters" });

    const inspectedToken = await inspectPasswordSetupToken(rawToken);
    if (!inspectedToken.ok) {
      return res.status(400).json({
        message: "Invalid or expired setup token",
        code: maskSetupReason(inspectedToken),
      });
    }

    const user = await db.query.eceUsers.findFirst({
      where: eq(eceUsers.id, inspectedToken.userId),
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.isActive) return res.status(403).json({ message: "Account is disabled" });

    const setupRedirect = resolveSetupPasswordRedirect({
      tenantKey: (req as any)?.tenant?.key,
      host: req.get("host"),
      forwardedHost: req.get("x-forwarded-host"),
    });
    const tenantId = Number((req as any)?.tenant?.id || 0);
    let projectUser: any = null;
    let engineeringProfile: any = null;
    if (setupRedirect.tenantKey === "agoojye") {
      projectUser = await db.query.agoojyeProjectUsers.findFirst({
        where: tenantId
          ? and(
              eq(agoojyeProjectUsers.tenantId, tenantId),
              eq(agoojyeProjectUsers.authUserId, Number(user.id)),
            )
          : eq(agoojyeProjectUsers.authUserId, Number(user.id)),
      });
      if (projectUser) {
        engineeringProfile = await db.query.agoojyeEngineeringProfiles.findFirst({
          where: eq(
            agoojyeEngineeringProfiles.projectUserId,
            Number(projectUser.id),
          ),
        });
      }
      if (
        engineeringProfile &&
        String(engineeringProfile.ndaStatus || "").trim().toLowerCase() !== "signed"
      ) {
        return res.status(403).json({
          message:
            "Votre NDA doit être enregistré par l'administration avant l'activation.",
          code: "NDA_NOT_REGISTERED",
        });
      }
    }

    const tokenStatus = await consumePasswordSetupToken(rawToken);
    if (!tokenStatus.ok) {
      return res.status(400).json({
        message: "Invalid or expired setup token",
        code: maskSetupReason(tokenStatus),
      });
    }

    const roundsRaw = Number(process.env.PASSWORD_HASH_ROUNDS || 10);
    const rounds = Number.isFinite(roundsRaw) ? Math.max(10, Math.trunc(roundsRaw)) : 10;
    const passwordHash = await bcrypt.hash(password, rounds);
    const metadata =
      user.metadata && typeof user.metadata === "object" && !Array.isArray(user.metadata)
        ? { ...(user.metadata as Record<string, unknown>) }
        : {};
    metadata.mustChangePassword = false;
    metadata.passwordSetupAt = new Date().toISOString();
    const requiresMfa =
      Boolean(metadata.requireMfa) ||
      String(user.email || "").trim().toLowerCase() ===
        String(process.env.AGOOJIYE_SUPER_ADMIN_EMAIL || "vs@agoojiye.com").trim().toLowerCase();

    const corporateEmail = String(user.email || "").trim().toLowerCase();
    let webmailReady = false;
    if (
      setupRedirect.tenantKey === "agoojye" &&
      corporateEmail.endsWith("@agoojiye.com") &&
      isMailserverSetupAvailable()
    ) {
      const mailbox = await db.query.emailAccounts.findFirst({
        where: and(
          eq(emailAccounts.address, corporateEmail),
          eq(emailAccounts.status, "active"),
        ),
      });
      if (mailbox) {
        const updatedMailbox = await mailserverEmailUpdate(corporateEmail, password).catch(() => null);
        if (updatedMailbox?.ok) {
          const verifiedMailbox = await mailserverDoveadmAuthTestWithRefresh(
            corporateEmail,
            password,
            { attempts: 4, delayMs: 750 },
          ).catch(() => null);
          webmailReady = Boolean(verifiedMailbox?.ok);
        }
      }
    }
    metadata.webmailPasswordSyncStatus = webmailReady ? "ready" : "not_confirmed";
    if (webmailReady) metadata.webmailPasswordSyncedAt = new Date().toISOString();

    await db
      .update(eceUsers)
      .set({
        passwordHash,
        metadata,
        updatedAt: new Date(),
      })
      .where(eq(eceUsers.id, user.id));

    let ndaUploadRequired = false;
    if (setupRedirect.tenantKey === "agoojye" && projectUser) {
      const ndaDecision = engineeringProfile
        ? engineeringNdaDecision(engineeringProfile)
        : null;
      ndaUploadRequired = Boolean(ndaDecision && !ndaDecision.allowed);
      if (projectUser) {
        await db
          .update(agoojyeProjectUsers)
          .set({
            status: ndaUploadRequired ? "NDA Required" : "Active",
            onboardingProgress: Math.max(
              Number(projectUser.onboardingProgress || 0),
              ndaUploadRequired ? 35 : 25,
            ),
            updatedAt: new Date(),
          })
          .where(eq(agoojyeProjectUsers.id, Number(projectUser.id)));
        if (engineeringProfile) {
          await db
            .update(agoojyeEngineeringProfiles)
            .set({
              ndaAccessState: ndaUploadRequired
                ? ndaDecision?.state || "required"
                : engineeringProfile.ndaAccessState,
              onboardingState: ndaUploadRequired ? "nda_required" : "activated",
              invitationState: "accepted",
              ...(webmailReady ? { mailboxState: "provisioned" } : {}),
              updatedAt: new Date(),
            })
            .where(
              eq(
                agoojyeEngineeringProfiles.projectUserId,
                Number(projectUser.id),
              ),
            );
        }
      }
    }

    if (ndaUploadRequired && engineeringProfile && tenantId) {
      const ndaSession = await createEngineeringNdaSession({
        tenantId,
        engineeringProfileId: Number(engineeringProfile.id),
        userId: Number(user.id),
      });
      return res.json({
        ok: true,
        ndaRequired: true,
        token: ndaSession.token,
        expiresAt: ndaSession.expiresAt,
        redirect: "/workspace/onboarding/nda",
        tenantKey: setupRedirect.tenantKey,
        webmailReady,
        webmailUrl: webmailReady ? "https://mail.agoojiye.com/" : null,
        user: {
          ...buildSessionUserPayload(user),
          sessionScope: "agoojye_nda",
        },
      });
    }

    if (requiresMfa && setupRedirect.tenantKey === "agoojye") {
      return res.json({
        ok: true,
        mfaRequired: true,
        redirect: "/workspace/connexion",
        tenantKey: setupRedirect.tenantKey,
        webmailReady,
        webmailUrl: webmailReady ? "https://mail.agoojiye.com/" : null,
      });
    }

    const sessionToken = randomBytes(32).toString("hex");
    await db.insert(eceSessions).values({
      userId: user.id,
      token: sessionToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ipAddress: req.ip,
      userAgent: String(req.headers["user-agent"] || ""),
      createdAt: new Date(),
    });

    return res.json({
      ok: true,
      token: sessionToken,
      redirect: setupRedirect.redirect,
      tenantKey: setupRedirect.tenantKey,
      webmailReady,
      webmailUrl: webmailReady ? "https://mail.agoojiye.com/" : null,
      user: buildSessionUserPayload(user),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to setup password" });
  }
});

router.post("/api/admin/users/:id/regenerate-setup-link", ensureTenantAdmin, async (req, res) => {
  try {
    const userId = Number(req.params?.id || 0);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ message: "Valid user id is required" });
    }

    const user = await db.query.eceUsers.findFirst({
      where: eq(eceUsers.id, userId),
      columns: { id: true, email: true, isActive: true },
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.isActive) return res.status(400).json({ message: "User is inactive" });

    const created = await createPasswordSetupToken({ userId, ttlHours: 24, invalidateExisting: true });
    const fallbackOrigin = `${req.protocol}://${req.get("host")}`;
    const setupLink = buildPasswordSetupLink(resolvePasswordSetupBaseUrl(fallbackOrigin), created.rawToken);

    return res.json({
      ok: true,
      userId,
      expiresAt: created.expiresAt.toISOString(),
      setupLink,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to regenerate setup link" });
  }
});

export default router;
