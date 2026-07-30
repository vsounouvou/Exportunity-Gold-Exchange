import { createHash, randomBytes } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@db";
import { passwordSetupTokens } from "@db/schema";

const DEFAULT_SETUP_TOKEN_TTL_HOURS = 24;
const TOKEN_BYTES = 32;

export type ConsumePasswordSetupResult =
  | { ok: true; userId: number; tokenId: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

export function evaluatePasswordSetupTokenState(input: { usedAt: Date | null; expiresAt: Date | string }, now = Date.now()) {
  if (input.usedAt) return "used" as const;
  const expiry = new Date(input.expiresAt).getTime();
  if (!Number.isFinite(expiry) || expiry <= now) return "expired" as const;
  return null;
}

export function hashPasswordSetupToken(rawToken: string) {
  return createHash("sha256").update(String(rawToken || "").trim()).digest("hex");
}

export function generatePasswordSetupTokenRaw() {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function resolvePasswordSetupBaseUrl(fallback?: string) {
  const envBase =
    String(process.env.PASSWORD_SETUP_BASE_URL || "").trim() ||
    String(process.env.APP_BASE_URL || "").trim() ||
    String(process.env.DOMAIN_BASE_URL || "").trim() ||
    String(fallback || "").trim();
  const normalized = envBase.replace(/\/+$/, "");
  return normalized || "http://localhost:5000";
}

export function buildPasswordSetupLink(baseUrl: string, rawToken: string) {
  const origin = resolvePasswordSetupBaseUrl(baseUrl);
  const url = new URL("/setup-password", origin);
  url.searchParams.set("token", rawToken);
  return url.toString();
}

export async function invalidateUnusedPasswordSetupTokensForUser(userId: number) {
  if (!Number.isFinite(userId) || userId <= 0) return;
  const now = new Date();
  await db
    .update(passwordSetupTokens)
    .set({ usedAt: now })
    .where(and(eq(passwordSetupTokens.userId, userId), isNull(passwordSetupTokens.usedAt), gt(passwordSetupTokens.expiresAt, now)));
}

export async function createPasswordSetupToken(input: {
  userId: number;
  ttlHours?: number;
  invalidateExisting?: boolean;
}) {
  const userId = Number(input.userId);
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error("Invalid userId");
  }

  if (input.invalidateExisting) {
    await invalidateUnusedPasswordSetupTokensForUser(userId);
  }

  const now = new Date();
  const ttlHours = Math.max(1, Math.trunc(Number(input.ttlHours || DEFAULT_SETUP_TOKEN_TTL_HOURS)));
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
  const rawToken = generatePasswordSetupTokenRaw();
  const tokenHash = hashPasswordSetupToken(rawToken);

  const [created] = await db
    .insert(passwordSetupTokens)
    .values({
      userId,
      tokenHash,
      expiresAt,
      createdAt: now,
    })
    .returning({ id: passwordSetupTokens.id });

  if (!created?.id) {
    throw new Error("Failed to create password setup token");
  }

  return {
    id: String(created.id),
    userId,
    rawToken,
    tokenHash,
    expiresAt,
  };
}

export async function inspectPasswordSetupToken(
  rawToken: string,
): Promise<ConsumePasswordSetupResult> {
  const tokenHash = hashPasswordSetupToken(rawToken);
  if (!tokenHash) return { ok: false, reason: "invalid" };
  const tokenRow = await db.query.passwordSetupTokens.findFirst({
    where: eq(passwordSetupTokens.tokenHash, tokenHash),
  });
  if (!tokenRow) return { ok: false, reason: "invalid" };
  const tokenState = evaluatePasswordSetupTokenState({
    usedAt: tokenRow.usedAt,
    expiresAt: tokenRow.expiresAt,
  });
  if (tokenState) return { ok: false, reason: tokenState };
  return {
    ok: true,
    userId: Number(tokenRow.userId),
    tokenId: String(tokenRow.id),
  };
}

export async function consumePasswordSetupToken(rawToken: string): Promise<ConsumePasswordSetupResult> {
  const tokenHash = hashPasswordSetupToken(rawToken);
  if (!tokenHash) return { ok: false, reason: "invalid" };

  const tokenRow = await db.query.passwordSetupTokens.findFirst({
    where: eq(passwordSetupTokens.tokenHash, tokenHash),
  });
  if (!tokenRow) return { ok: false, reason: "invalid" };

  const now = new Date();
  const tokenState = evaluatePasswordSetupTokenState({ usedAt: tokenRow.usedAt, expiresAt: tokenRow.expiresAt }, now.getTime());
  if (tokenState) return { ok: false, reason: tokenState };

  const [consumed] = await db
    .update(passwordSetupTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(passwordSetupTokens.id, tokenRow.id),
        isNull(passwordSetupTokens.usedAt),
        gt(passwordSetupTokens.expiresAt, now),
      ),
    )
    .returning({ id: passwordSetupTokens.id });
  if (!consumed?.id) {
    const current = await db.query.passwordSetupTokens.findFirst({
      where: eq(passwordSetupTokens.id, tokenRow.id),
    });
    if (!current) return { ok: false, reason: "invalid" };
    return {
      ok: false,
      reason:
        evaluatePasswordSetupTokenState(
          { usedAt: current.usedAt, expiresAt: current.expiresAt },
          Date.now(),
        ) || "used",
    };
  }

  return {
    ok: true,
    userId: Number(tokenRow.userId),
    tokenId: String(tokenRow.id),
  };
}
