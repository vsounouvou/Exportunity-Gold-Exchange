export type SmsDeliveryMode = "messaging_service" | "from_number" | null;

export type MessagingResolvedEnv = {
  accountSid: string | null;
  authToken: string | null;
  messagingServiceSid: string | null;
  smsFrom: string | null;
  whatsappFrom: string | null;
  verifyServiceSid: string | null;
  voiceFrom: string | null;
  envNamespace: string;
};

export type MessagingHealth = {
  configured: boolean;
  missing: string[];
  warnings: string[];
  resolved: MessagingResolvedEnv;
  sms: {
    enabled: boolean;
    via: SmsDeliveryMode;
  };
  whatsappOtp: {
    enabled: boolean;
    verifyServiceSidPresent: boolean;
  };
  sandboxMode: boolean;
};

const PLACEHOLDER_PATTERNS = [
  /^\[.*\]$/i,
  /^<.*>$/i,
  /changeme/i,
  /replace/i,
  /example/i,
  /dummy/i,
  /placeholder/i,
  /your[_-]?/i,
  /xxxx+/i,
  /\.{3,}/,
];

function normalizeTenantKey(tenantKey: string | null | undefined) {
  const raw = String(tenantKey || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_");
  return raw || null;
}

function looksPlaceholder(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return true;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function looksValidAccountSid(value: string | null) {
  if (!value) return false;
  return /^AC[a-z0-9]{32}$/i.test(value);
}

function looksValidAuthToken(value: string | null) {
  if (!value) return false;
  return /^[a-z0-9]{24,64}$/i.test(value);
}

function looksValidMessagingServiceSid(value: string | null) {
  if (!value) return false;
  return /^MG[a-z0-9]{32}$/i.test(value);
}

function looksValidVerifyServiceSid(value: string | null) {
  if (!value) return false;
  return /^VA[a-z0-9]{32}$/i.test(value);
}

function looksValidE164(value: string | null) {
  if (!value) return false;
  return /^\+[1-9]\d{6,14}$/.test(value);
}

function looksValidWhatsappFrom(value: string | null) {
  if (!value) return false;
  return /^whatsapp:\+[1-9]\d{6,14}$/i.test(value);
}

function readEnvWithTenantOverride(key: string, tenantKey?: string | null) {
  const tenant = normalizeTenantKey(tenantKey);
  if (tenant) {
    const prefixed = String(process.env[`${tenant}_${key}`] || "").trim();
    if (prefixed) return { value: prefixed, namespace: `${tenant}_` };
    const suffixed = String(process.env[`${key}_${tenant}`] || "").trim();
    if (suffixed) return { value: suffixed, namespace: `_${tenant}` };
  }
  const global = String(process.env[key] || "").trim();
  return { value: global, namespace: "global" };
}

function normalizeOptional(value: string) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

export function resolveMessagingEnv(tenantKey?: string | null): MessagingResolvedEnv {
  const accountSid = readEnvWithTenantOverride("TWILIO_ACCOUNT_SID", tenantKey);
  const authToken = readEnvWithTenantOverride("TWILIO_AUTH_TOKEN", tenantKey);
  const messagingServiceSid = readEnvWithTenantOverride("TWILIO_MESSAGING_SERVICE_SID", tenantKey);
  const smsFrom = readEnvWithTenantOverride("TWILIO_SMS_FROM", tenantKey);
  const whatsappFrom = readEnvWithTenantOverride("TWILIO_WHATSAPP_FROM", tenantKey);
  const verifyServiceSid = readEnvWithTenantOverride("TWILIO_VERIFY_SERVICE_SID", tenantKey);
  const voiceFrom = readEnvWithTenantOverride("TWILIO_VOICE_FROM", tenantKey);

  const namespacePriority = [
    accountSid.namespace,
    authToken.namespace,
    messagingServiceSid.namespace,
    smsFrom.namespace,
    whatsappFrom.namespace,
    verifyServiceSid.namespace,
    voiceFrom.namespace,
  ].find((entry) => entry !== "global");

  return {
    accountSid: normalizeOptional(accountSid.value),
    authToken: normalizeOptional(authToken.value),
    messagingServiceSid: normalizeOptional(messagingServiceSid.value),
    smsFrom: normalizeOptional(smsFrom.value),
    whatsappFrom: normalizeOptional(whatsappFrom.value),
    verifyServiceSid: normalizeOptional(verifyServiceSid.value),
    voiceFrom: normalizeOptional(voiceFrom.value),
    envNamespace: namespacePriority || "global",
  };
}

export function getMessagingHealth(tenantKey?: string | null): MessagingHealth {
  const resolved = resolveMessagingEnv(tenantKey);
  const missing: string[] = [];
  const warnings: string[] = [];

  const accountSidMissing = looksPlaceholder(resolved.accountSid || "") || !looksValidAccountSid(resolved.accountSid);
  const authTokenMissing = looksPlaceholder(resolved.authToken || "") || !looksValidAuthToken(resolved.authToken);
  if (accountSidMissing) missing.push("TWILIO_ACCOUNT_SID");
  if (authTokenMissing) missing.push("TWILIO_AUTH_TOKEN");

  const smsFromValid = looksValidE164(resolved.smsFrom);
  const messagingServiceValid = looksValidMessagingServiceSid(resolved.messagingServiceSid);
  if (resolved.smsFrom && !smsFromValid) warnings.push("TWILIO_SMS_FROM invalid E.164 format");
  if (resolved.messagingServiceSid && !messagingServiceValid) warnings.push("TWILIO_MESSAGING_SERVICE_SID format looks invalid");

  const smsVia: SmsDeliveryMode = messagingServiceValid ? "messaging_service" : smsFromValid ? "from_number" : null;
  const smsEnabled = Boolean(smsVia);

  const verifySidValid = looksValidVerifyServiceSid(resolved.verifyServiceSid);
  if (resolved.verifyServiceSid && !verifySidValid) warnings.push("TWILIO_VERIFY_SERVICE_SID format looks invalid");

  const whatsappFromValid = looksValidWhatsappFrom(resolved.whatsappFrom);
  if (resolved.whatsappFrom && !whatsappFromValid) warnings.push("TWILIO_WHATSAPP_FROM format looks invalid");

  const sandboxMode = String(resolved.whatsappFrom || "").toLowerCase() === "whatsapp:+14155238886";
  if (sandboxMode) warnings.push("Twilio WhatsApp Sandbox mode");

  const whatsappOtpEnabled = verifySidValid && !accountSidMissing && !authTokenMissing;
  if (verifySidValid && !whatsappFromValid && resolved.whatsappFrom) {
    warnings.push("WhatsApp sender format invalid; OTP may fail");
  }

  const configured = !accountSidMissing && !authTokenMissing;

  if (!smsEnabled) {
    missing.push("TWILIO_SMS_FROM|TWILIO_MESSAGING_SERVICE_SID");
  }
  if (!verifySidValid) {
    missing.push("TWILIO_VERIFY_SERVICE_SID");
  }

  return {
    configured,
    missing: Array.from(new Set(missing)),
    warnings,
    resolved,
    sms: {
      enabled: smsEnabled,
      via: smsVia,
    },
    whatsappOtp: {
      enabled: whatsappOtpEnabled,
      verifyServiceSidPresent: verifySidValid,
    },
    sandboxMode,
  };
}

export function validateMessagingEnvAtBoot() {
  const health = getMessagingHealth();
  const anyTwilioEnvSet = [
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN,
    process.env.TWILIO_WHATSAPP_FROM,
    process.env.TWILIO_SMS_FROM,
    process.env.TWILIO_MESSAGING_SERVICE_SID,
    process.env.TWILIO_VERIFY_SERVICE_SID,
    process.env.TWILIO_VOICE_FROM,
  ].some((v) => String(v || "").trim().length > 0);

  if (!anyTwilioEnvSet) return health;
  if (!health.configured) {
    throw new Error(`Twilio runtime misconfigured (missing ${health.missing.filter((key) => key !== "TWILIO_VERIFY_SERVICE_SID" && key !== "TWILIO_SMS_FROM|TWILIO_MESSAGING_SERVICE_SID").join(", ") || "core credentials"})`);
  }
  return health;
}
