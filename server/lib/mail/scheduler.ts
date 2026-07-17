import { and, eq, sql } from "drizzle-orm";
import { db } from "@db";
import { agentMailboxes, tenants } from "@db/schema";
import { runMailIndexer } from "./indexer";
import { ensureAgoojiyeHumanMailProfiles, syncAgoojiyeUnifiedInbox } from "../agoojye/mailBridge";

function truthyEnv(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  const n = Math.trunc(parsed);
  return Math.max(min, Math.min(max, n));
}

export function startMailIndexerScheduler() {
  const enabled = truthyEnv(process.env.MAIL_INDEXER_ENABLED);
  if (!enabled) return null;

  const intervalMs = clampInt(process.env.MAIL_INDEXER_INTERVAL_MS, 30_000, 24 * 60 * 60_000, 5 * 60_000);
  const limitPerMailbox = clampInt(process.env.MAIL_INDEXER_LIMIT_PER_MAILBOX, 20, 2000, 100);
  const tenantKey = String(process.env.MAIL_INDEXER_TENANT_KEY || "").trim() || null;

  let running = false;

  const runOnce = async () => {
    if (running) return;
    running = true;
    const startedAt = Date.now();

    try {
      if (!tenantKey || tenantKey.toLowerCase() === "agoojye") {
        const agoojyeTenant = await db.query.tenants.findFirst({
          where: eq(tenants.key, "agoojye"),
          columns: { id: true },
        });
        if (agoojyeTenant?.id) {
          await ensureAgoojiyeHumanMailProfiles(agoojyeTenant.id);
        }
      }

      const tenantRows = tenantKey
        ? await db
            .select({ id: tenants.id, key: tenants.key })
            .from(tenants)
            .where(eq(tenants.key, tenantKey as any))
            .limit(1)
        : await db
            .selectDistinct({ id: agentMailboxes.tenantId })
            .from(agentMailboxes)
            .where(and(eq(agentMailboxes.isEnabled, true), sql`${agentMailboxes.tenantId} IS NOT NULL`))
            .limit(200);

      const tenantIds = tenantRows
        .map((row: any) => Number(row?.id))
        .filter((id: number) => Number.isFinite(id));

      let totalIndexed = 0;
      let totalSkipped = 0;
      let totalWarnings = 0;

      for (const tenantId of tenantIds) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const result = await runMailIndexer({ tenantId, agentKey: null, limitPerMailbox });
          totalIndexed += Number(result.indexed || 0);
          totalSkipped += Number(result.skipped || 0);

          const tenant = await db.query.tenants.findFirst({
            where: eq(tenants.id, tenantId),
            columns: { key: true },
          });
          if (String(tenant?.key || "").toLowerCase() === "agoojye") {
            await syncAgoojiyeUnifiedInbox(tenantId);
          }

          const mailboxes = Array.isArray(result.mailboxes) ? result.mailboxes : [];
          totalWarnings += mailboxes.filter((m: any) => Array.isArray(m?.errors) && m.errors.length > 0).length;
        } catch (err: any) {
          totalWarnings += 1;
          console.warn(`[mail:index] tenantId=${tenantId} failed: ${err?.message || "unknown_error"}`);
        }
      }

      const durationMs = Date.now() - startedAt;
      console.log(
        `[mail:index] ok tenants=${tenantIds.length} indexed=${totalIndexed} skipped=${totalSkipped} warnings=${totalWarnings} durationMs=${durationMs}`,
      );
    } finally {
      running = false;
    }
  };

  // Run once shortly after boot, then on interval.
  const initialDelayMs = clampInt(process.env.MAIL_INDEXER_INITIAL_DELAY_MS, 5_000, 10 * 60_000, 25_000);
  setTimeout(() => void runOnce(), initialDelayMs);
  const timer = setInterval(() => void runOnce(), intervalMs);

  return {
    intervalMs,
    limitPerMailbox,
    stop: () => clearInterval(timer),
  };
}

