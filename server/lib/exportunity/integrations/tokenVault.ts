import crypto from "node:crypto";

const EXPORTUNITY_TOKEN_AAD = "exportunity-integration-token-v1";

export type ExportunityEncryptedTokenPayload = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

function looksPlaceholder(value: string) {
  return (
    !value ||
    /(?:changeme|replace|example|placeholder|your[_-]?|xxxx+|\.\.\.)/i.test(
      value,
    )
  );
}

export function getExportunityIntegrationVaultSecret() {
  const secret = String(process.env.EXPORTUNITY_INTEGRATION_SECRET || "").trim();
  if (secret.length < 32 || looksPlaceholder(secret)) {
    throw new Error(
      "EXPORTUNITY_INTEGRATION_SECRET must be a dedicated secret of at least 32 characters",
    );
  }
  return secret;
}

function vaultKey() {
  return crypto
    .createHash("sha256")
    .update(getExportunityIntegrationVaultSecret())
    .digest();
}

export function encryptExportunityIntegrationTokenPayload(
  payload: Record<string, unknown>,
): ExportunityEncryptedTokenPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", vaultKey(), iv);
  cipher.setAAD(Buffer.from(EXPORTUNITY_TOKEN_AAD, "utf8"));
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptExportunityIntegrationTokenPayload(
  input: ExportunityEncryptedTokenPayload,
): Record<string, unknown> {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    vaultKey(),
    Buffer.from(input.iv, "base64"),
  );
  decipher.setAAD(Buffer.from(EXPORTUNITY_TOKEN_AAD, "utf8"));
  decipher.setAuthTag(Buffer.from(input.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const parsed = JSON.parse(plaintext);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Stored Exportunity integration credential payload is invalid");
  }
  return parsed as Record<string, unknown>;
}
