import { createHash, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import pg from "pg";

const { Pool } = pg;

const COMPANY_ADMIN_EMAIL = "exportunitygroup@gmail.com";
const COMPANY_ADMIN_NAME = "Exportunity Group";
const COMPANY_TENANT_KEY = "exportunity";
const COMPANY_TENANT_ROLE = "TENANT_ADMIN";
const DEFAULT_SETUP_TTL_HOURS = 24;
const MAX_SETUP_TTL_HOURS = 168;
const PASSWORD_HASH_ROUNDS = 12;

function usage() {
  return [
    "Usage:",
    "  node scripts/grant-exportunity-company-admin.mjs --send-setup-email",
    "  node scripts/grant-exportunity-company-admin.mjs --verify-only",
    "",
    "Options:",
    "  --send-setup-email  Send a one-time password setup link to the fixed company address.",
    "  --verify-only       Read-only verification; do not change the database or send email.",
    "  --ttl-hours <1-168> Setup-link lifetime (default: 24 hours).",
    `  --email <address>   Compatibility guard; only ${COMPANY_ADMIN_EMAIL} is accepted.`,
    "  --help              Show this help.",
  ].join("\n");
}

function uniq(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function asArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function truthy(value) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function parseOptions(argv = process.argv.slice(2)) {
  const options = {
    help: false,
    sendSetupEmail: false,
    verifyOnly: false,
    ttlHours: DEFAULT_SETUP_TTL_HOURS,
    requestedEmail: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--send-setup-email") {
      options.sendSetupEmail = true;
      continue;
    }
    if (arg === "--verify-only") {
      options.verifyOnly = true;
      continue;
    }
    if (arg === "--email") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--email requires a value");
      options.requestedEmail = String(value).trim().toLowerCase();
      index += 1;
      continue;
    }
    if (arg === "--ttl-hours") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--ttl-hours requires a value");
      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_SETUP_TTL_HOURS) {
        throw new Error(`--ttl-hours must be an integer from 1 to ${MAX_SETUP_TTL_HOURS}`);
      }
      options.ttlHours = parsed;
      index += 1;
      continue;
    }
    throw new Error(`Unsupported option: ${arg}`);
  }

  if (options.sendSetupEmail && options.verifyOnly) {
    throw new Error("--send-setup-email and --verify-only cannot be combined");
  }

  const envTtl = String(process.env.COMPANY_ADMIN_SETUP_TTL_HOURS || "").trim();
  if (envTtl && !argv.includes("--ttl-hours")) {
    const parsed = Number.parseInt(envTtl, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_SETUP_TTL_HOURS) {
      throw new Error(`COMPANY_ADMIN_SETUP_TTL_HOURS must be an integer from 1 to ${MAX_SETUP_TTL_HOURS}`);
    }
    options.ttlHours = parsed;
  }

  return options;
}

function resolveCompanyAdminEmail(requestedEmail) {
  const configured = String(process.env.EXPORTUNITY_COMPANY_ADMIN_EMAIL || COMPANY_ADMIN_EMAIL)
    .trim()
    .toLowerCase();
  const requested = String(requestedEmail || configured).trim().toLowerCase();
  if (configured !== COMPANY_ADMIN_EMAIL || requested !== COMPANY_ADMIN_EMAIL) {
    throw new Error(`This command only grants the approved company identity ${COMPANY_ADMIN_EMAIL}.`);
  }
  return COMPANY_ADMIN_EMAIL;
}

function resolveSetupBaseUrl() {
  const base =
    String(process.env.PASSWORD_SETUP_BASE_URL || "").trim() ||
    String(process.env.APP_BASE_URL || "").trim() ||
    String(process.env.DOMAIN_BASE_URL || "").trim() ||
    String(process.env.PUBLIC_BASE_URL || "").trim() ||
    "https://exportunity.net";
  return base.replace(/\/+$/, "");
}

function buildSetupLink(rawToken) {
  const url = new URL("/setup-password", resolveSetupBaseUrl());
  url.searchParams.set("token", rawToken);
  return url.toString();
}

function createSmtpTransport() {
  if (truthy(process.env.MAIL_SMTP_SENDMAIL)) {
    return nodemailer.createTransport({
      sendmail: true,
      newline: "unix",
      path: String(process.env.MAIL_SMTP_SENDMAIL_PATH || "").trim() || undefined,
    });
  }

  const host = String(process.env.MAIL_SMTP_HOST || "").trim();
  const port = Number.parseInt(String(process.env.MAIL_SMTP_PORT || "587"), 10);
  const user = String(process.env.MAIL_SMTP_USER || "").trim();
  const pass = String(process.env.MAIL_SMTP_PASS || "").trim();
  const secure = truthy(process.env.MAIL_SMTP_SECURE);
  const allowNoAuth = truthy(process.env.MAIL_SMTP_ALLOW_NO_AUTH);
  const rejectUnauthorized = String(process.env.MAIL_SMTP_TLS_REJECT_UNAUTHORIZED || "").trim() !== "false";

  if (!host) throw new Error("SMTP is not configured: MAIL_SMTP_HOST is missing");
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("SMTP is not configured: MAIL_SMTP_PORT is invalid");
  }
  if (!allowNoAuth && !(user && pass)) {
    throw new Error("SMTP is not configured: authenticated credentials are missing");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    tls: { rejectUnauthorized },
  });
}

function resolveSetupSender() {
  return (
    String(process.env.COMPANY_ADMIN_SETUP_FROM || "").trim() ||
    String(process.env.CONTACT_NOTIFY_FROM || "").trim() ||
    String(process.env.MAIL_FROM_DEFAULT || "").trim() ||
    String(process.env.MAIL_SMTP_USER || "").trim() ||
    "info@exportunity.net"
  );
}

function sanitizeError(error) {
  let message = error instanceof Error ? error.message : String(error || "Unknown failure");
  message = message.replace(/([?&]token=)[^\s&]+/gi, "$1[redacted]");
  message = message.replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s/]+@/gi, "$1[redacted]@");
  for (const secret of [process.env.MAIL_SMTP_PASS, process.env.DATABASE_URL]) {
    const value = String(secret || "").trim();
    if (value) message = message.split(value).join("[redacted]");
  }
  return message;
}

async function sendPasswordSetupEmail({ rawToken, expiresAt }) {
  const setupLink = buildSetupLink(rawToken);
  const transport = createSmtpTransport();
  const info = await transport.sendMail({
    from: resolveSetupSender(),
    to: COMPANY_ADMIN_EMAIL,
    subject: "Set up your Exportunity Group administrator access",
    text: [
      "Exportunity Group administrator access is ready.",
      "",
      "Use this one-time link to choose the company account password:",
      setupLink,
      "",
      `The link expires at ${expiresAt.toISOString()}.`,
      "If you did not expect this message, do not use the link.",
    ].join("\n"),
  });

  const rejected = Array.isArray(info?.rejected)
    ? info.rejected.map((value) => String(value).trim().toLowerCase())
    : [];
  if (rejected.includes(COMPANY_ADMIN_EMAIL)) {
    throw new Error("SMTP rejected the company recipient");
  }
}

async function verifyCompanyControl(pool) {
  const result = await pool.query(
    `select
       t.id as tenant_id,
       u.id as user_id,
       u.role::text as global_role,
       u.roles,
       u.permissions,
       u.current_mode,
       u.is_active,
       u.email_verified,
       exists (
         select 1
           from user_tenant_roles utr
          where utr.tenant_id = t.id
            and utr.user_id = u.id
            and utr.role = $3
       ) as tenant_admin
     from tenants t
     left join ece_users u on lower(u.email) = $2
     where lower(t.key) = $1
     limit 1`,
    [COMPANY_TENANT_KEY, COMPANY_ADMIN_EMAIL, COMPANY_TENANT_ROLE],
  );
  const row = result.rows[0] || null;
  const roles = asArray(row?.roles).map((value) => value.toLowerCase());
  const permissions = asArray(row?.permissions);
  const contactRecipients = parseCsv(process.env.CONTACT_NOTIFY_TO);
  const contactSender = String(process.env.CONTACT_NOTIFY_FROM || "").trim().toLowerCase();
  const checks = {
    tenantPresent: Boolean(row?.tenant_id),
    userPresent: Boolean(row?.user_id),
    globalAdmin:
      String(row?.global_role || "").toLowerCase() === "admin" ||
      roles.includes("admin") ||
      permissions.includes("*"),
    tenantAdmin: row?.tenant_admin === true,
    active: row?.is_active === true,
    emailVerified: row?.email_verified === true,
    complaintsToCompany: contactRecipients.includes(COMPANY_ADMIN_EMAIL),
    complaintSenderConfigured: contactSender === "info@exportunity.net",
  };
  return {
    ok: Object.values(checks).every(Boolean),
    tenant: COMPANY_TENANT_KEY,
    email: COMPANY_ADMIN_EMAIL,
    userId: row?.user_id ? Number(row.user_id) : null,
    checks,
  };
}

async function provisionCompanyAdministrator(pool, { ttlHours, sendSetupEmail }) {
  const client = await pool.connect();
  let userId;
  try {
    await client.query("begin");
    const tenantResult = await client.query(
      "select id from tenants where lower(key) = $1 limit 1",
      [COMPANY_TENANT_KEY],
    );
    const tenantId = Number(tenantResult.rows[0]?.id || 0);
    if (!tenantId) throw new Error(`Tenant '${COMPANY_TENANT_KEY}' was not found`);

    const existingResult = await client.query(
      `select id, roles, permissions, metadata
         from ece_users
        where lower(email) = $1
        limit 1
        for update`,
      [COMPANY_ADMIN_EMAIL],
    );
    const existing = existingResult.rows[0] || null;
    const roles = uniq(["admin", ...asArray(existing?.roles)]);
    const permissions = uniq(["*", ...asArray(existing?.permissions)]);
    const metadata = {
      ...asObject(existing?.metadata),
      companyAdmin: true,
      exportunityAdmin: true,
      mustChangePassword: true,
      updatedBy: "grant-exportunity-company-admin",
      companyAdminProvisionedAt: new Date().toISOString(),
    };

    if (existing?.id) {
      userId = Number(existing.id);
      await client.query(
        `update ece_users
            set display_name = $2,
                role = 'admin',
                roles = $3::jsonb,
                permissions = $4::jsonb,
                current_mode = 'admin',
                is_active = true,
                email_verified = true,
                metadata = $5::jsonb,
                updated_at = now()
          where id = $1`,
        [userId, COMPANY_ADMIN_NAME, JSON.stringify(roles), JSON.stringify(permissions), JSON.stringify(metadata)],
      );
    } else {
      const bootstrapPassword = randomBytes(32).toString("base64url");
      const passwordHash = await bcrypt.hash(bootstrapPassword, PASSWORD_HASH_ROUNDS);
      const inserted = await client.query(
        `insert into ece_users (
           email, password_hash, display_name, role, roles, permissions,
           current_mode, buyer_type, is_active, email_verified, metadata, created_at, updated_at
         ) values ($1, $2, $3, 'admin', $4::jsonb, $5::jsonb, 'admin', 'retail', true, true, $6::jsonb, now(), now())
         returning id`,
        [
          COMPANY_ADMIN_EMAIL,
          passwordHash,
          COMPANY_ADMIN_NAME,
          JSON.stringify(roles),
          JSON.stringify(permissions),
          JSON.stringify({ ...metadata, createdBy: "grant-exportunity-company-admin" }),
        ],
      );
      userId = Number(inserted.rows[0]?.id || 0);
      if (!userId) throw new Error("The company administrator could not be created");
    }

    await client.query(
      `insert into user_tenant_roles (tenant_id, user_id, role, created_at)
       values ($1, $2, $3, now())
       on conflict (tenant_id, user_id, role) do nothing`,
      [tenantId, userId, COMPANY_TENANT_ROLE],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  let setupEmail = { requested: false, accepted: false, expiresAt: null };
  if (sendSetupEmail) {
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    let tokenId = null;
    const tokenClient = await pool.connect();
    try {
      await tokenClient.query("begin");
      await tokenClient.query(
        "update password_setup_tokens set used_at = now() where user_id = $1 and used_at is null",
        [userId],
      );
      const created = await tokenClient.query(
        `insert into password_setup_tokens (user_id, token_hash, expires_at, created_at)
         values ($1, $2, $3, now())
         returning id`,
        [userId, tokenHash, expiresAt],
      );
      tokenId = String(created.rows[0]?.id || "");
      if (!tokenId) throw new Error("The one-time setup token could not be stored");
      await tokenClient.query("commit");
    } catch (error) {
      await tokenClient.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      tokenClient.release();
    }

    try {
      await sendPasswordSetupEmail({ rawToken, expiresAt });
      setupEmail = { requested: true, accepted: true, expiresAt: expiresAt.toISOString() };
    } catch (error) {
      await pool
        .query(
          "update password_setup_tokens set used_at = coalesce(used_at, now()) where id = $1 and used_at is null",
          [tokenId],
        )
        .catch(() => undefined);
      throw new Error(`Setup email failed and its one-time token was invalidated: ${sanitizeError(error)}`);
    }
  }

  const verification = await verifyCompanyControl(pool);
  if (!verification.ok) throw new Error("Company administrator verification failed after provisioning");
  return {
    ...verification,
    setupEmail,
  };
}

async function main() {
  const options = parseOptions();
  if (options.help) {
    console.log(usage());
    return;
  }
  resolveCompanyAdminEmail(options.requestedEmail);
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    const result = options.verifyOnly
      ? await verifyCompanyControl(pool)
      : await provisionCompanyAdministrator(pool, options);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`[grant-exportunity-company-admin] failed: ${sanitizeError(error)}`);
    process.exitCode = 1;
  });
}

export {
  COMPANY_ADMIN_EMAIL,
  COMPANY_TENANT_KEY,
  COMPANY_TENANT_ROLE,
  parseOptions,
  resolveCompanyAdminEmail,
  sanitizeError,
  verifyCompanyControl,
};
