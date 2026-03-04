import crypto from "crypto";

type UnsubscribeTokenPayload = {
  tenantId: number;
  email: string;
  scope: string;
  exp: number;
};

function base64UrlEncode(input: Buffer | string) {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecodeToString(input: string) {
  const normalized = String(input || "").trim().replace(/-/g, "+").replace(/_/g, "/");
  if (!normalized) return null;
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function normalizeEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function requireUnsubscribeSecret() {
  const candidates = [
    String(process.env.MAIL_UNSUBSCRIBE_SECRET || "").trim(),
    String(process.env.MAIL_PLATFORM_SIGNATURE_SECRET || "").trim(),
    String(process.env.MAIL_SIGNATURE_SECRET || "").trim(),
    String(process.env.SESSION_SECRET || "").trim(),
  ].filter(Boolean);

  if (candidates.length) return candidates[0];
  return "mail-unsubscribe-dev-secret";
}

function signPayload(payloadB64: string) {
  const secret = requireUnsubscribeSecret();
  return crypto.createHmac("sha256", secret).update(payloadB64).digest("hex");
}

export function createUnsubscribeToken(input: {
  tenantId: number;
  email: string;
  scope?: string;
  ttlDays?: number;
}) {
  const tenantId = Number(input.tenantId);
  const email = normalizeEmail(input.email);
  if (!Number.isFinite(tenantId) || tenantId <= 0) throw new Error("tenantId required");
  if (!email) throw new Error("valid email required");

  const scope = String(input.scope || "marketing").trim().toLowerCase() || "marketing";
  const ttlDaysRaw = Number(input.ttlDays ?? 365);
  const ttlDays = Number.isFinite(ttlDaysRaw) ? Math.max(1, Math.min(3650, Math.trunc(ttlDaysRaw))) : 365;
  const exp = Date.now() + ttlDays * 24 * 60 * 60_000;

  const payload: UnsubscribeTokenPayload = { tenantId, email, scope, exp };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const sig = signPayload(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function verifyUnsubscribeToken(token: unknown): UnsubscribeTokenPayload | null {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;
  const expectedSig = signPayload(payloadB64);
  if (String(sig).length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expectedSig, "utf8"), Buffer.from(String(sig), "utf8"))) return null;

  const json = base64UrlDecodeToString(payloadB64);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<UnsubscribeTokenPayload>;
    const tenantId = Number(parsed.tenantId);
    const email = normalizeEmail(parsed.email);
    const scope = String(parsed.scope || "marketing").trim().toLowerCase() || "marketing";
    const exp = Number(parsed.exp);
    if (!Number.isFinite(tenantId) || tenantId <= 0) return null;
    if (!email) return null;
    if (!Number.isFinite(exp) || exp <= Date.now()) return null;
    return { tenantId, email, scope, exp };
  } catch {
    return null;
  }
}
