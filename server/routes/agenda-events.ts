import { Router } from "express";
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@db";
import { agents, chatRooms, goals, meetingParticipants, meetingRooms, meetings, roomMemberships } from "@db/schema";
import { ensureTenantAdmin, ensureTenantStaff, isChairmanAssistantUser } from "./utils/auth";
import { reconcileTenantMeetingLifecycle } from "../lib/meetingLifecycle";

const router = Router();

const DURATION_PRESETS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const MAX_DURATION_MINUTES = 480;
const MIN_DURATION_MINUTES = 1;
const MEETING_MANAGEMENT_ROLES = ["host", "facilitator"] as const;

type ParticipantDraft = {
  participantType: "human" | "agent";
  userId: number | null;
  guestEmail: string | null;
  agentId: number | null;
  role: "host" | "facilitator" | "note_taker" | "participant" | "observer" | "decision_owner";
  required: boolean;
};

function toInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function clampDuration(value: unknown) {
  const parsed = toInt(value);
  if (!parsed) return 30;
  return Math.max(MIN_DURATION_MINUTES, Math.min(MAX_DURATION_MINUTES, parsed));
}

function hasOwnProperty(obj: unknown, key: string) {
  return !!obj && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key);
}

function parseDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (/^\d{8}$/.test(raw)) {
    const y = Number(raw.slice(0, 4));
    const m = Number(raw.slice(4, 6));
    const d = Number(raw.slice(6, 8));
    const parsed = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    if (Number.isFinite(parsed.getTime())) return parsed;
  }

  if (/^\d{8}T\d{6}Z$/i.test(raw)) {
    const y = Number(raw.slice(0, 4));
    const m = Number(raw.slice(4, 6));
    const d = Number(raw.slice(6, 8));
    const hh = Number(raw.slice(9, 11));
    const mm = Number(raw.slice(11, 13));
    const ss = Number(raw.slice(13, 15));
    const parsed = new Date(Date.UTC(y, m - 1, d, hh, mm, ss, 0));
    if (Number.isFinite(parsed.getTime())) return parsed;
  }

  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed;
}

type ParsedRecurrenceRule = {
  raw: string;
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  count: number | null;
  until: Date | null;
  byHour: number | null;
  byMinute: number | null;
};

function parseRecurrenceRule(value: unknown): ParsedRecurrenceRule | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const pairs = raw.split(";").map((part) => part.trim()).filter(Boolean);
  const map = new Map<string, string>();
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim().toUpperCase();
    const val = pair.slice(idx + 1).trim();
    if (!key || !val) continue;
    map.set(key, val);
  }

  const freqRaw = String(map.get("FREQ") || "").trim().toUpperCase();
  if (freqRaw !== "DAILY" && freqRaw !== "WEEKLY" && freqRaw !== "MONTHLY") return null;

  const intervalRaw = Number.parseInt(String(map.get("INTERVAL") || "1"), 10);
  const interval = Number.isFinite(intervalRaw) && intervalRaw > 0 ? Math.min(366, Math.trunc(intervalRaw)) : 1;

  const countRaw = Number.parseInt(String(map.get("COUNT") || ""), 10);
  const count = Number.isFinite(countRaw) && countRaw > 0 ? Math.trunc(countRaw) : null;

  const untilRaw = map.get("UNTIL");
  const until = untilRaw ? parseDate(untilRaw) : null;

  const byHourRaw = Number.parseInt(String(map.get("BYHOUR") || ""), 10);
  const byMinuteRaw = Number.parseInt(String(map.get("BYMINUTE") || ""), 10);
  const byHour = Number.isFinite(byHourRaw) && byHourRaw >= 0 && byHourRaw <= 23 ? byHourRaw : null;
  const byMinute = Number.isFinite(byMinuteRaw) && byMinuteRaw >= 0 && byMinuteRaw <= 59 ? byMinuteRaw : null;

  return {
    raw,
    freq: freqRaw,
    interval,
    count,
    until,
    byHour,
    byMinute,
  };
}

function addRecurrenceStep(input: Date, freq: ParsedRecurrenceRule["freq"], interval: number) {
  const next = new Date(input.getTime());
  if (freq === "DAILY") {
    next.setUTCDate(next.getUTCDate() + interval);
    return next;
  }
  if (freq === "WEEKLY") {
    next.setUTCDate(next.getUTCDate() + interval * 7);
    return next;
  }
  next.setUTCMonth(next.getUTCMonth() + interval);
  return next;
}

function applyRecurrenceClock(input: Date, rule: ParsedRecurrenceRule, baseStart: Date) {
  const next = new Date(input.getTime());
  next.setUTCHours(
    rule.byHour ?? baseStart.getUTCHours(),
    rule.byMinute ?? baseStart.getUTCMinutes(),
    baseStart.getUTCSeconds(),
    0,
  );
  return next;
}

function shouldIncludeStart(start: Date, from: Date | null, to: Date | null) {
  if (from && start < from) return false;
  if (to && start > to) return false;
  return true;
}

function buildAgendaEventsForMeeting(
  meeting: any,
  range: { from: Date | null; to: Date | null },
) {
  const metadata = (meeting?.metadata as Record<string, unknown> | null) || {};
  const recurrenceRule = parseRecurrenceRule(metadata?.recurrenceRule);
  const start = parseDate(meeting?.startTime);
  if (!start) return [];

  if (!recurrenceRule) {
    if (!shouldIncludeStart(start, range.from, range.to)) return [];
    return [meetingToAgendaEvent(meeting)];
  }

  const durationMinutes = Number(meeting?.duration || 0);
  const fallbackDurationMs = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes * 60_000 : 30 * 60_000;
  const maxOccurrences = 2000;
  const out: any[] = [];

  let currentStart = applyRecurrenceClock(new Date(start.getTime()), recurrenceRule, start);
  let generated = 0;

  while (generated < maxOccurrences) {
    if (recurrenceRule.count && generated >= recurrenceRule.count) break;
    if (recurrenceRule.until && currentStart > recurrenceRule.until) break;
    if (range.to && currentStart > range.to) break;

    if (shouldIncludeStart(currentStart, range.from, range.to)) {
      const endTime = new Date(currentStart.getTime() + fallbackDurationMs);
      const occurrence = meetingToAgendaEvent({
        ...meeting,
        startTime: currentStart,
        endTime,
        metadata: {
          ...metadata,
          recurrenceRule: recurrenceRule.raw,
          recurrenceParentMeetingId: meeting.id,
          recurrenceOccurrenceStart: currentStart.toISOString(),
        },
      });
      occurrence.id = `agenda:${meeting.id}:${currentStart.toISOString()}`;
      out.push(occurrence);
    }

    generated += 1;
    currentStart = applyRecurrenceClock(
      addRecurrenceStep(currentStart, recurrenceRule.freq, recurrenceRule.interval),
      recurrenceRule,
      start,
    );
  }

  return out;
}

function toAgendaStatus(meetingStatus: string | null | undefined) {
  const raw = String(meetingStatus || "").trim().toLowerCase();
  if (raw === "cancelled") return "canceled";
  if (raw === "completed") return "scheduled";
  return "scheduled";
}

function normalizeMeetingType(value: unknown) {
  return String(value ?? "").trim();
}

function parseMeetingTypeDefaults(meetingType: string) {
  const normalized = meetingType.toLowerCase();
  if (normalized === "weekly_ops_sync") return { duration: 30, outputTemplate: "weekly_ops_sync" };
  if (normalized === "incident") return { duration: 45, outputTemplate: "incident" };
  if (normalized === "investor_call") return { duration: 60, outputTemplate: "investor_call" };
  return { duration: 30, outputTemplate: "general" };
}

function normalizeRole(value: unknown, fallback: ParticipantDraft["role"] = "participant"): ParticipantDraft["role"] {
  const raw = String(value ?? "").trim().toLowerCase();
  if (
    raw === "host" ||
    raw === "facilitator" ||
    raw === "note_taker" ||
    raw === "participant" ||
    raw === "observer" ||
    raw === "decision_owner"
  ) {
    return raw;
  }
  return fallback;
}

function normalizeParticipantType(value: unknown): "human" | "agent" {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "human" ? "human" : "agent";
}

function parseGuestEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function hasAdminPrivileges(user: any): boolean {
  const currentMode = String(user?.currentMode || "").toLowerCase();
  if (currentMode === "admin") return true;
  if (isChairmanAssistantUser(user)) return true;
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  if (roles.some((role: unknown) => String(role || "").toLowerCase() === "admin")) return true;
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  if (permissions.includes("*")) return true;
  return false;
}

async function userCanManageMeeting(meetingId: number, tenantId: number, staffUser: any): Promise<boolean> {
  if (hasAdminPrivileges(staffUser)) return true;

  const userId = toInt(staffUser?.id);
  if (!userId || userId <= 0) return false;

  const participant = await db.query.meetingParticipants.findFirst({
    where: and(
      eq(meetingParticipants.meetingId, meetingId),
      or(eq(meetingParticipants.tenantId, tenantId), isNull(meetingParticipants.tenantId)),
      eq(meetingParticipants.participantType, "human" as any),
      eq(meetingParticipants.userId, userId),
      inArray(meetingParticipants.role as any, [...MEETING_MANAGEMENT_ROLES] as any),
    ),
  });

  return !!participant;
}

function meetingToAgendaEvent(meeting: any) {
  const metadata = (meeting?.metadata as Record<string, unknown> | null) || {};
  return {
    id: `agenda:${meeting.id}`,
    agendaEventId: meeting.id,
    title: meeting.title,
    description: meeting.description ?? null,
    startAt: meeting.startTime ?? null,
    endAt: meeting.endTime ?? null,
    durationMinutes: meeting.duration ?? null,
    roomId: meeting.roomId ?? null,
    meetingType: meeting.meetingType ?? "general",
    recurrenceRule: metadata?.recurrenceRule ?? null,
    parentEventId: metadata?.parentEventId ?? null,
    status: meeting.status ?? "scheduled",
    agendaStatus: toAgendaStatus(meeting.status),
    createdByUserId: metadata?.createdByUserId ?? null,
    meetingId: meeting.id,
    source: "meetings" as const,
    eventType: "meeting" as const,
    startTime: meeting.startTime ?? null,
    endTime: meeting.endTime ?? null,
    duration: meeting.duration ?? null,
    conversationId: meeting.conversationId,
    organizerId: meeting.organizerId ?? null,
    statusRaw: meeting.status,
    metadata,
    createdAt: meeting.createdAt ?? null,
    updatedAt: meeting.updatedAt ?? null,
  };
}

function extractAttendeeDrafts(input: any) {
  const attendees: ParticipantDraft[] = [];
  const source = Array.isArray(input?.attendees) ? input.attendees : [];
  const legacyAgentIds = Array.isArray(input?.participants) ? input.participants : [];

  for (const entry of source) {
    const participantType = normalizeParticipantType(entry?.participantType ?? entry?.type);
    if (participantType === "agent") {
      const agentId = toInt(entry?.agentId ?? entry?.agent_id ?? entry?.id);
      if (!agentId || agentId <= 0) continue;
      attendees.push({
        participantType: "agent",
        userId: null,
        guestEmail: null,
        agentId,
        role: normalizeRole(entry?.role, "participant"),
        required: entry?.required !== undefined ? Boolean(entry.required) : true,
      });
      continue;
    }

    const userId = toInt(entry?.userId ?? entry?.user_id);
    const guestEmail = parseGuestEmail(entry?.guestEmail ?? entry?.guest_email);
    if (!userId && !guestEmail) continue;
    attendees.push({
      participantType: "human",
      userId: userId && userId > 0 ? userId : null,
      guestEmail,
      agentId: null,
      role: normalizeRole(entry?.role, "participant"),
      required: entry?.required !== undefined ? Boolean(entry.required) : true,
    });
  }

  for (const id of legacyAgentIds) {
    const agentId = toInt(id);
    if (!agentId || agentId <= 0) continue;
    attendees.push({
      participantType: "agent",
      userId: null,
      guestEmail: null,
      agentId,
      role: "participant",
      required: true,
    });
  }

  return attendees;
}

function normalizeParticipantRows(rows: ParticipantDraft[]) {
  const seenAgent = new Set<number>();
  const seenUser = new Set<number>();
  const seenGuest = new Set<string>();
  const uniqueRows: ParticipantDraft[] = [];

  for (const row of rows) {
    if (row.participantType === "agent" && row.agentId) {
      if (seenAgent.has(row.agentId)) continue;
      seenAgent.add(row.agentId);
      uniqueRows.push(row);
      continue;
    }
    if (row.participantType === "human" && row.userId) {
      if (seenUser.has(row.userId)) continue;
      seenUser.add(row.userId);
      uniqueRows.push(row);
      continue;
    }
    if (row.participantType === "human" && row.guestEmail) {
      if (seenGuest.has(row.guestEmail)) continue;
      seenGuest.add(row.guestEmail);
      uniqueRows.push(row);
    }
  }

  return uniqueRows;
}

async function ensureNoteTakerAgent(rows: ParticipantDraft[], room: any, companyId: number | null) {
  const hasNoteTaker = rows.some((row) => row.participantType === "agent" && row.role === "note_taker" && row.agentId);
  if (hasNoteTaker) return rows;

  const firstAgent = rows.find((row) => row.participantType === "agent" && row.agentId);
  if (firstAgent) {
    firstAgent.role = "note_taker";
    return rows;
  }

  const candidatesRaw = (room as any)?.defaultAgentsJson;
  const roomDefaultIds: number[] = Array.isArray(candidatesRaw)
    ? candidatesRaw.map((value: unknown) => toInt(value)).filter((value): value is number => !!value && value > 0)
    : Array.isArray(candidatesRaw?.agentIds)
      ? candidatesRaw.agentIds
          .map((value: unknown) => toInt(value))
          .filter((value: number | null): value is number => !!value && value > 0)
      : [];

  if (roomDefaultIds.length) {
    rows.push({
      participantType: "agent",
      userId: null,
      guestEmail: null,
      agentId: roomDefaultIds[0],
      role: "note_taker",
      required: true,
    });
    return rows;
  }

  const agentConditions: any[] = [eq(agents.status, "active")];
  if (companyId && Number.isFinite(companyId) && companyId > 0) {
    agentConditions.push(eq(agents.companyId, companyId));
  }

  const fallbackAgent = await db.query.agents.findFirst({
    where: agentConditions.length ? and(...agentConditions) : undefined,
    orderBy: [asc(agents.id)],
  });
  if (fallbackAgent?.id) {
    rows.push({
      participantType: "agent",
      userId: null,
      guestEmail: null,
      agentId: Number(fallbackAgent.id),
      role: "note_taker",
      required: true,
    });
  }

  return rows;
}

async function upsertMeetingAgentContexts(tenantId: number, meetingId: number, agentIds: number[]) {
  for (const agentId of agentIds) {
    await db.execute(sql`
      insert into meeting_agent_instances (tenant_id, meeting_id, agent_id, context_key, status, created_at, updated_at)
      values (${tenantId}, ${meetingId}, ${agentId}, ${`meeting:${meetingId}:agent:${agentId}`}, 'active', now(), now())
      on conflict (meeting_id, agent_id)
      do update set context_key = excluded.context_key, status = 'active', updated_at = now();
    `);
  }
}

async function syncRoomMembership(roomConversationId: string, agentIds: number[]) {
  if (!roomConversationId || !agentIds.length) return;
  const room = await db.query.chatRooms.findFirst({ where: eq(chatRooms.conversationId, roomConversationId) });
  if (!room) return;

  const existing = await db.query.roomMemberships.findMany({ where: eq(roomMemberships.roomId, room.id) });
  const existingAgentIds = new Set(existing.map((row: any) => Number(row.agentId)).filter((value: number) => value > 0));
  const missing = agentIds.filter((id) => !existingAgentIds.has(id));
  if (!missing.length) return;

  await db.insert(roomMemberships).values(
    missing.map((agentId) => ({
      roomId: room.id,
      agentId,
      joinedAt: new Date(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })) as any,
  );
}

router.get("/agenda-events", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = toInt(req?.tenant?.id);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });

    await reconcileTenantMeetingLifecycle(tenantId);

    const from = parseDate(req.query?.from);
    const to = parseDate(req.query?.to);
    const roomId = toInt(req.query?.room_id ?? req.query?.roomId);
    const meetingType = normalizeMeetingType(req.query?.meeting_type ?? req.query?.type ?? req.query?.meetingType);

    const where: any[] = [or(eq(meetings.tenantId, tenantId), isNull(meetings.tenantId))];
    if (roomId && roomId > 0) where.push(eq(meetings.roomId, roomId));
    if (meetingType) where.push(eq(meetings.meetingType, meetingType));

    const items = await db.query.meetings.findMany({
      where: where.length ? and(...where) : undefined,
      orderBy: [asc(meetings.startTime)],
      limit: 500,
    });

    const expandedMeetings = items
      .flatMap((meeting) => buildAgendaEventsForMeeting(meeting, { from, to }))
      .sort((a, b) => {
        const left = parseDate((a as any)?.startTime)?.getTime() ?? 0;
        const right = parseDate((b as any)?.startTime)?.getTime() ?? 0;
        return left - right;
      })
      .slice(0, 2000);

    // Include legacy meeting chat-rooms that are not linked to a `meetings` row (ad-hoc meetings).
    // This prevents "empty agenda" when the current system created meeting rooms directly.
    const roomWhere: any[] = [eq(chatRooms.type, "meeting")];
    if (from) roomWhere.push(gte(chatRooms.createdAt, from));
    if (to) roomWhere.push(lte(chatRooms.createdAt, to));
    // Tenant scope: best-effort since chat_rooms has no tenant_id column.
    const roomTenantId = sql`coalesce(${chatRooms.metadata}->>'tenantId', ${chatRooms.metadata}->'context'->>'tenantId', '')`;
    roomWhere.push(sql`(${roomTenantId} = ${String(tenantId)} OR ${chatRooms.conversationId} like ${`meeting:${tenantId}:%`})`);

    if (meetingType) {
      const roomMeetingType = sql`coalesce(${chatRooms.metadata}->>'meetingType', '')`;
      roomWhere.push(sql`(${roomMeetingType} = ${meetingType} OR ${roomMeetingType} = '')`);
    }

    const roomRows = await db.query.chatRooms.findMany({
      where: roomWhere.length ? and(...roomWhere) : undefined,
      orderBy: [asc(chatRooms.createdAt)],
      limit: 500,
    });

    const existingConversationIds = new Set(
      expandedMeetings
        .map((item: any) => String(item?.conversationId || "").trim())
        .filter((value) => value.length > 0),
    );

    const expandedRooms = roomRows
      .filter((room) => {
        const conversationId = String(room.conversationId || "").trim();
        if (!conversationId) return true;
        return !existingConversationIds.has(conversationId);
      })
      .map((room) => ({
        id: `room:${room.id}`,
        agendaEventId: null,
        title: room.name,
        description: room.description ?? null,
        startAt: room.createdAt ?? null,
        endAt: null,
        durationMinutes: null,
        roomId: null,
        meetingType: (room.metadata as any)?.meetingType ?? "general",
        recurrenceRule: null,
        parentEventId: null,
        status: room.isActive ? ("in_progress" as const) : ("completed" as const),
        agendaStatus: room.isActive ? ("scheduled" as const) : ("scheduled" as const),
        createdByUserId: (room.metadata as any)?.createdByUserId ?? null,
        meetingId: null,
        source: "chatrooms" as const,
        eventType: "meeting" as const,
        startTime: room.createdAt ?? null,
        endTime: null,
        duration: null,
        conversationId: room.conversationId,
        organizerId: room.moderatorId ?? null,
        statusRaw: room.isActive ? "in_progress" : "completed",
        metadata: room.metadata ?? {},
        createdAt: room.createdAt ?? null,
        updatedAt: room.updatedAt ?? null,
      }));

    const merged = [...expandedMeetings, ...expandedRooms]
      .sort((a, b) => {
        const left = parseDate((a as any)?.startTime)?.getTime() ?? 0;
        const right = parseDate((b as any)?.startTime)?.getTime() ?? 0;
        return left - right;
      })
      .slice(0, 2000);

    return res.json({ ok: true, items: merged });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to fetch agenda events" });
  }
});

router.post("/agenda-events", ensureTenantAdmin, async (req: any, res) => {
  try {
    const staffUser = req.staffUser;
    if (!staffUser) return res.status(401).json({ message: "Authentication required" });

    const tenantId = toInt(req?.tenant?.id);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });

    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });

    const meetingType = normalizeMeetingType(req.body?.meeting_type ?? req.body?.meetingType);
    if (!meetingType) return res.status(400).json({ message: "meeting_type is required" });

    const startAt =
      parseDate(req.body?.start_at ?? req.body?.startAt ?? req.body?.startTime) ??
      parseDate(req.body?.planned_start_at ?? req.body?.plannedStartAt);
    if (!startAt) return res.status(400).json({ message: "start_at is required" });

    const defaults = parseMeetingTypeDefaults(meetingType);
    const durationMinutes = clampDuration(req.body?.duration_minutes ?? req.body?.duration ?? defaults.duration);
    const roomId = toInt(req.body?.room_id ?? req.body?.roomId);
    if (!roomId || roomId <= 0) return res.status(400).json({ message: "room_id is required" });

    const room = await db.query.meetingRooms.findFirst({
      where: and(eq(meetingRooms.id, roomId), or(eq(meetingRooms.tenantId, tenantId), isNull(meetingRooms.tenantId))),
    });
    if (!room) return res.status(404).json({ message: "Room not found" });

    const objectiveId = toInt(
      req.body?.objective_id ?? req.body?.objectiveId ?? req.body?.goal_id ?? req.body?.goalId,
    );
    if (!objectiveId || objectiveId <= 0) {
      return res.status(422).json({
        message: "objective_id is required before scheduling agenda events.",
      });
    }

    const attendees = normalizeParticipantRows(extractAttendeeDrafts(req.body));
    const participantRows: ParticipantDraft[] = [
      {
        participantType: "human",
        userId: Number(staffUser.id),
        guestEmail: null,
        agentId: null,
        role: "host",
        required: true,
      },
      ...attendees,
    ];

    const companyId = toInt(req.body?.company_id ?? req.body?.companyId);

    const goal = await db.query.goals.findFirst({
      where: eq(goals.id, objectiveId),
      columns: {
        id: true,
        companyId: true,
      },
    });
    if (!goal) {
      return res.status(404).json({ message: "Objective not found" });
    }
    if (companyId && goal.companyId !== companyId) {
      return res.status(422).json({
        message: "Objective must belong to the selected company.",
      });
    }

    await ensureNoteTakerAgent(participantRows, room, companyId);

    const hasNoteTakerAgent = participantRows.some(
      (row) => row.participantType === "agent" && row.role === "note_taker" && row.agentId,
    );
    if (!hasNoteTakerAgent) {
      return res.status(422).json({ message: "Meeting must include at least one note_taker agent." });
    }

    const hasHost = participantRows.some((row) => row.role === "host");
    if (!hasHost) {
      return res.status(422).json({ message: "Meeting must include at least one host." });
    }

    const externalGuests = participantRows.filter((row) => row.participantType === "human" && row.guestEmail);
    const recordingPolicy = String(req.body?.recording_policy ?? req.body?.recordingPolicy ?? "").trim().toLowerCase();
    const transcriptPolicy = String(req.body?.transcript_policy ?? req.body?.transcriptPolicy ?? "").trim().toLowerCase();
    if (externalGuests.length && (!recordingPolicy || !transcriptPolicy)) {
      return res.status(422).json({
        message: "External guests require explicit recording_policy and transcript_policy selection.",
      });
    }

    const warnings: string[] = [];
    const roomHumanCapacity = Number((room as any)?.capacityHumans ?? (room as any)?.capacity ?? 0);
    const invitedHumans = participantRows.filter((row) => row.participantType === "human").length;
    if (roomHumanCapacity > 0 && invitedHumans > roomHumanCapacity) {
      warnings.push(
        `Room capacity warning: invited humans (${invitedHumans}) exceed capacity_humans (${roomHumanCapacity}).`,
      );
    }

    const plannedEnd = new Date(startAt.getTime() + durationMinutes * 60000);
    const conversationId = `meeting:${tenantId}:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`;

    const metadata = {
      ...(req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {}),
      createdVia: "agenda-events",
      outputTemplate: defaults.outputTemplate,
      recurrenceRule: req.body?.recurrence_rule ?? req.body?.recurrenceRule ?? null,
      parentEventId: toInt(req.body?.parent_event_id ?? req.body?.parentEventId),
      recordingPolicy: recordingPolicy || null,
      transcriptPolicy: transcriptPolicy || null,
      createdByUserId: Number(staffUser.id),
      goalId: objectiveId,
      objectiveId,
    };

    const [meeting] = await db
      .insert(meetings)
      .values({
        tenantId,
        companyId: companyId && companyId > 0 ? companyId : null,
        title,
        description: String(req.body?.description || "").trim() || null,
        roomId,
        meetingType,
        type: "scheduled" as any,
        startTime: startAt,
        endTime: plannedEnd,
        duration: durationMinutes,
        actualStartAt: null,
        organizerId: null,
        status: "scheduled" as any,
        conversationId,
        metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .returning();

    const participantInsertRows = participantRows.map((row) => ({
      tenantId,
      meetingId: meeting.id,
      participantType: row.participantType,
      userId: row.userId,
      guestEmail: row.guestEmail,
      agentId: row.agentId,
      role: row.role,
      required: row.required,
      invitedAt: new Date(),
      joinedAt: null,
      leftAt: null,
      status: "invited",
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const participants = await db.insert(meetingParticipants).values(participantInsertRows as any).returning();

    await db.insert(chatRooms).values({
      name: title,
      type: "meeting",
      description: String(req.body?.description || "").trim() || null,
      moderatorId: null,
      conversationId,
      metadata: {
        meetingId: meeting.id,
        tenantId,
        companyId: companyId && companyId > 0 ? companyId : null,
        meetingType,
        goalId: objectiveId,
        objectiveId,
      },
    } as any);

    const participantAgentIds = participants
      .filter((row: any) => row.participantType === "agent" && row.agentId)
      .map((row: any) => Number(row.agentId))
      .filter((value: number) => Number.isFinite(value) && value > 0);
    if (participantAgentIds.length) {
      await syncRoomMembership(conversationId, participantAgentIds);
      await upsertMeetingAgentContexts(tenantId, meeting.id, participantAgentIds);
    }

    return res.status(201).json({
      ok: true,
      agendaEvent: meetingToAgendaEvent(meeting),
      meeting,
      participants,
      warnings,
      presets: DURATION_PRESETS,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to create agenda event" });
  }
});

router.patch("/agenda-events/:id", ensureTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = toInt(req?.tenant?.id);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });

    const meetingId = toInt(req.params?.id);
    if (!meetingId || meetingId <= 0) return res.status(400).json({ message: "Invalid event id" });

    const existing = await db.query.meetings.findFirst({
      where: and(eq(meetings.id, meetingId), or(eq(meetings.tenantId, tenantId), isNull(meetings.tenantId))),
    });
    if (!existing) return res.status(404).json({ message: "Agenda event not found" });

    const patch: any = { updatedAt: new Date() };

    if (req.body?.title !== undefined) patch.title = String(req.body.title || "").trim() || existing.title;
    if (req.body?.description !== undefined) {
      const nextDescription = String(req.body.description || "").trim();
      patch.description = nextDescription || null;
    }

    const nextMeetingType = normalizeMeetingType(req.body?.meeting_type ?? req.body?.meetingType);
    if (nextMeetingType) patch.meetingType = nextMeetingType;

    let nextStart = existing.startTime ? new Date(existing.startTime) : null;
    const parsedStart = parseDate(req.body?.start_at ?? req.body?.startAt ?? req.body?.startTime);
    if (parsedStart) {
      nextStart = parsedStart;
      patch.startTime = parsedStart;
    }

    let nextDuration = existing.duration ?? 30;
    if (req.body?.duration_minutes !== undefined || req.body?.duration !== undefined) {
      nextDuration = clampDuration(req.body?.duration_minutes ?? req.body?.duration);
      patch.duration = nextDuration;
    }

    if (nextStart) {
      patch.endTime = new Date(nextStart.getTime() + nextDuration * 60000);
    }

    const roomId = toInt(req.body?.room_id ?? req.body?.roomId);
    if (roomId && roomId > 0) {
      const room = await db.query.meetingRooms.findFirst({
        where: and(eq(meetingRooms.id, roomId), or(eq(meetingRooms.tenantId, tenantId), isNull(meetingRooms.tenantId))),
      });
      if (!room) return res.status(404).json({ message: "Room not found" });
      patch.roomId = roomId;
    }

    const statusRaw = String(req.body?.status || "").trim().toLowerCase();
    if (statusRaw === "canceled" || statusRaw === "cancelled") patch.status = "cancelled";
    if (statusRaw === "scheduled") patch.status = "scheduled";

    const objectiveFieldProvided =
      hasOwnProperty(req.body, "objective_id") ||
      hasOwnProperty(req.body, "objectiveId") ||
      hasOwnProperty(req.body, "goal_id") ||
      hasOwnProperty(req.body, "goalId");

    const objectiveId = toInt(
      req.body?.objective_id ?? req.body?.objectiveId ?? req.body?.goal_id ?? req.body?.goalId,
    );

    if (objectiveFieldProvided && (!objectiveId || objectiveId <= 0)) {
      return res.status(422).json({ message: "objective_id cannot be cleared from agenda events." });
    }

    if (objectiveFieldProvided && objectiveId && objectiveId > 0) {
      const objective = await db.query.goals.findFirst({
        where: eq(goals.id, objectiveId),
        columns: { id: true, companyId: true },
      });
      if (!objective) return res.status(404).json({ message: "Objective not found" });
      const effectiveCompanyId = patch.companyId ?? existing.companyId ?? null;
      if (effectiveCompanyId && objective.companyId !== effectiveCompanyId) {
        return res.status(422).json({ message: "Objective must belong to the same company." });
      }
    }

    const nextMetadata = {
      ...((existing.metadata as any) || {}),
      recurrenceRule:
        req.body?.recurrence_rule !== undefined
          ? req.body.recurrence_rule
          : req.body?.recurrenceRule !== undefined
            ? req.body.recurrenceRule
            : (existing.metadata as any)?.recurrenceRule ?? null,
      parentEventId:
        req.body?.parent_event_id !== undefined || req.body?.parentEventId !== undefined
          ? toInt(req.body?.parent_event_id ?? req.body?.parentEventId)
          : (existing.metadata as any)?.parentEventId ?? null,
      goalId: objectiveFieldProvided ? objectiveId : (existing.metadata as any)?.goalId ?? null,
      objectiveId: objectiveFieldProvided ? objectiveId : (existing.metadata as any)?.objectiveId ?? null,
    };
    patch.metadata = nextMetadata;

    const [updated] = await db.update(meetings).set(patch).where(eq(meetings.id, meetingId)).returning();
    return res.json({ ok: true, agendaEvent: meetingToAgendaEvent(updated || existing), meeting: updated || existing });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to update agenda event" });
  }
});

router.post("/agenda-events/:id/cancel", ensureTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = toInt(req?.tenant?.id);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });

    const meetingId = toInt(req.params?.id);
    if (!meetingId || meetingId <= 0) return res.status(400).json({ message: "Invalid event id" });

    const existing = await db.query.meetings.findFirst({
      where: and(eq(meetings.id, meetingId), or(eq(meetings.tenantId, tenantId), isNull(meetings.tenantId))),
    });
    if (!existing) return res.status(404).json({ message: "Agenda event not found" });

    const canManage = await userCanManageMeeting(meetingId, tenantId, req.staffUser);
    if (!canManage) return res.status(403).json({ message: "Only host or facilitator can cancel this meeting" });

    const [updated] = await db
      .update(meetings)
      .set({ status: "cancelled", updatedAt: new Date() } as any)
      .where(eq(meetings.id, meetingId))
      .returning();

    return res.json({ ok: true, agendaEvent: meetingToAgendaEvent(updated || existing), meeting: updated || existing });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to cancel agenda event" });
  }
});

router.post("/agenda-events/:id/meet", ensureTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = toInt(req?.tenant?.id);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });

    const meetingId = toInt(req.params?.id);
    if (!meetingId || meetingId <= 0) return res.status(400).json({ message: "Invalid event id" });

    const existing = await db.query.meetings.findFirst({
      where: and(eq(meetings.id, meetingId), or(eq(meetings.tenantId, tenantId), isNull(meetings.tenantId))),
    });
    if (!existing) return res.status(404).json({ message: "Agenda event not found" });

    const canManage = await userCanManageMeeting(meetingId, tenantId, req.staffUser);
    if (!canManage) return res.status(403).json({ message: "Only host or facilitator can start this meeting" });

    if (String(existing.status) === "cancelled") return res.status(409).json({ message: "Canceled meetings cannot start" });
    if (String(existing.status) === "completed") return res.status(409).json({ message: "Ended meetings cannot start" });

    const meetingObjectiveId = toInt(
      (existing.metadata as any)?.objectiveId ?? (existing.metadata as any)?.goalId,
    );
    if (!meetingObjectiveId || meetingObjectiveId <= 0) {
      return res.status(422).json({
        message: "Objective is required before starting this agenda meeting.",
      });
    }

    const [updated] = await db
      .update(meetings)
      .set({
        status: "in_progress",
        actualStartAt: existing.actualStartAt ?? new Date(),
        updatedAt: new Date(),
      } as any)
      .where(eq(meetings.id, meetingId))
      .returning();

    return res.json({ ok: true, agendaEvent: meetingToAgendaEvent(updated || existing), meeting: updated || existing });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to instantiate meeting" });
  }
});

router.post("/meetings/:id/participants", ensureTenantAdmin, async (req: any, res) => {
  try {
    const staffUser = req.staffUser;
    if (!staffUser) return res.status(401).json({ message: "Authentication required" });

    const tenantId = toInt(req?.tenant?.id);
    if (!tenantId) return res.status(400).json({ message: "tenant required" });

    const meetingId = toInt(req.params?.id);
    if (!meetingId || meetingId <= 0) return res.status(400).json({ message: "Invalid meeting id" });

    const meeting = await db.query.meetings.findFirst({
      where: and(eq(meetings.id, meetingId), or(eq(meetings.tenantId, tenantId), isNull(meetings.tenantId))),
    });
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });

    const canManage = await userCanManageMeeting(meetingId, tenantId, staffUser);
    if (!canManage) {
      return res.status(403).json({ message: "Only host or facilitator can manage meeting participants" });
    }

    const remove = Array.isArray(req.body?.remove) ? req.body.remove : [];
    for (const entry of remove) {
      const participantId = toInt(entry?.id ?? entry?.participantId ?? entry);
      if (participantId && participantId > 0) {
        await db
          .delete(meetingParticipants)
          .where(and(eq(meetingParticipants.meetingId, meetingId), eq(meetingParticipants.id, participantId)));
        continue;
      }

      const agentId = toInt(entry?.agentId ?? entry?.agent_id);
      if (agentId && agentId > 0) {
        await db
          .delete(meetingParticipants)
          .where(
            and(
              eq(meetingParticipants.meetingId, meetingId),
              eq(meetingParticipants.participantType, "agent" as any),
              eq(meetingParticipants.agentId, agentId),
            ),
          );
        continue;
      }

      const userId = toInt(entry?.userId ?? entry?.user_id);
      if (userId && userId > 0) {
        await db
          .delete(meetingParticipants)
          .where(
            and(
              eq(meetingParticipants.meetingId, meetingId),
              eq(meetingParticipants.participantType, "human" as any),
              eq(meetingParticipants.userId, userId),
            ),
          );
      }

      const guestEmail = parseGuestEmail(entry?.guestEmail ?? entry?.guest_email);
      if (guestEmail) {
        await db
          .delete(meetingParticipants)
          .where(
            and(
              eq(meetingParticipants.meetingId, meetingId),
              eq(meetingParticipants.participantType, "human" as any),
              eq(meetingParticipants.guestEmail, guestEmail),
            ),
          );
      }
    }

    const addRows = normalizeParticipantRows(extractAttendeeDrafts(req.body));
    if (addRows.length) {
      await db.insert(meetingParticipants).values(
        addRows.map((row) => ({
          tenantId,
          meetingId,
          participantType: row.participantType,
          userId: row.userId,
          guestEmail: row.guestEmail,
          agentId: row.agentId,
          role: row.role,
          required: row.required,
          invitedAt: new Date(),
          joinedAt: null,
          leftAt: null,
          status: "invited",
          createdAt: new Date(),
          updatedAt: new Date(),
        })) as any,
      );
    }

    const warnings: string[] = [];
    let participants = await db.query.meetingParticipants.findMany({
      where: eq(meetingParticipants.meetingId, meetingId),
      orderBy: [asc(meetingParticipants.createdAt)],
    });

    if (!participants.some((row: any) => String(row.role || "").toLowerCase() === "host")) {
      const hostCandidate = participants.find((row: any) => String(row.participantType || "") === "human") || participants[0];
      if (hostCandidate) {
        await db
          .update(meetingParticipants)
          .set({ role: "host", updatedAt: new Date() } as any)
          .where(eq(meetingParticipants.id, hostCandidate.id));
        warnings.push("No host selected: promoted one participant to host.");
      }
    }

    participants = await db.query.meetingParticipants.findMany({
      where: eq(meetingParticipants.meetingId, meetingId),
      orderBy: [asc(meetingParticipants.createdAt)],
    });

    if (!participants.some((row: any) => String(row.participantType || "") === "agent")) {
      return res.status(422).json({ message: "At least one agent participant is required." });
    }

    if (
      !participants.some(
        (row: any) => String(row.participantType || "") === "agent" && String(row.role || "").toLowerCase() === "note_taker",
      )
    ) {
      const candidate =
        participants.find(
          (row: any) => String(row.participantType || "") === "agent" && String(row.role || "").toLowerCase() !== "host",
        ) || participants.find((row: any) => String(row.participantType || "") === "agent");
      if (!candidate) {
        return res.status(422).json({ message: "Meeting must include a note_taker agent." });
      }
      await db
        .update(meetingParticipants)
        .set({ role: "note_taker", updatedAt: new Date() } as any)
        .where(eq(meetingParticipants.id, candidate.id));
      warnings.push("No note_taker selected: promoted one agent to note_taker.");
    }

    participants = await db.query.meetingParticipants.findMany({
      where: eq(meetingParticipants.meetingId, meetingId),
      orderBy: [asc(meetingParticipants.createdAt)],
    });

    const hasExternalGuest = participants.some((row: any) => String(row.participantType || "") === "human" && !!row.guestEmail);
    const hasHumanHost = participants.some(
      (row: any) =>
        String(row.participantType || "") === "human" && String(row.role || "").toLowerCase() === "host",
    );
    if (hasExternalGuest && !hasHumanHost) {
      return res.status(422).json({ message: "External guests require a human host." });
    }

    if (hasExternalGuest) {
      const recordingPolicy = String(req.body?.recording_policy ?? req.body?.recordingPolicy ?? "").trim().toLowerCase();
      const transcriptPolicy = String(req.body?.transcript_policy ?? req.body?.transcriptPolicy ?? "").trim().toLowerCase();
      const currentMetadata = ((meeting.metadata as any) || {}) as Record<string, unknown>;
      const nextRecordingPolicy = recordingPolicy || String(currentMetadata.recordingPolicy || "").trim().toLowerCase();
      const nextTranscriptPolicy = transcriptPolicy || String(currentMetadata.transcriptPolicy || "").trim().toLowerCase();
      if (!nextRecordingPolicy || !nextTranscriptPolicy) {
        return res.status(422).json({
          message: "External guests require explicit recording_policy and transcript_policy selection.",
        });
      }
      if (recordingPolicy || transcriptPolicy) {
        await db
          .update(meetings)
          .set({
            metadata: {
              ...currentMetadata,
              recordingPolicy: nextRecordingPolicy,
              transcriptPolicy: nextTranscriptPolicy,
              updatedByUserId: Number(staffUser.id),
            },
            updatedAt: new Date(),
          } as any)
          .where(eq(meetings.id, meetingId));
      }
    }

    const agentIds = participants
      .filter((row: any) => String(row.participantType || "") === "agent" && row.agentId)
      .map((row: any) => Number(row.agentId))
      .filter((value: number) => Number.isFinite(value) && value > 0);

    if (agentIds.length) {
      await syncRoomMembership(String(meeting.conversationId || ""), agentIds);
      await upsertMeetingAgentContexts(tenantId, meetingId, agentIds);
    }

    const referencedAgents = agentIds.length
      ? await db.select().from(agents).where(inArray(agents.id, agentIds))
      : [];
    const agentById = new Map(referencedAgents.map((agent: any) => [Number(agent.id), agent]));

    const latestMeeting = await db.query.meetings.findFirst({ where: eq(meetings.id, meetingId) });
    return res.json({
      ok: true,
      meeting: latestMeeting || meeting,
      participants: participants.map((row: any) => ({
        ...row,
        agent: row.agentId ? agentById.get(Number(row.agentId)) || null : null,
      })),
      warnings,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to update participants" });
  }
});

export default router;
