import crypto from "node:crypto";

const TOKEN_AAD = "mindbase-integration-token-v1";

export type EncryptedTokenPayload = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

export function getIntegrationVaultSecret() {
  const secret = String(
    process.env.MINDBASE_INTEGRATION_SECRET ||
      process.env.MINDBASE_JWT_SECRET ||
      process.env.SESSION_SECRET ||
      "",
  ).trim();
  if (!secret) {
    throw new Error("MINDBASE_INTEGRATION_SECRET or MINDBASE_JWT_SECRET is required for integration credentials");
  }
  return secret;
}

function vaultKey() {
  return crypto.createHash("sha256").update(getIntegrationVaultSecret()).digest();
}

export function encryptIntegrationTokenPayload(payload: Record<string, unknown>): EncryptedTokenPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", vaultKey(), iv);
  cipher.setAAD(Buffer.from(TOKEN_AAD, "utf8"));
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptIntegrationTokenPayload(input: EncryptedTokenPayload): Record<string, unknown> {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    vaultKey(),
    Buffer.from(input.iv, "base64"),
  );
  decipher.setAAD(Buffer.from(TOKEN_AAD, "utf8"));
  decipher.setAuthTag(Buffer.from(input.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const parsed = JSON.parse(plaintext);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Stored integration credential payload is invalid");
  }
  return parsed as Record<string, unknown>;
}

export function maskAccountEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  const [local, domain] = email.split("@");
  if (!local || !domain) return email || "Not available";
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}${local.length > visible.length ? "***" : ""}@${domain}`;
}

