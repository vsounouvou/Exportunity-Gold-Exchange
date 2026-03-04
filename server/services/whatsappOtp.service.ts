import twilio from "twilio";
import { normalizeE164 } from "../lib/communications/twilio";
import { getMessagingHealth, resolveMessagingEnv } from "../lib/messaging/config";

type OtpError = Error & {
  status?: number;
  code?: string;
};

export type WhatsAppOtpHealth = {
  provider: "twilio_verify";
  configured: boolean;
  missing: string[];
  sandboxMode: boolean;
  warnings: string[];
  whatsappFrom: string | null;
};

function isSandboxFrom(value: string) {
  return value.trim().toLowerCase() === "whatsapp:+14155238886";
}

function createOtpError(status: number, message: string, code: string): OtpError {
  const err = new Error(message) as OtpError;
  err.status = status;
  err.code = code;
  return err;
}

function toSafeTwilioError(error: any): OtpError {
  const code = String(error?.code || "twilio_verify_error");
  const status = Number.isFinite(Number(error?.status)) ? Number(error.status) : 502;
  const normalizedStatus = status >= 400 && status < 600 ? status : 502;
  const rawMessage = String(error?.message || "Twilio Verify request failed");

  const byCode: Record<string, string> = {
    "20003": "Twilio authentication failed. Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
    "20404": "Twilio Verify service not found. Check TWILIO_VERIFY_SERVICE_SID.",
    "21608": "Twilio trial account can only send to verified destinations.",
    "60200": "Invalid OTP code or phone format.",
    "60202": "Max verification check attempts reached. Request a new OTP.",
    "60203": "Max OTP send attempts reached. Try again later.",
    "60212": "Twilio Verify not enabled for WhatsApp channel on this service.",
  };

  const message = byCode[code] || rawMessage;
  const effectiveStatus = normalizedStatus === 500 ? 502 : normalizedStatus;
  return createOtpError(effectiveStatus, message, code);
}

let cachedTwilioClient: ReturnType<typeof twilio> | null = null;

function getTwilioClient() {
  if (cachedTwilioClient) return cachedTwilioClient;
  const resolved = resolveMessagingEnv();
  const accountSid = String(resolved.accountSid || "").trim();
  const authToken = String(resolved.authToken || "").trim();
  cachedTwilioClient = twilio(accountSid, authToken);
  return cachedTwilioClient;
}

export function getWhatsAppOtpHealth(): WhatsAppOtpHealth {
  const health = getMessagingHealth();
  const sandboxMode = isSandboxFrom(String(health.resolved.whatsappFrom || ""));
  const missing = health.whatsappOtp.enabled
    ? []
    : health.missing.filter(
        (key) =>
          key === "TWILIO_ACCOUNT_SID" ||
          key === "TWILIO_AUTH_TOKEN" ||
          key === "TWILIO_VERIFY_SERVICE_SID",
      );

  return {
    provider: "twilio_verify",
    configured: health.whatsappOtp.enabled,
    missing,
    sandboxMode,
    warnings: health.warnings,
    whatsappFrom: health.resolved.whatsappFrom || null,
  };
}

export function assertWhatsAppOtpConfigured() {
  const health = getWhatsAppOtpHealth();
  if (!health.configured) {
    throw createOtpError(
      503,
      `WhatsApp OTP is not configured: missing ${health.missing.join(", ")}`,
      "otp_not_configured",
    );
  }
  return health;
}

export function normalizeOtpPhone(phoneRaw: string) {
  return normalizeE164(phoneRaw);
}

export function normalizeOtpCode(codeRaw: string) {
  return String(codeRaw || "").replace(/[^\d]/g, "").slice(0, 6);
}

export function isOtpCode(code: string) {
  return /^\d{6}$/.test(code);
}

export async function sendOtp(phoneE164: string) {
  const health = assertWhatsAppOtpConfigured();
  const to = normalizeOtpPhone(phoneE164);
  if (!to) {
    throw createOtpError(400, "Phone must be in E.164 format (example: +2250100000229).", "invalid_phone");
  }

  try {
    const serviceSid = String(resolveMessagingEnv().verifyServiceSid || "").trim();
    const service = getTwilioClient().verify.v2.services(serviceSid);
    let result: any;
    try {
      result = await service.verifications.create({
        to: `whatsapp:${to}`,
        channel: "whatsapp",
      });
    } catch (error: any) {
      if (String(error?.code || "") !== "60200") throw error;
      // Some Verify configurations require plain E.164 with channel=whatsapp.
      result = await service.verifications.create({
        to,
        channel: "whatsapp",
      });
    }

    return {
      provider: health.provider,
      status: String(result?.status || "pending"),
      to: String(result?.to || `whatsapp:${to}`),
      sid: String(result?.sid || ""),
      sandboxMode: health.sandboxMode,
    };
  } catch (error: any) {
    throw toSafeTwilioError(error);
  }
}

export async function verifyOtp(phoneE164: string, code: string) {
  assertWhatsAppOtpConfigured();
  const to = normalizeOtpPhone(phoneE164);
  if (!to) {
    throw createOtpError(400, "Phone must be in E.164 format (example: +2250100000229).", "invalid_phone");
  }

  const normalizedCode = normalizeOtpCode(code);
  if (!isOtpCode(normalizedCode)) {
    throw createOtpError(400, "Code must be 6 digits.", "invalid_code");
  }

  try {
    const serviceSid = String(resolveMessagingEnv().verifyServiceSid || "").trim();
    const service = getTwilioClient().verify.v2.services(serviceSid);
    let result: any;
    try {
      result = await service.verificationChecks.create({
        to: `whatsapp:${to}`,
        code: normalizedCode,
      });
    } catch (error: any) {
      if (String(error?.code || "") !== "60200") throw error;
      result = await service.verificationChecks.create({
        to,
        code: normalizedCode,
      });
    }

    const approved = String(result?.status || "").toLowerCase() === "approved";
    if (!approved) {
      throw createOtpError(400, "OTP expired or invalid", "otp_invalid");
    }

    return {
      provider: "twilio_verify" as const,
      approved,
      status: String(result?.status || "approved"),
      to: String(result?.to || `whatsapp:${to}`),
      sid: String(result?.sid || ""),
    };
  } catch (error: any) {
    if ((error as OtpError)?.code === "otp_invalid") throw error;
    throw toSafeTwilioError(error);
  }
}
