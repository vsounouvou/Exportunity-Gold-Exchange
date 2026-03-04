import crypto from "node:crypto";

export type MeetInviteRole = "host" | "cohost" | "attendee" | "observer";

export type MeetInviteTokenPayloadV1 = {
  v: 1;
  tenantId: number;
  meetingId: string;
  role: MeetInviteRole;
  sub: string; // user:{id} | guest:{email|id}
  jti: string;
  iat: number;
  exp: number;
};

function base64UrlEncode(input: Buffer | string) {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((raw.length + 3) % 4);
  try {
    return Buffer.from(padded, "base64");
  } catch {
    return null;
  }
}

function safeEqual(a: Buffer, b: Buffer) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function getMeetInviteSecret() {
  const explicit = String(process.env.MEET_INVITE_SECRET || "").trim();
  if (explicit) return explicit;
  const fallback = String(process.env.JWT_SECRET || process.env.SESSION_SECRET || "").trim();
  if (fallback) return fallback;
  return null;
}

export function hashMeetToken(value: string) {
  return crypto.createHash("sha256").update(String(value || "").trim()).digest("hex");
}

export function hashMeetJti(value: string) {
  return crypto.createHash("sha256").update(String(value || "").trim()).digest("hex");
}

export function signMeetInviteToken(payload: Omit<MeetInviteTokenPayloadV1, "v">, secret: string) {
  const normalized: MeetInviteTokenPayloadV1 = {
    v: 1,
    tenantId: Math.trunc(Number(payload.tenantId)),
    meetingId: String(payload.meetingId || "").trim(),
    role: payload.role,
    sub: String(payload.sub || "").trim(),
    jti: String(payload.jti || "").trim(),
    iat: Math.trunc(Number(payload.iat)),
    exp: Math.trunc(Number(payload.exp)),
  };

  if (!Number.isFinite(normalized.tenantId) || normalized.tenantId <= 0) throw new Error("invalid tenantId");
  if (!normalized.meetingId) throw new Error("invalid meetingId");
  if (!normalized.sub) throw new Error("invalid sub");
  if (!normalized.jti) throw new Error("invalid jti");
  if (!normalized.iat || !normalized.exp || normalized.exp <= normalized.iat) throw new Error("invalid iat/exp");

  const json = JSON.stringify(normalized);
  const b64 = base64UrlEncode(json);
  const sig = crypto.createHmac("sha256", secret).update(json).digest();
  return `${b64}.${base64UrlEncode(sig)}`;
}

export function verifyMeetInviteToken(token: string, secret: string): {
  ok: boolean;
  reason: string | null;
  payload: MeetInviteTokenPayloadV1 | null;
} {
  const raw = String(token || "").trim();
  if (!raw) return { ok: false, reason: "missing_token", payload: null };
  const parts = raw.split(".");
  if (parts.length !== 2) return { ok: false, reason: "invalid_format", payload: null };

  const payloadBuf = base64UrlDecode(parts[0] || "");
  const sigBuf = base64UrlDecode(parts[1] || "");
  if (!payloadBuf || !sigBuf) return { ok: false, reason: "invalid_base64", payload: null };

  const json = payloadBuf.toString("utf8");
  const expectedSig = crypto.createHmac("sha256", secret).update(json).digest();
  if (!safeEqual(expectedSig, sigBuf)) return { ok: false, reason: "invalid_signature", payload: null };

  let parsed: any = null;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: "invalid_json", payload: null };
  }
  if (!parsed || parsed.v !== 1) return { ok: false, reason: "invalid_version", payload: null };

  const payload: MeetInviteTokenPayloadV1 = {
    v: 1,
    tenantId: Math.trunc(Number(parsed.tenantId)),
    meetingId: String(parsed.meetingId || "").trim(),
    role: String(parsed.role || "").trim() as MeetInviteRole,
    sub: String(parsed.sub || "").trim(),
    jti: String(parsed.jti || "").trim(),
    iat: Math.trunc(Number(parsed.iat)),
    exp: Math.trunc(Number(parsed.exp)),
  };

  if (!Number.isFinite(payload.tenantId) || payload.tenantId <= 0) return { ok: false, reason: "invalid_tenant", payload: null };
  if (!payload.meetingId) return { ok: false, reason: "invalid_meeting", payload: null };
  if (!payload.sub || !payload.jti) return { ok: false, reason: "invalid_subject", payload: null };
  if (!payload.iat || !payload.exp || payload.exp <= payload.iat) return { ok: false, reason: "invalid_ttl", payload: null };
  if (Date.now() >= payload.exp) return { ok: false, reason: "expired", payload: null };
  return { ok: true, reason: null, payload };
}

