import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@db";
import { and, eq } from "drizzle-orm";
import { agentMailboxes } from "@db/schema";
import { AGENT_KEYS } from "../../agents";
import { buildMailboxLocalPart, normalizeAgentKey } from "./agentSlugs";
import { defaultMailboxPolicy } from "./policies";
import { createVirtualUser, ensureVirtualDomain, getVirtualUserByEmail } from "./mailDb";
import { ensureVirtualAlias } from "./mailDb";
import { isMailserverSetupAvailable, mailserverAliasAdd, mailserverEmailAdd, mailserverQuotaSet } from "./mailserverSetup";

function randomPassword() {
  return crypto.randomBytes(18).toString("base64url");
}

function hasMailDbConfigured() {
  return !!String(process.env.MAIL_DATABASE_URL || "").trim();
}

function truthyEnv(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

export function isMailDbAuthoritativeProvisioning() {
  return truthyEnv(process.env.MAIL_DATABASE_AUTHORITATIVE) || truthyEnv(process.env.MAILDB_AUTHORITATIVE);
}

type MailboxProvisionProvider = "maildb" | "docker-mailserver" | "none";

function resolveMailboxProvisionProvider(opts: { mailDbConfigured: boolean; mailserverAvailable: boolean }) {
  const modeRaw = String(process.env.MAIL_MAILBOX_PROVIDER || process.env.MAIL_PROVISION_PROVIDER || "auto")
    .trim()
    .toLowerCase();

  if (modeRaw === "none") return { provider: "none" as const, warning: "mailbox_provisioning_disabled" };
  if (modeRaw === "maildb") {
    if (!opts.mailDbConfigured) return { provider: "none" as const, warning: "maildb_not_configured" };
    return { provider: "maildb" as const, warning: null };
  }
  if (modeRaw === "docker-mailserver") {
    if (!opts.mailserverAvailable) return { provider: "none" as const, warning: "mailserver_setup_unavailable" };
    return { provider: "docker-mailserver" as const, warning: null };
  }

  if (opts.mailserverAvailable) return { provider: "docker-mailserver" as const, warning: null };
  if (opts.mailDbConfigured && isMailDbAuthoritativeProvisioning()) {
    return { provider: "maildb" as const, warning: null };
  }
  if (opts.mailDbConfigured && !isMailDbAuthoritativeProvisioning()) {
    return { provider: "none" as const, warning: "maildb_not_authoritative" };
  }
  return { provider: "none" as const, warning: "mailserver_setup_unavailable" };
}

export type ProvisionMailboxResult = {
  created: boolean; // created (app DB mailbox row) on this call
  email: string;
  mailboxId: number;
  mailUserId: number | null;
  password: string | null; // only when creating a new virtual user (never stored)
  maildir: string;
  mailDbConfigured: boolean;
  policy: { dailyOutboundLimit: number; approvalRequired: boolean };
  delivery: {
    provider: "maildb" | "docker-mailserver" | "none";
    available: boolean;
    exists: boolean;
    createdOnProvider: boolean;
    warning?: string | null;
  };
};

export type EnsureMailboxDeliverableResult = ProvisionMailboxResult["delivery"];

function normalizeProvisionOutput(value: unknown) {
  return String(value || "")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isAlreadyExistsOutput(value: unknown) {
  const text = normalizeProvisionOutput(value).toLowerCase();
  return (
    text.includes("already exists") ||
    text.includes("exists") ||
    text.includes("already an alias") ||  // docker-mailserver alias already exists
    text.includes("is already") ||          // generic "is already X" patterns
    text.includes("already mapped") ||
    text.includes("already assigned") ||
    text.includes("already for recipient")
  );
}

function parseAliasRecipientFromOutput(value: unknown): string | null {
  const output = normalizeProvisionOutput(value);
  if (!output) return null;

  const patterns = [
    /recipient\s+<?([^>\s]+@[^>\s]+)>?/i,
    /destination\s+<?([^>\s]+@[^>\s]+)>?/i,
    /alias\s+for\s+<?([^>\s]+@[^>\s]+)>?/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    const email = match?.[1] ? String(match[1]).trim().toLowerCase() : "";
    if (email && email.includes("@")) return email;
  }

  return null;
}

function parseEmailParts(email: string): { localPart: string; domain: string } {
  const raw = String(email || "").trim().toLowerCase();
  const at = raw.lastIndexOf("@");
  if (at <= 0) throw new Error("Invalid mailbox email");
  const localPart = raw.slice(0, at).trim();
  const domain = raw.slice(at + 1).trim();
  if (!localPart || !domain) throw new Error("Invalid mailbox email");
  return { localPart, domain };
}

export async function ensureMailboxAddressDeliverable(opts: {
  email: string;
  quotaMb?: number | null;
  maildir?: string | null;
  maildirBase?: string | null;
}): Promise<EnsureMailboxDeliverableResult> {
  const email = String(opts.email || "").trim().toLowerCase();
  const { localPart, domain } = parseEmailParts(email);
  const quotaMb =
    Number.isFinite(Number(opts.quotaMb)) && Number(opts.quotaMb) > 0
      ? Math.trunc(Number(opts.quotaMb))
      : 2048;
  const maildirBase = String(opts.maildirBase || "").trim() || "/var/vmail";
  const maildir =
    String(opts.maildir || "").trim() ||
    `${maildirBase}/${domain}/${localPart}/Maildir`;

  const mailDbConfigured = hasMailDbConfigured();
  const mailserverAvailable = isMailserverSetupAvailable();
  const selected = resolveMailboxProvisionProvider({ mailDbConfigured, mailserverAvailable });
  const provider: MailboxProvisionProvider = selected.provider;

  if (provider === "maildb") {
    const existingVirtual = await getVirtualUserByEmail(email);
    if (existingVirtual) {
      return {
        provider: "maildb",
        available: true,
        exists: true,
        createdOnProvider: false,
        warning: selected.warning,
      };
    }

    const domainRow = await ensureVirtualDomain(domain);
    const passwordHash = await bcrypt.hash(randomPassword(), 10);
    await createVirtualUser({
      domainId: domainRow.id,
      email,
      passwordHash,
      quotaMb,
      isEnabled: true,
      maildir,
    });

    return {
      provider: "maildb",
      available: true,
      exists: true,
      createdOnProvider: true,
      warning: selected.warning,
    };
  }

  if (provider === "none") {
    return {
      provider: "none",
      available: false,
      exists: false,
      createdOnProvider: false,
      warning: selected.warning,
    };
  }

  const password = randomPassword();
  const setup = await mailserverEmailAdd(email, password);
  let createdOnProvider = false;
  let exists = false;

  if (setup.ok) {
    createdOnProvider = true;
    exists = true;
  } else {
    const alreadyExists = isAlreadyExistsOutput(setup.stdout) || isAlreadyExistsOutput(setup.stderr);
    if (alreadyExists) {
      exists = true;
    } else {
      throw new Error(
        `Failed to provision mailbox on docker-mailserver: ${String(
          setup.stderr || setup.stdout || "unknown_error",
        )
          .trim()
          .replace(/\u001b\[[0-9;]*m/g, "")
          .replace(/\x1b\[[0-9;]*m/g, "")}`,
      );
    }
  }

  let warning: string | null = null;
  const quotaResult = await mailserverQuotaSet(email, `${quotaMb}M`);
  if (!quotaResult.ok) {
    warning = `quota_set_failed:${String(quotaResult.stderr || quotaResult.stdout || "unknown_error").trim()}`;
  }

  return {
    provider: "docker-mailserver",
    available: true,
    exists,
    createdOnProvider,
    warning,
  };
}

export async function ensureAliasAddressDeliverable(opts: {
  source: string;
  destination: string;
}): Promise<EnsureMailboxDeliverableResult> {
  const source = String(opts.source || "").trim().toLowerCase();
  const destination = String(opts.destination || "").trim().toLowerCase();
  if (!source || !source.includes("@")) throw new Error("Invalid alias source email");
  if (!destination || !destination.includes("@")) throw new Error("Invalid alias destination email");

  const sourceParts = parseEmailParts(source);
  const destParts = parseEmailParts(destination);
  if (!sourceParts || !destParts) throw new Error("Invalid alias email(s)");
  if (sourceParts.domain !== destParts.domain) {
    throw new Error("Alias source and destination must share the same domain");
  }

  const mailDbConfigured = hasMailDbConfigured();
  const mailserverAvailable = isMailserverSetupAvailable();
  const selected = resolveMailboxProvisionProvider({ mailDbConfigured, mailserverAvailable });
  const provider: MailboxProvisionProvider = selected.provider;

  if (provider === "maildb") {
    await ensureVirtualAlias({
      domain: sourceParts.domain,
      source,
      destination,
    });

    return {
      provider: "maildb",
      available: true,
      exists: true,
      createdOnProvider: true,
      warning: selected.warning,
    };
  }

  if (provider === "none") {
    return {
      provider: "none",
      available: false,
      exists: false,
      createdOnProvider: false,
      warning: selected.warning,
    };
  }

  const setup = await mailserverAliasAdd(source, destination);
  if (setup.ok) {
    return {
      provider: "docker-mailserver",
      available: true,
      exists: true,
      createdOnProvider: true,
      warning: selected.warning,
    };
  }

  const alreadyExists = isAlreadyExistsOutput(setup.stdout) || isAlreadyExistsOutput(setup.stderr);
  if (alreadyExists) {
    const existingRecipient =
      parseAliasRecipientFromOutput(setup.stderr) ||
      parseAliasRecipientFromOutput(setup.stdout);
    const mismatch = existingRecipient && existingRecipient !== destination;
    return {
      provider: "docker-mailserver",
      available: true,
      exists: !mismatch,
      createdOnProvider: false,
      warning: mismatch
        ? `alias_destination_mismatch:${existingRecipient}`
        : selected.warning,
    };
  }

  throw new Error(
    `Failed to provision alias on docker-mailserver: ${normalizeProvisionOutput(setup.stderr || setup.stdout || "unknown_error")}`,
  );
}

export async function provisionAgentMailbox(opts: {
  tenantId: number;
  tenantKey: string;
  agentKey: string;
  domain: string;
  maildirBase: string;
}) : Promise<ProvisionMailboxResult> {
  const tenantSlug = String(opts.tenantKey || "").trim();
  if (!tenantSlug) throw new Error("tenant slug required");

  const agentKey = normalizeAgentKey(opts.agentKey);
  if (!agentKey) throw new Error("agent key required");

  const domain = String(opts.domain || "").trim().toLowerCase();
  if (!domain) throw new Error("MAIL_DOMAIN required");

  const localPart = buildMailboxLocalPart(agentKey, tenantSlug);
  const email = `${localPart}@${domain}`.toLowerCase();

  const maildirBase = String(opts.maildirBase || "").trim() || "/var/vmail";
  const maildir = `${maildirBase}/${domain}/${localPart}/Maildir`;

  const existingMailbox = await db.query.agentMailboxes.findFirst({
    where: and(eq(agentMailboxes.tenantId, opts.tenantId), eq(agentMailboxes.agentKey, agentKey)),
  });

  const { dailyOutboundLimit, approvalRequired } = defaultMailboxPolicy(agentKey);
  const now = new Date();

  const [appMailbox] = await db
    .insert(agentMailboxes)
    .values({
      tenantId: opts.tenantId,
      agentKey,
      email,
      mailUserId: existingMailbox?.mailUserId ?? null,
      quotaMb: existingMailbox?.quotaMb ?? 2048,
      dailyOutboundLimit,
      approvalRequired,
      isEnabled: true,
      metadata: {
        ...(typeof existingMailbox?.metadata === "object" && existingMailbox?.metadata ? (existingMailbox.metadata as any) : {}),
        agentKeyKnown: AGENT_KEYS.includes(agentKey as any),
        localPart,
        domain,
        maildir,
      },
      createdAt: existingMailbox?.createdAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [agentMailboxes.tenantId, agentMailboxes.agentKey],
      set: {
        email,
        dailyOutboundLimit,
        approvalRequired,
        isEnabled: true,
        metadata: {
          ...(typeof existingMailbox?.metadata === "object" && existingMailbox?.metadata ? (existingMailbox.metadata as any) : {}),
          agentKeyKnown: AGENT_KEYS.includes(agentKey as any),
          localPart,
          domain,
          maildir,
        },
        updatedAt: now,
      } as any,
    })
    .returning();

  // Mail DB is optional; production defaults to docker-mailserver setup.
  // Always try to ensure the mailbox exists on the active mail provider.
  const delivery = await ensureMailboxAddressDeliverable({
    email,
    quotaMb: existingMailbox?.quotaMb ?? appMailbox.quotaMb ?? 2048,
    maildir,
    maildirBase,
  });

  const mailDbConfigured = delivery.provider === "maildb";
  let mailUserId: number | null = appMailbox.mailUserId ?? null;
  if (mailDbConfigured) {
    const existingVirtual = await getVirtualUserByEmail(email);
    if (existingVirtual && mailUserId !== existingVirtual.id) {
      mailUserId = existingVirtual.id;
      await db.update(agentMailboxes).set({ mailUserId, updatedAt: now }).where(eq(agentMailboxes.id, appMailbox.id));
    }
  }

  const metadata = {
    ...(typeof appMailbox.metadata === "object" && appMailbox.metadata ? (appMailbox.metadata as any) : {}),
    provision: {
      provider: delivery.provider,
      available: delivery.available,
      exists: delivery.exists,
      createdOnProvider: delivery.createdOnProvider,
      warning: delivery.warning ?? null,
      checkedAt: new Date().toISOString(),
    },
  };

  await db.update(agentMailboxes).set({ metadata, updatedAt: new Date() }).where(eq(agentMailboxes.id, appMailbox.id));

  return {
    created: !existingMailbox,
    email,
    mailboxId: appMailbox.id,
    mailUserId,
    password: null,
    maildir,
    mailDbConfigured,
    policy: { dailyOutboundLimit, approvalRequired },
    delivery,
  };
}
