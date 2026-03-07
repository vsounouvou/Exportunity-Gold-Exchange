import crypto from "crypto";

import type { FlutterwaveMode } from "./config";

type FlutterwaveV4ApiResponse = {
  status?: string;
  message?: string;
  data?: any;
};

type V4TokenCacheEntry = {
  accessToken: string;
  expiresAt: number;
};

export type FlutterwaveV4CardDetails = {
  cardNumber: string;
  cvv: string;
  expiryMonth: string;
  expiryYear: string;
};

export type FlutterwaveV4ChargeAction =
  | { type: "redirect_url"; redirectUrl: string; message: string | null }
  | { type: "otp"; message: string | null }
  | { type: "pin"; message: string | null }
  | { type: "none"; message: string | null };

export type FlutterwaveV4Charge = {
  id: string | null;
  amount: number | null;
  currency: string | null;
  reference: string | null;
  redirectUrl: string | null;
  normalizedStatus: "succeeded" | "failed" | "cancelled" | "processing" | "pending";
  rawStatus: string;
  nextAction: FlutterwaveV4ChargeAction | null;
  raw: FlutterwaveV4ApiResponse | null;
};

const tokenCache = new Map<string, V4TokenCacheEntry>();

function resolveApiBaseUrl(mode: FlutterwaveMode) {
  const modeSuffix = mode === "SANDBOX" ? "SANDBOX" : "LIVE";
  const raw =
    process.env[`FLW_V4_BASE_URL_${modeSuffix}`] ||
    process.env[`FLUTTERWAVE_V4_BASE_URL_${modeSuffix}`] ||
    process.env.FLW_V4_BASE_URL ||
    process.env.FLUTTERWAVE_V4_BASE_URL;
  const value = String(raw || "").trim();
  if (value) return value.replace(/\/+$/, "");
  return mode === "SANDBOX" ? "https://developersandbox-api.flutterwave.com" : "https://f4bexperience.flutterwave.com";
}

function resolveTokenUrl() {
  const raw = process.env.FLW_V4_TOKEN_URL || process.env.FLUTTERWAVE_V4_TOKEN_URL;
  const value = String(raw || "").trim();
  return value || "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token";
}

function asRoundedAmount(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

function asUpperCurrency(value: unknown): string | null {
  const raw = String(value ?? "").trim().toUpperCase();
  return raw || null;
}

function normalizeStatus(input: unknown): "succeeded" | "failed" | "cancelled" | "processing" | "pending" {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return "pending";
  if (raw.includes("succeed") || raw.includes("success")) return "succeeded";
  if (raw.includes("fail") || raw.includes("declin") || raw.includes("error")) return "failed";
  if (raw.includes("cancel")) return "cancelled";
  if (raw.includes("awaiting_authorization") || raw.includes("process")) return "processing";
  if (raw.includes("pend")) return "pending";
  return "pending";
}

function normalizeNextAction(input: any): FlutterwaveV4ChargeAction | null {
  const type = String(input?.type || "").trim().toLowerCase();
  const message = typeof input?.message === "string" && input.message.trim() ? input.message.trim() : null;

  if (type === "redirect_url") {
    const redirectUrl = String(input?.redirect_url || "").trim();
    if (!redirectUrl) return null;
    return { type: "redirect_url", redirectUrl, message };
  }
  if (type === "otp") return { type: "otp", message };
  if (type === "pin") return { type: "pin", message };
  if (type === "no_action") return { type: "none", message };
  return null;
}

function normalizeCharge(raw: FlutterwaveV4ApiResponse | null): FlutterwaveV4Charge {
  const data = raw?.data || {};
  return {
    id: data?.id ? String(data.id) : null,
    amount: asRoundedAmount(data?.amount),
    currency: asUpperCurrency(data?.currency),
    reference: typeof data?.reference === "string" && data.reference.trim() ? data.reference.trim() : null,
    redirectUrl: typeof data?.redirect_url === "string" && data.redirect_url.trim() ? data.redirect_url.trim() : null,
    normalizedStatus: normalizeStatus(data?.status),
    rawStatus: String(data?.status || "").trim(),
    nextAction: normalizeNextAction(data?.next_action),
    raw,
  };
}

export function normalizeFlutterwaveV4ChargePayload(data: any): FlutterwaveV4Charge {
  return normalizeCharge({
    status: "success",
    data,
  });
}

function nonceHex() {
  return crypto.randomBytes(12).toString("hex");
}

function encryptCardValue(value: string, base64Key: string, nonce: string) {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new Error("Flutterwave encryption key must decode to 32 bytes");
  }

  const iv = Buffer.from(nonce, "hex");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value || ""), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ciphertext, tag]).toString("base64");
}

async function fetchV4AccessToken(input: {
  clientId: string;
  clientSecret: string;
}) {
  const resp = await fetch(resolveTokenUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: "client_credentials",
    }).toString(),
  });

  const raw = (await resp.json().catch(() => null)) as any;
  if (!resp.ok) {
    const message =
      (raw && typeof raw === "object" && typeof raw.error_description === "string" && raw.error_description.trim()) ||
      (raw && typeof raw === "object" && typeof raw.message === "string" && raw.message.trim()) ||
      `Flutterwave token request failed (${resp.status})`;
    throw new Error(message);
  }

  const accessToken = String(raw?.access_token || "").trim();
  const expiresIn = Math.max(60, Number(raw?.expires_in || 600));
  if (!accessToken) throw new Error("Flutterwave token response missing access_token");
  return {
    accessToken,
    expiresAt: Date.now() + Math.max(0, expiresIn - 60) * 1000,
  };
}

async function getV4AccessToken(input: {
  mode: FlutterwaveMode;
  clientId: string;
  clientSecret: string;
}) {
  const cacheKey = `${input.mode}:${input.clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken;

  const refreshed = await fetchV4AccessToken({
    clientId: input.clientId,
    clientSecret: input.clientSecret,
  });
  tokenCache.set(cacheKey, refreshed);
  return refreshed.accessToken;
}

async function callV4<T = FlutterwaveV4ApiResponse>(input: {
  mode: FlutterwaveMode;
  clientId: string;
  clientSecret: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
  body?: Record<string, unknown> | null;
  retry?: boolean;
}) {
  const accessToken = await getV4AccessToken({
    mode: input.mode,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
  });

  const url = `${resolveApiBaseUrl(input.mode)}${input.path.startsWith("/") ? input.path : `/${input.path}`}`;
  const resp = await fetch(url, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  const raw = (await resp.json().catch(() => null)) as T | null;
  if (resp.status === 401 && input.retry !== false) {
    tokenCache.delete(`${input.mode}:${input.clientId}`);
    return callV4({
      ...input,
      retry: false,
    });
  }

  if (!resp.ok) {
    const message =
      (raw && typeof raw === "object" && typeof (raw as any).message === "string" && String((raw as any).message).trim()) ||
      `Flutterwave request failed (${resp.status})`;
    throw new Error(message);
  }

  return raw;
}

export async function flutterwaveV4CreateCustomer(input: {
  mode: FlutterwaveMode;
  clientId: string;
  clientSecret: string;
  customer: {
    name: string;
    email: string;
    phone?: string | null;
  };
}) {
  const raw = await callV4<FlutterwaveV4ApiResponse>({
    mode: input.mode,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    method: "POST",
    path: "/customers",
    body: {
      name: input.customer.name,
      email: input.customer.email,
      phone_number: input.customer.phone || undefined,
    },
  });

  const id = raw?.data?.id ? String(raw.data.id) : "";
  if (!id) throw new Error("Flutterwave customer response missing id");
  return { id, raw };
}

export async function flutterwaveV4CreateCardPaymentMethod(input: {
  mode: FlutterwaveMode;
  clientId: string;
  clientSecret: string;
  encryptionKey: string;
  card: FlutterwaveV4CardDetails;
}) {
  const nonce = nonceHex();
  const raw = await callV4<FlutterwaveV4ApiResponse>({
    mode: input.mode,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    method: "POST",
    path: "/payment-methods",
    body: {
      type: "card",
      card: {
        encrypted_card_number: encryptCardValue(input.card.cardNumber, input.encryptionKey, nonce),
        encrypted_cvv: encryptCardValue(input.card.cvv, input.encryptionKey, nonce),
        expiry_month: input.card.expiryMonth,
        expiry_year: input.card.expiryYear,
        nonce,
      },
    },
  });

  const id = raw?.data?.id ? String(raw.data.id) : "";
  if (!id) throw new Error("Flutterwave payment method response missing id");
  return { id, raw };
}

export async function flutterwaveV4CreateCharge(input: {
  mode: FlutterwaveMode;
  clientId: string;
  clientSecret: string;
  amount: number;
  currency: string;
  redirectUrl: string;
  customerId: string;
  paymentMethodId: string;
  reference: string;
  meta?: Record<string, unknown> | null;
}) {
  const raw = await callV4<FlutterwaveV4ApiResponse>({
    mode: input.mode,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    method: "POST",
    path: "/charges",
    body: {
      amount: input.amount,
      currency: input.currency,
      redirect_url: input.redirectUrl,
      customer_id: input.customerId,
      payment_method_id: input.paymentMethodId,
      reference: input.reference,
      meta: input.meta || undefined,
    },
  });

  return normalizeCharge(raw);
}

export async function flutterwaveV4AuthorizeCharge(input: {
  mode: FlutterwaveMode;
  clientId: string;
  clientSecret: string;
  chargeId: string;
  details: Record<string, unknown>;
}) {
  const raw = await callV4<FlutterwaveV4ApiResponse>({
    mode: input.mode,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    method: "PATCH",
    path: `/charges/${encodeURIComponent(input.chargeId)}`,
    body: input.details,
  });

  return normalizeCharge(raw);
}

export async function flutterwaveV4GetCharge(input: {
  mode: FlutterwaveMode;
  clientId: string;
  clientSecret: string;
  chargeId: string;
}) {
  const raw = await callV4<FlutterwaveV4ApiResponse>({
    mode: input.mode,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    method: "GET",
    path: `/charges/${encodeURIComponent(input.chargeId)}`,
  });

  return normalizeCharge(raw);
}
