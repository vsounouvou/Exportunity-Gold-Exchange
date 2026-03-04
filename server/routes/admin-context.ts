import { Router } from "express";
import { asc, eq } from "drizzle-orm";

import { db } from "@db";
import { tenants, userTenantRoles } from "@db/schema";
import { getSessionActiveTenantId, setSessionActiveTenant } from "../lib/adminTenantContext";
import { ensureTenantAdmin, isChairmanAssistantUser } from "./utils/auth";

const router = Router();

function readBearerToken(req: any) {
  const raw = String(req?.headers?.authorization || "").trim();
  if (!raw) return null;
  return raw.replace(/^Bearer\s+/i, "").trim() || null;
}

router.use(ensureTenantAdmin);

router.get("/tenants", async (req: any, res) => {
  try {
    const viewer = req.adminUser;
    const token = readBearerToken(req);
    const currentTenant = req.tenant;
    const isChairman = isChairmanAssistantUser(viewer);

    let rows: Array<{ id: number; key: string; name: string; domains: string[] | null }> = [];

    if (isChairman) {
      const all = await db
        .select({ id: tenants.id, key: tenants.key, name: tenants.name, domains: tenants.domains })
        .from(tenants)
        .orderBy(asc(tenants.name), asc(tenants.id));
      rows = all.map((entry) => ({
        id: Number(entry.id),
        key: String(entry.key || ""),
        name: String(entry.name || ""),
        domains: Array.isArray(entry.domains) ? entry.domains : [],
      }));
    } else if (currentTenant?.id) {
      rows = [
        {
          id: Number(currentTenant.id),
          key: String(currentTenant.key || ""),
          name: String(currentTenant.name || ""),
          domains: Array.isArray(currentTenant.domains) ? currentTenant.domains : [],
        },
      ];
    }

    if (!rows.length && viewer?.id) {
      const tenantMemberships = await db
        .select({
          id: tenants.id,
          key: tenants.key,
          name: tenants.name,
          domains: tenants.domains,
        })
        .from(userTenantRoles)
        .innerJoin(tenants, eq(tenants.id, userTenantRoles.tenantId))
        .where(eq(userTenantRoles.userId, Number(viewer.id)))
        .orderBy(asc(tenants.name), asc(tenants.id));

      rows = tenantMemberships.map((entry) => ({
        id: Number(entry.id),
        key: String(entry.key || ""),
        name: String(entry.name || ""),
        domains: Array.isArray(entry.domains) ? entry.domains : [],
      }));
    }

    const fallbackTenantId = Number(currentTenant?.id || rows[0]?.id || 0) || null;
    const requestedActiveTenantId = isChairman ? getSessionActiveTenantId(token) : null;
    const activeTenantId =
      requestedActiveTenantId && rows.some((entry) => Number(entry.id) === Number(requestedActiveTenantId))
        ? Number(requestedActiveTenantId)
        : fallbackTenantId;

    const activeTenant = rows.find((entry) => Number(entry.id) === Number(activeTenantId)) || null;

    return res.json({
      ok: true,
      canSwitch: Boolean(isChairman),
      currentTenantId: fallbackTenantId,
      activeTenantId,
      activeTenant,
      tenants: rows,
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Unable to load tenants" });
  }
});

router.post("/context/switch", async (req: any, res) => {
  try {
    const viewer = req.adminUser;
    const isChairman = isChairmanAssistantUser(viewer);
    if (!isChairman) {
      return res.status(403).json({ ok: false, message: "Only chairman can switch tenant context" });
    }

    const token = readBearerToken(req);
    if (!token) {
      return res.status(401).json({ ok: false, message: "Session token required" });
    }

    const tenantId = Number(req.body?.tenantId || 0);
    if (!Number.isFinite(tenantId) || tenantId <= 0) {
      return res.status(400).json({ ok: false, message: "tenantId is required" });
    }

    const targetTenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { id: true, key: true, name: true, domains: true },
    });
    if (!targetTenant) {
      return res.status(404).json({ ok: false, message: "Tenant not found" });
    }

    setSessionActiveTenant(token, tenantId);

    return res.json({
      ok: true,
      activeTenantId: tenantId,
      activeTenant: {
        id: Number(targetTenant.id),
        key: String(targetTenant.key || ""),
        name: String(targetTenant.name || ""),
        domains: Array.isArray(targetTenant.domains) ? targetTenant.domains : [],
      },
      session: {
        activeTenantId: tenantId,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Unable to switch tenant context" });
  }
});

export default router;

