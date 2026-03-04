export type CronScheduleInput = {
  scheduleCron?: string | null;
  metadata?: Record<string, unknown> | null;
  from?: Date;
};

function normalizeCron(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function readIntervalMinutesFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || typeof metadata !== "object") return null;
  const value = metadata.intervalMinutes ?? metadata.interval_minutes;
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(1, Math.min(parsed, 7 * 24 * 60));
}

export function intervalMinutesFromCronExpression(scheduleCron: string | null | undefined): number {
  const cron = normalizeCron(scheduleCron);
  if (!cron) return 60;

  const everyN = cron.match(/^\*\/(\d+) \* \* \* \*$/);
  if (everyN) {
    const n = Number.parseInt(everyN[1], 10);
    if (Number.isFinite(n) && n > 0) return Math.max(1, Math.min(n, 24 * 60));
  }

  if (cron === "* * * * *") return 1;
  if (cron === "0 * * * *") return 60;
  if (cron === "0 */2 * * *") return 120;
  if (cron === "0 */6 * * *") return 360;
  if (cron === "0 */12 * * *") return 720;
  if (cron === "0 0 * * *") return 24 * 60;
  if (cron === "0 0 * * 0") return 7 * 24 * 60;

  return 60;
}

export function computeNextScheduledRun(input: CronScheduleInput): Date {
  const base = input.from ? new Date(input.from) : new Date();
  const from = Number.isFinite(base.getTime()) ? base : new Date();

  const fromMeta = readIntervalMinutesFromMetadata(input.metadata ?? null);
  const intervalMinutes = fromMeta ?? intervalMinutesFromCronExpression(input.scheduleCron);

  return new Date(from.getTime() + intervalMinutes * 60_000);
}
