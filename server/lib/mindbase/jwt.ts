import crypto from "node:crypto";

type TokenKind = "access" | "refresh";

export type MindbaseJwtClaims = {
  sub: number;
  tenantId: number;
  roles: string[];
  kind: TokenKind;
  iat: number;
  exp: number;
  iss: "mindbase";
  aud: "mindbase-api";
};

type SignInput = {
  userId: number;
  tenantId: number;
  roles: string[];
  kind: TokenKind;
  ttlSeconds: number;
};

function encodeBase64Url(input: Buffer | string) {
  const base64 = Buffer.isBuffer(input) ? input.toString("base64") : Buffer.from(input).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64");
}

function hmac(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest();
}

function getSecret(kind: TokenKind) {
  if (kind === "refresh") {
    const refreshSecret = String(process.env.MINDBASE_JWT_REFRESH_SECRET || "").trim();
    if (refreshSecret) return refreshSecret;
  }
  const secret = String(process.env.MINDBASE_JWT_SECRET || "").trim();
  if (!secret) {
    throw new Error("MINDBASE_JWT_SECRET is required");
  }
  return secret;
}

export function signMindbaseToken(input: SignInput) {
  const now = Math.floor(Date.now() / 1000);
  const claims: MindbaseJwtClaims = {
    sub: Number(input.userId),
    tenantId: Number(input.tenantId),
    roles: Array.isArray(input.roles) ? input.roles.map((entry) => String(entry || "")) : [],
    kind: input.kind,
    iat: now,
    exp: now + Math.max(60, Math.floor(input.ttlSeconds)),
    iss: "mindbase",
    aud: "mindbase-api",
  };
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(claims));
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = encodeBase64Url(hmac(unsigned, getSecret(input.kind)));
  return `${unsigned}.${signature}`;
}

export function verifyMindbaseToken(token: string, expectedKind: TokenKind): MindbaseJwtClaims | null {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;
  const unsigned = `${headerPart}.${payloadPart}`;
  const expectedSignature = encodeBase64Url(hmac(unsigned, getSecret(expectedKind)));
  const signatureMatches =
    signaturePart.length === expectedSignature.length &&
    crypto.timingSafeEqual(Buffer.from(signaturePart), Buffer.from(expectedSignature));
  if (!signatureMatches) return null;

  try {
    const payloadText = decodeBase64Url(payloadPart).toString("utf8");
    const claims = JSON.parse(payloadText) as MindbaseJwtClaims;
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== "mindbase" || claims.aud !== "mindbase-api") return null;
    if (claims.kind !== expectedKind) return null;
    if (!Number.isFinite(claims.sub) || claims.sub <= 0) return null;
    if (!Number.isFinite(claims.tenantId) || claims.tenantId <= 0) return null;
    if (!Number.isFinite(claims.exp) || claims.exp < now) return null;
    return claims;
  } catch {
    return null;
  }
}
