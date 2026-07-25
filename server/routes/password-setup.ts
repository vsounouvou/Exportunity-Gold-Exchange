import { randomBytes } from "crypto";

import bcrypt from "bcryptjs";
import { Router } from "express";
import { eq } from "drizzle-orm";

import { db } from "@db";
import { eceSessions, eceUsers } from "@db/schema";

import { ensureTenantAdmin } from "./utils/auth";
import {
  buildPasswordSetupLink,
  consumePasswordSetupToken,
  createPasswordSetupToken,
  resolvePasswordSetupBaseUrl,
} from "../lib/password-setup";
import { resolveSetupPasswordRedirect } from "../lib/setup-password-redirect";

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

    const tokenStatus = await consumePasswordSetupToken(rawToken);
    if (!tokenStatus.ok) {
      return res.status(400).json({
        message: "Invalid or expired setup token",
        code: maskSetupReason(tokenStatus),
      });
    }

    const user = await db.query.eceUsers.findFirst({
      where: eq(eceUsers.id, tokenStatus.userId),
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.isActive) return res.status(403).json({ message: "Account is disabled" });

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

    await db
      .update(eceUsers)
      .set({
        passwordHash,
        metadata,
        updatedAt: new Date(),
      })
      .where(eq(eceUsers.id, user.id));

    const setupRedirect = resolveSetupPasswordRedirect({
      tenantKey: (req as any)?.tenant?.key,
      host: req.get("host"),
      forwardedHost: req.get("x-forwarded-host"),
    });

    if (requiresMfa && setupRedirect.tenantKey === "agoojye") {
      return res.json({
        ok: true,
        mfaRequired: true,
        redirect: "/workspace/connexion",
        tenantKey: setupRedirect.tenantKey,
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
