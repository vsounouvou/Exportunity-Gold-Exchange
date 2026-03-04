import nodemailer from "nodemailer";

export type SmtpProbeResult = {
  ok: boolean;
  checkedAtIso: string;
  host: string | null;
  port: number | null;
  secure: boolean | null;
  usingAuth: boolean;
  tlsRejectUnauthorized: boolean | null;
  error: string | null;
};

export type SmtpRuntimeHealth = {
  configured: boolean;
  mode: "disabled" | "smtp" | "sendmail";
  missing: string[];
  warnings: string[];
  misconfigured: boolean;
};

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { atMs: number; value: SmtpProbeResult }>();

function nowIso() {
  return new Date().toISOString();
}

function truthyEnv(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

function parsePort(value: unknown) {
  const raw = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return Math.trunc(raw);
}

export function getSmtpRuntimeHealth(): SmtpRuntimeHealth {
  const sendmailEnabled = truthyEnv(process.env.MAIL_SMTP_SENDMAIL);
  const hostRaw = String(process.env.MAIL_SMTP_HOST || "").trim();
  const portRaw = String(process.env.MAIL_SMTP_PORT || "").trim();
  const userRaw = String(process.env.MAIL_SMTP_USER || "").trim();
  const passRaw = String(process.env.MAIL_SMTP_PASS || "").trim();
  const allowNoAuth = truthyEnv(process.env.MAIL_SMTP_ALLOW_NO_AUTH);

  const host = hostRaw || null;
  const port = parsePort(portRaw);
  const user = userRaw || null;
  const pass = passRaw || null;
  const missing: string[] = [];
  const warnings: string[] = [];

  if (sendmailEnabled) {
    return {
      configured: true,
      mode: "sendmail",
      missing,
      warnings,
      misconfigured: false,
    };
  }

  const anySmtpEnvSet =
    Boolean(hostRaw) ||
    Boolean(portRaw) ||
    Boolean(userRaw) ||
    Boolean(passRaw) ||
    truthyEnv(process.env.MAIL_SMTP_SECURE);

  if (!anySmtpEnvSet) {
    return {
      configured: false,
      mode: "disabled",
      missing: ["MAIL_SMTP_HOST", "MAIL_SMTP_PORT", "MAIL_SMTP_USER", "MAIL_SMTP_PASS"],
      warnings: ["Email actions disabled: SMTP is not configured."],
      misconfigured: false,
    };
  }

  if (!host) missing.push("MAIL_SMTP_HOST");
  if (!port) missing.push("MAIL_SMTP_PORT");
  if (!allowNoAuth) {
    if (!user) missing.push("MAIL_SMTP_USER");
    if (!pass) missing.push("MAIL_SMTP_PASS");
  }

  if (missing.length > 0) {
    warnings.push(`Email actions disabled: missing ${missing.join(", ")}`);
  }

  return {
    configured: missing.length === 0,
    mode: "smtp",
    missing,
    warnings,
    misconfigured: missing.length > 0,
  };
}

export function validateSmtpEnvAtBoot() {
  const health = getSmtpRuntimeHealth();
  if (health.misconfigured) {
    throw new Error(`SMTP runtime misconfigured (missing ${health.missing.join(", ")})`);
  }
  return health;
}

export async function probeSmtpConnection(opts?: {
  host?: string | null;
  port?: number | null;
  secure?: boolean | null;
  username?: string | null;
  password?: string | null;
  tlsRejectUnauthorized?: boolean | null;
  timeoutMs?: number;
}) : Promise<SmtpProbeResult> {
  const host =
    String(opts?.host ?? "").trim() ||
    String(process.env.MAIL_SMTP_HOST || "").trim() ||
    null;
  const port = parsePort(opts?.port) ?? parsePort(process.env.MAIL_SMTP_PORT) ?? null;
  const secure =
    typeof opts?.secure === "boolean"
      ? opts.secure
      : String(process.env.MAIL_SMTP_SECURE || "").trim().toLowerCase() === "true";

  const username = String(opts?.username ?? "").trim() || String(process.env.MAIL_SMTP_USER || "").trim() || null;
  const password = String(opts?.password ?? "").trim() || String(process.env.MAIL_SMTP_PASS || "").trim() || null;
  const usingAuth = Boolean(username && password);

  const tlsRejectUnauthorized =
    typeof opts?.tlsRejectUnauthorized === "boolean"
      ? opts.tlsRejectUnauthorized
      : String(process.env.MAIL_SMTP_TLS_REJECT_UNAUTHORIZED || "").trim() !== "false";

  const timeoutMsRaw = Number(opts?.timeoutMs ?? process.env.MAIL_SMTP_PROBE_TIMEOUT_MS ?? 8000);
  const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.max(1500, Math.min(30_000, Math.trunc(timeoutMsRaw))) : 8000;

  const cacheKey = `${host || ""}|${port || ""}|${String(secure)}|${String(usingAuth)}|${String(tlsRejectUnauthorized)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.atMs <= CACHE_TTL_MS) return cached.value;

  if (!host || !port) {
    const value: SmtpProbeResult = {
      ok: false,
      checkedAtIso: nowIso(),
      host,
      port,
      secure: secure ?? null,
      usingAuth,
      tlsRejectUnauthorized: tlsRejectUnauthorized ?? null,
      error: "smtp_host_or_port_missing",
    };
    cache.set(cacheKey, { atMs: Date.now(), value });
    return value;
  }

  const allowNoAuth = truthyEnv(process.env.MAIL_SMTP_ALLOW_NO_AUTH);
  if (!allowNoAuth && !usingAuth) {
    const value: SmtpProbeResult = {
      ok: false,
      checkedAtIso: nowIso(),
      host,
      port,
      secure: secure ?? null,
      usingAuth,
      tlsRejectUnauthorized: tlsRejectUnauthorized ?? null,
      error: "smtp_auth_missing",
    };
    cache.set(cacheKey, { atMs: Date.now(), value });
    return value;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: usingAuth ? { user: username!, pass: password! } : undefined,
    tls: { rejectUnauthorized: tlsRejectUnauthorized },
  });

  try {
    await Promise.race([
      transporter.verify(),
      new Promise<void>((_resolve, reject) =>
        setTimeout(() => reject(new Error("smtp_probe_timeout")), timeoutMs),
      ),
    ]);

    const value: SmtpProbeResult = {
      ok: true,
      checkedAtIso: nowIso(),
      host,
      port,
      secure,
      usingAuth,
      tlsRejectUnauthorized: tlsRejectUnauthorized ?? null,
      error: null,
    };
    cache.set(cacheKey, { atMs: Date.now(), value });
    return value;
  } catch (err: any) {
    const value: SmtpProbeResult = {
      ok: false,
      checkedAtIso: nowIso(),
      host,
      port,
      secure,
      usingAuth,
      tlsRejectUnauthorized: tlsRejectUnauthorized ?? null,
      error: String(err?.message || err || "smtp_probe_failed"),
    };
    cache.set(cacheKey, { atMs: Date.now(), value });
    return value;
  } finally {
    try {
      transporter.close();
    } catch {
      // ignore
    }
  }
}
