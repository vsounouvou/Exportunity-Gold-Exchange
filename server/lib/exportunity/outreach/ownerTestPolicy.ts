export type ExportunityOwnerTestChannel = "email" | "sms" | "whatsapp";

type OwnerTestAuthorization = {
  requested: boolean;
  authorized: boolean;
  channel: ExportunityOwnerTestChannel;
  channelEnabled: boolean;
  reason: string;
};

function enabled(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(
    String(value || "").trim().toLowerCase(),
  );
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizePhone(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.startsWith("+")
    ? `+${raw.slice(1).replace(/\D/g, "")}`
    : `+${raw.replace(/\D/g, "")}`;
  return /^\+[1-9]\d{6,14}$/.test(normalized) ? normalized : "";
}

function emailList() {
  return unique(
    String(process.env.EXPORTUNITY_OUTREACH_TEST_EMAILS || "")
      .split(/[;,\n]+/)
      .map(normalizeEmail),
  );
}

function phoneList(channel: "sms" | "whatsapp") {
  const dedicated =
    channel === "sms"
      ? process.env.EXPORTUNITY_TWILIO_TEST_SMS_TO
      : process.env.EXPORTUNITY_TWILIO_TEST_WHATSAPP_TO;
  const extras = String(
    channel === "sms"
      ? process.env.EXPORTUNITY_OUTREACH_TEST_SMS_NUMBERS || ""
      : process.env.EXPORTUNITY_OUTREACH_TEST_WHATSAPP_NUMBERS || "",
  ).split(/[;,\n]+/);
  return unique([normalizePhone(dedicated), ...extras.map(normalizePhone)]);
}

function channelFlag(channel: ExportunityOwnerTestChannel) {
  return `EXPORTUNITY_OUTREACH_TEST_${channel.toUpperCase()}_ENABLED`;
}

function normalizeRecipient(
  channel: ExportunityOwnerTestChannel,
  value: unknown,
) {
  return channel === "email" ? normalizeEmail(value) : normalizePhone(value);
}

export function exportunityOwnerTestRecipients(
  channel: ExportunityOwnerTestChannel,
) {
  return channel === "email" ? emailList() : phoneList(channel);
}

export function authorizeExportunityOwnerTest(input: {
  tenantKey?: unknown;
  channel: ExportunityOwnerTestChannel;
  payload: Record<string, unknown>;
  recipients: string[];
}): OwnerTestAuthorization {
  const requested =
    input.payload.ownerOnlyTest === true &&
    String(input.payload.outreachTestMode || "").trim().toLowerCase() ===
      "owner_only";
  if (!requested) {
    return {
      requested: false,
      authorized: false,
      channel: input.channel,
      channelEnabled: false,
      reason: "not_owner_test",
    };
  }
  if (String(input.tenantKey || "").trim().toLowerCase() !== "exportunity") {
    return {
      requested: true,
      authorized: false,
      channel: input.channel,
      channelEnabled: false,
      reason: "wrong_tenant",
    };
  }
  if (!enabled(process.env.EXPORTUNITY_OUTREACH_TEST_MODE)) {
    return {
      requested: true,
      authorized: false,
      channel: input.channel,
      channelEnabled: false,
      reason: "owner_test_mode_disabled",
    };
  }
  const allowlist = new Set(exportunityOwnerTestRecipients(input.channel));
  const recipients = unique(
    input.recipients.map((value) => normalizeRecipient(input.channel, value)),
  );
  const authorized =
    recipients.length > 0 &&
    recipients.length === input.recipients.length &&
    recipients.every((recipient) => allowlist.has(recipient));
  const channelEnabled = enabled(process.env[channelFlag(input.channel)]);
  return {
    requested: true,
    authorized,
    channel: input.channel,
    channelEnabled,
    reason: authorized
      ? channelEnabled
        ? "owner_allowlist_verified"
        : "owner_test_channel_disabled"
      : "recipient_not_owner_allowlisted",
  };
}

function maskEmail(value: string) {
  const [local, domain] = value.split("@");
  if (!local || !domain) return null;
  return `${local.slice(0, 1)}${"•".repeat(
    Math.min(4, Math.max(2, local.length - 1)),
  )}@${domain}`;
}

function maskPhone(value: string) {
  return value ? `••••${value.slice(-4)}` : null;
}

export function publicExportunityOwnerTestPolicy() {
  const modeEnabled = enabled(process.env.EXPORTUNITY_OUTREACH_TEST_MODE);
  const emailRecipients = emailList();
  const smsRecipients = phoneList("sms");
  const whatsappRecipients = phoneList("whatsapp");
  return {
    mode: "owner_only" as const,
    enabled: modeEnabled,
    externalRecipientsAllowed: false,
    channels: {
      email: {
        enabled:
          modeEnabled &&
          enabled(process.env.EXPORTUNITY_OUTREACH_TEST_EMAIL_ENABLED),
        recipients: emailRecipients.map(maskEmail).filter(Boolean),
      },
      sms: {
        enabled:
          modeEnabled &&
          enabled(process.env.EXPORTUNITY_OUTREACH_TEST_SMS_ENABLED),
        recipients: smsRecipients.map(maskPhone).filter(Boolean),
      },
      whatsapp: {
        enabled:
          modeEnabled &&
          enabled(process.env.EXPORTUNITY_OUTREACH_TEST_WHATSAPP_ENABLED),
        recipients: whatsappRecipients.map(maskPhone).filter(Boolean),
      },
      meta: {
        enabled: false,
        recipients: [] as string[],
        note: "Meta verifies the connected owner and company Pages, but the current Graph contract cannot send a direct message to a personal profile.",
      },
    },
  };
}
