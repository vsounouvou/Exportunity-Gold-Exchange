import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

function normalizeBase32(value: string) {
  return String(value || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
}

export function encodeBase32(buffer: Buffer) {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    output += BASE32_ALPHABET[Number.parseInt(chunk, 2)];
  }
  return output;
}

export function decodeBase32(value: string) {
  const normalized = normalizeBase32(value);
  let bits = "";
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 value");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  return encodeBase32(randomBytes(20));
}

export function totpCode(secret: string, timestampMs = Date.now()) {
  const counter = Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);
  const payload = Buffer.alloc(8);
  payload.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(payload).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export function verifyTotp(secret: string, code: string, timestampMs = Date.now(), window = 1) {
  const candidate = String(code || "").replace(/\D/g, "");
  if (candidate.length !== TOTP_DIGITS) return false;
  for (let offset = -Math.abs(window); offset <= Math.abs(window); offset += 1) {
    const expected = totpCode(secret, timestampMs + offset * TOTP_PERIOD_SECONDS * 1000);
    if (timingSafeEqual(Buffer.from(candidate), Buffer.from(expected))) return true;
  }
  return false;
}

function resolveEncryptionKey(input?: string) {
  const source =
    String(input || "").trim() ||
    String(process.env.AGOOJIYE_MFA_ENCRYPTION_KEY || "").trim() ||
    String(process.env.AUTH_SECRET || "").trim();
  if (source.length < 24) {
    throw new Error("AGOOJIYE_MFA_ENCRYPTION_KEY must contain at least 24 characters");
  }
  return createHash("sha256").update(source).digest();
}

export function encryptMfaSecret(secret: string, encryptionKey?: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", resolveEncryptionKey(encryptionKey), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptMfaSecret(payload: string, encryptionKey?: string) {
  const [version, ivValue, tagValue, ciphertextValue] = String(payload || "").split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid MFA secret payload");
  const decipher = createDecipheriv("aes-256-gcm", resolveEncryptionKey(encryptionKey), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function hashWorkosToken(value: string) {
  return createHash("sha256").update(String(value || "").trim()).digest("hex");
}

export function generateRecoveryCodes(count = 10) {
  return Array.from({ length: Math.max(6, Math.min(12, count)) }, () => {
    const raw = randomBytes(5).toString("hex").toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export function hashRecoveryCode(value: string) {
  return hashWorkosToken(String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase());
}

export function buildTotpUri(input: { secret: string; email: string; issuer?: string }) {
  const issuer = String(input.issuer || "AGOOJIYE WorkOS").trim();
  const label = `${issuer}:${String(input.email || "").trim().toLowerCase()}`;
  const url = new URL(`otpauth://totp/${encodeURIComponent(label)}`);
  url.searchParams.set("secret", normalizeBase32(input.secret));
  url.searchParams.set("issuer", issuer);
  url.searchParams.set("algorithm", "SHA1");
  url.searchParams.set("digits", String(TOTP_DIGITS));
  url.searchParams.set("period", String(TOTP_PERIOD_SECONDS));
  return url.toString();
}

export function hasPrivilegedWorkosRole(user: any, tenantRoles: string[] = []) {
  const roles = [
    String(user?.role || ""),
    ...(Array.isArray(user?.roles) ? user.roles.map(String) : []),
    ...tenantRoles,
  ]
    .map((value) => value.trim().toUpperCase().replace(/[\s-]+/g, "_"))
    .filter(Boolean);
  const permissions = Array.isArray(user?.permissions) ? user.permissions.map(String) : [];
  return (
    permissions.includes("*") ||
    permissions.includes("admin:*") ||
    roles.some((role) =>
      ["AGOOJIYE_SUPER_ADMIN", "SUPER_ADMIN", "TENANT_ADMIN", "ADMIN", "CONTROLLER"].includes(role),
    )
  );
}

export function isAgoojiyeSuperAdmin(user: any, tenantRoles: string[] = []) {
  const expectedEmail = String(process.env.AGOOJIYE_SUPER_ADMIN_EMAIL || "vs@agoojiye.com").trim().toLowerCase();
  const roles = [
    ...(Array.isArray(user?.roles) ? user.roles.map(String) : []),
    ...tenantRoles,
  ].map((value) => value.trim().toUpperCase().replace(/[\s-]+/g, "_"));
  return (
    String(user?.email || "").trim().toLowerCase() === expectedEmail &&
    (roles.includes("AGOOJIYE_SUPER_ADMIN") || roles.includes("SUPER_ADMIN"))
  );
}
