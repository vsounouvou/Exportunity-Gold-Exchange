import { chatRooms, meetings } from "@db/schema";
import { and, eq, sql } from "drizzle-orm";

const IN_PROGRESS_GRACE_MS = 2 * 60 * 60 * 1000;
const SCHEDULED_EXPIRY_MS = 24 * 60 * 60 * 1000;
const ORPHAN_ROOM_EXPIRY_MS = 24 * 60 * 60 * 1000;
const RECONCILE_THROTTLE_MS = 60 * 1000;

export type MeetingLifecycleSnapshot = {
  status: string;
  type?: string | null;
  startTime: Date | string;
  endTime?: Date | string | null;
  duration?: number | null;
  actualStartAt?: Date | string | null;
  lastMessageAt?: Date | string | null;
};

export type MeetingLifecycleDecision = {
  status: "completed" | "cancelled";
  lifecycleState: "completed" | "missed";
  reason: "stale_in_progress" | "elapsed_with_activity" | "elapsed_without_start";
  actualStartAt: Date | null;
  actualEndAt: Date | null;
};

export type OrphanMeetingRoomSnapshot = {
  createdAt: Date | string;
  updatedAt?: Date | string | null;
  lastMessageAt?: Date | string | null;
  messageCount?: number | null;
};

export type OrphanMeetingRoomDecision = {
  lifecycleState: "completed" | "missed";
  reason: "orphaned_stale_with_activity" | "orphaned_elapsed_without_activity";
  completedAt: Date;
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function laterDate(...values: Array<Date | null>) {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) return latest;
    if (!latest || value.getTime() > latest.getTime()) return value;
    return latest;
  }, null);
}

export function decideMeetingLifecycle(
  snapshot: MeetingLifecycleSnapshot,
  now = new Date(),
): MeetingLifecycleDecision | null {
  const status = String(snapshot.status || "").trim().toLowerCase();
  if (status !== "scheduled" && status !== "in_progress") return null;

  const startTime = asDate(snapshot.startTime);
  if (!startTime) return null;
  const durationMinutes = Number.isFinite(Number(snapshot.duration))
    ? Math.max(1, Number(snapshot.duration))
    : 30;
  const plannedEnd = asDate(snapshot.endTime) ?? new Date(startTime.getTime() + durationMinutes * 60 * 1000);
  const actualStartAt = asDate(snapshot.actualStartAt);
  const lastMessageAt = asDate(snapshot.lastMessageAt);

  if (status === "in_progress") {
    const inactivityAnchor = laterDate(actualStartAt, lastMessageAt, startTime) ?? startTime;
    const staleBefore = now.getTime() - IN_PROGRESS_GRACE_MS;
    if (plannedEnd.getTime() > staleBefore || inactivityAnchor.getTime() > staleBefore) return null;

    return {
      status: "completed",
      lifecycleState: "completed",
      reason: "stale_in_progress",
      actualStartAt: actualStartAt ?? startTime,
      actualEndAt: laterDate(plannedEnd, lastMessageAt, actualStartAt, startTime),
    };
  }

  if (plannedEnd.getTime() > now.getTime() - SCHEDULED_EXPIRY_MS) return null;

  if (lastMessageAt) {
    return {
      status: "completed",
      lifecycleState: "completed",
      reason: "elapsed_with_activity",
      actualStartAt: actualStartAt ?? startTime,
      actualEndAt: laterDate(plannedEnd, lastMessageAt),
    };
  }

  return {
    status: "cancelled",
    lifecycleState: "missed",
    reason: "elapsed_without_start",
    actualStartAt: null,
    actualEndAt: null,
  };
}

export function decideOrphanMeetingRoomLifecycle(
  snapshot: OrphanMeetingRoomSnapshot,
  now = new Date(),
): OrphanMeetingRoomDecision | null {
  const createdAt = asDate(snapshot.createdAt);
  if (!createdAt) return null;

  const updatedAt = asDate(snapshot.updatedAt);
  const lastMessageAt = asDate(snapshot.lastMessageAt);
  const activityAnchor = laterDate(createdAt, updatedAt, lastMessageAt) ?? createdAt;
  if (activityAnchor.getTime() > now.getTime() - ORPHAN_ROOM_EXPIRY_MS) return null;

  const hasActivity = Number(snapshot.messageCount || 0) > 0 || Boolean(lastMessageAt);
  return {
    lifecycleState: hasActivity ? "completed" : "missed",
    reason: hasActivity ? "orphaned_stale_with_activity" : "orphaned_elapsed_without_activity",
    completedAt: lastMessageAt ?? activityAnchor,
  };
}

type LifecycleRow = {
  id: number;
  status: string;
  type: string | null;
  start_time: Date | string;
  end_time: Date | string | null;
  duration: number | null;
  actual_start_at: Date | string | null;
  conversation_id: string;
  metadata: Record<string, unknown> | null;
  last_message_at: Date | string | null;
};

type OrphanRoomRow = {
  id: number;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string | null;
  last_message_at: Date | string | null;
  message_count: number | string | null;
};

const lastReconcileAt = new Map<number, number>();
const inFlightReconciliations = new Map<number, Promise<MeetingLifecycleReconcileResult>>();

export type MeetingLifecycleReconcileResult = {
  reconciled: number;
  completed: number;
  missed: number;
  orphaned: number;
  throttled: boolean;
};

function rowsFromResult<T>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

export async function reconcileTenantMeetingLifecycle(
  tenantId: number,
  options: { force?: boolean; now?: Date } = {},
): Promise<MeetingLifecycleReconcileResult> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return { reconciled: 0, completed: 0, missed: 0, orphaned: 0, throttled: false };
  }

  const now = options.now ?? new Date();
  const lastRun = lastReconcileAt.get(tenantId) ?? 0;
  if (!options.force && now.getTime() - lastRun < RECONCILE_THROTTLE_MS) {
    return { reconciled: 0, completed: 0, missed: 0, orphaned: 0, throttled: true };
  }

  const existing = inFlightReconciliations.get(tenantId);
  if (existing) return existing;

  const reconciliation = (async () => {
    const { db } = await import("@db");
    const queryResult = await db.execute(sql`
      select
        m.id,
        m.status,
        m.type,
        m.start_time,
        m.end_time,
        m.duration,
        m.actual_start_at,
        m.conversation_id,
        m.metadata,
        max(msg.created_at) as last_message_at
      from meetings m
      left join messages msg on msg.conversation_id = m.conversation_id
      where m.tenant_id = ${tenantId}
        and m.status in ('scheduled', 'in_progress')
      group by m.id
      order by m.start_time asc
      limit 500
    `);

    const orphanResult = await db.execute(sql`
      select
        cr.id,
        cr.metadata,
        cr.created_at,
        cr.updated_at,
        max(msg.created_at) as last_message_at,
        count(msg.id)::int as message_count
      from chat_rooms cr
      left join meetings linked_meeting on linked_meeting.conversation_id = cr.conversation_id
      left join messages msg on msg.conversation_id = cr.conversation_id
      where cr.type = 'meeting'
        and cr.is_active = true
        and linked_meeting.id is null
        and (
          coalesce(cr.metadata->>'tenantId', cr.metadata->>'tenant_id', '') = ${String(tenantId)}
          or exists (
            select 1
            from room_memberships rm
            join agents a on a.id = rm.agent_id
            where rm.room_id = cr.id
              and coalesce(rm.is_active, true) = true
              and a.tenant_id = ${tenantId}
          )
          or exists (
            select 1
            from agents moderator
            where moderator.id = cr.moderator_id
              and moderator.tenant_id = ${tenantId}
          )
        )
      group by cr.id
      order by cr.created_at asc
      limit 500
    `);

    let completed = 0;
    let missed = 0;
    let orphaned = 0;

    for (const row of rowsFromResult<LifecycleRow>(queryResult)) {
      const decision = decideMeetingLifecycle(
        {
          status: row.status,
          type: row.type,
          startTime: row.start_time,
          endTime: row.end_time,
          duration: row.duration,
          actualStartAt: row.actual_start_at,
          lastMessageAt: row.last_message_at,
        },
        now,
      );
      if (!decision) continue;

      const reconciled = await db.transaction(async (tx) => {
        const [updatedMeeting] = await tx
          .update(meetings)
          .set({
            status: decision.status as any,
            actualStartAt: decision.actualStartAt,
            actualEndAt: decision.actualEndAt,
            metadata: {
              ...(row.metadata || {}),
              lifecycleState: decision.lifecycleState,
              lifecycleReconciledAt: now.toISOString(),
              lifecycleReconciledReason: decision.reason,
            } as any,
            updatedAt: now,
          })
          .where(and(eq(meetings.id, Number(row.id)), eq(meetings.status, row.status as any)))
          .returning({ id: meetings.id });

        if (!updatedMeeting) return false;

        const [linkedRoom] = await tx
          .select({ id: chatRooms.id, metadata: chatRooms.metadata })
          .from(chatRooms)
          .where(eq(chatRooms.conversationId, row.conversation_id))
          .limit(1);

        if (linkedRoom) {
          await tx
            .update(chatRooms)
            .set({
              isActive: false,
              metadata: {
                ...((linkedRoom.metadata as Record<string, unknown> | null) || {}),
                status: decision.lifecycleState,
                completedAt: decision.actualEndAt?.toISOString() ?? now.toISOString(),
                lifecycleReconciledAt: now.toISOString(),
                lifecycleReconciledReason: decision.reason,
              },
              updatedAt: now,
            })
            .where(eq(chatRooms.id, linkedRoom.id));
        }

        return true;
      });

      if (!reconciled) continue;
      if (decision.lifecycleState === "missed") missed += 1;
      else completed += 1;
    }

    for (const row of rowsFromResult<OrphanRoomRow>(orphanResult)) {
      const decision = decideOrphanMeetingRoomLifecycle(
        {
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          lastMessageAt: row.last_message_at,
          messageCount: Number(row.message_count || 0),
        },
        now,
      );
      if (!decision) continue;

      const [updatedRoom] = await db
        .update(chatRooms)
        .set({
          isActive: false,
          metadata: {
            ...(row.metadata || {}),
            status: decision.lifecycleState,
            lifecycleState: decision.lifecycleState,
            completedAt: decision.completedAt.toISOString(),
            lifecycleReconciledAt: now.toISOString(),
            lifecycleReconciledReason: decision.reason,
          },
          updatedAt: now,
        })
        .where(and(eq(chatRooms.id, Number(row.id)), eq(chatRooms.isActive, true)))
        .returning({ id: chatRooms.id });

      if (!updatedRoom) continue;
      orphaned += 1;
      if (decision.lifecycleState === "missed") missed += 1;
      else completed += 1;
    }

    lastReconcileAt.set(tenantId, now.getTime());
    const result = { reconciled: completed + missed, completed, missed, orphaned, throttled: false };
    if (result.reconciled > 0) {
      console.info(
        `[MeetingLifecycle] tenant=${tenantId} completed=${completed} missed=${missed} orphaned=${orphaned}`,
      );
    }
    return result;
  })();

  inFlightReconciliations.set(tenantId, reconciliation);
  try {
    return await reconciliation;
  } finally {
    inFlightReconciliations.delete(tenantId);
  }
}
