import crypto from "node:crypto";
import multer from "multer";
import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@db";
import { eceUsers, meetParticipants } from "@db/schema";
import { ensureTenantStaff, resolveTenantStaffFromRequest } from "./utils/auth";
import {
  addMeetArtifact,
  addParticipantsByUserIds,
  createMeetSession,
  endMeetSession,
  getMeetSession,
  getMeetStateSnapshot,
  issueMeetInvite,
  listMeetArtifacts,
  listMeetSessions,
  recordMeetEvent,
  resolveMeetAccessFromInviteToken,
  setMeetingLocked,
  setParticipantKick,
  setParticipantMute,
  upsertParticipantJoin,
} from "../lib/meet/service";
import { hashMeetJti, verifyMeetInviteToken } from "../lib/meet/inviteToken";
import { persistMeetingRecording } from "../lib/meet/recording";
import { generateMeetingSummary } from "../lib/meet/aiWorker";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 512 * 1024 * 1024,
    files: 1,
  },
});

const router = Router();

function parseIntSafe(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeRole(value: unknown): "host" | "cohost" | "attendee" | "observer" {
  const role = String(value || "").trim().toLowerCase();
  if (role === "host" || role === "cohost" || role === "observer") return role;
  return "attendee";
}

function parseBool(value: unknown, fallback = false) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function toIsoDate(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function getInviteTtlMs() {
  const fromEnv = Number.parseInt(String(process.env.MEET_INVITE_TTL_MS || ""), 10);
  if (Number.isFinite(fromEnv) && fromEnv > 60_000) return fromEnv;
  return 2 * 60 * 60 * 1000;
}

function getTurnServers() {
  const urls = String(process.env.TURN_URLS || "").trim();
  const username = String(process.env.TURN_STATIC_USERNAME || "").trim();
  const credential = String(process.env.TURN_STATIC_PASSWORD || "").trim();
  if (!urls) return [];
  return [
    {
      urls: urls.split(",").map((v) => v.trim()).filter(Boolean),
      username: username || undefined,
      credential: credential || undefined,
    },
  ];
}

function getIssuerIdentity(staffUser: any) {
  const userId = Number(staffUser?.id || 0);
  const email = String(staffUser?.email || "").trim().toLowerCase();
  const fullName = String(staffUser?.fullName || "").trim();
  const displayName = fullName || `${String(staffUser?.firstName || "").trim()} ${String(staffUser?.lastName || "").trim()}`.trim() || email;
  return { userId: Number.isFinite(userId) && userId > 0 ? userId : null, email: email || null, displayName: displayName || "Host" };
}

async function resolveHostPermission(input: { tenantId: number; meetingId: string; userId: number | null }) {
  if (!input.userId) return false;
  const participant = await db.query.meetParticipants.findFirst({
    where: and(eq(meetParticipants.tenantId, input.tenantId), eq(meetParticipants.meetingId, input.meetingId), eq(meetParticipants.userId, input.userId)),
  });
  if (participant && (participant.role === "host" || participant.role === "cohost")) return true;
  const meeting = await getMeetSession({ tenantId: input.tenantId, meetingId: input.meetingId });
  return Boolean(meeting && meeting.createdByUserId && Number(meeting.createdByUserId) === input.userId);
}

async function buildAccessFromToken(input: { token: string; tenantId: number; meetingId: string }) {
  const access = await resolveMeetAccessFromInviteToken({
    token: input.token,
    tenantId: input.tenantId,
    meetingId: input.meetingId,
  });
  if (!access.ok) {
    return { ok: false as const, reason: access.reason || "invalid_token" };
  }
  if (!access.payload || !access.participant) {
    return { ok: false as const, reason: "invalid_token" };
  }
  return {
    ok: true as const,
    role: access.role,
    participantId: Number(access.participant.id),
    sub: access.payload.sub,
    inviteId: access.invite.id,
    jtiHash: hashMeetJti(access.payload.jti),
  };
}

router.get("/healthz", async (_req, res) => {
  const turnServers = getTurnServers();
  res.json({
    ok: true,
    service: "exportunity-meet-api",
    timestamp: new Date().toISOString(),
    config: {
      turnConfigured: turnServers.length > 0,
      inviteTtlMs: getInviteTtlMs(),
      summaryModel: process.env.MEET_SUMMARY_MODEL || process.env.OPENAI_MODEL || null,
      announcedIp: process.env.MEET_ANNOUNCED_IP || null,
    },
  });
});

router.get("/turn", async (req: any, res) => {
  const tenant = req.tenant;
  if (!tenant) return res.status(500).json({ message: "Tenant not resolved" });
  const token = String(req.query?.token || "").trim();
  const staff = await resolveTenantStaffFromRequest(req);
  if (!staff && !token) return res.status(401).json({ message: "Authentication or invite token required" });

  if (token) {
    const parsed = verifyMeetInviteToken(token, String(process.env.MEET_INVITE_SECRET || process.env.JWT_SECRET || process.env.SESSION_SECRET || ""));
    if (!parsed.ok || !parsed.payload || parsed.payload.tenantId !== tenant.id) {
      return res.status(401).json({ message: "Invalid invite token" });
    }
  }

  return res.json({
    ok: true,
    iceServers: getTurnServers(),
  });
});

router.get("/meetings", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenant = req.tenant;
    const status = String(req.query?.status || "").trim().toLowerCase();
    const items = await listMeetSessions({
      tenantId: tenant.id,
      status: status === "scheduled" || status === "live" || status === "ended" ? (status as any) : null,
      limit: parseIntSafe(req.query?.limit, 50),
    });
    return res.json({ ok: true, items });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to list meetings" });
  }
});

router.post("/meetings", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenant = req.tenant;
    const staffUser = req.staffUser;
    const actor = getIssuerIdentity(staffUser);
    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });

    const meeting = await createMeetSession({
      tenantId: tenant.id,
      title,
      createdByUserId: actor.userId,
      createdByAgentId: parseIntSafe(req.body?.createdByAgentId, 0) || null,
      startsAt: toIsoDate(req.body?.startsAt),
      endsAt: toIsoDate(req.body?.endsAt),
      recordingEnabled: parseBool(req.body?.recordingEnabled, false),
      metadata: {
        source: "meet_api",
        createdByEmail: actor.email,
      },
    });

    if (actor.userId) {
      await upsertParticipantJoin({
        tenantId: tenant.id,
        meetingId: meeting.id,
        role: "host",
        userId: actor.userId,
        displayName: actor.displayName,
      });
    }

    const ttlMs = getInviteTtlMs();
    const hostInvite = await issueMeetInvite({
      meetingId: meeting.id,
      tenantId: tenant.id,
      role: "host",
      issuedTo: actor.email,
      sub: actor.userId ? `user:${actor.userId}` : `guest:${actor.email || "host"}`,
      expiresAt: new Date(Date.now() + ttlMs),
      createdByUserId: actor.userId,
      metadata: { purpose: "host_join" },
    });

    const invitedUserIds = Array.isArray(req.body?.userIds) ? req.body.userIds.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0) : [];
    if (invitedUserIds.length) {
      await addParticipantsByUserIds({
        tenantId: tenant.id,
        meetingId: meeting.id,
        userIds: invitedUserIds,
        defaultRole: "attendee",
      });
    }

    const inviteRole = normalizeRole(req.body?.inviteRole || "attendee");
    const emails = Array.isArray(req.body?.emails)
      ? req.body.emails.map((item: any) => String(item || "").trim().toLowerCase()).filter(Boolean)
      : [];
    const invites = [];
    for (const email of emails) {
      const invite = await issueMeetInvite({
        meetingId: meeting.id,
        tenantId: tenant.id,
        role: inviteRole,
        issuedTo: email,
        sub: `guest:${email}`,
        expiresAt: new Date(Date.now() + ttlMs),
        createdByUserId: actor.userId,
        metadata: { purpose: "guest_invite" },
      });
      invites.push({ email, ...invite, role: inviteRole });
    }

    const internalInvites = [];
    if (invitedUserIds.length) {
      const users = await db
        .select({
          id: eceUsers.id,
          email: eceUsers.email,
        })
        .from(eceUsers)
        .where(inArray(eceUsers.id, invitedUserIds));
      for (const user of users) {
        const invite = await issueMeetInvite({
          meetingId: meeting.id,
          tenantId: tenant.id,
          role: "attendee",
          issuedTo: user.email,
          sub: `user:${user.id}`,
          expiresAt: new Date(Date.now() + ttlMs),
          createdByUserId: actor.userId,
          metadata: { purpose: "internal_invite" },
        });
        internalInvites.push({ userId: user.id, email: user.email, ...invite, role: "attendee" as const });
      }
    }

    return res.status(201).json({
      ok: true,
      meeting,
      hostLink: hostInvite.link,
      hostToken: hostInvite.token,
      invites,
      internalInvites,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to create meeting" });
  }
});

router.post("/meetings/:id/invites", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenant = req.tenant;
    const staffUser = req.staffUser;
    const actor = getIssuerIdentity(staffUser);
    const meetingId = String(req.params?.id || "").trim();
    if (!meetingId) return res.status(400).json({ message: "meeting id is required" });

    const meeting = await getMeetSession({ tenantId: tenant.id, meetingId });
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });

    const ttlMs = getInviteTtlMs();
    const role = normalizeRole(req.body?.role || "attendee");
    const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
    if (!recipients.length) return res.status(400).json({ message: "recipients[] is required" });

    const out = [];
    for (const recipientRaw of recipients) {
      const recipient = String(recipientRaw || "").trim().toLowerCase();
      if (!recipient) continue;
      const isUserRef = /^user:\d+$/i.test(recipient);
      const sub = isUserRef ? recipient.toLowerCase() : `guest:${recipient}`;
      const invite = await issueMeetInvite({
        meetingId,
        tenantId: tenant.id,
        role,
        issuedTo: isUserRef ? null : recipient,
        sub,
        expiresAt: new Date(Date.now() + ttlMs),
        createdByUserId: actor.userId,
        metadata: { source: "meet_api.invites" },
      });
      out.push({
        recipient,
        role,
        ...invite,
      });
    }

    return res.json({ ok: true, items: out });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to issue invites" });
  }
});

router.post("/meetings/:id/join-token", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenant = req.tenant;
    const staffUser = req.staffUser;
    const actor = getIssuerIdentity(staffUser);
    const meetingId = String(req.params?.id || "").trim();
    const meeting = await getMeetSession({ tenantId: tenant.id, meetingId });
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });
    const role = normalizeRole(req.body?.role || "attendee");
    if (actor.userId) {
      await upsertParticipantJoin({
        tenantId: tenant.id,
        meetingId,
        role,
        userId: actor.userId,
        displayName: actor.displayName,
      });
    }
    const invite = await issueMeetInvite({
      meetingId,
      tenantId: tenant.id,
      role,
      issuedTo: actor.email,
      sub: actor.userId ? `user:${actor.userId}` : `guest:${actor.email || "staff"}`,
      expiresAt: new Date(Date.now() + getInviteTtlMs()),
      createdByUserId: actor.userId,
      metadata: { purpose: "join_token" },
    });
    return res.json({ ok: true, ...invite, meetingId });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to create join token" });
  }
});

router.get("/meetings/:id", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    const meetingId = String(req.params?.id || "").trim();
    if (!meetingId) return res.status(400).json({ message: "meeting id is required" });

    const staff = await resolveTenantStaffFromRequest(req);
    if (staff) {
      const snapshot = await getMeetStateSnapshot({ tenantId: tenant.id, meetingId });
      if (!snapshot) return res.status(404).json({ message: "Meeting not found" });
      return res.json({ ok: true, access: { kind: "staff" }, ...snapshot });
    }

    const token = String(req.query?.t || req.query?.token || "").trim();
    if (!token) return res.status(401).json({ message: "Invite token required" });

    const access = await buildAccessFromToken({ token, tenantId: tenant.id, meetingId });
    if (!access.ok) return res.status(401).json({ message: access.reason || "Invalid invite token" });

    const snapshot = await getMeetStateSnapshot({ tenantId: tenant.id, meetingId });
    if (!snapshot) return res.status(404).json({ message: "Meeting not found" });
    return res.json({
      ok: true,
      access: {
        kind: "invite",
        role: access.role,
        participantId: access.participantId,
        sub: access.sub,
      },
      ...snapshot,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch meeting" });
  }
});

router.post("/meetings/:id/lock", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenant = req.tenant;
    const actor = getIssuerIdentity(req.staffUser);
    const meetingId = String(req.params?.id || "").trim();
    const allowed = await resolveHostPermission({ tenantId: tenant.id, meetingId, userId: actor.userId });
    if (!allowed) return res.status(403).json({ message: "Host/cohost permission required" });
    const locked = parseBool(req.body?.locked, true);
    const meeting = await setMeetingLocked({ tenantId: tenant.id, meetingId, locked });
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });
    await recordMeetEvent({
      tenantId: tenant.id,
      meetingId,
      eventType: locked ? "meeting_locked" : "meeting_unlocked",
      payload: {
        actorUserId: actor.userId,
      },
    });
    return res.json({ ok: true, meeting });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to lock/unlock meeting" });
  }
});

router.post("/meetings/:id/mute", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenant = req.tenant;
    const actor = getIssuerIdentity(req.staffUser);
    const meetingId = String(req.params?.id || "").trim();
    const allowed = await resolveHostPermission({ tenantId: tenant.id, meetingId, userId: actor.userId });
    if (!allowed) return res.status(403).json({ message: "Host/cohost permission required" });
    const participantId = parseIntSafe(req.body?.participantId, 0);
    if (!participantId) return res.status(400).json({ message: "participantId is required" });
    const isMuted = parseBool(req.body?.isMuted, true);
    const participant = await setParticipantMute({
      tenantId: tenant.id,
      meetingId,
      participantId,
      isMuted,
    });
    if (!participant) return res.status(404).json({ message: "Participant not found" });
    await recordMeetEvent({
      tenantId: tenant.id,
      meetingId,
      participantId,
      eventType: "participant_muted",
      payload: { actorUserId: actor.userId, isMuted },
    });
    return res.json({ ok: true, participant });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to mute participant" });
  }
});

router.post("/meetings/:id/kick", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenant = req.tenant;
    const actor = getIssuerIdentity(req.staffUser);
    const meetingId = String(req.params?.id || "").trim();
    const allowed = await resolveHostPermission({ tenantId: tenant.id, meetingId, userId: actor.userId });
    if (!allowed) return res.status(403).json({ message: "Host/cohost permission required" });
    const participantId = parseIntSafe(req.body?.participantId, 0);
    if (!participantId) return res.status(400).json({ message: "participantId is required" });
    const participant = await setParticipantKick({
      tenantId: tenant.id,
      meetingId,
      participantId,
      kicked: true,
    });
    if (!participant) return res.status(404).json({ message: "Participant not found" });
    await recordMeetEvent({
      tenantId: tenant.id,
      meetingId,
      participantId,
      eventType: "participant_kicked",
      payload: { actorUserId: actor.userId },
    });
    return res.json({ ok: true, participant });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to kick participant" });
  }
});

router.post("/meetings/:id/events/chat", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    const meetingId = String(req.params?.id || "").trim();
    const token = String(req.body?.token || req.query?.token || "").trim();
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ message: "text is required" });
    if (!token) return res.status(401).json({ message: "token is required" });

    const access = await buildAccessFromToken({ token, tenantId: tenant.id, meetingId });
    if (!access.ok) return res.status(401).json({ message: access.reason || "Invalid token" });

    await recordMeetEvent({
      tenantId: tenant.id,
      meetingId,
      participantId: access.participantId,
      eventType: "chat_message",
      payload: {
        text,
        sub: access.sub,
      },
    });
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to post message" });
  }
});

router.post("/meetings/:id/recordings/upload", ensureTenantStaff, upload.any(), async (req: any, res) => {
  try {
    const tenant = req.tenant;
    const meetingId = String(req.params?.id || "").trim();
    const files = Array.isArray(req.files) ? req.files : [];
    const file = files[0] as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ message: "file is required" });
    const artifact = await persistMeetingRecording({
      tenantId: tenant.id,
      meetingId,
      file,
      metadata: {
        uploadedByUserId: req.staffUser?.id ?? null,
      },
    });
    return res.status(201).json({ ok: true, artifact });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to upload recording" });
  }
});

router.post("/meetings/:id/recordings", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenant = req.tenant;
    const meetingId = String(req.params?.id || "").trim();
    const storageUrl = String(req.body?.storageUrl || "").trim();
    if (!storageUrl) return res.status(400).json({ message: "storageUrl is required" });
    const artifact = await addMeetArtifact({
      tenantId: tenant.id,
      meetingId,
      type: "recording",
      storageUrl,
      metadata: {
        provider: String(req.body?.provider || "external_recorder"),
        sizeBytes: Number(req.body?.sizeBytes || 0) || null,
        durationSec: Number(req.body?.durationSec || 0) || null,
      },
    });
    await recordMeetEvent({
      tenantId: tenant.id,
      meetingId,
      eventType: "recording_uploaded",
      payload: {
        artifactId: artifact.id,
        storageUrl,
      },
    });
    return res.status(201).json({ ok: true, artifact });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to register recording" });
  }
});

router.post("/meetings/:id/summary", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenant = req.tenant;
    const meetingId = String(req.params?.id || "").trim();
    const output = await generateMeetingSummary({
      tenantId: tenant.id,
      meetingId,
      requestedByUserId: Number(req.staffUser?.id || 0) || null,
      trigger: "manual",
    });
    return res.json({ ok: true, ...output });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to generate summary" });
  }
});

router.post("/meetings/:id/end", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenant = req.tenant;
    const meetingId = String(req.params?.id || "").trim();
    const actor = getIssuerIdentity(req.staffUser);
    const allowed = await resolveHostPermission({ tenantId: tenant.id, meetingId, userId: actor.userId });
    if (!allowed) return res.status(403).json({ message: "Host/cohost permission required" });
    const meeting = await endMeetSession({ tenantId: tenant.id, meetingId });
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });
    const summary = await generateMeetingSummary({
      tenantId: tenant.id,
      meetingId,
      requestedByUserId: actor.userId,
      trigger: "auto_end",
    });
    return res.json({ ok: true, meeting, summary });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to end meeting" });
  }
});

router.get("/meetings/:id/artifacts", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenant = req.tenant;
    const meetingId = String(req.params?.id || "").trim();
    const items = await listMeetArtifacts({ tenantId: tenant.id, meetingId });
    return res.json({ ok: true, items });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to list artifacts" });
  }
});

export default router;
