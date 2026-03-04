import crypto from "crypto";
import { sendTwilioMessage } from "../communications/twilio";

export type WaSendDebugInfo = {
  request?: {
    url?: string;
    method?: string;
    body?: unknown;
  };
  response?: {
    httpStatus?: number;
    body?: unknown;
  };
  notes?: string[];
};

export type WaSendResult =
  | { ok: true; waMessageId: string; dryRun?: boolean; debug?: WaSendDebugInfo }
  | { ok: false; error: string; errorCode?: string; dryRun?: boolean; debug?: WaSendDebugInfo };

export function normalizeWaPhoneE164(input: string): string {
  const trimmed = (input || "").trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  return `+${digits}`;
}

export function hashOtp(otp: string) {
  const salt = process.env.WHATSAPP_OTP_SALT || "local-dev";
  return crypto.createHash("sha256").update(`${salt}:${otp}`).digest("hex");
}

export function createOtpCode() {
  const n = crypto.randomInt(0, 1000000);
  return String(n).padStart(6, "0");
}

export function verifyMetaSignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return true; // allow in dev when not configured
  if (!rawBody || !signatureHeader) return false;

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.replace(/^sha256=/, "").trim();
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

export async function sendWaText(toE164: string, text: string): Promise<WaSendResult> {
  const to = normalizeWaPhoneE164(toE164);
  const message = String(text || "").trim();
  if (!to) {
    return {
      ok: false,
      error: "Invalid WhatsApp number. Use E.164 format.",
      errorCode: "invalid_to",
    };
  }
  if (!message) {
    return {
      ok: false,
      error: "Message body is required",
      errorCode: "empty_body",
    };
  }

  const out = await sendTwilioMessage({
    channel: "whatsapp",
    toE164: to,
    body: message,
  });

  if (!out.ok) {
    return {
      ok: false,
      error: out.errorMessage || "Failed to send",
      errorCode: out.errorCode || undefined,
      debug: { response: { body: out.raw ?? null } },
    };
  }

  return {
    ok: true,
    waMessageId: out.providerMessageId || `wa_${crypto.randomUUID()}`,
    debug: { response: { body: out.raw ?? null } },
  };
}

export async function sendWaTemplate(toE164: string, templateName: string, languageCode = "en_US"): Promise<WaSendResult> {
  const fallbackBody = `Template ${templateName} (${languageCode})`;
  return sendWaText(toE164, fallbackBody);
}
