import { runActionWorkerOnce } from "./worker";
import { db } from "@db";
import { sql } from "drizzle-orm";

const ACTIONS_RUNNER_LEADER_LOCK_KEY = 90612026;

function firstRow(result: any) {
  if (Array.isArray(result?.rows) && result.rows.length) return result.rows[0];
  if (Array.isArray(result) && result.length) return result[0];
  return null;
}

function truthyEnv(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

function boolEnvWithDefault(value: unknown, fallback: boolean) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  return truthyEnv(normalized);
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  const n = Math.trunc(parsed);
  return Math.max(min, Math.min(max, n));
}

export function startActionsWorkerScheduler() {
  // Default ON in production to avoid "talk-only" behavior when env is omitted.
  // Set ACTIONS_WORKER_ENABLED=false to disable explicitly.
  const enabled = boolEnvWithDefault(process.env.ACTIONS_WORKER_ENABLED, true);
  schedulerStatus.enabled = enabled;
  schedulerStatus.running = false;
  schedulerStatus.lastError = null;
  if (!enabled) return null;

  const intervalMs = clampInt(process.env.ACTIONS_WORKER_INTERVAL_MS, 250, 60_000, 2000);
  const maxBatch = clampInt(process.env.ACTIONS_WORKER_MAX_BATCH, 1, 250, 50);
  const initialDelayMs = clampInt(process.env.ACTIONS_WORKER_INITIAL_DELAY_MS, 0, 60_000, 1500);
  schedulerStatus.intervalMs = intervalMs;
  schedulerStatus.maxBatch = maxBatch;
  schedulerStatus.initialDelayMs = initialDelayMs;
  schedulerStatus.running = true;

  let running = false;
  let resolvedTenantId: number | null = null;

  const resolveTenantId = async () => {
    if (resolvedTenantId) return resolvedTenantId;
    const tenantKey = String(
      process.env.DEPLOY_TENANT || process.env.TENANT_DEFAULT || "",
    ).trim();
    if (!tenantKey) {
      throw new Error("ACTIONS_WORKER_TENANT_REQUIRED: set DEPLOY_TENANT or TENANT_DEFAULT.");
    }
    const result = await db.execute(sql`
      select id
      from tenants
      where lower(key) = lower(${tenantKey})
      limit 1
    `);
    const tenantId = Number(firstRow(result)?.id || 0);
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      throw new Error(`ACTIONS_WORKER_TENANT_NOT_FOUND: ${tenantKey}`);
    }
    resolvedTenantId = tenantId;
    return tenantId;
  };

  const runBatch = async () => {
    if (running) return;
    running = true;
    const startedAt = Date.now();
    let globalLockAcquired = false;
    let processed = 0;
    let failures = 0;

    try {
      const tenantId = await resolveTenantId();
      for (let i = 0; i < maxBatch; i++) {
        // The row-level lease is the lock for tenant-scoped work. Legacy workers
        // cannot see these future-dated actions, while this tenant claims them atomically.
        // eslint-disable-next-line no-await-in-loop
        const res = await runActionWorkerOnce({
          tenantId,
          workerScope: "tenant",
        });
        if (!res || res.processed <= 0) break;
        processed += res.processed;
        schedulerStatus.lastJobAt = new Date().toISOString();
        if ((res as any).ok === false) failures += 1;
      }

      if (processed < maxBatch) {
        const globalLockResult = await db.execute(
          sql`select pg_try_advisory_lock(${ACTIONS_RUNNER_LEADER_LOCK_KEY}) as locked`,
        );
        globalLockAcquired = Boolean(firstRow(globalLockResult)?.locked);
        if (globalLockAcquired) {
          for (let i = processed; i < maxBatch; i++) {
            // eslint-disable-next-line no-await-in-loop
            const res = await runActionWorkerOnce({ tenantId });
            if (!res || res.processed <= 0) break;
            processed += res.processed;
            schedulerStatus.lastJobAt = new Date().toISOString();
            if ((res as any).ok === false) failures += 1;
          }
        }
      }

      if (processed > 0 || failures > 0) {
        const durationMs = Date.now() - startedAt;
        console.log(`[actions-worker] batch processed=${processed} failures=${failures} durationMs=${durationMs}`);
        schedulerStatus.lastBatch = {
          processed,
          failures,
          durationMs,
          at: new Date().toISOString(),
        };
      }
      schedulerStatus.lastHeartbeatAt = new Date().toISOString();
      schedulerStatus.lastError = null;
    } catch (error: any) {
      schedulerStatus.lastError = String(error?.message || error || "unknown_error");
      console.error("[actions-worker] batch failure:", schedulerStatus.lastError);
    } finally {
      if (globalLockAcquired) {
        try {
          await db.execute(sql`select pg_advisory_unlock(${ACTIONS_RUNNER_LEADER_LOCK_KEY})`);
        } catch {
          // best effort unlock
        }
      }
      running = false;
    }
  };

  setTimeout(() => void runBatch(), initialDelayMs);
  const timer = setInterval(() => void runBatch(), intervalMs);

  return {
    intervalMs,
    maxBatch,
    stop: () => {
      clearInterval(timer);
      schedulerStatus.running = false;
    },
  };
}

type ActionsSchedulerStatus = {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  maxBatch: number;
  initialDelayMs: number;
  lastHeartbeatAt: string | null;
  lastJobAt: string | null;
  lastBatch: { processed: number; failures: number; durationMs: number; at: string } | null;
  lastError: string | null;
};

const schedulerStatus: ActionsSchedulerStatus = {
  enabled: boolEnvWithDefault(process.env.ACTIONS_WORKER_ENABLED, true),
  running: false,
  intervalMs: clampInt(process.env.ACTIONS_WORKER_INTERVAL_MS, 250, 60_000, 2000),
  maxBatch: clampInt(process.env.ACTIONS_WORKER_MAX_BATCH, 1, 250, 50),
  initialDelayMs: clampInt(process.env.ACTIONS_WORKER_INITIAL_DELAY_MS, 0, 60_000, 1500),
  lastHeartbeatAt: null,
  lastJobAt: null,
  lastBatch: null,
  lastError: null,
};

export function getActionsWorkerStatus() {
  const heartbeatMs = schedulerStatus.lastHeartbeatAt
    ? Date.now() - new Date(schedulerStatus.lastHeartbeatAt).getTime()
    : null;
  const staleThresholdMs = Math.max(5000, schedulerStatus.intervalMs * 3);
  const healthy =
    schedulerStatus.enabled &&
    schedulerStatus.running &&
    heartbeatMs !== null &&
    Number.isFinite(heartbeatMs) &&
    heartbeatMs <= staleThresholdMs;

  return {
    ...schedulerStatus,
    heartbeatAgeMs: heartbeatMs,
    staleThresholdMs,
    healthy,
  };
}
