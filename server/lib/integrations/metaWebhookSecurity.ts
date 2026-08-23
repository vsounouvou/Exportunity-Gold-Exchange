import crypto from "node:crypto";

export type MetaWebhookPurpose = "social" | "whatsapp";

type ConfiguredValue = {
  value: string;
  source: string | null;
};

function firstConfigured(names: readonly string[]): ConfiguredValue {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return { value, source: name };
  }
  return { value: "", source: null };
}

function verifyTokenFor(purpose: MetaWebhookPurpose) {
  return firstConfigured(
    purpose === "whatsapp"
      ? [
          "META_WHATSAPP_WEBHOOK_VERIFY_TOKEN",
          "WHATSAPP_VERIFY_TOKEN",
          "META_WEBHOOK_VERIFY_TOKEN",
        ]
      : ["META_WEBHOOK_VERIFY_TOKEN"],
  );
}

function signingSecretFor(purpose: MetaWebhookPurpose) {
  return firstConfigured(
    purpose === "whatsapp"
      ? ["META_WHATSAPP_APP_SECRET", "WHATSAPP_APP_SECRET", "META_APP_SECRET"]
      : ["META_APP_SECRET"],
  );
}

function safeEqualText(left: string, right: string) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.length === rightBytes.length &&
    crypto.timingSafeEqual(leftBytes, rightBytes)
  );
}

export function metaWebhookSecurityStatus(
  purpose: MetaWebhookPurpose = "social",
) {
  const verifyToken = verifyTokenFor(purpose);
  const signingSecret = signingSecretFor(purpose);
  return {
    purpose,
    verifyTokenConfigured: Boolean(verifyToken.value),
    signingSecretConfigured: Boolean(signingSecret.value),
    verificationReady: Boolean(verifyToken.value && signingSecret.value),
    verifyTokenSource: verifyToken.source,
    signingSecretSource: signingSecret.source,
    signatureAlgorithm: "HMAC-SHA256",
    signatureHeader: "X-Hub-Signature-256",
    rawBodyRequired: true,
    credentialsExposed: false,
  } as const;
}

export function verifyMetaWebhookChallenge(input: {
  purpose?: MetaWebhookPurpose;
  mode: unknown;
  verifyToken: unknown;
  challenge: unknown;
}) {
  const purpose = input.purpose || "social";
  const configured = verifyTokenFor(purpose);
  if (!configured.value) {
    return { ok: false as const, reason: "verify_token_not_configured" as const };
  }
  if (String(input.mode || "").trim() !== "subscribe") {
    return { ok: false as const, reason: "invalid_mode" as const };
  }
  const receivedToken = String(input.verifyToken || "").trim();
  if (!receivedToken || !safeEqualText(receivedToken, configured.value)) {
    return { ok: false as const, reason: "verify_token_mismatch" as const };
  }
  const challenge = String(input.challenge ?? "");
  if (!challenge.trim() || challenge.length > 2048) {
    return { ok: false as const, reason: "invalid_challenge" as const };
  }
  return { ok: true as const, reason: "verified" as const, challenge };
}

export function verifyMetaWebhookSignature(input: {
  purpose?: MetaWebhookPurpose;
  rawBody: Buffer | Uint8Array | undefined;
  signatureHeader: unknown;
}) {
  const purpose = input.purpose || "social";
  const configured = signingSecretFor(purpose);
  if (!configured.value) {
    return { ok: false as const, reason: "signing_secret_not_configured" as const };
  }
  const rawBody = input.rawBody
    ? Buffer.isBuffer(input.rawBody)
      ? input.rawBody
      : Buffer.from(input.rawBody)
    : null;
  if (!rawBody?.length) {
    return { ok: false as const, reason: "raw_body_missing" as const };
  }
  const signature = String(input.signatureHeader || "").trim();
  const match = signature.match(/^sha256=([a-f0-9]{64})$/i);
  if (!match) {
    return { ok: false as const, reason: "signature_missing_or_malformed" as const };
  }
  const expected = crypto
    .createHmac("sha256", configured.value)
    .update(rawBody)
    .digest();
  const received = Buffer.from(match[1], "hex");
  if (
    received.length !== expected.length ||
    !crypto.timingSafeEqual(received, expected)
  ) {
    return { ok: false as const, reason: "signature_mismatch" as const };
  }
  return {
    ok: true as const,
    reason: "verified" as const,
    algorithm: "HMAC-SHA256" as const,
    payloadChecksum: crypto.createHash("sha256").update(rawBody).digest("hex"),
    credentialsExposed: false as const,
  };
}
