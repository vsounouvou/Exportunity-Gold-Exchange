import { Router } from "express";
import { db } from "@db";
import { tenants } from "@db/schema";
import { eq } from "drizzle-orm";
import { ensureTenantAdmin } from "./utils/auth";
import { getSettingsByPrefix, setSetting } from "../lib/settings";
import { getFxSnapshot, normalizeAndValidateOverrides } from "../lib/fx";
import { verifyAgentKey } from "../routes/utils/agent-auth";

const SAFE_KEYS_PREFIX = ["gateway."];
const router = Router();
const MANAGED_FEATURE_KEYS = [
  "feature.gold_stamping",
  "feature.jewelry",
  "feature.custom_jewelry",
  "feature.3d_memory",
] as const;
type ManagedFeatureKey = (typeof MANAGED_FEATURE_KEYS)[number];

const FEATURE_DEFAULTS: Record<ManagedFeatureKey, boolean> = {
  "feature.gold_stamping": true,
  "feature.jewelry": false,
  "feature.custom_jewelry": false,
  "feature.3d_memory": false,
};

function normalizeFeatureFlags(raw: unknown) {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, boolean> = { ...FEATURE_DEFAULTS };
  for (const [key, value] of Object.entries(input)) {
    out[key] = Boolean(value);
  }
  return out;
}

async function saveTenantFeatureFlags(tenantId: number, flags: Record<string, boolean>) {
  await db
    .update(tenants)
    .set({
      featureFlags: flags,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));
}

function resolveSettingsScope(req: any) {
  const tenantKey = String(req?.tenant?.key || "")
    .trim()
    .toLowerCase();
  if (tenantKey) return `tenant:${tenantKey}`;
  const tenantId = Number(req?.tenant?.id);
  if (Number.isFinite(tenantId) && tenantId > 0) return `tenant:${Math.trunc(tenantId)}`;
  return "tenant:default";
}

// Public read (whitelisted)
router.get("/api/public/settings", async (req, res) => {
  const scope = (req.query.scope as string) || "";
  const prefix = (req.query.prefix as string) || "";
  if (!scope || !prefix) return res.status(400).json({ message: "scope and prefix required" });
  if (!SAFE_KEYS_PREFIX.some((p) => prefix.startsWith(p))) {
    return res.status(403).json({ message: "prefix not allowed" });
  }
  try {
    const settings = await getSettingsByPrefix(scope, prefix);
    res.json({ settings });
  } catch (err: any) {
    console.warn("[settings] Falling back to empty settings:", err?.message || err);
    res.json({ settings: {} });
  }
});

// Admin CRUD
router.use("/api/admin/settings", ensureTenantAdmin);

router.get("/api/admin/features", ensureTenantAdmin, async (req, res) => {
  const tenantId = Number(req?.tenant?.id || 0);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return res.status(400).json({ message: "Tenant not resolved" });
  }

  try {
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { id: true, key: true, featureFlags: true },
    });
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });

    const flags = normalizeFeatureFlags(tenant.featureFlags);
    return res.json({
      tenantId: tenant.id,
      tenantKey: tenant.key,
      features: {
        "feature.gold_stamping": flags["feature.gold_stamping"],
        "feature.jewelry": flags["feature.jewelry"],
        "feature.custom_jewelry": flags["feature.custom_jewelry"],
        "feature.3d_memory": flags["feature.3d_memory"],
      },
      all: flags,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load feature flags" });
  }
});

router.post("/api/admin/features", ensureTenantAdmin, async (req, res) => {
  const tenantId = Number(req?.tenant?.id || 0);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return res.status(400).json({ message: "Tenant not resolved" });
  }

  const key = String(req.body?.key || "").trim();
  if (!MANAGED_FEATURE_KEYS.includes(key as ManagedFeatureKey)) {
    return res.status(400).json({
      message: "Unsupported feature key",
      allowedKeys: MANAGED_FEATURE_KEYS,
    });
  }

  if (typeof req.body?.enabled !== "boolean") {
    return res.status(400).json({ message: "enabled (boolean) is required" });
  }

  try {
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { featureFlags: true },
    });
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });

    const flags = normalizeFeatureFlags(tenant.featureFlags);
    flags[key] = Boolean(req.body.enabled);
    await saveTenantFeatureFlags(tenantId, flags);

    return res.json({
      ok: true,
      updated: { key, enabled: flags[key] },
      features: {
        "feature.gold_stamping": flags["feature.gold_stamping"],
        "feature.jewelry": flags["feature.jewelry"],
        "feature.custom_jewelry": flags["feature.custom_jewelry"],
        "feature.3d_memory": flags["feature.3d_memory"],
      },
      all: flags,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to update feature flags" });
  }
});

router.get("/api/admin/settings", async (req, res) => {
  const scope = (req.query.scope as string) || "";
  const prefix = (req.query.prefix as string) || "";
  if (!scope) return res.status(400).json({ message: "scope required" });
  try {
    const settings = prefix ? await getSettingsByPrefix(scope, prefix) : await getSettingsByPrefix(scope, "");
    res.json({ settings });
  } catch (err: any) {
    console.warn("[settings] Falling back to empty settings:", err?.message || err);
    res.json({ settings: {} });
  }
});

router.post("/api/admin/settings", async (req, res) => {
  const { scope, key, value } = req.body || {};
  if (!scope || !key) return res.status(400).json({ message: "scope and key required" });
  await setSetting(scope, key, value, (req as any).adminUser?.email || "admin");
  res.json({ ok: true });
});

router.get("/api/admin/settings/fx", async (req, res) => {
  try {
    const scope = resolveSettingsScope(req);
    const snapshot = await getFxSnapshot(scope);
    res.json({
      scope,
      base: snapshot.base,
      baseRates: snapshot.baseRates,
      effectiveRates: snapshot.effectiveRates,
      overrides: snapshot.overrides,
      rates: snapshot.effectiveRates,
      updatedAt: snapshot.updatedAt,
      refreshedAt: snapshot.refreshedAt,
      providerTimestamp: snapshot.providerTimestamp,
      isStale: snapshot.isStale,
      source: snapshot.source,
      overrideApplied: snapshot.overrideApplied,
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load FX settings" });
  }
});

router.put("/api/admin/settings/fx", async (req, res) => {
  try {
    const scope = resolveSettingsScope(req);
    const baseSnapshot = await getFxSnapshot(scope);
    const maxDriftPercentRaw = Number(req.body?.maxDriftPercent);
    const maxDriftPercent = Number.isFinite(maxDriftPercentRaw) ? maxDriftPercentRaw : undefined;
    const normalizedOverrides = normalizeAndValidateOverrides(req.body?.overrides ?? {}, baseSnapshot.baseRates, {
      maxDriftPercent,
    });
    await setSetting(scope, "fx.overrides", normalizedOverrides, (req as any).adminUser?.email || "admin");
    const snapshot = await getFxSnapshot(scope);
    res.json({
      ok: true,
      scope,
      baseRates: snapshot.baseRates,
      effectiveRates: snapshot.effectiveRates,
      overrides: snapshot.overrides,
      rates: snapshot.effectiveRates,
      updatedAt: snapshot.updatedAt,
      refreshedAt: snapshot.refreshedAt,
      providerTimestamp: snapshot.providerTimestamp,
      isStale: snapshot.isStale,
      source: snapshot.source,
      overrideApplied: snapshot.overrideApplied,
    });
  } catch (err: any) {
    res.status(400).json({ message: err?.message || "Invalid FX override payload" });
  }
});

router.post("/api/admin/settings/fx/refresh", async (req, res) => {
  try {
    const scope = resolveSettingsScope(req);
    const snapshot = await getFxSnapshot(scope, { forceRefresh: true });
    res.json({
      ok: true,
      scope,
      baseRates: snapshot.baseRates,
      effectiveRates: snapshot.effectiveRates,
      overrides: snapshot.overrides,
      rates: snapshot.effectiveRates,
      updatedAt: snapshot.updatedAt,
      refreshedAt: snapshot.refreshedAt,
      providerTimestamp: snapshot.providerTimestamp,
      isStale: snapshot.isStale,
      source: snapshot.source,
      overrideApplied: snapshot.overrideApplied,
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to refresh FX provider data" });
  }
});

// Agent scaffold
router.post("/api/agents/settings/set", verifyAgentKey(["settings:write"]), async (req, res) => {
  const { scope, key, value } = req.body || {};
  if (!scope || !key) return res.status(400).json({ message: "scope and key required" });
  await setSetting(scope, key, value, (req as any).agentName || "agent");
  res.json({ ok: true });
});

export default router;
