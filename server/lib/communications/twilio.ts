import crypto from "crypto";
import twilio from "twilio";
import {
  createOutboundMessageLog,
  finalizeOutboundMessageLog,
} from "./message-logs";
import {
  isSandboxWhatsAppSender,
  resolveSender,
  type ResolvableTwilioChannel,
  type ResolvedSender,
  type SenderResolutionSource,
} from "./sender-resolution";
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

export type SendTenantMessageInput = {
  tenantId: number;
  agentId?: number | null;
  agentKey?: string | null;
  to: string;
  body?: string | null;
  channel: ResolvableTwilioChannel;
  templateName?: string | null;
  templatePayload?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  mediaUrls?: string[] | null;
  statusCallbackUrl?: string | null;
};

export type SendTenantMessageResult = TwilioSendResult & {
  channel: ResolvableTwilioChannel;
  outboundLogId: number | null;
  finalBody: string | null;
  fromAddress: string | null;
  resolutionSource: SenderResolutionSource | null;
  isSandbox: boolean;
  verifyServiceSid: string | null;
  messagingServiceSid: string | null;
};

type TwilioErrorContext = {
  sandboxMode?: boolean;
  sandboxFrom?: string | null;
};

type TwilioResolvedSendParams = {
  channel: TwilioChannel;
  toE164: string;
  body?: string | null;
  fromAddress?: string | null;
  messagingServiceSid?: string | null;
  contentSid?: string | null;
  contentVariables?: Record<string, string> | null;
  mediaUrls?: string[] | null;
  statusCallbackUrl?: string | null;
};

type ResolvedTemplateDispatch = {
  templateName: string | null;
  contentSid: string | null;
  contentVariables: Record<string, string> | null;
  language: string | null;
};

export class TenantMessageError extends Error {
  status: number;
  code: string;
  providerErrorCode: string | null;

  constructor(message: string, code: string, status = 400, providerErrorCode: string | null = null) {
    super(message);
    this.name = "TenantMessageError";
    this.status = status;
    this.code = code;
    this.providerErrorCode = providerErrorCode;
  }
}

export function resolveTwilioProviderErrorMessage(
  errorCode: string | null | undefined,
  errorMessage: string | null | undefined,
  context?: TwilioErrorContext,
) {
  const direct = String(errorMessage || "").trim();
  if (direct) return direct;

  const code = String(errorCode || "").trim();
  if (!code) return null;

  const sandboxModeRaw = String(process.env.TWILIO_SANDBOX_MODE || "").trim().toLowerCase();
  const sandboxMode =
    typeof context?.sandboxMode === "boolean"
      ? context.sandboxMode
      : ["1", "true", "yes", "y", "on"].includes(sandboxModeRaw);
  const sandboxFrom = String(context?.sandboxFrom || process.env.TWILIO_WHATSAPP_FROM || "").trim();

  const hints: Record<string, string> = {
    "21211": "Invalid destination number. Use a real E.164 phone number (example: +2250100000229).",
    "21608": "Trial Twilio account can only message verified recipient numbers. Verify the destination number in Twilio Console.",
    "20003": "Twilio authentication failed. Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
    "20404": "Twilio resource not found. Check the sender, messaging service, or verify service configuration.",
    "63015": sandboxMode
      ? `WhatsApp delivery blocked because the recipient has not joined your Twilio WhatsApp Sandbox yet. Ask them to join the sandbox first, then retry. Sender: ${sandboxFrom}.`
      : "WhatsApp delivery blocked because the destination cannot receive this business-initiated WhatsApp message yet. Configure an approved production WhatsApp sender and use an approved template when required.",
    "63016": sandboxMode
      ? `WhatsApp delivery blocked because there is no active Twilio WhatsApp Sandbox session. Ask the recipient to join the sandbox first, then retry, or use a template. Sender: ${sandboxFrom}.`
      : "WhatsApp delivery blocked because there is no active 24-hour session. Use an approved WhatsApp template or wait for an inbound customer message.",
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
  const sandboxMode = ["1", "true", "yes", "y", "on"].includes(sandboxModeRaw);

  return {
    accountSid: accountSid || null,
    accountSidLooksValid: /^AC[a-z0-9]{32}$/i.test(accountSid),
    authTokenPresent: !!authToken,
    authTokenLength: authToken.length,
    authTokenLooksValid: authToken.length >= 24,
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

function normalizeContentVariables(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 25)
      .map(([k, v]) => [String(k), String(v)]),
  );
}

function appendSignature(body: string | null, signature: string | null) {
  const normalizedBody = String(body || "").trim();
  const normalizedSignature = String(signature || "").trim();
  if (!normalizedSignature) return normalizedBody || null;
  if (!normalizedBody) return normalizedSignature;
  if (normalizedBody.includes(normalizedSignature)) return normalizedBody;
  return `${normalizedBody}\n\n${normalizedSignature}`;
}

export function resolveTemplateDispatch(input: {
  templateName?: string | null;
  templatePayload?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}) {
  const templatePayload = input.templatePayload ?? null;
  const metadata = input.metadata ?? null;

  const directTemplateName = String(input.templateName || templatePayload?.templateName || templatePayload?.name || "").trim() || null;
  const directContentSid =
    String(
      templatePayload?.contentSid ||
        templatePayload?.content_sid ||
        metadata?.contentSid ||
        metadata?.content_sid ||
        "",
    ).trim() || null;

  const inferredContentSid =
    directContentSid ||
    (directTemplateName && /^H[XW][a-z0-9]{8,}$/i.test(directTemplateName) ? directTemplateName : null);

  const directVariables =
    normalizeContentVariables(templatePayload?.contentVariables) ||
    normalizeContentVariables(templatePayload?.content_variables) ||
    normalizeContentVariables(templatePayload?.variables) ||
    normalizeContentVariables(metadata?.contentVariables) ||
    normalizeContentVariables(metadata?.content_variables);

  const language = String(templatePayload?.language || metadata?.language || "").trim() || null;

  return {
    templateName: directTemplateName,
    contentSid: inferredContentSid,
    contentVariables: directVariables,
    language,
  } satisfies ResolvedTemplateDispatch;
}

export function assertResolvedSenderForChannel(channel: ResolvableTwilioChannel, resolvedSender: ResolvedSender) {
  if (channel === "verify_sms" || channel === "verify_whatsapp") {
    if (!resolvedSender.verifyServiceSid) {
      throw new TenantMessageError("Verify Service SID is missing for this tenant", "missing_verify_service_sid", 409);
    }
    return;
  }

  if (channel === "sms") {
    if (!resolvedSender.messagingServiceSid && !resolvedSender.fromAddress) {
      throw new TenantMessageError(
        "SMS sender is not configured for this tenant",
        "missing_sms_sender",
        409,
      );
    }
    return;
  }

  const status = String(resolvedSender.whatsappSenderStatus || "").trim().toLowerCase();
  const activeSenderStatuses = new Set(["approved", "active", "connected", "verified", "live", "configured"]);
  if (resolvedSender.isSandbox) return;
  if (!resolvedSender.fromAddress) {
    throw new TenantMessageError(
      "Missing production WhatsApp sender for this tenant",
      "missing_production_whatsapp_sender",
      409,
    );
  }
  if (isSandboxWhatsAppSender(resolvedSender.fromAddress) && !resolvedSender.useSandboxForDev) {
    throw new TenantMessageError(
      "Missing production WhatsApp sender for this tenant",
      "missing_production_whatsapp_sender",
      409,
    );
  }
  if (status && !activeSenderStatuses.has(status)) {
    throw new TenantMessageError(
      "WhatsApp sender is not yet approved or active for this tenant",
      "whatsapp_sender_not_active",
      409,
    );
  }
}

async function sendResolvedTwilioMessage(params: TwilioResolvedSendParams): Promise<TwilioSendResult> {
  try {
    const toE164 = normalizeE164(params.toE164);
    if (!toE164) {
      return {
        ok: false,
        providerMessageId: null,
        status: null,
        errorCode: "invalid_destination_number",
        errorMessage: "Invalid destination number. Use a real E.164 phone number (example: +2250100000229).",
        raw: null,
      };
    }

    const body = String(params.body ?? "").trim();
    const contentSid = String(params.contentSid ?? "").trim() || null;
    const contentVariables = normalizeContentVariables(params.contentVariables);

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

    const client = getTwilioClient();
    const payload: Record<string, unknown> = {
      ...(params.channel === "whatsapp" ? { to: toWhatsAppAddress(toE164) } : { to: toE164 }),
      ...(params.statusCallbackUrl ? { statusCallback: params.statusCallbackUrl } : {}),
      ...(mediaUrls ? { mediaUrl: mediaUrls } : {}),
    };

    if (params.channel === "whatsapp") {
      payload.from = params.fromAddress;
    } else if (params.messagingServiceSid) {
      payload.messagingServiceSid = params.messagingServiceSid;
    } else {
      payload.from = params.fromAddress;
    }

    if (contentSid) {
      // Twilio content-template sends must not include Body or MediaUrl.
      payload.contentSid = contentSid;
      if (contentVariables) payload.contentVariables = JSON.stringify(contentVariables);
      delete payload.mediaUrl;
    } else {
      payload.body = body;
    }

    const msg = await callTwilioWithRetry(() => client.messages.create(payload as any));
    const status = msg?.status ? String(msg.status).toLowerCase() : null;
    const errorCode = msg?.errorCode != null ? String(msg.errorCode) : null;
    const errorMessage = resolveTwilioProviderErrorMessage(errorCode, msg?.errorMessage != null ? String(msg.errorMessage) : null, {
      sandboxMode: params.channel === "whatsapp" ? isSandboxWhatsAppSender(params.fromAddress) : false,
      sandboxFrom: params.fromAddress ?? null,
    });
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
        messagingServiceSid: msg?.messagingServiceSid,
        contentSid,
        contentVariables,
        errorCode,
        errorMessage,
        price: msg?.price,
        priceUnit: msg?.priceUnit,
      },
    };
  } catch (err: any) {
    const errorCode = String(err?.code || "twilio_error");
    const errorMessage =
      resolveTwilioProviderErrorMessage(errorCode, String(err?.message || "Twilio send failed"), {
        sandboxMode: params.channel === "whatsapp" ? isSandboxWhatsAppSender(params.fromAddress) : false,
        sandboxFrom: params.fromAddress ?? null,
      }) || String(err?.message || "Twilio send failed");
    return {
      ok: false,
      providerMessageId: null,
      status: null,
      errorCode,
      errorMessage,
      raw: null,
    };
  }
}

export async function sendTwilioMessage(params: TwilioSendParams): Promise<TwilioSendResult> {
  const cfg = getTwilioConfig();
  return await sendResolvedTwilioMessage({
    channel: params.channel,
    toE164: params.toE164,
    body: params.body ?? null,
    fromAddress: params.channel === "whatsapp" ? cfg.whatsappFrom : cfg.smsFrom,
    messagingServiceSid: params.channel === "sms" ? cfg.messagingServiceSid : null,
    contentSid: params.contentSid ?? null,
    contentVariables: params.contentVariables ?? null,
    mediaUrls: params.mediaUrls ?? null,
    statusCallbackUrl: params.statusCallbackUrl ?? resolveTwilioStatusCallbackUrl(),
  });
}

export async function sendTenantMessage(input: SendTenantMessageInput): Promise<SendTenantMessageResult> {
  const parsedTo = normalizeTwilioAddress(input.to);
  const toE164 = parsedTo?.addressE164 || normalizeE164(input.to);
  if (!toE164) {
    throw new TenantMessageError(
      "Invalid destination number. Use a real E.164 phone number (example: +2250100000229).",
      "invalid_destination_number",
      400,
    );
  }

  const metadata = input.metadata ?? null;
  const template = resolveTemplateDispatch({
    templateName: input.templateName ?? null,
    templatePayload: input.templatePayload ?? null,
    metadata,
  });

  const resolvedSender = await resolveSender({
    tenantId: input.tenantId,
    agentId: input.agentId ?? null,
    agentKey: input.agentKey ?? null,
    channel: input.channel,
  });

  assertResolvedSenderForChannel(input.channel, resolvedSender);

  const finalBody =
    template.contentSid
      ? null
      : (
    input.channel === "verify_sms" || input.channel === "verify_whatsapp"
      ? String(input.body || "").trim() || null
      : appendSignature(String(input.body || "").trim() || null, resolvedSender.signature)
        );

  const businessInitiated =
    Boolean(metadata?.businessInitiated) || Boolean(metadata?.business_initiated) || Boolean(metadata?.requiresTemplate);

  if (input.channel === "whatsapp" && businessInitiated && !template.contentSid) {
    throw new TenantMessageError(
      "Approved WhatsApp template required for business-initiated messages",
      "template_required_for_business_whatsapp",
      409,
    );
  }

  if (input.channel === "whatsapp" && !resolvedSender.isSandbox && !resolvedSender.fromAddress) {
    throw new TenantMessageError(
      "Missing production WhatsApp sender for this tenant",
      "missing_production_whatsapp_sender",
      409,
    );
  }

  const outboundLog = await createOutboundMessageLog({
    tenantId: input.tenantId,
    agentId: resolvedSender.agentId,
    channel: input.channel,
    fromAddress: resolvedSender.fromAddress,
    toAddress: input.channel === "sms" || input.channel === "verify_sms" ? toE164 : toWhatsAppAddress(toE164),
    body: finalBody,
    templateName: template.templateName,
    templatePayload:
      template.contentSid || template.contentVariables || template.language
        ? {
            ...(template.contentSid ? { contentSid: template.contentSid } : {}),
            ...(template.contentVariables ? { contentVariables: template.contentVariables } : {}),
            ...(template.language ? { language: template.language } : {}),
            ...(input.templatePayload ?? {}),
          }
        : input.templatePayload ?? null,
  });

  const statusCallbackUrl = input.statusCallbackUrl ?? resolveTwilioStatusCallbackUrl();

  if (input.channel === "verify_sms" || input.channel === "verify_whatsapp") {
    try {
      const verifyServiceSid = String(resolvedSender.verifyServiceSid || "").trim();
      const service = getTwilioClient().verify.v2.services(verifyServiceSid);
      const channel = input.channel === "verify_whatsapp" ? "whatsapp" : "sms";
      const verification = await callTwilioWithRetry(() =>
        service.verifications.create({
          to: channel === "whatsapp" ? `whatsapp:${toE164}` : toE164,
          channel,
        } as any),
      );

      const result = {
        ok: true,
        providerMessageId: String(verification?.sid || ""),
        status: String(verification?.status || "pending").toLowerCase(),
        errorCode: null,
        errorMessage: null,
        raw: {
          sid: verification?.sid,
          status: verification?.status,
          to: verification?.to,
          channel,
        } as Record<string, unknown>,
      };

      await finalizeOutboundMessageLog(outboundLog.id, {
        twilioMessageSid: result.providerMessageId,
        status: result.status,
        twilioStatus: result.status,
        providerResponse: result.raw,
      });

      return {
        ...result,
        channel: input.channel,
        outboundLogId: outboundLog.id,
        finalBody,
        fromAddress: resolvedSender.fromAddress,
        resolutionSource: resolvedSender.resolutionSource,
        isSandbox: resolvedSender.isSandbox,
        verifyServiceSid: resolvedSender.verifyServiceSid,
        messagingServiceSid: resolvedSender.messagingServiceSid,
      };
    } catch (error: any) {
      const errorCode = String(error?.code || "twilio_verify_error");
      const errorMessage =
        resolveTwilioProviderErrorMessage(errorCode, String(error?.message || "Twilio Verify send failed"), {
          sandboxMode: resolvedSender.isSandbox,
          sandboxFrom: resolvedSender.fromAddress,
        }) || String(error?.message || "Twilio Verify send failed");

      await finalizeOutboundMessageLog(outboundLog.id, {
        status: "failed",
        twilioStatus: "failed",
        providerErrorCode: errorCode,
        providerErrorMessage: errorMessage,
      });

      throw new TenantMessageError(errorMessage, errorCode, Number(error?.status) || 502, errorCode);
    }
  }

  const transport = await sendResolvedTwilioMessage({
    channel: input.channel === "sms" ? "sms" : "whatsapp",
    toE164,
    body: finalBody,
    fromAddress: resolvedSender.fromAddress,
    messagingServiceSid: input.channel === "sms" ? resolvedSender.messagingServiceSid : null,
    contentSid: template.contentSid,
    contentVariables: template.contentVariables,
    mediaUrls: input.mediaUrls ?? null,
    statusCallbackUrl,
  });

  await finalizeOutboundMessageLog(outboundLog.id, {
    twilioMessageSid: transport.providerMessageId,
    status: transport.status || (transport.ok ? "sent" : "failed"),
    twilioStatus: transport.status,
    providerErrorCode: transport.errorCode,
    providerErrorMessage: transport.errorMessage,
    providerResponse: transport.raw,
  });

  if (!transport.ok) {
    throw new TenantMessageError(
      transport.errorMessage || "Twilio send failed",
      transport.errorCode || "twilio_send_failed",
      502,
      transport.errorCode,
    );
  }

  return {
    ...transport,
    channel: input.channel,
    outboundLogId: outboundLog.id,
    finalBody,
    fromAddress: resolvedSender.fromAddress,
    resolutionSource: resolvedSender.resolutionSource,
    isSandbox: resolvedSender.isSandbox,
    verifyServiceSid: resolvedSender.verifyServiceSid,
    messagingServiceSid: resolvedSender.messagingServiceSid,
  };
}

export async function sendSms(input: Omit<SendTenantMessageInput, "channel">) {
  return await sendTenantMessage({ ...input, channel: "sms" });
}

export async function sendWhatsApp(input: Omit<SendTenantMessageInput, "channel">) {
  return await sendTenantMessage({ ...input, channel: "whatsapp" });
}

export async function sendTemplateWhatsApp(input: {
  tenantId: number;
  agentId?: number | null;
  agentKey?: string | null;
  to: string;
  templateName?: string | null;
  templatePayload?: Record<string, unknown> | null;
  body?: string | null;
  metadata?: Record<string, unknown> | null;
  mediaUrls?: string[] | null;
}) {
  return await sendTenantMessage({
    ...input,
    channel: "whatsapp",
    metadata: { ...(input.metadata ?? {}), businessInitiated: true },
  });
}

export async function sendVerifyCode(input: {
  tenantId: number;
  agentId?: number | null;
  agentKey?: string | null;
  to: string;
  channel: "verify_sms" | "verify_whatsapp";
  metadata?: Record<string, unknown> | null;
}) {
  return await sendTenantMessage({
    tenantId: input.tenantId,
    agentId: input.agentId ?? null,
    agentKey: input.agentKey ?? null,
    to: input.to,
    channel: input.channel,
    body: null,
    metadata: input.metadata ?? null,
  });
}

export function validateTwilioEnv() {
  validateMessagingEnvAtBoot();
}

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
