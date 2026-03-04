import type { FlutterwaveMode } from "./config";

export type FlutterwavePaymentStatus = "succeeded" | "failed" | "cancelled" | "processing" | "pending";

type FlutterwaveApiResponse = {
  status?: string;
  message?: string;
  data?: any;
};

function resolveBaseUrl(mode: FlutterwaveMode) {
  const modeSuffix = mode === "SANDBOX" ? "SANDBOX" : "LIVE";
  const modeKey = mode === "SANDBOX" ? "sandbox" : "live";
  const candidate =
    process.env[`FLW_BASE_URL_${modeSuffix}`] ||
    process.env[`FLUTTERWAVE_BASE_URL_${modeSuffix}`] ||
    process.env[`FLW_BASE_URL_${modeKey.toUpperCase()}`] ||
    process.env[`FLUTTERWAVE_BASE_URL_${modeKey.toUpperCase()}`] ||
    process.env.FLW_BASE_URL ||
    process.env.FLUTTERWAVE_BASE_URL;
  const raw = String(candidate || "").trim();
  if (!raw) return "https://api.flutterwave.com/v3";
  return raw.replace(/\/+$/, "");
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

function normalizeStatus(input: unknown): FlutterwavePaymentStatus {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return "pending";
  if (raw.includes("success")) return "succeeded";
  if (raw.includes("fail") || raw.includes("error")) return "failed";
  if (raw.includes("cancel")) return "cancelled";
  if (raw.includes("process")) return "processing";
  if (raw.includes("pend")) return "pending";
  return "pending";
}

export function buildFlutterwaveTxRef(input: {
  tenantKey: string;
  paymentId: string;
  type: "WALLET_TOPUP" | "ORDER_PAYMENT";
}) {
  const prefix = input.type === "WALLET_TOPUP" ? "topup" : "order";
  const tenant = String(input.tenantKey || "").trim().toLowerCase() || "tenant";
  const paymentId = String(input.paymentId || "").trim();
  if (!paymentId) throw new Error("paymentId is required to build tx_ref");
  return `${prefix}_${tenant}_${paymentId}`;
}

async function callFlutterwave<T = FlutterwaveApiResponse>(input: {
  mode: FlutterwaveMode;
  secretKey: string;
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown> | null;
}) {
  const baseUrl = resolveBaseUrl(input.mode);
  const url = `${baseUrl}${input.path.startsWith("/") ? input.path : `/${input.path}`}`;

  const resp = await fetch(url, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${String(input.secretKey || "").trim()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  const raw = (await resp.json().catch(() => null)) as T | null;
  if (!resp.ok) {
    const message =
      (raw && typeof raw === "object" && typeof (raw as any).message === "string" && String((raw as any).message).trim()) ||
      `Flutterwave request failed (${resp.status})`;
    throw new Error(message);
  }
  return raw;
}

export async function flutterwaveInitPayment(input: {
  mode: FlutterwaveMode;
  secretKey: string;
  txRef: string;
  amount: number;
  currency: string;
  redirectUrl: string;
  customer: {
    email: string;
    name: string;
    phone?: string | null;
  };
  title?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  meta?: Record<string, unknown> | null;
}) {
  const amount = asRoundedAmount(input.amount);
  if (!amount || amount <= 0) throw new Error("amount must be > 0");
  const currency = asUpperCurrency(input.currency) || "XOF";

  const payload: Record<string, unknown> = {
    tx_ref: input.txRef,
    amount,
    currency,
    redirect_url: input.redirectUrl,
    customer: {
      email: input.customer.email,
      name: input.customer.name,
      phonenumber: input.customer.phone || undefined,
    },
    customizations: {
      title: String(input.title || "Buy credit"),
      description: String(input.description || "Top up your wallet"),
      logo: input.logoUrl || undefined,
    },
    meta: input.meta || undefined,
  };

  const raw = await callFlutterwave<FlutterwaveApiResponse>({
    mode: input.mode,
    secretKey: input.secretKey,
    method: "POST",
    path: "/payments",
    body: payload,
  });

  if (String(raw?.status || "").toLowerCase() !== "success") {
    throw new Error(String(raw?.message || "Flutterwave init failed"));
  }

  const link = String(raw?.data?.link || "").trim();
  if (!link) throw new Error("Flutterwave checkout link missing");

  return {
    checkoutLink: link,
    transactionId: raw?.data?.id ? String(raw.data.id) : null,
    raw,
  };
}

export async function flutterwaveVerifyById(input: {
  mode: FlutterwaveMode;
  secretKey: string;
  transactionId: string;
}) {
  const transactionId = String(input.transactionId || "").trim();
  if (!transactionId) throw new Error("transactionId is required");

  const raw = await callFlutterwave<FlutterwaveApiResponse>({
    mode: input.mode,
    secretKey: input.secretKey,
    method: "GET",
    path: `/transactions/${encodeURIComponent(transactionId)}/verify`,
  });

  const data = raw?.data || {};
  return {
    raw,
    transactionId: data?.id ? String(data.id) : transactionId,
    txRef: typeof data?.tx_ref === "string" ? data.tx_ref : null,
    amount: asRoundedAmount(data?.amount),
    currency: asUpperCurrency(data?.currency),
    normalizedStatus: normalizeStatus(data?.status),
  };
}

export async function flutterwaveVerifyByReference(input: {
  mode: FlutterwaveMode;
  secretKey: string;
  txRef: string;
}) {
  const txRef = String(input.txRef || "").trim();
  if (!txRef) throw new Error("txRef is required");

  const raw = await callFlutterwave<FlutterwaveApiResponse>({
    mode: input.mode,
    secretKey: input.secretKey,
    method: "GET",
    path: `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
  });

  const data = raw?.data || {};
  return {
    raw,
    transactionId: data?.id ? String(data.id) : null,
    txRef: typeof data?.tx_ref === "string" ? data.tx_ref : txRef,
    amount: asRoundedAmount(data?.amount),
    currency: asUpperCurrency(data?.currency),
    normalizedStatus: normalizeStatus(data?.status),
  };
}

export async function flutterwaveVerifyTransaction(input: {
  mode: FlutterwaveMode;
  secretKey: string;
  transactionId?: string | null;
  txRef?: string | null;
}) {
  const transactionId = String(input.transactionId || "").trim();
  const txRef = String(input.txRef || "").trim();

  if (transactionId) {
    try {
      return await flutterwaveVerifyById({
        mode: input.mode,
        secretKey: input.secretKey,
        transactionId,
      });
    } catch (error) {
      if (!txRef) throw error;
    }
  }

  if (!txRef) throw new Error("transactionId or txRef is required");
  return flutterwaveVerifyByReference({
    mode: input.mode,
    secretKey: input.secretKey,
    txRef,
  });
}
