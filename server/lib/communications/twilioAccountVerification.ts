export class TwilioAccountVerificationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "TwilioAccountVerificationError";
    this.code = code;
    this.status = status;
  }
}

function maskedTwilioSid(value: unknown) {
  const sid = String(value || "").trim();
  if (!sid) return null;
  if (sid.length <= 8) return `${sid.slice(0, 2)}…`;
  return `${sid.slice(0, 2)}…${sid.slice(-6)}`;
}

function isoDateOrNull(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function toSafeTwilioAccountVerification(input: {
  expectedAccountSid: string;
  account: unknown;
  verifiedAt?: Date;
}) {
  const account =
    input.account && typeof input.account === "object" && !Array.isArray(input.account)
      ? (input.account as Record<string, unknown>)
      : {};
  const sid = String(account.sid || "").trim();
  if (!sid || sid !== input.expectedAccountSid) {
    throw new TwilioAccountVerificationError(
      "Twilio returned an account that does not match TWILIO_ACCOUNT_SID.",
      "TWILIO_ACCOUNT_MISMATCH",
      502,
    );
  }
  const status = String(account.status || "unknown").trim().toLowerCase();
  return {
    provider: "twilio" as const,
    verified: true,
    readyForApiAuthentication: status === "active",
    account: {
      sidMasked: maskedTwilioSid(sid),
      ownerAccountSidMasked: maskedTwilioSid(account.ownerAccountSid),
      friendlyName: String(account.friendlyName || "").trim() || null,
      status,
      type: String(account.type || "unknown").trim() || "unknown",
      dateCreated: isoDateOrNull(account.dateCreated),
      dateUpdated: isoDateOrNull(account.dateUpdated),
    },
    evidenceSource: "GET /2010-04-01/Accounts/{Sid}.json",
    verifiedAt: (input.verifiedAt || new Date()).toISOString(),
    externalActionPerformed: false,
    messageSent: false,
    credentialsExposed: false,
  };
}
