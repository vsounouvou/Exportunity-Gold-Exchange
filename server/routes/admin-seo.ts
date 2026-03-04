import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@db";
import { seoIssues, seoPageSnapshots, seoPatches, seoRecommendations, tenants } from "@db/schema";
import { ensureTenantAdmin } from "./utils/auth";
import { runSeoSnapshotScan } from "../lib/seo/snapshot";

const router = Router();
router.use(ensureTenantAdmin);

function parseIntSafe(value: unknown): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function normalizeHost(host: unknown): string {
  if (typeof host !== "string") return "";
  return host.split(",")[0]?.split(":")[0]?.trim().toLowerCase() || "";
}

function runtimeEnv() {
  const env = String(process.env.APP_ENV || process.env.NODE_ENV || "prod").trim().toLowerCase();
  if (env === "production") return "prod";
  if (env === "development") return "dev";
  return env || "prod";
}

function parseId(value: unknown): number | null {
  const id = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  return Math.trunc(id);
}

router.get("/snapshots", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ ok: false, message: "tenant required" });

    const limit = Math.min(Math.max(parseIntSafe(req.query?.limit), 1), 500) || 150;
    const items = await db.query.seoPageSnapshots.findMany({
      where: and(eq(seoPageSnapshots.tenantId, tenant.id), eq(seoPageSnapshots.env, runtimeEnv())),
      orderBy: desc(seoPageSnapshots.collectedAt),
      limit,
    });
    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "failed" });
  }
});

router.get("/issues", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ ok: false, message: "tenant required" });

    const status = String(req.query?.status || "open").trim().toLowerCase();
    const limit = Math.min(Math.max(parseIntSafe(req.query?.limit), 1), 500) || 150;

    const where = [
      eq(seoIssues.tenantId, tenant.id),
      eq(seoIssues.env, runtimeEnv()),
      ...(status ? [eq(seoIssues.status, status)] : []),
    ];

    const items = await db.query.seoIssues.findMany({
      where: and(...where),
      orderBy: [desc(seoIssues.severity), desc(seoIssues.lastSeenAt)],
      limit,
    });

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "failed" });
  }
});

router.post("/scan", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ ok: false, message: "tenant required" });

    const host = normalizeHost(req.headers["x-forwarded-host"] || req.headers.host);
    if (!host) return res.status(400).json({ ok: false, message: "host required" });

    const maxPages = parseIntSafe(req.body?.maxPages) || 60;
    const paths = Array.isArray(req.body?.paths) ? req.body.paths.map((p: any) => String(p || "")).filter(Boolean) : undefined;

    const port = parseInt(String(process.env.PORT || "5000"), 10);
    const baseUrl = String(process.env.SEO_SNAPSHOT_BASE_URL || `http://127.0.0.1:${port}`);

    const result = await runSeoSnapshotScan({
      tenantId: tenant.id,
      env: runtimeEnv(),
      host,
      baseUrl,
      paths,
      maxPages,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "scan_failed" });
  }
});

router.get("/recommendations", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ ok: false, message: "tenant required" });

    const status = String(req.query?.status || "proposed").trim().toLowerCase();
    const limit = Math.min(Math.max(parseIntSafe(req.query?.limit), 1), 500) || 150;
    const env = runtimeEnv();

    const items = await db.query.seoRecommendations.findMany({
      where: and(
        eq(seoRecommendations.tenantId, tenant.id),
        eq(seoRecommendations.env, env),
        ...(status ? [eq(seoRecommendations.status, status)] : []),
      ),
      orderBy: desc(seoRecommendations.updatedAt),
      limit,
    });

    res.json({ ok: true, env, items });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "failed" });
  }
});

router.get("/patches", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ ok: false, message: "tenant required" });

    const status = String(req.query?.status || "proposed").trim().toLowerCase();
    const limit = Math.min(Math.max(parseIntSafe(req.query?.limit), 1), 500) || 150;
    const env = runtimeEnv();

    const items = await db.query.seoPatches.findMany({
      where: and(
        eq(seoPatches.tenantId, tenant.id),
        eq(seoPatches.env, env),
        ...(status ? [eq(seoPatches.status, status)] : []),
      ),
      orderBy: desc(seoPatches.updatedAt),
      limit,
    });

    res.json({ ok: true, env, items });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "failed" });
  }
});

router.post("/recommendations/:id/approve", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ ok: false, message: "tenant required" });

    const id = parseId(req.params?.id);
    if (!id) return res.status(400).json({ ok: false, message: "invalid id" });

    const env = runtimeEnv();
    const row = await db.query.seoRecommendations.findFirst({
      where: and(eq(seoRecommendations.tenantId, tenant.id), eq(seoRecommendations.env, env), eq(seoRecommendations.id, id)),
    });
    if (!row) return res.status(404).json({ ok: false, message: "not found" });

    await db.update(seoRecommendations).set({ status: "approved", updatedAt: new Date() }).where(eq(seoRecommendations.id, row.id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "failed" });
  }
});

router.post("/recommendations/:id/dismiss", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ ok: false, message: "tenant required" });

    const id = parseId(req.params?.id);
    if (!id) return res.status(400).json({ ok: false, message: "invalid id" });

    const env = runtimeEnv();
    const row = await db.query.seoRecommendations.findFirst({
      where: and(eq(seoRecommendations.tenantId, tenant.id), eq(seoRecommendations.env, env), eq(seoRecommendations.id, id)),
    });
    if (!row) return res.status(404).json({ ok: false, message: "not found" });

    await db.update(seoRecommendations).set({ status: "dismissed", updatedAt: new Date() }).where(eq(seoRecommendations.id, row.id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "failed" });
  }
});

async function setTenantFeatureFlag(tenantId: number, flag: string, enabled: boolean) {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { featureFlags: true },
  });
  const prev = tenant?.featureFlags && typeof tenant.featureFlags === "object" ? tenant.featureFlags : {};
  const next = { ...prev, [flag]: enabled };
  await db.update(tenants).set({ featureFlags: next, updatedAt: new Date() }).where(eq(tenants.id, tenantId));
}

router.post("/patches/:id/apply", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ ok: false, message: "tenant required" });

    const id = parseId(req.params?.id);
    if (!id) return res.status(400).json({ ok: false, message: "invalid id" });

    const env = runtimeEnv();
    const patch = await db.query.seoPatches.findFirst({
      where: and(eq(seoPatches.tenantId, tenant.id), eq(seoPatches.env, env), eq(seoPatches.id, id)),
    });
    if (!patch) return res.status(404).json({ ok: false, message: "not found" });
    if (patch.requiresApproval) return res.status(409).json({ ok: false, message: "requires_approval" });

    const flag = String(patch.featureFlag || "").trim();
    if (!flag) return res.status(400).json({ ok: false, message: "patch missing featureFlag" });

    await setTenantFeatureFlag(tenant.id, flag, true);
    await db.update(seoPatches).set({ status: "applied", appliedAt: new Date(), updatedAt: new Date() }).where(eq(seoPatches.id, patch.id));

    res.json({ ok: true, featureFlag: flag });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "failed" });
  }
});

router.post("/patches/:id/rollback", async (req: any, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ ok: false, message: "tenant required" });

    const id = parseId(req.params?.id);
    if (!id) return res.status(400).json({ ok: false, message: "invalid id" });

    const env = runtimeEnv();
    const patch = await db.query.seoPatches.findFirst({
      where: and(eq(seoPatches.tenantId, tenant.id), eq(seoPatches.env, env), eq(seoPatches.id, id)),
    });
    if (!patch) return res.status(404).json({ ok: false, message: "not found" });

    const flag = String(patch.featureFlag || "").trim();
    if (flag) {
      await setTenantFeatureFlag(tenant.id, flag, false);
    }

    await db
      .update(seoPatches)
      .set({ status: "rolled_back", rolledBackAt: new Date(), updatedAt: new Date() })
      .where(eq(seoPatches.id, patch.id));

    res.json({ ok: true, featureFlag: flag });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "failed" });
  }
});

export default router;
