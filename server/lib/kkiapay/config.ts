import crypto from "crypto";
import type { TenantKey } from "../tenants";

export type KkiapayMode = "SANDBOX" | "LIVE";

function normalizeMode(value: string | null | undefined): KkiapayMode {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "SANDBOX") return "SANDBOX";
  if (normalized === "LIVE") return "LIVE";
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  return nodeEnv === "production" ? "LIVE" : "SANDBOX";
}

function firstEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function suffixForTenant(tenantKey: TenantKey): { long: string; short: string } {
  if (tenantKey === "bdo") return { long: "BOURSE", short: "BDO" };
  return { long: "EXPORTUNITY", short: "EXPO" };
}

function keyForMode(base: string, mode: KkiapayMode) {
  return `${base}_${mode}`;
}

function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function getKkiapayPublicKeyEnvVarNames(tenantKey: TenantKey, mode: KkiapayMode): string[] {
  const suffix = suffixForTenant(tenantKey);
  const modeSuffix = mode === "SANDBOX" ? "SANDBOX" : "LIVE";

  return uniqueStrings([
    keyForMode(`KIKI_PUBLIC_KEY_${suffix.long}`, modeSuffix),
    `KIKI_PUBLIC_KEY_${suffix.long}`,
    keyForMode(`KIKI_PUBLIC_KEY_${suffix.short}`, modeSuffix),
    `KIKI_PUBLIC_KEY_${suffix.short}`,
    keyForMode("KIKI_PUBLIC_KEY", modeSuffix),
    "KIKI_PUBLIC_KEY",
    keyForMode(`KKIAPAY_PUBLIC_KEY_${suffix.long}`, modeSuffix),
    `KKIAPAY_PUBLIC_KEY_${suffix.long}`,
    keyForMode(`KKIAPAY_PUBLIC_KEY_${suffix.short}`, modeSuffix),
    `KKIAPAY_PUBLIC_KEY_${suffix.short}`,
    keyForMode("KKIAPAY_PUBLIC_KEY", modeSuffix),
    "KKIAPAY_PUBLIC_KEY",
  ]);
}

export function getKkiapayConfig(tenantKey: TenantKey) {
  const suffix = suffixForTenant(tenantKey);
  const mode = normalizeMode(
    firstEnv(
      `KIKI_MODE_${suffix.short}`,
      `KIKI_MODE_${suffix.long}`,
      "KIKI_MODE",
      `KKIAPAY_MODE_${suffix.short}`,
      `KKIAPAY_MODE_${suffix.long}`,
      "KKIAPAY_MODE",
    ),
  );

  const modeSuffix = mode === "SANDBOX" ? "SANDBOX" : "LIVE";

  const publicKey =
    firstEnv(
      keyForMode(`KIKI_PUBLIC_KEY_${suffix.short}`, modeSuffix),
      keyForMode(`KIKI_PUBLIC_KEY_${suffix.long}`, modeSuffix),
      `KIKI_PUBLIC_KEY_${suffix.short}`,
      `KIKI_PUBLIC_KEY_${suffix.long}`,
      keyForMode("KIKI_PUBLIC_KEY", modeSuffix),
      "KIKI_PUBLIC_KEY",
      keyForMode(`KKIAPAY_PUBLIC_KEY_${suffix.short}`, modeSuffix),
      keyForMode(`KKIAPAY_PUBLIC_KEY_${suffix.long}`, modeSuffix),
      `KKIAPAY_PUBLIC_KEY_${suffix.short}`,
      `KKIAPAY_PUBLIC_KEY_${suffix.long}`,
      keyForMode("KKIAPAY_PUBLIC_KEY", modeSuffix),
      "KKIAPAY_PUBLIC_KEY",
    ) ?? "";

  const privateKey =
    firstEnv(
      keyForMode(`KIKI_PRIVATE_KEY_${suffix.short}`, modeSuffix),
      keyForMode(`KIKI_PRIVATE_KEY_${suffix.long}`, modeSuffix),
      `KIKI_PRIVATE_KEY_${suffix.short}`,
      `KIKI_PRIVATE_KEY_${suffix.long}`,
      keyForMode("KIKI_PRIVATE_KEY", modeSuffix),
      "KIKI_PRIVATE_KEY",
      keyForMode(`KKIAPAY_PRIVATE_KEY_${suffix.short}`, modeSuffix),
      keyForMode(`KKIAPAY_PRIVATE_KEY_${suffix.long}`, modeSuffix),
      `KKIAPAY_PRIVATE_KEY_${suffix.short}`,
      `KKIAPAY_PRIVATE_KEY_${suffix.long}`,
      keyForMode("KKIAPAY_PRIVATE_KEY", modeSuffix),
      "KKIAPAY_PRIVATE_KEY",
    ) ?? "";

  const secret =
    firstEnv(
      keyForMode(`KIKI_SECRET_${suffix.short}`, modeSuffix),
      keyForMode(`KIKI_SECRET_${suffix.long}`, modeSuffix),
      `KIKI_SECRET_${suffix.short}`,
      `KIKI_SECRET_${suffix.long}`,
      keyForMode("KIKI_SECRET", modeSuffix),
      "KIKI_SECRET",
      keyForMode(`KKIAPAY_SECRET_${suffix.short}`, modeSuffix),
      keyForMode(`KKIAPAY_SECRET_${suffix.long}`, modeSuffix),
      `KKIAPAY_SECRET_${suffix.short}`,
      `KKIAPAY_SECRET_${suffix.long}`,
      keyForMode("KKIAPAY_SECRET", modeSuffix),
      "KKIAPAY_SECRET",
      keyForMode(`KKIAPAY_SECRET_KEY_${suffix.short}`, modeSuffix),
      keyForMode(`KKIAPAY_SECRET_KEY_${suffix.long}`, modeSuffix),
      `KKIAPAY_SECRET_KEY_${suffix.short}`,
      `KKIAPAY_SECRET_KEY_${suffix.long}`,
      keyForMode("KKIAPAY_SECRET_KEY", modeSuffix),
      "KKIAPAY_SECRET_KEY",
    ) ?? "";

  return {
    mode,
    publicKey,
    privateKey,
    secret,
  };
}

export function getRequestOrigin(req: any): string | null {
  const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    ?.trim();
  const forwardedHost = String(req.headers?.["x-forwarded-host"] || "")
    .split(",")[0]
    ?.trim();

  const proto = forwardedProto || req.protocol;
  const host = forwardedHost || req.get?.("host") || req.headers?.host;
  if (!proto || !host) return null;
  return `${proto}://${host}`;
}

function timingSafeEqualHex(a: string, b: string) {
  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function timingSafeEqualBase64(a: string, b: string) {
  const aBuf = Buffer.from(a, "base64");
  const bBuf = Buffer.from(b, "base64");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function verifyKkiapayWebhookSignature(input: {
  rawBody: Buffer | undefined;
  headers: Record<string, any>;
  secret: string | undefined;
}) {
  const rawBody = input.rawBody;
  const secret = String(input.secret || "").trim();
  if (!rawBody || !rawBody.length || !secret) return { ok: false, reason: "missing_raw_or_secret" as const };

  const headerCandidates = [
    "x-kkiapay-signature",
    "x-kkiapay-signature-hmac-sha256",
    "x-kkiapay-secret",
    "x-signature",
    "signature",
  ];

  const signatureRaw = headerCandidates
    .map((k) => input.headers?.[k] ?? input.headers?.[k.toLowerCase()])
    .find((v) => typeof v === "string" && v.trim());

  if (!signatureRaw) return { ok: false, reason: "missing_signature_header" as const };

  const signature = String(signatureRaw).trim();
  if (signature === secret) return { ok: true, reason: null };

  const hmac = crypto.createHmac("sha256", secret).update(rawBody).digest();
  const hex = hmac.toString("hex");
  const base64 = hmac.toString("base64");

  const normalized = signature.replace(/^sha256=/i, "").trim();
  const okHex = normalized.length === hex.length && /^[0-9a-f]+$/i.test(normalized) ? timingSafeEqualHex(normalized.toLowerCase(), hex) : false;
  const okBase64 = normalized.length === base64.length ? timingSafeEqualBase64(normalized, base64) : false;

  return { ok: okHex || okBase64, reason: (okHex || okBase64) ? null : ("mismatch" as const) };
}

export type ParsedKkiapayWebhook = {
  reference: string | null;
  transactionId: string | null;
  status: "pending" | "succeeded" | "failed" | "cancelled" | "refunded" | null;
  amount: number | null;
  currency: string | null;
};

function pickString(value: any): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function pickNumber(value: any): number | null {
  const num = typeof value === "number" ? value : Number(String(value ?? ""));
  return Number.isFinite(num) ? num : null;
}

function normalizeStatus(value: any): ParsedKkiapayWebhook["status"] {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes("refund")) return "refunded";
  if (raw.includes("cancel")) return "cancelled";
  if (raw.includes("fail") || raw.includes("error")) return "failed";
  if (raw.includes("success") || raw.includes("paid") || raw.includes("complete")) return "succeeded";
  if (raw.includes("pending") || raw.includes("process")) return "pending";
  return null;
}

function parseStateData(value: any): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as any;
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as any;
    } catch {
      return null;
    }
  }
  return null;
}

export function parseKkiapayWebhook(body: any): ParsedKkiapayWebhook {
  const root = body ?? {};
  const data = root?.data ?? root?.transaction ?? root?.payment ?? null;
  const stateData =
    parseStateData(root?.stateData) ||
    parseStateData(root?.state_data) ||
    parseStateData(data?.stateData) ||
    parseStateData(data?.state_data) ||
    null;

  const reference =
    pickString(root?.reference) ||
    pickString(root?.paymentId) ||
    pickString(root?.ref) ||
    pickString(root?.partnerId) ||
    pickString(data?.reference) ||
    pickString(data?.paymentId) ||
    pickString(data?.ref) ||
    pickString(data?.partnerId) ||
    pickString(data?.metadata?.paymentId) ||
    pickString(data?.metadata?.reference) ||
    pickString(stateData?.paymentId) ||
    pickString(stateData?.reference) ||
    pickString(stateData?.ref) ||
    pickString(stateData?.metadata?.paymentId) ||
    pickString(stateData?.metadata?.reference) ||
    null;

  const transactionId =
    pickString(root?.transactionId) ||
    pickString(root?.transaction_id) ||
    pickString(root?.id) ||
    pickString(data?.transactionId) ||
    pickString(data?.transaction_id) ||
    pickString(data?.id) ||
    null;

  const status =
    normalizeStatus(root?.status) ||
    normalizeStatus(root?.state) ||
    normalizeStatus(root?.event) ||
    normalizeStatus(data?.status) ||
    normalizeStatus(data?.state) ||
    normalizeStatus(data?.event) ||
    (root?.isPaymentSucces === true ? "succeeded" : root?.isPaymentSucces === false ? "failed" : null) ||
    null;

  const amount = pickNumber(root?.amount) ?? pickNumber(data?.amount);
  const currency = pickString(root?.currency) ?? pickString(data?.currency);

  return { reference, transactionId, status, amount, currency };
}
