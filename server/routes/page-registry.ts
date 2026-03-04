import { Router } from "express";

import {
  MASTER_MENU_ORDER,
  getBrowseAllPages,
  getMasterMenus,
  getMenuItems,
  getNavPayload,
  upsertPage,
  type MasterMenuKey,
} from "../lib/platform/pageRegistry";
import { ensureTenantAdmin, ensureTenantStaff } from "./utils/auth";

const router = Router();

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function asInt(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function normalizeMaster(input: unknown): MasterMenuKey | null {
  const raw = asString(input);
  const found = MASTER_MENU_ORDER.find((item) => item.toLowerCase() === raw.toLowerCase());
  return found || null;
}

function resolveTenantId(req: any) {
  const tenantId = Number(req?.tenant?.id || 0);
  if (!Number.isFinite(tenantId) || tenantId <= 0) return null;
  return tenantId;
}

router.get("/nav", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ ok: false, message: "Tenant not resolved" });

    const limit = asInt(req.query?.limit, 5);
    const payload = await getNavPayload(tenantId, req.staffUser, limit);
    return res.json({ ok: true, ...payload });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Failed to load page registry nav" });
  }
});

router.get("/masters", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ ok: false, message: "Tenant not resolved" });
    const masters = await getMasterMenus(tenantId, req.staffUser);
    return res.json({ ok: true, masters });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Failed to load master menus" });
  }
});

router.get("/menu/:master", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ ok: false, message: "Tenant not resolved" });

    const master = normalizeMaster(req.params.master);
    if (!master) return res.status(400).json({ ok: false, message: "Invalid master menu" });

    const limit = asInt(req.query?.limit, 5);
    const menu = await getMenuItems(master, tenantId, req.staffUser, limit);
    return res.json({
      ok: true,
      master,
      centerPath: `/${master.toLowerCase()}/center`,
      browsePath: menu.browsePath,
      totalPages: menu.totalPages,
      hasMore: menu.hasMore,
      items: menu.items,
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Failed to load menu items" });
  }
});

router.get("/all/:master", ensureTenantStaff, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ ok: false, message: "Tenant not resolved" });

    const master = normalizeMaster(req.params.master);
    if (!master) return res.status(400).json({ ok: false, message: "Invalid master menu" });

    const pages = await getBrowseAllPages(master, tenantId, req.staffUser);
    return res.json({
      ok: true,
      master,
      pages,
      total: pages.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: error?.message || "Failed to load pages" });
  }
});

router.post("/upsert", ensureTenantAdmin, async (req: any, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(500).json({ ok: false, message: "Tenant not resolved" });

    const master = normalizeMaster(req.body?.masterMenu || req.body?.master_menu);
    if (!master) return res.status(400).json({ ok: false, message: "Invalid master menu" });

    const item = await upsertPage({
      key: req.body?.key,
      title: req.body?.title,
      path: req.body?.path,
      masterMenu: master,
      sortOrder: req.body?.sortOrder ?? req.body?.sort_order,
      isEnabled: req.body?.isEnabled ?? req.body?.is_enabled,
      minRole: req.body?.minRole ?? req.body?.min_role,
      tenantId: req.body?.tenantId ?? req.body?.tenant_id ?? tenantId,
      featureFlag: req.body?.featureFlag ?? req.body?.feature_flag,
    });

    return res.status(201).json({ ok: true, item });
  } catch (error: any) {
    return res.status(400).json({ ok: false, message: error?.message || "Failed to upsert page" });
  }
});

export default router;
