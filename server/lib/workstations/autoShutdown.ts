import { db } from "@db";
import { sql } from "drizzle-orm";
import { createDockerWorkstationProvider } from "./provider";
import { randomUUID } from "crypto";

type AutoShutdownSchedulerHandle = {
  intervalMs: number;
  inactivityMinutes: number;
  warningMinutes: number;
  maxBatch: number;
  stop: () => void;
};

function parseIntSafe(value: unknown, fallback: number, min = 1, max = 100000) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function asRows<T = any>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function asObject(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, any>;
    return {};
  } catch {
    return {};
  }
}

async function insertEvent(input: {
  tenantId: number;
  workstationId: string;
  actorAgentId?: number | null;
  eventType: string;
  command?: string | null;
  origin?: string | null;
  payload?: Record<string, unknown>;
}) {
  await db.execute(sql`
    insert into workstation_events (
      id,
      tenant_id,
      workstation_id,
      actor_agent_id,
      event_type,
      command,
      origin,
      correlation_id,
      event_payload_json,
      created_at
    )
    values (
      ${randomUUID()},
      ${input.tenantId},
      ${input.workstationId},
      ${input.actorAgentId ?? null},
      ${input.eventType},
      ${input.command ?? null},
      ${input.origin ?? "system"},
      ${`ws-auto-${Date.now()}`},
      ${JSON.stringify(input.payload || {})}::jsonb,
      now()
    )
  `);
}

export function startWorkstationAutoShutdownScheduler(): AutoShutdownSchedulerHandle | null {
  const enabled = ["1", "true", "yes", "on"].includes(
    String(process.env.WORKSTATION_AUTO_SHUTDOWN_ENABLED || "true").trim().toLowerCase(),
  );
  if (!enabled) return null;

  const inactivityMinutes = parseIntSafe(process.env.WORKSTATION_AUTO_SHUTDOWN_MINUTES, 10, 1, 180);
  const warningMinutes = parseIntSafe(process.env.WORKSTATION_AUTO_SHUTDOWN_WARNING_MINUTES, 2, 1, 30);
  const intervalMs = parseIntSafe(process.env.WORKSTATION_AUTO_SHUTDOWN_INTERVAL_MS, 60_000, 15_000, 600_000);
  const maxBatch = parseIntSafe(process.env.WORKSTATION_AUTO_SHUTDOWN_MAX_BATCH, 50, 1, 500);
  const warningThresholdMs = Math.max(60_000, (inactivityMinutes - warningMinutes) * 60_000);
  const shutdownThresholdMs = inactivityMinutes * 60_000;

  let timer: NodeJS.Timeout | null = null;
  let running = false;
  const providerPromise = createDockerWorkstationProvider();

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const now = Date.now();
      const rows = asRows<{
        id: string;
        tenant_id: number;
        agent_id: number;
        provider_ref: string | null;
        status: string;
        metadata: any;
        last_activity_at: string | null;
      }>(
        await db.execute(sql`
          select
            w.id,
            w.tenant_id,
            w.agent_id,
            w.provider_ref,
            w.status,
            w.metadata,
            coalesce(
              (
                select max(aws.last_activity_at)
                from agent_workstation_sessions aws
                where aws.tenant_id = w.tenant_id
                  and aws.workstation_id = w.id
              ),
              (
                select max(ws.started_at)
                from workstation_sessions ws
                where ws.tenant_id = w.tenant_id
                  and ws.workstation_id = w.id
                  and ws.ended_at is null
              ),
              w.updated_at
            ) as last_activity_at
          from agent_workstations w
          where w.status = 'RUNNING'
            and w.provider_ref is not null
          order by w.updated_at asc
          limit ${maxBatch}
        `),
      );

      const provider = await providerPromise;
      for (const row of rows) {
        const lastActivityMs = row.last_activity_at ? new Date(row.last_activity_at).getTime() : now;
        const idleMs = Math.max(0, now - (Number.isFinite(lastActivityMs) ? lastActivityMs : now));
        const metadata = asObject(row.metadata);
        const warnedAt = String(metadata?.autoShutdown?.warnedAt || "").trim();
        const warningAcknowledged = Boolean(warnedAt);

        if (!warningAcknowledged && idleMs >= warningThresholdMs) {
          const nextMeta = {
            ...metadata,
            autoShutdown: {
              ...(asObject(metadata.autoShutdown) || {}),
              warnedAt: new Date(now).toISOString(),
              inactivityMinutes,
            },
          };
          await db.execute(sql`
            update agent_workstations
            set metadata = ${JSON.stringify(nextMeta)}::jsonb, updated_at = now()
            where tenant_id = ${row.tenant_id}
              and id = ${row.id}
          `);
          await insertEvent({
            tenantId: row.tenant_id,
            workstationId: row.id,
            actorAgentId: row.agent_id,
            eventType: "AUTO_SHUTDOWN_WARNING",
            command: "auto_shutdown_warning",
            origin: "system",
            payload: {
              inactivityMinutes,
              idleMs,
            },
          });
        }

        if (idleMs < shutdownThresholdMs) continue;
        if (!row.provider_ref) continue;

        try {
          await provider.stop(row.provider_ref);
        } catch {
          // continue with db state transition even if provider stop errored
        }

        const nextMeta = {
          ...metadata,
          autoShutdown: {
            ...(asObject(metadata.autoShutdown) || {}),
            stoppedAt: new Date(now).toISOString(),
            inactivityMinutes,
            idleMs,
          },
        };

        await db.execute(sql`
          update agent_workstations
          set
            status = 'STOPPED',
            metadata = ${JSON.stringify(nextMeta)}::jsonb,
            updated_at = now()
          where tenant_id = ${row.tenant_id}
            and id = ${row.id}
        `);

        await db.execute(sql`
          update workstation_sessions
          set ended_at = coalesce(ended_at, now())
          where tenant_id = ${row.tenant_id}
            and workstation_id = ${row.id}
            and ended_at is null
        `);

        await db.execute(sql`
          update agent_workstation_sessions
          set
            status = 'CLOSED',
            ended_at = coalesce(ended_at, now()),
            last_activity_at = now()
          where tenant_id = ${row.tenant_id}
            and workstation_id = ${row.id}
            and ended_at is null
        `);

        await insertEvent({
          tenantId: row.tenant_id,
          workstationId: row.id,
          actorAgentId: row.agent_id,
          eventType: "AUTO_SHUTDOWN_EXECUTED",
          command: "auto_shutdown_stop",
          origin: "system",
          payload: {
            inactivityMinutes,
            idleMs,
          },
        });
      }
    } catch {
      // no-op: scheduler should never crash the server
    } finally {
      running = false;
    }
  };

  timer = setInterval(() => {
    void tick();
  }, intervalMs);
  void tick();

  return {
    intervalMs,
    inactivityMinutes,
    warningMinutes,
    maxBatch,
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
