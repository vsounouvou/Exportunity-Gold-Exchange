import { db } from "@db";
import { sql } from "drizzle-orm";
import { incrementCronFailure, listDueScheduledCronJobs, runGlobalMonitoringRules, triggerGovernedCronJobNow } from "./service";
import { runGovernedExecutionWorkerOnce } from "./worker";

const GOVERNED_CRON_LOCK_KEY = 90612027;
const GOVERNED_EXEC_LOCK_KEY = 90612028;

function firstRow(result: any) {
  if (Array.isArray(result?.rows) && result.rows.length) return result.rows[0];
  if (Array.isArray(result) && result.length) return result[0];
  return null;
}

function toBool(value: unknown, fallback: boolean) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  const n = Math.trunc(parsed);
  return Math.max(min, Math.min(max, n));
}

async function withAdvisoryLock<T>(lockKey: number, fn: () => Promise<T>): Promise<T | null> {
  const lockResult = await db.execute(sql`select pg_try_advisory_lock(${lockKey}) as locked`);
  const locked = Boolean(firstRow(lockResult)?.locked);
  if (!locked) return null;

  try {
    return await fn();
  } finally {
    try {
      await db.execute(sql`select pg_advisory_unlock(${lockKey})`);
    } catch {
      // best effort
    }
  }
}

export function startGovernedCronScheduler() {
  const enabled = toBool(process.env.GOVERNED_CRON_ENABLED, true);
  if (!enabled) return null;

  const intervalMs = clampInt(process.env.GOVERNED_CRON_INTERVAL_MS, 1000, 60_000, 5000);
  const maxBatch = clampInt(process.env.GOVERNED_CRON_MAX_BATCH, 1, 250, 25);
  const initialDelayMs = clampInt(process.env.GOVERNED_CRON_INITIAL_DELAY_MS, 0, 30_000, 2000);
  const runMonitoring = toBool(process.env.GOVERNED_MONITORING_ENABLED, true);

  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;

    try {
      await withAdvisoryLock(GOVERNED_CRON_LOCK_KEY, async () => {
        const dueJobs = await listDueScheduledCronJobs(maxBatch);
        for (const job of dueJobs) {
          try {
            await triggerGovernedCronJobNow({
              tenantId: Number(job.tenant_id),
              cronJobId: Number(job.id),
              actorType: "SYSTEM",
              actorId: "governed-cron-scheduler",
            });
          } catch (error: any) {
            await incrementCronFailure({
              tenantId: Number(job.tenant_id),
              jobId: Number(job.id),
              reason: String(error?.message || error || "cron execution failed"),
            });
          }
        }

        if (runMonitoring) {
          await runGlobalMonitoringRules();
        }
      });
    } finally {
      running = false;
    }
  };

  setTimeout(() => {
    void tick();
  }, initialDelayMs);
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  return {
    intervalMs,
    maxBatch,
    stop: () => clearInterval(timer),
  };
}

export function startGovernedExecutionScheduler() {
  const enabled = toBool(process.env.GOVERNED_EXECUTION_ENABLED, true);
  if (!enabled) return null;

  const intervalMs = clampInt(process.env.GOVERNED_EXECUTION_INTERVAL_MS, 250, 30_000, 1500);
  const maxBatch = clampInt(process.env.GOVERNED_EXECUTION_MAX_BATCH, 1, 250, 50);
  const initialDelayMs = clampInt(process.env.GOVERNED_EXECUTION_INITIAL_DELAY_MS, 0, 30_000, 1500);
  const leaseSeconds = clampInt(process.env.GOVERNED_EXECUTION_LEASE_SECONDS, 30, 1800, 180);
  const workerId = String(process.env.GOVERNED_EXECUTION_WORKER_ID || `governed-exec:${process.pid}`);

  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;

    try {
      await withAdvisoryLock(GOVERNED_EXEC_LOCK_KEY, async () => {
        for (let i = 0; i < maxBatch; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          const result = await runGovernedExecutionWorkerOnce({ workerId, leaseSeconds });
          if (!result || result.processed <= 0) break;
        }
      });
    } finally {
      running = false;
    }
  };

  setTimeout(() => {
    void tick();
  }, initialDelayMs);
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  return {
    intervalMs,
    maxBatch,
    stop: () => clearInterval(timer),
  };
}
