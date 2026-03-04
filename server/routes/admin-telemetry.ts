import { Router } from "express";
import { db } from "@db";
import { ensureTenantAdmin } from "./utils/auth";
import { sql } from "drizzle-orm";

const router = Router();
router.use(ensureTenantAdmin);

function parseIntSafe(value: unknown): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function runtimeEnv() {
  const env = String(process.env.APP_ENV || process.env.NODE_ENV || "prod").trim().toLowerCase();
  if (env === "production") return "prod";
  if (env === "development") return "dev";
  return env || "prod";
}

router.get("/summary", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ ok: false, message: "tenant required" });

    const days = Math.min(Math.max(parseIntSafe(req.query?.days), 1), 90) || 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);
    const env = runtimeEnv();

    const totalsResult = await db.execute(sql`
      select
        count(*)::int as sessions,
        coalesce(sum(page_views), 0)::int as page_views,
        coalesce(sum(errors), 0)::int as errors,
        coalesce(sum(case when is_bot then 1 else 0 end), 0)::int as bot_sessions
      from telemetry_sessions
      where tenant_id = ${tenant.id}
        and env = ${env}
        and last_seen_at >= ${since};
    `);

    const totalsRow = totalsResult.rows?.[0] as any;
    const totals = {
      sessions: Number(totalsRow?.sessions || 0),
      pageViews: Number(totalsRow?.page_views || 0),
      errors: Number(totalsRow?.errors || 0),
      botSessions: Number(totalsRow?.bot_sessions || 0),
    };

    const topPagesResult = await db.execute(sql`
      select path, count(*)::int as views
      from telemetry_events
      where tenant_id = ${tenant.id}
        and env = ${env}
        and event_type = 'page_view'
        and occurred_at >= ${since}
      group by path
      order by views desc
      limit 25;
    `);

    res.json({
      ok: true,
      env,
      range: { days, since: since.toISOString() },
      totals,
      topPages: topPagesResult.rows ?? [],
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "failed" });
  }
});

router.get("/sessions/recent", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ ok: false, message: "tenant required" });

    const limit = Math.min(Math.max(parseIntSafe(req.query?.limit), 1), 200) || 50;
    const env = runtimeEnv();

    const items = await db.query.telemetrySessions.findMany({
      where: (t, { and, eq }) => and(eq(t.tenantId, tenant.id), eq(t.env, env)),
      orderBy: (t, { desc }) => [desc(t.lastSeenAt)],
      limit,
    });

    res.json({ ok: true, env, items });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "failed" });
  }
});

export default router;
