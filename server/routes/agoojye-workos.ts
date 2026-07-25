import { createHash, randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
import { Router } from "express";
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import multer from "multer";
import QRCode from "qrcode";
import * as XLSX from "xlsx";
import { z } from "zod";

import { db } from "@db";
import {
  agoojyeAuditLogs,
  agoojyeOsChannelMembers,
  agoojyeOsChannels,
  agoojyeOsNotifications,
  agoojyeOsProjectMembers,
  agoojyeOsProjects,
  agoojyeOsPushSubscriptions,
  agoojyeProjectUsers,
  agoojyeTasks,
  agoojyeTeams,
  agoojyeWorkosAgentActions,
  agoojyeWorkosAgents,
  agoojyeWorkosComplianceAccess,
  agoojyeWorkosMfaChallenges,
  agoojyeWorkosMfaFactors,
  agoojyeWorkosOffboardingEvents,
  agoojyeWorkosSecurityEvents,
  agoojyeWorkosSessions,
  agoojyeWorkosVacancies,
  agoojyeWorkosWorkerImports,
  eceSessions,
  eceUsers,
  userTenantRoles,
} from "@db/schema";

import { ensureTenantUser } from "./utils/auth";
import {
  buildTotpUri,
  decryptMfaSecret,
  encryptMfaSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  hashWorkosToken,
  hasPrivilegedWorkosRole,
  isAgoojiyeSuperAdmin,
  verifyTotp,
} from "../lib/agoojye/workosSecurity";
import {
  buildPasswordSetupLink,
  createPasswordSetupToken,
  resolvePasswordSetupBaseUrl,
} from "../lib/password-setup";
import { isMailserverSetupAvailable, mailserverEmailAdd } from "../lib/mail/mailserverSetup";

const router = Router();
const authApi = Router();
const memberApi = Router();
const adminApi = Router();
const loginBuckets = new Map<string, { count: number; resetAt: number }>();
const workerImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(1, Math.min(20, Number(process.env.AGOOJIYE_WORKER_IMPORT_MAX_MB || 5))) * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed =
      /\.(csv|xlsx|xls)$/i.test(file.originalname) ||
      [
        "text/csv",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ].includes(file.mimetype);
    if (!allowed) {
      callback(new Error("Format CSV ou XLSX requis"));
      return;
    }
    callback(null, true);
  },
});

const clean = (value: unknown) => String(value ?? "").trim();
const normalizeEmail = (value: unknown) => clean(value).toLowerCase();

function requireAgoojiyeTenant(req: any, res: any) {
  if (!req.tenant || clean(req.tenant.key).toLowerCase() !== "agoojye") {
    res.status(404).json({ message: "AGOOJIYE WorkOS n'est disponible que sur le domaine AGOOJIYE." });
    return null;
  }
  return Number(req.tenant.id);
}

function clientIdentity(req: any) {
  return clean(req.headers["x-forwarded-for"] || req.ip || "unknown").split(",")[0].slice(0, 100);
}

function consumeLoginLimit(req: any, res: any, scope: string) {
  const key = `${scope}:${clientIdentity(req)}`;
  const now = Date.now();
  const current = loginBuckets.get(key);
  if (!current || current.resetAt <= now) {
    loginBuckets.set(key, { count: 1, resetAt: now + 10 * 60_000 });
    return true;
  }
  if (current.count >= 12) {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
    res.status(429).json({ message: "Trop de tentatives. Réessayez dans quelques minutes." });
    return false;
  }
  current.count += 1;
  return true;
}

function getBearerToken(req: any) {
  const header = clean(req.headers.authorization);
  return header.replace(/^Bearer\s+/i, "");
}

async function tenantRoles(tenantId: number, userId: number) {
  const rows = await db.query.userTenantRoles.findMany({
    where: and(eq(userTenantRoles.tenantId, tenantId), eq(userTenantRoles.userId, userId)),
  });
  return rows.map((row) => String(row.role));
}

async function recordSecurityEvent(
  req: any,
  input: {
    tenantId: number;
    eventType: string;
    actorUserId?: number | null;
    subjectUserId?: number | null;
    result?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(agoojyeWorkosSecurityEvents).values({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId || null,
    subjectUserId: input.subjectUserId || null,
    eventType: input.eventType,
    result: input.result || "success",
    reason: input.reason,
    ipAddress: clientIdentity(req),
    userAgent: clean(req.headers["user-agent"]).slice(0, 500),
    metadata: input.metadata || {},
  });
}

function sessionUser(user: any, roles: string[], member: any) {
  return {
    id: Number(user.id),
    email: clean(user.email),
    displayName: clean(user.displayName),
    roles: Array.from(new Set([...(Array.isArray(user.roles) ? user.roles : []), ...roles])),
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    currentMode: user.currentMode || "buyer",
    buyerType: user.buyerType || "retail",
    verificationLevel: user.verificationLevel || "NONE",
    mustChangePassword: Boolean((user.metadata as any)?.mustChangePassword),
    workosRole: member?.role || "Membre AGOOJIYE",
  };
}

async function createWorkosSession(req: any, tenantId: number, user: any, mfaVerified: boolean) {
  const token = randomBytes(32).toString("hex");
  const privileged = hasPrivilegedWorkosRole(user, await tenantRoles(tenantId, Number(user.id)));
  const durationHours = privileged
    ? Math.max(1, Math.min(24, Number(process.env.AGOOJIYE_PRIVILEGED_SESSION_HOURS || 8)))
    : Math.max(1, Math.min(24 * 14, Number(process.env.AGOOJIYE_WORKOS_SESSION_HOURS || 168)));
  const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);
  const [session] = await db
    .insert(eceSessions)
    .values({
      userId: Number(user.id),
      token,
      expiresAt,
      ipAddress: clientIdentity(req),
      userAgent: clean(req.headers["user-agent"]),
    })
    .returning({ id: eceSessions.id });
  await db.insert(agoojyeWorkosSessions).values({
    tenantId,
    userId: Number(user.id),
    eceSessionId: Number(session.id),
    tokenHash: hashWorkosToken(token),
    mfaVerifiedAt: mfaVerified ? new Date() : null,
    expiresAt,
  });
  return { token, expiresAt };
}

async function createChallenge(tenantId: number, userId: number, purpose: "login" | "enroll") {
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  await db.insert(agoojyeWorkosMfaChallenges).values({
    tenantId,
    userId,
    tokenHash: hashWorkosToken(rawToken),
    purpose,
    expiresAt,
  });
  return { rawToken, expiresAt };
}

async function resolveChallenge(tenantId: number, rawToken: string) {
  return db.query.agoojyeWorkosMfaChallenges.findFirst({
    where: and(
      eq(agoojyeWorkosMfaChallenges.tenantId, tenantId),
      eq(agoojyeWorkosMfaChallenges.tokenHash, hashWorkosToken(rawToken)),
      isNull(agoojyeWorkosMfaChallenges.usedAt),
      gt(agoojyeWorkosMfaChallenges.expiresAt, new Date()),
    ),
  });
}

const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(300),
});

authApi.post("/login", async (req: any, res) => {
  const tenantId = requireAgoojiyeTenant(req, res);
  if (!tenantId || !consumeLoginLimit(req, res, "workos-login")) return;
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Adresse ou mot de passe invalide." });
  const email = normalizeEmail(parsed.data.email);
  const user = await db.query.eceUsers.findFirst({ where: eq(eceUsers.email, email) });
  const passwordOk = Boolean(user?.passwordHash) && (await bcrypt.compare(parsed.data.password, String(user?.passwordHash || "")));
  if (!user || !user.isActive || !passwordOk) {
    await recordSecurityEvent(req, {
      tenantId,
      eventType: "workos_login",
      subjectUserId: user?.id,
      result: "denied",
      reason: "invalid_credentials",
      metadata: { email },
    });
    return res.status(401).json({ message: "Adresse ou mot de passe incorrect." });
  }
  const roles = await tenantRoles(tenantId, Number(user.id));
  if (!roles.length) {
    await recordSecurityEvent(req, {
      tenantId,
      eventType: "workos_login",
      subjectUserId: Number(user.id),
      result: "denied",
      reason: "tenant_membership_missing",
    });
    return res.status(403).json({ message: "Ce compte ne fait pas partie de l'organisation AGOOJIYE." });
  }
  const member = await db.query.agoojyeProjectUsers.findFirst({
    where: and(
      eq(agoojyeProjectUsers.tenantId, tenantId),
      eq(agoojyeProjectUsers.authUserId, Number(user.id)),
    ),
  });
  if (!member || ["suspended", "archived", "inactive", "ancien membre"].includes(clean(member.status).toLowerCase())) {
    return res.status(403).json({ message: "Ce profil AGOOJIYE n'est pas actif." });
  }
  if ((user.metadata as any)?.mustChangePassword) {
    return res.status(403).json({ message: "Vous devez d'abord définir votre mot de passe depuis le lien sécurisé.", code: "PASSWORD_SETUP_REQUIRED" });
  }

  const privileged = hasPrivilegedWorkosRole(user, roles);
  if (!privileged) {
    const session = await createWorkosSession(req, tenantId, user, false);
    await recordSecurityEvent(req, {
      tenantId,
      eventType: "workos_login",
      subjectUserId: Number(user.id),
      metadata: { mfa: false },
    });
    return res.json({ ok: true, token: session.token, expiresAt: session.expiresAt, user: sessionUser(user, roles, member), redirect: "/workspace" });
  }

  let factor = await db.query.agoojyeWorkosMfaFactors.findFirst({
    where: and(eq(agoojyeWorkosMfaFactors.tenantId, tenantId), eq(agoojyeWorkosMfaFactors.userId, Number(user.id))),
  });
  if (!factor?.enabled) {
    const secret = generateTotpSecret();
    const encryptedSecret = encryptMfaSecret(secret);
    if (factor) {
      [factor] = await db
        .update(agoojyeWorkosMfaFactors)
        .set({ encryptedSecret, enabled: false, recoveryCodeHashes: [], updatedAt: new Date() })
        .where(eq(agoojyeWorkosMfaFactors.id, factor.id))
        .returning();
    } else {
      [factor] = await db
        .insert(agoojyeWorkosMfaFactors)
        .values({ tenantId, userId: Number(user.id), encryptedSecret })
        .returning();
    }
    const challenge = await createChallenge(tenantId, Number(user.id), "enroll");
    const otpauthUrl = buildTotpUri({ secret, email: user.email, issuer: "AGOOJIYE WorkOS" });
    await recordSecurityEvent(req, {
      tenantId,
      eventType: "mfa_enrollment_started",
      subjectUserId: Number(user.id),
    });
    return res.status(202).json({
      ok: true,
      status: "mfa_enrollment_required",
      challengeToken: challenge.rawToken,
      expiresAt: challenge.expiresAt,
      secret,
      otpauthUrl,
      qrDataUrl: await QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: "M", margin: 1, width: 256 }),
    });
  }

  const challenge = await createChallenge(tenantId, Number(user.id), "login");
  await recordSecurityEvent(req, {
    tenantId,
    eventType: "mfa_challenge_created",
    subjectUserId: Number(user.id),
  });
  return res.status(202).json({
    ok: true,
    status: "mfa_required",
    challengeToken: challenge.rawToken,
    expiresAt: challenge.expiresAt,
  });
});

const verifySchema = z.object({
  challengeToken: z.string().min(20).max(300),
  code: z.string().min(6).max(12),
});

authApi.post("/mfa/verify", async (req: any, res) => {
  const tenantId = requireAgoojiyeTenant(req, res);
  if (!tenantId || !consumeLoginLimit(req, res, "workos-mfa")) return;
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Code de vérification invalide." });
  const challenge = await resolveChallenge(tenantId, parsed.data.challengeToken);
  if (!challenge || Number(challenge.attempts || 0) >= 6) {
    return res.status(400).json({ message: "Le défi MFA est invalide ou expiré.", code: "MFA_CHALLENGE_INVALID" });
  }
  const user = await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, Number(challenge.userId)) });
  const factor = await db.query.agoojyeWorkosMfaFactors.findFirst({
    where: and(
      eq(agoojyeWorkosMfaFactors.tenantId, tenantId),
      eq(agoojyeWorkosMfaFactors.userId, Number(challenge.userId)),
    ),
  });
  if (!user || !user.isActive || !factor) return res.status(403).json({ message: "Compte MFA indisponible." });
  let verified = false;
  try {
    verified = verifyTotp(decryptMfaSecret(factor.encryptedSecret), parsed.data.code);
  } catch {
    verified = false;
  }
  if (!verified) {
    await db
      .update(agoojyeWorkosMfaChallenges)
      .set({ attempts: Number(challenge.attempts || 0) + 1 })
      .where(eq(agoojyeWorkosMfaChallenges.id, challenge.id));
    await recordSecurityEvent(req, {
      tenantId,
      eventType: "mfa_verification",
      subjectUserId: Number(user.id),
      result: "denied",
      reason: "invalid_code",
    });
    return res.status(401).json({ message: "Code de vérification incorrect." });
  }

  const recoveryCodes = challenge.purpose === "enroll" ? generateRecoveryCodes() : [];
  const challengeClaimed = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(agoojyeWorkosMfaChallenges)
      .set({ usedAt: new Date() })
      .where(and(eq(agoojyeWorkosMfaChallenges.id, challenge.id), isNull(agoojyeWorkosMfaChallenges.usedAt)))
      .returning({ id: agoojyeWorkosMfaChallenges.id });
    if (!claimed.length) return false;
    await tx
      .update(agoojyeWorkosMfaFactors)
      .set({
        enabled: true,
        verifiedAt: factor.verifiedAt || new Date(),
        lastUsedAt: new Date(),
        recoveryCodeHashes:
          recoveryCodes.length > 0 ? recoveryCodes.map(hashRecoveryCode) : factor.recoveryCodeHashes,
        updatedAt: new Date(),
      })
      .where(eq(agoojyeWorkosMfaFactors.id, factor.id));
    return true;
  });
  if (!challengeClaimed) {
    return res.status(409).json({ message: "Ce défi MFA a déjà été utilisé.", code: "MFA_CHALLENGE_USED" });
  }
  const roles = await tenantRoles(tenantId, Number(user.id));
  const member = await db.query.agoojyeProjectUsers.findFirst({
    where: and(eq(agoojyeProjectUsers.tenantId, tenantId), eq(agoojyeProjectUsers.authUserId, Number(user.id))),
  });
  const session = await createWorkosSession(req, tenantId, user, true);
  await recordSecurityEvent(req, {
    tenantId,
    eventType: challenge.purpose === "enroll" ? "mfa_enrolled" : "mfa_verification",
    subjectUserId: Number(user.id),
  });
  return res.json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    user: sessionUser(user, roles, member),
    redirect: isAgoojiyeSuperAdmin(user, roles) ? "/admin/command-center" : "/workspace",
    recoveryCodes: recoveryCodes.length ? recoveryCodes : undefined,
  });
});

const recoverySchema = z.object({
  challengeToken: z.string().min(20).max(300),
  recoveryCode: z.string().min(8).max(30),
});

authApi.post("/mfa/recovery", async (req: any, res) => {
  const tenantId = requireAgoojiyeTenant(req, res);
  if (!tenantId || !consumeLoginLimit(req, res, "workos-recovery")) return;
  const parsed = recoverySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Code de récupération invalide." });
  const challenge = await resolveChallenge(tenantId, parsed.data.challengeToken);
  if (!challenge || challenge.purpose !== "login") return res.status(400).json({ message: "Le défi MFA est invalide ou expiré." });
  const factor = await db.query.agoojyeWorkosMfaFactors.findFirst({
    where: and(
      eq(agoojyeWorkosMfaFactors.tenantId, tenantId),
      eq(agoojyeWorkosMfaFactors.userId, Number(challenge.userId)),
    ),
  });
  const user = await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, Number(challenge.userId)) });
  const candidateHash = hashRecoveryCode(parsed.data.recoveryCode);
  const hashes = Array.isArray(factor?.recoveryCodeHashes) ? factor.recoveryCodeHashes : [];
  if (!factor || !user || !hashes.includes(candidateHash)) {
    await recordSecurityEvent(req, {
      tenantId,
      eventType: "mfa_recovery",
      subjectUserId: Number(challenge.userId),
      result: "denied",
      reason: "invalid_recovery_code",
    });
    return res.status(401).json({ message: "Code de récupération incorrect." });
  }
  const challengeClaimed = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(agoojyeWorkosMfaChallenges)
      .set({ usedAt: new Date() })
      .where(and(eq(agoojyeWorkosMfaChallenges.id, challenge.id), isNull(agoojyeWorkosMfaChallenges.usedAt)))
      .returning({ id: agoojyeWorkosMfaChallenges.id });
    if (!claimed.length) return false;
    await tx
      .update(agoojyeWorkosMfaFactors)
      .set({ recoveryCodeHashes: hashes.filter((hash) => hash !== candidateHash), lastUsedAt: new Date(), updatedAt: new Date() })
      .where(eq(agoojyeWorkosMfaFactors.id, factor.id));
    return true;
  });
  if (!challengeClaimed) {
    return res.status(409).json({ message: "Ce défi MFA a déjà été utilisé.", code: "MFA_CHALLENGE_USED" });
  }
  const roles = await tenantRoles(tenantId, Number(user.id));
  const member = await db.query.agoojyeProjectUsers.findFirst({
    where: and(eq(agoojyeProjectUsers.tenantId, tenantId), eq(agoojyeProjectUsers.authUserId, Number(user.id))),
  });
  const session = await createWorkosSession(req, tenantId, user, true);
  await recordSecurityEvent(req, {
    tenantId,
    eventType: "mfa_recovery",
    subjectUserId: Number(user.id),
  });
  return res.json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    user: sessionUser(user, roles, member),
    redirect: isAgoojiyeSuperAdmin(user, roles) ? "/admin/command-center" : "/workspace",
  });
});

type WorkerImportRow = {
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: string;
  role: string;
  managerEmail: string;
  employmentType: string;
  permissions: string[];
  provisionMailbox: boolean;
  errors: string[];
  duplicate: boolean;
};

const IMPORT_FIELD_ALIASES: Record<string, string[]> = {
  firstName: ["prenom", "prénom", "firstname", "first_name"],
  lastName: ["nom", "lastname", "last_name"],
  email: ["email", "e-mail", "courriel", "adresse email"],
  phone: ["telephone", "téléphone", "phone", "mobile"],
  department: ["departement", "département", "department", "equipe", "équipe", "team"],
  role: ["role", "rôle", "fonction", "poste", "title"],
  managerEmail: ["manager", "manager email", "responsable", "superviseur"],
  employmentType: ["type contrat", "employment type", "contrat", "statut emploi"],
  permissions: ["permissions", "acces", "accès"],
  provisionMailbox: ["creer boite mail", "créer boîte mail", "mailbox", "provision mailbox"],
};

function normalizedHeader(value: unknown) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function inferImportMapping(headers: string[]) {
  const mapping: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(IMPORT_FIELD_ALIASES)) {
    const normalizedAliases = aliases.map(normalizedHeader);
    const header = headers.find((candidate) => normalizedAliases.includes(normalizedHeader(candidate)));
    if (header) mapping[field] = header;
  }
  return mapping;
}

function parseBoolean(value: unknown) {
  return ["1", "true", "oui", "yes", "x"].includes(clean(value).toLowerCase());
}

function normalizeWorkerRows(
  rawRows: Array<Record<string, unknown>>,
  mapping: Record<string, string>,
  existingEmails: Set<string>,
) {
  const seen = new Set<string>();
  return rawRows.slice(0, 1000).map<WorkerImportRow>((raw, index) => {
    const value = (field: string) => clean(raw[mapping[field]]);
    const email = normalizeEmail(value("email"));
    const errors: string[] = [];
    if (!value("firstName")) errors.push("Prénom requis");
    if (!value("lastName")) errors.push("Nom requis");
    if (!z.string().email().safeParse(email).success) errors.push("Adresse email invalide");
    if (!email.endsWith("@agoojiye.com")) errors.push("Une adresse @agoojiye.com est requise");
    if (!value("department")) errors.push("Département requis");
    if (!value("role")) errors.push("Rôle requis");
    const duplicate = Boolean(email && (existingEmails.has(email) || seen.has(email)));
    if (duplicate) errors.push("Doublon détecté");
    if (email) seen.add(email);
    return {
      rowNumber: index + 2,
      firstName: value("firstName"),
      lastName: value("lastName"),
      email,
      phone: value("phone"),
      department: value("department"),
      role: value("role"),
      managerEmail: normalizeEmail(value("managerEmail")),
      employmentType: value("employmentType") || "employee",
      permissions: value("permissions").split(/[,;|]/).map(clean).filter(Boolean),
      provisionMailbox: parseBoolean(value("provisionMailbox")),
      errors,
      duplicate,
    };
  });
}

function slugify(value: unknown) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function requireWorkosMember(req: any, res: any, next: any) {
  const tenantId = requireAgoojiyeTenant(req, res);
  if (!tenantId) return;
  const user = req.tenantUser;
  const roles = await tenantRoles(tenantId, Number(user.id));
  if (!roles.length) return res.status(403).json({ message: "Accès AGOOJIYE refusé." });
  const member = await db.query.agoojyeProjectUsers.findFirst({
    where: and(eq(agoojyeProjectUsers.tenantId, tenantId), eq(agoojyeProjectUsers.authUserId, Number(user.id))),
  });
  if (!member || ["suspended", "archived", "inactive", "ancien membre"].includes(clean(member.status).toLowerCase())) {
    return res.status(403).json({ message: "Le profil AGOOJIYE n'est pas actif." });
  }
  const privileged = hasPrivilegedWorkosRole(user, roles);
  if (privileged) {
    const session = await db.query.agoojyeWorkosSessions.findFirst({
      where: and(
        eq(agoojyeWorkosSessions.tenantId, tenantId),
        eq(agoojyeWorkosSessions.userId, Number(user.id)),
        eq(agoojyeWorkosSessions.tokenHash, hashWorkosToken(getBearerToken(req))),
        isNull(agoojyeWorkosSessions.revokedAt),
        gt(agoojyeWorkosSessions.expiresAt, new Date()),
      ),
    });
    if (!session?.mfaVerifiedAt) return res.status(401).json({ message: "Une authentification MFA AGOOJIYE est requise.", code: "MFA_REQUIRED" });
    req.workosSession = session;
  }
  req.workosTenantId = tenantId;
  req.workosUser = user;
  req.workosMember = member;
  req.workosTenantRoles = roles;
  next();
}

export function requireWorkosAdmin(req: any, res: any, next: any) {
  const roles = Array.isArray(req.workosTenantRoles) ? req.workosTenantRoles : [];
  if (!hasPrivilegedWorkosRole(req.workosUser, roles) || Number(req.workosMember?.accessLevel || 0) < 5) {
    return res.status(403).json({ message: "Accès administrateur AGOOJIYE requis." });
  }
  next();
}

export function requireAgoojiyeSuperAdmin(req: any, res: any, next: any) {
  if (!isAgoojiyeSuperAdmin(req.workosUser, req.workosTenantRoles)) {
    return res.status(403).json({ message: "Cette action est réservée au super-administrateur AGOOJIYE." });
  }
  next();
}

memberApi.use(ensureTenantUser);
memberApi.use(requireWorkosMember);

memberApi.get("/security", async (req: any, res) => {
  const factor = await db.query.agoojyeWorkosMfaFactors.findFirst({
    where: and(
      eq(agoojyeWorkosMfaFactors.tenantId, Number(req.workosTenantId)),
      eq(agoojyeWorkosMfaFactors.userId, Number(req.workosUser.id)),
    ),
  });
  const sessions = await db.query.agoojyeWorkosSessions.findMany({
    where: and(
      eq(agoojyeWorkosSessions.tenantId, Number(req.workosTenantId)),
      eq(agoojyeWorkosSessions.userId, Number(req.workosUser.id)),
      isNull(agoojyeWorkosSessions.revokedAt),
      gt(agoojyeWorkosSessions.expiresAt, new Date()),
    ),
    orderBy: [desc(agoojyeWorkosSessions.createdAt)],
  });
  return res.json({
    ok: true,
    mfa: {
      required: hasPrivilegedWorkosRole(req.workosUser, req.workosTenantRoles),
      enabled: Boolean(factor?.enabled),
      verifiedAt: factor?.verifiedAt,
      recoveryCodesRemaining: Array.isArray(factor?.recoveryCodeHashes) ? factor.recoveryCodeHashes.length : 0,
    },
    sessions: sessions.map((session) => ({
      id: session.id,
      current: session.tokenHash === hashWorkosToken(getBearerToken(req)),
      mfaVerifiedAt: session.mfaVerifiedAt,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    })),
  });
});

memberApi.post("/sessions/:id/revoke", async (req: any, res) => {
  const session = await db.query.agoojyeWorkosSessions.findFirst({
    where: and(
      eq(agoojyeWorkosSessions.id, clean(req.params.id)),
      eq(agoojyeWorkosSessions.tenantId, Number(req.workosTenantId)),
      eq(agoojyeWorkosSessions.userId, Number(req.workosUser.id)),
    ),
  });
  if (!session) return res.status(404).json({ message: "Session introuvable." });
  await db.transaction(async (tx) => {
    await tx.update(agoojyeWorkosSessions).set({ revokedAt: new Date() }).where(eq(agoojyeWorkosSessions.id, session.id));
    if (session.eceSessionId) await tx.delete(eceSessions).where(eq(eceSessions.id, Number(session.eceSessionId)));
  });
  await recordSecurityEvent(req, {
    tenantId: Number(req.workosTenantId),
    eventType: "session_revoked",
    actorUserId: Number(req.workosUser.id),
    subjectUserId: Number(req.workosUser.id),
    metadata: { sessionId: session.id },
  });
  return res.json({ ok: true });
});

memberApi.post("/sessions/revoke-others", async (req: any, res) => {
  const currentHash = hashWorkosToken(getBearerToken(req));
  const sessions = await db.query.agoojyeWorkosSessions.findMany({
    where: and(
      eq(agoojyeWorkosSessions.tenantId, Number(req.workosTenantId)),
      eq(agoojyeWorkosSessions.userId, Number(req.workosUser.id)),
      isNull(agoojyeWorkosSessions.revokedAt),
    ),
  });
  const revoked = sessions.filter((session) => session.tokenHash !== currentHash);
  if (revoked.length) {
    await db.transaction(async (tx) => {
      await tx
        .update(agoojyeWorkosSessions)
        .set({ revokedAt: new Date() })
        .where(inArray(agoojyeWorkosSessions.id, revoked.map((session) => session.id)));
      const ids = revoked.map((session) => Number(session.eceSessionId || 0)).filter(Boolean);
      if (ids.length) await tx.delete(eceSessions).where(inArray(eceSessions.id, ids));
    });
  }
  await recordSecurityEvent(req, {
    tenantId: Number(req.workosTenantId),
    eventType: "other_sessions_revoked",
    actorUserId: Number(req.workosUser.id),
    subjectUserId: Number(req.workosUser.id),
    metadata: { count: revoked.length },
  });
  return res.json({ ok: true, revoked: revoked.length });
});

adminApi.use(ensureTenantUser);
adminApi.use(requireWorkosMember);
adminApi.use(requireWorkosAdmin);

adminApi.get("/security/events", async (req: any, res) => {
  const items = await db.query.agoojyeWorkosSecurityEvents.findMany({
    where: eq(agoojyeWorkosSecurityEvents.tenantId, Number(req.workosTenantId)),
    orderBy: [desc(agoojyeWorkosSecurityEvents.createdAt)],
    limit: 200,
  });
  return res.json({ ok: true, items });
});

adminApi.get("/overview", async (req: any, res) => {
  const tenantId = Number(req.workosTenantId);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [people, teams, tasks, projects, vacancies, agents, securityEvents] = await Promise.all([
    db.query.agoojyeProjectUsers.findMany({
      where: eq(agoojyeProjectUsers.tenantId, tenantId),
      orderBy: [asc(agoojyeProjectUsers.displayName)],
    }),
    db.query.agoojyeTeams.findMany({
      where: eq(agoojyeTeams.tenantId, tenantId),
      orderBy: [asc(agoojyeTeams.name)],
    }),
    db.query.agoojyeTasks.findMany({
      where: eq(agoojyeTasks.tenantId, tenantId),
      orderBy: [desc(agoojyeTasks.updatedAt)],
      limit: 200,
    }),
    db.query.agoojyeOsProjects.findMany({
      where: eq(agoojyeOsProjects.tenantId, tenantId),
      orderBy: [desc(agoojyeOsProjects.updatedAt)],
      limit: 100,
    }),
    db.query.agoojyeWorkosVacancies.findMany({
      where: eq(agoojyeWorkosVacancies.tenantId, tenantId),
      orderBy: [desc(agoojyeWorkosVacancies.updatedAt)],
    }),
    db.query.agoojyeWorkosAgents.findMany({
      where: eq(agoojyeWorkosAgents.tenantId, tenantId),
      orderBy: [asc(agoojyeWorkosAgents.name)],
    }),
    db.query.agoojyeWorkosSecurityEvents.findMany({
      where: and(
        eq(agoojyeWorkosSecurityEvents.tenantId, tenantId),
        gt(agoojyeWorkosSecurityEvents.createdAt, weekAgo),
      ),
      orderBy: [desc(agoojyeWorkosSecurityEvents.createdAt)],
      limit: 20,
    }),
  ]);
  const activePeople = people.filter((person) => clean(person.status).toLowerCase() === "active");
  const openTasks = tasks.filter((task) => !["done", "cancelled"].includes(clean(task.status).toLowerCase()));
  const blocked = openTasks.filter((task) => clean(task.status).toLowerCase() === "blocked" || Boolean(task.blocker));
  const overdue = openTasks.filter((task) => task.dueDate && new Date(task.dueDate) < now);
  return res.json({
    ok: true,
    currentUser: {
      id: req.workosUser.id,
      email: req.workosUser.email,
      displayName: req.workosUser.displayName,
      superAdmin: isAgoojiyeSuperAdmin(req.workosUser, req.workosTenantRoles),
    },
    metrics: {
      activePeople: activePeople.length,
      departments: teams.filter((team) => team.status === "active").length,
      activeProjects: projects.filter((project) => project.status === "active").length,
      openTasks: openTasks.length,
      overdueTasks: overdue.length,
      blockers: blocked.length,
      vacancies: vacancies.filter((vacancy) => !["filled", "closed"].includes(vacancy.status)).length,
      securityEvents7d: securityEvents.length,
    },
    people: people.map((person) => ({
      id: person.id,
      displayName: person.displayName,
      email: person.email,
      role: person.role,
      teamId: person.teamId,
      status: person.status,
      accessLevel: person.accessLevel,
      onboardingProgress: person.onboardingProgress,
    })),
    teams,
    tasks: tasks.slice(0, 30),
    projects,
    vacancies,
    agents,
    securityEvents,
  });
});

adminApi.get("/people", async (req: any, res) => {
  const tenantId = Number(req.workosTenantId);
  const [people, teams, vacancies] = await Promise.all([
    db.query.agoojyeProjectUsers.findMany({
      where: eq(agoojyeProjectUsers.tenantId, tenantId),
      orderBy: [asc(agoojyeProjectUsers.displayName)],
    }),
    db.query.agoojyeTeams.findMany({
      where: eq(agoojyeTeams.tenantId, tenantId),
      orderBy: [asc(agoojyeTeams.name)],
    }),
    db.query.agoojyeWorkosVacancies.findMany({
      where: eq(agoojyeWorkosVacancies.tenantId, tenantId),
      orderBy: [desc(agoojyeWorkosVacancies.createdAt)],
    }),
  ]);
  return res.json({ ok: true, people, teams, vacancies });
});

adminApi.post("/people/import/preview", workerImportUpload.single("file"), async (req: any, res) => {
  const tenantId = Number(req.workosTenantId);
  const file = req.file as Express.Multer.File | undefined;
  if (!file?.buffer?.length) return res.status(400).json({ message: "Ajoutez un fichier CSV ou XLSX." });
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(file.buffer, { type: "buffer", cellDates: false, raw: false });
  } catch {
    return res.status(400).json({ message: "Le fichier ne peut pas être lu comme CSV ou XLSX." });
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return res.status(400).json({ message: "Le fichier ne contient aucune feuille." });
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" });
  if (!rawRows.length) return res.status(400).json({ message: "Le fichier ne contient aucune ligne de collaborateur." });
  const headers = Object.keys(rawRows[0] || {});
  let suppliedMapping: Record<string, string> = {};
  try {
    suppliedMapping =
      typeof req.body?.mapping === "string"
        ? JSON.parse(req.body.mapping)
        : req.body?.mapping && typeof req.body.mapping === "object"
          ? req.body.mapping
          : {};
  } catch {
    return res.status(400).json({ message: "Le mapping de colonnes est invalide." });
  }
  const mapping = { ...inferImportMapping(headers), ...suppliedMapping };
  const existing = await db.query.agoojyeProjectUsers.findMany({
    where: eq(agoojyeProjectUsers.tenantId, tenantId),
    columns: { email: true },
  });
  const rows = normalizeWorkerRows(rawRows, mapping, new Set(existing.map((entry) => normalizeEmail(entry.email))));
  const valid = rows.filter((row) => row.errors.length === 0);
  const [importRow] = await db
    .insert(agoojyeWorkosWorkerImports)
    .values({
      tenantId,
      createdBy: Number(req.workosUser.id),
      sourceName: clean(file.originalname).slice(0, 255),
      sourceHash: createHash("sha256").update(file.buffer).digest("hex"),
      mapping,
      previewRows: rows as any,
      validation: {
        total: rows.length,
        valid: valid.length,
        invalid: rows.length - valid.length,
        duplicates: rows.filter((row) => row.duplicate).length,
        headers,
      },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    .returning();
  await recordSecurityEvent(req, {
    tenantId,
    eventType: "worker_import_previewed",
    actorUserId: Number(req.workosUser.id),
    metadata: { importId: importRow.id, total: rows.length, valid: valid.length },
  });
  return res.status(201).json({
    ok: true,
    importId: importRow.id,
    sourceName: importRow.sourceName,
    mapping,
    headers,
    rows,
    summary: importRow.validation,
    expiresAt: importRow.expiresAt,
    dryRun: true,
  });
});

adminApi.post("/people/import/:id/commit", async (req: any, res) => {
  const tenantId = Number(req.workosTenantId);
  const importRow = await db.query.agoojyeWorkosWorkerImports.findFirst({
    where: and(
      eq(agoojyeWorkosWorkerImports.id, clean(req.params.id)),
      eq(agoojyeWorkosWorkerImports.tenantId, tenantId),
      eq(agoojyeWorkosWorkerImports.status, "preview"),
      gt(agoojyeWorkosWorkerImports.expiresAt, new Date()),
    ),
  });
  if (!importRow) return res.status(404).json({ message: "Prévisualisation introuvable, expirée ou déjà confirmée." });
  const rows = (Array.isArray(importRow.previewRows) ? importRow.previewRows : []) as WorkerImportRow[];
  const eligible = rows.filter((row) => row.errors.length === 0 && !row.duplicate);
  const teamRows = await db.query.agoojyeTeams.findMany({ where: eq(agoojyeTeams.tenantId, tenantId) });
  const teamBySlug = new Map(teamRows.map((team) => [slugify(team.name), Number(team.id)]));
  const profilesByEmail = new Map<string, any>();
  const results: Array<Record<string, unknown>> = [];
  const setupBase = resolvePasswordSetupBaseUrl(process.env.AGOOJIYE_APP_URL || "https://agoojiye.com");

  for (const row of eligible) {
    if (/admin|super.?admin/i.test(row.role)) {
      results.push({ rowNumber: row.rowNumber, email: row.email, status: "rejected", reason: "Les administrateurs globaux ne peuvent être créés que manuellement par le super-administrateur." });
      continue;
    }
    let teamId = teamBySlug.get(slugify(row.department));
    if (!teamId) {
      const departmentSlug = slugify(row.department) || `departement-${randomBytes(3).toString("hex")}`;
      const [createdTeam] = await db
        .insert(agoojyeTeams)
        .values({
          tenantId,
          slug: departmentSlug,
          name: row.department,
          mission: `Mission du département ${row.department} à définir.`,
          description: `Département créé depuis l'import de collaborateurs.`,
          status: "active",
          visibility: "private",
        })
        .onConflictDoUpdate({
          target: [agoojyeTeams.tenantId, agoojyeTeams.slug],
          set: { name: row.department, updatedAt: new Date() },
        })
        .returning();
      teamId = Number(createdTeam.id);
      teamBySlug.set(departmentSlug, teamId);
    }
    let user = await db.query.eceUsers.findFirst({ where: eq(eceUsers.email, row.email) });
    if (!user) {
      [user] = await db
        .insert(eceUsers)
        .values({
          email: row.email,
          passwordHash: null,
          displayName: `${row.firstName} ${row.lastName}`.trim(),
          role: "buyer",
          roles: ["staff"] as any,
          permissions: [] as any,
          currentMode: "buyer",
          isActive: true,
          emailVerified: true,
          phone: row.phone || null,
          timezone: "Africa/Porto-Novo",
          metadata: { mustChangePassword: true, source: "agoojye_worker_import" } as any,
        })
        .returning();
    }
    await db
      .insert(userTenantRoles)
      .values({ tenantId, userId: Number(user.id), role: "USER" })
      .onConflictDoNothing();
    const [profile] = await db
      .insert(agoojyeProjectUsers)
      .values({
        tenantId,
        firstName: row.firstName,
        lastName: row.lastName,
        displayName: `${row.firstName} ${row.lastName}`.trim(),
        email: row.email,
        phone: row.phone || null,
        role: row.role,
        teamId,
        status: "Invited",
        authUserId: Number(user.id),
        employmentType: row.employmentType,
        responsibilities: [],
        onboardingProgress: 10,
        accessLevel: 2,
        permissions: row.permissions,
        emailAccountCreated: false,
      })
      .onConflictDoUpdate({
        target: [agoojyeProjectUsers.tenantId, agoojyeProjectUsers.email],
        set: {
          firstName: row.firstName,
          lastName: row.lastName,
          displayName: `${row.firstName} ${row.lastName}`.trim(),
          phone: row.phone || null,
          role: row.role,
          teamId,
          authUserId: Number(user.id),
          employmentType: row.employmentType,
          permissions: row.permissions,
          updatedAt: new Date(),
        },
      })
      .returning();
    profilesByEmail.set(row.email, profile);

    const setup = await createPasswordSetupToken({ userId: Number(user.id), ttlHours: 48, invalidateExisting: true });
    let mailboxStatus = "not_requested";
    if (row.provisionMailbox) {
      if (isMailserverSetupAvailable()) {
        const provisionalPassword = `${randomBytes(20).toString("base64url")}!Aa7`;
        const mailbox = await mailserverEmailAdd(row.email, provisionalPassword).catch(() => null);
        mailboxStatus = mailbox?.ok ? "provisioned_password_change_required" : "already_exists_or_failed";
        if (mailbox?.ok) {
          await db
            .update(agoojyeProjectUsers)
            .set({ emailAccountCreated: true, updatedAt: new Date() })
            .where(eq(agoojyeProjectUsers.id, Number(profile.id)));
        }
      } else {
        mailboxStatus = "provisioning_unavailable";
      }
    }
    results.push({
      rowNumber: row.rowNumber,
      email: row.email,
      status: "created",
      profileId: profile.id,
      setupLink: buildPasswordSetupLink(setupBase, setup.rawToken),
      setupExpiresAt: setup.expiresAt.toISOString(),
      mailboxStatus,
    });
  }

  for (const row of eligible) {
    if (!row.managerEmail) continue;
    const profile = profilesByEmail.get(row.email);
    const manager =
      profilesByEmail.get(row.managerEmail) ||
      (await db.query.agoojyeProjectUsers.findFirst({
        where: and(
          eq(agoojyeProjectUsers.tenantId, tenantId),
          eq(agoojyeProjectUsers.email, row.managerEmail),
        ),
      }));
    if (profile && manager) {
      await db
        .update(agoojyeProjectUsers)
        .set({ managerUserId: Number(manager.id), updatedAt: new Date() })
        .where(eq(agoojyeProjectUsers.id, Number(profile.id)));
    }
  }

  await db
    .update(agoojyeWorkosWorkerImports)
    .set({
      status: "committed",
      results: {
        total: rows.length,
        created: results.filter((item) => item.status === "created").length,
        rejected: results.filter((item) => item.status !== "created").length,
        skippedInvalid: rows.length - eligible.length,
        rows: results,
      },
      committedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agoojyeWorkosWorkerImports.id, importRow.id));
  await recordSecurityEvent(req, {
    tenantId,
    eventType: "worker_import_committed",
    actorUserId: Number(req.workosUser.id),
    metadata: { importId: importRow.id, created: results.filter((item) => item.status === "created").length },
  });
  return res.json({
    ok: true,
    importId: importRow.id,
    results,
    invalidRows: rows.filter((row) => row.errors.length > 0),
    resultsDownload: `/api/admin/agoojye/workos/people/import/${importRow.id}/results.csv`,
  });
});

adminApi.get("/people/import/:id/results.csv", async (req: any, res) => {
  const importRow = await db.query.agoojyeWorkosWorkerImports.findFirst({
    where: and(
      eq(agoojyeWorkosWorkerImports.id, clean(req.params.id)),
      eq(agoojyeWorkosWorkerImports.tenantId, Number(req.workosTenantId)),
    ),
  });
  if (!importRow) return res.status(404).json({ message: "Import introuvable." });
  const rows = Array.isArray((importRow.results as any)?.rows) ? (importRow.results as any).rows : [];
  const csv = [
    ["Ligne", "Email", "Statut", "Motif", "Boîte mail", "Lien d'activation", "Expiration"].map(csvCell).join(","),
    ...rows.map((row: any) =>
      [
        row.rowNumber,
        row.email,
        row.status,
        row.reason,
        row.mailboxStatus,
        row.setupLink,
        row.setupExpiresAt,
      ].map(csvCell).join(","),
    ),
  ].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="agoojiye-import-${importRow.id}.csv"`);
  return res.send(`\uFEFF${csv}`);
});

const olivierSchema = z.object({
  email: z.string().email().max(320).refine((email) => email.toLowerCase().endsWith("@agoojiye.com"), "Adresse @agoojiye.com requise"),
  phone: z.string().max(40).optional(),
});

adminApi.post("/people/olivier/invite", requireAgoojiyeSuperAdmin, async (req: any, res) => {
  const parsed = olivierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Adresse invalide." });
  const tenantId = Number(req.workosTenantId);
  const email = normalizeEmail(parsed.data.email);
  const vacancy = await db.query.agoojyeWorkosVacancies.findFirst({
    where: and(
      eq(agoojyeWorkosVacancies.tenantId, tenantId),
      eq(agoojyeWorkosVacancies.candidateName, "Olivier"),
    ),
  });
  const gestion = await db.query.agoojyeTeams.findFirst({
    where: and(eq(agoojyeTeams.tenantId, tenantId), eq(agoojyeTeams.slug, "direction-coordination")),
  });
  let user = await db.query.eceUsers.findFirst({ where: eq(eceUsers.email, email) });
  if (!user) {
    [user] = await db
      .insert(eceUsers)
      .values({
        email,
        passwordHash: null,
        displayName: "Olivier",
        role: "buyer",
        roles: ["staff"] as any,
        permissions: [] as any,
        currentMode: "buyer",
        isActive: true,
        emailVerified: true,
        phone: parsed.data.phone,
        timezone: "Africa/Porto-Novo",
        metadata: {
          mustChangePassword: true,
          accessRestrictions: ["legal", "financial", "technical", "management_confidential"],
        } as any,
      })
      .returning();
  }
  await db.insert(userTenantRoles).values({ tenantId, userId: Number(user.id), role: "USER" }).onConflictDoNothing();
  const [profile] = await db
    .insert(agoojyeProjectUsers)
    .values({
      tenantId,
      firstName: "Olivier",
      lastName: "",
      displayName: "Olivier",
      email,
      phone: parsed.data.phone,
      role: "Responsable / Coordinateur de gestion",
      teamId: gestion?.id || null,
      status: "Invited",
      authUserId: Number(user.id),
      employmentType: "employee",
      responsibilities: ["Coordination de gestion"],
      onboardingProgress: 10,
      accessLevel: 2,
      permissions: ["messages", "tasks", "projects"],
    })
    .onConflictDoUpdate({
      target: [agoojyeProjectUsers.tenantId, agoojyeProjectUsers.email],
      set: {
        role: "Responsable / Coordinateur de gestion",
        teamId: gestion?.id || null,
        authUserId: Number(user.id),
        accessLevel: 2,
        permissions: ["messages", "tasks", "projects"],
        updatedAt: new Date(),
      },
    })
    .returning();
  if (vacancy) {
    await db
      .update(agoojyeWorkosVacancies)
      .set({ candidateEmail: email, status: "invited", updatedAt: new Date() })
      .where(eq(agoojyeWorkosVacancies.id, vacancy.id));
  }
  const setup = await createPasswordSetupToken({ userId: Number(user.id), ttlHours: 48, invalidateExisting: true });
  const setupLink = buildPasswordSetupLink(
    resolvePasswordSetupBaseUrl(process.env.AGOOJIYE_APP_URL || "https://agoojiye.com"),
    setup.rawToken,
  );
  await recordSecurityEvent(req, {
    tenantId,
    eventType: "olivier_invited",
    actorUserId: Number(req.workosUser.id),
    subjectUserId: Number(user.id),
    metadata: { profileId: profile.id, restrictionsApplied: true },
  });
  return res.status(201).json({ ok: true, profile, setupLink, expiresAt: setup.expiresAt });
});

const adminCreateSchema = z.object({
  email: z.string().email().max(320),
  displayName: z.string().min(2).max(160),
  role: z.enum(["TENANT_ADMIN", "SUPER_ADMIN"]).default("TENANT_ADMIN"),
});

adminApi.post("/global-admins", requireAgoojiyeSuperAdmin, async (req: any, res) => {
  const parsed = adminCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Données administrateur invalides." });
  const tenantId = Number(req.workosTenantId);
  const email = normalizeEmail(parsed.data.email);
  if (!email.endsWith("@agoojiye.com")) return res.status(400).json({ message: "Une adresse @agoojiye.com est requise." });
  let user = await db.query.eceUsers.findFirst({ where: eq(eceUsers.email, email) });
  if (!user) {
    [user] = await db
      .insert(eceUsers)
      .values({
        email,
        passwordHash: null,
        displayName: parsed.data.displayName,
        role: "admin",
        roles: ["admin", parsed.data.role === "SUPER_ADMIN" ? "AGOOJIYE_SUPER_ADMIN" : "AGOOJIYE_ADMIN"] as any,
        permissions: ["admin:*"] as any,
        currentMode: "admin",
        isActive: true,
        emailVerified: true,
        timezone: "Africa/Porto-Novo",
        metadata: { mustChangePassword: true, requireMfa: true } as any,
      })
      .returning();
  }
  await db
    .insert(userTenantRoles)
    .values({ tenantId, userId: Number(user.id), role: parsed.data.role })
    .onConflictDoNothing();
  const direction = await db.query.agoojyeTeams.findFirst({
    where: and(eq(agoojyeTeams.tenantId, tenantId), eq(agoojyeTeams.slug, "direction-coordination")),
  });
  await db
    .insert(agoojyeProjectUsers)
    .values({
      tenantId,
      firstName: parsed.data.displayName.split(" ")[0],
      lastName: parsed.data.displayName.split(" ").slice(1).join(" ") || "AGOOJIYE",
      displayName: parsed.data.displayName,
      email,
      role: parsed.data.role === "SUPER_ADMIN" ? "Super-administrateur AGOOJIYE" : "Administrateur AGOOJIYE",
      teamId: direction?.id || null,
      status: "Invited",
      authUserId: Number(user.id),
      accessLevel: parsed.data.role === "SUPER_ADMIN" ? 7 : 6,
      permissions: ["*"],
      onboardingProgress: 10,
      confirmedRole: true,
    })
    .onConflictDoUpdate({
      target: [agoojyeProjectUsers.tenantId, agoojyeProjectUsers.email],
      set: {
        displayName: parsed.data.displayName,
        role: parsed.data.role === "SUPER_ADMIN" ? "Super-administrateur AGOOJIYE" : "Administrateur AGOOJIYE",
        accessLevel: parsed.data.role === "SUPER_ADMIN" ? 7 : 6,
        permissions: ["*"],
        authUserId: Number(user.id),
        updatedAt: new Date(),
      },
    });
  const setup = await createPasswordSetupToken({ userId: Number(user.id), ttlHours: 24, invalidateExisting: true });
  await recordSecurityEvent(req, {
    tenantId,
    eventType: "global_admin_created",
    actorUserId: Number(req.workosUser.id),
    subjectUserId: Number(user.id),
    metadata: { role: parsed.data.role },
  });
  return res.status(201).json({
    ok: true,
    userId: user.id,
    setupLink: buildPasswordSetupLink(
      resolvePasswordSetupBaseUrl(process.env.AGOOJIYE_APP_URL || "https://agoojiye.com"),
      setup.rawToken,
    ),
    expiresAt: setup.expiresAt,
  });
});

adminApi.post("/people/:id/offboard", requireAgoojiyeSuperAdmin, async (req: any, res) => {
  const tenantId = Number(req.workosTenantId);
  const profileId = Number(req.params.id);
  const reason = clean(req.body?.reason);
  if (!Number.isFinite(profileId) || reason.length < 10) {
    return res.status(400).json({ message: "Profil et motif détaillé requis." });
  }
  const profile = await db.query.agoojyeProjectUsers.findFirst({
    where: and(eq(agoojyeProjectUsers.tenantId, tenantId), eq(agoojyeProjectUsers.id, profileId)),
  });
  if (!profile) return res.status(404).json({ message: "Collaborateur introuvable." });
  if (isAgoojiyeSuperAdmin({ email: profile.email, roles: ["AGOOJIYE_SUPER_ADMIN"] }, ["SUPER_ADMIN"])) {
    return res.status(400).json({ message: "Le super-administrateur principal ne peut pas être retiré depuis ce parcours." });
  }
  const activeTasks = await db.query.agoojyeTasks.findMany({
    where: and(
      eq(agoojyeTasks.tenantId, tenantId),
      eq(agoojyeTasks.assignedTo, profileId),
      inArray(agoojyeTasks.status, ["todo", "in_progress", "blocked", "review"]),
    ),
  });
  await db.transaction(async (tx) => {
    if (activeTasks.length) {
      await tx
        .update(agoojyeTasks)
        .set({
          assignedTo: null,
          status: "todo",
          blocker: "À réattribuer après le départ du collaborateur.",
          metadata: sql`coalesce(${agoojyeTasks.metadata}, '{}'::jsonb) || '{"assignmentState":"A_REATTRIBUER"}'::jsonb`,
          updatedAt: new Date(),
        })
        .where(inArray(agoojyeTasks.id, activeTasks.map((task) => Number(task.id))));
    }
    await tx.delete(agoojyeOsChannelMembers).where(eq(agoojyeOsChannelMembers.userId, profileId));
    await tx.delete(agoojyeOsProjectMembers).where(eq(agoojyeOsProjectMembers.userId, profileId));
    await tx
      .update(agoojyeProjectUsers)
      .set({ status: "Ancien membre", accessLevel: 0, permissions: [], availability: "offboarded", updatedAt: new Date() })
      .where(eq(agoojyeProjectUsers.id, profileId));
    if (profile.authUserId) {
      const authUserId = Number(profile.authUserId);
      await tx.delete(agoojyeOsPushSubscriptions).where(eq(agoojyeOsPushSubscriptions.authUserId, authUserId));
      await tx.delete(eceSessions).where(eq(eceSessions.userId, authUserId));
      await tx.delete(userTenantRoles).where(
        and(eq(userTenantRoles.tenantId, tenantId), eq(userTenantRoles.userId, authUserId)),
      );
      await tx
        .update(eceUsers)
        .set({ isActive: false, roles: [] as any, permissions: [] as any, updatedAt: new Date() })
        .where(eq(eceUsers.id, authUserId));
    }
    await tx.insert(agoojyeWorkosOffboardingEvents).values({
      tenantId,
      projectUserId: profileId,
      authUserId: profile.authUserId || null,
      performedBy: Number(req.workosUser.id),
      reason,
      transferredTaskCount: activeTasks.length,
      mailboxStatus: "retained_archived",
      snapshot: { displayName: profile.displayName, email: profile.email, role: profile.role, teamId: profile.teamId },
    });
    await tx.insert(agoojyeWorkosVacancies).values({
      tenantId,
      teamId: profile.teamId,
      title: profile.role,
      previousHolderUserId: profileId,
      status: "open",
      metadata: { source: "offboarding" },
    });
  });
  await recordSecurityEvent(req, {
    tenantId,
    eventType: "member_offboarded",
    actorUserId: Number(req.workosUser.id),
    subjectUserId: profile.authUserId,
    metadata: { profileId, tasksReassigned: activeTasks.length },
  });
  return res.json({ ok: true, status: "Ancien membre", tasksReassigned: activeTasks.length, mailboxStatus: "retained_archived" });
});

adminApi.get("/howji", async (req: any, res) => {
  const tenantId = Number(req.workosTenantId);
  const agent = await db.query.agoojyeWorkosAgents.findFirst({
    where: and(eq(agoojyeWorkosAgents.tenantId, tenantId), eq(agoojyeWorkosAgents.key, "howji")),
  });
  if (!agent) return res.status(404).json({ message: "HOWJI n'est pas encore configuré." });
  const actions = await db.query.agoojyeWorkosAgentActions.findMany({
    where: and(eq(agoojyeWorkosAgentActions.tenantId, tenantId), eq(agoojyeWorkosAgentActions.agentId, agent.id)),
    orderBy: [desc(agoojyeWorkosAgentActions.createdAt)],
    limit: 50,
  });
  return res.json({ ok: true, agent, actions });
});

adminApi.post("/howji/run", async (req: any, res) => {
  const tenantId = Number(req.workosTenantId);
  const agent = await db.query.agoojyeWorkosAgents.findFirst({
    where: and(eq(agoojyeWorkosAgents.tenantId, tenantId), eq(agoojyeWorkosAgents.key, "howji")),
  });
  if (!agent || agent.status !== "active") return res.status(409).json({ message: "HOWJI n'est pas actif." });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const existing = await db.query.agoojyeWorkosAgentActions.findFirst({
    where: and(
      eq(agoojyeWorkosAgentActions.tenantId, tenantId),
      eq(agoojyeWorkosAgentActions.agentId, agent.id),
      eq(agoojyeWorkosAgentActions.actionType, "daily_coordination_report"),
      gt(agoojyeWorkosAgentActions.createdAt, today),
    ),
  });
  if (existing && !req.body?.force) return res.json({ ok: true, action: existing, idempotent: true });
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const tasks = await db.query.agoojyeTasks.findMany({
    where: and(
      eq(agoojyeTasks.tenantId, tenantId),
      inArray(agoojyeTasks.status, ["todo", "in_progress", "blocked", "review"]),
    ),
    orderBy: [asc(agoojyeTasks.dueDate)],
  });
  const overdue = tasks.filter((task) => task.dueDate && new Date(task.dueDate) < now);
  const blocked = tasks.filter((task) => task.status === "blocked" || Boolean(task.blocker));
  const stale = tasks.filter((task) => task.updatedAt && new Date(task.updatedAt) < staleBefore);
  const output = {
    generatedAt: now.toISOString(),
    timezone: agent.timezone,
    summary: `${overdue.length} tâche(s) en retard, ${blocked.length} blocage(s), ${stale.length} tâche(s) sans activité récente.`,
    overdue: overdue.slice(0, 20).map((task) => ({ id: task.id, title: task.title, dueDate: task.dueDate, assignedTo: task.assignedTo })),
    blocked: blocked.slice(0, 20).map((task) => ({ id: task.id, title: task.title, blocker: task.blocker })),
    stale: stale.slice(0, 20).map((task) => ({ id: task.id, title: task.title, updatedAt: task.updatedAt })),
    nextActions: [
      overdue.length ? "Relancer les responsables des tâches en retard." : "Aucune relance de retard requise.",
      blocked.length ? "Arbitrer les blocages ouverts." : "Aucun blocage déclaré.",
      stale.length ? "Demander une mise à jour des tâches sans activité." : "Les tâches actives sont à jour.",
    ],
  };
  const [action] = await db
    .insert(agoojyeWorkosAgentActions)
    .values({
      tenantId,
      agentId: agent.id,
      requestedBy: Number(req.workosUser.id),
      actionType: "daily_coordination_report",
      riskLevel: "low",
      status: "completed",
      requiresApproval: false,
      input: { source: "manual_admin_run" },
      output,
      executedAt: now,
    })
    .returning();
  const management = await db.query.agoojyeProjectUsers.findMany({
    where: and(eq(agoojyeProjectUsers.tenantId, tenantId), gt(agoojyeProjectUsers.accessLevel, 5)),
  });
  if (management.length) {
    await db.insert(agoojyeOsNotifications).values(
      management.map((member) => ({
        tenantId,
        userId: member.id,
        type: "howji",
        title: "Synthèse quotidienne HOWJI",
        body: output.summary,
        link: "/admin/howji",
      })),
    );
  }
  await recordSecurityEvent(req, {
    tenantId,
    eventType: "howji_internal_report_generated",
    actorUserId: Number(req.workosUser.id),
    metadata: { actionId: action.id, overdue: overdue.length, blocked: blocked.length, stale: stale.length },
  });
  return res.status(201).json({ ok: true, action });
});

const howjiActionSchema = z.object({
  actionType: z.string().min(2).max(120),
  riskLevel: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  target: z.enum(["internal", "external", "financial", "legal", "permissions", "delete", "public"]).default("internal"),
  input: z.record(z.unknown()).default({}),
});

adminApi.post("/howji/actions", async (req: any, res) => {
  const parsed = howjiActionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Action HOWJI invalide." });
  const tenantId = Number(req.workosTenantId);
  const agent = await db.query.agoojyeWorkosAgents.findFirst({
    where: and(eq(agoojyeWorkosAgents.tenantId, tenantId), eq(agoojyeWorkosAgents.key, "howji")),
  });
  if (!agent) return res.status(404).json({ message: "HOWJI n'est pas configuré." });
  const requiresApproval =
    parsed.data.target !== "internal" ||
    ["high", "critical"].includes(parsed.data.riskLevel);
  const [action] = await db
    .insert(agoojyeWorkosAgentActions)
    .values({
      tenantId,
      agentId: agent.id,
      requestedBy: Number(req.workosUser.id),
      actionType: parsed.data.actionType,
      riskLevel: parsed.data.riskLevel,
      status: requiresApproval ? "awaiting_approval" : "approved",
      requiresApproval,
      input: { ...parsed.data.input, target: parsed.data.target },
    })
    .returning();
  await recordSecurityEvent(req, {
    tenantId,
    eventType: "howji_action_proposed",
    actorUserId: Number(req.workosUser.id),
    metadata: { actionId: action.id, target: parsed.data.target, requiresApproval },
  });
  return res.status(201).json({ ok: true, action, execution: requiresApproval ? "blocked_pending_approval" : "approved_internal_action" });
});

adminApi.post("/howji/actions/:id/approve", requireAgoojiyeSuperAdmin, async (req: any, res) => {
  const tenantId = Number(req.workosTenantId);
  const actionId = Number(req.params.id);
  const action = await db.query.agoojyeWorkosAgentActions.findFirst({
    where: and(
      eq(agoojyeWorkosAgentActions.tenantId, tenantId),
      eq(agoojyeWorkosAgentActions.id, actionId),
      eq(agoojyeWorkosAgentActions.status, "awaiting_approval"),
    ),
  });
  if (!action) return res.status(404).json({ message: "Action en attente introuvable." });
  const [updated] = await db
    .update(agoojyeWorkosAgentActions)
    .set({ status: "approved", approvedBy: Number(req.workosUser.id), approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(agoojyeWorkosAgentActions.id, actionId))
    .returning();
  await recordSecurityEvent(req, {
    tenantId,
    eventType: "howji_action_approved",
    actorUserId: Number(req.workosUser.id),
    metadata: { actionId },
  });
  return res.json({ ok: true, action: updated });
});

const complianceSchema = z.object({
  targetType: z.enum(["direct_message", "private_channel"]),
  targetId: z.string().min(1).max(120),
  reason: z.string().min(20).max(1000),
  durationMinutes: z.number().int().min(5).max(60).default(30),
});

adminApi.post("/compliance-access", requireAgoojiyeSuperAdmin, async (req: any, res) => {
  const parsed = complianceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Une justification détaillée et une durée limitée sont requises." });
  const [grant] = await db
    .insert(agoojyeWorkosComplianceAccess)
    .values({
      tenantId: Number(req.workosTenantId),
      requestedBy: Number(req.workosUser.id),
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      reason: parsed.data.reason,
      expiresAt: new Date(Date.now() + parsed.data.durationMinutes * 60_000),
    })
    .returning();
  await recordSecurityEvent(req, {
    tenantId: Number(req.workosTenantId),
    eventType: "emergency_private_access_granted",
    actorUserId: Number(req.workosUser.id),
    reason: parsed.data.reason,
    metadata: { grantId: grant.id, targetType: grant.targetType, targetId: grant.targetId, expiresAt: grant.expiresAt },
  });
  return res.status(201).json({ ok: true, grant });
});

router.use("/api/agoojye/workos/auth", authApi);
router.use("/api/agoojye/workos/member", memberApi);
router.use("/api/admin/agoojye/workos", adminApi);

export default router;
