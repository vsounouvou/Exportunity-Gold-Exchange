import crypto from "node:crypto";
import { db } from "@db";
import { chatRooms, eceUsers, meetArtifacts, meetInvites, meetParticipants, meetSessionEvents, meetSessions } from "@db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  getMeetInviteSecret,
  hashMeetJti,
  hashMeetToken,
  signMeetInviteToken,
  verifyMeetInviteToken,
  type MeetInviteRole,
} from "./inviteToken";

type MeetSessionStatus = "scheduled" | "live" | "ended";
type MeetArtifactType = "recording" | "transcript" | "summary" | "email_draft";

type CreateMeetSessionInput = {
  tenantId: number;
  title: string;
  createdByUserId?: number | null;
  createdByAgentId?: number | null;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  recordingEnabled?: boolean;
  metadata?: Record<string, unknown>;
};

type CreateInviteInput = {
  meetingId: string;
  tenantId: number;
  role: MeetInviteRole;
  issuedTo?: string | null;
  sub: string;
  expiresAt: Date;
  createdByUserId?: number | null;
  metadata?: Record<string, unknown>;
};

function now() {
  return new Date();
}

function normalizeRole(value: unknown): MeetInviteRole {
  const role = String(value || "").trim().toLowerCase();
  if (role === "host" || role === "cohost" || role === "observer") return role;
  return "attendee";
}

function toDateOrNull(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getMeetBaseUrl() {
  const explicit = String(process.env.MEET_PUBLIC_BASE_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return "https://meet.exportunity.net";
}

function pickDisplayName(row: any) {
  const d = String(row?.displayName || "").trim();
  if (d) return d;
  const a = String(row?.full_name || "").trim();
  if (a) return a;
  const b = `${String(row?.first_name || "").trim()} ${String(row?.last_name || "").trim()}`.trim();
  if (b) return b;
  const c = String(row?.email || "").trim();
  if (c) return c;
  return "Guest";
}

function ensureInviteSecret() {
  const secret = getMeetInviteSecret();
  if (!secret) {
    throw new Error("MEET_INVITE_SECRET (or JWT_SECRET/SESSION_SECRET fallback) is required");
  }
  return secret;
}

export async function createMeetSession(input: CreateMeetSessionInput) {
  const id = crypto.randomUUID();
  const startsAt = toDateOrNull(input.startsAt);
  const endsAt = toDateOrNull(input.endsAt);
  const conversationId = `meet:${id}`;
  const createdAt = now();

  await db
    .insert(chatRooms)
    .values({
      name: String(input.title || "").trim() || "Meeting",
      type: "meeting",
      description: "Exportunity Meet",
      isActive: true,
      metadata: {
        source: "exportunity_meet",
        tenantId: input.tenantId,
      },
      conversationId,
      createdAt,
      updatedAt: createdAt,
    })
    .onConflictDoNothing({ target: chatRooms.conversationId });

  const [created] = await db
    .insert(meetSessions)
    .values({
      id,
      tenantId: input.tenantId,
      title: String(input.title || "").trim() || "Meeting",
      createdByUserId: input.createdByUserId ?? null,
      createdByAgentId: input.createdByAgentId ?? null,
      status: startsAt && startsAt.getTime() > Date.now() ? "scheduled" : "live",
      startsAt,
      endsAt,
      locked: false,
      recordingEnabled: Boolean(input.recordingEnabled),
      conversationId,
      sfuRoomKey: id,
      metadata: input.metadata ?? {},
      createdAt,
      updatedAt: createdAt,
    })
    .returning();

  return created;
}

export async function getMeetSession(input: { meetingId: string; tenantId: number }) {
  const row = await db.query.meetSessions.findFirst({
    where: and(eq(meetSessions.id, input.meetingId), eq(meetSessions.tenantId, input.tenantId)),
  });
  return row || null;
}

export async function listMeetSessions(input: { tenantId: number; status?: MeetSessionStatus | null; limit?: number }) {
  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.min(100, Number(input.limit))) : 50;
  const where = input.status
    ? and(eq(meetSessions.tenantId, input.tenantId), eq(meetSessions.status, input.status))
    : eq(meetSessions.tenantId, input.tenantId);
  return db.query.meetSessions.findMany({
    where,
    orderBy: [desc(meetSessions.createdAt)],
    limit,
  });
}

export async function issueMeetInvite(input: CreateInviteInput) {
  const secret = ensureInviteSecret();
  const inviteId = crypto.randomUUID();
  const jti = crypto.randomUUID();
  const payload = {
    tenantId: input.tenantId,
    meetingId: input.meetingId,
    role: normalizeRole(input.role),
    sub: String(input.sub || "").trim(),
    jti,
    iat: Date.now(),
    exp: input.expiresAt.getTime(),
  };
  const token = signMeetInviteToken(payload, secret);
  const tokenHash = hashMeetToken(token);
  const tokenJtiHash = hashMeetJti(jti);

  await db.insert(meetInvites).values({
    id: inviteId,
    meetingId: input.meetingId,
    tenantId: input.tenantId,
    issuedTo: input.issuedTo ?? null,
    role: normalizeRole(input.role),
    tokenHash,
    tokenJtiHash,
    status: "active",
    expiresAt: input.expiresAt,
    createdByUserId: input.createdByUserId ?? null,
    metadata: input.metadata ?? {},
    createdAt: now(),
  });

  const base = getMeetBaseUrl();
  const link = `${base}/m/${encodeURIComponent(input.meetingId)}?t=${encodeURIComponent(token)}`;
  return { inviteId, token, link, expiresAt: input.expiresAt.toISOString() };
}

export async function resolveInviteToken(input: { token: string; tenantId: number; meetingId?: string | null }) {
  const secret = ensureInviteSecret();
  const verified = verifyMeetInviteToken(input.token, secret);
  if (!verified.ok || !verified.payload) {
    return { ok: false as const, reason: verified.reason || "invalid_token" };
  }

  const payload = verified.payload;
  if (payload.tenantId !== input.tenantId) {
    return { ok: false as const, reason: "tenant_mismatch" };
  }
  if (input.meetingId && payload.meetingId !== input.meetingId) {
    return { ok: false as const, reason: "meeting_mismatch" };
  }

  const jtiHash = hashMeetJti(payload.jti);
  const invite = await db.query.meetInvites.findFirst({
    where: and(eq(meetInvites.tenantId, input.tenantId), eq(meetInvites.meetingId, payload.meetingId), eq(meetInvites.tokenJtiHash, jtiHash)),
  });
  if (!invite) return { ok: false as const, reason: "invite_not_found" };
  if (invite.status === "revoked") return { ok: false as const, reason: "invite_revoked" };
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now()) return { ok: false as const, reason: "invite_expired" };

  return { ok: true as const, payload, invite };
}

export async function upsertParticipantJoin(input: {
  tenantId: number;
  meetingId: string;
  role: MeetInviteRole;
  userId?: number | null;
  guestEmail?: string | null;
  displayName?: string | null;
  inviteJtiHash?: string | null;
}) {
  const userId = input.userId ?? null;
  const guestEmail = input.guestEmail ? String(input.guestEmail).trim().toLowerCase() : null;
  const existing = await db.query.meetParticipants.findFirst({
    where: and(
      eq(meetParticipants.tenantId, input.tenantId),
      eq(meetParticipants.meetingId, input.meetingId),
      userId ? eq(meetParticipants.userId, userId) : eq(meetParticipants.guestEmail, guestEmail || ""),
    ),
  });

  if (existing) {
    const [updated] = await db
      .update(meetParticipants)
      .set({
        role: normalizeRole(input.role),
        displayName: input.displayName ?? existing.displayName ?? null,
        inviteJtiHash: input.inviteJtiHash ?? existing.inviteJtiHash ?? null,
        joinedAt: now(),
        leftAt: null,
        isKicked: false,
        updatedAt: now(),
      })
      .where(eq(meetParticipants.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(meetParticipants)
    .values({
      meetingId: input.meetingId,
      tenantId: input.tenantId,
      userId,
      guestEmail,
      role: normalizeRole(input.role),
      displayName: input.displayName ?? null,
      inviteJtiHash: input.inviteJtiHash ?? null,
      joinedAt: now(),
      metadata: {},
      createdAt: now(),
      updatedAt: now(),
    })
    .returning();
  return created;
}

export async function markParticipantLeft(input: { tenantId: number; meetingId: string; participantId: number }) {
  const [row] = await db
    .update(meetParticipants)
    .set({
      leftAt: now(),
      updatedAt: now(),
    })
    .where(and(eq(meetParticipants.tenantId, input.tenantId), eq(meetParticipants.meetingId, input.meetingId), eq(meetParticipants.id, input.participantId)))
    .returning();
  return row || null;
}

export async function setMeetingLocked(input: { tenantId: number; meetingId: string; locked: boolean }) {
  const [row] = await db
    .update(meetSessions)
    .set({
      locked: input.locked,
      updatedAt: now(),
    })
    .where(and(eq(meetSessions.id, input.meetingId), eq(meetSessions.tenantId, input.tenantId)))
    .returning();
  return row || null;
}

export async function setParticipantMute(input: { tenantId: number; meetingId: string; participantId: number; isMuted: boolean }) {
  const [row] = await db
    .update(meetParticipants)
    .set({
      isMuted: input.isMuted,
      updatedAt: now(),
    })
    .where(
      and(
        eq(meetParticipants.tenantId, input.tenantId),
        eq(meetParticipants.meetingId, input.meetingId),
        eq(meetParticipants.id, input.participantId),
      ),
    )
    .returning();
  return row || null;
}

export async function setParticipantKick(input: { tenantId: number; meetingId: string; participantId: number; kicked: boolean }) {
  const [row] = await db
    .update(meetParticipants)
    .set({
      isKicked: input.kicked,
      leftAt: input.kicked ? now() : null,
      updatedAt: now(),
    })
    .where(
      and(
        eq(meetParticipants.tenantId, input.tenantId),
        eq(meetParticipants.meetingId, input.meetingId),
        eq(meetParticipants.id, input.participantId),
      ),
    )
    .returning();
  return row || null;
}

export async function recordMeetEvent(input: {
  tenantId: number;
  meetingId: string;
  eventType: "participant_joined" | "participant_left" | "participant_muted" | "participant_kicked" | "meeting_locked" | "meeting_unlocked" | "chat_message" | "recording_uploaded" | "summary_generated";
  participantId?: number | null;
  payload?: Record<string, unknown>;
}) {
  await db.insert(meetSessionEvents).values({
    tenantId: input.tenantId,
    meetingId: input.meetingId,
    participantId: input.participantId ?? null,
    eventType: input.eventType,
    payload: input.payload ?? {},
    createdAt: now(),
  });
}

export async function listMeetParticipants(input: { tenantId: number; meetingId: string }) {
  return db.query.meetParticipants.findMany({
    where: and(eq(meetParticipants.tenantId, input.tenantId), eq(meetParticipants.meetingId, input.meetingId)),
    orderBy: [desc(meetParticipants.createdAt)],
  });
}

export async function endMeetSession(input: { tenantId: number; meetingId: string }) {
  const [row] = await db
    .update(meetSessions)
    .set({
      status: "ended",
      endsAt: now(),
      updatedAt: now(),
    })
    .where(and(eq(meetSessions.tenantId, input.tenantId), eq(meetSessions.id, input.meetingId)))
    .returning();
  return row || null;
}

export async function addMeetArtifact(input: {
  tenantId: number;
  meetingId: string;
  type: MeetArtifactType;
  storageUrl?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const [row] = await db
    .insert(meetArtifacts)
    .values({
      tenantId: input.tenantId,
      meetingId: input.meetingId,
      type: input.type,
      storageUrl: input.storageUrl ?? null,
      metadata: input.metadata ?? {},
      createdAt: now(),
    })
    .returning();
  return row;
}

export async function listMeetArtifacts(input: { tenantId: number; meetingId: string }) {
  return db.query.meetArtifacts.findMany({
    where: and(eq(meetArtifacts.tenantId, input.tenantId), eq(meetArtifacts.meetingId, input.meetingId)),
    orderBy: [desc(meetArtifacts.createdAt)],
  });
}

export async function markInviteUsed(input: { inviteId: string; tenantId: number }) {
  await db
    .update(meetInvites)
    .set({
      status: "used",
      usedAt: now(),
    })
    .where(and(eq(meetInvites.id, input.inviteId), eq(meetInvites.tenantId, input.tenantId)));
}

export async function revokeInvite(input: { inviteId: string; tenantId: number }) {
  const [row] = await db
    .update(meetInvites)
    .set({
      status: "revoked",
      revokedAt: now(),
    })
    .where(and(eq(meetInvites.id, input.inviteId), eq(meetInvites.tenantId, input.tenantId)))
    .returning();
  return row || null;
}

export async function getUserDisplayName(userId: number) {
  const row = await db.query.eceUsers.findFirst({
    where: eq(eceUsers.id, userId),
  });
  if (!row) return `User ${userId}`;
  return pickDisplayName(row);
}

export async function getMeetStateSnapshot(input: { tenantId: number; meetingId: string }) {
  const meeting = await getMeetSession({ tenantId: input.tenantId, meetingId: input.meetingId });
  if (!meeting) return null;
  const participants = await listMeetParticipants({ tenantId: input.tenantId, meetingId: input.meetingId });
  const artifacts = await listMeetArtifacts({ tenantId: input.tenantId, meetingId: input.meetingId });
  const eventsRows = await db.execute(sql`
    select id, event_type, payload, created_at
    from meet_session_events
    where tenant_id = ${input.tenantId} and meeting_id = ${input.meetingId}
    order by created_at desc
    limit 100
  `);
  const events = Array.isArray((eventsRows as any)?.rows) ? (eventsRows as any).rows : [];
  return { meeting, participants, artifacts, events };
}

export async function resolveMeetAccessFromInviteToken(input: { token: string; tenantId: number; meetingId?: string | null }) {
  const resolved = await resolveInviteToken({ token: input.token, tenantId: input.tenantId, meetingId: input.meetingId });
  if (!resolved.ok) return resolved;
  const role = normalizeRole(resolved.payload.role);
  const sub = resolved.payload.sub;
  const subNorm = sub.toLowerCase();
  const userId = subNorm.startsWith("user:") ? Number(sub.split(":")[1] || "") : null;
  const guestEmail = subNorm.startsWith("guest:") ? sub.slice(6).trim().toLowerCase() : null;
  const displayName = userId && Number.isFinite(userId) ? await getUserDisplayName(userId) : guestEmail || "Guest";
  const participant = await upsertParticipantJoin({
    tenantId: input.tenantId,
    meetingId: resolved.payload.meetingId,
    role,
    userId: userId && Number.isFinite(userId) ? userId : null,
    guestEmail,
    displayName,
    inviteJtiHash: hashMeetJti(resolved.payload.jti),
  });
  await markInviteUsed({ inviteId: resolved.invite.id, tenantId: input.tenantId });
  return {
    ok: true as const,
    role,
    participant,
    invite: resolved.invite,
    payload: resolved.payload,
  };
}

export async function addParticipantsByUserIds(input: {
  tenantId: number;
  meetingId: string;
  userIds: number[];
  defaultRole?: MeetInviteRole;
}) {
  const cleanUserIds = Array.from(new Set(input.userIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));
  if (cleanUserIds.length === 0) return [];
  const users = await db
    .select({
      id: eceUsers.id,
      email: eceUsers.email,
      displayName: eceUsers.displayName,
    })
    .from(eceUsers)
    .where(inArray(eceUsers.id, cleanUserIds));
  const out = [];
  for (const user of users) {
    const p = await upsertParticipantJoin({
      tenantId: input.tenantId,
      meetingId: input.meetingId,
      role: normalizeRole(input.defaultRole || "attendee"),
      userId: Number(user.id),
      guestEmail: null,
      displayName: pickDisplayName(user),
    });
    out.push(p);
  }
  return out;
}
