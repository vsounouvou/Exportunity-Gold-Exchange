import crypto from "crypto";
import type { KkiapayMode } from "./config";

function toHex(bytes: ArrayBuffer | Uint8Array) {
  return Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("hex");
}

function normalizeOrigin(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "https://kkiapay.me";
  try {
    const u = new URL(raw);
    return u.origin || raw;
  } catch {
    return raw;
  }
}

function mapOperatorToProvider(input: string): { country: string; provider: string } | null {
  const raw = String(input || "").trim().toUpperCase();
  if (!raw) return null;

  const map: Record<string, { country: string; provider: string }> = {
    MTN_BJ: { country: "BJ", provider: "mtn-bj" },
    MOOV_BJ: { country: "BJ", provider: "moov-bj" },
  };

  if (map[raw]) return map[raw];

  const normalized = raw.toLowerCase();
  if (normalized === "mtn-bj") return { country: "BJ", provider: "mtn-bj" };
  if (normalized === "moov-bj") return { country: "BJ", provider: "moov-bj" };

  return null;
}

async function generateRsaOaepKeyPair(): Promise<{ publicKeyBytesJson: string }> {
  const subtle = crypto.webcrypto.subtle;
  const keyPair = (await subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"],
  )) as CryptoKeyPair;

  const spki = new Uint8Array(await subtle.exportKey("spki", keyPair.publicKey));
  const publicKeyBytesJson = JSON.stringify(Array.from(spki));
  return { publicKeyBytesJson };
}

async function encryptForInspector(plaintext: string, inspectorPublicKeyBytesJson: string): Promise<string> {
  const subtle = crypto.webcrypto.subtle;
  const inspectorSpki = new Uint8Array(JSON.parse(inspectorPublicKeyBytesJson)).buffer;

  const inspectorPublicKey = await subtle.importKey("spki", inspectorSpki, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]);

  const aesKey = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.webcrypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encryptedData = await subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoded);
  const rawAesKey = await subtle.exportKey("raw", aesKey);
  const encryptedAesKey = await subtle.encrypt({ name: "RSA-OAEP" }, inspectorPublicKey, rawAesKey);

  return `${toHex(encryptedAesKey)}.${toHex(encryptedData)}.${toHex(iv)}`;
}

function baseForMode(mode: KkiapayMode) {
  const override = String(process.env.KIKI_PUSH_BASE_URL || "").trim();
  if (override) return override.replace(/\/+$/, "");
  return mode === "SANDBOX" ? "https://api-sandbox.kkiapay.me" : "https://api.kkiapay.me";
}

const INSPECTOR_BASE_URL = "https://inspector.kkiapay.me";

async function inspectorHandshake(input: { publicKey: string; widgetHost: string }) {
  const { publicKeyBytesJson } = await generateRsaOaepKeyPair();

  const resp = await fetch(`${INSPECTOR_BASE_URL}/hand-shake`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-api-key": input.publicKey,
      "x-widget-host": normalizeOrigin(input.widgetHost),
    },
    body: JSON.stringify({ data: publicKeyBytesJson }),
  });

  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    const message = typeof data?.message === "string" && data.message.trim() ? data.message.trim() : `Handshake failed (${resp.status})`;
    throw new Error(message);
  }

  const sessionId = String(data?.sessionId || data?.session_id || "").trim();
  const inspectorPublicKey = typeof data?.publicKey === "string" ? data.publicKey : typeof data?.public_key === "string" ? data.public_key : "";

  if (!sessionId || !inspectorPublicKey) throw new Error("Handshake failed (missing session keys)");

  return { sessionId, inspectorPublicKey };
}

export async function kkiapayPushInit(input: {
  amount: number;
  currency: string;
  msisdn: string;
  operator: string;
  reference: string;
  buyerEmail: string | null;
  buyerName: string | null;
  widgetHost: string | null;
  mode: KkiapayMode;
  publicKey: string;
  reason?: string | null;
}) {
  const publicKey = String(input.publicKey || "").trim();
  if (!publicKey) throw new Error("KKiaPay public key missing");

  const mapped = mapOperatorToProvider(input.operator);
  if (!mapped) throw new Error("Unsupported operator");

  const msisdn = String(input.msisdn || "").replace(/\D/g, "");
  if (!msisdn) throw new Error("Invalid phone number");

  const nameRaw = String(input.buyerName || "").trim();
  const emailRaw = String(input.buyerEmail || "").trim();
  const fallbackName = emailRaw.includes("@") ? emailRaw.split("@")[0] : "Customer";
  const fullName = nameRaw || fallbackName;
  const parts = fullName.split(/\s+/).filter(Boolean);
  const firstname = parts[0] ?? "Customer";
  const lastname = parts.slice(1).join(" ") || "";

  const { sessionId, inspectorPublicKey } = await inspectorHandshake({
    publicKey,
    widgetHost: input.widgetHost ?? "",
  });

  const payload: Record<string, any> = {
    amount: Math.max(1, Math.round(Number(input.amount || 0))),
    email: emailRaw,
    firstname,
    lastname,
    phoneNumber: msisdn,
    country: mapped.country,
    provider: mapped.provider,
    contact: sessionId,
    reason: String(input.reason || "").trim() || `Order ${input.reference}`,
    partnerId: input.reference,
    stateData: JSON.stringify({ reference: input.reference, paymentId: input.reference }),
  };

  const base = baseForMode(input.mode);
  const url = input.mode === "SANDBOX" ? `${base}/api/v1/payments/request` : `${base}/api/v2/payments/request`;

  const headers: Record<string, string> = {
    accept: "application/json",
    "x-api-key": publicKey,
    "x-widget-host": normalizeOrigin(input.widgetHost),
  };

  let body: string | undefined = undefined;
  if (input.mode === "SANDBOX") {
    headers["content-type"] = "application/json";
    body = JSON.stringify(payload);
  } else {
    headers["x-session-id"] = sessionId;
    headers["x-encrypted-data"] = await encryptForInspector(JSON.stringify(payload), inspectorPublicKey);
    body = "";
  }

  const resp = await fetch(url, { method: "POST", headers, body });
  const raw = await resp.json().catch(() => null);
  if (!resp.ok) {
    const message = typeof raw?.message === "string" && raw.message.trim() ? raw.message.trim() : `Push init failed (${resp.status})`;
    throw new Error(message);
  }

  const transactionId = String(raw?.transactionId || raw?.transaction_id || raw?.id || "").trim() || null;

  return {
    ok: true as const,
    transactionId,
    sessionId,
    raw,
  };
}

export async function kkiapayVerifyTransaction(input: {
  transactionId: string;
  mode: KkiapayMode;
  publicKey: string;
  privateKey: string;
  secret: string;
}) {
  const transactionId = String(input.transactionId || "").trim();
  if (!transactionId) throw new Error("transactionId is required");

  const base = baseForMode(input.mode);
  const url = `${base}/api/v1/transactions/status`;

  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded",
    "x-api-key": String(input.publicKey || "").trim(),
    "x-private-key": String(input.privateKey || "").trim(),
    "x-secret-key": String(input.secret || "").trim(),
  };

  const body = new URLSearchParams({ transactionId }).toString();
  const resp = await fetch(url, { method: "POST", headers, body });
  const raw = await resp.json().catch(() => null);
  if (!resp.ok) {
    const message = typeof raw?.message === "string" && raw.message.trim() ? raw.message.trim() : `Verify failed (${resp.status})`;
    throw new Error(message);
  }

  const statusRaw = String(raw?.status || raw?.state || "").trim().toUpperCase();
  const normalizedStatus = statusRaw.includes("SUCCESS") || statusRaw === "SUCCESS" ? "succeeded" : statusRaw.includes("FAIL") ? "failed" : statusRaw.includes("CANCEL") ? "cancelled" : statusRaw.includes("REFUND") ? "refunded" : statusRaw.includes("PROCESS") ? "processing" : statusRaw ? "pending" : "pending";

  return { raw, normalizedStatus, statusRaw };
}
