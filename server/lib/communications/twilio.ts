import crypto from "crypto";
import twilio from "twilio";
import { getMessagingHealth, resolveMessagingEnv, validateMessagingEnvAtBoot } from "../messaging/config";

export type TwilioChannel = "sms" | "whatsapp";

export type TwilioSendParams = {
  channel: TwilioChannel;
  toE164: string;
  body?: string;
  contentSid?: string | null;
  contentVariables?: Record<string, string> | null;
  mediaUrls?: string[] | null;
  statusCallbackUrl?: string | null;
};

export type TwilioSendResult = {
  ok: boolean;
  providerMessageId: string | null;
  status: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  raw: Record<string, unknown> | null;
};

export function resolveTwilioProviderErrorMessage(errorCode: string | null | undefined, errorMessage: string | null | undefined) {
  const direct = String(errorMessage || "").trim();
  if (direct) return direct;

  const code = String(errorCode || "").trim();
  if (!code) return null;

  const sandboxModeRaw = String(process.env.TWILIO_SANDBOX_MODE || "").trim().toLowerCase();
  const sandboxMode = ["1", "true", "yes", "y", "on"].includes(sandboxModeRaw);
  const sandboxFrom = String(process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886").trim();

  const hints: Record<string, string> = {
    "63016": sandboxMode
      ? `WhatsApp delivery blocked (Twilio Sandbox + no active user session). Ask the recipient to join your sandbox first, then retry, or use a pre-approved template. Sender: ${sandboxFrom}.`
      : "WhatsApp delivery blocked (outside 24-hour customer care window or no active user-initiated session). Send a pre-approved template or wait for an inbound user message.",
    "21608": "Trial Twilio account can only message verified recipient numbers. Verify the destination number in Twilio Console.",
    "20003": "Twilio authentication failed. Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
  };

  return hints[code] || null;
}

function parsePositiveInt(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientTwilioError(error: any) {
  const message = String(error?.message || error || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return (
    message.includes("etimedout") ||
    message.includes("socket hang up") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("eai_again") ||
    message.includes("enotfound") ||
    code === "etimedout" ||
    code === "econnreset" ||
    code === "econnrefused" ||
    code === "eai_again" ||
    code === "enotfound"
  );
}

async function callTwilioWithRetry<T>(request: () => Promise<T>) {
  const maxAttempts = parsePositiveInt(process.env.TWILIO_SEND_MAX_ATTEMPTS, 3);
  const baseDelayMs = parsePositiveInt(process.env.TWILIO_SEND_RETRY_BASE_MS, 350);
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await request();
    } catch (error: any) {
      lastError = error;
      if (attempt >= maxAttempts || !isTransientTwilioError(error)) {
        throw error;
      }
      const backoffMs = baseDelayMs * attempt;
      console.warn(
        `[twilio] transient send failure (attempt ${attempt}/${maxAttempts}) code=${String(error?.code || "n/a")} message=${String(error?.message || error)}; retrying in ${backoffMs}ms`,
      );
      await sleep(backoffMs);
    }
  }

  throw lastError || new Error("Twilio send failed");
}

export function normalizeE164(value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const normalized = s.replace(/\s+/g, "");
  if (!/^\+[1-9]\d{6,14}$/.test(normalized)) return null;
  return normalized;
}

export function toWhatsAppAddress(e164: string) {
  return `whatsapp:${e164}`;
}

export function normalizeTwilioAddress(value: unknown): { channel: TwilioChannel; addressE164: string } | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.startsWith("whatsapp:")) {
    const e164 = normalizeE164(raw.slice("whatsapp:".length));
    if (!e164) return null;
    return { channel: "whatsapp", addressE164: e164 };
  }
  const e164 = normalizeE164(raw);
  if (!e164) return null;
  return { channel: "sms", addressE164: e164 };
}

export function resolveTwilioStatusCallbackUrl() {
  const base = String(
    process.env.TWILIO_STATUS_CALLBACK_BASE_URL || process.env.PUBLIC_BASE_URL || process.env.TWILIO_APP_BASE_URL || "",
  ).trim();
  if (!base) return null;
  const rawPath = String(process.env.TWILIO_WEBHOOK_PATH || "").trim();
  const path = rawPath || "/api/webhooks/twilio/status";
  try {
    if (/^https?:\/\//i.test(path)) return new URL(path).toString();
    return new URL(path.startsWith("/") ? path : `/${path}`, base).toString();
  } catch {
    return null;
  }
}

function getTwilioClient() {
  const resolved = resolveMessagingEnv();
  const accountSid = String(resolved.accountSid || "").trim();
  const authToken = String(resolved.authToken || "").trim();
  if (!accountSid) throw new Error("TWILIO_ACCOUNT_SID missing");
  if (!authToken) throw new Error("TWILIO_AUTH_TOKEN missing");
  const timeout = parsePositiveInt(process.env.TWILIO_HTTP_TIMEOUT_MS, 10_000);
  const region = String(process.env.TWILIO_REGION || "").trim();
  const edge = String(process.env.TWILIO_EDGE || "").trim();
  const clientOptions: Record<string, unknown> = { timeout };
  if (region) clientOptions.region = region;
  if (edge) clientOptions.edge = edge;
  return twilio(accountSid, authToken, clientOptions as any);
}

export function getTwilioConfig() {
  const resolved = resolveMessagingEnv();
  const health = getMessagingHealth();
  const accountSid = String(resolved.accountSid || "").trim();
  const authToken = String(resolved.authToken || "").trim();
  const whatsappFrom = String(resolved.whatsappFrom || "").trim();
  const smsFrom = String(resolved.smsFrom || "").trim();
  const messagingServiceSid = String(resolved.messagingServiceSid || "").trim();
  const voiceFrom = String(resolved.voiceFrom || "").trim();
  const verifyServiceSid = String(resolved.verifyServiceSid || "").trim();
  const webhookPath = String(process.env.TWILIO_WEBHOOK_PATH || "").trim() || null;
  const statusCallbackBaseUrl =
    String(process.env.TWILIO_STATUS_CALLBACK_BASE_URL || process.env.PUBLIC_BASE_URL || process.env.TWILIO_APP_BASE_URL || "").trim() ||
    null;
  const sandboxModeRaw = String(process.env.TWILIO_SANDBOX_MODE || "").trim().toLowerCase();
  const sandboxMode =
    sandboxModeRaw
      ? ["1", "true", "yes", "y", "on"].includes(sandboxModeRaw)
      : whatsappFrom.toLowerCase() === "whatsapp:+14155238886";

  return {
    accountSid: accountSid || null,
    accountSidLooksValid: /^AC[a-z0-9]{32}$/i.test(accountSid),
    authTokenPresent: !!authToken,
    authTokenLength: authToken.length,
    authTokenLooksValid: authToken.length === 32,
    whatsappFrom: whatsappFrom || null,
    smsFrom: smsFrom || null,
    messagingServiceSid: messagingServiceSid || null,
    voiceFrom: voiceFrom || null,
    verifyServiceSidPresent: !!verifyServiceSid,
    publicBaseUrl: statusCallbackBaseUrl,
    statusCallbackBaseUrl,
    webhookPath,
    sandboxMode,
    envNamespace: resolved.envNamespace,
    missing: health.missing,
    warnings: health.warnings,
    smsVia: health.sms.via,
    smsEnabled: health.sms.enabled,
    whatsappOtpEnabled: health.whatsappOtp.enabled,
  };
}

function normalizeMediaUrls(value: unknown): string[] | null {
  if (value == null) return null;
  const raw = Array.isArray(value) ? value : [value];
  const urls = raw
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .slice(0, 10);
  if (!urls.length) return null;
  for (const u of urls) {
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    } catch {
      return null;
    }
  }
  return urls;
}

export async function sendTwilioMessage(params: TwilioSendParams): Promise<TwilioSendResult> {
  try {
    const toE164 = normalizeE164(params.toE164);
    if (!toE164) return { ok: false, providerMessageId: null, status: null, errorCode: "invalid_to", errorMessage: "Invalid E.164 number", raw: null };

    const body = String(params.body ?? "").trim();
    const contentSid = String(params.contentSid ?? "").trim() || null;
    const contentVariables =
      params.contentVariables && typeof params.contentVariables === "object"
        ? Object.fromEntries(
            Object.entries(params.contentVariables)
              .slice(0, 25)
              .map(([k, v]) => [String(k), String(v)]),
          )
        : null;

    if (!contentSid && !body) {
      return { ok: false, providerMessageId: null, status: null, errorCode: "empty_body", errorMessage: "Message body is required", raw: null };
    }
    if (contentSid && !/^H[XW][a-z0-9]{8,}$/i.test(contentSid)) {
      return { ok: false, providerMessageId: null, status: null, errorCode: "invalid_content_sid", errorMessage: "Invalid contentSid", raw: null };
    }

    const mediaUrls = normalizeMediaUrls(params.mediaUrls);
    if (params.mediaUrls != null && !mediaUrls) {
      return { ok: false, providerMessageId: null, status: null, errorCode: "invalid_media", errorMessage: "Invalid media URLs", raw: null };
    }

    const cfg = getTwilioConfig();
    const health = getMessagingHealth();
    if (!health.configured) {
      return {
        ok: false,
        providerMessageId: null,
        status: null,
        errorCode: "twilio_not_configured",
        errorMessage: `Twilio is not configured (${health.missing.join(", ")})`,
        raw: null,
      };
    }
    const statusCallback = params.statusCallbackUrl ?? resolveTwilioStatusCallbackUrl();

    if (params.channel === "whatsapp") {
      const from = String(cfg.whatsappFrom || "").trim();
      if (!from) {
        return {
          ok: false,
          providerMessageId: null,
          status: null,
          errorCode: "whatsapp_not_configured",
          errorMessage: "WhatsApp sending disabled (set TWILIO_WHATSAPP_FROM)",
          raw: null,
        };
      }
      const client = getTwilioClient();

      const msg = await callTwilioWithRetry(() =>
        client.messages.create({
          to: toWhatsAppAddress(toE164),
          from,
          ...(contentSid
            ? {
                contentSid,
                ...(contentVariables ? { contentVariables: JSON.stringify(contentVariables) } : {}),
                ...(body ? { body } : {}),
              }
            : { body }),
          ...(mediaUrls ? { mediaUrl: mediaUrls } : {}),
          ...(statusCallback ? { statusCallback } : {}),
        }),
      );

      const status = msg?.status ? String(msg.status).toLowerCase() : null;
      const errorCode = msg?.errorCode != null ? String(msg.errorCode) : null;
      const errorMessage = resolveTwilioProviderErrorMessage(
        errorCode,
        msg?.errorMessage != null ? String(msg.errorMessage) : null,
      );
      const providerRejected = !!errorCode || status === "failed" || status === "undelivered" || status === "canceled";

      return {
        ok: !providerRejected,
        providerMessageId: msg?.sid ? String(msg.sid) : null,
        status,
        errorCode,
        errorMessage,
        raw: {
          sid: msg?.sid,
          status,
          to: msg?.to,
          from: msg?.from,
          contentSid,
          contentVariables,
          errorCode,
          errorMessage,
          price: msg?.price,
          priceUnit: msg?.priceUnit,
        },
      };
    }

    const messagingServiceSid = String(cfg.messagingServiceSid || "").trim();
    const smsFrom = String(cfg.smsFrom || "").trim();
    if (!messagingServiceSid && !smsFrom) {
      return {
        ok: false,
        providerMessageId: null,
        status: null,
        errorCode: "sms_not_configured",
        errorMessage: "SMS sending disabled (set TWILIO_SMS_FROM or TWILIO_MESSAGING_SERVICE_SID)",
        raw: null,
      };
    }
    const client = getTwilioClient();

    const msg = await callTwilioWithRetry(() =>
      client.messages.create({
        to: toE164,
        ...(messagingServiceSid ? { messagingServiceSid } : { from: smsFrom }),
        ...(contentSid
          ? {
              contentSid,
              ...(contentVariables ? { contentVariables: JSON.stringify(contentVariables) } : {}),
              ...(body ? { body } : {}),
            }
          : { body }),
        ...(mediaUrls ? { mediaUrl: mediaUrls } : {}),
        ...(statusCallback ? { statusCallback } : {}),
      }),
    );

    const status = msg?.status ? String(msg.status).toLowerCase() : null;
    const errorCode = msg?.errorCode != null ? String(msg.errorCode) : null;
    const errorMessage = resolveTwilioProviderErrorMessage(
      errorCode,
      msg?.errorMessage != null ? String(msg.errorMessage) : null,
    );
    const providerRejected = !!errorCode || status === "failed" || status === "undelivered" || status === "canceled";

    return {
      ok: !providerRejected,
      providerMessageId: msg?.sid ? String(msg.sid) : null,
      status,
      errorCode,
      errorMessage,
      raw: {
        sid: msg?.sid,
        status,
        to: msg?.to,
        from: msg?.from,
        contentSid,
        contentVariables,
        errorCode,
        errorMessage,
        price: msg?.price,
        priceUnit: msg?.priceUnit,
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      providerMessageId: null,
      status: null,
      errorCode: String(err?.code || "twilio_error"),
      errorMessage: String(err?.message || "Twilio send failed"),
      raw: null,
    };
  }
}

export function validateTwilioEnv() {
  validateMessagingEnvAtBoot();
}

// --- Webhook signature validation (Twilio)
// Twilio signs the full URL + form params (sorted). Signature is base64(HMAC-SHA1(token, data)).
export function computeTwilioSignature(params: { url: string; body: Record<string, any>; authToken: string }) {
  const keys = Object.keys(params.body || {}).sort();
  let data = params.url;
  for (const k of keys) data += `${k}${params.body[k] ?? ""}`;
  return crypto.createHmac("sha1", params.authToken).update(data, "utf8").digest("base64");
}

export function verifyTwilioWebhookSignature(opts: {
  url: string;
  body: Record<string, any>;
  signatureHeader: string | null | undefined;
  authToken: string;
}) {
  const provided = String(opts.signatureHeader || "").trim();
  if (!provided) return { ok: false as const, reason: "missing_signature" };

  const expected = computeTwilioSignature({ url: opts.url, body: opts.body, authToken: opts.authToken });
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return { ok: false as const, reason: "signature_mismatch" };
    const ok = crypto.timingSafeEqual(a, b);
    return ok ? { ok: true as const } : { ok: false as const, reason: "signature_mismatch" };
  } catch {
    return { ok: false as const, reason: "signature_invalid" };
  }
}
