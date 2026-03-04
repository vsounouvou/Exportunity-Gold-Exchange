import nodemailer from "nodemailer";
import { and, eq } from "drizzle-orm";
import { db } from "@db";
import { agentMailboxes, emailMessages, emailThreads, tenants } from "@db/schema";
import crypto from "crypto";

function normalizeAgentKey(input: string) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeTenantSlug(input: string) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function agentKeyToMailboxSlug(agentKey: string) {
  return normalizeAgentKey(agentKey).replace(/_/g, ".");
}

function buildMailboxLocalPart(agentKey: string, tenantSlug: string) {
  const agentSlug = agentKeyToMailboxSlug(agentKey);
  const t = normalizeTenantSlug(tenantSlug);
  const maxLocalPart = 63;
  const suffix = `.${t}`;
  const maxAgentPart = Math.max(1, maxLocalPart - suffix.length);
  const trimmedAgent = agentSlug.slice(0, maxAgentPart).replace(/\.+$/g, "");
  const local = `${trimmedAgent}${suffix}`
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "");
  return local.slice(0, maxLocalPart);
}

function defaultMailboxPolicy(agentKey: string) {
  const key = String(agentKey || "").trim().toLowerCase();

  if (key === "marketing") {
    return { dailyOutboundLimit: 30, approvalRequired: true };
  }

  if (key === "seo" || key === "seo_autopilot" || key === "seo.autopilot") {
    return { dailyOutboundLimit: 10, approvalRequired: true };
  }

  if (key === "compliance") {
    return { dailyOutboundLimit: 20, approvalRequired: true };
  }

  if (key === "support") {
    return { dailyOutboundLimit: 100, approvalRequired: false };
  }

  return { dailyOutboundLimit: 0, approvalRequired: false };
}

function normalizeEmailSubject(subject: string | null | undefined) {
  const raw = String(subject || "").trim();
  if (!raw) return "(no-subject)";

  let value = raw;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const next = value.replace(/^\s*(re|fw|fwd)\s*:\s*/i, "");
    if (next === value) break;
    value = next;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 500);

  return normalized || "(no-subject)";
}

function signPlatformHeaders(input: {
  tenantId: number;
  agentKey: string;
  to: string[];
  subject: string;
  sentAtIso: string;
}) {
  const secret = String(process.env.MAIL_PLATFORM_SIGNATURE_SECRET || "").trim();
  if (!secret) {
    throw new Error("MAIL_PLATFORM_SIGNATURE_SECRET must be set");
  }

  const canonical = [
    String(input.tenantId),
    String(input.agentKey || "").trim().toLowerCase(),
    input.to.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean).join(","),
    String(input.subject || "").trim(),
    String(input.sentAtIso || "").trim(),
  ].join("|");

  const signature = crypto.createHmac("sha256", secret).update(canonical).digest("hex");

  return {
    "X-Tenant-ID": String(input.tenantId),
    "X-Agent-ID": String(input.agentKey || ""),
    "X-Platform-Signature": signature,
    "X-Platform-Signature-At": String(input.sentAtIso || ""),
  } as const;
}

function getArgValue(flag: string) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function normalizeCsv(value: string) {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function truthyEnv(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

function createSmtpTransport() {
  const useSendmail = truthyEnv(process.env.MAIL_SMTP_SENDMAIL);
  if (useSendmail) {
    const sendmailPath = String(process.env.MAIL_SMTP_SENDMAIL_PATH || "").trim() || undefined;
    return nodemailer.createTransport({
      sendmail: true,
      newline: "unix",
      path: sendmailPath,
    });
  }

  const host = String(process.env.MAIL_SMTP_HOST || "mail.boursedelor.com").trim();
  const port = Number(process.env.MAIL_SMTP_PORT || 587);
  const user = String(process.env.MAIL_SMTP_USER || "").trim();
  const pass = String(process.env.MAIL_SMTP_PASS || "").trim();
  const secure = String(process.env.MAIL_SMTP_SECURE || "").trim() === "true";
  const rejectUnauthorized = String(process.env.MAIL_SMTP_TLS_REJECT_UNAUTHORIZED || "").trim() !== "false";
  const allowNoAuth = truthyEnv(process.env.MAIL_SMTP_ALLOW_NO_AUTH);

  if (!allowNoAuth && !(user && pass)) {
    throw new Error("SMTP not configured (set MAIL_SMTP_USER/MAIL_SMTP_PASS or MAIL_SMTP_SENDMAIL=true)");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    tls: { rejectUnauthorized },
  });
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

async function ensureMailbox(opts: { tenantId: number; tenantKey: string; agentKey: string; domain: string }) {
  const agentKey = normalizeAgentKey(opts.agentKey);
  if (!agentKey) throw new Error(`Invalid agentKey: ${opts.agentKey}`);

  const localPart = buildMailboxLocalPart(agentKey, opts.tenantKey);
  const email = `${localPart}@${opts.domain}`.toLowerCase();
  const now = new Date();
  const { dailyOutboundLimit, approvalRequired } = defaultMailboxPolicy(agentKey);

  const [row] = await db
    .insert(agentMailboxes)
    .values({
      tenantId: opts.tenantId,
      agentKey,
      email,
      mailUserId: null,
      quotaMb: 2048,
      dailyOutboundLimit,
      approvalRequired,
      isEnabled: true,
      metadata: { seeded: true, localPart, domain: opts.domain },
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [agentMailboxes.tenantId, agentMailboxes.agentKey],
      set: { email, dailyOutboundLimit, approvalRequired, isEnabled: true, updatedAt: now },
    })
    .returning();

  return row;
}

async function main() {
  const to = String(process.env.MAIL_TEST_TO || getArgValue("--to") || "vs@exportunity.net").trim();
  const tenantKey = String(process.env.MAIL_TEST_TENANT || getArgValue("--tenant") || "bdo").trim();
  const domain = String(process.env.MAIL_DOMAIN || "boursedelor.com").trim().toLowerCase();

  const agentsArg = String(process.env.MAIL_TEST_AGENTS || getArgValue("--agents") || "").trim();
  const defaultAgents = ["seo", "support", "procurement"];
  const agentKeys = agentsArg ? normalizeCsv(agentsArg) : defaultAgents;

  if (!to) {
    console.error("[mail-seed] Missing --to");
    process.exit(1);
  }
  if (!agentKeys.length) {
    console.error("[mail-seed] No agents provided");
    process.exit(1);
  }

  let tenant = await db.query.tenants.findFirst({ where: eq(tenants.key, tenantKey as any) });
  if (!tenant) {
    console.error(`[mail-seed] Tenant not found: ${tenantKey}`);
    process.exit(1);
  }

  const transport = createSmtpTransport();

  const results: Array<{ agent: string; ok: boolean; error?: string }> = [];
  for (const rawAgentKey of agentKeys) {
    const agentKey = normalizeAgentKey(rawAgentKey);
    if (!agentKey) {
      results.push({ agent: rawAgentKey, ok: false, error: "invalid agent key" });
      continue;
    }

    const mailbox = await ensureMailbox({ tenantId: tenant.id, tenantKey: tenant.key, agentKey, domain });

    const now = new Date();
    const subject = `Seed conversation - ${agentKey} - ${tenant.key}`;
    const textBody = [
      `Hello Vital,`,
      ``,
      `This is an automated seed email from "${agentKey}" for tenant "${tenant.key}" (${tenant.name}).`,
      `If you received this at ${to}, outbound mail is working.`,
      ``,
      `Time: ${now.toISOString()}`,
      ``,
      `- Exportunity Mail Engine`,
      ``,
    ].join("\n");

    const subjectNorm = normalizeEmailSubject(subject);
    const thread = await getOrCreateThread({
      tenantId: tenant.id,
      agentKey,
      mailboxId: mailbox.id,
      subject,
      subjectNorm,
      lastMessageAt: now,
    });

    const [queued] = await db
      .insert(emailMessages)
      .values({
        tenantId: tenant.id,
        agentKey,
        mailboxId: mailbox.id,
        threadId: thread.id,
        direction: "outbound",
        status: "queued",
        fromEmail: mailbox.email,
        toJson: [to],
        ccJson: [],
        subject,
        textBody: textBody,
        htmlBody: null,
        messageId: null,
        inReplyTo: null,
        referencesJson: [],
        maildirPath: null,
        metadata: { seeded: true },
        createdAt: now,
      })
      .returning();

    try {
      const sentAtIso = now.toISOString();
      const headers = signPlatformHeaders({
        tenantId: tenant.id,
        agentKey,
        to: [to],
        subject,
        sentAtIso,
      });

      const info = await transport.sendMail({
        from: mailbox.email,
        to: [to],
        subject,
        text: textBody,
        headers,
      });

      await db
        .update(emailMessages)
        .set({
          status: "sent",
          messageId: info?.messageId ? String(info.messageId) : null,
        })
        .where(eq(emailMessages.id, queued.id));

      results.push({ agent: agentKey, ok: true });
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err || "send failed");
      await db
        .update(emailMessages)
        .set({
          status: "failed",
          metadata: { seeded: true, error: message },
        })
        .where(eq(emailMessages.id, queued.id));
      results.push({ agent: agentKey, ok: false, error: message });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  console.log(`[mail-seed] done. ok=${ok} fail=${fail}`);
  for (const r of results) {
    console.log(`- ${r.agent}: ${r.ok ? "sent" : `failed (${r.error})`}`);
  }

  if (fail > 0) process.exit(2);
}

main().catch((err) => {
  console.error("[mail-seed] Failed:", err);
  process.exit(1);
});
