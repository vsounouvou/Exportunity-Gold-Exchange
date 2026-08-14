import { createHash, timingSafeEqual } from "crypto";

const PUBLISHED_SEED_EMAILS = new Set(["admin@exportunity.local"]);
const PUBLISHED_SEED_PASSWORD_SHA256 = Buffer.from(
  "9a4aabf0e5cf71cae2cea646613ce7e2a5919fa758e56819704be25a3a2c1f0b",
  "hex",
);

function digestPassword(password: string) {
  return createHash("sha256").update(password).digest();
}

export function isPublishedSeedCredential(input: {
  email: unknown;
  password: unknown;
  nodeEnv?: string;
}) {
  if (String(input.nodeEnv || "").trim().toLowerCase() !== "production") return false;

  const email = String(input.email || "").trim().toLowerCase();
  if (!PUBLISHED_SEED_EMAILS.has(email)) return false;

  const candidate = digestPassword(String(input.password || ""));
  return timingSafeEqual(candidate, PUBLISHED_SEED_PASSWORD_SHA256);
}
