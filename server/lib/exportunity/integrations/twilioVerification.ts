import crypto from "node:crypto";

const PROVIDER_TIMEOUT_MS = 12_000;
const TWILIO_ACCOUNT_BASE_URL = "https://api.twilio.com/2010-04-01";
const TWILIO_MESSAGING_V1_BASE_URL = "https://messaging.twilio.com/v1";
const TWILIO_MESSAGING_V2_BASE_URL = "https://messaging.twilio.com/v2";

type FetchLike = typeof fetch;

export type ExportunityTwilioVerificationState =
  | "not_configured"
  | "verified"
  | "unverified"
  | "provider_error";

export type ExportunityTwilioVerificationCheck = {
  configured: boolean;
  verified: boolean;
  state: ExportunityTwilioVerificationState;
  identifier: string | null;
  providerStatus: string | null;
  detail: string;
};

export type ExportunityTwilioVerification = {
  ready: boolean;
  checkedAt: string;
  mode: "read_only";
  credentialsNamespace: "EXPORTUNITY_";
  configurationFingerprint: string;
  externalActionPerformed: false;
  messageSent: false;
  checks: {
    account: ExportunityTwilioVerificationCheck;
    sms: ExportunityTwilioVerificationCheck;
    messagingService: ExportunityTwilioVerificationCheck;
    whatsapp: ExportunityTwilioVerificationCheck;
  };
  warnings: string[];
};

export type ExportunityTwilioPublicVerification = Omit<
  ExportunityTwilioVerification,
  "configurationFingerprint"
>;

type TwilioConfiguration = {
  accountSid: string;
  authToken: string;
  smsFrom: string;
  messagingServiceSid: string;
  whatsappFrom: string;
};

type ProviderResponse = {
  payload: Record<string, unknown>;
};

class TwilioProviderRequestError extends Error {
  constructor(
    readonly httpStatus: number | null,
    readonly providerCode: string | null,
  ) {
    super("Twilio provider request failed");
  }
}

function envValue(key: string) {
  return String(process.env[`EXPORTUNITY_${key}`] || "").trim();
}

function looksPlaceholder(input: string) {
  return (
    !input ||
    /(?:changeme|replace|example|placeholder|your[_-]?|xxxx+|\.\.\.)/i.test(
      input,
    )
  );
}

function validAccountSid(input: string) {
  return /^AC[a-f0-9]{32}$/i.test(input) && !looksPlaceholder(input);
}

function validAuthToken(input: string) {
  return /^[a-f0-9]{24,64}$/i.test(input) && !looksPlaceholder(input);
}

function validMessagingServiceSid(input: string) {
  return /^MG[a-f0-9]{32}$/i.test(input) && !looksPlaceholder(input);
}

function validSmsSender(input: string) {
  return /^\+[1-9]\d{6,14}$/.test(input) && !looksPlaceholder(input);
}

function validWhatsappSender(input: string) {
  return /^whatsapp:\+[1-9]\d{6,14}$/i.test(input) && !looksPlaceholder(input);
}

function readConfiguration(): TwilioConfiguration {
  return {
    accountSid: envValue("TWILIO_ACCOUNT_SID"),
    authToken: envValue("TWILIO_AUTH_TOKEN"),
    smsFrom: envValue("TWILIO_SMS_FROM"),
    messagingServiceSid: envValue("TWILIO_MESSAGING_SERVICE_SID"),
    whatsappFrom: envValue("TWILIO_WHATSAPP_FROM"),
  };
}

function configurationFingerprint(configuration: TwilioConfiguration) {
  return crypto
    .createHash("sha256")
    .update(
      [
        "exportunity-twilio-read-only-v1",
        configuration.accountSid,
        configuration.authToken,
        configuration.smsFrom,
        configuration.messagingServiceSid,
        configuration.whatsappFrom.toLowerCase(),
      ].join("\u0000"),
    )
    .digest("hex");
}

export function getExportunityTwilioConfigurationFingerprint() {
  return configurationFingerprint(readConfiguration());
}

export function toExportunityTwilioPublicVerification(
  verification: ExportunityTwilioVerification,
): ExportunityTwilioPublicVerification {
  const { configurationFingerprint: _privateFingerprint, ...publicResult } =
    verification;
  void _privateFingerprint;
  return publicResult;
}

function maskIdentifier(input: string) {
  if (!input) return null;
  const lower = input.toLowerCase();
  if (lower.startsWith("whatsapp:+")) {
    return `whatsapp:+••••${input.replace(/\D/g, "").slice(-4)}`;
  }
  if (input.startsWith("+")) {
    return `+••••${input.replace(/\D/g, "").slice(-4)}`;
  }
  if (/^[A-Z]{2}[a-z0-9]+$/i.test(input)) {
    return `${input.slice(0, 2).toUpperCase()}••••••${input.slice(-4)}`;
  }
  return "Configured";
}

function notConfiguredCheck(
  identifier: string,
  detail: string,
): ExportunityTwilioVerificationCheck {
  return {
    configured: false,
    verified: false,
    state: "not_configured",
    identifier: maskIdentifier(identifier),
    providerStatus: null,
    detail,
  };
}

function skippedProviderCheck(
  configured: boolean,
  identifier: string,
): ExportunityTwilioVerificationCheck {
  return configured
    ? {
        configured: true,
        verified: false,
        state: "provider_error",
        identifier: maskIdentifier(identifier),
        providerStatus: null,
        detail:
          "Skipped because the Exportunity Twilio account could not be verified.",
      }
    : notConfiguredCheck(identifier, "No valid Exportunity configuration was found.");
}

function safeProviderCode(value: unknown) {
  const parsed = String(value ?? "").trim();
  return /^[0-9]{3,8}$/.test(parsed) ? parsed : null;
}

async function providerGet(
  url: string,
  configuration: TwilioConfiguration,
  fetchImpl: FetchLike,
): Promise<ProviderResponse> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Basic ${Buffer.from(
          `${configuration.accountSid}:${configuration.authToken}`,
          "utf8",
        ).toString("base64")}`,
      },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    throw new TwilioProviderRequestError(null, null);
  }

  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new TwilioProviderRequestError(
      response.status,
      safeProviderCode(payload.code),
    );
  }
  return { payload };
}

function providerErrorCheck(
  identifier: string,
  error: unknown,
): ExportunityTwilioVerificationCheck {
  const requestError =
    error instanceof TwilioProviderRequestError ? error : null;
  const providerStatus = requestError?.httpStatus
    ? `HTTP_${requestError.httpStatus}`
    : "UNREACHABLE";
  const detail =
    requestError?.httpStatus === 401 || requestError?.httpStatus === 403
      ? "Twilio rejected the dedicated Exportunity credentials."
      : requestError?.httpStatus === 404
        ? "Twilio did not find the configured resource."
        : requestError?.httpStatus
          ? `Twilio returned HTTP ${requestError.httpStatus}${
              requestError.providerCode
                ? ` (code ${requestError.providerCode})`
                : ""
            }.`
          : "Twilio could not be reached before the read-only request timed out.";
  return {
    configured: true,
    verified: false,
    state: "provider_error",
    identifier: maskIdentifier(identifier),
    providerStatus,
    detail,
  };
}

function normalizedProviderStatus(value: unknown) {
  const status = String(value ?? "")
    .trim()
    .toUpperCase();
  return /^[A-Z][A-Z0-9_: -]{0,40}$/.test(status) ? status : "UNKNOWN";
}

async function verifyAccount(
  configuration: TwilioConfiguration,
  fetchImpl: FetchLike,
): Promise<ExportunityTwilioVerificationCheck> {
  try {
    const { payload } = await providerGet(
      `${TWILIO_ACCOUNT_BASE_URL}/Accounts/${encodeURIComponent(
        configuration.accountSid,
      )}.json`,
      configuration,
      fetchImpl,
    );
    const matches = String(payload.sid || "") === configuration.accountSid;
    const providerStatus = normalizedProviderStatus(payload.status);
    const verified = matches && providerStatus === "ACTIVE";
    return {
      configured: true,
      verified,
      state: verified ? "verified" : "unverified",
      identifier: maskIdentifier(configuration.accountSid),
      providerStatus,
      detail: verified
        ? "The dedicated Exportunity account is active at Twilio."
        : matches
          ? "The Twilio account exists but is not active."
          : "Twilio returned a different account identity.",
    };
  } catch (error) {
    return providerErrorCheck(configuration.accountSid, error);
  }
}

async function verifyOwnedSmsSender(
  configuration: TwilioConfiguration,
  fetchImpl: FetchLike,
): Promise<ExportunityTwilioVerificationCheck> {
  if (!validSmsSender(configuration.smsFrom)) {
    return notConfiguredCheck(
      configuration.smsFrom,
      "No valid dedicated Exportunity SMS sender is configured.",
    );
  }
  try {
    const url = new URL(
      `${TWILIO_ACCOUNT_BASE_URL}/Accounts/${encodeURIComponent(
        configuration.accountSid,
      )}/IncomingPhoneNumbers.json`,
    );
    url.searchParams.set("PhoneNumber", configuration.smsFrom);
    url.searchParams.set("PageSize", "50");
    const { payload } = await providerGet(
      url.toString(),
      configuration,
      fetchImpl,
    );
    const rows = Array.isArray(payload.incoming_phone_numbers)
      ? payload.incoming_phone_numbers
      : [];
    const exact = rows.find(
      (row: any) =>
        row &&
        String(row.phone_number || "") === configuration.smsFrom &&
        String(row.account_sid || "") === configuration.accountSid,
    ) as Record<string, any> | undefined;
    const smsCapable = exact?.capabilities?.sms === true;
    const verified = Boolean(exact && smsCapable);
    return {
      configured: true,
      verified,
      state: verified ? "verified" : "unverified",
      identifier: maskIdentifier(configuration.smsFrom),
      providerStatus: exact
        ? smsCapable
          ? "SMS_CAPABLE"
          : "SMS_NOT_CAPABLE"
        : "NOT_OWNED",
      detail: verified
        ? "Twilio confirms that Exportunity owns this SMS-capable sender."
        : exact
          ? "The configured number exists but is not SMS-capable."
          : "Twilio does not list the configured SMS sender on this account.",
    };
  } catch (error) {
    return providerErrorCheck(configuration.smsFrom, error);
  }
}

async function verifyMessagingService(
  configuration: TwilioConfiguration,
  fetchImpl: FetchLike,
): Promise<ExportunityTwilioVerificationCheck> {
  if (!validMessagingServiceSid(configuration.messagingServiceSid)) {
    return notConfiguredCheck(
      configuration.messagingServiceSid,
      "No valid dedicated Exportunity Messaging Service is configured.",
    );
  }
  try {
    const sid = encodeURIComponent(configuration.messagingServiceSid);
    const [service, senderPool] = await Promise.all([
      providerGet(
        `${TWILIO_MESSAGING_V1_BASE_URL}/Services/${sid}`,
        configuration,
        fetchImpl,
      ),
      providerGet(
        `${TWILIO_MESSAGING_V1_BASE_URL}/Services/${sid}/PhoneNumbers?PageSize=1000`,
        configuration,
        fetchImpl,
      ),
    ]);
    const identityMatches =
      String(service.payload.sid || "") === configuration.messagingServiceSid &&
      String(service.payload.account_sid || "") === configuration.accountSid;
    const phoneNumbers = Array.isArray(senderPool.payload.phone_numbers)
      ? senderPool.payload.phone_numbers
      : [];
    const smsSenderCount = phoneNumbers.filter((row: any) => {
      const capabilities = Array.isArray(row?.capabilities)
        ? row.capabilities.map((item: unknown) =>
            String(item || "").toUpperCase(),
          )
        : [];
      return capabilities.includes("SMS");
    }).length;
    const verified = identityMatches && smsSenderCount > 0;
    return {
      configured: true,
      verified,
      state: verified ? "verified" : "unverified",
      identifier: maskIdentifier(configuration.messagingServiceSid),
      providerStatus: !identityMatches
        ? "IDENTITY_MISMATCH"
        : smsSenderCount > 0
          ? "SENDER_POOL_READY"
          : "NO_SMS_SENDERS",
      detail: verified
        ? `Twilio confirms the Messaging Service and ${smsSenderCount} SMS-capable sender${smsSenderCount === 1 ? "" : "s"}.`
        : identityMatches
          ? "The Messaging Service exists but has no SMS-capable sender."
          : "Twilio returned a different Messaging Service identity.",
    };
  } catch (error) {
    return providerErrorCheck(configuration.messagingServiceSid, error);
  }
}

async function verifyWhatsappSender(
  configuration: TwilioConfiguration,
  fetchImpl: FetchLike,
): Promise<ExportunityTwilioVerificationCheck> {
  if (!validWhatsappSender(configuration.whatsappFrom)) {
    return notConfiguredCheck(
      configuration.whatsappFrom,
      "No valid dedicated Exportunity WhatsApp sender is configured.",
    );
  }
  try {
    const url = new URL(
      `${TWILIO_MESSAGING_V2_BASE_URL}/Channels/Senders`,
    );
    url.searchParams.set("Channel", "whatsapp");
    url.searchParams.set("PageSize", "1000");
    const { payload } = await providerGet(
      url.toString(),
      configuration,
      fetchImpl,
    );
    const senders = Array.isArray(payload.senders) ? payload.senders : [];
    const configuredSender = configuration.whatsappFrom.toLowerCase();
    const exact = senders.find(
      (row: any) =>
        row &&
        String(row.sender_id || row.sender || "").toLowerCase() ===
          configuredSender,
    ) as Record<string, unknown> | undefined;
    const providerStatus = exact
      ? normalizedProviderStatus(exact.status)
      : "NOT_REGISTERED";
    const verified = Boolean(
      exact &&
        (providerStatus === "ONLINE" || providerStatus === "ONLINE:UPDATING"),
    );
    return {
      configured: true,
      verified,
      state: verified ? "verified" : "unverified",
      identifier: maskIdentifier(configuration.whatsappFrom),
      providerStatus,
      detail: verified
        ? "Twilio confirms that the Exportunity WhatsApp sender is online."
        : exact
          ? `The WhatsApp sender is registered but reports ${providerStatus}.`
          : "Twilio does not list the configured WhatsApp sender on this account.",
    };
  } catch (error) {
    return providerErrorCheck(configuration.whatsappFrom, error);
  }
}

function configurationWarnings(configuration: TwilioConfiguration) {
  const warnings: string[] = [];
  if (!validAccountSid(configuration.accountSid)) {
    warnings.push("EXPORTUNITY_TWILIO_ACCOUNT_SID is missing or invalid.");
  }
  if (!validAuthToken(configuration.authToken)) {
    warnings.push("EXPORTUNITY_TWILIO_AUTH_TOKEN is missing or invalid.");
  }
  if (configuration.smsFrom && !validSmsSender(configuration.smsFrom)) {
    warnings.push("EXPORTUNITY_TWILIO_SMS_FROM is invalid.");
  }
  if (
    configuration.messagingServiceSid &&
    !validMessagingServiceSid(configuration.messagingServiceSid)
  ) {
    warnings.push("EXPORTUNITY_TWILIO_MESSAGING_SERVICE_SID is invalid.");
  }
  if (
    !validSmsSender(configuration.smsFrom) &&
    !validMessagingServiceSid(configuration.messagingServiceSid)
  ) {
    warnings.push(
      "A valid EXPORTUNITY_TWILIO_SMS_FROM or EXPORTUNITY_TWILIO_MESSAGING_SERVICE_SID is required.",
    );
  }
  if (!validWhatsappSender(configuration.whatsappFrom)) {
    warnings.push("EXPORTUNITY_TWILIO_WHATSAPP_FROM is missing or invalid.");
  }
  return warnings;
}

export async function verifyExportunityTwilioReadOnly(input?: {
  fetchImpl?: FetchLike;
  now?: Date;
}): Promise<ExportunityTwilioVerification> {
  const configuration = readConfiguration();
  const checkedAt = (input?.now || new Date()).toISOString();
  const fetchImpl = input?.fetchImpl || fetch;
  const fingerprint = configurationFingerprint(configuration);
  const initialWarnings = configurationWarnings(configuration);
  const coreConfigured =
    validAccountSid(configuration.accountSid) &&
    validAuthToken(configuration.authToken);
  const directSmsConfigured = validSmsSender(configuration.smsFrom);
  const messagingServiceConfigured = validMessagingServiceSid(
    configuration.messagingServiceSid,
  );
  const whatsappConfigured = validWhatsappSender(configuration.whatsappFrom);

  if (!coreConfigured) {
    return {
      ready: false,
      checkedAt,
      mode: "read_only",
      credentialsNamespace: "EXPORTUNITY_",
      configurationFingerprint: fingerprint,
      externalActionPerformed: false,
      messageSent: false,
      checks: {
        account: notConfiguredCheck(
          configuration.accountSid,
          "Dedicated Exportunity Twilio credentials are missing or invalid.",
        ),
        sms: skippedProviderCheck(
          directSmsConfigured || messagingServiceConfigured,
          configuration.smsFrom || configuration.messagingServiceSid,
        ),
        messagingService: skippedProviderCheck(
          messagingServiceConfigured,
          configuration.messagingServiceSid,
        ),
        whatsapp: skippedProviderCheck(
          whatsappConfigured,
          configuration.whatsappFrom,
        ),
      },
      warnings: initialWarnings,
    };
  }

  const account = await verifyAccount(configuration, fetchImpl);
  if (!account.verified) {
    return {
      ready: false,
      checkedAt,
      mode: "read_only",
      credentialsNamespace: "EXPORTUNITY_",
      configurationFingerprint: fingerprint,
      externalActionPerformed: false,
      messageSent: false,
      checks: {
        account,
        sms: skippedProviderCheck(
          directSmsConfigured || messagingServiceConfigured,
          configuration.smsFrom || configuration.messagingServiceSid,
        ),
        messagingService: skippedProviderCheck(
          messagingServiceConfigured,
          configuration.messagingServiceSid,
        ),
        whatsapp: skippedProviderCheck(
          whatsappConfigured,
          configuration.whatsappFrom,
        ),
      },
      warnings: [
        ...initialWarnings,
        "Provider checks stopped after the account check failed.",
      ],
    };
  }

  const [directSms, messagingService, whatsapp] = await Promise.all([
    verifyOwnedSmsSender(configuration, fetchImpl),
    verifyMessagingService(configuration, fetchImpl),
    verifyWhatsappSender(configuration, fetchImpl),
  ]);
  const sms = directSmsConfigured
    ? directSms
    : messagingServiceConfigured
      ? {
          ...messagingService,
          identifier: maskIdentifier(configuration.messagingServiceSid),
          detail: messagingService.verified
            ? "The Exportunity Messaging Service has an SMS-capable sender pool."
            : messagingService.detail,
        }
      : directSms;
  const ready =
    account.verified &&
    sms.verified &&
    whatsapp.verified &&
    (!messagingServiceConfigured || messagingService.verified);
  const warnings = [
    ...initialWarnings,
    ...(!sms.verified ? [sms.detail] : []),
    ...(!whatsapp.verified ? [whatsapp.detail] : []),
    ...(messagingServiceConfigured && !messagingService.verified
      ? [messagingService.detail]
      : []),
  ];

  return {
    ready,
    checkedAt,
    mode: "read_only",
    credentialsNamespace: "EXPORTUNITY_",
    configurationFingerprint: fingerprint,
    externalActionPerformed: false,
    messageSent: false,
    checks: { account, sms, messagingService, whatsapp },
    warnings: Array.from(new Set(warnings)),
  };
}
