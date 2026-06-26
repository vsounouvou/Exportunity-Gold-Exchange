import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@db";
import { auditLogs, emailAccounts } from "@db/schema";
import { resolveTenantMailDomain } from "../lib/mail/domainResolver";
import { verifyImapLogin } from "../lib/mail/imapAuthCheck";
import { isMailserverSetupAvailable, mailserverEmailUpdate } from "../lib/mail/mailserverSetup";

const router = Router();

const attemptBuckets = new Map<string, { count: number; resetAt: number }>();
const HOUR_MS = 60 * 60_000;

function normalizeEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  if (email.length > 254) return "";
  return email;
}

function normalizeDomain(value: unknown) {
  const domain = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  if (!domain || domain === "localhost") return "";
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return "";
  return domain;
}

function getEmailDomain(email: string) {
  return normalizeDomain(email.split("@").pop());
}

function getEmailLocalPart(email: string) {
  return String(email.split("@")[0] || "").toLowerCase();
}

function getRequestIp(req: any) {
  return String(req.headers["x-forwarded-for"] || req.ip || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
}

function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = attemptBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    attemptBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

function checkRateLimit(req: any, email: string) {
  const ip = getRequestIp(req);
  const ipBucket = consumeRateLimit(`mail-password:ip:${ip}`, 20, HOUR_MS);
  if (!ipBucket.allowed) return ipBucket;
  return consumeRateLimit(`mail-password:email:${email}`, 5, HOUR_MS);
}

function validateNewPassword(input: { email: string; currentPassword: string; newPassword: string }) {
  const newPassword = String(input.newPassword || "");
  if (newPassword.length < 12) return "Le nouveau mot de passe doit contenir au moins 12 caractères.";
  if (newPassword.length > 128) return "Le nouveau mot de passe est trop long.";
  if (newPassword === input.currentPassword) return "Le nouveau mot de passe doit être différent de l'ancien.";

  const classes = [
    /[a-z]/.test(newPassword),
    /[A-Z]/.test(newPassword),
    /\d/.test(newPassword),
    /[^A-Za-z0-9]/.test(newPassword),
  ].filter(Boolean).length;
  if (classes < 3) {
    return "Utilisez au moins trois types de caractères: minuscules, majuscules, chiffres ou symboles.";
  }

  const localPart = getEmailLocalPart(input.email);
  if (localPart.length >= 3 && newPassword.toLowerCase().includes(localPart)) {
    return "Le mot de passe ne doit pas contenir votre adresse email.";
  }

  return "";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyImapLoginWithRetry(input: { user: string; password: string; attempts?: number; delayMs?: number }) {
  const attempts = Math.max(1, Math.min(input.attempts ?? 8, 12));
  const delayMs = Math.max(250, Math.min(input.delayMs ?? 1_500, 5_000));
  let last = await verifyImapLogin({ user: input.user, password: input.password });
  if (last.ok) return last;

  for (let attempt = 2; attempt <= attempts; attempt += 1) {
    await sleep(delayMs);
    last = await verifyImapLogin({ user: input.user, password: input.password });
    if (last.ok) return last;
  }

  return last;
}

async function resolveAllowedDomains(tenant: any) {
  const domains = new Set<string>();
  for (const candidate of Array.isArray(tenant?.domains) ? tenant.domains : []) {
    const domain = normalizeDomain(candidate);
    if (domain) domains.add(domain);
  }

  const resolved = await resolveTenantMailDomain({
    id: Number(tenant.id),
    key: String(tenant.key || ""),
    domains: Array.isArray(tenant.domains) ? tenant.domains : null,
  });
  if (resolved) domains.add(normalizeDomain(resolved));

  if (String(tenant?.key || "").toLowerCase() === "agoojye") {
    domains.add("agoojiye.com");
  }

  return domains;
}

async function writePasswordChangeAudit(input: {
  tenantId: number;
  accountId: number | null;
  address: string;
  ipAddress: string;
  userAgent: string;
  ok: boolean;
  reason?: string;
}) {
  await db.insert(auditLogs).values({
    tenantId: input.tenantId,
    userId: null,
    userRole: "mailbox_user",
    action: input.ok ? "email_account.password_changed" : "email_account.password_change_failed",
    entityType: "email_account",
    entityId: input.accountId,
    previousState: null,
    newState: { address: input.address, ok: input.ok },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: input.reason ? { reason: input.reason } : {},
    createdAt: new Date(),
  });
}

router.post("/password/change", async (req: any, res) => {
  const tenant = req.tenant;
  const ipAddress = getRequestIp(req);
  const userAgent = String(req.headers["user-agent"] || "");
  let accountId: number | null = null;
  let email = "";

  try {
    if (!tenant?.id) return res.status(400).json({ message: "Tenant requis." });

    email = normalizeEmail(req.body?.email);
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");

    if (!email) return res.status(400).json({ message: "Adresse email invalide." });
    if (!currentPassword) return res.status(400).json({ message: "Mot de passe actuel requis." });

    const rate = checkRateLimit(req, email);
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSec));
      return res.status(429).json({
        message: "Trop de tentatives. Réessayez plus tard.",
        retryAfterSec: rate.retryAfterSec,
      });
    }

    const passwordError = validateNewPassword({ email, currentPassword, newPassword });
    if (passwordError) return res.status(400).json({ message: passwordError });

    const emailDomain = getEmailDomain(email);
    const allowedDomains = await resolveAllowedDomains(tenant);
    if (!emailDomain || !allowedDomains.has(emailDomain)) {
      return res.status(403).json({ message: "Cette adresse ne correspond pas à ce tenant." });
    }

    const account = await db.query.emailAccounts.findFirst({
      where: and(eq(emailAccounts.tenantId, Number(tenant.id)), eq(emailAccounts.address, email)),
    });
    accountId = account?.id ?? null;
    if (!account || account.status !== "active") {
      return res.status(403).json({ message: "Adresse ou mot de passe actuel incorrect." });
    }

    if (!isMailserverSetupAvailable()) {
      return res.status(503).json({ message: "Le service de changement de mot de passe n'est pas disponible." });
    }

    const currentAuth = await verifyImapLogin({ user: email, password: currentPassword });
    if (!currentAuth.ok) {
      await writePasswordChangeAudit({
        tenantId: Number(tenant.id),
        accountId,
        address: email,
        ipAddress,
        userAgent,
        ok: false,
        reason: "current_password_rejected",
      });
      return res.status(403).json({ message: "Adresse ou mot de passe actuel incorrect." });
    }

    const update = await mailserverEmailUpdate(email, newPassword);
    if (!update.ok) {
      await writePasswordChangeAudit({
        tenantId: Number(tenant.id),
        accountId,
        address: email,
        ipAddress,
        userAgent,
        ok: false,
        reason: "mailserver_update_failed",
      });
      return res.status(500).json({ message: "Le mot de passe n'a pas pu être mis à jour." });
    }

    const newAuth = await verifyImapLoginWithRetry({ user: email, password: newPassword, attempts: 10, delayMs: 2_000 });
    if (!newAuth.ok) {
      await mailserverEmailUpdate(email, currentPassword).catch(() => null);
      await writePasswordChangeAudit({
        tenantId: Number(tenant.id),
        accountId,
        address: email,
        ipAddress,
        userAgent,
        ok: false,
        reason: "new_password_verification_failed",
      });
      return res.status(502).json({
        message: "Le nouveau mot de passe n'a pas pu être vérifié. L'ancien mot de passe reste à utiliser.",
      });
    }

    const updatedAt = new Date();
    await db
      .update(emailAccounts)
      .set({ updatedAt })
      .where(and(eq(emailAccounts.id, account.id), eq(emailAccounts.tenantId, Number(tenant.id))));

    await writePasswordChangeAudit({
      tenantId: Number(tenant.id),
      accountId: account.id,
      address: email,
      ipAddress,
      userAgent,
      ok: true,
    });

    res.json({
      ok: true,
      message: "Mot de passe mis à jour.",
      webmailUrl: "https://mail.exportunity.net/",
    });
  } catch (err: any) {
    if (tenant?.id && email) {
      await writePasswordChangeAudit({
        tenantId: Number(tenant.id),
        accountId,
        address: email,
        ipAddress,
        userAgent,
        ok: false,
        reason: "server_error",
      }).catch(() => null);
    }
    res.status(err?.status || 500).json({ message: err?.message || "Changement de mot de passe impossible." });
  }
});

export default router;
