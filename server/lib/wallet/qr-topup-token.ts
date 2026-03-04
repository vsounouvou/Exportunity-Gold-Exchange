import crypto from "crypto";

export type WalletTopupQrTokenPayloadV1 = {
  v: 1;
  tenantKey: string;
  walletAccountId: string;
  userId: string;
  displayName?: string | null;
  iat: number;
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

function base64UrlDecode(input: string) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((raw.length + 3) % 4);
  try {
    return Buffer.from(padded, "base64");
  } catch {
    return null;
  }
}

function timingSafeEqual(a: Buffer, b: Buffer) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function getWalletTopupQrTokenSecret(): string | null {
  const explicit = String(process.env.WALLET_QR_TOKEN_SECRET || "").trim();
  if (explicit) return explicit;
  const voucherSalt = String(process.env.VOUCHER_CODE_SALT || "").trim();
  if (voucherSalt) return voucherSalt;
  return null;
}

export function signWalletTopupQrToken(payload: WalletTopupQrTokenPayloadV1, secret: string) {
  const normalized: WalletTopupQrTokenPayloadV1 = {
    v: 1,
    tenantKey: String(payload.tenantKey || "").trim().toLowerCase(),
    walletAccountId: String(payload.walletAccountId || "").trim(),
    userId: String(payload.userId || "").trim(),
    displayName: payload.displayName ? String(payload.displayName) : null,
    iat: Math.trunc(Number(payload.iat || 0)),
    exp: Math.trunc(Number(payload.exp || 0)),
  };

  if (!normalized.tenantKey) throw new Error("tenantKey is required");
  if (!normalized.walletAccountId) throw new Error("walletAccountId is required");
  if (!normalized.userId) throw new Error("userId is required");
  if (!normalized.iat || !normalized.exp) throw new Error("iat/exp are required");
  if (normalized.exp <= normalized.iat) throw new Error("exp must be > iat");

  const payloadJson = JSON.stringify(normalized);
  const payloadB64 = base64UrlEncode(payloadJson);
  const sig = crypto.createHmac("sha256", secret).update(payloadJson).digest();
  const sigB64 = base64UrlEncode(sig);
  return `${payloadB64}.${sigB64}`;
}

export function verifyWalletTopupQrToken(token: string, secret: string): {
  ok: boolean;
  reason: string | null;
  payload: WalletTopupQrTokenPayloadV1 | null;
} {
  const raw = String(token || "").trim();
  if (!raw) return { ok: false, reason: "missing_token", payload: null };
  const parts = raw.split(".");
  if (parts.length !== 2) return { ok: false, reason: "invalid_format", payload: null };
  const payloadBuf = base64UrlDecode(parts[0] || "");
  const sigBuf = base64UrlDecode(parts[1] || "");
  if (!payloadBuf || !sigBuf) return { ok: false, reason: "invalid_base64", payload: null };

  let payloadJson = "";
  try {
    payloadJson = payloadBuf.toString("utf8");
  } catch {
    return { ok: false, reason: "invalid_payload", payload: null };
  }

  const expectedSig = crypto.createHmac("sha256", secret).update(payloadJson).digest();
  if (!timingSafeEqual(expectedSig, sigBuf)) return { ok: false, reason: "invalid_signature", payload: null };

  let parsed: any = null;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return { ok: false, reason: "invalid_json", payload: null };
  }

  if (!parsed || typeof parsed !== "object") return { ok: false, reason: "invalid_payload", payload: null };
  if (parsed.v !== 1) return { ok: false, reason: "unsupported_version", payload: null };

  const payload: WalletTopupQrTokenPayloadV1 = {
    v: 1,
    tenantKey: String(parsed.tenantKey || "").trim().toLowerCase(),
    walletAccountId: String(parsed.walletAccountId || "").trim(),
    userId: String(parsed.userId || "").trim(),
    displayName: parsed.displayName ? String(parsed.displayName) : null,
    iat: Math.trunc(Number(parsed.iat || 0)),
    exp: Math.trunc(Number(parsed.exp || 0)),
  };

  if (!payload.tenantKey || !payload.walletAccountId || !payload.userId || !payload.iat || !payload.exp) {
    return { ok: false, reason: "invalid_payload", payload: null };
  }

  if (Date.now() > payload.exp) return { ok: false, reason: "expired", payload: null };

  return { ok: true, reason: null, payload };
}

