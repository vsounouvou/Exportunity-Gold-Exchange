import nodemailer from "nodemailer";
import crypto from "crypto";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@db";
import {
  actionRequests,
  agentEmailIdentities,
  agentMailboxes,
  agents,
  emailMessages,
  emailSendLogs,
  emailThreads,
  emailUnsubscribes,
  emailWorkOrders,
  tenants,
} from "@db/schema";
import { normalizeAgentKey } from "./agentSlugs";
import { normalizeEmailSubject } from "./threading";
import { signPlatformHeaders } from "./signature";
import { resolveTenantMailDomain } from "./domainResolver";
import {
  ensureMailboxAddressDeliverable,
  isMailDbAuthoritativeProvisioning,
  provisionAgentMailbox,
  ensureAliasAddressDeliverable,
  type EnsureMailboxDeliverableResult,
} from "./provisioner";
import { resolveAgentProfessionalProfile } from "./identityProfile";
import {
  buildProfessionalEmailContent,
  describeDeliveryFailure,
  evaluateSmtpDelivery,
  normalizeAndValidateRecipients,
} from "./outboundPolicy";
import { assertOutboundDeliverabilityReady } from "./deliverabilityPreflight";
import {
  MAIL_DELIVERY_STATUSES,
  classifyMailDeliveryStatus,
  extractQueueIdFromSmtpResponse,
} from "./deliveryStatus";
import { createUnsubscribeToken } from "./unsubscribe";
import { assertProductionAgentKeyAllowed } from "../agents/productionAllowlist";

function truthyEnv(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

type SmtpTransportConfig = {
  host?: string | null;
  port?: number | null;
  secure?: boolean | null;
  username?: string | null;
  password?: string | null;
  sendmail?: boolean | null;
};

type ResolvedSmtpSettings = {
  transport: nodemailer.Transporter;
  smtpUserUsed: string | null;
};

function parseSmtpPort(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.trunc(value);
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

function parseOptionalBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return null;
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function parseProvisionState(value: unknown): EnsureMailboxDeliverableResult | null {
  const meta = parseObject(value);
  const providerRaw = String(meta.provider || "").trim();
  const provider =
    providerRaw === "maildb" || providerRaw === "docker-mailserver" || providerRaw === "none"
      ? providerRaw
      : null;
  if (!provider) return null;
  return {
    provider,
    available: Boolean(meta.available),
    exists: Boolean(meta.exists),
    createdOnProvider: Boolean(meta.createdOnProvider),
    warning: meta.warning == null ? null : String(meta.warning),
  };
}

function pickFallbackReplyAddress() {
  const candidates = [
    String(process.env.MAIL_REPLY_FALLBACK || "").trim().toLowerCase(),
    String(process.env.MAIL_FROM_DEFAULT || "").trim().toLowerCase(),
    String(process.env.MAIL_SMTP_USER || "").trim().toLowerCase(),
  ];
  for (const candidate of candidates) {
    if (candidate && candidate.includes("@")) return candidate;
  }
  return null;
}

function resolveSecretReference(reference: unknown) {
  const raw = String(reference || "").trim();
  if (!raw) return null;
  const envKey = raw.startsWith("env:") ? raw.slice(4) : raw;
  const secret = String(process.env[envKey] || "").trim();
  return secret || null;
}

function createSmtpTransport(config?: SmtpTransportConfig): ResolvedSmtpSettings {
  const explicitSendmail = parseOptionalBool(config?.sendmail);
  const useSendmail = explicitSendmail ?? truthyEnv(process.env.MAIL_SMTP_SENDMAIL);
  if (useSendmail) {
    const sendmailPath = String(process.env.MAIL_SMTP_SENDMAIL_PATH || "").trim() || undefined;
    return {
      transport: nodemailer.createTransport({
        sendmail: true,
        newline: "unix",
        path: sendmailPath,
      }),
      smtpUserUsed: "(sendmail)",
    };
  }

  const host =
    String(config?.host ?? "").trim() ||
    String(process.env.MAIL_SMTP_HOST || "mail.boursedelor.com").trim();
  const port = parseSmtpPort(config?.port) ?? Number(process.env.MAIL_SMTP_PORT || 587);
  const user = String(config?.username ?? "").trim() || String(process.env.MAIL_SMTP_USER || "").trim();
  const pass = String(config?.password ?? "").trim() || String(process.env.MAIL_SMTP_PASS || "").trim();
  const secure = parseOptionalBool(config?.secure) ?? String(process.env.MAIL_SMTP_SECURE || "").trim() === "true";
  const rejectUnauthorized = String(process.env.MAIL_SMTP_TLS_REJECT_UNAUTHORIZED || "").trim() !== "false";
  const heloName = String(process.env.MAIL_SMTP_HELO_NAME || process.env.MAIL_HELO_NAME || "").trim() || undefined;

  const allowNoAuth = truthyEnv(process.env.MAIL_SMTP_ALLOW_NO_AUTH);
  if (!allowNoAuth && !(user && pass)) {
    throw new Error("SMTP not configured (set MAIL_SMTP_USER/MAIL_SMTP_PASS or MAIL_SMTP_SENDMAIL=true)");
  }

  return {
    transport: nodemailer.createTransport({
      name: heloName,
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
      tls: { rejectUnauthorized },
    }),
    smtpUserUsed: user || null,
  };
}

async function getOrCreateThread(opts: {
  tenantId: number;
  agentKey: string;
  mailboxId: number;
  subject: string;
  subjectNorm: string;
  lastMessageAt: Date;
}) {
  const existing = await db.query.emailThreads.findFirst({
    where: and(eq(emailThreads.mailboxId, opts.mailboxId), eq(emailThreads.subjectNorm, opts.subjectNorm)),
  });
  if (existing) {
    await db.update(emailThreads).set({ lastMessageAt: opts.lastMessageAt }).where(eq(emailThreads.id, existing.id));
    return existing;
  }

  const [created] = await db
    .insert(emailThreads)
    .values({
      tenantId: opts.tenantId,
      agentKey: opts.agentKey,
      mailboxId: opts.mailboxId,
      subjectNorm: opts.subjectNorm,
      subject: opts.subject,
      lastMessageAt: opts.lastMessageAt,
      createdAt: opts.lastMessageAt,
    })
    .returning();
  return created;
}

export type SendEmailAsAgentInput = {
  tenantId: number;
  agentKey: string;
  actorType?: "agent" | "system" | "human";
  actorAgentId?: number | null;
  to: string[];
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  actionRequestId?: number | null;
  requestedByUserId?: number | null;
  correlationId?: string | null;
  bypassApproval?: boolean;
};

type ResolvedSenderIdentity = {
  identityId: number | null;
  tenantKey: string;
  fromEmail: string;
  replyToEmail: string;
  envelopeFromEmail: string;
  displayName: string | null;
  professionalRole: string;
  companyName: string;
  website: string;
  smtpConfig: SmtpTransportConfig | null;
};

function titleCaseFromKey(agentKey: string) {
  return agentKey
    .replace(/[_-]+/g, " ")
    .split(/\s+/g)
    .filter(Boolean)
    .map((segment) => segment.slice(0, 1).toUpperCase() + segment.slice(1))
    .join(" ");
}

function parseCsvEnv(value: unknown): string[] {
  return String(value || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function inferDepartmentLabel(input: { agentKey: string; role: string }) {
  const role = String(input.role || "").toLowerCase();
  const key = String(input.agentKey || "").toLowerCase();
  if (/(treasury|payment|wallet|finance|account)/.test(role) || /(wallet|treasury|accounting|finance)/.test(key)) {
    return "Finance";
  }
  if (/(market|sales|client|procurement)/.test(role) || /(sales|market|client|procurement)/.test(key)) {
    return "Commerce";
  }
  if (/(marketing|brand|growth|seo|media)/.test(role) || /(marketing|seo|growth|media)/.test(key)) {
    return "Marketing";
  }
  if (/(ops|operations|compliance|support|risk)/.test(role) || /(ops|operations|support|compliance)/.test(key)) {
    return "Operations";
  }
  if (/(chairman|chief|executive|director|founder)/.test(role) || /(chairman|chief)/.test(key)) {
    return "Leadership";
  }
  return "Operations";
}

function resolveSignaturePhone(tenantKey: string) {
  const key = String(tenantKey || "").trim().toUpperCase();
  const scoped = key ? String(process.env[`MAIL_SIGNATURE_PHONE_${key}`] || "").trim() : "";
  const global = String(process.env.MAIL_SIGNATURE_PHONE || "").trim();
  const phone = scoped || global;
  return phone || null;
}

function resolveSignatureAddress(tenantKey: string) {
  const key = String(tenantKey || "").trim().toUpperCase();
  const scoped = key ? String(process.env[`MAIL_SIGNATURE_ADDRESS_${key}`] || "").trim() : "";
  const global = String(process.env.MAIL_SIGNATURE_ADDRESS || process.env.MAIL_PHYSICAL_ADDRESS || "").trim();
  const address = scoped || global;
  return address || null;
}

function buildAgentAvatarUrl(input: { agentKey: string; fromEmail: string }) {
  const domain = String(input.fromEmail.split("@")[1] || "").trim().toLowerCase();
  if (!domain) return null;
  const agentKey = String(input.agentKey || "").trim().toLowerCase();
  if (!agentKey) return null;
  const encoded = encodeURIComponent(agentKey);
  return `https://${domain}/api/public/agent-avatar/${encoded}.svg`;
}

function isMarketingAgentKey(agentKey: string) {
  const keys = parseCsvEnv(process.env.MAIL_MARKETING_AGENT_KEYS);
  const allow = keys.length ? keys : ["marketing"];
  return allow.includes(String(agentKey || "").trim().toLowerCase());
}

function buildMarketingUnsubscribeHeaders(input: {
  tenantId: number;
  agentKey: string;
  recipientEmail: string;
  fromEmail: string;
}) {
  const fromDomain = String(input.fromEmail.split("@")[1] || "").trim().toLowerCase();
  if (!fromDomain) return {};

  const mailtoOverride = String(process.env.MAIL_MARKETING_UNSUBSCRIBE_EMAIL || "").trim().toLowerCase();
  const mailtoAddress = mailtoOverride && mailtoOverride.includes("@") ? mailtoOverride : `unsubscribe@${fromDomain}`;

  const token = createUnsubscribeToken({
    tenantId: input.tenantId,
    email: input.recipientEmail,
    scope: "marketing",
  });

  const url = `https://${fromDomain}/api/public/email/unsubscribe?token=${encodeURIComponent(token)}`;

  return {
    "List-ID": `marketing.${fromDomain}`,
    "List-Unsubscribe": `<mailto:${mailtoAddress}?subject=unsubscribe>, <${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  } as Record<string, string>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function maybeApplyWarmupThrottle(opts: { tenantId: number; agentKey: string }) {
  const enabledRaw = String(process.env.MAIL_WARMUP_ENABLED || "").trim().toLowerCase();
  const enabled = enabledRaw ? ["1", "true", "yes", "y", "on"].includes(enabledRaw) : String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
  if (!enabled) return { delayMs: 0, minIntervalMs: 0 };

  const isMarketing = isMarketingAgentKey(opts.agentKey);
  const minIntervalMsRaw = Number(isMarketing ? process.env.MAIL_WARMUP_MIN_INTERVAL_MARKETING_MS : process.env.MAIL_WARMUP_MIN_INTERVAL_MS);
  const minIntervalMs = Number.isFinite(minIntervalMsRaw)
    ? Math.max(0, Math.min(10 * 60_000, Math.trunc(minIntervalMsRaw)))
    : isMarketing
      ? 15_000
      : 5_000;
  if (!minIntervalMs) return { delayMs: 0, minIntervalMs: 0 };

  const maxDelayMsRaw = Number(process.env.MAIL_WARMUP_MAX_DELAY_MS ?? 60_000);
  const maxDelayMs = Number.isFinite(maxDelayMsRaw) ? Math.max(1000, Math.min(10 * 60_000, Math.trunc(maxDelayMsRaw))) : 60_000;

  const last = await db.query.emailSendLogs.findFirst({
    where: eq(emailSendLogs.tenantId, opts.tenantId),
    orderBy: [desc(emailSendLogs.createdAt)],
    columns: { createdAt: true },
  });

  const lastAt = last?.createdAt ? new Date(last.createdAt).getTime() : null;
  const now = Date.now();
  const delta = lastAt != null ? now - lastAt : null;
  const delayMs = delta != null && delta < minIntervalMs ? minIntervalMs - delta : 0;

  if (delayMs <= 0) return { delayMs: 0, minIntervalMs };
  if (delayMs > maxDelayMs) {
    throw new Error(`Warm-up throttle active: wait ${Math.ceil(delayMs / 1000)}s before sending again.`);
  }

  await sleep(delayMs);
  return { delayMs, minIntervalMs };
}

async function maybeEnforceMarketingDailyWarmupCap(opts: { tenantId: number; agentKey: string }) {
  if (!isMarketingAgentKey(opts.agentKey)) return { enforced: false, sentToday: null, allowedToday: null };

  const enabledRaw = String(process.env.MAIL_WARMUP_MARKETING_DAILY_ENABLED || "").trim().toLowerCase();
  const enabled = enabledRaw
    ? ["1", "true", "yes", "y", "on"].includes(enabledRaw)
    : String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
  if (!enabled) return { enforced: false, sentToday: null, allowedToday: null };

  const mode = String(process.env.MAIL_WARMUP_MARKETING_DAILY_MODE || "step").trim().toLowerCase();

  const first = await db.query.emailSendLogs.findFirst({
    where: and(eq(emailSendLogs.tenantId, opts.tenantId), eq(emailSendLogs.actorAgentKey, opts.agentKey)),
    orderBy: [asc(emailSendLogs.createdAt)],
    columns: { createdAt: true },
  });

  const firstAtMs = first?.createdAt ? new Date(first.createdAt).getTime() : Date.now();
  const daysSince = Math.max(0, Math.floor((Date.now() - firstAtMs) / (24 * 60 * 60_000)));

  const allowedToday = (() => {
    if (mode === "linear") {
      const startRaw = Number(process.env.MAIL_WARMUP_MARKETING_DAILY_START ?? 10);
      const incRaw = Number(process.env.MAIL_WARMUP_MARKETING_DAILY_INCREMENT ?? 10);
      const maxRaw = Number(process.env.MAIL_WARMUP_MARKETING_DAILY_MAX ?? 250);
      const start = Number.isFinite(startRaw) ? Math.max(1, Math.min(5000, Math.trunc(startRaw))) : 10;
      const increment = Number.isFinite(incRaw) ? Math.max(0, Math.min(5000, Math.trunc(incRaw))) : 10;
      const max = Number.isFinite(maxRaw) ? Math.max(start, Math.min(50_000, Math.trunc(maxRaw))) : 250;
      return Math.min(max, start + daysSince * increment);
    }

    const after14Raw = Number(process.env.MAIL_WARMUP_MARKETING_DAILY_AFTER_14 ?? 20);
    const after14 = Number.isFinite(after14Raw) ? Math.max(1, Math.min(50_000, Math.trunc(after14Raw))) : 20;
    if (daysSince <= 2) return 5;
    if (daysSince <= 6) return 10;
    if (daysSince <= 13) return 20;
    return after14;
  })();

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(emailSendLogs)
    .where(
      and(
        eq(emailSendLogs.tenantId, opts.tenantId),
        eq(emailSendLogs.actorAgentKey, opts.agentKey),
        gte(emailSendLogs.createdAt, dayStart),
      ),
    );
  const sentToday = Number(rows[0]?.count || 0);

  if (sentToday >= allowedToday) {
    throw new Error(`Marketing warm-up cap reached for today (${sentToday}/${allowedToday}). Try again tomorrow.`);
  }

  return { enforced: true, sentToday, allowedToday };
}

function buildMessageIdDomain(fromEmail: string) {
  const domain = String(fromEmail.split("@")[1] || "").trim().toLowerCase();
  if (!domain) return "localhost";
  return domain;
}

function isProfessionalAgentEmailAddress(email: string) {
  const value = String(email || "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0) return false;
  const local = value.slice(0, at);
  // Strict: "firstname.lastname" only, no digits/underscores/extra segments.
  return /^[a-z]{2,}\.[a-z]{2,}$/.test(local);
}

function parseEmailDomain(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at <= 0) return null;
  const domain = email.slice(at + 1).trim();
  return domain || null;
}

async function ensureMailboxForAgent(opts: { tenantId: number; agentKey: string }) {
  const existingMailbox = await db.query.agentMailboxes.findFirst({
    where: and(eq(agentMailboxes.tenantId, opts.tenantId), eq(agentMailboxes.agentKey, opts.agentKey)),
  });
  if (existingMailbox) return existingMailbox;

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, opts.tenantId),
  });
  if (!tenant) throw new Error("Tenant not found");

  const domain = await resolveTenantMailDomain({
    id: tenant.id,
    key: tenant.key,
    domains: tenant.domains,
  });
  if (!domain) throw new Error("No mail domain configured for this tenant");

  const maildirBase = String(process.env.MAILDIR_BASE || "").trim() || "/var/vmail";
  await provisionAgentMailbox({
    tenantId: opts.tenantId,
    tenantKey: tenant.key,
    agentKey: opts.agentKey,
    domain,
    maildirBase,
  });

  const provisioned = await db.query.agentMailboxes.findFirst({
    where: and(eq(agentMailboxes.tenantId, opts.tenantId), eq(agentMailboxes.agentKey, opts.agentKey)),
  });
  if (!provisioned) throw new Error("Mailbox not provisioned for this agent");
  return provisioned;
}

async function resolveSenderIdentity(opts: {
  tenantId: number;
  agentKey: string;
  actorAgentId?: number | null;
  mailbox: typeof agentMailboxes.$inferSelect;
}) : Promise<ResolvedSenderIdentity> {
  const actorAgentId =
    typeof opts.actorAgentId === "number" && Number.isFinite(opts.actorAgentId)
      ? Math.trunc(opts.actorAgentId)
      : null;
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, opts.tenantId),
  });
  const actor =
    actorAgentId != null
      ? await db.query.agents.findFirst({
          where: eq(agents.id, actorAgentId),
          columns: { id: true, name: true, role: true },
        })
      : null;

  let identity =
    actorAgentId != null
      ? await db.query.agentEmailIdentities.findFirst({
          where: and(
            eq(agentEmailIdentities.tenantId, opts.tenantId),
            eq(agentEmailIdentities.agentId, actorAgentId),
          ),
        })
      : null;

  if (!identity) {
    identity = await db.query.agentEmailIdentities.findFirst({
      where: and(
        eq(agentEmailIdentities.tenantId, opts.tenantId),
        eq(agentEmailIdentities.agentKey, opts.agentKey),
      ),
    });
  }

  const existingFromEmail = String(identity?.fromEmail || opts.mailbox.email || "").trim().toLowerCase();
  const preferredDomain = parseEmailDomain(existingFromEmail) || parseEmailDomain(opts.mailbox.email);
  const profile = resolveAgentProfessionalProfile({
    tenantKey: String(tenant?.key || ""),
    tenantName: tenant?.name ?? null,
    agentKey: opts.agentKey,
    agentName: actor?.name ?? identity?.displayName ?? null,
    agentRole: actor?.role ?? null,
    preferredDomain,
  });

  const professionalFromEmail = String(profile.emailAddress || "").trim().toLowerCase();
  if (!isProfessionalAgentEmailAddress(professionalFromEmail)) {
    throw new Error(`Agent email identity must be firstname.lastname@domain (got ${professionalFromEmail || "empty"})`);
  }

  const mailboxEmail = String(opts.mailbox.email || "").trim().toLowerCase();
  if (!mailboxEmail || !mailboxEmail.includes("@")) {
    throw new Error("Agent mailbox has invalid email address.");
  }

  // Ensure replies to the professional address are deliverable (alias -> mailbox) when mailbox differs.
  let aliasProvision: EnsureMailboxDeliverableResult | null = null;
  let aliasWarning: string | null = null;
  if (mailboxEmail !== professionalFromEmail) {
    aliasProvision = await ensureAliasAddressDeliverable({
      source: professionalFromEmail,
      destination: mailboxEmail,
    });
    if (!aliasProvision.exists) {
      aliasWarning = `reply_alias_unavailable:${aliasProvision.provider}:${aliasProvision.warning || "not_deliverable"}`;
      console.warn(
        `[mail] Alias fallback in effect for ${professionalFromEmail} -> ${mailboxEmail} (${aliasWarning})`,
      );
    }
  }

  const preferredFromEmail = professionalFromEmail;
  const preferredReplyToEmail =
    mailboxEmail !== professionalFromEmail && aliasProvision && !aliasProvision.exists
      ? mailboxEmail
      : professionalFromEmail;

  if (!identity) {
    const now = new Date();
    const displayName = String(profile.displayName || actor?.name || "").trim() || titleCaseFromKey(opts.agentKey) || null;

    const [created] = await db
      .insert(agentEmailIdentities)
      .values({
        tenantId: opts.tenantId,
        agentId: actorAgentId,
        agentKey: opts.agentKey,
        mailboxId: opts.mailbox.id,
        emailAccountId: null,
        fromEmail: preferredFromEmail,
        replyToEmail: preferredReplyToEmail,
        displayName,
        isEnabled: true,
          metadata: {
            autoCreated: true,
            role: profile.role,
            companyName: profile.companyName,
            website: profile.website,
            aliasDestination: mailboxEmail !== professionalFromEmail ? mailboxEmail : null,
            aliasWarning,
          },
          createdAt: now,
          updatedAt: now,
        })
      .onConflictDoUpdate({
        target: [agentEmailIdentities.tenantId, agentEmailIdentities.agentKey],
        set: {
          mailboxId: opts.mailbox.id,
          fromEmail: preferredFromEmail,
          replyToEmail: preferredReplyToEmail,
          displayName,
          isEnabled: true,
          metadata: {
            autoCreated: true,
            role: profile.role,
            companyName: profile.companyName,
            website: profile.website,
            aliasDestination: mailboxEmail !== professionalFromEmail ? mailboxEmail : null,
            aliasWarning,
          },
          updatedAt: now,
        },
      })
      .returning();
    identity = created ?? null;
  }

  if (!identity) throw new Error("Agent has no email identity configured.");
  if (!identity.isEnabled) throw new Error("Agent email identity disabled.");

  // Enforce professional sender identity (and keep it stable over time).
  if (
    String(identity.fromEmail || "").trim().toLowerCase() !== preferredFromEmail ||
    String(identity.replyToEmail || "").trim().toLowerCase() !== preferredReplyToEmail
  ) {
    const identityMeta = parseObject(identity.metadata);
    const updatedAt = new Date();
    await db
      .update(agentEmailIdentities)
      .set({
        fromEmail: preferredFromEmail,
        replyToEmail: preferredReplyToEmail,
        mailboxId: opts.mailbox.id,
        metadata: {
          ...identityMeta,
          role: profile.role,
          companyName: profile.companyName,
          website: profile.website,
          aliasDestination: mailboxEmail !== professionalFromEmail ? mailboxEmail : null,
          aliasWarning,
          enforcedAt: updatedAt.toISOString(),
        },
        updatedAt,
      })
      .where(eq(agentEmailIdentities.id, identity.id));

    identity = {
      ...identity,
      fromEmail: preferredFromEmail,
      replyToEmail: preferredReplyToEmail,
      mailboxId: opts.mailbox.id,
      metadata: {
        ...identityMeta,
        role: profile.role,
        companyName: profile.companyName,
        website: profile.website,
        aliasDestination: mailboxEmail !== professionalFromEmail ? mailboxEmail : null,
        aliasWarning,
        enforcedAt: updatedAt.toISOString(),
      },
      updatedAt,
    };
  }

  const metadata = parseObject(identity.metadata);
  const smtpMeta = parseObject(metadata.smtp);
  const smtpPasswordRef = String(identity.smtpPasswordRef || smtpMeta.passwordRef || "").trim();
  const smtpUsername = String(identity.smtpUsername || smtpMeta.username || "").trim();
  const smtpHost = String(identity.smtpHost || smtpMeta.host || "").trim();
  const smtpPort = parseSmtpPort(identity.smtpPort ?? smtpMeta.port);
  const smtpSecure = parseOptionalBool(identity.smtpSecure ?? smtpMeta.secure);
  const smtpPassword = resolveSecretReference(smtpPasswordRef);

  if (smtpUsername && !smtpPassword) {
    throw new Error(`SMTP credentials not resolved for agent identity (${smtpPasswordRef || "missing ref"})`);
  }

  const smtpConfig =
    smtpUsername || smtpHost || smtpPort != null || smtpSecure != null
      ? {
          host: smtpHost || null,
          port: smtpPort,
          secure: smtpSecure,
          username: smtpUsername || null,
          password: smtpPassword,
        }
      : null;

  const fromEmail = preferredFromEmail;
  if (!fromEmail || !fromEmail.includes("@")) {
    throw new Error("Agent email identity has invalid from address.");
  }

  const replyToEmail = preferredReplyToEmail;
  const displayName = String(identity.displayName || profile.displayName || "").trim() || null;
  const identityMeta = parseObject(identity.metadata);
  const professionalRole = String(identityMeta.role || profile.role || "").trim() || profile.role;
  const companyName = String(identityMeta.companyName || profile.companyName || "").trim() || profile.companyName;
  const website = String(identityMeta.website || profile.website || "").trim() || profile.website;
  const envelopeFromEmail = String(opts.mailbox.email || fromEmail).trim().toLowerCase();

  return {
    identityId: identity.id ?? null,
    tenantKey: String(tenant?.key || "").trim(),
    fromEmail,
    replyToEmail,
    envelopeFromEmail,
    displayName,
    professionalRole,
    companyName,
    website,
    smtpConfig,
  };
}

export async function sendEmailAsAgent(input: SendEmailAsAgentInput) {
  const agentKey = normalizeAgentKey(input.agentKey);
  if (!agentKey) throw new Error("agentKey required");
  if (!Array.isArray(input.to) || input.to.length === 0) throw new Error("to[] required");

  await assertProductionAgentKeyAllowed({ tenantId: input.tenantId, agentKey, context: "mail:sendEmailAsAgent" });

  const textBody = typeof input.textBody === "string" ? input.textBody : null;
  const htmlBody = typeof input.htmlBody === "string" ? input.htmlBody : null;
  if (!textBody && !htmlBody) throw new Error("body.text or body.html required");

  const recipientValidation = normalizeAndValidateRecipients(input.to);
  if (!recipientValidation.recipients.length) throw new Error("to[] must include at least one valid recipient");
  if (recipientValidation.invalid.length) {
    throw new Error(`Invalid recipient email(s): ${recipientValidation.invalid.join(", ")}`);
  }

  const mailbox = await ensureMailboxForAgent({ tenantId: input.tenantId, agentKey });
  if (!mailbox.isEnabled) throw new Error("Mailbox disabled");
  if (mailbox.approvalRequired && !input.bypassApproval) throw new Error("Approval required for this mailbox");

  const mailboxMeta = parseObject(mailbox.metadata);
  const existingProvisionState = parseProvisionState(mailboxMeta.provision);
  let mailboxDelivery = existingProvisionState;
  let mailboxDeliveryError: string | null = null;

  if (mailboxDelivery?.provider === "maildb" && !isMailDbAuthoritativeProvisioning()) {
    mailboxDelivery = null;
  }

  if (!mailboxDelivery || !mailboxDelivery.exists) {
    try {
      mailboxDelivery = await ensureMailboxAddressDeliverable({
        email: mailbox.email,
        quotaMb: mailbox.quotaMb ?? 2048,
        maildir: String(mailboxMeta.maildir || "").trim() || null,
      });
    } catch (err: any) {
      mailboxDeliveryError = String(err?.message || err || "mailbox_delivery_check_failed");
      mailboxDelivery = {
        provider: "none",
        available: false,
        exists: false,
        createdOnProvider: false,
        warning: mailboxDeliveryError,
      };
    }

    try {
      await db
        .update(agentMailboxes)
        .set({
          metadata: {
            ...mailboxMeta,
            provision: {
              provider: mailboxDelivery.provider,
              available: mailboxDelivery.available,
              exists: mailboxDelivery.exists,
              createdOnProvider: mailboxDelivery.createdOnProvider,
              warning: mailboxDelivery.warning ?? null,
              checkedAt: new Date().toISOString(),
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(agentMailboxes.id, mailbox.id));
    } catch {
      // non-fatal metadata update
    }
  }

  const senderIdentity = await resolveSenderIdentity({
    tenantId: input.tenantId,
    agentKey,
    actorAgentId: input.actorAgentId ?? null,
    mailbox,
  });

  const department = inferDepartmentLabel({ agentKey, role: senderIdentity.professionalRole });
  const signaturePhone = resolveSignaturePhone(senderIdentity.tenantKey);
  const signatureAddress = resolveSignatureAddress(senderIdentity.tenantKey);
  const avatarUrl = buildAgentAvatarUrl({ agentKey, fromEmail: senderIdentity.fromEmail });

  const content = buildProfessionalEmailContent({
    to: recipientValidation.recipients,
    subject: String(input.subject || "").trim(),
    textBody,
    htmlBody,
    signature: {
      displayName: senderIdentity.displayName || titleCaseFromKey(agentKey),
      role: senderIdentity.professionalRole,
      department,
      companyName: senderIdentity.companyName,
      emailAddress: senderIdentity.fromEmail,
      website: senderIdentity.website,
      phone: signaturePhone,
      address: signatureAddress,
      avatarUrl,
    },
  });

  const isMarketing = isMarketingAgentKey(agentKey);
  if (isMarketing && content.recipients.length !== 1) {
    throw new Error("Marketing emails must be sent to exactly 1 recipient per message (for unsubscribe compliance).");
  }

  if (isMarketing) {
    const recipientEmail = content.recipients[0];
    const unsub = await db.query.emailUnsubscribes.findFirst({
      where: and(
        eq(emailUnsubscribes.tenantId, input.tenantId),
        eq(emailUnsubscribes.email, recipientEmail),
        eq(emailUnsubscribes.scope, "marketing"),
      ),
      columns: { id: true },
    });
    if (unsub) {
      throw new Error(`Recipient ${recipientEmail} is unsubscribed from marketing emails.`);
    }
  }

  let warmup: { delayMs: number; minIntervalMs: number } = { delayMs: 0, minIntervalMs: 0 };
  let marketingWarmupCap: { enforced: boolean; sentToday: number | null; allowedToday: number | null } = {
    enforced: false,
    sentToday: null,
    allowedToday: null,
  };

  let effectiveReplyToEmail = senderIdentity.replyToEmail;
  if (!mailboxDelivery?.exists) {
    const fallbackReply = pickFallbackReplyAddress();
    if (!fallbackReply) {
      throw new Error(
        "Agent mailbox is not provisioned on the mail server and no fallback reply address is configured (MAIL_REPLY_FALLBACK).",
      );
    }
    effectiveReplyToEmail = fallbackReply;
  }

  // Quota enforcement (0 = unlimited)
  const dailyLimit = Number(mailbox.dailyOutboundLimit || 0);
  if (dailyLimit > 0) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);

    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailMessages)
      .where(
        and(
          eq(emailMessages.mailboxId, mailbox.id),
          eq(emailMessages.direction, "outbound"),
          gte(emailMessages.createdAt, start),
          sql`upper(${emailMessages.status}) not in ('FAILED', 'BOUNCED', 'SPAM_REJECTED', 'UNKNOWN')`,
        ),
      );
    const sentToday = Number(rows[0]?.count || 0);
    if (sentToday >= dailyLimit) {
      throw new Error(`Daily send limit reached (${dailyLimit})`);
    }
  }

  marketingWarmupCap = await maybeEnforceMarketingDailyWarmupCap({ tenantId: input.tenantId, agentKey });
  warmup = await maybeApplyWarmupThrottle({ tenantId: input.tenantId, agentKey });

  const now = new Date();
  const subjectNorm = normalizeEmailSubject(content.subject);

  const actionRequestMeta =
    input.actionRequestId != null
      ? await db.query.actionRequests.findFirst({
          where: and(eq(actionRequests.id, input.actionRequestId), eq(actionRequests.tenantId, input.tenantId)),
          columns: { relatedThreadId: true },
        })
      : null;
  const relatedThreadId =
    typeof actionRequestMeta?.relatedThreadId === "number" && Number.isFinite(actionRequestMeta.relatedThreadId)
      ? Math.trunc(actionRequestMeta.relatedThreadId)
      : null;

  const preferredThread =
    relatedThreadId != null
      ? await db.query.emailThreads.findFirst({
          where: and(
            eq(emailThreads.id, relatedThreadId),
            eq(emailThreads.tenantId, input.tenantId),
            eq(emailThreads.mailboxId, mailbox.id),
          ),
        })
      : null;

  const thread = preferredThread
    ? (await db
        .update(emailThreads)
        .set({ lastMessageAt: now })
        .where(eq(emailThreads.id, preferredThread.id))
        .returning())[0]!
    : await getOrCreateThread({
        tenantId: input.tenantId,
        agentKey,
        mailboxId: mailbox.id,
        subject: content.subject,
        subjectNorm,
        lastMessageAt: now,
      });

  const lastInbound =
    preferredThread
      ? await db.query.emailMessages.findFirst({
          where: and(
            eq(emailMessages.tenantId, input.tenantId),
            eq(emailMessages.mailboxId, mailbox.id),
            eq(emailMessages.threadId, thread.id),
            eq(emailMessages.direction, "inbound"),
            sql`coalesce(${emailMessages.messageId}, '') <> ''`,
          ),
          orderBy: [desc(emailMessages.createdAt)],
          columns: { messageId: true, referencesJson: true },
        })
      : null;

  const inReplyTo = lastInbound?.messageId ? String(lastInbound.messageId).trim() : null;
  const referencesSeed = Array.isArray(lastInbound?.referencesJson)
    ? (lastInbound!.referencesJson as any[]).map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  const referencesJson = Array.from(new Set([...(referencesSeed || []), ...(inReplyTo ? [inReplyTo] : [])]));

  const [queued] = await db
    .insert(emailMessages)
    .values({
      tenantId: input.tenantId,
      agentKey,
      mailboxId: mailbox.id,
      threadId: thread.id,
      actionRequestId: input.actionRequestId ?? null,
      direction: "outbound",
      status: MAIL_DELIVERY_STATUSES.QUEUED,
      fromEmail: senderIdentity.fromEmail,
      toJson: content.recipients,
      ccJson: [],
      subject: content.subject,
      textBody: content.textBody,
      htmlBody: content.htmlBody,
      messageId: null,
      inReplyTo,
      referencesJson,
      maildirPath: null,
      metadata: {
        requestedBy: input.requestedByUserId ?? null,
        actionRequestId: input.actionRequestId ?? null,
        fromEmail: senderIdentity.fromEmail,
        replyToEmail: effectiveReplyToEmail,
        displayName: senderIdentity.displayName,
        identityId: senderIdentity.identityId,
        mailboxDelivery,
        mailboxDeliveryError,
        deliveryStatus: MAIL_DELIVERY_STATUSES.QUEUED,
      },
      createdAt: now,
    })
    .returning();

  const sentAtIso = now.toISOString();
  const headers = signPlatformHeaders({
    tenantId: input.tenantId,
    agentKey,
    to: content.recipients,
    subject: content.subject,
    sentAtIso,
  });
  const marketingHeaders = isMarketing
    ? buildMarketingUnsubscribeHeaders({
        tenantId: input.tenantId,
        agentKey,
        recipientEmail: content.recipients[0],
        fromEmail: senderIdentity.fromEmail,
      })
    : {};
  const messageIdDomain = buildMessageIdDomain(senderIdentity.fromEmail);
  const messageId = `<${Date.now()}.${crypto.randomBytes(12).toString("hex")}@${messageIdDomain}>`;

  const [sendLog] = await db
    .insert(emailSendLogs)
    .values({
      tenantId: input.tenantId,
      actionRequestId: input.actionRequestId ?? null,
      actorType: input.actorType || "agent",
      actorId: input.requestedByUserId ?? null,
      actorAgentId: input.actorAgentId ?? null,
      actorAgentKey: agentKey,
      resolvedFromEmail: senderIdentity.fromEmail,
      resolvedReplyToEmail: effectiveReplyToEmail,
      smtpUsernameUsed: null,
      toJson: content.recipients,
      subject: content.subject,
      status: MAIL_DELIVERY_STATUSES.QUEUED,
      providerMessageId: null,
      providerResponse: {},
      error: null,
      metadata: {
        correlationId: input.correlationId ?? null,
        identityId: senderIdentity.identityId,
        mailboxDelivery,
        mailboxDeliveryError,
        deliveryStatus: MAIL_DELIVERY_STATUSES.QUEUED,
        warmup: {
          minIntervalMs: warmup.minIntervalMs,
          delayMsApplied: warmup.delayMs,
        },
        marketingWarmupCap,
      },
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  let smtpResultInfo: any = null;
  let smtpUserUsed: string | null = null;
  try {
    const fromDomain = String(senderIdentity.fromEmail.split("@")[1] || "").trim().toLowerCase();
    await assertOutboundDeliverabilityReady({ fromDomain });

    const smtp = createSmtpTransport(senderIdentity.smtpConfig ?? undefined);
    smtpUserUsed = smtp.smtpUserUsed;
    const fromDisplayName = senderIdentity.displayName
      ? `${senderIdentity.displayName} (${senderIdentity.companyName})`
      : null;
    smtpResultInfo = await smtp.transport.sendMail({
      from: fromDisplayName
        ? {
            name: fromDisplayName,
            address: senderIdentity.fromEmail,
          }
        : senderIdentity.fromEmail,
      sender: senderIdentity.envelopeFromEmail,
      replyTo: effectiveReplyToEmail,
      envelope: {
        from: senderIdentity.envelopeFromEmail,
        to: content.recipients,
      },
      to: content.recipients,
      subject: content.subject,
      text: content.textBody,
      html: content.htmlBody,
      messageId,
      ...(inReplyTo ? { inReplyTo } : {}),
      ...(referencesJson.length ? { references: referencesJson } : {}),
      headers: { ...headers, ...marketingHeaders },
    });

    const delivery = evaluateSmtpDelivery(content.recipients, smtpResultInfo);
    if (!delivery.ok) {
      const reason = describeDeliveryFailure(delivery);
      throw new Error(`Email delivery failed: ${reason}`);
    }
    const deliveryStatus = classifyMailDeliveryStatus({ delivery, errorMessage: null });
    const queueId = extractQueueIdFromSmtpResponse(delivery.response || smtpResultInfo?.response);

    await db
      .update(emailMessages)
      .set({
        status: deliveryStatus,
        messageId: smtpResultInfo?.messageId ? String(smtpResultInfo.messageId) : null,
        metadata: {
          requestedBy: input.requestedByUserId ?? null,
          actionRequestId: input.actionRequestId ?? null,
          fromEmail: senderIdentity.fromEmail,
          replyToEmail: effectiveReplyToEmail,
          displayName: senderIdentity.displayName,
          smtpUsernameUsed: smtpUserUsed,
          delivery: {
            accepted: delivery.accepted,
            rejected: delivery.rejected,
            pending: delivery.pending,
            missing: delivery.missing,
            response: delivery.response,
            queueId,
            deliveryStatus,
          },
          mailboxDelivery,
          mailboxDeliveryError,
        },
      })
      .where(eq(emailMessages.id, queued.id));

    await db
      .update(emailSendLogs)
      .set({
        status: deliveryStatus,
        smtpUsernameUsed: smtpUserUsed,
        providerMessageId: smtpResultInfo?.messageId ? String(smtpResultInfo.messageId) : null,
        providerResponse: {
          accepted: delivery.accepted,
          rejected: delivery.rejected,
          pending: delivery.pending,
          missing: delivery.missing,
          response: delivery.response,
          queueId,
          deliveryStatus,
        },
        updatedAt: new Date(),
      })
      .where(eq(emailSendLogs.id, sendLog.id));

    await db
      .update(emailWorkOrders)
      .set({ status: "replied", repliedAt: now, updatedAt: now })
      .where(and(eq(emailWorkOrders.threadId, thread.id), eq(emailWorkOrders.tenantId, input.tenantId)));

    return {
      ok: true,
      mailboxId: mailbox.id,
      message: {
        id: queued.id,
        status: deliveryStatus,
        messageId: smtpResultInfo?.messageId ?? null,
        from: senderIdentity.fromEmail,
        replyTo: effectiveReplyToEmail,
        smtpUser: smtpUserUsed,
        queueId,
      },
    } as const;
  } catch (err: any) {
    const delivery = evaluateSmtpDelivery(content.recipients, smtpResultInfo);
    const errorMessage = String(err?.message || err || "unknown_error");
    const rawFailureStatus = classifyMailDeliveryStatus({ delivery, errorMessage });
    const failureStatus =
      rawFailureStatus === MAIL_DELIVERY_STATUSES.ACCEPTED_BY_MTA
        ? MAIL_DELIVERY_STATUSES.UNKNOWN
        : rawFailureStatus;
    const queueId = extractQueueIdFromSmtpResponse(delivery.response || smtpResultInfo?.response);

    await db
      .update(emailMessages)
      .set({
        status: failureStatus,
        metadata: {
          requestedBy: input.requestedByUserId ?? null,
          actionRequestId: input.actionRequestId ?? null,
          fromEmail: senderIdentity.fromEmail,
          replyToEmail: effectiveReplyToEmail,
          displayName: senderIdentity.displayName,
          smtpUsernameUsed: smtpUserUsed,
          delivery: {
            accepted: delivery.accepted,
            rejected: delivery.rejected,
            pending: delivery.pending,
            missing: delivery.missing,
            response: delivery.response,
            queueId,
            deliveryStatus: failureStatus,
          },
          mailboxDelivery,
          mailboxDeliveryError,
          error: errorMessage,
        },
      })
      .where(eq(emailMessages.id, queued.id));

    await db
      .update(emailSendLogs)
      .set({
        status: failureStatus,
        smtpUsernameUsed: smtpUserUsed,
        providerMessageId: smtpResultInfo?.messageId ? String(smtpResultInfo.messageId) : null,
        providerResponse: {
          accepted: delivery.accepted,
          rejected: delivery.rejected,
          pending: delivery.pending,
          missing: delivery.missing,
          response: delivery.response,
          queueId,
          deliveryStatus: failureStatus,
        },
        error: errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(emailSendLogs.id, sendLog.id));
    throw err;
  }
}
