import type { KkiapayMode } from "./config";

function baseForMode(mode: KkiapayMode) {
  const override = String(process.env.KIKI_PAYOUT_BASE_URL || "").trim();
  if (override) return override.replace(/\/+$/, "");
  return mode === "SANDBOX" ? "https://api-sandbox.kkiapay.me" : "https://api.kkiapay.me";
}

function payoutInitPathForMode(mode: KkiapayMode) {
  const override = String(process.env.KIKI_PAYOUT_INIT_PATH || "").trim();
  if (override) return override.startsWith("/") ? override : `/${override}`;
  // NOTE: Endpoint may differ; keep it centralized for fast patching.
  return mode === "SANDBOX" ? "/api/v1/payouts/request" : "/api/v1/payouts/request";
}

function payoutVerifyPathForMode(_mode: KkiapayMode) {
  const override = String(process.env.KIKI_PAYOUT_VERIFY_PATH || "").trim();
  if (override) return override.startsWith("/") ? override : `/${override}`;
  return "/api/v1/payouts/status";
}

export async function kkiapayPayoutInit(input: {
  amount: number;
  currency: string;
  payoutMethod: string;
  destination: Record<string, any>;
  reference: string;
  description: string;
  mode: KkiapayMode;
  publicKey: string;
  privateKey: string;
  secret: string;
}) {
  const base = baseForMode(input.mode);
  const url = `${base}${payoutInitPathForMode(input.mode)}`;

  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
    "x-api-key": String(input.publicKey || "").trim(),
    "x-private-key": String(input.privateKey || "").trim(),
    "x-secret-key": String(input.secret || "").trim(),
  };

  if (!headers["x-api-key"] || !headers["x-private-key"] || !headers["x-secret-key"]) {
    throw new Error("KKiaPay payout keys are missing (public/private/secret)");
  }

  const body = {
    amount: Math.max(1, Math.round(Number(input.amount || 0))),
    currency: String(input.currency || "XOF").trim().toUpperCase() || "XOF",
    reference: input.reference,
    description: input.description,
    payoutMethod: input.payoutMethod,
    destination: input.destination ?? {},
    metadata: { reference: input.reference },
  };

  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const raw = await resp.json().catch(() => null);
  if (!resp.ok) {
    const message = typeof raw?.message === "string" && raw.message.trim() ? raw.message.trim() : `Payout init failed (${resp.status})`;
    throw new Error(message);
  }

  const externalRef = String(raw?.payoutId || raw?.payout_id || raw?.transactionId || raw?.transaction_id || raw?.id || "").trim() || null;
  const statusRaw = String(raw?.status || raw?.state || "").trim().toLowerCase();
  const normalizedStatus =
    statusRaw.includes("success") || statusRaw.includes("complete")
      ? "completed"
      : statusRaw.includes("fail") || statusRaw.includes("error")
        ? "failed"
        : statusRaw.includes("cancel")
          ? "cancelled"
          : statusRaw.includes("process") || statusRaw.includes("pending")
            ? "processing"
            : "processing";

  return { ok: true as const, externalRef, normalizedStatus, raw };
}

export async function kkiapayPayoutVerify(input: {
  externalRef: string;
  mode: KkiapayMode;
  publicKey: string;
  privateKey: string;
  secret: string;
}) {
  const externalRef = String(input.externalRef || "").trim();
  if (!externalRef) throw new Error("externalRef is required");

  const base = baseForMode(input.mode);
  const url = `${base}${payoutVerifyPathForMode(input.mode)}`;

  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded",
    "x-api-key": String(input.publicKey || "").trim(),
    "x-private-key": String(input.privateKey || "").trim(),
    "x-secret-key": String(input.secret || "").trim(),
  };

  const body = new URLSearchParams({ payoutId: externalRef, payout_id: externalRef, transactionId: externalRef }).toString();
  const resp = await fetch(url, { method: "POST", headers, body });
  const raw = await resp.json().catch(() => null);
  if (!resp.ok) {
    const message = typeof raw?.message === "string" && raw.message.trim() ? raw.message.trim() : `Payout verify failed (${resp.status})`;
    throw new Error(message);
  }

  const statusRaw = String(raw?.status || raw?.state || "").trim().toLowerCase();
  const normalizedStatus =
    statusRaw.includes("success") || statusRaw.includes("complete")
      ? "completed"
      : statusRaw.includes("fail") || statusRaw.includes("error")
        ? "failed"
        : statusRaw.includes("cancel")
          ? "cancelled"
          : statusRaw.includes("process") || statusRaw.includes("pending")
            ? "processing"
            : "processing";

  return { ok: true as const, normalizedStatus, statusRaw, raw };
}

