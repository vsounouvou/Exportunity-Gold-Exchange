import { Router } from "express";
import crypto from "crypto";
import dns from "node:dns/promises";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@db";
import {
  agentMailboxes,
  agents,
  auditLogs,
  eceUsers,
  emailAssistantAgentPolicies,
  emailAccounts,
  emailAliases,
  emailDomains,
  emailMessages,
  emailSendLogs,
  emailThreads,
  emailWorkOrders,
  userTenantRoles,
} from "@db/schema";
import { ensureTenantAdmin } from "./utils/auth";
import { AGENT_KEYS } from "../agents";
import { normalizeAgentKey } from "../lib/mail/agentSlugs";
import { runMailIndexer } from "../lib/mail/indexer";
import { resolveTenantMailDomain } from "../lib/mail/domainResolver";
import {
  setVirtualUserEnabled,
} from "../lib/mail/mailDb";
import { provisionAgentMailbox } from "../lib/mail/provisioner";
import { verifyImapLogin } from "../lib/mail/imapAuthCheck";
import { getMailAuthDiagnostics } from "../lib/mail/authDiagnostics";
import { probeSmtpConnection } from "../lib/mail/smtpProbe";
import { getMailPlacementSnapshot } from "../lib/mail/placementProbe";
import {
  isMailserverSetupAvailable,
  mailserverAliasAdd,
  mailserverEmailAdd,
  mailserverEmailDelete,
  mailserverEmailUpdate,
  mailserverQuotaSet,
  mailserverRefreshAuth,
} from "../lib/mail/mailserverSetup";

const router = Router();
router.use(ensureTenantAdmin);

const DEFAULT_MAIL_AGENT_KEYS = Array.from(
  new Set([
    ...AGENT_KEYS,
    "procurement",
    "sales",
    "wallet",
    "accounting",
    "support",
    "coordinator",
    "seo",
  ]),
);

function parseIntSafe(value: unknown) {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseLimit(value: unknown, fallback: number, max: number) {
  const n = parseIntSafe(value);
  if (!n) return fallback;
  return Math.min(Math.max(n, 1), max);
}

function randomPassword() {
  return crypto.randomBytes(18).toString("base64url");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyImapLoginAfterMailserverChange(input: { user: string; password: string; attempts?: number; delayMs?: number }) {
  const attempts = Math.max(1, Math.min(input.attempts ?? 6, 10));
  const delayMs = Math.max(250, Math.min(input.delayMs ?? 1_000, 5_000));
  let refresh: Awaited<ReturnType<typeof mailserverRefreshAuth>> | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    refresh = await mailserverRefreshAuth();
    if (attempt > 1) await sleep(delayMs);

    const result = await verifyImapLogin({ user: input.user, password: input.password });
    if (result.ok || attempt === attempts) return { ...result, refresh };
  }

  return { ok: false, host: "", port: 0, message: "IMAP verification failed after mailserver auth refresh", refresh };
}

function stripWww(value: string) {
  return value.replace(/^www\\./i, "").trim();
}

function normalizeDomain(value: string) {
  const domain = stripWww(String(value || "").trim().toLowerCase());
  if (!domain) return "";
  if (!/^[a-z0-9.-]+\\.[a-z]{2,}$/.test(domain)) return "";
  return domain;
}

function normalizeDnsName(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^www[.]/, "")
    .replace(/[.]$/g, "");
}

function getExpectedMailHost(domain: string) {
  const configured = normalizeDnsName(String(process.env.MAIL_EXPECTED_MX_HOST || process.env.MAIL_EXPECTED_MAIL_HOST || ""));
  return configured || `mail.${normalizeDnsName(domain)}`;
}

function getExpectedMailIpv4(domain: string) {
  const configured = String(
    process.env.MAIL_SMTP_PUBLIC_IP ||
      process.env.MAIL_SMTP_SOURCE_IP ||
      process.env.APP_PUBLIC_IP ||
      process.env.PUBLIC_IP ||
      "",
  ).trim();
  if (configured) return configured;
  if (domain === "agoojiye.com") return "51.254.143.30";
  return "";
}

async function getInboundDnsDiagnostics(domain: string) {
  const expectedHost = getExpectedMailHost(domain);
  const expectedIpv4 = getExpectedMailIpv4(domain);
  const warnings: string[] = [];
  let mxRecords: Array<{ exchange: string; priority: number }> = [];
  let mailHostARecords: string[] = [];

  try {
    mxRecords = (await dns.resolveMx(domain))
      .map((record) => ({
        exchange: normalizeDnsName(record.exchange),
        priority: Number(record.priority),
      }))
      .filter((record) => record.exchange)
      .sort((a, b) => a.priority - b.priority || a.exchange.localeCompare(b.exchange));
  } catch (error: any) {
    warnings.push(`mx_lookup_failed:${String(error?.code || error?.message || "unknown")}`);
  }

  try {
    mailHostARecords = await dns.resolve4(expectedHost);
  } catch (error: any) {
    warnings.push(`mail_host_a_lookup_failed:${String(error?.code || error?.message || "unknown")}`);
  }

  const mxOk = mxRecords.some((record) => normalizeDnsName(record.exchange) === expectedHost);
  const mailHostAOk = expectedIpv4 ? mailHostARecords.includes(expectedIpv4) : mailHostARecords.length > 0;
  if (!mxOk) warnings.push("mx_not_cut_over");
  if (!mailHostAOk) warnings.push(expectedIpv4 ? "mail_host_a_mismatch" : "mail_host_a_missing");

  return {
    expectedMxHost: expectedHost,
    expectedMailHost: expectedHost,
    expectedIpv4: expectedIpv4 || null,
    readyForInbound: mxOk && mailHostAOk,
    mx: {
      ok: mxOk,
      records: mxRecords,
    },
    mailHostA: {
      ok: mailHostAOk,
      records: mailHostARecords,
    },
    warnings,
  };
}

const RESERVED_LOCAL_PARTS = new Set(
  [
    "postmaster",
    "root",
    "abuse",
    "admin",
    "webmaster",
    "mailer-daemon",
    "noreply",
    "no-reply",
    "support",
    "security",
  ].map((v) => v.toLowerCase()),
);

function normalizeLocalPart(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\\s+/g, ".")
    .replace(/\\.{2,}/g, ".")
    .replace(/^\\.+|\\.+$/g, "");
}

function isValidLocalPart(localPart: string) {
  if (!localPart) return false;
  if (localPart.length < 2 || localPart.length > 64) return false;
  if (RESERVED_LOCAL_PARTS.has(localPart)) return false;
  // Conservative email local-part: letters/digits plus . _ - + (no leading/trailing dot).
  if (!/^[a-z0-9][a-z0-9._+-]*[a-z0-9]$/.test(localPart)) return false;
  if (localPart.includes("..")) return false;
  return true;
}

function parseQuotaInput(value: unknown): { quota: string; quotaMb: number } | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const quotaMb = Math.trunc(value);
    return { quota: `${quotaMb}M`, quotaMb };
  }

  const raw = String(value || "").trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const quotaMb = Number(raw);
    if (!Number.isFinite(quotaMb) || quotaMb <= 0) return null;
    return { quota: `${Math.trunc(quotaMb)}M`, quotaMb: Math.trunc(quotaMb) };
  }

  const m = raw.match(/^(\d+)\s*([gGmM])b?$/);
  if (!m) return null;
  const amount = Number(m[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = String(m[2] || "").toUpperCase();
  if (unit !== "G" && unit !== "M") return null;
  const quota = `${Math.trunc(amount)}${unit}`;
  const quotaMb = unit === "G" ? Math.trunc(amount) * 1024 : Math.trunc(amount);
  return { quota, quotaMb };
}

async function ensureDefaultEmailDomainsForTenant(tenant: { id: number; key: string; domains?: string[] | null }) {
  const existing = await db.query.emailDomains.findMany({
    where: eq(emailDomains.tenantId, tenant.id),
    orderBy: (t, { asc }) => [asc(t.domain)],
    limit: 5,
  });
  if (existing.length) return;

  const defaults: string[] = [];
  for (const d of Array.isArray(tenant.domains) ? tenant.domains : []) {
    const norm = normalizeDomain(d);
    if (norm) defaults.push(norm);
  }

  if (!defaults.length) {
    if (tenant.key === "bdo") defaults.push("boursedelor.com");
    if (tenant.key === "exportunity") defaults.push("exportunity.net", "exportunity.com");
  }

  const unique = Array.from(new Set(defaults));
  if (!unique.length) return;

  const now = new Date();
  await db
    .insert(emailDomains)
    .values(unique.map((domain) => ({ tenantId: tenant.id, domain, type: "primary", isVerified: false, createdAt: now, updatedAt: now })))
    .onConflictDoNothing();
}

async function writeEmailAuditLog(opts: {
  tenantId: number;
  actorUserId: number | null;
  action: string;
  entityType: string;
  entityId: number | null;
  newState?: any;
  previousState?: any;
  metadata?: any;
}) {
  const now = new Date();
  await db.insert(auditLogs).values({
    tenantId: opts.tenantId,
    userId: opts.actorUserId ?? null,
    userRole: "admin",
    action: opts.action,
    entityType: opts.entityType,
    entityId: opts.entityId ?? null,
    previousState: opts.previousState ?? null,
    newState: opts.newState ?? null,
    ipAddress: null,
    userAgent: null,
    metadata: opts.metadata ?? {},
    createdAt: now,
  });
}

router.get("/email/agents", async (_req: any, res) => {
  res.json({ ok: true, agents: DEFAULT_MAIL_AGENT_KEYS });
});

router.get("/email/status", async (req: any, res) => {
  const hasMailDb = !!String(process.env.MAIL_DATABASE_URL || "").trim();
  const hasSignature = !!String(process.env.MAIL_PLATFORM_SIGNATURE_SECRET || "").trim();
  const hasSmtpAuth =
    !!String(process.env.MAIL_SMTP_USER || "").trim() && !!String(process.env.MAIL_SMTP_PASS || "").trim();
  const useSendmail = String(process.env.MAIL_SMTP_SENDMAIL || "").trim() === "true";
  const smtpConfigured = hasSmtpAuth || useSendmail;
  const tenant = req?.tenant;
  const domain =
    tenant?.id && tenant?.key
      ? await resolveTenantMailDomain({
          id: Number(tenant.id),
          key: String(tenant.key),
          domains: Array.isArray(tenant.domains) ? tenant.domains : null,
        })
      : null;
  const effectiveDomain = domain || String(process.env.MAIL_DOMAIN || "boursedelor.com").trim();
  const authDiagnostics = await getMailAuthDiagnostics({
    domain: effectiveDomain,
    dkimSelectors: ["s1", "mail", "default"],
    smtpHost: String(process.env.MAIL_SMTP_HOST || "mail.boursedelor.com").trim(),
    smtpHeloName: String(process.env.MAIL_SMTP_HELO_NAME || process.env.MAIL_HELO_NAME || "").trim(),
  });
  const inboundDns = await getInboundDnsDiagnostics(effectiveDomain);

  res.json({
    ok: true,
    mail: {
      domain: effectiveDomain,
      maildirBase: String(process.env.MAILDIR_BASE || "/var/vmail").trim(),
      mailDbConfigured: hasMailDb,
      signatureConfigured: hasSignature,
      smtpConfigured,
      smtp: {
        host: String(process.env.MAIL_SMTP_HOST || "mail.boursedelor.com").trim(),
        port: Number(process.env.MAIL_SMTP_PORT || 587),
        secure: String(process.env.MAIL_SMTP_SECURE || "").trim() === "true",
        usingAuth: hasSmtpAuth,
        usingSendmail: useSendmail,
      },
      authDiagnostics,
      inboundDns,
    },
  });
});

router.get("/email/smtp-probe", async (_req: any, res) => {
  try {
    const probe = await probeSmtpConnection();
    res.json({ ok: true, probe });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "smtp_probe_failed" });
  }
});

router.get("/email/placement", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ ok: false, message: "tenant required" });

    const windowHoursRaw = Number(req.query?.windowHours ?? req.query?.window_hours ?? 24);
    const windowHours = Number.isFinite(windowHoursRaw) ? Math.max(1, Math.min(168, Math.trunc(windowHoursRaw))) : 24;

    const domain =
      tenant?.id && tenant?.key
        ? await resolveTenantMailDomain({
            id: Number(tenant.id),
            key: String(tenant.key),
            domains: Array.isArray(tenant.domains) ? tenant.domains : null,
          })
        : null;
    const effectiveDomain = domain || String(process.env.MAIL_DOMAIN || "boursedelor.com").trim();

    const snapshot = await getMailPlacementSnapshot({ fromQuery: effectiveDomain, windowHours });
    res.json({ ok: snapshot.ok, snapshot });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "placement_probe_failed" });
  }
});

router.get("/email/send-logs", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const limit = parseLimit(req.query?.limit, 100, 500);
    const offset = Math.max(parseIntSafe(req.query?.offset) ?? 0, 0);
    const status = String(req.query?.status || "").trim().toUpperCase();
    const actorType = String(req.query?.actorType || "").trim().toLowerCase();
    const whereParts: any[] = [eq(emailSendLogs.tenantId, tenant.id)];
    if (status) whereParts.push(sql`upper(${emailSendLogs.status}) = ${status}`);
    if (actorType) whereParts.push(eq(emailSendLogs.actorType, actorType));

    const items = await db.query.emailSendLogs.findMany({
      where: and(...whereParts),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit,
      offset,
    });

    const countRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailSendLogs)
      .where(and(...whereParts));

    res.json({
      ok: true,
      items,
      pagination: {
        total: Number(countRows?.[0]?.count || 0),
        limit,
        offset,
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list send logs" });
  }
});

router.get("/email/auth-diagnostics", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const explicitDomain = normalizeDomain(String(req.query?.domain || "").trim());
    const tenantDomain = await resolveTenantMailDomain({
      id: Number(tenant.id),
      key: String(tenant.key),
      domains: Array.isArray(tenant.domains) ? tenant.domains : null,
    });

    const diagnostics = await getMailAuthDiagnostics({
      domain: explicitDomain || tenantDomain || String(process.env.MAIL_DOMAIN || "").trim(),
      dkimSelectors: ["s1", "mail", "default"],
      smtpHost: String(process.env.MAIL_SMTP_HOST || "mail.boursedelor.com").trim(),
      smtpHeloName: String(process.env.MAIL_SMTP_HELO_NAME || process.env.MAIL_HELO_NAME || "").trim(),
    });

    res.json({ ok: true, diagnostics });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to read email auth diagnostics" });
  }
});

// =========================
// Email assistant UX (agent permissions)
// =========================

type AssistantReadScope = "subject_only" | "full_thread";
type AssistantSendMode = "never" | "approval" | "autonomous";

const DEFAULT_ASSISTANT_POLICY: Omit<typeof emailAssistantAgentPolicies.$inferInsert, "id" | "tenantId" | "agentId"> = {
  isEnabled: true,
  readScope: "full_thread",
  canSuggestDrafts: true,
  canSuggestSummaries: true,
  canSuggestFollowups: true,
  sendMode: "never",
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

function normalizeAssistantReadScope(value: unknown): AssistantReadScope {
  const v = String(value || "").trim().toLowerCase();
  return v === "subject_only" ? "subject_only" : "full_thread";
}

function normalizeAssistantSendMode(value: unknown): AssistantSendMode {
  const v = String(value || "").trim().toLowerCase();
  if (v === "approval") return "approval";
  if (v === "autonomous") return "autonomous";
  return "never";
}

function parseBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  const v = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return fallback;
}

router.get("/email/assistant-agents", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const agentRows = await db.query.agents.findMany({
      where: eq(agents.status, "active"),
      orderBy: (t, { asc }) => [asc(t.name)],
      limit: 500,
    });

    const policies = await db.query.emailAssistantAgentPolicies.findMany({
      where: eq(emailAssistantAgentPolicies.tenantId, tenant.id),
      limit: 2000,
    });

    const policyByAgentId = new Map<number, typeof emailAssistantAgentPolicies.$inferSelect>();
    for (const p of policies) policyByAgentId.set(p.agentId, p);

    const items = agentRows.map((agent) => {
      const policy = policyByAgentId.get(agent.id) ?? null;
      return {
        agent: {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          status: agent.status,
          permissions: agent.permissions ?? {},
        },
        policy: policy
          ? {
              id: policy.id,
              isEnabled: policy.isEnabled,
              readScope: policy.readScope,
              canSuggestDrafts: policy.canSuggestDrafts,
              canSuggestSummaries: policy.canSuggestSummaries,
              canSuggestFollowups: policy.canSuggestFollowups,
              sendMode: policy.sendMode,
              updatedAt: policy.updatedAt,
            }
          : {
              id: null,
              isEnabled: true,
              readScope: "full_thread" as const,
              canSuggestDrafts: true,
              canSuggestSummaries: true,
              canSuggestFollowups: true,
              sendMode: "never" as const,
              updatedAt: null,
              isDefault: true,
            },
      };
    });

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list assistant agents" });
  }
});

router.post("/email/assistant-agents", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });
    const adminUser = req.adminUser ?? null;

    const agentId = parseIntSafe(req.body?.agentId ?? req.body?.agent_id);
    if (!agentId) return res.status(400).json({ message: "agentId required" });

    const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const now = new Date();
    const patch = {
      tenantId: tenant.id,
      agentId: agentId,
      isEnabled: parseBool(req.body?.isEnabled ?? req.body?.is_enabled, true),
      readScope: normalizeAssistantReadScope(req.body?.readScope ?? req.body?.read_scope),
      canSuggestDrafts: parseBool(req.body?.canSuggestDrafts ?? req.body?.can_suggest_drafts, true),
      canSuggestSummaries: parseBool(req.body?.canSuggestSummaries ?? req.body?.can_suggest_summaries, true),
      canSuggestFollowups: parseBool(req.body?.canSuggestFollowups ?? req.body?.can_suggest_followups, true),
      sendMode: normalizeAssistantSendMode(req.body?.sendMode ?? req.body?.send_mode),
      updatedAt: now,
    } as const;

    const [row] = await db
      .insert(emailAssistantAgentPolicies)
      .values({
        ...DEFAULT_ASSISTANT_POLICY,
        ...patch,
        tenantId: tenant.id,
        agentId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [emailAssistantAgentPolicies.tenantId, emailAssistantAgentPolicies.agentId],
        set: patch,
      })
      .returning();

    await writeEmailAuditLog({
      tenantId: tenant.id,
      actorUserId: adminUser?.id ?? null,
      action: "email_assistant_policy.upsert",
      entityType: "email_assistant_policy",
      entityId: row.id,
      newState: patch,
      metadata: { agentName: agent.name },
    });

    res.json({ ok: true, policy: row });
  } catch (err: any) {
    res.status(err?.status || 500).json({ message: err?.message || "Failed to update assistant agent policy" });
  }
});

// =========================
// Human email admin (domains/accounts/aliases)
// =========================

router.get("/email/domains", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    await ensureDefaultEmailDomainsForTenant(tenant);

    const items = await db.query.emailDomains.findMany({
      where: eq(emailDomains.tenantId, tenant.id),
      orderBy: (t, { asc }) => [asc(t.domain)],
      limit: 200,
    });

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list email domains" });
  }
});

router.get("/email/users", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const q = String(req.query?.q || "").trim().slice(0, 120);
    const limit = parseLimit(req.query?.limit, 20, 100);

    const whereParts: any[] = [eq(userTenantRoles.tenantId, tenant.id)];
    if (q) {
      whereParts.push(sql`(${eceUsers.displayName} ILIKE ${"%" + q + "%"} OR ${eceUsers.email} ILIKE ${"%" + q + "%"})`);
    }

    const rows = await db
      .select({
        id: eceUsers.id,
        displayName: eceUsers.displayName,
        email: eceUsers.email,
      })
      .from(userTenantRoles)
      .innerJoin(eceUsers, eq(userTenantRoles.userId, eceUsers.id))
      .where(and(...whereParts))
      .orderBy(asc(eceUsers.displayName))
      .limit(limit);

    res.json({ ok: true, items: rows });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list users" });
  }
});

router.get("/email/accounts", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const q = String(req.query?.q || "").trim().slice(0, 160);
    const status = String(req.query?.status || "").trim().toLowerCase();
    const domainId = parseIntSafe(req.query?.domainId);
    const companyId = parseIntSafe(req.query?.companyId);

    const limit = parseLimit(req.query?.limit, 50, 200);
    const offset = Math.max(parseIntSafe(req.query?.offset) ?? 0, 0);

    const whereParts: any[] = [eq(emailAccounts.tenantId, tenant.id)];
    if (status && status !== "all") whereParts.push(eq(emailAccounts.status, status));
    if (domainId) whereParts.push(eq(emailAccounts.domainId, domainId));
    if (companyId) whereParts.push(eq(emailAccounts.companyId, companyId));
    if (q) {
      whereParts.push(sql`(${emailAccounts.address} ILIKE ${"%" + q + "%"} OR ${eceUsers.displayName} ILIKE ${"%" + q + "%"})`);
    }

    const items = await db
      .select({
        account: emailAccounts,
        domain: { id: emailDomains.id, domain: emailDomains.domain },
        owner: { id: eceUsers.id, displayName: eceUsers.displayName, email: eceUsers.email },
      })
      .from(emailAccounts)
      .innerJoin(emailDomains, and(eq(emailAccounts.domainId, emailDomains.id), eq(emailDomains.tenantId, tenant.id)))
      .leftJoin(eceUsers, eq(emailAccounts.ownerUserId, eceUsers.id))
      .where(and(...whereParts))
      .orderBy(desc(emailAccounts.createdAt))
      .limit(limit)
      .offset(offset);

    const countRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailAccounts)
      .where(and(...whereParts));
    const total = countRows?.[0]?.count ?? 0;

    res.json({ ok: true, items, pagination: { total, limit, offset } });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list accounts" });
  }
});

router.post("/email/accounts", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });
    const adminUser = req.adminUser ?? null;

    const domainId = parseIntSafe(req.body?.domainId);
    if (!domainId) return res.status(400).json({ message: "domainId required" });

    const domainRow = await db.query.emailDomains.findFirst({
      where: and(eq(emailDomains.id, domainId), eq(emailDomains.tenantId, tenant.id)),
    });
    if (!domainRow) return res.status(404).json({ message: "Domain not found" });

    const localPart = normalizeLocalPart(req.body?.localPart ?? req.body?.local_part ?? "");
    if (!isValidLocalPart(localPart)) {
      return res.status(400).json({ message: "Invalid local-part" });
    }

    const address = `${localPart}@${domainRow.domain}`.toLowerCase();
    const existing = await db.query.emailAccounts.findFirst({
      where: and(eq(emailAccounts.tenantId, tenant.id), eq(emailAccounts.address, address)),
      columns: { id: true },
    });
    if (existing) {
      const suggestions: string[] = [];
      for (let i = 2; i <= 6; i += 1) suggestions.push(`${localPart}${i}@${domainRow.domain}`.toLowerCase());
      return res.status(409).json({ message: "Email address already exists", suggestions });
    }

    const ownerUserId = parseIntSafe(req.body?.ownerUserId ?? req.body?.owner_user_id);
    const companyId = parseIntSafe(req.body?.companyId ?? req.body?.company_id);

    const passwordInput = String(req.body?.password || "").trim();
    const passwordProvided = Boolean(passwordInput);
    const password = passwordProvided ? passwordInput : randomPassword();

    const quotaInput = req.body?.quota ?? req.body?.quotaMb ?? req.body?.quota_mb;
    const quotaParsedFromInput = parseQuotaInput(quotaInput);
    if (quotaInput != null && String(quotaInput).trim() && !quotaParsedFromInput) {
      return res.status(400).json({ message: "Invalid quota (use e.g. 2G or 2048M)" });
    }
    const quotaParsed = quotaParsedFromInput ?? ({ quota: "2G", quotaMb: 2048 } as const);

    const now = new Date();
    const [created] = await db
      .insert(emailAccounts)
      .values({
        tenantId: tenant.id,
        companyId: companyId ?? null,
        ownerUserId: ownerUserId ?? null,
        address,
        localPart,
        domainId: domainRow.id,
        status: "active",
        quotaMb: quotaParsed.quotaMb,
        metadata: {
          provision: {
            provider: "docker-mailserver",
            attemptedAt: now.toISOString(),
            quota: { requested: quotaParsed.quota, quotaMb: quotaParsed.quotaMb },
            passwordProvided,
          },
        },
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!isMailserverSetupAvailable()) {
      await db
        .update(emailAccounts)
        .set({
          status: "provision_failed",
          metadata: { ...(created.metadata as any), provision: { provider: "docker-mailserver", error: "docker socket missing" } },
          updatedAt: new Date(),
        })
        .where(eq(emailAccounts.id, created.id));

      await writeEmailAuditLog({
        tenantId: tenant.id,
        actorUserId: adminUser?.id ?? null,
        action: "email_account.create_failed",
        entityType: "email_account",
        entityId: created.id,
        newState: { address, status: "provision_failed" },
        metadata: { reason: "mailserver_setup_unavailable" },
      });

      return res.status(503).json({
        message: "Mail provisioning is not available on this server (docker socket missing).",
        account: created,
      });
    }

    // Provision on docker-mailserver.
    // Safety rule: if the mailbox already exists and the admin did NOT provide a password,
    // do not overwrite/reset it implicitly. Ask for an explicit password to import/reset.
    let setup = await mailserverEmailAdd(address, password);
    let setupMode: "add" | "update_existing" | "failed" = setup.ok ? "add" : "failed";
    if (!setup.ok) {
      const errText = `${setup.stderr || ""} ${setup.stdout || ""}`.toLowerCase();
      const alreadyExists = errText.includes("already exists");
      if (alreadyExists && !passwordProvided) {
        await db.delete(emailAccounts).where(eq(emailAccounts.id, created.id));
        return res.status(409).json({
          message: "Mailbox already exists on the mail server. Provide a password to import/reset it.",
          address,
        });
      }

      const update = await mailserverEmailUpdate(address, password);
      if (update.ok) {
        setup = update;
        setupMode = "update_existing";
      }
    }

    const quotaSetup = setup.ok ? await mailserverQuotaSet(address, quotaParsed.quota) : null;

    const imap = setup.ok
      ? await verifyImapLoginAfterMailserverChange({ user: address, password })
      : { ok: false, host: "", port: 0, message: setup.stderr || setup.stdout || "setup failed" };

    const status = setup.ok && imap.ok && (quotaSetup?.ok ?? true) ? "active" : "provision_failed";
    const updatedAt = new Date();
    const [updated] = await db
      .update(emailAccounts)
      .set({
        status,
        metadata: {
          ...(created.metadata as any),
          provision: {
            provider: "docker-mailserver",
            setup: { ok: setup.ok, exitCode: setup.exitCode, stderr: setup.stderr || null, mode: setupMode },
            quota: quotaSetup
              ? {
                  requested: quotaParsed.quota,
                  quotaMb: quotaParsed.quotaMb,
                  ok: quotaSetup.ok,
                  exitCode: quotaSetup.exitCode,
                  stderr: quotaSetup.stderr || null,
                }
              : { requested: quotaParsed.quota, quotaMb: quotaParsed.quotaMb, ok: false, exitCode: null, stderr: null },
            imap: { ok: imap.ok, message: imap.message },
            completedAt: updatedAt.toISOString(),
          },
        },
        updatedAt,
      })
      .where(eq(emailAccounts.id, created.id))
      .returning();

    await writeEmailAuditLog({
      tenantId: tenant.id,
      actorUserId: adminUser?.id ?? null,
      action: status === "active" ? "email_account.create" : "email_account.create_failed",
      entityType: "email_account",
      entityId: created.id,
      newState: { address, status },
      metadata: { setupOk: setup.ok, imapOk: imap.ok, quotaOk: quotaSetup?.ok ?? null, setupMode },
    });

    res.status(status === "active" ? 201 : 207).json({
      ok: status === "active",
      account: updated,
      tempPassword: passwordProvided ? null : password,
      setup,
      quota: quotaSetup,
      imap,
    });
  } catch (err: any) {
    res.status(err?.status || 500).json({ message: err?.message || "Failed to create account" });
  }
});

const passwordResetBuckets = new Map<string, { count: number; resetAt: number }>();
function resetRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const row = passwordResetBuckets.get(key);
  if (!row || row.resetAt <= now) {
    passwordResetBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (row.count >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((row.resetAt - now) / 1000));
    const e = new Error("Rate limit exceeded");
    (e as any).status = 429;
    (e as any).retryAfterSec = retryAfterSec;
    throw e;
  }
  row.count += 1;
}

router.post("/email/accounts/:id/reset-password", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });
    const adminUser = req.adminUser ?? null;

    const id = parseIntSafe(req.params?.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    resetRateLimit(`tenant:${tenant.id}:account:${id}`, 3, 60 * 60_000);
    if (adminUser?.id) resetRateLimit(`tenant:${tenant.id}:actor:${adminUser.id}`, 10, 60 * 60_000);

    const account = await db.query.emailAccounts.findFirst({
      where: and(eq(emailAccounts.id, id), eq(emailAccounts.tenantId, tenant.id)),
    });
    if (!account) return res.status(404).json({ message: "Account not found" });

    if (!isMailserverSetupAvailable()) {
      return res.status(503).json({ message: "Mail provisioning is not available on this server (docker socket missing)." });
    }

    const password = randomPassword();
    let setup = await mailserverEmailUpdate(account.address, password);
    if (!setup.ok) {
      const add = await mailserverEmailAdd(account.address, password);
      if (add.ok) setup = add;
    }
    const imap = setup.ok
      ? await verifyImapLoginAfterMailserverChange({ user: account.address, password })
      : { ok: false, host: "", port: 0, message: setup.stderr || setup.stdout || "setup failed" };

    const status = setup.ok && imap.ok ? "active" : "provision_failed";
    const updatedAt = new Date();
    const [updated] = await db
      .update(emailAccounts)
      .set({
        status,
        metadata: {
          ...(account.metadata as any),
          lastPasswordResetAt: updatedAt.toISOString(),
          provision: {
            provider: "docker-mailserver",
            setup: { ok: setup.ok, exitCode: setup.exitCode, stderr: setup.stderr || null },
            imap: { ok: imap.ok, message: imap.message },
            completedAt: updatedAt.toISOString(),
          },
        },
        updatedAt,
      })
      .where(eq(emailAccounts.id, id))
      .returning();

    await writeEmailAuditLog({
      tenantId: tenant.id,
      actorUserId: adminUser?.id ?? null,
      action: "email_account.reset_password",
      entityType: "email_account",
      entityId: id,
      newState: { address: account.address, status },
      metadata: { setupOk: setup.ok, imapOk: imap.ok },
    });

    res.status(status === "active" ? 200 : 207).json({
      ok: status === "active",
      account: updated,
      tempPassword: password,
      setup,
      imap,
    });
  } catch (err: any) {
    const retryAfterSec = err?.retryAfterSec;
    if (retryAfterSec) res.setHeader("Retry-After", String(retryAfterSec));
    res.status(err?.status || 500).json({ message: err?.message || "Failed to reset password" });
  }
});

router.patch("/email/accounts/:id", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });
    const adminUser = req.adminUser ?? null;

    const id = parseIntSafe(req.params?.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    const account = await db.query.emailAccounts.findFirst({
      where: and(eq(emailAccounts.id, id), eq(emailAccounts.tenantId, tenant.id)),
    });
    if (!account) return res.status(404).json({ message: "Account not found" });

    const nextStatus = String(req.body?.status || "").trim().toLowerCase();
    const nextOwnerUserId = req.body?.ownerUserId ?? req.body?.owner_user_id;
    const nextCompanyId = req.body?.companyId ?? req.body?.company_id;

    const patch: any = { updatedAt: new Date() };
    if (Number.isFinite(Number(nextOwnerUserId))) patch.ownerUserId = Number(nextOwnerUserId);
    if (Number.isFinite(Number(nextCompanyId))) patch.companyId = Number(nextCompanyId);

    let tempPassword: string | null = null;
    let setup: any = null;
    let imap: any = null;

    if (nextStatus === "disabled") {
      if (!isMailserverSetupAvailable()) return res.status(503).json({ message: "Mail provisioning unavailable (docker socket missing)." });
      setup = await mailserverEmailDelete(account.address);
      patch.status = setup.ok ? "disabled" : "provision_failed";
    } else if (nextStatus === "active") {
      if (!isMailserverSetupAvailable()) return res.status(503).json({ message: "Mail provisioning unavailable (docker socket missing)." });
      tempPassword = randomPassword();
      setup = await mailserverEmailAdd(account.address, tempPassword);
      if (!setup.ok) {
        const update = await mailserverEmailUpdate(account.address, tempPassword);
        if (update.ok) setup = update;
      }
      imap = setup.ok
        ? await verifyImapLoginAfterMailserverChange({ user: account.address, password: tempPassword })
        : { ok: false, host: "", port: 0, message: setup.stderr || setup.stdout || "setup failed" };
      patch.status = setup.ok && imap.ok ? "active" : "provision_failed";
    } else if (nextStatus) {
      return res.status(400).json({ message: "Unsupported status" });
    }

    const [updated] = await db.update(emailAccounts).set(patch).where(eq(emailAccounts.id, id)).returning();

    await writeEmailAuditLog({
      tenantId: tenant.id,
      actorUserId: adminUser?.id ?? null,
      action: "email_account.update",
      entityType: "email_account",
      entityId: id,
      previousState: { status: account.status, ownerUserId: account.ownerUserId, companyId: account.companyId },
      newState: { status: updated.status, ownerUserId: updated.ownerUserId, companyId: updated.companyId },
      metadata: { setupOk: setup?.ok ?? null, imapOk: imap?.ok ?? null },
    });

    res.json({ ok: true, account: updated, tempPassword, setup, imap });
  } catch (err: any) {
    res.status(err?.status || 500).json({ message: err?.message || "Failed to update account" });
  }
});

router.get("/email/aliases", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const limit = parseLimit(req.query?.limit, 500, 2000);
    const q = String(req.query?.q || "").trim();
    const whereParts: any[] = [eq(emailAliases.tenantId, tenant.id)];
    if (q) {
      whereParts.push(
        sql`(${emailAliases.sourceAddress} ILIKE ${"%" + q + "%"} OR ${emailAliases.destination} ILIKE ${"%" + q + "%"})`,
      );
    }

    const rows = await db
      .select()
      .from(emailAliases)
      .where(and(...whereParts))
      .orderBy(asc(emailAliases.sourceAddress), asc(emailAliases.destination), desc(emailAliases.createdAt))
      .limit(limit);

    const grouped = new Map<
      string,
      { sourceAddress: string; destinations: string[]; count: number; latestCreatedAt: string | null }
    >();
    for (const row of rows) {
      const sourceAddress = String(row.sourceAddress || "").toLowerCase();
      if (!sourceAddress) continue;
      const destination = String(row.destination || "").toLowerCase();
      const createdAt =
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : row.createdAt
            ? new Date(row.createdAt as any).toISOString()
            : null;
      const existing =
        grouped.get(sourceAddress) ||
        ({ sourceAddress, destinations: [], count: 0, latestCreatedAt: null } satisfies {
          sourceAddress: string;
          destinations: string[];
          count: number;
          latestCreatedAt: string | null;
        });
      if (destination && !existing.destinations.includes(destination)) existing.destinations.push(destination);
      existing.count += 1;
      if (createdAt && (!existing.latestCreatedAt || createdAt > existing.latestCreatedAt)) {
        existing.latestCreatedAt = createdAt;
      }
      grouped.set(sourceAddress, existing);
    }

    res.json({
      ok: true,
      items: rows,
      groups: Array.from(grouped.values()).sort((a, b) => a.sourceAddress.localeCompare(b.sourceAddress)),
      pagination: { limit, total: rows.length },
    });
  } catch (err: any) {
    res.status(err?.status || 500).json({ message: err?.message || "Failed to load aliases" });
  }
});

router.post("/email/aliases", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });
    const adminUser = req.adminUser ?? null;

    const sourceAddress = String(req.body?.sourceAddress || req.body?.source || "").trim().toLowerCase();
    const destination = String(req.body?.destination || "").trim().toLowerCase();
    if (!sourceAddress || !sourceAddress.includes("@")) return res.status(400).json({ message: "sourceAddress required" });
    if (!destination || !destination.includes("@")) return res.status(400).json({ message: "destination required" });

    const sourceDomain = normalizeDomain(sourceAddress.split("@")[1] || "");
    if (!sourceDomain) return res.status(400).json({ message: "Invalid source domain" });

    const domainAllowed = await db.query.emailDomains.findFirst({
      where: and(eq(emailDomains.tenantId, tenant.id), eq(emailDomains.domain, sourceDomain)),
      columns: { id: true },
    });
    if (!domainAllowed) return res.status(403).json({ message: "Source domain not allowed for this tenant" });

    if (!isMailserverSetupAvailable()) return res.status(503).json({ message: "Mail provisioning unavailable (docker socket missing)." });

    const setup = await mailserverAliasAdd(sourceAddress, destination);
    if (!setup.ok) return res.status(500).json({ message: setup.stderr || setup.stdout || "Alias provisioning failed" });

    const sourceAccountId = parseIntSafe(req.body?.sourceAccountId ?? req.body?.source_account_id);
    const now = new Date();
    const [row] = await db
      .insert(emailAliases)
      .values({
        tenantId: tenant.id,
        sourceAccountId: sourceAccountId ?? null,
        sourceAddress,
        destination,
        metadata: { provisionedAt: now.toISOString() },
        createdAt: now,
      })
      .returning();

    await writeEmailAuditLog({
      tenantId: tenant.id,
      actorUserId: adminUser?.id ?? null,
      action: "email_alias.create",
      entityType: "email_alias",
      entityId: row.id,
      newState: { sourceAddress, destination },
    });

    res.status(201).json({ ok: true, alias: row });
  } catch (err: any) {
    res.status(err?.status || 500).json({ message: err?.message || "Failed to create alias" });
  }
});

router.get("/email/work-orders", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const limit = parseLimit(req.query?.limit, 200, 2000);

    const rows = await db
      .select({
        workOrder: emailWorkOrders,
        thread: {
          id: emailThreads.id,
          subject: emailThreads.subject,
          lastMessageAt: emailThreads.lastMessageAt,
        },
        mailbox: {
          id: agentMailboxes.id,
          agentKey: agentMailboxes.agentKey,
          email: agentMailboxes.email,
        },
      })
      .from(emailWorkOrders)
      .leftJoin(emailThreads, and(eq(emailWorkOrders.threadId, emailThreads.id), eq(emailThreads.tenantId, tenant.id)))
      .leftJoin(
        agentMailboxes,
        and(eq(emailWorkOrders.mailboxId, agentMailboxes.id), eq(agentMailboxes.tenantId, tenant.id)),
      )
      .where(and(eq(emailWorkOrders.tenantId, tenant.id), sql`${emailWorkOrders.status} <> 'replied'`))
      .orderBy(asc(emailWorkOrders.dueAt))
      .limit(limit);

    res.json({ ok: true, items: rows });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list work orders" });
  }
});

router.get("/email/threads", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const limit = parseLimit(req.query?.limit, 200, 2000);
    const offset = Math.max(parseIntSafe(req.query?.offset) ?? 0, 0);

    const agentKeyFilter = req.query?.agentKey ? normalizeAgentKey(String(req.query.agentKey)) : null;
    const mailboxIdFilter = parseIntSafe(req.query?.mailboxId);
    const q = String(req.query?.q || "").trim().slice(0, 160);

    const whereParts: any[] = [eq(emailThreads.tenantId, tenant.id)];
    if (agentKeyFilter) whereParts.push(eq(emailThreads.agentKey, agentKeyFilter));
    if (mailboxIdFilter) whereParts.push(eq(emailThreads.mailboxId, mailboxIdFilter));
    if (q) {
      whereParts.push(
        sql`(${emailThreads.subject} ILIKE ${"%" + q + "%"} OR ${emailThreads.subjectNorm} ILIKE ${"%" + q + "%"})`,
      );
    }

    const items = await db
      .select({
        thread: emailThreads,
        mailbox: {
          id: agentMailboxes.id,
          agentKey: agentMailboxes.agentKey,
          email: agentMailboxes.email,
        },
        workOrder: emailWorkOrders,
      })
      .from(emailThreads)
      .leftJoin(agentMailboxes, and(eq(emailThreads.mailboxId, agentMailboxes.id), eq(agentMailboxes.tenantId, tenant.id)))
      .leftJoin(
        emailWorkOrders,
        and(
          eq(emailWorkOrders.threadId, emailThreads.id),
          eq(emailWorkOrders.tenantId, tenant.id),
          sql`${emailWorkOrders.status} <> 'replied'`,
        ),
      )
      .where(and(...whereParts))
      .orderBy(desc(emailThreads.lastMessageAt))
      .limit(limit)
      .offset(offset);

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list threads" });
  }
});

router.post("/email/index", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const agentKeyRaw = req.body?.agentKey ?? req.body?.agent_id ?? req.body?.agentId ?? req.query?.agentKey ?? null;
    const agentKey = agentKeyRaw ? normalizeAgentKey(String(agentKeyRaw)) : null;

    const limitPerMailbox = parseLimit(req.body?.limitPerMailbox ?? req.query?.limitPerMailbox, 250, 2000);

    const result = await runMailIndexer({
      tenantId: tenant.id,
      agentKey,
      limitPerMailbox,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to index mail" });
  }
});

router.post("/tenants/:tenantId/agents/:agentId/mailbox", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const tenantId = parseIntSafe(req.params?.tenantId);
    if (!tenantId) return res.status(400).json({ message: "Invalid tenantId" });
    if (tenantId !== tenant.id) {
      return res.status(409).json({ message: `Tenant mismatch (host=${tenant.id}, param=${tenantId})` });
    }

    const agentRaw = String(req.params?.agentId || "").trim();
    if (!agentRaw) return res.status(400).json({ message: "agentId required" });

    const domain = await resolveTenantMailDomain({
      id: tenant.id,
      key: tenant.key,
      domains: tenant.domains,
    });
    if (!domain) return res.status(400).json({ message: "No mail domain configured for this tenant" });
    const maildirBase = (process.env.MAILDIR_BASE || "/var/vmail").trim();

    const result = await provisionAgentMailbox({
      tenantId: tenant.id,
      tenantKey: tenant.key,
      agentKey: agentRaw,
      domain,
      maildirBase,
    });

    res.status(result.created ? 201 : 200).json({ ok: true, ...result });
  } catch (err: any) {
    const msg = err?.message || "Failed to provision mailbox";
    const status = msg.includes("MAIL_DATABASE_URL") ? 503 : 500;
    res.status(status).json({ message: msg });
  }
});

router.post("/tenants/:tenantId/mailboxes/bulk-provision", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const tenantId = parseIntSafe(req.params?.tenantId);
    if (!tenantId) return res.status(400).json({ message: "Invalid tenantId" });
    if (tenantId !== tenant.id) {
      return res.status(409).json({ message: `Tenant mismatch (host=${tenant.id}, param=${tenantId})` });
    }

    const requested = Array.isArray(req.body?.agents) ? req.body.agents : null;
    const agentKeys = (requested?.length ? requested : DEFAULT_MAIL_AGENT_KEYS)
      .map((a: any) => String(a || "").trim())
      .filter(Boolean);
    if (!agentKeys.length) return res.status(400).json({ message: "No agents to provision" });

    const domain = await resolveTenantMailDomain({
      id: tenant.id,
      key: tenant.key,
      domains: tenant.domains,
    });
    if (!domain) return res.status(400).json({ message: "No mail domain configured for this tenant" });
    const maildirBase = (process.env.MAILDIR_BASE || "/var/vmail").trim();

    const items = [];
    for (const agentKey of agentKeys) {
      // eslint-disable-next-line no-await-in-loop
      const item = await provisionAgentMailbox({
        tenantId: tenant.id,
        tenantKey: tenant.key,
        agentKey,
        domain,
        maildirBase,
      });
      items.push(item);
    }

    res.status(200).json({ ok: true, items });
  } catch (err: any) {
    const msg = err?.message || "Failed to bulk provision mailboxes";
    const status = msg.includes("MAIL_DATABASE_URL") ? 503 : 500;
    res.status(status).json({ message: msg });
  }
});

router.post("/mailboxes/:mailboxId/disable", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const mailboxId = parseIntSafe(req.params?.mailboxId);
    if (!mailboxId) return res.status(400).json({ message: "Invalid mailboxId" });

    const mailbox = await db.query.agentMailboxes.findFirst({
      where: and(eq(agentMailboxes.id, mailboxId), eq(agentMailboxes.tenantId, tenant.id)),
    });
    if (!mailbox) return res.status(404).json({ message: "Mailbox not found" });

    const now = new Date();
    await db
      .update(agentMailboxes)
      .set({ isEnabled: false, updatedAt: now })
      .where(eq(agentMailboxes.id, mailboxId));

    if (mailbox.mailUserId) {
      try {
        await setVirtualUserEnabled(mailbox.mailUserId, false);
      } catch (err: any) {
        return res.json({
          ok: true,
          warning: String(err?.message || "Mail DB disable failed; platform mailbox disabled only"),
        });
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    const msg = err?.message || "Failed to disable mailbox";
    const status = msg.includes("MAIL_DATABASE_URL") ? 503 : 500;
    res.status(status).json({ message: msg });
  }
});

router.get("/tenants/:tenantId/mailboxes", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const tenantId = parseIntSafe(req.params?.tenantId);
    if (!tenantId) return res.status(400).json({ message: "Invalid tenantId" });
    if (tenantId !== tenant.id) {
      return res.status(409).json({ message: `Tenant mismatch (host=${tenant.id}, param=${tenantId})` });
    }

    const items = await db.query.agentMailboxes.findMany({
      where: eq(agentMailboxes.tenantId, tenant.id),
      orderBy: (t, { asc }) => [asc(t.agentKey)],
    });
    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list mailboxes" });
  }
});

router.get("/tenants/:tenantId/agents/:agentId/mailbox", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const tenantId = parseIntSafe(req.params?.tenantId);
    if (!tenantId) return res.status(400).json({ message: "Invalid tenantId" });
    if (tenantId !== tenant.id) {
      return res.status(409).json({ message: `Tenant mismatch (host=${tenant.id}, param=${tenantId})` });
    }

    const agentKey = normalizeAgentKey(String(req.params?.agentId || ""));
    if (!agentKey) return res.status(400).json({ message: "agentId required" });

    const mailbox = await db.query.agentMailboxes.findFirst({
      where: and(eq(agentMailboxes.tenantId, tenant.id), eq(agentMailboxes.agentKey, agentKey)),
    });
    res.json({ ok: true, mailbox: mailbox ?? null });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch mailbox" });
  }
});

router.get("/mailboxes/:mailboxId/threads", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const mailboxId = parseIntSafe(req.params?.mailboxId);
    if (!mailboxId) return res.status(400).json({ message: "Invalid mailboxId" });

    const mailbox = await db.query.agentMailboxes.findFirst({
      where: and(eq(agentMailboxes.id, mailboxId), eq(agentMailboxes.tenantId, tenant.id)),
      columns: { id: true },
    });
    if (!mailbox) return res.status(404).json({ message: "Mailbox not found" });

    const limit = parseLimit(req.query?.limit, 50, 200);
    const offset = Math.max(parseIntSafe(req.query?.offset) ?? 0, 0);

    const items = await db.query.emailThreads.findMany({
      where: and(eq(emailThreads.mailboxId, mailboxId), eq(emailThreads.tenantId, tenant.id)),
      orderBy: [desc(emailThreads.lastMessageAt)],
      limit,
      offset,
    });

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list threads" });
  }
});

router.get("/mailboxes/:mailboxId/work-orders", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const mailboxId = parseIntSafe(req.params?.mailboxId);
    if (!mailboxId) return res.status(400).json({ message: "Invalid mailboxId" });

    const mailbox = await db.query.agentMailboxes.findFirst({
      where: and(eq(agentMailboxes.id, mailboxId), eq(agentMailboxes.tenantId, tenant.id)),
      columns: { id: true },
    });
    if (!mailbox) return res.status(404).json({ message: "Mailbox not found" });

    const limit = parseLimit(req.query?.limit, 200, 1000);

    const rows = await db
      .select({
        workOrder: emailWorkOrders,
        thread: {
          id: emailThreads.id,
          subject: emailThreads.subject,
          lastMessageAt: emailThreads.lastMessageAt,
        },
      })
      .from(emailWorkOrders)
      .leftJoin(emailThreads, eq(emailWorkOrders.threadId, emailThreads.id))
      .where(
        and(
          eq(emailWorkOrders.tenantId, tenant.id),
          eq(emailWorkOrders.mailboxId, mailboxId),
          sql`${emailWorkOrders.status} <> 'replied'`,
        ),
      )
      .orderBy(asc(emailWorkOrders.dueAt))
      .limit(limit);

    res.json({ ok: true, items: rows });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list work orders" });
  }
});

router.get("/threads/:threadId/messages", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: "tenant required" });

    const threadId = parseIntSafe(req.params?.threadId);
    if (!threadId) return res.status(400).json({ message: "Invalid threadId" });

    const thread = await db.query.emailThreads.findFirst({
      where: and(eq(emailThreads.id, threadId), eq(emailThreads.tenantId, tenant.id)),
      columns: { id: true },
    });
    if (!thread) return res.status(404).json({ message: "Thread not found" });

    const limit = parseLimit(req.query?.limit, 200, 500);
    const offset = Math.max(parseIntSafe(req.query?.offset) ?? 0, 0);

    const items = await db.query.emailMessages.findMany({
      where: and(eq(emailMessages.threadId, threadId), eq(emailMessages.tenantId, tenant.id)),
      orderBy: [asc(emailMessages.createdAt)],
      limit,
      offset,
    });

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to list messages" });
  }
});

export default router;
