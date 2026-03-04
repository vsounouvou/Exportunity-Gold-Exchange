import crypto from "crypto";
import { nanoid } from "nanoid";
import { db } from "@db";
import { chairmanQuickTokens, eceUsers } from "@db/schema";
import { and, eq, sql } from "drizzle-orm";

const DEFAULT_TOKEN_TTL_MINUTES = 10;
const DEFAULT_SESSION_TTL_MINUTES = 60;

function getTokenSecret() {
  const explicit = String(process.env.CHAIRMAN_QUICK_TOKEN_SECRET || "").trim();
  if (explicit) return explicit;
  const fallback = String(process.env.VOUCHER_CODE_SALT || "").trim();
  return fallback || "chairman-quick-token";
}

function hashToken(token: string) {
  const secret = getTokenSecret();
  return crypto.createHash("sha256").update(`${secret}:${token}`).digest("hex");
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function rows<T = any>(result: unknown): T[] {
  const candidate = (result as any)?.rows;
  return Array.isArray(candidate) ? (candidate as T[]) : [];
}

export async function createQuickToken(input: {
  tenantId: number;
  userId: number;
  expiresInMinutes?: number;
  metadata?: Record<string, unknown>;
}) {
  const expiresInMinutes = Math.max(1, Number(input.expiresInMinutes || DEFAULT_TOKEN_TTL_MINUTES));
  const rawToken = nanoid(36);
  const tokenPrefix = rawToken.slice(0, 6);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  await db.insert(chairmanQuickTokens).values({
    tenantId: input.tenantId,
    userId: input.userId,
    tokenPrefix,
    tokenHash,
    expiresAt,
    metadata: input.metadata ?? {},
    createdAt: new Date(),
  });

  return { token: rawToken, tokenPrefix, expiresAt };
}

export async function redeemQuickToken(input: {
  tenantId: number;
  token: string;
  sessionTtlMinutes?: number;
  metadata?: Record<string, unknown>;
}) {
  const tokenHash = hashToken(input.token);
  const now = new Date();

  const result = await db.execute(sql`
    select *
    from chairman_quick_tokens
    where tenant_id = ${input.tenantId}
      and token_hash = ${tokenHash}
      and revoked_at is null
      and redeemed_at is null
      and expires_at > now()
    limit 1
  `);
  const row = rows<any>(result)[0];
  if (!row) {
    return { ok: false as const, reason: "invalid_or_expired" };
  }

  const sessionToken = nanoid(40);
  const sessionHash = hashToken(sessionToken);
  const sessionTtlMinutes = Math.max(5, Number(input.sessionTtlMinutes || DEFAULT_SESSION_TTL_MINUTES));
  const sessionExpiresAt = new Date(Date.now() + sessionTtlMinutes * 60 * 1000);

  const metadata = {
    ...normalizeMetadata(row.metadata),
    ...normalizeMetadata(input.metadata),
    session_hash: sessionHash,
    session_expires_at: sessionExpiresAt.toISOString(),
  };

  await db
    .update(chairmanQuickTokens)
    .set({
      redeemedAt: now,
      metadata,
    })
    .where(and(eq(chairmanQuickTokens.id, row.id), eq(chairmanQuickTokens.tenantId, input.tenantId)));

  return {
    ok: true as const,
    sessionToken,
    sessionExpiresAt,
    userId: Number(row.user_id ?? row.userId),
  };
}

export async function resolveQuickSession(input: { tenantId: number; sessionToken: string }) {
  const sessionHash = hashToken(input.sessionToken);
  const result = await db.execute(sql`
    select *
    from chairman_quick_tokens
    where tenant_id = ${input.tenantId}
      and revoked_at is null
      and (metadata->>'session_hash') = ${sessionHash}
      and coalesce((metadata->>'session_expires_at')::timestamptz, to_timestamp(0)) > now()
    order by id desc
    limit 1
  `);

  const row = rows<any>(result)[0];
  if (!row) return null;
  const userId = Number(row.user_id ?? row.userId);
  if (!Number.isFinite(userId) || userId <= 0) return null;
  const user = await db.query.eceUsers.findFirst({
    where: eq(eceUsers.id, userId),
  });
  if (!user) return null;
  return { user, tokenRow: row };
}

export async function resolveQuickSessionAnyTenant(input: { sessionToken: string }) {
  const sessionHash = hashToken(input.sessionToken);
  const result = await db.execute(sql`
    select *
    from chairman_quick_tokens
    where revoked_at is null
      and (metadata->>'session_hash') = ${sessionHash}
      and coalesce((metadata->>'session_expires_at')::timestamptz, to_timestamp(0)) > now()
    order by id desc
    limit 1
  `);

  const row = rows<any>(result)[0];
  if (!row) return null;
  const userId = Number(row.user_id ?? row.userId);
  if (!Number.isFinite(userId) || userId <= 0) return null;
  const user = await db.query.eceUsers.findFirst({
    where: eq(eceUsers.id, userId),
  });
  if (!user) return null;
  const tenantId = Number(row.tenant_id ?? row.tenantId);
  if (!Number.isFinite(tenantId) || tenantId <= 0) return null;
  return { user, tokenRow: row, tenantId };
}
